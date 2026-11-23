import { AVATAR, LABEL_HEIGHT, LABEL_MAX, labelWidth } from "../src/elk.ts";
import { slotOffset } from "../src/loom-graph.ts";
import { slotKey } from "../src/loom-place.ts";
import type { LoomPlaced } from "../src/loom-place.ts";
import type { DocumentLike, ElementLike } from "../src/render.ts";
import type { Story } from "../src/story.ts";

/**
 * What a laid-out loom looks like, read off the placement: whether the layout
 * gave everything a place, whether any thread runs through something that is
 * not its own, and how far the ribbon strays from a single column.
 */

export interface Finding {
  readonly kind: "layout" | "engine";
  readonly message: string;
}

/** Where a moment's first slot is across the time axis, whether or not anyone is in it. */
function slotZero(story: Story, placed: LoomPlaced, id: string): number {
  const box = placed.boxes.get(id)!;
  const slots = story.moments.find((g) => g.moment.id === id)!.slots;
  return (placed.mode === "river" ? box.x : box.y) + slotOffset(slots, 0);
}

/** The on-ribbon moment whose slot 0 sits furthest from the median of them, and how far. */
function furthestOff(
  story: Story,
  placed: LoomPlaced,
): { id: string; by: number } | null {
  const ids = story.moments
    .filter((g) => g.onRibbon && placed.boxes.has(g.moment.id))
    .map((g) => g.moment.id);
  if (ids.length === 0) return null;
  const at = ids.map((id) => slotZero(story, placed, id));
  const sorted = [...at].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
  let worst = 0;
  at.forEach((x, i) => {
    if (Math.abs(x - median) > Math.abs(at[worst] - median)) worst = i;
  });
  return { id: ids[worst], by: Math.abs(at[worst] - median) };
}

/** How far any on-ribbon moment's slot 0 sits from the median of them, across the time axis. */
export function ribbonSpread(story: Story, placed: LoomPlaced): number {
  return furthestOff(story, placed)?.by ?? 0;
}

export function inspectPlacement(story: Story, placed: LoomPlaced): Finding[] {
  const found: Finding[] = [];

  const off = furthestOff(story, placed);
  if (off !== null && off.by > 1) {
    found.push({
      kind: "layout",
      message: `the ribbon is ${off.by.toFixed(1)}px off its column at ${off.id}`,
    });
  }

  for (const g of story.moments) {
    if (!placed.moments.has(g.moment.id) || !placed.boxes.has(g.moment.id)) {
      found.push({ kind: "engine", message: `${g.moment.id} has no position` });
    }
  }
  for (const t of story.threads) {
    if (!placed.roots.has(t.person.slug)) {
      found.push({ kind: "engine", message: `${t.person.slug}'s face has no position` });
    }
    if (!placed.edges.some((e) => e.meta.slug === t.person.slug)) {
      found.push({ kind: "engine", message: `${t.person.slug} has no edge` });
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

/** Points along a path's `d`. flow() emits one M followed by C commands. */
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

interface Oval {
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

const hasClass = (n: Recorded, token: string) =>
  (n.attrs.class ?? "").split(" ").includes(token);

/** Where a point sits against an ellipse: under 1 is inside. */
const ovalReach = (o: Oval, x: number, y: number) =>
  ((x - o.cx) / o.rx) ** 2 + ((y - o.cy) / o.ry) ** 2;

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
 * runs through an oval or a face that is not its own, no label is on a face or
 * an oval or under a thread, and every bead is inside its oval and exactly
 * where the record vouches for the person.
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
      return {
        id: node.attrs["data-moment"],
        cx: +e.attrs.cx,
        cy: +e.attrs.cy,
        rx: +e.attrs.rx,
        ry: +e.attrs.ry,
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
      o.cx - o.rx < 0 || o.cx + o.rx > placed.width ||
      o.cy - o.ry < 0 || o.cy + o.ry > placed.height
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

  // Labels, at the layout's own measure of their text.
  const labels = made
    .filter((n) => n.tag === "text" && hasClass(n, "origins-label"))
    .map((n) => {
      const x = +n.attrs.x;
      const y = +n.attrs.y;
      const width = labelWidth(n.text);
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
      if (rectReach(box, o.cx, o.cy, o.rx, o.ry) < 1) {
        layout(`the label "${box.text}" sits on ${o.id}'s oval`);
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
  const awayFrom = (id: string, slug: string) =>
    story.moments.find((g) => g.moment.id === id)?.moment.away?.includes(slug) ??
      false;

  for (const path of made) {
    if (path.tag !== "path" || !hasClass(path, "origins-thread")) continue;
    const slug = path.attrs["data-person"];
    const own = new Set(
      story.threads.find((t) => t.person.slug === slug)?.path.map((g) =>
        g.moment.id
      ),
    );
    for (const [x, y] of sample(path.attrs.d)) {
      for (const o of ovals) {
        if (own.has(o.id) || ovalReach(o, x, y) >= 1) continue;
        if (awayFrom(o.id, slug)) {
          report(
            "engine",
            slug,
            `${o.id}, which they are recorded away from,`,
            x,
            y,
          );
        } else {
          report("layout", slug, `${o.id}'s oval`, x, y);
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
    }
  }

  // Beads: one exactly where the record vouches, each inside its own oval.
  const beads = made
    .filter((n) => n.tag === "circle" && hasClass(n, "origins-bead"))
    .map((n) => ({
      slug: n.attrs["data-person"],
      x: +n.attrs.cx,
      y: +n.attrs.cy,
      matched: false,
    }));
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
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
    } else if (ovalReach(ovalOf.get(nearest.id)!, b.x, b.y) >= 1) {
      engine(`${b.slug}'s bead at ${where} is outside the oval of ${nearest.id}`);
    } else {
      engine(`${b.slug} has a bead at ${where} where the record does not vouch for them`);
    }
  }

  return found;
}

const LAYOUT_ENDING = "This is a fault in how the picture was laid out for the " +
  "data as it now stands. Nothing in your change is mistaken. It needs a " +
  "maintainer who knows the layout engine in overlays/topLevel/socal-nug-braid-js.";
const ENGINE_ENDING = "This is a bug in the engine, not in the data.";

/** A finding as the check prints it. */
export function explain(finding: Finding): string {
  const ending = finding.kind === "layout" ? LAYOUT_ENDING : ENGINE_ENDING;
  return `${finding.message}. ${ending}`;
}
