#!/usr/bin/env bash
# Regenerate the sibling group logos, static/siblings/*.svg, from the Gateway Cities source PNG.
# Requires potrace, ImageMagick (magick) and python3; the devShell provides all three.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
src="$here/artwork/gateway-cities.png"

# 1. Trace the alpha mask at 4x. The snowflake's right arm overlaps the N stem with a thin
#    knockout outline in the source art, so the trace yields the arm whole (with its arrowhead)
#    and the N with a matching notch. Both are kept: the notch shows the page background.
magick "$src" -filter Lanczos -resize 400% -alpha extract -threshold 50% -negate "$work/mask.pbm"
potrace --svg --turdsize 10 --alphamax 1 --opttolerance 0.2 -o "$work/all.svg" "$work/mask.pbm"

# 2. A clean N for North County's first letter: crop the N (source x 353..448, i.e. 1412..1792
#    at 4x) and close the outlined arm tip that sits inside the stem. The mask has a black
#    foreground, so the morphology runs on the negated image.
magick "$work/mask.pbm" -negate -crop 383x700+1412+0 +repage -morphology Close Disk:5 -negate "$work/n.pbm"
potrace --svg --turdsize 10 --alphamax 1 --opttolerance 0.2 -o "$work/n.svg" "$work/n.pbm"

# 3. Split the trace into letters and snowflake arms, recolor, and write both logos.
python3 "$here/compose.py" "$work"
