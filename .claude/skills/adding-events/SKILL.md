---
name: adding-events
description: Use when asked to add, schedule, post, or announce a SoCal NUG meetup or Mini NUG on this site, such as a request giving a date, time, and venue for the next event.
---

# Adding Events

An event is one file, `content/events/YYYY-MM-DD.md`: TOML frontmatter plus a markdown body. Nothing else needs editing. The events page and the calendar feed are generated from it. The home page card shows only the soonest upcoming event, so a new event appears there once earlier ones have passed. The templates and scripts do not need to be read for this.

## Gather

Required from the user: date, start time, stop time, venue. Ask for whatever is missing. If they named a weekday, confirm it with `date -d <date> +%A` and ask if it does not match.

## Number

Full meetups (a "SNUG") are numbered. "Mini NUG" events are not.

The next number is one above the highest `NUG #N` on main **and in open PRs**. An event in an open PR may already hold the next number.

```bash
git fetch origin
git grep -h -o 'title = "NUG #[0-9]*' origin/main -- 'content/events/*.md' | grep -o '[0-9]*$' | sort -n | tail -1
gh pr list --state open --json number --jq '.[].number' | while read n; do gh pr diff "$n" | grep -o '^+title = "NUG #[0-9]*' | sed "s/^/PR $n: /"; done
```

If the loop is refused, run `gh pr diff <number>` per PR. Tell the user the number and whether the previous one is on main or in an open PR.

## Venue check, every event, known venues included

Before drafting, remind the user to confirm that the venue is still open and that its posted hours on the event's weekday cover the start to stop time. Venues have closed between visits without anyone noticing, which is why this step exists. Offer to search for them, with the notice that the web lookups can use many tokens. Wait for their answer.

If they check it themselves, proceed on their word and note that in the PR body.

If they ask you to search, look the venue up and report with sources:

- open, or marked permanently or temporarily closed. Closed overrides any posted hours. If another business now operates at the address, name it.
- posted hours on the event's weekday cover the start to stop time. Pass only if every source that posts hours covers it.

Google Maps and Yelp pages block non-browser fetches. Use sources you can read: the venue's own site, Apple Maps, Untappd, MapQuest, and the search-result listing of the Yelp or Google Maps page (Yelp puts CLOSED in the title). Find pages through search rather than guessing URLs. Two sources that agree are enough. Say which sources you could not reach.

Closed, or hours that do not cover the window: stop and tell the user. Do not create the file.

## Known venue or new venue

Known venue: the `[extra.venue] name` of an existing event matches, allowing loose wording ("LBCC" is "Long Beach City College, Liberal Arts Campus"). Copy the `[extra.venue]` block verbatim from the event with the latest date at that venue, and take that event's title pattern, description, and body as the draft. Update every number: `#42` in the title, `42nd` in the description, `forty-second` in the body. Drop paragraphs that were specific to that earlier event, such as a conference recap.

New venue: from the lookup, show the user the street address, unit, city, zip, and website, and ask them for the Google Maps share link (the `maps.app.goo.gl` kind). Never invent a maps URL. A new venue always needs the user; do not write the file until they confirm the venue block. The title is `NUG #N @ Venue`. Draft the body from the latest event at a brewery or restaurant and say it is a suggestion.

## Draft and confirm

Create the branch first so the file lands on it:

```bash
git switch -c event/snug-<N> origin/main     # Mini NUG: event/mini-<date>
```

Every slot below is required. `description` is not in the schema, but the calendar feed script reads it and the Netlify build fails without it. Optional: `address_unit` for a suite or unit number, and `website`. The values here are made up.

```toml
+++
template = "event.html"
title = "NUG #42 @ Ten Mile Brewing"
description = "Come join us for the 42nd SoCal NUG meetup!"
[extra]
organizer = "SoCal NUG Organizers"
[extra.event]
date = "2030-01-19"
start_time = "17:00"
stop_time = "20:00"
[extra.venue]
name = "Ten Mile Brewing"
address_street="1136 E Willow St"
address_city="Signal Hill"
address_zip="90755"
google_maps="https://maps.app.goo.gl/v9jub2NsZbroW8xR8"
+++

Come join us for the forty-second NUG meetup!

Bring your laptop, show off your Nix configs, and ask questions.
No prior experience with Nix is required, and all are welcome.
```

A Mini NUG title reads `Mini NUG @ Ten Mile Brewing`, with no number anywhere.

Write the file (for a new venue, only after the venue block is confirmed). Show the user the complete file and how the venue was confirmed open. Ask once whether it is good to go. Apply their edits. After that, continue without further questions.

## Verify

```bash
nix develop -c python scripts/verify_post.py --schema scripts/schemas/event.json content/events/20*.md
nix develop -c zola build
nix develop -c python scripts/make_event_ical.py --output public/events/ content/events/20*.md
grep -c 'data-event-date="YYYY-MM-DD"' public/events/index.html
```

The first three must exit 0: the CI check, then the two Netlify build steps. The grep must print 1. `public/` is gitignored.

## Ship

Commit title and PR title: `events: add snug <N>`. Commit body and PR body: one line with date, venue, and time, then how the venue was confirmed open, then the single line `Assisted-by: Claude Code (<model id>)`, for example `claude-fable-5-1`. No co-author trailer. Then:

```bash
git push -u origin event/snug-<N>
gh pr create --base main --title "events: add snug <N>" --body-file <file>
```

Report the PR link. Netlify builds with an older Zola than the dev shell, so the deploy preview is the final check.

## Common mistakes

- Numbering from main alone when an open PR already holds the next number.
- Skipping the venue reminder because the venue is familiar.
- Searching for the venue without being asked to.
- Asking the user for a maps link before the venue is confirmed open.
- Minting a Google Maps URL for a new venue instead of asking for the share link.
- Writing the file before the user has confirmed a new venue or a new body.
- Dropping `description`, which breaks the calendar feed build on Netlify.
