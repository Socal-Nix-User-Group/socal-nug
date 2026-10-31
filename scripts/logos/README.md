# Sibling group logos

`static/siblings/gateway-cities.svg` and `static/siblings/north-county.svg` are generated from
`artwork/gateway-cities.png`, the Gateway Cities NUG logo. Run from the devShell:

    scripts/logos/build.sh

This traces the PNG with potrace, splits the result into the letters G, C, N, U, G and the six
snowflake arms, recolors them, and writes both SVGs. North County's mark reuses the same
letterforms: its leading N is the N from "NUG", traced separately from a crop so it has no notch,
and the colors are North County's brand reds. The script prints the path of a review sheet
showing both logos on light and dark backgrounds.

To recolor a logo, edit the fill tables at the top of `compose.py` and rerun the script.
The crop coordinates in `build.sh` are specific to the source PNG.

Requirements: potrace, ImageMagick and python3, all provided by the devShell.
