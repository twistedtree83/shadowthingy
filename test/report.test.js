// G15 — a self-contained report that outlives the session.
//
// The builder is a pure function over the values the core produced. It never
// touches the DOM: a report and the screen it was taken from must not be able
// to disagree, and scraping rendered text is exactly how they would.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Gnomon } from "./_core.js";
import { scan } from "../scripts2/check-network.js";

const { report, guards } = Gnomon;

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function fixture(overrides) {
  return Object.assign({
    generatedAt: "2023-12-22 15:20 (+11:00)",
    claim: { year: 2023, month: 12, day: 22, minutes: 920, tzOffsetHours: 11, latitude: -33.8569, longitude: 151.2092 },
    meta: {
      make: "FUJIFILM", model: "X-T4", decodedWidth: 1800, decodedHeight: 1200,
      orientation: 1, cropped: false, resized: null, principalPointTrustworthy: true,
      focalLength35: 27, effectiveFocal35: 27, focalLength: 23, sensorWidth: 23.5,
      digitalZoomRatio: 1, tzOffsetHours: 11, tzSource: "OffsetTimeOriginal",
      capture: { year: 2023, month: 12, day: 22, minutes: 920, seconds: 0 },
      gps: { latitude: -33.8569, longitude: 151.2092 }, flags: [],
    },
    objects: [
      { base: [486.8, 578.2], top: [474.8, 445.0], tip: [575.5, 573.2] },
      { base: [892.5, 528.2], top: [884.7, 380.1], tip: [1021.4, 523.3] },
    ],
    vanishing: {
      z: { v: [0.01, -0.99, 0.0001], conditionNumber: 6.1e-10, atInfinity: false, wellConditioned: true },
      shadow: { v: [0.99, 0.05, 0.0002], conditionNumber: 6.8e-9, atInfinity: false, wellConditioned: true },
      sun: { v: [0.7, 0.7, 0.0003], conditionNumber: 7.4e-9, atInfinity: false, wellConditioned: true },
    },
    calibration: {
      tier: 1, method: "exif-35mm", focalPx: 1350, sweep: 0.02, range: [1323, 1377],
      principalPoint: [900, 600], principalPointTrustworthy: true, disagreement: null, notes: [],
      candidates: [
        { tier: 1, method: "exif-35mm", focalPx: 1350, sweep: 0.02 },
        { tier: 4, method: "orthogonal-vanishing-points", focalPx: 1350, sweep: 0.15 },
      ],
    },
    sun: {
      dUp: [-0.06, -0.95, -0.29], dShadow: [0.9, -0.1, 0.4], dRay: [0.5, 0.6, 0.6], dSun: [-0.5, -0.6, -0.6],
      elevation: 56.42, azimuth: 278.3, residual: 0.0001, determinant: 1e-6, shadowMultiplier: 0.664,
      elevationUsable: true, azimuthOnly: false,
    },
    uncertainty: {
      samples: 500, failures: 0,
      elevation: { p5: 54.0, p50: 56.1, p95: 57.8, unbounded: false },
      azimuth: { p5: 264.1, p50: 276.1, p95: 303.6, unbounded: false },
      residual: { p5: 1.2, p50: 5.3, p95: 14.9 },
    },
    guards: guards.evaluate({
      elevation: { p5: 54, p50: 56.1, p95: 57.8 },
      azimuth: { p5: 264, p50: 276, p95: 303 },
      residual: 0.0001, residualNoiseFloor: 5.3,
      date: { year: 2023, month: 12, day: 22, tzOffsetHours: 11 },
      place: { latitude: -33.8569, longitude: 151.2092 },
      meta: {}, calibration: { tier: 1 },
    }),
    verdict: { verdict: "consistent", sentence: "The claimed time implies a sun 56.4° above the horizon. Consistent." },
    band: { count: 3681, evaluated: 519120, unbounded: false, azimuthApplied: true },
    images: { marked: PIXEL, map: PIXEL },
  }, overrides || {});
}

test("the report is a complete standalone document", () => {
  const html = report.build(fixture());
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<\/html>\s*$/i);
});

// ── Self-contained ───────────────────────────────────────────────────────────

test("the report references nothing outside itself", () => {
  /* It will outlive the session and be read by somebody who does not have the
     app, quite possibly with no network. A report that needs the internet to
     render is one that will one day render blank. */
  const html = report.build(fixture());
  const external = html.match(/https?:\/\/[^\s"'<)]+/g) || [];
  assert.deepEqual(external, [], `report must have no external references: ${external.join(", ")}`);
  assert.doesNotMatch(html, /<script\b/i, "a static report needs no script at all");
  assert.doesNotMatch(html, /<link\b/i);
});

test("the report passes the same network gate the app does", () => {
  const violations = scan(report.build(fixture()));
  assert.deepEqual(violations, [], JSON.stringify(violations));
});

test("the marked image and the map are inlined as data URIs", () => {
  const html = report.build(fixture());
  assert.ok(html.includes(PIXEL), "the marked image must be embedded, not linked");
  assert.equal((html.match(/data:image\/png;base64,/g) || []).length >= 2, true, "image and map both");
});

// ── Everything travels with the answer ───────────────────────────────────────

test("the calibration tier and its sweep are in the report", () => {
  const html = report.build(fixture());
  assert.match(html, /exif-35mm/);
  assert.match(html, /1350/);
  assert.match(html, /±2%|2%/);
});

test("the tolerance travels with the answer, never just the median", () => {
  // A reader given only the median has been handed false precision.
  const html = report.build(fixture());
  assert.match(html, /54\.0/);
  assert.match(html, /57\.8/);
  assert.match(html, /264\.1/);
  assert.match(html, /303\.6/);
});

test("the residual is present with its noise floor", () => {
  const html = report.build(fixture());
  assert.match(html, /residual/i);
  assert.match(html, /5\.3/, "the noise floor it must be judged against");
});

test("every intermediate value a reviewer would want is present", () => {
  const html = report.build(fixture());
  for (const needle of [
    "d_up", "d_shadow", "d_sun",          // direction vectors
    "condition",                            // conditioning
    "principal point",                      // camera model
    "orthogonal-vanishing-points",          // the other calibration candidate
  ]) {
    assert.ok(html.toLowerCase().includes(needle.toLowerCase()), `missing: ${needle}`);
  }
});

test("the stated assumptions travel with the report", () => {
  const html = report.build(fixture());
  assert.match(html, /assumption/i);
  assert.match(html, /gravity|slope/i, "the blind spot no check can catch must be stated");
});

test("fired guards appear in the report", () => {
  const f = fixture();
  assert.ok(f.guards.fired.length > 0, "fixture should fire at least the weak-check guard");
  const html = report.build(f);
  for (const g of f.guards.fired) assert.ok(html.includes(g.title), `missing guard: ${g.title}`);
});

test("a withheld answer is reported as withheld, not as a number", () => {
  const withheld = fixture({
    guards: guards.evaluate({
      elevation: { p5: 1, p50: 3, p95: 4.5 },
      residual: 0.1, residualNoiseFloor: 0.2,
      date: { year: 2023, month: 12, day: 22, tzOffsetHours: 11 },
      place: { latitude: -33.8569, longitude: 151.2092 }, meta: {}, calibration: { tier: 1 },
    }),
  });
  assert.equal(withheld.guards.confident, false);
  const html = report.build(withheld);
  assert.match(html, /withheld|not support/i);
});

// ── Purity ───────────────────────────────────────────────────────────────────

test("the builder is pure — same input, byte-identical output", () => {
  assert.equal(report.build(fixture()), report.build(fixture()));
});

test("the builder reads only its argument, never a global", () => {
  // If it scraped the DOM it could not run here at all — there is no document
  // in this context. That this test passes IS the assertion.
  assert.equal(typeof globalThis.document, "undefined");
  assert.ok(report.build(fixture()).length > 1000);
});

test("escaping prevents a filename or camera model from breaking the document", () => {
  const nasty = fixture();
  nasty.meta = Object.assign({}, nasty.meta, { model: '</script><img src=x onerror=alert(1)>' });
  const html = report.build(nasty);
  assert.doesNotMatch(html, /<img src=x/, "must be escaped");
  assert.match(html, /&lt;\/script&gt;|&lt;img/, "should appear escaped");
});
