import test from "node:test";
import assert from "node:assert/strict";
import { rootId } from "../src/elk.ts";
import type { ElkNode } from "../src/elk.ts";
import { loomGraphFor, passId, portId } from "../src/loom-graph.ts";
import { buildStory } from "../src/story.ts";
import { at, MOMENTS, PEOPLE, story } from "./story-fixture.ts";

const { graph, meta } = loomGraphFor(story, "river");
const node = (id: string): ElkNode => graph.children.find((n) => n.id === id)!;
const hops = (slug: string) =>
  graph.edges
    .filter((e) => meta.get(e.id)?.slug === slug)
    .map((e) => `${e.sources[0]}>${e.targets[0]}`);
const spine = graph.edges.filter((e) => e.id.startsWith("spine:"));

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
    "founded|in|~",
    "founded|out|~",
  ]);
  const daniel = ports.find((p) => p.id === "founded|in|daniel")!;
  assert.deepEqual([daniel.x, daniel.y, daniel.layoutOptions["elk.port.side"]], [15, 0, "NORTH"]);
  assert.deepEqual(
    [ports[3].x, ports[3].y, ports[3].layoutOptions["elk.port.side"]],
    [15, 14, "SOUTH"],
  );
  assert.equal(node("founded").layoutOptions!["elk.portConstraints"], "FIXED_POS");
});

test("every port has no size, so ELK attaches an edge exactly where the port is", () => {
  // a 1 by 1 port had its edge attached off its corner, a pixel across from
  // the slot, and the thread stepped sideways inside every oval
  for (const mode of ["river", "subway"] as const) {
    for (const n of loomGraphFor(story, mode).graph.children) {
      for (const p of n.ports ?? []) {
        assert.deepEqual([p.width, p.height], [0, 0], `${mode} ${p.id}`);
      }
    }
  }
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

test("every edge but the spine is somebody's thread, in their palette slot", () => {
  for (const e of graph.edges) {
    if (!spine.includes(e)) assert.ok(meta.get(e.id), e.id);
  }
  assert.equal(meta.get("rob:0")!.hue, 0);
  assert.equal(meta.get("daniel:0")!.hue, 1);
});

test("a moment on the ribbon has a spine port in and out, half a slot before its first slot", () => {
  const ports = node("founded").ports!;
  const into = ports.find((p) => p.id === "founded|in|~")!;
  const out = ports.find((p) => p.id === "founded|out|~")!;
  assert.deepEqual([into.x, into.y, into.layoutOptions["elk.port.side"]], [4.5, 0, "NORTH"]);
  assert.deepEqual([out.x, out.y, out.layoutOptions["elk.port.side"]], [4.5, 14, "SOUTH"]);
  // Rob is away from nug3 and its first slot is empty: the spine is placed by the slot.
  assert.equal(node("nug3").ports!.find((p) => p.id === "nug3|in|~")!.x, 4.5);
  const p = loomGraphFor(story, "subway").graph.children.find((n) => n.id === "founded")!.ports!;
  const sub = p.find((q) => q.id === "founded|out|~")!;
  assert.deepEqual([sub.x, sub.y, sub.layoutOptions["elk.port.side"]], [14, 4.5, "EAST"]);
});

test("a moment off the ribbon has no spine port", () => {
  for (const id of ["rob-nix", "booth", "camp"]) {
    assert.ok(!node(id).ports!.some((p) => p.id.endsWith("|~")), id);
  }
});

test("the spine joins each moment on the ribbon to the next, out to in, and goes through the pass-through instead of a moment off it", () => {
  assert.deepEqual(
    spine.map((e) => `${e.id} ${e.sources[0]}>${e.targets[0]}`),
    [
      "spine:0 founded|out|~>nug1|in|~",
      "spine:1 nug1|out|~>nug2|in|~",
      "spine:2 nug2|out|~>pass:camp|in|~",
      "spine:3 pass:camp|out|~>nug3|in|~",
      "spine:4 nug3|out|~>scale|in|~",
      "spine:5 scale|out|~>nug4|in|~",
    ],
  );
});

test("the spine is held straight and is nobody's thread", () => {
  assert.equal(spine.length, 6);
  for (const e of spine) {
    assert.equal(e.layoutOptions!["elk.layered.priority.straightness"], "1000");
    assert.equal(meta.get(e.id), undefined);
  }
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

test("a meetup of nothing but gaps is still a node of the right size, with no ports but the spine's", () => {
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
  assert.deepEqual(empty.ports!.map((p) => p.id), ["nug1|in|~", "nug1|out|~"]);
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

test("a side moment with people passing has a pass-through node in its own layer, as wide as the group's slots, with no label", () => {
  assert.equal(passId("camp"), "pass:camp");
  const pass = node("pass:camp");
  assert.equal(
    pass.layoutOptions!["elk.partitioning.partition"],
    node("camp").layoutOptions!["elk.partitioning.partition"],
  );
  assert.equal(pass.layoutOptions!["elk.portConstraints"], "FIXED_POS");
  // five in the group at the camp: (5 - 1) * 7 + 16
  assert.deepEqual([pass.width, pass.height], [44, 14]);
  const subway = loomGraphFor(story, "subway").graph.children.find((n) => n.id === "pass:camp")!;
  assert.deepEqual([subway.width, subway.height], [14, 44]);
  assert.equal(pass.labels, undefined);
  assert.equal(pass.layoutOptions!["elk.nodeLabels.placement"], undefined);
});

test("the pass-through has a port in and a port out for each person passing, at their ribbon slot's offset, with no size, and a spine port pair half a slot before the first slot", () => {
  const ports = node("pass:camp").ports!;
  assert.deepEqual(
    ports.map((p) => [p.id, p.x, p.y, p.width, p.height, p.layoutOptions["elk.port.side"]]),
    [
      ["pass:camp|in|david", 22, 0, 0, 0, "NORTH"],
      ["pass:camp|out|david", 22, 14, 0, 0, "SOUTH"],
      ["pass:camp|in|jared", 29, 0, 0, 0, "NORTH"],
      ["pass:camp|out|jared", 29, 14, 0, 0, "SOUTH"],
      ["pass:camp|in|mica", 36, 0, 0, 0, "NORTH"],
      ["pass:camp|out|mica", 36, 14, 0, 0, "SOUTH"],
      ["pass:camp|in|~", 4.5, 0, 0, 0, "NORTH"],
      ["pass:camp|out|~", 4.5, 14, 0, 0, "SOUTH"],
    ],
  );
  // the same offsets as their slots at the meetup before
  for (const slug of ["david", "jared", "mica"]) {
    assert.equal(
      ports.find((p) => p.id === portId("pass:camp", "in", slug))!.x,
      node("nug2").ports!.find((p) => p.id === portId("nug2", "in", slug))!.x,
      slug,
    );
  }
  const sub = loomGraphFor(story, "subway").graph.children.find((n) => n.id === "pass:camp")!.ports!;
  const david = sub.find((p) => p.id === "pass:camp|out|david")!;
  assert.deepEqual([david.x, david.y, david.layoutOptions["elk.port.side"]], [14, 22, "EAST"]);
});

test("a side moment nobody passes, before the group or naming nobody while there is no group, has no pass-through", () => {
  const s = buildStory([at("nobody", "2018-01", []), ...MOMENTS], PEOPLE);
  const ids = loomGraphFor(s, "river").graph.children.map((n) => n.id);
  assert.ok(ids.includes("nobody"));
  for (const id of ["nobody", "rob-nix", "booth"]) {
    assert.ok(!ids.includes(passId(id)), id);
  }
  assert.deepEqual(ids.filter((id) => id.startsWith("pass:")), ["pass:camp"]);
});

test("a person passing a side moment has an edge into the pass-through and an edge out of it, and no edge that skips it", () => {
  for (const slug of ["david", "jared", "mica"]) {
    const h = hops(slug);
    assert.ok(h.includes(`nug2|out|${slug}>pass:camp|in|${slug}`), slug);
    assert.ok(h.includes(`pass:camp|out|${slug}>nug3|in|${slug}`), slug);
    assert.ok(!h.includes(`nug2|out|${slug}>nug3|in|${slug}`), slug);
  }
  // one edge per stop: the face's, then one into each moment and pass-through
  assert.deepEqual(hops("david"), [
    "root:david>booth|in|david",
    "booth|out|david>founded|in|david",
    "founded|out|david>nug1|in|david",
    "nug1|out|david>nug2|in|david",
    "nug2|out|david>pass:camp|in|david",
    "pass:camp|out|david>nug3|in|david",
    "nug3|out|david>scale|in|david",
    "scale|out|david>nug4|in|david",
  ]);
  assert.deepEqual(
    graph.edges.filter((e) => meta.get(e.id)?.slug === "david").map((e) => e.id),
    ["david:0", "david:1", "david:2", "david:3", "david:4", "david:5", "david:6", "david:7"],
  );
  assert.equal(meta.get("david:5")!.slug, "david");
});

test("a person at the side moment has no port on its pass-through", () => {
  for (const slug of ["rob", "daniel"]) {
    assert.ok(!node("pass:camp").ports!.some((p) => p.id.endsWith(`|${slug}`)), slug);
    assert.ok(!hops(slug).some((h) => h.includes("pass:camp")), slug);
  }
  assert.ok(hops("daniel").includes("nug2|out|daniel>camp|in|daniel"));
});

test("with a trailing side moment no person's last edge ends at a pass-through, and no pass-through exists that nobody passes", () => {
  for (const extra of [
    [at("conf", "2024-09", ["rob", "daniel"])],
    [at("conf", "2024-09", ["rob", "daniel"]), at("camp2", "2024-10", ["mica"])],
  ]) {
    const s = buildStory([...MOMENTS, ...extra], PEOPLE);
    const built = loomGraphFor(s, "river");
    const ids = extra.map((m) => m.id).join(" ");
    for (const t of s.threads) {
      const mine = built.graph.edges.filter((e) => built.meta.get(e.id)?.slug === t.person.slug);
      assert.ok(!mine.at(-1)!.targets[0].startsWith("pass:"), `${ids}: ${t.person.slug}`);
    }
    for (const n of built.graph.children.filter((c) => c.id.startsWith("pass:"))) {
      assert.ok(n.ports!.some((p) => !p.id.endsWith("|~")), `${ids}: ${n.id}`);
    }
  }
});

test("the spine runs through the pass-through between the meetups either side of it, each piece held straight", () => {
  const into = spine.find((e) => e.targets[0] === "pass:camp|in|~")!;
  const out = spine.find((e) => e.sources[0] === "pass:camp|out|~")!;
  assert.equal(into.sources[0], "nug2|out|~");
  assert.equal(out.targets[0], "nug3|in|~");
  for (const e of [into, out]) {
    assert.equal(e.layoutOptions!["elk.layered.priority.straightness"], "1000");
    assert.equal(meta.get(e.id), undefined);
  }
  assert.ok(!spine.some((e) => e.sources[0] === "nug2|out|~" && e.targets[0] === "nug3|in|~"));
});
