# Origins Moment List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a list of moments beside the list of people on the Origins page, in three arrangements, and make a click on a card in either list centre the map on it and leave it lit.

**Architecture:** The card and list builders and the arithmetic of a pick are pure functions in the engine (`src/cards.ts`, a new `src/pick.ts`), unit-tested with a recording stand-in for `document`. The page script (`src/main.ts`) builds the two panes into the existing rail, wires hover and picking, and carries both lists through the mode switch. The three arrangements are CSS only, chosen by the layout's `data-mode` and the window's width.

**Tech Stack:** TypeScript run directly by node 24 (no npm, no build step for tests), esbuild for the committed bundle `static/js/braid.js`, Zola and Sass for the page, a Nix flake whose `nix flake check` is the whole suite, and headless Chromium over CDP for `nix run .#socal-nug-braid-browser`.

**Spec:** `docs/superpowers/specs/2026-11-21-origins-design.md`, section "The two lists". Where it and an older section disagree about the roster, "The two lists" is right. The controller owns the spec; do not edit it.

## Global Constraints

- Work only in `/home/djacu/dev/Socal-Nix-User-Group/socal-nug/.claude/worktrees/how-we-met`. Never `cd` out of it. Never run a bare `git stash`.
- One plain command per shell call: no `&&`, no pipes into `git`, no heredocs, no `eval`. `git diff` needs `--no-ext-diff`. There is no `python3` and no `npm`.
- Unit tests: `nix shell --inputs-from . nixpkgs#nodejs -c node --test --test-reporter=dot "overlays/topLevel/socal-nug-braid-js/test/*.test.ts"`.
- The suite: `nix flake check`. It must pass before a task is reported done. It includes `tsc --strict` over `src/`, `test/`, `smoke/` and `browser/`, and a check that `static/js/braid.js` is byte for byte a fresh build.
- After any change under `overlays/topLevel/socal-nug-braid-js/src/`, rebuild the bundle in three calls: `nix build .#socal-nug-braid-js --no-link --print-out-paths`, then `cp <printed path>/braid.js static/js/braid.js`, then `chmod u+w static/js/braid.js`.
- The browser check: `nix run .#socal-nug-braid-browser`. It takes about five minutes and needs the network. Tasks 2 and 3 must end with it passing. Run only one at a time.
- A new browser check must be seen to fail: run it once against the page without the behaviour it checks (before implementing, or with the behaviour taken out), and say in the report what it printed.
- Do not edit `data/`, `content/`, `templates/`, the spec, the README or anything not named in the task's Files.
- No refactoring, renaming or tidying of code the task does not need to change. No helpers or options for cases the task does not have. No validation of values that come from inside the engine.
- Comments say why, in the plain voice of the code around them. Refer to people by name, never by a pronoun. No em dashes.
- Commits: plain engineer voice, what changed and why, once. Subject starts `origins: `. End every commit message with the trailer `Assisted-by: Claude Code (<your model id>)`. Never a `Co-Authored-By` or "Generated with" line. Do not push.
- Class names already in use and not to be reused for anything else: `origins-moment-avatar` is the mark beside a moment in the map (an SVG group). `origins-card` is a person's card. `is-lit` is "lit by hover or by a pick". `is-open` is "this moment's popup is open".

## Review Focus

- A list card for a moment carries `data-moment`, and so do the map's pills and marks. Anything that selects `[data-moment]` without a scope (the document's click handler, `markOpen`, `elementAt`, the hover wiring) must still mean what it meant.
- Hover leaving a card must not unlight what is picked, and releasing a pick must not unlight what is still hovered.
- A click on a link inside a person's card (`a.origins-card-alias`, `a.origins-card-link`) must follow the link and pick nothing.
- Bringing a card into view in its list must not scroll the page or the map (`scrollIntoView` scrolls every ancestor; set the list's own scroll position instead).
- After a mode switch nothing the switch set may be left on the rail, the panes, the lists, the headings or the cards, and every card must be back in its own list, in order, whether the switch ran to its end or failed part way.
- A window resized, a mode switched or a redraw for any reason must not lose the pick: the new picture's elements have none of the old one's classes.
- With the layout engine blocked, both lists must still be built.

---

### Task 1: The cards, the lists and the arithmetic of a pick

**Files:**
- Create: `overlays/topLevel/socal-nug-braid-js/src/pick.ts`
- Create: `overlays/topLevel/socal-nug-braid-js/test/pick.test.ts`
- Modify: `overlays/topLevel/socal-nug-braid-js/src/cards.ts`
- Modify: `overlays/topLevel/socal-nug-braid-js/test/cards.test.ts`

**Interfaces:**
- Consumes: `Story`, `Gathering`, `Thread` from `src/story.ts`; `Person` from `src/types.ts`; `Point` from `src/loom-place.ts`; `formatFuzzyDate` from `src/dates.ts`; `rosterFor`, the private `el` helper and `DocumentLike`/`ElementLike` already in `src/cards.ts`. The test fixtures are `story`, `marked`, `MOMENTS`, `PEOPLE`, `at`, `person` in `test/story-fixture.ts` and the `stubDocument()` recorder at the top of `test/cards.test.ts`.
- Produces, in `src/pick.ts`:

```ts
/** What a reader has picked from a list or the map: one person or one moment. */
export type Pick =
  | { readonly kind: "person"; readonly id: string }
  | { readonly kind: "moment"; readonly id: string };

/** What a click on a card leaves picked: that card, or nothing when it was the pick already. */
export function toggled(current: Pick | null, clicked: Pick): Pick | null;

/** The slugs of everyone lit while `pick` stands: the person, or whoever was at the moment and not away. */
export function litBy(story: Story, pick: Pick | null): ReadonlySet<string>;

/**
 * Where a box has to be scrolled to for `at`, a point in its content in
 * pixels, to be in the middle of it, held to how far the box can scroll.
 */
export function centred(
  at: Point,
  box: { readonly width: number; readonly height: number },
  reach: Point,
): Point;

/**
 * How far a list has to scroll along one axis for [start, end] to show
 * inside [viewStart, viewEnd]: 0 when it already does. Something longer than
 * the view is shown from its start.
 */
export function reveal(start: number, end: number, viewStart: number, viewEnd: number): number;
```

- Produces, in `src/cards.ts`:

```ts
/** How many names a moment's card in the list spells out before "and N more". */
export const NAMES_SHOWN = 4;

/** One moment's card in the list of moments. */
export function momentCardFor(
  gathering: Gathering,
  people: ReadonlyMap<string, Person>,
  doc: DocumentLike,
): ElementLike;

/** Every moment, in the story's order, as a list of those cards. */
export function momentsFor(
  story: Story,
  people: ReadonlyMap<string, Person>,
  doc: DocumentLike,
): ElementLike;

/** The two panes the rail holds: People over the roster, Moments over the list of moments. */
export function listsFor(
  story: Story,
  people: ReadonlyMap<string, Person>,
  doc: DocumentLike,
): readonly ElementLike[];
```

The markup those make, exactly:

```
div.origins-moment-card[data-moment=<id>]            plus class is-trunk when moment.trunk
  div.origins-moment-card-head
    img.origins-moment-card-avatar[src=<avatar>][alt=""][width=28][height=28]   only when the moment has an avatar
    div.origins-moment-card-text
      span.origins-moment-card-title      the moment's title
      span.origins-moment-card-date       formatFuzzyDate(moment.date)
  p.origins-moment-card-people            only when there is a name to say

ul.origins-moments
  li.origins-moments-item                  one for each of story.moments, in that order
    div.origins-moment-card ...

section.origins-pane.is-people
  h2.origins-pane-title     "People"
  ul.origins-roster ...     what rosterFor(story, doc) returns
section.origins-pane.is-moments
  h2.origins-pane-title     "Moments"
  ul.origins-moments ...
```

The names line: on a meetup (`moment.trunk`), the people who joined there (`through` where `joined`), then the people the record confirms (`through` where `vouched && !joined`), each in `through` order; on any other moment, `moment.people` in that order. Slugs become names through `people`; one with no profile is left out. No names, no line. More than `NAMES_SHOWN` names: the first `NAMES_SHOWN` joined by `", "`, then `" and N more"`. Otherwise the names joined by `", "`.

- [ ] **Step 1: Write the failing tests for `src/pick.ts` in `test/pick.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { centred, litBy, reveal, toggled } from "../src/pick.ts";
import { story } from "./story-fixture.ts";

test("a click on a card picks it, and a second click on the same card picks nothing", () => {
  const rob = { kind: "person", id: "rob" } as const;
  const camp = { kind: "moment", id: "camp" } as const;
  assert.deepEqual(toggled(null, rob), rob);
  assert.deepEqual(toggled(camp, rob), rob);
  assert.equal(toggled(rob, { kind: "person", id: "rob" }), null);
  // a person and a moment with the same id are not the same pick
  assert.deepEqual(toggled({ kind: "person", id: "x" }, { kind: "moment", id: "x" }), { kind: "moment", id: "x" });
});

test("a picked person lights that person, a picked moment everyone who was at it and not away, and nothing lights nobody", () => {
  assert.deepEqual([...litBy(story, null)], []);
  assert.deepEqual([...litBy(story, { kind: "person", id: "mica" })], ["mica"]);
  assert.deepEqual([...litBy(story, { kind: "moment", id: "camp" })].sort(), ["daniel", "rob"]);
  // nug3: rob is recorded away from it, and everyone else in the group then is through it
  const nug3 = litBy(story, { kind: "moment", id: "nug3" });
  assert.equal(nug3.has("rob"), false);
  assert.equal(nug3.has("daniel"), true);
  // a moment the story does not have lights nobody
  assert.deepEqual([...litBy(story, { kind: "moment", id: "nowhere" })], []);
});

test("centring puts the point in the middle of the box, and stops where the box stops scrolling", () => {
  const box = { width: 600, height: 400 };
  assert.deepEqual(centred({ x: 1000, y: 900 }, box, { x: 2000, y: 2000 }), { x: 700, y: 700 });
  // near the start and past the end
  assert.deepEqual(centred({ x: 100, y: 50 }, box, { x: 2000, y: 2000 }), { x: 0, y: 0 });
  assert.deepEqual(centred({ x: 2500, y: 2300 }, box, { x: 2000, y: 2000 }), { x: 2000, y: 2000 });
  // a box with nowhere to scroll stays where it is
  assert.deepEqual(centred({ x: 300, y: 300 }, box, { x: 0, y: 0 }), { x: 0, y: 0 });
});

test("a list scrolls only as far as it takes to show a card, and not at all for one already in view", () => {
  assert.equal(reveal(120, 180, 100, 300), 0);
  assert.equal(reveal(40, 90, 100, 300), -60);
  assert.equal(reveal(280, 350, 100, 300), 50);
  // longer than the view: from its start
  assert.equal(reveal(150, 500, 100, 300), 50);
  assert.equal(reveal(60, 500, 100, 300), -40);
});
```

- [ ] **Step 2: Run them and see them fail**

Run the unit tests. Expected: `pick.test.ts` fails to load, `Cannot find module '../src/pick.ts'`.

- [ ] **Step 3: Implement `src/pick.ts`** to the signatures above. `litBy` for a moment reads `story.moments` for the gathering whose `moment.id` matches and takes `through` where `!away`.

- [ ] **Step 4: Run the unit tests and see `pick.test.ts` pass**

- [ ] **Step 5: Write the failing tests for the cards in `test/cards.test.ts`**

Add them in a section of their own before "the roster". They use the file's `stubDocument()`, `Node`, and from the fixture `story`, `marked`, `MOMENTS`, `PEOPLE`, `at` (import `marked`, which the file does not import yet, and the `Story` type from `../src/story.ts`). The fixture's people are named by their slug in capitals.

```ts
const tokens = (n: Node) => (n.attrs.class ?? "").split(" ");
const byClass = (made: Node[], token: string) => made.filter((n) => tokens(n).includes(token));
const momentCard = (s: Story, id: string) => {
  const { doc, made } = stubDocument();
  momentCardFor(s.moments.find((g) => g.moment.id === id)!, PEOPLE, doc);
  return made;
};
const said = (made: Node[], token: string) => byClass(made, token).map((n) => n.text);

test("the list of moments is one card for each moment, in the story's order, each saying which moment it is", () => {
  const { doc, made } = stubDocument();
  momentsFor(story, PEOPLE, doc);
  const list = made.find((n) => n.tag === "ul")!;
  assert.deepEqual(tokens(list), ["origins-moments"]);
  assert.equal(list.children.length, story.moments.length);
  assert.ok(list.children.every((li) => li.tag === "li" && tokens(li).includes("origins-moments-item")));
  assert.deepEqual(
    list.children.map((li) => li.children[0].attrs["data-moment"]),
    story.moments.map((g) => g.moment.id),
  );
});

test("a moment's card says its title and its date at the precision the data gives", () => {
  const made = momentCard(story, "camp");
  assert.deepEqual(said(made, "origins-moment-card-title"), ["camp"]);
  assert.deepEqual(said(made, "origins-moment-card-date"), ["September 2023"]);
});

test("a meetup's card is told apart from any other moment's", () => {
  assert.ok(tokens(byClass(momentCard(story, "nug1"), "origins-moment-card")[0]).includes("is-trunk"));
  assert.equal(tokens(byClass(momentCard(story, "camp"), "origins-moment-card")[0]).includes("is-trunk"), false);
});

test("a moment off the ribbon names the people it names, and past four says how many more", () => {
  assert.deepEqual(said(momentCard(story, "camp"), "origins-moment-card-people"), ["DANIEL, ROB"]);
  assert.deepEqual(
    said(momentCard(story, "scale"), "origins-moment-card-people"),
    ["DANIEL, DAVID, ROB, JARED and 2 more"],
  );
});

test("a meetup names who joined there and then who the record confirms, and nobody else in the group", () => {
  // jared joins at nug1 and nothing is recorded there
  assert.deepEqual(said(momentCard(story, "nug1"), "origins-moment-card-people"), ["JARED"]);
  // nobody joins at nug3; the record has daniel there and rob away
  assert.deepEqual(said(momentCard(story, "nug3"), "origins-moment-card-people"), ["DANIEL"]);
});

test("a meetup with nobody to name has no line of names", () => {
  const quiet = buildStory([...MOMENTS, at("nug5", "2024-08", [], true)], PEOPLE);
  assert.deepEqual(byClass(momentCard(quiet, "nug5"), "origins-moment-card-people"), []);
});

test("a moment's card carries its avatar when it has one, and no image when it has none", () => {
  const withOne = byClass(momentCard(marked, "camp"), "origins-moment-card-avatar");
  assert.equal(withOne.length, 1);
  assert.deepEqual(
    [withOne[0].tag, withOne[0].attrs.src, withOne[0].attrs.alt, withOne[0].attrs.width, withOne[0].attrs.height],
    ["img", "/images/moments/camp.png", "", "28", "28"],
  );
  assert.equal(momentCard(story, "camp").some((n) => n.tag === "img"), false);
});

test("the rail holds two panes, People over the roster and Moments over the list of moments", () => {
  const { doc, made } = stubDocument();
  const panes = listsFor(story, PEOPLE, doc);
  assert.equal(panes.length, 2);
  const sections = made.filter((n) => n.tag === "section");
  assert.deepEqual(sections.map(tokens), [["origins-pane", "is-people"], ["origins-pane", "is-moments"]]);
  for (const [section, title, list] of [
    [sections[0], "People", "origins-roster"],
    [sections[1], "Moments", "origins-moments"],
  ] as const) {
    assert.deepEqual(
      section.children.map((c) => [c.tag, tokens(c)[0]]),
      [["h2", "origins-pane-title"], ["ul", list]],
    );
    assert.equal(section.children[0].text, title);
  }
  assert.equal(sections[0].children[1].children.length, story.threads.length);
  assert.equal(sections[1].children[1].children.length, story.moments.length);
});
```

- [ ] **Step 6: Run them and see them fail** (the three functions are not exported yet)

- [ ] **Step 7: Implement `NAMES_SHOWN`, `momentCardFor`, `momentsFor` and `listsFor` in `src/cards.ts`**, with the file's own `el` helper, to the markup above. `listsFor` calls `rosterFor(story, doc)` for the people's list.

- [ ] **Step 8: Run the unit tests, all of them, and see them pass**

- [ ] **Step 9: Rebuild the bundle and run `nix flake check`** (see Global Constraints). Expected: `all checks passed!`. Nothing calls the new code yet, so the page is unchanged.

- [ ] **Step 10: Commit** `src/pick.ts`, `test/pick.test.ts`, `src/cards.ts`, `test/cards.test.ts` and `static/js/braid.js`.

---

### Task 2: Two lists on the page, in three arrangements, lit by hover and carried through the switch

**Files:**
- Modify: `overlays/topLevel/socal-nug-braid-js/src/main.ts`
- Modify: `sass/css/pages/origins.scss`
- Modify: `overlays/topLevel/socal-nug-test-site/test_site.py`
- Modify: `overlays/topLevel/socal-nug-braid-js/browser/check.ts`
- Modify: `static/js/braid.js` (rebuilt)

**Interfaces:**
- Consumes: `listsFor(story, people, doc)` from Task 1 and the markup it makes. In `main.ts`: `roster` (the rail, `#origins-roster`), `cast` (the people map), `story`, `highlight(slug, on)`, `hovers(event)`, `mount` (the map's box), and the whole of `morph(next)`.
- Produces, for Task 3: a rail whose two lists are `#origins-roster .origins-roster` and `#origins-roster .origins-moments`, each a scroll box in every arrangement; a class `is-hot` on a map pill (`.origins-node`) while its card in the list is hovered; a class `is-lit` on a moment's card (`.origins-moment-card`) while its moment is hovered in the map.

**What to build**

1. **The lists.** Where `main.ts` fills the rail with `rosterFor(story, document)`, fill it with `...listsFor(story, cast, document)`. The people's cards keep the listeners they have.
2. **Hover on a moment's card.** For each `.origins-moment-card` in the rail: on `pointerenter` from a pointer that hovers (`hovers(event)`), `highlight(slug, true)` for everyone through that moment who is not away, and add `is-hot` to that moment's pill in the map (`.origins-node[data-moment="<id>"]` inside `mount`); on `pointerleave`, undo both. The pill is looked up at the time of the event, since a redraw replaces it.
3. **Hover on a moment in the map.** In `wireHover`, where a `[data-moment]` element in the map gets its `pointerenter` and `pointerleave`, also add and remove `is-lit` on that moment's card in the rail.
4. **The arrangements**, in `sass/css/pages/origins.scss`, replacing the rules for `.origins-roster-rail` and the roster's grid that no longer hold. Use the selectors the file already uses for mode and width (`.origins-layout[data-mode="subway"]`, `.origins-layout:not([data-mode="subway"])`, `@media screen and (min-width: 1024px)` and `(max-width: 1023px)`).
   - Every arrangement: `.origins-pane` is a column, its title above its list; the list is the scroll box (`min-height: 0` or `min-width: 0` on what holds it, so it scrolls and does not grow).
   - River, 1024px and wider: `.origins-roster-rail` is `height: $origins-box-height`, a grid of two equal rows (`minmax(0, 1fr)` each); each list `overflow-y: auto`. The roster's cards one across, as now.
   - Subway, 1024px and wider: `.origins-roster-rail` is a grid of two columns, `minmax(0, 3fr) minmax(0, 2fr)`, gap `1.5rem`; each pane `height: 46vh`; each list `overflow-y: auto`; the roster's cards two across (`repeat(2, minmax(0, 1fr))`).
   - Narrower than 1024px, both modes: the panes stacked; each list `display: flex`, `overflow-x: auto`, one row; `.origins-roster-item` `flex: 0 0 19rem`; `.origins-moments-item` `flex: 0 0 13rem`.
   - The moment's card: `background: var(--origins-surface)`, a 4px left border in `var(--origins-muted)`, in `var(--origins-trunk)` for `.is-trunk`; padding `0.45rem 0.6rem`; the head a row, avatar then text, `gap: 0.5rem`, centred; title `font-weight: 700; font-size: 0.78rem; line-height: 1.25`; date `font-size: 0.62rem; opacity: 0.7`; names `font-size: 0.62rem; opacity: 0.7; margin: 0.25rem 0 0`; `cursor: pointer`. `.is-lit` on it takes the same tint the roster's card takes (`color-mix(in srgb, var(--origins-trunk) 16%, transparent)`), with the same transition.
   - `.origins-pane-title`: `font-size: 0.62rem; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.6; font-weight: 700; margin: 0 0 0.35rem`.
   - `.origins-node.is-hot .origins-oval` takes what `.origins-node:hover .origins-oval` takes: add the selector to that rule.
5. **The switch.** In `morph(next)` in `main.ts`, what is lifted and carried is now every `li` of both lists and both `.origins-pane-title` headings, not only the roster's items. Keep the mechanism: measure each in the mode being left, flip the mode, measure each in the mode arrived at, lift each against `#origins-layout` and move it frame by frame, and `tidy()` everything at the end and on any failure.
   - A card is out of sight in a mode when its box does not overlap its own list's box in that mode. In sight in both: shown all the way. Out of sight where it starts and in sight where it lands: fades in. In sight where it starts and out of sight where it lands: fades out. Out of sight in both: not shown on the way (`opacity: 0`). This replaces the rule that read the roster's rail in River only.
   - The headings are always shown.
   - Each list keeps, for the length of the switch, the room it has in the mode arrived at, as the roster's list does now (`min-height`; and where the list is a row, its height is what matters, which `min-height` covers).
   - `tidy()` takes the `style` off the map's box, the layout, both lists, every card and both headings.
   - A list keeps its own scroll position through the switch. Lifting its cards out empties it, and an empty scroll box goes back to its start, so the cards would jump when they are put back. Read each list's `scrollLeft` and `scrollTop` once the page is in the mode arrived at (when the cards are measured there), and put them back in `tidy()` after the styles come off.
   - A card that is not shown on the way has to be lifted with the rest, but need not be moved every frame.
6. **A click on a moment's card closes a card open in the map.** The handler on `document` that closes the popup lets a click pass when its target is inside `[data-moment]` or `.origins-root`, because in the map such a click swaps the card. A moment's card in the rail carries `data-moment` too, and a click on it must close the popup, as a click on a person's card in the rail does. Let the click pass only when that element is inside the map (`mount`).

**Tests**

- [ ] **Step 1: Update the build-output tests in `test_site.py`.** `self.css` is the built stylesheet, minified. Replace `test_origins_roster_moves_below_the_map_in_subway` and `test_origins_roster_beside_the_map_scrolls_at_the_maps_height` with tests that assert, each by the presence of the rule in `self.css`:
  - beside the map the rail is the map's ceiling tall: inside `@media screen and (min-width: 1024px){`, `.origins-layout:not([data-mode=subway]) .origins-roster-rail{` followed by a `height:` equal to the map's own ceiling (read it from `.origins-braid{`'s `max-height`, as the test being replaced does);
  - in Subway the two panes are side by side: `.origins-layout[data-mode=subway] .origins-roster-rail{` with `grid-template-columns:minmax(0, 3fr) minmax(0, 2fr)`;
  - on a narrow screen each list is a row: inside `@media screen and (max-width: 1023px){`, a rule for `.origins-roster` and `.origins-moments` with `overflow-x:auto`;
  - the pill's hover outline also answers `is-hot`: `.origins-node.is-hot .origins-oval` is in `self.css`.
  Write the assertions against what the Sass compiler actually emits: build the site (`nix build .#socal-nug-site --no-link --print-out-paths`) and read `css/style.css` in the result before fixing the strings. Run `nix build .#checks.x86_64-linux.test-site --no-link` and see the new tests fail before the stylesheet is changed.

- [ ] **Step 2: Rewrite the roster checks in `browser/check.ts` and add the new ones, before changing the page.** Names are what a visitor would notice. Keep `ROSTER` as the rail and add `PEOPLE = \`${ROSTER}.querySelector(".origins-roster")\`` and `MOMENTS = \`${ROSTER}.querySelector(".origins-moments")\``.
  - Keep "River: the roster beside the map is no taller than the map, and ends where the map ends when it has more to show", measuring the rail.
  - "River: the wheel over the roster scrolls the roster, and carries on down the page at its end": aim at the middle of the people's list and read that list's `scrollTop`.
  - New, River at 1400px: "River: people and moments are two lists, one above the other, each scrolling in its own box": both lists exist; the moments' list is below the people's and inside the rail; each has `overflow-y` `auto`; the moments' list has more than it shows (`scrollHeight > clientHeight`); the number of cards in the moments' list equals the number of `.origins-node` in the map.
  - Replace "Subway: the roster under the map is the whole list, with nothing to scroll inside it" with "Subway: people and moments are side by side under the map, each scrolling down in its own box": the rail's top is at or below the map's bottom; the people's pane is left of the moments' pane and their tops are within 1px; each list has `overflow-y` `auto` and the moments' list has more than it shows; the page itself is no wider than the window (`document.documentElement.scrollWidth <= clientWidth`).
  - Replace "a narrow window: the roster under the map is the whole list in River too" with "a narrow window: people and moments are two rows that scroll sideways", at `load("river", 900, 900)`: the rail is under the map; in each list every card's top is within 1px of the first card's; each list has more than it shows sideways (`scrollWidth > clientWidth`) and nothing to scroll down; the page is no wider than the window.
  - New: "mouse: hovering a moment's card lights the people who were there and outlines its pill": move the pointer over a card in the moments' list whose moment has someone through it; every `path.origins-thread` of the people through that moment and not away has `is-lit`, nobody else's has; the moment's `.origins-oval` has a different computed `stroke` from when the pointer was away; after the pointer leaves, nothing in the map is lit.
  - New: "mouse: hovering a moment in the map tints its card in the list": compare the card's computed `background-color` with the pointer away and with it over the moment's pill.
  - `leftBehind()` and "switching modes leaves nothing set on the map, the layout or the roster, and every card back in the roster": cover both lists, every card of each and both headings: no `style` on any of them or on either list, each card's `position` is `static`, each card's parent is its own list, and the cards of each list are in the order they were in before the switch (read the `data-person` and `data-moment` order before and after).
  - New: "switching modes: a moment's card travels from its place in one arrangement to its place in the other": part way through a switch from River the first card of the moments' list is `position: absolute` and its box is at neither the place it had in River nor the place it has in Subway once landed.
  - New: "switching modes: a list scrolled part way down is where it was after the switch": in River set the moments' list's `scrollTop` to 200, switch to Subway and wait for it to land; the list's `scrollTop` is within 1px of 200.
  - New: "a click on a moment's card in the list closes a card open in the map": open a moment's card by a click on its pill, then click a moment's card in the list; the popup is hidden. (A click on a person's card in the list closes it already; this is the same for the other list.)
  - Any other check in the file that reads the roster (`#origins-roster .origins-card`, the roster's item count, "without the layout engine, the roster is still there") must still mean what it says with two lists in the rail; "without the layout engine" must find both lists.
  Run `nix run .#socal-nug-braid-browser` now, against the unchanged page, and record which of these fail and with what detail. The new and rewritten ones must fail; the ones kept must pass.

- [ ] **Step 3: Implement** items 1 to 5 of "What to build".

- [ ] **Step 4: Rebuild the bundle. Run `nix flake check`.** Expected: `all checks passed!`.

- [ ] **Step 5: Run `nix run .#socal-nug-braid-browser`.** Expected: every check passes.

- [ ] **Step 6: Commit** the five files.

---

### Task 3: A click on a card centres the map on it and leaves it lit

**Files:**
- Modify: `overlays/topLevel/socal-nug-braid-js/src/main.ts`
- Modify: `sass/css/pages/origins.scss`
- Modify: `overlays/topLevel/socal-nug-braid-js/browser/check.ts`
- Modify: `static/js/braid.js` (rebuilt)

**Interfaces:**
- Consumes: from Task 1, `Pick`, `toggled`, `litBy`, `centred`, `reveal`; from Task 2, the two lists in the rail and `is-hot`. In `main.ts`: `highlight`, `showMoment`, `showPerson`, `openAt`, `closePopup`, `markOpen`, `draw`, `morph`, `reachOf()`, `shown` (the placement on screen: `shown.roots` has each face's centre by slug, `shown.moments` each moment's centre by id, in the picture's own units), `zoom` (pixels to a unit), `morphing`, `mount`.
- Produces: nothing for a later task.

**What to build**

1. **One pick, and what is lit.** Keep in `boot()` a `picked: Pick | null` and the set of slugs lit by hover. `highlight(slug, on)` now only adds to or takes from that set and then relights. Relighting sets `is-lit` on every `[data-person]` element in the map and in the rail to "the slug is hovered, or is in `litBy(story, picked)`", and sets `is-picked` on exactly: the picked person's card in the rail, or the picked moment's card in the rail and its pill in the map. Relight after every draw as well (the first, a resize, a switch that does not travel, and the landing of one that does), because a new picture has none of the classes.
2. **A click on a card in a list.** On a person's card in the rail: ignore it when the click is on or inside an `a`; otherwise `picked = toggled(picked, { kind: "person", id })`. On a moment's card: the same with `kind: "moment"`. Then relight, and when something is now picked, scroll the map to `centred(point, box, reachOf())`, where `point` is the face's or the moment's centre from `shown` times `zoom`, and `box` is the map's `clientWidth` and `clientHeight`: `mount.scrollTo({ left, top, behavior })` with `behavior` `"smooth"`, or `"auto"` when `matchMedia("(prefers-reduced-motion: reduce)")` matches. No popup is opened. A click while `morphing` does nothing.
3. **A click in the map.** Where a face's click calls `showPerson` and a moment's (pill or mark) calls `showMoment`, and where `openAt` does either for the keyboard, also set `picked` to that person or moment (set, not toggled), relight, and bring its card into view inside its own list: add `reveal(...)` of the card's box against the list's box to the list's `scrollTop` and to its `scrollLeft` (boxes from `getBoundingClientRect()`). Do not call `scrollIntoView`, and do not scroll the map.
4. **Letting go.** Escape, which closes the popup (the `keydown` handler on `document`), also sets `picked` to `null` and relights. A click inside the map's box (`mount.contains(target)`) that is on no pill, mark or face (`target.closest("[data-moment], .origins-root") === null`) and not inside the popup does the same. The `click` handler on `document` that closes the popup recognises that click, but it returns at once while the popup is hidden; letting go must happen whether or not a popup is open. A click that ends a drag of the map never reaches `document` (the capturing handler on `mount` stops it) and must go on not reaching it, so a drag lets go of nothing. A click outside the map and outside the lists (the zoom buttons, the mode buttons, the rest of the page) lets go of nothing.
5. **How a pick looks**, in `sass/css/pages/origins.scss`: `.origins-card.is-picked` and `.origins-moment-card.is-picked` take `background: color-mix(in srgb, var(--origins-trunk) 22%, transparent)` and `outline: 2px solid var(--origins-trunk); outline-offset: -2px`. `.origins-node.is-picked .origins-oval` takes what `.origins-node.is-open .origins-oval` takes: add the selector to that rule.

**Tests** (`browser/check.ts`, written and seen to fail before the page is changed)

- [ ] **Step 1: Write the checks.** Each loads the page fresh. "Lit" means the element has `is-lit`. To wait for a smooth scroll to end, wait until the map's `scrollLeft` and `scrollTop` have not changed for 200ms.
  - "a click on a person's card brings their face to the middle of the map and leaves them lit": in River, click a card in the people's list (not on a link) whose face is not already in the middle. Afterwards the face's centre is within 2px of the middle of the map's box on each axis, or the map is at the end of its reach on that axis; with the pointer moved off the page's lists, that person's thread, face and card are lit, the card has `is-picked`, and nobody else's thread is lit.
  - "a click on a moment's card brings its pill to the middle of the map and leaves everyone who was there lit": the same for a card in the moments' list, chosen so its pill is not already in the middle and it has someone through it; the pill's centre is in the middle or the map is at the end of its reach; the pill's `.origins-node` and the card have `is-picked`; exactly the people through it and not away are lit.
  - "a click on a card in a list opens no card in the map": the popup is hidden after each of the two clicks above.
  - "a second click on the picked card, a click on empty map, and Escape each let go of it": three times over, pick a card, then do one of the three; afterwards nothing has `is-picked` and no thread is lit.
  - "hovering another card while one is picked lights both, and leaving it leaves the pick lit": pick a person, hover a different person's card, both threads lit; move off, only the picked one's.
  - "a click on a moment in the map marks its card and scrolls its list to show it, without moving the page or the map": in Subway, scroll the moments' list to its start, then click a pill in the map whose card is out of sight in the list. Afterwards the card has `is-picked`, its box is inside its list's box, and `scrollY` and the map's `scrollLeft` and `scrollTop` are what they were before the click. The popup is open, as before.
  - "zooming the map and dragging it leave the pick as it is": pick a moment's card, press the zoom-in button, then drag the map by more than the grab's slop from a point on empty map and let go; the card still has `is-picked` and the people through the moment are still lit.
  - "a pick is still marked and lit after the mode is switched": pick a moment's card in River, switch to Subway and wait for it to land; its card and its pill have `is-picked` and the people through it are lit.
  - "with reduced motion asked for, a click on a card puts the map there at once": with the reduced-motion media feature emulated, read the map's scroll position straight after the click, with no wait, and find the pill in the middle or the map at the end of its reach.
  Run `nix run .#socal-nug-braid-browser` against the page as Task 2 left it and record what each new check prints. They must fail; everything else must pass.

- [ ] **Step 2: Implement** items 1 to 5 of "What to build".

- [ ] **Step 3: Rebuild the bundle. Run `nix flake check`.** Expected: `all checks passed!`.

- [ ] **Step 4: Run `nix run .#socal-nug-braid-browser`.** Expected: every check passes.

- [ ] **Step 5: Commit** the four files.
