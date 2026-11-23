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

/** How far any on-ribbon moment's slot 0 sits from the median of them, across the time axis. */
export function ribbonSpread(story: Story, placed: LoomPlaced): number {
  const at = story.moments
    .filter((g) => g.onRibbon && placed.boxes.has(g.moment.id))
    .map((g) => slotZero(story, placed, g.moment.id))
    .sort((a, b) => a - b);
  if (at.length === 0) return 0;
  const mid = at.length >> 1;
  const median = at.length % 2 === 1 ? at[mid] : (at[mid - 1] + at[mid]) / 2;
  return Math.max(...at.map((x) => Math.abs(x - median)));
}

export function inspectPlacement(story: Story, placed: LoomPlaced): Finding[] {
  const found: Finding[] = [];

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
