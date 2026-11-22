import test from "node:test";
import assert from "node:assert/strict";
import { graphFor, rootId } from "../src/graph.ts";
import type { ElkGraph, ElkNode } from "../src/graph.ts";
import { placeBraid, placedFrom } from "../src/place.ts";
import { at, braid, fakeLayout, PEOPLE } from "./fake-elk.ts";
import { buildBraid } from "../src/layout.ts";

test("moments and roots come back as the centres of their boxes", async () => {
  const placed = await placeBraid(braid, "river", fakeLayout);
  const built = graphFor(braid, "river");
  const camp = built.graph.children.find((n: ElkNode) => n.id === "camp")!;
  const i = built.graph.children.indexOf(camp);
  assert.deepEqual(placed.moments.get("camp"), {
    x: 100 + i * 20 + camp.width / 2,
    y: 3 * 50 + camp.height / 2,
  });
  assert.ok(placed.roots.has("a"));
  assert.ok(placed.roots.has("b"));
  assert.equal(placed.moments.size, braid.moments.length);
});

test("the canvas is whatever the layout says it is", async () => {
  const placed = await placeBraid(braid, "river", fakeLayout);
  assert.equal(placed.width, 640);
  assert.equal(placed.height, 480);
});

test("an edge comes back as its points in order, with what it is", async () => {
  const placed = await placeBraid(braid, "river", fakeLayout);
  const trunk = placed.edges.filter((e) => e.meta.kind === "trunk");
  assert.equal(trunk.length, braid.trunk.length);
  const founded = placed.moments.get("founded")!;
  const nug = placed.moments.get("nug")!;
  // the fake routes every edge through a bend at (7, 7); a trunk edge's bend
  // is then held to the column, so only its y survives
  assert.deepEqual(trunk[0].points, [founded, { x: founded.x, y: 7 }, nug]);

  const bHops = placed.edges.filter((e) =>
    e.meta.kind === "thread" && e.meta.slug === "b"
  );
  assert.equal(bHops.length, 2);
  assert.deepEqual(bHops[0].points[0], placed.roots.get("b"));
  assert.deepEqual(bHops[1].points[2], nug);
});

test("a label anchors at the end of its box in river and the middle in subway", async () => {
  const river = await placeBraid(braid, "river", fakeLayout);
  const label = river.labels.get("camp")!;
  const node = river.moments.get("camp")!;
  // the fake puts the label box 12px left of the node's box, so the text
  // hangs off a point left of the node, level with it
  assert.equal(label.anchor, "end");
  assert.ok(label.x < node.x, `label x ${label.x} is not left of the node`);
  assert.ok(
    Math.abs(label.y - node.y) < 14,
    `label y ${label.y}, node y ${node.y}`,
  );

  const subway = await placeBraid(braid, "subway", fakeLayout);
  assert.equal(subway.labels.get("camp")!.anchor, "middle");
});

test("an edge the layout gave no section to is left out, not drawn from nothing", () => {
  const built = graphFor(braid, "river");
  const laidOut: ElkGraph = {
    ...built.graph,
    children: built.graph.children.map((n) => ({ ...n, x: 0, y: 0 })),
    edges: built.graph.edges.map((e) => ({ ...e, sections: undefined })),
    width: 10,
    height: 10,
  };
  const placed = placedFrom(built, laidOut, "river");
  assert.equal(placed.edges.length, 0);
});

test("the root of every thread is placed", async () => {
  const placed = await placeBraid(braid, "river", fakeLayout);
  for (const thread of braid.threads) {
    assert.ok(placed.roots.has(thread.person.slug), rootId(thread.person.slug));
  }
});

// --- the trunk, snapped to one column ----------------------------------------
// ELK's straightness priority holds the trunk to within a few pixels of a
// column. Snapping takes the last few: every trunk dot moves to the median of
// where ELK put them, and the ends of edges attached to a moved dot move with
// it, so a line still meets its dot. Bends stay where ELK routed them.

const trunkIds = new Set(
  braid.moments.filter((m) => m.moment.trunk).map((m) => m.moment.id),
);

test("trunk dots share one column after snapping", async () => {
  const placed = await placeBraid(braid, "river", fakeLayout);
  const xs = [...trunkIds].map((id) => placed.moments.get(id)!.x);
  assert.ok(xs.length >= 2, "the fixture needs two trunk moments");
  assert.ok(xs.every((x) => x === xs[0]), `trunk at x ${xs.join(", ")}`);
});

test("the snapped column is where ELK put the trunk, not somewhere new", async () => {
  const built = graphFor(braid, "river");
  const raw = await fakeLayout(built.graph);
  const before = [...trunkIds].map((id) => {
    const n = raw.children.find((c) => c.id === id)!;
    return n.x! + n.width / 2;
  }).sort((a, b) => a - b);
  const placed = await placeBraid(braid, "river", fakeLayout);
  const x = placed.moments.get("founded")!.x;
  assert.ok(x >= before[0] && x <= before[before.length - 1], `${x} is outside ${before}`);
});

test("the ends of edges attached to a snapped dot move with it", async () => {
  const built = graphFor(braid, "river");
  const raw = await fakeLayout(built.graph);
  const rawNug = raw.children.find((c) => c.id === "nug")!;
  const rawCentre = rawNug.x! + rawNug.width / 2;
  const rawHop = raw.edges.find((e) =>
    e.sources[0] === "camp" && e.targets[0] === "nug"
  )!.sections![0];

  const placed = await placeBraid(braid, "river", fakeLayout);
  const delta = placed.moments.get("nug")!.x - rawCentre;
  assert.notEqual(delta, 0, "the fixture should have needed a snap");
  const hop = placed.edges.find((e) =>
    e.meta.kind === "thread" && e.meta.slug === "b" && e.points.length === 3 &&
    e.points[2].y === placed.moments.get("nug")!.y
  )!;
  assert.equal(hop.points[2].x, rawHop.endPoint.x + delta);
  // the other end is a side moment and did not move
  assert.equal(hop.points[0].x, rawHop.startPoint.x);
  // nor did the bend
  assert.deepEqual(hop.points[1], { x: 7, y: 7 });
});

test("a trunk edge runs exactly down the column, bends included", async () => {
  // ELK attaches an edge up to a few pixels off a node's centre when several
  // leave it, and routes a trunk edge's bends near but not on the column. A
  // thick line that is slanted between two aligned dots reads as a wobble,
  // so every point of a trunk edge is held to the column, not just the dots.
  const placed = await placeBraid(braid, "river", fakeLayout);
  const column = placed.moments.get("founded")!.x;
  const trunk = placed.edges.filter((e) => e.meta.kind === "trunk");
  assert.ok(trunk.length > 0);
  for (const edge of trunk) {
    assert.ok(edge.points.length >= 3, "the fake routes every edge with a bend");
    for (const p of edge.points) {
      assert.equal(p.x, column, `trunk point at x ${p.x}, column ${column}`);
    }
  }
});

test("subway snaps the trunk along y", async () => {
  const placed = await placeBraid(braid, "subway", fakeLayout);
  const ys = [...trunkIds].map((id) => placed.moments.get(id)!.y);
  assert.ok(ys.every((y) => y === ys[0]), `trunk at y ${ys.join(", ")}`);
});

test("a lone trunk dot is left where it is", async () => {
  const one = buildBraid(
    [at("root", "2021", ["a"]), at("founded", "2023", ["a"], true)],
    PEOPLE,
  );
  const built = graphFor(one, "river");
  const raw = await fakeLayout(built.graph);
  const n = raw.children.find((c) => c.id === "founded")!;
  const placed = await placeBraid(one, "river", fakeLayout);
  assert.equal(placed.moments.get("founded")!.x, n.x! + n.width / 2);
});
