// G13 — the three modes. Verify, Time, Locate: the same geometry, three
// different questions.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Gnomon } from "./_core.js";

const { modes, solar } = Gnomon;

const SYDNEY = { latitude: -33.8569, longitude: 151.2092 };
const CLAIM = { year: 2023, month: 12, day: 22, minutes: 15 * 60 + 20, tzOffsetHours: 11 };
const truth = solar.position({ ...CLAIM, ...SYDNEY });

const band = (centre, half) => ({ p5: centre - half, p50: centre, p95: centre + half });

// ── Verify ───────────────────────────────────────────────────────────────────

test("a matching claim is reported as consistent", () => {
  const r = modes.verify({
    place: SYDNEY, claim: CLAIM,
    measured: { elevation: band(truth.elevation, 1.5), azimuth: band(truth.azimuth, 3) },
  });
  assert.equal(r.verdict, "consistent");
  assert.match(r.sentence, /consistent/i);
});

test("a claim off by hours is reported as inconsistent", () => {
  const r = modes.verify({
    place: SYDNEY, claim: { ...CLAIM, minutes: 9 * 60 },
    measured: { elevation: band(truth.elevation, 1.5), azimuth: band(truth.azimuth, 3) },
  });
  assert.equal(r.verdict, "inconsistent");
});

test("the verdict sentence states the discrepancy AND the tolerance", () => {
  // A 47° discrepancy against ±3° is a finding; against ±50° it is nothing.
  // A sentence carrying only the discrepancy is not quotable.
  const r = modes.verify({
    place: SYDNEY, claim: { ...CLAIM, minutes: 9 * 60 },
    measured: { elevation: band(truth.elevation, 1.5), azimuth: band(truth.azimuth, 3) },
  });
  assert.match(r.sentence, /\d/, "must contain numbers");
  assert.ok(/±|–|to /.test(r.sentence), `sentence must carry a tolerance: "${r.sentence}"`);
});

test("cannot-tell is a third outcome, distinct from consistent and inconsistent", () => {
  const r = modes.verify({
    place: SYDNEY, claim: CLAIM,
    measured: {
      elevation: { p5: 0, p50: 45, p95: 90, unbounded: true },
      azimuth: { p5: 0, p50: 180, p95: 360, unbounded: true },
    },
  });
  assert.equal(r.verdict, "cannot-tell");
  assert.doesNotMatch(r.sentence, /\binconsistent\b/i,
    "an unmeasurable scene must not be reported as a contradiction");
});

test("an unbounded elevation still allows an azimuth verdict", () => {
  const r = modes.verify({
    place: SYDNEY, claim: { ...CLAIM, minutes: 9 * 60 },
    measured: {
      elevation: { p5: 0, p50: 45, p95: 90, unbounded: true },
      azimuth: band(truth.azimuth, 3),
    },
  });
  assert.equal(r.verdict, "inconsistent");
  assert.equal(r.elevation.usable, false);
  assert.equal(r.azimuth.usable, true);
});

test("the predicted values come from the solar engine, unchanged", () => {
  const r = modes.verify({
    place: SYDNEY, claim: CLAIM,
    measured: { elevation: band(truth.elevation, 1.5), azimuth: band(truth.azimuth, 3) },
  });
  assert.ok(Math.abs(r.predicted.elevation - truth.elevation) < 1e-9);
  assert.ok(Math.abs(r.predicted.azimuth - truth.azimuth) < 1e-9);
});

// ── Time ─────────────────────────────────────────────────────────────────────

test("the fitting window contains the true time", () => {
  const r = modes.timeWindows({
    place: SYDNEY, date: CLAIM,
    measured: { elevation: band(truth.elevation, 1.5), azimuth: band(truth.azimuth, 3) },
  });
  assert.ok(r.windows.length >= 1, "should find at least one window");
  const hit = r.windows.some((w) => w.startMinutes <= CLAIM.minutes && CLAIM.minutes <= w.endMinutes);
  assert.ok(hit, `15:20 should fall in a window: ${JSON.stringify(r.windows)}`);
});

test("elevation alone gives TWO windows, either side of noon", () => {
  /* This is the morning-or-afternoon ambiguity and it is a real property of the
     problem: the sun passes any given elevation twice a day. Silently
     collapsing to one would be exactly the false confidence the app exists to
     avoid. */
  const r = modes.timeWindows({
    place: SYDNEY, date: CLAIM,
    measured: { elevation: band(truth.elevation, 1.5), azimuth: null },
  });
  assert.equal(r.windows.length, 2, `expected two windows, got ${r.windows.length}`);
  const noon = solar.solarNoonMinutes({ ...CLAIM, ...SYDNEY });
  assert.ok(r.windows[0].peakMinutes < noon, "one window before noon");
  assert.ok(r.windows[1].peakMinutes > noon, "one after");
});

test("adding azimuth resolves the ambiguity to one window", () => {
  const r = modes.timeWindows({
    place: SYDNEY, date: CLAIM,
    measured: { elevation: band(truth.elevation, 1.5), azimuth: band(truth.azimuth, 3) },
  });
  assert.equal(r.windows.length, 1, "azimuth should pick a side of noon");
});

test("an impossible elevation yields no window rather than a nearest guess", () => {
  // The sun never reaches 89° at this latitude in December. Returning the
  // closest time would be answering a question that has no answer.
  const r = modes.timeWindows({
    place: SYDNEY, date: CLAIM,
    measured: { elevation: band(89.5, 0.2), azimuth: null },
  });
  assert.equal(r.windows.length, 0);
  assert.equal(r.impossible, true);
});

test("windows are reported in clock order with their peak", () => {
  const r = modes.timeWindows({
    place: SYDNEY, date: CLAIM,
    measured: { elevation: band(truth.elevation, 1.5), azimuth: null },
  });
  for (const w of r.windows) {
    assert.ok(w.startMinutes <= w.peakMinutes && w.peakMinutes <= w.endMinutes);
    assert.ok(w.peakStrength > 0 && w.peakStrength <= 1);
  }
  for (let i = 1; i < r.windows.length; i++) {
    assert.ok(r.windows[i].startMinutes > r.windows[i - 1].endMinutes, "windows must not overlap");
  }
});

test("the day sweep runs at the stated resolution across a whole local day", () => {
  const r = modes.timeWindows({
    place: SYDNEY, date: CLAIM,
    measured: { elevation: band(truth.elevation, 1.5), azimuth: null },
    stepMinutes: 5,
  });
  assert.equal(r.stepMinutes, 5);
  assert.equal(r.samples.length, Math.floor(1440 / 5) + 1);
});
