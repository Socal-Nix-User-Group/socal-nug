#!/usr/bin/env python

import tomllib
import json
import click
from jsonschema import validate

@click.command()
@click.option('--post', help='Path to the Markdown file')
@click.option('--schema', help='Path to the Event JSON Schema file')
def validate_post(post, schema):
    with open(post, 'r') as f:
        post_content = f.read().strip()
    
    with open(schema, 'r') as f:
        schema_content = f.read().strip()
        schema = json.loads(schema_content)

    separator = '+++'
    front_matter = post_content.split(separator)[1].strip()
    data = tomllib.loads(front_matter)
    try:
        validate(instance=data, schema=schema)
    except:
        raise

if __name__ == '__main__':
    validate_post()