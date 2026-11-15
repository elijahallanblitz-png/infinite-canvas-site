// Loose name matching for dictated names. "Nevin" means Nevan. "Greg" means Gregory.
// If a name could mean two people, we return the choices and never guess.

export interface Named { id: number; name: string }
export type Match<T> =
  | { kind: 'one'; item: T }
  | { kind: 'many'; choices: T[] }
  | { kind: 'none' };

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

/** A rough "sounds like" key: first letter, then consonants with look-alikes merged, doubles dropped. */
export function soundKey(s: string): string {
  const w = norm(s).replace(/ /g, '');
  if (!w) return '';
  const mapped = w
    .replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/[cq]/g, 'k').replace(/z/g, 's')
    .replace(/[dt]/g, 't').replace(/[bp]/g, 'p').replace(/[vf]/g, 'f').replace(/[mn]/g, 'n').replace(/[jg]/g, 'j');
  const body = mapped.slice(1).replace(/[aeiouyhw]/g, '');
  return (mapped[0] + body).replace(/(.)\1+/g, '$1');
}

export function nameScore(query: string, name: string): number {
  const q = norm(query);
  const n = norm(name);
  if (!q || !n) return 0;
  if (q === n) return 1;
  const first = n.split(' ')[0];
  if (q === first) return 0.97;
  if (q.length >= 2 && (n.startsWith(q) || first.startsWith(q))) return 0.9;
  if (first.length >= 3 && q.startsWith(first)) return 0.85; // "gregory smith" for Gregory
  const target = q.includes(' ') ? n : first;
  const sim = 1 - levenshtein(q, target) / Math.max(q.length, target.length);
  const sounds = soundKey(q) === soundKey(target) ? 0.84 : 0;
  return Math.max(sim, sounds);
}

/** Pick the person a spoken name refers to. */
export function matchName<T extends Named>(query: string, people: T[]): Match<T> {
  const scored = people
    .map((p) => ({ p, s: nameScore(query, p.name) }))
    .filter((x) => x.s >= 0.6)
    .sort((a, b) => b.s - a.s);
  if (scored.length === 0) return { kind: 'none' };
  const best = scored[0].s;
  // A full first name, said exactly, wins outright.
  const exact = scored.filter((x) => x.s >= 0.97);
  if (exact.length === 1) return { kind: 'one', item: exact[0].p };
  // Anything close to the best score is a real contender.
  const close = scored.filter((x) => best - x.s < 0.12);
  if (close.length === 1) return { kind: 'one', item: close[0].p };
  return { kind: 'many', choices: close.map((x) => x.p) };
}

/** Find a task by spoken title. Exact, then "contains all the words", then fuzzy. */
export function matchTitle<T extends { id: number; title: string }>(query: string, tasks: T[]): Match<T> {
  const q = norm(query);
  if (!q) return { kind: 'none' };
  const exact = tasks.filter((t) => norm(t.title) === q);
  if (exact.length === 1) return { kind: 'one', item: exact[0] };
  if (exact.length > 1) return { kind: 'many', choices: exact };
  const words = q.split(' ').filter((w) => w.length > 1 && !['the', 'a', 'an', 'task', 'to', 'for', 'of'].includes(w));
  if (words.length) {
    const contains = tasks.filter((t) => {
      const tw = norm(t.title).split(' ');
      return words.every((w) => tw.some((x) => x === w || (w.length >= 4 && x.startsWith(w)) || (w.length >= 4 && levenshtein(x, w) <= 1)));
    });
    if (contains.length === 1) return { kind: 'one', item: contains[0] };
    if (contains.length > 1) return { kind: 'many', choices: contains.slice(0, 6) };
  }
  const fuzzy = tasks
    .map((t) => ({ t, s: 1 - levenshtein(q, norm(t.title)) / Math.max(q.length, norm(t.title).length) }))
    .filter((x) => x.s >= 0.7)
    .sort((a, b) => b.s - a.s);
  if (fuzzy.length === 0) return { kind: 'none' };
  if (fuzzy.length === 1 || fuzzy[0].s - fuzzy[1].s >= 0.12) return { kind: 'one', item: fuzzy[0].t };
  return { kind: 'many', choices: fuzzy.slice(0, 6).map((x) => x.t) };
}
