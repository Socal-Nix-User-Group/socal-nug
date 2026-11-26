#!/usr/bin/env python3
"""Build the site with zola and check the generated HTML and CSS.

Takes the site source directory as its first argument. From the repository root:

    socal-nug-test-site .

Uses only the standard library. The site is built into a temporary directory. The
about-page ordering test writes a temporary profile into the source's content/about/.
"""
import hashlib
import html
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None

# https://brand.nixos.org/internals/nixos-logomark-default-gradient-none.svg
LOGOMARK_SHA256 = '50bfc4ca4fdeed8adfcfcb91f4c67007cd1af92e070bd0a38b1a56f2da4932f6'


def build(output_dir: pathlib.Path) -> None:
    # zola refuses to build into an existing directory, so build into a fresh subfolder
    r = subprocess.run(['zola', 'build', '--output-dir', str(output_dir / 'public')],
                       cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit('zola build failed\n' + r.stdout + r.stderr)


class SiteBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = pathlib.Path(tempfile.mkdtemp(prefix='socal-nug-site-'))
        build(cls.tmp)
        cls.out = cls.tmp / 'public'
        cls.index = (cls.out / 'index.html').read_text()
        cls.event = sorted((cls.out / 'events').glob('20*/index.html'))[0].read_text()
        cls.blog = (cls.out / 'blog' / 'index.html').read_text()
        cls.css = (cls.out / 'css' / 'style.css').read_text()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    # --- theme switching -------------------------------------------------------

    def test_bulma_1_is_loaded(self):
        self.assertIn('bulma@1.0.4/css/bulma.min.css', self.index)
        self.assertNotIn('bulma@0.9', self.index)

    def test_theme_is_applied_before_stylesheets_load(self):
        head = self.index.split('</head>')[0]
        script_at = head.find("localStorage.getItem('theme')")
        css_at = head.find('<link rel="stylesheet"')
        self.assertGreater(script_at, -1, 'theme bootstrap script missing from <head>')
        self.assertLess(script_at, css_at, 'theme script must run before stylesheets')
        self.assertIn('dataset.theme', head)

    def test_navbar_has_three_theme_choices(self):
        choices = re.findall(r'data-theme-choice="([a-z]+)"', self.index)
        self.assertEqual(choices, ['auto', 'light', 'dark'])
        for page in (self.event, self.blog):
            self.assertEqual(page.count('data-theme-choice='), 3)

    def test_theme_choice_is_persisted(self):
        self.assertIn("localStorage.setItem('theme'", self.index)
        self.assertIn("localStorage.removeItem('theme')", self.index)

    def test_variant_switching_css_follows_the_three_state_theme(self):
        self.assertIn('@media (prefers-color-scheme: dark){html:not([data-theme=light]) .show-in-light{display:none}}', self.css)
        self.assertIn('@media (prefers-color-scheme: light){html:not([data-theme=dark]) .show-in-dark{display:none}}', self.css)
        self.assertIn('html[data-theme=dark] .show-in-light{display:none}', self.css)
        self.assertIn('html[data-theme=light] .show-in-dark{display:none}', self.css)
        # the shown variant must not get a forced display type (Bulma's .image img sets display:block)
        self.assertNotIn('.show-in-dark{display:inline}', self.css)
        self.assertNotIn('.show-in-light{display:inline}', self.css)

    def test_dark_theme_overrides_for_info_buttons_and_hero(self):
        # Bulma 0.9's $info is hsl(207, 61%, 53%); applied only under the dark-theme selectors
        for sel in ('html[data-theme=dark] .button.is-info{', 'html:not([data-theme=light]) .button.is-info{'):
            i = self.css.find(sel)
            self.assertGreater(i, -1, sel)
            self.assertRegex(self.css[i:i + 400], r'--bulma-button-background-l:\s*53%')
        for sel in ('html[data-theme=dark] .socalnug-hero{', 'html:not([data-theme=light]) .socalnug-hero{'):
            self.assertIn(sel, self.css)
        # the light theme keeps the original hero gradient
        self.assertIn('.socalnug-hero{background:#090979;background:linear-gradient(0deg, #090979 0%, #073a9a 14%, #00d4ff 100%)', self.css)

    # --- no light-only colors in custom styles ----------------------------------

    def test_event_card_has_no_hardcoded_light_colors(self):
        match = re.search(r'\.frontpage-event-card\s*\{([^}]*)\}', self.css)
        assert match is not None, '.frontpage-event-card rule missing'
        card = match.group(1)
        for literal in ('white', 'black', '#fff', '#000'):
            self.assertNotIn(literal, card)
        self.assertNotIn('background', card)
        self.assertNotRegex(card, r'(^|;)color:')

    def test_hero_band_is_not_forced_light(self):
        self.assertNotIn('has-background-light', self.index)

    def test_date_chip_borders_follow_theme(self):
        self.assertNotIn('#333', self.css)

    def test_blog_listing_has_no_fixed_text_color(self):
        self.assertNotIn('#333', self.blog)

    # --- images ----------------------------------------------------------------

    def test_theme_dependent_images_ship_both_variants(self):
        for page in (self.index, self.event):
            self.assertIn('<img class="show-in-light" src="/icons/github/github-mark.svg"', page)
            self.assertIn('<img class="show-in-dark" src="/icons/github/github-mark-white.svg"', page)
        self.assertIn('<img class="show-in-light" src="/icons/nix/nug-logo-dark.svg"', self.index)
        self.assertIn('<img class="show-in-dark" src="/icons/nix/nug-logo.svg"', self.index)

    def test_sibling_logos_are_svgs(self):
        self.assertIn('src="/siblings/gateway-cities.svg"', self.index)
        self.assertIn('src="/siblings/north-county.svg"', self.index)
        for name in ('gateway-cities', 'north-county'):
            self.assertTrue((self.out / 'siblings' / f'{name}.svg').exists(), name)
            self.assertFalse((self.out / 'siblings' / f'{name}.png').exists(), name)

    def test_nix_logomark_is_the_current_brand_asset(self):
        got = hashlib.sha256((self.out / 'icons' / 'nix' / 'nix-snowflake-colors.svg').read_bytes()).hexdigest()
        self.assertEqual(got, LOGOMARK_SHA256)
        self.assertIn('src="/icons/nix/nix-snowflake-colors.svg"', self.index)

    # --- layout ----------------------------------------------------------------

    def test_home_cta_containers_use_the_extended_spacing_helper(self):
        self.assertIn('.mt-7{margin-top:6rem !important}', self.css)
        self.assertIn('.mt-8{margin-top:8rem !important}', self.css)
        cta = self.index.split('What is Nix?')[1].split('</section>')[0]
        self.assertEqual(cta.count('class="container mt-7"'), 2)

    # --- about page ------------------------------------------------------------

    MEMBERS = ['Daniel Baker', 'David Nuon', 'Rob Hernandez', 'Tristan Ross',
               'Connor Baker', 'Jared Baur', 'Kyle Risse', 'Morgan Jones',
               'Mica', 'Samuel Raumin', 'Chris Tewfik', 'Joshua Campbell']

    def test_about_members_are_in_curated_order(self):
        about = (self.out / 'about' / 'index.html').read_text()
        names = re.findall(r'<h4 class="title is-4">(.*?)</h4>', about)
        self.assertEqual(names, self.MEMBERS)

    def test_every_member_has_a_real_avatar_url(self):
        # an empty src resolves against the page and refetches it
        about = (self.out / 'about' / 'index.html').read_text()
        self.assertNotIn('src=""', about)

    def test_member_avatars_are_served_from_this_site(self):
        # avatars live in the repo, so a page view makes no third-party request
        about = (self.out / 'about' / 'index.html').read_text()
        for src in re.findall(r'<img class="image"[^>]*src="([^"]*)"', about):
            self.assertTrue(src.startswith('/'), f'external avatar: {src}')
            self.assertTrue((self.out / src.lstrip('/')).is_file(), src)

    def test_a_guest_in_the_data_is_on_origins_and_not_in_the_members_grid(self):
        # Matthew Croughan is in the story and not in the group
        page, data = self.origins_data()
        guests = [p['name'] for p in data['people'] if p['member'] is False]
        self.assertIn('Matthew Croughan', guests)
        about = (self.out / 'about' / 'index.html').read_text()
        for name in guests:
            self.assertNotIn(name, about)
        self.assertTrue((self.out / 'about' / 'matthew-croughan' / 'index.html').is_file())

    def test_a_members_own_sites_are_on_about_and_in_the_origins_data(self):
        # one profile field, read by both pages
        _, data = self.origins_data()
        linked = [p for p in data['people'] if p['member'] and p['links']]
        self.assertTrue(linked, 'no member profile carries links')
        about = html.unescape((self.out / 'about' / 'index.html').read_text())
        for person in linked:
            for link in person['links']:
                anchor = (f'<a class="mr-3" href="{link["url"]}" target="_blank" rel="noopener">'
                          f'{link["title"]}</a>')
                self.assertTrue(anchor in about, f'not on the About page: {anchor}')

    def test_a_members_own_words_are_on_about_as_a_quotation(self):
        # the same field the Origins card shows as a quotation
        _, data = self.origins_data()
        quoted = [p for p in data['people'] if p['member'] and p['quote']]
        self.assertTrue(quoted, 'no member profile carries a quote')
        about = html.unescape((self.out / 'about' / 'index.html').read_text())
        for person in quoted:
            said = f'<blockquote>{person["quote"]}</blockquote>'
            self.assertTrue(said in about, f'not on the About page: {said}')

    def test_a_members_own_words_come_last_on_about(self):
        # as on the Origins card: who they are and where to find them first
        _, data = self.origins_data()
        full = [p for p in data['people']
                if p['member'] and p['quote'] and p['description'] and p['links']]
        self.assertTrue(full, 'no member profile carries a quote, a description and links')
        about = html.unescape((self.out / 'about' / 'index.html').read_text())
        for person in full:
            card = about.split(f'<h4 class="title is-4">{person["name"]}</h4>')[1]
            card = card.split('<h4 class="title is-4">')[0]
            quote = card.find('<blockquote>')
            said = card.find(person['description'])
            self.assertNotEqual(said, -1, person['name'])
            self.assertGreater(quote, said, person['name'])
            for link in person['links']:
                at = card.find(f'href="{link["url"]}"')
                self.assertNotEqual(at, -1, link['url'])
                self.assertGreater(quote, at, link['url'])

    def test_a_members_links_on_about_open_a_new_tab(self):
        _, data = self.origins_data()
        members = [p for p in data['people'] if p['member']]
        about = html.unescape((self.out / 'about' / 'index.html').read_text())
        for person in members:
            handle = (f'<a href="{person["profileUrl"]}" target="_blank" rel="noopener">'
                      f'{person["alias"]}</a>')
            self.assertTrue(handle in about, f'not on the About page: {handle}')
        anchors = re.findall(r'<a class="mr-3"[^>]*>', about)
        self.assertTrue(anchors, 'no member links on the About page')
        for anchor in anchors:
            self.assertIn('target="_blank"', anchor)
            self.assertIn('rel="noopener"', anchor)

    def test_a_guest_has_a_page_but_is_not_in_the_members_grid(self):
        # the filter is proved with a probe as well, so it does not rest on
        # whoever happens to be a guest in the data
        probe = ROOT / 'content' / 'about' / 'zzz-guest-probe.md'
        probe.write_text('+++\nweight = 98\n[extra]\nmember = false\n'
                         'name = "Guest Probe"\nalias = "@guestprobe"\n+++\n')
        tmp = pathlib.Path(tempfile.mkdtemp(prefix='socal-nug-guest-'))
        try:
            build(tmp)
            out = tmp / 'public'
            about = (out / 'about' / 'index.html').read_text()
            names = re.findall(r'<h4 class="title is-4">(.*?)</h4>', about)
            has_page = (out / 'about' / 'zzz-guest-probe' / 'index.html').is_file()
        finally:
            probe.unlink()
            shutil.rmtree(tmp, ignore_errors=True)
        self.assertEqual(names, self.MEMBERS)
        self.assertNotIn('Guest Probe', about)
        # a guest still gets a page: the braid reads people from this section,
        # and render = false would drop them out of it entirely
        self.assertTrue(has_page)

    # --- origins page ----------------------------------------------------------

    def origins_data(self):
        page = (self.out / 'origins' / 'index.html').read_text()
        blob = re.search(
            r'<script type="application/json" id="origins-data">(.*?)</script>',
            page, re.S)
        self.assertIsNotNone(blob, 'origins-data script missing')
        return page, json.loads(blob.group(1))

    def test_origins_carries_parseable_data(self):
        _, data = self.origins_data()
        # twenty meetups from content/events plus the moments file
        self.assertGreaterEqual(len(data['moments']), 20)
        self.assertGreaterEqual(len(data['people']), 6)

    def test_a_moments_avatar_is_a_file_this_site_serves(self):
        # vendored like the people's pictures, so the page asks nobody else for it
        _, data = self.origins_data()
        avatars = [m['avatar'] for m in data['moments'] if m.get('avatar')]
        self.assertTrue(avatars, 'no moment carries an avatar')
        for src in avatars:
            self.assertTrue(src.startswith('/'), f'external avatar: {src}')
            self.assertTrue((self.out / src.lstrip('/')).is_file(), src)

    def test_origins_spine_comes_from_the_events_section(self):
        _, data = self.origins_data()
        spine = {m['id'] for m in data['moments'] if m['trunk']}
        self.assertIn('2023-05-30', spine)
        self.assertIn('2026-11-14', spine)

    def test_a_join_record_merges_into_its_event(self):
        _, data = self.origins_data()
        nug3 = next(m for m in data['moments'] if m['id'] == '2023-09-19')
        self.assertIn('tristan-ross', nug3['people'])

    def test_origins_meetups_carry_attendance_lists(self):
        _, data = self.origins_data()
        meetups = [m for m in data['moments'] if m.get('permalink')]
        self.assertGreaterEqual(len(meetups), 20)
        for m in meetups:
            self.assertIsInstance(m['there'], list, m['id'])
            self.assertIsInstance(m['away'], list, m['id'])

    def test_an_attendance_record_merges_into_its_event_beside_its_joins(self):
        # NUG #3 has two join records and an attendance record in the data
        _, data = self.origins_data()
        nug3 = next(m for m in data['moments'] if m['id'] == '2023-09-19')
        self.assertIn('mica', nug3['there'])
        self.assertIn('tristan-ross', nug3['people'])
        self.assertIn('kyle-risse', nug3['people'])
        self.assertNotIn('nug-3-attendance', [m['id'] for m in data['moments']])
        # and NUG #2 records who was away
        nug2 = next(m for m in data['moments'] if m['id'] == '2023-07-08')
        self.assertIn('jared-baur', nug2['away'])
        self.assertIn('mica', nug2['people'])

    def test_a_second_attendance_record_adds_to_its_event_and_to_no_other(self):
        # the data has no meetup with two attendance records, so a second is
        # written into the copy for a meetup that already has one, and taken
        # out again
        _, real = self.origins_data()
        moments = ROOT / 'data' / 'moments.toml'
        original = moments.read_text()
        moments.write_text(original + '\n[[moment]]\nid = "nug-5-roll"\nevent = "2024-04-13"\n'
                           'there = ["rob-hernandez"]\naway = ["mica"]\n')
        tmp = pathlib.Path(tempfile.mkdtemp(prefix='socal-nug-attendance-'))
        try:
            build(tmp)
            page = (tmp / 'public' / 'origins' / 'index.html').read_text()
        finally:
            moments.write_text(original)
            shutil.rmtree(tmp, ignore_errors=True)
        blob = re.search(
            r'<script type="application/json" id="origins-data">(.*?)</script>',
            page, re.S)
        data = json.loads(blob.group(1))
        before = {m['id']: (m.get('there'), m.get('away')) for m in real['moments']}
        after = {m['id']: (m.get('there'), m.get('away')) for m in data['moments']}
        there, away = before.pop('2024-04-13')
        self.assertEqual(after.pop('2024-04-13'), (there + ['rob-hernandez'], away + ['mica']))
        self.assertEqual(after, before)
        self.assertNotIn('nug-5-roll', after)

    def test_a_dated_moment_is_not_duplicated_as_an_event(self):
        _, data = self.origins_data()
        ids = [m['id'] for m in data['moments']]
        self.assertEqual(len(ids), len(set(ids)), 'duplicate moment ids')
        self.assertNotIn('tristan-joins', ids)

    def test_origins_carries_its_history_as_data_not_as_a_second_copy(self):
        # there was a rendered list beside the picture, as the no-script page
        # and the accessible one. The picture names its own dots and faces
        # now, so the list was a second copy of the same history to keep
        # correct; the data block is the one source the page ships.
        page, data = self.origins_data()
        self.assertNotIn('origins-fallback', page)
        # one from the moments file and one resolved from an event page, so
        # both halves of the merge are proved to reach the block. Titles get
        # reworded, so these are the ids rather than the words.
        ids = [m.get('id') for m in data['moments']]
        self.assertIn('daniel-finds-nix', ids)
        self.assertIn('2023-05-30', ids)

    def test_origins_ships_the_bundle_and_its_controls(self):
        page = (self.out / 'origins' / 'index.html').read_text()
        self.assertIn('src="/js/braid.js"', page)
        self.assertTrue((self.out / 'js' / 'braid.js').exists())
        self.assertIn('id="origins-toggle"', page)
        self.assertIn('data-origins-mode="river"', page)
        self.assertIn('data-origins-mode="subway"', page)

    def test_origins_ships_the_layout_engine_it_loads(self):
        page = (self.out / 'origins' / 'index.html').read_text()
        self.assertIn('src="/js/vendor/elk.bundled.js"', page)
        # the classic script has to come before the module that uses it
        self.assertLess(
            page.index('/js/vendor/elk.bundled.js'), page.index('/js/braid.js'))
        self.assertTrue((self.out / 'js' / 'vendor' / 'elk.bundled.js').exists())
        self.assertTrue((self.out / 'js' / 'vendor' / 'elk.LICENSE.md').exists())

    def test_origins_has_a_roster_and_a_popup(self):
        # the roster rail went when the lane allocator drew River over a
        # thousand pixels wide, and came back as a grid once ELK's layout
        # turned out to be a third of that. Cards still open in the map too:
        # the roster is everyone, the popup is whatever was just clicked.
        page = (self.out / 'origins' / 'index.html').read_text()
        self.assertIn('id="origins-roster"', page)
        self.assertIn('.origins-popup{position:absolute;', self.css)

    def test_origins_rail_beside_the_map_is_the_maps_height(self):
        # the people and the moments share the column beside River, one above
        # the other. The two ceilings are one value, so the boxes end on one
        # line. Only once the script has filled it: an empty rail that tall
        # is a blank block beside the map.
        ceiling = self.css.split('.origins-braid{')[1].split('max-height:')[1].split(';')[0]
        self.assertIn(
            '@media screen and (min-width: 1024px){'
            '.origins-layout:not([data-mode=subway]) .origins-roster-rail:not(:empty){'
            f'height:{ceiling};',
            self.css)

    def test_origins_lists_sit_side_by_side_under_subway(self):
        # Subway is full width, so a column beside it would squeeze the one
        # axis that map needs; under it the two lists share the width
        self.assertRegex(
            self.css,
            r'\.origins-layout\[data-mode=subway\] \.origins-roster-rail\{[^}]*'
            r'grid-template-columns:minmax\(0, 3fr\) minmax\(0, 2fr\)')

    def test_origins_lists_are_rows_on_a_narrow_screen(self):
        # a row that scrolls sideways keeps its overscroll to itself, as the
        # map does, or a swipe past its end turns into the browser's back
        rule = (
            r'@media screen and \(max-width: 1023\.98px\)\{[^@]*'
            r'\.origins-roster,\.origins-moments\{[^}]*')
        self.assertRegex(self.css, rule + r'overflow-x:auto')
        self.assertRegex(self.css, rule + r'overscroll-behavior-x:contain')

    def test_origins_pill_outlines_while_its_card_in_the_list_is_hovered(self):
        self.assertIn('.origins-node.is-hot .origins-oval', self.css)

    def test_origins_toggle_is_hidden_until_the_script_reveals_it(self):
        page = (self.out / 'origins' / 'index.html').read_text()
        toggle = page.split('id="origins-toggle"')[1].split('>')[0]
        self.assertIn('is-hidden', toggle)

    def test_origins_has_a_zoom_hidden_until_the_script_reveals_it(self):
        # nothing to zoom until there is a picture
        page = (self.out / 'origins' / 'index.html').read_text()
        zoom = page.split('id="origins-zoom"')[1].split('</div>')[0]
        self.assertIn('is-hidden', zoom.split('>')[0])
        # out, in, the whole map, and back to the size it was drawn
        buttons = zoom.split('<button')[1:]
        self.assertEqual(len(buttons), 4)
        for button, does in zip(buttons, ('out', 'in', 'fit', 'reset')):
            tag = button.split('>')[0]
            self.assertIn(f'data-origins-zoom="{does}"', tag)
            # two of them are only a sign, so each says what it does
            self.assertRegex(tag, r'aria-label="[^"]+"')
        # one that would do nothing is dimmed, not disabled: disabling the
        # button under a keyboard drops the focus that was on it
        self.assertIn('.origins-zoom [aria-disabled=true]{', self.css)

    def test_origins_map_can_be_held_and_moved(self):
        # a hand over the map, a closed one while it is held, and nothing in
        # the map selected by the drag; the card keeps its text selectable
        self.assertIn('cursor:grab;-webkit-user-select:none;user-select:none}', self.css)
        self.assertIn(
            '.origins-braid.is-grabbing,.origins-braid.is-grabbing *{cursor:grabbing}',
            self.css)
        self.assertIn('user-select:text', self.css.split('.origins-popup{')[1].split('}')[0])

    def test_origins_map_answers_nothing_while_it_morphs(self):
        # between the two modes the picture is neither, so a press on it
        # means nothing, and the box the script is sizing shows no scrollbars
        self.assertIn(
            '.origins-braid.is-morphing{overflow:hidden;pointer-events:none}', self.css)

    def test_origins_dims_whoever_is_not_lit_and_the_unrecorded_half_way(self):
        # in the picture only, and only threads, beads and faces: a moment
        # belongs to everyone through it, and the roster is a list being read.
        # The people whose attendance at a moment in play is not recorded
        # step back half as far, since nothing says they were there and
        # nothing says they were not
        self.assertIn(
            '.origins-svg:has(.is-lit,.is-unsure) .origins-thread:not(.is-lit,.is-unsure),'
            '.origins-svg:has(.is-lit,.is-unsure) .origins-bead:not(.is-lit,.is-unsure),'
            '.origins-svg:has(.is-lit,.is-unsure) .origins-root:not(.is-lit,.is-unsure){opacity:.25}',
            self.css)
        self.assertIn(
            '.origins-svg:has(.is-lit,.is-unsure) .origins-thread.is-unsure,'
            '.origins-svg:has(.is-lit,.is-unsure) .origins-bead.is-unsure,'
            '.origins-svg:has(.is-lit,.is-unsure) .origins-root.is-unsure{opacity:.625}',
            self.css)

    def test_origins_has_a_legend_hidden_until_the_script_runs(self):
        # it explains marks a reader without the picture never sees
        page = (self.out / 'origins' / 'index.html').read_text()
        legend = page.split('id="origins-legend"')[1].split('>')[0]
        self.assertIn('is-hidden', legend)
        # the marks it explains are not exposed to assistive tech, so neither
        # is the legend
        self.assertIn('aria-hidden="true"', legend)

    def test_origins_legend_always_carries_all_four_marks(self):
        # the mark for an absence is there whether or not the record has one
        page = (self.out / 'origins' / 'index.html').read_text()
        body = page.split('id="origins-legend"')[1].split('</p>')[0]
        items = body.split('<span')[1:]
        self.assertEqual(len(items), 4)
        for item in items:
            tag = item.split('>')[0]
            self.assertNotIn('is-hidden', tag)
            # the labels are Nix words; the tooltip says what each means.
            # The page's own tooltip, so no title to bring up the browser's
            # beside it.
            self.assertRegex(tag, r'data-tip="[^"]+"')
            self.assertNotIn('title=', tag)
        self.assertIn('.origins-legend-item:hover::after{', self.css)
        for label in ('cache hit', 'first build', 'unevaluated', 'cache miss'):
            self.assertIn(f'</svg>{label}</span>', body)
        # an absence is drawn as it is in the picture: the thread broken
        # either side of the meetup, and a hollow bead in the empty seat
        miss = items[3]
        self.assertIn('d="M2,8 H8 M28,8 H34"', miss)
        self.assertIn('class="origins-bead is-away"', miss)
        self.assertIn(
            '.origins-bead.is-away{fill:none;'
            'stroke:var(--origins-thread, var(--origins-muted));stroke-width:1.2}',
            self.css)

    def test_origins_palette_follows_the_three_state_theme(self):
        self.assertIn(
            '@media (prefers-color-scheme: dark){html:not([data-theme=light]) '
            '.origins-layout{', self.css)
        self.assertIn('html[data-theme=dark] .origins-layout{', self.css)

    def test_origins_member_and_guest_differ_without_colour(self):
        # dashes and badge treatment, so the distinction survives greyscale
        # and does not depend on having a distinguishable hue per person
        self.assertIn('.origins-thread.is-guest{stroke-width:2;stroke-dasharray:5 5}', self.css)
        self.assertIn('.origins-badge.is-guest{', self.css)
        self.assertIn('border:1px dashed currentColor', self.css)

    def test_origins_colours_are_palette_slots_not_people(self):
        # adding a person must not need a stylesheet edit
        self.assertIn('[data-hue="0"]{', self.css)
        self.assertIn('[data-hue="-1"]{', self.css)
        self.assertNotIn('daniel-baker', self.css)

    def test_origins_is_reachable_from_the_nav(self):
        self.assertIn('href="/origins/"', self.index)

    def test_about_order_is_driven_by_weight_not_filename(self):
        # a probe whose filename sorts first but whose weight sorts last
        probe = ROOT / 'content' / 'about' / 'aaa-probe.md'
        probe.write_text('+++\nweight = 99\n[extra]\nmember = true\nname = "Probe Person"\nalias = "@probe"\n'
                         'description = "probe"\nimage_url = "https://example.com/p.png"\n'
                         'profile_url = "https://example.com/p"\n+++\n')
        tmp = pathlib.Path(tempfile.mkdtemp(prefix='socal-nug-probe-'))
        try:
            build(tmp)
            names = re.findall(r'<h4 class="title is-4">(.*?)</h4>', (tmp / 'public' / 'about' / 'index.html').read_text())
        finally:
            probe.unlink()
            shutil.rmtree(tmp, ignore_errors=True)
        self.assertEqual(names[-1], 'Probe Person', names)


if __name__ == '__main__':
    if ROOT is None or not (ROOT / 'config.toml').is_file():
        sys.exit('usage: socal-nug-test-site <site source dir>')
    unittest.main(argv=[sys.argv[0]] + sys.argv[2:], verbosity=2)
