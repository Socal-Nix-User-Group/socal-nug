import test from "node:test";
import assert from "node:assert/strict";
import { labelWidth, rootId } from "../src/elk.ts";
import { loomGraphFor, portId } from "../src/loom-graph.ts";
import {
  centreLoomIn,
  loomPlacedFrom,
  placeLoom,
  slotKey,
} from "../src/loom-place.ts";
import { fakeLoomLayout } from "./fake-loom-elk.ts";
import { story } from "./story-fixture.ts";

const placed = await placeLoom(story, "river", fakeLoomLayout);

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
  // rob's first edge runs from his root to the in-port of his first moment
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
  ]);
  assert.equal(mapped.edges.length, built.graph.edges.length);
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
