import test from "node:test";
import assert from "node:assert/strict";
import { parseFuzzyDate } from "../src/dates.ts";
import { buildBraid } from "../src/layout.ts";
import { graphFor, LABEL_MAX, rootId } from "../src/graph.ts";
import type { ElkEdge, ElkNode } from "../src/graph.ts";
import type { Moment, Person } from "../src/types.ts";

function person(slug: string, member = true): Person {
  return {
    slug,
    name: slug,
    alias: `@${slug}`,
    description: "",
    quote: "",
    imageUrl: "",
    profileUrl: "",
    member,
  };
}

function at(
  id: string,
  date: string,
  people: string[],
  trunk = false,
): Moment {
  return { id, date: parseFuzzyDate(date), title: id, people, trunk };
}

const PEOPLE = new Map(
  ["daniel", "rok", "david", "rob", "tristan", "kyle"].map((s) => [
    s,
    person(s, s !== "rok"),
  ]),
);

// Personal roots, convergence, the spine, a join, and a detour that recruits
// somebody who then joins at the next meetup.
const STORY: Moment[] = [
  at("daniel-nix", "2021-10-23", ["daniel"]),
  at("tweag", "2022-02-21", ["daniel"]),
  at("meets-rok", "2022-03", ["daniel", "rok"]),
  at("code-and-coffee", "2022-08-27", ["daniel", "david"]),
  at("scale-20x", "2023-03", ["daniel", "rob", "david"]),
  at("snug-founded", "2023-04", ["daniel", "david", "rob"], true),
  at("nug3", "2023-09-19", ["tristan"], true),
  at("nix-camp", "2023-10", ["daniel", "rob", "david", "kyle"]),
  at("nug4", "2024-01-25", ["kyle"], true),
];

const braid = buildBraid(STORY, PEOPLE);
const { graph, meta } = graphFor(braid, "river");

const node = (id: string): ElkNode => graph.children.find((n) => n.id === id)!;
const partition = (id: string) =>
  Number(node(id).layoutOptions!["elk.partitioning.partition"]);
const edgesFrom = (id: string): ElkEdge[] =>
  graph.edges.filter((e) => e.sources[0] === id);
const hops = (slug: string) =>
  graph.edges
    .filter((e) => meta.get(e.id)?.kind === "thread")
    .filter((e) => {
      const m = meta.get(e.id)!;
      return m.kind === "thread" && m.slug === slug;
    })
    .map((e) => `${e.sources[0]}>${e.targets[0]}`);

test("every moment is a node pinned to its own layer, in date order", () => {
  const partitions = braid.moments.map((m) => partition(m.moment.id));
  for (let i = 1; i < partitions.length; i += 1) {
    assert.ok(
      partitions[i] > partitions[i - 1],
      `${braid.moments[i].moment.id} is not after its predecessor`,
    );
  }
});

test("a root sits one layer before its person's first moment", () => {
  for (const thread of braid.threads) {
    const first = thread.segments[0].points[0].moment.id;
    assert.equal(
      partition(rootId(thread.person.slug)),
      partition(first) - 1,
      thread.person.slug,
    );
  }
});

test("a root is the size of a face", () => {
  assert.equal(node(rootId("daniel")).width, 36);
  assert.equal(node(rootId("daniel")).height, 36);
});

test("trunk edges are asked to stay straight", () => {
  const trunk = graph.edges.filter((e) => meta.get(e.id)?.kind === "trunk");
  assert.equal(trunk.length, braid.trunk.length);
  for (const e of trunk) {
    assert.ok(
      Number(e.layoutOptions!["elk.layered.priority.straightness"]) > 0,
      e.id,
    );
  }
});

test("a trunk edge carries the width its segment draws at", () => {
  const widths = graph.edges
    .filter((e) => meta.get(e.id)?.kind === "trunk")
    .map((e) => {
      const m = meta.get(e.id)!;
      return m.kind === "trunk" ? m.width : -1;
    });
  assert.ok(widths.every((w) => w > 0));
  assert.ok(Math.min(...widths) < Math.max(...widths), "thickness never changes");
});

test("a thread becomes one edge per hop, from its root", () => {
  assert.deepEqual(hops("daniel"), [
    "root:daniel>daniel-nix",
    "daniel-nix>tweag",
    "tweag>meets-rok",
    "meets-rok>code-and-coffee",
    "code-and-coffee>scale-20x",
    "scale-20x>snug-founded",
    // the detour, as two hops through its moment, from the meetup before it
    "nug3>nix-camp",
    "nix-camp>nug4",
  ]);
});

test("someone recruited at a detour still reaches the meetup they joined at", () => {
  assert.deepEqual(hops("kyle"), ["root:kyle>nix-camp", "nix-camp>nug4"]);
});

test("a guest who never joins stops at their last moment", () => {
  assert.deepEqual(hops("rok"), ["root:rok>meets-rok"]);
});

test("every hop knows whose it is and which kind", () => {
  for (const e of graph.edges) {
    const m = meta.get(e.id);
    assert.ok(m !== undefined, `${e.id} has no meta`);
    if (m.kind === "thread") {
      assert.ok(m.segment === "approach" || m.segment === "excursion");
      assert.ok(["daniel", "rok", "david", "rob", "tristan", "kyle"].includes(m.slug));
    }
  }
  const ids = graph.edges.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "edge ids repeat");
});

test("a detour's hops are marked as such and an approach's are not", () => {
  const kinds = new Map(
    graph.edges.map((e) => [`${e.sources[0]}>${e.targets[0]}`, meta.get(e.id)!]),
  );
  const camp = kinds.get("nug3>nix-camp")!;
  assert.ok(camp.kind === "thread" && camp.segment === "excursion");
  const tweag = kinds.get("daniel-nix>tweag")!;
  assert.ok(tweag.kind === "thread" && tweag.segment === "approach");
});

const labelOf = (title: string) => {
  const titled = { ...STORY[0], title };
  const g = graphFor(buildBraid([titled, ...STORY.slice(1)], PEOPLE), "river");
  return g.graph.children.find((n) => n.id === titled.id)!.labels![0];
};

test("a label's room is the width of the text it shows", () => {
  const short = node("tweag").labels![0];
  assert.equal(short.text, "tweag");
  assert.equal(short.width, 5 * 6.4);
  assert.equal(short.height, 14);
});

test("a title too long for a label is cut to fit, and ends in an ellipsis", () => {
  // The text ELK is given room for is the text that gets drawn. Reserving
  // 150px and then drawing 220px of title put the start of two meetup names
  // off the left edge of the picture on a phone.
  const title = "Mini NUG @ Legend Chicken Hawaiian Gardens";
  const label = labelOf(title);
  assert.ok(label.text.endsWith("…"), label.text);
  assert.ok(title.startsWith(label.text.slice(0, -1)), label.text);
  assert.ok(label.width <= LABEL_MAX, `${label.width}px claimed`);
  assert.equal(label.width, Math.round(label.text.length * 6.4 * 10) / 10);
});

test("a cut title keeps as much as fits", () => {
  const label = labelOf("x".repeat(80));
  assert.ok(
    (label.text.length + 1) * 6.4 > LABEL_MAX,
    `${label.text.length} characters shown, and one more would have fitted`,
  );
});

test("a title that fits exactly is left whole", () => {
  const title = "x".repeat(Math.floor(LABEL_MAX / 6.4));
  assert.equal(labelOf(title).text, title);
});

test("river hangs labels beside the node and runs down; subway above and across", () => {
  assert.equal(graph.layoutOptions["elk.direction"], "DOWN");
  assert.ok(node("tweag").layoutOptions!["elk.nodeLabels.placement"].includes("H_LEFT"));
  const subway = graphFor(braid, "subway");
  assert.equal(subway.graph.layoutOptions["elk.direction"], "RIGHT");
  assert.ok(
    subway.graph.children.find((n) => n.id === "tweag")!
      .layoutOptions!["elk.nodeLabels.placement"].includes("V_TOP"),
  );
});

test("time is pinned by partitions, not left to the layering", () => {
  assert.equal(graph.layoutOptions["elk.partitioning.activate"], "true");
  assert.equal(graph.layoutOptions["elk.algorithm"], "layered");
});

test("nothing leaves a root but its own thread", () => {
  for (const thread of braid.threads) {
    const out = edgesFrom(rootId(thread.person.slug));
    assert.equal(out.length, 1, thread.person.slug);
    const m = meta.get(out[0].id)!;
    assert.ok(m.kind === "thread" && m.slug === thread.person.slug);
  }
});
