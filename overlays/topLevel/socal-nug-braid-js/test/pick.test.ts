import test from "node:test";
import assert from "node:assert/strict";
import { centred, framed, holds, litBy, toggled, unsureAt } from "../src/pick.ts";
import { buildStory } from "../src/story.ts";
import { at, MOMENTS, PEOPLE, story } from "./story-fixture.ts";

test("a click adds what was clicked to the picks, and a second click on it takes that one out", () => {
  const rob = { kind: "person", id: "rob" } as const;
  const camp = { kind: "moment", id: "camp" } as const;
  assert.deepEqual(toggled([], rob), [rob]);
  // added after what was there, which stays
  assert.deepEqual(toggled([camp], rob), [camp, rob]);
  assert.deepEqual(toggled([camp, rob], { kind: "moment", id: "camp" }), [rob]);
  assert.deepEqual(toggled([rob], { kind: "person", id: "rob" }), []);
  // a person and a moment with the same id are not the same pick
  const x = { kind: "person", id: "x" } as const;
  assert.deepEqual(toggled([x], { kind: "moment", id: "x" }), [x, { kind: "moment", id: "x" }]);
});

test("the picks hold a pick of the same kind and id, and no other", () => {
  const picks = [{ kind: "person", id: "rob" }, { kind: "moment", id: "camp" }] as const;
  assert.equal(holds(picks, { kind: "person", id: "rob" }), true);
  assert.equal(holds(picks, { kind: "moment", id: "camp" }), true);
  assert.equal(holds(picks, { kind: "moment", id: "rob" }), false);
  assert.equal(holds(picks, { kind: "person", id: "mica" }), false);
  assert.equal(holds([], { kind: "person", id: "rob" }), false);
});

test("a picked person lights that person, a picked moment whoever is confirmed at it, and nothing lights nobody", () => {
  assert.deepEqual([...litBy(story, [])], []);
  assert.deepEqual([...litBy(story, [{ kind: "person", id: "mica" }])], ["mica"]);
  assert.deepEqual([...litBy(story, [{ kind: "moment", id: "camp" }])].sort(), ["daniel", "rob"]);
  // nug3: daniel is recorded there, rob away, and nothing is recorded for david, jared and mica
  assert.deepEqual([...litBy(story, [{ kind: "moment", id: "nug3" }])], ["daniel"]);
  // nug1: jared joined there, and nothing is recorded for anyone else
  assert.deepEqual([...litBy(story, [{ kind: "moment", id: "nug1" }])], ["jared"]);
  // a moment the story does not have lights nobody
  assert.deepEqual([...litBy(story, [{ kind: "moment", id: "nowhere" }])], []);
});

test("several picks light everyone any of them lights, each once", () => {
  // nug1 lights jared, camp lights daniel and rob, and mica is picked
  assert.deepEqual(
    [...litBy(story, [
      { kind: "moment", id: "nug1" },
      { kind: "person", id: "mica" },
      { kind: "moment", id: "camp" },
    ])].sort(),
    ["daniel", "jared", "mica", "rob"],
  );
  // daniel is confirmed at both and picked as well
  assert.deepEqual(
    [...litBy(story, [
      { kind: "moment", id: "camp" },
      { kind: "moment", id: "nug3" },
      { kind: "person", id: "daniel" },
    ])].sort(),
    ["daniel", "rob"],
  );
});

test("the people unsure at a moment are those through it neither confirmed nor away", () => {
  assert.deepEqual([...unsureAt(story, "nug3")].sort(), ["david", "jared", "mica"]);
  assert.deepEqual([...unsureAt(story, "camp")], []);
  assert.deepEqual([...unsureAt(story, "nowhere")], []);
});

test("a moment that is not a meetup lights the people it names and not someone away from it, and leaves nobody unsure", () => {
  const s = buildStory(
    [...MOMENTS, at("conf", "2024-09", ["rob", "daniel"], false, { away: ["mica"] })],
    PEOPLE,
  );
  assert.ok(s.moments.find((m) => m.moment.id === "conf")!.through.some((p) => p.slug === "mica"));
  assert.deepEqual([...litBy(s, [{ kind: "moment", id: "conf" }])].sort(), ["daniel", "rob"]);
  assert.deepEqual([...unsureAt(s, "conf")], []);
});

test("centring puts the point in the middle of the box, and stops where the box stops scrolling", () => {
  const box = { width: 600, height: 400 };
  assert.deepEqual(centred({ x: 1000, y: 900 }, box, { x: 2000, y: 2000 }), { x: 700, y: 700 });
  // near the start and past the end
  assert.deepEqual(centred({ x: 100, y: 50 }, box, { x: 2000, y: 2000 }), { x: 0, y: 0 });
  assert.deepEqual(centred({ x: 2500, y: 2300 }, box, { x: 2000, y: 2000 }), { x: 2000, y: 2000 });
  // a box with nowhere to scroll stays where it is
  assert.deepEqual(centred({ x: 300, y: 300 }, box, { x: 0, y: 0 }), { x: 0, y: 0 });
});

test("a list is scrolled to put a card in the middle of its box, as far as the list goes", () => {
  // a list 400 by 300 that scrolls down 3000, and a card 100 tall across its width
  const box = { width: 400, height: 300 };
  const reach = { x: 0, y: 3000 };
  // the card's middle, 1050, ends up 150 down the box
  assert.deepEqual(framed({ x: 0, y: 1000, width: 400, height: 100 }, box, reach), { x: 0, y: 900 });
  // the first card and the last cannot be brought to the middle
  assert.deepEqual(framed({ x: 0, y: 0, width: 400, height: 100 }, box, reach), { x: 0, y: 0 });
  assert.deepEqual(framed({ x: 0, y: 3200, width: 400, height: 100 }, box, reach), { x: 0, y: 3000 });
  // a row that scrolls sideways is centred across in the same way
  assert.deepEqual(
    framed({ x: 2000, y: 0, width: 300, height: 260 }, { width: 900, height: 260 }, { x: 5000, y: 0 }),
    { x: 1700, y: 0 },
  );
});

test("a card longer than its list's box is put at the box's start, not centred with both ends cut off", () => {
  const box = { width: 400, height: 300 };
  // 500 tall in a box 300 tall: its top goes to the top of the box
  assert.deepEqual(framed({ x: 0, y: 1000, width: 400, height: 500 }, box, { x: 0, y: 3000 }), { x: 0, y: 1000 });
  // exactly as tall as the box is the same thing either way
  assert.deepEqual(framed({ x: 0, y: 1000, width: 400, height: 300 }, box, { x: 0, y: 3000 }), { x: 0, y: 1000 });
});
