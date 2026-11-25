import test from "node:test";
import assert from "node:assert/strict";
import { LABEL_HEIGHT, labelWidth, MOMENT_AVATAR, rootId } from "../src/elk.ts";
import type { ElkGraph, ElkPoint } from "../src/elk.ts";
import { loomGraphFor, passId, portId } from "../src/loom-graph.ts";
import {
  AWAY_GAP,
  centreLoomIn,
  loomPlacedFrom,
  placeLoom,
  slotKey,
} from "../src/loom-place.ts";
import { fakeLoomLayout } from "./fake-loom-elk.ts";
import { marked, story } from "./story-fixture.ts";

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
  assert.equal(placed.slots.get(slotKey("nug3", "connor")), undefined);
  assert.equal(placed.slots.get(slotKey("camp", "david")), undefined);
});

test("someone away from a meetup keeps their slot in it, where the hollow bead goes", () => {
  const box = placed.boxes.get("nug3")!;
  assert.deepEqual(placed.slots.get(slotKey("nug3", "rob")), { x: box.x + 8, y: box.y + 7 });
});

test("a thread stops AWAY_GAP short of a meetup its person is away from and starts again AWAY_GAP after it, at their slot across it", async () => {
  assert.equal(AWAY_GAP, 3.5);
  for (const mode of ["river", "subway"] as const) {
    const p = await placeLoom(story, mode, fakeLoomLayout);
    const box = p.boxes.get("nug3")!;
    const slot = p.slots.get(slotKey("nug3", "rob"))!;
    const rob = p.edges.filter((e) => e.meta.slug === "rob");
    const into = rob.find((e) => e.to === "nug3")!;
    const out = rob.find((e) => e.from === "nug3")!;
    const [stop, start] = mode === "river"
      ? [{ x: slot.x, y: box.y - 3.5 }, { x: slot.x, y: box.y + box.height + 3.5 }]
      : [{ x: box.x - 3.5, y: slot.y }, { x: box.x + box.width + 3.5, y: slot.y }];
    // The point the layout gave on the pill's edge is replaced, not kept beside
    // it: the fake layout's one bend comes straight before and after.
    assert.deepEqual(into.points.slice(-2), [{ x: 7, y: 7 }, stop], mode);
    assert.deepEqual(out.points.slice(0, 2), [start, { x: 7, y: 7 }], mode);
    // and the other ends of those edges are carried to the slot as ever
    assert.deepEqual(into.points[0], p.slots.get(slotKey("camp", "rob")), mode);
    assert.deepEqual(out.points.at(-1), p.slots.get(slotKey("scale", "rob")), mode);
  }
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
  assert.equal(spine.length, 6);
  assert.equal(mapped.edges.length, built.graph.edges.length - spine.length);
});

test("a thread runs through every oval on its path that its person is not away from, from its slot to its slot", () => {
  const same = (a: ElkPoint, b: ElkPoint) => a.x === b.x && a.y === b.y;
  for (const thread of story.threads) {
    const slug = thread.person.slug;
    const edges = placed.edges.filter((e) => e.meta.slug === slug);
    thread.path.forEach((g, index) => {
      const slot = placed.slots.get(slotKey(g.moment.id, slug))!;
      if (g.through.find((p) => p.slug === slug)!.away) {
        assert.ok(!edges.some((e) => same(e.points.at(-1)!, slot) || same(e.points[0], slot)), `${slug} at ${g.moment.id}`);
        return;
      }
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
    // every hop has two slot ends but a face's first hop, which has one, and
    // Rob's two hops at nug3, which he is away from
    assert.equal(checked, 2 * p.edges.length - story.threads.length - 2, mode);
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

test("a moment's avatar sits in the room its label was given: at the far end in River, on top in Subway", async () => {
  for (const mode of ["river", "subway"] as const) {
    const built = loomGraphFor(marked, mode);
    const mapped = loomPlacedFrom(built, await fakeLoomLayout(built.graph), marked, mode);
    const i = built.graph.children.findIndex((n) => n.id === "camp");
    const node = built.graph.children[i];
    const label = node.labels![0];
    // where the fake layout puts the label's box
    const left = 100 + i * 20 + (-label.width - 12);
    const top = Number(node.layoutOptions!["elk.partitioning.partition"]) * 50 + 1;
    assert.equal(mapped.avatars.size, 1, mode);
    if (mode === "river") {
      assert.deepEqual(mapped.avatars.get("camp"), {
        x: left + MOMENT_AVATAR,
        y: top + label.height / 2,
      });
      // the text hangs off the end nearest the oval as ever, on the middle
      // line of the taller box
      assert.deepEqual(mapped.labels.get("camp"), {
        x: left + label.width,
        y: top + (label.height - LABEL_HEIGHT) / 2 + 11,
        anchor: "end",
        text: "camp",
      });
    } else {
      assert.deepEqual(mapped.avatars.get("camp"), {
        x: left + label.width / 2,
        y: top + MOMENT_AVATAR,
      });
      // and under the avatar, on the box's last line
      assert.deepEqual(mapped.labels.get("camp"), {
        x: left + label.width / 2,
        y: top + (label.height - LABEL_HEIGHT) + 11,
        anchor: "middle",
        text: "camp",
      });
    }
  }
});

test("a story with no avatars has none placed, and centring moves an avatar with everything else", async () => {
  assert.equal(placed.avatars.size, 0);
  const p = await placeLoom(marked, "river", fakeLoomLayout);
  const wide = centreLoomIn(p, p.width + 200);
  const at = p.avatars.get("camp")!;
  assert.deepEqual(wide.avatars.get("camp"), { x: at.x + 100, y: at.y });
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

test("a pass-through comes back under passes, keyed by the side moment's id, and not as a moment, a box or a label", async () => {
  const built = loomGraphFor(story, "river");
  const mapped = loomPlacedFrom(
    built,
    await fakeLoomLayout(built.graph),
    story,
    "river",
  );
  const i = built.graph.children.findIndex((n) => n.id === passId("camp"));
  // the camp is the sixth moment, so its layer is partition 6
  assert.deepEqual(mapped.passes.get("camp"), { x: 100 + i * 20, y: 6 * 50, width: 44, height: 14 });
  assert.deepEqual([...mapped.passes.keys()], ["camp"]);
  for (const map of [mapped.moments, mapped.boxes, mapped.labels]) {
    assert.ok(!map.has(passId("camp")));
  }
  const camp = built.graph.children.findIndex((n) => n.id === "camp");
  assert.equal(mapped.boxes.get("camp")!.x, 100 + camp * 20);
  assert.equal(mapped.moments.size, story.moments.length);
  assert.equal(mapped.boxes.size, story.moments.length);
  assert.equal(mapped.labels.size, story.moments.length);
});

test("a passing person's two edges meet at one point inside the pass-through, at their slot's offset", () => {
  const box = placed.passes.get("camp")!;
  const slot = placed.slots.get(slotKey(passId("camp"), "david"));
  // David holds slot 2 of the five in the group: 8 + 2 * 7 across, the middle along.
  assert.deepEqual(slot, { x: box.x + 22, y: box.y + 7 });
  const david = placed.edges.filter((e) => e.meta.slug === "david");
  const into = david.find((e) => e.to === passId("camp"))!;
  const out = david.find((e) => e.from === passId("camp"))!;
  assert.deepEqual(into.points.at(-1), slot);
  assert.deepEqual(out.points[0], slot);
  // The person at the camp has no place in its pass-through.
  assert.equal(placed.slots.get(slotKey(passId("camp"), "rob")), undefined);
});

test("every edge says where it is from and where it goes to: a face, a moment or a pass-through", () => {
  assert.deepEqual(
    placed.edges.filter((e) => e.meta.slug === "david").map((e) => [e.from, e.to]),
    [
      [rootId("david"), "booth"],
      ["booth", "founded"],
      ["founded", "nug1"],
      ["nug1", "nug2"],
      ["nug2", passId("camp")],
      [passId("camp"), "nug3"],
      ["nug3", "scale"],
      ["scale", "nug4"],
    ],
  );
  assert.deepEqual(
    placed.edges.filter((e) => e.meta.slug === "rob").map((e) => [e.from, e.to]).slice(-4),
    [["nug2", "camp"], ["camp", "nug3"], ["nug3", "scale"], ["scale", "nug4"]],
  );
});

test("centring moves a pass-through's box by the same amount as everything else", () => {
  const wide = centreLoomIn(placed, placed.width + 200);
  const box = placed.passes.get("camp")!;
  assert.deepEqual(wide.passes.get("camp"), { ...box, x: box.x + 100 });
  const key = slotKey(passId("camp"), "david");
  const slot = placed.slots.get(key)!;
  assert.deepEqual(wide.slots.get(key), { ...slot, x: slot.x + 100 });
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
