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
const ALLOWED_HOSTS = [
  "cdn.jsdelivr.net",
  "unpkg.com",
];

const TILE_SMELLS = [
  [/\{z\}|\{x\}|\{y\}|\{s\}/, "tile URL template — tiles reveal the region of interest"],
  [/tile\.openstreetmap|basemaps\.|api\.mapbox|tiles\.|\.tile\./i, "tile server reference"],
  [/leaflet|maplibre|mapbox-gl|openlayers/i, "tile-based map library"],
];

const STORAGE_SMELLS = [
  [/\blocalStorage\b/, "localStorage — no storage, anywhere"],
  [/\bsessionStorage\b/, "sessionStorage — no storage, anywhere"],
  [/\bindexedDB\b/i, "indexedDB — no storage, anywhere"],
  [/document\.cookie/, "cookies — no storage, anywhere"],
];

const EXFIL_SMELLS = [
  [/\bnavigator\.sendBeacon\b/, "sendBeacon — nothing leaves the browser"],
  [/\bnew\s+WebSocket\b/, "WebSocket — nothing leaves the browser"],
  [/\bnew\s+EventSource\b/, "EventSource — nothing leaves the browser"],
  [/\bFormData\b[\s\S]{0,200}\bfetch\b/, "form upload — nothing leaves the browser"],
  [/analytics|gtag\(|googletagmanager|sentry|posthog|plausible/i, "analytics or error reporting"],
];

if (!existsSync(HTML)) {
  console.log(`network gate: no ${HTML} yet — nothing to check`);
  process.exit(0);
}

const html = readFileSync(HTML, "utf8");
const lines = html.split("\n");
let failures = 0;

const fail = (i, why, line) => {
  console.error(`${HTML}:${i + 1}  ${why}`);
  console.error(`    ${line.trim().slice(0, 160)}`);
  failures++;
};

lines.forEach((line, i) => {
  if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;

  for (const [pattern, why] of [...TILE_SMELLS, ...STORAGE_SMELLS, ...EXFIL_SMELLS]) {
    if (pattern.test(line)) fail(i, why, line);
  }

  // Any absolute URL must point at an allowed host.
  for (const match of line.matchAll(/https?:\/\/([^\/\s"'`)]+)/g)) {
    const host = match[1].toLowerCase();
    if (!ALLOWED_HOSTS.includes(host)) {
      fail(i, `network reference to "${host}" — not on the allowed list`, line);
    }
  }
});

if (failures) {
  console.error(`\nnetwork gate: ${failures} violation(s) in ${HTML}`);
  console.error(`allowed hosts: ${ALLOWED_HOSTS.join(", ")}`);
  process.exit(1);
}
console.log("network gate: clean");
