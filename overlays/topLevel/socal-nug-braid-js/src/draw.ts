import { SIDE_R, TRUNK_R } from "./graph.ts";
import { hueFor } from "./palette.ts";
import type { Placed } from "./place.ts";
import { avatarFor, flow } from "./render.ts";
import type { DocumentLike, ElementLike } from "./render.ts";
import type { Braid } from "./types.ts";

/**
 * The picture, from what ELK decided.
 *
 * Everything positional comes from `Placed`; this only decides what each
 * thing looks like and the order it is drawn in. The order matters: faces go
 * on after every dot so nothing lands on top of one, and labels go on last.
 */

const SVG = "http://www.w3.org/2000/svg";
/** Where the opening year sits, in from the corner. */
const YEAR_GUTTER = 34;

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

export function drawPlaced(
  placed: Placed,
  braid: Braid,
  doc: DocumentLike,
): ElementLike {
  const { width, height } = placed;
  const along = placed.mode === "river" ? "y" : "x";
  const svg = make(doc, "svg", {
    viewBox: `0 0 ${round(width)} ${round(height)}`,
    width: round(width),
    height: round(height),
    class: `origins-svg is-${placed.mode}`,
    "aria-hidden": "true",
    role: "presentation",
  });

  // --- year markers ---------------------------------------------------------
  // The opening year is pinned to the corner. Each change of year is a dashed
  // line across the picture, between the last moment of one year and the
  // first of the next; moments are spaced by rank, so that is the honest
  // place for it.
  let previousYear: number | undefined;
  let previousAlong = 0;
  for (const placedMoment of braid.moments) {
    const year = new Date(placedMoment.moment.date.start).getUTCFullYear();
    const at = placed.moments.get(placedMoment.moment.id)!;
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

  // --- trunk, then threads over it ------------------------------------------
  const pointsOf = (edge: Placed["edges"][number]) =>
    edge.points.map((p) => [p.x, p.y] as const);

  for (const edge of placed.edges) {
    if (edge.meta.kind !== "trunk") continue;
    svg.appendChild(
      make(doc, "path", {
        class: "origins-trunk",
        d: flow(pointsOf(edge), along),
        "stroke-width": edge.meta.width,
        fill: "none",
      }),
    );
  }
  for (const edge of placed.edges) {
    if (edge.meta.kind !== "thread") continue;
    const kind = edge.meta.member ? "is-member" : "is-guest";
    svg.appendChild(
      make(doc, "path", {
        class: `origins-thread ${kind} is-${edge.meta.segment}`,
        "data-person": edge.meta.slug,
        "data-hue": edge.meta.hue,
        d: flow(pointsOf(edge), along),
        fill: "none",
      }),
    );
  }

  // --- nodes ----------------------------------------------------------------
  for (const placedMoment of braid.moments) {
    const moment = placedMoment.moment;
    const at = placed.moments.get(moment.id)!;
    svg.appendChild(
      make(doc, "circle", {
        class: `origins-node ${moment.trunk ? "is-trunk" : "is-side"} ${
          moment.date.precision === "day" ? "is-exact" : "is-fuzzy"
        }`,
        "data-moment": moment.id,
        cx: round(at.x),
        cy: round(at.y),
        r: moment.trunk ? TRUNK_R : SIDE_R,
      }),
    );
  }

  // --- faces, after every dot -----------------------------------------------
  braid.threads.forEach((thread, index) => {
    const at = placed.roots.get(thread.person.slug);
    if (at === undefined) return;
    const root = make(doc, "g", {
      class: "origins-root",
      "data-person": thread.person.slug,
      "data-hue": hueFor(index),
      transform: `translate(${round(at.x)} ${round(at.y)})`,
    });
    root.appendChild(avatarFor(thread.person, doc));
    svg.appendChild(root);
  });

  // --- labels, where ELK left room for them ---------------------------------
  for (const placedMoment of braid.moments) {
    const label = placed.labels.get(placedMoment.moment.id);
    if (label === undefined) continue;
    const text = make(doc, "text", {
      class: "origins-label",
      x: round(label.x),
      y: round(label.y),
      "text-anchor": label.anchor,
    });
    text.textContent = placedMoment.moment.title;
    svg.appendChild(text);
  }

  return svg;
}
