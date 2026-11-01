#!/usr/bin/env python3
"""Compose gateway-cities.svg and north-county.svg from the potrace output produced by build.sh.

usage: compose.py <work dir containing all.svg and n.svg> <output dir>

all.svg holds one <path> per connected component of the Gateway Cities logo: G, C, the six
snowflake arms, N, U, G. They are classified by position and recolored. North County reuses
the same letterforms, with the separately traced clean N (n.svg) as its first letter.
A review sheet (review.png) is written to the work dir.
"""
import math
import pathlib
import re
import subprocess
import sys

# Fills. Change these to recolor; letters 'left' are the two before the snowflake, 'right' the three after.
GATEWAY_CITIES = {'left': '#E96409', 'right': '#F3A23C', 'arm_a': '#F3A23C', 'arm_b': '#F3C16D'}
NORTH_COUNTY = {'left': '#9A073A', 'right': '#C41130', 'arm_a': '#C41130', 'arm_b': '#E58596'}

# Raw-unit x offset of the clean-N crop (1412 px at 4x, potrace units are 10 per px).
CLEAN_N_OFFSET = 14120


def parse_paths(svg_text: str):
    m = re.search(r'<g transform="([^"]+)"', svg_text)
    assert m is not None, 'potrace output has no transform group'
    ds = re.findall(r'<path d="([^"]+)"', svg_text, re.S)
    return m.group(1), [' '.join(d.split()) for d in ds]


def bbox(d):
    """Bounding box of a potrace path (absolute M, relative c/l, z). Includes control points."""
    toks = re.findall(r'[A-Za-z]|-?\d+(?:\.\d+)?', d)
    i = 0
    cmd = ''
    x = y = sx = sy = 0.0
    xs, ys = [], []

    def pt(px, py):
        xs.append(px)
        ys.append(py)

    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]
            i += 1
            if cmd in 'Zz':
                x, y = sx, sy
            continue
        if cmd in 'Mm':
            nx, ny = float(toks[i]), float(toks[i + 1])
            i += 2
            if cmd == 'm':
                nx += x
                ny += y
            x, y = sx, sy = nx, ny
            pt(x, y)
            cmd = 'L' if cmd == 'M' else 'l'
        elif cmd in 'Ll':
            nx, ny = float(toks[i]), float(toks[i + 1])
            i += 2
            if cmd == 'l':
                nx += x
                ny += y
            x, y = nx, ny
            pt(x, y)
        elif cmd in 'Hh':
            nx = float(toks[i])
            i += 1
            x = nx + x if cmd == 'h' else nx
            pt(x, y)
        elif cmd in 'Vv':
            ny = float(toks[i])
            i += 1
            y = ny + y if cmd == 'v' else ny
            pt(x, y)
        elif cmd in 'Cc':
            c = [float(t) for t in toks[i:i + 6]]
            i += 6
            if cmd == 'c':
                c = [c[0] + x, c[1] + y, c[2] + x, c[3] + y, c[4] + x, c[5] + y]
            pt(c[0], c[1])
            pt(c[2], c[3])
            x, y = c[4], c[5]
            pt(x, y)
        else:
            raise ValueError(f'unhandled path command {cmd}')
    return min(xs), min(ys), max(xs), max(ys)


def union(bbs):
    return (min(b[0] for b in bbs), min(b[1] for b in bbs), max(b[2] for b in bbs), max(b[3] for b in bbs))


def classify(paths):
    comps = [{'d': d, 'bb': bbox(d)} for d in paths]
    for c in comps:
        x0, y0, x1, y1 = c['bb']
        c['w'] = x1 - x0
        c['cx'] = (x0 + x1) / 2
        c['cy'] = (y0 + y1) / 2
    maxw = max(c['w'] for c in comps)
    # letters are ~3800 units wide, the diagonal snowflake arms 1575-2340
    arms = [c for c in comps if c['w'] < 0.7 * maxw]
    letters = sorted((c for c in comps if c not in arms), key=lambda c: c['cx'])
    assert len(arms) >= 6 and len(letters) == 5, (len(arms), len(letters))
    # assign each arm to one of six 60-degree sectors around the snowflake center so the
    # two-tone alternation is stable even if a piece is split
    x0, y0, x1, y1 = union([a['bb'] for a in arms])
    ax, ay = (x0 + x1) / 2, (y0 + y1) / 2
    for a in arms:
        ang = math.degrees(math.atan2(a['cy'] - ay, a['cx'] - ax)) % 360
        a['sector'] = int(((ang + 30) % 360) // 60)
    assert len({a['sector'] for a in arms}) == 6
    arms.sort(key=lambda a: (a['sector'], a['w']))
    return letters, arms


def svg(parts, transform, title):
    """parts: list of (path d, fill, dx in raw units). transform is potrace's translate/scale group."""
    tm = re.match(r'translate\(([\d.\-]+),([\d.\-]+)\) scale\(([\d.\-]+),([\d.\-]+)\)', transform)
    assert tm is not None, f'unexpected potrace transform: {transform}'
    tx, ty, sx, sy = (float(v) for v in tm.groups())
    bbs = []
    for d, _fill, dx in parts:
        x0, y0, x1, y1 = bbox(d)
        bbs.append((x0 + dx, y0, x1 + dx, y1))
    x0, y0, x1, y1 = union(bbs)
    ux0, ux1 = tx + sx * x0, tx + sx * x1
    uy0, uy1 = ty + sy * y1, ty + sy * y0
    pad = 0.03 * (uy1 - uy0)
    vb = (ux0 - pad, uy0 - pad, (ux1 - ux0) + 2 * pad, (uy1 - uy0) + 2 * pad)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]:.1f} {vb[1]:.1f} {vb[2]:.1f} {vb[3]:.1f}" role="img" aria-label="{title}">',
           f'  <title>{title}</title>',
           f'  <g transform="{transform}" stroke="none">']
    for d, fill, dx in parts:
        g_open = f'<g transform="translate({dx:.0f},0)">' if dx else ''
        g_close = '</g>' if dx else ''
        out.append(f'    {g_open}<path fill="{fill}" d="{d}"/>{g_close}')
    out += ['  </g>', '</svg>', '']
    return '\n'.join(out)


def build(letters, arms, colors, clean_n=None):
    g1, c, n, u, g2 = letters
    parts = []
    if clean_n is None:
        parts += [(g1['d'], colors['left'], 0), (c['d'], colors['left'], 0)]
    else:
        # right-align the clean N where the G sat so the N-C gap matches the original G-C gap
        _, _, cx1, _ = bbox(clean_n)
        dx = CLEAN_N_OFFSET + (g1['bb'][2] - (CLEAN_N_OFFSET + cx1))
        parts += [(clean_n, colors['left'], dx), (c['d'], colors['left'], 0)]
    for a in arms:
        parts.append((a['d'], colors['arm_a'] if a['sector'] % 2 == 0 else colors['arm_b'], 0))
    parts += [(n['d'], colors['right'], 0), (u['d'], colors['right'], 0), (g2['d'], colors['right'], 0)]
    return parts


def main():
    work = pathlib.Path(sys.argv[1])
    out_dir = pathlib.Path(sys.argv[2])
    transform, paths = parse_paths((work / 'all.svg').read_text())
    letters, arms = classify(paths)
    _, clean_paths = parse_paths((work / 'n.svg').read_text())
    assert len(clean_paths) == 1, len(clean_paths)

    gc = svg(build(letters, arms, GATEWAY_CITIES), transform, 'Gateway Cities Nix Users Group')
    nc = svg(build(letters, arms, NORTH_COUNTY, clean_paths[0]), transform, 'North County Nix Users Group')
    (out_dir / 'gateway-cities.svg').write_text(gc)
    (out_dir / 'north-county.svg').write_text(nc)
    print('wrote', out_dir / 'gateway-cities.svg', 'and', out_dir / 'north-county.svg')

    # review sheet: both logos on white and on the site's dark background
    tiles = []
    for name in ('gateway-cities', 'north-county'):
        for bg in ('white', '#14161a'):
            tile = work / f'{name}-{"light" if bg == "white" else "dark"}.png'
            subprocess.run(['magick', '-background', bg, '-density', '96', str(out_dir / f'{name}.svg'),
                            '-resize', '700x', '-bordercolor', bg, '-border', '20', str(tile)], check=True)
            tiles.append(str(tile))
    subprocess.run(['magick', *tiles, '-append', str(work / 'review.png')], check=True)
    print('review sheet:', work / 'review.png')


if __name__ == '__main__':
    main()
