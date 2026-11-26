"""Validate data/moments.toml against the site's people and events.

Checks run in classes. The first class with any problem prints every
instance of that class and exits 1, so one run does not bury a slug typo
under a date typo.
"""
import datetime
import re
import sys
import tomllib
from pathlib import Path

import click

DATE_RE = re.compile(r'^\d{4}(-\d{2}(-\d{2})?)?$')


def slugify(stem):
    """Match Zola's slug for a content filename."""
    return stem.replace('.', '-').replace('_', '-').lower()


def person_slugs(about_dir):
    return {
        slugify(p.stem)
        for p in Path(about_dir).glob('*.md')
        if p.name != '_index.md'
    }


def event_slugs(events_dir):
    return {p.stem for p in Path(events_dir).glob('20*.md')}


def date_is_real(raw):
    parts = [int(p) for p in raw.split('-')]
    if len(parts) >= 2 and not 1 <= parts[1] <= 12:
        return False
    if len(parts) == 3:
        try:
            datetime.date(parts[0], parts[1], parts[2])
        except ValueError:
            return False
    return True


def when(moment):
    """Sortable key. An event slug is itself the event's date."""
    raw = moment.get('date') or moment['event']
    parts = raw.split('-')
    while len(parts) < 3:
        parts.append('0')
    return tuple(int(p) for p in parts)


def fail(problems):
    for line in problems:
        print(f'error: {line}', file=sys.stderr)
    sys.exit(1)


def check_shape(entries):
    problems = []
    for m in entries:
        mid = m.get('id', '<no id>')
        has_date = 'date' in m
        has_event = 'event' in m
        if has_date and has_event:
            problems.append(
                f'{mid}: carries both a date and an event; pick one')
        elif not has_date and not has_event:
            problems.append(f'{mid}: carries neither a date nor an event')
        elif has_date and 'title' not in m:
            problems.append(f'{mid}: a dated moment needs a title')
    return problems


def check_dates(entries):
    problems = []
    for m in entries:
        raw = m.get('date')
        if raw is None:
            continue
        if not DATE_RE.match(raw) or not date_is_real(raw):
            problems.append(
                f'{m.get("id", "<no id>")}: bad date {raw}; '
                'use YYYY, YYYY-MM or YYYY-MM-DD')
    return problems


def check_ids(entries):
    problems = []
    seen = set()
    for m in entries:
        mid = m.get('id')
        if mid is None:
            problems.append('a moment has no id')
        elif mid in seen:
            problems.append(f'duplicate id {mid}')
        else:
            seen.add(mid)
    return problems


def check_people(entries, known):
    problems = []
    for m in entries:
        for field in ('people', 'there', 'away'):
            for slug in m.get(field, []):
                if slug not in known:
                    problems.append(
                        f'{m["id"]}: unknown person {slug} in {field}; '
                        'no matching file in the about directory')
    return problems


def check_events(entries, known):
    problems = []
    for m in entries:
        ev = m.get('event')
        if ev is not None and ev not in known:
            problems.append(
                f'{m["id"]}: unknown event {ev}; '
                'no matching file in the events directory')
    return problems


def check_links(entries):
    problems = []
    for m in entries:
        links = m.get('links', [])
        if not isinstance(links, list):
            problems.append(f'{m["id"]}: links must be a list')
            continue
        for i, link in enumerate(links):
            ok = (isinstance(link, dict)
                  and isinstance(link.get('title'), str)
                  and isinstance(link.get('url'), str))
            if not ok:
                problems.append(
                    f'{m["id"]}: links[{i}] needs a title and a url')
    return problems


def check_attendance(entries):
    problems = []
    joins = {}
    for m in entries:
        if 'event' in m or m.get('trunk'):
            for slug in m.get('people', []):
                if slug not in joins or when(m) < joins[slug]:
                    joins[slug] = when(m)

    recorded = {}
    for m in entries:
        there = m.get('there', [])
        away = m.get('away', [])
        if not (there or away):
            continue
        if 'event' not in m:
            # The founding is a meetup, so its attendance is on an
            # anchored record like any other meetup's.
            if there or m.get('trunk'):
                problems.append(
                    f'{m["id"]}: there and away belong on a record '
                    'anchored to an event; a dated moment says who was '
                    'there with people')
                continue
            # A moment that is not a meetup has no record to anchor to, so
            # it carries away itself. Someone is away only from a moment
            # after one they are at, in the order the picture draws them:
            # by the first day of the date, a missing month or day counting
            # as 1, then by id, a record anchored to an event going by the
            # event's slug as the page's data names it.

            def drawn(o):
                raw = o.get('date') or o['event']
                parts = [int(p) for p in raw.split('-')]
                return (tuple(parts + [1] * (3 - len(parts))),
                        o.get('event', o['id']))

            for slug in away:
                if slug in m.get('people', []):
                    problems.append(
                        f'{m["id"]}: {slug} is both there and away at '
                        f'{m["id"]}')
                if not any(slug in o.get('people', []) and drawn(o) < drawn(m)
                           for o in entries):
                    problems.append(
                        f'{m["id"]}: {slug} is away from {m["id"]}, before '
                        'any moment they are at')
            continue
        for kind, slugs in (('there', there), ('away', away)):
            for slug in slugs:
                recorded.setdefault((m['event'], slug), {})[kind] = m['id']
                if slug not in joins:
                    problems.append(
                        f'{m["id"]}: {slug} is {kind} but has no join '
                        'record')
                elif when(m) < joins[slug]:
                    problems.append(
                        f'{m["id"]}: {slug} is {kind} at {m["event"]}, '
                        'before the meetup they joined at')
                elif kind == 'away' and when(m) == joins[slug]:
                    problems.append(
                        f'{m["id"]}: {slug} is recorded away from the '
                        'meetup they joined at')

    for (event, slug), kinds in recorded.items():
        if len(kinds) == 2:
            problems.append(
                f'{kinds["away"]}: {slug} is both there and away at '
                f'{event}')
    return problems


@click.command()
@click.argument('moments')
@click.option('--about', required=True,
              help='Directory of member and guest profiles')
@click.option('--events', required=True,
              help='Directory of event posts')
def verify_moments(moments, about, events):
    with open(moments, 'rb') as f:
        entries = tomllib.load(f).get('moment', [])

    for problems in (
        check_shape(entries),
        check_dates(entries),
        check_ids(entries),
        check_people(entries, person_slugs(about)),
        check_events(entries, event_slugs(events)),
        check_links(entries),
    ):
        if problems:
            fail(problems)

    # Last, and on its own: it orders records by date, which the classes
    # above have by now shown every record to have.
    problems = check_attendance(entries)
    if problems:
        fail(problems)

    trunk = [m for m in entries if m.get('trunk')]
    if not trunk:
        fail(['no moment is marked trunk, so the spine would not exist'])

    first_trunk = min(when(m) for m in trunk)
    if not any(when(m) < first_trunk for m in entries):
        print(
            'warning: nothing predates the first trunk moment, so the '
            'pre-convergence half of the braid will not render',
            file=sys.stderr)

    print(f'[OK] {moments}: {len(entries)} moments')


if __name__ == '__main__':
    verify_moments()
