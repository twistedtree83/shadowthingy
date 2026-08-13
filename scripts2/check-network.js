// Nothing leaves the browser. The only permitted network activity is the
// page-load fetch of exifr, d3-geo, topojson-client and the Natural Earth 110m
// land TopoJSON — all before any image exists, all identical for every user, so
// none of it can reveal anything about the image.
//
// Tile servers are forbidden specifically. Tiles are requested per-viewport
// AFTER the analysis, so the sequence of requests IS the region of interest —
// frequently the most sensitive fact in the whole investigation. That is why the
// coastline file is bundled and why this gate exists.

import { existsSync, readFileSync } from "node:fs";

const HTML = "gnomon.html";

// Hosts the page may reference at all. Anything else is a violation.
export const ALLOWED_HOSTS = ["cdn.jsdelivr.net", "unpkg.com"];

export const TILE_SMELLS = [
  [/\{z\}|\{x\}|\{y\}|\{s\}/, "tile URL template — tiles reveal the region of interest"],
  [/tile\.openstreetmap|basemaps\.|api\.mapbox|tiles\.|\.tile\./i, "tile server reference"],
  [/leaflet|maplibre|mapbox-gl|openlayers/i, "tile-based map library"],
];

export const STORAGE_SMELLS = [
  [/\blocalStorage\b/, "localStorage — no storage, anywhere"],
  [/\bsessionStorage\b/, "sessionStorage — no storage, anywhere"],
  [/\bindexedDB\b/i, "indexedDB — no storage, anywhere"],
  [/document\.cookie/, "cookies — no storage, anywhere"],
];

// Product identifiers, not English words. An earlier version matched bare
// "analytics" and "plausible" and fired on a comment explaining the network
// policy — a gate that cries wolf on prose is one people learn to ignore, which
// is worse than not having one.
export const EXFIL_SMELLS = [
  [/\bnavigator\.sendBeacon\b/, "sendBeacon — nothing leaves the browser"],
  [/\bnew\s+WebSocket\b/, "WebSocket — nothing leaves the browser"],
  [/\bnew\s+EventSource\b/, "EventSource — nothing leaves the browser"],
  [/\bFormData\b[\s\S]{0,200}\bfetch\b/, "form upload — nothing leaves the browser"],
  [/\bgtag\s*\(|googletagmanager|google-analytics|plausible\.io|posthog|@sentry|sentry\.io|mixpanel|segment\.com/i,
   "analytics or error reporting"],
];

/* Comments are blanked before scanning — replaced with spaces rather than
   deleted, so the line numbers this gate reports still point at the real line.

   The gate is about what the page DOES, and commented-out code does not
   execute. Meanwhile prose about the network policy is exactly the kind of
   thing this project needs to be able to write without tripping over itself. */
export function stripComments(source) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

export function scan(html) {
  const lines = stripComments(html).split("\n");
  const violations = [];

  lines.forEach((line, i) => {
    for (const [pattern, why] of [...TILE_SMELLS, ...STORAGE_SMELLS, ...EXFIL_SMELLS]) {
      if (pattern.test(line)) violations.push({ line: i + 1, why, text: line.trim() });
    }
    // Any absolute URL must point at an allowed host.
    for (const match of line.matchAll(/https?:\/\/([^\/\s"'`)]+)/g)) {
      const host = match[1].toLowerCase();
      if (!ALLOWED_HOSTS.includes(host)) {
        violations.push({
          line: i + 1,
          why: `network reference to "${host}" — not on the allowed list`,
          text: line.trim(),
        });
      }
    }
  });

  return violations;
}

// Only run the gate when invoked as a script, so importing this file to test
// the stripping logic does not scan the app and call process.exit.
if (process.argv[1] && process.argv[1].endsWith("check-network.js")) {
  if (!existsSync(HTML)) {
    console.log(`network gate: no ${HTML} yet — nothing to check`);
  } else {
    const violations = scan(readFileSync(HTML, "utf8"));
    for (const v of violations) {
      console.error(`${HTML}:${v.line}  ${v.why}`);
      console.error(`    ${v.text.slice(0, 160)}`);
    }
    if (violations.length) {
      console.error(`\nnetwork gate: ${violations.length} violation(s) in ${HTML}`);
      console.error(`allowed hosts: ${ALLOWED_HOSTS.join(", ")}`);
      process.exit(1);
    }
    console.log("network gate: clean");
  }
}
