# Vendor member profile images

Date: 2026-11-21. Branch `worktree-vendor-profile-images`, based on `main` after the CI rework
(#98) merged.

## Intent

The four member photos on the about page are the site's only hotlinked images. Rob Hernandez's
pointed at a SCALE speaker thumbnail, added by Rob himself in `f932bc5`:

```
https://www.socallinuxexpo.org/sites/default/files/styles/square_thumbnail/public/speakers/profile-400.jpg?itok=CHKlz8Yt
```

SCALE has since republished its old conference sites as static archives under a `_assets/` prefix,
so that URL now returns 404 and the photo is missing from the live about page. The other three are
GitHub avatars and still resolve, but they depend on a third party the group does not control.

Vendoring the four images into the repository removes that dependency. The site already serves
every other image, including galleries, event maps and logos, from `static/`.

## Goals

- All four member photos served from this repository.
- The about page renders all four correctly.
- No new build tooling, and no change to the build, the checks or the templates.

## Non-goals

- The other hotlinked assets stay as they are: the Bulma stylesheet from jsDelivr
  (`templates/base.html:31`), the Google Fonts import in `sass/css/special/blog/oneyearsnug.scss`
  and the Bunny Fonts import in `sass/css/style.scss`. Same fragility, different problem, and the
  group did not ask for it.
- No check that forbids remote image URLs. Considered and declined: the maintainer chose to keep
  the diff to the images and the front matter.
- No rename of the `extra.image_url` field. It is shared with the event gallery schema, and a
  root-relative path is a valid URL reference, so the name still fits.

## Anti-goals

- Shipping a photo that is not the member's current chosen likeness. Recovering a stale image from
  an archive and presenting it as current would be worse than the broken image it replaces.

## Constraints

- A flake's `self` is the git-tracked tree. New image files must be staged before `nix flake check`
  or `nix build` can see them, otherwise the build silently ships an about page with four broken
  images.
- `overlays/topLevel/socal-nug-verify-post/schemas/profiles.json` declares `"format": "uri"` on
  `extra.image_url`. `verify_post.py` calls `jsonschema.validate()` without a format checker, so
  the format should be an unenforced annotation and root-relative paths should pass. To be
  confirmed by running the check, not assumed; if it does assert, the schema changes to
  `"format": "uri-reference"`.
- `templates/about.html` renders the image at `width="128"` with no height attribute.

## Approaches

**Put the files in `static/images/people/`** — chosen. Matches the existing `static/images/events/`
and `static/images/gallery/` layout. Zola copies `static/` verbatim, so the build, the checks and
the templates are untouched; only the four `image_url` values change.

*Zola colocated page assets* — rejected. Zola can colocate an asset next to its page, but each
`content/about/<name>.md` would have to become a directory bundle with an `index.md`. Four files
moved and a different content layout for the about section, for no benefit over `static/`.

*Keep the remote URLs behind a cache or proxy* — rejected. It does not vendor anything, it adds a
moving part, and it leaves the group dependent on a third party.

## Rob Hernandez's photo

The archived SCALE headshot was located and confirmed to be his: the SCALE 21x speaker page for
Robert Hernandez references that exact filename, and both the Wayback Machine snapshot
(`20220525184750`) and SCALE's own surviving static archive serve a byte-identical 180x180, 4915-byte
JPEG. It was not used. The only surviving copy is 180x180 against 400–460 px for the other three,
and the maintainer chose his GitHub avatar instead, which makes all four sources uniform. Note that
`@sarcasticadmin`'s avatar is an illustration of a rabbit in a space helmet, not a photograph; this
was known when the choice was made.

The recovery path is recorded here in case a photograph is wanted later.

## The change

Add four files under `static/images/people/`, each the member's GitHub avatar fetched at
`?v=4&s=256`:

| File                | Source                                     | Served                             |
| ------------------- | ------------------------------------------ | ---------------------------------- |
| `daniel-baker.png`  | `avatars.githubusercontent.com/u/7043297`  | `/images/people/daniel-baker.png`  |
| `david-nuon.jpg`    | `avatars.githubusercontent.com/u/477742`   | `/images/people/david-nuon.jpg`    |
| `rob-hernandez.png` | `avatars.githubusercontent.com/u/30531572` | `/images/people/rob-hernandez.png` |
| `tristan-ross.jpg`  | `avatars.githubusercontent.com/u/19699320` | `/images/people/tristan-ross.jpg`  |

Then repoint the `extra.image_url` line in each of the four `content/about/*.md` files at the
served path.

`s=256` is GitHub's server-side resize, so no image tooling enters the flake. The template renders
at 128 px, making 256 px exactly right for a 2x display. Fetching the avatars at their default size
would ship 261,745 bytes across the four; at `s=256` it is 105,650 bytes, and the largest single
file drops from 154,611 to 48,300 bytes. Extensions follow what GitHub actually serves for each
account, which is why two are PNG and two are JPEG.

Filenames are the kebab-case member name. This matches the kebab-case used elsewhere under
`static/images/` and the alt text `about.html` already derives from `extra.name`.

## What is left to the builder

Nothing of consequence. The files and values above are exact.

## Verification

`nix flake check`, which builds the site and runs the `frontmatter`, `test-site`, `site`,
`formatting` and `netlify-zola-version` checks. Beyond the checks, confirm against the built
`public/about/index.html` that all four `img` tags point at `/images/people/` and that the four
files exist in the build output, since a passing check does not by itself prove the images were
staged.
