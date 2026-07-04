import math
import sys
from pathlib import Path

import cv2
import numpy as np


def read_image(path: Path):
    data = np.fromfile(str(path), dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def write_image(path: Path, image, quality: int = 88):
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError(f"Cannot encode image: {path}")
    encoded.tofile(str(path))


def main() -> int:
    if len(sys.argv) < 4:
        print("Usage: video-contact-sheet.py <frames-dir> <output-dir> <cols> [rows]", file=sys.stderr)
        return 2

    frames_dir = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    cols = int(sys.argv[3])
    rows = int(sys.argv[4]) if len(sys.argv) > 4 else 6

    files = sorted(frames_dir.glob("*.jpg"))
    if not files:
        raise RuntimeError(f"No frames found in {frames_dir}")

    first = read_image(files[0])
    if first is None:
        raise RuntimeError(f"Cannot read first frame: {files[0]}")

    h, w = first.shape[:2]
    label_h = 24
    margin = 8
    padding = 4
    page_size = cols * rows
    output_dir.mkdir(parents=True, exist_ok=True)

    pages = math.ceil(len(files) / page_size)
    for page in range(pages):
        chunk = files[page * page_size : (page + 1) * page_size]
        sheet_w = cols * w + (cols + 1) * padding
        sheet_h = rows * (h + label_h) + (rows + 1) * padding
        sheet = 0 * first
        sheet = cv2.resize(sheet, (sheet_w, sheet_h))

        for i, file in enumerate(chunk):
            img = read_image(file)
            if img is None:
                continue
            img = cv2.resize(img, (w, h))
            row = i // cols
            col = i % cols
            x = padding + col * (w + padding)
            y = padding + row * (h + label_h + padding)
            sheet[y : y + h, x : x + w] = img
            label = file.stem.replace("frame_", "#")
            cv2.putText(
                sheet,
                label,
                (x + margin, y + h + 17),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (235, 235, 235),
                1,
                cv2.LINE_AA,
            )

        out = output_dir / f"contact-sheet-{page + 1:03d}.jpg"
        write_image(out, sheet)

    print(f"Contact sheets: {pages}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
