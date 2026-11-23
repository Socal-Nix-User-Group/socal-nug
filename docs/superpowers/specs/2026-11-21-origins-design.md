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

How the picture is laid out went through two engines: a hand-written lane allocator in the style
of `git log --graph`, and then the Eclipse Layout Kernel. Why, and what each cost, is under "The
layout engine" below.

### Rendering

1. Build-time generation by a Python tool, in the manner of `socal-nug-make-event-ical`. Works
   without JavaScript, testable, zero new dependencies, but fixed geometry and no animation.
1. **Client-side TypeScript.** Chosen, with the no-JavaScript cost accepted explicitly: without
   JavaScript there is no picture. A rendered fallback list stood in for one at first and was
   later removed; see Accessibility. Chosen for the interaction headroom, since a morph between
   projections, hover highlighting and popovers are the point of the page feeling good.
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

The engine is in two halves, and the seam between them is the most important line in it.

**The story** (`layout.ts`) reads the moments and decides what the picture is made of, with nothing
positional in it:

1. Moments are ordered by date, ties broken by id, so the same data always draws the same.
1. A join comes only from a trunk moment naming you. Nothing is inferred from company kept.
1. A non-trunk moment after the spine starts that names somebody already on it is a detour. Those
   people leave the trunk at the meetup before it and rejoin at the one after. Anyone else named
   there was there without being in the group yet: recorded, drawn, grants nothing.
1. A person's thread is an approach (everything up to and including their join) plus one segment
   per detour they left for. After joining they ride the trunk and are not drawn separately.
1. The trunk thickens by distinct people joined so far and thins by how many are away.

**The placement** (`graph.ts`, `place.ts`) hands that to the Eclipse Layout Kernel's layered
algorithm and takes back coordinates:

- Every moment is a node pinned to its own layer by date through ELK's partitioning, so the time
  axis is ours and not the layering's. ELK decides order within a layer and where lines go.
- The trunk is a chain of edges with a straightness priority, which holds it to within a few
  pixels of a column rather than dead straight.
- Each thread is one edge per hop, from a root node a layer ahead of the person's first moment,
  where their face goes. A detour is two hops through its moment from the spine and back.
- Labels are handed to ELK as node labels, sized by their text. That is what makes it leave room
  for them: they become part of the node's margin, nothing else is placed there, and edges route
  around them.
- River is direction DOWN with labels beside nodes; Subway is direction RIGHT with labels above.
  The same graph, laid out twice. A switch slides each dot from where it was to where it is.
- The layout is injected into `place.ts`: the page gives the real ELK, the smoke check gives the
  same vendored copy, and the unit tests give a fake shaped like a layout. None of them runs ELK
  to test the engine around it.

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
heading for self-hosting. Layout is asynchronous, so the picture appears a beat after the page.
And the columns mean nothing any more: there is no one column per person, no before-and-after
side of the spine. ELK puts things where crossings are fewest, and that was the trade.

**What stayed.** Everything either side of the seam: the data model and its validator, the story
half of the engine, faces, the card and popup, the toggle, the checks. The old allocator, its
projections and its label sweep were deleted, not kept behind a flag.

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
- **What it cost.** The rail was the keyboard route to a person's card, and removing it made
  person cards pointer-only for a while, as moment cards already were. The roving tabindex under
  Accessibility is what put a keyboard route back.

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

### Accessibility

The picture is the accessible version of itself. Its SVG is a named group, every dot and face is
a `role="button"` with a label, and the braid is one tab stop with a roving tabindex: the arrow
keys move a cursor through the story, Enter or Space opens that card, Escape closes it. Forward
is Down or Right in both modes. Forty-six separate tab stops in the middle of a page is a wall to
anyone tabbing past, which is the reason for the roving pattern rather than plain focusable dots.

Labels say how many people were at a moment, not who. Eight names read out on every arrow press
is a wall of its own, and the card names them for anyone who opens it.

**There was a rendered fallback list**, emitted by Tera beside the picture: the page without
JavaScript, and the accessible version while the SVG was `aria-hidden` decoration. It is gone.
Once the picture named its own dots and faces and its cards carried the blurbs and links, the
list was a second copy of the same history to keep correct, and a second thing for a screen
reader to read. What goes with it: a reader with JavaScript off, or one whose browser fails to
fetch the 1.6 MB layout engine, gets an empty element instead of a list of moments, and the page
source carries the history only as the JSON data block. That was an accepted trade, not an
oversight.

`test_site.py` asserts the list is absent and that the data block carries the history instead.

### Build and toolchain

- New overlay package `socal-nug-braid-js`: runs esbuild over `src/`, emits a minified ESM bundle.
  Source and `package.nix` live in the package directory, matching how `socal-nug-make-event-ical`
  owns `make_event_ical.py`.
- `socal-nug-site` takes it as an input and copies the bundle to `$out/js/braid.js` in its build
  phase, alongside the existing calendar step.
- The page loads it with `<script type="module" src="/js/braid.js">`, after a classic
  `<script src="/js/vendor/elk.bundled.js">` for the layout engine, so ELK's global is there before
  the module runs. The vendored file is elkjs 0.12.1's `lib/elk.bundled.js`, with its EPL-2.0
  licence beside it; it is not fetched from a CDN because the site is heading for self-hosting.
- Moment and person data reach the script through a `<script type="application/json">` block
  written by Tera with `| json_encode | safe`.

### Checks

Added to `checks/default.nix`:

- `braid-engine`: esbuild-compiles the engine and its tests, runs `node --test`. Covers the story
  half (order, joins, detours, trunk thickness), the graph handed to ELK, the mapping of its
  output into positions, the drawing from those, cards, and popup placement. None of it runs ELK;
  the placement tests use a fake shaped like a layout.
- `elk-vendored`: the committed `static/js/vendor/elk.bundled.js` is byte for byte the pinned
  upstream release, fetched by hash. The only way a vendored file stays honest about where it
  came from.
- `braid-data`: validates `data/moments.toml`. Every `people` entry resolves to a profile slug in
  `content/about/`, every `date` parses, every `id` is unique, and at least one moment has
  `trunk = true`. An unresolved slug is the likely failure when someone adds themselves, so it
  must fail the build with the offending slug in the message.
- `frontmatter` extends to the new required `member` field through `profiles.json`.
- `braid-smoke`: builds the braid from the repository's own `data/moments.toml` and
  `content/events/`, not from fixtures, lays it out through the vendored ELK in both modes, draws
  it, and measures the SVG: everything on the canvas, every person with a moment has a drawn
  segment and a placed face, every `joinsTrunkAt` resolves to a real moment, trunk thickness
  never decreases except across an excursion, no line through a face, no line through a dot its
  person was not at, no label on either. Every other engine test runs on fixtures and fakes the
  layout, so without this a plausible typo in the real data, or a layout ELK is happy with that
  the renderer is not, ships with the whole suite green.

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
- With JavaScript disabled the page shows no picture, by the trade recorded under Accessibility.
- The braid is reachable and operable by keyboard alone: one Tab into it, arrows through the
  story, Enter to open a card, Escape to close, focus back where it started.
- Adding a new profile with `member = true` and a moment referencing it makes a new thread appear
  with no other edit.
- A non-trunk moment dated after the trunk start renders as an excursion: the named threads leave
  the spine, meet, and rejoin, and the trunk thins for that stretch. A participant with no prior
  trunk moment arrives on their own lane and follows the others in.
