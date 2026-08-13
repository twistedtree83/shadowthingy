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
