import type { Mode } from "./elk.ts";
import { yearMarks } from "./loom-draw.ts";
import { slotKey } from "./loom-place.ts";
import type { Box, LoomPlaced, PlacedLabel, Point } from "./loom-place.ts";
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

/** How far along the time axis a hop's control points sit, as in flow(). */
const EASE = 0.5;

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
      const ease = (b.y - a.y) * EASE;
      out.push([a, { x: a.x, y: a.y + ease }, { x: b.x, y: b.y - ease }, b]);
    } else {
      const ease = (b.x - a.x) * EASE;
      out.push([a, { x: a.x + ease, y: a.y }, { x: b.x - ease, y: b.y }, b]);
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

/** For each person, their thread in both modes, curve for curve. */
function threadMorphs(from: LoomPlaced, to: LoomPlaced): Map<string, ThreadMorph> {
  const key = (e: LoomPlaced["edges"][number]) => `${e.meta.slug}|${e.from}|${e.to}`;
  const there = new Map(to.edges.map((e) => [key(e), e]));
  const out = new Map<string, { from: Curve[]; to: Curve[]; starts: boolean[] }>();
  const ends = new Map<string, { from: Point; to: Point }>();

  for (const edge of from.edges) {
    const twin = there.get(key(edge));
    if (twin === undefined) continue;
    let a = curves(edge.points, from.mode === "river");
    let b = curves(twin.points, to.mode === "river");
    if (a.length === 0 || b.length === 0) continue;
    const count = Math.max(a.length, b.length);
    a = cutTo(a, count);
    b = cutTo(b, count);

    const slug = edge.meta.slug;
    const thread = out.get(slug) ?? { from: [], to: [], starts: [] };
    out.set(slug, thread);
    // A new stretch wherever this edge does not pick up where the last one
    // ended, in either mode: the first edge, and after a meetup its person
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
  readonly from: LoomPlaced;
  readonly to: LoomPlaced;
  readonly threads: ReadonlyMap<string, ThreadMorph>;
  readonly beads: readonly (readonly [Point, Point])[];
  readonly labels: readonly (readonly [Point, Point])[];
  readonly ticks: readonly (readonly [Tick, Tick])[];
  readonly years: readonly (readonly [Point, Point])[];
}

/**
 * `labelWidths` is how wide each moment's label text is drawn, by moment id. A label hangs
 * from its end in River and its middle in Subway; with the width both become where the text
 * starts.
 */
export function morphBetween(
  story: Story,
  from: LoomPlaced,
  to: LoomPlaced,
  labelWidths: ReadonlyMap<string, number>,
): Morph {
  const beads = story.moments.flatMap((g) =>
    g.through
      .filter((p) => p.vouched || p.away)
      .map((p) => {
        const key = slotKey(g.moment.id, p.slug);
        return [from.slots.get(key)!, to.slots.get(key)!] as const;
      })
  );

  const start = (label: PlacedLabel, width: number): Point => ({
    x: label.anchor === "end" ? label.x - width : label.x - width / 2,
    y: label.y,
  });
  const labels = story.moments.flatMap((g) => {
    const id = g.moment.id;
    const here = from.labels.get(id);
    if (here === undefined) return [];
    const width = labelWidths.get(id)!;
    const twin = to.labels.get(id);
    const a = start(here, width);
    return [[a, twin === undefined ? a : start(twin, width)] as const];
  });

  const marksFrom = yearMarks(from, story);
  const marksTo = yearMarks(to, story);

  return {
    from,
    to,
    threads: threadMorphs(from, to),
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
  /** Beads, in the order drawLoom draws them. */
  readonly beads: readonly Point[];
  /** Where each label's text starts, in the order drawLoom draws labels. */
  readonly labels: readonly Point[];
  readonly ticks: readonly { x1: number; y1: number; x2: number; y2: number }[];
  readonly years: readonly Point[];
}

/** `t` is 0 at `from` and 1 at `to`, already eased by the caller. */
export function frameAt(morph: Morph, t: number): MorphFrame {
  const { from, to } = morph;
  const between = ([a, b]: readonly [Point, Point]) => lerpPoint(a, b, t);
  return {
    width: lerp(from.width, to.width, t),
    height: lerp(from.height, to.height, t),
    threads: new Map([...morph.threads].map(([slug, thread]) => [slug, threadPath(thread, t)])),
    faces: new Map(
      [...from.roots].map(([slug, at]) => [slug, lerpPoint(at, to.roots.get(slug)!, t)]),
    ),
    boxes: new Map(
      [...from.boxes].map(([id, a]) => {
        const b = to.boxes.get(id)!;
        return [id, {
          x: lerp(a.x, b.x, t),
          y: lerp(a.y, b.y, t),
          width: lerp(a.width, b.width, t),
          height: lerp(a.height, b.height, t),
        }];
      }),
    ),
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

/** `reach` is how far the box can scroll on each axis. Time runs down in River, across in Subway. */
export function sharesOf(mode: Mode, scroll: Point, reach: Point): Shares {
  const river = mode === "river";
  const along = river ? [scroll.y, reach.y] : [scroll.x, reach.x];
  const across = river ? [scroll.x, reach.x] : [scroll.y, reach.y];
  return {
    along: along[1] === 0 ? 0 : held(along[0] / along[1]),
    across: across[1] === 0 ? 0.5 : held(across[0] / across[1]),
  };
}

export function scrollFor(mode: Mode, shares: Shares, reach: Point): Point {
  return mode === "river"
    ? { x: shares.across * reach.x, y: shares.along * reach.y }
    : { x: shares.along * reach.x, y: shares.across * reach.y };
}
