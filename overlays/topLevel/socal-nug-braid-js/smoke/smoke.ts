import { readFileSync } from "node:fs";
import ELK from "./elk.bundled.js";
import { drawPlaced } from "../src/draw.ts";
import { LABEL_MAX } from "../src/graph.ts";
import { buildBraid } from "../src/layout.ts";
import { parseData } from "../src/parse.ts";
import { placeBraid } from "../src/place.ts";
import type { DocumentLike, ElementLike } from "../src/render.ts";

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

const { people, moments } = parseData(JSON.parse(block[1]));
const braid = buildBraid(moments, people);

if (braid.moments.length === 0) {
  fail("the braid has no moments");
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

// --- what the picture actually looks like ------------------------------------
// Draw the real braid through the real ELK and the real renderer, and
// measure the SVG that comes out. Measuring the abstract model left every
// overlap invisible to a passing suite.

interface Recorded {
  tag: string;
  attrs: Record<string, string>;
  text: string;
}

/** A `document` that records instead of building a DOM. No DOM library here. */
function recorder(): { doc: DocumentLike; made: Recorded[] } {
  const made: Recorded[] = [];
  const doc: DocumentLike = {
    createElementNS(_ns: string, tag: string): ElementLike {
      const node: Recorded = { tag, attrs: {}, text: "" };
      made.push(node);
      const element = {
        node,
        setAttribute(name: string, value: string) {
          node.attrs[name] = value;
        },
        appendChild(child: ElementLike) {
          return child;
        },
        set textContent(value: string) {
          node.text = value;
        },
        get textContent() {
          return node.text;
        },
      };
      return element as unknown as ElementLike;
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
const elk = new ELK();

for (const mode of ["river", "subway"] as const) {
  const placed = await placeBraid(braid, mode, (graph) => elk.layout(graph));
  if (!(placed.width > 0 && placed.height > 0)) {
    fail(`${mode}: ELK gave the picture no size`);
  }
  for (const m of braid.moments) {
    if (!placed.moments.has(m.moment.id)) {
      fail(`${mode}: ${m.moment.id} was not placed`);
    }
  }
  for (const thread of braid.threads) {
    if (!placed.roots.has(thread.person.slug)) {
      fail(`${mode}: ${thread.person.slug}'s face was not placed`);
    }
  }

  const { doc, made } = recorder();
  drawPlaced(placed, braid, doc);

  const faces = made
    .filter((n) => n.tag === "g" && n.attrs.class === "origins-root")
    .map((n) => {
      const at = n.attrs.transform.match(/translate\(([-\d.]+) ([-\d.]+)\)/);
      if (at === null) fail(`${mode}: a root avatar has no position`);
      return { slug: n.attrs["data-person"], x: +at[1], y: +at[2] };
    });

  const circles = made
    .filter((n) => n.tag === "circle" && n.attrs["data-moment"] !== undefined)
    .map((n) => ({
      id: n.attrs["data-moment"],
      x: +n.attrs.cx,
      y: +n.attrs.cy,
      r: +n.attrs.r,
    }));

  // Everything drawn is on the canvas.
  for (const c of circles) {
    if (c.x < 0 || c.x > placed.width || c.y < 0 || c.y > placed.height) {
      fail(`${mode}: ${c.id} at ${c.x},${c.y} is off the canvas`);
    }
  }
  for (const f of faces) {
    if (
      f.x - AVATAR < 0 || f.x + AVATAR > placed.width ||
      f.y - AVATAR < 0 || f.y + AVATAR > placed.height
    ) {
      fail(`${mode}: ${f.slug}'s face at ${f.x},${f.y} is clipped`);
    }
  }

  // Where each label's text is, at the layout's own measure. Not clamped to
  // the room a label may claim: a clamp here measures what the layout hoped
  // for, and hid two meetup names running off the left of the picture.
  const labels = made
    .filter((n) => n.tag === "text" && n.attrs.class === "origins-label")
    .map((label) => {
      const x = +label.attrs.x;
      const y = +label.attrs.y;
      const anchor = label.attrs["text-anchor"];
      const w = label.text.length * 6.4;
      const left = anchor === "end"
        ? x - w
        : anchor === "middle"
        ? x - w / 2
        : x;
      return {
        text: label.text,
        width: w,
        left,
        right: left + w,
        top: y - LABEL_HEIGHT,
        bottom: y,
      };
    });

  // A line through someone's face reads as a connection that is not there.
  // A line through a dot its person was not at reads as their having been
  // there, and the trunk over a dot that is not a meetup reads as one. A
  // line under a label leaves the label unreadable. Trunk dots are the
  // group itself and every detour leaves from one and returns to one, so
  // they are not checked.
  //
  // The trunk is measured at its drawn thickness. It used to be skipped
  // here altogether, which mattered more than it sounds: it is the one line
  // that is moved after ELK has routed it.
  const wasAt = new Map(
    braid.moments.map((m) => [m.moment.id, new Set(m.moment.people)]),
  );
  const trunkIds = new Set(
    braid.moments.filter((m) => m.moment.trunk).map((m) => m.moment.id),
  );
  const dots = circles.filter((c) => !trunkIds.has(c.id));
  for (const path of made) {
    if (path.tag !== "path") continue;
    const slug = path.attrs["data-person"];
    const isTrunk = path.attrs.class === "origins-trunk";
    if (slug === undefined && !isTrunk) continue;
    const half = isTrunk ? +path.attrs["stroke-width"] / 2 : 0;
    const who = isTrunk ? "the trunk" : `${slug}'s thread`;
    for (const [x, y] of sample(path.attrs.d)) {
      const near = `near ${x.toFixed(0)},${y.toFixed(0)}`;
      for (const face of faces) {
        if (face.slug === slug) continue;
        if (Math.hypot(x - face.x, y - face.y) < AVATAR + half) {
          fail(`${mode}: ${who} runs through ${face.slug}'s avatar ${near}`);
        }
      }
      for (const dot of dots) {
        const apart = Math.hypot(x - dot.x, y - dot.y);
        if (isTrunk) {
          if (apart < dot.r + half + 2) {
            fail(
              `${mode}: the trunk runs over ${dot.id}, ` +
                `which is not a meetup, ${near}`,
            );
          }
          continue;
        }
        if (wasAt.get(dot.id)?.has(slug)) continue;
        if (apart < dot.r + 6) {
          fail(
            `${mode}: ${who} runs through ${dot.id}, ` +
              `which they were not at, ${near}`,
          );
        }
      }
      for (const label of labels) {
        if (
          x + half > label.left && x - half < label.right &&
          y + half > label.top && y - half < label.bottom
        ) {
          fail(`${mode}: ${who} runs under the label "${label.text}" ${near}`);
        }
      }
    }
  }

  // A label across a face or a node hides the thing it is naming, and one
  // off the canvas is not there at all.
  for (const box of labels) {
    if (box.width > LABEL_MAX) {
      fail(
        `${mode}: label "${box.text}" is drawn wider than the ` +
          `${LABEL_MAX}px the layout reserved for it`,
      );
    }

    if (box.left < 0 || box.right > placed.width || box.top < 0) {
      fail(`${mode}: label "${box.text}" runs off the canvas`);
    }
    for (const face of faces) {
      if (
        box.left < face.x + AVATAR && box.right > face.x - AVATAR &&
        box.top < face.y + AVATAR && box.bottom > face.y - AVATAR
      ) {
        fail(`${mode}: label "${box.text}" sits on ${face.slug}'s avatar`);
      }
    }
    for (const circle of circles) {
      if (
        box.left < circle.x + circle.r && box.right > circle.x - circle.r &&
        box.top < circle.y + circle.r && box.bottom > circle.y - circle.r
      ) {
        fail(`${mode}: label "${box.text}" sits on node ${circle.id}`);
      }
    }
  }
}

console.log(
  `origins smoke: ${braid.moments.length} moments, ` +
    `${braid.threads.length} threads, ` +
    `${braid.excursions.length} excursions, ` +
    `trunk ${braid.trunk.length} segments, laid out by ELK in both modes`,
);
