import { formatFuzzyDate } from "./dates.ts";
import { resolveCollisions } from "./labels.ts";
import type { LabelBox } from "./labels.ts";
import type { Projection } from "./projections.ts";
import type { Braid, PlacedMoment, Person } from "./types.ts";

/**
 * The slice of the DOM this module uses. The real `document` satisfies it
 * structurally, and so can a recording stub, which is how the renderer is
 * tested without a DOM library.
 */
export interface ElementLike {
  setAttribute(name: string, value: string): void;
  appendChild(child: ElementLike): ElementLike;
  textContent: string;
}

export interface DocumentLike {
  createElementNS(ns: string, qualifiedName: string): ElementLike;
}

const SVG = "http://www.w3.org/2000/svg";
const AVATAR = 18;
const LABEL_WIDTH = 150;
const LABEL_HEIGHT = 14;

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

/** Every lane the picture uses, person lanes and excursion lanes alike. */
export function laneRangeOf(braid: Braid): readonly [number, number] {
  const lanes = [
    0,
    ...braid.threads.map((t) => t.lane),
    ...braid.moments.map((m) => m.lane),
    ...braid.excursions.map((e) => e.lane),
  ];
  return [Math.min(...lanes), Math.max(...lanes)];
}

/**
 * A ringed circular avatar. An empty `imageUrl` falls back to an initial
 * rather than an empty `<image>`, which browsers would resolve against the
 * page URL and fetch.
 */
export function avatarFor(person: Person, doc: DocumentLike): ElementLike {
  const kind = person.member ? "is-member" : "is-guest";
  const group = make(doc, "g", { class: `origins-avatar ${kind}` });

  if (person.imageUrl !== "") {
    group.appendChild(
      make(doc, "image", {
        href: person.imageUrl,
        x: -AVATAR,
        y: -AVATAR,
        width: AVATAR * 2,
        height: AVATAR * 2,
        clip_path: "circle()",
        class: "origins-avatar-image",
      }),
    );
  } else {
    group.appendChild(
      make(doc, "circle", { r: AVATAR, class: "origins-avatar-blank" }),
    );
    const initial = make(doc, "text", {
      class: "origins-avatar-initial",
      "text-anchor": "middle",
      dy: 5,
    });
    initial.textContent = person.name.slice(0, 1).toUpperCase();
    group.appendChild(initial);
  }

  group.appendChild(
    make(doc, "circle", { r: AVATAR, class: "origins-avatar-ring" }),
  );
  return group;
}

function polyline(
  points: readonly (readonly [number, number])[],
): string {
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${round(x)},${round(y)}`)
    .join(" ");
}

const round = (n: number) => Math.round(n * 100) / 100;

export function renderBraid(
  braid: Braid,
  projection: Projection,
  doc: DocumentLike,
): ElementLike {
  const [, , width, height] = projection.viewBox;
  const svg = make(doc, "svg", {
    viewBox: projection.viewBox.join(" "),
    class: `origins-svg is-${projection.mode}`,
    "aria-hidden": "true",
    role: "presentation",
  });

  const place = (m: PlacedMoment) => projection.project(m.t, m.lane);

  // --- trunk, thinning where people are away --------------------------------
  for (const segment of braid.trunk) {
    const present = Math.max(1, segment.joined - segment.away);
    svg.appendChild(
      make(doc, "path", {
        class: "origins-trunk",
        d: polyline([place(segment.from), place(segment.to)]),
        "stroke-width": round(3 + present * 1.6),
        fill: "none",
      }),
    );
  }

  // --- threads --------------------------------------------------------------
  for (const thread of braid.threads) {
    const kind = thread.person.member ? "is-member" : "is-guest";
    for (const segment of thread.segments) {
      // Each segment starts from the person's own lane, so a thread whose
      // first moment sits in somebody else's lane still reads as theirs.
      const origin = projection.project(
        Math.max(0, segment.points[0].t - 0.02),
        thread.lane,
      );
      svg.appendChild(
        make(doc, "path", {
          class: `origins-thread ${kind} is-${segment.kind}`,
          "data-person": thread.person.slug,
          d: polyline([origin, ...segment.points.map(place)]),
          fill: "none",
        }),
      );
    }
    svg.appendChild(
      make(doc, "g", {
        class: "origins-root",
        "data-person": thread.person.slug,
        transform: translate(
          projection.project(
            Math.max(0, thread.segments[0].points[0].t - 0.02),
            thread.lane,
          ),
        ),
      }),
    ).appendChild(avatarFor(thread.person, doc));
  }

  // --- excursions -----------------------------------------------------------
  for (const excursion of braid.excursions) {
    const node = place(excursion.moment);
    const from = place(excursion.from);
    const to = excursion.to === null ? null : place(excursion.to);
    svg.appendChild(
      make(doc, "path", {
        class: "origins-excursion",
        d: to === null
          ? polyline([from, node])
          : polyline([from, node, to]),
        fill: "none",
      }),
    );
  }

  // --- nodes ----------------------------------------------------------------
  for (const moment of braid.moments) {
    const [x, y] = place(moment);
    svg.appendChild(
      make(doc, "circle", {
        class: `origins-node ${moment.moment.trunk ? "is-trunk" : "is-side"} ${
          moment.moment.date.precision === "day" ? "is-exact" : "is-fuzzy"
        }`,
        "data-moment": moment.moment.id,
        cx: round(x),
        cy: round(y),
        r: moment.moment.trunk ? 7 : 4.5,
      }),
    );
  }

  // --- labels, swept apart along the free axis ------------------------------
  const axis = projection.mode === "river" ? "y" : "x";
  const boxes: LabelBox[] = braid.moments.map((moment) => {
    const [x, y] = place(moment);
    const anchor = projection.labelAnchor(moment.lane);
    return {
      id: moment.moment.id,
      x: x + anchor.dx,
      y: y + anchor.dy,
      w: LABEL_WIDTH,
      h: LABEL_HEIGHT,
      anchorX: x,
      anchorY: y,
    };
  });
  const byId = new Map(braid.moments.map((m) => [m.moment.id, m]));

  for (const box of resolveCollisions(boxes, axis)) {
    const moment = byId.get(box.id)!;
    const anchor = projection.labelAnchor(moment.lane);
    const label = make(doc, "text", {
      class: "origins-label",
      x: round(box.x),
      y: round(box.y),
      "text-anchor": anchor.anchor,
    });
    label.textContent = `${moment.moment.title} · ${
      formatFuzzyDate(moment.moment.date)
    }`;
    svg.appendChild(label);
  }

  void width;
  void height;
  return svg;
}

function translate(point: readonly [number, number]): string {
  return `translate(${round(point[0])} ${round(point[1])})`;
}
