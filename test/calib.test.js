// G7 — the focal-length cascade.
//
// The tier that succeeds sets the sweep width for G9's Monte Carlo, which is
// the mechanism by which weak provenance becomes a visibly wide band. So these
// assertions are as much about which tier fires, and how wide it says it is, as
// about the number itself.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Gnomon } from "./_core.js";

const { calib, geom, synth, meta } = Gnomon;
const near = (a, b, tol, what = "") => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} !≈ ${b} (±${tol})`);

const WIDTH = 1800, HEIGHT = 1200;
const CENTRE = [WIDTH / 2, HEIGHT / 2];

function analysed(exif, decoded = {}) {
  return meta.analyse({
    exif,
    decodedWidth: decoded.width || WIDTH,
    decodedHeight: decoded.height || HEIGHT,
  });
}

// A tilted camera, so the verticals converge somewhere finite and Tier 4 has
// two usable orthogonal vanishing points.
function tiltedScene(focal = 1450) {
  return synth.scene({
    camera: {
      position: [1, -18, 6.5], yaw: 8, pitch: -17, roll: 4,
      focal, principal: [960, 540], imageSize: [1920, 1080],
    },
    sun: { elevation: 41, azimuth: 300 },
    poles: [
      { base: [-4, 6], height: 2.1 },
      { base: [3, 11], height: 1.4 },
      { base: [7, 4], height: 3.0 },
      { base: [-2, 15], height: 2.6 },
    ],
  });
}

function vpsOf(scene) {
  const f = synth.families(scene.objects);
  return {
    z: geom.vanishingPoint(f.vertical),
    shadow: geom.vanishingPoint(f.shadow),
    sun: geom.vanishingPoint(f.ray),
  };
}

// ── Tier 1 ───────────────────────────────────────────────────────────────────
test("Tier 1 uses the 35mm-equivalent focal length and claims ±2%", () => {
  const r = calib.solve({
    meta: analysed({ FocalLengthIn35mmFilm: 35, ExifImageWidth: WIDTH, ExifImageHeight: HEIGHT }),
    imageWidth: WIDTH, imageHeight: HEIGHT,
  });
  assert.equal(r.tier, 1);
  // 35mm equivalent is defined against a 36mm-wide frame.
  near(r.focalPx, (35 / 36) * WIDTH, 1e-6, "Tier 1 focal");
  near(r.sweep, 0.02, 1e-9, "Tier 1 sweep");
});

test("a resize does not change the 35mm-derived focal length in pixels per image width", () => {
  // Field of view is unchanged by a resize, so basing the calculation on the
  // decoded width is already correct — there is no second rescaling to apply,
  // and applying one would be wrong by exactly the resize ratio.
  const r = calib.solve({
    meta: analysed(
      { FocalLengthIn35mmFilm: 35, ExifImageWidth: WIDTH, ExifImageHeight: HEIGHT },
      { width: WIDTH / 2, height: HEIGHT / 2 },
    ),
    imageWidth: WIDTH / 2, imageHeight: HEIGHT / 2,
  });
  assert.equal(r.tier, 1);
  near(r.focalPx, (35 / 36) * (WIDTH / 2), 1e-6, "resized Tier 1 focal");
});

test("digital zoom is already folded into the effective focal length", () => {
  const r = calib.solve({
    meta: analysed({
      FocalLengthIn35mmFilm: 35, DigitalZoomRatio: 2,
      ExifImageWidth: WIDTH, ExifImageHeight: HEIGHT,
    }),
    imageWidth: WIDTH, imageHeight: HEIGHT,
  });
  near(r.focalPx, (70 / 36) * WIDTH, 1e-6, "zoomed Tier 1 focal");
});

// ── Tier 2 ───────────────────────────────────────────────────────────────────
test("Tier 2 uses the physical focal length and a looked-up sensor width, ±5%", () => {
  const r = calib.solve({
    meta: analysed({
      Make: "FUJIFILM", Model: "X-T4", FocalLength: 23,
      ExifImageWidth: WIDTH, ExifImageHeight: HEIGHT,
    }),
    imageWidth: WIDTH, imageHeight: HEIGHT,
  });
  assert.equal(r.tier, 2);
  near(r.focalPx, (23 / 23.5) * WIDTH, 1e-6, "Tier 2 focal");
  near(r.sweep, 0.05, 1e-9, "Tier 2 sweep");
});

test("Tier 2 is skipped when the sensor width is unknown", () => {
  const r = calib.solve({
    meta: analysed({
      Make: "Nonexistent", Model: "Nothing", FocalLength: 23,
      ExifImageWidth: WIDTH, ExifImageHeight: HEIGHT,
    }),
    imageWidth: WIDTH, imageHeight: HEIGHT,
  });
  assert.notEqual(r.tier, 2);
});

// ── Tier 3 ───────────────────────────────────────────────────────────────────
test("Tier 3 calibrates from a marked scene rectangle, ±10%", () => {
  // Project a real rectangle lying in the ground plane, so the two edge
  // families really are orthogonal in the world.
  const scene = tiltedScene(1450);
  const axes = scene.axes, cam = scene.camera;
  const corners = [[0, 4], [6, 4], [6, 9], [0, 9]].map(function (p) {
    return synth.project(cam, axes, [p[0], p[1], 0]);
  });

  const r = calib.solve({
    meta: analysed({}),
    imageWidth: 1920, imageHeight: 1080,
    principalPoint: [960, 540],
    rectangle: corners,
  });
  assert.equal(r.tier, 3);
  assert.ok(Math.abs(r.focalPx - 1450) / 1450 < 0.01, `Tier 3 gave ${r.focalPx}, want 1450`);
  near(r.sweep, 0.10, 1e-9, "Tier 3 sweep");
});

// ── Tier 4 — the one that makes stripped images work ─────────────────────────
test("Tier 4 recovers the focal length from the marks alone, ±15%", () => {
  const scene = tiltedScene(1450);
  const r = calib.solve({
    meta: analysed({}),
    imageWidth: 1920, imageHeight: 1080,
    principalPoint: [960, 540],
    vanishing: vpsOf(scene),
  });
  assert.equal(r.tier, 4);
  assert.ok(Math.abs(r.focalPx - 1450) / 1450 < 0.01, `Tier 4 gave ${r.focalPx}, want 1450`);
  near(r.sweep, 0.15, 1e-9, "Tier 4 sweep");
});

test("Tier 4 hits 1% of ground truth across a spread of focal lengths", () => {
  // The synthetic round trip, extended to the calibration as G7's gate asks.
  for (const focal of [900, 1200, 1450, 1900, 2600]) {
    const scene = tiltedScene(focal);
    const r = calib.solve({
      meta: analysed({}),
      imageWidth: 1920, imageHeight: 1080,
      principalPoint: [960, 540],
      vanishing: vpsOf(scene),
    });
    assert.equal(r.tier, 4, `focal ${focal} should reach Tier 4`);
    const error = Math.abs(r.focalPx - focal) / focal;
    assert.ok(error < 0.01, `focal ${focal}: recovered ${r.focalPx.toFixed(1)}, error ${(error * 100).toFixed(3)}%`);
  }
});

test("Tier 4 FALLS THROUGH on a positive dot product rather than fudging a real f", () => {
  // f² = −(v_z − c)·(v_shadow − c) needs a negative dot product. Taking an
  // absolute value, clamping, or returning an imaginary component would be the
  // single most damaging bug the app could have, because it would look like a
  // successful mid-tier calibration.
  const sameSide = {
    z: { atInfinity: false, point: { x: 1400, y: 900 }, v: [1400, 900, 1], wellConditioned: true },
    shadow: { atInfinity: false, point: { x: 1500, y: 950 }, v: [1500, 950, 1], wellConditioned: true },
  };
  const dot = (1400 - 960) * (1500 - 960) + (900 - 540) * (950 - 540);
  assert.ok(dot > 0, "fixture must actually have a positive dot product");

  const r = calib.solve({
    meta: analysed({}),
    imageWidth: 1920, imageHeight: 1080,
    principalPoint: [960, 540],
    vanishing: sameSide,
  });
  assert.equal(r.tier, 5, "must fall through to the prior, not return a value");
  assert.ok(Number.isFinite(r.focalPx));
  assert.ok(r.focalPx > 0);
});

test("Tier 4 is skipped when either vanishing point is at infinity", () => {
  // A level camera sends verticals to infinity. The orthogonality constraint
  // degenerates there — it is not that the answer is poor, it is that there is
  // no equation left to solve.
  const level = synth.scene({
    camera: {
      position: [1, -18, 1.7], yaw: 0, pitch: 0, roll: 0,
      focal: 1450, principal: [960, 540], imageSize: [1920, 1080],
    },
    sun: { elevation: 41, azimuth: 300 },
    poles: [{ base: [-4, 6], height: 2.1 }, { base: [3, 11], height: 1.4 }, { base: [7, 4], height: 3.0 }],
  });
  const vps = vpsOf(level);
  assert.equal(vps.z.atInfinity, true, "fixture must have verticals at infinity");

  const r = calib.solve({
    meta: analysed({}), imageWidth: 1920, imageHeight: 1080,
    principalPoint: [960, 540], vanishing: vps,
  });
  assert.equal(r.tier, 5);
});

// ── Tier 5 ───────────────────────────────────────────────────────────────────
test("Tier 5 is a bare prior with a full-range sweep", () => {
  const r = calib.solve({ meta: analysed({}), imageWidth: WIDTH, imageHeight: HEIGHT });
  assert.equal(r.tier, 5);
  // 1.0–1.4 × image width, so the midpoint is 1.2 and the band spans ±0.2/1.2.
  near(r.focalPx, 1.2 * WIDTH, 1e-6, "prior midpoint");
  near(r.range[0], 1.0 * WIDTH, 1e-6, "prior low");
  near(r.range[1], 1.4 * WIDTH, 1e-6, "prior high");
  assert.ok(r.sweep > 0.15, `prior sweep should be wide, got ${r.sweep}`);
});

test("the range always brackets the point estimate", () => {
  for (const r of [
    calib.solve({ meta: analysed({ FocalLengthIn35mmFilm: 35, ExifImageWidth: WIDTH, ExifImageHeight: HEIGHT }), imageWidth: WIDTH, imageHeight: HEIGHT }),
    calib.solve({ meta: analysed({}), imageWidth: WIDTH, imageHeight: HEIGHT }),
  ]) {
    assert.ok(r.range[0] < r.focalPx && r.focalPx < r.range[1], `${r.range} does not bracket ${r.focalPx}`);
  }
});

// ── Disagreement is a signal, not an error ───────────────────────────────────
test("EXIF and geometry disagreeing is surfaced with both values, never averaged", () => {
  const scene = tiltedScene(1450);
  // Claim a focal length that implies about 2200px — well away from the 1450
  // the geometry will recover.
  const r = calib.solve({
    meta: analysed({ FocalLengthIn35mmFilm: 41, ExifImageWidth: 1920, ExifImageHeight: 1080 }),
    imageWidth: 1920, imageHeight: 1080,
    principalPoint: [960, 540],
    vanishing: vpsOf(scene),
  });

  assert.equal(r.tier, 1, "the EXIF tier still wins the cascade");
  assert.notEqual(r.disagreement, null);
  near(r.disagreement.exif, (41 / 36) * 1920, 1e-6, "reported EXIF value");
  assert.ok(Math.abs(r.disagreement.geometry - 1450) / 1450 < 0.01, "reported geometry value");
  // Not averaged: the chosen focal length is still exactly the EXIF one.
  near(r.focalPx, (41 / 36) * 1920, 1e-6, "chosen focal is not a blend");
});

test("EXIF and geometry agreeing raises no disagreement", () => {
  const scene = tiltedScene(1450);
  const r = calib.solve({
    meta: analysed({ FocalLengthIn35mmFilm: (1450 / 1920) * 36, ExifImageWidth: 1920, ExifImageHeight: 1080 }),
    imageWidth: 1920, imageHeight: 1080,
    principalPoint: [960, 540],
    vanishing: vpsOf(scene),
  });
  assert.equal(r.tier, 1);
  assert.equal(r.disagreement, null);
});

// ── Cropping ─────────────────────────────────────────────────────────────────
test("a crop widens the sweep, because the principal point is no longer known", () => {
  const intact = calib.solve({
    meta: analysed({ FocalLengthIn35mmFilm: 35, ExifImageWidth: WIDTH, ExifImageHeight: HEIGHT }),
    imageWidth: WIDTH, imageHeight: HEIGHT,
  });
  const cropped = calib.solve({
    meta: analysed(
      { FocalLengthIn35mmFilm: 35, ExifImageWidth: WIDTH, ExifImageHeight: HEIGHT },
      { width: WIDTH, height: Math.round(WIDTH * 9 / 16) },
    ),
    imageWidth: WIDTH, imageHeight: Math.round(WIDTH * 9 / 16),
  });

  assert.equal(cropped.meta.cropped, true);
  assert.ok(cropped.sweep > intact.sweep,
    `a crop must widen the band: ${cropped.sweep} vs ${intact.sweep}`);
});

test("every tier reports which method produced it", () => {
  const r = calib.solve({ meta: analysed({}), imageWidth: WIDTH, imageHeight: HEIGHT });
  assert.equal(typeof r.method, "string");
  assert.ok(r.method.length > 0);
  assert.ok(Array.isArray(r.candidates));
});
