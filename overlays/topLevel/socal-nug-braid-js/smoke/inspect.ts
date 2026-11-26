import { AVATAR, LABEL_HEIGHT, LABEL_MAX, labelWidth, MOMENT_AVATAR } from "../src/elk.ts";
import { drawLoom } from "../src/loom-draw.ts";
import { passId, SLOT, slotOffset } from "../src/loom-graph.ts";
import { slotKey } from "../src/loom-place.ts";
import type { Box, LoomPlaced, Point } from "../src/loom-place.ts";
import { frameAt, morphBetween } from "../src/morph.ts";
import type { DocumentLike, ElementLike } from "../src/render.ts";
import type { Story } from "../src/story.ts";

/**
 * What a laid-out loom looks like, read off the placement: whether the layout
 * gave everything a place, whether any thread runs through something that is
 * not its own, how far the ribbon strays from a single column, and whether a
 * thread steps out of the ribbon between two of its stops.
 */

export interface Finding {
  readonly kind: "layout" | "engine";
  readonly message: string;
}

/** A stop on the ribbon: a moment on it, or the pass-through beside a side moment. */
interface RibbonStop {
  /** The node's id: the moment's, or passId() of the moment it passes. */
  readonly node: string;
  /** The moment, which names a pass-through in a finding. */
  readonly moment: string;
  readonly pass: boolean;
  /** Its place in date order. */
  readonly index: number;
  /** Where its first slot is across the time axis, whether or not anyone is in it. */
  readonly slotZero: number;
}

/** Every stop on the ribbon that the placement gave a box, in date order. */
function ribbonStops(story: Story, placed: LoomPlaced): RibbonStop[] {
  const across = (box: Box) => (placed.mode === "river" ? box.x : box.y);
  return story.moments.flatMap((g, index): RibbonStop[] => {
    const id = g.moment.id;
    if (g.onRibbon) {
      const box = placed.boxes.get(id);
      if (box === undefined) return [];
      return [{
        node: id,
        moment: id,
        pass: false,
        index,
        slotZero: across(box) + slotOffset(g.slots, 0),
      }];
    }
    const box = placed.passes.get(id);
    if (box === undefined) return [];
    return [{
      node: passId(id),
      moment: id,
      pass: true,
      index,
      slotZero: across(box) + slotOffset(g.inGroup, 0),
    }];
  });
}

/** The stop on the ribbon whose slot 0 sits furthest from the median of them, and how far. */
function furthestOff(
  story: Story,
  placed: LoomPlaced,
): { stop: RibbonStop; by: number } | null {
  const stops = ribbonStops(story, placed);
  if (stops.length === 0) return null;
  const at = stops.map((s) => s.slotZero);
  const sorted = [...at].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
  let worst = 0;
  at.forEach((x, i) => {
    if (Math.abs(x - median) > Math.abs(at[worst] - median)) worst = i;
  });
  return { stop: stops[worst], by: Math.abs(at[worst] - median) };
}

/**
 * How far any on-ribbon moment's or pass-through's slot 0 sits from the
 * median of them, across the time axis.
 */
export function ribbonSpread(story: Story, placed: LoomPlaced): number {
  return furthestOff(story, placed)?.by ?? 0;
}

export function inspectPlacement(story: Story, placed: LoomPlaced): Finding[] {
  const found: Finding[] = [];

  const off = furthestOff(story, placed);
  if (off !== null && off.by > 1) {
    const where = off.stop.pass
      ? `where it passes ${off.stop.moment}`
      : `at ${off.stop.moment}`;
    found.push({
      kind: "layout",
      message: `the ribbon is ${off.by.toFixed(1)}px off its column ${where}`,
    });
  }

  for (const g of story.moments) {
    if (!placed.moments.has(g.moment.id) || !placed.boxes.has(g.moment.id)) {
      found.push({ kind: "engine", message: `${g.moment.id} has no position` });
    }
    if (g.passing.length > 0 && !placed.passes.has(g.moment.id)) {
      found.push({
        kind: "engine",
        message: `${g.moment.id} has people passing it and no pass-through`,
      });
    }
  }
  for (const t of story.threads) {
    const slug = t.person.slug;
    if (!placed.roots.has(slug)) {
      found.push({ kind: "engine", message: `${slug}'s face has no position` });
    }
    // One edge into each moment on the thread and each pass-through the
    // person runs through, the first from the face. An edge ELK returned
    // without a section is left out of the placement.
    const needs = t.path.length +
      story.moments.filter((g) => g.passing.some((p) => p.slug === slug)).length;
    const edges = placed.edges.filter((e) => e.meta.slug === slug).length;
    if (edges !== needs) {
      found.push({
        kind: "engine",
        message: `${slug} has ${edges} edges and their thread needs ${needs}`,
      });
    }
  }

  // The layout centres a label's box on its moment, across the row in River
  // and over the column in Subway, and an avatar is placed from that box. One
  // out of line with its moment says the box is not where the placement takes
  // it to be.
  for (const [id, at] of placed.avatars) {
    const moment = placed.moments.get(id);
    if (moment === undefined) continue;
    const off = placed.mode === "river" ? Math.abs(at.y - moment.y) : Math.abs(at.x - moment.x);
    if (off > 1) {
      found.push({
        kind: "layout",
        message: `${id}'s avatar is ${off.toFixed(1)}px out of line with its moment`,
      });
    }
  }

  // A hop from one stop on the ribbon to the next stays in the ribbon: no
  // point of it is more than a slot outside its two ends, across the time
  // axis. Someone away from a moment on the ribbon stops at it like everyone
  // else. A hop that skips a moment on the ribbon is someone going around a
  // meetup they are not yet part of, and is meant to step out.
  const stops = new Map(ribbonStops(story, placed).map((s) => [s.node, s]));
  const meetups = story.moments.flatMap((g, i) => (g.onRibbon ? [i] : []));
  const acrossOf = (p: Point) => (placed.mode === "river" ? p.x : p.y);
  for (const edge of placed.edges) {
    const from = stops.get(edge.from);
    const to = stops.get(edge.to);
    if (from === undefined || to === undefined) continue;
    if (meetups.some((i) => i > from.index && i < to.index)) continue;
    const a = acrossOf(edge.points[0]);
    const b = acrossOf(edge.points[edge.points.length - 1]);
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    const out = Math.max(
      ...edge.points.map((p) => Math.max(low - acrossOf(p), acrossOf(p) - high, 0)),
    );
    if (out > SLOT) {
      found.push({
        kind: "layout",
        message: `${edge.meta.slug}'s thread steps ${out.toFixed(1)}px out of the ribbon between ${from.moment} and ${to.moment}`,
      });
    }
  }

  const reported = new Set<string>();
  const report = (slug: string, what: string, x: number, y: number) => {
    const key = `${slug}|${what}`;
    if (reported.has(key)) return;
    reported.add(key);
    found.push({
      kind: "layout",
      message: `${slug}'s thread runs through ${what} near ${x.toFixed(0)},${y.toFixed(0)}`,
    });
  };

  for (const edge of placed.edges) {
    const slug = edge.meta.slug;
    const thread = story.threads.find((t) => t.person.slug === slug);
    const own = new Set(thread?.path.map((g) => g.moment.id));
    for (let i = 1; i < edge.points.length; i += 1) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      for (let k = 0; k <= 20; k += 1) {
        const x = a.x + ((b.x - a.x) * k) / 20;
        const y = a.y + ((b.y - a.y) * k) / 20;
        for (const [id, box] of placed.boxes) {
          if (own.has(id)) continue;
          if (x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height) {
            report(slug, id, x, y);
          }
        }
        for (const [who, root] of placed.roots) {
          if (who === slug) continue;
          if (Math.abs(x - root.x) < AVATAR && Math.abs(y - root.y) < AVATAR) {
            report(slug, `${who}'s face`, x, y);
          }
        }
      }
    }
  }

  return found;
}

// --- the drawn picture ---------------------------------------------------------

export interface Recorded {
  tag: string;
  attrs: Record<string, string>;
  text: string;
  children: Recorded[];
}

/** A `document` that records instead of building a DOM. No DOM library here. */
export function recorder(): { doc: DocumentLike; made: Recorded[] } {
  const made: Recorded[] = [];
  const doc: DocumentLike = {
    createElementNS(_ns: string, tag: string): ElementLike {
      const node: Recorded = { tag, attrs: {}, text: "", children: [] };
      made.push(node);
      const element = {
        node,
        setAttribute(name: string, value: string) {
          node.attrs[name] = value;
        },
        appendChild(child: ElementLike) {
          node.children.push((child as unknown as { node: Recorded }).node);
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

/**
 * Points along a path's `d`. flow() emits one M followed by C commands; a
 * thread's `d` can hold several such runs back to back, each starting with
 * its own M.
 */
export function sample(d: string): Array<readonly [number, number]> {
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

/** One cubic of a path's line as close-set points, and the box its control points span. */
interface Piece {
  readonly points: ReadonlyArray<readonly [number, number]>;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * A path's line, cubic by cubic, each as points no more than about a unit
 * apart along it. A curve lies inside the box of its control points, so a
 * piece whose box is further from a point than something already found can
 * be passed over.
 */
function pieces(d: string): Piece[] {
  const out: Piece[] = [];
  let cur: readonly [number, number] = [0, 0];
  for (const part of d.match(/[MC][^MC]*/g) ?? []) {
    const v = part.slice(1).trim().split(/[\s,]+/).map(Number);
    if (part[0] === "M") {
      cur = [v[0], v[1]];
      continue;
    }
    for (let seg = 0; seg + 6 <= v.length; seg += 6) {
      const [x1, y1, x2, y2, x3, y3] = v.slice(seg, seg + 6);
      const xs = [cur[0], x1, x2, x3];
      const ys = [cur[1], y1, y2, y3];
      const length = Math.hypot(x1 - cur[0], y1 - cur[1]) + Math.hypot(x2 - x1, y2 - y1) +
        Math.hypot(x3 - x2, y3 - y2);
      const steps = Math.max(24, Math.ceil(length));
      const points: Array<readonly [number, number]> = [cur];
      for (let i = 1; i <= steps; i += 1) {
        const k = i / steps;
        const u = 1 - k;
        points.push([
          u * u * u * cur[0] + 3 * u * u * k * x1 + 3 * u * k * k * x2 + k * k * k * x3,
          u * u * u * cur[1] + 3 * u * u * k * y1 + 3 * u * k * k * y2 + k * k * k * y3,
        ]);
      }
      out.push({
        points,
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys),
      });
      cur = [x3, y3];
    }
  }
  return out;
}

/** How far a point is from the segment between two others. */
function toSegment(
  [x, y]: readonly [number, number],
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const k = length === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / length));
  return Math.hypot(x - (ax + k * dx), y - (ay + k * dy));
}

/**
 * The furthest any sampled point of either path is from the other's line.
 * The line is only where a path draws: never across the gap between two of
 * its stretches.
 */
export function apart(a: string, b: string): number {
  const off = (from: string, to: string) => {
    const line = pieces(to);
    let worst = 0;
    for (const p of sample(from)) {
      let best = Infinity;
      // nearest box first, so the rest can mostly be passed over
      const near = line
        .map((piece) => ({
          piece,
          reach: Math.hypot(
            Math.max(piece.left - p[0], p[0] - piece.right, 0),
            Math.max(piece.top - p[1], p[1] - piece.bottom, 0),
          ),
        }))
        .sort((a, b) => a.reach - b.reach);
      for (const { piece, reach } of near) {
        if (reach >= best) break;
        for (let i = 1; i < piece.points.length; i += 1) {
          best = Math.min(best, toSegment(p, piece.points[i - 1], piece.points[i]));
        }
      }
      worst = Math.max(worst, best);
    }
    return worst;
  };
  return Math.max(off(a, b), off(b, a));
}

/**
 * A moment as drawn: a pill, every point within `r`, half its thickness, of
 * the line between the centres of its two round ends. The line runs along
 * the longer side, so it is upright in Subway.
 */
interface Oval {
  readonly id: string;
  readonly r: number;
  /** The line between the centres of its round ends. */
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

const hasClass = (n: Recorded, token: string) =>
  (n.attrs.class ?? "").split(" ").includes(token);

/**
 * How far a rectangle comes to a pill's line, as a multiple of the pill's
 * half thickness: under 1 is inside. The line runs along an axis, so this is
 * the gap between two boxes. A point is a rectangle with no size.
 */
const ovalReach = (
  o: Oval,
  box: { left: number; right: number; top: number; bottom: number },
) =>
  Math.hypot(
    Math.max(o.x1 - box.right, box.left - o.x2, 0),
    Math.max(o.y1 - box.bottom, box.top - o.y2, 0),
  ) / o.r;

const pointAt = (x: number, y: number) => ({ left: x, right: x, top: y, bottom: y });

/** How far the nearest point of a rectangle is from a centre, as a multiple of the radii. */
function rectReach(
  box: { left: number; right: number; top: number; bottom: number },
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): number {
  const nx = Math.min(Math.max(cx, box.left), box.right);
  const ny = Math.min(Math.max(cy, box.top), box.bottom);
  return Math.hypot((nx - cx) / rx, (ny - cy) / ry);
}

/**
 * Whether the drawn picture holds up: everything is on the canvas, no thread
 * runs through an oval or a face that is not its own or into a moment its
 * person is recorded away from, no label is on a face or an oval or under a
 * thread, every filled bead is inside its oval and exactly where the record
 * vouches for the person, and every hollow bead is exactly where the record
 * says they were away.
 */
export function inspectDrawing(
  story: Story,
  placed: LoomPlaced,
  made: readonly Recorded[],
): Finding[] {
  const found: Finding[] = [];
  const layout = (message: string) => found.push({ kind: "layout", message });
  const engine = (message: string) => found.push({ kind: "engine", message });

  const ovals: Oval[] = made
    .filter((n) => n.tag === "g" && hasClass(n, "origins-node"))
    .map((node) => {
      const e = node.children.find((c) => hasClass(c, "origins-oval"))!;
      const left = +e.attrs.x;
      const top = +e.attrs.y;
      const right = left + +e.attrs.width;
      const bottom = top + +e.attrs.height;
      const r = Math.min(right - left, bottom - top) / 2;
      return {
        id: node.attrs["data-moment"],
        r,
        x1: left + r,
        y1: top + r,
        x2: right - r,
        y2: bottom - r,
      };
    });
  const ovalOf = new Map(ovals.map((o) => [o.id, o]));

  const faces = made
    .filter((n) => n.tag === "g" && hasClass(n, "origins-root"))
    .map((n) => {
      const at = n.attrs.transform.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!;
      return { slug: n.attrs["data-person"], x: +at[1], y: +at[2] };
    });

  for (const o of ovals) {
    if (
      o.x1 - o.r < 0 || o.x2 + o.r > placed.width ||
      o.y1 - o.r < 0 || o.y2 + o.r > placed.height
    ) {
      layout(`${o.id}'s oval is off the canvas`);
    }
  }
  for (const f of faces) {
    if (
      f.x - AVATAR < 0 || f.x + AVATAR > placed.width ||
      f.y - AVATAR < 0 || f.y + AVATAR > placed.height
    ) {
      layout(`${f.slug}'s face is off the canvas`);
    }
  }

  // Moments' avatars: exactly one for each moment that carries one, each a
  // disc with nothing else on it.
  const avatars = made
    .filter((n) => n.tag === "g" && hasClass(n, "origins-moment-avatar"))
    .map((n) => {
      const at = n.attrs.transform.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!;
      return { id: n.attrs["data-moment"], x: +at[1], y: +at[2] };
    });
  for (const g of story.moments) {
    const id = g.moment.id;
    const has = avatars.some((a) => a.id === id);
    if (g.moment.avatar !== undefined && !has) {
      engine(`${id} carries an avatar and none is drawn for it`);
    }
    if (g.moment.avatar === undefined && has) {
      engine(`an avatar is drawn for ${id}, which carries none`);
    }
  }
  const R = MOMENT_AVATAR;
  avatars.forEach((a, i) => {
    if (a.x - R < 0 || a.x + R > placed.width || a.y - R < 0 || a.y + R > placed.height) {
      layout(`${a.id}'s avatar is off the canvas`);
    }
    for (const f of faces) {
      if (Math.hypot(a.x - f.x, a.y - f.y) < R + AVATAR) {
        layout(`${a.id}'s avatar sits on ${f.slug}'s face`);
      }
    }
    for (const o of ovals) {
      // nearest point of the oval's spine to the disc's centre
      const nx = Math.min(Math.max(a.x, o.x1), o.x2);
      const ny = Math.min(Math.max(a.y, o.y1), o.y2);
      if (Math.hypot(a.x - nx, a.y - ny) < R + o.r) {
        layout(`${a.id}'s avatar sits on ${o.id}'s oval`);
      }
    }
    for (const b of avatars.slice(i + 1)) {
      if (Math.hypot(a.x - b.x, a.y - b.y) < 2 * R) {
        layout(`${a.id}'s avatar sits on ${b.id}'s avatar`);
      }
    }
  });

  // Labels, at the layout's own measure of their text.
  const labels = made
    .filter((n) => n.tag === "text" && hasClass(n, "origins-label"))
    .map((n) => {
      const x = +n.attrs.x;
      const y = +n.attrs.y;
      // A label drawn at a set length is that long. Any other is taken to
      // fill the room the layout kept for it.
      const width = n.attrs.textLength === undefined ? labelWidth(n.text) : +n.attrs.textLength;
      const anchor = n.attrs["text-anchor"];
      const left = anchor === "end"
        ? x - width
        : anchor === "middle"
        ? x - width / 2
        : x;
      return {
        text: n.text,
        width,
        left,
        right: left + width,
        top: y - LABEL_HEIGHT,
        bottom: y,
      };
    });
  for (const box of labels) {
    if (box.width > LABEL_MAX) {
      layout(
        `the label "${box.text}" is wider than the ${LABEL_MAX}px it may claim`,
      );
    }
    if (
      box.left < 0 || box.right > placed.width ||
      box.top < 0 || box.bottom > placed.height
    ) {
      layout(`the label "${box.text}" runs off the canvas`);
    }
    for (const f of faces) {
      if (rectReach(box, f.x, f.y, AVATAR, AVATAR) < 1) {
        layout(`the label "${box.text}" sits on ${f.slug}'s face`);
      }
    }
    for (const o of ovals) {
      if (ovalReach(o, box) < 1) {
        layout(`the label "${box.text}" sits on ${o.id}'s oval`);
      }
    }
    for (const a of avatars) {
      if (rectReach(box, a.x, a.y, R, R) < 1) {
        layout(`the label "${box.text}" sits on ${a.id}'s avatar`);
      }
    }
  }

  // Threads, along the curve that is drawn.
  const reported = new Set<string>();
  const report = (
    kind: Finding["kind"],
    slug: string,
    what: string,
    x: number,
    y: number,
  ) => {
    const key = `${slug}|${what}`;
    if (reported.has(key)) return;
    reported.add(key);
    found.push({
      kind,
      message: `${slug}'s thread runs through ${what} near ${x.toFixed(0)},${
        y.toFixed(0)
      }`,
    });
  };
  // Every recorded absence: someone the record lists away from a moment they
  // are through, a meetup or any other. Their thread breaks either side of
  // it, so no part of it is in the moment's box, and a hollow bead sits in
  // their slot.
  const absences = story.moments.flatMap((g) =>
    (g.moment.away ?? [])
      .filter((slug) => g.through.some((p) => p.slug === slug))
      .map((slug) => ({ id: g.moment.id, slug }))
  );

  for (const path of made) {
    if (path.tag !== "path" || !hasClass(path, "origins-thread")) continue;
    const slug = path.attrs["data-person"];
    const own = new Set(
      story.threads.find((t) => t.person.slug === slug)?.path.map((g) =>
        g.moment.id
      ),
    );
    const away = absences.filter((a) => a.slug === slug);
    for (const [x, y] of sample(path.attrs.d)) {
      for (const o of ovals) {
        if (own.has(o.id) || ovalReach(o, pointAt(x, y)) >= 1) continue;
        report("layout", slug, `${o.id}'s oval`, x, y);
      }
      for (const a of away) {
        const box = placed.boxes.get(a.id)!;
        if (x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height) {
          report(
            "engine",
            slug,
            `${a.id}, which they are recorded away from,`,
            x,
            y,
          );
        }
      }
      for (const f of faces) {
        if (f.slug !== slug && Math.hypot(x - f.x, y - f.y) < AVATAR) {
          report("layout", slug, `${f.slug}'s face`, x, y);
        }
      }
      for (const box of labels) {
        if (x > box.left && x < box.right && y > box.top && y < box.bottom) {
          report("layout", slug, `the label "${box.text}"`, x, y);
        }
      }
      for (const a of avatars) {
        if (Math.hypot(x - a.x, y - a.y) < R) {
          report("layout", slug, `${a.id}'s avatar`, x, y);
        }
      }
    }
  }

  // Beads: a filled one exactly where the record vouches, each inside its own
  // oval, and a hollow one exactly where it records an absence.
  const beadsOf = (hollow: boolean) =>
    made
      .filter((n) =>
        n.tag === "circle" && hasClass(n, "origins-bead") &&
        hasClass(n, "is-away") === hollow
      )
      .map((n) => ({
        slug: n.attrs["data-person"],
        x: +n.attrs.cx,
        y: +n.attrs.cy,
        matched: false,
      }));
  const beads = beadsOf(false);
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

  const hollow = beadsOf(true);
  for (const a of absences) {
    const at = placed.slots.get(slotKey(a.id, a.slug))!;
    const bead = hollow.find((b) =>
      !b.matched && b.slug === a.slug && near(b.x, at.x) && near(b.y, at.y)
    );
    if (bead === undefined) {
      engine(`${a.slug} is recorded away from ${a.id} and has no hollow bead there`);
    } else {
      bead.matched = true;
    }
  }
  for (const b of hollow) {
    if (b.matched) continue;
    engine(
      `${b.slug} has a hollow bead at ${b.x.toFixed(0)},${b.y.toFixed(0)} and is not recorded away there`,
    );
  }

  const vouched: Array<{ id: string; slug: string; x: number; y: number }> = [];
  for (const g of story.moments) {
    for (const p of g.through) {
      if (!p.vouched) continue;
      const at = placed.slots.get(slotKey(g.moment.id, p.slug))!;
      vouched.push({ id: g.moment.id, slug: p.slug, x: at.x, y: at.y });
      const bead = beads.find((b) =>
        !b.matched && b.slug === p.slug && near(b.x, at.x) && near(b.y, at.y)
      );
      if (bead === undefined) {
        engine(`${p.slug} is vouched for at ${g.moment.id} and has no bead there`);
      } else {
        bead.matched = true;
        if (ovalReach(ovalOf.get(g.moment.id)!, pointAt(bead.x, bead.y)) >= 1) {
          engine(
            `${p.slug}'s bead at ${bead.x.toFixed(0)},${bead.y.toFixed(0)} is outside the oval of ${g.moment.id}`,
          );
        }
      }
    }
  }
  for (const b of beads) {
    if (b.matched) continue;
    const where = `${b.x.toFixed(0)},${b.y.toFixed(0)}`;
    const nearest = vouched
      .filter((v) => v.slug === b.slug)
      .sort((p, q) =>
        Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y)
      )[0];
    if (nearest === undefined) {
      engine(`${b.slug} has a bead at ${where} and no record vouches for them anywhere`);
    } else if (ovalReach(ovalOf.get(nearest.id)!, pointAt(b.x, b.y)) >= 1) {
      engine(`${b.slug}'s bead at ${where} is outside the oval of ${nearest.id}`);
    } else {
      engine(`${b.slug} has a bead at ${where} where the record does not vouch for them`);
    }
  }

  return found;
}

// --- the morph between the two modes -------------------------------------------

/** Whether two lists of numbers are as long as each other and agree to within a hundredth. */
const agree = (a: readonly number[][], b: readonly number[][]) =>
  a.length === b.length &&
  a.every((p, i) => p.length === b[i].length && p.every((n, k) => Math.abs(n - b[i][k]) <= 0.01));

const MODE_NAME = { river: "River", subway: "Subway" } as const;

/**
 * Whether the morph between the two layouts starts on the drawing of the one
 * being left and ends on the drawing of the one arrived at, both ways: the
 * layouts pair up, each thread traces the drawn one and is broken where it
 * is, and the avatars, beads, labels and year marks are where they are drawn.
 */
export function inspectMorph(
  story: Story,
  river: LoomPlaced,
  subway: LoomPlaced,
): Finding[] {
  const found: Finding[] = [];
  const engine = (message: string) => found.push({ kind: "engine", message });
  // No text can be measured outside a browser, so each label is as wide as
  // the room the layout reserved for it.
  const widths = new Map(
    story.moments.flatMap((g) => {
      const label = river.labels.get(g.moment.id) ?? subway.labels.get(g.moment.id);
      return label === undefined ? [] : [[g.moment.id, labelWidth(label.text)] as const];
    }),
  );
  const draw = (placed: LoomPlaced) => {
    const { doc, made } = recorder();
    drawLoom(placed, story, doc);
    return made;
  };
  const moves = (d: string) => d.match(/M/g)?.length ?? 0;
  const threadsOf = (made: Recorded[]) =>
    new Map(
      made
        .filter((n) => n.tag === "path" && hasClass(n, "origins-thread"))
        .map((n) => [n.attrs["data-person"], n.attrs.d]),
    );
  const beadsOf = (made: Recorded[]) =>
    made
      .filter((n) => n.tag === "circle" && hasClass(n, "origins-bead"))
      .map((n) => [+n.attrs.cx, +n.attrs.cy]);
  const ticksOf = (made: Recorded[]) =>
    made
      .filter((n) => hasClass(n, "origins-year-tick"))
      .map((n) => n.attrs.d.slice(1).split(/[\sL,]+/).map(Number));
  const yearsOf = (made: Recorded[]) =>
    made
      .filter((n) => n.tag === "text" && hasClass(n, "origins-year"))
      .map((n) => [+n.attrs.x, +n.attrs.y]);
  // Moments' avatars, in the order of their moments' ids, so the morph's and
  // the drawing's can be laid side by side.
  const byId = (a: readonly [string, ...number[]], b: readonly [string, ...number[]]) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  const avatarsOf = (made: Recorded[]) =>
    made
      .filter((n) => n.tag === "g" && hasClass(n, "origins-moment-avatar"))
      .map((n) => {
        const at = n.attrs.transform.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!;
        return [n.attrs["data-moment"], +at[1], +at[2]] as const;
      })
      .sort(byId)
      .map(([, x, y]) => [x, y]);
  const avatarsAt = (frame: { avatars: ReadonlyMap<string, Point> }) =>
    [...frame.avatars]
      .map(([id, p]) => [id, p.x, p.y] as const)
      .sort(byId)
      .map(([, x, y]) => [x, y]);
  // Where each drawn label's text starts, by moment: drawLoom draws them in
  // the story's order, one for each moment the layout gave a label.
  const labelsOf = (placed: LoomPlaced, made: Recorded[]) => {
    const ids = story.moments.flatMap((g) => (placed.labels.has(g.moment.id) ? [g.moment.id] : []));
    const texts = made.filter((n) => n.tag === "text" && hasClass(n, "origins-label"));
    return new Map(texts.map((n, i) => {
      const x = +n.attrs.x;
      const width = labelWidth(n.text);
      const start = n.attrs["text-anchor"] === "end" ? x - width : x - width / 2;
      return [ids[i], [start, +n.attrs.y]];
    }));
  };

  for (const [from, to] of [[river, subway], [subway, river]] as const) {
    const way = `the morph from ${MODE_NAME[from.mode]} to ${MODE_NAME[to.mode]}`;
    const morph = morphBetween(story, from, to, widths);
    if (morph === null) {
      engine(`${way} could not pair the two layouts up`);
      continue;
    }
    const left = draw(from);
    const arrived = draw(to);
    const leftThreads = threadsOf(left);
    const arrivedThreads = threadsOf(arrived);
    const start = frameAt(morph, 0);
    const middle = frameAt(morph, 0.5);
    const end = frameAt(morph, 1);

    for (const [slug, drawnLeft] of leftThreads) {
      const drawnArrived = arrivedThreads.get(slug) ?? "";
      const at0 = start.threads.get(slug);
      const at1 = end.threads.get(slug);
      const atHalf = middle.threads.get(slug);
      if (at0 === undefined || at1 === undefined || atHalf === undefined) {
        engine(`${slug}'s thread is not in ${way}`);
        continue;
      }
      const off0 = apart(at0, drawnLeft);
      if (off0 > 0.05) {
        engine(`${slug}'s thread at the start of ${way} is ${off0.toFixed(2)}px off its drawing`);
      }
      const off1 = apart(at1, drawnArrived);
      if (off1 > 0.05) {
        engine(`${slug}'s thread at the end of ${way} is ${off1.toFixed(2)}px off its drawing`);
      }
      const drawnMoves = [moves(drawnLeft), moves(drawnArrived)];
      for (const [when, d, expected] of [
        ["the start", at0, [drawnMoves[0]]],
        ["half way", atHalf, drawnMoves],
        ["the end", at1, [drawnMoves[1]]],
      ] as const) {
        if (expected.some((n) => n !== moves(d))) {
          engine(
            `${slug}'s thread is in ${moves(d)} stretches at ${when} of ${way} and drawn in ${
              expected.join(" and ")
            }`,
          );
        }
      }
    }

    const leftLabels = labelsOf(from, left);
    const arrivedLabels = labelsOf(to, arrived);
    const labelIds = story.moments.flatMap((g) => (from.labels.has(g.moment.id) ? [g.moment.id] : []));
    const pairs = (points: readonly Point[]) => points.map((p) => [p.x, p.y]);
    for (
      const [when, frame, made, labels] of [
        ["the start", start, left, labelIds.map((id) => leftLabels.get(id) ?? [])],
        [
          "the end",
          end,
          arrived,
          // a label with no twin in the layout arrived at stays where it was
          labelIds.map((id, i) => arrivedLabels.get(id) ?? [start.labels[i].x, start.labels[i].y]),
        ],
      ] as const
    ) {
      const checks: Array<[string, number[][], number[][]]> = [
        ["avatars", avatarsAt(frame), avatarsOf(made)],
        ["beads", pairs(frame.beads), beadsOf(made)],
        ["labels", pairs(frame.labels), labels],
        ["year lines", frame.ticks.map((t) => [t.x1, t.y1, t.x2, t.y2]), ticksOf(made)],
        ["years", pairs(frame.years), yearsOf(made)],
      ];
      for (const [what, morphed, drawn] of checks) {
        if (!agree(morphed, drawn)) engine(`the ${what} at ${when} of ${way} are not where they are drawn`);
      }
    }
  }
  return found;
}

const LAYOUT_ENDING = "This is a fault in how the picture was laid out for the " +
  "data as it now stands. Nothing in your change is mistaken. It needs a " +
  "maintainer who knows the layout engine in overlays/topLevel/socal-nug-braid-js.";
const MADE_UP_ENDING = "This history is made up from a fixed seed, so only a change to the layout engine in overlays/topLevel/socal-nug-braid-js can have caused it.";
const ENGINE_ENDING = "This is a bug in the engine, not in the data.";

/**
 * A finding as the check prints it. On a made-up history no change to the
 * data can have caused a layout finding, so it does not say so to an author.
 */
export function explain(finding: Finding, madeUp = false): string {
  const ending = finding.kind === "engine"
    ? ENGINE_ENDING
    : madeUp
    ? MADE_UP_ENDING
    : LAYOUT_ENDING;
  return `${finding.message}. ${ending}`;
}
