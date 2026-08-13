// Flips a task to passes:true in the graph and rewrites its INDEX.md row.
// Step 7 and step 9 of the 10-step, done in one place so they cannot disagree.
import { readFileSync, writeFileSync } from "node:fs";
const [id, note] = process.argv.slice(2);
const path = "scripts2/prd.json";
const graph = JSON.parse(readFileSync(path, "utf8"));
const task = graph.tasks.find((t) => t.id === id);
if (!task) { console.error(`no task ${id}`); process.exit(1); }
task.passes = true;
writeFileSync(path, JSON.stringify(graph, null, 2) + "\n");

const idx = "scripts2/progress/INDEX.md";
const lines = readFileSync(idx, "utf8").split("\n");
const rx = new RegExp(`^\\| ${id}\\s*\\|`);
let hit = false;
for (let i = 0; i < lines.length; i++) {
  if (!rx.test(lines[i])) continue;
  const cells = lines[i].split("|");
  cells[5] = ` **shipped**${note ? " — " + note : ""} — [${id}.md](${id}.md) `;
  lines[i] = cells.join("|");
  hit = true;
}
if (!hit) { console.error(`no INDEX row for ${id}`); process.exit(1); }
writeFileSync(idx, lines.join("\n"));
console.log(`${id}: passes=true, INDEX updated`);
