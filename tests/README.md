# Tests

Headless Playwright against the real `index.html` — no mocks, no test build. Each file loads the
shipped page, drives the actual functions, and exits non-zero on failure.

```sh
node tests/run.mjs            # everything
node tests/run.mjs 41 43      # only matching files
node tests/run.mjs --list     # what exists
```

Playwright is resolved by `pw.mjs`: a local `node_modules` first, then the global install. If
neither is present, `npm i -D playwright`.

## The runner reports by exit code, deliberately

An earlier ad-hoc runner grepped stdout for `FAIL`. A test that *threw* — exiting non-zero without
ever printing a verdict — was therefore reported as passing, and `test42` sat broken and green that
way for some time. A harness that can turn a crash into a pass is worse than no harness, because it
converts silence into confidence. Exit codes only.

## What the suite is for

Most files check *relative behaviour*: bigger turbo spools later, an LSD beats an open diff,
a steeper climb costs time. That kind of test is cheap and catches a lot, but it is structurally
blind to a model that is wrong in the same direction everywhere. Two files exist to cover that:

| file | what it pins |
|---|---|
| `test41.mjs` | 0–100 against six real cars with power, mass, driveline and gearbox all matched. Currently 2.66% RMS; fails above 5%. |
| `aero.mjs` | Top speed against seven real cars with CdA matched. Cross-checked against an independent closed-form solve of `P = (½ρ·CdA·v² + crr·m·g)·v`. |
| `test43.mjs` | That the two simulators agree with each other about the same car. Nothing asserted this before, which is exactly how the missing rev limiter survived. |

These three are the ground truth for the v1.0 physics rewrite. A derived-from-first-principles model
cannot be tuned to fit, so the only honest way to judge it is to check it against reality afterwards
and accept the answer.

## Writing a new one

- Import `chromium` from `./pw.mjs`, not from `playwright`.
- Resolve the app as `` `file://${repo}/index.html` `` with
  `const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');` — no absolute paths.
- Collect failures in a `fails` array, print them, and
  `process.exit(fails.length || errors.length ? 1 : 0)`.
- Fail the test against the *old* code before trusting it. A regression test that does not fail on
  the bug it was written for is decoration.
