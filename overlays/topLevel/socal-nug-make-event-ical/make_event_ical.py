import tomllib
from datetime import datetime
from pathlib import Path

import click
import icalendar
import pytz


@click.command()
@click.argument('posts', nargs=-1)
@click.option('--output', help='Output for iCal files')
def validate_data(posts, output):
    all_events = icalendar.Calendar()

    for post in posts:
        if '_index.md' in post:
            continue

        with open(post, 'r') as f:
            data_content = f.read().strip()

        separator = '+++'
        front_matter = data_content.split(separator)[1].strip()
        data = tomllib.loads(front_matter)

        # Parse the date and times
        event_date = data["extra"]["event"]["date"]
        start_time_str = data["extra"]["event"]["start_time"]
        stop_time_str = data["extra"]["event"]["stop_time"]

        # Create datetime objects with timezone information (Assuming PST)
        timezone = pytz.timezone("America/Los_Angeles")
        time_format = "%Y-%m-%d %H:%M"
        start_datetime = timezone.localize(
            datetime.strptime(f"{event_date} {start_time_str}", time_format))
        stop_datetime = timezone.localize(
            datetime.strptime(f"{event_date} {stop_time_str}", time_format))

        # Create the calendar and event objects
        cal = icalendar.Calendar()
        event = icalendar.Event()

        venue = data['extra']['venue']
        event.add("summary", data["title"])
        event.add("description", data["description"])
        event.add("dtstart", start_datetime)
        event.add("dtend", stop_datetime)
        event.add("location",
                  f"{venue['name']}, {venue['address_street']}, "
                  f"{venue['address_city']} {venue['address_zip']}")
        event.add("organizer", data["extra"]["organizer"])

        # Add the event to the calendar
        cal.add_component(event)
        all_events.add_component(event)

        output_path = Path(f'{output}/{event_date}/event.ics')
        with open(output_path, 'wb') as f:
            f.write(cal.to_ical())

    with Path(f'{output}/calendar.ics').open('wb') as f:
        f.write(all_events.to_ical())


if __name__ == '__main__':
    validate_data()
