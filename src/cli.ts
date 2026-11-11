import { readFile } from "node:fs/promises";
import { auditHtml, renderReport, TrackerError } from "./index.js";

/**
 * Input/output streams for the CLI. Useful for testing.
 */
export interface CLIStreams {
  stdout: { write: (data: string) => void };
  stderr: { write: (data: string) => void };
}

/**
 * Runs the tracker-audit command-line interface.
 *
 * @param argv - Process arguments (excluding node and script path).
 * @param io - Streams to write output.
 * @returns Exit code: 0 if no ungated tracker, 1 if ungated tracker found, 2 on usage/IO error.
 */
export async function run(argv: string[], io: CLIStreams): Promise<number> {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    io.stderr.write(USAGE);
    return 2;
  }

  const filePath = argv[0];
  if (!filePath || filePath.startsWith("--")) {
    io.stderr.write(USAGE);
    return 2;
  }

  let pageUrl: string | undefined;
  let format: "text" | "json" = "text";
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--page-url" && i + 1 < argv.length) {
      pageUrl = argv[++i];
    } else if (arg === "--format" && i + 1 < argv.length) {
      const fmt = argv[++i];
      if (fmt !== "text" && fmt !== "json") {
        io.stderr.write(`Invalid format: ${fmt}\n`);
        return 2;
      }
      format = fmt;
    } else {
      io.stderr.write(USAGE);
      return 2;
    }
  }

  if (!pageUrl) {
    io.stderr.write("Missing required --page-url option.\n");
    io.stderr.write(USAGE);
    return 2;
  }

  let html: string;
  try {
    html = await readFile(filePath, "utf8");
  } catch (error) {
    io.stderr.write(`Error reading file: ${(error as Error).message}\n`);
    return 2;
  }

  try {
    const report = auditHtml(html, { pageUrl });
    const output = renderReport(report, format);
    if (output.length > 0) {
      io.stdout.write(`${output}\n`);
    }
    const hasUngated = report.findings.some((f) => !f.gated);
    return hasUngated ? 1 : 0;
  } catch (error) {
    if (error instanceof TrackerError) {
      io.stderr.write(`Error: ${error.message}\n`);
    } else {
      io.stderr.write(`Unexpected error: ${(error as Error).message}\n`);
    }
    return 2;
  }
}

const USAGE = `Usage: tracker-audit <html-file> --page-url <url> [--format text|json]
`;
