#!/usr/bin/env python3
"""Build the site with zola and check the generated HTML and CSS.

Run from the repository root with zola on PATH (the devShell provides it):

    python3 scripts/test_site.py

Uses only the standard library. The site is built into a temporary directory.
"""
import hashlib
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

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

    def test_about_members_are_in_curated_order(self):
        about = (self.out / 'about' / 'index.html').read_text()
        names = re.findall(r'<h4 class="title is-4">(.*?)</h4>', about)
        self.assertEqual(names, ['Daniel Baker', 'David Nuon', 'Rob Hernandez', 'Tristan Ross'])

    def test_about_order_is_driven_by_weight_not_filename(self):
        # a probe whose filename sorts first but whose weight sorts last
        probe = ROOT / 'content' / 'about' / 'aaa-probe.md'
        probe.write_text('+++\nweight = 99\n[extra]\nname = "Probe Person"\nalias = "@probe"\n'
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
    unittest.main(verbosity=2)
