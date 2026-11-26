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
  assert.equal(count(0).people.size, 10);
  assert.equal(count(2).people.size, 14);
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

const every = [1, 2, 3].flatMap((seed) =>
  [0, 1, 2].map((years) => {
    const { people, moments } = parseData(history(seed, years));
    return { name: `seed ${seed} +${years}y`, people, moments, story: buildStory(moments, people) };
  })
);

test("every history records a few people there and away at meetups", () => {
  for (const { name, moments } of every) {
    const meetups = moments.filter((m) => m.trunk);
    assert.ok(meetups.filter((m) => m.there !== undefined).length >= 3, name);
    assert.ok(meetups.filter((m) => m.away !== undefined).length >= 3, name);
  }
});

test("every history has a meetup the first person in slot order is away from", () => {
  for (const { name, story } of every) {
    assert.ok(
      story.moments.some((g) => g.moment.trunk && (g.moment.away ?? []).includes(story.order[0])),
      name,
    );
  }
});

test("every history has a meetup with no joiner that the whole group is away from", () => {
  for (const { name, story } of every) {
    assert.ok(
      story.moments.some((g) =>
        g.moment.trunk && g.moment.people.length === 0 && g.inGroup > 0 &&
        g.through.length === g.inGroup && g.through.every((p) => p.away)
      ),
      name,
    );
  }
});

test("every history has one guest, who never joins and is at one or two moments that are not meetups", () => {
  for (const { name, people, story } of every) {
    const guests = [...people.values()].filter((p) => !p.member);
    assert.equal(guests.length, 1, name);
    const thread = story.threads.find((t) => t.person.slug === guests[0].slug)!;
    assert.equal(thread.joinsTrunkAt, null, name);
    assert.ok(thread.path.length === 1 || thread.path.length === 2, name);
    assert.ok(thread.path.every((g) => !g.moment.trunk), name);
  }
});

test("nobody is recorded there or away before the meetup they joined at, or away from it", () => {
  for (const { name, story } of every) {
    const index = new Map(story.moments.map((g, i) => [g.moment.id, i]));
    const joined = new Map(
      story.threads.flatMap((t) =>
        t.joinsTrunkAt === null ? [] : [[t.person.slug, index.get(t.joinsTrunkAt)!] as const]
      ),
    );
    story.moments.forEach((g, i) => {
      const there = g.moment.there ?? [];
      const away = g.moment.away ?? [];
      for (const slug of there) {
        assert.ok(joined.has(slug) && joined.get(slug)! <= i, `${name}: ${slug} there at ${g.moment.id}`);
      }
      for (const slug of away) {
        assert.ok(joined.has(slug) && joined.get(slug)! < i, `${name}: ${slug} away at ${g.moment.id}`);
        assert.ok(!there.includes(slug), `${name}: ${slug} both there and away at ${g.moment.id}`);
      }
    });
  }
});

test("every history has someone away from a moment that is not a meetup, off the ribbon and on it", () => {
  for (const { name, story } of every) {
    const awayFrom = story.moments.filter((g) => !g.moment.trunk && g.through.some((p) => p.away));
    assert.ok(awayFrom.some((g) => !g.onRibbon), `${name}: none off the ribbon`);
    // on the ribbon because of the absence: without whoever is away, the moment
    // would not account for the whole group
    assert.ok(
      awayFrom.some((g) => g.onRibbon && g.through.filter((p) => !p.away).length < g.inGroup),
      `${name}: none on the ribbon`,
    );
  }
});

test("nobody is away from a moment that names them, or from one before their first", () => {
  for (const { name, story } of every) {
    const index = new Map(story.moments.map((g, i) => [g.moment.id, i]));
    const first = new Map(story.threads.map((t) => [t.person.slug, index.get(t.path[0].moment.id)!]));
    story.moments.forEach((g, i) => {
      for (const slug of g.moment.away ?? []) {
        assert.ok(!g.moment.people.includes(slug), `${name}: ${slug} named at and away from ${g.moment.id}`);
        assert.ok(first.get(slug)! < i, `${name}: ${slug} away from ${g.moment.id}, at or before their first`);
      }
    });
  }
});

test("every date is a month or a day, and every id is its own", () => {
  const raw = history(3, 2) as { moments: { id: string; date: string }[] };
  for (const m of raw.moments) {
    assert.ok(/^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/.test(m.date));
  }
  assert.equal(new Set(raw.moments.map((m) => m.id)).size, raw.moments.length);
});
