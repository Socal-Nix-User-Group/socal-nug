import test from "node:test";
import assert from "node:assert/strict";
import { drawLoom } from "../src/loom-draw.ts";
import { placeLoom, slotKey } from "../src/loom-place.ts";
import { buildStory } from "../src/story.ts";
import type { DocumentLike, ElementLike } from "../src/render.ts";
import { fakeLoomLayout } from "./fake-loom-elk.ts";
import { at, PEOPLE, story } from "./story-fixture.ts";

interface Node {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
  text: string;
}

/** A recording stand-in for `document`. No DOM library is available here. */
function stubDocument(): { doc: DocumentLike; made: Node[] } {
  const made: Node[] = [];
  const doc: DocumentLike = {
    createElementNS(_ns: string, tag: string): ElementLike {
      const node: Node = { tag, attrs: {}, children: [], text: "" };
      made.push(node);
      const element = {
        node,
        setAttribute(name: string, value: string) {
          node.attrs[name] = value;
        },
        appendChild(child: ElementLike) {
          node.children.push((child as unknown as { node: Node }).node);
          return child;
        },
        set textContent(value: string) {
          node.text = value;
        },
        get textContent() {
          return node.text;
        },
      };
      return element as unknown as ElementLike;
    },
  };
  return { doc, made };
}

const withClass = (made: Node[], token: string) =>
  made.filter((n) => (n.attrs.class ?? "").split(" ").includes(token));

async function draw(mode: "river" | "subway" = "river") {
  const placed = await placeLoom(story, mode, fakeLoomLayout);
  const { doc, made } = stubDocument();
  const root = drawLoom(placed, story, doc);
  return { placed, root, made };
}

const { placed, made } = await draw();

test("the svg is the layout's size, says its mode and is a named group", async () => {
  const svg = made.find((n) => n.tag === "svg")!;
  assert.equal(svg.attrs.viewBox, `0 0 ${placed.width} ${placed.height}`);
  assert.equal(svg.attrs.width, String(placed.width));
  assert.equal(svg.attrs.height, String(placed.height));
  assert.ok(svg.attrs.class.includes("is-river"));
  assert.equal(svg.attrs["aria-hidden"], undefined);
  assert.equal(svg.attrs.role, "group");
  assert.ok((svg.attrs["aria-label"] ?? "").length > 0);
  const subway = await draw("subway");
  assert.ok(
    subway.made.find((n) => n.tag === "svg")!.attrs.class.includes("is-subway"),
  );
});

test("each change of year is marked once, the opening year in the corner", () => {
  const years = withClass(made, "origins-year");
  assert.deepEqual(
    years.map((y) => y.text),
    ["2018", "2023", "2024"],
  );
  assert.ok(withClass(made, "origins-year").every((y) => y.tag === "text"));
  assert.equal(withClass(made, "origins-year-tick").length, 2);
});

/** The points a path's `d` passes through: its M points and the end of each C. */
function anchors(d: string): Array<{ x: number; y: number; move: boolean }> {
  const out: Array<{ x: number; y: number; move: boolean }> = [];
  for (const part of d.match(/[MC][^MC]*/g) ?? []) {
    const v = part.slice(1).trim().split(/[\s,]+/).map(Number);
    if (part[0] === "M") out.push({ x: v[0], y: v[1], move: true });
    else for (let i = 4; i < v.length; i += 6) out.push({ x: v[i], y: v[i + 1], move: false });
  }
  return out;
}

test("there is exactly one thread path per person, in thread order, that says whose it is", () => {
  const threads = withClass(made, "origins-thread");
  assert.deepEqual(
    threads.map((p) => p.attrs["data-person"]),
    story.threads.map((t) => t.person.slug),
  );
  threads.forEach((path, i) => {
    const meta = placed.edges.find((e) => e.meta.slug === story.threads[i].person.slug)!.meta;
    assert.equal(path.tag, "path");
    assert.equal(path.attrs["data-hue"], String(meta.hue));
    assert.equal(path.attrs.fill, "none");
    assert.ok(path.attrs.class.split(" ").includes(meta.member ? "is-member" : "is-guest"));
    // every edge joins the next, so one subpath
    assert.equal(path.attrs.d.match(/M/g)!.length, 1, meta.slug);
  });
});

test("a thread path starts at its person's face and passes through their slot at every moment on their path, in order", () => {
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
  for (const thread of story.threads) {
    const slug = thread.person.slug;
    const path = withClass(made, "origins-thread").find((p) => p.attrs["data-person"] === slug)!;
    const at = anchors(path.attrs.d);
    assert.ok(near(at[0], placed.roots.get(slug)!), slug);
    let from = 0;
    for (const g of thread.path) {
      const slot = placed.slots.get(slotKey(g.moment.id, slug))!;
      const found = at.findIndex((p, i) => i >= from && near(p, slot));
      assert.ok(found >= 0, `${slug} does not pass their slot at ${g.moment.id} in order`);
      from = found + 1;
    }
  }
});

test("a person whose edges do not all join gets one path with a second M where the gap is", () => {
  // Rob's fourth edge left out, as if the layout had not routed it.
  const robs = placed.edges.filter((e) => e.meta.slug === "rob");
  const gapped = { ...placed, edges: placed.edges.filter((e) => e !== robs[3]) };
  const { doc, made: drawn } = stubDocument();
  drawLoom(gapped, story, doc);
  const rob = withClass(drawn, "origins-thread").filter((p) => p.attrs["data-person"] === "rob");
  assert.equal(rob.length, 1);
  const at = anchors(rob[0].attrs.d);
  assert.equal(at.filter((p) => p.move).length, 2);
  const second = at.findIndex((p, i) => i > 0 && p.move);
  assert.deepEqual([at[second].x, at[second].y], [robs[4].points[0].x, robs[4].points[0].y]);
});

test("no path is a trunk and no ring is drawn", () => {
  assert.equal(withClass(made, "origins-trunk").length, 0);
  assert.equal(withClass(made, "origins-node-halo").length, 0);
});

test("a moment is an oval the size of its box, inside a button that names it", () => {
  const node = withClass(made, "origins-node").find((n) => n.attrs["data-moment"] === "founded")!;
  assert.equal(node.tag, "g");
  assert.equal(node.attrs.role, "button");
  assert.equal(node.attrs.tabindex, "-1");
  assert.equal(node.attrs["aria-label"], "founded, April 2023, 3 in the group");
  const oval = node.children.find((c) => c.attrs.class === "origins-oval")!;
  assert.deepEqual([Number(oval.attrs.rx), Number(oval.attrs.ry)], [15, 7]);
  const hit = node.children.find((c) => c.attrs.class === "origins-node-hit")!;
  assert.deepEqual([Number(hit.attrs.rx), Number(hit.attrs.ry)], [21, 13]);
  const box = placed.boxes.get("founded")!;
  const centre = [box.x + box.width / 2, box.y + box.height / 2];
  for (const ellipse of [oval, hit]) {
    assert.deepEqual([Number(ellipse.attrs.cx), Number(ellipse.attrs.cy)], centre);
  }
});

test("a meetup and another moment are told apart", () => {
  const classOf = (id: string) =>
    withClass(made, "origins-node").find((n) => n.attrs["data-moment"] === id)!.attrs.class;
  assert.ok(classOf("founded").split(" ").includes("is-trunk"));
  assert.ok(classOf("camp").split(" ").includes("is-side"));
  assert.equal(withClass(made, "origins-node").length, story.moments.length);
});

test("there is a bead exactly where the record vouches", () => {
  const beads = withClass(made, "origins-bead");
  const vouched = story.moments.flatMap((g) => g.through.filter((p) => p.vouched));
  assert.equal(beads.length, vouched.length);
});

test("a bead sits on its person's slot, in their colour", () => {
  const beads = withClass(made, "origins-bead");
  const expected = story.moments.flatMap((g) =>
    g.through
      .filter((p) => p.vouched)
      .map((p) => ({ at: placed.slots.get(slotKey(g.moment.id, p.slug))!, slug: p.slug })),
  );
  beads.forEach((bead, i) => {
    assert.equal(bead.tag, "circle");
    assert.equal(Number(bead.attrs.cx), expected[i].at.x);
    assert.equal(Number(bead.attrs.cy), expected[i].at.y);
    assert.equal(bead.attrs["data-person"], expected[i].slug);
    const index = story.threads.findIndex((t) => t.person.slug === expected[i].slug);
    assert.equal(bead.attrs["data-hue"], String(index));
  });
});

test("the bead where someone joined is the larger, gold one", () => {
  const beads = withClass(made, "origins-bead");
  const joins = beads.filter((b) => b.attrs.class.split(" ").includes("is-join"));
  const joinedCount = story.moments.flatMap((g) => g.through.filter((p) => p.joined)).length;
  assert.equal(joins.length, joinedCount);
  assert.ok(joins.every((b) => b.attrs.r === "3.6"));
  assert.ok(beads.filter((b) => !joins.includes(b)).every((b) => b.attrs.r === "2.6"));
});

test("jared's bead at the meetup he joined is the gold one", () => {
  const slot = placed.slots.get(slotKey("nug1", "jared"))!;
  const bead = withClass(made, "origins-bead").find(
    (b) =>
      b.attrs["data-person"] === "jared" &&
      Number(b.attrs.cx) === slot.x &&
      Number(b.attrs.cy) === slot.y,
  )!;
  assert.ok(bead.attrs.class.split(" ").includes("is-join"));
});

test("a meetup nobody is recorded at is an oval with no beads", async () => {
  const gaps = buildStory(
    [at("founded", "2023-04", ["rob"], true), at("quiet", "2023-06", [], true)],
    PEOPLE,
  );
  const placedGaps = await placeLoom(gaps, "river", fakeLoomLayout);
  const { doc, made: madeGaps } = stubDocument();
  drawLoom(placedGaps, gaps, doc);
  const ovals = withClass(madeGaps, "origins-node");
  assert.ok(ovals.some((n) => n.attrs["data-moment"] === "quiet"));
  const quiet = placedGaps.slots.get(slotKey("quiet", "rob"))!;
  assert.ok(quiet !== undefined);
  const beads = withClass(madeGaps, "origins-bead");
  assert.deepEqual(
    beads.map((b) => b.attrs.class),
    ["origins-bead is-join"],
  );
  assert.ok(
    beads.every((b) => Number(b.attrs.cx) !== quiet.x || Number(b.attrs.cy) !== quiet.y),
  );
});

test("a bead is decoration: no role, no tab stop", () => {
  for (const bead of withClass(made, "origins-bead")) {
    assert.equal(bead.attrs.role, undefined);
    assert.equal(bead.attrs.tabindex, undefined);
  }
});

test("ovals are drawn after threads, beads after ovals, faces after beads, labels last", () => {
  const indices = (token: string) =>
    made.map((n, i) => ((n.attrs.class ?? "").split(" ").includes(token) ? i : -1)).filter((i) => i >= 0);
  const last = (token: string) => Math.max(...indices(token));
  const first = (token: string) => Math.min(...indices(token));
  assert.ok(last("origins-thread") < first("origins-node"));
  assert.ok(last("origins-node") < first("origins-bead"));
  assert.ok(last("origins-bead") < first("origins-root"));
  assert.ok(last("origins-root") < first("origins-label"));
  assert.ok(last("origins-year") < first("origins-thread"));
});

test("every face is a button named for its person", () => {
  const faces = withClass(made, "origins-root");
  assert.equal(faces.length, story.threads.length);
  faces.forEach((face, i) => {
    assert.equal(face.tag, "g");
    assert.equal(face.attrs.role, "button");
    assert.equal(face.attrs.tabindex, "-1");
    assert.equal(face.attrs["data-hue"], String(i));
    assert.equal(
      face.attrs["aria-label"],
      `${story.threads[i].person.slug.toUpperCase()}, member`,
    );
  });
  assert.equal(
    faces.find((f) => f.attrs["data-person"] === "rob")!.attrs["aria-label"],
    "ROB, member",
  );
});

test("every label is text where the layout left room for it", () => {
  const labels = withClass(made, "origins-label");
  assert.equal(labels.length, placed.labels.size);
  assert.deepEqual(
    labels.map((l) => l.text),
    story.moments.map((g) => placed.labels.get(g.moment.id)).filter((l) => l !== undefined).map((l) => l!.text),
  );
});

test("no attribute is ever NaN or undefined", async () => {
  for (const drawn of [made, (await draw("subway")).made]) {
    for (const node of drawn) {
      for (const [name, value] of Object.entries(node.attrs)) {
        assert.ok(
          !/NaN|undefined/.test(value),
          `${node.tag} ${name}="${value}"`,
        );
      }
    }
  }
});

test("subway draws the same things turned", async () => {
  const subway = await draw("subway");
  const node = withClass(subway.made, "origins-node").find((n) => n.attrs["data-moment"] === "founded")!;
  const oval = node.children.find((c) => c.attrs.class === "origins-oval")!;
  assert.deepEqual([Number(oval.attrs.rx), Number(oval.attrs.ry)], [7, 15]);
  assert.equal(withClass(subway.made, "origins-thread").length, story.threads.length);
  assert.equal(
    withClass(subway.made, "origins-bead").length,
    withClass(made, "origins-bead").length,
  );
});
