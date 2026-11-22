import { readFileSync } from "node:fs";
import { buildBraid } from "../src/layout.ts";
import { parseData } from "../src/parse.ts";
import { laneRangeOf } from "../src/render.ts";

/**
 * The only check that runs on the repository's real data and on the
 * template's merge, rather than on fixtures. Everything else in the engine
 * suite builds its own moments, so a plausible typo in data/moments.toml
 * could otherwise produce a nonsense picture with the whole suite green.
 *
 * It reads the built page rather than the TOML because node has no TOML
 * parser, and because reading the page tests the Tera merge too.
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

const { people, moments } = parseData(JSON.parse(block[1]));
const braid = buildBraid(moments, people);

if (braid.moments.length === 0) {
  fail("the braid has no moments");
}

for (const placed of braid.moments) {
  if (!Number.isFinite(placed.t) || !Number.isFinite(placed.lane)) {
    fail(`${placed.moment.id} has a non-finite position`);
  }
}

for (const thread of braid.threads) {
  if (thread.segments.length === 0) {
    fail(`${thread.person.slug} has no drawn segment`);
  }
  for (const segment of thread.segments) {
    if (segment.points.length === 0) {
      fail(`${thread.person.slug} has an empty ${segment.kind} segment`);
    }
  }
}

const known = new Set(braid.moments.map((m) => m.moment.id));
for (const thread of braid.threads) {
  if (thread.joinsTrunkAt !== null && !known.has(thread.joinsTrunkAt)) {
    fail(
      `${thread.person.slug} joins at unknown moment ${thread.joinsTrunkAt}`,
    );
  }
}

let previous = 0;
for (const segment of braid.trunk) {
  if (segment.joined < previous) {
    fail(`trunk membership fell at ${segment.from.moment.id}`);
  }
  if (segment.away > segment.joined) {
    fail(`more people away than joined at ${segment.from.moment.id}`);
  }
  previous = segment.joined;
}

const [low, high] = laneRangeOf(braid);
if (!Number.isFinite(low) || !Number.isFinite(high) || low > high) {
  fail(`lane range is broken: ${low}..${high}`);
}

console.log(
  `origins smoke: ${braid.moments.length} moments, ` +
    `${braid.threads.length} threads, ` +
    `${braid.excursions.length} excursions, ` +
    `trunk ${braid.trunk.length} segments, lanes ${low}..${high}`,
);
