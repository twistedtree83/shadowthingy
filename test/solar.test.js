// G2 — NOAA solar position.
//
// Every invariant here is DERIVED, not remembered. Where a physical constant
// appears (the 23.44° obliquity) it is checked against the value the algorithm
// computes for itself, so a transcription error in the constants cannot be
// confirmed by an expectation carrying the same error.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Gnomon } from "./_core.js";

const { solar } = Gnomon;
const near = (a, b, tol, what = "") => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} !≈ ${b} (±${tol})`);

const SYDNEY = { latitude: -33.87, longitude: 151.21, tzOffsetHours: 10 };
const LONDON = { latitude: 51.5, longitude: -0.13, tzOffsetHours: 0 };
const NAIROBI = { latitude: -1.29, longitude: 36.82, tzOffsetHours: 3 };

const JUNE_SOLSTICE = { year: 2023, month: 6, day: 21 };
const DEC_SOLSTICE = { year: 2023, month: 12, day: 22 };
const MAR_EQUINOX = { year: 2023, month: 3, day: 20 };
const SEP_EQUINOX = { year: 2023, month: 9, day: 23 };

// Solar noon is where TST = 720 minutes, which is what the invariants below
// need in order to be about the sun rather than about the clock.
function noonAt(date, place) {
  return solar.solarNoonMinutes({ ...date, ...place });
}
function atNoon(date, place) {
  return solar.position({ ...date, ...place, minutes: noonAt(date, place) });
}

test("Julian Day matches the published epoch anchors", () => {
  // J2000.0 is 2000-01-01 12:00 UT = JD 2451545.0 exactly, by definition.
  near(solar.julianDay(2000, 1, 1) + 0.5, 2451545.0, 1e-9, "J2000");
  // 1858-11-17 00:00 UT is the Modified Julian Date epoch, JD 2400000.5.
  near(solar.julianDay(1858, 11, 17), 2400000.5, 1e-9, "MJD epoch");
});

// ── Invariant 1 ──────────────────────────────────────────────────────────────
test("declination reaches the obliquity at the solstices and zero at the equinoxes", () => {
  const june = solar.position({ ...JUNE_SOLSTICE, ...LONDON, minutes: 720 });
  const dec = solar.position({ ...DEC_SOLSTICE, ...LONDON, minutes: 720 });
  const mar = solar.position({ ...MAR_EQUINOX, ...LONDON, minutes: 720 });
  const sep = solar.position({ ...SEP_EQUINOX, ...LONDON, minutes: 720 });

  // Derived: the solstice declination IS the obliquity the algorithm computed.
  near(june.declination, june.obliquity, 0.02, "June δ vs ε");
  near(dec.declination, -dec.obliquity, 0.02, "December δ vs −ε");

  // And that obliquity should be the real one, which is a fact about the Earth.
  near(june.obliquity, 23.44, 0.02, "obliquity");

  near(mar.declination, 0, 0.5, "March equinox δ");
  near(sep.declination, 0, 0.5, "September equinox δ");
});

// ── Invariant 2 ──────────────────────────────────────────────────────────────
test("the equation of time stays in range and crosses zero four times a year", () => {
  const samples = [];
  for (let day = 0; day < 365; day++) {
    const d = solar.dateFromDayOfYear(2023, day);
    samples.push(solar.position({ ...d, ...LONDON, minutes: 720 }).equationOfTime);
  }

  const low = Math.min(...samples);
  const high = Math.max(...samples);
  assert.ok(low > -14.5 && low < -13.0, `minimum EoT out of range: ${low}`);
  assert.ok(high > 15.5 && high < 16.5, `maximum EoT out of range: ${high}`);

  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if (Math.sign(samples[i]) !== Math.sign(samples[i - 1])) crossings++;
  }
  assert.equal(crossings, 4, `expected four zero crossings, got ${crossings}`);
});

// ── Invariant 3 ──────────────────────────────────────────────────────────────
test("solar noon elevation equals 90° − |φ − δ| across latitudes and dates", () => {
  const places = [SYDNEY, LONDON, NAIROBI, { latitude: 71.0, longitude: 25.8, tzOffsetHours: 1 }];
  const dates = [JUNE_SOLSTICE, DEC_SOLSTICE, MAR_EQUINOX, SEP_EQUINOX];

  for (const place of places) {
    for (const date of dates) {
      const p = atNoon(date, place);
      // Derived from the geometry, using the declination this run computed.
      const expected = 90 - Math.abs(place.latitude - p.declination);
      // Geometric, not apparent: refraction is a separate correction and
      // folding it in here would hide an error in either.
      near(p.elevationTrue, expected, 0.1, `φ=${place.latitude} ${date.month}/${date.day}`);
    }
  }
});

test("the two figures the spec calls out for Sydney come out right", () => {
  near(atNoon(DEC_SOLSTICE, SYDNEY).elevationTrue, 79.6, 0.15, "Sydney December noon");
  near(atNoon(JUNE_SOLSTICE, SYDNEY).elevationTrue, 32.7, 0.15, "Sydney June noon");
});

// ── Invariant 4 — the one that catches hemisphere sign errors ────────────────
test("at solar noon the sun is south in the north and north in the south", () => {
  for (const date of [JUNE_SOLSTICE, DEC_SOLSTICE, MAR_EQUINOX, SEP_EQUINOX]) {
    const london = atNoon(date, LONDON).azimuth;
    near(london, 180, 1.0, `London noon azimuth ${date.month}/${date.day}`);
  }

  // Sydney's sun is north of overhead all year — this is the assertion that
  // northern-only testing cannot make, and a sign error would sail past it.
  for (const date of [JUNE_SOLSTICE, DEC_SOLSTICE, MAR_EQUINOX, SEP_EQUINOX]) {
    const az = atNoon(date, SYDNEY).azimuth;
    const fromNorth = Math.min(az, 360 - az);
    assert.ok(fromNorth < 1.0, `Sydney noon azimuth should be ~0/360, got ${az} on ${date.month}/${date.day}`);
  }
});

test("near the equator the noon sun swaps sides with the season", () => {
  // Nairobi sits at 1.29° S, so the side the sun appears on is decided by
  // whether the declination is north or south of THAT latitude — not of the
  // equator. In June δ = +23.4° is north of it, in December δ = −23.4° is south
  // of it, so the noon sun swaps sides between the two.
  //
  // Nothing else in the suite crosses over like this: London and Sydney each
  // stay on one side all year, so a sign error that only shows up when |δ| > |φ|
  // would survive both of them.
  const june = atNoon(JUNE_SOLSTICE, NAIROBI);
  const dec = atNoon(DEC_SOLSTICE, NAIROBI);

  assert.ok(june.declination > NAIROBI.latitude, "June δ should be north of Nairobi");
  assert.ok(Math.min(june.azimuth, 360 - june.azimuth) < 1.0, `June noon should be ~0/360, got ${june.azimuth}`);

  assert.ok(dec.declination < NAIROBI.latitude, "December δ should be south of Nairobi");
  near(dec.azimuth, 180, 1.0, "December noon azimuth");

  // Both are near-overhead, and the December sun is the higher of the two
  // because 1.29° puts Nairobi marginally closer to the southern declination.
  near(june.elevationTrue, 90 - Math.abs(NAIROBI.latitude - june.declination), 0.1, "June noon elevation");
  near(dec.elevationTrue, 90 - Math.abs(NAIROBI.latitude - dec.declination), 0.1, "December noon elevation");
  assert.ok(dec.elevationTrue > june.elevationTrue);
});

// ── Invariant 5 ──────────────────────────────────────────────────────────────
test("elevation is symmetric about solar noon", () => {
  for (const place of [SYDNEY, LONDON]) {
    for (const date of [JUNE_SOLSTICE, DEC_SOLSTICE, MAR_EQUINOX]) {
      const noon = noonAt(date, place);
      for (const offset of [20, 60, 120, 180]) {
        const before = solar.position({ ...date, ...place, minutes: noon - offset }).elevationTrue;
        const after = solar.position({ ...date, ...place, minutes: noon + offset }).elevationTrue;
        // Declination drifts slightly across the day, so the symmetry is not
        // exact — but it is tight, and a sign error in the hour angle is not.
        near(before, after, 0.12, `±${offset}min at φ=${place.latitude}`);
      }
    }
  }
});

// ── Invariant 6 ──────────────────────────────────────────────────────────────
test("sunrise and sunset bracket a day length that varies correctly with season", () => {
  const sydJune = solar.sunTimes({ ...JUNE_SOLSTICE, ...SYDNEY });
  const sydDec = solar.sunTimes({ ...DEC_SOLSTICE, ...SYDNEY });
  const lonJune = solar.sunTimes({ ...JUNE_SOLSTICE, ...LONDON });
  const lonDec = solar.sunTimes({ ...DEC_SOLSTICE, ...LONDON });

  // Sunrise before sunset, everywhere, always.
  for (const t of [sydJune, sydDec, lonJune, lonDec]) {
    assert.ok(t.sunriseMinutes < t.sunsetMinutes, "sunrise must precede sunset");
    near(t.dayLengthMinutes, t.sunsetMinutes - t.sunriseMinutes, 1e-6, "day length is the bracket");
  }

  // The seasons run opposite ways in the two hemispheres. This is invariant 4's
  // sign error showing up a second way, through a completely different formula.
  assert.ok(sydDec.dayLengthMinutes > sydJune.dayLengthMinutes, "Sydney: December is the long day");
  assert.ok(lonJune.dayLengthMinutes > lonDec.dayLengthMinutes, "London: June is the long day");

  // Longer days further from the equator in that hemisphere's summer.
  assert.ok(lonJune.dayLengthMinutes > sydDec.dayLengthMinutes, "London midsummer beats Sydney midsummer");

  // At the equinox everyone gets about twelve hours — slightly over, because
  // sunrise is defined at the disc's upper limb with refraction applied.
  for (const place of [SYDNEY, LONDON, NAIROBI]) {
    const t = solar.sunTimes({ ...MAR_EQUINOX, ...place });
    near(t.dayLengthMinutes, 720, 15, `equinox day length at φ=${place.latitude}`);
  }
});

test("polar day and polar night are reported, not silently wrapped", () => {
  const NORTH_CAPE = { latitude: 78.2, longitude: 15.6, tzOffsetHours: 1 };
  assert.equal(solar.sunTimes({ ...JUNE_SOLSTICE, ...NORTH_CAPE }).polar, "day");
  assert.equal(solar.sunTimes({ ...DEC_SOLSTICE, ...NORTH_CAPE }).polar, "night");
  assert.equal(solar.sunTimes({ ...MAR_EQUINOX, ...NORTH_CAPE }).polar, null);
});

// ── Refraction ───────────────────────────────────────────────────────────────
test("refraction lifts the low sun most and the high sun barely at all", () => {
  // Long shadows mean low sun, which is where most of the interesting cases
  // live — so this correction is load-bearing rather than a refinement.
  const horizon = solar.refraction(0);
  const low = solar.refraction(5);
  const high = solar.refraction(45);

  near(horizon, 0.48, 0.06, "refraction at the horizon");
  assert.ok(low < horizon, "refraction falls as the sun rises");
  assert.ok(high < low);
  assert.ok(high < 0.02, `refraction at 45° should be tiny, got ${high}`);
  assert.equal(solar.refraction(88), 0, "no correction near the zenith");
});

test("apparent elevation is the geometric elevation plus refraction", () => {
  const p = solar.position({ ...MAR_EQUINOX, ...LONDON, minutes: 400 });
  near(p.elevation, p.elevationTrue + solar.refraction(p.elevationTrue), 1e-9);
});

// ── The shadow multiplier ────────────────────────────────────────────────────
test("the shadow multiplier is 1/tan(elevation) and refuses to be finite at or below the horizon", () => {
  const p = solar.position({ ...DEC_SOLSTICE, ...SYDNEY, minutes: noonAt(DEC_SOLSTICE, SYDNEY) });
  near(p.shadowMultiplier, 1 / Math.tan((p.elevation * Math.PI) / 180), 1e-9);

  // A sun at or below the horizon casts no measurable shadow. Reporting a huge
  // finite multiplier there would be exactly the false precision this app exists
  // to avoid.
  const night = solar.position({ ...DEC_SOLSTICE, ...SYDNEY, minutes: 0 });
  assert.ok(night.elevation < 0, "midnight sun check: should be below the horizon");
  assert.equal(night.shadowMultiplier, Infinity);
});

// ── Purity ───────────────────────────────────────────────────────────────────
test("the same instant always gives the same answer", () => {
  const args = { ...JUNE_SOLSTICE, ...SYDNEY, minutes: 543 };
  assert.deepEqual(
    Object.entries(solar.position(args)).map(([k, v]) => `${k}=${v}`).sort(),
    Object.entries(solar.position(args)).map(([k, v]) => `${k}=${v}`).sort(),
  );
});
