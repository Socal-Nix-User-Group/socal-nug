# Southern California Nix User Group Site

The site is built with [Zola](https://www.getzola.org/). Everything here is defined by the Nix
flake: the development shell, the build, the checks, and the tools.

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
their JSON schemas, runs the build-output tests, and checks formatting. CI runs the same
command. To fix formatting (Nix, shell scripts and repository Markdown; site content is never
formatted):

```
nix fmt
```

## Build

```
nix build
```

`result/` is the deployable site, including the calendar feed and each event's `event.ics`.
The package accepts a `baseUrl` override, which the preview deploys use.

## Tools

Each lives under `overlays/topLevel/` and runs with `nix run`:

- `.#socal-nug-verify-post`: validate posts against a schema.
- `.#socal-nug-make-event-ical`: generate the calendar files from event posts.
- `.#socal-nug-test-site`: the build-output tests, given the site source directory.
- `.#socal-nug-logos`: regenerate the sibling group logos in `static/siblings/`.

## Deploys

GitHub Actions deploys the Nix-built site to Netlify, which only hosts it.

- Pull requests from this repository get a preview at `https://pr-<number>--socal-nug.netlify.app`.
  The job runs in the `preview` GitHub Environment and waits for a maintainer's approval in the
  Actions UI before it deploys.
- Merges to `main` deploy to production from the `production` Environment once the checks pass.
  The job can also be dispatched manually on `main` to redeploy.

Credentials are Netlify personal access tokens named `NETLIFY_AUTH_TOKEN`: one in the `preview`
Environment and, because Dependabot runs can only read Dependabot secrets, also as a Dependabot
secret; another in the `production` Environment. Record the expiry chosen when creating them.
If a token expires or is rotated, update the secret and re-run the failed workflow run, or
dispatch `ci.yml` on `main`.

The two Environments carry the protection rules the security model depends on, because a
pull request runs its own branch's workflow code with whatever secrets its jobs can reach:

- `preview` requires reviewers. Add them before storing its secret; a first workflow run creates
  the Environment with no rules, so configure the existing one rather than expecting to create
  it. The reviewer gate is the only thing separating the preview token from production unless
  that token comes from a Netlify account without production access.
- `production` limits deployment branches to `main`. Set that before storing its secret.
