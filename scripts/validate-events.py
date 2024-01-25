#!/usr/bin/env python3.11

import tomllib
import glob
from enum import Enum

class Event:
    class ParseStates(Enum):
        NOT_STARTED = 0
        STARTED = 1
        ENDED = 2

    def __init__(self, markdown_file):
        self.markdown_file = markdown_file
        self.frontmatter = self._get_frontmatter()

    """
        Grabs the toml frontmatter from the markdown file
        and retuns it as a dictionary

        The frontmatter is deliminated with 
        
        +++
        <frontmatter>
        +++

        <content>
    """
    def _get_frontmatter(self):
        lines = self.markdown_file.split('\n')
        frontmatter_lines = ""

        PARSING_STATE = Event.ParseStates.NOT_STARTED
        for line in lines:
            if line.strip() == '+++':
                if PARSING_STATE == Event.ParseStates.NOT_STARTED:
                    PARSING_STATE = Event.ParseStates.STARTED
                elif PARSING_STATE == Event.ParseStates.STARTED:
                    PARSING_STATE = Event.ParseStates.ENDED
                    break
            elif PARSING_STATE == Event.ParseStates.STARTED:
                frontmatter_lines += f'{line}\n'

        return tomllib.loads(frontmatter_lines)
            

for event_file in glob.glob("./content/events/*-*-*.md"):
    with open(event_file) as f:
        print(Event(f.read()).frontmatter)
