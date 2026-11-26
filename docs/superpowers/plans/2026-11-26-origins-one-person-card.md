# Origins One Person Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a person the same way on the Origins page and on the About page: the same content in the same order, in the arrangement Daniel chose, with each About profile in a box.

**Architecture:** On Origins a person's card is built by `personCardFor` in `src/cards.ts`, for the list and for the popup. On About a member's profile is written by the Tera template `templates/about.html`. The two keep their own markup and their own look; what is made the same is what they say and in what order. Where a person joined is worked out twice, by the engine from the story and by the template from the same data, and a browser check holds the two pages to the same words.

**Tech Stack:** TypeScript run directly by node 24 (no npm), esbuild for the committed bundle `static/js/braid.js`, Zola (Tera, Sass), a Nix flake whose `nix flake check` is the whole suite, headless Chromium over CDP for `nix run .#socal-nug-braid-browser`.

**Spec:** `docs/superpowers/specs/2026-11-21-origins-design.md`, section "The card's order, links, years and who a moment lights". Daniel chose the arrangement on 2026-11-26 from mock-ups (`.superpowers/sdd/origins-loom-pictures/card-order3.html`, option G). The controller writes it into the spec; do not edit the spec.

## Global Constraints

- Work only in `/home/djacu/dev/Socal-Nix-User-Group/socal-nug/.claude/worktrees/how-we-met`. Never `cd` out of it. Never run a bare `git stash`.
- One plain command per shell call: no `&&`, no `;`, no pipes into `git`, no heredocs, no `eval`, no backticks inside a command. `git diff` needs `--no-ext-diff`. There is no `python3` and no `npm`. `grep` is ugrep and rejects patterns with counted repeats.
- Unit tests: `nix shell --inputs-from . nixpkgs#nodejs -c node --test --test-reporter=dot "overlays/topLevel/socal-nug-braid-js/test/*.test.ts"`.
- The suite: `nix flake check`. It must pass before the task is reported done. The build-output tests (`test_site.py`) run only inside it: `nix build .#checks.x86_64-linux.test-site --no-link -L`.
- After any change under `overlays/topLevel/socal-nug-braid-js/src/`, rebuild the bundle in three calls: `nix build .#socal-nug-braid-js --no-link --print-out-paths`, then `cp <printed path>/braid.js static/js/braid.js`, then `chmod u+w static/js/braid.js`.
- The browser check: `nix run .#socal-nug-braid-browser 2>&1 | grep -v "^ok "`, about seven minutes, 99 checks at the start of this plan, all passing. The task ends with it passing. Run only one at a time.
- A new or rewritten browser check must be seen to fail for the reason it names. The browser checks name no person and no moment.
- Do not edit `data/`, `content/`, the spec, the README or anything not named in the task's Files.
- No refactoring, renaming or tidying beyond what the task needs. No helpers or options for cases the task does not have.
- Comments say why, in the plain voice of the code around them. Refer to people by name, never by a pronoun. No em dashes.
- A link to another site opens a new tab with `rel="noopener"`; a link to this site stays in the tab.
- Commits: plain engineer voice, what changed and why, once. Subject starts `origins: `. End every commit message with the trailer `Assisted-by: Claude Code (<your model id>)`. Never a `Co-Authored-By` or "Generated with" line. Name the files on the commit line; never `git commit -a`, `git add -A` or `git add .`. Do not push.

## Review Focus

- The two pages must say the same thing about every member: name, membership, handle, links, description, quote and where they joined, in that order. Where they joined is computed in two places; a member for whom the two disagree is the failure to look for.
- A person's card on Origins is one builder for the list and the popup: the arrangement must hold in both, the popup's X must stay clear of the name and the badge, and a click on a link in a card must still pick nothing.
- The mode switch lifts and carries the list's cards; the card's new inner layout must leave nothing for it to trip on.
- The About page is also a page people read without the Origins script: it must not depend on JavaScript, and a guest must still not appear in its grid.
- A member with no picture, no quote, no description, no links of their own or no meetup joined must still come out right on both pages.

______________________________________________________________________

### Task 1: One arrangement for a person on Origins and on About

**Files:**

- Modify: `overlays/topLevel/socal-nug-braid-js/src/cards.ts`
- Modify: `overlays/topLevel/socal-nug-braid-js/test/cards.test.ts`
- Modify: `sass/css/pages/origins.scss`
- Create: `sass/css/pages/about.scss`
- Modify: `sass/css/style.scss` (to bring the new file in, as it brings in the other page files)
- Modify: `templates/about.html`
- Modify: `overlays/topLevel/socal-nug-test-site/test_site.py`
- Modify: `overlays/topLevel/socal-nug-braid-js/browser/check.ts`
- Modify: `static/js/braid.js` (rebuilt)

**Interfaces:**

- Consumes: `personCardFor(thread, story, doc, dismissable = true)` and `joinLineFor` in `src/cards.ts`. In `templates/origins.html`: how the page finds the people (`get_section(path="about/_index.md")`), the meetups (`get_section(path="events/_index.md")`, sorted by `extra.event.date`), the moments (`load_data(path="data/moments.toml")`, `data.moment`) and a person's slug (`p.slug`).
- Produces: nothing for a later task.

**The arrangement** (the same on both pages; Daniel's choice):

```
[picture]  Name  [MEMBER]
           @handle  link  link

Description, across the whole card.

  "Quote", across the whole card.

Joined at <meetup>, <date>
```

The picture sits beside two lines only: the name with the membership badge after it, and under that the handle and the person's own links together on one line that wraps. Everything after runs under the picture at the card's full width: the description, then the quote, then where they joined. A part a person does not have is left out and nothing takes its place.

**What to build**

1. **Origins** (`personCardFor`). The card holds, in order: `div.origins-card-top` (the picture as now, then `div.origins-card-who` holding `div.origins-card-head` with the name and the badge, and `div.origins-card-links` with `a.origins-card-alias` first and then each `a.origins-card-link`); `p.origins-card-desc`; `blockquote.origins-card-quote`; `span.origins-card-join`; and the X when dismissable. `div.origins-card-body` goes. The links row is always there, since everyone has a handle.
1. **Origins stylesheet.** The card is a column; the top is a row with the picture and the two lines beside it, centred against each other; the handle and the links share one line, wrapping, the handle in the same size as the links; the description, quote and join line take the full width, with the spacing between them the card's parts have now. The popup's X stays in the card's corner, clear of the name and the badge.
1. **About** (`templates/about.html`). A member's profile becomes the same arrangement in About's own look (the 128px picture, the Bulma title): the picture beside the name with a "Member" badge after it and, under the name, the handle and the member's own links on one line; then the description, the quote, and where they joined, at the profile's full width. The badge and the join line are new on this page. The handle and own links open a new tab, as now.
1. **Where a member joined, on About.** The same words the Origins card says: `Joined at <title>, <date>`. The rule, which is `joinLineFor`'s: among the moments that are meetups (an event of the events section, or a dated moment with `trunk = true`) and that name the member in `people`, the earliest by date; its title; its date written at the precision the data gives (`19 September 2023` for a day, `April 2023` for a month, `2023` for a year). A meetup's title and date are the event page's. A member no such moment names has no join line. Work it out in the template from the same data `templates/origins.html` reads.
1. **About's box and quote.** Each profile sits in a box: a background a little off the page's (use the page's own Bulma variables so it follows the light and dark themes; do not hard-code a colour), padding inside, the two boxes of a row the same height. The quote's box loses most of its padding: about `0.5em 0.9em` where Bulma gives `1.25em 1.5em`. These rules go in the new `sass/css/pages/about.scss`.

**Tests**

- [ ] **Step 1: Unit tests** in `test/cards.test.ts`: the card's children are, in order, the top (picture, then the block with the head and the links row), the description, the quote, the join line, and the X only when dismissable; the head holds the name then the badge; the links row holds the handle first, then each own link; each optional part missing is simply absent; the handle and own links carry `target` `_blank` and `rel` `noopener`. Update the tests the old structure breaks, keeping what each asserts. See them fail first.
- [ ] **Step 2: Site tests** in `test_site.py`, seen to fail first: on the built About page, for a member who has everything, the parts come in the arrangement's order (name, badge, handle, own links, description, quote, join line); every member's profile has the badge; a member the data has joining at a meetup has a join line naming that meetup; each profile is inside the box element; a guest is still absent from the grid. Update the existing About tests the new markup breaks, keeping what each asserts.
- [ ] **Step 3: Browser checks**, seen to fail first.
  - Rewrite "a person's card says who they are, then their handle, their links, what they do, when they joined and their own words" for the arrangement, in the list and in the popup: the name, badge, handle and links are beside the picture (their boxes start to the right of the picture's right edge, and the handle and the first own link are on one line); the description, quote and join line start at the picture's left edge, below the picture's bottom, in that order downward; the popup's X is clear of the name and the badge.
  - New: "the About page and the Origins page say the same about every member": for every member in the page's data, read from the Origins card and from the About profile the name, the badge's word, the handle's text and address, each own link's text and address, the description, the quote and the join line, and find them equal, part for part; and the parts come in the same order on both. Quote marks the stylesheet adds are not text and do not count.
  - New: "About: every profile is in its own box, and the boxes of a row are the same height": each profile's box has a background that is not the page's, no two boxes overlap, and two boxes side by side at 1400px have the same top and bottom.
- [ ] **Step 4: Implement** items 1 to 5.
- [ ] **Step 5:** Unit tests pass. Rebuild the bundle. `nix flake check`: `all checks passed!`.
- [ ] **Step 6:** The browser check: every check passes.
- [ ] **Step 7:** Look in headless Chromium, light and dark: a person's card in the Origins list and in the popup (Subway); the About grid at 1400px and at 390px; a member with a quote and one without; a member with no links of their own. Compare with the chosen mock-up (`.superpowers/sdd/origins-loom-pictures/card-order3/origins-g.png` and `about-g.png`) and fix what does not match its arrangement.
- [ ] **Step 8: Commit** the files, named on the commit line.
