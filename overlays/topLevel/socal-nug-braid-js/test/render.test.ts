import test from "node:test";
import assert from "node:assert/strict";
import { parseFuzzyDate } from "../src/dates.ts";
import { buildBraid } from "../src/layout.ts";
import { projectionFor } from "../src/projections.ts";
import { avatarFor, laneRangeOf, renderBraid } from "../src/render.ts";
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

test("the lane range spans excursion lanes", () => {
  const [low, high] = laneRangeOf(braid);
  const excursion = braid.excursions[0].lane;
  assert.ok(high >= excursion, `${high} should cover ${excursion}`);
  assert.ok(low <= Math.min(...braid.threads.map((t) => t.lane)));
});
