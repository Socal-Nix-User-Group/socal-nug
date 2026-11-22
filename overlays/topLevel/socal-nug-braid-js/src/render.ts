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
/** How late a thread jogs out of its column, as a fraction of the time axis. */
const JOG = 0.011;

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

/** Shortest distance from a point to a polyline. Infinity for an empty one. */
export function distanceToPath(
  point: readonly [number, number],
  path: readonly (readonly [number, number])[],
): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i += 1) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const dx = bx - ax;
    const dy = by - ay;
    const span = dx * dx + dy * dy;
    const along = span === 0
      ? 0
      : Math.min(
        1,
        Math.max(0, ((point[0] - ax) * dx + (point[1] - ay) * dy) / span),
      );
    best = Math.min(
      best,
      Math.hypot(point[0] - (ax + along * dx), point[1] - (ay + along * dy)),
    );
  }
  return best;
}

/**
 * How a blocked avatar slides along its own column: step size, how far it may
 * close on its own first moment, and how far it may back away from it.
 */
const ROOT_SLIDE = 3;
const ROOT_SLIDE_IN = 12;
const ROOT_SLIDE_OUT = 48;

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

  /**
   * Hold the column, then jog across at the last moment.
   *
   * Drawing straight from one point to the next makes a thread drift
   * diagonally across everything in between, which is unreadable once there is
   * a gap of a few years. git's graph stays in its column and turns only where
   * something happens, and that is most of why it is legible.
   */
  const holdThenJog = (steps: readonly { t: number; lane: number }[]) => {
    const out: Array<readonly [number, number]> = [];
    steps.forEach((step, i) => {
      const previous = steps[i - 1];
      if (previous !== undefined && previous.lane !== step.lane) {
        const gap = step.t - previous.t;
        out.push(
          projection.project(step.t - Math.min(JOG, gap / 2), previous.lane),
        );
      }
      out.push(projection.project(step.t, step.lane));
    });
    return out;
  };

  /**
   * A detour: out from the spine, a straight run with the moment in the
   * middle of it, and back.
   *
   * Hold-then-jog is wrong for this. It would jog out onto the dot and then
   * hold the detour lane all the way to the next trunk moment, which reads as
   * arriving at the dot and waiting there. The run is as long as the shorter
   * of the gaps either side of the moment allows, so it is symmetric about
   * the dot. A detour with no trunk moment after it runs up to the dot and
   * stops.
   *
   * Somebody already in the group leaves the spine and returns to it. Somebody
   * not yet in it leaves their own lane and returns there, or to the spine
   * when the meetup the detour ends at is the one they joined.
   */
  const detour = (
    excursion: Braid["excursions"][number],
    leaveFrom = 0,
    returnTo = leaveFrom,
  ) => {
    const { from, to, lane } = excursion;
    const node = excursion.moment;
    const before = node.t - from.t;
    const after = to === null ? before : to.t - node.t;
    const reach = Math.min(before, after);
    const jog = Math.min(JOG, reach / 2);
    const half = reach - jog;

    const out: Array<readonly [number, number]> = [
      projection.project(from.t, leaveFrom),
    ];
    // only when there is a run along the lane before leaving it
    if (node.t - half - jog > from.t) {
      out.push(projection.project(node.t - half - jog, leaveFrom));
    }
    out.push(projection.project(node.t - half, lane));
    if (to === null) {
      out.push(projection.project(node.t, lane));
    } else {
      out.push(
        projection.project(node.t + half, lane),
        projection.project(node.t + half + jog, returnTo),
        projection.project(to.t, returnTo),
      );
    }
    return out;
  };

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
    // The opening year is not a boundary, so it is pinned to the corner of the
    // canvas rather than projected. Sitting it at the first moment put it a
    // couple of dozen pixels from the next year's line, which read as two
    // boundaries rather than a start and a boundary.
    const label = make(doc, "text", {
      class: `origins-year ${tick.boundary ? "is-boundary" : "is-opening"}`,
      x: tick.boundary && timeAxis === "x" ? round(x) + 6 : 6,
      y: tick.boundary && timeAxis === "y" ? round(y) - 5 : YEAR_GUTTER - 14,
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

  // ROOT_GAP is in pixels; express it as a slice of the time axis so the
  // thread's first step can be given in (t, lane) like every other step.
  const alongPixels = timeAxis === "y" ? height : width;
  const originBack = ROOT_GAP / Math.max(1, alongPixels - 2 * ROOT_GAP);

  /** Every pixel point one thread is drawn through, segment by segment. */
  const traceOf = (thread: Braid["threads"][number]) =>
    thread.segments.map((segment) => {
      const visitOf = (point: PlacedMoment) =>
        braid.excursions.find((e) => e.moment.moment.id === point.moment.id);

      if (segment.kind === "excursion") {
        // Whoever is on an excursion is already inside the trunk, so the
        // detour leaves from the spine and returns to it. Starting from their
        // old pre-convergence lane would sweep a line across the whole page.
        const excursion = visitOf(segment.points[0]);
        if (excursion === undefined) {
          return { segment, points: [] as (readonly [number, number])[] };
        }
        return { segment, points: detour(excursion) };
      }

      // An approach begins in the person's own lane, so a thread whose first
      // moment sits in somebody else's lane still reads as theirs.
      const first = segment.points[0];
      let lane = thread.lane;
      let steps: Array<{ t: number; lane: number }> = [
        { t: Math.max(0, first.t - originBack), lane },
      ];
      const out: Array<readonly [number, number]> = [];
      // after a detour, the first step is the detour's last point again
      let resumed = false;
      const flush = () => {
        out.push(...holdThenJog(steps).slice(resumed ? 1 : 0));
      };

      for (const point of segment.points) {
        const visit = visitOf(point);
        if (visit === undefined) {
          steps.push({ t: point.t, lane: point.lane });
          lane = point.lane;
          continue;
        }
        // Somebody not yet in the group, at a detour. The same shape as
        // everyone else there, but from their own lane and back to it rather
        // than from the spine. Treating the dot as a plain step held the
        // detour lane afterwards, which the allocator had never given them,
        // and parked them on whatever detour reused that lane next. That read
        // as their having been there too.
        const back =
          visit.to !== null && visit.to.moment.id === thread.joinsTrunkAt
            ? 0
            : lane;
        steps.push({ t: visit.from.t, lane });
        flush();
        out.push(...detour(visit, lane, back).slice(1));
        lane = visit.to === null ? visit.lane : back;
        steps = [{ t: visit.to === null ? visit.moment.t : visit.to.t, lane }];
        resumed = true;
      }

      // A thread must visibly reach the spine it joins. Someone recruited at
      // an excursion is named in no trunk moment, so without this their line
      // stops out in the margin while their card says where they joined.
      const joined = thread.joinsTrunkAt;
      const last = segment.points[segment.points.length - 1];
      if (joined !== null && last.moment.id !== joined) {
        const target = braid.moments.find((m) => m.moment.id === joined);
        if (target !== undefined) {
          steps.push({ t: target.t, lane: target.lane });
        }
      }
      flush();
      return { segment, points: out };
    });

  // A column one person frees and the next one takes is the whole point of the
  // git-style allocator, but it leaves the newcomer's face parked in a column
  // somebody else's line is still running down, and a line through a face
  // reads as a connection that is not there. So a face that lands on another
  // thread steps aside, across the lanes, and its own line starts from where
  // it moved to.
  const traces = braid.threads.map(traceOf);
  const laneAxis = timeAxis === "y" ? 0 : 1;

  const originFor = (
    thread: Braid["threads"][number],
    index: number,
    taken: readonly (readonly [number, number])[],
  ): readonly [number, number] => {
    const start = originOf(thread);
    const others = traces
      .filter((_, i) => i !== index)
      .flatMap((segments) => segments.map((s) => s.points));
    const clear = (point: readonly [number, number]) =>
      others.every((path) => distanceToPath(point, path) >= AVATAR + 2) &&
      taken.every((other) =>
        Math.hypot(point[0] - other[0], point[1] - other[1]) >= AVATAR * 2
      );

    if (clear(start)) return start;

    // Slide along the person's own column, towards the dot the face belongs
    // to. What the picture gets from the git-style allocator is that
    // everything lines up in columns, and a face that steps sideways out of
    // its column to dodge a line gives that up for a overlap of a few pixels.
    // Sliding keeps the face above its own first moment and just shortens the
    // lead-in, so there is nothing to notice.
    const timeIndex = laneAxis === 0 ? 1 : 0;
    const at = (offset: number): readonly [number, number] => {
      const moved: [number, number] = [start[0], start[1]];
      moved[timeIndex] = Math.max(start[timeIndex] + offset, AVATAR);
      return moved;
    };
    // Towards the dot first and only a little, because past that the face
    // starts to crowd the dot it belongs to; then away from it, where the
    // lead-in simply gets longer and there is far more room to find.
    const offsets: number[] = [];
    for (let d = ROOT_SLIDE; d <= ROOT_SLIDE_IN; d += ROOT_SLIDE) {
      offsets.push(d);
    }
    for (let d = ROOT_SLIDE; d <= ROOT_SLIDE_OUT; d += ROOT_SLIDE) {
      offsets.push(-d);
    }
    for (const offset of offsets) {
      const moved = at(offset);
      if (clear(moved)) return moved;
    }
    return start;
  };

  const origins: Array<readonly [number, number]> = [];
  braid.threads.forEach((thread, index) => {
    origins.push(originFor(thread, index, origins));
  });

  braid.threads.forEach((thread, index) => {
    const kind = thread.person.member ? "is-member" : "is-guest";
    // Colour comes from a palette slot, not from the slug, so adding a person
    // needs no stylesheet edit. Past the palette, threads go muted and the
    // roster does the identifying instead.
    const hue = String(hueFor(index));
    traces[index].forEach(({ segment, points }, position) => {
      if (points.length < 2) return;
      // The face moved, so the line it starts has to start there too.
      const drawn = position === 0 && segment.kind !== "excursion"
        ? [origins[index], ...points.slice(1)]
        : points;
      svg.appendChild(
        make(doc, "path", {
          class: `origins-thread ${kind} is-${segment.kind}`,
          "data-person": thread.person.slug,
          "data-hue": hue,
          d: flow(drawn, timeAxis),
          fill: "none",
        }),
      );
    });
    const root = make(doc, "g", {
      class: "origins-root",
      "data-person": thread.person.slug,
      "data-hue": hue,
      transform: translate(origins[index]),
    });
    root.appendChild(avatarFor(thread.person, doc));
    roots.push(root);
  });

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

  // Faces and node circles are already on the canvas, so the sweep has to know
  // they are there. Resolving labels against other labels only is what let
  // "Rob finds Nix" sit across Daniel's face.
  const obstacles = [
    ...origins.map(([x, y]) => ({
      x: x - AVATAR,
      y: y - AVATAR,
      w: AVATAR * 2,
      h: AVATAR * 2,
    })),
    ...braid.moments.map((moment) => {
      const [x, y] = place(moment);
      const r = moment.moment.trunk ? 7 : 4.5;
      return { x: x - r, y: y - r, w: r * 2, h: r * 2 };
    }),
  ];

  for (const box of layoutLabels(boxes, axis, { width, height }, obstacles)) {
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
