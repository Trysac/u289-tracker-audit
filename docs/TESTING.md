# Testing

## Commands

Both test files are authored for Vitest and import `describe`, `expect`, `it` and, in `test/cli.test.ts`, `vi`. They are executed by the repository's Vitest configuration; no test command is defined inside the test files.

## Layout

| Path | Contents |
|---|---|
| `test/index.test.ts` | `auditHtml` detection for script, img, iframe, link and inline snippets; URL resolution; host matching and lookalikes; first-party host handling; gating from `type` and `data-src`; custom `TrackerRule` validation; error codes; sorting; malformed input; `renderReport` text and JSON; `DEFAULT_TRACKERS` names and domain format. |
| `test/cli.test.ts` | `run(argv, io)` with fake `stdout`/`stderr`: exit codes 0, 1 and 2; text and JSON output; missing file; missing `--page-url`; invalid `--format`; unknown options; invalid page URL; temporary HTML files. |

## What must stay covered

- Uppercase tags and attributes, unquoted `src`.
- A protocol-relative `//www.google-analytics.com/analytics.js`.
- A script end tag split across lines.
- A malformed tag at the end of input.
- Host lookalikes (`notgoogle-analytics.com`, `google-analytics.com.evil.example`) that must not match.
- Comments and plain text containing a signature, which must not produce a finding.
- Inline snippets behind `type="text/plain"`, reported with `gated: true` and exit code `0`.
- `input_too_large`, `invalid_options` and `invalid_tracker` errors.

## Adding a test

Start with the failing test, state the acceptance criterion it checks and keep it on the public API or the CLI `run` function. A custom `TrackerRule` is the cheapest way to test path prefixes and signatures without depending on `DEFAULT_TRACKERS`.
