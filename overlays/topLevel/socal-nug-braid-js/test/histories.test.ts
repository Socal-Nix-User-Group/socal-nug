import test from "node:test";
import assert from "node:assert/strict";
import { parseData } from "../src/parse.ts";
import { buildStory } from "../src/story.ts";
import { history } from "../smoke/histories.ts";

test("the same seed gives the same history", () => {
  assert.deepEqual(history(3, 1), history(3, 1));
});

test("different seeds differ", () => {
  assert.notEqual(
    JSON.stringify(history(1, 1)),
    JSON.stringify(history(2, 1)),
  );
});

test("a history grows by six meetups and two people a year", () => {
  const count = (y: number) => parseData(history(1, y));
  assert.equal(count(0).people.size, 9);
  assert.equal(count(2).people.size, 13);
  assert.equal(count(0).moments.filter((m) => m.trunk).length, 21);
  assert.equal(count(2).moments.filter((m) => m.trunk).length, 33);
});

test("it has a gathering of the whole group that is not a meetup", () => {
  const { people, moments } = parseData(history(1, 1));
  assert.ok(
    buildStory(moments, people).moments.some((g) => g.onRibbon && !g.moment.trunk),
  );
});

test("it has a stretch where everyone is away in two parts", () => {
  for (const years of [0, 1, 2]) {
    const { people, moments } = parseData(history(2, years));
    const { moments: gatherings } = buildStory(moments, people);
    const found = gatherings.some((meetup, i) => {
      if (!meetup.moment.trunk) return false;
      const after = gatherings.slice(i + 1);
      const end = after.findIndex((g) => g.moment.trunk);
      if (end < 0) return false;
      const between = after.slice(0, end).filter((g) => !g.onRibbon);
      const named = new Set(between.flatMap((g) => g.moment.people));
      return (
        between.filter((g) => g.moment.people.length >= 2).length >= 2 &&
        meetup.through.every((p) => named.has(p.slug))
      );
    });
    assert.ok(found, `no such stretch with ${years} years`);
  }
});

test("every date is a month or a day, and every id is its own", () => {
  const raw = history(3, 2) as { moments: { id: string; date: string }[] };
  for (const m of raw.moments) {
    assert.ok(/^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/.test(m.date));
  }
  assert.equal(new Set(raw.moments.map((m) => m.id)).size, raw.moments.length);
});
