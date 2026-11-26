import type { Mode } from "./elk.ts";
import { yearMarks } from "./loom-draw.ts";
import { slotKey } from "./loom-place.ts";
import type { Box, LoomPlaced, PlacedLabel, Point } from "./loom-place.ts";
import { EASE } from "./render.ts";
import type { Story } from "./story.ts";

/**
 * Where everything in the loom is, part of the way from its layout in one
 * mode to its layout in the other.
 *
 * Both modes are the same story laid out twice, so every face, moment, bead,
 * label, year mark and thread has a twin in the other. Each moves in a
 * straight line from where it is in one to where it is in the other. A
 * thread is drawn as cubic curves, one for each hop between the points the
 * layout gave, and the two modes give an edge different numbers of points,
 * so each edge's curves are cut until both modes have as many, which changes
 * how neither looks; then every control point moves in a straight line.
 */

export const MORPH_MS = 1200;

/** Cubic ease in and out: 0 at 0, 0.5 at 0.5, 1 at 1. */
export function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** One cubic: where it starts, its two control points, where it ends. */
type Curve = readonly [Point, Point, Point, Point];

/** Part of the way from `a` to `b`, exactly `a` at 0 and exactly `b` at 1. */
const lerp = (a: number, b: number, t: number): number => a * (1 - t) + b * t;
const lerpPoint = (a: Point, b: Point, t: number): Point => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

/** The curves flow() draws through these points. */
function curves(points: readonly Point[], river: boolean): Curve[] {
  const out: Curve[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (river) {
      const reach = (b.y - a.y) * EASE;
      out.push([a, { x: a.x, y: a.y + reach }, { x: b.x, y: b.y - reach }, b]);
    } else {
      const reach = (b.x - a.x) * EASE;
      out.push([a, { x: a.x + reach, y: a.y }, { x: b.x - reach, y: b.y }, b]);
    }
  }
  return out;
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** One curve as two that trace the same line, cut at its middle. */
function halved([p0, p1, p2, p3]: Curve): [Curve, Curve] {
  const a = mid(p0, p1);
  const b = mid(p1, p2);
  const c = mid(p2, p3);
  const ab = mid(a, b);
  const bc = mid(b, c);
  const m = mid(ab, bc);
  return [[p0, a, ab, m], [m, bc, c, p3]];
}

/** The same line in `count` curves, cutting the longest until there are enough. */
function cutTo(list: readonly Curve[], count: number): Curve[] {
  const out = [...list];
  while (out.length < count) {
    let longest = 0;
    let reach = -1;
    out.forEach((c, i) => {
      const d = Math.hypot(c[3].x - c[0].x, c[3].y - c[0].y);
      if (d > reach) {
        reach = d;
        longest = i;
      }
    });
    out.splice(longest, 1, ...halved(out[longest]));
  }
  return out;
}

/** A person's thread in both modes, curve for curve. */
interface ThreadMorph {
  readonly from: readonly Curve[];
  readonly to: readonly Curve[];
  /** Whether each curve starts a new stretch of the thread. */
  readonly starts: readonly boolean[];
}

const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

/**
 * Every key the two maps share, with its value in each, or null when either
 * has a key the other does not.
 */
function paired<T>(
  a: ReadonlyMap<string, T>,
  b: ReadonlyMap<string, T>,
): Array<readonly [string, T, T]> | null {
  if (a.size !== b.size) return null;
  const out: Array<readonly [string, T, T]> = [];
  for (const [key, value] of a) {
    const twin = b.get(key);
    if (twin === undefined) return null;
    out.push([key, value, twin]);
  }
  return out;
}

/**
 * For each person, their thread in both modes, curve for curve, or null when
 * an edge is in only one of them, or is no curve at all in either.
 */
function threadMorphs(from: LoomPlaced, to: LoomPlaced): Map<string, ThreadMorph> | null {
  const key = (e: LoomPlaced["edges"][number]) => `${e.meta.slug}|${e.from}|${e.to}`;
  const edges = paired(
    new Map(from.edges.map((e) => [key(e), e])),
    new Map(to.edges.map((e) => [key(e), e])),
  );
  if (edges === null || edges.length !== from.edges.length || edges.length !== to.edges.length) {
    return null;
  }
  const out = new Map<string, { from: Curve[]; to: Curve[]; starts: boolean[] }>();
  const ends = new Map<string, { from: Point; to: Point }>();

  for (const [, edge, twin] of edges) {
    let a = curves(edge.points, from.mode === "river");
    let b = curves(twin.points, to.mode === "river");
    if (a.length === 0 || b.length === 0) return null;
    const count = Math.max(a.length, b.length);
    a = cutTo(a, count);
    b = cutTo(b, count);

    const slug = edge.meta.slug;
    const thread = out.get(slug) ?? { from: [], to: [], starts: [] };
    out.set(slug, thread);
    // A new stretch wherever this edge does not pick up where the last one
    // ended, in either mode: the first edge, and after a moment its person
    // was away from.
    const last = ends.get(slug);
    const breaks = last === undefined || !same(last.from, a[0][0]) || !same(last.to, b[0][0]);
    a.forEach((curve, i) => {
      thread.from.push(curve);
      thread.to.push(b[i]);
      thread.starts.push(i === 0 && breaks);
    });
    ends.set(slug, { from: a[count - 1][3], to: b[count - 1][3] });
  }
  return out;
}

const r = (n: number) => Math.round(n * 100) / 100;

/** The thread's path part of the way from one mode to the other. */
function threadPath(morph: ThreadMorph, t: number): string {
  let d = "";
  for (let i = 0; i < morph.from.length; i += 1) {
    const a = morph.from[i];
    const b = morph.to[i];
    const at = (k: number) => `${r(lerp(a[k].x, b[k].x, t))},${r(lerp(a[k].y, b[k].y, t))}`;
    if (morph.starts[i]) d += `${d === "" ? "" : " "}M${at(0)}`;
    d += ` C${at(1)} ${at(2)} ${at(3)}`;
  }
  return d;
}

type Tick = { x1: number; y1: number; x2: number; y2: number };

export interface Morph {
  readonly size: readonly [Point, Point];
  readonly threads: ReadonlyMap<string, ThreadMorph>;
  readonly faces: readonly (readonly [string, Point, Point])[];
  readonly boxes: readonly (readonly [string, Box, Box])[];
  /** A moment's avatar, by moment id. */
  readonly avatars: readonly (readonly [string, Point, Point])[];
  readonly beads: readonly (readonly [Point, Point])[];
  readonly labels: readonly (readonly [Point, Point])[];
  readonly ticks: readonly (readonly [Tick, Tick])[];
  readonly years: readonly (readonly [Point, Point])[];
}

/**
 * `labelWidths` is how wide each moment's label text is drawn, by moment id. A label hangs
 * from its end in River and its middle in Subway; with the width both become where the text
 * starts.
 *
 * Null when the two layouts do not pair up: an edge, a face, a moment's box, a moment's
 * avatar or a bead's slot in only one of them, a different number of year marks, or a label
 * with no width. A label in `from` with none in `to` is not one of these: it stays where it is.
 */
export function morphBetween(
  story: Story,
  from: LoomPlaced,
  to: LoomPlaced,
  labelWidths: ReadonlyMap<string, number>,
): Morph | null {
  const threads = threadMorphs(from, to);
  const faces = paired(from.roots, to.roots);
  const boxes = paired(from.boxes, to.boxes);
  const avatars = paired(from.avatars, to.avatars);
  if (threads === null || faces === null || boxes === null || avatars === null) return null;

  const beads: Array<readonly [Point, Point]> = [];
  for (const g of story.moments) {
    for (const p of g.through) {
      if (!p.vouched && !p.away) continue;
      const key = slotKey(g.moment.id, p.slug);
      const a = from.slots.get(key);
      const b = to.slots.get(key);
      if (a === undefined || b === undefined) return null;
      beads.push([a, b]);
    }
  }

  const start = (label: PlacedLabel, width: number): Point => ({
    x: label.anchor === "end" ? label.x - width : label.x - width / 2,
    y: label.y,
  });
  const labels: Array<readonly [Point, Point]> = [];
  for (const g of story.moments) {
    const id = g.moment.id;
    const here = from.labels.get(id);
    if (here === undefined) continue;
    const width = labelWidths.get(id);
    if (width === undefined) return null;
    const twin = to.labels.get(id);
    const a = start(here, width);
    labels.push([a, twin === undefined ? a : start(twin, width)]);
  }

  const marksFrom = yearMarks(from, story);
  const marksTo = yearMarks(to, story);
  if (
    marksFrom.ticks.length !== marksTo.ticks.length ||
    marksFrom.labels.length !== marksTo.labels.length
  ) {
    return null;
  }

  return {
    size: [{ x: from.width, y: from.height }, { x: to.width, y: to.height }],
    threads,
    faces,
    boxes,
    avatars,
    beads,
    labels,
    ticks: marksFrom.ticks.map((tick, i) => [tick, marksTo.ticks[i]] as const),
    years: marksFrom.labels.map((l, i) => [l, marksTo.labels[i]] as const),
  };
}

export interface MorphFrame {
  readonly width: number;
  readonly height: number;
  /** A thread's path, by person. */
  readonly threads: ReadonlyMap<string, string>;
  /** A face's centre, by person. */
  readonly faces: ReadonlyMap<string, Point>;
  /** A moment's box, by moment id. */
  readonly boxes: ReadonlyMap<string, Box>;
  /** The centre of a moment's avatar, by moment id. */
  readonly avatars: ReadonlyMap<string, Point>;
  /** Beads, in the order drawLoom draws them. */
  readonly beads: readonly Point[];
  /** Where each label's text starts, in the order drawLoom draws labels. */
  readonly labels: readonly Point[];
  readonly ticks: readonly { x1: number; y1: number; x2: number; y2: number }[];
  readonly years: readonly Point[];
}

/** `t` is 0 at `from` and 1 at `to`, already eased by the caller. */
export function frameAt(morph: Morph, t: number): MorphFrame {
  const between = ([a, b]: readonly [Point, Point]) => lerpPoint(a, b, t);
  const size = between(morph.size);
  return {
    width: size.x,
    height: size.y,
    threads: new Map([...morph.threads].map(([slug, thread]) => [slug, threadPath(thread, t)])),
    faces: new Map(morph.faces.map(([slug, a, b]) => [slug, lerpPoint(a, b, t)])),
    boxes: new Map(
      morph.boxes.map(([id, a, b]) => [id, {
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        width: lerp(a.width, b.width, t),
        height: lerp(a.height, b.height, t),
      }]),
    ),
    avatars: new Map(morph.avatars.map(([id, a, b]) => [id, lerpPoint(a, b, t)])),
    beads: morph.beads.map(between),
    labels: morph.labels.map(between),
    ticks: morph.ticks.map(([a, b]) => ({
      x1: lerp(a.x1, b.x1, t),
      y1: lerp(a.y1, b.y1, t),
      x2: lerp(a.x2, b.x2, t),
      y2: lerp(a.y2, b.y2, t),
    })),
    years: morph.years.map(([a, b]) => lerpPoint(a, b, t)),
  };
}

/** How far along the map a view is, as shares of how far its box can scroll. */
export interface Shares {
  readonly along: number;
  readonly across: number;
}

const held = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Where a view opens: at the start of the map, in the middle across it, so a
 * picture wider than its box has as much out of sight on one side as on the
 * other.
 */
export const OPENING: Shares = { along: 0, across: 0.5 };

/**
 * `reach` is how far the box can scroll on each axis. Time runs down in River,
 * across in Subway. A box with nowhere to go on an axis has no place of its
 * own on it, so it keeps the share the view `arrived` with: a view carried
 * through a mode that cannot scroll one way comes out where it went in.
 */
export function sharesOf(
  mode: Mode,
  scroll: Point,
  reach: Point,
  arrived: Shares = OPENING,
): Shares {
  const river = mode === "river";
  const along = river ? [scroll.y, reach.y] : [scroll.x, reach.x];
  const across = river ? [scroll.x, reach.x] : [scroll.y, reach.y];
  return {
    along: along[1] === 0 ? arrived.along : held(along[0] / along[1]),
    across: across[1] === 0 ? arrived.across : held(across[0] / across[1]),
  };
}

export function scrollFor(mode: Mode, shares: Shares, reach: Point): Point {
  return mode === "river"
    ? { x: shares.across * reach.x, y: shares.along * reach.y }
    : { x: shares.along * reach.x, y: shares.across * reach.y };
}
