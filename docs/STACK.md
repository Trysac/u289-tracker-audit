# Stack

## Runtime

| Choice | Reason |
|---|---|
| TypeScript (strict) | Typed public API with generated declarations; no runtime dependencies. |
| ES modules | Source uses `import`/`export` and `.js` import specifiers. |
| Node.js | `URL` for resolution and, in `src/cli.ts` only, `node:fs/promises` for reading the HTML file. |
| `Buffer.byteLength` | UTF-8 byte counting for the `maxBytes` bound. |

## Toolchain

| Tool | Reason |
|---|---|
| TypeScript compiler | Type checking and `dist/` build. |
| Vitest | Test runner used by `test/index.test.ts` and `test/cli.test.ts`. |

## Discarded

| Option | Why not |
|---|---|
| A DOM parser (jsdom, parse5, cheerio) | Heavy, unnecessary: a bounded linear tokenizer answers the question and keeps the package dependency-free. |
| A headless browser (Playwright, Puppeteer) | Slow and nondeterministic; requires a browser download and cannot run cheaply in CI on built pages. |
| The Public Suffix List | Would add a data dependency and versioning burden; the first-party check is documented as a host-suffix approximation. |
| A CSS or JavaScript parser | Only plain substrings inside inline script text are needed. |

## Dependency policy

No runtime dependencies. A new development dependency is acceptable only for a quality gate the factory requires; anything else needs a recorded decision.
