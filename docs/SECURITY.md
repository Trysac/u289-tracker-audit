# Security

## Threat model

The library parses HTML that may come from an untrusted build. The parser is defensive:

- **Bounded input.** Every audit is capped by `maxBytes` (default `5_242_880` UTF-8 bytes) and throws `TrackerError` with code `input_too_large` before scanning. Custom vendor tables are capped at 50 rules and validated; invalid rules throw `invalid_tracker`.
- **No code execution.** Inline script text is searched only for plain substrings. There is no `eval`, no `Function` and no JavaScript engine.
- **No network.** The library never fetches a URL. `URL` is used only to resolve and compare strings.
- **No DOM or native parser.** The scan is a single linear pass with no recursion; it does not build a DOM.
- **No filesystem in the library.** `src/index.ts` uses no `node:` imports. Only `src/cli.ts` reads the file named by the caller, as UTF-8, using `node:fs/promises`.
- **No secrets, no logging.** The library writes nothing to the console. The CLI writes findings to its injected stdout and errors or usage text to its injected stderr.

Defended:

- Input size and custom rule count.
- Invalid `pageUrl` and `maxBytes` values throw before scanning.
- Malformed HTML is tolerated and stops or skips without a finding.

Not defended:

- The audit does not execute JavaScript, inspect cookies set at runtime, capture network requests, validate consent-manager configuration or consult the Public Suffix List. A tracker loaded dynamically from an allowed first-party script is not detected.
- Host matching is a suffix comparison, not a Public Suffix List check.
- The CLI reads the named file without sandboxing; the caller controls the path.

## Out of scope

The audit does not execute JavaScript, inspect cookies set at runtime, capture network requests, validate consent-manager configuration or consult the Public Suffix List. A tracker loaded dynamically from an allowed first-party script is not detected.

## Dependency policy

No runtime dependencies. Development tooling is outside the library's runtime surface.

## Reporting a vulnerability

Do not open a public issue. Report the issue privately to the repository maintainers.
