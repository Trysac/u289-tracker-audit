# Architecture

`@trysac/tracker-audit` is a single-pass, dependency-free scanner. It never builds a DOM, never executes JavaScript, never fetches anything and never recurses; the whole audit is a linear scan over the HTML string.

## Modules

| File | Responsibility |
|---|---|
| `src/index.ts` | Public API: `auditHtml`, `renderReport`, `DEFAULT_TRACKERS`, `TrackerError` and the types. Contains the tokenizer, the matcher and the renderer. |
| `src/cli.ts` | Thin command-line wrapper: argument parsing, file reading (`node:fs/promises`) and exit codes. Only this file may use `node:` imports. |

The library has no runtime dependencies and no browser or Node-specific globals in the audit path beyond UTF-8 byte counting.

## Pipeline

1. **Options validation.** `pageUrl` must parse as an absolute `http`/`https` URL (`invalid_options`). `maxBytes` must be a positive integer and defaults to 5 242 880 UTF-8 bytes (`input_too_large` when the HTML exceeds it). Custom `trackers` are validated field by field (`invalid_tracker`, at most 50 rules, domains must match `^[a-z0-9.-]+\.[a-z]{2,}$`).
2. **Tokenize.** A cursor walks the HTML once:
   - `<!-- ... -->` comments are skipped, including an unclosed comment (rest of input).
   - End tags are skipped to their `>`.
   - Start tags are read up to the matching `>` (quotes are respected) and parsed into a lowercase tag name and an attribute map with lowercase names. Double-quoted, single-quoted and unquoted values are supported, and `&amp;`, `&quot;` and `&#39;` are decoded.
   - `script` and `style` content is raw text up to the case-insensitive matching end tag; a missing end tag consumes the rest of the input.
   - A malformed tag at end of input stops the scan without a finding.
   - Line numbers are counted from the newlines consumed so far; a finding uses the line where its element or inline script starts.
3. **Match.** `script[src]`, `img[src]`, `iframe[src]`, `link[href]` with `rel` containing `preconnect`, `dns-prefetch`, `preload` or `stylesheet`, and inline script text are checked. External values are resolved against `pageUrl` with the `URL` constructor; only `http:`/`https:` URLs count. A host matches a rule domain when it equals the domain or ends with `.` + domain; when the rule has a `paths` entry for that domain the pathname must also start with the prefix. Inline rules use plain substring signatures over inline script text only.
4. **Gate.** A script is gated when its `type` attribute is present and is not `''`, `text/javascript`, `module` or `application/javascript` (consent managers use `type="text/plain"`). The rule applies to external and inline scripts alike. `img` and `iframe` are never gated unless they carry `data-src` in place of `src`.
5. **Report.** Findings are sorted by line then tracker name. `thirdPartyHosts` is the sorted, unique set of every third-party host seen, matched or not.

## First-party approximation

A host is first-party when it equals the page host or ends with `.` + page host. This is documented approximation: the Public Suffix List is deliberately out of scope, so `a.example.com` and `example.com` are treated as the same site even where a public suffix would separate them. `thirdPartyHosts` is an approximation for the same reason.

## Why not a browser

A browser-based scanner needs a page load, a network stack, consent-manager configuration and JavaScript execution, which makes results slow and nondeterministic. Scanning built HTML is offline, deterministic and fast enough for CI on generated pages. The trade-off is that trackers injected at runtime are out of scope.

## Boundaries

- `src/index.ts` is the public entry point described in the README; `src/cli.ts` is the command-line wrapper.
- Tests exercise behaviour through the public API and the `run` function of the CLI.
