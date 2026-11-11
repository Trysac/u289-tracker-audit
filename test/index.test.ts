import { describe, expect, it } from "vitest";
import type { TrackerRule } from "../src/index.js";
import { auditHtml, DEFAULT_TRACKERS, renderReport } from "../src/index.js";

describe("auditHtml", () => {
  it("detects Google Tag Manager script", () => {
    const html = '<script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>';
    const report = auditHtml(html, { pageUrl: "https://example.com/" });
    expect(report.findings).toEqual([
      {
        tracker: "Google Tag Manager",
        category: "analytics",
        host: "www.googletagmanager.com",
        element: "script",
        line: 1,
        gated: false,
      },
    ]);
    expect(report.thirdPartyHosts).toEqual(["www.googletagmanager.com"]);
  });

  it("detects Meta Pixel image and ignores non-tracker link", () => {
    const html =
      '<img src="https://www.facebook.com/tr?id=1&ev=PageView" height="1" width="1">' +
      '<a href="https://www.facebook.com/example">link</a>';
    const report = auditHtml(html, { pageUrl: "https://example.com/" });
    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0];
    expect(finding).toBeDefined();
    expect(finding?.tracker).toBe("Meta Pixel");
    expect(finding?.category).toBe("advertising");
    expect(finding?.element).toBe("img");
    expect(finding?.gated).toBe(false);
  });

  it("does not match lookalike domains and reports third-party hosts", () => {
    const html =
      '<script src="https://notgoogle-analytics.com/a.js"></script>' +
      '<script src="https://google-analytics.com.evil.example/a.js"></script>';
    const report = auditHtml(html, { pageUrl: "https://example.com/" });
    expect(report.findings).toEqual([]);
    expect(report.thirdPartyHosts).toEqual([
      "google-analytics.com.evil.example",
      "notgoogle-analytics.com",
    ]);
  });

  it("marks script as gated when type is non-JavaScript", () => {
    const html =
      '<script type="text/plain" data-category="analytics" src="https://static.hotjar.com/c/hotjar-1.js"></script>';
    const report = auditHtml(html, { pageUrl: "https://example.com/" });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.tracker).toBe("Hotjar");
    expect(report.findings[0]?.category).toBe("session_replay");
    expect(report.findings[0]?.gated).toBe(true);
  });

  it("detects inline snippet and ignores comments and plain text", () => {
    // An inline '<script>fbq(\'init\', \'1\');</script>' is detected, the same tag
    // inside '<!-- ... -->' gives nothing, and 'fbq(' inside a <p> text gives nothing.
    const inline = "<script>fbq('init', '1');</script>";
    const comment = "<!-- <script>fbq('init', '1');</script> -->";
    const placeholder = "<!-- ... -->";
    const text = "<p>fbq('init', '1');</p>";

    const report1 = auditHtml(inline, { pageUrl: "https://example.com/" });
    expect(report1.findings).toHaveLength(1);
    expect(report1.findings[0]?.tracker).toBe("Meta Pixel");
    expect(report1.findings[0]?.element).toBe("inline");
    expect(report1.findings[0]?.gated).toBe(false);

    const report2 = auditHtml(comment, { pageUrl: "https://example.com/" });
    expect(report2.findings).toEqual([]);

    const report3 = auditHtml(text, { pageUrl: "https://example.com/" });
    expect(report3.findings).toEqual([]);

    const report4 = auditHtml(placeholder, { pageUrl: "https://example.com/" });
    expect(report4.findings).toEqual([]);
  });

  it("marks inline snippets behind a non-JavaScript type as gated", () => {
    const html = "<script type=\"text/plain\">fbq('init', '1');</script>";
    const report = auditHtml(html, { pageUrl: "https://example.com/" });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.element).toBe("inline");
    expect(report.findings[0]?.tracker).toBe("Meta Pixel");
    expect(report.findings[0]?.gated).toBe(true);
  });

  it("treats first-party hosts correctly", () => {
    const html =
      '<script src="/js/app.js"></script>' +
      '<script src="https://cdn.example.com/x.js"></script>' +
      '<script src="https://other.net/x.js"></script>';
    const report = auditHtml(html, { pageUrl: "https://example.com/" });
    expect(report.thirdPartyHosts).toEqual(["other.net"]);
  });

  it("throws input_too_large when exceeding maxBytes", () => {
    const html = "x".repeat(5_242_881); // 1 byte more than default max
    expect(() => auditHtml(html, { pageUrl: "https://example.com/" })).toThrowError(
      expect.objectContaining({ code: "input_too_large" }),
    );
  });

  it("throws invalid_options for invalid pageUrl", () => {
    expect(() => auditHtml("<html></html>", { pageUrl: "not a url" })).toThrowError(
      expect.objectContaining({ code: "invalid_options" }),
    );
  });

  it("throws invalid_tracker for bad custom tracker", () => {
    const badTrackers: TrackerRule[] = [
      {
        name: "Bad",
        category: "analytics",
        domains: ["bad domain"],
      },
    ];
    expect(() =>
      auditHtml("<html></html>", { pageUrl: "https://example.com/", trackers: badTrackers }),
    ).toThrowError(expect.objectContaining({ code: "invalid_tracker" }));
  });

  it("handles uppercase tags and attributes, unquoted src", () => {
    const html = "<SCRIPT SRC=https://www.googletagmanager.com/gtag/js?id=G-1></SCRIPT>";
    const report = auditHtml(html, { pageUrl: "https://example.com/" });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.host).toBe("www.googletagmanager.com");
    expect(report.findings[0]?.element).toBe("script");
  });

  it("resolves protocol-relative URLs", () => {
    const html = '<script src="//www.google-analytics.com/analytics.js"></script>';
    const report = auditHtml(html, { pageUrl: "https://example.com/" });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.tracker).toBe("Google Analytics");
    expect(report.findings[0]?.host).toBe("www.google-analytics.com");
  });

  it("handles script end tag split across lines", () => {
    const html = "<script>\nfbq('init', '1');\n</script>";
    const report = auditHtml(html, { pageUrl: "https://example.com/" });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.line).toBe(1); // inline content starts on line 1 (the <script> tag line)
  });

  it("handles malformed tag at end of input", () => {
    const html = '<script src="https://www.googletagmanager.com/gtag/js?id=G-1"';
    const report = auditHtml(html, { pageUrl: "https://example.com/" });
    expect(report.findings).toEqual([]);
    expect(report.thirdPartyHosts).toEqual([]);
  });
});

describe("renderReport", () => {
  it("renders text correctly", () => {
    const report = {
      findings: [
        {
          tracker: "Google Tag Manager",
          category: "analytics" as const,
          host: "www.googletagmanager.com",
          element: "script" as const,
          line: 1,
          gated: false,
        },
        {
          tracker: "Meta Pixel",
          category: "advertising" as const,
          host: "",
          element: "inline" as const,
          line: 2,
          gated: false,
        },
      ],
      thirdPartyHosts: ["www.googletagmanager.com"],
    };
    const text = renderReport(report, "text");
    expect(text).toBe(
      "line 1: Google Tag Manager (analytics) script www.googletagmanager.com\n" +
        "line 2: Meta Pixel (advertising) inline ",
    );
  });

  it("renders JSON correctly", () => {
    const report = {
      findings: [],
      thirdPartyHosts: [],
    };
    const json = renderReport(report, "json");
    expect(json).toBe(JSON.stringify(report, null, 2));
  });

  it("throws on invalid format", () => {
    expect(() => renderReport({ findings: [], thirdPartyHosts: [] }, "xml" as never)).toThrowError(
      expect.objectContaining({ code: "invalid_options" }),
    );
  });

  it("renders the gated marker in text format", () => {
    const report = {
      findings: [
        {
          tracker: "Hotjar",
          category: "session_replay" as const,
          host: "static.hotjar.com",
          element: "script" as const,
          line: 1,
          gated: true,
        },
      ],
      thirdPartyHosts: ["static.hotjar.com"],
    };
    expect(renderReport(report, "text")).toBe(
      "line 1: Hotjar (session_replay) script static.hotjar.com [gated]",
    );
  });
});

describe("DEFAULT_TRACKERS", () => {
  it("contains expected trackers", () => {
    const names = DEFAULT_TRACKERS.map((t) => t.name);
    expect(names).toEqual([
      "Google Analytics",
      "Google Tag Manager",
      "Google Ads",
      "Meta Pixel",
      "Hotjar",
      "Microsoft Clarity",
      "LinkedIn Insight",
      "TikTok Pixel",
      "X Pixel",
      "Segment",
    ]);
  });

  it("all domains match the domain regex", () => {
    for (const rule of DEFAULT_TRACKERS) {
      for (const domain of rule.domains) {
        expect(domain).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
      }
    }
  });
});

describe("auditHtml edge cases", () => {
  it("decodes entities and handles single-quoted module scripts", () => {
    const html =
      "<script type='module' src='https://www.googletagmanager.com/x?a=1&amp;b=2' data-x=\"&quot;&amp;&#39;\"></script>";
    const report = auditHtml(html, { pageUrl: "https://example.com/" });
    expect(report.findings).toEqual([
      {
        tracker: "Google Tag Manager",
        category: "analytics",
        host: "www.googletagmanager.com",
        element: "script",
        line: 1,
        gated: false,
      },
    ]);
  });

  it("handles iframes with data-src and link elements", () => {
    const html =
      '<iframe data-src="https://www.facebook.com/tr?id=1"></iframe>' +
      '<link rel="preconnect" href="https://cdn.segment.com">' +
      '<link rel="dns-prefetch" href="https://api.segment.io">' +
      '<link rel="preload" href="https://static.hotjar.com/x.js">' +
      '<link rel="stylesheet" href="https://snap.licdn.com/x.css">' +
      '<link rel="icon" href="https://www.google-analytics.com/favicon.ico">' +
      '<link rel="preconnect">';
    const report = auditHtml(html, { pageUrl: "https://example.com/" });
    expect(report.findings.map((f) => f.tracker)).toEqual([
      "Hotjar",
      "LinkedIn Insight",
      "Meta Pixel",
      "Segment",
      "Segment",
    ]);
    const iframeFinding = report.findings.find((f) => f.element === "iframe");
    expect(iframeFinding?.gated).toBe(true);
    expect(report.thirdPartyHosts).toEqual([
      "api.segment.io",
      "cdn.segment.com",
      "snap.licdn.com",
      "static.hotjar.com",
      "www.facebook.com",
    ]);
  });

  it("skips style and script content up to missing end tags", () => {
    const closed = auditHtml("<style>body { color: red; }</style><style>.b { color: blue; }", {
      pageUrl: "https://example.com/",
    });
    expect(closed.findings).toEqual([]);
    expect(closed.thirdPartyHosts).toEqual([]);

    const unclosedScript = auditHtml("<script>fbq('init', '1');", {
      pageUrl: "https://example.com/",
    });
    expect(unclosedScript.findings).toEqual([]);
  });

  it("ignores invalid and non-http URLs", () => {
    const html =
      '<script src="ftp://www.google-analytics.com/a.js"></script>' +
      '<script src="http://["></script>' +
      '<script src="data:text/javascript,fbq("></script>';
    const report = auditHtml(html, { pageUrl: "https://example.com/" });
    expect(report.findings).toEqual([]);
    expect(report.thirdPartyHosts).toEqual([]);
  });

  it("handles custom trackers with paths and inline signatures", () => {
    const trackers: TrackerRule[] = [
      {
        name: "Social",
        category: "social",
        domains: ["example.org"],
        paths: { "example.org": "/p" },
        signatures: ["socialTrack("],
      },
    ];
    const html =
      '<script src="https://example.org/p/a.js"></script>' +
      '<script src="https://example.org/x.js"></script>' +
      "<script>socialTrack('x');</script>";
    const report = auditHtml(html, { pageUrl: "https://example.com/", trackers });
    expect(report.findings).toEqual([
      {
        tracker: "Social",
        category: "social",
        host: "example.org",
        element: "script",
        line: 1,
        gated: false,
      },
      {
        tracker: "Social",
        category: "social",
        host: "",
        element: "inline",
        line: 1,
        gated: false,
      },
    ]);
    expect(report.thirdPartyHosts).toEqual(["example.org"]);
  });

  it("sorts findings by line then tracker", () => {
    const html =
      '<script src="https://www.google-analytics.com/a.js"></script>\n' +
      '<script src="https://www.googletagmanager.com/a.js"></script>';
    const report = auditHtml(html, { pageUrl: "https://example.com/" });
    expect(report.findings.map((f) => [f.line, f.tracker])).toEqual([
      [1, "Google Analytics"],
      [2, "Google Tag Manager"],
    ]);
  });

  it("tolerates empty and malformed tags", () => {
    const report = auditHtml("<>" + "<div =foo data-x='y'>text</div>" + "</", {
      pageUrl: "https://example.com/",
    });
    expect(report.findings).toEqual([]);
  });

  it("ignores an unclosed comment", () => {
    const report = auditHtml("<!-- unclosed <script>fbq('init', '1');</script>", {
      pageUrl: "https://example.com/",
    });
    expect(report.findings).toEqual([]);
  });

  it("throws invalid_options for bad maxBytes and non-http page URLs", () => {
    expect(() =>
      auditHtml("<p></p>", { pageUrl: "https://example.com/", maxBytes: 0 }),
    ).toThrowError(expect.objectContaining({ code: "invalid_options" }));
    expect(() => auditHtml("<p></p>", { pageUrl: "ftp://example.com/" })).toThrowError(
      expect.objectContaining({ code: "invalid_options" }),
    );
  });

  it("rejects malformed tracker rules", () => {
    const base: TrackerRule = { name: "X", category: "analytics", domains: ["x.com"] };
    const invalid: TrackerRule[] = [
      { ...base, name: "" },
      { ...base, category: "other" as TrackerRule["category"] },
      { ...base, domains: [] },
      { ...base, paths: { "y.com": "/p" } },
      { ...base, paths: { "x.com": "" } },
      { ...base, paths: null as never },
      { ...base, signatures: "nope" as never },
      { ...base, signatures: [""] },
    ];
    for (const rule of invalid) {
      expect(() =>
        auditHtml("<p></p>", { pageUrl: "https://example.com/", trackers: [rule] }),
      ).toThrowError(expect.objectContaining({ code: "invalid_tracker" }));
    }
    expect(() =>
      auditHtml("<p></p>", {
        pageUrl: "https://example.com/",
        trackers: Array.from({ length: 51 }, () => base),
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_tracker" }));
    expect(() =>
      auditHtml("<p></p>", { pageUrl: "https://example.com/", trackers: null as never }),
    ).toThrowError(expect.objectContaining({ code: "invalid_tracker" }));
  });
});
