// Emits a synthetic scene as JSON so a fixture image can be drawn from it.
//
// The geometry stays in the core — this script only reads Gnomon.synth and
// prints what it produced. Nothing here recomputes a projection, because a
// second implementation of the projection is exactly the thing that would make
// a fixture agree with a bug.
//
//   node scripts2/fixture-scene.js > samples/scene.json
//   python3 scripts2/make-fixture.py            # draws it, writes the JPEGs

import vm from "node:vm";
import { readCoreOrNull } from "./extract-core.js";

const context = vm.createContext({});
vm.runInContext(readCoreOrNull("gnomon.html"), context, { filename: "gnomon-core" });
const { synth, solar } = context.Gnomon;

/* The claimed provenance of the fixture photograph. The sun angles are DERIVED
   from the solar engine for exactly this instant rather than chosen by hand, so
   the image is internally consistent: a scene whose shadows really do match the
   time and place its EXIF claims. G13's Verify mode needs that to be true in
   order to have anything meaningful to agree with. */
const CLAIM = {
  year: 2023, month: 12, day: 22,
  minutes: 15 * 60 + 20,
  tzOffsetHours: 11,
  latitude: -33.8569,
  longitude: 151.2092,
};

const sun = solar.position(CLAIM);

const SPEC = {
  camera: {
    position: [-3, -16, 1.65],
    yaw: 11, pitch: -7, roll: 3,
    focal: 1350,
    principal: [900, 600],
    imageSize: [1800, 1200],
  },
  // Sydney, 22 December 2023, 15:20 AEDT — the sun is north-west, so shadows
  // run south-east. Taken from the engine, not invented.
  sun: { elevation: sun.elevation, azimuth: sun.azimuth },
  poles: [
    { base: [-5.0, 3.0], height: 1.80 },
    { base: [1.5, 7.5], height: 2.60 },
    { base: [6.0, 2.5], height: 1.20 },
    { base: [-1.0, 13.0], height: 3.10 },
    { base: [8.5, 9.0], height: 2.20 },
  ],
};

const scene = synth.scene(SPEC);

process.stdout.write(JSON.stringify({
  spec: SPEC,
  claim: CLAIM,
  imageSize: SPEC.camera.imageSize,
  objects: scene.objects,
  // The 35mm equivalent implied by the camera actually used, so the fixture's
  // EXIF agrees with its own geometry. Deriving it rather than writing a
  // plausible-looking 35mm is the difference between a clean fixture and one
  // that trips the disagreement detector for a reason that is not real.
  focal35mm: (SPEC.camera.focal / SPEC.camera.imageSize[0]) * 36,
  truth: {
    focal: scene.truth.focal,
    principal: scene.truth.principal,
    elevation: scene.truth.elevation,
    azimuth: scene.truth.azimuth,
    vanishing: scene.truth.vanishing,
    upDirection: scene.truth.upDirection,
    shadowDirection: scene.truth.shadowDirection,
    rayDirection: scene.truth.rayDirection,
  },
}, null, 2) + "\n");
