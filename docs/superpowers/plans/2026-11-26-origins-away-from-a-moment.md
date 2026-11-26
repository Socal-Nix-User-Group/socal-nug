# Origins Away From A Moment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the record say a person was away from a moment that is not a meetup, and draw it as an absence from a meetup is drawn: their thread runs to the moment, breaks either side of it, and a hollow bead sits in their slot. The first use is Daniel Baker, away from Nix Vegas 2025.

**Architecture:** `away` is already a list on a record anchored to a meetup. It becomes allowed on a dated moment that is not a meetup. The validator (`verify_moments.py`) gains the rules for it, the template carries the list into the page's JSON, and the story (`src/story.ts`) puts the person through the moment, marked away. Placement, drawing, the morph and the lighting already work from a passage's `away` and need no new rule.

**Tech Stack:** Python (the validator and the site tests, run only inside Nix), Zola (Tera), TypeScript run directly by node 24 (no npm), esbuild for the committed bundle `static/js/braid.js`, a Nix flake whose `nix flake check` is the whole suite, headless Chromium over CDP for `nix run .#socal-nug-braid-browser`.

**Spec:** `docs/superpowers/specs/2026-11-21-origins-design.md`, sections "Moments", "What a thread through a meetup means" and "The layout engine", and the bullet "Still to come: away from a moment that is not a meetup" in "The card's order, links, years and who a moment lights". Daniel asked for this on 2026-11-25 and agreed to the drawing described under Goal. The controller writes the change into the spec; do not edit the spec.

## Global Constraints

- Work only in `/home/djacu/dev/Socal-Nix-User-Group/socal-nug/.claude/worktrees/how-we-met`. Never `cd` out of it. Never run a bare `git stash`.
- One plain command per shell call: no `&&`, no `;`, no pipes into `git`, no heredocs, no `eval`, no backticks inside a command. `git diff` needs `--no-ext-diff`. There is no `python3` and no `npm`. `grep` is ugrep and rejects patterns with counted repeats.
- Unit tests: `nix shell --inputs-from . nixpkgs#nodejs -c node --test --test-reporter=dot "overlays/topLevel/socal-nug-braid-js/test/*.test.ts"`.
- The suite: `nix flake check`. It must pass before a task is reported done. The validator's fixtures run in `nix build .#checks.x86_64-linux.braid-data --no-link -L`, the build-output tests in `nix build .#checks.x86_64-linux.test-site --no-link -L`, the engine through the real layout in `nix build .#checks.x86_64-linux.braid-smoke --no-link -L`.
- A new file is invisible to `nix flake check` and `nix build` until it is staged with `git add <file>`.
- After any change under `overlays/topLevel/socal-nug-braid-js/src/`, rebuild the bundle in three calls: `nix build .#socal-nug-braid-js --no-link --print-out-paths`, then `cp <printed path>/braid.js static/js/braid.js`, then `chmod u+w static/js/braid.js`.
- The browser check: `nix run .#socal-nug-braid-browser 2>&1 | grep -v "^ok "`, about seven minutes, 101 checks at the start of this plan, all passing. Task 2 ends with it passing. Run only one at a time.
- A new browser check must be seen to fail for the reason it names. The browser checks name no person and no moment: they find what they need in the page's data and fail if the data has none.
- Nothing changes for a meetup. No existing test, fixture or check of a meetup's `there` and `away` is weakened or deleted; one is changed only where this plan names it.
- Do not edit the spec, the README or anything not named in the task's Files.
- No refactoring, renaming or tidying beyond what the task needs. No helpers or options for cases the task does not have.
- Comments say why, in the plain voice of the code around them. Refer to people by name, never by a pronoun. No em dashes.
- Commits: plain engineer voice, what changed and why, once. Subject starts `origins: `. End every commit message with the trailer `Assisted-by: Claude Code (<your model id>)`. Never a `Co-Authored-By` or "Generated with" line. Name the files on the commit line; never `git commit -a`, `git add -A` or `git add .`. Do not push.

## Review Focus

- The same person named in `people` and in `away` on one moment, or away from a moment dated before any moment they are at: the validator must reject both, and the made-up histories must never make either. A thread whose first stop is a hollow bead says nothing true.
- A moment that is not a meetup and accounts for the whole group, some of it away, is on the ribbon: each member is in their own slot there and nobody closes ranks over an absence.
- Someone away is never named on the moment's card and never counted in what a screen reader says for it.
- Someone away from a moment does not also pass it by: one thread, one place.
- The picture of the real data after the change: Daniel Baker's thread leaves the ribbon for Nix Vegas 2025 and comes back. No thread may run through another moment's pill, a face, a label or an avatar because of it.

______________________________________________________________________

### Task 1: The record may say who was away from a moment that is not a meetup

**Files:**

- Modify: `overlays/topLevel/socal-nug-braid-data/verify_moments.py`
- Create: `overlays/topLevel/socal-nug-braid-data/tests/away-dated-valid.toml`
- Create: `overlays/topLevel/socal-nug-braid-data/tests/away-dated-also-there.toml`
- Create: `overlays/topLevel/socal-nug-braid-data/tests/away-dated-before-first.toml`
- Create: `overlays/topLevel/socal-nug-braid-data/tests/away-dated-meetup.toml`
- Modify: `checks/default.nix` (the `expect_` lines of the `braid-data` check)
- Modify: `templates/origins.html`
- Modify: `overlays/topLevel/socal-nug-test-site/test_site.py`

**Interfaces:**

- Consumes: `check_attendance(entries)` and `when(moment)` in `verify_moments.py`; the dated-moment block of the data in `templates/origins.html` (the loop after "Everything events cannot know").
- Produces: in the page's JSON every dated moment carries `"away"`, an array of slugs, empty when the record has none. Task 2's engine reads it; `src/parse.ts` already does.

**The rule.** A dated moment that is not a meetup (no `event`, no `trunk`) may carry `away`, a list of profile slugs: the record says each was not there. The validator rejects, naming the record:

| Case                                                                                                                        | The message must contain        |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `there` on any dated moment, as today                                                                                       | `anchored to an event`          |
| `away` on a dated moment with `trunk = true` (the founding is a meetup, and a meetup's attendance is on an anchored record) | `anchored to an event`          |
| a person in both `people` and `away` of one dated moment                                                                    | `both there and away`           |
| a person away from a moment with no moment before it that they are at                                                       | `before any moment they are at` |

A person is at a moment when a record names them in `people`: a dated moment's `people`, or an anchored record's, which is the meetup they joined at. "Before" compares `when()` of the two records, strictly. An unknown slug in `away` is already rejected by `check_people`. The rules for a record anchored to an event do not change.

- [ ] **Step 1: Fixtures and the check's lines, seen to fail.** Each fixture is the smallest file that makes its point, in the shape of `tests/attendance-valid.toml` (a root, the founding with `trunk = true`, real slugs from `content/about/`, real event slugs). Add to `checks/default.nix`, beside the attendance lines:

```
expect_fail away-dated-also-there.toml     'both there and away'
expect_fail away-dated-before-first.toml   'before any moment they are at'
expect_fail away-dated-meetup.toml         'anchored to an event'
expect_clean away-dated-valid.toml
```

`away-dated-valid.toml` has a dated moment after the founding that names one member in `people` and another in `away`. `away-dated-before-first.toml` records someone away from a moment dated before the first moment that names them. `away-dated-meetup.toml` puts `away` on the founding. Stage the new files, then run the `braid-data` check: it fails on `away-dated-valid.toml` being rejected.

- [ ] **Step 2: The validator.** Change `check_attendance` to the rule above. The message for `there` on a dated moment, and for either list on a dated meetup, keeps the words `anchored to an event`.
- [ ] **Step 3:** The `braid-data` check passes, every line `ok`.
- [ ] **Step 4: Site tests, seen to fail.** In `test_site.py`: every dated moment in the page's data carries an `away` list; and, built from a copy of the site whose `data/moments.toml` gains an `away` entry on one dated moment (the way `test_a_second_attendance_record_adds_to_its_event_and_to_no_other` adds a record), that moment's `away` is that entry and no other moment's lists change.
- [ ] **Step 5: The template.** Each dated moment's object gains `"away"`, from `m.away` with an empty list as the default, beside `"people"`.
- [ ] **Step 6:** `nix flake check`: `all checks passed!`. The page is unchanged: no record carries the new entry yet.
- [ ] **Step 7: Commit** the files, named on the commit line.

______________________________________________________________________

### Task 2: A person away from a moment is drawn at it, broken, with a hollow bead

**Files:**

- Modify: `overlays/topLevel/socal-nug-braid-js/src/story.ts`
- Modify: `overlays/topLevel/socal-nug-braid-js/src/focus.ts`
- Modify (comments that say "meetup" where the rule is now any moment): `src/types.ts`, `src/parse.ts`, `src/loom-graph.ts`, `src/loom-place.ts`, `src/loom-draw.ts`, `src/cards.ts`, `src/pick.ts`
- Modify: `overlays/topLevel/socal-nug-braid-js/test/story.test.ts`, `test/focus.test.ts`, `test/pick.test.ts`, `test/cards.test.ts`, `test/loom-place.test.ts`, `test/loom-draw.test.ts`, `test/histories.test.ts`, `test/inspect.test.ts`
- Modify: `overlays/topLevel/socal-nug-braid-js/smoke/histories.ts`, `smoke/inspect.ts`
- Modify: `overlays/topLevel/socal-nug-braid-js/browser/check.ts`
- Modify: `data/moments.toml` (the header comment and the record `nix-vegas-2025`)
- Modify: `static/js/braid.js` (rebuilt)

**Interfaces:**

- Consumes: Task 1's `"away"` on a dated moment, which `parseData` already reads into `Moment.away`. The test fixture `at(id, date, people, trunk, { away })` in `test/story-fixture.ts`.
- Produces: `Passage.away` is true at any moment whose record lists the person away. `Gathering.through` at a moment that is not a meetup is the people it names and the people it lists away, in slot order. Nothing else changes shape.

**The story's rules** (`buildStory`):

1. Who is through a moment that is not a meetup: the people it names, and anyone it lists away. Someone in both lists is through it once.
1. A passage is away wherever the moment's record lists the person away, meetup or not: not vouched, not a join. Listed in both, away wins, as it does at a meetup.
1. Everything that follows from "through" holds as it is written: someone away has a slot (their own on the ribbon, packed in slot order off it), is on the thread's path, does not pass the moment by, and counts toward "everyone in the group is through it", so a moment that names the whole group but for those away is on the ribbon.

**What is said about a moment:** `describeGathering` counts the people at a moment that is not a meetup, not those away from it, and a moment with nobody at it stops at its date as now. The moment's card already names only `people`.

- [ ] **Step 1: Unit tests, seen to fail.**
  - `test/story.test.ts`:
    - "someone away from a moment that is not a meetup is through it in slot order, marked away, and everyone it names is vouched for": `buildStory([...MOMENTS, at("conf", "2024-09", ["rob", "daniel"], false, { away: ["mica"] })], PEOPLE)`; `conf`'s `through` as `[slug, slot, away, vouched, joined]` is `["daniel", 0, false, true, false]`, `["rob", 1, false, true, false]`, `["mica", 2, true, false, false]` (the fixture's slot order is daniel, david, rob, jared, mica: check it against the story and use what it gives), and `conf` is not on the ribbon.
    - "someone away from a moment does not pass it by, and it is on their thread": in the same story `conf.passing` has no `mica`, and mica's `path` includes `conf`.
    - "a moment that names everyone in the group but those away from it is on the ribbon, each in their own slot": a moment after `nug2` naming four of the five members with the fifth away has `onRibbon` true, `slots` 5, and each passage's slot equal to the person's place in `story.order`.
    - "someone both named at and away from a moment that is not a meetup is through it once, away".
    - The existing "nobody is away but someone the record lists away at a meetup" still passes untouched.
  - `test/focus.test.ts`: "a moment that is not a meetup counts who was there, not who was away": two named and one away says `2 people`; one named and one away says `1 person`.
  - `test/pick.test.ts`: at such a moment `litBy` has the named and not the away, and `unsureAt` is empty.
  - `test/cards.test.ts`: "the card of a moment that is not a meetup names nobody who was away from it".
  - `test/loom-place.test.ts` and `test/loom-draw.test.ts`: with the same extra moment, the thread of the person away stops `AWAY_GAP` short of its box and starts again `AWAY_GAP` after it at their slot across it, in both modes; and there is a hollow bead at their slot there.
- [ ] **Step 2: Implement** the story's rules and `describeGathering`. Bring the comments that say an absence is only ever at a meetup into line, in the files named above, changing no code in them.
- [ ] **Step 3: The made-up histories and the inspector** (`smoke/`).
  - `histories.ts`: every history records someone away from a moment that is not a meetup twice: once at a moment that stays off the ribbon, and once at a moment that is on the ribbon because of it (it names everyone else in the group). Whoever is recorded away is in the group at the moment's date and not named at it. Draw these after everything the generator already draws, so every earlier draw is as it was for a seed.
  - `test/histories.test.ts`: "every history has someone away from a moment that is not a meetup, off the ribbon and on it", and "nobody is away from a moment that names them, or from one before their first".
  - `inspect.ts`: a recorded absence is someone the record lists away from any moment they are through, not only a meetup. The two findings that follow from it (a thread inside the box of a moment its person is away from; a hollow bead missing, or one where nobody is away) then cover both kinds.
  - `test/inspect.test.ts`: the two findings for a moment that is not a meetup, beside the ones for a meetup.
- [ ] **Step 4:** Unit tests pass. Rebuild the bundle.
- [ ] **Step 5: The data.** In `data/moments.toml` the record `nix-vegas-2025` gains `away = ["daniel-baker"]`. The header comment's paragraph on `there` and `away` gains the rule for a dated moment: it may carry `away` and never `there`, with what `away` draws, and the two things the validator rejects. Add nothing about why Daniel was away.
- [ ] **Step 6: Browser checks**, each seen to fail first (with the data change in and the old bundle, or the reverse).
  - "someone recorded away from a moment that is not a meetup has a hollow bead in its pill": for every such passage in the page's data, a `circle.origins-bead.is-away` of that person whose centre is inside that moment's pill, in River and in Subway.
  - "hovering a moment that is not a meetup lights who was at it and dims someone away from it as far as someone who was never there": the named are lit, the person away is not lit, not unsure, and drawn at the strength of a person the moment does not name.
  - "a moment that is not a meetup neither names nor counts someone away from it": its card in the list of moments does not have the name of the person away, and the pill's spoken label counts only the people at it.
- [ ] **Step 7:** `nix flake check`: `all checks passed!`. If the smoke check finds the real picture wrong (a thread through a pill, a face, a label or an avatar), stop and report it with the finding; do not loosen the inspector.
- [ ] **Step 8:** The browser check: every check passes.
- [ ] **Step 9: Look** in headless Chromium at the built site, River and Subway, light and dark: the stretch of the map around Nix Vegas 2025, at rest and with that moment hovered. Report the picture's size in each mode and what Daniel's thread does there.
- [ ] **Step 10: Commit** the files, named on the commit line.
