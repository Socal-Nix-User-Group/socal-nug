import test from "node:test";
import assert from "node:assert/strict";
import { parseFuzzyDate } from "../src/dates.ts";
import { buildBraid } from "../src/layout.ts";
import { detailFor, joinLineFor, personCardFor } from "../src/cards.ts";
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
    quote: "",
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

// --- person card ------------------------------------------------------------
// Shown in a popup when an avatar is clicked. This replaced a roster rail that
// took a 20rem column off a map that needed every pixel of it.

const cardOf = (made: Node[]) =>
  made.find((n) => (n.attrs.class ?? "").split(" ").includes("origins-card"))!;

test("a person card is tagged with its person so hover can pair it to a thread", () => {
  const { doc, made } = stubDocument();
  personCardFor(thread("daniel"), braid, doc);
  assert.equal(cardOf(made).attrs["data-person"], "daniel");
});

test("member and guest cards are distinguishable without colour", () => {
  const guest = stubDocument();
  personCardFor(thread("rok"), braid, guest.doc);
  assert.ok(cardOf(guest.made).attrs.class.includes("is-guest"));

  const member = stubDocument();
  personCardFor(thread("daniel"), braid, member.doc);
  assert.ok(cardOf(member.made).attrs.class.includes("is-member"));
});

test("a person card carries the name, alias and profile link", () => {
  const { doc, made } = stubDocument();
  personCardFor(thread("daniel"), braid, doc);
  const texts = made.map((n) => n.text);
  assert.ok(texts.includes("DANIEL"));
  assert.ok(texts.includes("@daniel"));
  const links = made.filter((n) => n.tag === "a").map((n) => n.attrs.href);
  assert.ok(links.includes("https://example.com/daniel"));
});

test("a person card carries the same palette slot as its thread", () => {
  braid.threads.forEach((t, index) => {
    const { doc, made } = stubDocument();
    personCardFor(t, braid, doc);
    assert.equal(cardOf(made).attrs["data-hue"], String(index));
  });
});

test("a person card says where its person joined", () => {
  const { doc, made } = stubDocument();
  personCardFor(thread("daniel"), braid, doc);
  const joined = made.map((n) => n.text).join(" ");
  assert.ok(joined.includes("Joined at founded, April 2023"), joined);
});

test("someone who never joined gets no join line", () => {
  const { doc, made } = stubDocument();
  personCardFor(thread("rok"), braid, doc);
  assert.ok(!made.some((n) => n.text.startsWith("Joined at")));
});

test("a person card carries a dismiss control", () => {
  const { doc, made } = stubDocument();
  personCardFor(thread("daniel"), braid, doc);
  assert.ok(made.some((n) => n.attrs["data-origins-dismiss"] !== undefined));
});

// --- moment detail ----------------------------------------------------------

const placed = (id: string) => braid.moments.find((m) => m.moment.id === id)!;
const texts = (made: Node[]) => made.map((n) => n.text).filter((t) => t !== "");

test("a detail card names the moment and its date at the right precision", () => {
  const { doc, made } = stubDocument();
  detailFor(placed("founded"), PEOPLE, doc);
  assert.ok(texts(made).includes("founded"));
  assert.ok(texts(made).includes("April 2023"));
});

test("a detail card names the people, not their slugs", () => {
  const { doc, made } = stubDocument();
  detailFor(placed("meets-rok"), PEOPLE, doc);
  const joined = texts(made).join(" ");
  assert.ok(joined.includes("DANIEL"), joined);
  assert.ok(joined.includes("ROK"), joined);
  assert.ok(!joined.includes("daniel"), "slug leaked into the card");
});

test("a detail card shows a photo only when the moment has one", () => {
  const withPhoto = stubDocument();
  detailFor(
    { ...placed("founded"), moment: { ...placed("founded").moment, photo: "/p.jpg" } },
    PEOPLE,
    withPhoto.doc,
  );
  assert.ok(withPhoto.made.some((n) => n.tag === "img"));

  const without = stubDocument();
  detailFor(placed("founded"), PEOPLE, without.doc);
  assert.equal(without.made.some((n) => n.tag === "img"), false);
});

test("a detail card links to the event page when there is one", () => {
  const { doc, made } = stubDocument();
  detailFor(
    {
      ...placed("founded"),
      moment: { ...placed("founded").moment, permalink: "/events/x/" },
    },
    PEOPLE,
    doc,
  );
  assert.ok(made.some((n) => n.tag === "a" && n.attrs.href === "/events/x/"));
});

test("a detail card omits the link when the moment has no page", () => {
  const { doc, made } = stubDocument();
  detailFor(placed("meets-rok"), PEOPLE, doc);
  assert.equal(made.some((n) => n.tag === "a"), false);
});

test("a detail card carries a dismiss control", () => {
  const { doc, made } = stubDocument();
  detailFor(placed("founded"), PEOPLE, doc);
  assert.ok(made.some((n) => n.attrs["data-origins-dismiss"] !== undefined));
});


test("a detail card renders every outside link with its own title", () => {
  const { doc, made } = stubDocument();
  const links = [
    { title: "NixCon NA", url: "https://2024-na.nixcon.org/" },
    { title: "SCaLE 21x", url: "https://www.socallinuxexpo.org/scale/21x/" },
  ];
  detailFor(
    { ...placed("meets-rok"), moment: { ...placed("meets-rok").moment, links } },
    PEOPLE,
    doc,
  );
  const anchors = made.filter((n) => n.tag === "a");
  assert.deepEqual(
    anchors.map((a) => [a.text, a.attrs.href]),
    links.map((l) => [l.title, l.url]),
  );
  assert.ok(anchors.every((a) => a.attrs.rel === "noopener"));
});

// --- a person's own words ----------------------------------------------------
// A description is prose about somebody; a quote is what they said. They are
// different things and the card shows them differently, so they are separate
// fields rather than one field the card has to guess about.

test("a quote is rendered as a quotation, not as prose", () => {
  const { doc, made } = stubDocument();
  const speaker = {
    ...PEOPLE.get("daniel")!,
    description: "Co-founder.",
    quote: 'I was like "whoa other people use this?"',
  };
  personCardFor({ ...thread("daniel"), person: speaker }, braid, doc);
  const quote = made.find((n) => n.tag === "blockquote")!;
  assert.ok(quote !== undefined, "no blockquote in the card");
  assert.equal(quote.text, 'I was like "whoa other people use this?"');
  // and the description is still its own paragraph
  const desc = made.find((n) =>
    (n.attrs.class ?? "").includes("origins-card-desc")
  )!;
  assert.equal(desc.text, "Co-founder.");
});

test("somebody with no quote gets no empty quotation", () => {
  const { doc, made } = stubDocument();
  personCardFor(thread("daniel"), braid, doc);
  assert.equal(made.some((n) => n.tag === "blockquote"), false);
});
