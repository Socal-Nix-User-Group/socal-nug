import { readFileSync } from "node:fs";
import ELK from "./elk.bundled.js";
import { parseData } from "../src/parse.ts";
import { drawLoom } from "../src/loom-draw.ts";
import { placeLoom } from "../src/loom-place.ts";
import { buildStory } from "../src/story.ts";
import { history } from "./histories.ts";
import {
  explain,
  inspectDrawing,
  inspectPlacement,
  recorder,
  ribbonSpread,
} from "./inspect.ts";

/**
 * The only check that runs on the repository's real data, through the real
 * layout engine, and on the template's merge, rather than on fixtures.
 * Everything else in the engine suite builds its own moments and fakes the
 * layout, so a plausible typo in data/moments.toml, or a layout ELK is happy
 * with that the renderer is not, could otherwise ship with the suite green.
 *
 * It reads the built page rather than the TOML because node has no TOML
 * parser, and because reading the page tests the Tera merge too. ELK is the
 * vendored copy the page loads, put beside this script by the check.
 */

declare const process: {
  argv: string[];
  exit(code: number): never;
};
declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

function fail(message: string): never {
  console.error(`origins smoke: ${message}`);
  process.exit(1);
}

const site = process.argv[2];
if (site === undefined) {
  fail("usage: smoke <built site directory>");
}

const page = readFileSync(`${site}/origins/index.html`, "utf8");
const block = page.match(/id="origins-data">([\s\S]*?)<\/script>/);
if (block === null) {
  fail("the built page has no origins-data block");
}

const elk = new ELK();

// --- the loom, through the real layout engine ----------------------------------
// The real page's data and made-up histories, laid out by the real ELK. A
// finding fails the check, a ribbon off its column among them, but only after
// every case has printed its line, so one run shows them all.

declare const performance: { now(): number };

// Each case says whether it is made up, which changes what a layout finding
// tells the reader about who could have caused it.
const loomCases: Array<[string, unknown, boolean]> = [
  ["today", JSON.parse(block[1]), false],
];
for (const seed of [1, 2, 3]) {
  for (const years of [0, 1, 2]) {
    loomCases.push([`seed ${seed} +${years}y`, history(seed, years), true]);
  }
}

const loomFailures: string[] = [];
for (const [name, raw, madeUp] of loomCases) {
  for (const mode of ["river", "subway"] as const) {
    // A throw is the engine's, and is reported as one so the rest still run.
    try {
      const data = parseData(raw);
      const story = buildStory(data.moments, data.people);
      const started = performance.now();
      const placed = await placeLoom(story, mode, (graph) => elk.layout(graph));
      const took = performance.now() - started;
      console.log(
        `loom ${name} ${mode}: ${story.moments.length} moments, ` +
          `${story.threads.length} people, ribbon off its column by up to ` +
          `${ribbonSpread(story, placed).toFixed(1)}px, ` +
          `${placed.width.toFixed(0)}x${placed.height.toFixed(0)}, ` +
          `${took.toFixed(0)}ms`,
      );
      const { doc, made } = recorder();
      drawLoom(placed, story, doc);
      const findings = [
        ...inspectPlacement(story, placed),
        ...inspectDrawing(story, placed, made),
      ];
      for (const finding of findings) {
        loomFailures.push(`loom ${name} ${mode}: ${explain(finding, madeUp)}`);
      }
    } catch (error) {
      const message = `it threw: ${error instanceof Error ? error.message : String(error)}`;
      loomFailures.push(
        `loom ${name} ${mode}: ${explain({ kind: "engine", message }, madeUp)}`,
      );
    }
  }
}
if (loomFailures.length > 0) {
  fail(loomFailures.join("\norigins smoke: "));
}
