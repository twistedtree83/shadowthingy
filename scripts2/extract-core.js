// The app is one HTML file with no build step, so the pure core lives in a
// single <script id="gnomon-core"> block. This is the one place that block is
// located, so the gates, the headless suite and the in-page test panel all agree
// on what "the core" means. There is never a second copy of the core on disk —
// extracting it is what replaces a build.

import { existsSync, readFileSync } from "node:fs";

const OPEN = /<script\b[^>]*\bid\s*=\s*["']gnomon-core["'][^>]*>/i;
const CLOSE = "</script>";

export function extractCore(html) {
  const open = OPEN.exec(html);
  if (!open) {
    throw new Error(
      `no <script id="gnomon-core"> block found — the core must live in exactly one such block`,
    );
  }
  const start = open.index + open[0].length;
  const end = html.indexOf(CLOSE, start);
  if (end === -1) throw new Error(`<script id="gnomon-core"> is never closed`);

  const rest = html.slice(end + CLOSE.length);
  if (OPEN.test(rest)) {
    throw new Error(
      `more than one <script id="gnomon-core"> block — the core must be exactly one block`,
    );
  }
  return html.slice(start, end);
}

// Returns null when the app file does not exist yet, so the gates can report
// "nothing to check" before the scaffold task has shipped rather than failing on
// an absence. Once the file exists, a missing or duplicated core block is a hard
// failure — silence there would hide a real break.
export function readCoreOrNull(path) {
  if (!existsSync(path)) return null;
  return extractCore(readFileSync(path, "utf8"));
}
