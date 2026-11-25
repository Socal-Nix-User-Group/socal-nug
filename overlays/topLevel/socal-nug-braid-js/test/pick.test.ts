import test from "node:test";
import assert from "node:assert/strict";
import { centred, litBy, reveal, toggled } from "../src/pick.ts";
import { story } from "./story-fixture.ts";

test("a click on a card picks it, and a second click on the same card picks nothing", () => {
  const rob = { kind: "person", id: "rob" } as const;
  const camp = { kind: "moment", id: "camp" } as const;
  assert.deepEqual(toggled(null, rob), rob);
  assert.deepEqual(toggled(camp, rob), rob);
  assert.equal(toggled(rob, { kind: "person", id: "rob" }), null);
  // a person and a moment with the same id are not the same pick
  assert.deepEqual(toggled({ kind: "person", id: "x" }, { kind: "moment", id: "x" }), { kind: "moment", id: "x" });
});

test("a picked person lights that person, a picked moment everyone who was at it and not away, and nothing lights nobody", () => {
  assert.deepEqual([...litBy(story, null)], []);
  assert.deepEqual([...litBy(story, { kind: "person", id: "mica" })], ["mica"]);
  assert.deepEqual([...litBy(story, { kind: "moment", id: "camp" })].sort(), ["daniel", "rob"]);
  // nug3: rob is recorded away from it, and everyone else in the group then is through it
  const nug3 = litBy(story, { kind: "moment", id: "nug3" });
  assert.equal(nug3.has("rob"), false);
  assert.equal(nug3.has("daniel"), true);
  // a moment the story does not have lights nobody
  assert.deepEqual([...litBy(story, { kind: "moment", id: "nowhere" })], []);
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

test("a list scrolls only as far as it takes to show a card, and not at all for one already in view", () => {
  assert.equal(reveal(120, 180, 100, 300), 0);
  assert.equal(reveal(40, 90, 100, 300), -60);
  assert.equal(reveal(280, 350, 100, 300), 50);
  // longer than the view: from its start
  assert.equal(reveal(150, 500, 100, 300), 50);
  assert.equal(reveal(60, 500, 100, 300), -40);
});
