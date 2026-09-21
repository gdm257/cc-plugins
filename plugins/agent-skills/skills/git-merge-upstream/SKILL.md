---
name: git-merge-upstream
description: >
  Merge the latest stable upstream release into a fork as a single squash commit,
  keeping linear history. Use when asked to sync or merge upstream, update a fork
  to the latest stable upstream version (e.g. vX.Y.Z), or to figure out which
  upstream commits a stale fork still needs.
---

# Merge upstream latest

Merge the upstream repo's latest stable version into the fork: one squash commit, linear history. Five steps, each ending on its own sha evidence.

## Step 1: Find the remotes

`git remote -v`. Distinguish the two remotes: the fork (usually `origin`, your own repo) and upstream (the original repo it was forked from).

If the upstream remote is missing, take the URL from the "forked from" line on the fork's GitHub/GitLab page and `git remote add upstream <url>`.

**Done when**: the upstream remote exists and `git fetch upstream --tags` succeeds.

## Step 2: Locate the latest stable version

The upstream's latest "stable version" = the newest release that is not a prerelease, one concrete commit. A prerelease (`vX.Y.Z-rc.N`, `-beta.N`, `-alpha.N`, `-dev`) is never the merge target, even when it is the newest tag. Merge targets are always a stable version, never the latest commit: an upstream that ships no version bump (no new tag, no `version` field change) is not stable enough to merge — track HEAD and stop.

Locate it in order:

1. **git tags**: `git ls-remote --tags upstream`, take the highest semver `vX.Y.Z`, skipping prerelease tags and `^{}` lines, resolve the sha with `git rev-parse vX.Y.Z^{commit}`.
2. **Embedded version numbers**: with no tags, read the upstream `package.json` `version`, `Cargo.toml`, or the first `CHANGELOG.md` entry, then find the commit that bumped it in `git log upstream/main`. If the newest bump is older than recent upstream commits, merge the bump commit — those later commits stay unmerged until the next bump.

**Done when**: exactly one stable version commit is fixed (sha + version), you can say whether it came from a tag or which file, or you have reported "no version bump since the last merge" and stopped.

## Step 3: Find the last synced point, fix the merge range

First decide whether a merge is needed at all: the fork's squash commit message already records this version (see the Step 4 convention), or `git diff <version-sha> HEAD -- <version file>` shows no difference → already up to date; report and stop.

Otherwise find the last synced point (the last upstream commit merged in):

- Last sync was a regular merge/rebase: `git merge-base HEAD upstream/main` works.
- Last sync was a squash merge: **merge-base is broken** (squash drops ancestry; the base lands on the stale pre-merge fork point and the range is falsely inflated). Instead read the upstream sha recorded in the last squash commit message: `git log --grep="upstream" --oneline`.

Merge range = last synced sha..version commit.

**Done when**: both range endpoints are fixed, and the version commit's content is confirmed absent from the fork history.

## Step 4: Squash merge

```bash
git merge --squash <version-sha>
```

Hand conflicts to the resolving-merge-conflicts skill (local skill; invoke by name). After resolving, commit with a message that records `Merge upstream vX.Y.Z (<version-sha>)` — this is what Step 3 searches for next time.

**Done when**: a single new commit sits on the current branch, `git diff <version-sha> HEAD` shows only locally intended differences, and the working tree is clean.

## Step 5: Bump the fork version, tag on demand

Bump the fork's own version per repo convention (the `version` field in `plugin.json`, usually tracking the upstream version) and commit, following the `ci(<plugin>): bump version to X.Y.Z` message format.

git tag is optional: create one only if the repo already has a tagging habit, matching the existing tag format; if it doesn't (e.g. this repo has no tags at all), skip it.

**Done when**: the version bump is committed; the tag is created, or the repo is confirmed not to tag.

## Reference

### Squash and merge-base

A squash merge compresses the range into one new commit with no upstream ancestry. Afterwards `git merge-base` returns the stale pre-merge fork point, and the diff range falsely includes already-merged history. That is why the commit message records the upstream sha: locating the last synced point next time becomes one `git log --grep`.

### Version source priority

tags > embedded version numbers. A tag binds to a commit directly; an embedded version needs an extra hop to locate the bump commit and may lag behind HEAD — merge the bump, not what trails after it.
