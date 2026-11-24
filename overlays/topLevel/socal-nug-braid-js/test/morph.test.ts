import test from "node:test";
import assert from "node:assert/strict";
import { labelWidth } from "../src/elk.ts";
import { drawLoom, yearMarks } from "../src/loom-draw.ts";
import { placeLoom } from "../src/loom-place.ts";
import type { LoomPlaced, Point } from "../src/loom-place.ts";
import { ease, frameAt, morphBetween, scrollFor, sharesOf } from "../src/morph.ts";
import { flow } from "../src/render.ts";
import { recorder, sample } from "../smoke/inspect.ts";
import type { Recorded } from "../smoke/inspect.ts";
import { fakeLoomLayout } from "./fake-loom-elk.ts";
import { story } from "./story-fixture.ts";

// River centred in a wider box than Subway's, so the two canvases differ in size.
const river = await placeLoom(story, "river", fakeLoomLayout, 800);
const subway = await placeLoom(story, "subway", fakeLoomLayout);

const widths = new Map(
  story.moments.map((g) => [g.moment.id, labelWidth(river.labels.get(g.moment.id)?.text ?? "")]),
);

const there = morphBetween(story, river, subway, widths);
const back = morphBetween(story, subway, river, widths);

function drawn(placed: LoomPlaced): Recorded[] {
  const { doc, made } = recorder();
  drawLoom(placed, story, doc);
  return made;
}

const hasClass = (n: Recorded, token: string) =>
  (n.attrs.class ?? "").split(" ").includes(token);

const pt = (x: number, y: number): Point => ({ x, y });

/** Every point of a path's line, closely spaced, one list for each stretch. */
function line(d: string): Array<Array<readonly [number, number]>> {
  const stretches: Array<Array<readonly [number, number]>> = [];
  let out: Array<readonly [number, number]> = [];
  let cur: readonly [number, number] = [0, 0];
  for (const part of d.match(/[MC][^MC]*/g) ?? []) {
    const v = part.slice(1).trim().split(/[\s,]+/).map(Number);
    if (part[0] === "M") {
      cur = [v[0], v[1]];
      out = [cur];
      stretches.push(out);
      continue;
    }
    for (let seg = 0; seg + 6 <= v.length; seg += 6) {
      const [x1, y1, x2, y2, x3, y3] = v.slice(seg, seg + 6);
      for (let i = 1; i <= 200; i += 1) {
        const k = i / 200;
        const u = 1 - k;
        out.push([
          u * u * u * cur[0] + 3 * u * u * k * x1 + 3 * u * k * k * x2 + k * k * k * x3,
          u * u * u * cur[1] + 3 * u * u * k * y1 + 3 * u * k * k * y2 + k * k * k * y3,
        ]);
      }
      cur = [x3, y3];
    }
  }
  return stretches;
}

/** How far a point is from the segment between two others. */
function toSegment(
  [x, y]: readonly [number, number],
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const k = length === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / length));
  return Math.hypot(x - (ax + k * dx), y - (ay + k * dy));
}

/** The furthest any sampled point of one path is from the other's line, both ways. */
function apart(a: string, b: string): number {
  const off = (from: string, to: string) => {
    const stretches = line(to);
    return Math.max(
      ...sample(from).map((p) => {
        let best = Infinity;
        for (const dense of stretches) {
          for (let i = 1; i < dense.length; i += 1) best = Math.min(best, toSegment(p, dense[i - 1], dense[i]));
        }
        return best;
      }),
    );
  };
  return Math.max(off(a, b), off(b, a));
}

const moves = (d: string) => d.match(/M/g)?.length ?? 0;
const cubics = (d: string) => (d.match(/[MC][^MC]*/g) ?? [])
  .filter((part) => part[0] === "C")
  .reduce((n, part) => n + part.slice(1).trim().split(/[\s,]+/).length / 6, 0);

function ticksDrawn(made: Recorded[]) {
  return made.filter((n) => hasClass(n, "origins-year-tick")).map((n) => {
    const [x1, y1, x2, y2] = n.attrs.d.slice(1).split(/[\sL,]+/).map(Number);
    return { x1, y1, x2, y2 };
  });
}

const yearsDrawn = (made: Recorded[]) =>
  made.filter((n) => n.tag === "text" && hasClass(n, "origins-year")).map((n) => pt(+n.attrs.x, +n.attrs.y));

test("at 0 everything is where the layout being left has it, and at 1 where the one arrived at has it", () => {
  assert.notEqual(river.width, subway.width);
  for (const [t, placed] of [[0, river], [1, subway]] as const) {
    const frame = frameAt(there, t);
    assert.equal(frame.width, placed.width);
    assert.equal(frame.height, placed.height);
    assert.deepEqual([...frame.faces], [...placed.roots].map(([k, p]) => [k, pt(p.x, p.y)]));
    assert.deepEqual(
      [...frame.boxes],
      [...placed.boxes].map(([k, b]) => [k, { x: b.x, y: b.y, width: b.width, height: b.height }]),
    );
    const marks = yearMarks(placed, story);
    assert.deepEqual(frame.ticks, marks.ticks);
    assert.deepEqual(frame.years, marks.labels.map((l) => pt(l.x, l.y)));
    const made = drawn(placed);
    assert.deepEqual(
      frame.beads,
      made.filter((n) => n.tag === "circle" && hasClass(n, "origins-bead")).map((n) => pt(+n.attrs.cx, +n.attrs.cy)),
    );
  }
});

test("at 0 the beads, labels, ticks and years are what drawLoom draws for the layout being left", () => {
  for (const [morph, placed] of [[there, river], [back, subway]] as const) {
    const frame = frameAt(morph, 0);
    const made = drawn(placed);
    assert.deepEqual(
      frame.beads,
      made.filter((n) => n.tag === "circle" && hasClass(n, "origins-bead")).map((n) => pt(+n.attrs.cx, +n.attrs.cy)),
    );
    const labels = made.filter((n) => hasClass(n, "origins-label"));
    assert.ok(labels.length > 0);
    // drawLoom rounds where a label hangs to two decimals
    const expected = labels.map((n) => {
      const width = widths.get(story.moments.find((g) => g.moment.title === n.text)!.moment.id)!;
      const x = +n.attrs.x;
      return pt(n.attrs["text-anchor"] === "end" ? x - width : x - width / 2, +n.attrs.y);
    });
    assert.equal(frame.labels.length, expected.length, placed.mode);
    frame.labels.forEach((p, i) => {
      assert.ok(
        Math.abs(p.x - expected[i].x) <= 0.005 && Math.abs(p.y - expected[i].y) <= 0.005,
        `${placed.mode} label ${i}: ${p.x},${p.y} is not ${expected[i].x},${expected[i].y}`,
      );
    });
    assert.deepEqual(frame.ticks, ticksDrawn(made));
    assert.deepEqual(frame.years, yearsDrawn(made));
  }
});

test("a thread at 0 traces the line drawLoom draws for the layout being left, and at 1 the one arrived at", () => {
  const pathOf = (made: Recorded[], slug: string) =>
    made.find((n) => hasClass(n, "origins-thread") && n.attrs["data-person"] === slug)!.attrs.d;
  const left = drawn(river);
  const arrived = drawn(subway);
  for (const thread of story.threads) {
    const slug = thread.person.slug;
    assert.ok(apart(frameAt(there, 0).threads.get(slug)!, pathOf(left, slug)) < 0.05, `${slug} at 0`);
    assert.ok(apart(frameAt(there, 1).threads.get(slug)!, pathOf(arrived, slug)) < 0.05, `${slug} at 1`);
  }
});

test("an edge with two points in one mode and four in the other has as many curves in both, and the cut one draws the same line", () => {
  const edge = river.edges.find((e) => e.meta.slug === "daniel" && e.from === "founded")!;
  const twin = subway.edges.find((e) => e.meta.slug === "daniel" && e.from === "founded")!;
  const two = [edge.points[0], edge.points.at(-1)!];
  const four = twin.points.slice(0, 4);
  const from: LoomPlaced = { ...river, edges: [{ ...edge, points: two }] };
  const to: LoomPlaced = { ...subway, edges: [{ ...twin, points: four }] };
  const morph = morphBetween(story, from, to, widths);
  const start = frameAt(morph, 0).threads.get("daniel")!;
  const end = frameAt(morph, 1).threads.get("daniel")!;
  assert.equal(cubics(start), 3);
  assert.equal(cubics(end), 3);
  assert.ok(apart(start, flow(two.map((p) => [p.x, p.y] as const), "y")) < 0.05);
  assert.ok(apart(end, flow(four.map((p) => [p.x, p.y] as const), "x")) < 0.05);
});

test("someone away from a meetup has their thread broken there all the way, never joined across it", () => {
  const drawnMoves = (placed: LoomPlaced) =>
    moves(drawn(placed).find((n) => hasClass(n, "origins-thread") && n.attrs["data-person"] === "rob")!.attrs.d);
  assert.equal(drawnMoves(river), 2);
  assert.equal(drawnMoves(subway), 2);
  const into = (p: LoomPlaced) => p.edges.find((e) => e.meta.slug === "rob" && e.to === "nug3")!.points.at(-1)!;
  const out = (p: LoomPlaced) => p.edges.find((e) => e.meta.slug === "rob" && e.from === "nug3")!.points[0];
  const r = (n: number) => Math.round(n * 100) / 100;
  for (const t of [0, 0.5, 1]) {
    const d = frameAt(there, t).threads.get("rob")!;
    assert.equal(moves(d), 2, `at ${t}`);
    // the second stretch starts where the edge out of nug3 starts, and the
    // first ends where the edge into it ends, both part of the way across
    const [first, second] = d.split("M").slice(1);
    const nums = first.trim().split(/[\s,C]+/).filter((s) => s !== "").map(Number);
    const between = (a: Point, b: Point) => [r(a.x * (1 - t) + b.x * t), r(a.y * (1 - t) + b.y * t)];
    assert.deepEqual(nums.slice(-2), between(into(river), into(subway)), `end at ${t}`);
    assert.deepEqual(second.trim().split(/[\s,C]+/).slice(0, 2).map(Number), between(out(river), out(subway)), `start at ${t}`);
  }
});

test("ease starts at 0, is halfway at the middle, ends at 1, and never goes back", () => {
  assert.equal(ease(0), 0);
  assert.equal(ease(0.5), 0.5);
  assert.equal(ease(1), 1);
  for (let i = 1; i <= 100; i += 1) assert.ok(ease(i / 100) >= ease((i - 1) / 100));
});

test("shares: the start is 0 and the end is 1 along time, which is y in River and x in Subway", () => {
  const reach = pt(300, 500);
  assert.deepEqual(sharesOf("river", pt(0, 0), reach), { along: 0, across: 0 });
  assert.deepEqual(sharesOf("river", pt(300, 500), reach), { along: 1, across: 1 });
  assert.deepEqual(sharesOf("subway", pt(150, 0), reach), { along: 0.5, across: 0 });
  assert.deepEqual(sharesOf("subway", pt(0, 250), reach), { along: 0, across: 0.5 });
  // the start lands at the start of the other mode, the end at its full reach along time
  assert.deepEqual(scrollFor("subway", { along: 0, across: 0 }, pt(900, 40)), pt(0, 0));
  assert.deepEqual(scrollFor("subway", { along: 1, across: 0.5 }, pt(900, 40)), pt(900, 20));
  assert.deepEqual(scrollFor("river", { along: 1, across: 0.5 }, pt(40, 900)), pt(20, 900));
});

test("shares: nothing to scroll along is the start, nothing across is the middle, and past the end is the end", () => {
  assert.deepEqual(sharesOf("river", pt(0, 0), pt(0, 0)), { along: 0, across: 0.5 });
  assert.deepEqual(sharesOf("subway", pt(0, 0), pt(0, 0)), { along: 0, across: 0.5 });
  assert.deepEqual(sharesOf("river", pt(400, 800), pt(300, 500)), { along: 1, across: 1 });
  assert.deepEqual(sharesOf("river", pt(-5, -5), pt(300, 500)), { along: 0, across: 0 });
  assert.deepEqual(scrollFor("river", { along: 0, across: 0.5 }, pt(0, 0)), pt(0, 0));
});

test("year marks are the lines and labels drawLoom draws, in both modes", () => {
  // what drawLoom drew for the fixture before the marks were worked out on their own
  assert.deepEqual(yearMarks(river, story), {
    ticks: [{ x1: 0, y1: 82, x2: 800, y2: 82 }, { x1: 0, y1: 332, x2: 800, y2: 332 }],
    labels: [{ x: 6, y: 20, text: "2018" }, { x: 6, y: 77, text: "2023" }, { x: 6, y: 327, text: "2024" }],
  });
  assert.deepEqual(yearMarks(subway, story), {
    ticks: [{ x1: 117, y1: 0, x2: 117, y2: 480 }, { x1: 227, y1: 0, x2: 227, y2: 480 }],
    labels: [{ x: 6, y: 20, text: "2018" }, { x: 123, y: 20, text: "2023" }, { x: 233, y: 20, text: "2024" }],
  });
  for (const placed of [river, subway]) {
    const made = drawn(placed);
    const marks = yearMarks(placed, story);
    assert.deepEqual(ticksDrawn(made), marks.ticks);
    const texts = made.filter((n) => n.tag === "text" && hasClass(n, "origins-year"));
    assert.deepEqual(texts.map((n) => ({ x: +n.attrs.x, y: +n.attrs.y, text: n.text })), marks.labels);
    assert.ok(texts.every((n) => n.attrs["text-anchor"] === "start"));
    assert.deepEqual(
      made.filter((n) => hasClass(n, "origins-year-tick")).map((n) => n.attrs.d),
      marks.ticks.map((t) => `M${t.x1},${t.y1} L${t.x2},${t.y2}`),
    );
  }
});
