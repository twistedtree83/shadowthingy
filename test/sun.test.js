// G8 — from vanishing points to a sun direction, and whether the scene was ever
// valid. The synthetic round trip is extended here to its full assertion:
// elevation and azimuth within 0.5° of ground truth.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Gnomon } from "./_core.js";

const { sun, geom, synth } = Gnomon;
const near = (a, b, tol, what = "") => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} !≈ ${b} (±${tol})`);

const PRINCIPAL = [960, 540];
const IMAGE = [1920, 1080];

const ORIENTATIONS = [
  { name: "tilted down 17°", yaw: 8, pitch: -17, roll: 4, height: 6.5 },
  { name: "tilted down 9°", yaw: -34, pitch: -9, roll: 0, height: 3.4 },
  { name: "rolled 15°", yaw: 62, pitch: -12, roll: 15, height: 4.6 },
  { name: "rolled the other way", yaw: -71, pitch: -21, roll: -13, height: 8.0 },
];

const SUNS = [
  { elevation: 41, azimuth: 300 },
  { elevation: 22, azimuth: 95 },
  { elevation: 63, azimuth: 190 },
  { elevation: 15, azimuth: 20 },
];

function build(o, sunSpec, poleOverrides, extra) {
  const bearing = (o.yaw * Math.PI) / 180;
  return synth.scene(Object.assign({
    camera: {
      position: [1 - 20 * Math.sin(bearing), 9 - 20 * Math.cos(bearing), o.height],
      yaw: o.yaw, pitch: o.pitch, roll: o.roll,
      focal: 1450, principal: PRINCIPAL, imageSize: IMAGE,
    },
    sun: sunSpec,
    poles: (poleOverrides || [
      { base: [-4, 6], height: 2.1 },
      { base: [3, 11], height: 1.4 },
      { base: [7, 4], height: 3.0 },
      { base: [-2, 15], height: 2.6 },
    ]),
  }, extra || {}));
}

function vpsOf(scene) {
  const f = synth.families(scene.objects);
  return {
    z: geom.vanishingPoint(f.vertical),
    shadow: geom.vanishingPoint(f.shadow),
    sun: geom.vanishingPoint(f.ray),
  };
}

// A reference direction with a known bearing, so azimuth can be reported
// against north: two ground points running due north.
function northReference(scene) {
  return {
    from: synth.project(scene.camera, scene.axes, [0, 0, 0]),
    to: synth.project(scene.camera, scene.axes, [0, 12, 0]),
    bearing: 0,
  };
}

function solveScene(scene, opts) {
  return sun.solve(Object.assign({
    vanishing: vpsOf(scene),
    focalPx: scene.truth.focal,
    principalPoint: PRINCIPAL,
    objects: scene.objects,
    reference: northReference(scene),
  }, opts || {}));
}

// ── Direction recovery ───────────────────────────────────────────────────────

test("a direction is recovered from a vanishing point through K", () => {
  const scene = build(ORIENTATIONS[0], SUNS[0]);
  const r = solveScene(scene);
  const a = scene.axes;
  // World up, expressed in the camera frame, is what d_up must equal — sign
  // included, because the sign is resolved from the marks rather than assumed.
  const expected = [a.right[2], a.down[2], a.forward[2]];
  for (let i = 0; i < 3; i++) near(r.dUp[i], expected[i], 1e-6, `dUp[${i}]`);
});

test("signs are resolved from the marks, not assumed", () => {
  const scene = build(ORIENTATIONS[0], SUNS[0]);
  const r = solveScene(scene);
  // Tops sit above their bases, so d_up must point from base toward top.
  // Getting this backwards flips the answer by 180°, which is why it is pinned
  // to something the user actually clicked.
  assert.ok(r.dUp[1] < 0, "in camera coordinates +y is down, so world up must have negative y");
  // The ray runs top → shadow tip, so it must have a downward component.
  assert.ok(r.dRay[1] > 0, "the ray from a top to its shadow tip runs downward in the image");
});

// ── The full round trip — G8's gate ──────────────────────────────────────────

for (const o of ORIENTATIONS) {
  for (const s of SUNS) {
    test(`recovers elevation and azimuth within 0.5° — ${o.name}, sun ${s.elevation}°/${s.azimuth}°`, () => {
      const scene = build(o, s);
      const r = solveScene(scene);
      near(r.elevation, s.elevation, 0.5, "elevation");
      const delta = Math.abs(((r.azimuth - s.azimuth + 540) % 360) - 180);
      assert.ok(delta <= 0.5, `azimuth: ${r.azimuth} vs ${s.azimuth} (off by ${delta.toFixed(3)}°)`);
    });
  }
}

test("the residual is ≈ 0 for every valid scene", () => {
  for (const o of ORIENTATIONS) {
    for (const s of SUNS) {
      near(solveScene(build(o, s)).residual, 0, 0.01, `${o.name} ${s.elevation}°`);
    }
  }
});

test("the shadow multiplier agrees with the recovered elevation", () => {
  const scene = build(ORIENTATIONS[0], SUNS[0]);
  const r = solveScene(scene);
  near(r.shadowMultiplier, 1 / Math.tan((r.elevation * Math.PI) / 180), 1e-9);
});

// ── The residual is independent of the calibration ───────────────────────────

test("the residual is computed from v_sun, which the calibration never touched", () => {
  // Tier 4 uses v_z and v_shadow. The residual brings in v_sun, so a scene can
  // satisfy the calibration and still fail the residual — which is exactly the
  // case worth catching, and why this is a real check rather than a restatement.
  const scene = build(ORIENTATIONS[0], SUNS[0]);
  const wrongFocal = solveScene(scene, { focalPx: scene.truth.focal * 1.35 });
  const rightFocal = solveScene(scene);

  // A wrong focal length moves the recovered angles...
  assert.ok(Math.abs(wrongFocal.elevation - rightFocal.elevation) > 1,
    "a 35% focal error should visibly move the elevation");
  // ...but the three directions stay coplanar, because coplanarity is a
  // property of the scene rather than of the camera model.
  near(wrongFocal.residual, 0, 0.01, "residual under a wrong focal length");
});

// ── Negative cases ───────────────────────────────────────────────────────────
// A validity check that has never been shown to detect invalidity is not yet a
// check. Each of these uses a corruption hook from G4.

test("a leaning object raises the residual", () => {
  const clean = solveScene(build(ORIENTATIONS[0], SUNS[0]));
  let previous = clean.residual;
  for (const tilt of [3, 6, 12]) {
    const bent = build(ORIENTATIONS[0], SUNS[0], [
      { base: [-4, 6], height: 2.1 },
      { base: [3, 11], height: 1.4, lean: { tilt, bearing: 70 } },
      { base: [7, 4], height: 3.0 },
      { base: [-2, 15], height: 2.6 },
    ]);
    const r = solveScene(bent);
    assert.ok(r.residual > previous,
      `lean ${tilt}° should raise the residual: ${r.residual} !> ${previous}`);
    previous = r.residual;
  }
  assert.ok(previous > 1, `a 12° lean should be plainly visible, got ${previous}°`);
});

test("differently-sloped ground under one object raises the residual", () => {
  const bumpy = build(ORIENTATIONS[0], SUNS[0], [
    { base: [-4, 6], height: 2.1 },
    { base: [3, 11], height: 1.4 },
    { base: [7, 4], height: 3.0, groundNormal: [0.22, -0.14, 1] },
    { base: [-2, 15], height: 2.6 },
  ]);
  assert.ok(solveScene(bumpy).residual > 0.5, "a sloped patch should show up");
});

test("an object composited in from a different sun raises the residual", () => {
  const composite = build(ORIENTATIONS[0], SUNS[0], [
    { base: [-4, 6], height: 2.1 },
    { base: [3, 11], height: 1.4 },
    { base: [7, 4], height: 3.0 },
    { base: [-2, 15], height: 2.6, sun: { elevation: 41, azimuth: 250 } },
  ]);
  assert.ok(solveScene(composite).residual > 1, "a differently-lit object should show up");
});

// This one documents a limit rather than a capability — see G4's note.
test("a UNIFORM ground tilt leaves the residual at zero, and the answer correct", () => {
  // The shadow direction is by construction a combination of up and sun, so the
  // determinant is identically zero however the ground is tilted. That is the
  // residual being right: elevation comes from d_up and d_sun, both of which
  // are still correct, so there is nothing to warn about.
  const sloped = build(ORIENTATIONS[0], SUNS[0], null, { groundNormal: [0.17, 0.09, 1] });
  const r = solveScene(sloped);
  near(r.residual, 0, 0.01, "residual on a uniform slope");
  near(r.elevation, SUNS[0].elevation, 0.5, "elevation on a uniform slope");
});

// ── Degraded inputs ──────────────────────────────────────────────────────────

test("azimuth is relative when no reference bearing is supplied", () => {
  const scene = build(ORIENTATIONS[0], SUNS[0]);
  const r = sun.solve({
    vanishing: vpsOf(scene),
    focalPx: scene.truth.focal,
    principalPoint: PRINCIPAL,
    objects: scene.objects,
  });
  assert.equal(r.azimuth, null, "no bearing means no absolute azimuth to report");
  assert.ok(Number.isFinite(r.elevation), "elevation needs no reference direction");
});

test("a poorly conditioned v_sun drops elevation and offers azimuth only", () => {
  const scene = build(ORIENTATIONS[0], SUNS[0]);
  const vps = vpsOf(scene);
  vps.sun = Object.assign({}, vps.sun, { wellConditioned: false, unbounded: true, conditionNumber: 0.4 });

  const r = sun.solve({
    vanishing: vps, focalPx: scene.truth.focal, principalPoint: PRINCIPAL,
    objects: scene.objects, reference: northReference(scene),
  });
  assert.equal(r.elevationUsable, false);
  assert.equal(r.azimuthOnly, true);
  // Azimuth survives: it comes from the shadow on the ground, not from the ray.
  assert.ok(Number.isFinite(r.azimuth));
});
