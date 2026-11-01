# Development instructions for coding agents

This file is for any coding agent working on this repository, Cursor's included. It describes the method every change
here has followed, so that work started in one tool can be picked up in another without conflicts. **Read it whole
before your first change**, and follow it unless the repository owner tells you otherwise in the task itself.

Pixel Engine Sim is one HTML page (`index.html`) that simulates an engine, a car, a lap and a race from physics. The
goal for v1.0 is **every number derived, not fitted**. That goal decides most of the rules below.

---

## 1. The shape of the repository

| Path | What it is |
|---|---|
| `src/shell.html` | The page, with each part pulled in by a line `<!-- @include path -->` |
| `src/js/*.js`, `src/css/app.css`, `src/html/guide.html` | The sources. **Edit these, never `index.html`.** |
| `index.html` | `src/` joined by `tools/build.mjs`. It is **committed**, because GitHub Pages and the tests serve it as is |
| `tools/build.mjs` | `node tools/build.mjs` writes `index.html`; `--check` fails if it is not exactly what `src/` builds |
| `tools/stamp.mjs` | Bumps the build number in `src/shell.html`, `index.html` and `README.md`; `--check` verifies it |
| `tools/fingerprint.mjs` | Records ~4800 numbers the simulators produce, and compares two recordings exactly |
| `tests/` | One file per behaviour (`testNNN.mjs`), run by `tests/run.mjs`; `tests/durations.json` balances CI shards |
| `CHANGELOG.md` | One entry per build, newest first, under `## [Unreleased]` |
| `plans/`, `research/` | Design notes and source material behind past builds |

The app is one classic script on purpose: it opens from `file://` with no server and no install. **Do not** add ES
modules, a bundler, a framework or a runtime dependency. Playwright is the only dev dependency, for the tests.

## 2. One change = one build = one pull request

1. **Start from the latest `main`**, on a branch of your own:
   ```
   git fetch origin main
   git checkout -b cursor/<short-topic> origin/main
   ```
   Never push to `main`, and never push to another agent's branch. In particular, the long-lived `ccr-*` branches
   belong to Claude Code sessions.
2. **Edit `src/`**, then join it: `node tools/build.mjs`.
3. **Stamp the build once per pull request**: `node tools/stamp.mjs`. It writes one above the higher of the number
   in the files and the one `origin/main` carries, so running it twice skips a number. Commit `src/shell.html`,
   `index.html` and `README.md` together with your change.
4. **Write the CHANGELOG entry** (see section 6).
5. **Run the checks** (section 5), then commit, push, and open the pull request (section 7).

A pull request carries exactly one build number. If you push more commits to the same PR, do **not** stamp again
(`stamp.mjs --check` passes as long as the tree is ahead of `main`'s number).

### When `main` moves while your PR is open (the usual source of conflicts)

Another PR, from Claude Code or from you, may merge first and take the build number you stamped. When it does, the
build line in `src/shell.html`, `index.html` and `README.md` conflicts, and so does the top of `CHANGELOG.md`. Resolve
it like this, every time:

```
git fetch origin main
git merge origin/main            # a merge commit: never rebase or force-push a branch someone may have checked out
# src/ conflicts: resolve by hand, keeping both sides' changes. On the build line itself
#   (src/shell.html and README.md) take main's number, so the re-stamp below lands one above it.
# index.html: do NOT hand-merge it. Take main's, then regenerate it from the merged src/:
git checkout --theirs index.html
node tools/stamp.mjs             # re-stamp: one above the new main
node tools/build.mjs             # regenerate index.html from the merged src/
node tools/stamp.mjs --check && node tools/build.mjs --check
```

In `CHANGELOG.md`, keep both entries, put yours on top, and correct the build number in your heading to the new
stamp. Then rerun the tests your change touches, and push.

## 3. The physics rules

These are what reviewers check first.

- **Derive, do not fit.** A number comes from a physical relation and a sourced input, such as a maker's spec sheet, a
  standard, a paper or a measured dataset. Do not tune a constant until a test passes. If a model can't reach a real
  figure honestly, leave the gap open, name it, and say why (see "known gaps" below).
- **Cite sources in the code**, in a comment beside the constant: who measured it, and what it is. If a value is only
  probable (for example, from a forum or a parts listing), mark it as such. Presets use an `unsure` list for exactly
  this.
- **Real cars are checked against published figures**: power, torque, 0–100 km/h, top speed, mass, lap times where they
  exist. Put the source in the preset's comment.
- **Never change a preset to make a test pass**, and never widen a test's tolerance to hide a regression.
- **Know what your change moves.** Before a change to physics, or to anything a preset reads, record a fingerprint of
  `main`, then compare it with yours:
  ```
  git worktree add ../es-main origin/main && (cd ../es-main && node tools/fingerprint.mjs /tmp/before.json)
  node tools/build.mjs && node tools/fingerprint.mjs /tmp/after.json
  node tools/fingerprint.mjs --compare /tmp/before.json /tmp/after.json
  ```
  - A refactor or a UI change must move **nothing**: an identical fingerprint is the proof, so say so in the PR.
  - A physics change moves numbers on purpose. Report the range it moved by (for example, "peak power −2.2 to +4.2%")
    and whether the mean error against the real cars got better or worse.

## 4. Tests

- **Every build adds or updates a test** for what it changes: `tests/test<next number>.mjs`. Copy the shape of a recent
  one, such as `tests/test125.mjs` or `tests/test124.mjs`:
  - a header comment that starts with **`WHY THIS EXISTS`** and lists, as bullets, what must hold;
  - it loads `index.html` through `./pw.mjs` (Playwright), checks behaviour in the page, prints a readable report;
  - it collects `fails` and **exits non-zero** on any failure or page error. The runner judges by exit code only.
- **Known gaps** are named lists in tests (`*_KNOWN`, budgets and caps), each with a reason. They may only shrink. Never
  add to one to get green; if a gap is real and out of scope, add it **and** state it in the CHANGELOG.
- **Never skip, disable or delete a test** to get green. A failing test is either a bug you fix, or a change in
  behaviour you explain and update the test for, in the open.
- **Tests that touch the interface must pass in Greek too.** See section 8.
- If you add a test, add its time to `tests/durations.json` (in milliseconds) so CI's shards stay balanced. A test
  missing from the file counts as 30 s.

## 5. Checks before every push

```
node tools/build.mjs --check          # index.html is exactly src/ joined
node tools/stamp.mjs --check          # the build number is consistent and ahead of main
node tests/run.mjs 87 <your tests> <tests for what you touched>
```

- `test87` is the Greek-interface sweep; run it on every interface change.
- `tests/run.mjs 41 43 aero` runs only those tests, and `--list` shows what exists.
- The full suite takes about 70 minutes on one machine. CI runs it in five shards (`.github/workflows/tests.yml`) on
  every pull request, and the PR is ready only when the **Tests** check and the **Check** workflow are green.
- Before pushing, read your own diff as a reviewer would: what would make CI reject it?
- When a CI shard fails, read its log, reproduce the failure locally with `node tests/run.mjs <that test>`, fix the
  cause, and push. "Flaky" is not a cause. Do not re-run a job hoping it passes.

## 6. CHANGELOG

Add one entry at the top of `## [Unreleased]`, headed `### <What changed, in plain words> (build N)`. Then:

- Write bullets that say **what changed and why**, with the numbers: before and after, against the real figure, and the
  source.
- Name what you left open, and why, so the next person (or agent) doesn't rediscover it.
- Write for the owner, who reads it to decide what to release. Use plain sentences, not commit-speak.

The owner creates releases and tags by hand. **Do not** create tags or releases, and do not edit past entries.

## 7. Commits and pull requests

- **Commit title:** `Build N: <same title as the CHANGELOG heading>`. Below it, put a short body of bullets describing
  the change.
- **One PR per build**, from your branch to `main`, titled exactly like the commit. The body has these sections:
  - `## What`: the change, in a few short sections or a table;
  - `## Checks`: the tests you ran, the fingerprint result (identical, or what moved and by how much), and any
    screenshot you took of an interface change.
- **Merging is the owner's call.** PRs are **squash-merged** once CI is green; do not merge your own PR unless the
  owner asks you to. After a squash-merge, start the next change on a fresh branch from the new `main`. Never stack new
  work on a merged branch.
- Do not put model names or tool identifiers in commits, code or PR text.
- Keep a PR to its one change. If you notice something else that needs doing, mention it in the PR, don't fold it in.

## 8. Interface and text

- **Every visible English string has Greek.** Pass interface text through `tr('...')` and add the Greek to `I18N` in
  `src/js/i18n.js`. `test87` fails on any `tr()` literal without Greek, and on any status message passed to `flash()`
  without `tr()`.
- **Guide pages** live in `src/html/guide.html`. Each page climbs three levels: LV1 real life, LV2 in the game, LV3 the
  physics. Each page has a picture drawn in code in `src/js/guide.js`. Each `data-gk` block needs its Greek in
  `GUIDE_I18N`, and the budget of blocks without Greek is 0. `test73` and `test51` check the structure.
- When behaviour changes, **update the guide page and README text that describes it**. Stale documentation counts as a
  bug.
- The look is 8-bit: the "Press Start 2P" pixel font, the existing palette, and no new libraries. Check phone width:
  `test73` fails on horizontal scroll.
- Take a screenshot of an interface change (Playwright; see `tests/pw.mjs`), look at it in both languages, and attach
  it to the PR or describe it.
- Storage is the browser's `localStorage`, under keys starting `pes.`. Wrap every access in `try/catch`, because the
  app must still run when storage is blocked.

## 9. When in doubt

- Look at how the last few builds did the same kind of thing (`git log --oneline origin/main`, `CHANGELOG.md`) and do
  it the same way.
- If a requirement is ambiguous, or a change would move many cars' numbers, ask the owner before building it.
- Write down what you found, in the code comment, the CHANGELOG or the PR, so the next session doesn't have to find it
  again.
