# Origins: the Loom

Status: built. Replaces the drawing and the story model described in
`2026-11-21-origins-design.md`; everything that document says about the page, the people, the
data file, the cards, the roster and the toolchain still stands unless this one says otherwise.

## Intent

The Origins page draws each person as a line until they join the group, and then the line ends:
from that point they are thickness in a shared trunk, and are drawn again only when they leave
it for a conference or a camp. Daniel does not want people to disappear into the trunk. He wants
**everyone to have their own thread, visible all the way through, with no central trunk**.

The picture this describes is a loom. Every person is one thread from their first moment to
today. Every moment is a gathering of some of those threads. The founding is three threads
gathering, a meetup is everyone in the group gathering, Nix Camp is four.

A second view, a spiral called the Orbit, was discussed with it. It is a separate project that
follows this one and is not designed here.

## Goals

- One thread per person, unbroken from their first moment to their last, in both River and
  Subway.
- No trunk. Nothing in the picture stands for "the group" except the threads that are in it.
- Each moment is an oval that is as wide as the number of people through it, with each person's
  thread in its own slot, so threads through a busy moment stay apart and can be told from one
  another.
- The picture says what is known about attendance and no more (see "What a thread through a
  meetup means").
- A gathering that everyone in the group is at sits on the ribbon of threads, meetup or not:
  SCaLE 22x is an oval the whole group passes straight through, where today it is a detour off
  to one side. Only a gathering of part of the group draws threads away from the ribbon.
- The ribbon of threads holds one column (River) or one row (Subway) from the founding to the
  last meetup.
- Everything that is not the drawing keeps working as it does now: cards in the map, the
  roster, hover, the roving tabindex, the mode toggle, the resize handling, the failure message
  when the layout engine does not arrive.

## Non-goals

- The Orbit. Next project.
- The mockup's look: dark canvas, glowing threads, woven over-and-under crossings. The Loom
  follows the site's light and dark themes as the page does today.
- A time scrubber, a detail panel in place of cards, time-proportional spacing. Moments stay
  spaced by rank, one layer each.
- Moving layout out of the visitor's browser. See "What it costs".
- Recording attendance for any meetup. The design makes room for it; filling it in is Daniel's,
  whenever he likes.
- Subway's width. It is about 5,600px wide today and will stay so.
- Card restyle, people's descriptions, the "Joined at SNUG founded" wording, guest handling,
  stale comments. All still open, none in scope.

## Anti-goals

These would make the result a failure even if it worked:

- **A bead the record does not support.** Attendance is never inferred: not from membership,
  not from a photo nobody has read into the data, not from "probably".
- **A thread through a meetup's oval for someone recorded as absent from it.**
- **A ribbon that jogs sideways, shipped without saying so.** If the build cannot hold the
  ribbon to one column, that comes back to Daniel as a decision. It is not quietly dropped.
- **A layout failure that reads as the author's mistake.** When the site's own data lays out
  badly, the check fails: Daniel decided a broken picture should not merge unnoticed, at the cost
  that an event post can be blocked by something only someone who knows the engine can fix. So
  the failure must say plainly that the layout is at fault and not the change, and that it wants
  a maintainer.
- **Two models of the story.** The trunk, approach and detour model is deleted, not kept
  alongside.

## What a thread through a meetup means

Decided by Daniel (option A of three):

```
the record says they were there    ━━━●━━━   through the oval, with a bead
nothing is recorded                ━━━━━━━   through the oval, no bead
the record says they were not      ━━╮ ╭━━   around the oval
                                     ╰─╯
```

- After someone joins, their thread goes through every meetup's oval by default. That says "in
  the group then". It is the same claim the trunk's thickness makes today.
- A **bead** on a thread inside an oval says the record vouches for that person being there.
- A member's thread goes **around** a meetup's oval only where the record says they were absent.
  Someone who has not joined yet is not in the ribbon at all: their thread, if it has started,
  passes the meetups wherever the layout routes it, as it does today. The two need no separate
  mark. The first is a thread leaving the ribbon for one oval and coming straight back; the
  second is a line that has not reached the ribbon yet.
- At a moment that is not a meetup (a conference, a camp, a personal moment), everyone named was
  there by definition, so every thread through it carries a bead.
- At the meetup where someone joined, they were there by definition, so they carry a bead. It is
  drawn differently (gold) because it also marks the join.

The page carries a short legend saying so, because a thread without a bead has to be read as "in
the group then" and not as "attended".

## Constraints

- No npm, no lockfile. esbuild, node and tsc come from nixpkgs; ELK is the vendored elkjs 0.12.1
  at `static/js/vendor/elk.bundled.js`, pinned by the `elk-vendored` check.
- Netlify builds with Zola alone, so `static/js/braid.js` is committed and `braid-bundle-fresh`
  fails when it is stale.
- Tera has no object literals, `concat` or `filter`; the page's JSON block is written out by
  hand in `templates/origins.html`.
- `tsc --strict` over `src/`, `test/`, `smoke/` and `browser/`.
- `zola serve` does not watch `data/`.
- The story half of the engine (`story.ts`) holds nothing positional, and the layout is
  injected into placement so tests can fake it. Both stay true.

## Approaches

Three ways of drawing a loom were sketched on the real data, beside today's views, in a
throwaway preview. Daniel chose from the pictures.

1. **Own lanes, no layout engine.** Each person keeps a fixed lane in the order they joined,
   with their face at the head of it. A thread leans into a knot at each gathering and relaxes
   toward its lane afterwards, opening into a lens between consecutive meetups. Closest to the
   mockup. Half as wide as today in Subway (2,892px against 5,616), needs no ELK, so the 480 KB
   download and the freeze on load would go. Against it: every placement rule is ours to write
   and keep right, which is the position the hand-written lane allocator was in before ELK
   replaced it; faces at the head of a lane scroll out of view in River; threads swing a long
   way when a few people leave for a detour.
1. **ELK, trunk removed, moments as dots.** Today's engine with every person's thread run
   through every gathering. The smallest change. Rejected on sight: between meetups ELK lays the
   threads on top of one another, so the result is a thin striped cable, a trunk by another
   name.
1. **ELK, moments as wide as the people through them (chosen).** Each moment is a node whose
   width is the number of people through it, and each person has a fixed slot on it, so threads
   enter and leave side by side as a ribbon. Faces and labels stay where ELK puts them today.
   Daniel liked the ovals that grow with attendance in the first sketch and asked whether the
   ELK version could have them; this is that. Against it: ELK stays, with its download; layout
   takes about twice as long as today and grows steeply (see "What it costs"); threads run
   parallel between meetups and do not weave.

## Decisions

### Replace, on this branch

Decided by Daniel. River and Subway become the Loom. The trunk views are not kept as a third
mode: he saw the Loom beside them in the preview and chose it, and the old views remain one
revert away in the branch's history, as they did when the engine moved to ELK.

### The story model

`story.ts` (it was `layout.ts`) stops producing trunk segments, excursions and
approach-or-excursion thread segments.
It produces, with nothing positional:

- **Moments** in date order, ties broken by id, as today.
- **Who joined where**, as today: a join comes only from a meetup (a trunk moment) naming you.
  Nothing is inferred.
- For each moment, **who is through it**:
  - not a meetup: the people it names;
  - a meetup: everyone who has joined at or before it, less anyone recorded as away from it.
- For each moment and each person through it, **whether the record vouches for them**: always at
  a moment that is not a meetup; at a meetup, if they joined there or are recorded as there.
- For each person with at least one moment, **their thread**: the moments they are through, in
  date order. A meetup they are recorded away from is simply not in it.
- **Slot order**: one order of people for the whole picture, by the meetup they joined at (people
  who never join go last), then by their first moment, then by slug. Because it is ordered by
  joining, the people in the group at any date are the first so many in it, and two threads keep
  the same side of each other wherever they run together.
- **On the ribbon**: a moment is on the ribbon if it is a meetup, or if everyone in the group at
  its date is through it. My call on the definition. It is what makes SCaLE 22x part of the
  ribbon and Nix Camp a gathering off it.
- **Slots**. My call. At a moment on the ribbon, a member's slot is their place in the slot
  order, so their thread stays in one slot from each such moment to the next. A member recorded
  away from a meetup leaves their slot empty there: a gap in the oval, not a closing of ranks, so
  nobody else's thread steps sideways because of it. Anyone through the moment who has not joined
  yet takes the slots after the members'. At a moment off the ribbon the slots are packed: a
  person's slot is their place among the people through it, in slot order.

Someone named at a conference before they have joined the group is through that moment and
vouched for there, as they are drawn today. Someone who never joins has a thread through the
moments that name them and nothing else.

"Trunk" survives only as the data's word for a meetup (`trunk = true` on the founding, and every
event page). The engine may rename it; the data file and the page's JSON keep the key.

### Attendance data

My call on the shape; Daniel decided only that it is optional.

A record in `data/moments.toml` that is anchored to an event already carries `people`, meaning
who joined at that event. It may now also carry:

```toml
[[moment]]
id = "nug-6-roll"
event = "2024-06-01"
there = ["daniel-baker", "david-nuon"]   # the record vouches for them being at this meetup
away = ["rob-hernandez"]                 # the record says they were not
```

- Any of `people`, `there` and `away` may appear on an event-anchored record, and several
  records may anchor to one event, as join records already do. The template merges them per
  event.
- In the page's JSON a meetup keeps `people` (who joined there) and gains `there` and `away`,
  each an array, empty when nothing is recorded.
- Existing records need no change, and the picture is complete with no `there` or `away`
  anywhere.

The validator (`verify_moments.py`) rejects, naming the record:

- an unknown slug in `there` or `away`;
- `there` or `away` on a record that is not anchored to an event (a dated moment says who was
  there with `people`);
- the same person in `there` and `away` for one event, across all its records;
- a person in `there` or `away` for a meetup earlier than the one they joined at, or with no
  join record at all (before joining they were not in the group, and being there earlier would
  make that the meetup they joined at);
- a person in `away` at the meetup they joined at.

### The graph handed to ELK

- **Nodes.** One per moment, pinned to its own layer by date with ELK's partitioning, as today.
  A moment's size across the time axis is the number of slots it has, which is the people
  through it plus, on the ribbon, a gap for any member recorded away:
  `max(18, (n − 1) × slot + 2 × pad)`, with a slot of 7px and a pad of 8px; along the time axis
  it is 14px. One root node per person, a layer ahead of their first moment,
  where their face goes, as today. Labels are node labels, cut to their room with an ellipsis, as
  today.
- **Ports.** Each moment carries two ports per person through it: one on the side time comes
  from, one on the side it leaves by, at that person's slot, with
  `elk.portConstraints = FIXED_POS`. This is what keeps threads apart: without ports ELK
  attaches every edge at about the same point. Ports have no size: ELK attaches an edge to a
  sized port off its corner, which put every thread a pixel across from its slot.
- **Edges.** For each person, one edge from their root to their first moment, then one from
  each moment's outgoing port to the next moment's incoming port, through their whole thread.
  There are no trunk edges. A meetup someone is away from has no edge of theirs into it, so
  their thread crosses that layer as a long edge and ELK routes it around the oval. The only
  other edges are the hidden spine under "Holding the ribbon to one column".
- **Options.** The existing ones (layered, partitioning, network simplex, polyline routing,
  spacings) are the starting point. The trunk-only ones (edge thickness, the trunk's
  straightness priority, and the 20px edge-to-node spacing that existed to give the trunk snap
  room) are the builder's to keep, change or drop.

In the sketch this graph had 237 edges for today's data against roughly 150 now.

### Holding the ribbon to one column

A goal, set by Daniel, with a measurable form: **every moment on the ribbon has its first slot
at the same position across the time axis, to within a pixel**, from the founding to the last
meetup, in both modes. The first slot and not the centre, because an oval grows on one side as
people join; and the slot's position whether or not anyone is in it, because the first person
may be recorded away. Whole-group gatherings are bound by this as meetups are: holding the
meetups alone would let every thread swing out to SCaLE and back while passing the measure.

What the sketch found, with no snap and a straightness priority on every hop a member makes
(the exact graph is under "What the sketch did"):

|          | meetups off one column by up to |
| -------- | ------------------------------- |
| today    | 21px                            |
| +1 year  | 25px                            |
| +2 years | about 170px                     |
| +4 years | about 210px                     |

The ribbon is dead straight in long runs and jogs at one or two points. The jogs appeared where
every member left one meetup for the same gathering, so that no thread ran meetup to meetup;
giving priority to every hop a member makes fixed the one-year cases and not the later ones.

How to hold it is left to the builder. Two routes are known: ELK's own options, and a snap after
layout in the manner of the old `snapTrunk`, made aware of ports. The second must not reintroduce
what the trunk snap did: moving things after ELK has routed is what put the trunk under labels,
and the smoke check exists to see it.

**If neither holds the ribbon on today's data and on the growth fixtures without overlaps, stop
and bring it to Daniel.** Do not ship a jog, and do not drop the goal.

What held it, as built. ELK's own options alone did not: with the graph as first built, the
ribbon was off its column by up to 21px on the real data in both modes, by 76 to 441px in River
and 45 to 186px in Subway on the made-up histories, and by 441px at worst (seed 2, two years on,
River). A hidden spine does. Each on-ribbon moment has one more pair of ports, half a slot before
its first slot, and an edge runs from each on-ribbon moment to the next between them with
`elk.layered.priority.straightness = 1000`. The spine has no thread behind it and is not placed
or drawn. With it the ribbon is 0.0px off its column on all twenty layouts the smoke check runs
(the real data and nine histories: seeds 1 to 3, at today's size and one and two years on, each
in River and Subway), and it also held on 108 further layouts out to four years on.

Two things do not stand in for it. Giving the threads a straightness priority as well as the
spine takes the spine's away and the ribbon jogs again, and with the spine's priority at 10
instead of 1000 the ribbon was up to 150px off. `snapRibbon`, which runs after ELK and moves
every on-ribbon moment to the median column with its ports, its label and its share of each
edge, has moved nothing on any real layout once the spine is there, and only unit tests on a fake
layout exercise it. Without the spine its moves ran to hundreds of pixels and put threads
through ovals that were not theirs (131 findings over the twenty layouts), so it cannot be what
holds the ribbon. The edge-to-node spacing is 20 and the edge-to-edge spacing 7.

### Placement

`loom-place.ts` keeps the seam: ELK's output becomes centres, label anchors and a polyline per
edge, and the layout is injected. It additionally carries, for each moment, its box (so the oval
can be drawn to size) and, for each person through it, where their slot is (so a bead can be
drawn on it). Each polyline is carried on from the port on the oval's edge to the person's slot
inside the oval, at both ends, so one person's edges meet inside the oval and the thread is
unbroken. `centreLoomIn` and the per-mode cache in `main.ts` that makes a resize cheap work as
`centreIn` and its cache did.

### Drawing

- **Threads.** One path per edge, solid, in the person's palette slot, eased with `flow()` as
  today. No dashed detour style: there are no detours.
- **Moments.** An ellipse sized to the moment's box in place of the dot, styled as a meetup or as
  another moment where the dot was styled trunk or side. It is the click, hover and focus target
  and keeps `data-moment`, `role="button"`, its `aria-label` and its place in the roving
  tabindex. Drawn over the threads with a partly opaque fill of the page's colour, so the
  threads show through it.
- **Beads.** A small filled circle at a person's slot inside the oval where the record vouches
  for them; larger and gold where they joined there. Decoration for pointer and keyboard
  purposes: no role, no tab stop.
- **No trunk path and no halo rings.** Both go.
- **Faces, labels, year markers.** As today.
- **The switch between modes** no longer slides anything. An oval that is wide in one mode and
  tall in the other has nowhere sensible to slide from, and today's slide moves dots across
  lines that have already jumped. My call. The reduced-motion branch goes with it.

### The legend

One line near the mode toggle, with the three marks drawn small: a thread with a bead ("the
record says they were there"), a thread with a gold bead ("joined here"), a bare thread ("in the
group then"). A fourth, a thread stepping around an oval ("the record says they were not
there"), appears only when the data records at least one absence. Hidden until the script runs,
like the toggle. Wording and styling are the builder's.

### Cards, labels for screen readers, hover

- **A meetup's card** stops listing who joined as if they were who attended. It says
  "Joined here:" with names when anyone did, and "Confirmed there:" with names when the record
  vouches for anyone beyond the joiners. It does not list who was away; the thread going around
  the oval says that.
- **Any other moment's card** lists the people it names, as today.
- **A meetup's `aria-label`** gives its title, its date and how many are in the group by then,
  for example "NUG #6, 1 June 2024, 9 in the group". Another moment's says how many people, as
  today.
- **Hovering a moment** lights the thread of everyone through it.
- A person's card is unchanged.

### Checks

- **Unit tests** are rewritten around the new story model, the graph (nodes sized by people,
  ports at slots, edges port to port, no edge into a meetup someone is away from), placement and
  drawing. The tests for trunk segments, excursions, trips, trunk width and the trunk snap are
  deleted with the code they cover.

- **The smoke check** keeps running the real data through the real ELK in both modes and
  measuring the drawn picture. Its assertions become:

  - everything is on the canvas, every person with a moment has a face and a thread;
  - no thread runs through an oval or a face that is not its own, measured along the drawn
    curve;
  - no label sits on a face or an oval, runs off the canvas or is wider than its room, and no
    thread runs under a label;
  - every bead is inside its oval, and a person has a bead exactly where the record vouches for
    them;
  - nobody recorded as away from a meetup has a thread through its oval;
  - the ribbon holds its column, in the form given above.

  Every one of these is fatal on the real data. Decided by Daniel. The ones about layout
  (overlaps, labels, the ribbon) fail with a message that says so in words an author can act on:
  that the picture came out wrong for the data as it now stands, that nothing in their change is
  mistaken, and that a maintainer needs to look at the layout. The rest (a bead with no record
  behind it, a thread through an oval its person is recorded away from) cannot be caused by data
  at all; they are faults in the engine and say that instead. Mistakes an author can make and
  fix are the validator's to catch, before any of this runs.

- **Growth, in the smoke check.** Decided by Daniel. The check also lays out a small number of
  **synthetic histories generated in code from fixed seeds**, at about today's size, one year on
  and two years on, and applies the same assertions, all fatal. They are generated from nothing
  but the seed, not grown from the site's data, so a content change can never alter them or turn
  them red: when one of these fails, it is a change to the engine that did it. Without this, "the
  ribbon holds its column" is checked only on today's data, which is where the trunk went wrong.
  This is the bar the stop rule under "Holding the ribbon to one column" is measured against, and
  the sketch says ELK's options alone do not clear it at two years, so the plan should try the
  hold early.

- **`test_site.py`** gains what the template now emits (`there` and `away` on a meetup) and
  loses nothing.

- **The on-demand browser check** (`nix run .#socal-nug-braid-browser`) is updated where it
  names a dot by its class, loses its two reduced-motion assertions along with the slide, and
  must otherwise pass unchanged.

## What it costs

Measured in the sketch, in node on a desktop, per layout:

|                              | today's views | the Loom     |
| ---------------------------- | ------------- | ------------ |
| today (40 moments, 9 people) | 0.1 to 0.2s   | 0.3 to 0.45s |
| +1 year                      | 0.3s          | 0.5 to 0.6s  |
| +2 years                     | 0.7s          | 1.0 to 1.3s  |
| +4 years                     | 2.1 to 2.5s   | 4.2 to 5.6s  |

A phone is four to six times slower, and the page is frozen while it runs. Daniel has accepted
this for now: layout stays in the browser, and moving it to build time is the next
infrastructure decision, not part of this project. Nothing in this design should make that move
harder: placement stays a pure function of the data and an injected layout, and what it returns
stays plain data.

In no simulated future, out to four years, did a thread run through a moment or a face that was
not its own, with no step after ELK. That is better than the trunk engine managed.

## Known and not fixed

Between two ribbon meetups, when a side moment (a camp, a conference, two people meeting) falls
between them, the ribbon's threads step out around its oval and come back. On today's data 19 of
162 hops between ribbon moments stray more than a slot, by up to about 143px in River and 90px in
Subway. Nothing overlaps, and the ribbon measure above does not see it.

The cause, tested: ELK orders the side moment next to its attendees' threads, inside the ribbon,
to avoid crossings, and everything on the far side has to go around the oval and the room around
it. The label is not the cause. Dropping the side moments' labels leaves the same 19 hops
straying (worst 84px), and moving the labels to the far side changes nothing.

A fix was prototyped outside the repository and is not built: an unseen pass-through node on the
ribbon in each side moment's layer, which the people in the group who are not at the side moment
run straight through. With it 1 of 162 hops strays today (a person not yet in the group going
around a meetup, which is right) and 0 on six histories, the ribbon stays 0.0px off its column,
there are no findings, and layout is no slower. It changes the look, because the attendees'
threads cross the others on their way out and back, so it waits on Daniel's decision.

## What is deleted

Trunk segments and trunk width; excursions and the trips that chain them; approach and excursion
thread segments; `snapTrunk` as it stands; the trunk path, the halo rings and the dashed detour
style; the slide between modes; the tests and stylesheet rules for all of these.

## What the sketch did

Every number in this document comes from a throwaway sketch that was never in the repository and
no longer exists. This is what it did, so that a builder who gets different numbers can tell a
mistake in their graph from a limit of ELK.

**The graph.** It started from `graphFor()` as it stood at commit `5d09d3c` and kept its nodes:
moments with their partition and their node label, and one root per person. It then:

- resized each moment to `across = max(18, (n − 1) × 7 + 16)` by `14` along the time axis, with
  `n` the people through it, slots packed everywhere (the sketch had no fixed slots and no gaps,
  which are new in this design);

- gave each moment two ports per person, with `elk.portConstraints = FIXED_POS` on the node:

  ```json
  {
    "id": "2024-06-01|in|daniel-baker",
    "width": 1,
    "height": 1,
    "x": 8,
    "y": 0,
    "layoutOptions": { "elk.port.side": "NORTH" }
  }
  ```

  In River the incoming port is on `NORTH` at `y = 0` and the outgoing on `SOUTH` at `y = 14`,
  both at `x = 8 + 7k` for the person in slot `k`. In Subway they are on `WEST` and `EAST`, with
  `x` and `y` exchanged;

- replaced every edge: for each person, root to the incoming port of their first moment, then
  each moment's outgoing port to the next moment's incoming port. No trunk edges;

- kept the root options of `graphFor()` (layered, partitioning on, `NETWORK_SIMPLEX` node
  placement, `POLYLINE` routing, 30px between layers in River and 60px in Subway, node spacing
  28, edge-to-node spacing 20, label spacing 12, padding 40, thoroughness 20) and set
  `elk.spacing.edgeEdge` to 7.

The result went through `placedFrom()` with **no snap** and was drawn with `drawPlaced()`, with
ellipses and beads added on top. The sketch drew faces and labels exactly as today.

**Straightness.** Three runs, all with no snap:

| `elk.layered.priority.straightness` | on which edges                                                 | today | +1 year | +2 years | +4 years |
| ----------------------------------- | -------------------------------------------------------------- | ----- | ------- | -------- | -------- |
| 10                                  | hops from one meetup directly to the next                      | 21px  | 127px   | 167px    | 213px    |
| 1000                                | the same                                                       | 21px  | 127px   | 167px    | 215px    |
| 1000                                | every hop a person makes at or after the meetup they joined at | 21px  | 25px    | 172px    | 208px    |

The first two rows measure the meetups' centres, which move by 3.5px for each person who joins
because an oval grows on one side; the third measures their leading edge. In the first two the
meetups' leading edges were exactly aligned in long runs and jogged at one or two places, for
example by 106px between NUG #4 and NUG #5, which is where every member is at SCaLE 21x and no
thread runs from one meetup to the next.

**Overlaps.** Each edge's polyline from ELK, sampled every twentieth of a segment, against the
box of every node that was not its own person's root or one of their moments. Zero hits in every
run. The eased curve the page actually draws was not sampled.

**Timing.** `elk.layout()` alone, in node 24 on a desktop, both modes.

**The simulated futures** were grown from the site's real data: six meetups two months apart, two
new people and three detours per year added, each new person with a "First contact" some years
before they join and half of them with a "Paths cross" the year before, each detour naming two
to six people, every fourth one up to the whole group. Six seeds at one and two years, four at
four years. The synthetic histories this design asks the smoke check to carry are different in
kind: generated from a seed alone.

## Left to the builder

- The exact slot, pad and oval sizes, and bead sizes.
- How the ribbon is held to its column, within the rule above.
- Which of the trunk-era ELK options survive.
- Field and type names inside the engine.
- The legend's wording and styling.
- How many synthetic histories the smoke check runs and how they are generated, provided they
  depend on nothing but their seeds and include detours that the whole group attends, which is
  what made the ribbon jog.
- Bringing `2026-11-21-origins-design.md` and the README up to date with what is built.

## Verification

- `nix flake check` passes.
- `nix run .#socal-nug-braid-browser` passes.
- In River and in Subway, in light and dark themes, at desktop and phone widths: every person
  has one unbroken thread; no trunk is drawn; each moment is an oval as wide as the people
  through it; a meetup everyone attended sits on the ribbon.
- With no `there` or `away` in the data, every meetup's oval has a gold bead for whoever joined
  there and no other bead.
- Adding `there` for someone at a meetup puts a bead on their thread there and their name under
  "Confirmed there:" on its card. Adding `away` takes their thread around that oval.
- Each rejection listed under "Attendance data" is shown to fail the validator with the record
  named.
- The ribbon holds its column on today's data and on every synthetic history, or Daniel has been
  asked.
