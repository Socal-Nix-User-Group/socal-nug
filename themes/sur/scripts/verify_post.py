#!/usr/bin/env python

import tomllib
import json
import click
from jsonschema import validate
from jsonschema.exceptions import ValidationError

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
@click.argument('post',  nargs=-1)
@click.option('--schema', help='Path to the Event JSON Schema file')
def validate_post(post, schema):
    any_failed = False

    with open(schema, 'r') as f:
        schema_content = f.read().strip()
        schema = json.loads(schema_content)

    for post in post:
        if '_index.md' in post:
            continue
        
        with open(post, 'r') as f:
            post_content = f.read().strip()
        
        separator = '+++'
        front_matter = post_content.split(separator)[1].strip()
        data = tomllib.loads(front_matter)
        try:
            validate(instance=data, schema=schema)
            print(f'{bcolors.OKGREEN}[OK]{bcolors.ENDC} {post}')
        except ValidationError as e:
            print(f'{bcolors.FAIL}[ERROR]{bcolors.ENDC} {post}')
            print(f"\tInvalid front matter {e.message} at {e.json_path.replace('$', 'Root')}")
            any_failed = True

    if any_failed:
        exit(1)
        


if __name__ == '__main__':
    validate_post()