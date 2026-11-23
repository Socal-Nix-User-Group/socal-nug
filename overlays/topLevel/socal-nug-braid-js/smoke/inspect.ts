import { AVATAR } from "../src/elk.ts";
import { slotOffset } from "../src/loom-graph.ts";
import type { LoomPlaced } from "../src/loom-place.ts";
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
