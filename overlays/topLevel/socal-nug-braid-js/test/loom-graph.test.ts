import test from "node:test";
import assert from "node:assert/strict";
import { rootId } from "../src/elk.ts";
import type { ElkNode } from "../src/elk.ts";
import { loomGraphFor } from "../src/loom-graph.ts";
import { buildStory } from "../src/story.ts";
import { at, PEOPLE, story } from "./story-fixture.ts";

const { graph, meta } = loomGraphFor(story, "river");
const node = (id: string): ElkNode => graph.children.find((n) => n.id === id)!;
const hops = (slug: string) =>
  graph.edges
    .filter((e) => meta.get(e.id)!.slug === slug)
    .map((e) => `${e.sources[0]}>${e.targets[0]}`);

test("every moment is a node pinned to its own layer, in date order", () => {
  story.moments.forEach((m, i) =>
    assert.equal(node(m.moment.id).layoutOptions!["elk.partitioning.partition"], String(i + 1))
  );
});

test("a moment is as wide as its slots", () => {
  assert.equal(node("founded").width, 30); // (3 - 1) * 7 + 16
  assert.equal(node("founded").height, 14);
  assert.equal(node("rob-nix").width, 18);
  const subway = loomGraphFor(story, "subway").graph.children.find((n) => n.id === "founded")!;
  assert.deepEqual([subway.width, subway.height], [14, 30]);
});

test("everyone through a moment has a port in and a port out, at their slot", () => {
  const ports = node("founded").ports!;
  assert.deepEqual(ports.map((p) => p.id), [
    "founded|in|rob",
    "founded|out|rob",
    "founded|in|daniel",
    "founded|out|daniel",
    "founded|in|david",
    "founded|out|david",
  ]);
  const daniel = ports.find((p) => p.id === "founded|in|daniel")!;
  assert.deepEqual([daniel.x, daniel.y, daniel.layoutOptions["elk.port.side"]], [15, 0, "NORTH"]);
  assert.deepEqual(
    [ports[3].x, ports[3].y, ports[3].layoutOptions["elk.port.side"]],
    [15, 14, "SOUTH"],
  );
  assert.equal(node("founded").layoutOptions!["elk.portConstraints"], "FIXED_POS");
});

test("a single slot sits in the middle of its moment", () => {
  assert.equal(node("rob-nix").ports![0].x, 9);
});

test("an empty slot has no port, and the others keep their places", () => {
  assert.equal(node("nug3").width, 44); // five slots
  assert.ok(!node("nug3").ports!.some((p) => p.id.endsWith("|rob")));
  assert.equal(node("nug3").ports!.find((p) => p.id === "nug3|in|daniel")!.x, 15);
});

test("a thread is one edge per hop, port to port, and has none into a meetup it skips", () => {
  assert.deepEqual(hops("connor"), ["root:connor>scale|in|connor", "scale|out|connor>nug4|in|connor"]);
  assert.ok(!hops("rob").some((h) => h.includes("nug3")));
  assert.ok(hops("rob").includes("nug2|out|rob>camp|in|rob"));
});

test("every edge is somebody's thread, in their palette slot", () => {
  for (const e of graph.edges) assert.ok(meta.get(e.id), e.id);
  assert.equal(meta.get("rob:0")!.hue, 0);
  assert.equal(meta.get("daniel:0")!.hue, 1);
});

test("a face is a node a layer ahead of its person's first moment", () => {
  assert.equal(
    node(rootId("jared")).layoutOptions!["elk.partitioning.partition"],
    String(story.moments.findIndex((m) => m.moment.id === "nug1")),
  );
  assert.equal(node(rootId("jared")).width, 36);
});

test("subway puts the ports on the sides time runs through", () => {
  const p = loomGraphFor(story, "subway").graph.children.find((n) => n.id === "founded")!.ports!;
  assert.deepEqual([p[2].x, p[2].y, p[2].layoutOptions["elk.port.side"]], [0, 15, "WEST"]);
  assert.deepEqual([p[3].x, p[3].y, p[3].layoutOptions["elk.port.side"]], [14, 15, "EAST"]);
});

test("a meetup of nothing but gaps is still a node of the right size, with no ports", () => {
  const lone = buildStory(
    [
      at("founded", "2023-04", ["rob"], true),
      at("nug1", "2023-05", [], true, { away: ["rob"] }),
    ],
    PEOPLE,
  );
  const empty = loomGraphFor(lone, "river").graph.children.find((n) => n.id === "nug1")!;
  assert.equal(empty.width, 18);
  assert.equal(empty.height, 14);
  assert.deepEqual(empty.ports, []);
});

test("a visitor at a whole-group gathering has a port after every member's", () => {
  const x = (slug: string) => node("scale").ports!.find((p) => p.id === `scale|in|${slug}`)!.x;
  const members = ["rob", "daniel", "david", "jared", "mica"];
  for (const slug of members) assert.ok(x("connor") > x(slug), slug);
  assert.equal(x("connor"), 8 + 5 * 7);
});

test("a person's first edge runs from their face to their first moment's incoming port", () => {
  assert.equal(hops("jared")[0], "root:jared>nug1|in|jared");
});
