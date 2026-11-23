# Origins Loom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Origins page's trunk drawing with the Loom: one unbroken thread per person,
each moment an oval as wide as the people through it, laid out by ELK with a fixed slot per
person.

**Architecture:** The new engine is built beside the old one in new modules (`story.ts`,
`loom-graph.ts`, `loom-place.ts`, `loom-draw.ts`), each tested on its own, while the page keeps
running the old one. One task switches the page over, the next deletes the trunk engine. The
unsolved risk, holding the ribbon of threads to one column as the group grows, is attempted in
Task 6, before any drawing, against histories generated from fixed seeds; it carries a stop
rule.

**Tech Stack:** TypeScript checked by `tsc --strict`, compiled by esbuild, tested with
`node:test`; elkjs 0.12.1 (vendored); Zola and Tera; Python for the data validator; Nix for every
command.

**Spec:** `docs/superpowers/specs/2026-11-22-origins-loom-design.md`. Read it first. Its section
"What the sketch did" records the ELK graph that produced every number below.

## Global Constraints

- Work in the worktree `.claude/worktrees/how-we-met`, branch `worktree-how-we-met`. Do not push.
- No npm, no `package.json`. Tools come from the flake: `nix shell --inputs-from . nixpkgs#nodejs`.
- `static/js/vendor/elk.bundled.js` is not edited.
- `static/js/braid.js` is the committed bundle. Whenever `src/main.ts` or anything it imports
  changes: `nix build .#socal-nug-braid-js --no-link --print-out-paths`, then copy that path's
  `braid.js` over `static/js/braid.js`. `braid-bundle-fresh` fails otherwise.
- The flake sees tracked files only: `git add` new files before any `nix build` or
  `nix flake check`.
- Attendance is never inferred. A bead exists only where the story's `vouched` is true.
- `nix flake check -L` passes at the end of every task.
- Commits: plain engineer voice, no em dashes, what changed and why, once. Last line of every
  message: `Assisted-by: Claude Code (<your model id>)`. Never `Co-Authored-By`.
- Run one plain command per shell call; the worktree sandbox refuses compound commands that
  contain `git`.

Commands used throughout:

| What          | Command                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| one test file | `nix shell --inputs-from . nixpkgs#nodejs -c node --test overlays/topLevel/socal-nug-braid-js/test/NAME.test.ts` |
| typecheck     | `nix build .#checks.x86_64-linux.braid-types -L`                                                                 |
| smoke         | `nix build .#checks.x86_64-linux.braid-smoke -L`                                                                 |
| validator     | `nix build .#checks.x86_64-linux.braid-data -L`                                                                  |
| everything    | `nix flake check -L`                                                                                             |
| browser       | `nix run .#socal-nug-braid-browser`                                                                              |

Paths below are relative to `overlays/topLevel/socal-nug-braid-js/` unless they start with
another top-level directory.

## Review Focus

Inputs the spec implies and a reader of the page would meet. Each has a test in the task named.

1. A meetup every member is recorded away from: an oval of gaps, drawn, with no thread through
   it and no crash. Tasks 2, 3, 7.
1. Someone named in moments who never joins: a thread through those moments only, slotted after
   the members where the whole group gathers, never part of the ribbon. Tasks 2, 3.
1. Two moments on one date, one of them a meetup: ordered by id, and a person through both gets
   one hop between them. Task 2.
1. A person whose first moment is the meetup they join at: their face leads straight into that
   oval, with a gold bead. Tasks 2, 3, 7.
1. The first person in slot order recorded away: slot 0 is empty, and the ribbon is still
   measured and held by where slot 0 is. Tasks 2, 5, 6.

______________________________________________________________________

### Task 1: Attendance reaches the engine

**Files:**

- Modify: `overlays/topLevel/socal-nug-braid-data/verify_moments.py`
- Create: `overlays/topLevel/socal-nug-braid-data/tests/attendance-{valid,unknown-slug,on-dated,both,before-join,no-join,away-at-join}.toml`
- Modify: `checks/default.nix` (the `braid-data` check)
- Modify: `templates/origins.html`
- Modify: `src/types.ts`, `src/parse.ts`, `test/parse.test.ts`
- Modify: `overlays/topLevel/socal-nug-test-site/test_site.py`

**Interfaces:**

- Produces: `Moment.there?: readonly string[]` and `Moment.away?: readonly string[]` in
  `src/types.ts`, `undefined` when absent or empty, like `links`. The page's JSON gives every
  meetup `"there"` and `"away"` arrays.

- [ ] **Step 1: Write the fixtures.** Every fixture starts from this base and adds the record
  shown:

```toml
[[moment]]
id = "root"
date = "2021-01-01"
title = "Root"
people = ["daniel-baker"]

[[moment]]
id = "founded"
date = "2023-04"
title = "Founded"
people = ["daniel-baker", "rob-hernandez"]
trunk = true

[[moment]]
id = "jared-joins"
event = "2023-07-08"
people = ["jared-baur"]
```

| Fixture                   | Added                                                                                     | Must mention                       |
| ------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------- |
| `attendance-valid`        | `id="roll" event="2023-09-19" there=["daniel-baker","jared-baur"] away=["rob-hernandez"]` | clean                              |
| `attendance-unknown-slug` | `id="roll" event="2023-09-19" there=["nobody-here"]`                                      | `nobody-here`                      |
| `attendance-on-dated`     | `there = ["daniel-baker"]` on the `root` record                                           | `anchored to an event`             |
| `attendance-both`         | two records at `2023-09-19`: `there=["daniel-baker"]`, and `away=["daniel-baker"]`        | `both there and away`              |
| `attendance-before-join`  | `id="roll" event="2023-05-30" there=["jared-baur"]`                                       | `before the meetup they joined at` |
| `attendance-no-join`      | `id="roll" event="2023-09-19" there=["tristan-ross"]`                                     | `has no join record`               |
| `attendance-away-at-join` | `id="roll" event="2023-07-08" away=["jared-baur"]`                                        | `recorded away from`               |

- [ ] **Step 2: Add them to `braid-data` in `checks/default.nix`**, one `expect_fail FILE 'SUBSTRING'`
  per row and `expect_clean attendance-valid.toml`. `git add` the fixtures.

- [ ] **Step 3: Run the validator check and watch it fail.** Expected: `attendance-unknown-slug.toml was accepted but should have been rejected`.

- [ ] **Step 4: Implement in `verify_moments.py`.** `check_people` also checks slugs in `there`
  and `away`. Add `check_attendance(entries)` as a last class of checks, after `check_links`. A
  person's join is the earliest record, by the existing `when()`, that names them in `people` and
  is either anchored to an event or marked `trunk`. Rules and messages, each naming the record's
  `id`: the five in the spec's "Attendance data", with the substrings in the table above.

- [ ] **Step 5: Run it again.** Expected: every line `ok (rejected)` or `ok (clean)`.

- [ ] **Step 6: Write the failing parse tests** in `test/parse.test.ts`:

```ts
test("a meetup's attendance lists come through", () => {
  const { moments } = parseData({ people: [], moments: [{ id: "m", date: "2024-06-01", title: "M", people: [], trunk: true, there: ["a"], away: ["b"] }] });
  assert.deepEqual(moments[0].there, ["a"]);
  assert.deepEqual(moments[0].away, ["b"]);
});
test("absent and empty attendance lists come back undefined", () => {
  const { moments } = parseData({ people: [], moments: [{ id: "m", date: "2024", title: "M", there: [] }] });
  assert.equal(moments[0].there, undefined);
  assert.equal(moments[0].away, undefined);
});
test("an attendance list that is not a list of slugs is rejected, naming the moment", () => {
  assert.throws(() => parseData({ people: [], moments: [{ id: "m", date: "2024", title: "M", away: [3] }] }), /moment m: away/);
});
```

- [ ] **Step 7: Run them, watch them fail, then add the two optional fields to `Moment` and read
  them in `toMoment`.** Run again: pass.

- [ ] **Step 8: Template.** In `templates/origins.html`, in the loop over meetups, collect `there`
  and `away` from anchored records the way `joiners` is collected, read `m.people` with
  `default(value=[])` (an attendance-only record has none), and emit `"there": [...]` and
  `"away": [...]` after `"people"`.

- [ ] **Step 9: Site test.** Add to `test_site.py`, run `nix flake check -L`, expect all green:

```python
def test_origins_meetups_carry_attendance_lists(self):
    _, data = self.origins_data()
    meetups = [m for m in data['moments'] if m.get('permalink')]
    self.assertGreaterEqual(len(meetups), 20)
    for m in meetups:
        self.assertIsInstance(m['there'], list, m['id'])
        self.assertIsInstance(m['away'], list, m['id'])
```

- [ ] **Step 10: Commit.** `data: a meetup can record who was there and who was not`

______________________________________________________________________

### Task 2: The story

**Files:**

- Create: `src/story.ts`, `test/story.test.ts`, `test/story-fixture.ts`

**Interfaces:**

- Consumes: `Moment`, `Person` from `src/types.ts`.
- Produces, from `src/story.ts`:

```ts
/** One person at one moment. */
export interface Passage {
  readonly slug: string;
  /** Their position across the moment, counted from 0. */
  readonly slot: number;
  /** The record says they were there. */
  readonly vouched: boolean;
  /** This is the meetup they joined at. */
  readonly joined: boolean;
}
export interface Gathering {
  readonly moment: Moment;
  /** A meetup, or a moment everyone in the group at its date is through. */
  readonly onRibbon: boolean;
  /** How many slots its oval has, gaps for absent members included. Never less than 1. */
  readonly slots: number;
  /** How many people are in the group at its date. */
  readonly inGroup: number;
  /** Who is through it, in slot order. */
  readonly through: readonly Passage[];
}
export interface Thread {
  readonly person: Person;
  /** The gatherings they are through, in date order. */
  readonly path: readonly Gathering[];
  readonly joinsTrunkAt: string | null;
}
export interface Story {
  readonly moments: readonly Gathering[];
  /** In the order of the `people` map, which is the palette's order. */
  readonly threads: readonly Thread[];
  /** Slot order: every slug with a thread. */
  readonly order: readonly string[];
}
export function buildStory(moments: readonly Moment[], people: ReadonlyMap<string, Person>): Story;
```

- Produces, from `test/story-fixture.ts`: `person(slug, member = true)` (name is the slug in
  capitals, alias `@slug`, everything else empty, as `test/fake-elk.ts` does it),
  `at(id, date, people, trunk = false, more: Partial<Moment> = {})` (the title is the id),
  `PEOPLE`, `MOMENTS`, and `story = buildStory(MOMENTS, PEOPLE)`:

```ts
export const PEOPLE = new Map(["rob", "daniel", "david", "jared", "mica", "connor", "morgan"].map((s) => [s, person(s)]));
export const MOMENTS: Moment[] = [
  at("rob-nix", "2018-07", ["rob"]),
  at("booth", "2023-03", ["daniel", "rob", "david", "mica"]),
  at("founded", "2023-04", ["daniel", "david", "rob"], true),
  at("nug1", "2023-05", ["jared"], true),
  at("nug2", "2023-07", ["mica"], true),
  at("camp", "2023-09", ["daniel", "rob"]),
  at("nug3", "2024-01", [], true, { there: ["daniel"], away: ["rob"] }),
  at("scale", "2024-03", ["daniel", "david", "rob", "jared", "mica", "connor"]),
  at("nug4", "2024-06", ["connor"], true),
];
```

The rules, from the spec's "The story model": moments in date order, ties by id; a join is the
first trunk moment naming you; through a non-meetup are the people it names who are in `people`;
through a meetup is everyone joined at or before it less `away`; vouched is always true off a
meetup, and at a meetup true for whoever joined there or is in `there`; slot order is by join
(never-joiners last), then first moment, then slug; a moment is on the ribbon if it is a meetup,
or if the group is not empty and every member is through it; on the ribbon a member's slot is
their index in slot order and anyone not yet joined takes the slots after the members; off the
ribbon slots are packed in slot order.

- [ ] **Step 1: Write the fixture file and the failing tests.** `const g = (id) => story.moments.find((m) => m.moment.id === id)!` and `const slugs = (id) => g(id).through.map((p) => p.slug)`.

```ts
test("slot order is by joining, then first moment, then slug", () => {
  assert.deepEqual(story.order, ["rob", "daniel", "david", "jared", "mica", "connor"]);
});
test("after joining, a thread goes through every meetup", () => {
  assert.deepEqual(slugs("nug2"), ["rob", "daniel", "david", "jared", "mica"]);
  assert.deepEqual(g("nug2").through.map((p) => p.slot), [0, 1, 2, 3, 4]);
});
test("only the joiner is vouched for at a meetup with no attendance recorded", () => {
  assert.deepEqual(g("nug1").through.filter((p) => p.vouched).map((p) => p.slug), ["jared"]);
  assert.deepEqual(g("nug1").through.filter((p) => p.joined).map((p) => p.slug), ["jared"]);
});
test("someone recorded away leaves their slot empty, and nobody closes ranks", () => {
  assert.deepEqual(slugs("nug3"), ["daniel", "david", "jared", "mica"]);
  assert.deepEqual(g("nug3").through.map((p) => p.slot), [1, 2, 3, 4]);
  assert.equal(g("nug3").slots, 5);
  assert.equal(g("nug3").inGroup, 5);
});
test("someone recorded there is vouched for", () => {
  assert.deepEqual(g("nug3").through.filter((p) => p.vouched).map((p) => p.slug), ["daniel"]);
});
test("everyone named at a moment that is not a meetup is vouched for", () => {
  assert.ok(g("camp").through.every((p) => p.vouched));
});
test("a gathering of part of the group is off the ribbon, with its slots packed", () => {
  assert.equal(g("camp").onRibbon, false);
  assert.deepEqual(g("camp").through.map((p) => [p.slug, p.slot]), [["rob", 0], ["daniel", 1]]);
  assert.equal(g("camp").slots, 2);
});
test("a gathering of the whole group is on the ribbon, and a visitor takes the slot after the members", () => {
  assert.equal(g("scale").onRibbon, true);
  assert.deepEqual(g("scale").through.map((p) => [p.slug, p.slot]), [["rob", 0], ["daniel", 1], ["david", 2], ["jared", 3], ["mica", 4], ["connor", 5]]);
  assert.equal(g("scale").slots, 6);
});
test("nothing is on the ribbon before there is a group", () => {
  assert.equal(g("booth").onRibbon, false);
  assert.equal(g("booth").inGroup, 0);
});
test("a thread is every gathering its person is through, and skips a meetup they were away from", () => {
  const path = (slug: string) => story.threads.find((t) => t.person.slug === slug)!.path.map((x) => x.moment.id);
  assert.deepEqual(path("rob"), ["rob-nix", "booth", "founded", "nug1", "nug2", "camp", "scale", "nug4"]);
  assert.deepEqual(path("connor"), ["scale", "nug4"]);
});
test("threads come in the people map's order, and someone in no moment has none", () => {
  assert.deepEqual(story.threads.map((t) => t.person.slug), ["rob", "daniel", "david", "jared", "mica", "connor"]);
});
// Review Focus 1
test("a meetup everyone is away from keeps its slots and has nobody through it", () => {
  const s = buildStory([at("founded", "2023-04", ["rob", "daniel"], true), at("nug", "2023-06", [], true, { away: ["rob", "daniel"] })], PEOPLE);
  const nug = s.moments[1];
  assert.deepEqual(nug.through, []);
  assert.equal(nug.slots, 2);
  assert.equal(nug.onRibbon, true);
});
// Review Focus 2
test("someone who never joins is last in slot order and has only the moments that name them", () => {
  const s = buildStory([...MOMENTS, at("visit", "2024-04", ["morgan", "rob"])], PEOPLE);
  assert.equal(s.order.at(-1), "morgan");
  const morgan = s.threads.find((t) => t.person.slug === "morgan")!;
  assert.deepEqual(morgan.path.map((x) => x.moment.id), ["visit"]);
  assert.equal(morgan.joinsTrunkAt, null);
});
// Review Focus 3
test("two moments on one date are ordered by id, and a person through both passes each once", () => {
  const s = buildStory([at("founded", "2023-04", ["rob"], true), at("b-nug", "2023-06-01", [], true), at("a-talk", "2023-06-01", ["rob"])], PEOPLE);
  assert.deepEqual(s.moments.map((m) => m.moment.id), ["founded", "a-talk", "b-nug"]);
  assert.deepEqual(s.threads[0].path.map((x) => x.moment.id), ["founded", "a-talk", "b-nug"]);
});
// Review Focus 4
test("a person whose first moment is the meetup they join at starts there, joined", () => {
  const jared = story.threads.find((t) => t.person.slug === "jared")!;
  assert.equal(jared.path[0].moment.id, "nug1");
  assert.equal(jared.joinsTrunkAt, "nug1");
});
```

- [ ] **Step 2: Run** `node --test .../test/story.test.ts`. Expected: fails, `buildStory` not found.
- [ ] **Step 3: Implement `buildStory` in `src/story.ts`.**
- [ ] **Step 4: Run again: all pass. Run the typecheck: pass.**
- [ ] **Step 5: Commit.** `origins: the story as threads and gatherings`

______________________________________________________________________

### Task 3: The graph for ELK

**Files:**

- Create: `src/elk.ts`, `src/loom-graph.ts`, `test/loom-graph.test.ts`
- Modify: `src/graph.ts` (re-export what moves, so nothing else changes yet)

**Interfaces:**

- Consumes: `Story`, `Gathering` from Task 2.
- Produces, from `src/elk.ts`, moved unchanged out of `src/graph.ts` and re-exported from it:
  `Mode`, `ElkPoint`, `ElkLabel`, `ElkNode`, `ElkSection`, `ElkEdge`, `ElkGraph`, `AVATAR`,
  `LABEL_MAX`, `LABEL_HEIGHT`, `rootId`, `rootSlug`, and the label cut, now exported as
  `shown(title: string): string` with `labelWidth(text: string): number`. New here:

```ts
export interface ElkPort {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  readonly layoutOptions: Readonly<Record<string, string>>;
}
// and on ElkNode: readonly ports?: readonly ElkPort[];
```

- Produces, from `src/loom-graph.ts`:

```ts
export const SLOT = 7; // between one thread and the next across a moment
export const PAD = 8; // from a moment's edge to its first and last slot
export const THICK = 14; // a moment's size along the time axis
/** A moment's size across the time axis: max(18, (slots - 1) * SLOT + 2 * PAD). */
export function across(slots: number): number;
/** Where a slot sits across a moment, from the moment's leading edge. Centred when there is one. */
export function slotOffset(slots: number, slot: number): number;
export function portId(moment: string, side: "in" | "out", slug: string): string; // `${moment}|${side}|${slug}`
export interface ThreadMeta { readonly slug: string; readonly hue: number; readonly member: boolean }
export interface LoomGraph { readonly graph: ElkGraph; readonly meta: ReadonlyMap<string, ThreadMeta> }
export function loomGraphFor(story: Story, mode: Mode): LoomGraph;
```

The graph, from the spec's "The graph handed to ELK" and "What the sketch did": one node per
moment, `elk.partitioning.partition` = its index + 1, node label as today (`shown`, `labelWidth`,
placement `[H_LEFT, V_CENTER, OUTSIDE]` in River and `[H_CENTER, V_TOP, OUTSIDE]` in Subway),
`elk.portConstraints` = `FIXED_POS`. River: `width = across(slots)`, `height = THICK`, a
person's incoming port on `NORTH` at `(slotOffset, 0)` and outgoing on `SOUTH` at
`(slotOffset, THICK)`. Subway: width and height exchanged, `WEST` at `(0, slotOffset)` and `EAST`
at `(THICK, slotOffset)`. Ports are 1 by 1. One root per thread, 36 square, partition = the
index of its first moment. Edges `${slug}:${n}`: root to the first moment's incoming port, then
outgoing port to the next incoming port along `thread.path`. Root options are today's
`graphFor` ones with `elk.spacing.edgeEdge` = `"7"`. `hue` is `hueFor(index of the thread)`.

- [ ] **Step 1: Write the failing tests** against `loomGraphFor(story, "river")` from the fixture,
  with `node(id)` and `hops(slug)` helpers like `test/graph.test.ts` has:

```ts
test("every moment is a node pinned to its own layer, in date order", () => {
  story.moments.forEach((m, i) => assert.equal(node(m.moment.id).layoutOptions!["elk.partitioning.partition"], String(i + 1)));
});
test("a moment is as wide as its slots", () => {
  assert.equal(node("founded").width, 30); // (3 - 1) * 7 + 16
  assert.equal(node("founded").height, 14);
  assert.equal(node("rob-nix").width, 18);
  const subway = loomGraphFor(story, "subway").graph.children.find((n) => n.id === "founded")!;
  assert.deepEqual([subway.width, subway.height], [14, 30]);
});
test("everyone through a moment has a port in and a port out, at their slot", () => {
  const ports = node("founded").ports!;
  assert.deepEqual(ports.map((p) => p.id), ["founded|in|rob", "founded|out|rob", "founded|in|daniel", "founded|out|daniel", "founded|in|david", "founded|out|david"]);
  const daniel = ports.find((p) => p.id === "founded|in|daniel")!;
  assert.deepEqual([daniel.x, daniel.y, daniel.layoutOptions["elk.port.side"]], [15, 0, "NORTH"]);
  assert.deepEqual([ports[3].x, ports[3].y, ports[3].layoutOptions["elk.port.side"]], [15, 14, "SOUTH"]);
  assert.equal(node("founded").layoutOptions!["elk.portConstraints"], "FIXED_POS");
});
test("a single slot sits in the middle of its moment", () => {
  assert.equal(node("rob-nix").ports![0].x, 9);
});
test("an empty slot has no port, and the others keep their places", () => {
  assert.equal(node("nug3").width, 44); // five slots
  assert.ok(!node("nug3").ports!.some((p) => p.id.endsWith("|rob")));
  assert.equal(node("nug3").ports!.find((p) => p.id === "nug3|in|daniel")!.x, 15);
});
test("a thread is one edge per hop, port to port, and has none into a meetup it skips", () => {
  assert.deepEqual(hops("connor"), ["root:connor>scale|in|connor", "scale|out|connor>nug4|in|connor"]);
  assert.ok(!hops("rob").some((h) => h.includes("nug3")));
  assert.ok(hops("rob").includes("nug2|out|rob>camp|in|rob"));
});
test("every edge is somebody's thread, in their palette slot", () => {
  for (const e of graph.edges) assert.ok(meta.get(e.id), e.id);
  assert.equal(meta.get("rob:0")!.hue, 0);
  assert.equal(meta.get("daniel:0")!.hue, 1);
});
test("a face is a node a layer ahead of its person's first moment", () => {
  assert.equal(node(rootId("jared")).layoutOptions!["elk.partitioning.partition"], String(story.moments.findIndex((m) => m.moment.id === "nug1")));
  assert.equal(node(rootId("jared")).width, 36);
});
test("subway puts the ports on the sides time runs through", () => {
  const p = loomGraphFor(story, "subway").graph.children.find((n) => n.id === "founded")!.ports!;
  assert.deepEqual([p[2].x, p[2].y, p[2].layoutOptions["elk.port.side"]], [0, 15, "WEST"]);
  assert.deepEqual([p[3].x, p[3].y, p[3].layoutOptions["elk.port.side"]], [14, 15, "EAST"]);
});
// Review Focus 1: a meetup of nothing but gaps is still a node of the right size, with no ports
// Review Focus 2: a never-joiner's port at "scale" sits after the members'
// Review Focus 4: hops("jared")[0] === "root:jared>nug1|in|jared"
```

Write the three Review Focus tests out in the same style.

- [ ] **Step 2: Run: fails on the missing module.**
- [ ] **Step 3: Move the shared pieces into `src/elk.ts`, re-export them from `src/graph.ts`, and
  implement `src/loom-graph.ts`.**
- [ ] **Step 4: Run the new tests and the whole unit suite** (`node --test .../test/*.test.ts` from
  the package directory)**, then the typecheck: all pass.**
- [ ] **Step 5: Commit.** `origins: the loom as a graph with a port for every thread`

______________________________________________________________________

### Task 4: Placement

**Files:**

- Create: `src/loom-place.ts`, `test/loom-place.test.ts`, `test/fake-loom-elk.ts`

**Interfaces:**

- Consumes: `loomGraphFor`, `LoomGraph`, `ThreadMeta`, `slotOffset`, `THICK` (Task 3); `Story`.
- Produces, from `src/loom-place.ts`:

```ts
export interface Point { readonly x: number; readonly y: number }
export interface Box { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface PlacedLabel { readonly x: number; readonly y: number; readonly anchor: "end" | "middle"; readonly text: string }
export interface LoomPlaced {
  readonly mode: Mode;
  readonly width: number;
  readonly height: number;
  /** Centre of each moment's box. */
  readonly moments: ReadonlyMap<string, Point>;
  readonly boxes: ReadonlyMap<string, Box>;
  /** Where each person's bead would go: keyed by slotKey(). */
  readonly slots: ReadonlyMap<string, Point>;
  readonly roots: ReadonlyMap<string, Point>;
  readonly labels: ReadonlyMap<string, PlacedLabel>;
  readonly edges: readonly { readonly meta: ThreadMeta; readonly points: readonly Point[] }[];
}
export type Layout = (graph: ElkGraph) => Promise<ElkGraph>;
export function slotKey(moment: string, slug: string): string; // `${moment}|${slug}`
export function loomPlacedFrom(built: LoomGraph, laidOut: ElkGraph, story: Story, mode: Mode): LoomPlaced;
export function centreLoomIn(placed: LoomPlaced, available: number): LoomPlaced;
export function placeLoom(story: Story, mode: Mode, layout: Layout, available?: number): Promise<LoomPlaced>;
```

A slot's point is the middle of the moment along time, at the slot across: River
`(box.x + slotOffset, box.y + THICK / 2)`, Subway `(box.x + THICK / 2, box.y + slotOffset)`.
Labels are read as `src/place.ts` reads them today (baseline 11, `end` in River, `middle` in
Subway). An edge with no section or no meta is left out. `centreLoomIn` behaves as `centreIn`
does and also moves `boxes` and `slots`.

- Produces, from `test/fake-loom-elk.ts`: `fakeLoomLayout(graph): Promise<ElkGraph>`: node `i` at
  `x = 100 + i * 20`, `y = partition * 50`; labels at `x = -width - 12, y = 1`; each edge one
  section from its source's absolute point to its target's (a port's node position plus the
  port's own, or a root's centre) with one bend at `(7, 7)`; canvas 640 by 480.

- [ ] **Step 1: Write the failing tests:**

```ts
const placed = await placeLoom(story, "river", fakeLoomLayout);
test("a moment comes back as its box and the centre of it", () => { /* box equals the node's x, y, width, height; centre is its middle */ });
test("a slot is the middle of its moment along time, at that person's place across it", () => {
  const box = placed.boxes.get("founded")!;
  assert.deepEqual(placed.slots.get(slotKey("founded", "daniel")), { x: box.x + 15, y: box.y + 7 });
});
test("subway turns the slot the other way", async () => {
  const s = await placeLoom(story, "subway", fakeLoomLayout);
  const box = s.boxes.get("founded")!;
  assert.deepEqual(s.slots.get(slotKey("founded", "daniel")), { x: box.x + 7, y: box.y + 15 });
});
test("nobody has a slot at a moment they are not through", () => {
  assert.equal(placed.slots.get(slotKey("nug3", "rob")), undefined);
});
test("an edge comes back as its points in order, with whose thread it is", () => { /* start, bend, end; meta.slug */ });
test("a label carries the text the layout made room for, anchored as its mode hangs it", () => { /* end in river, middle in subway */ });
test("centring moves boxes and slots with everything else", () => {
  const wide = centreLoomIn(placed, placed.width + 200);
  assert.equal(wide.boxes.get("founded")!.x, placed.boxes.get("founded")!.x + 100);
  assert.equal(wide.slots.get(slotKey("founded", "rob"))!.x, placed.slots.get(slotKey("founded", "rob"))!.x + 100);
  assert.equal(wide.width, placed.width + 200);
});
test("centring later gives what centring during placement would have", async () => {
  assert.deepEqual(centreLoomIn(placed, 900), await placeLoom(story, "river", fakeLoomLayout, 900));
});
test("a canvas already wider than its box, or a box of nothing, is left alone", () => {
  assert.equal(centreLoomIn(placed, 100), placed);
  assert.equal(centreLoomIn(placed, 0), placed);
});
```

Fill in the three sketched bodies with exact values from the fake.

- [ ] **Step 2: Run: fails. Step 3: implement. Step 4: run the suite and the typecheck: pass.**
- [ ] **Step 5: Commit.** `origins: place the loom from what ELK returns`

______________________________________________________________________

### Task 5: Made-up histories, and the loom through real ELK

**Files:**

- Create: `smoke/histories.ts`, `smoke/inspect.ts`, `test/histories.test.ts`, `test/inspect.test.ts`
- Modify: `smoke/smoke.ts`

**Interfaces:**

- Consumes: `parseData`, `buildStory`, `placeLoom`, `LoomPlaced`, `slotOffset`, `Story`.
- Produces, from `smoke/histories.ts`: `history(seed: number, years: number): unknown`, the
  page's JSON shape, from the seed and nothing else. Shape of a history:
  - `9 + 2 * years` people `p0`..., all members; a founding (`founded`, `2023-04`, trunk) naming
    `p0`, `p1`, `p2`; `20 + 6 * years` meetups `m1`... two months apart from `2023-06`;
  - `p3` onward each join at a meetup, spread evenly through them in order;
  - each person gets a solo "First contact" one to four years before they join, and half get a
    "Paths cross" with someone who joined earlier;
  - three detours per year between meetups, cycling part, part, whole: a part names two to five
    members at that date, a whole names all of them;
  - one stretch between two consecutive meetups holding two part detours that together name
    every member at that date (the case that made the sketch's ribbon jog).
- Produces, from `smoke/inspect.ts`:

```ts
export interface Finding { readonly kind: "layout" | "engine"; readonly message: string }
/** How far any on-ribbon moment's slot 0 sits from the median of them, across the time axis. */
export function ribbonSpread(story: Story, placed: LoomPlaced): number;
export function inspectPlacement(story: Story, placed: LoomPlaced): Finding[];
```

`inspectPlacement` reports: a moment or a face with no position, or a thread with no edge
(`engine`); a point of any
edge's polyline, sampled every twentieth of each segment, inside the box of a moment or the
36px square of a face that is not that thread's own (`layout`). Slot 0's position is
`box.x + slotOffset(slots, 0)` in River and `box.y + ...` in Subway, whether or not anyone is
in it.

- [ ] **Step 1: Write the failing tests.**

```ts
// histories.test.ts
test("the same seed gives the same history", () => assert.deepEqual(history(3, 1), history(3, 1)));
test("different seeds differ", () => assert.notDeepEqual(history(1, 1), history(2, 1)));
test("a history grows by six meetups and two people a year", () => {
  const count = (y: number) => parseData(history(1, y));
  assert.equal(count(0).people.size, 9);
  assert.equal(count(2).people.size, 13);
  assert.equal(count(0).moments.filter((m) => m.trunk).length, 21);
  assert.equal(count(2).moments.filter((m) => m.trunk).length, 33);
});
test("it has a gathering of the whole group that is not a meetup", () => {
  const { people, moments } = parseData(history(1, 1));
  assert.ok(buildStory(moments, people).moments.some((g) => g.onRibbon && !g.moment.trunk));
});
test("it has a stretch where everyone is away in two parts", () => { /* two non-meetups between consecutive meetups, each off the ribbon, whose people together are every member */ });
// inspect.test.ts, on placeLoom(story, "river", fakeLoomLayout)
test("the spread is how far slot 0 strays, measured where the slot is and not where a thread is", () => { /* shift one on-ribbon box by 30: spread is 30; nug3, whose slot 0 is empty, counts (Review Focus 5) */ });
test("a moment off the ribbon does not count toward the spread", () => { /* shift camp's box: spread unchanged */ });
test("a thread through a moment that is not its own is a layout finding", () => { /* add a point inside nug3's box to one of rob's edges */ });
test("a clean placement has no findings", () => { /* build one by hand: the fake's bend at (7, 7) is outside every box */ });
```

Write the sketched bodies out.

- [ ] **Step 2: Run: fails. Step 3: implement both modules. Step 4: run: pass.**

- [ ] **Step 5: Add a loom pass to `smoke/smoke.ts`,** after the existing checks, which stay. For
  the real page's data and for `history(seed, years)` with seeds 1, 2, 3 and years 0, 1, 2, in
  both modes: `placeLoom` through the real ELK, fail on any `inspectPlacement` finding, and print
  one line: `loom <name> <mode>: <moments> moments, <people> people, ribbon off its column by up to <n>px, <ms>ms`.
  Do not assert on the spread yet.

- [ ] **Step 6: Run the smoke check with `-L`.** Expected: passes, and prints twenty lines. Record
  the spreads and times in the commit message; they are the baseline Task 6 is measured against.
  If any `inspectPlacement` finding appears here, stop and report: the sketch found none.

- [ ] **Step 7: Run `nix flake check -L`, then commit.** `origins: lay the loom out on made-up histories`

______________________________________________________________________

### Task 6: Hold the ribbon to one column

This is the spec's unsolved risk. Its stop rule binds this task.

**Files:**

- Modify: `src/loom-graph.ts`, `src/loom-place.ts`, `smoke/inspect.ts`, and their tests

**Interfaces:**

- Produces: `snapRibbon(laidOut: ElkGraph, story: Story, mode: Mode): ElkGraph` in
  `src/loom-place.ts`, applied by `placeLoom` between the layout and `loomPlacedFrom`; and in
  `inspectPlacement`, a `layout` finding when `ribbonSpread > 1`, naming the moment furthest off.

- [ ] **Step 1: Make the spread a failure.** Add the finding and its unit test (a box shifted by 30
  is found; by 0.5 is not). Run the smoke check: expected to fail, printing the baseline spreads.

- [ ] **Step 2: Give ELK a spine to hold.** In `loomGraphFor`, each on-ribbon moment gets two more
  ports, `portId(id, "in", "~")` and `portId(id, "out", "~")`, half a slot before slot 0
  (`slotOffset(slots, 0) - SLOT / 2`), and consecutive on-ribbon moments are joined out to in by
  an edge `spine:${n}` with `elk.layered.priority.straightness` = `"1000"` and no meta, so
  placement leaves it out and nothing draws it. Unit tests: the edges exist between consecutive
  on-ribbon moments and skip one that is off the ribbon; they have no meta; "every edge is
  somebody's thread" becomes "every edge but the spine". This is what held the trunk to within
  12px.

- [ ] **Step 3: Run the smoke check and read the spreads.** Record them.

- [ ] **Step 4: Snap what is left.** `snapRibbon` moves every on-ribbon moment across the time axis
  so its slot 0 sits on the median of all of them. Ports move with their node. Each edge section
  moves at its start by its source moment's move and at its end by its target's (a port id's
  moment is the text before the first `|`; a root does not move), and each bend by the share of
  the way it sits between them along the time axis, as `snapTrunk` in `src/place.ts` spreads a
  move today. Unit tests on the fake layout: after it, every on-ribbon slot 0 is equal; an
  off-ribbon moment has not moved; an edge's end has moved with its moment; a bend midway
  between a moved end and an unmoved one has moved half as far; a moment whose slot 0 is empty is
  aligned by the slot's position (Review Focus 5).

- [ ] **Step 5: Run the smoke check.** It passes only if the spread is within a pixel **and**
  `inspectPlacement` finds no thread through anything that is not its own, on the real data and
  on all nine histories, in both modes.

- [ ] **Step 6: If the snap puts threads through things,** give it room: raise
  `elk.spacing.edgeNode` from 20 in steps of 4, to at most 36, re-running the smoke check and
  recording the spreads, the findings and River's width for the real data at each step.

- [ ] **Step 7: STOP if it is still not clean.** Do not weaken the assertion, drop the goal or go
  on to Task 7. Report to Daniel: the table of spreads and findings from Steps 1, 3, 5 and 6, and
  the smallest case that fails. He decides.

- [ ] **Step 8: Run `nix flake check -L`, then commit.** `origins: hold the ribbon of threads to one column`,
  with the before and after spreads in the message.

______________________________________________________________________

### Task 7: Drawing

**Files:**

- Create: `src/loom-draw.ts`, `test/loom-draw.test.ts`
- Modify: `src/focus.ts`, `test/focus.test.ts`

**Interfaces:**

- Consumes: `LoomPlaced`, `slotKey` (Task 4); `Story`, `Gathering`; `avatarFor`, `flow`,
  `DocumentLike`, `ElementLike` from `src/render.ts`; `hueFor`; `formatFuzzyDate`.
- Produces: `drawLoom(placed: LoomPlaced, story: Story, doc: DocumentLike): ElementLike`, and in
  `src/focus.ts`:

```ts
/** "NUG #6, 1 June 2024, 9 in the group" for a meetup; "Nix Camp, 2 September 2024, 2 people" otherwise ("1 person" for one). */
export function describeGathering(gathering: Gathering): string;
/** "Rob Hernandez, member" or "..., guest". */
export function describePerson(person: Person): string;
```

What `drawLoom` emits, in this order, so later things sit on top:

| Element                      | Class and attributes                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `svg`                        | as `drawPlaced` today: `origins-svg is-MODE`, `viewBox`, `width`, `height`, `role="group"`, the same `aria-label`                       |
| year markers                 | exactly as `drawPlaced` today                                                                                                           |
| `path` per edge              | `origins-thread is-member` or `is-guest`, `data-person`, `data-hue`, `d` from `flow()`, `fill="none"`                                   |
| `g` per moment               | `origins-node is-trunk` (a meetup) or `is-side`, `data-moment`, `role="button"`, `aria-label` from `describeGathering`, `tabindex="-1"` |
| in it, `ellipse`             | `origins-oval`, `cx`, `cy` the box's centre, `rx`, `ry` half its width and height                                                       |
| in it, `ellipse`             | `origins-node-hit`, the same centre, `rx` and `ry` 6 larger                                                                             |
| `circle` per vouched passage | `origins-bead`, or `origins-bead is-join` where joined; `data-person`, `data-hue`; at the slot's point; `r` 2.6, or 3.6 where joined    |
| `g` per thread               | the face, as `drawPlaced` today, `aria-label` from `describePerson`                                                                     |
| `text` per label             | as `drawPlaced` today                                                                                                                   |

No trunk path, no halo.

- [ ] **Step 1: Write the failing tests,** with the recording `stubDocument()` copied from
  `test/draw.test.ts`:

```ts
test("every thread hop is a path that says whose it is", ...);       // one per placed edge; data-person, data-hue, class
test("no path is a trunk and no ring is drawn", ...);                // nothing with class origins-trunk or origins-node-halo
test("a moment is an oval the size of its box, inside a button that names it", () => {
  const node = withClass(made, "origins-node").find((n) => n.attrs["data-moment"] === "founded")!;
  assert.equal(node.tag, "g");
  assert.equal(node.attrs.role, "button");
  assert.equal(node.attrs.tabindex, "-1");
  assert.equal(node.attrs["aria-label"], "founded, April 2023, 3 in the group");
  const oval = node.children.find((c) => c.attrs.class === "origins-oval")!;
  assert.deepEqual([Number(oval.attrs.rx), Number(oval.attrs.ry)], [15, 7]);
  const hit = node.children.find((c) => c.attrs.class === "origins-node-hit")!;
  assert.deepEqual([Number(hit.attrs.rx), Number(hit.attrs.ry)], [21, 13]);
});
test("a meetup and another moment are told apart", ...);              // is-trunk on founded, is-side on camp
test("there is a bead exactly where the record vouches", () => {
  const beads = withClass(made, "origins-bead");
  const vouched = story.moments.flatMap((g) => g.through.filter((p) => p.vouched));
  assert.equal(beads.length, vouched.length);
});
test("a bead sits on its person's slot, in their colour", ...);       // cx, cy from placed.slots; data-hue
test("the bead where someone joined is the larger, gold one", ...);   // class includes is-join, r 3.6; others r 2.6
test("a bead is decoration: no role, no tab stop", ...);
test("ovals are drawn after threads, beads after ovals, faces after beads, labels last", ...);
test("every face is a button named for its person", ...);             // "ROB, member" with the fixture's names
test("no attribute is ever NaN or undefined", ...);
test("subway draws the same things turned", ...);                     // oval rx 7, ry 15 for founded
// focus.test.ts
test("a meetup is described by how many are in the group", () => assert.equal(describeGathering(g("nug3")), "nug3, January 2024, 5 in the group"));
test("another moment is described by how many were there", () => assert.equal(describeGathering(g("camp")), "camp, September 2023, 2 people"));
test("one person is one person", () => assert.equal(describeGathering(g("rob-nix")), "rob-nix, July 2018, 1 person"));
// Review Focus 1: a meetup of gaps is an oval with no beads. Review Focus 4: jared's bead at nug1 is the gold one.
```

Write each elided body out; the assertions are the attribute values in the table.

- [ ] **Step 2: Run: fails. Step 3: implement. Step 4: run the suite and the typecheck: pass.**
- [ ] **Step 5: Commit.** `origins: draw the loom`

______________________________________________________________________

### Task 8: The smoke check reads the drawn picture

**Files:**

- Modify: `smoke/inspect.ts`, `test/inspect.test.ts`, `smoke/smoke.ts`

**Interfaces:**

- Produces: `inspectDrawing(story: Story, placed: LoomPlaced, made: readonly Recorded[]): Finding[]`,
  where `Recorded` is `{ tag: string; attrs: Record<string, string>; text: string; children: Recorded[] }`
  from a recording document, and `explain(finding: Finding): string`, the message printed.

Assertions, from the spec's "Checks", each a `layout` finding unless marked:

- every moment's oval and every face is on the canvas;
- no thread, sampled along its drawn curve (24 steps a segment, as `sample()` in `smoke.ts` does
  today), within an oval or a face that is not its own;
- no label on a face or an oval, off the canvas, or wider than `LABEL_MAX`; no thread under a
  label;
- every bead inside its own oval (`engine`);
- a bead exactly where `vouched` is true, counted per moment (`engine`);
- no thread through the oval of a meetup its person is recorded away from (`engine`).

`explain` for a `layout` finding ends with: `This is a fault in how the picture was laid out for the data as it now stands. Nothing in your change is mistaken. It needs a maintainer who knows the layout engine in overlays/topLevel/socal-nug-braid-js.` For an `engine` finding it ends with:
`This is a bug in the engine, not in the data.`

- [ ] **Step 1: Write the failing tests:** a clean drawing of the fixture has no findings; a thread
  point moved inside another person's oval is a `layout` finding naming both; a bead moved
  outside its oval is an `engine` finding; a missing bead is an `engine` finding; `explain` ends
  with the right sentence for each kind.
- [ ] **Step 2: Run: fails. Step 3: implement. Step 4: run: pass.**
- [ ] **Step 5: In the smoke check's loom pass, draw with `drawLoom` into a recording document and
  fail on any `inspectDrawing` finding,** printing `explain(finding)`, for the real data and the
  nine histories.
- [ ] **Step 6: Run the smoke check.** Expected: passes. If a finding appears only now, it is the
  eased curve or the snap meeting something: go back to Task 6 Step 6, and its stop rule applies.
- [ ] **Step 7: Run `nix flake check -L`, then commit.** `origins: the smoke check measures the drawn loom`

______________________________________________________________________

### Task 9: Switch the page to the Loom

**Files:**

- Modify: `src/main.ts`, `src/cards.ts`, `src/focus.ts`, `test/cards.test.ts`, `test/focus.test.ts`
- Modify: `templates/origins.html`, `sass/css/pages/origins.scss`
- Modify: `overlays/topLevel/socal-nug-test-site/test_site.py`
- Modify: `browser/check.ts`
- Modify: `static/js/braid.js` (rebuilt)

**Interfaces:**

- `src/focus.ts`: `focusOrder(story: Story)`; a face sits just before `thread.path[0]`. The old
  `labelFor` and its tests go.

- `src/cards.ts`: `joinLineFor(thread: Thread, moments: readonly Gathering[])`,
  `detailFor(gathering: Gathering, people, doc)`, `personCardFor(thread, story: Story, doc, dismissable?)`,
  `rosterFor(story: Story, doc)`, all with `Thread` and `Gathering` from `src/story.ts`.

- [ ] **Step 1: Cards. Write the failing tests,** replacing the fixtures built on `buildBraid` with
  `test/story-fixture.ts`:

```ts
test("a meetup's card says who joined there", () => {
  const card = detailFor(g("nug1"), PEOPLE, doc);
  assert.ok(textOf(card).includes("Joined here: JARED"));
});
test("a meetup's card says who the record confirms, and leaves the joiners out of that line", () => {
  assert.ok(textOf(detailFor(g("nug3"), PEOPLE, doc)).includes("Confirmed there: DANIEL"));
  assert.ok(!textOf(detailFor(g("nug1"), PEOPLE, doc)).includes("Confirmed there"));
});
test("a meetup's card never lists who was away", () => {
  assert.ok(!textOf(detailFor(g("nug3"), PEOPLE, doc)).includes("ROB"));
});
test("a meetup nobody joined at, with nothing recorded, has no people line", ...);   // nug4 has connor; build one with none
test("another moment's card lists the people it names, with no prefix", () => {
  assert.ok(textOf(detailFor(g("camp"), PEOPLE, doc)).includes("DANIEL, ROB"));
});
```

Both lines are `p.origins-detail-people`. Names come in the moment's own order for a
non-meetup, as today, and in slot order on a meetup.

- [ ] **Step 2: Run: fails. Implement in `src/cards.ts` and `src/focus.ts`; update `focusOrder`'s
  tests to the story fixture. Run: the cards and focus tests pass** (the typecheck will not, until
  Step 3).

- [ ] **Step 3: `src/main.ts`.** `buildStory`, `placeLoom`, `centreLoomIn`, `drawLoom` in place of
  the braid's; the cache holds `LoomPlaced`. Hovering a moment lights the slugs of
  `gathering.through`. Remove the slide between modes entirely: the `animate` parameter, the
  `previous` map, `MORPH_MS`, `wantsStill`. After the first successful draw, reveal
  `#origins-legend` with the toggle, and reveal `#origins-legend-away` only when some moment has
  a non-empty `away`. Nothing else changes: popup, roster, keyboard, resize, failure message.

- [ ] **Step 4: Template and styles.** Add to `templates/origins.html`, after the toggle:

```html
<p id="origins-legend" class="origins-legend is-hidden">
  <span class="origins-legend-item"><svg ...>thread with a bead</svg>the record says they were there</span>
  <span class="origins-legend-item"><svg ...>thread with a gold bead</svg>joined here</span>
  <span class="origins-legend-item"><svg ...>bare thread</svg>in the group then</span>
  <span id="origins-legend-away" class="origins-legend-item is-hidden"><svg ...>thread stepping around an oval</svg>the record says they were not there</span>
</p>
```

In `origins.scss`: remove `.origins-trunk`, `.origins-node-halo`, `.is-excursion` and the
circle-only `r` rules. `.origins-oval`: fill the page colour at 0.6 opacity, stroke
`--origins-trunk` on a meetup and `--origins-muted` otherwise. `.origins-node:hover` and
`.origins-node.is-open` darken the oval's stroke to `--origins-ink` and thicken it.
`.origins-node-hit`: transparent, `pointer-events: all`. `.origins-bead`: fill
`--origins-thread`, `pointer-events: none`; `.is-join` gold in both themes. The focus ring
rule keeps applying to `.origins-node`. `.origins-legend`: small, wraps.

- [ ] **Step 5: Site tests.** Add `test_origins_has_a_legend_hidden_until_the_script_runs` (the
  element exists and carries `is-hidden`; so does `origins-legend-away`). Remove nothing.

- [ ] **Step 6: Browser check.** In `browser/check.ts`: delete the two reduced-motion checks and
  `slidingAfterSwitch`; the two side-dot checks read
  `getComputedStyle(document.querySelector(".origins-node.is-side .origins-oval")).stroke`
  in place of the dot's `fill`. Twenty-three checks remain.

- [ ] **Step 7: Rebuild the bundle, copy it, `git add`, run `nix flake check -L`:** green.

- [ ] **Step 8: Run `nix run .#socal-nug-braid-browser`.** Expected: `23 passed, 0 failed`.

- [ ] **Step 9: Look at it.** With the driver in `browser/cdp.ts` against `zola serve` (restart it
  first), capture River and Subway, light and dark, at 1400px and at 390px. Check by eye: one
  unbroken thread per person, no trunk, ovals as wide as their people, SCaLE 22x on the ribbon,
  the ribbon straight, nothing overlapping, the legend present. Then, without committing it,
  add one record to `data/moments.toml` with a `there` and an `away` for a real meetup, restart
  `zola serve`, and check the bead, the name under "Confirmed there:", the thread going around
  the oval and the fourth legend mark; remove the record. Report anything that looks wrong; do
  not tune by eye without saying so.

- [ ] **Step 10: Commit.** `origins: the page draws the loom`

______________________________________________________________________

### Task 10: Delete the trunk engine

**Files:**

- Delete: `src/layout.ts`, `src/graph.ts`, `src/place.ts`, `src/draw.ts`, `test/layout.test.ts`,
  `test/graph.test.ts`, `test/place.test.ts`, `test/draw.test.ts`, `test/fake-elk.ts`

- Modify: `src/types.ts` (remove `PlacedMoment`, `ThreadSegment`, `Thread`, `Excursion`,
  `TrunkSegment`, `Braid`), `src/toggle.ts` and anything else importing `Mode` from `graph.ts`
  (import from `elk.ts`), `smoke/smoke.ts` (remove the braid pass and everything only it used),
  `smoke/elk.bundled.d.ts` if it names `graph.ts`

- [ ] **Step 1: Delete and re-point imports. Nothing is rewritten.**

- [ ] **Step 2: `grep -rn "layout.ts\|graph.ts\|place.ts\|draw.ts\|buildBraid\|snapTrunk\|trunkWidth" overlays/topLevel/socal-nug-braid-js`.**
  Expected: no hits outside `loom-graph.ts`, `loom-place.ts`, `loom-draw.ts`.

- [ ] **Step 3: Run `nix flake check -L`.** Expected: green, and `braid-bundle-fresh` passes without
  rebuilding, because `main.ts` stopped reaching these files in Task 9. If it fails, rebuild and
  copy the bundle.

- [ ] **Step 4: Run `nix run .#socal-nug-braid-browser`:** `23 passed, 0 failed`.

- [ ] **Step 5: Commit.** `origins: delete the trunk engine`

______________________________________________________________________

### Task 11: Bring the documents up to date

**Files:**

- Modify: `docs/superpowers/specs/2026-11-21-origins-design.md`, `README.md`,
  `docs/superpowers/specs/2026-11-22-origins-loom-design.md`

- [ ] **Step 1:** In the 2026-11-21 spec, replace "The layout engine" and the parts of "Checks",
  "Accessibility" and "Verification" that describe the trunk, the snap, detours or the slide
  with what is built, pointing to the Loom design for the reasoning. Keep its record of why ELK
  replaced the lane allocator.

- [ ] **Step 2:** In the Loom design, change the status line to built, and under "Holding the ribbon
  to one column" record what held it and the measured spreads.

- [ ] **Step 3:** In `README.md`, the browser check's line stays; say in "Checks" that the suite
  also lays the Origins picture out on the real data and on made-up histories and measures it.

- [ ] **Step 4: `nix fmt`, `nix flake check -L`, commit.** `docs: the Origins page is a loom`
