import test from "node:test";
import assert from "node:assert/strict";
import {
  describeGathering,
  describePerson,
  focusOrder,
  labelFor,
  nextIndex,
} from "../src/focus.ts";
import { at, braid, PEOPLE } from "./fake-elk.ts";
import { buildBraid } from "../src/layout.ts";
import { buildStory } from "../src/story.ts";
import {
  at as storyAt,
  PEOPLE as STORY_PEOPLE,
  person,
  story,
} from "./story-fixture.ts";

// The braid is one tab stop. Inside it the arrow keys move through the story
// in the order it happened, which is the same order in both modes: time runs
// down in River and across in Subway, so forward is Down or Right either way.

test("the order is the story's order, a face just before its first moment", () => {
  assert.deepEqual(
    focusOrder(story).map((t) => `${t.kind}:${t.id}`),
    [
      "person:rob",
      "moment:rob-nix",
      "person:daniel",
      "person:david",
      "person:mica",
      "moment:booth",
      "moment:founded",
      "person:jared",
      "moment:nug1",
      "moment:nug2",
      "moment:camp",
      "moment:nug3",
      "person:connor",
      "moment:scale",
      "moment:nug4",
    ],
  );
});

test("every moment and every face is reachable, and nothing twice", () => {
  const order = focusOrder(story);
  const ids = order.map((t) => `${t.kind}:${t.id}`);
  assert.equal(new Set(ids).size, ids.length, "a target appears twice");
  assert.equal(
    order.filter((t) => t.kind === "moment").length,
    story.moments.length,
  );
  assert.equal(
    order.filter((t) => t.kind === "person").length,
    story.threads.length,
  );
});

test("two people starting at one moment both come before it, in thread order", () => {
  const together = buildStory(
    [
      storyAt("meet", "2021-01", ["daniel", "rob"]),
      storyAt("founded", "2023-01", ["daniel"], true),
    ],
    STORY_PEOPLE,
  );
  assert.deepEqual(
    focusOrder(together).map((t) => `${t.kind}:${t.id}`),
    ["person:rob", "person:daniel", "moment:meet", "moment:founded"],
  );
});

test("forward is down or right, back is up or left", () => {
  assert.equal(nextIndex(2, "ArrowDown", 6), 3);
  assert.equal(nextIndex(2, "ArrowRight", 6), 3);
  assert.equal(nextIndex(2, "ArrowUp", 6), 1);
  assert.equal(nextIndex(2, "ArrowLeft", 6), 1);
});

test("the ends hold rather than wrapping", () => {
  // a timeline has a beginning and an end; wrapping from one to the other
  // loses the reader's place in the story
  assert.equal(nextIndex(0, "ArrowUp", 6), 0);
  assert.equal(nextIndex(5, "ArrowDown", 6), 5);
});

test("Home and End jump to the ends", () => {
  assert.equal(nextIndex(3, "Home", 6), 0);
  assert.equal(nextIndex(3, "End", 6), 5);
});

test("a key the braid does not use is left alone", () => {
  // so Tab still leaves the picture and typing still reaches the page
  assert.equal(nextIndex(3, "Tab", 6), null);
  assert.equal(nextIndex(3, "a", 6), null);
  assert.equal(nextIndex(3, "PageDown", 6), null);
});

test("an empty braid has nowhere to go", () => {
  assert.equal(nextIndex(0, "ArrowDown", 0), null);
});

// --- what a screen reader hears ---------------------------------------------

test("a moment reads as its title and date", () => {
  // a meetup nobody joined at names nobody, so the label stops at the date
  const quiet = buildBraid(
    [
      at("a-root", "2021-01", ["a"]),
      at("founded", "2023-01", ["a"], true),
      at("nug2", "2023-03", [], true),
    ],
    PEOPLE,
  );
  const target = { id: "nug2", kind: "moment" } as const;
  assert.equal(labelFor(target, quiet), "nug2, March 2023");
});

test("a moment with people says how many, since the card names them", () => {
  const camp = { id: "camp", kind: "moment" } as const;
  assert.equal(labelFor(camp, braid), "camp, April 2023, 2 people");
});

test("a moment with one person says one person, not 1 people", () => {
  const root = { id: "a-root", kind: "moment" } as const;
  assert.equal(labelFor(root, braid), "a-root, January 2021, 1 person");
});

test("a face reads as its person, and whether they are a member", () => {
  assert.equal(labelFor({ id: "a", kind: "person" }, braid), "A, member");
  assert.equal(labelFor({ id: "b", kind: "person" }, braid), "B, guest");
});

const g = (id: string) => story.moments.find((m) => m.moment.id === id)!;

test("a meetup is described by how many are in the group", () =>
  assert.equal(describeGathering(g("nug3")), "nug3, January 2024, 5 in the group"));

test("another moment is described by how many were there", () =>
  assert.equal(describeGathering(g("camp")), "camp, September 2023, 2 people"));

test("one person is one person", () =>
  assert.equal(describeGathering(g("rob-nix")), "rob-nix, July 2018, 1 person"));

test("a member and a guest are described as what they are", () => {
  assert.equal(describePerson(person("rob")), "ROB, member");
  assert.equal(describePerson(person("rob", false)), "ROB, guest");
});
