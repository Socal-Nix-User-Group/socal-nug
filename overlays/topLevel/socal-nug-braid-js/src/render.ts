import { layoutLabels } from "./labels.ts";
import type { AnchoredBox } from "./labels.ts";
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
/** What a label claims beside its node. projections.ts reserves the same. */
export const LABEL_WIDTH = 150;
const LABEL_HEIGHT = 14;
/** How far a hop's control points sit along the time axis. 0 is a corner. */
const EASE = 0.5;
const YEAR_GUTTER = 34;
/** Pixels between a root avatar and the first node on its thread. */
const ROOT_GAP = AVATAR + 24;

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

/**
 * How many threads can be told apart by colour. Past this, a thread takes the
 * muted slot and identity comes from the roster and from highlight on hover,
 * because forty distinguishable hues do not exist.
 */
export const PALETTE_SIZE = 12;

/** Palette slot for the nth thread, or -1 once the palette runs out. */
export function hueFor(index: number): number {
  return index < PALETTE_SIZE ? index : -1;
}

export interface YearTick {
  readonly year: number;
  readonly t: number;
  /**
   * True when the year actually changes here. The first year is not a
   * boundary: the data simply starts, and drawing a line there would claim
   * the year began where the earliest moment happens to sit.
   */
  readonly boundary: boolean;
}

/**
 * One tick per year that has moments, sitting in the gap before that year's
 * first moment.
 *
 * Spacing is by rank, so there is no linear time axis to hang a real scale on
 * and no position to give a year with nothing in it. A tick per populated year
 * is what rank spacing can honestly say: it tells you which stretch of the
 * picture is which year, and nothing more.
 */
export function yearTicks(
  moments: readonly PlacedMoment[],
): readonly YearTick[] {
  const yearOf = (m: PlacedMoment) =>
    new Date(m.moment.date.start).getUTCFullYear();

  const ticks: YearTick[] = [];
  let previous: PlacedMoment | undefined;

  for (const placed of moments) {
    const year = yearOf(placed);
    if (previous === undefined) {
      ticks.push({ year, t: 0, boundary: false });
    } else if (year !== yearOf(previous)) {
      ticks.push({ year, t: (previous.t + placed.t) / 2, boundary: true });
    }
    previous = placed;
  }

  return ticks;
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
        "clip-path": "circle()",
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

/**
 * A path that eases into and out of every point instead of turning corners.
 *
 * Each hop is a cubic whose control points sit on the time axis, so a hop that
 * stays in one lane is still a straight line while one that changes lane is an
 * S-curve. That is what makes a thread look like it flows into the spine
 * rather than meeting it at an angle.
 */
export function flow(
  points: readonly (readonly [number, number])[],
  axis: "x" | "y",
): string {
  if (points.length === 0) return "";
  let d = `M${round(points[0][0])},${round(points[0][1])}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (axis === "y") {
      const ease = (y1 - y0) * EASE;
      d += ` C${round(x0)},${round(y0 + ease)}` +
        ` ${round(x1)},${round(y1 - ease)}` +
        ` ${round(x1)},${round(y1)}`;
    } else {
      const ease = (x1 - x0) * EASE;
      d += ` C${round(x0 + ease)},${round(y0)}` +
        ` ${round(x1 - ease)},${round(y1)}` +
        ` ${round(x1)},${round(y1)}`;
    }
  }
  return d;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function renderBraid(
  braid: Braid,
  projection: Projection,
  doc: DocumentLike,
): ElementLike {
  const [, , width, height] = projection.viewBox;
  // Intrinsic size as well as a viewBox: Map's canvas is wider than its
  // container on purpose, and the CSS needs a real width to let overflow-x
  // pan to it rather than squashing it to fit.
  const svg = make(doc, "svg", {
    viewBox: projection.viewBox.join(" "),
    width: round(width),
    height: round(height),
    class: `origins-svg is-${projection.mode}`,
    "aria-hidden": "true",
    role: "presentation",
  });

  const place = (m: PlacedMoment) => projection.project(m.t, m.lane);
  const timeAxis = projection.mode === "river" ? "y" : "x";

  // --- year markers ---------------------------------------------------------
  // Dashed ticks across the picture, so the dates stay off the labels but the
  // reader still gets a sense of where in time they are.
  for (const tick of yearTicks(braid.moments)) {
    const [x, y] = projection.project(tick.t, 0);
    if (tick.boundary) {
      svg.appendChild(
        make(doc, "path", {
          class: "origins-year-tick",
          d: timeAxis === "y"
            ? `M0,${round(y)} L${round(width)},${round(y)}`
            : `M${round(x)},0 L${round(x)},${round(height)}`,
          fill: "none",
        }),
      );
    }
    const label = make(doc, "text", {
      class: "origins-year",
      x: timeAxis === "y" ? 6 : round(x) + 6,
      y: timeAxis === "y" ? round(y) - 5 : YEAR_GUTTER - 14,
      "text-anchor": "start",
    });
    label.textContent = String(tick.year);
    svg.appendChild(label);
  }

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
  // Root avatars are collected rather than appended here: they go in last, so
  // a node circle drawn later cannot sit on top of somebody's face.
  const roots: ElementLike[] = [];

  /**
   * A thread's starting point: its own lane, stepped back along the time axis
   * by a fixed number of pixels. Pixels rather than a fraction of the axis,
   * so the avatar clears the first node at any canvas height.
   */
  const originOf = (thread: Braid["threads"][number]) => {
    const first = thread.segments[0].points[0];
    const [laneX, laneY] = projection.project(first.t, thread.lane);
    return timeAxis === "y"
      ? ([laneX, Math.max(0, laneY - ROOT_GAP)] as const)
      : ([Math.max(0, laneX - ROOT_GAP), laneY] as const);
  };

  braid.threads.forEach((thread, index) => {
    const kind = thread.person.member ? "is-member" : "is-guest";
    // Colour comes from a palette slot, not from the slug, so adding a person
    // needs no stylesheet edit. Past the palette, threads go muted and the
    // roster does the identifying instead.
    const hue = String(hueFor(index));
    for (const segment of thread.segments) {
      const points: (readonly [number, number])[] = [];

      if (segment.kind === "excursion") {
        // Whoever is on an excursion is already inside the trunk, so the
        // detour leaves from the spine and returns to it. Starting from their
        // old pre-convergence lane would sweep a line across the whole page.
        const excursion = braid.excursions.find(
          (e) => e.moment.moment.id === segment.points[0].moment.id,
        );
        if (excursion !== undefined) {
          points.push(place(excursion.from));
          points.push(...segment.points.map(place));
          if (excursion.to !== null) {
            points.push(place(excursion.to));
          }
        }
      } else {
        // An approach begins in the person's own lane, so a thread whose
        // first moment sits in somebody else's lane still reads as theirs.
        points.push(originOf(thread));
        points.push(...segment.points.map(place));
        // A thread must visibly reach the spine it joins. Someone recruited at
        // an excursion is named in no trunk moment, so without this their line
        // stops out in the margin while their card says where they joined.
        const joined = thread.joinsTrunkAt;
        const last = segment.points[segment.points.length - 1];
        if (joined !== null && last.moment.id !== joined) {
          const target = braid.moments.find((m) => m.moment.id === joined);
          if (target !== undefined) {
            points.push(place(target));
          }
        }
      }

      if (points.length < 2) continue;
      svg.appendChild(
        make(doc, "path", {
          class: `origins-thread ${kind} is-${segment.kind}`,
          "data-person": thread.person.slug,
          "data-hue": hue,
          d: flow(points, timeAxis),
          fill: "none",
        }),
      );
    }
    const root = make(doc, "g", {
      class: "origins-root",
      "data-person": thread.person.slug,
      "data-hue": hue,
      transform: translate(originOf(thread)),
    });
    root.appendChild(avatarFor(thread.person, doc));
    roots.push(root);
  });

  // --- excursions -----------------------------------------------------------
  for (const excursion of braid.excursions) {
    const node = place(excursion.moment);
    const from = place(excursion.from);
    const to = excursion.to === null ? null : place(excursion.to);
    svg.appendChild(
      make(doc, "path", {
        class: "origins-excursion",
        d: to === null
          ? flow([from, node], timeAxis)
          : flow([from, node, to], timeAxis),
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

  // Faces last, so no node circle can land on top of one.
  for (const root of roots) {
    svg.appendChild(root);
  }

  // --- labels, swept apart along the free axis ------------------------------
  // Below a threshold there is no room for text beside a node, so labels drop
  // and the roster does the naming. A clipped label is worse than none.
  if (!projection.showLabels) {
    return svg;
  }

  const axis = projection.mode === "river" ? "y" : "x";
  const boxes: AnchoredBox[] = braid.moments.map((moment) => {
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
      anchor: anchor.anchor,
    };
  });
  const byId = new Map(braid.moments.map((m) => [m.moment.id, m]));

  for (const box of layoutLabels(boxes, axis, { width, height })) {
    const moment = byId.get(box.id)!;
    const label = make(doc, "text", {
      class: "origins-label",
      x: round(box.x),
      y: round(box.y),
      "text-anchor": box.anchor,
    });
    // Title only. The date lives on the year ticks, which keeps labels short
    // enough to fit and keeps the dates off to the side.
    label.textContent = moment.moment.title;
    svg.appendChild(label);
  }

  return svg;
}

function translate(point: readonly [number, number]): string {
  return `translate(${round(point[0])} ${round(point[1])})`;
}
