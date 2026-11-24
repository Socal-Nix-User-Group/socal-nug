import test from "node:test";
import assert from "node:assert/strict";
import { across, passId, SLOT, slotOffset, THICK } from "../src/loom-graph.ts";
import { rootId, shown } from "../src/elk.ts";
import { drawLoom } from "../src/loom-draw.ts";
import { placeLoom, slotKey } from "../src/loom-place.ts";
import type { Box, LoomPlaced, PlacedLabel, Point } from "../src/loom-place.ts";
import { buildStory } from "../src/story.ts";
import type { Story } from "../src/story.ts";
import { explain, inspectDrawing, inspectPlacement, recorder, ribbonSpread } from "../smoke/inspect.ts";
import type { Recorded } from "../smoke/inspect.ts";
import { fakeLoomLayout } from "./fake-loom-elk.ts";
import { at, PEOPLE, story } from "./story-fixture.ts";

const fake = await placeLoom(story, "river", fakeLoomLayout);

/**
 * Every on-ribbon moment and pass-through has its first slot at x = 100, one
 * moment to a row, and a side moment stands off at x = 300 beside its
 * pass-through.
 */
function aligned(s: Story = story, base: LoomPlaced = fake): LoomPlaced {
  const boxes = new Map(base.boxes);
  const passes = new Map<string, Box>();
  s.moments.forEach((g, row) => {
    const box = base.boxes.get(g.moment.id)!;
    boxes.set(g.moment.id, {
      ...box,
      x: g.onRibbon ? 100 - slotOffset(g.slots, 0) : 300,
      y: row * 50,
    });
    if (g.passing.length > 0) {
      passes.set(g.moment.id, {
        x: 100 - slotOffset(g.inGroup, 0),
        y: row * 50,
        width: across(g.inGroup),
        height: THICK,
      });
    }
  });
  return { ...base, boxes, passes };
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
  const passes = new Map(subway.passes);
  for (const g of story.moments) {
    const box = boxes.get(g.moment.id)!;
    boxes.set(g.moment.id, { ...box, y: 100 - slotOffset(g.slots, 0) });
    const pass = passes.get(g.moment.id);
    if (pass !== undefined) passes.set(g.moment.id, { ...pass, y: 100 - slotOffset(g.inGroup, 0) });
  }
  const base = { ...subway, boxes, passes };
  assert.equal(ribbonSpread(story, base), 0);
  const box = boxes.get("nug3")!;
  const moved = new Map(boxes).set("nug3", { ...box, y: box.y + 12 });
  assert.equal(ribbonSpread(story, { ...base, boxes: moved }), 12);
});

/**
 * Each thread goes from one of its own stops to the next. A hop from one stop
 * on the ribbon to the next goes straight down the column. Any other hop goes
 * by way of a gutter to the right of everything, so nothing it passes through
 * is another's.
 */
function clean(s: Story = story, base: LoomPlaced = fake): LoomPlaced {
  const placed = aligned(s, base);
  const centre = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  const moments = new Map<string, Point>();
  for (const [id, box] of placed.boxes) moments.set(id, centre(box));
  const roots = new Map<string, Point>();
  s.threads.forEach((t, k) => roots.set(t.person.slug, { x: 0, y: -100 * (k + 1) }));

  const where = new Map<string, Point>(moments);
  for (const [slug, root] of roots) where.set(rootId(slug), root);
  for (const [id, box] of placed.passes) where.set(passId(id), centre(box));
  // Each stop on the ribbon and its place in date order.
  const ribbon = new Map<string, number>();
  s.moments.forEach((g, i) => {
    if (g.onRibbon) ribbon.set(g.moment.id, i);
    if (g.passing.length > 0) ribbon.set(passId(g.moment.id), i);
  });
  const meetups = s.moments.flatMap((g, i) => (g.onRibbon ? [i] : []));
  const straight = (from: string, to: string) =>
    ribbon.has(from) && ribbon.has(to) &&
    !meetups.some((i) => i > ribbon.get(from)! && i < ribbon.get(to)!);

  let gutter = 2000;
  const edges = s.threads.flatMap((t) => {
    const slug = t.person.slug;
    const stops = [
      rootId(slug),
      ...s.moments.flatMap((g) =>
        g.through.some((p) => p.slug === slug)
          ? [g.moment.id]
          : g.passing.some((p) => p.slug === slug)
          ? [passId(g.moment.id)]
          : []
      ),
    ];
    return stops.slice(1).map((to, i) => {
      gutter += 3;
      const from = stops[i];
      const a = where.get(from)!;
      const b = where.get(to)!;
      return {
        meta: { slug, hue: 0, member: true },
        from,
        to,
        points: straight(from, to)
          ? [a, b]
          : [a, { x: gutter, y: a.y }, { x: gutter, y: b.y }, b],
      };
    });
  });
  return { ...placed, moments, roots, edges };
}

/** One edge's points replaced by its two ends and a point `by` beyond the further of them, between them. */
function pushed(placed: LoomPlaced, slug: string, from: string, to: string, by: number): LoomPlaced {
  let found = false;
  const edges = placed.edges.map((e) => {
    if (e.meta.slug !== slug || e.from !== from || e.to !== to) return e;
    found = true;
    const a = e.points[0];
    const b = e.points[e.points.length - 1];
    return { ...e, points: [a, { x: Math.max(a.x, b.x) + by, y: (a.y + b.y) / 2 }, b] };
  });
  assert.ok(found, `${slug} has no edge from ${from} to ${to}`);
  return { ...placed, edges };
}

test("a clean placement has no findings", () => {
  assert.deepEqual(inspectPlacement(story, clean()), []);
});

test("a ribbon more than a pixel off its column is a layout finding naming the moment furthest off", () => {
  const base = shifted(clean(), "nug1", 12);
  const found = inspectPlacement(story, shifted(base, "nug3", 30));
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "layout");
  assert.ok(/nug3/.test(found[0].message), found[0].message);
  assert.ok(/30\.0px/.test(found[0].message), found[0].message);
  assert.ok(!/nug1/.test(found[0].message), found[0].message);
});

test("a ribbon within a pixel of its column is not a finding", () => {
  assert.deepEqual(inspectPlacement(story, shifted(clean(), "nug3", 0.5)), []);
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

test("a person with fewer edges than moments on their thread is an engine finding naming them", () => {
  const base = clean();
  const dropped = base.edges.findIndex((e) => e.meta.slug === "mica");
  const edges = base.edges.filter((_, i) => i !== dropped);
  const found = inspectPlacement(story, { ...base, edges });
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].kind, "engine");
  assert.ok(/mica/.test(found[0].message), found[0].message);
});

test("a pass-through off the column by more than a pixel is a layout finding that names the moment it passes", () => {
  const base = clean();
  const passes = new Map(base.passes);
  const box = passes.get("camp")!;
  passes.set("camp", { ...box, x: box.x + 30 });
  const found = inspectPlacement(story, { ...base, passes });
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].kind, "layout");
  assert.equal(found[0].message, "the ribbon is 30.0px off its column where it passes camp");
});

test("the spread counts a pass-through as well as the moments on the ribbon", () => {
  const base = clean();
  assert.equal(ribbonSpread(story, base), 0);
  const passes = new Map(base.passes);
  const box = passes.get("camp")!;
  passes.set("camp", { ...box, x: box.x - 12 });
  assert.equal(ribbonSpread(story, { ...base, passes }), 12);
});

test("a gathering with people passing and no pass-through box is an engine finding", () => {
  const base = clean();
  const passes = new Map(base.passes);
  passes.delete("camp");
  const found = inspectPlacement(story, { ...base, passes });
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].kind, "engine");
  assert.equal(found[0].message, "camp has people passing it and no pass-through");
});

test("a passing person with an edge missing is an engine finding", () => {
  const base = clean();
  const edges = base.edges.filter((e) => !(e.meta.slug === "david" && e.to === passId("camp")));
  assert.equal(edges.length, base.edges.length - 1);
  const found = inspectPlacement(story, { ...base, edges });
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].kind, "engine");
  // seven moments David is through and the camp he passes
  assert.equal(found[0].message, "david has 7 edges and their thread needs 8");
});

test("a ribbon hop with a point pushed more than a slot outside its two ends is a layout finding naming the person and both ends", () => {
  const found = inspectPlacement(story, pushed(clean(), "david", "nug2", passId("camp"), 30));
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].kind, "layout");
  assert.equal(found[0].message, "david's thread steps 30.0px out of the ribbon between nug2 and camp");
  const out = inspectPlacement(story, pushed(clean(), "jared", passId("camp"), "nug3", 30));
  assert.equal(out.length, 1, JSON.stringify(out));
  assert.equal(out[0].message, "jared's thread steps 30.0px out of the ribbon between camp and nug3");
  // within a slot is not stepping out
  assert.deepEqual(inspectPlacement(story, pushed(clean(), "david", "nug2", passId("camp"), SLOT - 1)), []);
});

test("the same push on a hop that skips a moment on the ribbon, someone recorded away, is not a finding", async () => {
  const s = buildStory(
    [
      at("founded", "2023-04", ["rob", "daniel"], true),
      at("nug1", "2023-05", [], true, { away: ["rob"] }),
      at("nug2", "2023-06", [], true),
    ],
    PEOPLE,
  );
  const base = clean(s, await placeLoom(s, "river", fakeLoomLayout));
  assert.deepEqual(inspectPlacement(s, base), []);
  // Rob goes around nug1, from the founding to nug2.
  assert.deepEqual(inspectPlacement(s, pushed(base, "rob", "founded", "nug2", 30)), []);
  // Daniel's hop past nothing, pushed the same, is a finding.
  const found = inspectPlacement(s, pushed(base, "daniel", "founded", "nug1", 30));
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].message, "daniel's thread steps 30.0px out of the ribbon between founded and nug1");
});

test("a hop to or from a side moment is not measured", () => {
  // Rob leaves nug2 for the camp and goes on from it to SCaLE; both hops go by the gutter.
  const base = clean();
  const away = base.edges.filter((e) => e.meta.slug === "rob" && (e.to === "camp" || e.from === "camp"));
  assert.equal(away.length, 2);
  for (const e of away) assert.ok(e.points.some((p) => p.x >= 2000));
  assert.deepEqual(inspectPlacement(story, base), []);
  assert.deepEqual(inspectPlacement(story, pushed(base, "rob", "nug2", "camp", 30)), []);
});

// --- the drawn picture ---------------------------------------------------------

/**
 * A picture with room around everything. Moments stand in one column, 60px
 * apart, each with its label on its left and its beads at its centre. Faces
 * stand in a column to the left, between the moments' rows. Each person's
 * thread leaves a thing to the right along its own row, drops down a gutter of
 * its own beyond the moments and comes back along the next thing's row.
 */
function drawable(): LoomPlaced {
  const boxes = new Map<string, Box>();
  const moments = new Map<string, Point>();
  const slots = new Map<string, Point>();
  const labels = new Map<string, PlacedLabel>();
  story.moments.forEach((g, row) => {
    const size = fake.boxes.get(g.moment.id)!;
    const box = { ...size, x: 200 - size.width / 2, y: 40 + 60 * row - size.height / 2 };
    const at = { x: 200, y: 40 + 60 * row };
    boxes.set(g.moment.id, box);
    moments.set(g.moment.id, at);
    for (const p of g.through) slots.set(slotKey(g.moment.id, p.slug), at);
    labels.set(g.moment.id, { x: box.x - 8, y: at.y + 4, anchor: "end", text: shown(g.moment.title) });
  });
  const roots = new Map<string, Point>();
  story.threads.forEach((t, k) => roots.set(t.person.slug, { x: 25, y: 70 + 60 * k }));
  const edges = story.threads.flatMap((t, k) => {
    const ids = [rootId(t.person.slug), ...t.path.map((g) => g.moment.id)];
    const things = [roots.get(t.person.slug)!, ...t.path.map((g) => moments.get(g.moment.id)!)];
    const gutter = 400 + 6 * k;
    return things.slice(1).map((to, i) => ({
      meta: { slug: t.person.slug, hue: 0, member: true },
      from: ids[i],
      to: ids[i + 1],
      points: [things[i], { x: gutter, y: things[i].y }, { x: gutter, y: to.y }, to],
    }));
  });
  return { ...fake, width: 640, height: 560, boxes, moments, slots, labels, roots, edges };
}

function drawn(placed: LoomPlaced) {
  const { doc, made } = recorder();
  drawLoom(placed, story, doc);
  return made;
}

const withClass = (made: Recorded[], token: string) =>
  made.filter((n) => (n.attrs.class ?? "").split(" ").includes(token));

/** A path that goes nowhere but to a point, drawn over the person's own thread. */
const goesTo = (x: number, y: number) => `M${x},${y} C${x},${y} ${x},${y} ${x},${y}`;

test("a clean drawing of the fixture has no findings", () => {
  const placed = drawable();
  assert.deepEqual(inspectDrawing(story, placed, drawn(placed)), []);
});

test("a thread point moved inside another person's oval is a layout finding naming both", () => {
  const placed = drawable();
  const camp = placed.boxes.get("camp")!;
  const made = drawn(placed);
  const thread = withClass(made, "origins-thread").find((p) => p.attrs["data-person"] === "mica")!;
  thread.attrs.d = goesTo(camp.x + camp.width / 2, camp.y + camp.height / 2);
  const found = inspectDrawing(story, placed, made);
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].kind, "layout");
  assert.ok(found[0].message.includes("mica"), found[0].message);
  assert.ok(found[0].message.includes("camp"), found[0].message);
});

test("a thread through a meetup its person is recorded away from is one engine finding and no layout finding", () => {
  const placed = drawable();
  const nug3 = placed.boxes.get("nug3")!;
  const made = drawn(placed);
  const thread = withClass(made, "origins-thread").find((p) => p.attrs["data-person"] === "rob")!;
  thread.attrs.d = goesTo(nug3.x + nug3.width / 2, nug3.y + nug3.height / 2);
  const found = inspectDrawing(story, placed, made);
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].kind, "engine");
  assert.ok(/rob/.test(found[0].message) && /nug3/.test(found[0].message), found[0].message);
});

test("a thread through someone else's face is a layout finding", () => {
  const placed = drawable();
  const face = placed.roots.get("daniel")!;
  const made = drawn(placed);
  const thread = withClass(made, "origins-thread").find((p) => p.attrs["data-person"] === "rob")!;
  thread.attrs.d = goesTo(face.x + 5, face.y);
  const found = inspectDrawing(story, placed, made);
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].kind, "layout");
  assert.ok(found[0].message.includes("daniel's face"), found[0].message);
});

test("a face off the canvas is a layout finding", () => {
  const placed = drawable();
  const small = { ...placed, height: 300 };
  const found = inspectDrawing(story, small, drawn(small));
  assert.ok(found.length > 0);
  assert.ok(found.every((f) => f.kind === "layout"), JSON.stringify(found));
  assert.ok(found.some((f) => /face is off the canvas/.test(f.message)), JSON.stringify(found));
});

test("an oval off the canvas is a layout finding", () => {
  const placed = drawable();
  const boxes = new Map(placed.boxes);
  boxes.set("camp", { ...boxes.get("camp")!, x: -10 });
  const moved = { ...placed, boxes };
  const found = inspectDrawing(story, moved, drawn(moved));
  assert.ok(found.some((f) => f.kind === "layout" && /camp's oval is off the canvas/.test(f.message)), JSON.stringify(found));
});

test("a label on an oval, on a face, off the canvas or wider than its room is a layout finding", () => {
  const placed = drawable();
  const at = placed.moments.get("founded")!;
  const face = placed.roots.get("rob")!;
  const cases: Array<[string, Partial<PlacedLabel>, RegExp]> = [
    ["on an oval", { x: at.x + 20, y: at.y + 4, anchor: "end" }, /sits on founded's oval/],
    ["on a face", { x: face.x + 10, y: face.y + 4, anchor: "end" }, /sits on rob's face/],
    ["off the canvas", { x: 20, y: 300, anchor: "end" }, /runs off the canvas/],
    ["too wide", { text: "x".repeat(30), x: 300, y: 470 }, /wider than/],
  ];
  for (const [what, change, pattern] of cases) {
    const labels = new Map(placed.labels);
    labels.set("founded", { ...placed.labels.get("founded")!, ...change });
    const moved = { ...placed, labels };
    const found = inspectDrawing(story, moved, drawn(moved));
    assert.ok(found.length > 0, what);
    assert.ok(found.every((f) => f.kind === "layout"), what);
    assert.ok(found.some((f) => pattern.test(f.message)), `${what}: ${JSON.stringify(found)}`);
  }
});

test("a thread under a label is a layout finding", () => {
  const placed = drawable();
  const made = drawn(placed);
  const label = withClass(made, "origins-label")[0];
  const thread = withClass(made, "origins-thread")[0];
  thread.attrs.d = goesTo(+label.attrs.x - 10, +label.attrs.y - 4);
  const found = inspectDrawing(story, placed, made);
  assert.ok(
    found.some((f) => f.kind === "layout" && f.message.includes(`through the label "${label.text}"`)),
    JSON.stringify(found),
  );
});

test("a bead moved outside its oval is an engine finding", () => {
  const placed = drawable();
  const made = drawn(placed);
  const bead = withClass(made, "origins-bead").find((b) => b.attrs["data-person"] === "jared")!;
  bead.attrs.cx = "5";
  bead.attrs.cy = "5";
  const found = inspectDrawing(story, placed, made);
  assert.ok(found.length > 0);
  assert.ok(found.every((f) => f.kind === "engine"), JSON.stringify(found));
  assert.ok(found.some((f) => /outside the oval of nug1/.test(f.message)), JSON.stringify(found));
});

test("a bead drawn on its slot is an engine finding when the slot lies outside the oval", () => {
  const base = drawable();
  const box = base.boxes.get("nug1")!;
  // The corner of the box: inside the box, outside the pill's round end.
  const slots = new Map(base.slots).set(slotKey("nug1", "jared"), { x: box.x + 1, y: box.y + 1 });
  const placed = { ...base, slots };
  const found = inspectDrawing(story, placed, drawn(placed));
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].kind, "engine");
  assert.ok(/jared/.test(found[0].message) && /nug1/.test(found[0].message), found[0].message);
});

// A moment's box is at least 18 by 14, so the centre of its round end is 7 in
// from the corner on both axes and the end's radius is 7. Its corner (1, 1) is
// 8.5 from that centre; (4, 1) is 6.7 from it, inside the end, and outside the
// ellipse the box would hold.

test("a thread point inside an oval's box but outside its round end is no finding", () => {
  const placed = drawable();
  const camp = placed.boxes.get("camp")!;
  const made = drawn(placed);
  const thread = withClass(made, "origins-thread").find((p) => p.attrs["data-person"] === "mica")!;
  thread.attrs.d = goesTo(camp.x + 1, camp.y + 1);
  assert.deepEqual(inspectDrawing(story, placed, made), []);
});

test("a thread point inside an oval's round end is inside the oval", () => {
  const placed = drawable();
  const camp = placed.boxes.get("camp")!;
  const made = drawn(placed);
  const thread = withClass(made, "origins-thread").find((p) => p.attrs["data-person"] === "mica")!;
  thread.attrs.d = goesTo(camp.x + 4, camp.y + 1);
  const found = inspectDrawing(story, placed, made);
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].kind, "layout");
  assert.ok(found[0].message.includes("mica") && found[0].message.includes("camp's oval"), found[0].message);
});

test("a bead whose slot is inside its oval's round end is no finding", () => {
  const base = drawable();
  const box = base.boxes.get("nug1")!;
  const slots = new Map(base.slots).set(slotKey("nug1", "jared"), { x: box.x + 4, y: box.y + 1 });
  const placed = { ...base, slots };
  assert.deepEqual(inspectDrawing(story, placed, drawn(placed)), []);
});

test("a label is on an oval when it comes within the round end, and not when it only reaches the box's corner", () => {
  const base = drawable();
  const box = base.boxes.get("nug3")!;
  const at = (x: number, y: number) => {
    const labels = new Map(base.labels);
    labels.set("nug3", { ...base.labels.get("nug3")!, x, y, anchor: "end" });
    const placed = { ...base, labels };
    return inspectDrawing(story, placed, drawn(placed));
  };
  // The label's bottom right corner at the box's (2, 2): 7.1 from the end's centre.
  assert.deepEqual(at(box.x + 2, box.y + 2), []);
  // At (4, 1): 6.7 from it.
  const found = at(box.x + 4, box.y + 1);
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].kind, "layout");
  assert.ok(/sits on nug3's oval/.test(found[0].message), found[0].message);
});

test("a missing bead is an engine finding", () => {
  const placed = drawable();
  const made = drawn(placed);
  const bead = withClass(made, "origins-bead").find((b) => b.attrs["data-person"] === "mica")!;
  made.splice(made.indexOf(bead), 1);
  const found = inspectDrawing(story, placed, made);
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].kind, "engine");
  assert.ok(/mica/.test(found[0].message));
});

test("a bead where the record does not vouch is an engine finding", () => {
  const placed = drawable();
  const made = drawn(placed);
  // Rob is recorded away from nug3, so no record puts a bead there.
  const at = placed.moments.get("nug3")!;
  const extra: Recorded = {
    tag: "circle",
    attrs: { class: "origins-bead", "data-person": "rob", cx: String(at.x), cy: String(at.y) },
    text: "",
    children: [],
  };
  const found = inspectDrawing(story, placed, [...made, extra]);
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].kind, "engine");
});

test("explain ends a layout finding with the words for an author and an engine finding with the engine's", () => {
  const layout = explain({ kind: "layout", message: "rob's thread runs through nug3's oval" });
  assert.ok(layout.startsWith("rob's thread runs through nug3's oval"));
  assert.ok(
    layout.endsWith(
      "This is a fault in how the picture was laid out for the data as it now stands. Nothing in your change is mistaken. It needs a maintainer who knows the layout engine in overlays/topLevel/socal-nug-braid-js.",
    ),
  );
  const engine = explain({ kind: "engine", message: "mica has no bead" });
  assert.ok(engine.endsWith("This is a bug in the engine, not in the data."));
});

test("explain says a layout finding on a made-up history can only come from a change to the engine", () => {
  const layout = explain({ kind: "layout", message: "rob's thread runs through nug3's oval" }, true);
  assert.equal(
    layout,
    "rob's thread runs through nug3's oval. This history is made up from a fixed seed, so only a change to the layout engine in overlays/topLevel/socal-nug-braid-js can have caused it.",
  );
  const engine = explain({ kind: "engine", message: "mica has no bead" }, true);
  assert.equal(engine, "mica has no bead. This is a bug in the engine, not in the data.");
});
