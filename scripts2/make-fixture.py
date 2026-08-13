"""Draws the synthetic scene from scripts2/fixture-scene.js into test JPEGs.

This is a pencil, not a source of truth. Every coordinate it draws was computed
by Gnomon.synth in the core — nothing here reimplements a projection, because a
second implementation is exactly what would let a fixture agree with a bug.

Produces, under samples/ (gitignored — the repo never holds imagery):

  scene-clean.jpg     full EXIF, intact
  scene-cropped.jpg   16:9 crop of the same frame, EXIF still claims 3:2
  scene-resized.jpg   half size, aspect preserved
  scene-stripped.jpg  no EXIF at all
  scene-rotated.jpg   portrait bytes with Orientation=6

Run: node scripts2/fixture-scene.js > samples/scene.json && python3 scripts2/make-fixture.py
"""

import json
import os
from PIL import Image, ImageDraw
import piexif

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES = os.path.join(HERE, "samples")
os.makedirs(SAMPLES, exist_ok=True)

with open(os.path.join(SAMPLES, "scene.json")) as fh:
    scene = json.load(fh)

W, H = scene["imageSize"]

GROUND = (108, 116, 96)
SKY = (150, 172, 196)
POLE = (58, 48, 42)
SHADOW = (66, 72, 58)


def draw_scene(width, height):
    img = Image.new("RGB", (width, height), SKY)
    d = ImageDraw.Draw(img)

    # A horizon, so the image reads as a photograph rather than a diagram.
    d.rectangle([0, int(height * 0.34), width, height], fill=GROUND)

    for obj in scene["objects"]:
        base = tuple(obj["base"])
        top = tuple(obj["top"])
        tip = tuple(obj["tip"])
        # Shadow first, so the pole overlaps it the way a real one would.
        d.line([base, tip], fill=SHADOW, width=9)
        d.line([base, top], fill=POLE, width=7)
        d.ellipse([base[0] - 4, base[1] - 4, base[0] + 4, base[1] + 4], fill=POLE)

    return img


def exif_bytes(exif_w, exif_h, orientation=1):
    zeroth = {
        piexif.ImageIFD.Make: b"FUJIFILM",
        piexif.ImageIFD.Model: b"X-T4",
        piexif.ImageIFD.Orientation: orientation,
    }
    exif = {
        piexif.ExifIFD.DateTimeOriginal: b"2023:12:22 15:20:00",
        piexif.ExifIFD.OffsetTimeOriginal: b"+11:00",
        piexif.ExifIFD.FocalLength: (23, 1),
        piexif.ExifIFD.FocalLengthIn35mmFilm: 35,
        piexif.ExifIFD.PixelXDimension: exif_w,
        piexif.ExifIFD.PixelYDimension: exif_h,
        piexif.ExifIFD.DigitalZoomRatio: (1, 1),
    }
    # Sydney Opera House, as a plausible GPS fix.
    gps = {
        piexif.GPSIFD.GPSLatitudeRef: b"S",
        piexif.GPSIFD.GPSLatitude: ((33, 1), (51, 1), (2500, 100)),
        piexif.GPSIFD.GPSLongitudeRef: b"E",
        piexif.GPSIFD.GPSLongitude: ((151, 1), (12, 1), (3300, 100)),
        piexif.GPSIFD.GPSDateStamp: b"2023:12:22",
        piexif.GPSIFD.GPSTimeStamp: ((4, 1), (20, 1), (0, 1)),
    }
    return piexif.dump({"0th": zeroth, "Exif": exif, "GPS": gps, "1st": {}, "thumbnail": None})


full = draw_scene(W, H)

full.save(os.path.join(SAMPLES, "scene-clean.jpg"), quality=92, exif=exif_bytes(W, H))

# Cropped to 16:9 from 3:2, keeping the recorded dimensions — the principal
# point is no longer the centre and the EXIF has no way of saying so.
crop_h = int(W * 9 / 16)
top = (H - crop_h) // 2
full.crop((0, top, W, top + crop_h)).save(
    os.path.join(SAMPLES, "scene-cropped.jpg"), quality=92, exif=exif_bytes(W, H)
)

# Halved in both directions: aspect survives, so this is a resize not a crop.
full.resize((W // 2, H // 2), Image.LANCZOS).save(
    os.path.join(SAMPLES, "scene-resized.jpg"), quality=92, exif=exif_bytes(W, H)
)

full.save(os.path.join(SAMPLES, "scene-stripped.jpg"), quality=92)

# Orientation 6: the bytes are stored rotated and the tag says "rotate me back
# 90° CW". An app that ignores the tag gets a sideways world where nothing
# vertical is vertical.
#
# The recorded dimensions describe the STORED bytes, so they are portrait here —
# that is what a real camera writes, and it is what makes a rotated photo look
# like a crop to anything that compares them to the decoded size naively.
rotated = full.rotate(90, expand=True)
rotated.save(
    os.path.join(SAMPLES, "scene-rotated.jpg"),
    quality=92,
    exif=exif_bytes(rotated.width, rotated.height, orientation=6),
)

print("wrote 5 fixtures to samples/")
for obj in scene["objects"]:
    print(
        "  base %-18s top %-18s tip %s"
        % (
            "(%.1f, %.1f)" % tuple(obj["base"]),
            "(%.1f, %.1f)" % tuple(obj["top"]),
            "(%.1f, %.1f)" % tuple(obj["tip"]),
        )
    )
print("truth: elevation %.2f°  azimuth %.2f°  focal %.0f px" % (
    scene["truth"]["elevation"], scene["truth"]["azimuth"], scene["truth"]["focal"]))
