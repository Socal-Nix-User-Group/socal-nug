import test from "node:test";
import assert from "node:assert/strict";
import {
  fitZoom,
  stepZoom,
  wheelZoom,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../src/zoom.ts";

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test("a step in is a quarter larger, and a step out undoes it", () => {
  assert.equal(stepZoom(1, 1), 1.25);
  near(stepZoom(stepZoom(1, 1), -1), 1);
  assert.equal(stepZoom(1, -1), 0.8);
});

test("steps stop at the limits", () => {
  assert.equal(stepZoom(ZOOM_MAX, 1), ZOOM_MAX);
  assert.equal(stepZoom(ZOOM_MAX / 1.1, 1), ZOOM_MAX);
  assert.equal(stepZoom(ZOOM_MIN, -1), ZOOM_MIN);
  assert.equal(stepZoom(ZOOM_MIN * 1.1, -1), ZOOM_MIN);
});

test("the wheel away from the reader zooms in, towards them zooms out", () => {
  assert.ok(wheelZoom(1, -10, 0) > 1);
  assert.ok(wheelZoom(1, 10, 0) < 1);
  near(wheelZoom(wheelZoom(1, -10, 0), 10, 0), 1);
});

test("a pinch's small deltas each count for what they are", () => {
  // Two pixels at a time, many times over: the same as their sum in one go.
  let zoom = 1;
  for (let i = 0; i < 10; i += 1) zoom = wheelZoom(zoom, -2, 0);
  near(zoom, wheelZoom(1, -20, 0));
});

test("one notch of a mouse wheel is about one press of a button", () => {
  // A notch is a hundred pixels or so, and counts for no more than fifty.
  assert.equal(wheelZoom(1, -100, 0), wheelZoom(1, -50, 0));
  assert.equal(wheelZoom(1, -400, 0), wheelZoom(1, -50, 0));
  const notch = wheelZoom(1, -100, 0);
  assert.ok(notch > 1.2 && notch < 1.35, String(notch));
});

test("a wheel that reports lines zooms like one that reports pixels", () => {
  // Three lines a notch, at sixteen pixels a line.
  assert.equal(wheelZoom(1, -3, 1), wheelZoom(1, -48, 0));
  assert.equal(wheelZoom(1, 1, 1), wheelZoom(1, 16, 0));
});

test("the wheel stops at the limits", () => {
  assert.equal(wheelZoom(ZOOM_MAX, -100, 0), ZOOM_MAX);
  assert.equal(wheelZoom(ZOOM_MIN, 100, 0), ZOOM_MIN);
});

test("a canvas taller than its box fits by height", () => {
  assert.equal(
    fitZoom({ width: 600, height: 2600 }, { width: 900, height: 650 }),
    0.25,
  );
});

test("a canvas wider than its box fits by width", () => {
  assert.equal(
    fitZoom({ width: 6000, height: 450 }, { width: 1200, height: 700 }),
    0.2,
  );
});

test("a canvas that already fits is not enlarged to fill the box", () => {
  assert.equal(
    fitZoom({ width: 300, height: 200 }, { width: 900, height: 700 }),
    1,
  );
});

test("a canvas too large to fit whole stops at the smallest zoom", () => {
  assert.equal(
    fitZoom({ width: 60000, height: 450 }, { width: 390, height: 700 }),
    ZOOM_MIN,
  );
});
