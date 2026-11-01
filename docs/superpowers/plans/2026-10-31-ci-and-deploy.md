# CI and Deploy Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Nix flake the single definition of how the site is built, checked and deployed, with GitHub Actions deploying the Nix-built site to Netlify.

**Architecture:** The flake is restructured in theonecfg's shape (one directory per output, tools as overlay packages, `nix flake check` as the whole test suite). The site is a derivation parameterized by `baseUrl`; one `ci.yml` workflow runs the checks, deploys same-repo PR previews, and deploys `main` to production from a protected GitHub Environment with the Netlify CLI. Netlify stops building.

**Tech Stack:** Nix flakes (nixpkgs nixos-unstable, treefmt-nix), zola 0.23.6, `writers.writePython3Bin`, `writeShellApplication`, GitHub Actions, zizmor, pinact, dependabot, netlify-cli.

**Spec:** `docs/superpowers/specs/2026-10-31-ci-and-deploy-design.md`

## Global Constraints

- Flake inputs are exactly `nixpkgs` (`github:NixOS/nixpkgs/nixos-unstable`) and `treefmt-nix` (following `nixpkgs`). No flake-utils, no flake-compat.
- Flake outputs are exactly `checks`, `devShells`, `formatter`, `formatterModule`, `legacyPackages`, `overlays`, `packages`, each `import ./<name> inputs`.
- Supported systems: `x86_64-linux`, `aarch64-linux`, `x86_64-darwin`, `aarch64-darwin`.
- nixpkgs is instantiated with `config = { allowAliases = false; allowUnfree = true; }` and the repo overlay.
- Overlay packages live in `overlays/topLevel/<name>/package.nix` and are named `socal-nug-site`, `socal-nug-make-event-ical`, `socal-nug-verify-post`, `socal-nug-test-site`, `socal-nug-logos`.
- Nix flakes see only git-tracked files: run `git add` on every new file or directory before any `nix build`, `nix run`, `nix fmt` or `nix flake check`.
- Python scripts wrapped with `writePython3Bin` have no shebang line (the writer supplies the interpreter; a shebang on line 2 fails flake8 E265). Shell scripts wrapped with `writeShellApplication` keep `#!/usr/bin/env bash` so shellcheck can lint them standalone.
- Every derivation or wrapper that runs zola sets `SSL_CERT_FILE = "${cacert}/etc/ssl/certs/ca-bundle.crt"`.
- Production base URL `https://socal-nug.com`; preview URL `https://pr-<number>--socal-nug.netlify.app`; Netlify site name `socal-nug`.
- Netlify deploys pass `--dir` as the store path from `nix build --no-link --print-out-paths`, never the `result` symlink.
- Every workflow action is pinned to a commit SHA with a `# vX.Y.Z` comment; every checkout sets `persist-credentials: false`; event payload values reach `run` only through `env`; `run` scripts containing `: ` use `|` block scalars.
- Secrets: `NETLIFY_AUTH_TOKEN` in the GitHub Environment `preview` (required reviewers) and as a repository Dependabot secret, for the preview job; `NETLIFY_AUTH_TOKEN` in the GitHub Environment `production` (branch policy `main`) for the deploy job. No repository-level Actions secrets, no repository variables.
- mdformat covers only `README.md`, `docs/**/*.md` and `overlays/**/*.md` via `programs.mdformat.includes`; `content/**` and `.claude/**` are excluded from all formatters via `settings.excludes`.
- Commit messages: plain engineer voice, no bold lead-ins, no em dashes, ending with `Assisted-by: Claude Code (<model>)`.
- Every commit leaves `nix flake check` passing for the checks that exist at that point.

## Review Focus

- A pull request from a fork must skip the preview job rather than fail on the missing secret. Task 7 pins the `if` condition; it is a read-through, since no local tool evaluates `if` semantics and Task 9 exercises only a same-repo PR.
- The production deploy must never run for pull requests or pushes to other branches, never while a check is red, and never with a credential reachable from PR jobs. Task 7 pins `if`, `needs` and `environment: production`; Task 9 confirms the PR run shows `deploy` skipped.
- The Nix-built site must contain what Netlify used to produce, including every `event.ics` and `calendar.ics`. Task 2 adds an install check for `calendar.ics` to the package and diffs the output against a devShell `zola build` plus ical run.
- A preview built with an overridden `baseUrl` must not link back to production. Task 1 asserts the sitemap of an override build contains only the override URL.
- `nix fmt` must never touch site content or the skill. Task 6 asserts `content/`, `.claude/`, `static/`, `templates/` and `sass/` are untouched after a full format, and that a stray `.md` outside the documentation set is not formatted.

______________________________________________________________________

## File Structure

Created:

- `flake.nix` (rewritten), `checks/default.nix`, `devShells/default.nix`, `formatter/default.nix`, `formatterModule/default.nix`, `legacyPackages/default.nix`, `overlays/default.nix`, `packages/default.nix`.
- `overlays/topLevel/socal-nug-site/package.nix`.
- `overlays/topLevel/socal-nug-make-event-ical/{package.nix,make_event_ical.py}`.
- `overlays/topLevel/socal-nug-verify-post/{package.nix,verify_post.py,schemas/event.json,schemas/profiles.json}`.
- `overlays/topLevel/socal-nug-test-site/{package.nix,test_site.py}`.
- `overlays/topLevel/socal-nug-logos/{package.nix,build.sh,compose.py,README.md,artwork/gateway-cities.png}`.
- `.github/actions/setup-nix/action.yml`, `.github/workflows/ci.yml`, `.github/workflows/zizmor.yml`, `.github/dependabot.yml`.

Deleted: `shell.nix`, `default.nix`, `scripts/` (everything moves), `.github/workflows/main.yml`, `netlify.toml`, `requirements.txt`.

Modified: `.claude/skills/adding-events/SKILL.md` (tool paths), `README.md` (rewritten), `flake.lock` (inputs change).

______________________________________________________________________

### Task 1: Flake re-architecture and the site package

**Files:**

- Modify: `flake.nix`
- Create: `legacyPackages/default.nix`, `overlays/default.nix`, `packages/default.nix`, `devShells/default.nix`, `overlays/topLevel/socal-nug-site/package.nix`, placeholders `checks/default.nix`, `formatter/default.nix`, `formatterModule/default.nix`
- Delete: `shell.nix`, `default.nix`

**Interfaces:**

- Produces: `inputs.self.legacyPackages.<system>` (nixpkgs with the overlay); overlay attribute `socal-nug-site` with argument `baseUrl ? "https://socal-nug.com"` and `passthru.baseUrl`; `packages.<system>.{default,socal-nug-site}`; `devShells.<system>.default`.

- [ ] **Step 1: Write `flake.nix`**

```nix
{
  description = "Southern California Nix User Group Site";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    treefmt-nix.url = "github:numtide/treefmt-nix";
    treefmt-nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = inputs: {
    checks = import ./checks inputs;
    devShells = import ./devShells inputs;
    formatter = import ./formatter inputs;
    formatterModule = import ./formatterModule inputs;
    legacyPackages = import ./legacyPackages inputs;
    overlays = import ./overlays inputs;
    packages = import ./packages inputs;
  };
}
```

Create `checks/default.nix`, `formatter/default.nix` and `formatterModule/default.nix` as `inputs: { }` so the flake evaluates; Tasks 3 and 6 replace them.

- [ ] **Step 2: Write `legacyPackages/default.nix`**

`inputs: inputs.nixpkgs.lib.genAttrs <the four systems> (system: import inputs.nixpkgs { inherit system; overlays = [ inputs.self.overlays.default ]; config = { allowAliases = false; allowUnfree = true; }; })`.

- [ ] **Step 3: Write `overlays/default.nix`**

```nix
inputs:
let
  topLevel =
    final: _prev:
    inputs.nixpkgs.lib.filesystem.packagesFromDirectoryRecursive {
      inherit (final) callPackage;
      directory = ./topLevel;
    };
in
{
  inherit topLevel;
  default = topLevel;
}
```

- [ ] **Step 4: Write `packages/default.nix` and `devShells/default.nix`**

`packages`: `mapAttrs` over `inputs.self.legacyPackages` producing `{ default = pkgs.socal-nug-site; inherit (pkgs) socal-nug-site; }`. Later tasks extend the `inherit` list; the final list is `socal-nug-site socal-nug-make-event-ical socal-nug-verify-post socal-nug-test-site socal-nug-logos netlify-cli zizmor pinact`.

`devShells`: `mapAttrs` over `inputs.self.legacyPackages` producing `{ default = pkgs.mkShellNoCC { packages = [ pkgs.zola ]; }; }`. Later tasks add the tools, the formatter, `zizmor`, `pinact` and `netlify-cli`. `act` and `alejandra` are not carried over.

- [ ] **Step 5: Write `overlays/topLevel/socal-nug-site/package.nix`**

```nix
{ lib, stdenvNoCC, zola, cacert, baseUrl ? "https://socal-nug.com" }:
stdenvNoCC.mkDerivation {
  pname = "socal-nug-site";
  version = "0-unstable";
  src = lib.fileset.toSource {
    root = ../../..;
    fileset = lib.fileset.unions [ ../../../config.toml ../../../content ../../../sass ../../../static ../../../templates ];
  };
  nativeBuildInputs = [ zola ];
  SSL_CERT_FILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";
  # buildPhase: zola build --base-url (lib.escapeShellArg baseUrl) --output-dir $out ; dontInstall = true
  passthru = { inherit baseUrl; };
}
```

`$out` is the site root itself. The `fileset` keeps CI and docs changes from rebuilding the site.

- [ ] **Step 6: Delete `shell.nix` and `default.nix`, stage everything, update `flake.lock`**

Run: `git rm shell.nix default.nix && git add -A && nix flake lock`
Expected: `flake.lock` lists `nixpkgs` and `treefmt-nix` (plus their own inputs); no `flake-utils`, no `flake-compat`.

- [ ] **Step 7: Verify the package and the override**

Run: `nix build .#socal-nug-site && test -f result/index.html && grep -c 'https://socal-nug.com/' result/sitemap.xml`
Expected: a count greater than 0.

Run: `nix build --impure --expr '(builtins.getFlake (toString ./.)).legacyPackages.${builtins.currentSystem}.socal-nug-site.override { baseUrl = "https://pr-1--socal-nug.netlify.app"; }' -o result-preview && grep -c 'https://pr-1--socal-nug.netlify.app/' result-preview/sitemap.xml && ! grep -q 'socal-nug.com/' result-preview/sitemap.xml`
Expected: a count greater than 0 and the negative grep succeeds.

Run: `nix develop --command zola --version && nix flake show`
Expected: `zola 0.23.6`; outputs listed for all four systems.

- [ ] **Step 8: Commit**

`flake: restructure without flake-utils and flake-compat` covering `flake.nix`, `flake.lock`, the new directories and the two deletions. Do not commit `result*` symlinks.

______________________________________________________________________

### Task 2: The ical tool, folded into the site package

**Files:**

- Create: `overlays/topLevel/socal-nug-make-event-ical/package.nix`, `overlays/topLevel/socal-nug-make-event-ical/make_event_ical.py` (moved from `scripts/make_event_ical.py`)
- Modify: `overlays/topLevel/socal-nug-site/package.nix`, `packages/default.nix`, `devShells/default.nix`

**Interfaces:**

- Produces: overlay attribute `socal-nug-make-event-ical`, a CLI with the existing interface `socal-nug-make-event-ical --output <dir> <posts...>`.

- [ ] **Step 1: Move the script and make it flake8-clean**

`git mv scripts/make_event_ical.py overlays/topLevel/socal-nug-make-event-ical/make_event_ical.py`. Delete the shebang line. Replace `import toml` with the standard library `tomllib` (open the file in binary mode for `tomllib.load`); the reviewer confirmed both parse all 25 posts identically. Fix every remaining flake8 finding (long lines, trailing whitespace) rather than ignoring them.

- [ ] **Step 2: Write `package.nix`**

```nix
{ writers, python3Packages }:
writers.writePython3Bin "socal-nug-make-event-ical" {
  libraries = with python3Packages; [ click icalendar pytz ];
} (builtins.readFile ./make_event_ical.py)
```

- [ ] **Step 3: Stage, then verify the tool builds and runs**

Run: `git add overlays/topLevel/socal-nug-make-event-ical && nix run .#socal-nug-make-event-ical -- --help`
Expected: click's usage text; the build (which runs flake8) succeeds.

- [ ] **Step 4: Fold it into the site package with an install check**

Add `socal-nug-make-event-ical` to the package's arguments and `nativeBuildInputs`; after `zola build` run `socal-nug-make-event-ical --output $out/events/ content/events/20*.md`. Add `doInstallCheck = true;` and an `installCheckPhase` that runs `test -f $out/events/calendar.ics`.

- [ ] **Step 5: Verify the output matches a devShell build**

Run: `nix build .#socal-nug-site && ls result/events/*/event.ics | wc -l`
Expected: the count equals the number of `content/events/20*.md` files (the install check already proved `calendar.ics`).

Run, from the devShell: `rm -rf /tmp/manual && zola build --output-dir /tmp/manual && socal-nug-make-event-ical --output /tmp/manual/events/ content/events/20*.md && diff -rq /tmp/manual result`
Expected: no differences.

- [ ] **Step 6: Expose the tool in `packages` and `devShells`, commit**

`tools: package the ical generator and build it into the site`.

______________________________________________________________________

### Task 3: The frontmatter validator and the `frontmatter` check

**Files:**

- Create: `overlays/topLevel/socal-nug-verify-post/package.nix`, `.../verify_post.py` (moved), `.../schemas/event.json`, `.../schemas/profiles.json` (moved from `scripts/schemas/`)
- Create: `checks/default.nix` (replacing the placeholder)
- Modify: `packages/default.nix`, `devShells/default.nix`, `.claude/skills/adding-events/SKILL.md:91-93`

**Interfaces:**

- Produces: overlay attribute `socal-nug-verify-post` with CLI `socal-nug-verify-post --schema <file> <posts...>` (exit 1 on any invalid post) and `passthru.schemas` pointing at the schemas directory; `checks.<system>.frontmatter`.

- [ ] **Step 1: Move the script and schemas, make the script flake8-clean**

`git mv` the three files. Delete the shebang line. Fix flake8 findings.

- [ ] **Step 2: Write `package.nix`**

`writers.writePython3Bin "socal-nug-verify-post" { libraries = with python3Packages; [ click jsonschema ]; } (builtins.readFile ./verify_post.py)` then `.overrideAttrs (_: { passthru.schemas = ./schemas; })`.

- [ ] **Step 3: Stage, then verify the tool, including the failure path**

Run: `git add overlays/topLevel/socal-nug-verify-post && nix run .#socal-nug-verify-post -- --schema overlays/topLevel/socal-nug-verify-post/schemas/event.json content/events/20*.md; echo "exit $?"`
Expected: every file `[OK]`, `exit 0`.

Run: `printf '+++\ntitle = "x"\n+++\n' > /tmp/bad.md && nix run .#socal-nug-verify-post -- --schema overlays/topLevel/socal-nug-verify-post/schemas/event.json /tmp/bad.md; echo "exit $?"`
Expected: `[ERROR]` line and `exit 1`.

- [ ] **Step 4: Write `checks/default.nix` with `frontmatter`**

`mapAttrs` over `inputs.self.legacyPackages`. `frontmatter = pkgs.runCommand "socal-nug-frontmatter" { nativeBuildInputs = [ pkgs.socal-nug-verify-post ]; } ''...''` which `cd`s into `${inputs.self}`, runs the tool with `${pkgs.socal-nug-verify-post.schemas}/event.json` over `content/events/20*.md` and with `profiles.json` over `content/about/*.md`, then `touch $out`.

- [ ] **Step 5: Verify the check**

Run: `git add checks && nix build .#checks.x86_64-linux.frontmatter && nix flake check -L`
Expected: both succeed.

- [ ] **Step 6: Update the skill**

In `.claude/skills/adding-events/SKILL.md` lines 91-93 the three commands become:

```
nix develop -c socal-nug-verify-post --schema overlays/topLevel/socal-nug-verify-post/schemas/event.json content/events/20*.md
nix develop -c zola build
nix develop -c socal-nug-make-event-ical --output public/events/ content/events/20*.md
```

- [ ] **Step 7: Expose the tool in `packages` and `devShells`, commit**

`tools: package the frontmatter validator as a flake check`.

______________________________________________________________________

### Task 4: The build-output tests as a tool and the `test-site` and `site` checks

**Files:**

- Create: `overlays/topLevel/socal-nug-test-site/package.nix`, `.../test_site.py` (moved from `scripts/test_site.py`)
- Modify: `checks/default.nix`, `packages/default.nix`, `devShells/default.nix`

**Interfaces:**

- Produces: overlay attribute `socal-nug-test-site` with CLI `socal-nug-test-site <site source dir>`; `checks.<system>.test-site`; `checks.<system>.site`.

- [ ] **Step 1: Move the script and take the source directory as an argument**

`git mv scripts/test_site.py overlays/topLevel/socal-nug-test-site/test_site.py`. Replace `ROOT = pathlib.Path(__file__).resolve().parents[1]` with `ROOT = pathlib.Path(sys.argv[1]).resolve()` and strip that argument before handing the rest to `unittest.main`. Update the module docstring: `socal-nug-test-site .` from the repository root. (This script is run through `python3`, not `writePython3Bin`, so its shebang may stay.)

- [ ] **Step 2: Write `package.nix`**

```nix
{ writeShellApplication, python3, zola, cacert }:
writeShellApplication {
  name = "socal-nug-test-site";
  runtimeInputs = [ python3 zola ];
  runtimeEnv.SSL_CERT_FILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";
  text = ''exec python3 ${./test_site.py} "$@"'';
}
```

- [ ] **Step 3: Stage, then verify the tool from the repository root**

Run: `git add overlays/topLevel/socal-nug-test-site && nix run .#socal-nug-test-site -- . 2>&1 | tail -3 && git status --short content/about`
Expected: `OK` with 16 tests; `content/about` clean (the probe profile was removed).

- [ ] **Step 4: Add the checks**

In `checks/default.nix`: `site = pkgs.socal-nug-site;` and `test-site = pkgs.runCommand "socal-nug-test-site-check" { nativeBuildInputs = [ pkgs.socal-nug-test-site ]; } ''...''` which copies `${inputs.self}` to `./src`, `chmod -R u+w src`, runs `socal-nug-test-site ./src`, then `touch $out`.

- [ ] **Step 5: Verify**

Run: `nix build .#checks.x86_64-linux.test-site && nix flake check -L`
Expected: both succeed. Passing inside the sandbox proves the probe writes to the copy, not the flake source, and that the wrapper's `SSL_CERT_FILE` reaches zola.

- [ ] **Step 6: Expose the tool in `packages` and `devShells`, commit**

`checks: run the build-output tests and the site build under nix flake check`.

______________________________________________________________________

### Task 5: The logo pipeline as a tool

**Files:**

- Create: `overlays/topLevel/socal-nug-logos/package.nix`; move `scripts/logos/{build.sh,compose.py,README.md,artwork/gateway-cities.png}` into that directory
- Modify: `packages/default.nix`, `devShells/default.nix`
- Delete: `scripts/` (now empty)

**Interfaces:**

- Produces: overlay attribute `socal-nug-logos`, run from the repository root; writes `static/siblings/gateway-cities.svg` and `north-county.svg`.

- [ ] **Step 1: Move the files and make the scripts path-independent**

`compose.py` takes two arguments, `<work dir> <output dir>`, instead of deriving the output directory from `__file__`. `build.sh` keeps `#!/usr/bin/env bash` and `set -euo pipefail`, drops its `here` logic, starts with `: "${artwork:?}" "${compose:?}"` (asserts the environment and satisfies shellcheck SC2154), refuses to run unless `./config.toml` exists (so it only runs from the repository root), and passes `"$PWD/static/siblings"` as the output directory.

- [ ] **Step 2: Write `package.nix`**

```nix
{ writeShellApplication, imagemagick, potrace, python3 }:
writeShellApplication {
  name = "socal-nug-logos";
  runtimeInputs = [ imagemagick potrace python3 ];
  # string interpolation copies the files into the store; a bare path would stringify to the repo path
  runtimeEnv = { artwork = "${./artwork/gateway-cities.png}"; compose = "${./compose.py}"; };
  text = builtins.readFile ./build.sh;
}
```

Update the README in the package directory: run as `nix run .#socal-nug-logos` from the repository root.

- [ ] **Step 3: Stage, then verify it reproduces the committed logos**

Run: `git add overlays/topLevel/socal-nug-logos && nix run .#socal-nug-logos && git status --short static/siblings`
Expected: the tool prints both output paths and `git status` prints nothing (byte-identical SVGs).

- [ ] **Step 4: Remove `scripts/`, expose the tool, commit**

Run: `git rm -r scripts && grep -rn "scripts/" --exclude-dir=.git --exclude-dir=docs . ; echo "(no references expected)"`

Commit `tools: package the logo pipeline and retire scripts/`.

______________________________________________________________________

### Task 6: Formatting

**Files:**

- Create: `formatterModule/default.nix`, `formatter/default.nix` (replacing placeholders)
- Modify: `checks/default.nix`, `devShells/default.nix`

**Interfaces:**

- Produces: `formatterModule.<system>` (treefmt-nix evaluated module), `formatter.<system>` (its wrapper), `checks.<system>.formatting`.

- [ ] **Step 1: Write `formatterModule/default.nix`**

`mapAttrs` over `inputs.self.legacyPackages`, each `inputs.treefmt-nix.lib.evalModule pkgs { config = { ... }; }` with:

- `projectRootFile = "flake.nix"`, `enableDefaultExcludes = true`

- `programs.nixfmt.enable = true`, `programs.shellcheck.enable = true`

- `programs.mdformat = { enable = true; plugins = ps: [ ps.mdformat-gfm ]; includes = [ "README.md" "docs/**/*.md" "overlays/**/*.md" ]; }` (the program-level `includes` replaces the default `*.md`; the `settings.formatter.mdformat.includes` list would merge with it)

- `settings.excludes = [ "content/**" ".claude/**" ]` (`settings.global.excludes` is a renamed, deprecated alias)

- [ ] **Step 2: Write `formatter/default.nix` and the check**

`formatter`: `mapAttrs (const (module: module.config.build.wrapper)) inputs.self.formatterModule`.
`checks.formatting = inputs.self.formatterModule.${system}.config.build.check inputs.self`.
Add `inputs.self.formatter.${system}` to the devShell packages.

- [ ] **Step 3: Stage, confirm the check fails on the unformatted tree, then format**

Run: `git add formatter formatterModule checks && nix build .#checks.x86_64-linux.formatting; echo "exit $?"`
Expected: `exit 1` with nixfmt or shellcheck findings listed.

Run: `touch static/stray.md && printf '#  stray\n' > static/stray.md && nix fmt && git status --short content .claude static templates sass; echo "(only static/stray.md as untracked expected)" && cat static/stray.md && rm static/stray.md`
Expected: nothing changed under `content/`, `.claude/`, `templates/` or `sass/`; `static/stray.md` still reads `#  stray` (mdformat did not touch a Markdown file outside the documentation set); `git status --short` otherwise shows only `.nix`, `.sh` and covered `.md` files.

Run: `nix build .#checks.x86_64-linux.formatting`
Expected: passes (a git flake's source includes uncommitted changes to tracked files).

- [ ] **Step 4: Commit in two parts, reformat first**

First `fmt: reformat nix, shell and markdown files` containing only the reformatted files (the formatter and check files stay staged but uncommitted). Then `fmt: add treefmt with nixfmt, shellcheck and mdformat` with `formatter/`, `formatterModule/`, `checks/` and `devShells/`. Both commits pass the checks that exist at each point.

Run after: `nix flake check -L`
Expected: `site`, `frontmatter`, `test-site`, `formatting` all pass.

______________________________________________________________________

### Task 7: Workflows, dependabot and the CI tools

**Files:**

- Create: `.github/actions/setup-nix/action.yml`, `.github/workflows/ci.yml`, `.github/workflows/zizmor.yml`, `.github/dependabot.yml`
- Delete: `.github/workflows/main.yml`
- Modify: `packages/default.nix`, `devShells/default.nix` (add `netlify-cli`, `zizmor`, `pinact` from `pkgs`)

**Interfaces:**

- Consumes: `packages.<system>.socal-nug-site` (Task 1), `.override { baseUrl = ...; }` (Task 1).

- Produces: `nix run .#zizmor`, `nix run .#pinact`, `nix run .#netlify-cli`.

- [ ] **Step 1: Copy the composite action**

`.github/actions/setup-nix/action.yml` verbatim from `/home/djacu/dev/djacu/theonecfg/.github/actions/setup-nix/action.yml` (install-nix-action `75c75c31ebece974e48ebc36b4ad125bd97bd97b # v31.11.3`, cache-nix-action `7df957e333c1e5da7721f60227dbba6d06080569 # v7.0.2`, cache keyed on `hashFiles('flake.lock')`). Referenced from jobs as `$/.github/actions/setup-nix`, as theonecfg does.

- [ ] **Step 2: Write `ci.yml`**

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
concurrency:
  group: ci-${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
permissions:
  contents: read
```

Jobs, each starting with `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` with `persist-credentials: false` then `$/.github/actions/setup-nix`. Every `run` with a URL or a `--body` is a `|` block scalar.

- `nix-checks`: `nix flake check -L`.

- `workflow-security`: `nix run .#zizmor -- .github/` with `env: GH_TOKEN: ${{ github.token }}`, then `nix run .#pinact -- run --check` with `env: GITHUB_TOKEN: ${{ github.token }}`.

- `preview`: `if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository`; `environment: { name: preview, url: "https://pr-${{ github.event.pull_request.number }}--socal-nug.netlify.app" }` (an expression in `environment.url` is not a script context, so zizmor's injection rule does not apply); job `permissions: { contents: read, pull-requests: write }`; job `env: PR_NUMBER: ${{ github.event.pull_request.number }}`. Steps:

  1. build, capturing the store path into `$GITHUB_OUTPUT` as `path`:
     `out=$(nix build --no-link --print-out-paths --impure --expr "(builtins.getFlake (toString ./.)).legacyPackages.\${builtins.currentSystem}.socal-nug-site.override { baseUrl = \"https://pr-$PR_NUMBER--socal-nug.netlify.app\"; }")` then `echo "path=$out" >> "$GITHUB_OUTPUT"`.
  1. deploy, with `env: NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}` and `SITE_DIR: ${{ steps.build.outputs.path }}`: `nix run .#netlify-cli -- deploy --no-build --dir "$SITE_DIR" --alias "pr-$PR_NUMBER" --site socal-nug`.
  1. comment, with `env: GH_TOKEN: ${{ github.token }}`: `gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --edit-last --create-if-none --body "Preview: https://pr-$PR_NUMBER--socal-nug.netlify.app"` (`--create-if-none` needs gh 2.65 or newer; ubuntu-latest ships 2.103).

- `deploy`: `if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')`; `needs: [nix-checks, workflow-security]`; `environment: production`; job `concurrency: { group: deploy-production, cancel-in-progress: false }`. Steps: `out=$(nix build --no-link --print-out-paths .#socal-nug-site)` into `$GITHUB_OUTPUT`, then with the Environment's secret `nix run .#netlify-cli -- deploy --no-build --prod --dir "$SITE_DIR" --site socal-nug`.

- [ ] **Step 3: Write `zizmor.yml` and `dependabot.yml`**

`zizmor.yml` from theonecfg with one change: triggers only on `push` to `main` with paths `.github/**` and `flake.lock` (no `pull_request`, since a fork PR's read-only token cannot upload SARIF). `permissions: {}` at the top; job permissions `contents: read`, `security-events: write`; `nix run .#zizmor -- --format sarif --pedantic . > results.sarif`; `github/codeql-action/upload-sarif@9b3254085494b55a0f7c4c2b3d2d52cc712ce370 # v4.39.1`.

`dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directories: ["/", "/.github/actions/*"]
    schedule: { interval: weekly }
    cooldown: { default-days: 7 }
  - package-ecosystem: nix
    directory: "/"
    schedule: { interval: weekly }
    cooldown: { default-days: 7 }
```

- [ ] **Step 4: Expose the CI tools, delete the old workflow, stage**

Add `inherit (pkgs) netlify-cli zizmor pinact;` to `packages` and the same three to the devShell. `git rm .github/workflows/main.yml && git add -A`.

- [ ] **Step 5: Verify locally**

Run: `GH_TOKEN=$(gh auth token) nix run .#zizmor -- .github/`
Expected: the output includes a `completed` line for `ci.yml` and for `zizmor.yml` (a file that fails to parse is skipped silently and still yields "No findings"), then `No findings to report`.

Run: `GITHUB_TOKEN=$(gh auth token) nix run .#pinact -- run --check`
Expected: exit 0 (every `uses:` pinned with a version comment; `$/` references are ignored).

Run: `nix run nixpkgs#actionlint -- -ignore 'specifying action "\$/[^"]*" in invalid format' .github/workflows/ci.yml .github/workflows/zizmor.yml`
Expected: no findings. actionlint does not know the `$/` self-repository reference, which GitHub documents and theonecfg's green CI uses, so that one diagnostic is ignored deliberately.

Run: `nix run nixpkgs#yq -- . .github/workflows/ci.yml > /dev/null`
Expected: parses (guards against the `: ` plain-scalar mistake).

- [ ] **Step 6: Commit**

`ci: nix-based workflows with previews, production deploys, zizmor, pinact and dependabot`.

______________________________________________________________________

### Task 8: Netlify becomes hosting only; README

**Files:**

- Delete: `netlify.toml`, `requirements.txt`

- Modify: `README.md`

- [ ] **Step 1: Delete the two files and search for stragglers**

Run: `git rm netlify.toml requirements.txt && grep -rn -E "netlify.toml|requirements.txt|ZOLA_VERSION|nix-shell|shell.nix|flake-utils|flake-compat|scripts/" --exclude-dir=.git --exclude-dir=docs . ; echo "(only the spec/plan may mention these)"`
Expected: no matches outside `docs/`.

- [ ] **Step 2: Rewrite `README.md`**

Sections, in order: title; Quickstart (`nix develop`, then `zola serve`); Checks (`nix flake check` runs the site build, frontmatter validation, build-output tests and formatting; `nix fmt` fixes formatting); Build (`nix build` produces the deployable site in `result/`; `.#socal-nug-site` accepts a `baseUrl` override); Tools (`nix run .#socal-nug-verify-post`, `.#socal-nug-make-event-ical`, `.#socal-nug-test-site`, `.#socal-nug-logos`, one line each); Deploys (pull requests from this repository get a preview at `https://pr-<number>--socal-nug.netlify.app`; a maintainer approves each preview deploy in the Actions UI; merges to `main` deploy to production from the `production` Environment; Netlify only hosts; the two `NETLIFY_AUTH_TOKEN` credentials and where each lives, their expiry choice, and recovery by updating the secret and re-running or dispatching `ci.yml` on `main`). Keep it under 70 lines.

- [ ] **Step 3: Verify the whole branch**

Run: `nix flake check -L && nix build .#socal-nug-site && GH_TOKEN=$(gh auth token) nix run .#zizmor -- .github/ && GITHUB_TOKEN=$(gh auth token) nix run .#pinact -- run --check`
Expected: all pass.

- [ ] **Step 4: Commit**

`netlify: stop building on Netlify; document the nix workflow`.

______________________________________________________________________

### Task 9: Push, pull request and live verification

**Files:** none.

- [ ] **Step 1: Maintainer prerequisites (outside the repo, before the PR)**

1. Create the GitHub Environment `preview`, add the maintainers as required reviewers, and store the preview Netlify credential in it as `NETLIFY_AUTH_TOKEN`. Store the same credential as the repository Dependabot secret `NETLIFY_AUTH_TOKEN` (Dependabot runs cannot read Environment secrets).
1. Create the GitHub Environment `production`, set its deployment branches to `main` only, and store the production credential in it as `NETLIFY_AUTH_TOKEN`.

- [ ] **Step 2: Push and open the PR**

Run: `git push -u origin HEAD:ci-rework` then `gh pr create --base main --head ci-rework --title "Build, check and deploy the site from the Nix flake" --body-file <body>`.

The body states: what moved into the flake; that `nix flake check` is the test suite; the preview and deploy mechanics and the two credentials; that Netlify's own deploy preview for this PR will fail or be wrong because `netlify.toml` is gone, which is expected; the pre-merge step (stop builds in Netlify's Build & deploy settings once the preview job has deployed); the recommendation to add `nix-checks` and `workflow-security` as required status checks; and a single final line `Assisted-by: Claude Code (<model>)`. No bold lead-ins, no em dashes.

- [ ] **Step 3: Verify the live run**

The `preview` job waits for Environment approval; approve it in the run's Actions page, then:

Run: `gh pr checks <number> --watch`
Expected: `nix-checks`, `workflow-security` and `preview` pass; `deploy` is skipped; the PR shows a `preview` deployment with the URL.

Run: `curl -sL https://pr-<number>--socal-nug.netlify.app/sitemap.xml | grep -c 'pr-<number>--socal-nug.netlify.app'` and `curl -sL .../ | grep -o 'bulma@[0-9.]*'`
Expected: a positive count and `bulma@1.0.4`; the sticky comment with the preview URL exists exactly once on the PR, and a second push updates it rather than adding another.

- [ ] **Step 4: Before and after merge (maintainer)**

Before merging: stop builds in Netlify. After merging: confirm the `deploy` job ran on the merge commit, that Netlify's deploy log shows a CLI deploy, and that `https://socal-nug.com` serves the new build (`curl -sL https://socal-nug.com/ | grep -o 'bulma@[0-9.]*'`).
