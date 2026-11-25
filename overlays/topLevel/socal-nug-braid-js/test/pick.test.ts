import test from "node:test";
import assert from "node:assert/strict";
import { centred, framed, litBy, toggled } from "../src/pick.ts";
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
