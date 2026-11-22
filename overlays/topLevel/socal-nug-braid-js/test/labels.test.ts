import test from "node:test";
import assert from "node:assert/strict";
import { extentOf, layoutLabels, resolveCollisions } from "../src/labels.ts";
import type { Anchor, LabelBox } from "../src/labels.ts";

function box(id: string, x: number, y: number): LabelBox {
  return { id, x, y, w: 40, h: 10, anchorX: x, anchorY: y };
}

test("boxes that do not overlap come back unchanged", () => {
  const input = [box("a", 0, 0), box("b", 0, 50), box("c", 0, 100)];
  const out = resolveCollisions(input, "y");
  assert.deepEqual(out.map((b) => b.y), [0, 50, 100]);
});

test("overlapping boxes are pushed apart along the given axis", () => {
  const out = resolveCollisions([box("a", 0, 0), box("b", 0, 5)], "y");
  assert.equal(out[0].y, 0);
  assert.ok(out[1].y >= 10, `expected b below 10, got ${out[1].y}`);
});

test("pushing happens only on the given axis", () => {
  const out = resolveCollisions([box("a", 7, 0), box("b", 7, 5)], "y");
  assert.deepEqual(out.map((b) => b.x), [7, 7]);
});

test("a pushed box keeps its anchor so a leader line stays correct", () => {
  const out = resolveCollisions([box("a", 0, 0), box("b", 0, 5)], "y");
  assert.equal(out[1].anchorY, 5);
  assert.notEqual(out[1].y, out[1].anchorY);
});

test("the x axis works the same way", () => {
  const out = resolveCollisions([box("a", 0, 0), box("b", 10, 0)], "x");
  assert.equal(out[0].x, 0);
  assert.ok(out[1].x >= 40, `expected b past 40, got ${out[1].x}`);
});

test("a run of overlaps cascades instead of stacking", () => {
  const out = resolveCollisions(
    [box("a", 0, 0), box("b", 0, 1), box("c", 0, 2)],
    "y",
  );
  for (let i = 1; i < out.length; i += 1) {
    assert.ok(
      out[i].y >= out[i - 1].y + out[i - 1].h,
      `${out[i].id} overlaps ${out[i - 1].id}`,
    );
  }
});

test("resolution is stable for equal inputs", () => {
  const input = [box("b", 0, 5), box("a", 0, 5), box("c", 0, 6)];
  const once = resolveCollisions(input, "y");
  const twice = resolveCollisions(input, "y");
  assert.deepEqual(once, twice);
});

test("an empty list is handled", () => {
  assert.deepEqual(resolveCollisions([], "y"), []);
});

// --- layoutLabels: sweep then pull back inside -------------------------------

function anchored(id: string, x: number, y: number, anchor: Anchor) {
  return { id, x, y, w: 150, h: 14, anchorX: x, anchorY: y, anchor };
}

const CANVAS = { width: 800, height: 600 };

test("an end-anchored label at the left edge is pulled inside", () => {
  const [box] = layoutLabels([anchored("a", 26, 100, "end")], "y", CANVAS);
  const [left, right] = extentOf(box);
  assert.ok(left >= 0, `left ${left}`);
  assert.ok(right <= CANVAS.width, `right ${right}`);
});

test("a middle-anchored label at the left edge is pulled inside", () => {
  const [box] = layoutLabels([anchored("a", 40, 100, "middle")], "x", CANVAS);
  assert.ok(extentOf(box)[0] >= 0);
});

test("a start-anchored label at the right edge is pulled inside", () => {
  const [box] = layoutLabels([anchored("a", 790, 100, "start")], "y", CANVAS);
  assert.ok(extentOf(box)[1] <= CANVAS.width);
});

test("a sweep that runs past the edge is pulled back", () => {
  // thirty boxes each claiming 150 on an 800 wide canvas cannot all fit
  const many = Array.from(
    { length: 30 },
    (_, i) => anchored(`m${i}`, 40 + i * 20, 100, "middle"),
  );
  for (const box of layoutLabels(many, "x", CANVAS)) {
    const [left, right] = extentOf(box);
    assert.ok(left >= 0 && right <= CANVAS.width, `${box.id} ${left}..${right}`);
  }
});

test("clamping never moves an anchor", () => {
  const [box] = layoutLabels([anchored("a", 26, 100, "end")], "y", CANVAS);
  assert.equal(box.anchorX, 26);
  assert.equal(box.anchorY, 100);
});


// --- layoutLabels: obstacles ------------------------------------------------
// Avatars and node circles are drawn before labels and cannot move, so the
// sweep has to treat them as occupied ground. A blocked label swaps to the
// other side of its node; it never walks away from it, because a label a long
// way from the dot it names is worse than the overlap it was avoiding.

test("a label clear of every obstacle does not move", () => {
  const input = anchored("a", 250, 100, "end");
  const [box] = layoutLabels([input], "y", CANVAS, [
    { x: 600, y: 400, w: 36, h: 36 },
  ]);
  assert.equal(box.y, input.y);
  assert.equal(box.x, input.x);
  assert.equal(box.anchor, "end");
});

test("a label blocked on its natural side flips to the other side", () => {
  // "end" hangs leftward from x; the obstacle sits in that space.
  const [box] = layoutLabels([anchored("a", 250, 100, "end")], "y", CANVAS, [
    { x: 150, y: 86, w: 36, h: 36 },
  ]);
  assert.equal(box.anchor, "start");
  const [left, right] = extentOf(box);
  assert.ok(left >= 250, `expected the label right of its node, got ${left}`);
  assert.ok(right <= CANVAS.width, `right ${right}`);
});

test("obstacle avoidance never walks a label along the sweep axis", () => {
  // Walking is what put "Started at Tweag" a long way from its own dot.
  const input = anchored("a", 250, 100, "end");
  const [box] = layoutLabels([input], "y", CANVAS, [
    { x: 150, y: 86, w: 36, h: 36 },
    { x: 250, y: 86, w: 36, h: 36 },
  ]);
  assert.equal(box.y, input.y, "the label moved away from its node");
});

test("a label blocked on both sides keeps its natural side", () => {
  const input = anchored("a", 250, 100, "end");
  const [box] = layoutLabels([input], "y", CANVAS, [
    { x: 150, y: 86, w: 36, h: 36 },
    { x: 300, y: 86, w: 36, h: 36 },
  ]);
  assert.equal(box.anchor, "end");
  assert.equal(box.x, input.x);
});

test("a flipped label stays beside the node it names", () => {
  const [box] = layoutLabels([anchored("a", 250, 100, "end")], "y", CANVAS, [
    { x: 150, y: 86, w: 36, h: 36 },
  ]);
  const [left] = extentOf(box);
  assert.ok(
    Math.abs(left - box.anchorX) <= 20,
    `label starts ${Math.abs(left - box.anchorX)}px from its node`,
  );
});

test("a flip that would run off the canvas is refused", () => {
  const input = anchored("a", 780, 100, "end");
  const [box] = layoutLabels([input], "y", CANVAS, [
    { x: 700, y: 86, w: 36, h: 36 },
  ]);
  const [left, right] = extentOf(box);
  assert.ok(left >= 0 && right <= CANVAS.width, `${left}..${right}`);
});

test("obstacle avoidance never moves an anchor", () => {
  const [box] = layoutLabels([anchored("a", 250, 100, "end")], "y", CANVAS, [
    { x: 150, y: 86, w: 36, h: 36 },
  ]);
  assert.equal(box.anchorX, 250);
  assert.equal(box.anchorY, 100);
});
