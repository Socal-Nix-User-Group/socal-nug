import test from "node:test";
import assert from "node:assert/strict";
import { parseFuzzyDate } from "../src/dates.ts";
import { buildBraid } from "../src/layout.ts";
import type { Braid, Moment, Person } from "../src/types.ts";

function person(slug: string, member = true): Person {
  return {
    slug,
    name: slug,
    alias: `@${slug}`,
    description: "",
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

// Mirrors the real story: personal roots, convergence at SCaLE, the spine
// starting at the founding, a join, then a detour that recruits.
const STORY: Moment[] = [
  at("daniel-nix", "2021-10-23", ["daniel"]),
  at("tweag", "2022-02-21", ["daniel"]),
  at("meets-rok", "2022-03", ["daniel", "rok"]),
  at("code-and-coffee", "2022-08-27", ["daniel", "david"]),
  at("scale-20x", "2023-03", ["daniel", "rob", "david"]),
  at("snug-founded", "2023-04", ["daniel", "david", "rob"], true),
  at("nug3", "2023-09-19", ["tristan"], true),
  at("nix-camp", "2023-10", ["daniel", "rob", "david", "kyle"]),
  at("nug4", "2024-01-25", [], true),
];

const braid: Braid = buildBraid(STORY, PEOPLE);

const thread = (slug: string) =>
  braid.threads.find((t) => t.person.slug === slug)!;
const trunkFrom = (id: string) =>
  braid.trunk.find((s) => s.from.moment.id === id)!;

// --- order ------------------------------------------------------------------
// Where things go is the layout engine's decision. What this decides is the
// order they happened in, and that order is what pins them to layers.

test("moments come back in date order whatever order they were given in", () => {
  const shuffled = buildBraid([...STORY].reverse(), PEOPLE);
  assert.deepEqual(
    shuffled.moments.map((m) => m.moment.id),
    STORY.map((m) => m.id),
  );
});

test("moments sharing one date are ordered by id, so the same data draws the same", () => {
  const same = buildBraid(
    [
      at("zebra", "2021-01-01", ["daniel"]),
      at("alpha", "2021-01-01", ["daniel"]),
      at("later", "2023-01-01", ["daniel"], true),
    ],
    PEOPLE,
  );
  assert.deepEqual(
    same.moments.map((m) => m.moment.id),
    ["alpha", "zebra", "later"],
  );
});

test("a single moment is a braid of one", () => {
  const one = buildBraid([at("only", "2021", ["daniel"], true)], PEOPLE);
  assert.equal(one.moments.length, 1);
  assert.equal(one.threads.length, 1);
  assert.equal(one.trunk.length, 0);
});

// --- threads ----------------------------------------------------------------

test("a thread's approach segment visits its moments in date order", () => {
  const approach = thread("daniel").segments.find(
    (s) => s.kind === "approach",
  )!;
  assert.deepEqual(
    approach.points.map((p) => p.moment.id),
    [
      "daniel-nix",
      "tweag",
      "meets-rok",
      "code-and-coffee",
      "scale-20x",
      "snug-founded",
    ],
  );
});

test("a thread merges into the trunk at its first trunk moment", () => {
  assert.equal(thread("daniel").joinsTrunkAt, "snug-founded");
  assert.equal(thread("tristan").joinsTrunkAt, "nug3");
});

test("an approach stops at the join; what follows is the trunk's to draw", () => {
  const approach = thread("david").segments.find(
    (s) => s.kind === "approach",
  )!;
  assert.equal(
    approach.points[approach.points.length - 1].moment.id,
    "snug-founded",
  );
  assert.ok(!approach.points.some((p) => p.moment.id === "nix-camp"));
});

test("a person with no trunk moment never joins", () => {
  assert.equal(thread("rok").joinsTrunkAt, null);
});

test("a person whose only moment is a join gets a short valid thread", () => {
  const t = thread("tristan");
  const approach = t.segments.find((s) => s.kind === "approach")!;
  assert.equal(approach.points.length, 1);
  assert.equal(t.joinsTrunkAt, "nug3");
});

test("someone named in no moment gets no thread", () => {
  const extra = new Map(PEOPLE);
  extra.set("nobody", person("nobody"));
  const b = buildBraid(STORY, extra);
  assert.equal(b.threads.some((t) => t.person.slug === "nobody"), false);
});

// --- trunk ------------------------------------------------------------------

test("trunk thickness counts distinct people joined so far", () => {
  assert.equal(trunkFrom("snug-founded").joined, 3);
  assert.equal(trunkFrom("nug3").joined, 4);
});

test("a future-dated trunk moment does not inflate earlier thickness", () => {
  const withFuture = buildBraid(
    [...STORY, at("nug99", "2030-01-01", ["rok"], true)],
    PEOPLE,
  );
  const seg = withFuture.trunk.find((s) =>
    s.from.moment.id === "snug-founded"
  )!;
  assert.equal(seg.joined, 3);
});

test("the trunk thins while people are away", () => {
  // daniel, rob and david leave for nix-camp between nug3 and nug4
  assert.equal(trunkFrom("nug3").away, 3);
  assert.equal(trunkFrom("snug-founded").away, 0);
});

// --- excursions -------------------------------------------------------------

test("a non-trunk moment after the trunk start is an excursion", () => {
  const e = braid.excursions.find((x) => x.moment.moment.id === "nix-camp")!;
  assert.deepEqual([...e.leaves].sort(), ["daniel", "david", "rob"]);
});

test("a non-trunk moment before the trunk start is not an excursion", () => {
  assert.equal(
    braid.excursions.some((x) => x.moment.moment.id === "scale-20x"),
    false,
  );
});

test("an excursion gives each leaver a second drawn segment", () => {
  assert.equal(
    thread("rob").segments.filter((s) => s.kind === "excursion").length,
    1,
  );
  assert.equal(
    thread("tristan").segments.filter((s) => s.kind === "excursion").length,
    0,
  );
});

test("an excursion departs at the previous trunk moment and rejoins at the next", () => {
  const e = braid.excursions.find((x) => x.moment.moment.id === "nix-camp")!;
  assert.equal(e.from.moment.id, "nug3");
  assert.equal(e.to!.moment.id, "nug4");
});

test("an excursion with no trunk moment after it stays open", () => {
  const open = buildBraid(
    [
      at("root", "2021", ["daniel"]),
      at("founded", "2023-04", ["daniel", "rob"], true),
      at("recent", "2023-10", ["daniel", "rob"]),
    ],
    PEOPLE,
  );
  assert.equal(open.excursions[0].to, null);
});

test("an excursion names who was there but not yet in the group", () => {
  // recruits are still identified, because the drawing needs to know who
  // arrives from outside. What it no longer does is treat that as a join.
  const e = braid.excursions.find((x) => x.moment.moment.id === "nix-camp")!;
  assert.deepEqual([...e.recruits], ["kyle"]);
  assert.equal(thread("kyle").joinsTrunkAt, null);
});

test("being at an excursion never grants a join", () => {
  // a join comes from a trunk moment naming you. Inferring one from company
  // kept at a camp is a guess about meetup attendance, and it is how two
  // people ended up with join dates they had never earned.
  const early = buildBraid(
    [
      at("tweag", "2021-01", ["daniel", "rok"]),
      at("founded", "2023-04", ["daniel"], true),
      at("camp", "2024-01", ["daniel", "rok"]),
      at("nug", "2024-06", [], true),
    ],
    PEOPLE,
  );
  const e = early.excursions[0];
  assert.deepEqual([...e.leaves], ["daniel"]);
  assert.deepEqual([...e.recruits], ["rok"]);
  assert.equal(
    early.threads.find((t) => t.person.slug === "rok")!.joinsTrunkAt,
    null,
    "rok was never recorded at a trunk moment, so he has not joined one",
  );
});

test("a join record is what puts somebody on the spine", () => {
  const joined = buildBraid(
    [
      at("tweag", "2021-01", ["daniel", "rok"]),
      at("founded", "2023-04", ["daniel"], true),
      at("camp", "2024-01", ["daniel", "rok"]),
      // the join record merges rok into this trunk moment's people
      at("nug", "2024-06", ["rok"], true),
    ],
    PEOPLE,
  );
  assert.equal(
    joined.threads.find((t) => t.person.slug === "rok")!.joinsTrunkAt,
    "nug",
  );
});

test("a moment naming only people not yet in the group is not a detour", () => {
  // nobody leaves the spine for it; it is part of their approach
  const b = buildBraid(
    [
      at("daniel-nix", "2021-01", ["daniel"]),
      at("founded", "2023-04", ["daniel"], true),
      at("meet", "2024-01", ["kyle", "tristan"]),
      at("nug", "2024-06", ["kyle", "tristan"], true),
    ],
    PEOPLE,
  );
  assert.equal(b.excursions.length, 0);
  const kyle = b.threads.find((t) => t.person.slug === "kyle")!;
  assert.deepEqual(
    kyle.segments[0].points.map((p) => p.moment.id),
    ["meet", "nug"],
  );
});
