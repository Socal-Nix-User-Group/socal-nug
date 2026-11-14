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
version as the flake, and checks formatting. CI runs the same command. To fix formatting (Nix,
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

## Deploys

Netlify builds and deploys the site itself, configured by `netlify.toml`: pushes to `main` go to
production at https://socal-nug.com, and every pull request gets a deploy preview linked from
the pull request's checks. GitHub Actions only runs the checks, so the repository holds no
deploy credentials.

Netlify builds with its own Zola and Python rather than with the flake. `netlify.toml` pins
`ZOLA_VERSION`, and `nix flake check` fails if that pin differs from the flake's zola, so a
nixpkgs update that changes zola also updates the pin. The calendar script's Python
dependencies come from `requirements.txt`, pinned to the versions in the flake's nixpkgs.
