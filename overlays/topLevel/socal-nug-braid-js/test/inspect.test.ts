import test from "node:test";
import assert from "node:assert/strict";
import { across, passId, SLOT, slotOffset, THICK } from "../src/loom-graph.ts";
import { labelWidth, MOMENT_AVATAR, MOMENT_AVATAR_GAP, rootId, shown } from "../src/elk.ts";
import { drawLoom } from "../src/loom-draw.ts";
import { placeLoom, slotKey } from "../src/loom-place.ts";
import type { Box, LoomPlaced, PlacedLabel, Point } from "../src/loom-place.ts";
import { buildStory } from "../src/story.ts";
import type { Story } from "../src/story.ts";
import {
  apart,
  explain,
  inspectDrawing,
  inspectMorph,
  inspectPlacement,
  recorder,
  ribbonSpread,
} from "../smoke/inspect.ts";
import type { Recorded } from "../smoke/inspect.ts";
import { fakeLoomLayout } from "./fake-loom-elk.ts";
import { at, marked, MOMENTS, PEOPLE, story } from "./story-fixture.ts";

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
  // Rob, in nug3's first slot, is away from it, and it still counts.
  const first = story.moments.find((g) => g.moment.id === "nug3")!.through[0];
  assert.deepEqual([first.slug, first.slot, first.away], ["rob", 0, true]);
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
  // Connor is not in the group until nug4, so nug3 is not his. His hop from
  // SCaLE to nug4 doubles back into it.
  const edges = base.edges.map((e) =>
    e.meta.slug === "connor" && e.from === "scale"
      ? { ...e, points: [e.points[0], inside, ...e.points.slice(1)] }
      : e
  );
  const found = inspectPlacement(story, { ...base, edges });
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "layout");
  assert.ok(/connor/.test(found[0].message));
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

test("a member away from a meetup stops at it like everyone else, so the same push on their hop into or out of it is a finding", async () => {
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
  for (const [from, to] of [["founded", "nug1"], ["nug1", "nug2"]]) {
    const found = inspectPlacement(s, pushed(base, "rob", from, to, 30));
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.equal(found[0].kind, "layout");
    assert.equal(found[0].message, `rob's thread steps 30.0px out of the ribbon between ${from} and ${to}`);
  }
});

test("the same push on a hop that skips a moment on the ribbon, someone who has not joined yet, is not a finding", async () => {
  // Morgan visits a gathering of the whole group and joins two meetups later.
  const s = buildStory(
    [
      at("founded", "2023-04", ["rob", "daniel"], true),
      at("conf", "2023-05", ["rob", "daniel", "morgan"]),
      at("nug1", "2023-06", [], true),
      at("nug2", "2023-07", ["morgan"], true),
    ],
    PEOPLE,
  );
  assert.equal(s.moments[1].onRibbon, true);
  const base = clean(s, await placeLoom(s, "river", fakeLoomLayout));
  assert.deepEqual(inspectPlacement(s, base), []);
  assert.deepEqual(inspectPlacement(s, pushed(base, "morgan", "conf", "nug2", 30)), []);
  // Daniel's hop past nothing, pushed the same, is a finding.
  const found = inspectPlacement(s, pushed(base, "daniel", "conf", "nug1", 30));
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].message, "daniel's thread steps 30.0px out of the ribbon between conf and nug1");
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
 * its own beyond the moments and comes back along the next thing's row. At a
 * meetup its person is away from it stops short of the oval's right end and
 * starts again from there.
 */
function drawable(s: Story = story, base: LoomPlaced = fake): LoomPlaced {
  const boxes = new Map<string, Box>();
  const moments = new Map<string, Point>();
  const slots = new Map<string, Point>();
  const labels = new Map<string, PlacedLabel>();
  s.moments.forEach((g, row) => {
    const size = base.boxes.get(g.moment.id)!;
    const box = { ...size, x: 200 - size.width / 2, y: 40 + 60 * row - size.height / 2 };
    const at = { x: 200, y: 40 + 60 * row };
    boxes.set(g.moment.id, box);
    moments.set(g.moment.id, at);
    for (const p of g.through) slots.set(slotKey(g.moment.id, p.slug), at);
    labels.set(g.moment.id, { x: box.x - 8, y: at.y + 4, anchor: "end", text: shown(g.moment.title) });
  });
  const roots = new Map<string, Point>();
  s.threads.forEach((t, k) => roots.set(t.person.slug, { x: 25, y: 70 + 60 * k }));
  const edges = s.threads.flatMap((t, k) => {
    const ids = [rootId(t.person.slug), ...t.path.map((g) => g.moment.id)];
    const things = [
      roots.get(t.person.slug)!,
      ...t.path.map((g) => {
        const at = moments.get(g.moment.id)!;
        if (!g.through.some((p) => p.slug === t.person.slug && p.away)) return at;
        const box = boxes.get(g.moment.id)!;
        return { x: box.x + box.width + 4, y: at.y };
      }),
    ];
    const gutter = 400 + 6 * k;
    return things.slice(1).map((to, i) => ({
      meta: { slug: t.person.slug, hue: 0, member: true },
      from: ids[i],
      to: ids[i + 1],
      points: [things[i], { x: gutter, y: things[i].y }, { x: gutter, y: to.y }, to],
    }));
  });
  return { ...base, width: 640, height: 560, boxes, moments, slots, labels, roots, edges };
}

function drawn(placed: LoomPlaced, s: Story = story) {
  const { doc, made } = recorder();
  drawLoom(placed, s, doc);
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

test("a thread inside the box of a meetup its person is recorded away from is one engine finding and no layout finding", () => {
  const placed = drawable();
  const nug3 = placed.boxes.get("nug3")!;
  // its middle, and its corner, which is in the box and outside the pill
  for (const [x, y] of [[nug3.x + nug3.width / 2, nug3.y + nug3.height / 2], [nug3.x + 1, nug3.y + 1]]) {
    const made = drawn(placed);
    const thread = withClass(made, "origins-thread").find((p) => p.attrs["data-person"] === "rob")!;
    thread.attrs.d = goesTo(x, y);
    const found = inspectDrawing(story, placed, made);
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.equal(found[0].kind, "engine");
    assert.equal(found[0].message, `rob's thread runs through nug3, which they are recorded away from, near ${x.toFixed(0)},${y.toFixed(0)}`);
    assert.ok(explain(found[0]).endsWith("This is a bug in the engine, not in the data."));
  }
});

test("a thread that stops just short of a meetup its person is away from is no finding", () => {
  const placed = drawable();
  const nug3 = placed.boxes.get("nug3")!;
  const made = drawn(placed);
  const thread = withClass(made, "origins-thread").find((p) => p.attrs["data-person"] === "rob")!;
  thread.attrs.d = goesTo(nug3.x + nug3.width + 2, nug3.y + nug3.height / 2);
  assert.deepEqual(inspectDrawing(story, placed, made), []);
});

test("a recorded absence with no hollow bead at its slot is an engine finding", () => {
  const placed = drawable();
  assert.equal(withClass(drawn(placed), "is-away").length, 1);
  // left out
  const missing = drawn(placed);
  missing.splice(missing.indexOf(withClass(missing, "is-away")[0]), 1);
  assert.deepEqual(inspectDrawing(story, placed, missing), [
    { kind: "engine", message: "rob is recorded away from nug3 and has no hollow bead there" },
  ]);
  // drawn off the slot
  const moved = drawn(placed);
  const bead = withClass(moved, "is-away")[0];
  bead.attrs.cx = String(+bead.attrs.cx + 5);
  const found = inspectDrawing(story, placed, moved);
  assert.ok(found.every((f) => f.kind === "engine"), JSON.stringify(found));
  assert.ok(found.some((f) => f.message === "rob is recorded away from nug3 and has no hollow bead there"), JSON.stringify(found));
});

test("a hollow bead where nobody is recorded away is an engine finding, and is not taken for a filled one", () => {
  const placed = drawable();
  const made = drawn(placed);
  // Mica's filled bead at nug2, where she joined, drawn hollow instead.
  const nug2 = placed.slots.get(slotKey("nug2", "mica"))!;
  const bead = withClass(made, "origins-bead").find((b) =>
    b.attrs["data-person"] === "mica" && +b.attrs.cx === nug2.x && +b.attrs.cy === nug2.y
  )!;
  bead.attrs.class = "origins-bead is-away";
  const found = inspectDrawing(story, placed, made);
  assert.ok(found.every((f) => f.kind === "engine"), JSON.stringify(found));
  assert.deepEqual(found.map((f) => f.message).sort(), [
    `mica has a hollow bead at ${(+bead.attrs.cx).toFixed(0)},${(+bead.attrs.cy).toFixed(0)} and is not recorded away there`,
    "mica is vouched for at nug2 and has no bead there",
  ]);
});

// Mica is recorded away from a conference Rob and Daniel are at, between two
// meetups. Two more rows than the fixture, so a taller canvas.
const awayConf = buildStory(
  [
    ...MOMENTS,
    at("conf", "2024-09", ["rob", "daniel"], false, { away: ["mica"] }),
    at("nug5", "2024-10", [], true),
  ],
  PEOPLE,
);
const awayFake = await placeLoom(awayConf, "river", fakeLoomLayout);
const awayDrawable = () => ({ ...drawable(awayConf, awayFake), height: 700 });

test("a clean drawing with someone away from a moment that is not a meetup has no findings", () => {
  const placed = awayDrawable();
  const made = drawn(placed, awayConf);
  assert.deepEqual(
    withClass(made, "is-away").map((b) => b.attrs["data-person"]),
    ["rob", "mica"],
  );
  assert.deepEqual(inspectDrawing(awayConf, placed, made), []);
});

test("a thread inside the box of a moment that is not a meetup its person is recorded away from is one engine finding and no layout finding", () => {
  const placed = awayDrawable();
  const conf = placed.boxes.get("conf")!;
  for (const [x, y] of [[conf.x + conf.width / 2, conf.y + conf.height / 2], [conf.x + 1, conf.y + 1]]) {
    const made = drawn(placed, awayConf);
    const thread = withClass(made, "origins-thread").find((p) => p.attrs["data-person"] === "mica")!;
    thread.attrs.d = goesTo(x, y);
    const found = inspectDrawing(awayConf, placed, made);
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.equal(found[0].kind, "engine");
    assert.equal(found[0].message, `mica's thread runs through conf, which they are recorded away from, near ${x.toFixed(0)},${y.toFixed(0)}`);
  }
});

test("an absence from a moment that is not a meetup with no hollow bead at its slot, or a hollow bead there for someone it names, is an engine finding", () => {
  const placed = awayDrawable();
  const missing = drawn(placed, awayConf);
  const micas = withClass(missing, "is-away").find((b) => b.attrs["data-person"] === "mica")!;
  missing.splice(missing.indexOf(micas), 1);
  assert.deepEqual(inspectDrawing(awayConf, placed, missing), [
    { kind: "engine", message: "mica is recorded away from conf and has no hollow bead there" },
  ]);
  // Rob's filled bead at the conference, which names Rob, drawn hollow instead.
  const made = drawn(placed, awayConf);
  const conf = placed.slots.get(slotKey("conf", "rob"))!;
  const bead = withClass(made, "origins-bead").find((b) =>
    b.attrs["data-person"] === "rob" && +b.attrs.cx === conf.x && +b.attrs.cy === conf.y
  )!;
  bead.attrs.class = "origins-bead is-away";
  const found = inspectDrawing(awayConf, placed, made);
  assert.ok(found.every((f) => f.kind === "engine"), JSON.stringify(found));
  assert.deepEqual(found.map((f) => f.message).sort(), [
    `rob has a hollow bead at ${(+bead.attrs.cx).toFixed(0)},${(+bead.attrs.cy).toFixed(0)} and is not recorded away there`,
    "rob is vouched for at conf and has no bead there",
  ]);
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

// --- a moment's avatar ---------------------------------------------------------
// The event's own mark, in the room the layout left with the label. It is a
// disc the size of a face, and nothing else may be on it.

/** The same story with the conference carrying a mark as well as the camp. */
const twice = buildStory(
  MOMENTS.map((m) => (m.id === "camp" || m.id === "scale" ? { ...m, avatar: "/a.png" } : m)),
  PEOPLE,
);

/** The clean picture with each marked moment's avatar at the far end of its label. */
function withAvatars(s: Story): LoomPlaced {
  const placed = drawable();
  const avatars = new Map<string, Point>();
  for (const g of s.moments) {
    if (g.moment.avatar === undefined) continue;
    const label = placed.labels.get(g.moment.id)!;
    avatars.set(g.moment.id, {
      x: label.x - labelWidth(label.text) - MOMENT_AVATAR_GAP - MOMENT_AVATAR,
      y: placed.moments.get(g.moment.id)!.y,
    });
  }
  return { ...placed, avatars };
}

function drawnOf(s: Story, placed: LoomPlaced) {
  const { doc, made } = recorder();
  drawLoom(placed, s, doc);
  return made;
}

test("a clean drawing with avatars has no findings", () => {
  for (const s of [marked, twice]) {
    const placed = withAvatars(s);
    assert.deepEqual(inspectDrawing(s, placed, drawnOf(s, placed)), []);
  }
});

test("a thread through a moment's avatar is a layout finding naming both", () => {
  const placed = withAvatars(marked);
  const avatar = placed.avatars.get("camp")!;
  const made = drawnOf(marked, placed);
  const thread = withClass(made, "origins-thread").find((p) => p.attrs["data-person"] === "mica")!;
  thread.attrs.d = goesTo(avatar.x + MOMENT_AVATAR / 2, avatar.y);
  const found = inspectDrawing(marked, placed, made);
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].kind, "layout");
  assert.ok(found[0].message.includes("mica's thread runs through camp's avatar"), found[0].message);
});

test("a thread that only comes near an avatar is no finding", () => {
  const placed = withAvatars(marked);
  const avatar = placed.avatars.get("camp")!;
  const made = drawnOf(marked, placed);
  const thread = withClass(made, "origins-thread").find((p) => p.attrs["data-person"] === "mica")!;
  // inside the square around the disc, outside the disc
  thread.attrs.d = goesTo(avatar.x - 0.8 * MOMENT_AVATAR, avatar.y - 0.8 * MOMENT_AVATAR);
  assert.deepEqual(inspectDrawing(marked, placed, made), []);
});

test("an avatar off the canvas, on a face, on an oval, on a label or on another avatar is a layout finding", () => {
  const clean = withAvatars(twice);
  const face = clean.roots.get("rob")!;
  const oval = clean.moments.get("founded")!;
  const label = clean.labels.get("nug1")!;
  const other = clean.avatars.get("scale")!;
  const cases: Array<[string, Point, RegExp]> = [
    ["off the canvas", { x: 100, y: 5 }, /camp's avatar is off the canvas/],
    ["on a face", { x: face.x + 20, y: face.y }, /camp's avatar sits on rob's face/],
    ["on an oval", { x: oval.x - 20, y: oval.y }, /camp's avatar sits on founded's oval/],
    ["on a label", { x: label.x - 10, y: label.y - 7 }, /the label "nug1" sits on camp's avatar/],
    [
      "on another avatar",
      { x: other.x + MOMENT_AVATAR, y: other.y + MOMENT_AVATAR },
      /camp's avatar sits on scale's avatar/,
    ],
  ];
  for (const [what, at, pattern] of cases) {
    const moved = { ...clean, avatars: new Map(clean.avatars).set("camp", at) };
    const found = inspectDrawing(twice, moved, drawnOf(twice, moved));
    assert.ok(found.length > 0, what);
    assert.ok(found.every((f) => f.kind === "layout"), `${what}: ${JSON.stringify(found)}`);
    assert.ok(found.some((f) => pattern.test(f.message)), `${what}: ${JSON.stringify(found)}`);
  }
});

test("a label counts as on an avatar from the disc's edge, not from its centre", () => {
  const clean = withAvatars(marked);
  const label = clean.labels.get("camp")!;
  const end = label.x - labelWidth(label.text);
  const y = clean.moments.get("camp")!.y;
  const at = (gap: number) => ({
    ...clean,
    avatars: new Map([["camp", { x: end - gap - MOMENT_AVATAR, y }]]),
  });
  // a pixel clear of the text's end, and three pixels over it
  assert.deepEqual(inspectDrawing(marked, at(1), drawnOf(marked, at(1))), []);
  const found = inspectDrawing(marked, at(-3), drawnOf(marked, at(-3)));
  assert.deepEqual(found, [{ kind: "layout", message: 'the label "camp" sits on camp\'s avatar' }]);
});

// A label with an avatar beside it is drawn at a set length, shorter than the
// room kept for it, and the avatar stands against the text as drawn. Measured
// by the room, every such label would be found sitting on its own avatar.
test("a label drawn at a set length is measured at that length, not by the room kept for it", () => {
  const clean = withAvatars(marked);
  const label = clean.labels.get("camp")!;
  const length = labelWidth(label.text) - 10;
  const y = clean.moments.get("camp")!.y;
  const snug = {
    ...clean,
    labels: new Map(clean.labels).set("camp", { ...label, length }),
    avatars: new Map([["camp", { x: label.x - length - MOMENT_AVATAR_GAP - MOMENT_AVATAR, y }]]),
  };
  assert.deepEqual(inspectDrawing(marked, snug, drawnOf(marked, snug)), []);
  // the same avatar against a label drawn at whatever length it comes to
  const loose = { ...snug, labels: clean.labels };
  assert.deepEqual(inspectDrawing(marked, loose, drawnOf(marked, loose)), [{
    kind: "layout",
    message: 'the label "camp" sits on camp\'s avatar',
  }]);
});

// The layout centres a label's box on its moment: across the row in River,
// over the column in Subway. The avatar is placed from that box, so one out
// of line says the box is not where the placement takes it to be.
test("an avatar out of line with its moment is a layout finding, measured across time in each mode", async () => {
  const about = (placed: LoomPlaced) =>
    inspectPlacement(marked, placed).filter((f) => f.message.includes("avatar"));
  const river = withAvatars(marked);
  assert.deepEqual(about(river), []);
  const at = river.avatars.get("camp")!;
  const lower = (by: number) => ({ ...river, avatars: new Map([["camp", { x: at.x, y: at.y + by }]]) });
  assert.deepEqual(about(lower(0.5)), []);
  assert.deepEqual(about(lower(3)), [{
    kind: "layout",
    message: "camp's avatar is 3.0px out of line with its moment",
  }]);
  // along the row is where it is meant to be
  assert.deepEqual(about({ ...river, avatars: new Map([["camp", { x: at.x - 50, y: at.y }]]) }), []);

  const subway = await placeLoom(marked, "subway", fakeLoomLayout);
  const column = subway.moments.get("camp")!.x;
  const height = subway.avatars.get("camp")!.y;
  const over = (by: number) => ({ ...subway, avatars: new Map([["camp", { x: column + by, y: height }]]) });
  assert.deepEqual(about(over(0)), []);
  assert.deepEqual(about(over(-4)), [{
    kind: "layout",
    message: "camp's avatar is 4.0px out of line with its moment",
  }]);
});

test("an avatar the data gives and the picture lacks, or the picture has and the data does not give, is an engine finding", () => {
  const bare = drawable();
  assert.deepEqual(inspectDrawing(marked, bare, drawnOf(marked, bare)), [{
    kind: "engine",
    message: "camp carries an avatar and none is drawn for it",
  }]);

  const placed = withAvatars(marked);
  assert.deepEqual(inspectDrawing(story, placed, drawnOf(marked, placed)), [{
    kind: "engine",
    message: "an avatar is drawn for camp, which carries none",
  }]);
});

test("a morph between two layouts with avatars has no findings, and one with an avatar in only one of them cannot pair them up", async () => {
  const river = await placeLoom(marked, "river", fakeLoomLayout);
  const subway = await placeLoom(marked, "subway", fakeLoomLayout);
  assert.deepEqual(inspectMorph(marked, river, subway), []);
  const found = inspectMorph(marked, river, { ...subway, avatars: new Map() });
  assert.equal(found.length, 2, JSON.stringify(found));
  assert.ok(found.every((f) => f.kind === "engine" && /could not pair/.test(f.message)));
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
  // Rob is recorded away from nug3, so no record puts a filled bead there,
  // beside his hollow one.
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

// --- the morph ---------------------------------------------------------------

const subwayFake = await placeLoom(story, "subway", fakeLoomLayout);

test("apart is how far one path strays from the other's line, and a path's line does not cross its gaps", () => {
  const one = "M0,0 C0,50 100,50 100,100";
  // the same curve cut at its middle
  const two = "M0,0 C0,25 25,37.5 50,50 C75,62.5 100,75 100,100";
  assert.ok(apart(one, two) < 0.05);
  assert.ok(Math.abs(apart(one, "M1,0 C1,50 101,50 101,100") - 1) < 0.05);
  // the same two ends with nothing drawn between them is not the same line
  const gapped = "M0,0 C0,0 0,0 0,0 M100,100 C100,100 100,100 100,100";
  assert.ok(apart(gapped, one) > 10);
});

test("a morph between two clean layouts of the fixture has no findings, whole or centred in a wider box", async () => {
  assert.deepEqual(inspectMorph(story, fake, subwayFake), []);
  const centred = await placeLoom(story, "river", fakeLoomLayout, 777.333);
  assert.deepEqual(inspectMorph(story, centred, subwayFake), []);
});

test("layouts that do not pair up are an engine finding each way", () => {
  const cut = { ...fake, edges: fake.edges.filter((e) => !(e.meta.slug === "rob" && e.from === "nug1")) };
  const found = inspectMorph(story, cut, subwayFake);
  assert.equal(found.length, 2, JSON.stringify(found));
  assert.ok(found.every((f) => f.kind === "engine" && f.message.includes("could not pair")));
  assert.ok(found[0].message.includes("from River to Subway"));
  assert.ok(found[1].message.includes("from Subway to River"));
});

test("a thread broken in one layout and whole in the other is an engine finding about its stretches", () => {
  // Rob's edge out of nug1 starts half a unit off where his edge into it ends,
  // in River only, so River draws a break there and Subway does not.
  const moved = {
    ...fake,
    edges: fake.edges.map((e) =>
      e.meta.slug === "rob" && e.from === "nug1"
        ? { ...e, points: [{ x: e.points[0].x + 0.5, y: e.points[0].y }, ...e.points.slice(1)] }
        : e
    ),
  };
  const found = inspectMorph(story, moved, subwayFake);
  assert.ok(found.length > 0);
  assert.ok(found.every((f) => f.kind === "engine"), JSON.stringify(found));
  assert.ok(found.some((f) => f.message.startsWith("rob's thread is in 3 stretches")), JSON.stringify(found));
  assert.ok(
    explain(found[0], true).endsWith("This is a bug in the engine, not in the data."),
  );
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
