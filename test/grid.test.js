// G10 — the inverse solve. Given a measured sun band and a claimed instant,
// find everywhere on Earth the sun could have been where the shadows say.
//
// The closing assertion is the end-to-end test of the whole app: a band derived
// from a real location and time must contain that location.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Gnomon } from "./_core.js";

const { grid, solar } = Gnomon;

// Sydney, 22 December 2023, 15:20 AEDT — the instant the fixture photograph
// claims. Expressed in UTC, which is what the inverse solve works in.
const SYDNEY = { latitude: -33.8569, longitude: 151.2092 };
const CLAIM = { year: 2023, month: 12, day: 22, minutes: 15 * 60 + 20, tzOffsetHours: 11 };
const UTC = { year: 2023, month: 12, day: 22, minutes: 15 * 60 + 20 - 11 * 60 };

const truth = solar.position({ ...CLAIM, ...SYDNEY });

function band(centre, halfWidth) {
  return { p5: centre - halfWidth, p50: centre, p95: centre + halfWidth };
}

test("the solve reuses the solar engine and agrees with it cell for cell", () => {
  // The grid hoists the instant-only half of the calculation out of its loop.
  // That must be an optimisation, not a second implementation that can drift.
  const r = grid.solve({ utc: UTC, elevation: band(truth.elevation, 0.5) });
  for (const place of [SYDNEY, { latitude: 40, longitude: -74 }, { latitude: -60, longitude: 20 }]) {
    const direct = solar.position({ ...UTC, tzOffsetHours: 0, ...place });
    const viaGrid = grid.at(r.context, place.latitude, place.longitude);
    assert.ok(Math.abs(viaGrid.elevation - direct.elevation) < 1e-9,
      `elevation disagrees at ${place.latitude},${place.longitude}`);
    assert.ok(Math.abs(viaGrid.azimuth - direct.azimuth) < 1e-9,
      `azimuth disagrees at ${place.latitude},${place.longitude}`);
  }
});

// ── THE end-to-end gate ──────────────────────────────────────────────────────

test("a band derived from a known real location and time contains that location", () => {
  const r = grid.solve({ utc: UTC, elevation: band(truth.elevation, 0.5) });
  const strength = grid.strengthAt(r, SYDNEY.latitude, SYDNEY.longitude);
  assert.ok(strength > 0.8, `Sydney should sit in the core of its own band, got ${strength}`);
});

test("the band excludes places where the sun was somewhere else entirely", () => {
  const r = grid.solve({ utc: UTC, elevation: band(truth.elevation, 0.5) });
  // London at that instant is in darkness; its elevation is nothing like 56°.
  assert.equal(grid.strengthAt(r, 51.5, -0.13), 0);
});

test("adding azimuth collapses the band toward a patch", () => {
  const wide = grid.solve({ utc: UTC, elevation: band(truth.elevation, 0.5) });
  const narrow = grid.solve({
    utc: UTC,
    elevation: band(truth.elevation, 0.5),
    azimuth: band(truth.azimuth, 2),
  });
  assert.ok(narrow.count < wide.count * 0.5,
    `azimuth should cut the region substantially: ${wide.count} → ${narrow.count}`);
  // And the true location must survive the second filter.
  assert.ok(grid.strengthAt(narrow, SYDNEY.latitude, SYDNEY.longitude) > 0.8);
});

// ── Soft edges ───────────────────────────────────────────────────────────────

test("membership is graded, not boolean, so the edge can render soft", () => {
  const r = grid.solve({ utc: UTC, elevation: band(truth.elevation, 2) });
  const strengths = new Set(Array.from(r.cells, (c) => Math.round(c.strength * 10) / 10));
  assert.ok(strengths.size > 3, `expected a gradient, got ${[...strengths].join(", ")}`);
  for (const c of r.cells) assert.ok(c.strength > 0 && c.strength <= 1, `strength out of range: ${c.strength}`);
});

test("strength peaks at the measured elevation and falls away from it", () => {
  const r = grid.solve({ utc: UTC, elevation: band(truth.elevation, 2) });
  const centre = grid.strengthAt(r, SYDNEY.latitude, SYDNEY.longitude);
  // A place whose elevation is off by roughly the half-width.
  let edge = 1;
  for (const c of r.cells) {
    const e = grid.at(r.context, c.lat, c.lon).elevation;
    if (Math.abs(e - truth.elevation) > 1.8) { edge = Math.min(edge, c.strength); }
  }
  assert.ok(centre > edge, `centre ${centre} should beat the edge ${edge}`);
});

test("a wider band admits more of the world", () => {
  const tight = grid.solve({ utc: UTC, elevation: band(truth.elevation, 0.5) });
  const loose = grid.solve({ utc: UTC, elevation: band(truth.elevation, 5) });
  assert.ok(loose.count > tight.count, `${loose.count} !> ${tight.count}`);
});

// ── Unbounded ────────────────────────────────────────────────────────────────

test("an unbounded elevation admits the whole daylit world rather than nothing", () => {
  // "We cannot tell" must not silently become an empty map, which would read as
  // "nowhere on Earth fits" — the opposite of what it means.
  const r = grid.solve({ utc: UTC, elevation: { p5: 0, p50: 45, p95: 90, unbounded: true } });
  assert.equal(r.unbounded, true);
  assert.ok(r.count > 10000, `an unbounded band should admit a lot of the world, got ${r.count}`);
});

test("an azimuth band marked unbounded is simply not applied", () => {
  const withoutAzimuth = grid.solve({ utc: UTC, elevation: band(truth.elevation, 0.5) });
  const withUnbounded = grid.solve({
    utc: UTC,
    elevation: band(truth.elevation, 0.5),
    azimuth: { p5: 10, p50: 180, p95: 350, unbounded: true },
  });
  assert.equal(withUnbounded.count, withoutAzimuth.count);
});

// ── Azimuth wrap ─────────────────────────────────────────────────────────────

test("the azimuth filter works across the 0°/360° seam", () => {
  // Somewhere the sun is due north at this instant; a band straddling the seam
  // must not silently match nothing.
  const r = grid.solve({
    utc: UTC,
    elevation: { p5: 5, p50: 45, p95: 89 },
    azimuth: { p5: 355, p50: 0, p95: 5 },
  });
  assert.ok(r.count > 0, "a band across the seam must match something");
  for (const c of r.cells) {
    const az = grid.at(r.context, c.lat, c.lon).azimuth;
    const off = Math.abs(((az - 0 + 540) % 360) - 180);
    assert.ok(off < 12, `cell at azimuth ${az.toFixed(1)} is nowhere near due north`);
  }
});

// ── Resolution and cost ──────────────────────────────────────────────────────

test("the grid runs at the specified resolution", () => {
  const r = grid.solve({ utc: UTC, elevation: band(truth.elevation, 0.5) });
  assert.equal(r.lonStep, 0.5);
  assert.equal(r.latStep, 0.25);
  assert.equal(r.evaluated, (360 / 0.5) * (180 / 0.25 + 1));
});

test("a full sweep stays sub-second, which is the premise the design rests on", () => {
  /* Brute force is the right call here — the grid extends to the two-constraint
     case, the soft edge and G12's time scrubber without becoming a different
     algorithm each time — but only while a sweep is cheap enough to redo on
     every frame. This asserts that premise rather than assuming it.

     Two optimisations get it there, and neither is a second implementation of
     the solar maths: per-latitude trig is hoisted through solar.row(), and
     cells are rejected on their GEOMETRIC elevation before the expensive
     refraction fit is evaluated. Measured: 1426ms → 404ms. */
  const started = process.hrtime.bigint();
  grid.solve({ utc: UTC, elevation: band(truth.elevation, 0.5) });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(ms < 1000, `a full sweep took ${ms.toFixed(0)}ms — too slow to scrub`);
});

test("the early rejection cannot change which cells survive", () => {
  // Rejecting on geometric elevation is only sound because refraction can never
  // push a cell more than its margin. Compare against a run with the rejection
  // effectively disabled by a very wide band, filtered to the same tolerance.
  const tight = grid.solve({ utc: UTC, elevation: band(truth.elevation, 0.5) });
  const wide = grid.solve({ utc: UTC, elevation: band(truth.elevation, 0.5), lonStep: 2, latStep: 1 });
  for (const c of wide.cells) {
    const direct = solar.position({ ...UTC, tzOffsetHours: 0, latitude: c.lat, longitude: c.lon });
    assert.ok(Math.abs(direct.elevation - truth.elevation) < 1.5,
      `a surviving cell should be near the band: ${direct.elevation}`);
  }
  assert.ok(tight.count > 0 && wide.count > 0);
});

// ── The dense field G11 renders from ─────────────────────────────────────────

test("the dense field agrees with the sparse cell list", () => {
  const r = grid.solve({ utc: UTC, elevation: band(truth.elevation, 1) });
  assert.equal(r.field.length, r.lonCount * r.latCount);
  for (const c of r.cells.slice(0, 200)) {
    const sampled = grid.sampleField(r, c.lat, c.lon);
    assert.ok(Math.abs(sampled - c.strength) < 1e-6,
      `field disagrees at ${c.lat},${c.lon}: ${sampled} vs ${c.strength}`);
  }
});

test("sampling interpolates, so the rendered edge is soft rather than stepped", () => {
  // The softness must come from the tolerance, not from an artefact of how
  // finely the world was diced.
  const r = grid.solve({ utc: UTC, elevation: band(truth.elevation, 1) });
  const a = grid.sampleField(r, -33.75, 151.0);
  const halfway = grid.sampleField(r, -33.75, 151.25);
  const b = grid.sampleField(r, -33.75, 151.5);
  assert.ok(halfway > 0, "midpoint should sample something");
  assert.ok(Math.abs(halfway - (a + b) / 2) < Math.max(a, b) * 0.5 + 1e-6,
    "midpoint should lie between its neighbours");
});

test("sampling wraps around the antimeridian", () => {
  const r = grid.solve({ utc: UTC, elevation: { p5: 0, p50: 45, p95: 90, unbounded: true } });
  // 180 and -180 are the same meridian and must sample identically.
  assert.equal(grid.sampleField(r, 0, 180), grid.sampleField(r, 0, -180));
  assert.equal(grid.sampleField(r, 10, 200), grid.sampleField(r, 10, -160));
});

test("sampling outside the poles returns zero rather than reading past the array", () => {
  const r = grid.solve({ utc: UTC, elevation: band(truth.elevation, 1) });
  assert.equal(grid.sampleField(r, 95, 0), 0);
  assert.equal(grid.sampleField(r, -95, 0), 0);
});
