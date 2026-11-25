import test from "node:test";
import assert from "node:assert/strict";
import { labelWidth } from "../src/elk.ts";
import { drawLoom, yearMarks } from "../src/loom-draw.ts";
import { placeLoom, slotKey } from "../src/loom-place.ts";
import type { LoomPlaced, Point } from "../src/loom-place.ts";
import { ease, frameAt, morphBetween, OPENING, scrollFor, sharesOf } from "../src/morph.ts";
import type { Morph } from "../src/morph.ts";
import { flow } from "../src/render.ts";
import { apart, recorder } from "../smoke/inspect.ts";
import type { Recorded } from "../smoke/inspect.ts";
import { fakeLoomLayout } from "./fake-loom-elk.ts";
import { story } from "./story-fixture.ts";

// River centred in a wider box than Subway's, so the two canvases differ in size.
const river = await placeLoom(story, "river", fakeLoomLayout, 800);
const subway = await placeLoom(story, "subway", fakeLoomLayout);

const widths = new Map(
  story.moments.map((g) => [g.moment.id, labelWidth(river.labels.get(g.moment.id)?.text ?? "")]),
);

/** The morph, which the layouts given must pair up for. */
function between(from: LoomPlaced, to: LoomPlaced, labelWidths = widths): Morph {
  const morph = morphBetween(story, from, to, labelWidths);
  assert.ok(morph !== null);
  return morph;
}

const there = between(river, subway);
const back = between(subway, river);

function drawn(placed: LoomPlaced): Recorded[] {
  const { doc, made } = recorder();
  drawLoom(placed, story, doc);
  return made;
}

const hasClass = (n: Recorded, token: string) =>
  (n.attrs.class ?? "").split(" ").includes(token);

const pt = (x: number, y: number): Point => ({ x, y });

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
  const morph = between(from, to);
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

// River can be wider than its box while Subway has nothing to scroll down, and
// a River zoomed out to fit has nothing to scroll at all. A view carried
// through either comes out where it went in.
test("shares: an axis with nowhere to scroll keeps the share the view arrived with", () => {
  const arrived = { along: 0.37, across: 0 };
  assert.deepEqual(sharesOf("subway", pt(450, 0), pt(900, 0), arrived), { along: 0.5, across: 0 });
  assert.deepEqual(sharesOf("river", pt(0, 0), pt(0, 0), arrived), { along: 0.37, across: 0 });
  // an axis that can scroll says where it is, whatever the view arrived with
  assert.deepEqual(sharesOf("river", pt(300, 500), pt(300, 500), arrived), { along: 1, across: 1 });
  // there and back: the left edge of a River wider than its box, through a Subway no taller than its own
  const out = sharesOf("river", pt(0, 185), pt(74, 500));
  const back = sharesOf("subway", scrollFor("subway", out, pt(900, 0)), pt(900, 0), out);
  assert.deepEqual(scrollFor("river", back, pt(74, 500)), pt(0, 185));
});

test("shares: a view opens at the start of the map, with as much out of sight on one side as the other", () => {
  assert.deepEqual(scrollFor("river", OPENING, pt(74, 1970)), pt(37, 0));
  assert.deepEqual(scrollFor("subway", OPENING, pt(4984, 30)), pt(0, 15));
  // and it is what an axis with nowhere to scroll falls back on when no switch has carried the view
  assert.deepEqual(sharesOf("river", pt(0, 0), pt(0, 0)), OPENING);
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

const half = (a: number, b: number) => (a + b) / 2;
const halfPoint = (a: Point, b: Point) => pt(half(a.x, b.x), half(a.y, b.y));
const labelled = story.moments.flatMap((g) => (river.labels.has(g.moment.id) ? [g.moment.id] : []));

test("at 1 each label's text starts where the layout arrived at puts it", () => {
  for (const [morph, to] of [[there, subway], [back, river]] as const) {
    assert.deepEqual(
      frameAt(morph, 1).labels,
      labelled.map((id) => {
        const label = to.labels.get(id)!;
        const width = widths.get(id)!;
        return pt(label.anchor === "end" ? label.x - width : label.x - width / 2, label.y);
      }),
      to.mode,
    );
  }
  // and a label that moves at all, so the ends being right is not an accident
  const end = frameAt(there, 1).labels;
  assert.ok(frameAt(there, 0).labels.every((p, i) => p.x !== end[i].x));
});

test("half way, everything is exactly half way between the two layouts", () => {
  const start = frameAt(there, 0);
  const end = frameAt(there, 1);
  const middle = frameAt(there, 0.5);
  assert.equal(middle.width, half(river.width, subway.width));
  assert.equal(middle.height, half(river.height, subway.height));
  assert.deepEqual(
    [...middle.faces],
    [...river.roots].map(([slug, a]) => [slug, halfPoint(a, subway.roots.get(slug)!)]),
  );
  assert.deepEqual(
    [...middle.boxes],
    [...river.boxes].map(([id, a]) => {
      const b = subway.boxes.get(id)!;
      return [id, {
        x: half(a.x, b.x),
        y: half(a.y, b.y),
        width: half(a.width, b.width),
        height: half(a.height, b.height),
      }];
    }),
  );
  // the boxes change shape on the way, from wide to tall
  assert.notEqual(river.boxes.get("founded")!.width, subway.boxes.get("founded")!.width);
  assert.deepEqual(middle.beads, start.beads.map((a, i) => halfPoint(a, end.beads[i])));
  assert.deepEqual(middle.labels, start.labels.map((a, i) => halfPoint(a, end.labels[i])));
  assert.deepEqual(middle.years, start.years.map((a, i) => halfPoint(a, end.years[i])));
  assert.deepEqual(
    middle.ticks,
    start.ticks.map((a, i) => {
      const b = end.ticks[i];
      return { x1: half(a.x1, b.x1), y1: half(a.y1, b.y1), x2: half(a.x2, b.x2), y2: half(a.y2, b.y2) };
    }),
  );
});

test("a label with no twin in the layout arrived at stays where it is, and the rest still move", () => {
  const unlabelled: LoomPlaced = {
    ...subway,
    labels: new Map([...subway.labels].filter(([id]) => id !== "founded")),
  };
  const morph = between(river, unlabelled);
  const i = labelled.indexOf("founded");
  assert.ok(i >= 0);
  const kept = frameAt(there, 0).labels[i];
  for (const t of [0, 0.5, 1]) assert.deepEqual(frameAt(morph, t).labels[i], kept, `at ${t}`);
  assert.deepEqual(
    frameAt(morph, 1).labels.filter((_, k) => k !== i),
    frameAt(there, 1).labels.filter((_, k) => k !== i),
  );
});

test("layouts that do not pair up are not morphed", () => {
  const without = <T>(map: ReadonlyMap<string, T>, key: string) =>
    new Map([...map].filter(([k]) => k !== key));
  const noEdge: LoomPlaced = { ...river, edges: river.edges.filter((e) => !(e.meta.slug === "rob" && e.from === "nug1")) };
  assert.equal(noEdge.edges.length, river.edges.length - 1);
  const noFace: LoomPlaced = { ...subway, roots: without(subway.roots, "rob") };
  const noBox: LoomPlaced = { ...subway, boxes: without(subway.boxes, "camp") };
  const noSlot: LoomPlaced = { ...subway, slots: without(subway.slots, slotKey("founded", "rob")) };
  for (const [what, one, other] of [
    ["an edge", noEdge, subway],
    ["a face", noFace, river],
    ["a box", noBox, river],
    ["a bead's slot", noSlot, river],
  ] as const) {
    assert.equal(morphBetween(story, one, other, widths), null, `${what} missing from the layout left`);
    assert.equal(morphBetween(story, other, one, widths), null, `${what} missing from the layout arrived at`);
  }
  assert.equal(morphBetween(story, river, subway, without(widths, "founded")), null, "a label with no width");
});
