import test from "node:test";
import assert from "node:assert/strict";
import { projectionFor, riverWidthFor } from "../src/projections.ts";

const VIEW = { width: 800, height: 600 };
const RANGE: readonly [number, number] = [-4, 3];

const river = projectionFor("river", VIEW, RANGE);
const map = projectionFor("subway", VIEW, RANGE);

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

// --- river canvas width ------------------------------------------------------
// River used to take exactly the container's width, so the more columns the
// picture grew the thinner its lanes got, until faces were wider than the gap
// between them. Subway already asks for the canvas it needs and pans; River
// now does the same.

test("river asks for a canvas that gives each lane the step it wants", () => {
  for (const range of [[-7, 4], [-4, 2], [-1, 1]] as const) {
    const width = riverWidthFor(range, 52);
    const projection = projectionFor("river", { width, height: 1600 }, range);
    const step = projection.project(0, 1)[0] - projection.project(0, 0)[0];
    assert.ok(
      step >= 51.5,
      `lanes ${range[0]}..${range[1]} got ${step.toFixed(1)}px, wanted 52`,
    );
  }
});

test("a wider canvas still leaves room for the outermost label", () => {
  const range: readonly [number, number] = [-7, 4];
  const width = riverWidthFor(range, 52);
  const projection = projectionFor("river", { width, height: 1600 }, range);
  assert.ok(projection.showLabels);
  const [outer] = projection.project(0, range[0]);
  const anchor = projection.labelAnchor(range[0]);
  assert.ok(
    outer + anchor.dx - 150 >= 0,
    `outermost label starts at ${outer + anchor.dx - 150}`,
  );
});

test("more columns asks for more canvas, never less", () => {
  assert.ok(riverWidthFor([-7, 4], 52) > riverWidthFor([-2, 1], 52));
});
