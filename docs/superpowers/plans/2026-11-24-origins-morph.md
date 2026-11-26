# Origins Morph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switching the Origins page between River and Subway moves everything from where it is
to where it will be, in place of the instant redraw.

**Architecture:** Both modes are the same story laid out twice, so every face, moment, bead,
label, year mark and thread has a twin in the other mode. A pure module works out where each
thing is at any point between the two layouts. The page script measures the box and the roster
before and after the layout flips, applies one frame of that module per animation frame, and
swaps in the ordinary drawing for the new mode when it lands.

**Tech Stack:** TypeScript run by node 24 directly, `node:test`, esbuild bundle committed at
`static/js/braid.js`, ELK for layout, headless Chromium over CDP for the on-demand browser check,
Nix flake checks.

**Spec:** `docs/superpowers/specs/2026-11-21-origins-design.md` is the one current spec. It says
today that switching modes does not animate. Task 3 changes it. Until then this plan is the
design.

**Reference:** the behaviour was settled on a throwaway spike, branch `origins-morph-spike`. Read
it with `git show origins-morph-spike:overlays/topLevel/socal-nug-braid-js/src/morph.ts` and
`git show origins-morph-spike:overlays/topLevel/socal-nug-braid-js/src/main.ts` (search for
`SPIKE`). Its behaviour is what the owner approved. Its structure is not: it has no tests, it
works things out inside the page script, and it reads year marks back out of the drawn SVG.

## The design, as approved

1. Pressing the other mode's button moves, over 1200 ms with a cubic ease in and out:
   - inside the picture: each face, each moment's pill (changing from wide to tall), each bead,
     each label, each year line and year label, and each thread, bent from one shape to the
     other;
   - the canvas, from one mode's size to the other's;
   - the map's box, from the size it has in one layout to the size it has in the other;
   - each roster card, from its place beside the map to its place in the grid under it or back.
     A card really is the width it appears to be on the way, so its text wraps as it travels and
     is never scaled. Cards may cross over the picture.
1. The view lands the same share of the way along the other map: the start to the start, the end
   to the end, anywhere between the same way through. Along time that is the share of how far
   the box can scroll. Across time the same, and the middle when there is nothing to scroll
   across. The scroll position moves in a straight line from where it was to where it lands. A
   round trip comes back to exactly where it began.
1. A view whose zoom was last set by the Fit button arrives at the other mode's fit, the zoom
   changing on the way. Any other zoom is carried across unchanged.
1. While it runs the map answers no pointer, and a press on either mode button or any zoom
   button does nothing.
1. A reader whose system asks for reduced motion gets the instant switch the page has today.
1. The other mode's layout is made 1500 ms after the first picture is drawn, for every visitor,
   so the first switch can start at once. A switch pressed before it is ready waits for that
   same layout; the layout is never made twice.
1. When it lands, the picture in the box is the ordinary drawing for that mode, the one a fresh
   visit would draw, and nothing the morph set on the box, the layout, the roster or the cards
   is left behind.
1. A card the roster's own box hides in River fades in on the way to Subway and out on the way
   back, since under the map every card shows.

## Global Constraints

- Work in place on branch `worktree-how-we-met`. Do not push. Do not switch branches. Do not
  `cd` out of the worktree.
- No new dependencies and no npm. Node runs `.ts` directly.
- `nix flake check` is the suite. `static/js/braid.js` must be a fresh build of `src/`. Three
  commands, each its own call, with the printed store path typed out literally (no shell
  variables, no `$(...)`): `nix build .#socal-nug-braid-js --no-link --print-out-paths`, then
  `cp <printed path>/braid.js static/js/braid.js`, then `chmod u+w static/js/braid.js`.
- Nix only sees files git knows about: `git add` a new file before running a check.
- The Bash sandbox refuses compound commands containing `git`, heredocs and `eval`. One plain
  command per call. `git diff` needs `--no-ext-diff`. There is no `python3`.
- Do not refactor, rename or tidy code the task does not need changed. No speculative options
  or helpers.
- Comments say what the code does now, in the voice the file already has. Nothing about the
  spike, this plan or how the code came to be.
- Commits: plain engineer voice, subject starting `origins: `, what changed and why, once. No em
  dashes, no thanks, no bold. End with exactly one trailer naming the tool and model that wrote
  it, in the form `Assisted-by: Claude Code (<model id>)`. Never `Co-Authored-By`.
- `git add` named paths only, never `-A`.

## Review Focus

- A person recorded away from a meetup has a thread in several stretches. Its stretches must
  start and end in the same places in both modes at every point of the morph, never joined up.
- The two modes give one edge different numbers of points. At the start the bent thread must
  look exactly like the ordinary drawing of the mode being left, and at the end exactly like the
  one being arrived at.
- A box that cannot scroll at all on an axis (the picture fits) must not divide by zero or land
  somewhere odd.
- A press on a button during the morph, and a window resize during it, must leave the page in a
  state a fresh visit could reach.
- Nothing the morph sets inline may survive it: a leftover width on the box or a card lifted out
  of the roster breaks the page until reload.

______________________________________________________________________

### Task 1: where everything is, part of the way between two layouts

**Files:**

- Create: `overlays/topLevel/socal-nug-braid-js/src/morph.ts`
- Create: `overlays/topLevel/socal-nug-braid-js/test/morph.test.ts`
- Modify: `overlays/topLevel/socal-nug-braid-js/src/loom-draw.ts` (year marks only)
- Modify: `overlays/topLevel/socal-nug-braid-js/test/loom-draw.test.ts` (year marks only)
- Modify: `static/js/braid.js` (rebuilt)

**Interfaces:**

- Consumes: `LoomPlaced`, `Point`, `Box`, `PlacedLabel`, `slotKey` from `src/loom-place.ts`;
  `Story` from `src/story.ts`; `Mode` from `src/elk.ts`. The curve a thread is drawn with is
  `flow()` in `src/render.ts`: one cubic per hop, control points half the hop along the time
  axis.

- Produces, from `src/loom-draw.ts`:

  ```ts
  export interface YearMarks {
    /** One line for each change of year, in date order. */
    readonly ticks: readonly { x1: number; y1: number; x2: number; y2: number }[];
    /** The opening year first, then one for each tick. */
    readonly labels: readonly { x: number; y: number; text: string }[];
  }
  export function yearMarks(placed: LoomPlaced, story: Story): YearMarks;
  ```

  `drawLoom` draws its year lines and year labels from `yearMarks`, and draws exactly what it
  draws today.

- Produces, from `src/morph.ts`:

  ```ts
  export const MORPH_MS = 1200;
  /** Cubic ease in and out: 0 at 0, 0.5 at 0.5, 1 at 1. */
  export function ease(t: number): number;

  export interface Morph { /* opaque to callers */ }
  /**
   * `labelWidths` is how wide each moment's label text is drawn, by moment id. A label hangs
   * from its end in River and its middle in Subway; with the width both become where the text
   * starts.
   *
   * Null when the two layouts do not pair up: an edge, a face, a box or a bead's slot that only
   * one of them has. Added after Task 1's review; the page then switches instantly.
   */
  export function morphBetween(
    story: Story,
    from: LoomPlaced,
    to: LoomPlaced,
    labelWidths: ReadonlyMap<string, number>,
  ): Morph | null;

  export interface MorphFrame {
    readonly width: number;
    readonly height: number;
    /** A thread's path, by person. */
    readonly threads: ReadonlyMap<string, string>;
    /** A face's centre, by person. */
    readonly faces: ReadonlyMap<string, Point>;
    /** A moment's box, by moment id. */
    readonly boxes: ReadonlyMap<string, Box>;
    /** Beads, in the order drawLoom draws them. */
    readonly beads: readonly Point[];
    /** Where each label's text starts, in the order drawLoom draws labels. */
    readonly labels: readonly Point[];
    readonly ticks: readonly { x1: number; y1: number; x2: number; y2: number }[];
    readonly years: readonly Point[];
  }
  /** `t` is 0 at `from` and 1 at `to`, already eased by the caller. */
  export function frameAt(morph: Morph, t: number): MorphFrame;

  /** How far along the map a view is, as shares of how far its box can scroll. */
  export interface Shares {
    readonly along: number;
    readonly across: number;
  }
  /** `reach` is how far the box can scroll on each axis. Time runs down in River, across in Subway. */
  export function sharesOf(mode: Mode, scroll: Point, reach: Point): Shares;
  export function scrollFor(mode: Mode, shares: Shares, reach: Point): Point;
  ```

Requirements:

- Threads. For each person, pair the edges of the two layouts by person, `from` node and `to`
  node. Turn each edge's points into the cubics `flow()` draws. Where the two modes have
  different numbers of cubics for an edge, cut the longest cubic of the shorter list in half (de
  Casteljau at one half) until they match. A cut must not change the line drawn. A thread's path
  at `t` is every control point moved in a straight line from its place in `from` to its place
  in `to`. A new stretch (`M`) starts at the person's first edge and wherever an edge does not
  begin where the last one ended, in either mode. Coordinates are rounded to two decimals, as
  `flow()` rounds.

- Faces, boxes, beads, ticks, years, width and height move in straight lines. Beads are in the
  order `drawLoom` draws them: the story's moments in order, each moment's passages in order,
  only those vouched for or away. Labels are in the order `drawLoom` draws them: the story's
  moments that have a label in `from`. A label with no twin in `to` stays where it is.

- `sharesOf`: `along` is the scroll on the time axis over the reach on that axis, 0 when that
  reach is 0. `across` is the same on the other axis, 0.5 when that reach is 0. Both are held
  between 0 and 1. `scrollFor` is the inverse: each share times the reach on its axis.

- [ ] **Step 1: Write the failing tests** in `test/morph.test.ts`, using the fixtures and the
  fake layout the other tests use (`test/story-fixture.ts`, `test/fake-loom-elk.ts`), placed
  once as River and once as Subway. They must pin, by name:

  - `frameAt(m, 0)` gives every face, box, bead, tick and year where `from` has it, and the
    canvas `from`'s size; `frameAt(m, 1)` the same for `to`.
  - the beads of `frameAt(m, 0)`, in order, are the centres of the bead circles `drawLoom` draws
    for `from`; the labels likewise are where `drawLoom`'s label texts start, given their
    widths; the ticks and years are what `drawLoom` draws.
  - a thread's path at 0 traces the same line as `drawLoom`'s path for that person in `from`,
    and at 1 as in `to`: sample both and require every sampled point of one to lie within 0.05
    of the other's line.
  - an edge with two points in one mode and four in the other has the same number of cubics in
    both after matching, and its line in the mode that was cut is unchanged.
  - a person away from a meetup has as many `M` in their path at 0, at 0.5 and at 1 as
    `drawLoom` gives them, and no stretch joined across the meetup.
  - `ease(0) === 0`, `ease(1) === 1`, `ease(0.5) === 0.5`, and it never decreases.
  - `sharesOf` and `scrollFor`: the start gives `along` 0 and maps to scroll 0; the end gives 1
    and maps to the other mode's full reach on its time axis; a reach of 0 across gives 0.5;
    a scroll past the reach is held at 1; River's time axis is y and Subway's is x.
  - `yearMarks` gives, in both modes, the lines and labels `drawLoom` drew before this task
    (compare with the attributes the existing year-marker tests in `test/loom-draw.test.ts`
    already assert).

- [ ] **Step 2: Run them and see them fail** for the right reason:
  `nix shell --inputs-from . nixpkgs#nodejs -c node --test overlays/topLevel/socal-nug-braid-js/test/morph.test.ts`

- [ ] **Step 3: Implement** `yearMarks` in `src/loom-draw.ts` and have `drawLoom` use it, then
  `src/morph.ts`.

- [ ] **Step 4: Run the checks**, each its own command, all passing:
  `nix build .#checks.x86_64-linux.braid-engine --no-link -L`,
  `nix build .#checks.x86_64-linux.braid-types --no-link -L`,
  `nix build .#checks.x86_64-linux.braid-smoke --no-link -L`.
  This task changes `loom-draw.ts`, which the bundle is built from, so rebuild the bundle as
  Global Constraints says and confirm
  `nix build .#checks.x86_64-linux.braid-bundle-fresh --no-link -L` passes.

- [ ] **Step 5: Commit.**

### Task 2: the page morphs

**Files:**

- Modify: `overlays/topLevel/socal-nug-braid-js/src/main.ts`
- Modify: `sass/css/pages/origins.scss`
- Modify: `overlays/topLevel/socal-nug-braid-js/browser/check.ts`
- Modify: `overlays/topLevel/socal-nug-braid-js/browser/cdp.ts` only if a check needs something
  it lacks
- Modify: `static/js/braid.js` (rebuilt)

**Interfaces:**

- Consumes: everything Task 1 produces; `fitZoom` from `src/zoom.ts`; `centreLoomIn`,
  `placeLoom` from `src/loom-place.ts`; `drawLoom` from `src/loom-draw.ts`.
- Produces: no exports. The class `is-morphing` on `#origins-braid` while a morph runs, which
  the browser check reads.

Requirements, in the page script:

- One place makes a mode's layout and remembers the promise, so the first draw, the layout made
  1500 ms after the first draw, and a switch all share it and the engine never lays one mode out
  twice. A layout that fails is forgotten, so it can be tried again.
- `morph(next)` falls back to the existing `draw(next)` when there is no picture on screen yet,
  when a morph is already running, when `matchMedia("(prefers-reduced-motion: reduce)")`
  matches, or when `morphBetween` returns null. In the last case the page has already been put
  in the new mode to measure it, so the fallback must leave nothing of that measuring behind.
- Otherwise, in this order, with nothing painted between the first and the last of the
  measuring steps:
  1. Close any open card.
  1. Measure where things are: the box's rectangle, its scroll position, how far it can scroll,
     each roster card's rectangle, the roster box's rectangle. How far the box can scroll is
     found by setting its scroll position past any possible end and reading back where it
     stopped, then putting it back. The sizes the box reports overstate it when room is kept
     for a scrollbar.
  1. Put the page in the new mode (`data-mode` on the box and on `#origins-layout`), centre the
     new layout in the box's new width, and work out the zoom to arrive at: the new mode's fit
     if the zoom was last set by the Fit button, else the present zoom.
  1. Draw the new mode's picture, size it for that zoom, put it in the box, and measure again:
     the box, how far it can scroll, each card, the roster box, the roster list's height, the
     layout's top left corner. Then put the old picture back and restore its scroll position.
  1. Build the morph with Task 1, giving it each label's drawn width
     (`getComputedTextLength()`).
  1. For the journey: add `is-morphing` to the box; make `#origins-layout` the thing the cards
     are positioned against; give the roster list the height it will need so the page does not
     jump; set every label's `text-anchor` to `start`.
  1. Each animation frame, for `t` eased from 0 to 1 over `MORPH_MS`: apply `frameAt` to the
     old picture's elements and its `viewBox`; size the picture by the canvas size times the
     zoom at `t`; size the box between its two measured sizes with its height ceiling lifted;
     place each card absolutely at the position between its two rectangles, with the width
     between its two widths, a minimum height between its two heights, and the opacity design
     point 8 gives it; set the scroll position between where it was and where it lands.
  1. Land: remove everything step 6 and 7 set on the box, the layout, the list and the cards;
     put the new picture in the box; take on the new zoom; set the scroll position it lands
     at; wire hover and keyboard as `draw` does.
- While a morph runs: a press on a mode button or a zoom button returns at once, and the window
  resize handler does nothing. When it lands, if the box is not the width the landing was drawn
  for, redraw for the width it is.
- The zoom "was last set by Fit" from a press on Fit until any other zoom button or a Ctrl
  wheel zoom.
- 1500 ms after the first picture is drawn, start the other mode's layout.

In `sass/css/pages/origins.scss`: while the box has `is-morphing` it hides its overflow and
answers no pointer.

- [ ] **Step 1: Write the failing browser checks** in `browser/check.ts`, each named for what a
  visitor would notice, none naming a moment or a person. Reach scroll positions the way the
  file already does where it matters; for setting a starting share of the way along, setting
  the scroll position directly is fine. They must cover:
  - switching modes takes time and passes through something that is neither picture: the box
    has `is-morphing` after the press and loses it within three seconds.
  - when it lands the picture is the one a fresh visit draws: the box's SVG after a switch to
    Subway equals, attribute for attribute and child for child apart from its inline size, the
    SVG of a page loaded in Subway. The same back to River.
  - nothing is left behind: no `style` attribute on the box, on `#origins-layout`, on the roster
    list or on any roster card, and every card is back inside the roster.
  - the view lands the same share of the way along, from the start, the middle and the end,
    measured against how far each box can really scroll, and a round trip returns to the
    scroll position it left.
  - a fitted view arrives fitted: after Fit and a switch there is nothing left to scroll to in
    the new mode, and pressing Fit there changes nothing.
  - a press on the other mode button while it moves changes nothing: it lands in the mode first
    asked for, and the buttons show that mode.
  - the zoom buttons do nothing while it moves.
  - a window made narrower while it moves ends with the picture drawn for the box as it then
    is: the same picture a fresh visit at that size draws.
  - with reduced motion asked for (`Emulation.setEmulatedMedia` with the feature
    `prefers-reduced-motion: reduce`), the switch is instant: the new picture is there and the
    box never has `is-morphing`.
- [ ] **Step 2: Run them against the page as it is and see them fail** (all but reduced motion,
  which already passes): `nix run .#socal-nug-braid-browser`
- [ ] **Step 3: Implement** in `src/main.ts` and `sass/css/pages/origins.scss`. Rebuild the
  bundle.
- [ ] **Step 4: Run** `nix run .#socal-nug-braid-browser` (every check, old and new, passing)
  and `nix flake check` (passing).
- [ ] **Step 5: Commit.**

### Task 3: the spec, the README and the site test (controller)

**Files:**

- Modify: `docs/superpowers/specs/2026-11-21-origins-design.md`

- Modify: `README.md` if its description of the browser check needs it

- Modify: `overlays/topLevel/socal-nug-test-site/test_site.py`

- [ ] Replace the spec's statement that switching modes does not animate with the design above,
  as built, and why the earlier objection (a pill is wide in one mode and tall in the other) no
  longer holds. Record the owner's choices: the layout made for every visitor after load,
  ignoring presses while it moves, cards crossing the picture.

- [ ] Bring the spec's account of the checks up to date: the unit tests for the morph, the
  browser check's count and what it now does.

- [ ] Add a site test for the stylesheet rule that stops the box answering the pointer while it
  morphs.

- [ ] Look at the morph in Chromium and Firefox, both directions, both themes, and at the
  reduced-motion switch.

- [ ] `nix flake check`, `nix run .#socal-nug-braid-browser`, commit.
