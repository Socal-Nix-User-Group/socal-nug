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
- The page opens with one paragraph: nobody set out to start a group, people found Nix
  separately, and some of those paths crossed. A second paragraph ("This is where they
  crossed, and where they keep crossing. It grows every time somebody new turns up.") was
  dropped at Daniel's request on 2026-11-26. It was where the page's own words said the
  picture keeps growing, which the note on the name below asks for; the description for link
  previews still says "and the ones still joining". Daniel means to add to the first
  paragraph, and what goes there is not settled.

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

- `quote` is shown as a quotation, after the description, on the person's Origins card and on
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

A member's profile may also say `organizer = true` under `[extra]`. That member's badge then
says "Organizer" in place of "Member", on their Origins card and on the About grid; nothing
else about them changes, and the badge is still drawn as a member's. Daniel asked for it on
2026-11-26 for Daniel Baker, David Nuon and Rob Hernandez. It is a flag and not free text, so
the badge stays one of three words. The alternative, a field holding the badge's word, was
rejected as an invitation to a different tag for everyone. The page's data carries
`organizer` for every person, false when the profile does not say. On a guest it does nothing.
What a screen reader says for a face in the picture is still "member" or "guest", which is
what the face's ring shows.

There are two guests in the data. Matthew Croughan organizes Nix Camp and is at every one, was
at SCaLE 20x and 21x, and has been at every NixCon since 2024. Thomas Bereknyei, added on
2026-11-25, has been to no meetup: Thomas and Daniel Baker crossed paths in July 2022 over the
"What's new in Nix" videos, Thomas and Tristan Ross in July 2024, and Thomas was at SCaLE 21x,
22x and 23x, NixCon 2024 and Nix Vegas 2025. NixCon 2024 is in the data for the two guests
alone: nobody from the group is thought to have been there, so it is a moment that names
only guests, which the page draws like any other moment off the ribbon. That is what the
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
  unknown slug in either; `there` on a record that is not anchored to an event (a dated
  moment says who was there with `people`), and either list on the founding, which is a meetup
  with no event to anchor to; the same person in `there` and `away` for one event,
  across all its records; a person in either list for a meetup earlier than the one they joined
  at, or with no join record at all (before joining they were not in the group, and being there
  earlier would make that the meetup they joined at); and a person recorded `away` from the
  meetup they joined at.
- A dated moment that is not a meetup may carry `away` as well: the record says each person in
  it was not there. Such a moment has no anchored record to put the list on, so it carries the
  list itself. Daniel asked for it on 2026-11-25, to be shown away from Nix Vegas 2025. The
  validator rejects, naming the record: the same person in `people` and `away` of one moment;
  and a person away from a moment that comes before any moment they are at, where being at a
  moment means a record names them in `people` (a dated moment, or the meetup they joined at).
  A thread whose first stop is an empty seat says nothing true. "Before" is the order the
  picture uses, not the order of the dates as written: by the start of the date, a month or a
  year counting from its first day, and then by id, a meetup counting under its event's slug.
  It was first built comparing the dates with a missing month or day as nothing, which let a
  moment on the first of a month through as later than a moment dated only by that month,
  where the picture orders the two by id; the final review of the change found it. In the
  page's JSON every dated moment carries `away`, empty when the record has none.
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
  everyone in the group at its date, or lists away whoever it does not name, and beside the
  ribbon otherwise. Nix Camp in autumn 2023 is one
  beside it; SCaLE 22x, which everyone was at, is on it. Adding someone to the group takes such
  a moment off the ribbon until the record names them at it too, or lists them away from it, as
  happened when Samuel Raumin
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
  there by definition, so their thread through it carries a bead. Nobody else is through it:
  a member the record says nothing about passes it by on the ribbon, which says nothing either
  way.
- The record may list someone away from such a moment too. They are then drawn as someone away
  from a meetup is: their thread comes to the moment in a slot of its own, stops just short of
  it, starts again just after it, and a hollow bead sits in the slot. The difference from
  passing it by is that the record has said something: they were not there. Daniel Baker at
  Nix Vegas 2025 is the first.
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
   record says was away, who is marked as away; at any other moment, the people it names and
   the people it lists away, who are marked as away.
1. Every person with at least one moment is one thread through the moments they are through, in
   date order, from their first to their last. A moment they are recorded away from is on it,
   so a thread runs on to a last moment its person was away from. Someone who never joins has a
   thread through the moments that name them, or list them away, and nothing else.
1. Slot order is one order of people for the whole picture: by the meetup they joined at (people
   who never join go last), then by their first moment, then by slug. Because it is ordered by
   joining, the people in the group at any date are the first so many in it, and two threads keep
   the same side of each other wherever they run together.
1. A moment is on the ribbon when it is a meetup, or when there is a group at its date and
   everyone in it is through it, those it lists away counted. Nothing before the group exists
   is on the ribbon. On the ribbon
   a member's slot is their place in the slot order, so their thread stays in one slot from each
   such moment to the next, and a member recorded away keeps theirs. Anyone through it who has
   not joined yet takes the slots after the members'. Off the ribbon the people through it are
   packed, in slot order.
1. A passage through a moment is vouched for where the record says so: at any moment that is not
   a meetup, at the meetup a person joined at, and where a meetup's record lists them under
   `there`. Attendance is never inferred. A passage is away where the moment's record lists the
   person under `away`, meetup or not; it is then neither vouched for nor a join.
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
  pass-through they are passing, in date order. A moment someone is away from is a stop like any
  other, with their ports at their slot, which at a meetup is what keeps their thread in the
  ribbon.
- A pass-through: a side moment that anyone is passing also has an unseen node in its layer,
  `pass:<moment id>`, as wide as the group's slots, with no label, carrying a port pair at the
  ribbon slot of each member passing it. Their threads run straight through it, so only the
  people the moment names, and anyone it lists away, leave the ribbon. Without it ELK orders
  the side moment inside the
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
thread is unbroken. The exception is an end at a moment its person is away from. It is not
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
  An edge left out starts a new subpath, and so does a moment the person was away from, where
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
- River puts the rail in a column beside the map; Subway, and any viewport narrower than 1024px,
  puts it underneath. The rail holds the people and the moments, each in a list that scrolls in
  its own box; how the two are arranged in each case is under "The two lists".
- Beside the map the rail is as tall as the map's ceiling, 85% of the viewport, so the two end
  on one line however many people and moments there are. The ceiling is one value in the
  stylesheet, used by both. Like the map, a list lets the wheel carry on to the page once it
  reaches its end. The rail keeps that height when the map is zoomed out until it is shorter
  than its ceiling: a rail that shrank with the map would be no use at the small zooms.
- Switching modes morphs. Pressing the other mode's button moves everything from where it is to
  where it will be, over 1.2 seconds with a cubic ease in and out:
  - inside the picture, each face, each moment's pill, each bead, each label, each year line and
    year label, and each thread, bent from one shape to the other;
  - the canvas, from one mode's size to the other's;
  - the map's box, from the tall box beside the rail to the wide one above it;
  - each card of both lists, and the two headings, from one arrangement to the other. A card
    really is the width it appears to be on the way, so its text wraps as it travels and is
    never stretched. Cards cross over the picture on their way, and with two lists the
    people's cards cross the moments' as well, the words of one showing through another for
    part of the way. Daniel does not mind either: the first he said when there was one list,
    the second on 2026-11-25 after trying it. See "The two lists" for which cards are shown on
    the way.
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
  visit draws, and nothing the morph set on the box, the layout, the lists, the headings or the
  cards is left behind.
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
  bring it back." Both lists are still there.

### Cards and the popup

- Thread roots are the person's avatar, circular, ringed in their thread colour.
- Where the rail is under the map (Subway, and any window narrower than 1024px), clicking a face
  opens that person's card and clicking a moment opens its card, both in one popup
  that is a child of the scrolling map. Where the rail is beside the map nothing opens, since
  2026-11-25: the card is in the list beside what was clicked (see "One card for a moment, and
  the popup only under the map"). The popup is placed in the map's own scroll coordinates beside
  what was clicked, to the right and flipping left when there is no room, clamped to the slice of
  the map on screen so it never opens somewhere the reader has to scroll to find, and it pans with
  the map once open. A moment keeps a changed outline while its card is open.
- The popup closes on its X, on Escape, and on any click that is not inside it. A click on
  another face or moment swaps the card rather than closing it first. Zooming closes it, because
  what it was placed beside has moved; dragging the map does not.
- The roster lists everyone as the same person cards, without the X, in thread order: the order
  of the profiles in the About section (sorted by `weight`), as the template writes them into the
  data block, leaving out anyone with no moment. Thread order is also the palette's order. It is
  not the slot order the engine uses across a moment (see "The layout engine"). The roster is
  one of two lists in the rail beside River and under Subway; the other lists the moments (see
  "The two lists").
- Hovering a face lights that person: their thread is drawn thicker, their face's ring too, and
  their roster card is tinted. Hovering or focusing a roster card does the same. Hovering a moment
  lights everyone through it who was not away from it and tints its card in the list of
  moments; hovering that card does the same and outlines the moment in the map. A touch lights
  nothing by hovering; a tap opens the card and picks what was tapped, which lights it as any
  pick does (see "The two lists").
- While anyone is lit, by hover or by a pick, everyone who is not steps back: their thread,
  their beads and their face are drawn at a quarter strength, in the picture only. Moments and
  labels are not dimmed, since a moment belongs to everyone through it, and neither are the
  lists, which are being read and whose tinted cards already say who. Hovering a meetup
  therefore dims only the people recorded away from it and those who had not joined yet.
- A person's card carries avatar, name, membership badge, alias (linking to their profile) and
  their own links on one line that wraps, description, quote, and where they joined, as "Joined
  at" with that meetup's title and date. The arrangement is in "The card's order, links, years
  and who a moment lights".
- A moment's card carries title, date, photo, blurb, and the event page or outside links, and
  the moment's avatar, when it has one, beside the title, as a person's face is in theirs. Any
  moment that is not a meetup lists the people it names. A meetup's card says "Joined here:" with
  the names of who joined there, and "Confirmed there:" with anyone else the record vouches for,
  in place of who was there, because a thread through a meetup says only that its person was in
  the group then. No card lists who was away among its people, a meetup's or any other
  moment's; a description may say it in the author's words.
- **Why the rail went.** Once the lanes were wide enough to read, River needed every pixel of its
  width, and a 20rem column beside it was the first thing to give. That was under the lane
  allocator. ELK's River is much narrower, and the roster came back beside it in a different
  shape: the same cards as the popup, with highlighting both ways.
- **What it cost.** The rail was the keyboard route to a person's card, and removing it made
  person cards pointer-only for a while, as moment cards already were. The roving tabindex under
  Accessibility is what put a keyboard route back.

### The two lists

Daniel asked on 2026-11-24 for a list of moments like the list of people, and for a click on a
card in either list to centre the map on it and leave it lit. Three arrangements were mocked up
on the real page; Daniel chose the two boxes side by side for Subway and agreed the rest as
written here. Where this section and an older one disagree about the roster, this one is
right.

- **What is listed.** (The compact card described here lasted a day; a moment's card in the
  list is now the card its popup shows, see the next section.) People as before, in thread
  order. Moments: every moment in the story,
  meetups included, in the story's order, which is date order. A moment's card is compact: its
  avatar when it has one, its title, its date at the precision the data gives, and one line of
  names. On a meetup the names are who joined there and then who the record confirms; on any
  other moment, the people it names. Past four names the line ends "and N more". A meetup with
  nobody to name has no line.
- **Where they sit.** The rail (`#origins-roster`) holds two panes, People and Moments, each a
  heading over a list that scrolls in its own box.
  - River, in a window 1024px or wider: the rail is beside the map and as tall as the map's
    ceiling. The panes are stacked, each half of it, and each list scrolls down, as the map
    does. A rail with nothing in it has no height: the template starts every page in River, so
    without that a reader with JavaScript off, or one whose remembered mode is Subway in the
    moment before the script runs, would have an empty block most of a screen tall.
  - Subway, 1024px or wider: the rail is under the map. The panes are side by side, People
    three parts to Moments' two, each 46vh tall, with the people's cards two across. Each list
    scrolls down. The other arrangement mocked up was two rows scrolling sideways; Daniel chose
    this one.
  - Narrower than 1024px, in both modes: the rail is under the map with the panes stacked, and
    each list is one row that scrolls sideways, a person's card 19rem wide and a moment's
    13rem (19rem since it became the full card). Before the moments' list the roster on a narrow screen was the whole list of
    people; with forty-four moments under it the page would be very long. Like the map, a row
    keeps a sideways overscroll to itself, so a swipe at its end does not take the browser back
    a page. The rule holds up to 1023.98px and not 1023px: a zoomed browser can make a window a
    fraction of a pixel under 1024px, where neither arrangement would apply and both lists
    would run at full length.
- **Hover** pairs both ways, as it has for people. Over a moment's card: the card is tinted,
  whoever was at the moment and not away is lit, and the moment's pill takes its hover outline.
  Over a moment in the map: its card is tinted. That the card under the pointer is tinted was
  not asked for; a person's card already was, and the two lists should answer the pointer
  alike.
- **Picking.** A click on a card picks it. The map scrolls to put the thing picked in the
  middle of its box, as near as the box can scroll: a person's face, where their thread starts,
  or a moment's pill. The scroll is smooth unless the reader asks for reduced motion. What is
  picked stays lit after the pointer leaves: for a person, their thread, face and card; for a
  moment, everyone who was there, its pill outlined as it is while its card is open, and its
  card. One thing is picked at a time. A click on another card picks that instead; a click on
  the card already picked, a click on empty map, or Escape picks nothing. Hovering other cards
  still lights them on top of the pick. A double click counts as one click: taken as two, it
  would send the map to the card and leave nothing lit when it got there.
- A click on a card in a list opens no popup: the card already says what the popup would, and
  the popup would cover what was just centred. A popup that is open closes. A click on a link
  inside a person's card follows the link and picks nothing.
- **From the map.** A click on a face or a moment in the map picks it, and where the rail is
  under the map also opens its popup as before: its card in the list is marked and its list
  glides, inside its own box, until
  the card is in the middle of the box, or as near as the list goes. A card longer than the
  box is put at the box's start, since a card is read from its start and centred it would lose
  both ends. A reader who asks for reduced motion gets the list there at once. At first the
  list jumped the least distance that showed the card, which left the card at the box's edge;
  Daniel asked for the glide and the middle on 2026-11-25. The page does not scroll and the map
  does not move, since the reader is already
  looking at the thing. Opening a card from the keyboard does the same. The pick is not tied to
  the popup: closing the popup with its X leaves the pick, which is let go the same three ways
  as any other. A tap is a click, so on a touch screen a tap on a moment picks it and lights
  the people who were there; before this a tap lit nothing.
- **Keyboard.** The cards in the lists are not tab stops. Fifty-seven more would bury the rest
  of the page, which is what the one tab stop for the map was for. A keyboard reaches every
  person and moment through the map, where Enter picks it and either opens its popup or, beside
  the map, moves focus to its card in the list. The links inside the cards are ordinary tab
  stops: 57 of them the day a moment's card became the full card, and 60 later that day with
  one more person and three more moments.
- **What a pick outlasts.** A redraw for a resized window and a switch of mode: the new
  picture is lit and marked the same. Zooming and dragging the map do not touch it, and nor
  does a click anywhere outside the map and the lists.
- **Switching modes.** Every card of both lists, and the two headings, travel from their place
  in one arrangement to their place in the other, as the people's cards did. On the way a card
  is lifted out of its list and is no longer cut off by the list's box, so which cards show is
  decided: one in sight in its list at both ends shows all the way; one in sight at one end
  only fades in or out; one out of sight at both is not shown. In sight means any part of it
  is inside its list's box, so a card half hidden at the edge of its list shows whole while it
  travels. Each list comes out scrolled where it was, and keeps its room on the page while its
  cards are out of it, so nothing under it jumps. The layout cuts off anything past its sides
  for the length of the switch, because a card past the end of a sideways row would otherwise
  widen the page. Cards on their way answer no pointer.
- **How it is built.** The cards and the two panes are made by `momentCardFor`, `momentsFor`
  and `listsFor` in `src/cards.ts`. The arithmetic of a pick is in `src/pick.ts` and touches no
  page: what a click leaves picked, who a pick lights, where the map must scroll to put a point
  in its middle, and where a list must scroll to put a card in its. The page script keeps four
  things, the pick, the people lit by hover or focus, the moment whose card is under the
  pointer and the moment under the pointer in the map, and one function sets every lit, outlined
  and picked mark from them, in the map and in the lists. Nothing else sets those marks, which
  is what lets a hover end without unlighting a pick and a pick be let go without unlighting a
  hover. Every draw forgets what hover lit, since the elements that would have said the pointer
  left went with the old picture, and lights the new one from the pick. The point to centre on
  is read from where the face or the pill is on screen, the way the popup finds its anchor. A
  list is scrolled with its own `scrollTo`; `scrollIntoView` is not used, because it scrolls
  the page and the map as well.

The mock-ups are in `.superpowers/sdd/origins-loom-pictures/moment-list.html`, outside the
repository's history.

### One card for a moment, and the popup only under the map

Daniel asked on 2026-11-25 for a moment's card in the list to say everything its popup says,
so that the popup could go: with the two lists, and a click in the map bringing the card to
the middle of its list, the popup says nothing the list does not. A person's card was already
one card in both places.

What was measured first, on the 44 moments and 13 people of that day:

- The list's card lacked the blurb (10 moments have one), the event page link (20), the outside
  links (16 moments; 39 links in all with the event pages) and every name past four. No moment
  has a photo.
- A popup card is 96px to 235px tall, 143px at the median, against 80px for the list's compact
  card. Beside River in a 1000px window about two and a half show at once where four and a
  half did.
- The popup is redundant only where the lists are beside the map. Under Subway, with the map's
  top at the top of the window, the moments' list has 418px on screen in a 1920 by 1080
  window, 238px at 1440 by 900 and 106px at 1366 by 768. A card brought to the middle of that
  list is whole in the first, cut off at the bottom in the second and all but out of sight in
  the third.

Three ways to deal with the list being under the map were put to Daniel: keep the popup there;
remove it everywhere and scroll the page to the card; remove it everywhere and leave the reader
to scroll. Daniel chose the first.

- **One card.** A moment's card in the list is its popup's card without the X: mark, title,
  date, photo when it has one, blurb, names, event page and outside links. `detailFor` builds
  both, as `personCardFor` builds both of a person's. The names are the popup's, in full:
  "Joined here:" and "Confirmed there:" on a meetup, the people named on any other moment. The
  compact card and its limit of four names are gone.
- A meetup's card carries the trunk's colour down its edge and any other moment's the muted
  colour, in the list and in the popup alike, as their ovals do in the map. Before this the
  popup's edge was the trunk's colour for every moment.
- A click on a link in a moment's card follows the link and picks nothing, as in a person's
  card. A link is only as wide as its words, in the list and in the popup. As first built it
  stretched across the card, and a click on the blank beside it, meant for the card, followed
  the link; the final review found it.
- On a narrow screen a moment's card in its row is 19rem wide, as a person's is; 13rem was for
  the compact card.
- **Where the popup stays.** A click, a tap or Enter on a face or a moment in the map opens
  the popup when the rail is under the map: in Subway at any width, and in any window narrower
  than 1024px. When the rail is beside the map, which is River in a window 1024px or wider,
  nothing opens: the click picks, and the list glides to the card, which is beside what was
  clicked and says everything. The script tells which by where the rail is on the page, not by
  repeating the stylesheet's breakpoint: beside means the rail's left edge is at or past the
  map's right edge, read afresh at every click, since the window can be resized and the mode
  switched between two of them. A pointer click beside the map moves focus nowhere.
- **The keyboard, beside the map.** Enter or Space on a moment or a face moves focus to its
  card in the list, so a screen reader reads the card and its links are the next tab stops.
  Escape lets go of the pick and sends focus back to the map, to whatever the map's cursor is
  on, without scrolling anything. Only while focus has stayed on that card or inside it: once
  focus has left the card, by Tab or by a click somewhere else, it is where the reader put it,
  and Escape leaves it there even if it has since come back to the card. A click on the card
  itself is not leaving it, as a click inside the popup is not. The card takes focus from the
  script only; it is still not a tab stop, and it shows a ring while it has focus from the
  keyboard. Under the map the keyboard opens the popup with focus in it, as before.
- A moment's pill keeps its changed outline while it is picked, in every arrangement. The
  outline for an open popup is the same one and applies only where there is a popup.
- **What it costs: tab stops.** A moment's full card has links, so the rail now has 57 links
  after the map where it had 18, and a reader tabbing past the page goes through them. They are
  links and behave as links; making all but the picked card's unreachable by Tab was thought of
  and not done.
- The popup's code stays, since two of the three arrangements still open it.
- **As built.** In the list beside River a moment's card is 96px to 216px tall, 123px at the
  median, a little shorter than in the popup because the list is wider. Seen in headless
  Chromium: in River at 1400px a click on a moment opens nothing, marks its card and brings it
  to the middle of the list; Enter puts focus on the card, with its ring, and Escape sends it
  back; in Subway at 1400px and at 1366 by 768, and in River at 900px, the popup opens as it
  did. Read in the code and not tried in a browser: Space in place of Enter, a tap on a touch
  screen in a wide River window, and a switch from Subway to River with the popup open (a
  window widened with the popup open is tried, and closes it the same way).
- **A limit found in review: beside the map is not always in sight.** The rail beside River is
  as tall as the map, with the moments' list its lower half. Everything above was measured
  with the map's top at the top of the window. As the page opens, not yet scrolled, the map's
  top is about 400px down it (432px in a 1366 by 768 window, 402px at 1440 by 900 and 1920 by
  1080), and the moments' list starts at 793px, 819px and 895px. A click on a moment in the map
  then marks a card that is wholly below a 768px window, cut off at the bottom of a 900px one,
  and at 1080px mostly below it once it is brought to the middle of its list. Nothing else
  opens, so on a laptop the first click a visitor makes can show lit threads and no card. Once
  the page is scrolled so the map's top is at the top of the window the card is whole at all
  three sizes. The people's list is the upper half and is in sight either way. Three ways out
  were put to Daniel on 2026-11-25: open the popup beside the map as well whenever the card
  would not be wholly on screen; scroll the page to the card; or leave it. Daniel chose to
  leave it: people can be expected to scroll down.

### The card's order, links, years and who a moment lights

Five things Daniel asked for on 2026-11-25, after the two lists and the one card. Where this
section and an older one disagree, this one is right.

- **Who a moment lights.** A moment hovered or picked used to light everyone through it who
  was not recorded away, and at a meetup that is nearly everyone, since most attendance is in
  neither record. Now a person comes out one of three ways. Confirmed there: lit, as before.
  Recorded away, or not through the moment at all (not yet in the group, or not named by a
  moment that is not a meetup): stepping back to a quarter strength, as before. Through it with
  nothing recorded: not lit, their card in the list not tinted, and drawn between the two, at
  three quarters strength. Daniel's reason is that the picture should tell "was there" from
  "nobody wrote it down". As first built the unrecorded were left exactly as they were; Daniel
  tried it, liked it, and asked for them to dim a little. Half way, 0.625, was built first and
  read to Daniel as too close to stepping back: the unrecorded and the away are both thin
  lines told apart by strength alone, where the confirmed are thicker as well as brighter.
  Daniel chose 0.75 from pictures of 0.625, 0.75 and 0.85
  (`.superpowers/sdd/origins-loom-pictures/unsure-strength.html`, outside the repository's
  history). A person hovered or picked is as
  before. The three strengths hold whenever a moment is in play, so a meetup with nobody
  confirmed at it lights nobody, draws the people in the group then at 0.75 and everyone else
  at a quarter; that last part was not asked for and follows from having three strengths. With
  one moment picked and another hovered, someone confirmed at either is lit, and someone
  unrecorded at either and lit by neither is at 0.75.

- How it is built: `litBy` in `src/pick.ts` returns the confirmed, `unsureAt` the unrecorded,
  and `relight()` sets a class for each; the stylesheet's dimming rule holds while anyone has
  either class, and gives the unrecorded their own strength. Nothing else sets either class.

- **A person, the same on Origins and on About.** Daniel first gave the two pages different
  orders, then asked for them to be made the same: the same content in the same order, About
  gaining the badge and the joined line. Daniel chose the arrangement on 2026-11-26 from three
  rounds of mock-ups on both pages (option G of
  `.superpowers/sdd/origins-loom-pictures/card-order3.html`, outside the repository's history):

  ```
  [picture]  Name  [MEMBER]
             @handle  link  link

  Description, across the whole card.

    "Quote", across the whole card.

  Joined at <meetup>, <date>
  ```

  The picture sits beside two lines only: the name with the membership badge after it, and
  the handle with the person's own links on one line that wraps. The description, the quote
  and where they joined run under the picture at the card's full width, in that order. A part
  a person does not have is left out and nothing takes its place. Before this the Origins card
  was name with badge, handle, links, description, joined, quote, all beside the picture, and
  About was name, handle, description, links, quote with no badge and no joined line.

- How it is built. The two pages keep their own markup and their own look; what is the same is
  what they say and in what order. On Origins `personCardFor` builds one card for the list and
  the popup: `div.origins-card-top` (the picture, then `div.origins-card-who` with the head and
  the links row, the handle first in it), then the description, the quote, the joined line and
  the popup's X. On About `templates/about.html` writes `div.about-profile` with the same
  parts in About's look (the 128px picture, the Bulma title), styled by
  `sass/css/pages/about.scss`. The badge on About says "Member", since only members are
  listed there, or "Organizer" for a member whose profile says so (see "People"); it was in
  every mock-up Daniel chose from, and Daniel confirmed wanting it on 2026-11-26.

- **Where a member joined is worked out twice.** The engine has it from the story
  (`joinLineFor`); the About template works it out from the same data the Origins template
  reads, by the same rule: among the meetups that name the member (an event through a record
  anchored to it, or a dated moment with `trunk = true`), the earliest by the start of its
  date and then by id, written at the precision the data gives. Two things hold the pages
  together: a site test recomputes the line for every member from the Origins page's data, and
  a browser check reads every member from both pages and compares name, badge, handle, links,
  description, quote and joined line, part for part and in order.

- **Each About profile is in a box.** Daniel found the profiles hard to tell apart: nothing
  enclosed one, so it was not clear where a profile ended. Each is now a box in the shade
  Bulma gives its faint borders (`--bulma-border-weak`), so it follows the theme, and the two
  boxes of a row are the same height. The shade took three tries, each a step further from
  the page's: `--bulma-scheme-main-bis` as first built, which showed in the dark theme and was
  too faint on a white page; `--bulma-background` when Daniel asked for a darker shade; and
  this one, which Daniel chose on 2026-11-26 from pictures of that, this and a step beyond
  (`.superpowers/sdd/origins-loom-pictures/box-shade.html`, outside the repository's history).
  Bulma fills a quote with a shade one step from the box's, so the quote inside a profile
  takes the page's own colour and stays a clear box within the box. It has `0.5em 0.9em` of
  padding where Bulma gives `1.25em 1.5em`, which Daniel asked to be reduced.

- **Links.** A link to another site opens a new tab, with `rel="noopener"`: a person's handle
  and own links, on Origins and on About, and a moment's outside links. A link to this site
  stays in the tab, which today is a meetup's "Event page" link. Daniel's rule.

- **River's year numbers are under their lines.** A year's number marks where the year begins.
  In River it sat just above the dashed line that starts the year, over the end of the year
  before; its baseline is now 14px below the line. Subway's numbers are beside their lines, on
  the new year's side already, and did not move.

- **Away from a moment that is not a meetup.** Daniel was sick the week of Nix Vegas 2025 and
  asked to be shown as away from it. `away` was allowed only on a meetup, and a moment that is
  not a meetup drew only the
  people it names. Built on 2026-11-26, once the card's order was settled: a dated moment that
  is not a meetup may carry `away` (the rule is under "Moments"), and the person is drawn at
  it as at a meetup they missed (under "What a thread through a meetup means"). Four
  decisions were made in building it, none of which Daniel was asked:

  - The field is `away` again and not a new name, since it already means "the record says
    they were not there".
  - Someone away is through the moment, so they count toward "everyone in the group is through
    it": a moment that names the whole group but for those away is on the ribbon, each member
    in their own slot. Left beside the ribbon, the same mark would read differently from a
    meetup's. Nix Vegas 2025 names five people and stays beside the ribbon either way. It
    follows that a moment that names nobody and lists the whole group away is a row of hollow
    beads on the ribbon. Daniel was shown this and the alternative on 2026-11-26 and kept it
    for now; the alternative is recorded below as option B.
  - Away from a moment that comes before any the person is at is rejected by the validator.
  - The card's line of people and the spoken label of a moment that is not a meetup leave out
    who was away from it. Daniel decided that for a meetup's card and label; it is extended
    here. The card's description is the author's own words and may say who missed it and why:
    Daniel asked for the reason to be in the description of Nix Vegas 2025, and the record's
    `blurb` gives it. It was first put in a comment on the record, which was not what Daniel
    meant by adding the context.

  What changed in the engine is two lines of the story (`src/story.ts`), who is through a
  moment that is not a meetup and that `away` is read on any moment, and the count in
  `describeGathering` (`src/focus.ts`), which leaves out whoever was away. Placement, drawing,
  the morph and the lighting already worked from a passage's `away`. Hovering or picking such a
  moment therefore lights who was at it and draws whoever was away from it at a quarter
  strength, with everyone who was never there. Its card lists only the people at it, and what
  a screen reader says for its pill counts only them ("Nix Vegas, 7 August 2025, 5 people").
  In the picture Daniel's thread now leaves the ribbon for Nix Vegas 2025, breaks either side
  of its pill around a hollow bead, and returns. The smoke check has the picture at 549 by 3226
  in River and 6573 by 467 in Subway, with no finding; it was 544 by 3225 and 6572 by 467
  when Thomas Bereknyei was added, so the extra slot at Nix Vegas costs River five pixels of
  width and nothing a reader would see.

- **Option B for the ribbon, not built.** The rule above is option A: someone away counts
  toward "everyone in the group is through it". The alternative is that only people who were
  there count. Under B someone listed away still comes to the moment and breaks there with
  the hollow bead, but a moment that names everyone except those away stays beside the
  ribbon, and every thread, the absent person's among them, leaves the ribbon to reach it.
  The ribbon then says "the whole group was there" and nothing weaker. Under A it also says
  "the whole group is accounted for", which keeps the ribbon straight and makes a missed
  conference look exactly like a missed meetup.

  Daniel compared the two on 2026-11-26 on a made-up record in the real picture, SCaLE 22x
  with Daniel Baker away from it, beside the same record with nothing said about Daniel
  (`.superpowers/sdd/origins-loom-pictures/ribbon-rule.html`, outside the repository's
  history; B drawn by a throwaway bundle). Daniel kept A for now and asked for B to be
  recorded as an alternative. In that mock-up A leaves the picture the size it is; B puts
  SCaLE 22x out of the ribbon's column, twelve threads swinging out to it and back, with
  River about 20px longer and Subway 26px taller.

  What B would take: one condition in `buildStory`, where a moment that is not a meetup is on
  the ribbon when everyone in the group is through it and none of them is away; the story
  test that such a moment is on the ribbon, which turns round; the made-up histories'
  `away-whole` moment, which exists to be on the ribbon because of an absence, and its test;
  and this section. Nothing else reads the rule. Nobody passes such a moment, so it has no
  pass-through and the spine skips its layer, which the mock-up drew without a finding by eye
  but which the smoke check has not been run on.

### Member and guest treatment

Several signals, so it does not depend on colour alone:

|               | Member                         | Guest                      |
| ------------- | ------------------------------ | -------------------------- |
| Avatar ring   | Thread colour, full saturation | Grey, dashed; image greyed |
| Card bar      | Solid, thread colour           | Dashed, grey               |
| Thread stroke | Solid                          | Dashed and thinner         |
| Badge         | Filled, "Member"               | Dashed outline, "Guest"    |

A member who organizes the group has the member's badge with the word "Organizer" in it.

Colour identifies individual threads only while there are few enough to tell apart. The palette
has twelve hues, in light and dark versions; the first twelve threads in thread order each take
one, and every thread after that takes a single muted colour. Past that point identity comes from
the face, the roster card and highlight-on-hover, which thickens a thread rather than colouring
it. Member and guest remain distinguishable at any size, because that distinction rides on ring,
stroke, card and badge rather than on hue. This is a call made in the absence of a preference
and is worth revisiting once the group passes a dozen. It has reached it: the twelve members
take the twelve hues, and Matthew Croughan, the thirteenth thread and a guest, is the first in
the muted colour. Thomas Bereknyei, the fourteenth and a guest too, is the second. The next
member added will be as well.

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
card with focus in it, and Escape closes it with focus back where it was. Where the rail is
beside the map there is no popup to open, and Enter or Space moves focus to the card in the
list instead, with Escape sending it back (see "One card for a moment, and the popup only
under the map"). Forward is Down or Right in both modes. One tab stop for every moment and face, several dozen of them, in the middle of a
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
rail, and the page source carries the history only as the JSON data block. A reader whose
browser fails to fetch the 1.6 MB layout engine gets both lists and a sentence in the map saying
the picture could not be drawn. That was an accepted trade, not an oversight.

`test_site.py` asserts the list is absent and that the data block carries the history instead.

The list of moments in the rail (see "The two lists") is not that list come back. The script
builds it from the same data block the picture is drawn from, so there is no second copy to
keep correct, and with JavaScript off it is not there. A screen reader does now meet each
moment twice, as a button in the picture and as a list item under a "Moments" heading with
everything its card says: title, date, blurb, names and links. The cards in both lists answer a
click and are not buttons or tab stops: picking from a list is a pointer's convenience, as
taking hold of the map is, and the keyboard's way to a person or a moment stays the picture,
where Enter picks it and either opens its popup or moves focus to its card in the list. The
links inside the cards are tab stops like any links, 57 of them after the map when a moment's
card became the full card and more with every person and moment added. That is the wall the map's single tab stop was made to avoid, come
back in the rail, and it was accepted as the price of links that behave as links.

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
  cards (a moment's card in the list and the two panes among them), the arithmetic of a pick,
  keyboard order, the toggle, the zoom's arithmetic (a button's step,
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
  url; and, for `there` and `away`, an unknown slug, `there` on a dated moment, one person in
  both, a person before the meetup they joined at, a person with no join record, and a person
  away from the meetup they joined at; and, for `away` on a dated moment, a person also in its
  `people`, a person away from a moment before any they are at, the same where the two start
  on one day and the absence sorts first by id, and `away` on the founding. One
  fixture must only warn (nothing predates the first `trunk` moment), and four must pass
  cleanly, two of them a dated moment with someone away from it, one where the moment they
  are at starts on the same day and sorts first. A rejection is matched on a word or phrase
  from its message, such as the bad slug, the bad date or "both there and away", not on the
  record's id. The validator also rejects four things that no fixture exercises: a dated moment
  with no title, a date in the right format that does not exist (such as a month 13), a moment
  with no `id`, and `links` that is not a list.

- `frontmatter` extends to the required `member` field through `profiles.json`, and to a
  profile's `links`, each of which needs a title and a url.

- `test-site` checks the built page: its data block parses and carries the history, the meetups
  come from the events section and carry `there` and `away` lists, a record's attendance reaches
  its meetup through the template's merge, every dated moment carries an `away` list and an
  entry written on one reaches that moment and no other, the fallback list is absent, and the
  bundle, the
  vendored layout engine (before the bundle), the toggle, the zoom's four labelled buttons and
  the rail are in place. It reads the stylesheet for the rules behind the legend's tooltip,
  the hand over the map, the dimming of whoever is not lit, the rail taking the map's ceiling
  beside it when it has anything in it, the two lists side by side under Subway and as rows
  that keep their overscroll on a narrow screen, and a moment's outline while its card in the
  list is under the pointer. It checks that the guest in the data is on the Origins page and not in the
  About grid, and proves the About filter with a guest probe as well. It checks that every
  member's own links are in the data block and on the About grid, and that every member's quote
  is on the About grid as a quotation. It checks that a member's profile on About has its parts
  in the arrangement's order, that every profile is in its box and carries one badge, saying
  "Organizer" for a member the page's data says organizes the group and "Member" for any
  other, that the data says of everyone whether they organize it and of no guest that they
  do, and that
  every member's joined line is the one the rule gives from the Origins page's data. It checks
  that every moment's avatar in the data block is a file the built site serves.

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
  - for everyone recorded as away from a moment, a meetup or any other, no part of their drawn
    thread is inside that moment's box and a hollow bead is at their slot in it, and there is
    no hollow bead anywhere else. A slug the record repeats in one list is one absence, as it
    is one passage in the story.

  With both modes laid out it also builds the morph between them, each way, and checks that it
  starts on the drawing of the mode being left and ends on the drawing of the one arrived at:
  the layouts pair up; each thread traces the drawn one to within a twentieth of a pixel and is
  in the same number of stretches at the start, half way and the end; and the avatars, beads,
  labels, year lines and years are where they are drawn. The unit tests cut a thread's curves to
  match only on a made-up case, and this is where it is tried on real layouts.

  It does the same for nine made-up histories generated from fixed seeds (`smoke/histories.ts`):
  seeds 1 to 3, each at about today's size and one and two years on, twenty layouts in all with
  the real data. Their gatherings beside the meetups carry an avatar, so the room for one is
  tried on layouts the real data does not have. Each also has someone away from a moment that
  is not a meetup twice: once at a moment that names part of the group and stays beside the
  ribbon, and once at a moment that names everyone else and is on the ribbon because of the
  absence. They depend on nothing but their seeds, so a
  content change can never alter them or turn them red. Every finding is fatal, and the check prints a line for every layout before
  failing so one run shows them all. A finding about layout (an overlap, a label, the ribbon, a
  thread stepping out) on the real data says that the picture came out wrong for the data as it
  now stands, that nothing in the author's change is mistaken, and that it needs a maintainer who
  knows the layout engine; on a made-up history it says only a change to the engine can have
  caused it. The rest (a missing position, edge or pass-through, a bead with no record behind it,
  a thread inside a moment its person is recorded away from, a hollow bead missing or out of
  place) cannot be caused by data and say
  they are a bug in the engine. Every other engine test runs on fixtures and fakes the layout, so
  without this a plausible typo in the real data, or a layout ELK is happy with that the renderer
  is not, ships with the whole suite green.

**On demand, not a check:** `nix run .#socal-nug-braid-browser` loads the page in headless
Chromium and behaves like a visitor: it wheels past the map and past the lists beside it, drags
a finger through the map on a phone-sized screen, clicks and tabs into cards, hovers moments
and their cards in the list, clicks cards in both lists, switches modes and watches the picture
travel, zooms with the buttons and with Ctrl and the wheel, takes hold of the map with a pressed
mouse and drags it, blocks the layout engine, and asks for the dark theme and for reduced
motion. Sixteen of its checks are about the morph: that it takes time, passes through pictures
that are neither mode's, and stops; that it lands on the picture a fresh visit draws, both ways
and after the window is narrowed part way; that nothing is left set on the box, the layout, the
lists, the headings or the cards, with every card back in its own list and in order; that a
moment's card is part way between its two places on the way; that a list scrolled part way
down comes out scrolled where it was; that a click where a card is passing picks nothing; that
the view lands the same share of the way along and a round trip returns; that a fitted view
arrives fitted; that the mode and zoom buttons do nothing while it moves; that reduced motion
makes it instant; and that a switch made to fail, in a frame and before the first one, still
ends in the ordinary picture with the next switch working. Two more are about where the view is
put without a morph: a River wider than its box opens centred, and the instant switch lands the
same share of the way along. Three are about a moment's avatar: a click on it opens its
moment's card in the place a click on the pill opens it, it is part way between its two places
while the mode changes, and in River every one stands the same distance from its label's text,
which only a browser can say, since only a browser knows how wide the text came out.

Nine are about the two lists as they stand: the rail no taller than the map beside River; the
two lists one above the other there and side by side under Subway, each scrolling in its own
box; two rows that scroll sideways in a narrow window; the wheel over a list scrolling that
list and then the page; both lists there when the layout engine is blocked; and hover, a
moment's card lighting its people and outlining its pill, a moment in the map tinting its card,
and the card under the pointer tinted. Eighteen are about a pick: a click on a person's card
and on a moment's card bringing the face or the pill to the middle of the map, or the map to
the end of its reach, and leaving the right people lit; a double click leaving the card
picked; no popup opening for it, and one that is open closing; each of the three ways of
letting go; a hover on another card adding to the pick and leaving it standing when it ends; a
click on a moment or a face in the map, and the keyboard's Enter there, marking its card, a
click gliding its list until the card is in the middle of it, without a jump and without
moving the page or the map; a click on a link in a person's card picking nobody; the zoom and
a drag leaving the pick; the pick still there after a switch and after a resize; a picture
redrawn under a resting pointer leaving nobody lit; the map, and a list, put there at once
under reduced motion; and a tap picking the moment, with nothing left lit once it is let go.
Each check that could pass for want of anything to click also asserts that the pick it depends
on happened.

Eight are about the one card for a moment and where the popup stays. A moment's card in the
list says what its card in the map says, word for word and link for link; a click on a link in
it picks nothing, and a click beside the link, on the card, picks the card and goes nowhere; in
a narrow window it is as wide as a person's. Beside the map a click on a
moment opens no card, marks its card in the list and glides the list to it, and its oval keeps
the changed outline while it is picked; in a narrow window in River the click opens the popup;
and a window widened until the lists are beside the map closes a popup that was open and keeps
the pick. The check of the keyboard beside the map was restated with them: Enter picks, moves
focus to the card in the list, and Escape sends focus back, but not when the reader has put it
somewhere else, nor when it has left the card and come back. Every older check that opens the
popup now runs in Subway, where the popup is, with the claim and the assertions it had.

Six came with the card's order and the lighting: a person's card with their name, badge,
handle and links beside the picture and what they do, their own words and where they joined
under it, in the list and in the popup with the X clear of the name and the badge (restated
when the arrangement was settled); a link to another site opening a new tab and one to
this site staying in it; River's year numbers under their lines; a meetup lighting the
confirmed, dimming the away and the not yet joined, and dimming everyone else a little, by
hover and by a pick; and a meetup with nobody confirmed dimming the group a little and
everyone else further. The checks that
compare who is lit with the record now expect the confirmed.

Two are about the About page, which the check's server also serves: it and the Origins page
say the same about every member, part for part and in the same order; and every profile there
is in its own box, with the boxes of a row the same height and each quote a box of another
shade inside its profile's.

Three are about being away from a moment that is not a meetup: whoever the record lists away
from one has a hollow bead in its pill, in both modes; hovering it lights who was at it and
draws whoever was away as far back as someone who was never there, not lit and not half way;
and its card's line of people does not list them and its pill's spoken label does not count
them (the card's description is not read, since it may say who missed it). Each finds
its moment in the page's data and fails if the data has none, so taking the only such record
out of the data takes the three with it.

A hundred and four checks, each named for what a visitor would
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
colour comes from the data (it does not; it is a palette slot by thread index). The rail, with
the roster and since 2026-11-24 the list of moments, sits to the right in River and below in
Subway. A freestanding moment may carry `links`, a list of
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
- **Whether someone away counts toward the ribbon.** They do, by option A, which Daniel kept
  "for now" on 2026-11-26. Option B, where a moment is on the ribbon only when the whole group
  was there, is recorded with what it would take under "The card's order, links, years and who
  a moment lights". No record in the data is affected by the choice yet.
- **Descriptions and quotes.** Joshua Campbell and Thomas Bereknyei have neither a description
  nor a quote, and Matthew Croughan has a quote and no description. Everyone else has a
  description; Daniel Baker, Jared Baur, Mica, Connor Baker, Matthew Croughan and Morgan Jones
  have a quote, and only Daniel Baker, David Nuon, Samuel Raumin and Chris Tewfik have links.
  Jared Baur's "First contact" has no blurb, though the other four have one. Tristan Ross's
  was added on 2026-11-26: the first commit in Tristan's dotfiles that sets up NixOS, dated
  1 August 2022 in the commit's own Pacific time (a reader in UTC is shown 2 August), with
  Tristan's account of why. The blurb takes "Void" in that account to be Void Linux, which
  nothing in the repository's history says either way. It took the picture to 48 moments, 593
  by 3336 in River and 6728 by 478 in Subway by the smoke check, with no finding. Tristan Ross and
  Thomas Bereknyei's "Paths cross" of July 2024 has none: Daniel has no details of it yet.
  Several conference and camp moments have none.
- **Seven `CONFIRM` markers** in `data/moments.toml`: two dates given as approximations, one
  meetup guessed at (Connor Baker's first, below), "I think everyone was there" on the three
  SCaLE moments, and "I believe David and I were at every single NUG event" over the attendance
  records.
- **A description on a meetup's card.** A meetup's card has none: the template builds a meetup
  from its event post and the records anchored to it, and carries no blurb across, though the
  card would show one. Daniel wants meetups to have descriptions eventually, and on 2026-11-25
  chose to add that when the first description is ready, not before.
- **Who met whom at SCaLE 20x.** The moment was "Nix booth at SCaLE 20x" and is now "SCaLE 20x",
  the whole conference, by Daniel's decision, so that everyone who was at SCaLE that year is
  through it whether or not they were at the booth. Joshua Campbell is on it for that reason;
  Daniel does not recall whether Joshua visited the booth. Its blurb still says only who was at
  the booth and that Daniel Baker and David Nuon met Rob Hernandez there. Daniel means to
  expand it with who met whom, and on 2026-11-25 set it aside until more is gathered about that
  year.
- **Who was at each meetup** is recorded whole, everyone in the group either there or away, for
  nine meetups: the seven Daniel checked against pictures (NUG #1, #2, #3, #4, #6, the June 2025
  Mini NUG and NUG #17) and two Daniel gave on 2026-11-24, NUG #5 and NUG #10, the second from
  a picture, each as a list of who was there with every other member not. For the other ten up
  to NUG #17 Daniel Baker and David Nuon are recorded, and Chris Tewfik, and at NUG #12 Tristan
  Ross and Morgan Jones, and nothing is said about anyone else. The lists name only people who
  have a profile; others were at many of these. Chris is recorded at every meetup
  from NUG #5, where Chris joined, to NUG #17: there at NUG #6 and NUG #17, which Daniel knew
  of, and at NUG #7, #8, #11, #12, #13 and the June 2025 Mini NUG, which Chris added,
  saying there were no others; so away from NUG #9, the April 2025 Mini NUG and NUG #14, #15
  and #16. Chris's account also had NUG #10, which Daniel's list and picture did not; Daniel
  settled on 2026-11-25 that Chris was not there, and the record has Chris away from it. Joshua Campbell was added after the seven were recorded, and Daniel then placed
  Joshua at each from NUG #2, where Joshua joined: there at NUG #4, and away from NUG #3,
  NUG #6, the June 2025 Mini NUG and NUG #17.
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
- **River wider than its box.** The picture's size moves with the data, and not always up.
  With Thomas Bereknyei and three more moments off the ribbon, added on 2026-11-25, the layout
  engine arranged River 544px wide and 3225px tall, where it had been 764px by 2968px, and
  Subway 6572px by 467px, where its box had been 607px tall. So River now fits its box from a
  1216px window up and scrolls sideways only from 1024px to 1215px and on a phone; what follows
  was written when it was 764px wide. River is 764px wide, 23px of that the room for the
  moments' avatars. Beside the rail its box is 859px in a
  window of 1408px or more, 667px from 1216px and 475px from 1024px, all measured, so in a
  window from 1024px to 1407px, and on a phone, River scrolls sideways. It opens centred (see
  "Toggle and responsive behaviour"). The cost is the year numbers: they are drawn 6px in from
  the picture's left edge, so wherever River is wider than its box none of them is in view
  until the reader scrolls left, though the year lines still cross the picture. Keeping them at
  the box's edge as the map scrolls has not been tried. Before the commit that added Nix Camp
  2026 and NixCon 2024 River was 658px and fitted from 1216px up. It did not fit the 475px box
  then either.
- **Picking on a narrow screen.** Under 1024px the lists are under the map, which is most of a
  screen tall, so a card is usually clicked with the map out of sight above it. The map centres
  and the people light, but what the reader sees is the card marked. Scrolling the page up to
  the map on a pick was not asked for and has not been tried.
- **A pick that outlives its popup.** This is now only where the popup still opens, with the
  rail under the map. A click or a tap on a moment in the map picks it, and
  closing its popup with the X leaves the people lit and everyone else faint until Escape, a
  click on empty map or a click on its card. That is the rule as agreed, and it is one rule for
  every pick. On a phone the card that shows what is picked is under the map and out of sight,
  so the lit threads have nothing beside them to say why. From the keyboard, a card opened
  with Enter puts focus on its X, so Enter again closes the card and leaves the pick, where
  Escape lets go of it. Daniel has not tried either.
- **A picked card out of sight after a switch.** Each list comes out of a switch scrolled as
  far as it was. The people are one across beside River and two across under Subway, so the
  same distance shows other people, and someone picked from the middle of the list in River
  can be above what shows in Subway. The same goes for a window resized across 1024px, where
  the lists change from scrolling down to scrolling sideways. Whether a switch should bring the
  picked card back into view is a question for Daniel.
- **A card clicked before the first picture.** The lists are there as soon as the script
  runs and the picture only once the layout engine has laid it out. A card clicked in between
  is picked, and lit when the picture arrives, but the map opens where it always opens and
  does not go to it.
- **A press on the map's scrollbar.** In headless Chromium it sends no click, so it lets go of
  nothing, which was tried. Firefox and Safari were not. A browser that sends the box a click
  for it would let go of the pick, which scrolling the map is not meant to do.
- **Checks that keep time.** Four of the new browser checks read the page inside the 1.2
  seconds of a switch, look for a scroll to have begun shortly after a click, or, to tell a
  glide from a jump, look for a list not to have arrived straight after one. On a machine slow
  enough they would fail with the page right; none can pass with it wrong. One older check is
  the same.
- **Hover across a redraw.** A draw forgets who hover lit. With the pointer resting on a card
  in a list while the picture is redrawn (a resize, a switch), the card stays tinted and a
  moment's pill stays outlined, but the people it lit go unlit until the pointer moves off and
  back. Someone lit from two places at once, say a focused link in their card and a hovered
  moment they were at, is unlit when either ends, as before this work.
- **The lists and picks beyond what was tried.** Headless Chromium only: the browser check,
  and pictures of the three arrangements, a hovered card, a picked card and a switch part way.
  Not Firefox, not Safari. The switch uses `overflow-x: clip` and the centring a smooth
  `scrollTo`, and neither has been seen in any other browser. The rule for a window a fraction
  of a pixel under 1024px was not seen at such a width: a frame given 1023.5px came out 1024px
  wide in headless Chromium, so only 1023px and 1024px were measured, each with its own
  arrangement. The rail with JavaScript off was measured and takes no room. A card
  clicked with the layout engine blocked was read and not tried: it is picked and has nowhere
  to scroll to.
- **An id rule in the validator.** Nothing stops a `|` in a moment id, or a person slugged
  `spine`, and either would break placement: port ids are split on `|`, and the spine's edges
  are named `spine:<n>`, as a person's edges are named `<slug>:<n>`.
- **Validator rejections with no fixture.** `braid-data` has no fixture for a dated moment with no
  title, a well-formed date that does not exist, a moment with no `id`, or `links` that is not a
  list, so nothing shows those rejections still work.
- **Safari** has not been tried. The page has been checked in Firefox and Chromium. Daniel
  looked at Origins and About in both on 2026-11-26, after the one arrangement of a person,
  the About boxes and the absence at Nix Vegas 2025, and found them good. The scrollbars of the
  map and the lists are white in Firefox's dark theme; Daniel has seen that and is content
  with it.
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
- An `away` entry on a moment that is not a meetup brings that person's thread to it, broken
  either side of its pill around a hollow bead; Nix Vegas 2025 is the first with one. Its card
  does not list them among its people, though its description says Daniel Baker missed it,
  and hovering it leaves them as faint as someone who was never there.
- With JavaScript disabled the page shows no picture, by the trade recorded under Accessibility.
- The picture is reachable and operable by keyboard alone: one Tab into it, arrows through the
  story, Enter to open a card, Escape to close, focus back where it started.
- Hovering a face leaves that person at full strength and everyone else's thread, beads and face
  faint; moving the pointer away brings them back.
- The map can be dragged with a pressed mouse in both modes, and a click on a moment still opens
  its card. `+`, `-`, Fit and 100% do what they say, and Ctrl with the wheel zooms about the
  pointer while the plain wheel still scrolls.
- The rail lists the people and the moments: one list above the other beside River, side by
  side under Subway, and two rows that scroll sideways in a window narrower than 1024px, in
  Chromium. A click on a card in either list brings its face or its pill to the middle of the
  map and leaves it lit until the same card is clicked again, empty map is clicked, or Escape
  is pressed. A click on a moment in the map marks its card in the list.
- Pressing the other mode's button moves the picture, the box and the cards of both lists to
  their places in the other mode in a little over a second. The picture and the box were seen
  to in Chromium and in Firefox; the lists, since the moments' list was added, in Chromium
  only. From the top
  of River it lands at the start of Subway and from the bottom at the end. After Fit it lands
  fitted. With the system asking for reduced motion it switches at once.
- Adding a new profile with `member = true` and a moment referencing it makes a new thread appear
  with no other edit.
- A moment that is not a meetup, dated after the group began, draws the threads of the people it
  names through it, off the ribbon unless everyone in the group is named. A participant with no
  prior meetup has a thread that starts at their first moment and runs in toward the ribbon.
