#!/usr/bin/env python3
"""Write the images the browser checks upload into a folder (default: scripts/e2e/fixtures).

  python3 scripts/e2e/make_fixtures.py [out_dir]

test1.png / test2.png small PNGs; big1.png / big2.png 1600x1200 noise (slow for
Non-Local Means, so batch Stop/Apply and reload-mid-run have time to happen);
test3.tif a TIFF (browsers can't preview it); bad.gif an unsupported format.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent / "fixtures")
out.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)


def disc(color, bg=(30, 30, 30), size=(320, 240)):
    im = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(im)
    d.ellipse((size[0] * 0.3, size[1] * 0.25, size[0] * 0.7, size[1] * 0.85), fill=color)
    return im


disc((240, 240, 240)).save(out / "test1.png")
disc((220, 80, 60), bg=(20, 60, 120)).save(out / "test2.png")
for i in (1, 2):
    Image.fromarray(rng.integers(0, 256, size=(1200, 1600, 3), dtype=np.uint8)).save(out / f"big{i}.png")
disc((90, 200, 120)).save(out / "test3.tif")
disc((200, 200, 40)).save(out / "bad.gif")
print(f"fixtures written to {out}")
