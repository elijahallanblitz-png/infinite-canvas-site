---
name: exercise-clip-extractor
description: >-
  Extract labeled exercise clips from long workout/coaching videos. Given a
  source video (e.g. a 7-minute Frame.io chunk) and a list of exercises, locate
  where each exercise is performed BY WATCHING THE FOOTAGE (silent, vision-only),
  then cut, name, and organize the segments into per-exercise folders with a
  review manifest. Use when the user wants to "find the exercise parts", "cut up
  a training video", "split a workout video by exercise", or similar.
---

# Exercise Clip Extractor (vision-only)

Turn long, SILENT coaching footage into tidy, labeled per-exercise clips by
actually watching the movement. Assume no narration and no useful audio cues —
recognition comes entirely from the visuals.

## The honest reality (read this first)

Two halves, kept deliberately separate:

1. **Detection (the smart half)** — decide WHICH exercise is happening and WHERE,
   from frames alone. Probabilistic. Without audio this is harder: cut points
   rest on the motion signal, not on someone announcing the move. Target a strong
   *reviewable first pass*, not flawless autonomy. Always emit a manifest with a
   confidence/notes column for a human check.
2. **Cutting (the deterministic half)** — given segments, trim/name/organize.
   100% reliable (`scripts/cut_clips.py`); never guesses timing.

Set expectations accordingly. Do NOT promise frame-perfect zero-touch results.

## How the watching actually works

"Frame by frame" over a 7-min clip is ~12k+ frames — nobody reads them all. Get
the same result efficiently by combining a cheap whole-timeline motion signal
with targeted visual inspection:

1. **Study the exercise list first.** Pull reference descriptions/images for each
   named exercise (web) so the movements are understood BEFORE matching.
2. **Motion/pose signal across ALL frames (cheap).** Pose estimation (MediaPipe)
   or scene/motion scoring gives a continuous activity track — rest vs work,
   rhythmic reps, transitions. This is what finds the *boundaries* precisely.
3. **Visual ID on sampled frames (targeted).** Read sampled frames (the model has
   vision — `sample_frames.py` lays them out timestamped) within each active
   block to identify *which* exercise it is. Densify sampling near boundaries to
   sharpen cut points.
4. **Write `segments.csv`**: `(exercise, start, end, notes/confidence)`.
5. **Review** the manifest (surface to user / self-check) before cutting.
6. **Cut & organize**: `cut_clips.py SOURCE segments.csv --out clips/`.
7. **Deliver** per-exercise folders + `manifest.csv`.

Pose tracking finds *where*; the model's eyes confirm *what*.

(If a particular video DOES happen to have narration, a Whisper transcript is a
free bonus signal — but do not depend on it; the default is silent footage.)

## Scripts

### `sample_frames.py` — front half, prep the watch
```
python3 scripts/sample_frames.py SOURCE.mp4 --out scan/ --fps 1
python3 scripts/sample_frames.py SOURCE.mp4 --out scan/ --fps 2 --scene 0.3
```
Writes `scan/frames/frame_<seconds>.jpg` (timestamped), `scan/frames.csv`
(frame<->time index), and `scan/scenes.csv` (boundary candidates). Read the
frames to identify exercises; use scenes + pose to place cut points.

### `cut_clips.py` — back half, deterministic cutter
```
python3 scripts/cut_clips.py SOURCE.mp4 segments.csv --out clips/
python3 scripts/cut_clips.py SOURCE.mp4 segments.json --out clips/ --copy
```
Manifest columns (CSV/JSON): `exercise`, `start`, `end`, optional `take`,
optional `notes`. Timestamps accept `HH:MM:SS(.ms)`, `MM:SS`, or seconds.
Repeated exercises auto-group into one folder with incrementing take numbers.
Default re-encodes for frame-accurate boundaries; `--copy` is faster but snaps
to keyframes.

## Environment notes

- **ffmpeg**: `apt` is partially blocked by a network policy here. Use the pip
  static binary: `pip install imageio-ffmpeg` (scripts auto-discover it).
- **Pose**: `pip install mediapipe` for the motion/pose signal (verify it
  installs cleanly in-session before relying on it).
- **Network**: pypi + GitHub reachable; Frame.io returned an ambiguous 403
  unauthenticated — confirm real download access with an actual link/token
  before promising an end-to-end run.
- Containers are ephemeral; commit/push outputs or deliver them out-of-band.

## Proven so far

- `cut_clips.py`: tested end-to-end on a synthetic source — frame-accurate cuts,
  repeated-exercise take grouping, manifest output.
- `sample_frames.py`: tested — timestamped frame extraction + scene scan; sampled
  frames are directly readable as images for visual exercise ID.
