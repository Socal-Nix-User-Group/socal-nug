import test from "node:test";
import assert from "node:assert/strict";
import { parseFuzzyDate } from "../src/dates.ts";
import { buildBraid } from "../src/layout.ts";
import { projectionFor } from "../src/projections.ts";
import {
  avatarFor,
  flow,
  hueFor,
  LABEL_WIDTH,
  laneRangeOf,
  PALETTE_SIZE,
  renderBraid,
  yearTicks,
} from "../src/render.ts";
import type { DocumentLike, ElementLike } from "../src/render.ts";
import type { Moment, Person } from "../src/types.ts";

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

function person(slug: string, member: boolean, imageUrl = ""): Person {
  return {
    slug,
    name: slug.toUpperCase(),
    alias: `@${slug}`,
    description: "",
    imageUrl,
    profileUrl: "",
    member,
  };
}

function at(id: string, date: string, people: string[], trunk = false): Moment {
  return { id, date: parseFuzzyDate(date), title: id, people, trunk };
}

const PEOPLE = new Map<string, Person>([
  ["daniel", person("daniel", true, "https://example.com/d.png")],
  ["rob", person("rob", true, "https://example.com/r.png")],
  ["rok", person("rok", false)],
  ["kyle", person("kyle", false)],
]);

const MOMENTS: Moment[] = [
  at("daniel-nix", "2021-10-23", ["daniel"]),
  at("meets-rok", "2022-03", ["daniel", "rok"]),
  at("scale", "2023-03", ["daniel", "rob"]),
  at("founded", "2023-04", ["daniel", "rob"], true),
  at("nug3", "2023-09-19", [], true),
  at("camp", "2023-10", ["daniel", "rob", "kyle"]),
  at("nug4", "2024-01-25", [], true),
];

const braid = buildBraid(MOMENTS, PEOPLE);

function draw() {
  const { doc, made } = stubDocument();
  const projection = projectionFor(
    "river",
    { width: 800, height: 900 },
    laneRangeOf(braid),
  );
  const root = renderBraid(braid, projection, doc);
  return { root, made };
}

const withClass = (made: Node[], token: string) =>
  made.filter((n) => (n.attrs.class ?? "").split(" ").includes(token));

test("the root svg is hidden from assistive tech", () => {
  const { made } = draw();
  const svg = made.find((n) => n.tag === "svg")!;
  assert.equal(svg.attrs["aria-hidden"], "true");
});

test("the root svg carries the projection's viewBox", () => {
  const { made } = draw();
  const svg = made.find((n) => n.tag === "svg")!;
  assert.equal(svg.attrs.viewBox, "0 0 800 900");
});

test("the svg's intrinsic size matches the viewport it was given", () => {
  // `height: auto` ties the rendered height to the width, so a viewBox built
  // from a stale container width silently shrinks the picture.
  for (const [w, h] of [[800, 900], [1200, 1610]] as const) {
    const { doc, made } = stubDocument();
    renderBraid(
      braid,
      projectionFor("river", { width: w, height: h }, laneRangeOf(braid)),
      doc,
    );
    const svg = made.find((n) => n.tag === "svg")!;
    assert.equal(svg.attrs.width, String(w));
    assert.equal(svg.attrs.height, String(h));
    assert.equal(svg.attrs.viewBox, `0 0 ${w} ${h}`);
  }
});

test("every moment becomes a node", () => {
  const { made } = draw();
  assert.equal(withClass(made, "origins-node").length, braid.moments.length);
});

test("every drawn thread segment becomes a path", () => {
  const { made } = draw();
  const segments = braid.threads.reduce(
    (total, t) => total + t.segments.length,
    0,
  );
  assert.equal(withClass(made, "origins-thread").length, segments);
});

test("guest threads are dashed and member threads are not", () => {
  const { made } = draw();
  const guest = withClass(made, "origins-thread").filter((n) =>
    (n.attrs.class ?? "").includes("is-guest"),
  );
  const member = withClass(made, "origins-thread").filter((n) =>
    (n.attrs.class ?? "").includes("is-member"),
  );
  assert.ok(guest.length > 0 && member.length > 0);
});

test("the trunk thins where people are away", () => {
  const { made } = draw();
  const widths = withClass(made, "origins-trunk").map((n) =>
    Number(n.attrs["stroke-width"]),
  );
  assert.ok(widths.every((w) => Number.isFinite(w) && w > 0));
  assert.ok(Math.min(...widths) < Math.max(...widths));
});

test("an excursion is drawn off the spine", () => {
  const { made } = draw();
  assert.equal(withClass(made, "origins-excursion").length, 1);
});

test("a person with a picture gets an image", () => {
  const { doc, made } = stubDocument();
  avatarFor(PEOPLE.get("daniel")!, doc);
  assert.ok(made.some((n) => n.tag === "image"));
});

test("attribute names are SVG spellings, not underscored", () => {
  const { made } = draw();
  for (const node of made) {
    for (const name of Object.keys(node.attrs)) {
      assert.ok(
        !name.includes("_"),
        `${node.tag} has attribute ${name}; SVG uses hyphens`,
      );
    }
  }
});

test("a guest with an empty image_url gets an initial, never an image", () => {
  const { doc, made } = stubDocument();
  avatarFor(PEOPLE.get("rok")!, doc);
  assert.equal(made.some((n) => n.tag === "image"), false);
  assert.ok(made.some((n) => n.text === "R"));
});

test("no attribute is ever emitted as NaN or undefined", () => {
  const { made } = draw();
  for (const node of made) {
    for (const [name, value] of Object.entries(node.attrs)) {
      assert.ok(
        !value.includes("NaN") && !value.includes("undefined"),
        `${node.tag}.${name} = ${value}`,
      );
    }
  }
});

test("a thread carries a palette slot so colour needs no stylesheet edit", () => {
  const { made } = draw();
  const hues = withClass(made, "origins-thread").map((n) => n.attrs["data-hue"]);
  assert.ok(hues.every((h) => h !== undefined));
  assert.ok(new Set(hues).size > 1, "threads should not share one slot");
});

test("past the palette, threads fall back to the muted slot", () => {
  assert.equal(hueFor(0), 0);
  assert.equal(hueFor(PALETTE_SIZE - 1), PALETTE_SIZE - 1);
  assert.equal(hueFor(PALETTE_SIZE), -1);
  assert.equal(hueFor(PALETTE_SIZE + 50), -1);
});

// A braid the size of the real one: the clipping bugs only appear at scale.
const BIG_PEOPLE = new Map<string, Person>(
  Array.from({ length: 7 }, (_, i) => [
    `p${i}`,
    person(`p${i}`, i < 4, i < 2 ? "https://example.com/a.png" : ""),
  ]),
);

const BIG_MOMENTS: Moment[] = [
  at("root-0", "2021-10-23", ["p0"]),
  at("root-1", "2022-02-21", ["p0"]),
  at("root-2", "2022-03", ["p0", "p4"]),
  at("root-3", "2022-08-27", ["p0", "p1"]),
  at("root-4", "2023-02", ["p5"]),
  at("root-5", "2023-03", ["p0", "p1", "p2"]),
  at("founded", "2023-04", ["p0", "p1", "p2"], true),
  ...Array.from({ length: 20 }, (_, i) =>
    at(`nug-${i}`, `202${4 + Math.floor(i / 10)}-${String((i % 10) + 1).padStart(2, "0")}-05`, i === 3 ? ["p3"] : [], true)),
  at("camp", "2024-06", ["p0", "p1", "p6"]),
];

const big = buildBraid(BIG_MOMENTS, BIG_PEOPLE);

function extentOf(node: Node, width: number): [number, number] {
  const x = Number(node.attrs.x);
  const anchor = node.attrs["text-anchor"];
  if (anchor === "end") return [x - width, x];
  if (anchor === "middle") return [x - width / 2, x + width / 2];
  return [x, x + width];
}

for (const mode of ["river", "subway"] as const) {
  test(`every ${mode} label sits inside the viewBox`, () => {
    const { doc, made } = stubDocument();
    const viewport = mode === "river"
      ? { width: 850, height: 1300 }
      : { width: 850, height: 1300 };
    const projection = projectionFor(mode, viewport, laneRangeOf(big));
    renderBraid(big, projection, doc);
    const [, , boxWidth] = projection.viewBox;
    const offenders = withClass(made, "origins-label")
      .map((n) => ({ n, span: extentOf(n, LABEL_WIDTH) }))
      .filter(({ span }) => span[0] < 0 || span[1] > boxWidth);
    assert.deepEqual(
      offenders.map((o) => `${o.n.text} @ ${o.span.join("..")}`),
      [],
    );
  });

  test(`every ${mode} node sits inside the viewBox`, () => {
    const { doc, made } = stubDocument();
    const projection = projectionFor(
      mode,
      { width: 850, height: 1300 },
      laneRangeOf(big),
    );
    renderBraid(big, projection, doc);
    const [, , w, h] = projection.viewBox;
    for (const node of withClass(made, "origins-node")) {
      const cx = Number(node.attrs.cx);
      const cy = Number(node.attrs.cy);
      assert.ok(cx >= 0 && cx <= w, `cx ${cx} outside 0..${w}`);
      assert.ok(cy >= 0 && cy <= h, `cy ${cy} outside 0..${h}`);
    }
  });
}

test("labels are dropped rather than clipped when the axis is too narrow", () => {
  const { doc, made } = stubDocument();
  const projection = projectionFor(
    "river",
    { width: 360, height: 1300 },
    laneRangeOf(big),
  );
  renderBraid(big, projection, doc);
  assert.equal(projection.showLabels, false);
  assert.equal(withClass(made, "origins-label").length, 0);
});

test("an excursion segment leaves from the trunk, not from its old lane", () => {
  const { doc, made } = stubDocument();
  const projection = projectionFor(
    "river",
    { width: 850, height: 1300 },
    laneRangeOf(big),
  );
  renderBraid(big, projection, doc);
  const excursion = big.excursions[0];
  const spine = projection.project(excursion.from.t, 0)[0];
  for (const path of withClass(made, "origins-thread")) {
    if (!(path.attrs.class ?? "").includes("is-excursion")) continue;
    const startX = Number(path.attrs.d.slice(1).split(",")[0]);
    assert.ok(
      Math.abs(startX - spine) < 1,
      `${path.attrs["data-person"]} leaves at ${startX}, spine is ${spine}`,
    );
  }
});

test("a thread that joins the trunk visibly reaches it", () => {
  const { doc, made } = stubDocument();
  const projection = projectionFor(
    "river",
    { width: 850, height: 1300 },
    laneRangeOf(big),
  );
  renderBraid(big, projection, doc);
  // p6 is recruited at the excursion and rejoins at the next trunk moment
  const recruit = big.threads.find((t) => t.person.slug === "p6")!;
  assert.notEqual(recruit.joinsTrunkAt, null);
  const path = withClass(made, "origins-thread").find(
    (n) =>
      n.attrs["data-person"] === "p6" &&
      (n.attrs.class ?? "").includes("is-approach"),
  )!;
  const spine = projection.project(0, 0)[0];
  // Paths are cubic, so the last point is the final coordinate pair.
  const lastX = Number(
    path.attrs.d.trim().split(/\s+/).pop()!.split(",")[0],
  );
  assert.ok(
    Math.abs(lastX - spine) < 1,
    `p6's thread ends at ${lastX}, spine is ${spine}`,
  );
});

// --- year ticks and label text ----------------------------------------------

test("one tick per year that has moments, in order", () => {
  const years = yearTicks(big.moments).map((t) => t.year);
  assert.deepEqual(years, [2021, 2022, 2023, 2024, 2025]);
});

test("a year tick sits before that year's first moment", () => {
  const ticks = yearTicks(big.moments);
  for (const tick of ticks) {
    const first = big.moments.find(
      (m) => new Date(m.moment.date.start).getUTCFullYear() === tick.year,
    )!;
    assert.ok(tick.t <= first.t, `${tick.year} tick at ${tick.t} vs ${first.t}`);
    assert.ok(tick.t >= 0 && tick.t <= 1);
  }
});

test("a single moment still yields one tick", () => {
  const one = buildBraid([at("only", "2021", ["daniel"], true)], PEOPLE);
  assert.deepEqual(yearTicks(one.moments).map((t) => t.year), [2021]);
});

test("the first year is labelled but gets no line", () => {
  // the data simply starts there; a line would claim the year began at
  // whatever moment happens to be earliest
  const ticks = yearTicks(big.moments);
  assert.equal(ticks[0].boundary, false);
  assert.equal(ticks[0].t, 0);
  assert.ok(ticks.slice(1).every((t) => t.boundary));
});

test("a line is drawn only where the year actually changes", () => {
  const { made } = draw();
  const ticks = yearTicks(braid.moments);
  assert.equal(
    withClass(made, "origins-year-tick").length,
    ticks.filter((t) => t.boundary).length,
  );
  assert.equal(withClass(made, "origins-year").length, ticks.length);
});

test("the earliest root avatar is not clipped by the canvas edge", () => {
  const projection = projectionFor(
    "river",
    { width: 800, height: 900 },
    laneRangeOf(braid),
  );
  const { doc, made } = stubDocument();
  renderBraid(braid, projection, doc);
  for (const root of withClass(made, "origins-root")) {
    const ty = Number(/translate\(\S+ ([\d.-]+)\)/.exec(root.attrs.transform)![1]);
    assert.ok(ty >= 18, `${root.attrs["data-person"]} centred at ${ty}`);
  }
});

test("trunk labels go left, away from the lanes joiners arrive on", () => {
  const projection = projectionFor(
    "river",
    { width: 800, height: 900 },
    laneRangeOf(braid),
  );
  assert.equal(projection.labelAnchor(0).anchor, "end");
  assert.ok(projection.labelAnchor(0).dx < 0);
  assert.equal(projection.labelAnchor(2).anchor, "start");
});

test("labels carry the title only, with no date", () => {
  const { made } = draw();
  for (const label of withClass(made, "origins-label")) {
    assert.ok(!label.text.includes("·"), label.text);
    assert.ok(!/\d{4}/.test(label.text), `${label.text} still has a year`);
  }
});

test("threads are curved, not cornered", () => {
  const { made } = draw();
  const multi = withClass(made, "origins-thread").filter(
    (n) => (n.attrs.d.match(/C/g) ?? []).length > 0,
  );
  assert.ok(multi.length > 0, "expected cubic segments in thread paths");
  for (const path of withClass(made, "origins-thread")) {
    assert.ok(!path.attrs.d.includes("L"), `${path.attrs.d} has a corner`);
  }
});

test("a hop that stays in one lane is still straight", () => {
  // control points sit on the time axis, so no lane change means no bulge
  const d = flow([[100, 0], [100, 50]], "y");
  assert.equal(d, "M100,0 C100,25 100,25 100,50");
});

// --- roots sit clear of nodes -----------------------------------------------

test("faces are drawn after nodes, so no node can land on one", () => {
  // paint order is the svg's child list, not the order elements were created
  const { made } = draw();
  const svg = made.find((n) => n.tag === "svg")!;
  const kinds = svg.children.map((c) => (c.attrs.class ?? "").split(" ")[0]);
  const lastNode = kinds.lastIndexOf("origins-node");
  const firstRoot = kinds.indexOf("origins-root");
  assert.ok(lastNode >= 0 && firstRoot >= 0, kinds.join(","));
  assert.ok(
    firstRoot > lastNode,
    `first root at ${firstRoot} is painted before last node at ${lastNode}`,
  );
});

test("a root clears its first node by the same gap at any canvas height", () => {
  // a fraction of the axis would shrink with the canvas and let the node
  // overlap the face on a short one
  const gaps = [800, 2200].map((height) => {
    const { doc, made } = stubDocument();
    const projection = projectionFor(
      "river",
      { width: 800, height },
      laneRangeOf(braid),
    );
    renderBraid(braid, projection, doc);
    const root = withClass(made, "origins-root")[0];
    const ty = Number(/translate\(\S+ ([\d.-]+)\)/.exec(root.attrs.transform)![1]);
    const owner = braid.threads.find(
      (t) => t.person.slug === root.attrs["data-person"],
    )!;
    const first = owner.segments[0].points[0];
    return projection.project(first.t, first.lane)[1] - ty;
  });
  assert.equal(gaps[0], gaps[1]);
  assert.ok(gaps[0] >= 40, `gap of ${gaps[0]} is tighter than an avatar`);
});

test("the lane range spans excursion lanes", () => {
  const [low, high] = laneRangeOf(braid);
  const excursion = braid.excursions[0].lane;
  assert.ok(high >= excursion, `${high} should cover ${excursion}`);
  assert.ok(low <= Math.min(...braid.threads.map((t) => t.lane)));
});
