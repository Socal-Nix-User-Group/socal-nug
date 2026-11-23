import test from "node:test";
import assert from "node:assert/strict";
import { labelWidth, rootId } from "../src/elk.ts";
import type { ElkEdge, ElkGraph, ElkNode, ElkPoint } from "../src/elk.ts";
import { loomGraphFor, portId, slotOffset } from "../src/loom-graph.ts";
import {
  centreLoomIn,
  loomPlacedFrom,
  placeLoom,
  slotKey,
  snapRibbon,
} from "../src/loom-place.ts";
import { buildStory } from "../src/story.ts";
import { fakeLoomLayout } from "./fake-loom-elk.ts";
import { at, PEOPLE, story } from "./story-fixture.ts";

const placed = await placeLoom(story, "river", fakeLoomLayout);

// The fake staggers every node, so the ribbon's moments come out of it with
// their first slots at 148, 168, 188, 228, 248 and 268: a median of 208.
const laid = await fakeLoomLayout(loomGraphFor(story, "river").graph);
const snapped = snapRibbon(laid, story, "river");
const ribbon = story.moments.filter((g) => g.onRibbon).map((g) => g.moment.id);
const nodeIn = (graph: ElkGraph, id: string): ElkNode =>
  graph.children.find((n) => n.id === id)!;
const edgeIn = (graph: ElkGraph, id: string): ElkEdge =>
  graph.edges.find((e) => e.id === id)!;
const firstSlot = (graph: ElkGraph, id: string, axis: "x" | "y" = "x") =>
  nodeIn(graph, id)[axis]! +
  slotOffset(story.moments.find((g) => g.moment.id === id)!.slots, 0);
/** The laid-out graph with one edge given the bends it is asked to have. */
const withBends = (id: string, bends: (from: ElkPoint, to: ElkPoint) => ElkPoint[]): ElkGraph => ({
  ...laid,
  edges: laid.edges.map((e) => {
    if (e.id !== id) return e;
    const section = e.sections![0];
    return {
      ...e,
      sections: [{ ...section, bendPoints: bends(section.startPoint, section.endPoint) }],
    };
  }),
});

test("a moment comes back as its box and the centre of it", async () => {
  const built = loomGraphFor(story, "river");
  const mapped = loomPlacedFrom(
    built,
    await fakeLoomLayout(built.graph),
    story,
    "river",
  );
  const node = built.graph.children.find((n) => n.id === "founded")!;
  const i = built.graph.children.indexOf(node);
  const box = { x: 100 + i * 20, y: 3 * 50, width: node.width, height: node.height };
  assert.deepEqual(mapped.boxes.get("founded"), box);
  assert.deepEqual(mapped.moments.get("founded"), {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
  assert.equal(mapped.moments.size, story.moments.length);
  assert.equal(mapped.boxes.size, story.moments.length);
});

test("a slot is the middle of its moment along time, at that person's place across it", () => {
  const box = placed.boxes.get("founded")!;
  assert.deepEqual(placed.slots.get(slotKey("founded", "daniel")), {
    x: box.x + 15,
    y: box.y + 7,
  });
});

test("subway turns the slot the other way", async () => {
  const s = await placeLoom(story, "subway", fakeLoomLayout);
  const box = s.boxes.get("founded")!;
  assert.deepEqual(s.slots.get(slotKey("founded", "daniel")), {
    x: box.x + 7,
    y: box.y + 15,
  });
});

test("nobody has a slot at a moment they are not through", () => {
  assert.equal(placed.slots.get(slotKey("nug3", "rob")), undefined);
});

test("an edge comes back as its points in order, with whose thread it is", async () => {
  const built = loomGraphFor(story, "river");
  const mapped = loomPlacedFrom(
    built,
    await fakeLoomLayout(built.graph),
    story,
    "river",
  );
  const index = (id: string) =>
    built.graph.children.findIndex((n) => n.id === id);
  // rob's first edge runs from his root to the in-port of his first moment,
  // and on to his slot inside it
  const root = rootId("rob");
  const rootAt = index(root);
  const nodeAt = index("rob-nix");
  const rootNode = built.graph.children[rootAt];
  const port = built.graph.children[nodeAt].ports!.find(
    (p) => p.id === portId("rob-nix", "in", "rob"),
  )!;
  const edge = mapped.edges[0];
  assert.equal(edge.meta.slug, "rob");
  assert.deepEqual(edge.points, [
    {
      x: 100 + rootAt * 20 + rootNode.width / 2,
      y: 0 * 50 + rootNode.height / 2,
    },
    { x: 7, y: 7 },
    { x: 100 + nodeAt * 20 + port.x, y: 1 * 50 + port.y },
    mapped.slots.get(slotKey("rob-nix", "rob")),
  ]);
  // Every thread's edges and nothing else: the spine is not placed.
  const spine = built.graph.edges.filter((e) => e.id.startsWith("spine:"));
  assert.equal(spine.length, 5);
  assert.equal(mapped.edges.length, built.graph.edges.length - spine.length);
});

test("a thread runs through every oval on its path, from its slot to its slot", () => {
  const same = (a: ElkPoint, b: ElkPoint) => a.x === b.x && a.y === b.y;
  for (const thread of story.threads) {
    const slug = thread.person.slug;
    const edges = placed.edges.filter((e) => e.meta.slug === slug);
    thread.path.forEach((g, index) => {
      const slot = placed.slots.get(slotKey(g.moment.id, slug))!;
      assert.ok(
        edges.some((e) => same(e.points[e.points.length - 1], slot)),
        `${slug} does not arrive at their slot at ${g.moment.id}`,
      );
      if (index === thread.path.length - 1) return;
      assert.ok(
        edges.some((e) => same(e.points[0], slot)),
        `${slug} does not leave from their slot at ${g.moment.id}`,
      );
    });
  }
});

test("a label carries the text the layout made room for, anchored as its mode hangs it", async () => {
  const built = loomGraphFor(story, "river");
  const mapped = loomPlacedFrom(
    built,
    await fakeLoomLayout(built.graph),
    story,
    "river",
  );
  const i = built.graph.children.findIndex((n) => n.id === "founded");
  const width = labelWidth("founded");
  assert.deepEqual(mapped.labels.get("founded"), {
    x: 100 + i * 20 + (-width - 12) + width,
    y: 3 * 50 + 1 + 11,
    anchor: "end",
    text: "founded",
  });

  const sub = loomGraphFor(story, "subway");
  const s = loomPlacedFrom(
    sub,
    await fakeLoomLayout(sub.graph),
    story,
    "subway",
  );
  const j = sub.graph.children.findIndex((n) => n.id === "founded");
  assert.deepEqual(s.labels.get("founded"), {
    x: 100 + j * 20 + (-width - 12) + width / 2,
    y: 3 * 50 + 1 + 11,
    anchor: "middle",
    text: "founded",
  });
});

test("the snap puts the first slot of every moment on the ribbon on the median of them", () => {
  assert.deepEqual(ribbon.map((id) => firstSlot(laid, id)), [148, 168, 188, 228, 248, 268]);
  for (const id of ribbon) {
    assert.equal(firstSlot(snapped, id), 208, id);
    assert.equal(nodeIn(snapped, id).y, nodeIn(laid, id).y, id);
  }
});

test("the column is the median, so one moment far off it does not drag the rest", () => {
  const far: ElkGraph = {
    ...laid,
    children: laid.children.map((n) => (n.id === "nug4" ? { ...n, x: 1000 } : n)),
  };
  const back = snapRibbon(far, story, "river");
  for (const id of ribbon) assert.equal(firstSlot(back, id), 208, id);
});

test("a moment off the ribbon and a face stay where the layout put them", () => {
  for (const id of ["rob-nix", "booth", "camp", rootId("rob"), rootId("connor")]) {
    assert.deepEqual(nodeIn(snapped, id), nodeIn(laid, id), id);
  }
});

test("a moment whose first slot is empty is aligned by where the slot is", () => {
  const nug3 = story.moments.find((g) => g.moment.id === "nug3")!;
  assert.equal(nug3.through[0].slot, 1);
  assert.equal(firstSlot(snapped, "nug3"), 208);
  // Daniel, in the second slot, is one slot on from the column.
  const daniel = nodeIn(snapped, "nug3").ports!.find((p) => p.id === "nug3|in|daniel")!;
  assert.equal(nodeIn(snapped, "nug3").x! + daniel.x, 215);
});

test("an edge's end moves with the moment it is on, and an end on a face stays", () => {
  // jared's first edge runs from his face to nug1, which the snap moves by 40
  const before = edgeIn(laid, "jared:0").sections![0];
  const after = edgeIn(snapped, "jared:0").sections![0];
  assert.deepEqual(after.startPoint, before.startPoint);
  assert.deepEqual(after.endPoint, { x: before.endPoint.x + 40, y: before.endPoint.y });
  const nug1 = nodeIn(snapped, "nug1");
  const port = nug1.ports!.find((p) => p.id === "nug1|in|jared")!;
  assert.deepEqual(after.endPoint, { x: nug1.x! + port.x, y: nug1.y! + port.y });
});

test("a bend midway between an end that moved and one that stayed moves half as far", () => {
  const bent = withBends("jared:0", (from, to) => [{ x: 500, y: (from.y + to.y) / 2 }]);
  const before = edgeIn(bent, "jared:0").sections![0].bendPoints![0];
  const after = edgeIn(snapRibbon(bent, story, "river"), "jared:0").sections![0].bendPoints![0];
  assert.deepEqual(after, { x: before.x + 20, y: before.y });
});

test("a bend between two ends that moved takes its share of each move", () => {
  // jared's second edge runs from nug1, moved by 40, to nug2, moved by 20
  const bent = withBends("jared:1", (from, to) => [
    { x: 500, y: from.y + (to.y - from.y) / 4 },
    { x: 510, y: from.y + ((to.y - from.y) * 3) / 4 },
  ]);
  const after = edgeIn(snapRibbon(bent, story, "river"), "jared:1").sections![0];
  const before = edgeIn(bent, "jared:1").sections![0];
  assert.equal(after.startPoint.x, before.startPoint.x + 40);
  assert.deepEqual(after.bendPoints!.map((p) => p.x), [500 + 35, 510 + 25]);
  assert.equal(after.endPoint.x, before.endPoint.x + 20);
  assert.deepEqual(
    after.bendPoints!.map((p) => p.y),
    before.bendPoints!.map((p) => p.y),
  );
});

test("subway snaps down the page and leaves the time axis alone", async () => {
  const sub = await fakeLoomLayout(loomGraphFor(story, "subway").graph);
  const back = snapRibbon(sub, story, "subway");
  const column = firstSlot(back, "founded", "y");
  assert.notEqual(firstSlot(sub, "nug1", "y"), firstSlot(sub, "founded", "y"));
  for (const id of ribbon) {
    assert.equal(firstSlot(back, id, "y"), column, id);
    assert.equal(nodeIn(back, id).x, nodeIn(sub, id).x, id);
  }
});

test("a story with nothing on the ribbon comes back as the layout left it", async () => {
  const apart = buildStory([at("booth", "2023-03", ["daniel", "rob"])], PEOPLE);
  const out = await fakeLoomLayout(loomGraphFor(apart, "river").graph);
  assert.equal(snapRibbon(out, apart, "river"), out);
});

test("placement snaps: boxes, slots and threads are on the column", () => {
  for (const id of ribbon) {
    const g = story.moments.find((m) => m.moment.id === id)!;
    assert.equal(placed.boxes.get(id)!.x + slotOffset(g.slots, 0), 208, id);
  }
  assert.equal(placed.slots.get(slotKey("founded", "rob"))!.x, 208);
  // the fake hangs a label 12 to the left of its node, and it has gone with it
  const label = placed.labels.get("founded")!.x;
  assert.ok(Math.abs(label - (placed.boxes.get("founded")!.x - 12)) < 1e-9, String(label));
  // rob's hop from the founding to nug1 leaves and arrives in the first slot,
  // through the founding's out-port and nug1's in-port
  const hop = placed.edges.filter((e) => e.meta.slug === "rob")[3];
  assert.deepEqual(
    [hop.points[0], hop.points[1], hop.points.at(-2), hop.points.at(-1)],
    [
      { x: 208, y: placed.boxes.get("founded")!.y + 7 },
      { x: 208, y: placed.boxes.get("founded")!.y + 14 },
      { x: 208, y: placed.boxes.get("nug1")!.y },
      { x: 208, y: placed.boxes.get("nug1")!.y + 7 },
    ],
  );
});

test("centring moves boxes and slots with everything else", () => {
  const wide = centreLoomIn(placed, placed.width + 200);
  assert.equal(
    wide.boxes.get("founded")!.x,
    placed.boxes.get("founded")!.x + 100,
  );
  assert.equal(
    wide.slots.get(slotKey("founded", "rob"))!.x,
    placed.slots.get(slotKey("founded", "rob"))!.x + 100,
  );
  assert.equal(wide.width, placed.width + 200);
});

test("centring later gives what centring during placement would have", async () => {
  assert.deepEqual(
    centreLoomIn(placed, 900),
    await placeLoom(story, "river", fakeLoomLayout, 900),
  );
});

test("a canvas already wider than its box, or a box of nothing, is left alone", () => {
  assert.equal(centreLoomIn(placed, 100), placed);
  assert.equal(centreLoomIn(placed, 0), placed);
});
