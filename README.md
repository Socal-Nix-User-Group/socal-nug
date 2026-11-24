# Southern California Nix User Group Site

The site is built with [Zola](https://www.getzola.org/). The Nix flake defines the development
shell, the build, the checks, and the tools. Netlify builds and hosts the deployed site from
`netlify.toml`.

## Quickstart

```
nix develop
zola serve
```

## Checks

```
nix flake check
```

This builds the site, validates the front matter of event posts and member profiles against
their JSON schemas, runs the build-output tests, checks that `netlify.toml` pins the same Zola
version as the flake, and checks formatting. It also runs the Origins page's unit tests and lays
the Origins picture out through the real layout engine, on the site's own data and on made-up
histories, and measures it: threads, ovals, faces and labels must not overlap, and the moments on
the ribbon must line up in one column. CI runs the same command. To fix formatting (Nix,
shell scripts and repository Markdown; site content is never formatted):

```
nix fmt
```

## Build

```
nix build
```

`result/` is the site as Netlify should build it, including the calendar feed and each event's
`event.ics`. The package accepts a `baseUrl` override.

## Tools

Each lives under `overlays/topLevel/` and runs with `nix run`:

- `.#socal-nug-verify-post`: validate posts against a schema.
- `.#socal-nug-make-event-ical`: generate the calendar files from event posts.
- `.#socal-nug-test-site`: the build-output tests, given the site source directory.
- `.#socal-nug-logos`: regenerate the sibling group logos in `static/siblings/`.
- `.#socal-nug-braid-browser`: load the Origins page in headless Chromium and check how it
  behaves when scrolled, clicked, tabbed through and tapped. Linux only, needs the network, and
  is not part of `nix flake check`. Run it after changing the page's script (anything under
  `overlays/topLevel/socal-nug-braid-js/src/`), its stylesheet `sass/css/pages/origins.scss` or
  its template `templates/origins.html`.

## Deploys

Netlify builds and deploys the site itself, configured by `netlify.toml`: pushes to `main` go to
production at https://socal-nug.com, and every pull request gets a deploy preview linked from
the pull request's checks. GitHub Actions only runs the checks, so the repository holds no
deploy credentials.

Netlify builds with its own Zola and Python rather than with the flake. `netlify.toml` pins
`ZOLA_VERSION`, and `nix flake check` fails if that pin differs from the flake's zola, so a
nixpkgs update that changes zola also updates the pin. The calendar script's Python
dependencies come from `requirements.txt`, pinned to the versions in the flake's nixpkgs.
