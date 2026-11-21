# Vendor member profile images — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the four member photos on the about page from this repository instead of hotlinking them from GitHub and SCALE.

**Architecture:** Four avatar files land in `static/images/people/`, which Zola copies verbatim into the build output, and the four `extra.image_url` values in `content/about/*.md` are repointed at `/images/people/<file>`. No template, build, schema or check changes.

**Tech Stack:** Zola 0.23.6, Nix flake (`nix flake check`, `nix build`), `curl` for fetching the avatars.

**Spec:** `docs/superpowers/specs/2026-11-21-vendor-profile-images-design.md`

## Global Constraints

- A flake's `self` is the **git-tracked** tree. The four new image files must be `git add`ed before `nix flake check` or `nix build` is run, or the build ships an about page referencing files it did not copy.
- Avatars are fetched at `?v=4&s=256`. No image tooling is added to the flake; GitHub does the resize.
- The file extension must match the bytes GitHub actually serves for that account, which differs per account. Two are PNG, two are JPEG.
- `extra.image_url` is not renamed; the field is shared with the event gallery schema.
- No new test or check is added to the repository. The maintainer declined a hotlink guard.
- Site content is never formatted by `nix fmt`; repository Markdown is. The spec and this plan are repository Markdown.

## Review Focus

- **Unstaged image files.** `nix build` reads the git-tracked tree, so an unstaged `static/images/people/*` produces a green check and a broken page. Task 1 verifies the files exist in the build output, not just on disk.
- **Extension/content-type mismatch.** GitHub serves PNG for some accounts and JPEG for others; `rob-hernandez` is PNG despite the other two members' avatars being JPEG. Task 1 verifies each saved file's real type with `file`.
- **`"format": "uri"` asserting on relative paths.** `profiles.json` declares it on `image_url`. Expected to be an unenforced annotation because `verify_post.py` passes no format checker, but Task 1 runs the `frontmatter` check to confirm rather than assume.
- **A truncated or error-page download.** A silent `curl` failure writes an HTML error body to a `.png` path. Task 1's `file` check catches this.
- **Stale remote references left behind.** Task 1 greps the whole tree for the old hosts so no fifth reference survives.

______________________________________________________________________

### Task 1: Vendor the four avatars and repoint the front matter

**Files:**

- Create: `static/images/people/daniel-baker.png`
- Create: `static/images/people/david-nuon.jpg`
- Create: `static/images/people/rob-hernandez.png`
- Create: `static/images/people/tristan-ross.jpg`
- Modify: `content/about/daniel.baker.md:7`
- Modify: `content/about/david.nuon.md:7`
- Modify: `content/about/rob.hernandez.md:8`
- Modify: `content/about/tristan.ross.md:7`

**Interfaces:**

- Consumes: nothing.

- Produces: the served paths `/images/people/{daniel-baker.png, david-nuon.jpg, rob-hernandez.png, tristan-ross.jpg}`, read by `templates/about.html` via `profile.extra.image_url`.

- [ ] **Step 1: Fetch the four avatars**

```bash
mkdir -p static/images/people
curl -sSfL -o static/images/people/daniel-baker.png  "https://avatars.githubusercontent.com/u/7043297?v=4&s=256"
curl -sSfL -o static/images/people/david-nuon.jpg    "https://avatars.githubusercontent.com/u/477742?v=4&s=256"
curl -sSfL -o static/images/people/rob-hernandez.png "https://avatars.githubusercontent.com/u/30531572?v=4&s=256"
curl -sSfL -o static/images/people/tristan-ross.jpg  "https://avatars.githubusercontent.com/u/19699320?v=4&s=256"
```

`-f` makes curl fail on an HTTP error rather than writing the error page to the file.

- [ ] **Step 2: Verify each file is the image type its extension claims**

Run: `file static/images/people/*`
Expected: `daniel-baker.png` and `rob-hernandez.png` report `PNG image data, 256 x 256`; `david-nuon.jpg` and `tristan-ross.jpg` report `JPEG image data ... 256x256`. Any `HTML document` or a dimension other than 256 fails the task.

- [ ] **Step 3: Repoint the four `image_url` values**

In each `content/about/<name>.md`, replace the `image_url` line's value with the served path. Leave every other line, including `weight`, untouched.

| File               | New value                            |
| ------------------ | ------------------------------------ |
| `daniel.baker.md`  | `"/images/people/daniel-baker.png"`  |
| `david.nuon.md`    | `"/images/people/david-nuon.jpg"`    |
| `rob.hernandez.md` | `"/images/people/rob-hernandez.png"` |
| `tristan.ross.md`  | `"/images/people/tristan-ross.jpg"`  |

- [ ] **Step 4: Confirm no remote image reference survives**

Run: `grep -rn 'avatars.githubusercontent.com\|socallinuxexpo.org.*\.jpg' content/ templates/`
Expected: no output.

- [ ] **Step 5: Stage the new files so the flake can see them**

```bash
git add static/images/people content/about
git status --short
```

Expected: four `A` lines and four `M` lines.

- [ ] **Step 6: Run the full check suite**

Run: `nix flake check`
Expected: `all checks passed!`. The `frontmatter` check passing confirms `"format": "uri"` does not assert on a root-relative path. If it does fail with a format error, change `"format": "uri"` to `"format": "uri-reference"` in `overlays/topLevel/socal-nug-verify-post/schemas/profiles.json` and rerun.

- [ ] **Step 7: Verify the built site actually ships the images**

```bash
nix build
grep -o 'src="[^"]*"' result/about/index.html | grep -i 'people\|avatars'
ls -l result/images/people/
```

Expected: four `src="/images/people/..."` lines, no `avatars.githubusercontent.com`, and four files present in `result/images/people/`. This is the step that catches an unstaged file.

- [ ] **Step 8: Commit**

```bash
git add static/images/people content/about docs/superpowers
git commit -m "about: vendor member profile images

The four member photos were the site's only hotlinked images. Rob's
pointed at a SCALE speaker thumbnail that now 404s, since SCALE
republished its old conference sites as static archives.

Serve all four from static/images/people/ instead. The avatars are
fetched from GitHub at s=256, which the about page renders at 128px.

Assisted-by: Claude Code (Opus 5)"
```

______________________________________________________________________

## Self-Review

**Spec coverage.** Four files added, four values repointed, no template or schema change, verification by `nix flake check` plus build-output inspection: all covered by Task 1. The spec's non-goals (jsDelivr, fonts, guard check, field rename) are things the plan does not do, and no step does them.

**Step scan.** Every step is a command or an exact value with a checkable result. No step says "handle edge cases" or leaves a value open.

**Type consistency.** The four served paths in Step 3 match the four filenames in Step 1 and the `result/images/people/` check in Step 7, extensions included.

**Review Focus.** Five failure modes listed; Steps 2, 4, 6 and 7 cover them. No new repository test is added, per the maintainer's choice, so these are verification steps within the task rather than committed tests.

**Proportion.** One task for a change touching eight files. Splitting the download from the repoint would leave a commit where the about page is broken in a new way, which no reviewer could usefully approve.
