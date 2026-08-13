// Loads the pure core out of the single HTML file and evaluates it in a bare
// context. This is the whole of the "build step": there is no second copy of the
// core on disk, so the headless suite and the browser run identical code.
//
// The context is deliberately bare — no document, no fetch, no clock. If the
// core ever reaches for one of those, it throws here rather than silently
// working in a browser and failing the purity gate later.

import vm from "node:vm";
import { readCoreOrNull } from "../scripts2/extract-core.js";

const source = readCoreOrNull("gnomon.html");
if (source === null) {
  throw new Error("gnomon.html does not exist — G1 has not shipped");
}

const context = vm.createContext({});
vm.runInContext(source, context, { filename: "gnomon.html#gnomon-core" });

if (!context.Gnomon) {
  throw new Error("the core block did not publish `Gnomon` on globalThis");
}

export const Gnomon = context.Gnomon;
