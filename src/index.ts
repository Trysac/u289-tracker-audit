/**
 * Public entry point of @trysac/tracker-audit.
 *
 * Audits HTML pages for third-party trackers: script, pixel, iframe and inline
 * snippet detection against an explicit vendor table, consent-gating status and
 * host lists.
 */

/**
 * Category of tracker finding.
 */
export type TrackerCategory = "analytics" | "advertising" | "session_replay" | "social";

/**
 * A single tracker finding.
 */
export interface Finding {
  /** Name of the matched tracker rule. */
  tracker: string;
  /** Category of the tracker. */
  category: TrackerCategory;
  /** Host of the external resource; empty string for inline scripts. */
  host: string;
  /** HTML element that triggered the finding. */
  element: "script" | "img" | "iframe" | "link" | "inline";
  /** 1-based line number where the element or inline script starts. */
  line: number;
  /** Whether the tracker appears to be gated behind consent. */
  gated: boolean;
}

/**
 * Result of an audit.
 */
export interface Report {
  /** All tracker findings, sorted by line then tracker name. */
  findings: Finding[];
  /** Sorted, unique list of third-party hosts (matched or not). */
  thirdPartyHosts: string[];
}

/**
 * A rule that describes a known tracker.
 */
export interface TrackerRule {
  /** Human-readable tracker name. */
  name: string;
  /** Category of the tracker. */
  category: TrackerCategory;
  /** List of domains that belong to this tracker. */
  domains: string[];
  /** Optional mapping from a domain to a required path prefix. */
  paths?: Record<string, string>;
  /** Plain substrings that identify inline snippet occurrences. */
  signatures?: string[];
}

/**
 * Options for {@link auditHtml}.
 */
export interface AuditOptions {
  /** Absolute URL of the page being audited (used for resolution and first-party checks). */
  pageUrl: string;
  /** Optional custom tracker rules; defaults to {@link DEFAULT_TRACKERS}. */
  trackers?: TrackerRule[];
  /** Maximum allowed size of the HTML in UTF-8 bytes; defaults to 5_242_880. */
  maxBytes?: number;
}

/**
 * Error codes emitted by the library.
 */
export type TrackerErrorCode = "input_too_large" | "invalid_options" | "invalid_tracker";

/**
 * Errors thrown by tracker-audit.
 */
export class TrackerError extends Error {
  readonly code: TrackerErrorCode;

  constructor(code: TrackerErrorCode, message: string) {
    super(message);
    this.name = "TrackerError";
    this.code = code;
  }
}

/**
 * Default tracker rules.
 *
 * Source: each vendor's own installation snippet documentation.
 * Check date: 2026-11-09.
 */
export const DEFAULT_TRACKERS: readonly TrackerRule[] = [
  {
    name: "Google Analytics",
    category: "analytics",
    domains: ["google-analytics.com"],
    signatures: ["gtag(", "GoogleAnalyticsObject"],
  },
  {
    name: "Google Tag Manager",
    category: "analytics",
    domains: ["googletagmanager.com"],
  },
  {
    name: "Google Ads",
    category: "advertising",
    domains: ["doubleclick.net", "googleadservices.com"],
  },
  {
    name: "Meta Pixel",
    category: "advertising",
    domains: ["connect.facebook.net", "facebook.com"],
    paths: {
      "facebook.com": "/tr",
    },
    signatures: ["fbq("],
  },
  {
    name: "Hotjar",
    category: "session_replay",
    domains: ["hotjar.com"],
    signatures: ["_hjSettings"],
  },
  {
    name: "Microsoft Clarity",
    category: "session_replay",
    domains: ["clarity.ms"],
  },
  {
    name: "LinkedIn Insight",
    category: "advertising",
    domains: ["snap.licdn.com", "px.ads.linkedin.com"],
    signatures: ["_linkedin_partner_id"],
  },
  {
    name: "TikTok Pixel",
    category: "advertising",
    domains: ["analytics.tiktok.com"],
    signatures: ["ttq.load("],
  },
  {
    name: "X Pixel",
    category: "advertising",
    domains: ["static.ads-twitter.com", "analytics.twitter.com"],
    signatures: ["twq("],
  },
  {
    name: "Segment",
    category: "analytics",
    domains: ["cdn.segment.com", "api.segment.io"],
  },
];

const DEFAULT_MAX_BYTES = 5_242_880;
const MAX_TRACKER_RULES = 50;
const DOMAIN_REGEX = /^[a-z0-9.-]+\.[a-z]{2,}$/;

/**
 * Validates that a string is a valid absolute HTTP(S) URL.
 */
function validatePageUrl(pageUrl: string): URL {
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TrackerError("invalid_options", "pageUrl must use http or https protocol");
    }
    return url;
  } catch (error) {
    if (error instanceof TrackerError) {
      throw error;
    }
    throw new TrackerError("invalid_options", "pageUrl is not a valid URL");
  }
}

/**
 * Validates an array of tracker rules.
 */
function validateTrackers(trackers: TrackerRule[]): void {
  if (!Array.isArray(trackers)) {
    throw new TrackerError("invalid_tracker", "trackers must be an array");
  }
  if (trackers.length > MAX_TRACKER_RULES) {
    throw new TrackerError("invalid_tracker", `too many tracker rules (max ${MAX_TRACKER_RULES})`);
  }

  for (const rule of trackers) {
    if (typeof rule.name !== "string" || rule.name.length === 0) {
      throw new TrackerError("invalid_tracker", "tracker name must be a non-empty string");
    }
    if (!["analytics", "advertising", "session_replay", "social"].includes(rule.category)) {
      throw new TrackerError("invalid_tracker", `invalid category for tracker ${rule.name}`);
    }
    if (!Array.isArray(rule.domains) || rule.domains.length === 0) {
      throw new TrackerError(
        "invalid_tracker",
        `tracker ${rule.name} must have at least one domain`,
      );
    }
    for (const domain of rule.domains) {
      if (!DOMAIN_REGEX.test(domain)) {
        throw new TrackerError("invalid_tracker", `invalid domain format: ${domain}`);
      }
    }
    if (rule.paths !== undefined) {
      if (typeof rule.paths !== "object" || rule.paths === null) {
        throw new TrackerError("invalid_tracker", `paths for ${rule.name} must be an object`);
      }
      for (const [domain, prefix] of Object.entries(rule.paths)) {
        if (!rule.domains.includes(domain)) {
          throw new TrackerError("invalid_tracker", `path rule for unknown domain ${domain}`);
        }
        if (typeof prefix !== "string" || prefix.length === 0) {
          throw new TrackerError(
            "invalid_tracker",
            `path prefix for ${rule.name} must be a non-empty string`,
          );
        }
      }
    }
    if (rule.signatures !== undefined) {
      if (!Array.isArray(rule.signatures)) {
        throw new TrackerError("invalid_tracker", `signatures for ${rule.name} must be an array`);
      }
      for (const signature of rule.signatures) {
        if (typeof signature !== "string" || signature.length === 0) {
          throw new TrackerError(
            "invalid_tracker",
            `signature for ${rule.name} must be a non-empty string`,
          );
        }
      }
    }
  }
}

/**
 * Decodes the entities required by the HTML tokenizer: &amp;, &quot;, &#39;.
 */
function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|quot|#39);/gi, (match) => {
    switch (match.toLowerCase()) {
      case "&amp;":
        return "&";
      case "&quot;":
        return '"';
      case "&#39;":
        return "'";
      default:
        return match;
    }
  });
}

/**
 * Finds the index immediately after the closing `>` of a tag, respecting quoted attribute values.
 * Returns -1 if no closing bracket is found.
 */
function findTagEnd(html: string, start: number): number {
  let i = start + 1;
  let quote: '"' | "'" | null = null;
  while (i < html.length) {
    const char = html[i];
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return i + 1;
    }
    i++;
  }
  return -1;
}

/**
 * Parses a start tag string into its name and attribute map.
 */
function parseTag(tagString: string): { tagName: string; attributes: Record<string, string> } {
  // Remove < and >
  const inner = tagString.slice(1, -1).trim();
  if (inner.length === 0) {
    return { tagName: "", attributes: {} };
  }

  // Extract tag name (first word)
  const nameMatch = /^[^\s/>]+/.exec(inner);
  if (!nameMatch) {
    return { tagName: "", attributes: {} };
  }
  const tagName = nameMatch[0].toLowerCase();
  const rest = inner.slice(nameMatch[0].length);

  const attributes: Record<string, string> = {};
  let p = 0;
  while (p < rest.length) {
    // Skip whitespace
    while (p < rest.length && /\s/.test(rest.charAt(p))) {
      p++;
    }
    if (p >= rest.length) break;

    // Read attribute name
    const nameStart = p;
    while (p < rest.length && !/\s|=/.test(rest.charAt(p))) {
      p++;
    }
    const attrName = rest.slice(nameStart, p).toLowerCase();
    if (attrName.length === 0) {
      // Probably malformed; skip char
      p++;
      continue;
    }

    // Skip whitespace before possible =
    while (p < rest.length && /\s/.test(rest.charAt(p))) {
      p++;
    }

    let value = "";
    if (p < rest.length && rest.charAt(p) === "=") {
      p++; // skip =
      // Skip whitespace after =
      while (p < rest.length && /\s/.test(rest.charAt(p))) {
        p++;
      }
      if (p < rest.length && (rest.charAt(p) === '"' || rest.charAt(p) === "'")) {
        const quote = rest.charAt(p);
        p++; // skip opening quote
        const valueStart = p;
        while (p < rest.length && rest.charAt(p) !== quote) {
          p++;
        }
        value = rest.slice(valueStart, p);
        if (p < rest.length) p++; // skip closing quote
      } else {
        // Unquoted value: until whitespace or end
        const valueStart = p;
        while (p < rest.length && !/\s/.test(rest.charAt(p))) {
          p++;
        }
        value = rest.slice(valueStart, p);
      }
    }

    attributes[attrName] = decodeEntities(value);
  }

  return { tagName, attributes };
}

/**
 * Finds the index of the start of a closing tag for the given tag name, case-insensitive.
 * Returns -1 if not found.
 */
function findEndTag(html: string, start: number, tagName: string): number {
  const lowerTag = tagName.toLowerCase();
  const search = `</${lowerTag}`;
  let i = start;
  while (i < html.length) {
    if (html[i] === "<") {
      // Try to match search string case-insensitively
      let match = true;
      for (let j = 0; j < search.length; j++) {
        if (html[i + j]?.toLowerCase() !== search[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        return i;
      }
    }
    i++;
  }
  return -1;
}

/**
 * Counts newline characters in a substring.
 */
function countNewlines(str: string): number {
  let count = 0;
  for (const char of str) {
    if (char === "\n") count++;
  }
  return count;
}

/**
 * Checks if a host matches a domain rule (exact or subdomain).
 */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Checks if a host is first-party relative to the page host.
 */
function isFirstParty(host: string, pageHost: string): boolean {
  return host === pageHost || host.endsWith(`.${pageHost}`);
}

/**
 * Tries to match a host and path against all tracker rules.
 */
function matchTracker(
  host: string,
  pathname: string,
  trackers: readonly TrackerRule[],
): TrackerRule | undefined {
  for (const rule of trackers) {
    for (const domain of rule.domains) {
      if (hostMatches(host, domain)) {
        const pathPrefix = rule.paths?.[domain];
        if (pathPrefix !== undefined) {
          if (!pathname.startsWith(pathPrefix)) {
            continue; // path prefix not satisfied, try next domain in this rule
          }
        }
        return rule;
      }
    }
  }
  return undefined;
}

/**
 * Audits an HTML string for third-party trackers.
 *
 * @param html - The HTML content to audit.
 * @param opts - Options; pageUrl is required, trackers and maxBytes are optional.
 * @returns A report containing findings and third-party hosts.
 * @throws {TrackerError} with code `input_too_large` if `html` exceeds `maxBytes`,
 * `invalid_options` if `pageUrl` is invalid, or `invalid_tracker` if custom trackers are invalid.
 */
export function auditHtml(html: string, opts: AuditOptions): Report {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new TrackerError("invalid_options", "maxBytes must be a positive integer");
  }
  if (Buffer.byteLength(html, "utf8") > maxBytes) {
    throw new TrackerError("input_too_large", `HTML exceeds maximum size of ${maxBytes} bytes`);
  }

  const pageUrl = validatePageUrl(opts.pageUrl);
  const pageHost = pageUrl.hostname;

  const trackers = opts.trackers ?? DEFAULT_TRACKERS;
  if (opts.trackers !== undefined) {
    validateTrackers(opts.trackers);
  }

  const findings: Finding[] = [];
  const thirdPartyHosts = new Set<string>();

  let line = 1;
  let i = 0;

  while (i < html.length) {
    if (html[i] === "<") {
      // Comment
      if (html.startsWith("<!--", i)) {
        const endComment = html.indexOf("-->", i + 4);
        const commentEnd = endComment === -1 ? html.length : endComment + 3;
        line += countNewlines(html.slice(i, commentEnd));
        i = commentEnd;
        continue;
      }

      // End tag (normal, not script/style because those are handled specially)
      if (html.startsWith("</", i)) {
        const tagEnd = findTagEnd(html, i);
        if (tagEnd > i) {
          line += countNewlines(html.slice(i, tagEnd));
          i = tagEnd;
        } else {
          // Malformed: skip one char
          if (html[i] === "\n") line++;
          i++;
        }
        continue;
      }

      // Start tag
      const tagEnd = findTagEnd(html, i);
      if (tagEnd === -1) {
        // Malformed tag at end of input
        line += countNewlines(html.slice(i));
        i = html.length;
        break;
      }

      const tagString = html.slice(i, tagEnd);
      const { tagName, attributes } = parseTag(tagString);

      if (tagName === "script") {
        const hasSrc = "src" in attributes;
        const src = attributes.src;
        const gated = determineScriptGated(attributes.type);

        if (src !== undefined) {
          processExternalUrl(
            src,
            pageUrl,
            "script",
            gated,
            line,
            trackers,
            findings,
            thirdPartyHosts,
            pageHost,
          );
        }

        // Find matching </script>
        const scriptEnd = findEndTag(html, tagEnd, "script");
        if (scriptEnd !== -1) {
          const content = html.slice(tagEnd, scriptEnd);
          if (!hasSrc) {
            checkInlineSignatures(content, trackers, line, gated, findings);
          }
          line += countNewlines(content);
          const closeTagEnd = findTagEnd(html, scriptEnd);
          if (closeTagEnd > scriptEnd) {
            line += countNewlines(html.slice(scriptEnd, closeTagEnd));
            i = closeTagEnd;
          } else {
            line += countNewlines(html.slice(scriptEnd));
            i = html.length;
          }
        } else {
          // No closing tag; treat rest as content (malformed)
          line += countNewlines(html.slice(tagEnd));
          i = html.length;
        }
        continue;
      }

      if (tagName === "style") {
        const styleEnd = findEndTag(html, tagEnd, "style");
        if (styleEnd !== -1) {
          const content = html.slice(tagEnd, styleEnd);
          line += countNewlines(content);
          const closeTagEnd = findTagEnd(html, styleEnd);
          if (closeTagEnd > styleEnd) {
            line += countNewlines(html.slice(styleEnd, closeTagEnd));
            i = closeTagEnd;
          } else {
            line += countNewlines(html.slice(styleEnd));
            i = html.length;
          }
        } else {
          line += countNewlines(html.slice(tagEnd));
          i = html.length;
        }
        continue;
      }

      if (tagName === "img" || tagName === "iframe") {
        const dataSrc = attributes["data-src"];
        const src = attributes.src;
        const raw = dataSrc ?? src;
        if (raw) {
          const gated = dataSrc !== undefined;
          processExternalUrl(
            raw,
            pageUrl,
            tagName as "img" | "iframe",
            gated,
            line,
            trackers,
            findings,
            thirdPartyHosts,
            pageHost,
          );
        }
      } else if (tagName === "link") {
        const rel = attributes.rel;
        if (rel && /(preconnect|dns-prefetch|preload|stylesheet)/i.test(rel)) {
          const href = attributes.href;
          if (href) {
            processExternalUrl(
              href,
              pageUrl,
              "link",
              false,
              line,
              trackers,
              findings,
              thirdPartyHosts,
              pageHost,
            );
          }
        }
      }

      // Move past the start tag
      line += countNewlines(html.slice(i, tagEnd));
      i = tagEnd;
    } else {
      if (html[i] === "\n") line++;
      i++;
    }
  }

  findings.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    if (a.tracker !== b.tracker) return a.tracker < b.tracker ? -1 : 1;
    return 0;
  });

  return {
    findings,
    thirdPartyHosts: Array.from(thirdPartyHosts).sort(),
  };
}

/**
 * Determines whether a script is gated based on its `type` attribute.
 */
function determineScriptGated(typeAttr: string | undefined): boolean {
  if (typeAttr === undefined) return false;
  const lower = typeAttr.toLowerCase();
  return !["", "text/javascript", "module", "application/javascript"].includes(lower);
}

/**
 * Processes an external URL (script src, img src, iframe src, link href).
 */
function processExternalUrl(
  raw: string,
  pageUrl: URL,
  element: "script" | "img" | "iframe" | "link",
  gated: boolean,
  line: number,
  trackers: readonly TrackerRule[],
  findings: Finding[],
  thirdPartyHosts: Set<string>,
  pageHost: string,
): void {
  let url: URL;
  try {
    url = new URL(raw, pageUrl);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  const host = url.hostname;
  const matched = matchTracker(host, url.pathname, trackers);
  if (matched) {
    findings.push({
      tracker: matched.name,
      category: matched.category,
      host,
      element,
      line,
      gated,
    });
  }

  if (!isFirstParty(host, pageHost)) {
    thirdPartyHosts.add(host);
  }
}

/**
 * Checks inline script content for tracker signatures.
 */
function checkInlineSignatures(
  content: string,
  trackers: readonly TrackerRule[],
  line: number,
  gated: boolean,
  findings: Finding[],
): void {
  for (const rule of trackers) {
    if (rule.signatures) {
      for (const signature of rule.signatures) {
        if (content.includes(signature)) {
          findings.push({
            tracker: rule.name,
            category: rule.category,
            host: "",
            element: "inline",
            line,
            gated,
          });
          break; // only one finding per tracker per inline script
        }
      }
    }
  }
}

/**
 * Renders a report as text or JSON.
 *
 * @param report - The report to render.
 * @param format - Either `'text'` or `'json'`.
 * @returns The rendered string.
 * @throws {TrackerError} with code `invalid_options` if format is invalid.
 */
export function renderReport(report: Report, format: "text" | "json"): string {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }
  if (format === "text") {
    return report.findings
      .map(
        (f) =>
          `line ${f.line}: ${f.tracker} (${f.category}) ${f.element} ${f.host}${f.gated ? " [gated]" : ""}`,
      )
      .join("\n");
  }
  throw new TrackerError("invalid_options", `Unsupported format: ${String(format)}`);
}
