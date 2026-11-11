import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run } from "../src/cli.js";

function createIO() {
  return {
    stdout: { write: vi.fn() },
    stderr: { write: vi.fn() },
  };
}

describe("CLI run", () => {
  it("writes finding to stdout and returns 1 for ungated tracker", async () => {
    // Create a temporary HTML file with a tracker
    const dir = await mkdtemp(join(tmpdir(), "tracker-audit-"));
    const filePath = join(dir, "test.html");
    await writeFile(
      filePath,
      '<script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>',
      "utf8",
    );

    const io = createIO();
    const exitCode = await run([filePath, "--page-url", "https://example.com/"], io);

    expect(exitCode).toBe(1);
    expect(io.stdout.write).toHaveBeenCalledWith(
      "line 1: Google Tag Manager (analytics) script www.googletagmanager.com\n",
    );
    expect(io.stderr.write).not.toHaveBeenCalled();
  });

  it("returns 0 when no ungated trackers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tracker-audit-"));
    const filePath = join(dir, "test.html");
    await writeFile(
      filePath,
      '<script type="text/plain" data-category="analytics" src="https://static.hotjar.com/c/hotjar-1.js"></script>',
      "utf8",
    );

    const io = createIO();
    const exitCode = await run([filePath, "--page-url", "https://example.com/"], io);

    expect(exitCode).toBe(0);
    expect(io.stdout.write).toHaveBeenCalledWith(
      "line 1: Hotjar (session_replay) script static.hotjar.com [gated]\n",
    );
  });

  it("returns 0 for a gated inline snippet", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tracker-audit-"));
    const filePath = join(dir, "test.html");
    await writeFile(filePath, "<script type=\"text/plain\">fbq('init', '1');</script>", "utf8");

    const io = createIO();
    const exitCode = await run([filePath, "--page-url", "https://example.com/"], io);

    expect(exitCode).toBe(0);
    expect(io.stdout.write).toHaveBeenCalledWith(
      "line 1: Meta Pixel (advertising) inline  [gated]\n",
    );
    expect(io.stderr.write).not.toHaveBeenCalled();
  });

  it("returns 2 for missing file", async () => {
    const io = createIO();
    const exitCode = await run(["nonexistent.html", "--page-url", "https://example.com/"], io);

    expect(exitCode).toBe(2);
    expect(io.stdout.write).not.toHaveBeenCalled();
    expect(io.stderr.write).toHaveBeenCalled();
  });
});

describe("CLI argument handling", () => {
  it("returns 2 with usage for no arguments and help flags", async () => {
    const io = createIO();
    expect(await run([], io)).toBe(2);
    expect(await run(["--help"], io)).toBe(2);
    expect(await run(["--page-url", "https://example.com/"], io)).toBe(2);
    expect(io.stderr.write).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });

  it("returns 2 when --page-url is missing", async () => {
    const io = createIO();
    expect(await run(["page.html"], io)).toBe(2);
    expect(io.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("Missing required --page-url"),
    );
  });

  it("returns 2 for an invalid format", async () => {
    const io = createIO();
    expect(
      await run(["page.html", "--page-url", "https://example.com/", "--format", "xml"], io),
    ).toBe(2);
    expect(io.stderr.write).toHaveBeenCalledWith("Invalid format: xml\n");
  });

  it("returns 2 for an unknown option", async () => {
    const io = createIO();
    expect(await run(["page.html", "--page-url", "https://example.com/", "--bogus"], io)).toBe(2);
    expect(io.stderr.write).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });

  it("renders JSON with a valid --format and returns 1 for an ungated tracker", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tracker-audit-"));
    const filePath = join(dir, "test.html");
    await writeFile(
      filePath,
      '<script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>',
      "utf8",
    );

    const io = createIO();
    const exitCode = await run(
      [filePath, "--page-url", "https://example.com/", "--format", "json"],
      io,
    );

    expect(exitCode).toBe(1);
    expect(io.stdout.write).toHaveBeenCalledWith(
      expect.stringContaining('"tracker": "Google Tag Manager"'),
    );
  });

  it("writes nothing in text format when there are no findings", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tracker-audit-"));
    const filePath = join(dir, "test.html");
    await writeFile(filePath, "<html></html>", "utf8");

    const io = createIO();
    const exitCode = await run([filePath, "--page-url", "https://example.com/"], io);

    expect(exitCode).toBe(0);
    expect(io.stdout.write).not.toHaveBeenCalled();
    expect(io.stderr.write).not.toHaveBeenCalled();
  });

  it("returns 2 when the page URL is invalid", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tracker-audit-"));
    const filePath = join(dir, "test.html");
    await writeFile(filePath, "<html></html>", "utf8");

    const io = createIO();
    const exitCode = await run([filePath, "--page-url", "not a url"], io);

    expect(exitCode).toBe(2);
    expect(io.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("pageUrl is not a valid URL"),
    );
  });
});
