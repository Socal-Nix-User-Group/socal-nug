import tomllib
import json

toml_text = """[data]
template = "event.html"
title = "NUG #1"
[extra]
organizer = "Socal NUG Organizers"
[extra.event]
date = "2023-05-30"
start_time = "19:00"
[extra.venue]
name = "23/b Shop"
address_street="418 E Commonwealth Ave"
address_unit="Unit #1"
address_city="Fullerton"
address_zip="92832"
website="https://www.23bshop.org/"
google_maps="https://goo.gl/maps/YHNFDsjGkqbjqsCj7"
"""

foo = """"""
data = json.dumps(tomllib.loads(toml_text))
print(data)