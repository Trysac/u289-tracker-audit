# Project record

## Objective

Give privacy reviews a deterministic, offline answer to which third-party trackers a page loads and whether each is gated behind consent, for built HTML, without running a browser.

## Scope

In scope: detection of `script[src]`, `img[src]`, `iframe[src]`, consent-relevant `link[href]` and inline script snippets against an explicit vendor table (`DEFAULT_TRACKERS`); consent-gating status from the script `type` attribute and from `data-src` placeholders; a sorted third-party host list and sorted findings; a CLI (`tracker-audit <file> --page-url <url> [--format text|json]`) with exit codes 0/1/2; a custom vendor table with validation.

Out of scope: executing JavaScript, cookies set at runtime, network capture, consent-manager configuration and the Public Suffix List.

## Deliverables

- `src/index.ts`: public API and scanner.
- `src/cli.ts`: command-line wrapper.
- `test/index.test.ts` and `test/cli.test.ts`: test suites.
- Documentation: `README.md`, `docs/ARCHITECTURE.md`, `docs/STACK.md`, `docs/TESTING.md`, `docs/SECURITY.md`, `docs/PROJECT.md`, `llms.txt`.

## Timeline and effort

| Item | Value |
|---|---|
| Size | Medium |
| Distribution | Public open source (MIT) |
| Category | Privacy and compliance |
| Effort | pending measurement |

No other timeline or effort values are recorded in the source.

## Demo

Terminal: `npx tracker-audit page.html --page-url https://example.com/` prints one line per finding and returns 1 when an ungated tracker exists.

## Factory run u289 (measured from API usage)

| Date (UTC) | Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|---|
| 2026-11-10 | generation | deepseek-v4-pro | yes | 1814 | 17716 | 0 | 3584 | 0.0364 |
| 2026-11-11 | generation | deepseek-v4-pro | yes | 22 | 20025 | 0 | 5376 | 0.0398 |
| 2026-11-11 | fix-1 | deepseek-flash | no | 39266 | 26419 | 0 | 1139712 | 0.0252 |
| 2026-11-11 | fix-2 | deepseek-flash | no | 14301 | 5352 | 0 | 134016 | 0.0058 |
| 2026-11-11 | audit | deepseek-flash | no | 24749 | 22451 | 0 | 321920 | 0.0181 |
| 2026-11-11 | fix-3 | deepseek-flash | no | 17647 | 6319 | 0 | 180224 | 0.0070 |
| 2026-11-11 | docs | deepseek-flash | no | 20625 | 14077 | 0 | 384 | 0.0115 |

Total: $0.1437. Prices: deepseek line, as measured by its adapter. Providers serve the current version of each model id, so the date tells which version answered; versions, launch stages and price sources per line are in the factory's model register (docs/MODELS.md).
