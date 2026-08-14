// G9 — uncertainty measured rather than derived.
//
// The assertions that matter most here are not about any particular number:
// they are that the band WIDENS as the calibration weakens, and that a family
// which cannot fix a direction produces "unbounded" rather than a large finite
// range. Those two are the honesty rule in executable form.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Gnomon } from "./_core.js";

const { montecarlo, synth, geom, calib } = Gnomon;
const near = (a, b, tol, what = "") => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} !≈ ${b} (±${tol})`);

const PRINCIPAL = [960, 540];

function scene(sunSpec, poles) {
  const yaw = 8, bearing = (yaw * Math.PI) / 180;
  return synth.scene({
    camera: {
      position: [1 - 20 * Math.sin(bearing), 9 - 20 * Math.cos(bearing), 6.5],
      yaw, pitch: -17, roll: 4,
      focal: 1450, principal: PRINCIPAL, imageSize: [1920, 1080],
    },
    sun: sunSpec || { elevation: 41, azimuth: 300 },
    poles: poles || [
      { base: [-4, 6], height: 2.1 },
      { base: [3, 11], height: 1.4 },
      { base: [7, 4], height: 3.0 },
      { base: [-2, 15], height: 2.6 },
    ],
  });
}

function northReference(s) {
  return {
    from: synth.project(s.camera, s.axes, [0, 0, 0]),
    to: synth.project(s.camera, s.axes, [0, 12, 0]),
    bearing: 0,
  };
}

function run(s, opts) {
  return montecarlo.run(Object.assign({
    objects: s.objects,
    reference: northReference(s),
    focalPx: s.truth.focal,
    sweep: 0.02,
    principalPoint: PRINCIPAL,
    sigma: 3,
    samples: 300,
    random: montecarlo.seededRandom(20231222),
  }, opts || {}));
}

// ── The generator ────────────────────────────────────────────────────────────

test("the seeded generator is deterministic and uniform enough to use", () => {
  const a = montecarlo.seededRandom(7);
  const b = montecarlo.seededRandom(7);
  for (let i = 0; i < 50; i++) assert.equal(a(), b(), `draw ${i}`);

  const r = montecarlo.seededRandom(99);
  let sum = 0, n = 20000, low = 0;
  for (let i = 0; i < n; i++) {
    const x = r();
    assert.ok(x >= 0 && x < 1, `out of range: ${x}`);
    sum += x;
    if (x < 0.5) low++;
  }
  near(sum / n, 0.5, 0.01, "mean");
  near(low / n, 0.5, 0.02, "median split");
});

test("gaussian draws have the requested spread", () => {
  const r = montecarlo.seededRandom(3);
  let sum = 0, sumsq = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) {
    const x = montecarlo.gaussian(r, 3);
    sum += x; sumsq += x * x;
  }
  near(sum / n, 0, 0.1, "gaussian mean");
  near(Math.sqrt(sumsq / n), 3, 0.1, "gaussian sigma");
});

// ── Reproducibility ──────────────────────────────────────────────────────────

test("a given set of marks and seed always produces the same band", () => {
  // A report that cannot be reproduced is not evidence.
  const s = scene();
  const a = run(s);
  const b = run(s);
  assert.deepEqual(
    [a.elevation.p5, a.elevation.p50, a.elevation.p95],
    [b.elevation.p5, b.elevation.p50, b.elevation.p95],
  );
});

test("a different seed gives a different but comparable band", () => {
  const s = scene();
  const a = run(s);
  const b = run(s, { random: montecarlo.seededRandom(1) });
  assert.notDeepEqual([a.elevation.p5], [b.elevation.p5]);
  near(a.elevation.p50, b.elevation.p50, 0.5, "medians should agree");
});

// ── The band brackets the truth ──────────────────────────────────────────────

test("the band contains the true elevation and azimuth", () => {
  const s = scene({ elevation: 41, azimuth: 300 });
  const r = run(s);
  assert.ok(r.elevation.p5 <= 41 && 41 <= r.elevation.p95,
    `41° outside [${r.elevation.p5}, ${r.elevation.p95}]`);
  assert.ok(r.azimuth.p5 <= 300 && 300 <= r.azimuth.p95,
    `300° outside [${r.azimuth.p5}, ${r.azimuth.p95}]`);
  near(r.elevation.p50, 41, 1.0, "median elevation");
});

test("percentiles come back ordered", () => {
  const r = run(scene());
  assert.ok(r.elevation.p5 < r.elevation.p50, "p5 < p50");
  assert.ok(r.elevation.p50 < r.elevation.p95, "p50 < p95");
});

// ── THE honesty assertion ────────────────────────────────────────────────────

test("the band widens as the calibration tier weakens", () => {
  /* This is the mechanism by which weak provenance becomes a visibly wide
     band. The marks are identical; only the sweep the tier earned differs.

     Elevation is nearly focal-invariant — d_up and d_sun are built with the
     same f, so scaling it rotates both alike — which makes adjacent-tier
     increments smaller than the sampling noise of a 300-draw percentile. The
     honest assertion is a non-narrowing trend within that noise plus visible
     end-to-end growth; the strong "stripped image ⇒ visibly wide band" claim
     rides on the principal point and is asserted further down. */
  const s = scene();
  const widths = [calib.SWEEPS[1], calib.SWEEPS[2], calib.SWEEPS[3], calib.SWEEPS[4], 0.167].map(function (sweep) {
    const r = run(s, { sweep, random: montecarlo.seededRandom(4242) });
    return r.elevation.p95 - r.elevation.p5;
  });

  for (let i = 1; i < widths.length; i++) {
    assert.ok(widths[i] > widths[i - 1] - 0.06,
      `sweep ${i} narrowed the band beyond sampling noise: ${widths.map((w) => w.toFixed(3)).join(" → ")}`);
  }
  assert.ok(widths[widths.length - 1] > widths[0] + 0.2,
    `the ladder must visibly widen end to end: ${widths.map((w) => w.toFixed(3)).join(" → ")}`);
});

test("more marking noise widens the band too", () => {
  const s = scene();
  const tight = run(s, { sigma: 1, random: montecarlo.seededRandom(11) });
  const loose = run(s, { sigma: 8, random: montecarlo.seededRandom(11) });
  assert.ok(
    (loose.elevation.p95 - loose.elevation.p5) > (tight.elevation.p95 - tight.elevation.p5),
    "8px of marking noise should give a wider band than 1px",
  );
});

// ── The penumbra ─────────────────────────────────────────────────────────────
// The sun is a disc, not a point: it smears every shadow tip along the shadow
// by ~L·α/(sin h · cos h). At midday this is a pixel; near the horizon it
// dominates, and it is the physical reason low-sun answers are soft.

function inputFor(s, opts) {
  return Object.assign({
    objects: s.objects,
    reference: northReference(s),
    focalPx: s.truth.focal,
    sweep: 0.02,
    principalPoint: PRINCIPAL,
    sigma: 3,
    samples: 300,
    random: montecarlo.seededRandom(20231222),
  }, opts || {});
}

test("penumbra smear grows as the sun drops", () => {
  const high = montecarlo.begin(inputFor(scene({ elevation: 41, azimuth: 300 })));
  const low = montecarlo.begin(inputFor(scene({ elevation: 15, azimuth: 300 })));
  assert.ok(high.penumbra && low.penumbra, "both scenes should carry a penumbra model");

  // Compare smear per pixel of shadow, so differing shadow lengths cannot
  // hide the elevation dependence.
  const rate = (job, i) => {
    const o = job.input.objects[i];
    return job.penumbra[i].sigma / Math.hypot(o.tip[0] - o.base[0], o.tip[1] - o.base[1]);
  };
  for (let i = 0; i < high.penumbra.length; i++) {
    assert.ok(rate(low, i) > rate(high, i) * 1.5,
      `object ${i}: low sun must smear faster per pixel (${rate(low, i).toFixed(4)} vs ${rate(high, i).toFixed(4)})`);
  }
});

test("the penumbra widens a low-sun band beyond click noise alone", () => {
  const s = scene({ elevation: 15, azimuth: 300 });
  const withPen = (() => {
    const j = montecarlo.begin(inputFor(s));
    montecarlo.step(j, 300);
    return montecarlo.finish(j);
  })();
  const withoutPen = (() => {
    const j = montecarlo.begin(inputFor(s));
    j.penumbra = null; // same stream consumption either way, so comparable
    montecarlo.step(j, 300);
    return montecarlo.finish(j);
  })();
  const width = (r) => r.elevation.p95 - r.elevation.p5;
  assert.ok(width(withPen) > width(withoutPen),
    `the physical smear must show in the band: ${width(withPen).toFixed(2)}° !> ${width(withoutPen).toFixed(2)}°`);
});

// ── Estimator selection ──────────────────────────────────────────────────────
// Both estimators are measured on identical draws; the finish reports the
// tighter instrument and keeps the other band for audit. With two objects the
// ray family's condition number is identically zero — two lines always meet —
// so measured width is the only honest arbiter.

test("the finish names its estimator and keeps the alternative band for audit", () => {
  const r = run(scene());
  assert.ok(["free", "constrained"].includes(r.estimator));
  assert.ok(r.alternative && r.alternative.elevation, "the unchosen band must travel with the result");
  assert.equal(r.base.estimator, r.estimator,
    "the point value and the band around it must come from the same instrument");
});

test("a caller can pin the estimator", () => {
  const free = run(scene(), { estimator: "free" });
  const constrained = run(scene(), { estimator: "constrained" });
  assert.equal(free.estimator, "free");
  assert.equal(constrained.estimator, "constrained");
  assert.ok(Number.isFinite(constrained.elevation.p50), "the pinned constrained band is a real band");
});

// ── Unbounded, not merely wide ───────────────────────────────────────────────

test("a poorly conditioned family reports unbounded rather than a large range", () => {
  // "We cannot tell" and "we can tell, roughly" are different claims, and the
  // whole app turns on never rendering one as the other.
  const s = scene();
  const r = run(s, {
    // Marks so mutually inconsistent that no family fixes a direction.
    objects: [
      { base: [100, 900], top: [120, 400], tip: [700, 880] },
      { base: [800, 850], top: [1100, 300], tip: [300, 700] },
      { base: [1500, 400], top: [900, 880], tip: [1700, 200] },
    ],
  });
  assert.equal(r.unbounded, true);
  assert.equal(r.elevation.unbounded, true);
});

test("an unbounded result still reports its median, so the reader sees what was found", () => {
  const s = scene();
  const r = run(s, {
    objects: [
      { base: [100, 900], top: [120, 400], tip: [700, 880] },
      { base: [800, 850], top: [1100, 300], tip: [300, 700] },
      { base: [1500, 400], top: [900, 880], tip: [1700, 200] },
    ],
  });
  assert.ok(Number.isFinite(r.elevation.p50) || r.elevation.p50 === null);
});

test("a clean scene is not unbounded", () => {
  assert.equal(run(scene()).unbounded, false);
});

// ── Azimuth wrap ─────────────────────────────────────────────────────────────

test("azimuth percentiles behave across the 0°/360° seam", () => {
  // A sun near due north straddles the wrap. Naive percentiles would put the
  // median at 180° — pointing exactly the wrong way — which is a spectacular
  // way to be confidently wrong.
  const s = scene({ elevation: 35, azimuth: 1 });
  const r = run(s, { sigma: 6 });
  const delta = Math.abs(((r.azimuth.p50 - 1 + 540) % 360) - 180);
  assert.ok(delta < 3, `median azimuth ${r.azimuth.p50} should be near 1°, off by ${delta.toFixed(2)}°`);
  // And the band must be narrow, not the ~360° a naive spread would report.
  assert.ok(r.azimuth.p95 - r.azimuth.p5 < 40,
    `band across the seam should stay narrow, got ${(r.azimuth.p95 - r.azimuth.p5).toFixed(1)}°`);
});

// ── Residual ─────────────────────────────────────────────────────────────────

/* The residual's absolute scale is a property of the marking noise and the
   scene, not a universal constant — so these assertions are about the SHAPE of
   its distribution, not about it being small.

   The unperturbed marks give a residual of ~0 for a valid scene. Perturbing
   them by 3px gives a median around 5° and a p95 near 15°, because the
   vanishing points sit far outside the frame and a 3px error on a 130px segment
   is over a degree of angular error that the determinant compounds three times.

   This is why G14 must not use a fixed threshold: 5° is unremarkable for hand
   marks on a small pole and alarming for careful marks on a tall one. */
test("the base residual is ~0 for a valid scene, whatever the noise does", () => {
  const r = run(scene());
  assert.ok(r.base.residual < 0.01, `unperturbed residual should vanish, got ${r.base.residual}`);
});

test("the residual band scales with marking noise, which is why no fixed threshold works", () => {
  const s = scene();
  const medians = [0.5, 1, 2, 3, 5].map(function (sigma) {
    return run(s, { sigma, random: montecarlo.seededRandom(20231222) }).residual.p50;
  });
  for (let i = 1; i < medians.length; i++) {
    assert.ok(medians[i] > medians[i - 1],
      `residual should grow with sigma: ${medians.map((m) => m.toFixed(2)).join(" → ")}`);
  }
  // Roughly linear in sigma: ten times the noise, roughly ten times the
  // residual. A threshold chosen for one marking precision is wrong for another.
  assert.ok(medians[4] / medians[0] > 5, "residual should scale strongly with noise");
});

test("the residual band is reported alongside the point value", () => {
  const r = run(scene());
  assert.ok(r.residual.p5 <= r.residual.p50 && r.residual.p50 <= r.residual.p95);
});

test("a corrupted scene shows a raised residual band", () => {
  const bent = scene(null, [
    { base: [-4, 6], height: 2.1 },
    { base: [3, 11], height: 1.4, lean: { tilt: 12, bearing: 70 } },
    { base: [7, 4], height: 3.0 },
    { base: [-2, 15], height: 2.6 },
  ]);
  /* The BASE residual is the signal; the Monte Carlo band is not.

     Measured on this scene: clean gives base 0.000 / band p50 5.33, and a 12°
     lean gives base 1.142 / band p50 5.02. The unperturbed residual separates
     them completely, while the sampled band is dominated by marking noise and
     is, if anything, slightly LOWER for the corrupted scene.

     G14's guard must therefore read the base residual, not the band. Using the
     band would produce a detector that fires on clean scenes and stays quiet on
     broken ones — precisely backwards. */
  const bad = run(bent);
  const good = run(scene());
  assert.ok(bad.base.residual > 1, `a 12° lean should show in the unperturbed residual, got ${bad.base.residual}`);
  assert.ok(good.base.residual < 0.01, "and a clean scene's should stay at zero");
  assert.ok(bad.base.residual > good.base.residual * 100 + 1, "the separation must be decisive");
});

// ── Chunked execution ────────────────────────────────────────────────────────

test("a chunked run gives exactly the same answer as a single-shot one", () => {
  // The UI drives this through requestIdleCallback, so chunking must not be
  // able to change the result.
  const s = scene();
  const oneShot = run(s, { random: montecarlo.seededRandom(555) });

  const job = montecarlo.begin({
    objects: s.objects, reference: northReference(s),
    focalPx: s.truth.focal, sweep: 0.02, principalPoint: PRINCIPAL,
    sigma: 3, samples: 300, random: montecarlo.seededRandom(555),
  });
  let guard = 0;
  while (!job.done) {
    montecarlo.step(job, 37);
    if (++guard > 1000) throw new Error("chunked run failed to finish");
  }
  const chunked = montecarlo.finish(job);

  assert.equal(chunked.elevation.p50, oneShot.elevation.p50);
  assert.equal(chunked.azimuth.p95, oneShot.azimuth.p95);
});

test("a job reports progress so the interface can show it", () => {
  const s = scene();
  const job = montecarlo.begin({
    objects: s.objects, reference: northReference(s),
    focalPx: s.truth.focal, sweep: 0.02, principalPoint: PRINCIPAL,
    samples: 100, random: montecarlo.seededRandom(1),
  });
  assert.equal(job.completed, 0);
  montecarlo.step(job, 40);
  assert.equal(job.completed, 40);
  assert.equal(job.done, false);
  montecarlo.step(job, 60);
  assert.equal(job.done, true);
});

// ── Azimuth-only ─────────────────────────────────────────────────────────────

test("azimuth-only mode still produces an azimuth band", () => {
  const s = scene();
  const r = run(s, { azimuthOnly: true });
  assert.equal(r.elevation, null, "elevation is dropped in azimuth-only mode");
  assert.ok(Number.isFinite(r.azimuth.p50));
  assert.ok(r.azimuth.p95 > r.azimuth.p5);
});

// ── Where the honesty rule actually lives ────────────────────────────────────

/* Measured while building G9: widening the focal sweep from ±2% to full range
   moves the elevation band by about 0.03°. Both d_up and d_sun are built with
   the same f, so scaling it rotates them alike and their mutual angle is nearly
   preserved. Elevation is genuinely robust to focal length.

   What a crop destroys is the PRINCIPAL POINT, and that translates every
   vanishing point relative to c, changing the angles directly. So the mechanism
   that makes a cropped image produce a visibly wide band is principal-point
   sampling, not the focal sweep — and these assert it. */
test("an unknown principal point widens the band far more than the focal sweep does", () => {
  const s = scene();
  const known = run(s, { sweep: 0.02, principalSigma: 0, random: montecarlo.seededRandom(909) });
  const focalOnly = run(s, { sweep: 0.167, principalSigma: 0, random: montecarlo.seededRandom(909) });
  const cropped = run(s, { sweep: 0.08, principalSigma: 0.15 * 1920, random: montecarlo.seededRandom(909) });

  const width = (r) => r.elevation.p95 - r.elevation.p5;
  // Compare the INCREMENTS each mechanism adds, which is the meaningful test:
  // measured here, an ±2%→full-range focal sweep adds about 0.4°, while an
  // unknown principal point adds about 7°.
  const bySweep = width(focalOnly) - width(known);
  const byCrop = width(cropped) - width(known);

  assert.ok(byCrop > width(known) * 0.6,
    `a crop must visibly widen the band: ${width(known).toFixed(2)}° → ${width(cropped).toFixed(2)}°`);
  assert.ok(byCrop > bySweep * 5,
    `the principal point must dominate the focal sweep: +${bySweep.toFixed(2)}° vs +${byCrop.toFixed(2)}°`);
});

test("a trustworthy principal point is not jittered at all", () => {
  const s = scene();
  const a = run(s, { principalSigma: 0, random: montecarlo.seededRandom(77) });
  const b = run(s, { random: montecarlo.seededRandom(77) });
  assert.equal(a.elevation.p50, b.elevation.p50, "omitting principalSigma must mean zero");
});
