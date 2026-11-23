import test from "node:test";
import assert from "node:assert/strict";
import { buildStory } from "../src/story.ts";
import { PEOPLE, MOMENTS, at, story } from "./story-fixture.ts";

const g = (id: string) => story.moments.find((m) => m.moment.id === id)!;
const slugs = (id: string) => g(id).through.map((p) => p.slug);

test("slot order is by joining, then first moment, then slug", () => {
  assert.deepEqual(story.order, ["rob", "daniel", "david", "jared", "mica", "connor"]);
});
test("after joining, a thread goes through every meetup", () => {
  assert.deepEqual(slugs("nug2"), ["rob", "daniel", "david", "jared", "mica"]);
  assert.deepEqual(g("nug2").through.map((p) => p.slot), [0, 1, 2, 3, 4]);
});
test("only the joiner is vouched for at a meetup with no attendance recorded", () => {
  assert.deepEqual(g("nug1").through.filter((p) => p.vouched).map((p) => p.slug), ["jared"]);
  assert.deepEqual(g("nug1").through.filter((p) => p.joined).map((p) => p.slug), ["jared"]);
});
test("someone recorded away leaves their slot empty, and nobody closes ranks", () => {
  assert.deepEqual(slugs("nug3"), ["daniel", "david", "jared", "mica"]);
  assert.deepEqual(g("nug3").through.map((p) => p.slot), [1, 2, 3, 4]);
  assert.equal(g("nug3").slots, 5);
  assert.equal(g("nug3").inGroup, 5);
});
test("someone recorded there is vouched for", () => {
  assert.deepEqual(g("nug3").through.filter((p) => p.vouched).map((p) => p.slug), ["daniel"]);
});
test("everyone named at a moment that is not a meetup is vouched for", () => {
  assert.ok(g("camp").through.every((p) => p.vouched));
});
test("a gathering of part of the group is off the ribbon, with its slots packed", () => {
  assert.equal(g("camp").onRibbon, false);
  assert.deepEqual(g("camp").through.map((p) => [p.slug, p.slot]), [["rob", 0], ["daniel", 1]]);
  assert.equal(g("camp").slots, 2);
});
test("a gathering of the whole group is on the ribbon, and a visitor takes the slot after the members", () => {
  assert.equal(g("scale").onRibbon, true);
  assert.deepEqual(g("scale").through.map((p) => [p.slug, p.slot]), [["rob", 0], ["daniel", 1], ["david", 2], ["jared", 3], ["mica", 4], ["connor", 5]]);
  assert.equal(g("scale").slots, 6);
});
test("nothing is on the ribbon before there is a group", () => {
  assert.equal(g("booth").onRibbon, false);
  assert.equal(g("booth").inGroup, 0);
});
test("a thread is every gathering its person is through, and skips a meetup they were away from", () => {
  const path = (slug: string) => story.threads.find((t) => t.person.slug === slug)!.path.map((x) => x.moment.id);
  assert.deepEqual(path("rob"), ["rob-nix", "booth", "founded", "nug1", "nug2", "camp", "scale", "nug4"]);
  assert.deepEqual(path("connor"), ["scale", "nug4"]);
});
test("threads come in the people map's order, and someone in no moment has none", () => {
  assert.deepEqual(story.threads.map((t) => t.person.slug), ["rob", "daniel", "david", "jared", "mica", "connor"]);
});
// Review Focus 1
test("a meetup everyone is away from keeps its slots and has nobody through it", () => {
  const s = buildStory([at("founded", "2023-04", ["rob", "daniel"], true), at("nug", "2023-06", [], true, { away: ["rob", "daniel"] })], PEOPLE);
  const nug = s.moments[1];
  assert.deepEqual(nug.through, []);
  assert.equal(nug.slots, 2);
  assert.equal(nug.onRibbon, true);
});
// Review Focus 2
test("someone who never joins is last in slot order and has only the moments that name them", () => {
  const s = buildStory([...MOMENTS, at("visit", "2024-04", ["morgan", "rob"])], PEOPLE);
  assert.equal(s.order.at(-1), "morgan");
  const morgan = s.threads.find((t) => t.person.slug === "morgan")!;
  assert.deepEqual(morgan.path.map((x) => x.moment.id), ["visit"]);
  assert.equal(morgan.joinsTrunkAt, null);
});
// Review Focus 3
test("two moments on one date are ordered by id, and a person through both passes each once", () => {
  const s = buildStory([at("founded", "2023-04", ["rob"], true), at("b-nug", "2023-06-01", [], true), at("a-talk", "2023-06-01", ["rob"])], PEOPLE);
  assert.deepEqual(s.moments.map((m) => m.moment.id), ["founded", "a-talk", "b-nug"]);
  assert.deepEqual(s.threads[0].path.map((x) => x.moment.id), ["founded", "a-talk", "b-nug"]);
});
// Review Focus 4
test("a person whose first moment is the meetup they join at starts there, joined", () => {
  const jared = story.threads.find((t) => t.person.slug === "jared")!;
  assert.equal(jared.path[0].moment.id, "nug1");
  assert.equal(jared.joinsTrunkAt, "nug1");
});
