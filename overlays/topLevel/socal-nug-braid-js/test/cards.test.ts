import test from "node:test";
import assert from "node:assert/strict";
import {
  detailFor,
  joinLineFor,
  listsFor,
  momentsFor,
  personCardFor,
  rosterFor,
} from "../src/cards.ts";
import type { DocumentLike, ElementLike } from "../src/render.ts";
import { buildStory } from "../src/story.ts";
import type { Story } from "../src/story.ts";
import type { Person } from "../src/types.ts";
import { at, MOMENTS, PEOPLE, story } from "./story-fixture.ts";

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
    links: [],
    member,
  };
}

const CAST = new Map<string, Person>([
  ["daniel", person("daniel", true)],
  ["rok", person("rok", false)],
]);

const small = buildStory(
  [
    at("daniel-nix", "2021-10-23", ["daniel"]),
    at("meets-rok", "2022-03", ["daniel", "rok"]),
    at("founded", "2023-04", ["daniel"], true),
  ],
  CAST,
);

const thread = (slug: string) =>
  small.threads.find((t) => t.person.slug === slug)!;

test("a join line names the moment and its date at the right precision", () => {
  const line = joinLineFor(thread("daniel"), small.moments)!;
  assert.equal(line.title, "founded");
  assert.equal(line.date, "April 2023");
});

test("a thread that never joins has no join line", () => {
  assert.equal(joinLineFor(thread("rok"), small.moments), null);
});

// --- person card ------------------------------------------------------------
// Shown in a popup when an avatar is clicked. This replaced a roster rail that
// took a 20rem column off a map that needed every pixel of it.

const cardOf = (made: Node[]) =>
  made.find((n) => (n.attrs.class ?? "").split(" ").includes("origins-card"))!;

test("a person card is tagged with its person so hover can pair it to a thread", () => {
  const { doc, made } = stubDocument();
  personCardFor(thread("daniel"), small, doc);
  assert.equal(cardOf(made).attrs["data-person"], "daniel");
});

test("member and guest cards are distinguishable without colour", () => {
  const guest = stubDocument();
  personCardFor(thread("rok"), small, guest.doc);
  assert.ok(cardOf(guest.made).attrs.class.includes("is-guest"));

  const member = stubDocument();
  personCardFor(thread("daniel"), small, member.doc);
  assert.ok(cardOf(member.made).attrs.class.includes("is-member"));
});

test("a person card carries the name, alias and profile link", () => {
  const { doc, made } = stubDocument();
  personCardFor(thread("daniel"), small, doc);
  const texts = made.map((n) => n.text);
  assert.ok(texts.includes("DANIEL"));
  assert.ok(texts.includes("@daniel"));
  const links = made.filter((n) => n.tag === "a").map((n) => n.attrs.href);
  assert.ok(links.includes("https://example.com/daniel"));
});

test("a person card carries the same palette slot as its thread", () => {
  small.threads.forEach((t, index) => {
    const { doc, made } = stubDocument();
    personCardFor(t, small, doc);
    assert.equal(cardOf(made).attrs["data-hue"], String(index));
  });
});

test("a person card says where its person joined", () => {
  const { doc, made } = stubDocument();
  personCardFor(thread("daniel"), small, doc);
  const joined = made.map((n) => n.text).join(" ");
  assert.ok(joined.includes("Joined at founded, April 2023"), joined);
});

test("someone who never joined gets no join line", () => {
  const { doc, made } = stubDocument();
  personCardFor(thread("rok"), small, doc);
  assert.ok(!made.some((n) => n.text.startsWith("Joined at")));
});

test("a person card carries a dismiss control", () => {
  const { doc, made } = stubDocument();
  personCardFor(thread("daniel"), small, doc);
  assert.ok(made.some((n) => n.attrs["data-origins-dismiss"] !== undefined));
});

// --- moment detail ----------------------------------------------------------

const placed = (id: string) => small.moments.find((m) => m.moment.id === id)!;
const texts = (made: Node[]) => made.map((n) => n.text).filter((t) => t !== "");

test("a detail card names the moment and its date at the right precision", () => {
  const { doc, made } = stubDocument();
  detailFor(placed("founded"), CAST, doc);
  assert.ok(texts(made).includes("founded"));
  assert.ok(texts(made).includes("April 2023"));
});

test("a detail card names the people, not their slugs", () => {
  const { doc, made } = stubDocument();
  detailFor(placed("meets-rok"), CAST, doc);
  const joined = texts(made).join(" ");
  assert.ok(joined.includes("DANIEL"), joined);
  assert.ok(joined.includes("ROK"), joined);
  assert.ok(!joined.includes("daniel"), "slug leaked into the card");
});

test("a detail card shows a photo only when the moment has one", () => {
  const withPhoto = stubDocument();
  detailFor(
    { ...placed("founded"), moment: { ...placed("founded").moment, photo: "/p.jpg" } },
    CAST,
    withPhoto.doc,
  );
  assert.ok(withPhoto.made.some((n) => n.tag === "img"));

  const without = stubDocument();
  detailFor(placed("founded"), CAST, without.doc);
  assert.equal(without.made.some((n) => n.tag === "img"), false);
});

// An event's own mark, beside the card's title as a person's face is beside
// their name.
test("a detail card shows the moment's avatar in its head, and none when the moment has none", () => {
  const withOne = stubDocument();
  detailFor(
    {
      ...placed("founded"),
      moment: { ...placed("founded").moment, avatar: "/images/moments/camp.png" },
    },
    CAST,
    withOne.doc,
  );
  const head = withOne.made.find((n) =>
    (n.attrs.class ?? "").split(" ").includes("origins-detail-head")
  )!;
  assert.ok(head.attrs.class.split(" ").includes("has-avatar"));
  const avatar = head.children[0];
  assert.deepEqual(
    [avatar.tag, avatar.attrs.class, avatar.attrs.src, avatar.attrs.alt],
    ["img", "origins-detail-avatar", "/images/moments/camp.png", ""],
  );

  const without = stubDocument();
  detailFor(placed("founded"), CAST, without.doc);
  assert.equal(
    without.made.some((n) => (n.attrs.class ?? "").includes("avatar")),
    false,
  );
});

test("a detail card links to the event page when there is one", () => {
  const { doc, made } = stubDocument();
  detailFor(
    {
      ...placed("founded"),
      moment: { ...placed("founded").moment, permalink: "/events/x/" },
    },
    CAST,
    doc,
  );
  assert.ok(made.some((n) => n.tag === "a" && n.attrs.href === "/events/x/"));
});

test("a detail card omits the link when the moment has no page", () => {
  const { doc, made } = stubDocument();
  detailFor(placed("meets-rok"), CAST, doc);
  assert.equal(made.some((n) => n.tag === "a"), false);
});

test("a detail card carries a dismiss control", () => {
  const { doc, made } = stubDocument();
  detailFor(placed("founded"), CAST, doc);
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
    CAST,
    doc,
  );
  const anchors = made.filter((n) => n.tag === "a");
  assert.deepEqual(
    anchors.map((a) => [a.text, a.attrs.href]),
    links.map((l) => [l.title, l.url]),
  );
  assert.ok(anchors.every((a) => a.attrs.rel === "noopener"));
});

// --- who a card names ----------------------------------------------------------
// A thread through a meetup says "in the group then", not "was there". So a
// meetup's card names who joined there and who the record confirms, and
// nobody else; who was away is said by their thread breaking at the oval,
// with a hollow bead in their slot.

const g = (id: string) => story.moments.find((m) => m.moment.id === id)!;
const textOf = (card: ElementLike): string => {
  const walk = (n: Node): string =>
    [n.text, ...n.children.map(walk)].filter((t) => t !== "").join(" ");
  return walk((card as unknown as { node: Node }).node);
};
const doc = stubDocument().doc;

test("a meetup's card says who joined there", () => {
  const card = detailFor(g("nug1"), PEOPLE, doc);
  assert.ok(textOf(card).includes("Joined here: JARED"));
});

test("a meetup's card says who the record confirms, and leaves the joiners out of that line", () => {
  assert.ok(textOf(detailFor(g("nug3"), PEOPLE, doc)).includes("Confirmed there: DANIEL"));
  assert.ok(!textOf(detailFor(g("nug1"), PEOPLE, doc)).includes("Confirmed there"));
});

test("a meetup's card never lists who was away", () => {
  assert.ok(g("nug3").through.some((p) => p.slug === "rob" && p.away));
  assert.ok(!textOf(detailFor(g("nug3"), PEOPLE, doc)).includes("ROB"));
});

test("a meetup's card names nobody who was away under any heading, even one the record also lists as there", () => {
  const s = buildStory(
    [
      at("founded", "2023-04", ["rob", "daniel", "david"], true),
      at("nug", "2023-06", ["jared"], true, { there: ["daniel", "rob"], away: ["rob"] }),
    ],
    PEOPLE,
  );
  const nug = s.moments.find((m) => m.moment.id === "nug")!;
  assert.deepEqual(nug.through.filter((p) => p.away).map((p) => p.slug), ["rob"]);
  const text = textOf(detailFor(nug, PEOPLE, doc));
  assert.ok(text.includes("Joined here: JARED"), text);
  assert.ok(text.includes("Confirmed there: DANIEL"), text);
  assert.ok(!text.includes("ROB"), text);
});

test("a meetup nobody joined at, with nothing recorded, has no people line", () => {
  const quiet = buildStory([...MOMENTS, at("nug5", "2024-09", [], true)], PEOPLE);
  const nug5 = quiet.moments.find((m) => m.moment.id === "nug5")!;
  assert.ok(nug5.through.length > 0, "the group should be through it");
  const { doc, made } = stubDocument();
  detailFor(nug5, PEOPLE, doc);
  assert.equal(
    made.some((n) => (n.attrs.class ?? "").includes("origins-detail-people")),
    false,
  );
});

test("a meetup's card names its people in the order their threads cross it", () => {
  // the record lists daniel, david, rob; their threads cross as rob, daniel, david
  assert.ok(
    textOf(detailFor(g("founded"), PEOPLE, doc)).includes("Joined here: ROB, DANIEL, DAVID"),
  );
});

test("another moment's card lists the people it names, with no prefix", () => {
  assert.ok(textOf(detailFor(g("camp"), PEOPLE, doc)).includes("DANIEL, ROB"));
});

// --- a person's own words ----------------------------------------------------
// A description is prose about somebody; a quote is what they said. They are
// different things and the card shows them differently, so they are separate
// fields rather than one field the card has to guess about.

test("a quote is rendered as a quotation, not as prose", () => {
  const { doc, made } = stubDocument();
  const speaker = {
    ...CAST.get("daniel")!,
    description: "Co-founder.",
    quote: 'I was like "whoa other people use this?"',
  };
  personCardFor({ ...thread("daniel"), person: speaker }, small, doc);
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
  personCardFor(thread("daniel"), small, doc);
  assert.equal(made.some((n) => n.tag === "blockquote"), false);
});

// --- a person's own sites ----------------------------------------------------
// The alias goes to their GitHub. These are wherever else they asked to be
// found, each under the title their profile gives it.

const linksRow = (made: Node[]) =>
  made.find((n) =>
    (n.attrs.class ?? "").split(" ").includes("origins-card-links")
  );

test("a person card links to their sites, each by its title", () => {
  const { doc, made } = stubDocument();
  const linked = {
    ...CAST.get("daniel")!,
    links: [
      { title: "djacu.dev", url: "https://djacu.dev/" },
      { title: "Lessons", url: "https://example.com/lessons" },
    ],
  };
  personCardFor({ ...thread("daniel"), person: linked }, small, doc);
  const row = linksRow(made);
  assert.ok(row !== undefined, "no row of links in the card");
  assert.deepEqual(
    row.children.map((n) => [n.tag, n.text, n.attrs.href]),
    [
      ["a", "@daniel", "https://example.com/daniel"],
      ["a", "djacu.dev", "https://djacu.dev/"],
      ["a", "Lessons", "https://example.com/lessons"],
    ],
  );
});

test("somebody with no links of their own gets a row with only their handle in it", () => {
  const { doc, made } = stubDocument();
  personCardFor(thread("daniel"), small, doc);
  assert.deepEqual(
    linksRow(made)!.children.map((n) => n.attrs.class),
    ["origins-card-alias"],
  );
});

// --- the order of a person's card --------------------------------------------
// The picture beside two lines: the name with the badge, and the handle with
// their own links. Then, at the card's full width, what they do, their own
// words and where they joined. The About page lays a member out the same way.

const everything = {
  ...CAST.get("daniel")!,
  description: "Co-founder.",
  quote: "whoa other people use this?",
  links: [{ title: "djacu.dev", url: "https://djacu.dev/" }],
};
const FULL_ORDER = [
  "origins-card-top",
  "origins-card-desc",
  "origins-card-quote",
  "origins-card-join",
];
const byClassName = (made: Node[], token: string) =>
  made.find((n) => (n.attrs.class ?? "").split(" ").includes(token))!;
const firstClasses = (n: Node) => n.children.map((c) => (c.attrs.class ?? "").split(" ")[0]);
const cardOrder = (made: Node[]) => firstClasses(cardOf(made));

test("a person's card has their picture beside who they are and where to find them, then what they do, their own words and where they joined", () => {
  for (const dismissable of [true, false]) {
    const { doc, made } = stubDocument();
    personCardFor({ ...thread("daniel"), person: everything }, small, doc, dismissable);
    assert.deepEqual(
      cardOrder(made),
      dismissable ? [...FULL_ORDER, "origins-dismiss"] : FULL_ORDER,
    );
    assert.deepEqual(
      firstClasses(byClassName(made, "origins-card-top")),
      ["origins-card-avatar", "origins-card-who"],
    );
    assert.deepEqual(
      firstClasses(byClassName(made, "origins-card-who")),
      ["origins-card-head", "origins-card-links"],
    );
    const head = byClassName(made, "origins-card-head");
    assert.deepEqual(
      head.children.map((n) => [n.tag, n.attrs.class]),
      [["span", "origins-card-name"], ["span", "origins-badge is-member"]],
    );
    assert.deepEqual(
      byClassName(made, "origins-card-links").children.map((n) => [n.tag, n.attrs.class, n.text]),
      [["a", "origins-card-alias", "@daniel"], ["a", "origins-card-link", "djacu.dev"]],
    );
  }
});

test("a person's card missing a part simply lacks it, in the same order otherwise", () => {
  const cases: Array<[string, Person, string]> = [
    ["origins-card-quote", { ...everything, quote: "" }, "daniel"],
    ["origins-card-desc", { ...everything, description: "" }, "daniel"],
    ["origins-card-join", { ...everything, slug: "rok", member: false }, "rok"],
  ];
  for (const [missing, who, slug] of cases) {
    const { doc, made } = stubDocument();
    personCardFor({ ...thread(slug), person: who }, small, doc, false);
    assert.deepEqual(cardOrder(made), FULL_ORDER.filter((c) => c !== missing), missing);
  }
  // Everyone has a handle, so the links row stays when they have no links of
  // their own, and a missing picture leaves a blank face in its place.
  const { doc, made } = stubDocument();
  personCardFor({ ...thread("daniel"), person: { ...everything, links: [] } }, small, doc, false);
  assert.deepEqual(cardOrder(made), FULL_ORDER);
  assert.deepEqual(firstClasses(byClassName(made, "origins-card-links")), ["origins-card-alias"]);
  assert.deepEqual(
    firstClasses(byClassName(made, "origins-card-top")),
    ["origins-card-avatar", "origins-card-who"],
  );
  assert.equal(byClassName(made, "origins-card-avatar").tag, "span");

  // With a picture, the picture leads the top and the two lines follow it.
  const pictured = stubDocument();
  personCardFor(
    { ...thread("daniel"), person: { ...everything, imageUrl: "/images/people/daniel.jpg" } },
    small,
    pictured.doc,
    false,
  );
  const top = byClassName(pictured.made, "origins-card-top");
  assert.deepEqual(
    top.children.map((n) => [n.tag, n.attrs.class]),
    [["img", "origins-card-avatar"], ["div", "origins-card-who"]],
  );
});

test("a link in a card to another site opens a new tab, and the event page on this site stays in the tab", () => {
  const person = stubDocument();
  personCardFor({ ...thread("daniel"), person: everything }, small, person.doc);
  const anchors = person.made.filter((n) => n.tag === "a");
  assert.deepEqual(
    anchors.map((a) => a.attrs.class),
    ["origins-card-alias", "origins-card-link"],
  );
  assert.ok(anchors.every((a) => a.attrs.target === "_blank" && a.attrs.rel === "noopener"));

  const moment = stubDocument();
  detailFor(
    {
      ...placed("founded"),
      moment: { ...placed("founded").moment, permalink: "/events/x/" },
    },
    CAST,
    moment.doc,
  );
  const page = moment.made.find((n) => n.tag === "a" && n.attrs.href === "/events/x/")!;
  assert.equal(page.text, "Event page");
  assert.equal(page.attrs.target, undefined);
  assert.equal(page.attrs.rel, undefined);
});

// --- the list of moments -----------------------------------------------------

const tokens = (n: Node) => (n.attrs.class ?? "").split(" ");
const byClass = (made: Node[], token: string) => made.filter((n) => tokens(n).includes(token));
const momentCard = (s: Story, id: string, dismissable = true) => {
  const { doc, made } = stubDocument();
  detailFor(s.moments.find((g) => g.moment.id === id)!, PEOPLE, doc, dismissable);
  return made;
};
const said = (made: Node[], token: string) => byClass(made, token).map((n) => n.text);
const dismisses = (made: Node[]) =>
  made.filter((n) => n.tag === "button" || n.attrs["data-origins-dismiss"] !== undefined);

test("the list of moments is one detail card for each moment, in the story's order, each saying which moment it is", () => {
  const { doc, made } = stubDocument();
  momentsFor(story, PEOPLE, doc);
  const list = made.find((n) => n.tag === "ul")!;
  assert.deepEqual(tokens(list), ["origins-moments"]);
  assert.equal(list.children.length, story.moments.length);
  assert.ok(list.children.every((li) => li.tag === "li" && tokens(li).includes("origins-moments-item")));
  assert.ok(list.children.every((li) =>
    li.children.length === 1 && li.children[0].tag === "div" &&
    tokens(li.children[0]).includes("origins-detail-card")
  ));
  assert.deepEqual(
    list.children.map((li) => li.children[0].attrs["data-moment"]),
    story.moments.map((g) => g.moment.id),
  );
});

// The popup opens over the picture and needs a way to shut it. The list
// covers nothing, so an X there would be a button that does nothing.
test("a moment's card in the list has no X, and its twin in the popup has one", () => {
  const { doc, made } = stubDocument();
  momentsFor(story, PEOPLE, doc);
  assert.deepEqual(dismisses(made), []);
  assert.equal(dismisses(momentCard(story, "scale")).length, 1);
});

test("a moment's card in the list says what its card in the popup says", () => {
  for (const id of ["scale", "nug1"]) {
    const listed = momentCard(story, id, false);
    const popped = momentCard(story, id).filter((n) => n.attrs["data-origins-dismiss"] === undefined);
    assert.deepEqual(texts(listed), texts(popped), id);
  }
  assert.deepEqual(
    said(momentCard(story, "scale", false), "origins-detail-people"),
    ["DANIEL, DAVID, ROB, JARED, MICA, CONNOR"],
  );
});

test("a meetup's card is told apart from any other moment's", () => {
  for (const dismissable of [true, false]) {
    assert.ok(tokens(byClass(momentCard(story, "nug1", dismissable), "origins-detail-card")[0]).includes("is-trunk"));
    assert.equal(
      tokens(byClass(momentCard(story, "camp", dismissable), "origins-detail-card")[0]).includes("is-trunk"),
      false,
    );
  }
});

test("the rail holds two panes, People over the roster and Moments over the list of moments", () => {
  const { doc, made } = stubDocument();
  const panes = listsFor(story, PEOPLE, doc);
  assert.equal(panes.length, 2);
  const sections = made.filter((n) => n.tag === "section");
  assert.deepEqual(sections.map(tokens), [["origins-pane", "is-people"], ["origins-pane", "is-moments"]]);
  for (const [section, title, list] of [
    [sections[0], "People", "origins-roster"],
    [sections[1], "Moments", "origins-moments"],
  ] as const) {
    assert.deepEqual(
      section.children.map((c) => [c.tag, tokens(c)[0]]),
      [["h2", "origins-pane-title"], ["ul", list]],
    );
    assert.equal(section.children[0].text, title);
  }
  assert.equal(sections[0].children[1].children.length, story.threads.length);
  assert.equal(sections[1].children[1].children.length, story.moments.length);
});

// --- the roster --------------------------------------------------------------
// The same card in two places: in a popup beside whatever was clicked, and in
// a grid of everyone. The popup one needs a way to shut it; the grid one is
// not covering anything, so an X there would be a button that does nothing.

test("the roster is one card per thread, in thread order", () => {
  const { doc, made } = stubDocument();
  rosterFor(small, doc);
  const cards = made.filter((n) =>
    (n.attrs.class ?? "").split(" ").includes("origins-card")
  );
  assert.deepEqual(
    cards.map((n) => n.attrs["data-person"]),
    small.threads.map((t) => t.person.slug),
  );
});

test("a roster card carries no dismiss control", () => {
  const { doc, made } = stubDocument();
  rosterFor(small, doc);
  assert.equal(
    made.some((n) => n.attrs["data-origins-dismiss"] !== undefined),
    false,
  );
});

test("a popup card still carries one", () => {
  const { doc, made } = stubDocument();
  personCardFor(thread("daniel"), small, doc);
  assert.ok(made.some((n) => n.attrs["data-origins-dismiss"] !== undefined));
});

test("the roster is a list, so it reads as a list of people", () => {
  const { doc, made } = stubDocument();
  rosterFor(small, doc);
  assert.ok(made.some((n) => n.tag === "ul"));
  assert.equal(
    made.filter((n) => n.tag === "li").length,
    small.threads.length,
  );
});

test("a roster card says the same things as its popup card", () => {
  const roster = stubDocument();
  rosterFor(small, roster.doc);
  const popup = stubDocument();
  for (const t of small.threads) personCardFor(t, small, popup.doc);

  const words = (made: Node[]) =>
    made.map((n) => n.text).filter((t) => t !== "" && t !== "×").sort();
  assert.deepEqual(words(roster.made), words(popup.made));
});
