import { describe, expect, it } from 'vitest';
import { matchName, matchTitle } from '../src/names';
import { addDays, endOfWeek, isDigestHour, isQuiet, nextSendTime, pacific, parseDue } from '../src/time';

const team = [{ id: 1, name: 'Elijah' }, { id: 2, name: 'Nevan' }, { id: 3, name: 'Gregory' }];
const one = (q: string, people = team) => { const m = matchName(q, people); return m.kind === 'one' ? m.item.name : m.kind; };

describe('name matching', () => {
  it('finds exact names in any case', () => { expect(one('nevan')).toBe('Nevan'); expect(one('ELIJAH')).toBe('Elijah'); });
  it('hears "Nevin" as Nevan', () => expect(one('Nevin')).toBe('Nevan'));
  it('handles other dictation slips', () => {
    expect(one('Nevan.')).toBe('Nevan'); expect(one('Neven')).toBe('Nevan'); expect(one('Navan')).toBe('Nevan');
    expect(one('Elija')).toBe('Elijah'); expect(one('Alijah')).toBe('Elijah'); expect(one('Gregery')).toBe('Gregory');
  });
  it('accepts short forms', () => { expect(one('Greg')).toBe('Gregory'); expect(one('Eli')).toBe('Elijah'); expect(one('Nev')).toBe('Nevan'); });
  it('does not match strangers', () => { expect(one('Bob')).toBe('none'); expect(one('Samantha')).toBe('none'); expect(one('')).toBe('none'); });
  it('returns the choices when a name could mean two people', () => {
    const m = matchName('Greg', [...team, { id: 4, name: 'Greg' }, { id: 5, name: 'Gregor' }]);
    expect(m.kind).toBe('one'); // an exact name wins
    const two = matchName('Nev', [...team, { id: 4, name: 'Neville' }]);
    expect(two.kind).toBe('many');
    if (two.kind === 'many') expect(two.choices.map((c) => c.name).sort()).toEqual(['Nevan', 'Neville']);
    const sound = matchName('Nevin', [...team, { id: 4, name: 'Nevyn' }]);
    expect(sound.kind).toBe('many');
  });
});

describe('task title matching', () => {
  const tasks = [{ id: 1, title: 'Lock the budget for the pilot' }, { id: 2, title: 'Send the deck to the investors' }, { id: 3, title: 'Send the budget to Gregory' }];
  it('finds a task from a few words', () => {
    const m = matchTitle('the deck', tasks); expect(m.kind === 'one' && m.item.id).toBe(2);
    const k = matchTitle('lock budget', tasks); expect(k.kind === 'one' && k.item.id).toBe(1);
  });
  it('returns choices when words fit two tasks', () => expect(matchTitle('budget', tasks).kind).toBe('many'));
  it('says none when nothing fits', () => expect(matchTitle('walk the dog', tasks).kind).toBe('none'));
});

describe('quiet hours (Pacific)', () => {
  const at = (iso: string) => Date.parse(iso);
  it('is quiet from 9:00 PM to 8:00 AM', () => {
    expect(isQuiet(at('2026-11-11T05:00:00Z'))).toBe(true);   // 9:00 PM PST
    expect(isQuiet(at('2026-11-11T04:59:00Z'))).toBe(false);  // 8:59 PM PST
    expect(isQuiet(at('2026-11-11T15:59:00Z'))).toBe(true);   // 7:59 AM PST
    expect(isQuiet(at('2026-11-11T16:00:00Z'))).toBe(false);  // 8:00 AM PST
    expect(isQuiet(at('2026-11-11T10:00:00Z'))).toBe(true);   // 2:00 AM PST
  });
  it('follows daylight saving time', () => {
    expect(isQuiet(at('2026-07-01T14:59:00Z'))).toBe(true);   // 7:59 AM PDT
    expect(isQuiet(at('2026-07-01T15:00:00Z'))).toBe(false);  // 8:00 AM PDT
    expect(isQuiet(at('2026-07-02T04:00:00Z'))).toBe(true);   // 9:00 PM PDT
  });
  it('holds a late message until 8:00 AM', () => {
    const next = nextSendTime(at('2026-11-11T07:13:00Z')); // 11:13 PM
    expect(pacific(next)).toMatchObject({ hour: 8, minute: 0, date: '2026-11-11' });
    expect(nextSendTime(at('2026-11-11T20:00:00Z'))).toBe(at('2026-11-11T20:00:00Z'));
  });
  it('sends the digest only in the 9 AM hour on weekdays', () => {
    expect(isDigestHour(at('2026-11-10T17:00:00Z'))).toBe(true);   // Tue 9:00 AM PST
    expect(isDigestHour(at('2026-11-10T18:00:00Z'))).toBe(false);  // Tue 10:00 AM
    expect(isDigestHour(at('2026-11-14T17:00:00Z'))).toBe(false);  // Saturday
    expect(isDigestHour(at('2026-11-15T17:00:00Z'))).toBe(false);  // Sunday
    expect(isDigestHour(at('2026-07-01T16:00:00Z'))).toBe(true);   // Wed 9:00 AM PDT
  });
});

describe('due dates', () => {
  const tue = '2026-11-10';
  it('reads spoken dates', () => {
    expect(parseDue('today', tue)).toBe(tue);
    expect(parseDue('Tomorrow', tue)).toBe('2026-11-11');
    expect(parseDue('Wednesday', tue)).toBe('2026-11-11');
    expect(parseDue('due Friday', tue)).toBe('2026-11-13');
    expect(parseDue('tuesday', tue)).toBe('2026-11-17'); // never today
    expect(parseDue('this week', tue)).toBe('2026-11-13');
    expect(parseDue('next week', tue)).toBe('2026-11-16');
    expect(parseDue('Nov 20', tue)).toBe('2026-11-20');
    expect(parseDue('11/20', tue)).toBe('2026-11-20');
    expect(parseDue('Jan 5', tue)).toBe('2027-01-05');
    expect(parseDue('2026-12-01', tue)).toBe('2026-12-01');
  });
  it('clears and rejects', () => {
    expect(parseDue('none', tue)).toBeNull(); expect(parseDue(undefined, tue)).toBeNull();
    expect(parseDue('whenever-ish', tue)).toBeUndefined(); expect(parseDue('2026-02-31', tue)).toBeUndefined();
  });
  it('knows the end of the week', () => { expect(endOfWeek('2026-11-13')).toBe('2026-11-15'); expect(endOfWeek('2026-11-09')).toBe('2026-11-13'); expect(addDays('2026-12-31', 1)).toBe('2027-01-01'); });
});
