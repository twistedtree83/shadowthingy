// G4 — the synthetic round trip. The only test with access to ground truth, and
// therefore the only way to know the geometry is correct rather than plausible.
//
// The first few assertions are projections computed by hand, so an error in the
// camera model cannot hide behind an error in the expectation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Gnomon } from "./_core.js";

const { synth, geom } = Gnomon;
const near = (a, b, tol, what = "") => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} !≈ ${b} (±${tol})`);

function sameDirection(actual, expected, tol = 1e-6, what = "") {
  const u = geom.unit(Array.from(actual));
  const e = geom.unit(Array.from(expected));
  const d = Math.abs(u[0] * e[0] + u[1] * e[1] + u[2] * e[2]);
  assert.ok(Math.abs(d - 1) <= tol, `${what}: [${u}] not parallel to [${e}]`);
}

// A level camera 20 m south of the origin, looking due north. Sun due north at
// 45°, so cot(45°) = 1 and a 2 m pole casts a 2 m shadow pointing due south.
const LEVEL = {
  camera: {
    position: [0, -20, 1.6], yaw: 0, pitch: 0, roll: 0,
    focal: 1000, principal: [960, 540], imageSize: [1920, 1080],
  },
  sun: { elevation: 45, azimuth: 0 },
  poles: [{ base: [0, 0], height: 2 }],
};

test("the sun vector points where the azimuth and elevation say", () => {
  // Due north at 45°: no east component, equal north and up components.
  const s = synth.sunVector({ elevation: 45, azimuth: 0 });
  near(s[0], 0, 1e-12, "east");
  near(s[1], Math.SQRT1_2, 1e-12, "north");
  near(s[2], Math.SQRT1_2, 1e-12, "up");

  // Due east at 30°: north component vanishes, up is sin 30° = 0.5.
  const e = synth.sunVector({ elevation: 30, azimuth: 90 });
  near(e[0], Math.cos(Math.PI / 6), 1e-12, "east");
  near(e[1], 0, 1e-12, "north");
  near(e[2], 0.5, 1e-12, "up");
});

test("a 2 m pole at 45° sun casts a 2 m shadow directly away from the sun", () => {
  const scene = synth.scene(LEVEL);
  const [pole] = scene.world;
  // Sun is due north, so the shadow runs due south: y decreases by exactly h.
  near(pole.tip[0], 0, 1e-12, "tip east");
  near(pole.tip[1], -2, 1e-12, "tip north");
  near(pole.tip[2], 0, 1e-12, "tip up");
});

test("projection matches hand-computed image coordinates", () => {
  const scene = synth.scene(LEVEL);
  const [obj] = scene.objects;
  // base (0,0,0):  cam-relative (0, 1.6, 20)  → v = 1000·1.6/20 + 540 = 620
  near(obj.base[0], 960, 1e-9, "base u");
  near(obj.base[1], 620, 1e-9, "base v");
  // top (0,0,2):   cam-relative (0, -0.4, 20) → v = 1000·−0.4/20 + 540 = 520
  near(obj.top[0], 960, 1e-9, "top u");
  near(obj.top[1], 520, 1e-9, "top v");
  // tip (0,−2,0):  cam-relative (0, 1.6, 18)  → v = 1000·1.6/18 + 540 = 628.888…
  near(obj.tip[0], 960, 1e-9, "tip u");
  near(obj.tip[1], 540 + 1600 / 18, 1e-9, "tip v");
});

test("a level camera sends verticals to a vanishing point at infinity", () => {
  const scene = synth.scene(LEVEL);
  // Verticals are parallel to the image plane, so they stay parallel on it.
  assert.equal(geom.atInfinity(scene.truth.vanishing.z), true);
  sameDirection(scene.truth.vanishing.z, [0, 1, 0], 1e-9, "v_z");
});

test("the shadow multiplier is 1/tan(elevation)", () => {
  for (const elevation of [15, 30, 45, 60, 75]) {
    const scene = synth.scene({ ...LEVEL, sun: { elevation, azimuth: 0 } });
    const [pole] = scene.world;
    const length = Math.hypot(pole.tip[0] - pole.base[0], pole.tip[1] - pole.base[1]);
    near(length / 2, 1 / Math.tan((elevation * Math.PI) / 180), 1e-9, `cot ${elevation}°`);
  }
});

// ── The round trip ────────────────────────────────────────────────────────────
// Several orientations, deliberately including tilted and rolled: an
// implementation can be wrong in a way that is invisible from a level camera
// and badly wrong from a tipped one.

const ORIENTATIONS = [
  { name: "level, facing north", yaw: 0, pitch: 0, roll: 0 },
  { name: "yawed 37°", yaw: 37, pitch: 0, roll: 0 },
  { name: "tilted down 18°", yaw: 12, pitch: -18, roll: 0 },
  { name: "tilted up 9°", yaw: -25, pitch: 9, roll: 0 },
  { name: "rolled 14°", yaw: 20, pitch: -8, roll: 14 },
  { name: "tilted and rolled hard", yaw: -63, pitch: -22, roll: -19 },
];

const FIELD = {
  sun: { elevation: 38, azimuth: 295 },
  poles: [
    { base: [-4, 6], height: 2.1 },
    { base: [3, 11], height: 1.4 },
    { base: [7, 4], height: 3.0 },
    { base: [-2, 15], height: 2.6 },
  ],
};

// Roughly the centre of that pole field, at ground level.
const FIELD_CENTRE = [1, 9, 0];

// Stand the camera back from the field along its own bearing, at eye height.
//
// A camera pinned at one fixed position cannot see the field from every
// orientation — at yaw −63° the shadows fall behind it — so the setback has to
// follow the yaw. But the setback must be *horizontal* and the height fixed
// independently: backing off along the full view direction puts the camera at
// z = 0 whenever pitch is 0, and a camera sitting exactly in the ground plane
// projects the entire ground to a single horizon line. Both are fixture
// properties, not geometry bugs.
const EYE_HEIGHT = 1.7;

function cameraLookingAtField(o, distance = 22) {
  const bearing = (o.yaw * Math.PI) / 180;
  return {
    position: [
      FIELD_CENTRE[0] - distance * Math.sin(bearing),
      FIELD_CENTRE[1] - distance * Math.cos(bearing),
      EYE_HEIGHT,
    ],
    yaw: o.yaw, pitch: o.pitch, roll: o.roll,
    focal: 1450, principal: [960, 540], imageSize: [1920, 1080],
  };
}

for (const o of ORIENTATIONS) {
  test(`round trip recovers all three vanishing points — ${o.name}`, () => {
    const scene = synth.scene({ camera: cameraLookingAtField(o), ...FIELD });

    const families = synth.families(scene.objects);
    const recovered = {
      z: geom.vanishingPoint(families.vertical),
      shadow: geom.vanishingPoint(families.shadow),
      sun: geom.vanishingPoint(families.ray),
    };

    sameDirection(recovered.z.v, scene.truth.vanishing.z, 1e-6, "v_z");
    sameDirection(recovered.shadow.v, scene.truth.vanishing.shadow, 1e-6, "v_shadow");
    sameDirection(recovered.sun.v, scene.truth.vanishing.sun, 1e-6, "v_sun");

    // A clean synthetic scene must be exactly conditioned — the lines really do
    // concur. Anything else means the projection or the solver is drifting.
    for (const key of ["z", "shadow", "sun"]) {
      near(recovered[key].conditionNumber, 0, 1e-7, `${key} conditioning`);
      assert.equal(recovered[key].wellConditioned, true, `${key} should be well conditioned`);
    }
  });
}

test("every projected point lands inside the frame for these scenes", () => {
  // Not a geometry assertion — a fixture assertion. A test scene whose points
  // fall outside the image would not be markable, so the round trip would be
  // proving something about a photograph nobody could take.
  for (const o of ORIENTATIONS) {
    const scene = synth.scene({ camera: cameraLookingAtField(o), ...FIELD });
    for (const obj of scene.objects) {
      for (const p of [obj.base, obj.top, obj.tip]) {
        assert.ok(p[0] >= -2000 && p[0] <= 3920, `${o.name}: u=${p[0]} wildly outside`);
        assert.ok(p[1] >= -2000 && p[1] <= 3080, `${o.name}: v=${p[1]} wildly outside`);
      }
    }
  }
});

test("a point behind the camera is refused, not projected to nonsense", () => {
  assert.throws(
    () =>
      synth.scene({
        camera: {
          position: [0, 40, 1.7], yaw: 0, pitch: 0, roll: 0,
          focal: 1450, principal: [960, 540], imageSize: [1920, 1080],
        },
        ...FIELD,
      }),
    /behind the camera/,
  );
});

test("the generator is deterministic — same spec, same pixels", () => {
  const a = synth.scene(LEVEL);
  const b = synth.scene(LEVEL);
  assert.deepEqual(
    Array.from(a.objects[0].tip, (n) => n.toFixed(9)),
    Array.from(b.objects[0].tip, (n) => n.toFixed(9)),
  );
});

// ── Corruption hooks, for G8 to lean on ──────────────────────────────────────

test("a leaning pole breaks the vertical family", () => {
  const clean = synth.scene({ ...FIELD, camera: LEVEL.camera });
  const bent = synth.scene({
    ...FIELD,
    camera: LEVEL.camera,
    poles: FIELD.poles.map((p, i) => (i === 1 ? { ...p, lean: { tilt: 8, bearing: 70 } } : p)),
  });

  const cleanZ = geom.vanishingPoint(synth.families(clean.objects).vertical);
  const bentZ = geom.vanishingPoint(synth.families(bent.objects).vertical);

  near(cleanZ.conditionNumber, 0, 1e-7, "clean verticals concur");
  assert.ok(bentZ.conditionNumber > cleanZ.conditionNumber, "leaning pole should degrade v_z");
});

test("differently-sloped ground under one pole breaks the shadow family", () => {
  const bumpy = synth.scene({
    ...FIELD,
    camera: LEVEL.camera,
    poles: FIELD.poles.map((p, i) => (i === 2 ? { ...p, groundNormal: [0.18, -0.1, 1] } : p)),
  });
  const shadow = geom.vanishingPoint(synth.families(bumpy.objects).shadow);
  assert.ok(shadow.conditionNumber > 1e-5, `expected degraded shadows, got ${shadow.conditionNumber}`);
});

test("an object lit from a different sun breaks the ray family", () => {
  const composite = synth.scene({
    ...FIELD,
    camera: LEVEL.camera,
    poles: FIELD.poles.map((p, i) =>
      i === 3 ? { ...p, sun: { elevation: 38, azimuth: 250 } } : p,
    ),
  });
  const ray = geom.vanishingPoint(synth.families(composite.objects).ray);
  assert.ok(ray.conditionNumber > 1e-5, `expected degraded rays, got ${ray.conditionNumber}`);
});

// This one documents a genuine limit of the residual rather than a capability.
// A uniformly tilted ground with gravity-vertical poles keeps all three
// families internally parallel, so nothing downstream can detect it — and it
// does not need to, because elevation comes from d_up and d_sun, both of which
// are still right. G8 asserts the residual stays near zero here.
test("a uniform ground tilt leaves every family internally consistent", () => {
  const sloped = synth.scene({ ...FIELD, camera: LEVEL.camera, groundNormal: [0.17, 0.09, 1] });
  const fam = synth.families(sloped.objects);
  for (const key of ["vertical", "shadow", "ray"]) {
    near(geom.vanishingPoint(fam[key]).conditionNumber, 0, 1e-7, `${key} on a uniform slope`);
  }
});
