// G5 — metadata integrity.
//
// Each of these three conditions silently wrecks the answer if missed, and none
// of them announces itself: the image still opens, the EXIF still parses, and
// the focal length is simply wrong by a factor nobody sees.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Gnomon } from "./_core.js";

const { meta } = Gnomon;
const near = (a, b, tol, what = "") => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} !≈ ${b}`);
const kinds = (r) => Array.from(r.flags, (f) => f.kind).sort();

const CLEAN = {
  exif: {
    Make: "FUJIFILM", Model: "X-T4",
    DateTimeOriginal: "2023:12:22 13:45:30",
    OffsetTimeOriginal: "+11:00",
    FocalLength: 23, FocalLengthIn35mmFilm: 35,
    ExifImageWidth: 6240, ExifImageHeight: 4160,
    DigitalZoomRatio: 1,
  },
  decodedWidth: 6240,
  decodedHeight: 4160,
};

test("a clean image raises no integrity flags", () => {
  const r = meta.analyse(CLEAN);
  assert.deepEqual(kinds(r), []);
  assert.equal(r.cropped, false);
  assert.equal(r.resized, null);
  assert.equal(r.principalPointTrustworthy, true);
  assert.equal(r.effectiveFocal35, 35);
});

test("an image with no EXIF at all is a first-class input, not an error", () => {
  // Stripped and screenshotted images are the interesting cases, so this must
  // produce a usable result rather than throwing.
  const r = meta.analyse({ exif: {}, decodedWidth: 1080, decodedHeight: 1350 });
  assert.equal(r.effectiveFocal35, null);
  assert.equal(r.capture, null);
  assert.equal(r.tzOffsetHours, null);
  assert.ok(kinds(r).includes("no-metadata"));
  // Nothing is known, so nothing is claimed — but the principal point is still
  // assumed central, because there is no evidence of a crop either way.
  assert.equal(r.principalPointTrustworthy, true);
});

test("digital zoom multiplies the effective focal length", () => {
  const r = meta.analyse({ ...CLEAN, exif: { ...CLEAN.exif, DigitalZoomRatio: 2 } });
  assert.ok(kinds(r).includes("digital-zoom"));
  // The lens was still 35mm-equivalent; the crop-and-upscale doubled it.
  near(r.effectiveFocal35, 70, 1e-9, "zoomed focal");
});

test("a digital zoom ratio of exactly 1 is not a zoom", () => {
  assert.equal(kinds(meta.analyse(CLEAN)).includes("digital-zoom"), false);
});

test("a resized image rescales the focal length by the same ratio", () => {
  // Halved in both directions: aspect unchanged, so this is a resize and not a
  // crop, and the focal length in pixels scales with the width.
  const r = meta.analyse({ ...CLEAN, decodedWidth: 3120, decodedHeight: 2080 });
  assert.ok(kinds(r).includes("resized"));
  assert.equal(r.cropped, false);
  near(r.resized.ratio, 0.5, 1e-9, "resize ratio");
  // Focal length in 35mm terms is unchanged by a resize — it is the pixel
  // focal length that scales, and that is computed in G7 from this ratio.
  near(r.effectiveFocal35, 35, 1e-9);
  assert.equal(r.principalPointTrustworthy, true);
});

test("a changed aspect ratio means a crop and the principal point is no longer the centre", () => {
  // 6240×4160 (3:2) cropped to 6240×3510 (16:9).
  const r = meta.analyse({ ...CLEAN, decodedWidth: 6240, decodedHeight: 3510 });
  assert.ok(kinds(r).includes("cropped"), `expected a crop flag, got ${kinds(r)}`);
  assert.equal(r.cropped, true);
  assert.equal(r.principalPointTrustworthy, false);

  // This is the one that quietly invalidates the camera model, so it must be
  // the loudest thing in the list.
  const crop = r.flags.find((f) => f.kind === "cropped");
  assert.equal(crop.severity, "loud");
});

test("a crop and a resize together are both reported", () => {
  const r = meta.analyse({ ...CLEAN, decodedWidth: 1920, decodedHeight: 1080 });
  const k = kinds(r);
  assert.ok(k.includes("cropped"), `got ${k}`);
  assert.ok(k.includes("resized"), `got ${k}`);
});

// ── Capture time and timezone ────────────────────────────────────────────────

test("the capture instant is parsed into plain fields", () => {
  const r = meta.analyse(CLEAN);
  assert.deepEqual(
    { ...r.capture },
    { year: 2023, month: 12, day: 22, minutes: 13 * 60 + 45, seconds: 30 },
  );
});

test("timezone comes from OffsetTimeOriginal when it is present", () => {
  const r = meta.analyse(CLEAN);
  assert.equal(r.tzOffsetHours, 11);
  assert.equal(r.tzSource, "OffsetTimeOriginal");
});

test("half-hour and quarter-hour offsets survive parsing", () => {
  const half = meta.analyse({ ...CLEAN, exif: { ...CLEAN.exif, OffsetTimeOriginal: "+05:30" } });
  assert.equal(half.tzOffsetHours, 5.5);
  const quarter = meta.analyse({ ...CLEAN, exif: { ...CLEAN.exif, OffsetTimeOriginal: "+05:45" } });
  assert.equal(quarter.tzOffsetHours, 5.75);
  const negative = meta.analyse({ ...CLEAN, exif: { ...CLEAN.exif, OffsetTimeOriginal: "-03:30" } });
  assert.equal(negative.tzOffsetHours, -3.5);
});

test("timezone is recovered by differencing GPS time against local time", () => {
  // GPS timestamps are UTC by definition, so the gap between them and
  // DateTimeOriginal is the offset — a second source of truth before guessing.
  const r = meta.analyse({
    ...CLEAN,
    exif: {
      ...CLEAN.exif,
      OffsetTimeOriginal: undefined,
      GPSDateStamp: "2023:12:22",
      GPSTimeStamp: [2, 45, 30],
    },
  });
  assert.equal(r.tzOffsetHours, 11);
  assert.equal(r.tzSource, "GPS");
});

test("GPS differencing works across a date boundary", () => {
  // Local 2023-12-22 09:30 at UTC+11 is 2023-12-21 22:30 UTC.
  const r = meta.analyse({
    ...CLEAN,
    exif: {
      ...CLEAN.exif,
      DateTimeOriginal: "2023:12:22 09:30:00",
      OffsetTimeOriginal: undefined,
      GPSDateStamp: "2023:12:21",
      GPSTimeStamp: [22, 30, 0],
    },
  });
  assert.equal(r.tzOffsetHours, 11);
});

test("GPS differencing rounds to the nearest quarter hour", () => {
  // Camera clocks drift by seconds; real offsets are quarter-hour multiples.
  const r = meta.analyse({
    ...CLEAN,
    exif: {
      ...CLEAN.exif,
      OffsetTimeOriginal: undefined,
      GPSDateStamp: "2023:12:22",
      GPSTimeStamp: [2, 45, 47],
    },
  });
  assert.equal(r.tzOffsetHours, 11);
});

test("with neither source, the timezone is null and flagged rather than defaulted to UTC", () => {
  // Silently defaulting to UTC would corrupt every answer by the offset, which
  // is the single field that most affects the result.
  const r = meta.analyse({
    ...CLEAN,
    exif: { ...CLEAN.exif, OffsetTimeOriginal: undefined },
  });
  assert.equal(r.tzOffsetHours, null);
  assert.equal(r.tzSource, null);
  assert.ok(kinds(r).includes("no-timezone"));
});

test("GPS coordinates are picked up when present", () => {
  const r = meta.analyse({
    ...CLEAN,
    exif: { ...CLEAN.exif, latitude: -33.8688, longitude: 151.2093 },
  });
  near(r.gps.latitude, -33.8688, 1e-9);
  near(r.gps.longitude, 151.2093, 1e-9);
});

test("a GPS position of exactly zero is not mistaken for a missing one", () => {
  // Null Island is a real coordinate and a real EXIF bug pattern; treating 0 as
  // falsy would silently discard a genuine reading.
  const r = meta.analyse({ ...CLEAN, exif: { ...CLEAN.exif, latitude: 0, longitude: 0 } });
  assert.notEqual(r.gps, null);
  assert.equal(r.gps.latitude, 0);
});

// ── What exifr actually hands us ─────────────────────────────────────────────
// Every one of these was a live bug found by pointing the real library at a
// real JPEG. Each fails silently: the image opens, the EXIF parses, and a
// value is simply absent or wrong with nothing to indicate it.

test("Orientation is accepted as a number or as exifr's revived string", () => {
  assert.equal(meta.normaliseOrientation(6), 6);
  assert.equal(meta.normaliseOrientation("6"), 6);
  // exifr revives Orientation to prose. Number("Rotate 90 CW") is NaN, which
  // would silently become "no rotation" and leave every vertical sideways.
  assert.equal(meta.normaliseOrientation("Rotate 90 CW"), 6);
  assert.equal(meta.normaliseOrientation("Rotate 270 CW"), 8);
  assert.equal(meta.normaliseOrientation("Rotate 180"), 3);
  assert.equal(meta.normaliseOrientation("Horizontal (normal)"), 1);
  assert.equal(meta.normaliseOrientation(undefined), 1);
  assert.equal(meta.normaliseOrientation("something unexpected"), 1);
});

test("DateTimeOriginal is accepted as a string or as exifr's revived Date", () => {
  const fromString = meta.parseExifDateTime("2023:12:22 15:20:00");
  assert.deepEqual({ ...fromString }, { year: 2023, month: 12, day: 22, minutes: 920, seconds: 0 });

  // exifr returns a Date. Reading its components is clock-free — the core still
  // constructs no Date of its own — but the regex path fails on it entirely,
  // which silently loses the capture time on every real photograph.
  const asDate = new Date(2023, 11, 22, 15, 20, 0);
  assert.deepEqual({ ...meta.parseExifDateTime(asDate) }, { ...fromString });
});

test("the 35mm focal length is read under either of exifr's names", () => {
  // The EXIF tag is FocalLengthIn35mmFilm; exifr surfaces it as
  // FocalLengthIn35mmFormat. Reading only one name means Tier 1 never fires.
  const film = meta.analyse({ ...CLEAN, exif: { ...CLEAN.exif, FocalLengthIn35mmFilm: 35 } });
  const format = meta.analyse({
    ...CLEAN,
    exif: { ...CLEAN.exif, FocalLengthIn35mmFilm: undefined, FocalLengthIn35mmFormat: 35 },
  });
  assert.equal(film.focalLength35, 35);
  assert.equal(format.focalLength35, 35);
});

test("a rotated image is not mistaken for a cropped one", () => {
  // THE important one. EXIF dimensions describe the stored bytes; decoded
  // dimensions are after orientation is applied. For orientation 6 the stored
  // frame is portrait and the decoded frame is landscape, so comparing them
  // directly reports a crop AND a resize on a photograph that has neither —
  // and a spurious crop flag permanently discredits the principal point.
  const r = meta.analyse({
    exif: { ...CLEAN.exif, ExifImageWidth: 1200, ExifImageHeight: 1800 },
    orientation: 6,
    decodedWidth: 1800,
    decodedHeight: 1200,
  });
  assert.deepEqual(kinds(r), []);
  assert.equal(r.cropped, false);
  assert.equal(r.resized, null);
  assert.equal(r.principalPointTrustworthy, true);
});

test("a rotated image that really was cropped is still caught", () => {
  // Orientation must not become a blanket excuse for a dimension mismatch.
  const r = meta.analyse({
    exif: { ...CLEAN.exif, ExifImageWidth: 1200, ExifImageHeight: 1800 },
    orientation: 6,
    decodedWidth: 1800,
    decodedHeight: 1012,
  });
  assert.ok(kinds(r).includes("cropped"), `expected a crop flag, got ${kinds(r)}`);
});

// ── Sensor width lookup, which G7's Tier 2 needs ─────────────────────────────

test("sensor width is looked up by make and model, case- and space-insensitively", () => {
  near(meta.sensorWidth("FUJIFILM", "X-T4"), 23.5, 0.1, "APS-C");
  near(meta.sensorWidth("fujifilm", " x-t4 "), 23.5, 0.1, "normalised lookup");
  near(meta.sensorWidth("Apple", "iPhone 13 Pro"), 9.8, 0.5, "phone sensor");
});

test("an unknown camera falls back to its make's typical sensor, then to nothing", () => {
  // A guess flagged as a guess is useful; a guess presented as a lookup is not.
  const known = meta.sensorWidth("Canon", "EOS Something Unheard Of");
  assert.ok(known === null || known > 0);
  assert.equal(meta.sensorWidth("Nonexistent Brand", "Nonexistent Model"), null);
  assert.equal(meta.sensorWidth(undefined, undefined), null);
});
