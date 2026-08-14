// G14 — the three places the geometry stops being trustworthy.
//
// These are product requirements, not polish. Each exists because of a specific
// identified failure mode, and a guard that fires must CHANGE what the user
// sees rather than adding a caption beside an unchanged confident number.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Gnomon } from "./_core.js";

const { guards, solar } = Gnomon;

const SYDNEY = { latitude: -33.8569, longitude: 151.2092 };
const ids = (r) => Array.from(r.fired, (g) => g.id).sort();

function evaluate(overrides) {
  return guards.evaluate(Object.assign({
    elevation: { p5: 40, p50: 42, p95: 44 },
    azimuth: { p5: 270, p50: 275, p95: 280 },
    residual: 0.2,
    residualNoiseFloor: 1.0,
    date: { year: 2023, month: 12, day: 22, tzOffsetHours: 11 },
    place: SYDNEY,
    meta: {},
    calibration: { tier: 1, sweep: 0.02 },
  }, overrides || {}));
}

test("a clean, high-sun, mid-season scene fires nothing", () => {
  assert.deepEqual(ids(evaluate()), []);
  assert.equal(evaluate().confident, true);
});

// ── Low sun ──────────────────────────────────────────────────────────────────

test("below 5° elevation the app refuses a confident answer", () => {
  const r = evaluate({ elevation: { p5: 2, p50: 3.5, p95: 5 } });
  assert.ok(ids(r).includes("low-sun"));
  assert.equal(r.confident, false, "a refusal must actually withhold confidence");
  const guard = r.fired.find((g) => g.id === "low-sun");
  assert.equal(guard.severity, "refuse");
  assert.match(guard.message, /refraction/i);
});

test("the refusal triggers on the band, not just the median", () => {
  // A band reaching down into the unreliable regime is unreliable, even if its
  // midpoint looks respectable.
  const r = evaluate({ elevation: { p5: 1, p50: 8, p95: 15 } });
  assert.ok(ids(r).includes("low-sun"), "a band reaching below 5° must fire");
});

test("a comfortably high sun does not fire it", () => {
  assert.equal(ids(evaluate({ elevation: { p5: 20, p50: 25, p95: 30 } })).includes("low-sun"), false);
});

test("a healthy median whose band merely dips below 5° warns instead of refusing", () => {
  /* The old form refused whenever p5 < 5° — which fired on every ordinary
     late-afternoon photograph carrying a wide-but-honest band (a weak focal
     prior alone was enough). The Monte Carlo now includes the penumbra
     physics, so the width itself is the honesty; the guard's job is to say
     the low side is soft, not to throw the answer away. */
  const r = evaluate({ elevation: { p5: 3, p50: 9, p95: 18 } });
  const guard = r.fired.find((g) => g.id === "low-sun");
  assert.ok(guard, "the dip must still be surfaced");
  assert.equal(guard.severity, "warn");
  assert.equal(r.confident, true, "a healthy median stays a finding");
});

test("a median inside the low-sun regime still refuses", () => {
  const r = evaluate({ elevation: { p5: 1, p50: 4, p95: 12 } });
  const guard = r.fired.find((g) => g.id === "low-sun");
  assert.equal(guard.severity, "refuse");
  assert.equal(r.confident, false);
});

// ── Equinox ──────────────────────────────────────────────────────────────────

test("near the equinoxes the latitude constraint is flagged as weakest", () => {
  const r = evaluate({ date: { year: 2023, month: 3, day: 20, tzOffsetHours: 0 } });
  assert.ok(ids(r).includes("near-equinox"));
  const guard = r.fired.find((g) => g.id === "near-equinox");
  assert.equal(guard.severity, "warn");
  assert.match(guard.message, /latitude/i);
  // A warning, not a refusal: the answer is still worth having, it is just wide
  // for a reason the user should understand rather than suspect.
  assert.equal(r.confident, true);
});

test("at the solstices it does not fire", () => {
  assert.equal(ids(evaluate({ date: { year: 2023, month: 12, day: 22, tzOffsetHours: 11 } })).includes("near-equinox"), false);
  assert.equal(ids(evaluate({ date: { year: 2023, month: 6, day: 21, tzOffsetHours: 0 } })).includes("near-equinox"), false);
});

test("the equinox test uses the computed declination, not the calendar date", () => {
  // Equinox dates drift by a day or so year to year; the declination does not.
  const r = evaluate({ date: { year: 2023, month: 9, day: 23, tzOffsetHours: 0 } });
  assert.ok(ids(r).includes("near-equinox"), "September equinox should fire too");
});

// ── Residual ─────────────────────────────────────────────────────────────────

test("the residual guard is relative to the marking-noise floor, not a constant", () => {
  /* G9 measured that the residual's scale depends entirely on marking precision
     and scene geometry: 3px of noise on a small pole produces ~5° of residual
     on a perfectly valid scene. A fixed threshold would fire on every real
     photograph, and users would learn to ignore it. */
  const quiet = evaluate({ residual: 2.0, residualNoiseFloor: 0.3 });
  const noisy = evaluate({ residual: 2.0, residualNoiseFloor: 6.0 });

  assert.ok(ids(quiet).includes("residual"), "2° against a 0.3° floor is a real signal");
  assert.equal(ids(noisy).includes("residual"), false, "2° against a 6° floor is nothing");
});

test("a large residual against a small floor is severe enough to withhold confidence", () => {
  const r = evaluate({ residual: 12, residualNoiseFloor: 0.3 });
  assert.ok(ids(r).includes("residual"));
  assert.equal(r.confident, false, "a badly broken assumption must withhold confidence");
});

test("a high noise floor is itself reported, because it means the check has no power", () => {
  // Telling the user the residual cannot detect anything here is more useful
  // than silently not firing.
  const r = evaluate({ residual: 4, residualNoiseFloor: 7 });
  assert.ok(ids(r).includes("weak-residual-check"));
  assert.match(r.fired.find((g) => g.id === "weak-residual-check").message, /larger|precise/i);
});

// ── The blind spot no projective check can catch ─────────────────────────────

test("the slope blind spot is always stated as an assumption, never as a detection", () => {
  /* From G4: objects perpendicular to a SLOPE rather than to gravity give a
     wrong elevation with a residual of exactly zero. Nothing in the geometry
     can catch it, so it must travel with every answer as a stated assumption. */
  const r = evaluate();
  assert.ok(r.assumptions.some((a) => /slope|gravity|vertical/i.test(a)),
    `assumptions should name the slope case: ${JSON.stringify(r.assumptions)}`);
});

test("assumptions are stated even when the scene is clean", () => {
  assert.ok(evaluate().assumptions.length >= 3);
});

// ── Composition ──────────────────────────────────────────────────────────────

test("guards compose — two firing at once produce both", () => {
  const r = evaluate({
    elevation: { p5: 1, p50: 3, p95: 4.5 },
    date: { year: 2023, month: 3, day: 20, tzOffsetHours: 0 },
  });
  const fired = ids(r);
  assert.ok(fired.includes("low-sun"), `got ${fired}`);
  assert.ok(fired.includes("near-equinox"), `got ${fired}`);
});

test("a crop is surfaced as a guard, since every tier rests on the principal point", () => {
  const r = evaluate({ meta: { cropped: true } });
  assert.ok(ids(r).includes("cropped"));
});

test("a fully unbounded measurement withholds confidence outright", () => {
  const r = evaluate({
    elevation: { p5: 0, p50: 45, p95: 90, unbounded: true },
    azimuth: { p5: 0, p50: 180, p95: 360, unbounded: true },
  });
  assert.equal(r.confident, false);
  assert.ok(ids(r).includes("unbounded"));
});

test("unbounded elevation with a bounded bearing degrades to azimuth-only, not a refusal", () => {
  /* The design source's 1l frame: "Shadow bearing does not depend on the
     vertical scale … Verify and Time can run on azimuth alone." A shadow cast
     toward the camera, or two small distant objects, kills the vertical scale
     while the bearing survives — and every mode already runs on azimuth alone,
     so refusing outright threw away a working measurement. */
  const r = evaluate({ elevation: { p5: 0, p50: 45, p95: 90, unbounded: true } });
  assert.equal(r.confident, true, "a bounded bearing is still a measurement");
  assert.ok(ids(r).includes("azimuth-only"));
  const guard = r.fired.find((g) => g.id === "azimuth-only");
  assert.equal(guard.severity, "warn");
  assert.match(guard.message, /azimuth|bearing/i);
  assert.match(guard.message, /third object|crosses the frame/i, "must tell the user how to recover elevation");
});

test("every fired guard carries a severity and a message a person can act on", () => {
  const r = evaluate({ elevation: { p5: 1, p50: 3, p95: 4.5 }, residual: 12, residualNoiseFloor: 0.3, meta: { cropped: true } });
  assert.ok(r.fired.length >= 3);
  for (const g of r.fired) {
    assert.ok(["refuse", "warn"].includes(g.severity), `bad severity: ${g.severity}`);
    assert.ok(g.title && g.title.length > 0);
    assert.ok(g.message && g.message.length > 30, `message too thin: ${g.message}`);
  }
});
