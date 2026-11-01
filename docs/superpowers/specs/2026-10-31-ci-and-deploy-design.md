# CI and deploy rework

Date: 2026-10-31. Branch `ci-rework`, based on `main` after the dark-mode PR (#97) merged.

## Intent

Make the Nix flake the single definition of how the site is built, checked and deployed. Today
there are three: the flake (devShell and package), Netlify's own build (its Zola binary plus a
Python script with `requirements.txt`), and GitHub Actions (pip installs, a Zola tarball). They
drift, and the Zola 0.13 to 0.23 gap that surfaced during the dark-mode work was the result.

After this change:

- `nix flake check` is the whole test suite, locally and in CI.
- `nix build .#socal-nug-site` is the deployable site, byte for byte what production serves.
- GitHub Actions deploys that build to Netlify. Netlify hosts and does not build.
- The repo follows the conventions of the maintainer's `theonecfg` repository: no flake-utils or
  flake-compat, one directory per flake output, tools as derivations in an overlay, pinned and
  audited workflows, dependabot.

## Goals

- One build definition (the flake), one check command (`nix flake check`), one deploy path (CI).
- Production deploys on push to `main`; preview deploys for pull requests from this repository.
- Workflows that pass zizmor (regular persona) and pinact, with least-privilege permissions.
- Dependabot keeps GitHub Actions and flake inputs current.
- Local developer experience: `nix develop`, then `zola serve`, `nix flake check`, `nix build`.

## Non-goals

- Formatting Python, SCSS, HTML or templates. treefmt covers Nix, shell and Markdown only.
- Changing the site's content, templates or styles.
- Multi-system CI. Checks run on `x86_64-linux`; the flake stays multi-system.
- Replacing Netlify as the host.

## Anti-goals

- A preview mechanism that hands secrets to code from forks, or uses `pull_request_target`.
- A Netlify configuration that silently keeps building the site alongside CI.
- A `nix flake check` that passes while the deployed site would differ from the package.

## Constraints

- Netlify cannot run Nix, so it must stop building; the maintainer does this in the Netlify UI.
- Zola bakes `base_url` into permalinks, sitemaps and social tags, so previews must be built with
  their own URL.
- Zola 0.23 panics in the Nix sandbox without a CA bundle; the package sets `SSL_CERT_FILE`.
- The `nix` dependabot ecosystem supports version updates only, not security updates.
- The build-output tests write a temporary profile into `content/about/`; inside a derivation
  they must run against a writable copy of the source.

## Decisions

### Flake layout

`flake.nix` declares inputs `nixpkgs` (nixos-unstable) and `treefmt-nix`, and
`outputs = inputs: { checks; devShells; formatter; legacyPackages; overlays; packages; }`, each
`import ./<name> inputs`. `legacyPackages` instantiates nixpkgs per supported system with
`overlays.default` applied and `config = { allowAliases = false; allowUnfree = true; }`.
`packages` exposes the overlay's `socal-nug-*` attributes per system with `default` being the
site. flake-utils and flake-compat are removed along with `shell.nix` and `default.nix`.

### Overlay packages

`overlays/default.nix` composes one package per directory under `overlays/packages/`, each a
`package.nix` taking `callPackage` arguments, loaded with `packagesFromDirectoryRecursive`.

- `socal-nug-site`: `stdenv.mkDerivation`. Native build inputs: zola and `socal-nug-make-event-ical`.
  Argument `baseUrl` defaulting to `https://socal-nug.com`. Build phase runs
  `zola build --base-url $baseUrl --output-dir $out`, then the ical generator over
  `content/events/20*.md` into `$out/events/`. Sets `SSL_CERT_FILE` from `cacert`. This is the
  only build of the site anywhere.
- `socal-nug-make-event-ical`: `writers.writePython3Bin` with icalendar, pytz, click and toml,
  wrapping the current `make_event_ical.py`. Its source moves into the package directory.
- `socal-nug-verify-post`: `writePython3Bin` with jsonschema and click, wrapping `verify_post.py`.
  The JSON schemas move alongside it.
- `socal-nug-test-site`: the build-output tests (`scripts/test_site.py`) as a runnable tool with
  zola on its PATH, taking the site source directory as an argument so it can run on a copy.
- `socal-nug-logos`: `writeShellApplication` around the logo pipeline with potrace, ImageMagick and
  python3 as runtime inputs. The pipeline's artwork and compose script move into the package
  directory; it writes to `static/siblings/` relative to the repository it is run in.

The `scripts/` directory is removed once everything has moved. The `adding-events` skill and any
documentation that referenced `scripts/` paths are updated.

### Checks

`checks/default.nix` produces, per system:

- `site`: the `socal-nug-site` package. Building it is the check.
- `frontmatter`: `runCommand` running `socal-nug-verify-post` with each schema over the event and
  profile content.
- `test-site`: `runCommand` copying the source to a writable directory and running
  `socal-nug-test-site` against it.
- `formatting`: treefmt-nix's check with nixfmt, shellcheck and mdformat (with the GFM plugin),
  `projectRootFile = "flake.nix"`. mdformat is scoped to repository documentation only:
  `README.md`, `docs/**` and READMEs under `overlays/`. It must exclude `content/**` and
  `.claude/**`: the reviewer ran it over the tree and it corrupts TOML front matter
  (`[[extra.gallery]]` becomes `\[[extra.gallery]\]`), escapes the component calls in the
  anniversary post, and strips the YAML front matter from the `adding-events` skill. Site content
  is a non-goal of this change, so those files are never formatted.

`formatter` is the treefmt wrapper for the same configuration, so `nix fmt` fixes what the check
reports. The one-time reformat of the covered Nix, shell and Markdown files is its own commit.

### Workflows

All actions are pinned to commit SHAs with version comments. Every checkout uses
`persist-credentials: false`. Top-level `permissions` are `contents: read` or `{}`; jobs add only
what they need. Values from the event payload reach `run` steps through `env`, never through
`${{ }}` inside the script.

- `.github/actions/setup-nix/action.yml`: composite action, `cachix/install-nix-action` plus
  `nix-community/cache-nix-action` keyed on `flake.lock`, copied from theonecfg.
- `.github/workflows/ci.yml`, one workflow on `pull_request`, `push` to `main` and
  `workflow_dispatch`, with a per-PR concurrency group that cancels in progress for pull requests
  and never cancels a production deploy:
  - `nix-checks`: `nix flake check -L`.
  - `workflow-security`: `nix run .#zizmor -- .github/` and `nix run .#pinact -- run --check`.
  - `preview`: pull requests only, and only when
    `github.event.pull_request.head.repo.full_name == github.repository`. This includes
    Dependabot PRs: Dependabot-triggered runs receive Dependabot secrets rather than repository
    secrets, so the token is stored in both places (see the Netlify section). Builds the site
    with `baseUrl` set to `https://pr-<number>--socal-nug.netlify.app`, deploys it with
    `netlify deploy --no-build --alias pr-<number> --site socal-nug`, and maintains one sticky
    comment on the PR with the URL (job permission `pull-requests: write`). Needs the
    `NETLIFY_AUTH_TOKEN` secret.
  - `deploy`: `push` to `main` only, `needs: [nix-checks, workflow-security]`, so a red check
    never deploys. Builds `.#socal-nug-site` and runs
    `netlify deploy --no-build --prod --site socal-nug`. Same secret. A single workflow is used
    instead of a separate `deploy.yml` so the gating is expressed with `needs` rather than
    relying on branch protection.

  The site is addressed by name in the workflow file; the name is not sensitive. If the installed
  CLI only accepts the site ID, the ID goes in the workflow file as a plain value for the same
  reason, not in a repository variable, since variables are not guaranteed to reach
  Dependabot-triggered runs.

  The builder confirms the `--no-build` flag against the installed Netlify CLI; recent versions
  run a build step by default and the site is already built.

  Recommended but outside this repository: add `nix-checks` and `workflow-security` as required
  status checks in branch protection for `main`, which currently requires one review and no
  checks.
- `.github/workflows/zizmor.yml`: pedantic SARIF report uploaded to code scanning, on pushes to
  `main` and PRs touching `.github/**` or `flake.lock`, copied from theonecfg.
- `.github/dependabot.yml`: `github-actions` for `/` and `/.github/actions/*`, and `nix` for `/`,
  weekly, 7-day cooldown.
- `.github/workflows/main.yml` is deleted.

zizmor, pinact and the Netlify CLI come from nixpkgs through the overlay or the flake's packages
so `nix run .#<tool>` works in CI and locally.

### Netlify

`netlify.toml` and `requirements.txt` are deleted. The Netlify site is named `socal-nug`. The
maintainer, outside this repository:

1. Before the `preview` job can pass on this branch's PR: creates a Netlify personal access token
   and stores it as `NETLIFY_AUTH_TOKEN` twice, as a repository Actions secret and as a
   repository Dependabot secret, so both regular and Dependabot pull requests can deploy
   previews. Neither exists today.
2. At merge time: in the Netlify site's Build & deploy settings, stops builds.

Until step 2 is done, Netlify keeps building pushes with its old settings. On this branch's PR
that means Netlify's own deploy preview will fail or be wrong once `netlify.toml` is gone; that is
expected and the PR description says so.

### Developer workflow

`README.md` is rewritten around `nix develop`, `zola serve`, `nix flake check`, `nix fmt` and
`nix build`. `act` leaves the devShell; the devShell contains zola, the overlay tools, treefmt,
zizmor, pinact and the Netlify CLI.

### Commits

Separate commits, in roughly this order: flake re-architecture; tools moved into the overlay;
checks; formatter and the one-time reformat; workflows and dependabot; Netlify removal and README.
Each commit builds and passes `nix flake check`.

## Left to the builder

- Exact directory and attribute names within the conventions above.
- `writers.writePython3Bin` runs flake8 over the wrapped script; the existing scripts have long
  lines and trailing whitespace. Prefer cleaning the scripts over disabling the check.
- The `adding-events` skill under `.claude/skills/` references the validator and schema under
  `scripts/`; it is updated to the new tool and schema locations.
- How `socal-nug-test-site` receives the source path and how the check copies the tree.
- The sticky-comment mechanism (a marker string searched with `gh`, or an action if a pinned
  one is clearly better).
- Which systems `legacyPackages` enumerates.
- Cache sizing and purge settings in `setup-nix`.

## Verification

- `nix flake check` passes locally on the final branch.
- `nix build .#socal-nug-site` output matches a `zola build` plus ical run on the same source.
- zizmor regular persona and pinact pass locally on `.github/`.
- The PR for this branch exercises `nix-checks`, `workflow-security` and `preview` for real; the
  preview URL works and its links stay on the preview host.
- The `deploy` job is exercised by the merge to `main`; the maintainer confirms production
  updated.

Versions verified in the locked nixpkgs at the time of writing: zola 0.23.6, netlify-cli 23.15.0,
zizmor 1.31.1, pinact 5.0.0.
