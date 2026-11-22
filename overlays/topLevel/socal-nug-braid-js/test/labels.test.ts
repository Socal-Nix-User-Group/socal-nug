import test from "node:test";
import assert from "node:assert/strict";
import { resolveCollisions } from "../src/labels.ts";
import type { LabelBox } from "../src/labels.ts";

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
