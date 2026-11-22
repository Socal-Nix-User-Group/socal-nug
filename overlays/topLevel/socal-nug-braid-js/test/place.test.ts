import test from "node:test";
import assert from "node:assert/strict";
import { graphFor, rootId } from "../src/graph.ts";
import type { ElkGraph, ElkNode } from "../src/graph.ts";
import { placeBraid, placedFrom } from "../src/place.ts";
import { braid, fakeLayout } from "./fake-elk.ts";

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
  assert.deepEqual(trunk[0].points, [founded, { x: 7, y: 7 }, nug]);

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
