---
name: exercise-clip-extractor
description: >-
  Extract labeled exercise clips from long workout/coaching videos. Given a
  source video (e.g. a 7-minute Frame.io chunk) and a list of exercises, locate
  where each exercise is performed, then cut, name, and organize the segments
  into per-exercise folders with a review manifest. Use when the user wants to
  "find the exercise parts", "cut up a training video", "split a workout video
  by exercise", or similar.
---

# Exercise Clip Extractor

Turn long coaching footage into tidy, labeled per-exercise clips.

## The honest reality (read this first)

The pipeline has two halves. Keep them separate — it's why the result is
trustworthy:

1. **Detection (the smart half)** — decide WHERE each exercise happens. This is
   probabilistic. Target ~80–95% correct with cut points within a couple
   seconds, NOT frame-perfect, zero-touch. Always produce a manifest for a quick
   human review pass.
2. **Cutting (the deterministic half)** — given segments, trim/name/organize.
   This is 100% reliable (`scripts/cut_clips.py`). It never guesses timing.

Set expectations with the user accordingly. Do not promise perfect autonomous
recognition.

## The key insight: lean on the audio

In coaching videos the trainer narrates ("next we're doing Bulgarian split
squats"). The transcript is usually the strongest and most precise segmentation
signal — often better than vision alone. Combine three signals:

- **Transcript** (Whisper) — verbal cues + exact timing of introductions.
- **Vision** (a video-capable model on sampled frames) — confirm the movement
  matches the named exercise; catch silent transitions.
- **Scene/motion detection** (PySceneDetect / ffmpeg) — clean cut boundaries.

## Pipeline

1. **Acquire** the source video. From Frame.io: a download/share link or an API
   token. (Frame.io is Adobe; assets are downloadable with access.)
2. **Research the exercises** the user listed (web) so the names/movements are
   understood before matching.
3. **Transcribe**: extract audio with ffmpeg, run Whisper with word timestamps.
4. **Detect segments**: align transcript cues + sampled frames (vision model) +
   scene cuts into a list of `(exercise, start, end)`. Write a manifest
   (`segments.csv`). Include a confidence/notes column.
5. **Review**: surface the manifest to the user (or self-check) before cutting.
6. **Cut & organize**: `python3 scripts/cut_clips.py SOURCE segments.csv --out clips/`
7. **Deliver**: per-exercise folders + `clips/manifest.csv`. Commit/push or hand
   back however the user wants the files.

## Cutting tool

`scripts/cut_clips.py` — manifest-driven, frame-accurate by default.

```
python3 scripts/cut_clips.py SOURCE.mp4 segments.csv --out clips/
python3 scripts/cut_clips.py SOURCE.mp4 segments.json --out clips/ --copy
```

Manifest columns (CSV or JSON): `exercise`, `start`, `end`, optional `take`,
optional `notes`. Timestamps accept `HH:MM:SS(.ms)`, `MM:SS`, or raw seconds.
Repeated exercises auto-group into one folder with incrementing take numbers.
`--copy` is fast but snaps cuts to keyframes (less precise); default re-encodes
for accurate boundaries.

## Environment notes

- **ffmpeg**: this environment's `apt` is partially blocked by a network policy.
  Install a static binary via pip instead: `pip install imageio-ffmpeg`
  (the script auto-discovers it; falls back to system `ffmpeg`).
- **Network**: pypi and GitHub reachable; Frame.io returned an ambiguous 403
  unauthenticated — confirm real download access with an actual link/token
  before promising an end-to-end run here.
- Containers are ephemeral; commit/push outputs or deliver them out-of-band.

## Tools to reach for

- Whisper (`openai-whisper` / `faster-whisper`) — transcription.
- A video-capable model for frame/exercise recognition (e.g. Gemini native
  video, or Claude vision on sampled frames, or Twelve Labs semantic search).
- PySceneDetect — shot boundaries. MediaPipe — pose, to refine rep boundaries.
