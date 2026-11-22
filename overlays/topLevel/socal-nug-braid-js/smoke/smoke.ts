import { readFileSync } from "node:fs";
import { buildBraid } from "../src/layout.ts";
import { parseData } from "../src/parse.ts";
import { LABEL_WIDTH, laneRangeOf, renderBraid } from "../src/render.ts";
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
  river: { width: 850, height: Math.max(600, braid.moments.length * 46) },
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

// --- what the picture actually looks like ------------------------------------
// Everything above measures (t, lane) and label extents. All of it was green
// while a thread ran straight through somebody's face and two labels sat
// across one, because none of it rendered. This does: it draws the real braid
// through the real renderer and measures the SVG that comes out.

interface Recorded {
  tag: string;
  attrs: Record<string, string>;
  text: string;
}

/** A `document` that records instead of building a DOM. No DOM library here. */
function recorder() {
  const made: Recorded[] = [];
  const doc = {
    createElementNS(_ns: string, tag: string) {
      const node: Recorded = { tag, attrs: {}, text: "" };
      made.push(node);
      return {
        node,
        setAttribute(name: string, value: string) {
          node.attrs[name] = value;
        },
        appendChild(child: unknown) {
          return child;
        },
        set textContent(value: string) {
          node.text = value;
        },
        get textContent() {
          return node.text;
        },
      };
    },
  };
  return { doc, made };
}

/** Points along a path's `d`. flow() emits one M followed by C commands. */
function sample(d: string): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  let cur: readonly [number, number] = [0, 0];
  for (const part of d.match(/[MC][^MC]*/g) ?? []) {
    const v = part.slice(1).trim().split(/[\s,]+/).map(Number);
    if (part[0] === "M") {
      cur = [v[0], v[1]];
      out.push(cur);
      continue;
    }
    for (let seg = 0; seg + 6 <= v.length; seg += 6) {
      const [x1, y1, x2, y2, x3, y3] = v.slice(seg, seg + 6);
      for (let i = 1; i <= 24; i += 1) {
        const k = i / 24;
        const u = 1 - k;
        out.push([
          u * u * u * cur[0] + 3 * u * u * k * x1 + 3 * u * k * k * x2 +
          k * k * k * x3,
          u * u * u * cur[1] + 3 * u * u * k * y1 + 3 * u * k * k * y2 +
          k * k * k * y3,
        ]);
      }
      cur = [x3, y3];
    }
  }
  return out;
}

const AVATAR = 18;
const LABEL_HEIGHT = 14;

for (const mode of ["river", "subway"] as const) {
  const projection = projectionFor(mode, VIEWPORTS[mode], [low, high]);
  const { doc, made } = recorder();
  renderBraid(braid, projection, doc as never);

  const faces = made
    .filter((n) => n.tag === "g" && n.attrs.class === "origins-root")
    .map((n) => {
      const at = n.attrs.transform.match(/translate\(([-\d.]+) ([-\d.]+)\)/);
      if (at === null) fail(`${mode}: a root avatar has no position`);
      return { slug: n.attrs["data-person"], x: +at[1], y: +at[2] };
    });

  // A line through someone's face reads as a connection that is not there.
  for (const path of made) {
    if (path.tag !== "path" || path.attrs["data-person"] === undefined) {
      continue;
    }
    const slug = path.attrs["data-person"];
    for (const [x, y] of sample(path.attrs.d)) {
      for (const face of faces) {
        if (face.slug === slug) continue;
        if (Math.hypot(x - face.x, y - face.y) < AVATAR) {
          fail(
            `${mode}: ${slug}'s thread runs through ${face.slug}'s avatar ` +
              `at ${x.toFixed(0)},${y.toFixed(0)}`,
          );
        }
      }
    }
  }

  // A label across a face or a node hides the thing it is naming.
  const circles = made
    .filter((n) => n.tag === "circle" && n.attrs["data-moment"] !== undefined)
    .map((n) => ({
      id: n.attrs["data-moment"],
      x: +n.attrs.cx,
      y: +n.attrs.cy,
      r: +n.attrs.r,
    }));

  for (const label of made) {
    if (label.tag !== "text" || label.attrs.class !== "origins-label") continue;
    const x = +label.attrs.x;
    const y = +label.attrs.y;
    const anchor = label.attrs["text-anchor"];
    const left = anchor === "end"
      ? x - LABEL_WIDTH
      : anchor === "middle"
      ? x - LABEL_WIDTH / 2
      : x;
    const box = {
      left,
      right: left + LABEL_WIDTH,
      top: y - LABEL_HEIGHT,
      bottom: y,
    };

    for (const face of faces) {
      if (
        box.left < face.x + AVATAR && box.right > face.x - AVATAR &&
        box.top < face.y + AVATAR && box.bottom > face.y - AVATAR
      ) {
        fail(`${mode}: label "${label.text}" sits on ${face.slug}'s avatar`);
      }
    }
    for (const circle of circles) {
      if (
        box.left < circle.x + circle.r && box.right > circle.x - circle.r &&
        box.top < circle.y + circle.r && box.bottom > circle.y - circle.r
      ) {
        fail(`${mode}: label "${label.text}" sits on node ${circle.id}`);
      }
    }
  }
}

console.log(
  `origins smoke: ${braid.moments.length} moments, ` +
    `${braid.threads.length} threads, ` +
    `${braid.excursions.length} excursions, ` +
    `trunk ${braid.trunk.length} segments, lanes ${low}..${high}`,
);
