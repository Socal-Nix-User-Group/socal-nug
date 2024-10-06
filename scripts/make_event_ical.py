#!/usr/bin/env python
import icalendar
from pathlib import Path

import tomllib
import json
import click

import pytz
from datetime import datetime

# https://svn.blender.org/svnroot/bf-blender/trunk/blender/build_files/scons/tools/bcolors.py
class bcolors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

@click.command()
@click.argument('posts',  nargs=-1)
@click.option('--output',  help='Output for iCal files')
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
        start_datetime = timezone.localize(datetime.strptime(f"{event_date} {start_time_str}", "%Y-%m-%d %H:%M"))
        stop_datetime = timezone.localize(datetime.strptime(f"{event_date} {stop_time_str}", "%Y-%m-%d %H:%M"))
        
        # Create the calendar and event objects
        cal = icalendar.Calendar()
        event = icalendar.Event()
        
        event.add("summary", data["title"])
        event.add("description", data["description"])
        event.add("dtstart", start_datetime)
        event.add("dtend", stop_datetime)
        event.add("location", f"{data['extra']['venue']['name']}, {data['extra']['venue']['address_street']}, "
                              f"{data['extra']['venue']['address_city']} {data['extra']['venue']['address_zip']}")
        event.add("organizer", data["extra"]["organizer"])
        
        # Add the event to the calendar
        cal.add_component(event)
        all_events.add_component(event)
        
        output_path = Path(f'{output}/{event_date}/{event_date}.ics')
        with open(output_path, 'wb') as f:
            f.write(cal.to_ical())
    
    with Path(f'{output}/all_events.ics').open('wb') as f:
        f.write(all_events.to_ical())


if __name__ == '__main__':
    validate_data()
