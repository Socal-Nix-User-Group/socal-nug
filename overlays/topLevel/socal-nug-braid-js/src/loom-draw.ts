import { describeGathering, describePerson } from "./focus.ts";
import { slotKey } from "./loom-place.ts";
import type { LoomPlaced } from "./loom-place.ts";
import { hueFor } from "./palette.ts";
import { avatarFor, flow } from "./render.ts";
import type { DocumentLike, ElementLike } from "./render.ts";
import type { Story } from "./story.ts";

/**
 * The loom's picture, from what ELK decided.
 *
 * Everything positional comes from `LoomPlaced`; this only decides what each
 * thing looks like and the order it is drawn in: threads, then ovals, then
 * beads, then faces, then labels, so each sits on top of what came before.
 */

const SVG = "http://www.w3.org/2000/svg";
/** Where the opening year sits, in from the corner. */
const YEAR_GUTTER = 34;
/** How far a moment's hit area reaches past its oval. */
const HIT = 6;
const BEAD_R = 2.6;
const JOIN_R = 3.6;

const round = (n: number) => Math.round(n * 100) / 100;

function make(
  doc: DocumentLike,
  tag: string,
  attrs: Record<string, string | number>,
): ElementLike {
  const element = doc.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

export interface YearMarks {
  /** One line for each change of year, in date order. */
  readonly ticks: readonly { x1: number; y1: number; x2: number; y2: number }[];
  /** The opening year first, then one for each tick. */
  readonly labels: readonly { x: number; y: number; text: string }[];
}

/**
 * Where the years are marked. The opening year is pinned to the corner. Each
 * change of year is a line across the picture, between the last moment of one
 * year and the first of the next.
 */
export function yearMarks(placed: LoomPlaced, story: Story): YearMarks {
  const along = placed.mode === "river" ? "y" : "x";
  const ticks: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const labels: { x: number; y: number; text: string }[] = [];
  let previousYear: number | undefined;
  let previousAlong = 0;
  for (const gathering of story.moments) {
    const year = new Date(gathering.moment.date.start).getUTCFullYear();
    const at = placed.moments.get(gathering.moment.id)!;
    const here = along === "y" ? at.y : at.x;
    if (previousYear === undefined) {
      labels.push({ x: 6, y: YEAR_GUTTER - 14, text: String(year) });
    } else if (year !== previousYear) {
      const mid = round((previousAlong + here) / 2);
      ticks.push(
        along === "y"
          ? { x1: 0, y1: mid, x2: round(placed.width), y2: mid }
          : { x1: mid, y1: 0, x2: mid, y2: round(placed.height) },
      );
      labels.push({
        x: along === "y" ? 6 : mid + 6,
        y: along === "y" ? mid - 5 : YEAR_GUTTER - 14,
        text: String(year),
      });
    }
    previousYear = year;
    previousAlong = here;
  }
  return { ticks, labels };
}

export function drawLoom(
  placed: LoomPlaced,
  story: Story,
  doc: DocumentLike,
): ElementLike {
  const { width, height } = placed;
  const along = placed.mode === "river" ? "y" : "x";
  // A named group, not hidden decoration: its ovals and faces take focus, and
  // something focusable that is hidden from assistive tech is something a
  // screen reader user lands on and hears nothing about.
  const svg = make(doc, "svg", {
    viewBox: `0 0 ${round(width)} ${round(height)}`,
    width: round(width),
    height: round(height),
    class: `origins-svg is-${placed.mode}`,
    role: "group",
    "aria-label":
      "How we met: use the arrow keys to move through it, Enter to open a card",
  });

  // --- year markers ---------------------------------------------------------
  // The opening year's label, then each change of year as a dashed line and
  // the label of the year it starts.
  const marks = yearMarks(placed, story);
  marks.labels.forEach((year, i) => {
    if (i > 0) {
      const tick = marks.ticks[i - 1];
      svg.appendChild(
        make(doc, "path", {
          class: "origins-year-tick",
          d: `M${tick.x1},${tick.y1} L${tick.x2},${tick.y2}`,
          fill: "none",
        }),
      );
    }
    const label = make(doc, "text", {
      class: i === 0 ? "origins-year is-opening" : "origins-year is-boundary",
      x: year.x,
      y: year.y,
      "text-anchor": "start",
    });
    label.textContent = year.text;
    svg.appendChild(label);
  });

  // --- threads --------------------------------------------------------------
  // One path per person, not per edge: two round-capped paths that meet in
  // open space composite their anti-aliased edges twice and leave a seam. A
  // person's edges share their ends, each ending at the slot the next starts
  // from, so they join end to end; where one does not (an edge the layout
  // left out, or a meetup they are away from, where the thread stops short
  // of the oval and starts again after it), a new subpath starts.
  for (const thread of story.threads) {
    const edges = placed.edges.filter((e) => e.meta.slug === thread.person.slug);
    if (edges.length === 0) continue;
    const runs: Array<Array<readonly [number, number]>> = [];
    for (const edge of edges) {
      const points = edge.points.map((p) => [p.x, p.y] as const);
      const run = runs.at(-1);
      const end = run?.at(-1);
      if (run !== undefined && end![0] === points[0][0] && end![1] === points[0][1]) {
        run.push(...points.slice(1));
      } else {
        runs.push(points);
      }
    }
    const meta = edges[0].meta;
    svg.appendChild(
      make(doc, "path", {
        class: `origins-thread ${meta.member ? "is-member" : "is-guest"}`,
        "data-person": meta.slug,
        "data-hue": meta.hue,
        d: runs.map((run) => flow(run, along)).join(" "),
        fill: "none",
      }),
    );
  }

  // --- moments, over the threads --------------------------------------------
  for (const gathering of story.moments) {
    const moment = gathering.moment;
    const box = placed.boxes.get(moment.id)!;
    const end = round(Math.min(box.width, box.height) / 2);
    const node = make(doc, "g", {
      class: `origins-node ${moment.trunk ? "is-trunk" : "is-side"}`,
      "data-moment": moment.id,
      role: "button",
      "aria-label": describeGathering(gathering),
      // -1 for every one of them; the roving tabindex promotes one to 0
      tabindex: "-1",
    });
    node.appendChild(
      make(doc, "rect", {
        class: "origins-oval",
        x: round(box.x),
        y: round(box.y),
        width: round(box.width),
        height: round(box.height),
        rx: end,
        ry: end,
      }),
    );
    node.appendChild(
      make(doc, "rect", {
        class: "origins-node-hit",
        x: round(box.x - HIT),
        y: round(box.y - HIT),
        width: round(box.width + 2 * HIT),
        height: round(box.height + 2 * HIT),
        rx: round(Math.min(box.width, box.height) / 2 + HIT),
        ry: round(Math.min(box.width, box.height) / 2 + HIT),
      }),
    );
    svg.appendChild(node);
  }

  // --- beads, only where the record vouches or says they were away ------------
  // Someone away has a hollow bead in their slot, between the ends of their
  // broken thread.
  const hueOf = new Map(
    story.threads.map((thread, index) => [thread.person.slug, hueFor(index)]),
  );
  for (const gathering of story.moments) {
    for (const passage of gathering.through) {
      if (!passage.vouched && !passage.away) continue;
      const at = placed.slots.get(slotKey(gathering.moment.id, passage.slug))!;
      svg.appendChild(
        make(doc, "circle", {
          class: passage.away
            ? "origins-bead is-away"
            : passage.joined
            ? "origins-bead is-join"
            : "origins-bead",
          "data-person": passage.slug,
          "data-hue": hueOf.get(passage.slug)!,
          cx: round(at.x),
          cy: round(at.y),
          r: passage.joined ? JOIN_R : BEAD_R,
        }),
      );
    }
  }

  // --- faces, after every bead ----------------------------------------------
  story.threads.forEach((thread, index) => {
    const at = placed.roots.get(thread.person.slug);
    if (at === undefined) return;
    const root = make(doc, "g", {
      class: "origins-root",
      "data-person": thread.person.slug,
      "data-hue": hueFor(index),
      transform: `translate(${round(at.x)} ${round(at.y)})`,
      role: "button",
      "aria-label": describePerson(thread.person),
      tabindex: "-1",
    });
    root.appendChild(avatarFor(thread.person, doc));
    svg.appendChild(root);
  });

  // --- labels, where ELK left room for them ---------------------------------
  for (const gathering of story.moments) {
    const label = placed.labels.get(gathering.moment.id);
    if (label === undefined) continue;
    const text = make(doc, "text", {
      class: "origins-label",
      x: round(label.x),
      y: round(label.y),
      "text-anchor": label.anchor,
    });
    text.textContent = label.text;
    svg.appendChild(text);
  }

  return svg;
}
