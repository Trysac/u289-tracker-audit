# tracker-audit

[![npm version](https://img.shields.io/npm/v/@trysac/tracker-audit.svg)](https://www.npmjs.com/package/@trysac/tracker-audit)
[![license: MIT](https://img.shields.io/npm/l/@trysac/tracker-audit.svg)](LICENSE)
[![CI](https://github.com/Trysac/u289-tracker-audit/actions/workflows/ci.yml/badge.svg)](https://github.com/Trysac/u289-tracker-audit/actions/workflows/ci.yml)

## Problem

Sites embed analytics, advertising and session-replay scripts that load before any consent, often added by tag managers or copied snippets nobody tracks. Privacy reviews need to know which trackers a page loads and whether each one is gated behind consent, without running a browser. `tracker-audit` scans static HTML with a linear tokenizer, matches external hosts and inline signatures against an explicit vendor table, and reports findings, gating status and third-party hosts offline.

## Install

```sh
npm install @trysac/tracker-audit
```

Requires Node.js 20 or newer. The package is ES modules with TypeScript declarations and has no runtime dependencies.

## Usage

```ts
import { auditHtml, renderReport } from "@trysac/tracker-audit";

const html = '<script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>';
const report = auditHtml(html, { pageUrl: "https://example.com/" });

console.log(renderReport(report, "text"));
// line 1: Google Tag Manager (analytics) script www.googletagmanager.com
```

A consent-gated snippet (`type="text/plain"`) is still reported, with `gated: true` and a `[gated]` marker in the text output. Pass `trackers` to override `DEFAULT_TRACKERS`; custom rules are validated before scanning.

### Command line

```sh
npx tracker-audit page.html --page-url https://example.com/
npx tracker-audit page.html --page-url https://example.com/ --format json
```

| Exit code | Meaning |
|---|---|
| `0` | No ungated tracker found (no findings, or all findings gated) |
| `1` | At least one ungated tracker found |
| `2` | Usage error, invalid `--page-url` or `--format`, or I/O error |

## API

| Export | Signature | Description |
|---|---|---|
| `auditHtml` | `(html: string, opts: { pageUrl: string; trackers?: TrackerRule[]; maxBytes?: number }) => Report` | Scans HTML. `maxBytes` defaults to `5_242_880` UTF-8 bytes; exceeding it throws `TrackerError` with code `input_too_large`. Invalid `pageUrl` or `maxBytes` throws `invalid_options`; invalid custom `trackers` throws `invalid_tracker`. |
| `renderReport` | `(report: Report, format: "text" \| "json") => string` | Text lines are `line <n>: <tracker> (<category>) <element> <host>` with ` [gated]` appended when gated. Any other format throws `invalid_options`. |
| `DEFAULT_TRACKERS` | `readonly TrackerRule[]` | The explicit vendor table: Google Analytics, Google Tag Manager, Google Ads, Meta Pixel, Hotjar, Microsoft Clarity, LinkedIn Insight, TikTok Pixel, X Pixel, Segment. |
| `TrackerError` | `class extends Error` | Has a readonly `code` of `"input_too_large"`, `"invalid_options"` or `"invalid_tracker"`. |
| `Report` | `{ findings: Finding[]; thirdPartyHosts: string[] }` | Findings are sorted by line then tracker; hosts are sorted and unique, including hosts with no matching tracker. |
| `Finding` | `{ tracker: string; category: "analytics" \| "advertising" \| "session_replay" \| "social"; host: string; element: "script" \| "img" \| "iframe" \| "link" \| "inline"; line: number; gated: boolean }` | `host` is empty for inline snippets. |
| `TrackerRule` | `{ name: string; category: Finding["category"]; domains: string[]; paths?: Record<string, string>; signatures?: string[] }` | Domains must match `^[a-z0-9.-]+\.[a-z]{2,}$`; `paths` maps a domain to a required pathname prefix; `signatures` are plain substrings searched in inline script text. At most 50 rules. |

Detection covers `script[src]`, `img[src]`, `iframe[src]`, `link[href]` with `rel` containing `preconnect`, `dns-prefetch`, `preload` or `stylesheet`, and inline script text. A script is gated when its `type` attribute is present and is not `""`, `"text/javascript"`, `"module"` or `"application/javascript"`; an `img` or `iframe` is gated only when it uses `data-src` instead of `src`. JavaScript is not executed, no network request is made, and the first-party check is a host-suffix comparison without the Public Suffix List.

See [docs/SECURITY.md](docs/SECURITY.md) for the threat model and limits.

## Why not a browser-based scanner

Browser-based scanners need a page load, a network stack, consent-manager configuration and JavaScript execution, which makes results slower and dependent on runtime conditions. `tracker-audit` scans built HTML offline and deterministically; trackers injected only at runtime are out of scope.

## Development

Tests live in `test/` and import the public API from `src/index.ts` and the CLI `run` from `src/cli.ts`. The library entry point is `src/index.ts`; `src/cli.ts` is the command-line wrapper and uses `node:fs/promises` to read the named file.

## License

[MIT](LICENSE).
