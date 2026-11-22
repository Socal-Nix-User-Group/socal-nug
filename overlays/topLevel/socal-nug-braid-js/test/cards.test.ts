import test from "node:test";
import assert from "node:assert/strict";
import { parseFuzzyDate } from "../src/dates.ts";
import { buildBraid } from "../src/layout.ts";
import { joinLineFor, rosterFor } from "../src/cards.ts";
import type { DocumentLike, ElementLike } from "../src/render.ts";
import type { Moment, Person } from "../src/types.ts";

interface Node {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
  text: string;
}

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

function person(slug: string, member: boolean): Person {
  return {
    slug,
    name: slug.toUpperCase(),
    alias: `@${slug}`,
    description: `about ${slug}`,
    imageUrl: "",
    profileUrl: `https://example.com/${slug}`,
    member,
  };
}

function at(id: string, date: string, people: string[], trunk = false): Moment {
  return { id, date: parseFuzzyDate(date), title: id, people, trunk };
}

const PEOPLE = new Map<string, Person>([
  ["daniel", person("daniel", true)],
  ["rok", person("rok", false)],
]);

const braid = buildBraid(
  [
    at("daniel-nix", "2021-10-23", ["daniel"]),
    at("meets-rok", "2022-03", ["daniel", "rok"]),
    at("founded", "2023-04", ["daniel"], true),
  ],
  PEOPLE,
);

const thread = (slug: string) =>
  braid.threads.find((t) => t.person.slug === slug)!;

test("a join line names the moment and its date at the right precision", () => {
  const line = joinLineFor(thread("daniel"), braid.moments)!;
  assert.equal(line.title, "founded");
  assert.equal(line.date, "April 2023");
});

test("a thread that never joins has no join line", () => {
  assert.equal(joinLineFor(thread("rok"), braid.moments), null);
});

test("every thread gets a card", () => {
  const { doc, made } = stubDocument();
  rosterFor(braid, doc);
  const cards = made.filter((n) =>
    (n.attrs.class ?? "").split(" ").includes("origins-card"),
  );
  assert.equal(cards.length, braid.threads.length);
});

test("a card is tagged with its person so hover can pair it to a thread", () => {
  const { doc, made } = stubDocument();
  rosterFor(braid, doc);
  const slugs = made
    .filter((n) => (n.attrs.class ?? "").split(" ").includes("origins-card"))
    .map((n) => n.attrs["data-person"]);
  assert.deepEqual([...slugs].sort(), ["daniel", "rok"]);
});

test("member and guest cards are distinguishable without colour", () => {
  const { doc, made } = stubDocument();
  rosterFor(braid, doc);
  const cards = made.filter((n) =>
    (n.attrs.class ?? "").split(" ").includes("origins-card"),
  );
  const guest = cards.find((n) => n.attrs["data-person"] === "rok")!;
  const member = cards.find((n) => n.attrs["data-person"] === "daniel")!;
  assert.ok(guest.attrs.class.includes("is-guest"));
  assert.ok(member.attrs.class.includes("is-member"));
});

test("a card carries the name, alias and profile link", () => {
  const { doc, made } = stubDocument();
  rosterFor(braid, doc);
  const texts = made.map((n) => n.text);
  assert.ok(texts.includes("DANIEL"));
  assert.ok(texts.includes("@daniel"));
  const links = made.filter((n) => n.tag === "a").map((n) => n.attrs.href);
  assert.ok(links.includes("https://example.com/daniel"));
});

test("the roster is a list so it is reachable by keyboard in both modes", () => {
  const { doc, made } = stubDocument();
  const root = rosterFor(braid, doc);
  assert.ok(root !== null);
  assert.ok(made.some((n) => n.tag === "ul"));
  assert.equal(
    made.filter((n) => n.tag === "li").length,
    braid.threads.length,
  );
});
