#!/usr/bin/env python3
"""Sample frames + detect motion/scene boundaries from a silent workout video.

Front half of vision-only exercise extraction: turn a long clip into (a) a grid
of timestamped frames a vision model can actually read, and (b) candidate
boundary timestamps where the action changes. A human/model then studies the
frames, labels exercises, and writes a segments manifest for cut_clips.py.

Outputs into --out:
    frames/frame_<seconds>.jpg   one sampled frame per --fps step, named by time
    frames.csv                   index: frame file <-> timestamp (seconds)
    scenes.csv                   detected boundary timestamps + scene score

Usage:
    python3 sample_frames.py SOURCE.mp4 --out scan/ --fps 1
    python3 sample_frames.py SOURCE.mp4 --out scan/ --fps 2 --scene 0.3
"""
import argparse, csv, re, subprocess, sys
from pathlib import Path

try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG = "ffmpeg"


def duration(src):
    r = subprocess.run([FFMPEG, "-i", str(src)], capture_output=True, text=True)
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", r.stderr)
    if not m:
        return None
    h, mn, s = m.groups()
    return int(h) * 3600 + int(mn) * 60 + float(s)


def sample(src, out, fps):
    fdir = out / "frames"
    fdir.mkdir(parents=True, exist_ok=True)
    # Extract at a fixed rate; index i corresponds to time i/fps seconds.
    r = subprocess.run([FFMPEG, "-y", "-i", str(src), "-vf", f"fps={fps}",
                        str(fdir / "f_%06d.jpg")], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"frame sampling failed:\n{r.stderr[-400:]}")
    frames = sorted(fdir.glob("f_*.jpg"))
    rows = []
    for i, f in enumerate(frames):
        t = round(i / fps, 3)
        newname = fdir / f"frame_{t:09.3f}.jpg"
        f.rename(newname)
        rows.append({"frame": newname.name, "time_s": t})
    with (out / "frames.csv").open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["frame", "time_s"])
        w.writeheader(); w.writerows(rows)
    return len(rows)


def detect_scenes(src, out, thresh):
    # ffmpeg scene score: frames where visual content jumps past `thresh`.
    r = subprocess.run(
        [FFMPEG, "-i", str(src), "-filter:v",
         f"select='gt(scene,{thresh})',showinfo", "-f", "null", "-"],
        capture_output=True, text=True)
    cuts = []
    for line in r.stderr.splitlines():
        m = re.search(r"pts_time:(\d+\.?\d*)", line)
        if m and "showinfo" in line:
            cuts.append(round(float(m.group(1)), 3))
    with (out / "scenes.csv").open("w", newline="") as fh:
        w = csv.writer(fh); w.writerow(["boundary_time_s"])
        for t in cuts:
            w.writerow([t])
    return cuts


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source")
    ap.add_argument("--out", default="scan")
    ap.add_argument("--fps", type=float, default=1.0,
                    help="frames sampled per second (default 1)")
    ap.add_argument("--scene", type=float, default=0.3,
                    help="scene-change sensitivity 0-1 (lower = more cuts)")
    a = ap.parse_args()
    if not Path(a.source).exists():
        sys.exit(f"source not found: {a.source}")
    out = Path(a.out)
    dur = duration(a.source)
    print(f"source: {a.source}  duration: {dur}s" if dur else f"source: {a.source}")
    n = sample(a.source, out, a.fps)
    cuts = detect_scenes(a.source, out, a.scene)
    print(f"sampled {n} frame(s) at {a.fps} fps -> {out}/frames/")
    print(f"detected {len(cuts)} boundary candidate(s) -> {out}/scenes.csv")
    if cuts:
        print("  boundaries (s):", ", ".join(f"{c:g}" for c in cuts[:20])
              + (" ..." if len(cuts) > 20 else ""))


if __name__ == "__main__":
    main()
