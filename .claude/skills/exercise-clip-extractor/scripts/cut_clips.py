#!/usr/bin/env python3
"""Cut a source video into labeled exercise clips from a segment manifest.

This is the deterministic "back half" of the pipeline: given a list of
(exercise, start, end) segments, it produces cleanly trimmed, named clips
organized into per-exercise folders, plus a manifest copy for review.

The "front half" (deciding WHERE each exercise is) writes the manifest;
this script does not guess timing. Keeping them separate means the cutting
is 100% reliable and reviewable regardless of how good the detection was.

Manifest format (CSV or JSON list), one row/object per segment:
    exercise   : str   exercise name (becomes folder + filename)
    start      : str|num  "HH:MM:SS(.ms)" or seconds
    end        : str|num  "HH:MM:SS(.ms)" or seconds
    take       : int   (optional) nth time this exercise appears; auto if omitted
    notes      : str   (optional) free text, passed through to output manifest

Usage:
    python3 cut_clips.py SOURCE.mp4 segments.csv  --out clips/
    python3 cut_clips.py SOURCE.mp4 segments.json --out clips/ --copy
"""
import argparse, csv, json, re, subprocess, sys
from pathlib import Path

try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG = "ffmpeg"  # fall back to a system ffmpeg if present


def to_seconds(v):
    """Accept seconds (number/str) or HH:MM:SS(.ms) / MM:SS and return float seconds."""
    if isinstance(v, (int, float)):
        return float(v)
    v = str(v).strip()
    if re.fullmatch(r"\d+(\.\d+)?", v):
        return float(v)
    parts = v.split(":")
    if not all(re.fullmatch(r"\d+(\.\d+)?", p) for p in parts):
        raise ValueError(f"Unparseable timestamp: {v!r}")
    parts = [float(p) for p in parts]
    while len(parts) < 3:
        parts.insert(0, 0.0)
    h, m, s = parts[-3], parts[-2], parts[-1]
    return h * 3600 + m * 60 + s


def slug(name):
    s = re.sub(r"[^a-z0-9]+", "-", str(name).lower()).strip("-")
    return s or "exercise"


def load_segments(path):
    p = Path(path)
    raw = p.read_text()
    if p.suffix.lower() == ".json":
        rows = json.loads(raw)
    else:
        rows = list(csv.DictReader(raw.splitlines()))
    segs = []
    for i, r in enumerate(rows):
        r = {k.strip().lower(): v for k, v in r.items()}
        if not r.get("exercise"):
            raise ValueError(f"Row {i}: missing 'exercise'")
        start, end = to_seconds(r["start"]), to_seconds(r["end"])
        if end <= start:
            raise ValueError(f"Row {i} ({r['exercise']}): end <= start")
        segs.append({
            "exercise": str(r["exercise"]).strip(),
            "start": start, "end": end,
            "take": int(r["take"]) if r.get("take") else None,
            "notes": r.get("notes", ""),
        })
    return segs


def cut(src, segs, out_dir, copy=False):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    seen = {}
    manifest = []
    for idx, s in enumerate(segs, 1):
        ex = s["exercise"]
        take = s["take"] or (seen.get(ex, 0) + 1)
        seen[ex] = max(seen.get(ex, 0), take)
        folder = out_dir / slug(ex)
        folder.mkdir(exist_ok=True)
        dur = s["end"] - s["start"]
        fname = f"{idx:02d}_{slug(ex)}_take{take}.mp4"
        dest = folder / fname
        # -ss before -i = fast seek; re-encode by default for frame-accurate cuts.
        cmd = [FFMPEG, "-y", "-ss", f"{s['start']:.3f}", "-i", str(src),
               "-t", f"{dur:.3f}"]
        cmd += (["-c", "copy"] if copy
                else ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                      "-c:a", "aac", "-movflags", "+faststart"])
        cmd.append(str(dest))
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            print(f"  ! ffmpeg failed on {ex}:\n{r.stderr[-400:]}", file=sys.stderr)
            continue
        manifest.append({"clip": str(dest.relative_to(out_dir)), "exercise": ex,
                         "take": take, "start_s": round(s["start"], 3),
                         "end_s": round(s["end"], 3), "duration_s": round(dur, 3),
                         "notes": s["notes"]})
        print(f"  [{idx:02d}] {ex} take{take}  {dur:5.1f}s -> {dest.relative_to(out_dir)}")
    mpath = out_dir / "manifest.csv"
    with mpath.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["clip", "exercise", "take", "start_s",
                                          "end_s", "duration_s", "notes"])
        w.writeheader()
        w.writerows(manifest)
    print(f"\n{len(manifest)} clip(s) written. Review: {mpath}")
    return manifest


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", help="source video file")
    ap.add_argument("segments", help="segment manifest (.csv or .json)")
    ap.add_argument("--out", default="clips", help="output directory (default: clips/)")
    ap.add_argument("--copy", action="store_true",
                    help="stream-copy (fast, but cuts snap to keyframes — less precise)")
    a = ap.parse_args()
    if not Path(a.source).exists():
        sys.exit(f"source not found: {a.source}")
    segs = load_segments(a.segments)
    print(f"Cutting {len(segs)} segment(s) from {a.source} -> {a.out}/\n")
    cut(a.source, segs, a.out, copy=a.copy)


if __name__ == "__main__":
    main()
