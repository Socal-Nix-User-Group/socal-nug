import test from "node:test";
import assert from "node:assert/strict";
import { parseFuzzyDate } from "../src/dates.ts";
import { assignLanes, buildBraid } from "../src/layout.ts";
import type { Braid, Moment, Person } from "../src/types.ts";

function person(slug: string, member = true): Person {
  return {
    slug,
    name: slug,
    alias: `@${slug}`,
    description: "",
    imageUrl: "",
    profileUrl: "",
    member,
  };
}

function at(
  id: string,
  date: string,
  people: string[],
  trunk = false,
): Moment {
  return { id, date: parseFuzzyDate(date), title: id, people, trunk };
}

const PEOPLE = new Map(
  ["daniel", "rok", "david", "rob", "tristan", "kyle"].map((s) => [
    s,
    person(s, s !== "rok"),
  ]),
);

// Mirrors the real story: personal roots, convergence at SCaLE, the spine
// starting at the founding, a join, then an excursion that recruits.
const STORY: Moment[] = [
  at("daniel-nix", "2021-10-23", ["daniel"]),
  at("tweag", "2022-02-21", ["daniel"]),
  at("meets-rok", "2022-03", ["daniel", "rok"]),
  at("code-and-coffee", "2022-08-27", ["daniel", "david"]),
  at("scale-20x", "2023-03", ["daniel", "rob", "david"]),
  at("snug-founded", "2023-04", ["daniel", "david", "rob"], true),
  at("nug3", "2023-09-19", ["tristan"], true),
  at("nix-camp", "2023-10", ["daniel", "rob", "david", "kyle"]),
  at("nug4", "2024-01-25", [], true),
];

const braid: Braid = buildBraid(STORY, PEOPLE);
const lanes = assignLanes(STORY);

const placed = (id: string) => braid.moments.find((m) => m.moment.id === id)!;
const thread = (slug: string) =>
  braid.threads.find((t) => t.person.slug === slug)!;
const trunkFrom = (id: string) =>
  braid.trunk.find((s) => s.from.moment.id === id)!;

// --- lanes ------------------------------------------------------------------

test("columns are handed out from the spine outward as people appear", () => {
  assert.equal(lanes.get("daniel"), -1);
  assert.equal(lanes.get("rok"), -2);
});

test("a column freed by a merge is reused", () => {
  // Starting columns are held for good, but merge and excursion columns are
  // still recycled, which is what keeps the middle of the picture from
  // marching outward one column per event.
  const merge = placed("code-and-coffee").lane;
  const excursion = braid.excursions.find((e) =>
    e.moment.moment.id === "nix-camp"
  )!.lane;
  assert.equal(excursion, merge);
});

test("people who arrive after the spine take the other side of it", () => {
  assert.ok(lanes.get("tristan")! > 0);
  assert.ok(lanes.get("kyle")! > 0);
  assert.ok(lanes.get("daniel")! < 0);
});

test("a trunk moment sits at lane 0", () => {
  assert.equal(placed("snug-founded").lane, 0);
  assert.equal(placed("nug3").lane, 0);
});

// --- merging ----------------------------------------------------------------
// Nobody owns a shared moment. Two people who carry on together afterwards
// both move to a new lane between them, so neither reads as the axis the
// other joined.

test("two people who continue together merge into a column of their own", () => {
  // Not a column between them: every starting column is spoken for, so the
  // merge takes the innermost one that is neither held nor somebody's start.
  const lane = placed("code-and-coffee").lane;
  assert.equal(lane, -4);
  assert.notEqual(lane, lanes.get("daniel"));
  assert.notEqual(lane, lanes.get("david"));
  assert.ok(![...lanes.values()].includes(lane));
});

test("every lane is a whole column, never a fraction", () => {
  // averaging two lanes on a merge meant nobody ever shared a column and
  // every line was its own diagonal
  for (const moment of braid.moments) {
    assert.ok(
      Number.isInteger(moment.lane),
      `${moment.moment.id} sits at ${moment.lane}`,
    );
  }
});

test("a merged lane belongs to neither person who made it", () => {
  const merged = placed("code-and-coffee").lane;
  assert.notEqual(merged, lanes.get("daniel"));
  assert.notEqual(merged, lanes.get("david"));
  for (const slug of ["daniel", "david"]) {
    const points = thread(slug).segments[0].points;
    assert.ok(points.some((p) => p.lane === merged), slug);
  }
});

test("nobody runs straight through the pre-convergence half", () => {
  // the bug this replaced: the most senior participant kept their lane, so
  // their line was straight and everyone else bent into it. Trunk moments are
  // excluded, since every thread changes lane on reaching the spine.
  for (const slug of ["daniel", "david"]) {
    const seen = new Set(
      thread(slug).segments[0].points
        .filter((p) => !p.moment.trunk)
        .map((p) => p.lane),
    );
    assert.ok(
      seen.size > 1,
      `${slug} holds one lane throughout, so it reads as the axis`,
    );
  }
});

test("a one-off guest bends in without moving the lane they join", () => {
  // rok appears once and does not carry on, so merging would yank daniel's
  // lane for an encounter that went nowhere
  assert.equal(placed("meets-rok").lane, lanes.get("daniel"));
  assert.equal(thread("rok").lane, lanes.get("rok"));
});

// --- spacing ----------------------------------------------------------------

test("moments are evenly spaced by rank, not by elapsed time", () => {
  const ts = buildBraid(
    [
      at("a", "2021", ["daniel"]),
      at("b", "2021-02", ["daniel"]),
      at("c", "2026", ["daniel"], true),
    ],
    PEOPLE,
  ).moments.map((m) => m.t);
  assert.deepEqual(ts, [0, 0.5, 1]);
});

test("a single moment produces finite coordinates", () => {
  const one = buildBraid([at("only", "2021", ["daniel"], true)], PEOPLE);
  assert.equal(one.moments[0].t, 0.5);
});

test("moments sharing one date are ordered by id and still evenly spaced", () => {
  const same = buildBraid(
    [
      at("zebra", "2021-01-01", ["daniel"]),
      at("alpha", "2021-01-01", ["daniel"]),
      at("later", "2023-01-01", ["daniel"], true),
    ],
    PEOPLE,
  );
  assert.deepEqual(
    same.moments.map((m) => m.moment.id),
    ["alpha", "zebra", "later"],
  );
  assert.deepEqual(same.moments.map((m) => m.t), [0, 0.5, 1]);
});

// --- threads ----------------------------------------------------------------

test("a thread's approach segment visits its moments in date order", () => {
  const approach = thread("daniel").segments.find(
    (s) => s.kind === "approach",
  )!;
  assert.deepEqual(
    approach.points.map((p) => p.moment.id),
    ["daniel-nix", "tweag", "meets-rok", "code-and-coffee", "scale-20x", "snug-founded"],
  );
});

test("a thread merges into the trunk at its first trunk moment", () => {
  assert.equal(thread("daniel").joinsTrunkAt, "snug-founded");
  assert.equal(thread("tristan").joinsTrunkAt, "nug3");
});

test("a thread with no own-lane moments still originates in its own lane", () => {
  const rok = thread("rok");
  assert.equal(rok.lane, lanes.get("rok"));
  const approach = rok.segments.find((s) => s.kind === "approach")!;
  assert.ok(approach.points.length >= 1);
  // its one moment sits in daniel's lane, which is why the thread's own lane
  // has to be carried separately
  assert.equal(approach.points[0].lane, lanes.get("daniel"));
});

test("a person with no trunk moment never joins", () => {
  assert.equal(thread("rok").joinsTrunkAt, null);
});

test("a person whose only moment is a join gets a short valid thread", () => {
  const t = thread("tristan");
  const approach = t.segments.find((s) => s.kind === "approach")!;
  assert.equal(approach.points.length, 1);
  assert.equal(t.joinsTrunkAt, "nug3");
  assert.ok(Number.isFinite(approach.points[0].t));
});

// --- trunk ------------------------------------------------------------------

test("trunk thickness counts distinct people joined so far", () => {
  assert.equal(trunkFrom("snug-founded").joined, 3);
  assert.equal(trunkFrom("nug3").joined, 4);
});

test("a future-dated trunk moment does not inflate earlier thickness", () => {
  const withFuture = buildBraid(
    [...STORY, at("nug99", "2030-01-01", ["rok"], true)],
    PEOPLE,
  );
  const seg = withFuture.trunk.find((s) => s.from.moment.id === "snug-founded")!;
  assert.equal(seg.joined, 3);
});

// --- excursions -------------------------------------------------------------

test("a non-trunk moment after the trunk start is an excursion", () => {
  const e = braid.excursions.find((x) => x.moment.moment.id === "nix-camp")!;
  assert.deepEqual([...e.leaves].sort(), ["daniel", "david", "rob"]);
});

test("a non-trunk moment before the trunk start is not an excursion", () => {
  assert.equal(
    braid.excursions.some((x) => x.moment.moment.id === "scale-20x"),
    false,
  );
});

test("an excursion gives each leaver a second drawn segment", () => {
  assert.equal(
    thread("rob").segments.filter((s) => s.kind === "excursion").length,
    1,
  );
});

test("an excursion sits clear of the lanes late joiners arrive on", () => {
  // excursions happen after the spine starts, by which point the
  // pre-convergence side is empty, so that is where they go. Allocating on
  // the joiner side made the departure curve cross incoming threads and their
  // root avatars.
  const e = braid.excursions.find((x) => x.moment.moment.id === "nix-camp")!;
  assert.ok(e.lane < 0, `excursion at ${e.lane} should be on the vacated side`);
  for (const [slug, lane] of lanes) {
    if (lane > 0) {
      assert.notEqual(e.lane, lane, `${slug} shares the excursion lane`);
    }
  }
});

test("an excursion sits off the spine, not at lane 0", () => {
  const e = braid.excursions.find((x) => x.moment.moment.id === "nix-camp")!;
  assert.notEqual(e.lane, 0);
  assert.equal(e.moment.lane, e.lane);
});

test("an excursion departs at the previous trunk moment and rejoins at the next", () => {
  const e = braid.excursions.find((x) => x.moment.moment.id === "nix-camp")!;
  assert.equal(e.from.moment.id, "nug3");
  assert.equal(e.to!.moment.id, "nug4");
});

test("an excursion with no trunk moment after it stays open", () => {
  const open = buildBraid(
    [
      at("root", "2021", ["daniel"]),
      at("founded", "2023-04", ["daniel", "rob"], true),
      at("recent", "2023-10", ["daniel", "rob"]),
    ],
    PEOPLE,
  );
  assert.equal(open.excursions[0].to, null);
});

test("an excursion names who was there but not yet in the group", () => {
  // recruits are still identified, because the drawing needs to know who
  // arrives from outside. What it no longer does is treat that as a join.
  const e = braid.excursions.find((x) => x.moment.moment.id === "nix-camp")!;
  assert.deepEqual([...e.recruits], ["kyle"]);
  assert.equal(thread("kyle").joinsTrunkAt, null);
});

test("being at an excursion never grants a join", () => {
  // a join comes from a trunk moment naming you. Inferring one from company
  // kept at a camp is a guess about meetup attendance, and it is how two
  // people ended up with join dates they had never earned.
  const early = buildBraid(
    [
      at("tweag", "2021-01", ["daniel", "rok"]),
      at("founded", "2023-04", ["daniel"], true),
      at("camp", "2024-01", ["daniel", "rok"]),
      at("nug", "2024-06", [], true),
    ],
    PEOPLE,
  );
  const e = early.excursions[0];
  assert.deepEqual([...e.leaves], ["daniel"]);
  assert.deepEqual([...e.recruits], ["rok"]);
  assert.equal(
    early.threads.find((t) => t.person.slug === "rok")!.joinsTrunkAt,
    null,
    "rok was never recorded at a trunk moment, so he has not joined one",
  );
});

test("a join record is what puts somebody on the spine", () => {
  const joined = buildBraid(
    [
      at("tweag", "2021-01", ["daniel", "rok"]),
      at("founded", "2023-04", ["daniel"], true),
      at("camp", "2024-01", ["daniel", "rok"]),
      // the join record merges rok into this trunk moment's people
      at("nug", "2024-06", ["rok"], true),
    ],
    PEOPLE,
  );
  assert.equal(
    joined.threads.find((t) => t.person.slug === "rok")!.joinsTrunkAt,
    "nug",
  );
});

test("the trunk thins while people are away", () => {
  assert.equal(trunkFrom("nug3").away, 3);
  assert.equal(trunkFrom("snug-founded").away, 0);
});

test("an excursion avoids a lane a thread is still sitting on", () => {
  // rok never reaches the spine, so he holds his lane the whole way down.
  // Routing an excursion outside him would cross his line on the way out.
  const held = buildBraid(
    [
      at("early", "2021-01", ["daniel", "rok"]),
      at("founded", "2023-04", ["daniel"], true),
      at("camp", "2024-01", ["daniel"]),
      at("nug", "2024-06", [], true),
    ],
    PEOPLE,
  );
  const rokLane = assignLanes([
    at("early", "2021-01", ["daniel", "rok"]),
    at("founded", "2023-04", ["daniel"], true),
    at("camp", "2024-01", ["daniel"]),
    at("nug", "2024-06", [], true),
  ]).get("rok");
  assert.notEqual(held.excursions[0].lane, rokLane);
});

test("an excursion sits as close to the spine as it can", () => {
  // the further out it goes the more threads its departure curve crosses, so
  // it takes the innermost column that is free and not somebody's start
  const e = braid.excursions.find((x) => x.moment.moment.id === "nix-camp")!;
  const starts = new Set(lanes.values());
  for (let lane = -1; lane > e.lane; lane -= 1) {
    assert.ok(
      starts.has(lane),
      `excursion sat at ${e.lane} with ${lane} free and unclaimed`,
    );
  }
});

test("excursion lanes are released and reused by a later excursion", () => {
  const two = buildBraid(
    [
      at("root", "2021", ["daniel"]),
      at("founded", "2023-01", ["daniel", "rob"], true),
      at("camp", "2023-03", ["daniel", "rob"]),
      at("mid", "2023-06", [], true),
      at("conf", "2023-09", ["daniel", "rob"]),
      at("end", "2023-12", [], true),
    ],
    PEOPLE,
  );
  assert.equal(two.excursions.length, 2);
  // the point is that lanes do not march outward one per excursion; a later
  // one sits no further from the spine than an earlier one
  assert.ok(
    Math.abs(two.excursions[1].lane) <= Math.abs(two.excursions[0].lane),
    `${two.excursions[1].lane} is further out than ${two.excursions[0].lane}`,
  );
});

// --- backfill ---------------------------------------------------------------

test("backfilling an earlier root costs no extra starting column", () => {
  // Reserved starting columns mean one column per person and no more, however
  // much history any of them turns out to have. What backfilling does change
  // is the order they are handed out in: an earlier root takes the innermost
  // column and pushes the rest out by one, which can cost the picture a column
  // overall. That is the price of a column meaning one person; before this,
  // columns were recycled and the total never grew, but a face could end up
  // parked on somebody else's line.
  const starts = (moments: Moment[]) => new Set(assignLanes(moments).values());
  const before = starts(STORY);
  const after = starts([at("rob-nix", "2019-04", ["rob"]), ...STORY]);
  assert.equal(after.size, before.size);
  assert.equal(after.size, PEOPLE.size);
});
test("a starting column belongs to one person for the whole picture", () => {
  // A face is drawn a rank ahead of its first moment, in territory the
  // allocator never booked, so a reused starting column parks one person's
  // face on another person's line. Starting columns are therefore held for
  // good; only merge and excursion columns are recycled.
  const used = [...lanes.values()];
  assert.equal(
    new Set(used).size,
    used.length,
    `shared starting column: ${
      [...lanes].map(([s, l]) => `${s}:${l}`).join(" ")
    }`,
  );
});

test("an excursion never lands on somebody's starting column", () => {
  const starts = new Set(lanes.values());
  for (const excursion of braid.excursions) {
    assert.ok(
      !starts.has(excursion.lane),
      `excursion ${excursion.moment.moment.id} took a starting column`,
    );
  }
});

test("a merge never lands on a starting column its people do not own", () => {
  for (const moment of braid.moments) {
    if (moment.moment.trunk || moment.lane === 0) continue;
    const owner = [...lanes].find(([, lane]) => lane === moment.lane);
    if (owner === undefined) continue;
    assert.ok(
      moment.moment.people.includes(owner[0]),
      `${moment.moment.id} sits in ${owner[0]}'s column without them`,
    );
  }
});
