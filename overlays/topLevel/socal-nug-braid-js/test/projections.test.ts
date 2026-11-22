import test from "node:test";
import assert from "node:assert/strict";
import { projectionFor } from "../src/projections.ts";

const VIEW = { width: 800, height: 600 };
const RANGE: readonly [number, number] = [-4, 3];

const river = projectionFor("river", VIEW, RANGE);
const map = projectionFor("map", VIEW, RANGE);

test("river runs time down the y axis and lanes across x", () => {
  const [, early] = river.project(0, 0);
  const [, late] = river.project(1, 0);
  assert.ok(late > early);
  const [left] = river.project(0.5, -2);
  const [right] = river.project(0.5, 2);
  assert.ok(right > left);
});

test("map runs time along the x axis and lanes down y", () => {
  const [early] = map.project(0, 0);
  const [late] = map.project(1, 0);
  assert.ok(late > early);
  const [, above] = map.project(0.5, -2);
  const [, below] = map.project(0.5, 2);
  assert.ok(below > above);
});

test("the two projections are transposes over the same inputs", () => {
  const samples: Array<[number, number]> = [
    [0, -4],
    [0.25, 0],
    [0.5, 2],
    [0.75, -1],
    [1, 3],
  ];
  const riverTime = samples.map(([t, l]) => river.project(t, l)[1]);
  const mapTime = samples.map(([t, l]) => map.project(t, l)[0]);
  const riverLane = samples.map(([t, l]) => river.project(t, l)[0]);
  const mapLane = samples.map(([t, l]) => map.project(t, l)[1]);
  assert.deepEqual(rank(riverTime), rank(mapTime));
  assert.deepEqual(rank(riverLane), rank(mapLane));
});

function rank(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => sorted.indexOf(v));
}

test("lane 0 is centred on the free axis in both modes", () => {
  assert.equal(river.project(0.5, 0)[0], VIEW.width / 2);
  assert.equal(map.project(0.5, 0)[1], VIEW.height / 2);
});

test("the lane range fits inside the viewport in both modes", () => {
  for (const lane of [-4, 3]) {
    const [x, y] = river.project(0.5, lane);
    assert.ok(x >= 0 && x <= VIEW.width, `river x ${x}`);
    const [mx, my] = map.project(0.5, lane);
    assert.ok(my >= 0 && my <= VIEW.height, `map y ${my}`);
    assert.ok(Number.isFinite(y) && Number.isFinite(mx));
  }
});

test("a range spanning excursion lanes still fits", () => {
  const wide = projectionFor("river", VIEW, [-4, 9]);
  const [x] = wide.project(0.5, 9);
  assert.ok(x >= 0 && x <= VIEW.width, `x ${x}`);
});

test("river puts labels beside a node, map puts them above", () => {
  const beside = river.labelAnchor(0);
  assert.notEqual(beside.dx, 0);
  assert.equal(map.labelAnchor(0).dx, 0);
  assert.ok(map.labelAnchor(0).dy < 0);
});

test("river flips the label side for lanes left of the spine", () => {
  assert.equal(river.labelAnchor(-2).anchor, "end");
  assert.equal(river.labelAnchor(1).anchor, "start");
  assert.ok(river.labelAnchor(-2).dx < 0);
  assert.ok(river.labelAnchor(1).dx > 0);
});

test("the viewBox covers the viewport", () => {
  assert.deepEqual([...river.viewBox], [0, 0, VIEW.width, VIEW.height]);
  assert.deepEqual([...map.viewBox], [0, 0, VIEW.width, VIEW.height]);
});
