import test from "node:test";
import assert from "node:assert/strict";
import { placePopup } from "../src/popup.ts";

// Everything is in the map's own scroll coordinates: `view` is the part of
// the map currently on screen, `anchor` is the thing that was clicked.

const SIZE = { width: 300, height: 120 };
const VIEW = { left: 0, top: 0, width: 850, height: 600 };
const box = (left: number, top: number, size = 36) => ({
  left,
  top,
  width: size,
  height: size,
});

test("a popup opens to the right of what was clicked", () => {
  const at = placePopup(box(100, 300), SIZE, VIEW);
  assert.ok(at.left > 136, `left ${at.left} is not past the anchor`);
  assert.ok(at.left < 160, `left ${at.left} is too far from the anchor`);
});

test("a popup is centred on what was clicked", () => {
  const at = placePopup(box(100, 300), SIZE, VIEW);
  assert.equal(at.top + SIZE.height / 2, 300 + 18);
});

test("a popup flips to the left when the right would leave the screen", () => {
  const at = placePopup(box(700, 300), SIZE, VIEW);
  assert.ok(at.left + SIZE.width <= 700, `left ${at.left} overlaps the anchor`);
  assert.ok(at.left >= 0);
});

test("a popup stays on screen when neither side has room", () => {
  const narrow = { left: 0, top: 0, width: 400, height: 600 };
  const at = placePopup(box(200, 300), SIZE, narrow);
  assert.ok(at.left >= 0, `left ${at.left}`);
  assert.ok(at.left + SIZE.width <= 400, `right edge ${at.left + SIZE.width}`);
});

test("a popup near the bottom is pulled up to stay on screen", () => {
  const at = placePopup(box(100, 580), SIZE, VIEW);
  assert.ok(at.top + SIZE.height <= 600, `bottom ${at.top + SIZE.height}`);
});

test("a popup near the top is pushed down to stay on screen", () => {
  const at = placePopup(box(100, 10), SIZE, VIEW);
  assert.ok(at.top >= 0, `top ${at.top}`);
});

test("the visible area is wherever the map is scrolled to", () => {
  // The same click, with the map panned 500px right and 1000px down, lands
  // the popup in the part of the map that is actually on screen.
  const scrolled = { left: 500, top: 1000, width: 850, height: 600 };
  const at = placePopup(box(600, 1300), SIZE, scrolled);
  assert.ok(at.left >= 500 && at.left + SIZE.width <= 1350, `left ${at.left}`);
  assert.ok(at.top >= 1000 && at.top + SIZE.height <= 1600, `top ${at.top}`);
});

test("a popup taller than the screen pins to the top rather than vanishing", () => {
  const tall = { width: 300, height: 900 };
  const at = placePopup(box(100, 300), tall, VIEW);
  assert.ok(at.top >= 0 && at.top <= 16, `top ${at.top}`);
});
