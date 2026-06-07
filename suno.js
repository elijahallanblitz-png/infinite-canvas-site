/* ============================================================
   Suno Prompt Studio
   Decodes an audio file in the browser and derives a musical
   description (tempo, key, loudness, dynamics, brightness),
   then assembles a Suno-ready prompt. 100% client-side — the
   audio never leaves the browser.
   ============================================================ */

(function () {
  'use strict';

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const dropzone   = $('dropzone');
  const fileInput  = $('fileInput');
  const urlInput   = $('urlInput');
  const urlBtn     = $('urlBtn');
  const statusEl   = $('status');
  const statusText = $('statusText');
  const results    = $('results');
  const factsEl    = $('facts');
  const trackName  = $('trackName');
  const player     = $('player');
  const styleOut   = $('styleOut');
  const descOut    = $('descOut');
  const instrumental = $('instrumental');
  const extra      = $('extra');
  const openSuno   = $('openSuno');
  const resetBtn   = $('resetBtn');

  let lastAnalysis = null;   // cache so controls can re-render the prompt

  /* ========================================================
     FFT — iterative radix-2 Cooley-Tukey, in place.
     re/im are Float32Array of length n (power of two).
     ======================================================== */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      const half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = i + k + half;
          const vr = re[b] * cr - im[b] * ci;
          const vi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - vr; im[b] = im[a] - vi;
          re[a] += vr;        im[a] += vi;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = ncr;
        }
      }
    }
  }

  // Hann window cache
  const hannCache = {};
  function hann(n) {
    if (hannCache[n]) return hannCache[n];
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
    hannCache[n] = w;
    return w;
  }

  /* ========================================================
     Mono mix + linear-interpolation resample
     ======================================================== */
  function toMono(buffer) {
    const ch = buffer.numberOfChannels;
    const len = buffer.length;
    const out = new Float32Array(len);
    for (let c = 0; c < ch; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < len; i++) out[i] += data[i];
    }
    if (ch > 1) for (let i = 0; i < len; i++) out[i] /= ch;
    return out;
  }

  function resample(data, srIn, srOut) {
    if (srIn === srOut) return data;
    const ratio = srIn / srOut;
    const newLen = Math.floor(data.length / ratio);
    const out = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      const a = data[i0] || 0;
      const b = data[i0 + 1] || a;
      out[i] = a + (b - a) * frac;
    }
    return out;
  }

  /* ========================================================
     Loudness & dynamics  (frame RMS over original signal)
     ======================================================== */
  function loudness(mono, sr) {
    const win = 2048, hop = 1024;
    const frames = [];
    let sumSq = 0;
    for (let i = 0; i + win <= mono.length; i += hop) {
      let s = 0;
      for (let j = 0; j < win; j++) { const v = mono[i + j]; s += v * v; }
      const rms = Math.sqrt(s / win);
      frames.push(rms);
      sumSq += s;
    }
    const overall = Math.sqrt(sumSq / (frames.length * win || 1));
    frames.sort((a, b) => a - b);
    const pct = (p) => frames[Math.min(frames.length - 1, Math.max(0, Math.floor(p * frames.length)))] || 1e-6;
    const loud = pct(0.95), quiet = pct(0.10);
    const toDb = (x) => 20 * Math.log10(Math.max(x, 1e-6));
    const dynRange = toDb(loud) - toDb(quiet);    // dB
    return { overallDb: toDb(overall), dynRange };
  }

  /* ========================================================
     Spectral centroid (brightness) — averaged, energy-weighted
     ======================================================== */
  function brightness(mono, sr) {
    const N = 2048, hop = 2048;
    const w = hann(N);
    const re = new Float32Array(N), im = new Float32Array(N);
    let num = 0, den = 0;
    for (let i = 0; i + N <= mono.length; i += hop) {
      for (let j = 0; j < N; j++) { re[j] = mono[i + j] * w[j]; im[j] = 0; }
      fft(re, im);
      let fNum = 0, fDen = 0;
      for (let k = 1; k < N / 2; k++) {
        const mag = Math.hypot(re[k], im[k]);
        const freq = k * sr / N;
        fNum += freq * mag;
        fDen += mag;
      }
      if (fDen > 0) { num += fNum; den += fDen; }
    }
    return den > 0 ? num / den : 0;   // Hz
  }

  /* ========================================================
     Chroma + key (Krumhansl-Schmuckler)
     ======================================================== */
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  function chroma(mono, sr) {
    const N = 4096, hop = 2048;
    const w = hann(N);
    const re = new Float32Array(N), im = new Float32Array(N);
    const acc = new Float64Array(12);
    const fMin = 65, fMax = 2000;   // C2 .. ~B6
    for (let i = 0; i + N <= mono.length; i += hop) {
      for (let j = 0; j < N; j++) { re[j] = mono[i + j] * w[j]; im[j] = 0; }
      fft(re, im);
      for (let k = 1; k < N / 2; k++) {
        const freq = k * sr / N;
        if (freq < fMin || freq > fMax) continue;
        const mag = Math.hypot(re[k], im[k]);
        const midi = 69 + 12 * Math.log2(freq / 440);
        const pc = ((Math.round(midi) % 12) + 12) % 12;
        acc[pc] += mag;
      }
    }
    return acc;
  }

  function pearson(a, b) {
    const n = a.length;
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
      const x = a[i] - ma, y = b[i] - mb;
      num += x * y; da += x * x; db += y * y;
    }
    const den = Math.sqrt(da * db);
    return den === 0 ? 0 : num / den;
  }

  function detectKey(chromaVec) {
    let best = { score: -2, tonic: 0, mode: 'major' };
    for (let t = 0; t < 12; t++) {
      const majRot = new Array(12), minRot = new Array(12);
      for (let i = 0; i < 12; i++) {
        majRot[i] = KS_MAJOR[(i - t + 12) % 12];
        minRot[i] = KS_MINOR[(i - t + 12) % 12];
      }
      const sMaj = pearson(chromaVec, majRot);
      const sMin = pearson(chromaVec, minRot);
      if (sMaj > best.score) best = { score: sMaj, tonic: t, mode: 'major' };
      if (sMin > best.score) best = { score: sMin, tonic: t, mode: 'minor' };
    }
    return { name: NOTE_NAMES[best.tonic] + ' ' + best.mode, mode: best.mode, confidence: best.score };
  }

  /* ========================================================
     Tempo (BPM) via spectral-flux onset envelope + autocorr
     ======================================================== */
  function detectTempo(mono, sr) {
    const N = 1024, hop = 512;
    const w = hann(N);
    const re = new Float32Array(N), im = new Float32Array(N);
    let prevMag = new Float32Array(N / 2);
    const flux = [];
    for (let i = 0; i + N <= mono.length; i += hop) {
      for (let j = 0; j < N; j++) { re[j] = mono[i + j] * w[j]; im[j] = 0; }
      fft(re, im);
      let f = 0;
      const curMag = new Float32Array(N / 2);
      for (let k = 0; k < N / 2; k++) {
        const mag = Math.hypot(re[k], im[k]);
        curMag[k] = mag;
        const d = mag - prevMag[k];
        if (d > 0) f += d;          // half-wave rectified
      }
      flux.push(f);
      prevMag = curMag;
    }
    if (flux.length < 8) return { bpm: 0, confidence: 0 };

    // normalize (remove mean)
    let mean = 0;
    for (const v of flux) mean += v;
    mean /= flux.length;
    const env = flux.map((v) => v - mean);

    const fps = sr / hop;                 // envelope sample rate
    const minBpm = 60, maxBpm = 180;
    const minLag = Math.floor(fps * 60 / maxBpm);
    const maxLag = Math.ceil(fps * 60 / minBpm);

    let bestLag = minLag, bestVal = -Infinity, energy = 0;
    for (let i = 0; i < env.length; i++) energy += env[i] * env[i];
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0;
      for (let i = 0; i + lag < env.length; i++) s += env[i] * env[i + lag];
      if (s > bestVal) { bestVal = s; bestLag = lag; }
    }
    // parabolic interpolation around the peak for sub-bin accuracy
    const ac = (lag) => {
      let s = 0;
      for (let i = 0; i + lag < env.length; i++) s += env[i] * env[i + lag];
      return s;
    };
    let refined = bestLag;
    if (bestLag > minLag && bestLag < maxLag) {
      const y0 = ac(bestLag - 1), y1 = bestVal, y2 = ac(bestLag + 1);
      const denom = (y0 - 2 * y1 + y2);
      if (denom !== 0) refined = bestLag + 0.5 * (y0 - y2) / denom;
    }
    let bpm = 60 * fps / refined;
    // fold into a musical range
    while (bpm < 70) bpm *= 2;
    while (bpm > 180) bpm /= 2;
    const confidence = energy > 0 ? bestVal / energy : 0;
    return { bpm: Math.round(bpm), confidence };
  }

  /* ========================================================
     Descriptor mapping  (measurements -> words)
     ======================================================== */
  function tempoWord(bpm) {
    if (bpm < 70) return 'slow, ballad tempo';
    if (bpm < 90) return 'downtempo, relaxed groove';
    if (bpm < 108) return 'mid-tempo, steady groove';
    if (bpm < 124) return 'upbeat';
    if (bpm < 140) return 'energetic, driving';
    return 'fast, high-energy';
  }
  function brightWord(hz) {
    if (hz < 1400) return 'warm, dark-toned';
    if (hz < 2600) return 'balanced';
    if (hz < 4000) return 'bright';
    return 'crisp, airy, treble-forward';
  }
  function dynWord(db) {
    if (db < 6) return 'heavily compressed, loud and consistent';
    if (db < 12) return 'punchy with moderate dynamics';
    return 'wide, expressive dynamics';
  }
  function energyLevel(db, bpm, flux) {
    // rough 0..1 energy from loudness + tempo
    const l = Math.min(1, Math.max(0, (db + 30) / 24));
    const t = Math.min(1, Math.max(0, (bpm - 60) / 100));
    return 0.6 * l + 0.4 * t;
  }
  function moodWords(mode, energy, bright) {
    const out = [];
    if (mode === 'minor') out.push(energy > 0.55 ? 'dark, intense' : 'melancholic, introspective');
    else out.push(energy > 0.55 ? 'uplifting, triumphant' : 'warm, gentle, hopeful');
    if (bright > 3500 && energy > 0.5) out.push('shimmering');
    if (energy < 0.35) out.push('atmospheric, spacious');
    return out;
  }
  // Very rough genre lean — clearly a guess, user can override.
  function genreGuess(bpm, bright, energy, dynRange) {
    if (energy < 0.32 && bpm < 100) return 'ambient / cinematic';
    if (bpm < 95 && bright < 2200 && energy < 0.55) return 'lo-fi / chillhop';
    if (bpm >= 118 && bright > 2400 && energy > 0.55) return 'electronic / dance';
    if (bpm >= 95 && bpm <= 135 && energy >= 0.45 && energy <= 0.7) return 'pop';
    if (bpm >= 100 && bright > 2600 && energy > 0.6 && dynRange > 8) return 'rock';
    if (bright < 2000 && dynRange > 10 && energy < 0.6) return 'acoustic / singer-songwriter';
    return 'contemporary';
  }

  /* ========================================================
     Build the prompt text from the analysis + user controls
     ======================================================== */
  function buildPrompt(a) {
    const inst = instrumental.checked;
    const notes = (extra.value || '').trim();

    const tempo = tempoWord(a.bpm);
    const bright = brightWord(a.centroid);
    const dyn = dynWord(a.dynRange);
    const energy = a.energy;
    const moods = moodWords(a.mode, energy, a.centroid);
    const genre = a.genre;

    const vocalPhrase = inst ? 'instrumental, no vocals' : 'expressive lead vocals';

    // --- Style line (compact, for Suno's Style box) ---
    const styleParts = [];
    if (notes) styleParts.push(notes);
    styleParts.push(genre);
    styleParts.push(...moods);
    styleParts.push(tempo + ` (~${a.bpm} BPM)`);
    styleParts.push('key of ' + a.key);
    styleParts.push(bright + ' production');
    styleParts.push(vocalPhrase);
    const style = dedupe(styleParts).join(', ');

    // --- Full description (prose) ---
    const desc =
`A ${genre} track in ${a.key}, around ${a.bpm} BPM — ${tempo}. ` +
`The mood is ${moods.join(' and ')}. ` +
`Production is ${bright} with ${dyn}. ` +
`${inst ? 'Fully instrumental.' : 'Features expressive lead vocals carrying the melody.'}` +
(notes ? ` Additional direction: ${notes}.` : '') +
`\n\nSuggested structure:\n[Intro] — establish the ${a.mode === 'minor' ? 'moody' : 'warm'} tone\n[Verse] — ${inst ? 'main theme' : 'lead vocal, restrained backing'}\n[Chorus] — fuller arrangement, lift in energy\n[Bridge] — contrast / breakdown\n[Outro] — resolve and fade`;

    return { style, desc };
  }

  function dedupe(arr) {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const k = x.toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(x); }
    }
    return out;
  }

  /* ========================================================
     Orchestration
     ======================================================== */
  async function analyze(arrayBuffer, name) {
    showStatus('Decoding audio…');
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    let buffer;
    try {
      buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    } catch (e) {
      ctx.close();
      throw new Error('Could not decode this file. Try a standard mp3, wav, m4a, ogg or flac.');
    }

    const duration = buffer.duration;
    const srOrig = buffer.sampleRate;
    const monoFull = toMono(buffer);

    // Analyze up to first 4 minutes for speed; representative for tempo/key.
    const limitSec = Math.min(duration, 240);
    const monoSlice = monoFull.subarray(0, Math.floor(limitSec * srOrig));

    // Downsample to 22.05k for tempo/chroma/centroid (faster, plenty for analysis)
    const srA = 22050;
    await yieldUI();
    showStatus('Measuring loudness & dynamics…');
    const loud = loudness(monoSlice, srOrig);

    await yieldUI();
    const monoLo = resample(monoSlice, srOrig, srA);

    showStatus('Detecting key…');
    await yieldUI();
    const chr = chroma(monoLo, srA);
    const key = detectKey(chr);

    showStatus('Detecting tempo…');
    await yieldUI();
    const tempo = detectTempo(monoLo, srA);

    showStatus('Analyzing tone…');
    await yieldUI();
    const centroid = brightness(monoLo, srA);

    ctx.close();

    const energy = energyLevel(loud.overallDb, tempo.bpm, 0);
    const genre = genreGuess(tempo.bpm, centroid, energy, loud.dynRange);

    const analysis = {
      name,
      duration,
      bpm: tempo.bpm,
      bpmConf: tempo.confidence,
      key: key.name,
      mode: key.mode,
      keyConf: key.confidence,
      centroid,
      dynRange: loud.dynRange,
      overallDb: loud.overallDb,
      energy,
      genre
    };
    return analysis;
  }

  function yieldUI() { return new Promise((r) => setTimeout(r, 0)); }

  /* ========================================================
     Rendering
     ======================================================== */
  function render(a) {
    lastAnalysis = a;
    trackName.textContent = a.name;

    const mmss = (s) => {
      const m = Math.floor(s / 60), sec = Math.round(s % 60);
      return m + ':' + String(sec).padStart(2, '0');
    };
    const conf = (c) => c > 0.6 ? 'high' : c > 0.35 ? 'medium' : 'low';

    factsEl.innerHTML = [
      fact('Length', mmss(a.duration)),
      fact('Tempo', a.bpm + ' <small>BPM</small>'),
      fact('Key', a.key),
      fact('Brightness', Math.round(a.centroid) + ' <small>Hz</small>'),
      fact('Dynamics', a.dynRange.toFixed(1) + ' <small>dB range</small>'),
      fact('Energy', Math.round(a.energy * 100) + '<small>%</small>')
    ].join('');

    renderPrompt();
    statusEl.hidden = true;
    results.hidden = false;
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function fact(label, value) {
    return `<div class="fact"><span class="fact-label">${label}</span><span class="fact-value">${value}</span></div>`;
  }

  function renderPrompt() {
    if (!lastAnalysis) return;
    const { style, desc } = buildPrompt(lastAnalysis);
    styleOut.value = style;
    descOut.value = desc;
  }

  /* ========================================================
     Status / errors
     ======================================================== */
  function showStatus(text, isError) {
    statusText.textContent = text;
    statusEl.hidden = false;
    statusEl.classList.toggle('error', !!isError);
    statusEl.querySelector('.spinner').style.display = isError ? 'none' : '';
  }

  async function handleArrayBuffer(buf, name) {
    results.hidden = true;
    try {
      const a = await analyze(buf, name);
      render(a);
    } catch (e) {
      showStatus(e.message || 'Something went wrong analyzing that file.', true);
    }
  }

  function handleFile(file) {
    if (!file) return;
    trackName.textContent = file.name;
    player.src = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = () => handleArrayBuffer(reader.result, file.name);
    reader.onerror = () => showStatus('Could not read that file.', true);
    reader.readAsArrayBuffer(file);
  }

  async function handleUrl(url) {
    if (!url) return;
    showStatus('Fetching audio…');
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Fetch failed (' + resp.status + ').');
      const buf = await resp.arrayBuffer();
      const name = url.split('/').pop().split('?')[0] || 'audio from link';
      player.src = url;
      await handleArrayBuffer(buf, name);
    } catch (e) {
      showStatus('Could not fetch that link (likely blocked by CORS, or not a direct audio file).', true);
    }
  }

  /* ========================================================
     Wiring
     ======================================================== */
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

  ['dragenter', 'dragover'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); }));
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  urlBtn.addEventListener('click', () => handleUrl(urlInput.value.trim()));
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleUrl(urlInput.value.trim()); });

  instrumental.addEventListener('change', renderPrompt);
  let extraTimer;
  extra.addEventListener('input', () => { clearTimeout(extraTimer); extraTimer = setTimeout(renderPrompt, 250); });

  resetBtn.addEventListener('click', () => {
    results.hidden = true;
    fileInput.value = '';
    lastAnalysis = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Copy buttons
  document.querySelectorAll('.btn-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = $(btn.dataset.target);
      try {
        await navigator.clipboard.writeText(target.value);
      } catch (e) {
        target.select();
        document.execCommand('copy');
      }
      const orig = btn.textContent;
      btn.textContent = 'Copied ✓';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1400);
    });
  });

  // Open Suno: copy the style first so it's ready to paste.
  openSuno.addEventListener('click', () => {
    if (styleOut.value) navigator.clipboard && navigator.clipboard.writeText(styleOut.value).catch(() => {});
  });
})();
