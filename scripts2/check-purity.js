// The core is pure: no DOM, no network, no storage, no clock reads, no ambient
// randomness. Time arrives as an argument; randomness arrives as a seeded
// generator passed in. That is what makes the Monte Carlo reproducible and the
// synthetic tests deterministic — and a report that cannot be reproduced is not
// evidence. A slice that needs to break this is a design error, not a licence.

import { readCoreOrNull } from "./extract-core.js";

const HTML = "gnomon.html";

const FORBIDDEN = [
  [/\bDate\.now\s*\(/, "Date.now() — time must arrive as an argument"],
  [/\bnew\s+Date\s*\(/, "new Date() — time must arrive as an argument"],
  [/\bMath\.random\s*\(/, "Math.random() — randomness must come from the seeded generator"],
  [/\bdocument\b/, "document — the core must not touch the DOM"],
  [/\bwindow\b/, "window — the core must not touch the DOM"],
  [/\blocalStorage\b/, "localStorage — no storage, anywhere"],
  [/\bsessionStorage\b/, "sessionStorage — no storage, anywhere"],
  [/\bindexedDB\b/i, "indexedDB — no storage, anywhere"],
  [/\bfetch\s*\(/, "fetch() — the core must not touch the network"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest — the core must not touch the network"],
  [/\bnavigator\b/, "navigator — the core must not read the environment"],
  [/\bconsole\.\w+\s*\(/, "console — the core must not log"],
];

let source;
try {
  source = readCoreOrNull(HTML);
} catch (err) {
  console.error(`purity gate: ${err.message}`);
  process.exit(1);
}

if (source === null) {
  console.log(`purity gate: no ${HTML} yet — nothing to check`);
  process.exit(0);
}

let failures = 0;
source.split("\n").forEach((line, i) => {
  if (line.trim().startsWith("//")) return;
  for (const [pattern, why] of FORBIDDEN) {
    if (pattern.test(line)) {
      console.error(`${HTML} (core):${i + 1}  ${why}`);
      console.error(`    ${line.trim()}`);
      failures++;
    }
  }
});

if (failures) {
  console.error(`\npurity gate: ${failures} violation(s) in the core block`);
  process.exit(1);
}
console.log("purity gate: clean");
