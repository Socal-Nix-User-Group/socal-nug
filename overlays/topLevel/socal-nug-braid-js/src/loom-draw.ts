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
  // The opening year is pinned to the corner. Each change of year is a dashed
  // line across the picture, between the last moment of one year and the
  // first of the next.
  let previousYear: number | undefined;
  let previousAlong = 0;
  for (const gathering of story.moments) {
    const year = new Date(gathering.moment.date.start).getUTCFullYear();
    const at = placed.moments.get(gathering.moment.id)!;
    const here = along === "y" ? at.y : at.x;
    if (previousYear === undefined) {
      const label = make(doc, "text", {
        class: "origins-year is-opening",
        x: 6,
        y: YEAR_GUTTER - 14,
        "text-anchor": "start",
      });
      label.textContent = String(year);
      svg.appendChild(label);
    } else if (year !== previousYear) {
      const mid = round((previousAlong + here) / 2);
      svg.appendChild(
        make(doc, "path", {
          class: "origins-year-tick",
          d: along === "y"
            ? `M0,${mid} L${round(width)},${mid}`
            : `M${mid},0 L${mid},${round(height)}`,
          fill: "none",
        }),
      );
      const label = make(doc, "text", {
        class: "origins-year is-boundary",
        x: along === "y" ? 6 : mid + 6,
        y: along === "y" ? mid - 5 : YEAR_GUTTER - 14,
        "text-anchor": "start",
      });
      label.textContent = String(year);
      svg.appendChild(label);
    }
    previousYear = year;
    previousAlong = here;
  }

  // --- threads --------------------------------------------------------------
  for (const edge of placed.edges) {
    svg.appendChild(
      make(doc, "path", {
        class: `origins-thread ${edge.meta.member ? "is-member" : "is-guest"}`,
        "data-person": edge.meta.slug,
        "data-hue": edge.meta.hue,
        d: flow(edge.points.map((p) => [p.x, p.y] as const), along),
        fill: "none",
      }),
    );
  }

  // --- moments, over the threads --------------------------------------------
  for (const gathering of story.moments) {
    const moment = gathering.moment;
    const box = placed.boxes.get(moment.id)!;
    const cx = round(box.x + box.width / 2);
    const cy = round(box.y + box.height / 2);
    const node = make(doc, "g", {
      class: `origins-node ${moment.trunk ? "is-trunk" : "is-side"}`,
      "data-moment": moment.id,
      role: "button",
      "aria-label": describeGathering(gathering),
      // -1 for every one of them; the roving tabindex promotes one to 0
      tabindex: "-1",
    });
    node.appendChild(
      make(doc, "ellipse", {
        class: "origins-oval",
        cx,
        cy,
        rx: round(box.width / 2),
        ry: round(box.height / 2),
      }),
    );
    node.appendChild(
      make(doc, "ellipse", {
        class: "origins-node-hit",
        cx,
        cy,
        rx: round(box.width / 2 + HIT),
        ry: round(box.height / 2 + HIT),
      }),
    );
    svg.appendChild(node);
  }

  // --- beads, only where the record vouches ---------------------------------
  const hueOf = new Map(
    story.threads.map((thread, index) => [thread.person.slug, hueFor(index)]),
  );
  for (const gathering of story.moments) {
    for (const passage of gathering.through) {
      if (!passage.vouched) continue;
      const at = placed.slots.get(slotKey(gathering.moment.id, passage.slug))!;
      svg.appendChild(
        make(doc, "circle", {
          class: passage.joined ? "origins-bead is-join" : "origins-bead",
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
