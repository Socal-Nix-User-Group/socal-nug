# Origins

Date: 2026-11-21. Branch `worktree-how-we-met`, based on `main` after the CI rework (#98).

This is the page's one current spec, kept up to date with the code; it was last brought up to
the code on 2026-11-23. The page was first built around a central trunk and then redrawn as the
Loom. The reasoning for the redraw and what was measured along the way are in
`2026-11-22-origins-loom-design.md`, which is a dated record and is not kept up to date. Where
the two differ, this one is right.

## Intent

A page showing the separate paths that converged into the SoCal Nix Users Group, computed from
event records rather than drawn by hand.

The picture is a loom. Every person is one thread from their first moment to their last, visible
all the way through. Every moment is a gathering of some of those threads: the founding is three
threads gathering, a meetup is everyone in the group gathering, a camp is the few who went.
There is no central trunk standing for "the group"; the group is the threads that are in it,
running side by side as a ribbon that holds one column from the founding to the latest meetup.
The picture has two modes over the same layout: River, where time runs down the page, and Subway,
where it runs across.

Two audiences. Members should feel how improbable the group was: a set of unrelated lives that
happened to intersect. Newcomers should see that the group has roots, and where they would attach
if they showed up.

The existing "One Year of SNUG" blog post is what this is not. It is a hand-authored linear
timeline where every connection is typed into the markup, and it cannot be extended without
rewriting the story. That post stays as it is; this is a separate page with a different job.

## Goals

- Adding a person to the picture means adding their moments. There is no connection list, edge
  list or adjacency table to maintain by hand.
- The picture stays legible as the group grows from six people to forty.
- A newcomer who has never heard of any of these people can read it.
- People come from the existing `content/about/` profiles. No parallel person list.
- Everything that can be validated by `nix flake check` is.
- The data set is deliberately incomplete at launch and gets backfilled over time. Several people
  will first appear at the founding or at a meetup with no personal history behind them. Their
  thread simply starts there, with their face at that point. Adding earlier moments later
  lengthens threads back in time and must require no engine, template or schema change. The
  page must never look broken because somebody's history has not been collected yet, and it
  must not look like a placeholder either.
- One thread per person, unbroken from their first moment to their last, in both River and
  Subway. Nothing in the picture stands for the group except the threads that are in it.
- Each moment is as wide as the number of people through it, with each person's thread in its
  own slot, so threads through a busy moment stay apart and can be told from one another.
- The picture says what is known about attendance and no more (see "What a thread through a
  meetup means").
- A gathering that everyone in the group is at sits on the ribbon, meetup or not. Only a
  gathering of part of the group draws threads away from it.
- The ribbon holds one column (River) or one row (Subway) from the founding to the latest
  meetup.

## Non-goals

- Replacing the About page. Origins is a new page. About keeps its member grid.
- Editing or replacing the "One Year of SNUG" post.
- Complete attendance records. A meetup may record who was there and who was away, optionally,
  and the picture is complete with none recorded. Filling them in is Daniel's, whenever he likes.
  The page started with no attendance records at all; that position was reversed by the Loom.
- Self-hosting. Netlify keeps building until that separate project lands.
- Moving layout out of the visitor's browser. Layout runs in the page and the page is busy while
  it runs; moving it to build time is a later infrastructure decision, not part of this page.
- A second view such as a spiral. That is a separate project.
- A dark canvas, glowing threads or woven over-and-under crossings. The picture follows the
  site's light and dark themes.
- A time scrubber, a detail panel in place of cards, or time-proportional spacing. Moments are
  spaced by rank, one layer each.
- Formatting of templates, SCSS or TypeScript. treefmt covers Nix, shell and documentation
  Markdown only, and that is unchanged.

## Anti-goals

- Any claim about who met whom. Two people sharing a moment means two threads passed through one
  point in time. It does not assert an introduction.
- A second layout engine. One pass computes abstract positions; projections consume them. If
  River and Subway ever need separate position logic, the design has failed.
- A layout that silently degrades as the group grows, where the right answer at six people is the
  wrong answer at forty.
- A bead the record does not support. Attendance is never inferred: not from membership, not from
  a photo nobody has read into the data, not from "probably".
- A thread drawn through a meetup for someone the record says was away from it. Theirs stops
  short of it and starts again after it.
- A ribbon that jogs sideways, shipped without saying so.
- A layout failure that reads as the author's mistake. When the site's own data lays out badly
  the check fails, and it says plainly that the layout is at fault and not the change, and that
  it wants a maintainer.
- Two models of the story. The trunk model was deleted, not kept alongside.

## Constraints

Verified in this worktree on 2026-11-21 unless noted.

- **`render = false` removes a page from `section.pages`.** Setting it on
  `content/events/2023-07-08.md` dropped the page from disk *and* from the events listing, and the
  build reported it as an orphan. A section of event files that templates can read but that do not
  each become a page is therefore not available in Zola 0.23.6.
- **`load_data` reads a top-level `data/` directory.** `load_data(path="data/test.toml")` from
  `templates/child.markdown.html` parsed the TOML and made it available to Tera.
- **`json_encode` HTML-escapes under `{{ }}`.** The probe emitted `&quot;` for every quote. Inside
  a `<script type="application/json">` block it must be `| json_encode | safe`, or `JSON.parse`
  will fail.
- **Top-level front matter keys do not reach Tera.** A profile carrying both `member = true` at
  the top level and `member = true` under `[extra]` rendered `toplevel=[UNDEFINED] extra=[true]`.
  Zola does not reject the unknown top-level key, so the build succeeds and the value is simply
  absent. Anything the templates must read belongs under `[extra]`.
- **Profile pages already render** at `/about/<slug>/` with Zola-slugified names
  (`content/about/daniel.baker.md` becomes `/about/daniel-baker/`).
- **`templates/faq.html` is dead code.** `content/faq.md` sets
  `template = "child.markdown.html"`. Noted only so nobody edits `faq.html` expecting an effect.
  Removing it is out of scope.
- Netlify cannot run Nix (CI design doc, 2026-10-31). Until self-hosting lands, any build step
  beyond `zola build` plus the calendar script has to be mirrored in `netlify.toml`.
- Flakes only see git-tracked files. New files must be staged before any `nix` command, or the
  build and the formatting check will not see them.
- `socal-nug-site` restricts its source with `lib.fileset` to the inputs Zola reads:
  `config.toml`, `content`, `data`, `sass`, `static` and `templates` (`data` was added for this
  page). Any new top-level directory Zola reads must be added there or the Nix build will differ
  from a local `zola build`.
- The site supports light and dark themes. Anything drawn must work in both.

## Approaches

This section is the record of what was considered, including what was built and later replaced.
What is built now is under "Decisions".

### Connection semantics

1. Participation equals acquaintance: every pair at a moment gets a line. Rejected. It is false
   at a five-person booth and unreadable at a forty-person meetup.
1. Explicit `met = [[a, b]]` pairs on each moment. Rejected. Accurate, but it is a hand-maintained
   edge list wearing a data file as a disguise, which is the thing this page exists to avoid.
1. Threads pass through a shared node, with no claim about handshakes. **Chosen.** It is true,
   it stays legible at any size, and "these lives passed through this moment" is the reading the
   page wants.

### Shape

1. Origin story ending at NUG #1. Rejected. Finished in 2023 and only changes when history is
   backfilled.
1. Living braid. Built first, then replaced by the Loom. Personal threads before convergence,
   then a SNUG trunk that thickened as people joined at the moment they first appeared, and
   excursions where subsets of the group peeled off for a camp or a conference and came back.
   Its known weakness was that the post-convergence half risked being one undifferentiated rope,
   and people disappeared into the trunk once they joined.
1. **The Loom.** Chosen, and what is built. Every person keeps their own thread all the way
   through, every moment is a gathering the threads pass through, and there is no trunk. The
   meetups line up in one column, the ribbon, and a gathering of part of the group draws only its
   people's threads out of it. A newcomer can still see where they would attach: at the end of
   the ribbon. The reasoning is in `2026-11-22-origins-loom-design.md`.

### Layout

Vertical river, horizontal subway map, and per-person swimlanes were all mocked up. Swimlanes were
dropped: legible and cheap, but it reads as a project schedule, and one row per person wastes the
page at forty members. River and Subway were both kept, because they are the same layout
transposed and the toggle is therefore nearly free.

How the picture is laid out went through two engines: a hand-written lane allocator in the style
of `git log --graph`, and then the Eclipse Layout Kernel. Why, and what each cost, is under "The
layout engine" below.

The Loom kept ELK and both modes. Three ways of drawing a loom were sketched on the real data:
each person in a fixed lane with no layout engine; ELK with the trunk removed and moments as dots,
rejected on sight because ELK laid the threads on top of one another between meetups; and ELK
with each moment as wide as the people through it and a fixed slot for each person, which was
chosen. The pictures, the timings and the numbers behind the choice are in the Loom design.

### Rendering

1. Build-time generation by a Python tool, in the manner of `socal-nug-make-event-ical`. Works
   without JavaScript, testable, zero new dependencies, but fixed geometry and no animation.
1. **Client-side TypeScript.** Chosen, with the no-JavaScript cost accepted explicitly: without
   JavaScript there is no picture. A rendered fallback list stood in for one at first and was
   later removed; see Accessibility. Chosen for the interaction headroom: hover highlighting,
   cards beside what was clicked, and keyboard movement through the story. A morph between
   projections was part of the reason at first and went with the Loom.
1. Pure Tera. Rejected. Lane assignment and label collision in a template language with no
   functions and no recursion is not worth attempting.

### Toolchain

1. Plain ES modules, no build step. Cheapest, but no types on the geometry.
1. **esbuild from nixpkgs (0.27.2).** Chosen. TypeScript and minification with no
   `package.json`, no `package-lock.json`, no `npmDepsHash`, and nothing new for dependabot. Fits
   the overlay convention exactly.
1. Full npm toolchain. Rejected for now. Most capability, but it adds a dependency ecosystem and,
   during the Netlify interim, a third build definition of the same artifact.

Note: `node:test` is built into the pinned nodejs (24.21.0, verified), so unit tests need no
runner dependency under any of these options.

## Decisions

### Page and navigation

- `content/origins.md`, `template = "origins.html"`, served at `/origins/`.
- Nav item "Origins" in `partials/base.navigation.html`, after "About Us".
- Title and description chosen for link previews, since this is a page people will share.

"Timeline" was rejected as a name: it describes the thing the page deliberately is not. "History"
was rejected as institutional and as a collision with the Blog and the anniversary post. "How We
Met" was the runner-up. "Origins" was chosen for being one word that sits cleanly in the nav. Its
one weakness is that it suggests beginnings while the page keeps growing, so the page's own
heading and description should carry the living part explicitly.

### People

People stay in `content/about/*.md` and gain one required field, under `[extra]`:

```toml
[extra]
member = true   # or false for someone in the story who is not in the group
```

- It must be under `[extra]`. A top-level `member = true` builds with no error and is undefined
  in Tera (see Constraints), so an About filter on it would silently empty the Members grid.
- `profiles.json` gains `member` as required under `extra`.
- `templates/about.html` filters `section.pages` to `profile.extra.member == true`, so the About
  grid is unchanged for visitors.
- The join key is the Zola slug (`daniel-baker`), not the filename stem.
- Guest profiles relax the other requirements. `name` and `alias` stay required for everyone;
  `description`, `image_url` and `profile_url` become required only when `extra.member` is true,
  through a conditional subschema. `verify_post.py` calls `jsonschema.validate` with no format
  checker, so `format: "uri"` is advisory and an empty string already passes. Only `required` is
  enforced, which is why the conditional is necessary rather than cosmetic.

Consequence, accepted: guests get a rendered page at `/about/<slug>/` like everyone else.
`render = false` would suppress it but would also remove them from `section.pages`, which is where
the page reads people from. A thin guest page is the cheaper cost.

Guests may fill in `image_url` and `description` or leave them empty. The page handles both.

Two more fields under `[extra]` are optional for everyone:

```toml
quote = "..."                                     # their own words
links = [{ title = "...", url = "https://..." }]  # their own sites
```

- `quote` is shown as a quotation, above the description, on the person's Origins card and on
  the About grid. `description` is prose about them and reads as the site talking; a quote reads
  as them. The About grid did not show it at first: the field was split out of `description` for
  the card, the About template was never taught it, and Mica's line dropped off that page until
  Daniel asked where the quotes were. `profiles.json` does not describe `quote`, so nothing
  checks it.
- `links` is the same shape as a moment's `links`. `profile_url` is the person's GitHub, which
  the alias links to; `links` is anywhere else they want to be found. Each is shown by its title,
  under the description, on the About grid and on the person's Origins card. They are plain links
  that open in the same tab, like the alias beside them. The titles in the data are the sites'
  host names, which is a habit and not a rule. `profiles.json` requires a title and a url on each
  entry, and the engine's parser rejects an entry without them.

There is one guest in the data: Matthew Croughan, who organizes Nix Camp and is at every one, was
at SCaLE 20x and 21x, and has been at every NixCon since 2024. NixCon 2024 is in the data for
Matthew alone: nobody from the group is thought to have been there, so it is a moment that names
only a guest, which the page draws like any other moment off the ribbon. That is what the
mechanism is for: the page is meant to show people who are part of the story without listing
them as members of the group. `test_site.py` checks
that Matthew is on the Origins page and not in the About grid, and proves the About filter with
a probe as well, so it does not rest on whoever happens to be a guest.

Daniel Baker, "Dan" and `@djacu` are one person with one slug, `daniel-baker`. The anniversary
post's "Dan, Daniel and Ben" is three separate people: Daniel Baker, Daniel Fullmer, and Ben.
Two different Daniels, which is a trap worth knowing about before reading any of the old
material. Fullmer is deliberately out of the initial data set and Ben gets no profile, so of
that trio only `daniel-baker` carries a thread.

### Moments

The page merges two sources in the template.

**`content/events/` supplies the meetups.** Every event page is a meetup, contributing its date,
title and permalink. Posting a meetup grows the picture with no edit anywhere else. The meetup
history is already exact in the event pages, and it is never copied.

**`data/moments.toml` supplies the rest**: the personal moments before and outside the group, the
records of which event each person first turned up to, and any attendance recorded for a
meetup. Event files carry no attendee list and are not gaining one, so a join is stated once here
instead of by editing event files.

```toml
# A freestanding moment carries its own date and title.
[[moment]]
id = "tweag"
date = "2022-02-21"
title = "Started at Tweag"
people = ["daniel-baker"]
blurb = "..."                                  # optional
photo = "/blog/one-year-snug/..."              # optional
avatar = "/images/moments/nix-camp.png"        # optional; the event's own mark
links = [{ title = "...", url = "https://..." }]  # optional; one moment can be two places at once

# A moment anchored to an event resolves date and title from the event page.
[[moment]]
id = "tristan-joins"
event = "2024-01-25"
people = ["tristan-ross"]

# A record anchored to an event may also say who was there and who was away.
[[moment]]
id = "nug-6-roll"
event = "2024-06-01"
there = ["daniel-baker", "david-nuon"]   # the record vouches for them being at this meetup
away = ["rob-hernandez"]                 # the record says they were not
```

A moment carries either `date` plus `title`, or `event`. Never both: restating an event's date in
the moments file is exactly the drift this design exists to prevent. `braid-data` rejects a
moment with both, a moment with neither, a dated moment with no title, and an `event` that does
not resolve to a file in `content/events/`.

- On a record anchored to an event, `people` means who joined at that event. The template takes
  only `people`, `there` and `away` from such a record and merges every record anchored to one
  event, so several records may anchor to one meetup. A blurb, photo or links on an anchored
  record are not shown; the meetup's card links to its event page instead.
- In the page's JSON a meetup carries `people` (who joined there), `there` and `away`, each an
  array, empty when nothing is recorded. Existing records need no change, and the picture is
  complete with no `there` or `away` anywhere.
- `there` and `away` are lists of profile slugs. The validator rejects, naming the record: an
  unknown slug in either; either list on a record that is not anchored to an event (a dated
  moment says who was there with `people`); the same person in `there` and `away` for one event,
  across all its records; a person in either list for a meetup earlier than the one they joined
  at, or with no join record at all (before joining they were not in the group, and being there
  earlier would make that the meetup they joined at); and a person recorded `away` from the
  meetup they joined at.
- `date` accepts `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. Precision is inferred from the format, never
  padded. A moment known only as "some time in April 2023" is written `2023-04` and displayed as
  "April 2023", not as an invented first-of-the-month. Much of the early history is fuzzy, and a
  page about remembering should not state precision it does not have. `braid-data` rejects any
  other date format, and any date that does not exist.
- Imprecision shows in words, not in the axis or the shape. Spacing is rank-based, so there is no
  proportional axis to stretch a moment along, and a fuzzy moment is drawn like any other. Its
  card and its screen reader label state the precision it actually has ("April 2023", "2021").
  Its label in the picture is its title. A fuzzy date sorts at the start of its span.
- `trunk = true` marks a moment as a meetup. Every event page is one automatically; in the
  moments file only the founding carries it. People join only at a meetup, and a meetup is
  always on the ribbon. The word is the data's and the page's JSON's; the engine takes it to mean
  "a meetup".
- The ribbon starts at the founding of the group (`2023-04`, month precision), not at SCaLE 20x.
  SCaLE is where two threads touched; the group did not exist for another month. SCaLE is
  therefore an ordinary shared moment, and the short stretch between the two, where the founders
  travel together but are not yet a group, is deliberate.
- The founding moment's people are the three co-founders: `daniel-baker`, `david-nuon`,
  `rob-hernandez`. All three profiles say "Co-founder", and all three appear in the founder chat
  in the anniversary post.
- The data has to carry personal moments before the first meetup. That is the premise of the
  page: without them every thread starts at or after the founding and there are no separate
  paths to show converging. The engine cannot enforce it, so `braid-data` warns when no moment
  predates the first `trunk` moment.
- Every meetup is a moment on the ribbon automatically, whether or not a moment references it. An
  anchored moment adds people to a meetup; it does not create one. The ribbon therefore carries
  every meetup without the moments file listing a single one.
- A person named only in a `blurb` needs no profile. `braid-data` validates `people`, `there`
  and `away` entries, not prose. Ben was on the SCaLE 20x booth and gets no thread; he is named
  in the telling and that is all.
- Influence without presence is modelled as a separate moment, not a new field. The worked
  example below has since been removed from the data, but the rule stands for the next time
  somebody causes something they were not at. Ron Efroni
  reserved the Nix booth at SCaLE 20x but was not there. That is a moment on Ron's thread
  (`people = ["ron-efroni"]`) dated shortly before the booth itself. Ron's thread exists, sits
  next to the moment it caused, and the picture never claims he was in the room. A `caused_by`
  link between moments was rejected for the same reason the `met` pair list was: it is a
  hand-maintained edge list wearing a data file as a disguise.
- A moment with one person is where their thread starts or a solo beat. A moment with several
  gathers those threads.
- A gathering away from the group needs no new syntax. A moment that is not a meetup, dated after
  the group began and naming people already in it, is written like any other shared moment. It is
  drawn as its own moment with those people's threads through it: on the ribbon when it names
  everyone in the group at its date, beside the ribbon otherwise. Nix Camp in autumn 2023 is one
  beside it; SCaLE 22x, which everyone was at, is on it. Adding someone to the group takes such
  a moment off the ribbon until the record names them at it too, as happened when Samuel Raumin
  was added.
- `links` on a freestanding moment is a list of `{ title, url }`; `braid-data` rejects an entry
  without both.
- `avatar` on a freestanding moment is the event's own mark: what a face is to a person. It is a
  site path to a square image under `static/images/moments/` made to sit in a circle (see
  "Event marks" below). `photo` is of the day; the avatar is the same for every year an event
  keeps its mark. Like `photo`, it is not shown on a record anchored to an event.
- Every shared moment is stated exactly once, in one place, chronologically readable.

One file rather than per-person files because `load_data` takes a single literal path and Tera has
no glob, so per-person data would mean one `load_data` call per profile with a constructed path and
a missing-file case to handle. The merge-conflict cost of a single append-only file is small for a
group this size.

`data/` is in the `lib.fileset` in `overlays/topLevel/socal-nug-site/package.nix`.

### Event marks

Daniel asked for conferences and camps to carry their own marks, as people carry faces. The
fifteen conference and camp moments have one. Eight images are vendored in
`static/images/moments/`, each a 256px PNG, so the page asks no other site for them:

| File                 | Moments               | Made from                                         | Treatment            |
| -------------------- | --------------------- | ------------------------------------------------- | -------------------- |
| `nix-camp.png`       | Nix Camp 2022 to 2026 | `nix.ug/assets/nix.camp/logo.png`                 | cut to a circle      |
| `nix-vegas-2025.png` | Nix Vegas 2025        | `nix.vegas/img/2025/favicon.png`                  | on a dark disc       |
| `nix-vegas-2026.png` | Nix Vegas 2026        | `nix.vegas/img/2026/favicon.png`                  | on a dark disc       |
| `nixcon-2022.png`    | NixCon 2022           | `2022.nixcon.org/images/nixcon2022.svg`           | on a white disc      |
| `nixcon-2024.png`    | NixCon 2024           | `2024.nixcon.org/logo.svg`                        | on a white disc      |
| `nixcon-2025.png`    | NixCon 2025           | `2025.nixcon.org/favicon.svg`                     | cut to a circle      |
| `nixcon-2026.png`    | NixCon 2026           | `2026.nixcon.org/static/icon.svg`                 | as it is, on nothing |
| `scale.png`          | SCaLE 20x to 23x      | `socallinuxexpo.org/themes/custom/scale/logo.svg` | as it is, on nothing |

- Each was fetched on 2026-11-24 and drawn onto a 256px canvas in headless Chromium by a script
  that is not in the repository. The ground is part of the image, so the page draws every mark
  the same way and cuts nothing: a mark that is one colour on nothing (Nix Vegas's gold, NixCon
  2024's black line work) would vanish in one theme or the other without it.
- NixCon and Nix Vegas change their mark each year, so each year has its own file. NixCon 2025's
  wordmark is white on nothing, so its site's icon, a sun, stands for it.
- The two moments SCaLE shared with PlanetNix, and the one it shared with NixCon NA, carry
  SCaLE's mark. A moment has one avatar.
- Nix Camp's own page shows a unicorn; the tents are the logo Daniel found on nix.ug.
- **In the picture.** A moment's avatar is drawn 24px across, before its label's text in River
  and above it in Subway, and it is shown again, at 44px, beside the title in the moment's card.
  Three ways were mocked up on the real page: the size of a face (36px), 24px, and the card
  alone. It was built at 36px, which was the recommendation; Daniel saw that on the real page
  and chose 24px. The size is one constant, `MOMENT_AVATAR` in `src/elk.ts`. Leaving room for
  fifteen of them took River from 741px by 2805px to 764px by 2968px, and Subway from 6136px by
  579px to 6148px by 592px.
- **Against the text.** In River every avatar stands 6px from the start of its label's text.
  It did not at first. The room kept for a label is a flat 6.4px a character, which is more
  than most titles are drawn at and by a different amount for each, and an avatar set at the
  far end of that room stood 8px from "NixCon", 15px from "Nix Vegas" and 33px from "SCaLE 22x
  / PlanetNix". Daniel asked for them to be close and alike. The avatar is now placed by how
  wide the text is drawn: `textWidth` in `src/elk.ts` adds up each character's width in Barlow
  at 11px, from a table measured in headless Chromium, which comes within about half a pixel
  of the fifteen titles as the browser draws them. The label is then drawn at exactly that
  length (`textLength`, adjusting the gaps between letters), so the distance holds in whatever
  font the reader's browser ends up with: in Barlow the adjustment is about half a pixel over
  a whole title at most, and in a fallback font the title is closed up or opened out to fit
  rather than running into its avatar. A title that would be drawn wider than the room kept
  for it is held to the room. The room itself is unchanged, so no other label and no layout
  moved for this.
- The two Nix Vegas images were made again with the mark filling more of its dark disc. On the
  dark theme the disc hardly shows, so the margin inside it read as more distance from the
  text.
- The avatar is an element of its own beside the moment's pill, not part of the pill's group, so
  the pill keeps its outline, its focus ring and its place in the keyboard's order to itself. It
  carries the moment's id: hovering it lights the people through the moment, and a click on it
  opens the moment's card where a click on the pill opens it, placed against the pill and not
  against the avatar, so the card does not land on the moment's own name. It is not a tab
  stop. Switching modes carries it from one place to the other with everything else.
- **Permission.** These are other people's artwork and none of it is licensed to this site. The
  repositories the files come from carry licences, software licences mostly (MIT, GPL, EUPL) and
  Creative Commons for three sites' content, but none says anything about its logo. Daniel's
  point was that those are licences for software and the art is under copyright. On 2026-11-24
  Daniel made the call to use the marks, not having asked every organiser. An organiser who
  objects gets theirs taken out: delete the file and the `avatar` lines that name it.

### What a thread through a meetup means

Decided by Daniel. This is the one rule a data author must know.

```
the record says they were there    ━━━●━━━   through the moment, with a bead
nothing is recorded                ━━━━━━━   through the moment, no bead
the record says they were not      ━━ ○ ━━   broken at the moment, with a hollow bead
```

- After someone joins, their thread goes through every meetup by default. That says "in the
  group then", and nothing more.
- A bead on a thread inside a moment says the record vouches for that person being there.
- Where the record says a member was away, their thread stays in its own slot but is not drawn
  through the meetup: it stops just short of it and starts again just after it, and a hollow
  bead in their colour sits in their slot inside it, an empty seat. Nothing goes around a
  meetup for an absence. It did at first: the thread left the ribbon and came back. Daniel
  changed it on 2026-11-23, choosing this mark from mock-ups on the real data, because the
  detours were most of the picture's crossings: 164 with them, 104 in River and 106 in Subway
  without, and River about 150px shorter.
- Someone who has not joined yet is not in the ribbon at all: their thread, if it has started,
  passes the meetups wherever the layout routes it. That is the only thing that goes around a
  meetup now, a line that has not reached the ribbon yet.
- At a moment that is not a meetup (a conference, a camp, a personal moment), everyone named was
  there by definition, so every thread through it carries a bead.
- At the meetup where someone joined, they were there by definition, so they carry a bead. It is
  drawn larger, in their own colour, with a ring, because it also marks the join.

A recorded absence is shown only by the broken thread and its hollow bead. It is not listed on
the meetup's card or in its screen reader label, by Daniel's decision. The page carries a short
legend (see "Toggle and responsive behaviour"), because a thread without a bead has to be read as
"in the group then" and not as "attended".

### The layout engine

The engine is in two halves, and the seam between them is the most important line in it. The
first half decides what the picture is made of; the second asks ELK where everything goes and
draws it. The engine's package is still named for the braid it first drew
(`overlays/topLevel/socal-nug-braid-js/`, bundled to `static/js/braid.js`), and so are some of
the page's class names (`origins-braid`, `origins-oval`).

**The story** (`src/story.ts`) reads the moments and decides what the picture is made of, with
nothing positional in it beyond a person's slot across a moment:

1. Moments are ordered by date, ties broken by id, so the same data always draws the same.
1. A join comes only from a meetup naming you in `people`. Nothing is inferred from company
   kept. The people in the group at a moment are everyone who has joined at or before it.
1. Who is through each moment: at a meetup, everyone in the group then, including anyone the
   record says was away, who is marked as away; at any other moment, the people it names.
1. Every person with at least one moment is one thread through the moments they are through, in
   date order, from their first to their last. A meetup they are recorded away from is on it,
   so a thread runs on to a last meetup its person was away from. Someone who never joins has a
   thread through the moments that name them and nothing else.
1. Slot order is one order of people for the whole picture: by the meetup they joined at (people
   who never join go last), then by their first moment, then by slug. Because it is ordered by
   joining, the people in the group at any date are the first so many in it, and two threads keep
   the same side of each other wherever they run together.
1. A moment is on the ribbon when it is a meetup, or when there is a group at its date and
   everyone in it is through it. Nothing before the group exists is on the ribbon. On the ribbon
   a member's slot is their place in the slot order, so their thread stays in one slot from each
   such moment to the next, and a member recorded away keeps theirs. Anyone through it who has
   not joined yet takes the slots after the members'. Off the ribbon the people through it are
   packed, in slot order.
1. A passage through a moment is vouched for where the record says so: at any moment that is not
   a meetup, at the meetup a person joined at, and where a meetup's record lists them under
   `there`. Attendance is never inferred. A passage is away where a meetup's record lists the
   person under `away`; it is then neither vouched for nor a join.
1. Who is passing a moment off the ribbon: the members of the group at its date who are not
   through it, each at their ribbon slot. A thread stops at its person's last moment, so a member
   passes a side moment only if they are through a later one. Nobody passes a moment on the
   ribbon, or a moment before there is a group.

**The placement** (`src/loom-graph.ts`, `src/loom-place.ts`) hands that to the Eclipse Layout
Kernel's layered algorithm and takes back coordinates.

The graph:

- Every moment is a node pinned to its own layer by date through ELK's partitioning, so the time
  axis is ours and not the layering's. ELK decides order within a layer and where lines go.
- A moment's size across the time axis is set by its slots, `max(18, (slots - 1) * 7 + 2 * 8)`
  pixels: a slot every 7px with 8px at each end, a single slot centred. Along the time axis it is
  14px.
- Each person through a moment has two ports on it at their slot: one on the side time comes
  from, one on the side it leaves by, with `elk.portConstraints = FIXED_POS`. That is what keeps
  threads apart; without ports ELK attaches every edge at about the same point. Ports have no
  size, because ELK attaches an edge to a sized port off its corner, a pixel across from the
  slot.
- Each person has a root node, 36px square, where their face goes, one layer ahead of their first
  moment.
- A person's thread is one edge from their root to their first stop and one from each stop's
  outgoing port to the next stop's incoming port. A stop is a moment they are through or a
  pass-through they are passing, in date order. A meetup someone is away from is a stop like any
  other, with their ports at their slot, which is what keeps their thread in the ribbon.
- A pass-through: a side moment that anyone is passing also has an unseen node in its layer,
  `pass:<moment id>`, as wide as the group's slots, with no label, carrying a port pair at the
  ribbon slot of each member passing it. Their threads run straight through it, so only the
  people the moment names leave the ribbon. Without it ELK orders the side moment inside the
  ribbon, next to its people's threads, and every thread beyond it steps out around it.
- A hidden spine holds the ribbon to one column. Each moment on the ribbon and each pass-through
  has one more port pair, half a slot before its first slot, and an edge runs from each of them to
  the next in date order with `elk.layered.priority.straightness = 1000`. It is nobody's thread,
  and it is never placed or drawn. Giving the threads a straightness priority as well takes the
  spine's away, and the ribbon jogs again.
- Labels are handed to ELK as node labels, sized by their text and cut with an ellipsis past
  150px. That is what makes it leave room for them: they become part of the node's margin,
  nothing else is placed there, and edges route around them. A moment with an avatar asks for a
  larger label box and gets room for the avatar the same way: 24px and a 6px gap wider in River,
  where the avatar stands before the text, and as much taller in Subway, where it sits on top
  of it.
- River is direction DOWN with labels beside nodes; Subway is direction RIGHT with labels above.
  The same graph, laid out twice, which is what lets the picture morph from one to the other
  (see "Toggle and responsive behaviour").
- The other options are layered layout with network simplex node placement and polyline routing,
  30px between layers in River and 60px in Subway, node spacing 28, edge-to-node 20, edge-to-edge
  7, label-to-node 12, padding 40 and thoroughness 20.

From ELK's output, `loom-place.ts` makes each moment's box and centre, the point of each person's
slot inside it, each label's anchor, the centre of each moment's avatar in the label's box (the
text is on the box's middle line in River and its last line in Subway, which for a box one line
tall is where it always was; see "Event marks" for how the avatar is set against the text),
each pass-through's box (kept apart from the moments, with
no centre or label), each face's centre, and a polyline per edge saying whose thread it is and
which nodes it runs between. Each polyline is carried on from the port on a box's edge to the
person's slot inside it, at both ends, so one person's edges meet inside the moment and the
thread is unbroken. The exception is an end at a meetup its person is away from. It is not
carried to the slot: the point ELK gave on the box's edge is replaced by one 3.5px short of the
box on the way in, and 3.5px past it on the way out, along the time axis at the slot's place
across. The thread is 3px wide with round caps, so what shows is a break that starts 2px
outside the pill. An edge ELK routed nowhere is left out. The canvas is then widened to the box
it is shown in and the drawing centred, rather than stretched.

The layout is injected into `loom-place.ts`: the page gives the real ELK, the smoke check gives
the same vendored copy, and the unit tests give a fake shaped like a layout. The unit tests never
run ELK; the smoke check is the one place the engine is tested through it.

**The drawing** (`src/loom-draw.ts`) draws, in order, so each sits on what came before:

- Year markers: the opening year at the corner, then at each change of year a dashed line across
  the picture, between the last moment of one year and the first of the next, with the year
  beside it.
- Threads: one path per person, in their palette colour, through all their edges joined end to
  end. Each hop eases between its points with control points along the time axis, so a hop that
  stays in its slot is straight and one that changes slot is an S-curve. One path per person
  rather than per edge, because two round-capped paths meeting in open space leave a faint seam.
  An edge left out starts a new subpath, and so does a meetup the person was away from, where
  one edge ends before the pill and the next begins after it.
- Moments: a pill sized to the moment's box, a rectangle with ends as round as half its shorter
  side, filled with the page's colour partly opaque so the threads show through. Meetups are
  outlined in the page's accent colour, other moments in a muted one. The pill is the click,
  hover and focus target, with a hit area a few pixels larger.
- Beads: a small filled circle in the person's colour at their slot, wherever the record vouches
  for them. Where they joined, the join bead: larger, in their own colour, ringed in the page's
  ink colour. Where the record says they were away, a hollow bead: a ring in their colour, the
  size of an ordinary bead, with nothing in it.
- Faces: the person's avatar, or their initial when there is no image, in a circle ringed in their
  thread colour.
- Moments' avatars: the event's mark, 24px across, in the room left with the label. No ring and
  nothing cut, since the image is made to sit in a circle (see "Event marks").
- Labels: each moment's title, where ELK left room for it. A label with an avatar beside it is
  drawn at a set length (`textLength`), the length its avatar was placed by.

There is no trunk, and there are no halo rings.

**Why a library, and why this one.** The engine before this was a hand-written lane allocator in
the style of `git log --graph`, and it was fixed one overlap at a time: labels on faces, lines
through faces, a line through a moment its person was not at. Each fix was a rule, and each rule
was right, but the class of bug was open-ended. A layered layout closes it by construction: an
edge gets a dummy node in every layer it crosses, so it can not pass through a node it does not
belong to. The decision was made the same way as the lane decision before it, from a side-by-side
render of the real data through both engines, not from the numbers; ELK won by eye.

dagre was tried first and rejected: it has no supported way to pin a node to a layer, and forcing
ranks with a hidden chain of edges made its coordinate assignment pull everything toward one
column. ELK's partitioning is the feature itself.

**What it cost.** A 1.6 MB script the page loads before the engine, vendored under
`static/js/vendor/` with its EPL-2.0 licence rather than fetched from a CDN, because the site is
heading for self-hosting. Layout is asynchronous, so the picture appears a beat after the page,
and it takes longer as the history grows. Each mode is laid out once per visit: a window resize
re-centres the layout already made, and a second visit to a mode is instant. The mode the reader
did not open in is laid out 1.5 seconds after the first picture is drawn, whether or not they
ever switch, so that a switch can start moving at once. Daniel chose that over laying it out at
the first press, or when the pointer reaches the toggle. It costs every visitor the work of a
second layout, about half a second today and about a second two years on by the made-up
histories, during which the page does not respond.

**What stayed.** Everything either side of the seam: the data model and its validator, faces, the
card and popup, the toggle, the checks. The old allocator, its projections and its label sweep
were deleted, not kept behind a flag. So was the trunk engine that followed it.

### Toggle and responsive behaviour

- Buttons in the page, River and Subway, choice persisted in `localStorage`, following the
  existing theme switcher pattern in `partials/base.navigation.html`. The selected button is
  marked with the same Bulma classes the theme switcher uses, and with `aria-pressed`.
- River is the default at every width.
- The toggle, the zoom and the legend are hidden until the first picture is drawn, so a reader
  whose layout engine never arrived is not offered a control that does nothing or a key to marks
  that are not there. Once shown, the toggle and the zoom stay visible at all widths, on one line
  that wraps on a narrow screen.
- The legend is one line under the toggle with four marks drawn small, each labelled with a Nix
  word, by Daniel's choice: a thread with a bead is "cache hit" (the record says they were
  there); a thread with the ringed join bead is "first build" (they joined here); a bare thread
  through a moment is "unevaluated" (in the group then, attendance not recorded); and a thread
  broken either side of a moment, with a hollow bead in it, is "cache miss" (the record says
  they were not there). The labels
  favour the group's own humour over a newcomer reading them cold, so each mark carries its
  plain meaning as a hover tooltip, and the help cursor over the legend says there is one. The
  tooltip is the page's own, drawn by the stylesheet from a `data-tip` attribute: it appears a
  tenth of a second after the pointer rests on a mark and goes at once when it leaves, where the
  browser's own would wait most of a second. It takes no room until it is shown, and on a screen
  768px wide or narrower it hangs from the legend at the legend's width, so it never widens the
  page. The meanings are the ones under "What a thread
  through a meetup means". All four are always shown, whether or not the data records an
  absence, also by Daniel's decision.
- The map is a box of its own, at most 85% of the viewport tall, that scrolls both ways. Subway's
  canvas is wider than the page, and River's can be; on touch that is native momentum panning with
  no JavaScript. Scrolling down chains to the page at the map's end, and sideways does not tip over
  into the browser's back gesture.
- A mouse can take hold of the map and move it: press anywhere on it but an open card, drag, and
  the box scrolls with the pointer. The cursor is an open hand over the map and a closed one while
  it is held, which is also what tells a desktop reader that Subway pans. A press that moves less
  than 4px is still a click; one that moves further is a drag, and the click it ends with opens
  nothing and closes nothing, so a drag may start on a moment or a face and an open card rides
  along with the map. Nothing in the map can be selected, so a drag does not paint a selection
  across its labels; a card's text still can be. A finger is left to the box's native panning.
- The map zooms from a tenth of the size it was drawn at to three times it. Four buttons beside
  the toggle: out and in, a quarter at a time; Fit, which shows the whole map with nothing left to
  scroll to (never larger than drawn); and 100%. Holding Ctrl and turning the wheel zooms too,
  which is also how a pinch on a trackpad arrives; the plain wheel still scrolls the map and then
  the page, which is why it was not given the zoom. The buttons hold the middle of the box still
  and the wheel holds whatever is under the pointer. A button that would do nothing at the
  present zoom is dimmed and marked `aria-disabled`, not disabled, so it keeps the focus a
  keyboard put on it.
- Zooming resizes the picture inside its scrolling box and leaves the layout alone: nothing is
  laid out or drawn again, the wheel, a finger and the scrollbars go on working at any zoom, and
  text stays sharp because the picture is an SVG. Narrower than the box, the picture sits in the
  middle of it. A box whose picture is shorter than its ceiling is as short as the picture, so
  zooming out can shrink the box and bring up what is under it. The zoom is kept across a change
  of mode and a resize, and is not remembered between visits.
- River puts the roster in a column beside the map; Subway, and any viewport narrower than 1024px,
  puts it underneath as a grid.
- Beside the map the roster is a box of its own with the map's ceiling, 85% of the viewport, and
  scrolls inside it, so the two end on one line however many people there are. The ceiling is
  one value in the stylesheet, used by both. Like the map, the roster lets the wheel carry on to
  the page once it reaches its end. Under the map it is the whole list with nothing to scroll.
  The roster keeps that ceiling when the map is zoomed out until it is shorter than its own: a
  roster that shrank with the map would be no use at the small zooms.
- Switching modes morphs. Pressing the other mode's button moves everything from where it is to
  where it will be, over 1.2 seconds with a cubic ease in and out:
  - inside the picture, each face, each moment's pill, each bead, each label, each year line and
    year label, and each thread, bent from one shape to the other;
  - the canvas, from one mode's size to the other's;
  - the map's box, from the tall box beside the roster to the wide one above it;
  - each roster card, from the column into the grid or back. A card really is the width it
    appears to be on the way, so its text wraps as it travels and is never stretched. Cards
    cross over the picture on their way, which Daniel does not mind.
- The first Loom dropped the slide the page had before it, because a moment that is wide in one
  mode and tall in the other had nowhere sensible to slide from. The pill now changes shape as
  it moves, through a circle half way. Threads were the hard part: the two modes give one edge
  different numbers of points, so each edge's curves are cut, without changing how either mode
  looks, until both have as many, and then every control point moves in a straight line. A
  thread broken either side of a meetup its person was away from stays in the same stretches all
  the way. Daniel asked for it to see whether it felt right, tried it as a throwaway, and kept
  it.
- The view lands the same share of the way along the other map: the start to the start, the end
  to the end, anywhere between the same way through. The share is of how far the box can
  scroll, which is found by asking it to scroll too far and reading back where it stopped,
  because the sizes the box reports count the room kept for a scrollbar. The scroll position
  moves in a straight line from where it was to where it lands, so everything crosses the screen
  in a straight line. A round trip comes back to where it began, to within a pixel: the browser
  keeps a scroll position to whole pixels and Subway scrolls more than twice as far as River.
  An axis the box cannot scroll has no place of its own on it, so on that axis the view keeps the
  share the last switch carried: River can be wider than its box while Subway has nothing to
  scroll down, and a view at River's left edge comes back to River's left edge. A view no switch
  has carried counts as at the start along the map and in the middle across it.
- That is also where the first picture opens: at the start of the map, with as much out of sight
  on one side as on the other. A River wider than its box therefore opens centred, by Daniel's
  choice. The ribbon runs from 466px to 559px across the 764px picture, so opened at its left
  edge River shows 9px of it in a 475px box and none of it on a phone. A resize redraws the
  picture and leaves the box scrolled where it was.
- A view whose zoom was last set by Fit arrives at the other mode's fit, the zoom changing on
  the way. Fit is a different zoom in each mode, because the pictures are different shapes (19%
  in Subway and 32% in River in a 1400px window today), and carrying one across left the other
  too small. Any other zoom is carried across unchanged.
- While it runs the map answers no pointer and hides its overflow, and a press on either mode
  button or any zoom button does nothing. Ignoring a press, in place of turning round part way,
  is Daniel's choice. A window resized while it runs is dealt with when it lands: if the box is
  not the width the landing was drawn for, the picture is redrawn for the width it is.
- When it lands, the picture in the box is the ordinary drawing for that mode, the one a fresh
  visit draws, and nothing the morph set on the box, the layout, the roster or the cards is
  left behind.
- A reader whose system asks for reduced motion gets the instant switch. So does anyone whose
  two layouts do not pair up, an edge or a face in only one of them, which a layout that passed
  the smoke check cannot be. The instant switch lands the view the same share of the way along
  and across as the morph would have. Before River opened centred it kept the box's scroll
  position as a number of pixels, which would now open Subway part way in.
- If anything fails once the page has been put in the new mode, whether before the first frame
  or in the middle of one, the switch ends in the ordinary picture for that mode with nothing of
  the morph left on the page, and the next switch works. The view lands where the switch was
  taking it. Before that fix a failure in a frame left the map answering nothing
  until the page was reloaded.
- The arithmetic is in `src/morph.ts` and touches no page: given two layouts it says where
  everything is at any point between them, and it carries a scroll position across as shares.
  The page script measures the box and the cards before and after the layout flips, applies one
  frame of that for each animation frame, and swaps in the ordinary drawing at the end.
- If laying out the newly chosen mode fails, the picture already on screen stays, under the new
  mode's name. This is left as it is on purpose; see "Still open".
- If the first layout fails, the map says "The picture could not be drawn. Reloading the page may
  bring it back." The roster is still there.

### Cards and the popup

- Thread roots are the person's avatar, circular, ringed in their thread colour.
- Clicking a face opens that person's card and clicking a moment opens its card, both in one popup
  that is a child of the scrolling map. It is placed in the map's own scroll coordinates beside
  what was clicked, to the right and flipping left when there is no room, clamped to the slice of
  the map on screen so it never opens somewhere the reader has to scroll to find, and it pans with
  the map once open. A moment keeps a changed outline while its card is open.
- The popup closes on its X, on Escape, and on any click that is not inside it. A click on
  another face or moment swaps the card rather than closing it first. Zooming closes it, because
  what it was placed beside has moved; dragging the map does not.
- The roster lists everyone as the same person cards, without the X, in thread order: the order
  of the profiles in the About section (sorted by `weight`), as the template writes them into the
  data block, leaving out anyone with no moment. Thread order is also the palette's order. It is
  not the slot order the engine uses across a moment (see "The layout engine"). The roster sits
  beside River and under Subway (see "Toggle and responsive behaviour").
- Hovering a face lights that person: their thread is drawn thicker, their face's ring too, and
  their roster card is tinted. Hovering or focusing a roster card does the same. Hovering a moment
  lights everyone through it who was not away from it. A touch does not light anything; a tap
  opens the card.
- While anyone is lit, everyone who is not steps back: their thread, their beads and their face
  are drawn at a quarter strength, in the picture only. Moments and labels are not dimmed, since
  a moment belongs to everyone through it, and neither is the roster, which is a list being read
  and whose tinted card already says who. Hovering a meetup therefore dims only the people
  recorded away from it and those who had not joined yet.
- A person's card carries avatar, name, alias (linking to their profile), quote, description,
  their own links on one line that wraps, membership badge and where they joined, as "Joined at"
  with that meetup's title and date.
- A moment's card carries title, date, photo, blurb, and the event page or outside links, and
  the moment's avatar, when it has one, beside the title, as a person's face is in theirs. Any
  moment that is not a meetup lists the people it names. A meetup's card says "Joined here:" with
  the names of who joined there, and "Confirmed there:" with anyone else the record vouches for,
  in place of who was there, because a thread through a meetup says only that its person was in
  the group then. It does not list who was away.
- **Why the rail went.** Once the lanes were wide enough to read, River needed every pixel of its
  width, and a 20rem column beside it was the first thing to give. That was under the lane
  allocator. ELK's River is much narrower, and the roster came back beside it in a different
  shape: the same cards as the popup, with highlighting both ways.
- **What it cost.** The rail was the keyboard route to a person's card, and removing it made
  person cards pointer-only for a while, as moment cards already were. The roving tabindex under
  Accessibility is what put a keyboard route back.

### Member and guest treatment

Several signals, so it does not depend on colour alone:

|               | Member                         | Guest                      |
| ------------- | ------------------------------ | -------------------------- |
| Avatar ring   | Thread colour, full saturation | Grey, dashed; image greyed |
| Card bar      | Solid, thread colour           | Dashed, grey               |
| Thread stroke | Solid                          | Dashed and thinner         |
| Badge         | Filled, "Member"               | Dashed outline, "Guest"    |

Colour identifies individual threads only while there are few enough to tell apart. The palette
has twelve hues, in light and dark versions; the first twelve threads in thread order each take
one, and every thread after that takes a single muted colour. Past that point identity comes from
the face, the roster card and highlight-on-hover, which thickens a thread rather than colouring
it. Member and guest remain distinguishable at any size, because that distinction rides on ring,
stroke, card and badge rather than on hue. This is a call made in the absence of a preference
and is worth revisiting once the group passes a dozen. It has reached it: the twelve members
take the twelve hues, and Matthew Croughan, the thirteenth thread and a guest, is the first in
the muted colour. The next member added will be too.

The badge carries no meeting number. The card instead shows where someone joined using the title
and date of the meetup they joined at, which the engine already computes. Parsing a number out of
event titles was considered and rejected: the titles are not uniform (`NUG #1`,
`NUG #14 @ Ten Mile Brewing`, `Mini NUG @ Legend Chicken Hawaiian Gardens`), some carry no number,
and a person's first meetup in the data need not be a numbered one.

### Accessibility

The picture is the accessible version of itself. Its SVG is a named group, every moment's pill and
every face is a `role="button"` with a label, and the picture is one tab stop with a roving
tabindex: the arrow keys move a cursor through the story in the order it happened, faces a step
ahead of their person's first moment, Home and End go to either end, Enter or Space opens that
card with focus in it, and Escape closes it with focus back where it was. Forward is Down or Right
in both modes. One tab stop for every moment and face, several dozen of them, in the middle of a
page is a wall to anyone tabbing past, which is the reason for the roving pattern rather than plain
focusable moments.

A meetup's label gives its title, its date and how many are in the group by then, for example
"NUG #6, 1 June 2024, 9 in the group". Another moment's says how many people it names. Labels say
how many, not who: eight names read out on every arrow press is a wall of its own, and the card
names them for anyone who opens it. A face's label is the person's name and "member" or "guest".
Beads have no role and are not tab stops.

The zoom is four real buttons in a named group, each with a label saying what it does, so it
needs no pointer. Taking hold of the map is a mouse's convenience and has no keyboard form: the
arrow keys already bring each moment into view as the cursor reaches it.

The legend is hidden from assistive technology (`aria-hidden`), by Daniel's decision. A recorded
absence is not in any card or label; it is shown only by the broken thread and hollow bead, also
by Daniel's decision.

**There was a rendered fallback list**, emitted by Tera beside the picture: the page without
JavaScript, and the accessible version while the SVG was `aria-hidden` decoration. It is gone.
Once the picture named its own moments and faces and its cards carried the blurbs and links, the
list was a second copy of the same history to keep correct, and a second thing for a screen
reader to read. What goes with it: a reader with JavaScript off gets an empty map and an empty
roster, and the page source carries the history only as the JSON data block. A reader whose
browser fails to fetch the 1.6 MB layout engine gets the roster and a sentence in the map saying
the picture could not be drawn. That was an accepted trade, not an oversight.

`test_site.py` asserts the list is absent and that the data block carries the history instead.

### Build and toolchain

- Overlay package `socal-nug-braid-js`: runs esbuild over `src/`, emits a minified ESM bundle.
  Source and `package.nix` live in the package directory, matching how `socal-nug-make-event-ical`
  owns `make_event_ical.py`. The same directory holds the unit tests (`test/`), the smoke check
  (`smoke/`) and the on-demand browser check (`browser/`).
- The site does not build the bundle. It is committed at `static/js/braid.js` and served from
  `static/` like any other asset, so `nix build .#socal-nug-site` and Netlify ship the same file;
  see "Netlify interim". `socal-nug-braid-js` is built to check that file and to regenerate it;
  the unit tests, the smoke check and the browser check compile from its source.
- The page loads it with `<script type="module" src="/js/braid.js">`, after a classic
  `<script src="/js/vendor/elk.bundled.js">` for the layout engine, so ELK's global is there before
  the module runs. The vendored file is elkjs 0.12.1's `lib/elk.bundled.js`, with its EPL-2.0
  licence beside it; it is not fetched from a CDN because the site is heading for self-hosting.
- Moment and person data reach the script through a `<script type="application/json">` block
  written by Tera with `| json_encode | safe`. Tera has no object literals and no `concat`, so the
  block's structure is written out by hand in `templates/origins.html` and only the values are
  encoded.

### Checks

In `checks/default.nix`:

- `braid-engine`: esbuild-compiles the engine's unit tests, runs `node --test`. Covers the story
  half (order, joins, who is through each moment, slots, who is passing, what the record vouches
  for and where it says someone was away), the graph handed to ELK (sizes, ports at slots, edges
  port to port, a meetup someone is away from as a stop like any other, pass-throughs, the
  spine), the mapping of its output into positions (the break either side of a meetup someone
  is away from among them), the drawing from those (the hollow bead, the thread's new subpath),
  a moment's avatar (the room asked for it, where it is placed, how it is drawn, and its place
  on the way between modes),
  cards, keyboard order, the toggle, the zoom's arithmetic (a button's step,
  what a wheel event counts for, the zoom that fits, the limits), the morph's arithmetic (where
  everything is at the start, half way and the end; a thread cut to match and still tracing its
  line; a broken thread kept in its stretches; two layouts that do not pair up; a scroll
  position carried across as shares), popup placement, the made-up histories and the smoke
  check's own measures. None of it runs ELK; the placement tests use a fake shaped
  like a layout.

- `braid-types`: `tsc --strict` over `src/`, `test/`, `smoke/` and `browser/`. esbuild strips
  types without checking them, so without this the types would be documentation only.

- `braid-bundle-fresh`: the committed `static/js/braid.js` is byte for byte a fresh build of
  `socal-nug-braid-js`; see "Netlify interim".

- `elk-vendored`: the committed `static/js/vendor/elk.bundled.js` is byte for byte the pinned
  upstream release, fetched by hash. The only way a vendored file stays honest about where it
  came from.

- `braid-data`: validates `data/moments.toml` with `verify_moments.py`. The validator checks the
  shape of each moment (date or event, a title on a dated moment), that every date has the right
  format and exists, that every moment has an `id` and no two share one, that every `people`,
  `there` and `away` entry resolves to a profile slug in `content/about/`, that every `event`
  resolves to a file in `content/events/`, that `links` is a list of entries each with a title
  and a url, the attendance rules under "Moments", and that at least one moment has
  `trunk = true`. It warns when nothing predates the first `trunk` moment. Problems are reported
  a class at a time, every instance of the first class that has any. An unresolved slug is the
  likely failure when someone adds themselves, so it fails the build with the offending slug in
  the message.

  The check then runs the validator over fixtures in `socal-nug-braid-data/tests/` and checks
  each is rejected, warned about or accepted as expected. There is a fixture rejected for each
  of: an unknown slug in `people`; both a date and an event; neither; a badly formatted date
  (`2023-4-1`); a duplicate id; an unknown event; no `trunk` moment; a `links` entry without a
  url; and, for `there` and `away`, an unknown slug, either list on a dated moment, one person in
  both, a person before the meetup they joined at, a person with no join record, and a person
  away from the meetup they joined at. One fixture must only warn (nothing predates the
  first `trunk` moment), and two must pass cleanly. A rejection is matched on a word or phrase
  from its message, such as the bad slug, the bad date or "both there and away", not on the
  record's id. The validator also rejects four things that no fixture exercises: a dated moment
  with no title, a date in the right format that does not exist (such as a month 13), a moment
  with no `id`, and `links` that is not a list.

- `frontmatter` extends to the required `member` field through `profiles.json`, and to a
  profile's `links`, each of which needs a title and a url.

- `test-site` checks the built page: its data block parses and carries the history, the meetups
  come from the events section and carry `there` and `away` lists, a record's attendance reaches
  its meetup through the template's merge, the fallback list is absent, and the bundle, the
  vendored layout engine (before the bundle), the toggle, the zoom's four labelled buttons and
  the roster are in place. It reads the stylesheet for the rules behind the legend's tooltip,
  the hand over the map, the dimming of whoever is not lit, and the roster taking the map's
  ceiling beside it. It checks that the guest in the data is on the Origins page and not in the
  About grid, and proves the About filter with a guest probe as well. It checks that every
  member's own links are in the data block and on the About grid, and that every member's quote
  is on the About grid as a quotation. It checks that every moment's avatar in the data block is
  a file the built site serves.

- `braid-smoke`: builds the story from the built site's own data block, which is the repository's
  `data/moments.toml` and `content/events/` through the template's merge, not from fixtures. It
  lays it out through the vendored ELK in both modes, draws it, and measures the result:

  - every moment has a position, every person with a moment has a placed face, every side moment
    with anyone passing it has a pass-through, and every person has one edge for each moment
    they are through and each pass-through they are passing;
  - the ribbon holds its column: the first slot of every moment on the ribbon and of every
    pass-through is within 1px of the median of them, across the time axis, whether or not anyone
    is in that slot;
  - no hop from one stop on the ribbon to the next (a moment on the ribbon or a pass-through, with
    no ribbon moment between them) has a point more than a slot outside its two ends, across the
    time axis. Someone away from a meetup stops at it like everyone else, so their hops are
    measured. A hop that skips a ribbon moment is someone going around a meetup they are not yet
    part of, and is not measured;
  - no thread runs through a moment or a face that is not its own, sampled along ELK's polylines
    and again along the drawn curve;
  - every moment and face is on the canvas; no label sits on a face or a moment, runs off the
    canvas or is wider than the 150px it may claim, and no thread runs under a label;
  - every moment that carries an avatar has one drawn and no other moment does; each is on the
    canvas, in line with its moment to within a pixel (on its row in River, over its column in
    Subway), and no thread, face, moment, label or other avatar is on it. A label drawn at a set
    length is measured at that length, and any other by the room kept for it;
  - every filled bead is inside its own moment, and a person has one exactly where the record
    vouches for them and nowhere else;
  - for everyone recorded as away from a meetup, no part of their drawn thread is inside that
    meetup's box and a hollow bead is at their slot in it, and there is no hollow bead anywhere
    else.

  With both modes laid out it also builds the morph between them, each way, and checks that it
  starts on the drawing of the mode being left and ends on the drawing of the one arrived at:
  the layouts pair up; each thread traces the drawn one to within a twentieth of a pixel and is
  in the same number of stretches at the start, half way and the end; and the avatars, beads,
  labels, year lines and years are where they are drawn. The unit tests cut a thread's curves to
  match only on a made-up case, and this is where it is tried on real layouts.

  It does the same for nine made-up histories generated from fixed seeds (`smoke/histories.ts`):
  seeds 1 to 3, each at about today's size and one and two years on, twenty layouts in all with
  the real data. Their gatherings beside the meetups carry an avatar, so the room for one is
  tried on layouts the real data does not have. They depend on nothing but their seeds, so a
  content change can never alter them or turn them red. Every finding is fatal, and the check prints a line for every layout before
  failing so one run shows them all. A finding about layout (an overlap, a label, the ribbon, a
  thread stepping out) on the real data says that the picture came out wrong for the data as it
  now stands, that nothing in the author's change is mistaken, and that it needs a maintainer who
  knows the layout engine; on a made-up history it says only a change to the engine can have
  caused it. The rest (a missing position, edge or pass-through, a bead with no record behind it,
  a thread inside a meetup its person is recorded away from, a hollow bead missing or out of
  place) cannot be caused by data and say
  they are a bug in the engine. Every other engine test runs on fixtures and fakes the layout, so
  without this a plausible typo in the real data, or a layout ELK is happy with that the renderer
  is not, ships with the whole suite green.

**On demand, not a check:** `nix run .#socal-nug-braid-browser` loads the page in headless
Chromium and behaves like a visitor: it wheels past the map and past the roster beside it, drags
a finger through the map on a phone-sized screen, clicks and tabs into cards, hovers moments,
switches modes and watches the picture travel, zooms with the buttons and with Ctrl and the
wheel, takes hold of the map with a pressed mouse and drags it, blocks the layout engine, and
asks for the dark theme and for reduced motion. Thirteen of its checks are about the morph: that
it takes time, passes through pictures that are neither mode's, and stops; that it lands on the
picture a fresh visit draws, both ways and after the window is narrowed part way; that nothing
is left set on the box, the layout or the cards; that the view lands the same share of the way
along and a round trip returns; that a fitted view arrives fitted; that the mode and zoom
buttons do nothing while it moves; that reduced motion makes it instant; and that a switch made
to fail, in a frame and before the first one, still ends in the ordinary picture with the next
switch working. Two more are about where the view is put without a morph: a River wider than
its box opens centred, and the instant switch lands the same share of the way along. Three are
about a moment's avatar: a click on it opens its moment's card in the place a click on the pill
opens it, it is part way between its two places while the mode changes, and in River every one
stands the same distance from its label's text, which only a browser can say, since only a
browser knows how wide the text came out.
Sixty-one checks, each named for what a visitor would
notice and none naming a moment or a person, so the data can change under it as long as the
picture stays about the size it is (see below). It needs the
network, because Bulma and the fonts come from CDNs. It lives in `socal-nug-braid-js/browser/`
and is typechecked by `braid-types`, which is what stops it rotting between uses.

It is kept out of `nix flake check` on purpose. What it looks at is decided by the page's
script (anything under `overlays/topLevel/socal-nug-braid-js/src/`), its stylesheet
(`sass/css/pages/origins.scss`) and its template (`templates/origins.html`), and it is run by
whoever changes any of those, when they change them. A 1.7 GiB Chromium on every content change
would mostly buy the chance of a false failure. Run against
the page as it stood before the defects it was written from were fixed, it failed 17 of the 25
it had then.

Content cannot break the script, but it decides how big the picture is, and that has caught the
check out once. The commit that added Nix Camp 2026, NixCon 2024 and Connor Baker's first pull
request took River from 658px wide to 741px, past the 667px its box has in the check's 1400px
window. Two checks then failed, and nobody ran them until the next change to the script. One
had found a real defect: a view at the left edge of a River wider than its box came back from
Subway in the middle, fixed by keeping the share (see "Toggle and responsive behaviour"). The
other, the window narrowed part way, needs a River that fits the wider of its two boxes, and
now goes from 1500px to 1400px; it will say so when River outgrows the 859px box a window of
1408px or more gives it. So the check is also worth running when the history gains people or
moments off the ribbon.

### Netlify interim

Netlify cannot run esbuild without a node toolchain, and adding one would create a second build
definition of the same artifact, which is what the CI rework existed to eliminate.

Instead the built bundle is committed at `static/js/braid.js`, and a check rebuilds it and fails
on mismatch. Netlify needs no new capability; it serves the committed file as a static asset.
This mirrors `netlify-zola-version`: two representations of one thing, with a check that fails
when they disagree.

An esbuild version bump will change the output and fail the check until the bundle is
regenerated. That is the intended behaviour, not a defect.

When self-hosting lands, the committed bundle and its check can both be deleted.

### Styles

`sass/css/pages/origins.scss`, imported from `style.scss` alongside the existing page styles; the
page needed no shared components. Colours are defined so that both themes work, following the
dark mode work from #97: the twelve thread hues, the accent, muted, ink, surface and line colours
each have a light and a dark set, applied to the map and to the legend, and the map tells the
browser its content is dark so its scrollbars follow. A thread's colour is a palette slot set by
a `data-hue` attribute, so adding a person needs no stylesheet edit.

## Settled since this was written

Most of what this section once left open was decided by moving to ELK, and the reasoning lives
under "The layout engine" rather than here: lane spacing, label collision, and whether thread
colour comes from the data (it does not; it is a palette slot by thread index). The roster sits
to the right in River and below in Subway. A freestanding moment may carry `links`, a list of
`{ title, url }`, because one moment can be two places at once; event-anchored moments take
their permalink from the event and need nothing.

Settled by the Loom: there is no trunk, and every person is one thread; the meaning of a thread
through a meetup, and that attendance is recorded optionally with `there` and `away`; that a
moment everyone in the group is at sits on the ribbon; that the ribbon is held to one column by
the hidden spine and the pass-throughs, measured by the smoke check on the real data and on the
made-up histories; that a layout fault on the real data fails the check, in words that say it is
not the author's mistake; the meetup card's wording; and the legend. The Loom also settled that
switching modes does not animate, which Daniel reversed on 2026-11-24: it morphs, as "Toggle
and responsive behaviour" describes.

Also decided by Daniel: a recorded absence is shown only in the picture, by the broken thread and
hollow bead, and is listed nowhere; the legend is hidden from assistive technology; a
phone-sized screen is not a present concern.

Seating among people who joined at the same meetup stays with the rule, first moment and then
slug, also by Daniel's decision. It is the one free choice in slot order: the rest follows from
who joined when. When it was measured, on 2026-11-23 with ten people in the data, there were
three such ties (Rob Hernandez, Daniel Baker and David Nuon; Jared Baur and Samuel Raumin; Kyle
Risse and Tristan Ross; Mica and Joshua Campbell at NUG #2 make a fourth since), so twenty-four
seatings, and
all were laid out through the real engine and their thread crossings counted: 140 as it stands,
126 at best, 143 at worst, the same in both modes. Putting David left of Daniel alone gives 133.
The effects do not add up, because ELK chooses again which side each side moment and each detour
goes, and most crossings then came from people going around meetups they were away from, which
no seating removes. (Those detours have since gone, and the numbers here with them; see "What a
thread through a meetup means". The seatings were not counted again.) Setting the seating by
hand in the data was turned down: the best one changes
with every person and every attendance record added, so it would not stay the best. Choosing it
automatically means a layout for each candidate, which is too slow at page load and would only
be reasonable if layout moved to build time.

## Still open

- **The card.** The treatment was called out early as generic and never revisited beyond
  squaring the corners. There is one card surface now, used in the popup and the roster, so it
  is a single thing to design rather than two.
- **Descriptions and quotes.** Chris Tewfik, Joshua Campbell and Matthew Croughan have neither.
  Everyone else has a description; only Daniel Baker, Jared Baur and Mica have a quote, and only
  Daniel Baker, David Nuon and Samuel Raumin have links.
  Rob Hernandez's and Jared Baur's "First contact" have no blurb, though Daniel Baker's and
  Connor Baker's have one, and several conference and camp moments have none.
- **Eight `CONFIRM` markers** in `data/moments.toml`: two dates given as approximations, one
  meetup guessed at (Connor Baker's first, below), "I think everyone was there" on the three
  SCaLE moments, "I believe David and I were at every single NUG event" over the attendance
  records, and Chris Tewfik at NUG #10 (below).
- **Who met whom at SCaLE 20x.** The moment was "Nix booth at SCaLE 20x" and is now "SCaLE 20x",
  the whole conference, by Daniel's decision, so that everyone who was at SCaLE that year is
  through it whether or not they were at the booth. Joshua Campbell is on it for that reason;
  Daniel does not recall whether Joshua visited the booth. Its blurb still says only who was at
  the booth and that Daniel Baker and David Nuon met Rob Hernandez there. Daniel means to
  expand it with who met whom.
- **Who was at each meetup** is recorded whole, everyone in the group either there or away, for
  nine meetups: the seven Daniel checked against pictures (NUG #1, #2, #3, #4, #6, the June 2025
  Mini NUG and NUG #17) and two Daniel gave from memory on 2026-11-24, NUG #5 and NUG #10, each
  as a list of who was there with every other member not. For the other ten up to NUG #17
  Daniel Baker and David Nuon are recorded, and Chris Tewfik, and at NUG #12 Tristan Ross and
  Morgan Jones, and nothing is said about anyone else. The lists name only people who have a
  profile; others were at many of these. Chris is recorded at every meetup
  from NUG #5, where Chris joined, to NUG #17: there at NUG #6 and NUG #17, which Daniel knew
  of, and at NUG #7, #8, #10, #11, #12, #13 and the June 2025 Mini NUG, which Chris added,
  saying there were no others; so away from NUG #9, the April 2025 Mini NUG and NUG #14, #15
  and #16. Joshua Campbell was added after the seven were recorded, and Daniel then placed
  Joshua at each from NUG #2, where Joshua joined: there at NUG #4, and away from NUG #3,
  NUG #6, the June 2025 Mini NUG and NUG #17.
- **Chris Tewfik at NUG #10.** Daniel's list for NUG #10 does not name Chris and says no other
  member was there. Chris's own account, given earlier, has Chris at it. The record keeps Chris
  there, under a `CONFIRM`, until one of the two says otherwise.
- **Connor Baker's first meetup** is recorded as NUG #7, as a guess. NUG #6 was first thought
  to be where Connor joined, but Connor is not in the pictures of it; Daniel thinks NUG #7 may
  have been the first.
- **The README** names the Origins checks and the browser tool, but still says nothing about
  esbuild, the committed bundle at `static/js/braid.js` and how to rebuild it, the vendored ELK,
  or that `zola serve` does not watch `data/`, which has twice made a change look like it had
  not landed.
- **Zoom and grab beyond what was tried.** The browser check drives them in headless Chromium.
  They were also driven once in headless Firefox 159 through geckodriver, by a script that is
  not in the repository: a drag from empty map, from a face and from a moment, a card kept open
  through a drag let go inside and outside the box, Ctrl and the wheel, Fit, and the dimming all
  behaved as described. A mouse wheel that reports lines rather than pixels is covered by a unit
  test of the arithmetic and by no browser. A pinch in Safari arrives as gesture events, not as
  Ctrl and the wheel, and is not handled.
- **The morph beyond what was tried.** The browser check drives it in headless Chromium. It was
  also run in headless Firefox 159 through geckodriver, by a script that is not in the
  repository: both ways it ran without an error and landed where it should, and Daniel tried
  the throwaway version in Firefox by hand. Safari has not been tried. The instant switch for
  two layouts that do not pair up has never run in a browser, because the real layouts always
  pair up. Three things have been read in the code and not tried: Ctrl and the wheel over the
  map while it morphs should go to the browser, which zooms the page, since the map answers no
  pointer then; pressing Enter on a focused moment while it morphs is meant to open nothing;
  and a mouse already holding the map when a keyboard press switches modes is meant to be let
  go.
- **River wider than its box.** River is 764px wide, 23px of that the room for the moments'
  avatars. Beside the roster its box is 859px in a
  window of 1408px or more, 667px from 1216px and 475px from 1024px, all measured, so in a
  window from 1024px to 1407px, and on a phone, River scrolls sideways. It opens centred (see
  "Toggle and responsive behaviour"). The cost is the year numbers: they are drawn 6px in from
  the picture's left edge, so wherever River is wider than its box none of them is in view
  until the reader scrolls left, though the year lines still cross the picture. Keeping them at
  the box's edge as the map scrolls has not been tried. Before the commit that added Nix Camp
  2026 and NixCon 2024 River was 658px and fitted from 1216px up. It did not fit the 475px box
  then either.
- **An id rule in the validator.** Nothing stops a `|` in a moment id, or a person slugged
  `spine`, and either would break placement: port ids are split on `|`, and the spine's edges
  are named `spine:<n>`, as a person's edges are named `<slug>:<n>`.
- **Validator rejections with no fixture.** `braid-data` has no fixture for a dated moment with no
  title, a well-formed date that does not exist, a moment with no `id`, or `links` that is not a
  list, so nothing shows those rejections still work.
- **Safari** has not been tried. The page has been checked in Firefox and Chromium.
- **A failed mode switch** leaves the old picture on screen under the new mode's name, and the
  new mode remembered. Left alone on purpose, by Daniel's decision.
- **Integration.** The branch is more than fifty commits and has never been reviewed as a whole.

## Verification

- `nix flake check` passes, including the Origins checks: `braid-engine`, `braid-types`,
  `braid-bundle-fresh`, `elk-vendored`, `braid-data`, `braid-smoke`, and the Origins parts of
  `frontmatter` and `test-site`.
- Deliberately breaking a `people` slug in `data/moments.toml` fails `braid-data` with that slug
  in the message. The check's fixtures show, every run, that each rejection listed under
  "braid-data" as having a fixture is made, by a word from its message. The four rejections no
  fixture exercises (a dated moment with no title, a well-formed date that does not exist, a
  moment with no `id`, `links` that is not a list) are verified only by reading
  `verify_moments.py`.
- `nix run .#socal-nug-braid-browser` passes, after any change to the page's script (anything
  under `overlays/topLevel/socal-nug-braid-js/src/`), its stylesheet or its template.
- Deliberately editing `static/js/braid.js` fails `braid-bundle-fresh`.
- `nix build .#socal-nug-site` produces `js/braid.js` and an `/origins/` page, and the page
  built this way matches the one from `netlify.toml`'s command on the same source.
- The page renders in light and dark themes, in both modes, at desktop width, in Firefox and
  Chromium: every person has one unbroken thread, no trunk is drawn, each moment is a pill as wide
  as the people through it, and a moment everyone was at sits on the ribbon.
- A meetup with no `there` entry has a ringed join bead for whoever joined there and no other
  bead; NUG #18 is one. A `there` entry for someone at a meetup puts a bead on their thread there
  and their name under "Confirmed there:" on its card. An `away` entry breaks their thread
  either side of that meetup and puts a hollow bead in their slot; NUG #2 is the first with
  any. Nothing goes around a meetup but the thread of someone who has not joined yet. The legend
  shows all four marks either way.
- With JavaScript disabled the page shows no picture, by the trade recorded under Accessibility.
- The picture is reachable and operable by keyboard alone: one Tab into it, arrows through the
  story, Enter to open a card, Escape to close, focus back where it started.
- Hovering a face leaves that person at full strength and everyone else's thread, beads and face
  faint; moving the pointer away brings them back.
- The map can be dragged with a pressed mouse in both modes, and a click on a moment still opens
  its card. `+`, `-`, Fit and 100% do what they say, and Ctrl with the wheel zooms about the
  pointer while the plain wheel still scrolls.
- Pressing the other mode's button moves the picture, the box and the roster's cards to their
  places in the other mode in a little over a second, in Chromium and in Firefox. From the top
  of River it lands at the start of Subway and from the bottom at the end. After Fit it lands
  fitted. With the system asking for reduced motion it switches at once.
- Adding a new profile with `member = true` and a moment referencing it makes a new thread appear
  with no other edit.
- A moment that is not a meetup, dated after the group began, draws the threads of the people it
  names through it, off the ribbon unless everyone in the group is named. A participant with no
  prior meetup has a thread that starts at their first moment and runs in toward the ribbon.
