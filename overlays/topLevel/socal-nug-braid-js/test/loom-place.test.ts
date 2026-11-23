import test from "node:test";
import assert from "node:assert/strict";
import { labelWidth, rootId } from "../src/elk.ts";
import type { ElkGraph, ElkPoint } from "../src/elk.ts";
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

test("the piece of thread inside an oval runs straight along time, without stepping across", async () => {
  for (const mode of ["river", "subway"] as const) {
    const p = await placeLoom(story, mode, fakeLoomLayout);
    const across = mode === "river" ? "x" : "y";
    const slotEnds = new Set(
      [...p.slots.values()].map((s) => `${s.x},${s.y}`),
    );
    let checked = 0;
    for (const edge of p.edges) {
      const n = edge.points.length;
      for (const [end, next] of [[0, 1], [n - 1, n - 2]]) {
        const point = edge.points[end];
        if (!slotEnds.has(`${point.x},${point.y}`)) continue;
        checked += 1;
        assert.equal(
          edge.points[next][across],
          point[across],
          `${mode} ${edge.meta.slug}: ${JSON.stringify(edge.points)}`,
        );
      }
    }
    // every hop has two slot ends but a face's first hop, which has one
    assert.equal(checked, 2 * p.edges.length - story.threads.length, mode);
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

test("a hop leaves its slot through the out-port in line with it and arrives through the in-port in line with the next", () => {
  // rob's hop from the founding to nug1, by way of the founding's out-port and
  // nug1's in-port
  const hop = placed.edges.filter((e) => e.meta.slug === "rob")[3];
  const from = placed.slots.get(slotKey("founded", "rob"))!;
  const to = placed.slots.get(slotKey("nug1", "rob"))!;
  assert.deepEqual(
    [hop.points[0], hop.points[1], hop.points.at(-2), hop.points.at(-1)],
    [
      { x: from.x, y: placed.boxes.get("founded")!.y + 7 },
      { x: from.x, y: placed.boxes.get("founded")!.y + 14 },
      { x: to.x, y: placed.boxes.get("nug1")!.y },
      { x: to.x, y: placed.boxes.get("nug1")!.y + 7 },
    ],
  );
});

test("placement leaves a moment on the ribbon where the layout put it, off its column or not", async () => {
  const moved = async (graph: ElkGraph): Promise<ElkGraph> => {
    const laid = await fakeLoomLayout(graph);
    return {
      ...laid,
      children: laid.children.map((n) => (n.id === "nug4" ? { ...n, x: 1000 } : n)),
    };
  };
  const p = await placeLoom(story, "river", moved);
  const laid = await moved(loomGraphFor(story, "river").graph);
  for (const g of story.moments.filter((m) => m.onRibbon)) {
    const node = laid.children.find((n) => n.id === g.moment.id)!;
    assert.equal(p.boxes.get(g.moment.id)!.x, node.x, g.moment.id);
  }
  assert.equal(p.boxes.get("nug4")!.x, 1000);
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
  const by100 = (p: { x: number; y: number }) => ({ x: p.x + 100, y: p.y });
  for (const [slug, root] of placed.roots) {
    assert.deepEqual(wide.roots.get(slug), by100(root), slug);
  }
  for (const [id, centre] of placed.moments) {
    assert.deepEqual(wide.moments.get(id), by100(centre), id);
  }
  for (const [id, label] of placed.labels) {
    assert.deepEqual(wide.labels.get(id), { ...label, x: label.x + 100 }, id);
  }
  assert.equal(wide.edges.length, placed.edges.length);
  placed.edges.forEach((edge, i) => {
    assert.deepEqual(wide.edges[i].points, edge.points.map(by100), edge.meta.slug);
  });
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
