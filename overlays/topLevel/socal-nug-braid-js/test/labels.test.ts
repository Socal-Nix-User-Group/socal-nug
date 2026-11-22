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
// sweep has to treat them as occupied ground. Resolving labels against each
// other only was why "Rob finds Nix" sat on top of Daniel's face.

test("a label that lands on an obstacle is moved off it", () => {
  const obstacle = { x: 100, y: 94, w: 36, h: 36 };
  const [box] = layoutLabels(
    [anchored("a", 250, 100, "end")],
    "y",
    CANVAS,
    [obstacle],
  );
  const [left, right] = extentOf(box);
  const clear = right <= obstacle.x ||
    left >= obstacle.x + obstacle.w ||
    box.y <= obstacle.y ||
    box.y - box.h >= obstacle.y + obstacle.h;
  assert.ok(clear, `label at ${left}..${right} y=${box.y} still on obstacle`);
});

test("a label clear of every obstacle does not move", () => {
  const input = anchored("a", 250, 100, "end");
  const [box] = layoutLabels([input], "y", CANVAS, [
    { x: 600, y: 400, w: 36, h: 36 },
  ]);
  assert.equal(box.y, input.y);
  assert.equal(box.x, input.x);
});

test("a label pushed off an obstacle stays inside the canvas", () => {
  const obstacles = Array.from(
    { length: 40 },
    (_, i) => ({ x: 100, y: i * 14, w: 200, h: 14 }),
  );
  const [box] = layoutLabels(
    [anchored("a", 250, 100, "end")],
    "y",
    CANVAS,
    obstacles,
  );
  const [left, right] = extentOf(box);
  assert.ok(left >= 0 && right <= CANVAS.width, `${left}..${right}`);
  assert.ok(box.y - box.h >= 0 && box.y <= CANVAS.height, `y ${box.y}`);
});

test("obstacle avoidance never moves an anchor", () => {
  const [box] = layoutLabels([anchored("a", 250, 100, "end")], "y", CANVAS, [
    { x: 100, y: 94, w: 36, h: 36 },
  ]);
  assert.equal(box.anchorX, 250);
  assert.equal(box.anchorY, 100);
});
