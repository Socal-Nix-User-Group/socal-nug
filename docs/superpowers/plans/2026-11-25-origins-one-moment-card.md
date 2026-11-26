# Origins One Moment Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a moment's card in the list the same card its popup shows, and open the popup only where the lists sit under the map.

**Architecture:** One builder, `detailFor` in `src/cards.ts`, makes a moment's card for the popup and for the list, as `personCardFor` does for a person. The page script (`src/main.ts`) decides at each click in the map whether the rail is beside the map, by where the two are on the page, and opens the popup only when it is not. The stylesheet gives the one card its treatment inside the list.

**Tech Stack:** TypeScript run directly by node 24 (no npm), esbuild for the committed bundle `static/js/braid.js`, Zola and Sass for the page, a Nix flake whose `nix flake check` is the whole suite, and headless Chromium over CDP for `nix run .#socal-nug-braid-browser`.

**Spec:** `docs/superpowers/specs/2026-11-21-origins-design.md`, section "One card for a moment, and the popup only under the map". Where it and an older section disagree, it is right. The controller owns the spec; do not edit it.

## Global Constraints

- Work only in `/home/djacu/dev/Socal-Nix-User-Group/socal-nug/.claude/worktrees/how-we-met`. Never `cd` out of it. Never run a bare `git stash`.
- One plain command per shell call: no `&&`, no `;`, no pipes into `git`, no heredocs, no `eval`, no backticks inside a command. `git diff` needs `--no-ext-diff`. There is no `python3` and no `npm`. `grep` is ugrep and rejects patterns with counted repeats; use `-n`, `-A`, `-B`.
- Unit tests: `nix shell --inputs-from . nixpkgs#nodejs -c node --test --test-reporter=dot "overlays/topLevel/socal-nug-braid-js/test/*.test.ts"`.
- The suite: `nix flake check`. It must pass before a task is reported done.
- After any change under `overlays/topLevel/socal-nug-braid-js/src/`, rebuild the bundle in three calls: `nix build .#socal-nug-braid-js --no-link --print-out-paths`, then `cp <printed path>/braid.js static/js/braid.js`, then `chmod u+w static/js/braid.js`.
- The browser check: `nix run .#socal-nug-braid-browser`, about seven minutes, 85 checks at the start of this plan, all passing. Each task ends with it passing. Run only one at a time.
- A new or rewritten browser check must be seen to fail for the reason it names: against the page before the change, or against a scratch bundle with only that behaviour taken out. Say in the report what it printed.
- The browser checks name no person and no moment; they take what they need from the page's own data.
- Do not edit `data/`, `content/`, `templates/`, the spec, the README or anything not named in the task's Files.
- No refactoring, renaming or tidying beyond what the task needs. No helpers or options for cases the task does not have. No validation of values that come from inside the engine.
- Comments say why, in the plain voice of the code around them. Refer to people by name, never by a pronoun. No em dashes.
- `scrollIntoView` is not used in page code (`src/`).
- Commits: plain engineer voice, what changed and why, once. Subject starts `origins: `. End every commit message with the trailer `Assisted-by: Claude Code (<your model id>)`. Never a `Co-Authored-By` or "Generated with" line. Name the files on the commit line; never `git commit -a`, `git add -A` or `git add .`. Do not push.

## Review Focus

- A moment's card now holds links. A click on one must follow the link and pick nothing, in the list and in the popup's copy.
- The popup's card and the list's card for the same moment are both `.origins-detail-card[data-moment]`. Anything that selects one must not catch the other: the popup's is inside the map (`#origins-braid`), the list's inside the rail (`#origins-roster`).
- Whether the rail is beside the map is read when a click happens, not remembered: the window can be resized and the mode switched between clicks.
- Beside the map, nothing may open or be marked open: no popup, no `is-open`, no focus pulled anywhere by a pointer click.
- Under the map, everything the popup did before must still happen: placement, the X, Escape, focus going in for the keyboard and back out, a click elsewhere closing it.
- Escape must send focus back to the map only when focus is where the keyboard's Enter put it. A reader who has clicked or tabbed somewhere else keeps the place they chose.
- The mode switch lifts and carries the list's cards. They are taller now and hold links; nothing the switch sets may be left on them.

______________________________________________________________________

### Task 1: One card for a moment

**Files:**

- Modify: `overlays/topLevel/socal-nug-braid-js/src/cards.ts`
- Modify: `overlays/topLevel/socal-nug-braid-js/test/cards.test.ts`
- Modify: `overlays/topLevel/socal-nug-braid-js/src/main.ts`
- Modify: `sass/css/pages/origins.scss`
- Modify: `overlays/topLevel/socal-nug-braid-js/browser/check.ts`
- Modify: `static/js/braid.js` (rebuilt)

**Interfaces:**

- Consumes: `detailFor(gathering, people, doc)`, `momentsFor`, `listsFor`, `personCardFor(thread, story, doc, dismissable = true)` and the private `dismissFor` in `src/cards.ts`. In `main.ts`: `relight()`, `pickInMap`, the moment cards' wiring where the rail is filled, and `wireHover`.
- Produces, for Task 2: `detailFor(gathering, people, doc, dismissable = true)`. A moment's card in the list is `ul.origins-moments > li.origins-moments-item > div.origins-detail-card[data-moment]`, with class `is-trunk` when the moment is a meetup, and no X. The class `origins-moment-card` and everything named `origins-moment-card-*` no longer exist anywhere.

**What to build**

1. **The builder.** `detailFor` takes a fourth parameter, `dismissable = true`, as `personCardFor` does: with `false` the card has no X. Its card gains the class `is-trunk` when `moment.trunk`. `momentsFor` puts `detailFor(gathering, people, doc, false)` in each item. `momentCardFor` and `NAMES_SHOWN` are deleted.
1. **The script.** Wherever `main.ts` finds a moment's card in the rail by `.origins-moment-card`, it finds `.origins-detail-card` there instead (in `relight()`, in `pickInMap`, and where the rail's moment cards are wired). The moment card's click handler ignores a click on or inside an `a`, as the person card's does.
1. **The stylesheet.** Delete the rules for `.origins-moment-card` and `.origins-moment-card-*`. `.origins-detail-card`'s left edge becomes `var(--origins-muted)`, and `var(--origins-trunk)` for `.is-trunk`. Inside the list (`.origins-moments .origins-detail-card`) the card takes what the compact card had as a tile: `cursor: pointer`, the `background` transition, the `is-lit` tint and the `is-picked` tint and outline, with the same values the roster's person card uses for each. `min-width: 0` so a long title cannot widen its row. In the narrow block `.origins-moments-item` becomes `flex: 0 0 19rem`.
1. Nothing else about the popup changes in this task: it still opens everywhere.

**Tests**

- [ ] **Step 1: Unit tests in `test/cards.test.ts`.** Remove the tests of `momentCardFor` (title and date, meetup told apart, names of a moment off the ribbon, names of a meetup, joiner first, exactly four names, no line of names, avatar) and write these in the moments' section, using the file's helpers:

  - the list of moments is one detail card for each moment in the story's order: every `li.origins-moments-item` holds one `div` whose class has the token `origins-detail-card` and whose `data-moment` is that moment's id (keep the existing order assertion, against the new class);
  - a card in the list has no X and its popup's twin has one: for one moment, the nodes made by `momentsFor` include no `button` and no element with `data-origins-dismiss`, and those made by `detailFor(gathering, PEOPLE, doc)` include exactly one;
  - a card in the list says what the popup's card says: for `scale` (six people) and for `nug1`, the texts of every node made by `detailFor(g, PEOPLE, doc, false)` equal the texts of every node made by `detailFor(g, PEOPLE, doc)` with the X's own text taken out, in order. For `scale` the people line names all six, with no "more";
  - a meetup's card is told apart: the card for `nug1` has the token `is-trunk`, the card for `camp` does not, with `dismissable` true and false alike;
  - `listsFor` still makes the two panes (keep the existing test).

  Run the unit tests and see the new ones fail before changing `cards.ts`.

- [ ] **Step 2: Browser checks in `browser/check.ts`.** The selector helper for a moment's card in the rail and every literal `.origins-moment-card` become `.origins-detail-card` scoped to the rail. New checks, written before the page changes:

  - "a moment's card in the list says what its card in the map says": for a moment that has a blurb and at least one link (take the first such from the page's data), open its popup by a click on its pill and compare the popup card's text with the X taken out, and its links' `href`s, against the list card's text and links: equal.
  - "a click on a link in a moment's card picks nothing": as the existing check for a person's card does (navigation stopped in the page, focus blurred before reading), on the first link of a moment's card in the list; and a click on the same card off its links does pick it.
  - "a narrow window: a moment's card in its row is as wide as a person's": at 900px wide, the first moment card's width is within 1px of the first person card's.

  Run the browser check against the page as it is and record what fails: the three new checks must fail, and so will every existing check that looks for a moment's card in the rail, since the class is not there yet. List them in the report.

- [ ] **Step 3: Implement** items 1 to 3.

- [ ] **Step 4:** Unit tests pass. Rebuild the bundle. `nix flake check`: `all checks passed!`.

- [ ] **Step 5:** `nix run .#socal-nug-braid-browser`: every check passes.

- [ ] **Step 6:** Look at River at 1400px, Subway at 1400px and River at 900px in headless Chromium (a scratch script that takes screenshots is at `/home/djacu/.claude/jobs/22f8fa89/tmp/lists-look.ts`; its moment-card selector is the old class and needs the new one). Fix what looks wrong: text running out of a card, a card with no edge colour, a link that cannot be told from text.

- [ ] **Step 7: Commit** the six files, named on the commit line.

______________________________________________________________________

### Task 2: The popup only where the rail is under the map

**Files:**

- Modify: `overlays/topLevel/socal-nug-braid-js/src/main.ts`
- Modify: `sass/css/pages/origins.scss`
- Modify: `overlays/topLevel/socal-nug-braid-js/browser/check.ts`
- Modify: `static/js/braid.js` (rebuilt)

**Interfaces:**

- Consumes: from Task 1, the list's `div.origins-detail-card[data-moment]`. In `main.ts`: `showMoment`, `showPerson`, `openAt`, `openPopup`, `closePopup`, `openedBy`, `markOpen`, `pickInMap`, `relight`, the `keydown` handler on `document` for Escape, `mount` (the map's box, `#origins-braid`), `roster` (the rail, `#origins-roster`).
- Produces: nothing for a later task.

**What to build**

1. **Beside or under.** The rail is beside the map when its left edge is at or past the map's right edge, read from `getBoundingClientRect()` of `roster` and `mount` at the time of asking. With no rail on the page it is not beside. This is the only test; do not repeat the stylesheet's breakpoint or look at the mode's name.
1. **A click in the map, beside.** `showMoment` and `showPerson` open no popup and mark nothing open when the rail is beside the map: they pick and glide the list (`pickInMap`), and nothing else. Under the map they do what they do now.
1. **The keyboard, beside.** When Enter or Space opens a moment or a face (`openAt` with the keyboard) and the rail is beside the map, focus moves to that card in the list, without the browser scrolling anything to it (`focus({ preventScroll: true })`; the list is already gliding there). The card is made focusable for this by the script (`tabindex="-1"`), and is not a tab stop. What had focus in the map is remembered, as `openedBy` remembers it for the popup. Escape, which already lets go of the pick, sends focus back to it when focus is still on that card or inside it, and not otherwise.
1. **The stylesheet.** A card in the rail that has focus from the keyboard shows it: `.origins-roster .origins-card:focus-visible` and `.origins-moments .origins-detail-card:focus-visible` take `outline: 3px solid var(--origins-ink); outline-offset: -3px`.
1. A redraw closes the popup already (`draw` calls `closePopup`), which is what a switch from Subway to River or a window widened past 1024px needs. Keep it so.

**Tests** (`browser/check.ts`)

- [ ] **Step 1: Move the popup's checks to where the popup is.** Every existing check that opens the popup now needs the rail under the map. These run in River at 1400px today and move to Subway (or, where the check is about River's own geometry, are restated): "a click on a card in a list opens no card in the map", "card: clicking empty page closes it without moving the page", "a click on a moment's card in the list closes a card open in the map", "card: opened by keyboard, Escape returns focus to the dot that opened it", "card: closing with the X leaves focus on the dot it belonged to", "a side moment's oval keeps a changed outline while its card is open", "a moment's avatar opens its moment's card, in the place a click on the moment opens it", "grab: a drag that starts on a moment moves the map and does not open its card", "grab: moving the map leaves an open card open", "a moment's card in the list says what its card in the map says" (from Task 1). Each keeps its claim and every assertion it has; only where it runs changes, and whatever of its set-up depended on River's shape. Find any other check that waits for the popup in River by reading the file, and treat it the same way. The checks already in Subway or on a phone-sized screen stay.

- [ ] **Step 2: Restate for River, beside the map.**

  - "a click on a face in the map marks that person's card and glides the people's list until the card is in the middle of it" no longer waits for a popup: it asserts none opened.
  - "opened from the keyboard, a moment is picked and its card in the list is marked" becomes "beside the map, Enter on a moment picks it, moves focus to its card in the list, and Escape sends focus back": after Enter no popup is open, the moment's pill and card have `is-picked`, the people through it are lit, and `document.activeElement` is that card; after Escape nothing has `is-picked` and `document.activeElement` is the pill that had focus. Then a second part: Enter again, move focus elsewhere (focus the first zoom button from the page), Escape: focus stays where it was put.
  - New: "beside the map, a click on a moment opens no card, marks its card in the list and glides the list to it": River at 1400px, a moment whose card is past the end of its list; after the click and the list settling, no popup is open, nothing in the map has `is-open`, the pill and the card have `is-picked`, the card is in the middle of its list, and the page and the map have not scrolled.
  - New: "beside the map, a picked moment's oval keeps its changed outline": the stroke of the picked pill's oval, with the pointer away, differs from what it was before the click.
  - New: "a narrow window: a click on a moment in River opens its card in the map": River at 900px wide, where the rail is under the map: the popup opens.
  - New: "a window widened until the lists are beside the map closes the card that was open": River at 900px, open a moment's popup, widen to 1400px and wait for the redraw: no popup is open and the pick is still marked.

  Run the browser check against the page as Task 1 left it and record what each new or restated check prints. They must fail; the moved ones must pass where they now run.

- [ ] **Step 3: Implement** items 1 to 4.

- [ ] **Step 4:** Rebuild the bundle. `nix flake check`: `all checks passed!`.

- [ ] **Step 5:** `nix run .#socal-nug-braid-browser`: every check passes.

- [ ] **Step 6:** For each new check whose failure in Step 2 does not show the behaviour it names, show it can fail with a scratch bundle that has only that behaviour taken out, and put the source back exactly (compare with a saved copy).

- [ ] **Step 7:** Look in headless Chromium: River at 1400px with a moment clicked in the map (no popup, card in the middle of its list, lit); Subway at 1400px with a moment clicked (popup open, as before); River at 1400px after Enter on a moment (the focus ring on the card).

- [ ] **Step 8: Commit** the four files, named on the commit line.
