# Origins Card Order And Lighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder a person's card, send every card link to a new tab, put River's year numbers under their lines, and stop a moment's hover or pick from changing the threads of people whose attendance is not recorded.

**Architecture:** The card builders are pure functions in `src/cards.ts`; the year marks are a pure function in `src/loom-draw.ts`; who a pick lights is a pure function in `src/pick.ts`. The page script (`src/main.ts`) sets classes from state in one function, `relight()`, and the stylesheet dims whoever is not lit. The About page is a Tera template.

**Tech Stack:** TypeScript run directly by node 24 (no npm), esbuild for the committed bundle `static/js/braid.js`, Zola and Sass, a Nix flake whose `nix flake check` is the whole suite, headless Chromium over CDP for `nix run .#socal-nug-braid-browser`.

**Spec:** `docs/superpowers/specs/2026-11-21-origins-design.md`. Daniel asked for these on 2026-11-25; the controller writes them into the spec. Do not edit it.

## Global Constraints

- Work only in `/home/djacu/dev/Socal-Nix-User-Group/socal-nug/.claude/worktrees/how-we-met`. Never `cd` out of it. Never run a bare `git stash`.
- One plain command per shell call: no `&&`, no `;`, no pipes into `git`, no heredocs, no `eval`, no backticks inside a command. `git diff` needs `--no-ext-diff`. There is no `python3` and no `npm`. `grep` is ugrep and rejects patterns with counted repeats.
- Unit tests: `nix shell --inputs-from . nixpkgs#nodejs -c node --test --test-reporter=dot "overlays/topLevel/socal-nug-braid-js/test/*.test.ts"`.
- The suite: `nix flake check`. It must pass before a task is reported done. The build-output tests (`test_site.py`) run only inside it: `nix build .#checks.x86_64-linux.test-site --no-link -L`.
- After any change under `overlays/topLevel/socal-nug-braid-js/src/`, rebuild the bundle in three calls: `nix build .#socal-nug-braid-js --no-link --print-out-paths`, then `cp <printed path>/braid.js static/js/braid.js`, then `chmod u+w static/js/braid.js`.
- The browser check: `nix run .#socal-nug-braid-browser 2>&1 | grep -v "^ok "`, about seven minutes, 93 checks at the start of this plan, all passing. Each task ends with it passing. Run only one at a time.
- A new or rewritten browser check must be seen to fail for the reason it names: against the page before the change, or against a scratch bundle with only that behaviour taken out. The browser checks name no person and no moment.
- Do not edit `data/`, `content/`, the spec, the README or anything not named in the task's Files.
- No refactoring, renaming or tidying beyond what the task needs. No helpers or options for cases the task does not have.
- Comments say why, in the plain voice of the code around them. Refer to people by name, never by a pronoun. No em dashes.
- `scrollIntoView` is not used in page code (`src/`).
- Commits: plain engineer voice, what changed and why, once. Subject starts `origins: `. End every commit message with the trailer `Assisted-by: Claude Code (<your model id>)`. Never a `Co-Authored-By` or "Generated with" line. Name the files on the commit line; never `git commit -a`, `git add -A` or `git add .`. Do not push.

## Review Focus

- A person's card is one builder for the popup and the list: the new order must hold in both, and the popup's X must still sit in the card's corner clear of the name and the badge.
- A link that opens a new tab carries `rel="noopener"`. A click on a link in a card still picks nothing.
- The year numbers are placed by one function that the drawing, the mode switch and the smoke check all read; nothing may place them a second way.
- Who is lit, who is left as they were and who is dimmed must come out of `relight()` and nowhere else, for hover and for a pick alike, and must be right again after a redraw.
- A moment with nobody confirmed at it must leave the whole picture as it was.

______________________________________________________________________

### Task 1: The person's card in a new order, links in new tabs, quotes last on About, years under their lines

**Files:**

- Modify: `overlays/topLevel/socal-nug-braid-js/src/cards.ts`
- Modify: `overlays/topLevel/socal-nug-braid-js/test/cards.test.ts`
- Modify: `overlays/topLevel/socal-nug-braid-js/src/loom-draw.ts`
- Modify: `overlays/topLevel/socal-nug-braid-js/test/loom-draw.test.ts`
- Modify: `sass/css/pages/origins.scss`
- Modify: `templates/about.html`
- Modify: `overlays/topLevel/socal-nug-test-site/test_site.py`
- Modify: `overlays/topLevel/socal-nug-braid-js/browser/check.ts`
- Modify: `static/js/braid.js` (rebuilt)

**Interfaces:**

- Consumes: `personCardFor`, `detailFor` and the private `el` in `src/cards.ts`; `yearMarks(placed, story)` in `src/loom-draw.ts`.
- Produces: nothing for Task 2.

**What to build**

1. **A person's card, in this order** (`personCardFor`; one builder for the popup and the list). The avatar stays where it is. The body holds, top to bottom:
   - a new `div.origins-card-head` holding `span.origins-card-name` and then the membership badge (`span.origins-badge`, as it is built now), so the badge sits on the name's line to its right;
   - `a.origins-card-alias`, the handle;
   - `div.origins-card-links`, when the person has links;
   - `p.origins-card-desc`, when there is a description;
   - `span.origins-card-join`, when the person joined at a meetup;
   - `blockquote.origins-card-quote`, when there is a quote.
     Nothing is added or dropped: the same eight things as before, in a new order.
1. **The stylesheet** for it: `.origins-card-head` is a row, name then badge, `gap: 0.5rem`, centred on the line, wrapping when the card is too narrow for both. Whatever the badge's own rule did to place it on a line of its own goes. Keep the room the popup's X needs in the card's corner.
1. **Every link in a card opens a new tab.** In `personCardFor` the handle and each of the person's own links, and in `detailFor` the "Event page" link, get `target="_blank"` and `rel="noopener"`, as a moment's outside links have already.
1. **The About page** (`templates/about.html`): a member's quote moves to the end, after the description and the links. The handle link and each of the member's own links open a new tab (`target="_blank" rel="noopener"`).
1. **River's year numbers go under their lines** (`yearMarks`). A year's number is drawn where the year begins. In River its baseline is 5px above the line that starts the year; make it 14px below the line instead. Subway's stay as they are, to the right of their lines, and so does the opening year in the corner.

**Tests**

- [ ] **Step 1: Unit tests.** In `test/cards.test.ts`: a test that a person's card with everything (a quote, a description, links, a join line) has, inside `div.origins-card-body`, the children in exactly the order of item 1, with the name and the badge inside the head and in that order; that a card missing each optional part simply lacks it; and that the handle, each own link and a moment's "Event page" link carry `target` `_blank` and `rel` `noopener`. Update any existing test that fixed the old order. In `test/loom-draw.test.ts`: River's boundary year label is 14 below its tick's `y1`; Subway's is unchanged. See them fail first.
- [ ] **Step 2: Site tests** in `test_site.py`: on the built About page, for a member who has a quote, a description and links, the quote's `<blockquote>` comes after the description text and after the links; the handle link and the own links carry `target="_blank"` and `rel="noopener"`. Update the existing About tests that the new order or attributes break, keeping what each asserts. See the new assertions fail first.
- [ ] **Step 3: Browser checks.** New, seen to fail first: "a person's card says who they are, then their handle, their links, what they do, when they joined and their own words": for a person in the list who has all of those (found from the page's data and the card), the tops of badge and name are on one line with the badge to the right, and the handle, links, description, join line and quote follow downward in that order. "every link in a card opens a new tab": every `a` inside the rail has `target` `_blank` and a `rel` containing `noopener`; and the same for the links of a moment's popup card, opened where the popup opens. "River: each year's number is under its line": every boundary year's text box is below its tick line.
- [ ] **Step 4: Implement** items 1 to 5.
- [ ] **Step 5:** Unit tests pass. Rebuild the bundle. `nix flake check`: `all checks passed!`.
- [ ] **Step 6:** The browser check: every check passes.
- [ ] **Step 7:** Look in headless Chromium at a person's card in the list and in the popup (Subway), at the About page, and at River's year numbers, and fix what looks wrong (a scratch script to copy from is `/home/djacu/.claude/jobs/22f8fa89/tmp/onecard-look.ts`).
- [ ] **Step 8: Commit** the files, named on the commit line.

______________________________________________________________________

### Task 2: A moment lights only the people confirmed at it, and leaves the unconfirmed as they were

**Files:**

- Modify: `overlays/topLevel/socal-nug-braid-js/src/pick.ts`
- Modify: `overlays/topLevel/socal-nug-braid-js/test/pick.test.ts`
- Modify: `overlays/topLevel/socal-nug-braid-js/src/main.ts`
- Modify: `sass/css/pages/origins.scss`
- Modify: `overlays/topLevel/socal-nug-braid-js/browser/check.ts`
- Modify: `static/js/braid.js` (rebuilt)

**Interfaces:**

- Consumes: `Passage` in `src/story.ts` (`vouched`: the record says they were there, which includes whoever joined at that meetup and everyone a moment that is not a meetup names; `away`: the record says they were not; neither: in the group then, attendance not recorded). `litBy(story, pick)` in `src/pick.ts`. In `main.ts`: `picked`, `hovered`, `hot`, `over`, `relight()`, the hover wiring for a moment in the map and for a moment's card.
- Produces: nothing for a later task.

**What it is for.** Today a moment hovered or picked lights everyone through it who is not recorded away, and everyone else steps back. At a meetup most people are in neither record, so the picture cannot tell "was there" from "nobody wrote down". After this there are three outcomes for a person when a moment is hovered or picked:

- confirmed there: lit, as now;
- recorded away, or not through the moment at all: stepping back, as now;
- through it with attendance not recorded: no change at all. Not lit, not dimmed, their card not tinted.

A person hovered or picked is unchanged: that person is lit and everyone else steps back.

**What to build**

1. **`src/pick.ts`.** `litBy(story, pick)` for a moment returns the slugs of the people through it who are `vouched` (it returned everyone not away). Add `unsureAt(story: Story, id: string): ReadonlySet<string>`: the slugs of the people through the moment `id` who are neither `vouched` nor `away`; empty for a moment the story does not have.
1. **`src/main.ts`.** The hover handlers for a moment in the map and for a moment's card add only the confirmed people to `hovered`. `relight()` also sets a class `is-unsure` on every `[data-person]` element in the map whose person is in `unsureAt` of the moment under the pointer in the map (`over`), of the moment whose card is under the pointer (`hot`), or of a picked moment, and who is not lit. Nothing else sets or clears that class.
1. **The stylesheet.** The rules that dim whoever is not lit while anyone is lit (`.origins-svg:has(.is-lit)` over threads, beads and faces) leave out `.is-unsure` elements. Nothing else about them changes: an unsure thread is drawn exactly as when nothing is hovered.

**Tests**

- [ ] **Step 1: Unit tests** in `test/pick.test.ts`, with the fixture in `test/story-fixture.ts` (`nug3` records daniel there and rob away, and david, jared and mica are in the group then with nothing recorded; `nug1` is where jared joined; `camp` names daniel and rob): `litBy` for `nug3` is daniel alone, for `nug1` is jared alone, for `camp` is daniel and rob; `unsureAt` for `nug3` is david, jared and mica, for `camp` is empty, for a moment the story does not have is empty. Update the existing `litBy` test to the new rule. See them fail first.
- [ ] **Step 2: Browser checks.** The helper that says who a moment lights (`cameTo`) becomes "confirmed at": through and `vouched`. Every check that uses it then expects the new set; read each to see that it still asserts what it names. New, seen to fail first: "hovering a meetup lights who was confirmed there, dims who was away or not yet in the group, and leaves everyone else as they were": choose from the page's data a meetup with at least one person confirmed, at least one neither confirmed nor away, and at least one away or not through it; hover its pill; the confirmed people's threads have `is-lit`; an unconfirmed person's thread does not have `is-lit` and its computed `opacity` is what it was before the hover; an away or absent person's thread has an `opacity` under 0.5; and the unconfirmed person's card in the list is not tinted. The same three for a click on that meetup's card in the list (a pick), and nothing left on anyone after letting go. And: "hovering a meetup with nobody confirmed at it changes nothing", if the data has one (a meetup where nobody joined and no record names anyone there); if it has none, say so in the report and leave the check out.
- [ ] **Step 3: Implement** items 1 to 3.
- [ ] **Step 4:** Unit tests pass. Rebuild the bundle. `nix flake check`: `all checks passed!`.
- [ ] **Step 5:** The browser check: every check passes.
- [ ] **Step 6:** Look in headless Chromium at a meetup hovered in River and say what you saw: which threads were bright, which unchanged, which faint.
- [ ] **Step 7: Commit** the files, named on the commit line.
