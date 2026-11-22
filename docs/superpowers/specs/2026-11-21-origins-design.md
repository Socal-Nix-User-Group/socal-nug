# Origins

Date: 2026-11-21. Branch `worktree-how-we-met`, based on `main` after the CI rework (#98).

## Intent

A page showing the separate paths that converged into the SoCal Nix Users Group, computed from
event records rather than drawn by hand.

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
  thread simply starts there, short, with their avatar root at that point. Adding roots later
  lengthens threads leftward and must require no engine, template or schema change. The page must
  never look broken because somebody's history has not been collected yet, and it must not look
  like a placeholder either.

## Non-goals

- Replacing the About page. Origins is a new page. About keeps its member grid.
- Editing or replacing the "One Year of SNUG" post.
- Meetup attendance records. A person joins the braid at the moment their data says they joined.
  This is a story, not a roll call.
- Self-hosting. Netlify keeps building until that separate project lands.
- Formatting of templates, SCSS or TypeScript. treefmt covers Nix, shell and documentation
  Markdown only, and that is unchanged.

## Anti-goals

- Any claim about who met whom. Two people sharing a moment means two threads passed through one
  point in time. It does not assert an introduction.
- A second layout engine. One pass computes abstract positions; projections consume them. If
  River and Map ever need separate position logic, the design has failed.
- A layout that silently degrades as the group grows, where the right answer at six people is the
  wrong answer at forty.

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
- `socal-nug-site` restricts its source with `lib.fileset` to `config.toml`, `content`, `sass`,
  `static` and `templates`. Any new top-level directory Zola reads must be added there or the Nix
  build will differ from a local `zola build`.
- The site supports light and dark themes. Anything drawn must work in both.

## Approaches

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
1. **Living braid.** Chosen. Personal threads before convergence, then a SNUG trunk that thickens
   as people join at the moment they first appear. A newcomer can see where they would attach.
   Its known weakness is that the post-convergence half risks being one undifferentiated rope.
   Excursions (layout rule 6) are the answer to that, not a decoration: subsets of the group peel
   off for a camp or a conference and come back, sometimes with someone new.

### Layout

Vertical river, horizontal subway map, and per-person swimlanes were all mocked up. Swimlanes were
dropped: legible and cheap, but it reads as a project schedule, and one row per person wastes the
page at forty members. River and Map were both kept, because they are the same layout transposed
and the toggle is therefore nearly free.

### Rendering

1. Build-time generation by a Python tool, in the manner of `socal-nug-make-event-ical`. Works
   without JavaScript, testable, zero new dependencies, but fixed geometry and no animation.
1. **Client-side TypeScript.** Chosen, with the no-JavaScript cost accepted explicitly: without
   JavaScript the page shows the fallback list described below and no picture. Chosen for the
   interaction headroom, since a morph between projections, hover highlighting and popovers are
   the point of the page feeling good.
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
the braid reads people from. A thin guest page is the cheaper cost.

Guests may fill in `image_url` and `description` or leave them empty. The page handles both.

There are no guests in the data at present. The mechanism stays, because the braid is meant to
be able to show people who are part of the story without listing them as members of the group,
and `test_site.py` proves the About filter with a probe rather than leaving it untested.

Daniel Baker, "Dan" and `@djacu` are one person with one slug, `daniel-baker`. The anniversary
post's "Dan, Daniel and Ben" is three separate people: Daniel Baker, Daniel Fullmer, and Ben.
Two different Daniels, which is a trap worth knowing about before reading any of the old
material. Fullmer is deliberately out of the initial data set and Ben gets no profile, so of
that trio only `daniel-baker` carries a thread.

### Moments

The page merges two sources in the template.

**`content/events/` supplies the spine.** Every event page is a trunk moment, contributing its
date, title and permalink. Posting a meetup grows the braid with no edit anywhere else. The
existing twenty-meetup history is already exact, and it is never copied.

**`data/moments.toml` supplies the rest**: the personal moments before and outside the group, and
the records of which event each person first turned up to. Event files carry no attendee list and
are not gaining one, so a join is stated once here instead of by editing twenty event files.

```toml
# A freestanding moment carries its own date and title.
[[moment]]
id = "tweag"
date = "2022-02-21"
title = "Started at Tweag"
people = ["daniel-baker"]
blurb = "..."                                  # optional
photo = "/blog/one-year-snug/..."              # optional
links = [{ title = "...", url = "https://..." }]  # optional; one moment can be two places at once

# A moment anchored to an event resolves date and title from the event page.
[[moment]]
id = "tristan-joins"
event = "2024-01-25"
people = ["tristan-ross"]
```

A moment carries either `date` plus `title`, or `event`. Never both: restating an event's date in
the moments file is exactly the drift this design exists to prevent. `braid-data` rejects a
moment with both, a moment with neither, and an `event` that does not resolve to a file in
`content/events/`.

- `date` accepts `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. Precision is inferred from the format, never
  padded. A moment known only as "some time in April 2023" is written `2023-04` and displayed as
  "April 2023", not as an invented first-of-the-month. Much of the early history is fuzzy, and a
  page about remembering should not state precision it does not have.
- Imprecision shows in the node, not in the axis. Because spacing is rank-based there is no
  proportional axis to stretch a node along, so a fuzzy moment is drawn with a hollow or softened
  node and its label states the precision it actually has ("April 2023", "2021"). `braid-data`
  rejects any other date format.
- `trunk = true` marks a moment as part of the SNUG spine. The earliest trunk moment starts it.
- The spine starts at the founding of the group (`2023-04`, month precision), not at SCaLE 20x.
  SCaLE is where two threads touched; the group did not exist for another month. SCaLE is
  therefore an ordinary shared moment, and the short stretch between the two, where the founders
  travel together but are not yet a group, is deliberate.
- The founding moment's people are the three co-founders: `daniel-baker`, `david-nuon`,
  `rob-hernandez`. All three profiles say "Co-founder", and all three appear in the founder chat
  in the anniversary post.
- The trunk must not start at the earliest moment in the file. If it did, every person would be
  first seen at or after the trunk start, the negative lane side would be empty, and the
  pre-convergence half of the braid would not render at all. The data has to carry personal root
  moments before the first trunk moment. That is the premise of the page, but the engine cannot
  enforce it, so `braid-data` warns when no moment predates the first trunk moment.
- Every meetup is a spine bead automatically, whether or not a moment references it. An anchored
  moment adds people to a bead; it does not create one. The trunk therefore gets roughly twenty
  sample points for its thickness curve without the moments file listing a single meetup.
- A person named only in a `blurb` needs no profile. `braid-data` validates `people` entries, not
  prose. Ben was on the SCaLE 20x booth and gets no thread; he is named in the telling and that
  is all.
- Influence without presence is modelled as a separate moment, not a new field. The worked
  example below has since been removed from the data, but the rule stands for the next time
  somebody causes something they were not at. Ron Efroni
  reserved the Nix booth at SCaLE 20x but was not there. That is a moment on Ron's thread
  (`people = ["ron-efroni"]`) dated shortly before the booth itself. Ron's thread exists, sits
  next to the moment it caused, and the picture never claims he was in the room. A `caused_by`
  link between moments was rejected for the same reason the `met` pair list was: it is a
  hand-maintained edge list wearing a data file as a disguise.
- A moment with one person is a root or a solo beat. A moment with several merges those threads.
- An excursion needs no new syntax. A non-trunk moment dated after the trunk starts, naming
  people already in the trunk, is an excursion by definition. Nix Camp in autumn 2023 is written
  exactly like any other shared moment, and the engine works out that those threads must leave
  the spine and come back.
- Every shared moment is stated exactly once, in one place, chronologically readable.

One file rather than per-person files because `load_data` takes a single literal path and Tera has
no glob, so per-person data would mean one `load_data` call per profile with a constructed path and
a missing-file case to handle. The merge-conflict cost of a single append-only file is small for a
group this size.

`data/` must be added to the `lib.fileset` in `overlays/topLevel/socal-nug-site/package.nix`.

### The layout engine

TypeScript, in `overlays/topLevel/socal-nug-braid-js/src/`. Pure functions, no DOM access, so it
can be unit tested directly.

The pass computes abstract coordinates, not pixels:

1. Sort moments by date, ties broken by `id` so the order is deterministic. `t` is rank-based:
   the nth of m moments sits at `n / (m - 1)`, evenly spaced regardless of the gaps between
   dates. With one moment, `t` is `0.5` rather than a division by zero.
   Proportional time was rejected. Four personal moments span 2021 to 2023 while twenty meetups
   span 2023 to 2026, so a true axis leaves the left half nearly empty and crushes the half with
   the most in it. Every node still carries its real date in its label, so nothing is lost except
   the spacing, and the spacing was costing more than it paid for.

1. `firstSeen[person]` is the date of their earliest moment.

1. Lanes are allocated roughly the way `git log --graph` draws a branch graph, with one
   deliberate exception. A column is taken when a strand first needs one; merge and excursion
   columns are released as soon as they are done with and reused by whoever needs one next.
   Someone whose story starts before the spine goes on one side of it, someone arriving
   afterwards on the other.

   **A person's starting column is theirs for the whole picture and is never reused.** This is
   the exception, and it is not an aesthetic preference. A face is drawn a rank ahead of its
   owner's first moment, in territory the allocation walk never books, so a recycled starting
   column parks the new arrival's face on the previous occupant's line, which reads as a
   connection that is not there. Reserving the column removes that class of overlap at the
   source instead of nudging faces afterwards.

   This replaced a scheme that keyed every lane to arrival order, with the longest history
   furthest out. That scheme had three faults, and they compounded as people were added: columns
   were never reused, so the picture widened with every person; backfilling one early moment
   shifted the whole pre-convergence side; and merging to the mean of two lanes produced
   fractional columns, so no two threads ever shared one and every line was its own diagonal.
   Moving to on-demand allocation removed fractional lanes entirely and halved the width.

   **What reserving starting columns costs.** On the real data it takes the picture from 7
   columns to 12 (span −7..4) and the River lane step from 55.3px to 31.6px, against a 36px
   face, so adjacent columns are narrower than an avatar; the closest two faces end up 36.3px
   apart and only because the renderer slides them. It buys crossings down from 6 to 1. Growth
   is now one column per person, permanently, and backfilling an earlier root re-orders who
   gets which column, pushing the rest out by one. The invariant that survives is that there is
   exactly one starting column per person however much history any of them turns out to have.

   This trade was made by eye, on a side-by-side render of both allocators over the real data,
   not from the numbers. Revisit it if the roster grows much past a dozen: the lane step is the
   thing that will give first.

1. A trunk moment sits at lane 0. Lanes are otherwise a trajectory, not a fixed row:
   when two or more participants of a non-trunk moment carry on past it, that is a merge, and
   they all move to the mean of their current lanes and travel on together from there. When only
   one carries on, the moment sits in that person's lane and the others bend in and stop, which
   is the one-off guest case.

   An earlier version placed every moment in the lane of its most senior participant. That was
   wrong, and visibly so: whoever held the earliest recorded moment was senior at every shared
   moment, so their thread ran dead straight down the page while every other thread bent into
   it. The picture asserted that one person was the axis the group formed around, which is the
   claim the anti-goals forbid. Merging to the mean costs nothing and makes the convergence
   mutual, which is what actually happened.

1. A person's thread begins in their own lane at the time of their first moment and visits each
   of their moments in date order, wherever that moment sits. At their first trunk moment it
   merges into the trunk. It does not end there: the thread stays addressable so it can leave
   again. A person with no trunk moment ends at their last one. Stating this as one polyline,
   rather than an own-lane run plus separate stubs into other lanes, matters: anyone whose
   history includes a moment sitting in someone else's lane would otherwise render as a fork in
   their own thread.

1. An excursion is a non-trunk moment dated at or after the trunk start whose participants are
   already in the trunk. It carries no flag and needs no schema change; the engine infers it from
   those two facts. Its participants' threads leave the trunk before the moment, meet at an
   off-spine node, and rejoin after it. Specifically, they depart at the trunk moment immediately
   before the excursion and rejoin at the trunk moment immediately after it, so the excursion
   spans a real interval of the spine rather than an instant. Nix Camp in autumn 2023 therefore
   runs from NUG #3 to NUG #4. An excursion with no trunk moment after it yet is left open: those
   threads simply end out there, which is honest for something that has just happened. Excursion
   lanes are allocated for that interval and released at the end of it, so simultaneous
   excursions never share a lane and later ones reuse the space.
   An excursion identifies participants who are not yet in the trunk, because the drawing needs
   to know who arrived from outside, but it does not make them members of it. Being at a camp
   alongside members is not evidence of attending a meetup, and an earlier version that inferred
   a join from it stamped two people with dates they had never earned. A join comes from a trunk
   moment naming you, which a join record in `data/moments.toml` produces. Somebody with no such
   record simply never reaches the spine: missing data that is visible rather than wrong data
   that is quiet.

1. Trunk thickness at each trunk moment is a function of the cumulative count of distinct people
   who have joined by then, less anyone away on an excursion at that time. The trunk visibly
   thins while a group is elsewhere, which is both accurate and the reason excursions exist in
   the design: without them the whole post-convergence half of the page is one undifferentiated
   rope.

1. A label pass assigns each label a side, then sweeps for overlap and pushes colliding labels
   along the free axis, with a leader line where a label has moved far from its node.

### Projections

Two, consuming the same positions:

```
river: (t, lane) -> [cx + lane * step, top + t * height]      // time downward, default
map:   (t, lane) -> [left + t * width, cy + lane * step]      // time rightward
```

Each projection also supplies its own label anchor rules, since River has free horizontal space
beside nodes and Map does not. That labelling difference is the real cost of supporting both; the
geometry is shared.

#### Keeping markers apart

Lane allocation decides where things go; it does not decide whether they fit. Two kinds of
overlap are resolved afterwards, and the governing rule for both is that **the cure must not
cost more than the overlap**. A face that leaves its column and a label that walks away from its
dot are each worse to look at than the few pixels of overlap they were avoiding, so neither is
allowed.

1. **A face on somebody else's line.** The git-style allocator frees a column and hands it to the
   next arrival, which can leave a newcomer's face grazing the tail of the previous occupant's
   run, or sitting where another thread crosses. The face slides **along its own column** until
   it is clear: a little towards its first moment (at most 12px, past which it crowds its own
   dot), then backwards away from it (up to 48px, where the lead-in simply gets longer). It never
   moves across lanes. Columns staying aligned is most of what makes the picture legible, and
   trading that away for a 1px clip is a bad deal.

1. **A label on a face or a node.** The label swaps to the **other side of the same node**,
   mirrored about its anchor, so it ends up the same short distance from the dot it names. A flip
   that would run off the canvas, or that lands on something else, is refused and the label keeps
   its natural side. Labels are never translated along the sweep axis to dodge an obstacle: the
   label-vs-label sweep may move them, obstacle avoidance may not.

Subway hangs its labels further above a node than River hangs them beside one, because a root
avatar sits beside its first moment at the node's own height and a label at the usual gap clips
the top of that face.

Both are bounded searches, not solvers. A picture dense enough to defeat them degrades by leaving
one marker slightly overlapped, never by looping, by pushing something off-canvas, or by moving
something far from what it belongs to.

Labels crossing *lines* are not resolved and are not meant to be. With threads holding their
columns, a label beside a node will sometimes cross a line running past it; that reads fine, and
the alternatives (leader lines, or labels pushed far from what they name) read worse.

### Toggle and responsive behaviour

- Buttons in the page, choice persisted in `localStorage`, following the existing theme switcher
  pattern in `partials/base.navigation.html`.
- River is the default, and the default on narrow viewports.
- The toggle stays visible at all widths.
- Map lives in an `overflow-x: auto` container, which gives native momentum panning on touch with
  no JavaScript. On desktop it needs a visible affordance; see "Left to the builder".
- Switching projections animates by interpolating the shared point set between the two
  projections, using the Web Animations API. No animation library.

### Cards and the popup

- Thread roots are the person's avatar, circular, ringed in their thread colour.
- There is no rail beside the map. Clicking a face opens that person's card and clicking a
  moment opens its card, both in one popup that is a child of the scrolling map. It is placed in
  the map's own scroll coordinates beside what was clicked, to the right and flipping left when
  there is no room, clamped to the slice of the map on screen so it never opens somewhere the
  reader has to scroll to find, and it pans with the map once open.
- The popup closes on its X, on Escape, and on any click that is not inside it. A click on
  another face or moment swaps the card rather than closing it first.
- Hovering a face or a moment highlights the threads involved. Cards no longer take part in
  highlighting.
- A person's card carries avatar, name, alias, description, membership badge, profile link and
  where they joined. A moment's card carries title, date, photo, blurb, who was there, and the
  event page or outside link.
- **Why the rail went.** Once the lanes were wide enough to read, River needed every pixel of its
  width, and a 20rem column beside it was the first thing to give.
- **What it cost.** The rail was the keyboard route to a person's card: the SVG is
  `aria-hidden="true"`, so nothing inside it is a tab stop. Removing it makes person cards
  pointer-only, as moment cards already were. The visually hidden fallback list remains the
  accessible version of the page. A keyboard route back into the cards, which means focusable
  faces and moments and an SVG no longer hidden from assistive tech, is an open item.

### Member and guest treatment

Three signals, so it does not depend on colour alone:

|               | Member                         | Guest            |
| ------------- | ------------------------------ | ---------------- |
| Avatar ring   | Thread colour, full saturation | Grey             |
| Card bar      | Solid                          | Dashed           |
| Thread stroke | Solid                          | Dashed           |
| Badge         | Filled, "Member"               | Outline, "Guest" |

Colour identifies individual threads only while there are few enough to tell apart. Past roughly
a dozen people, per-person hues stop being distinguishable and the anti-goal about degrading with
growth bites. Beyond that threshold threads take a single muted colour and identity comes from
the roster rail and from highlight-on-hover instead, with colour reserved for the highlighted
thread. Member and guest remain distinguishable at any size, because that distinction rides on
ring, stroke and badge rather than on hue. This is a call made in the absence of a preference and
is worth revisiting once the real picture is on screen.

The badge carries no meeting number. The card instead shows where someone joined using the title
and date of their first trunk moment, which the engine already computes. Parsing a number out of
event titles was considered and rejected: the titles are not uniform (`NUG #1`,
`NUG #14 @ Ten Mile Brewing`, `Mini NUG @ Legend Chicken Hawaiian Gardens`), two of twenty carry
no number, and a person's first trunk moment need not be a meetup at all.

### Fallback content and accessibility

Tera emits the moments as an ordered list of date, title and participants. This is not a second
layout engine and is not a picture. It exists so that the page source, link previews and scrapers
contain the history rather than an empty element.

The script does not delete it. On boot the list moves into a visually hidden container that stays
in the DOM and in the accessibility tree, and the generated SVG is marked `aria-hidden="true"`.
A screen reader therefore gets the history as a list whether or not the script ran, and the SVG
is never announced as a meaningless pile of shapes. Building this in up front is cheap;
retrofitting it is not.

`test_site.py` asserts the list is present in the built HTML.

### Build and toolchain

- New overlay package `socal-nug-braid-js`: runs esbuild over `src/`, emits a minified ESM bundle.
  Source and `package.nix` live in the package directory, matching how `socal-nug-make-event-ical`
  owns `make_event_ical.py`.
- `socal-nug-site` takes it as an input and copies the bundle to `$out/js/braid.js` in its build
  phase, alongside the existing calendar step.
- The page loads it with `<script type="module" src="/js/braid.js">`.
- Moment and person data reach the script through a `<script type="application/json">` block
  written by Tera with `| json_encode | safe`.

### Checks

Added to `checks/default.nix`:

- `braid-engine`: esbuild-compiles the engine and its tests, runs `node --test`. Covers lane
  assignment, moment lane resolution, junction selection, trunk thickness, and the label collision
  pass.
- `braid-data`: validates `data/moments.toml`. Every `people` entry resolves to a profile slug in
  `content/about/`, every `date` parses, every `id` is unique, and at least one moment has
  `trunk = true`. An unresolved slug is the likely failure when someone adds themselves, so it
  must fail the build with the offending slug in the message.
- `frontmatter` extends to the new required `member` field through `profiles.json`.
- `braid-smoke`: builds the braid from the repository's own `data/moments.toml` and
  `content/events/`, not from fixtures, and asserts invariants: no `NaN` or non-finite
  coordinate, every person with a moment has at least one drawn segment, every `joinsTrunkAt`
  resolves to a real moment, and trunk thickness never decreases except across an excursion.
  Every other engine test runs on fixtures, so without this a plausible typo in the real data
  produces a nonsense picture with the whole suite green.

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

`sass/css/pages/origins.scss` plus whatever components it needs under
`sass/css/components/`, imported from `style.scss` alongside the existing page styles. Colours are
defined so that both themes work, following the dark mode work from #97.

## Left to the builder

- Lane spacing, curve control points, easing, and animation durations.
- The specific label collision algorithm, and the width threshold below which labels drop to
  avatar-only.
- How Map mode signals that it pans on desktop, where there is no touch affordance.
- Popover positioning and dismissal.
- Breakpoint values, and whether the roster rail sits left or right of the braid.
- Whether thread colours are assigned in the data or derived from a palette by lane index.
- Settled: a freestanding moment may carry `links`, a list of `{ title, url }`, because one
  moment can be two places at once (PlanetNix ran alongside SCaLE 22x) and the card names each.
  Event-anchored moments take their permalink from the event and need nothing.
- Exact attribute names within the conventions of the existing overlay.

## Verification

- `nix flake check` passes, including the two new checks.
- Deliberately breaking a `people` slug in `data/moments.toml` fails `braid-data` with that slug
  in the message.
- Deliberately editing `static/js/braid.js` fails the bundle freshness check.
- `nix build .#socal-nug-site` produces `js/braid.js` and an `/origins/` page, and the page
  built this way matches the one from `netlify.toml`'s command on the same source.
- The page renders in light and dark themes, in both projections, at desktop and phone widths.
- With JavaScript disabled the page shows the fallback list and no empty region.
- Adding a new profile with `member = true` and a moment referencing it makes a new thread appear
  with no other edit.
- A non-trunk moment dated after the trunk start renders as an excursion: the named threads leave
  the spine, meet, and rejoin, and the trunk thins for that stretch. A participant with no prior
  trunk moment arrives on their own lane and follows the others in.
