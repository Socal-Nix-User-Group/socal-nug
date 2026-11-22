import test from "node:test";
import assert from "node:assert/strict";
import { drawPlaced } from "../src/draw.ts";
import { placeBraid } from "../src/place.ts";
import type { DocumentLike, ElementLike } from "../src/render.ts";
import { braid, fakeLayout } from "./fake-elk.ts";

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
  const placed = await placeBraid(braid, mode, fakeLayout);
  const { doc, made } = stubDocument();
  const root = drawPlaced(placed, braid, doc);
  return { placed, root, made };
}

test("the svg is the layout's size, hidden from assistive tech, and says its mode", async () => {
  const { made } = await draw();
  const svg = made.find((n) => n.tag === "svg")!;
  assert.equal(svg.attrs.viewBox, "0 0 640 480");
  assert.equal(svg.attrs.width, "640");
  assert.equal(svg.attrs.height, "480");
  assert.equal(svg.attrs["aria-hidden"], "true");
  assert.ok(svg.attrs.class.includes("is-river"));
  const subway = await draw("subway");
  assert.ok(subway.made.find((n) => n.tag === "svg")!.attrs.class.includes("is-subway"));
});

test("every trunk segment is a path at its own thickness", async () => {
  const { placed, made } = await draw();
  const paths = withClass(made, "origins-trunk");
  assert.equal(paths.length, braid.trunk.length);
  const widths = placed.edges
    .filter((e) => e.meta.kind === "trunk")
    .map((e) => (e.meta.kind === "trunk" ? String(e.meta.width) : ""));
  assert.deepEqual(paths.map((p) => p.attrs["stroke-width"]), widths);
});

test("every thread hop is a path that says whose it is and what kind", async () => {
  const { placed, made } = await draw();
  const paths = withClass(made, "origins-thread");
  const hops = placed.edges.filter((e) => e.meta.kind === "thread");
  assert.equal(paths.length, hops.length);
  for (const p of paths) {
    assert.ok(p.attrs["data-person"] === "a" || p.attrs["data-person"] === "b");
    assert.ok(p.attrs["data-hue"] !== undefined);
    assert.ok(
      p.attrs.class.includes("is-approach") || p.attrs.class.includes("is-excursion"),
    );
    assert.ok(
      p.attrs.class.includes("is-member") || p.attrs.class.includes("is-guest"),
    );
    assert.ok(p.attrs.d.startsWith("M"));
  }
  const guest = paths.find((p) => p.attrs["data-person"] === "b")!;
  assert.ok(guest.attrs.class.includes("is-guest"));
});

test("a thread's path runs through the points the layout gave it", async () => {
  const { placed, made } = await draw();
  const hop = placed.edges.find((e) =>
    e.meta.kind === "thread" && e.meta.slug === "b"
  )!;
  const path = withClass(made, "origins-thread").find((p) =>
    p.attrs["data-person"] === "b"
  )!;
  const first = hop.points[0];
  const last = hop.points[hop.points.length - 1];
  assert.ok(path.attrs.d.startsWith(`M${first.x},${first.y}`), path.attrs.d);
  assert.ok(path.attrs.d.endsWith(` ${last.x},${last.y}`), path.attrs.d);
});

test("every moment is a node at its centre, trunk and side told apart", async () => {
  const { placed, made } = await draw();
  const nodes = withClass(made, "origins-node");
  assert.equal(nodes.length, braid.moments.length);
  for (const placedMoment of braid.moments) {
    const id = placedMoment.moment.id;
    const node = nodes.find((n) => n.attrs["data-moment"] === id)!;
    const at = placed.moments.get(id)!;
    assert.equal(Number(node.attrs.cx), at.x);
    assert.equal(Number(node.attrs.cy), at.y);
    assert.ok(
      node.attrs.class.includes(placedMoment.moment.trunk ? "is-trunk" : "is-side"),
    );
  }
});

test("a face sits at its root and is drawn after every node", async () => {
  const { placed, made } = await draw();
  const roots = withClass(made, "origins-root");
  assert.equal(roots.length, braid.threads.length);
  const a = roots.find((r) => r.attrs["data-person"] === "a")!;
  const at = placed.roots.get("a")!;
  assert.equal(a.attrs.transform, `translate(${at.x} ${at.y})`);
  const lastNode = Math.max(...withClass(made, "origins-node").map((n) => made.indexOf(n)));
  const firstRoot = Math.min(...roots.map((r) => made.indexOf(r)));
  assert.ok(firstRoot > lastNode, "a node could cover a face");
});

test("a face carries its thread's palette slot", async () => {
  const { made } = await draw();
  const root = withClass(made, "origins-root").find((r) =>
    r.attrs["data-person"] === "b"
  )!;
  const path = withClass(made, "origins-thread").find((p) =>
    p.attrs["data-person"] === "b"
  )!;
  assert.equal(root.attrs["data-hue"], path.attrs["data-hue"]);
});

test("every moment gets its title as a label where the layout put it", async () => {
  const { placed, made } = await draw();
  const labels = withClass(made, "origins-label");
  assert.equal(labels.length, braid.moments.length);
  const camp = labels.find((l) => l.text === "camp")!;
  const at = placed.labels.get("camp")!;
  assert.equal(Number(camp.attrs.x), at.x);
  assert.equal(Number(camp.attrs.y), at.y);
  assert.equal(camp.attrs["text-anchor"], "end");
});

test("years are marked: the first in the corner, each change as a line across", async () => {
  const { made } = await draw();
  const years = withClass(made, "origins-year").map((n) => n.text);
  assert.deepEqual(years, ["2021", "2023"]);
  const ticks = withClass(made, "origins-year-tick");
  assert.equal(ticks.length, 1);
  // river: a horizontal line across the whole canvas
  assert.ok(/^M0,[\d.]+ L640,[\d.]+$/.test(ticks[0].attrs.d), ticks[0].attrs.d);
});

test("a year line sits between the last moment of one year and the first of the next", async () => {
  const { placed, made } = await draw();
  const tick = withClass(made, "origins-year-tick")[0];
  const y = Number(tick.attrs.d.match(/^M0,([\d.]+)/)![1]);
  const before = placed.moments.get("a-root")!.y;
  const after = placed.moments.get("founded")!.y;
  assert.ok(y > before && y < after, `${y} is not between ${before} and ${after}`);
});
