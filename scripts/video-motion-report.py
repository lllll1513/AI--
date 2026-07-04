import json
import sys
from pathlib import Path

import cv2


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: video-motion-report.py <video> <output-json>", file=sys.stderr)
        return 2

    video_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = frame_count / fps if fps else 0

    prev = None
    diffs = []
    sampled = []
    idx = 0
    sample_stride = max(int(fps // 2), 1) if fps else 12

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, (160, 90))
        if prev is not None:
            diff = cv2.absdiff(gray, prev).mean()
            diffs.append(float(diff))
            if idx % sample_stride == 0:
                sampled.append({
                    "frame": idx,
                    "time": idx / fps if fps else None,
                    "diff": float(diff),
                })
        prev = gray
        idx += 1

    cap.release()

    if diffs:
        avg = sum(diffs) / len(diffs)
        sorted_diffs = sorted(diffs)
        p10 = sorted_diffs[int(len(sorted_diffs) * 0.10)]
        p50 = sorted_diffs[int(len(sorted_diffs) * 0.50)]
        p90 = sorted_diffs[int(len(sorted_diffs) * 0.90)]
        low_motion_ratio = sum(1 for d in diffs if d < 1.2) / len(diffs)
    else:
        avg = p10 = p50 = p90 = low_motion_ratio = 0

    report = {
        "video": str(video_path),
        "fps": fps,
        "frameCount": frame_count,
        "durationSeconds": duration,
        "motion": {
            "averageFrameDiff": avg,
            "p10": p10,
            "p50": p50,
            "p90": p90,
            "lowMotionRatio": low_motion_ratio,
            "likelyStatic": low_motion_ratio > 0.75 and avg < 2.0,
        },
        "sampledMotion": sampled,
        "notes": [
            "Frame diff is a mechanical signal, not final aesthetic judgment.",
            "likelyStatic=true means the clip should be reviewed or regenerated.",
        ],
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
