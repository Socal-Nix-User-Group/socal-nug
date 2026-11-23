import test from "node:test";
import assert from "node:assert/strict";
import { slotOffset } from "../src/loom-graph.ts";
import { placeLoom } from "../src/loom-place.ts";
import type { LoomPlaced, Point } from "../src/loom-place.ts";
import { inspectPlacement, ribbonSpread } from "../smoke/inspect.ts";
import { fakeLoomLayout } from "./fake-loom-elk.ts";
import { story } from "./story-fixture.ts";

const fake = await placeLoom(story, "river", fakeLoomLayout);

/** Every on-ribbon moment has its first slot at x = 100, one moment to a row. */
function aligned(): LoomPlaced {
  const boxes = new Map(fake.boxes);
  story.moments.forEach((g, row) => {
    const box = fake.boxes.get(g.moment.id)!;
    boxes.set(g.moment.id, {
      ...box,
      x: g.onRibbon ? 100 - slotOffset(g.slots, 0) : 300,
      y: row * 50,
    });
  });
  return { ...fake, boxes };
}

function shifted(placed: LoomPlaced, id: string, by: number): LoomPlaced {
  const boxes = new Map(placed.boxes);
  const box = boxes.get(id)!;
  boxes.set(id, { ...box, x: box.x + by });
  return { ...placed, boxes };
}

test("the spread is how far slot 0 strays, measured where the slot is and not where a thread is", () => {
  const base = aligned();
  assert.equal(ribbonSpread(story, base), 0);
  assert.equal(ribbonSpread(story, shifted(base, "founded", 30)), 30);
  // Nobody is through nug3's first slot, and it still counts.
  assert.equal(story.moments.find((g) => g.moment.id === "nug3")!.through[0].slot, 1);
  assert.equal(ribbonSpread(story, shifted(base, "nug3", 30)), 30);
});

test("a moment off the ribbon does not count toward the spread", () => {
  const base = aligned();
  assert.equal(story.moments.find((g) => g.moment.id === "camp")!.onRibbon, false);
  assert.equal(ribbonSpread(story, shifted(base, "camp", 30)), 0);
});

test("subway measures down the page", async () => {
  const subway = await placeLoom(story, "subway", fakeLoomLayout);
  const boxes = new Map(subway.boxes);
  for (const g of story.moments) {
    const box = boxes.get(g.moment.id)!;
    boxes.set(g.moment.id, { ...box, y: 100 - slotOffset(g.slots, 0) });
  }
  const base = { ...subway, boxes };
  assert.equal(ribbonSpread(story, base), 0);
  const box = boxes.get("nug3")!;
  const moved = new Map(boxes).set("nug3", { ...box, y: box.y + 12 });
  assert.equal(ribbonSpread(story, { ...base, boxes: moved }), 12);
});

/**
 * Each thread goes from one of its own things to the next by way of a gutter
 * to the right of everything, so nothing it passes through is another's.
 */
function clean(): LoomPlaced {
  const base = aligned();
  const moments = new Map<string, Point>();
  for (const [id, box] of base.boxes) {
    moments.set(id, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  }
  const roots = new Map<string, Point>();
  story.threads.forEach((t, k) => roots.set(t.person.slug, { x: 0, y: -100 * (k + 1) }));
  let gutter = 2000;
  const edges = story.threads.flatMap((t) => {
    const things = [roots.get(t.person.slug)!, ...t.path.map((g) => moments.get(g.moment.id)!)];
    return things.slice(1).map((to, i) => {
      gutter += 3;
      const from = things[i];
      return {
        meta: { slug: t.person.slug, hue: 0, member: true },
        points: [from, { x: gutter, y: from.y }, { x: gutter, y: to.y }, to],
      };
    });
  });
  return { ...base, moments, roots, edges };
}

test("a clean placement has no findings", () => {
  assert.deepEqual(inspectPlacement(story, clean()), []);
});

test("a thread through a moment that is not its own is a layout finding", () => {
  const base = clean();
  const nug3 = base.boxes.get("nug3")!;
  const inside = { x: nug3.x + nug3.width / 2, y: nug3.y + nug3.height / 2 };
  const edges = base.edges.map((e, i) =>
    i === base.edges.findIndex((x) => x.meta.slug === "rob")
      ? { ...e, points: [e.points[0], inside, ...e.points.slice(1)] }
      : e
  );
  const found = inspectPlacement(story, { ...base, edges });
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "layout");
  assert.ok(/rob/.test(found[0].message));
  assert.ok(/nug3/.test(found[0].message));
});

test("a thread through someone else's face is a layout finding", () => {
  const base = clean();
  const face = base.roots.get("mica")!;
  const edges = base.edges.map((e, i) =>
    i === base.edges.findIndex((x) => x.meta.slug === "rob")
      ? { ...e, points: [e.points[0], { x: face.x + 10, y: face.y - 10 }, ...e.points.slice(1)] }
      : e
  );
  const found = inspectPlacement(story, { ...base, edges });
  assert.ok(found.every((f) => f.kind === "layout"));
  assert.ok(found.some((f) => f.message.includes("mica's face")));
});

test("a moment, a face or a thread the engine left out is an engine finding", () => {
  const base = clean();
  const moments = new Map(base.moments);
  moments.delete("camp");
  const roots = new Map(base.roots);
  roots.delete("jared");
  const edges = base.edges.filter((e) => e.meta.slug !== "connor");
  const found = inspectPlacement(story, { ...base, moments, roots, edges });
  assert.deepEqual(found.map((f) => f.kind), ["engine", "engine", "engine"]);
  const text = found.map((f) => f.message).join("\n");
  assert.ok(/camp/.test(text));
  assert.ok(/jared/.test(text));
  assert.ok(/connor/.test(text));
});
