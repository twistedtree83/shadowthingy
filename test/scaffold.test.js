// G1 — the shape everything else is built on. These assertions are about the
// file's structure rather than any computation: the core must be extractable,
// evaluable without a DOM, and must publish the two registries every later slice
// hangs its work on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Gnomon } from "./_core.js";

const html = readFileSync("gnomon.html", "utf8");

test("the core evaluates in a context with no DOM and no clock", () => {
  assert.ok(Gnomon, "core published Gnomon");
});

test("the core publishes a debug registry", () => {
  assert.equal(typeof Gnomon.debug.set, "function");
  assert.equal(typeof Gnomon.debug.snapshot, "function");
});

test("the debug registry round-trips values by section", () => {
  const d = Gnomon.debug.fresh();
  d.set("geom", "v_z", [1, 2, 3]);
  d.set("geom", "condition", 4.5);
  d.set("calib", "tier", 4);

  const snap = d.snapshot();
  assert.deepEqual(snap.geom.v_z, [1, 2, 3]);
  assert.equal(snap.geom.condition, 4.5);
  assert.equal(snap.calib.tier, 4);
});

test("the core publishes a test registry the panel and this suite share", () => {
  assert.equal(typeof Gnomon.tests.suite, "function");
  assert.equal(typeof Gnomon.tests.run, "function");
  assert.ok(Array.isArray(Gnomon.tests.run()));
});

test("a failing assertion is reported as failing, not thrown away", () => {
  const reg = Gnomon.tests.fresh();
  reg.suite("demo", (t) => {
    t.ok("true is true", true);
    t.ok("false is false", false);
    t.close("near", 1.0, 1.05, 0.1);
    t.close("far", 1.0, 2.0, 0.1);
  });

  const [suite] = reg.run();
  assert.equal(suite.name, "demo");
  // Array.from rather than .map: the core runs in a separate vm realm, so
  // .map would return an array with that realm's prototype and strict
  // deepEqual compares prototypes by reference.
  assert.deepEqual(Array.from(suite.checks, (c) => c.pass), [true, false, true, false]);
});

test("a throwing suite is reported as a failure rather than crashing the run", () => {
  const reg = Gnomon.tests.fresh();
  reg.suite("boom", () => {
    throw new Error("kaboom");
  });

  const [suite] = reg.run();
  assert.equal(suite.checks.length, 1);
  assert.equal(suite.checks[0].pass, false);
  assert.match(suite.checks[0].detail, /kaboom/);
});

// This is the mechanism that stops the visible panel drifting from the suite.
// Every assertion registered on the shared registry runs in the browser panel;
// this asserts the same set is green headlessly, so a slice cannot ship a
// panel that shows FAIL to a user while CI stays green.
test("every suite registered for the in-page panel is green", () => {
  const results = Gnomon.tests.run();
  assert.ok(results.length > 0, "no suites registered");

  const failures = [];
  for (const suite of results) {
    for (const check of suite.checks) {
      if (!check.pass) failures.push(`${suite.name}: ${check.label} (${check.detail})`);
    }
  }
  assert.deepEqual(failures, [], `in-page assertions failing:\n${failures.join("\n")}`);
});

// The three regions and the debug panel are the contract G16 must not break
// when it replaces the styling with the imported design system.
test("the page has the three regions and a debug panel", () => {
  for (const id of ["region-canvas", "region-readout", "region-result", "debug-panel"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test("no build step: nothing is imported from a bundler or framework", () => {
  assert.doesNotMatch(html, /\bfrom\s+["']https?:\/\/[^"']*\/(react|vue|svelte)/i);
  assert.doesNotMatch(html, /<link[^>]+stylesheet[^>]+href="https?:/i);
});
