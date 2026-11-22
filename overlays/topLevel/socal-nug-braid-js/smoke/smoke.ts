import { readFileSync } from "node:fs";
import { buildBraid } from "../src/layout.ts";
import { parseData } from "../src/parse.ts";
import { LABEL_WIDTH, laneRangeOf } from "../src/render.ts";
import { projectionFor } from "../src/projections.ts";
import { extentOf, layoutLabels } from "../src/labels.ts";

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

// Project the real data through both modes and check that what would be drawn
// actually fits. Asserting only the abstract (t, lane) left every clipping bug
// invisible to a passing suite.
const VIEWPORTS = {
  river: { width: 850, height: Math.max(750, braid.moments.length * 57.5) },
  subway: {
    width: Math.max(850, braid.moments.length * 170),
    height: Math.max(520, (high - low + 2) * 56),
  },
} as const;

for (const mode of ["river", "subway"] as const) {
  const viewport = VIEWPORTS[mode];
  const projection = projectionFor(mode, viewport, [low, high]);
  const [, , boxWidth, boxHeight] = projection.viewBox;

  for (const placed of braid.moments) {
    const [x, y] = projection.project(placed.t, placed.lane);
    if (x < 0 || x > boxWidth || y < 0 || y > boxHeight) {
      fail(
        `${mode}: ${placed.moment.id} at ${x},${y} is outside 0,0..${boxWidth},${boxHeight}`,
      );
    }
  }

  if (!projection.showLabels) continue;

  // Exactly the call the renderer makes, so this measures what is drawn.
  const boxes = braid.moments.map((placed) => {
    const [x, y] = projection.project(placed.t, placed.lane);
    const anchor = projection.labelAnchor(placed.lane);
    return {
      id: placed.moment.id,
      x: x + anchor.dx,
      y: y + anchor.dy,
      w: LABEL_WIDTH,
      h: 14,
      anchorX: x,
      anchorY: y,
      anchor: anchor.anchor,
    };
  });

  for (
    const box of layoutLabels(boxes, mode === "river" ? "y" : "x", {
      width: boxWidth,
      height: boxHeight,
    })
  ) {
    const [left, right] = extentOf(box);
    if (left < 0 || right > boxWidth) {
      fail(
        `${mode}: label for ${box.id} spans ${left}..${right}, outside 0..${boxWidth}`,
      );
    }
  }
}

console.log(
  `origins smoke: ${braid.moments.length} moments, ` +
    `${braid.threads.length} threads, ` +
    `${braid.excursions.length} excursions, ` +
    `trunk ${braid.trunk.length} segments, lanes ${low}..${high}`,
);
