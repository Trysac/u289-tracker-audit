# Tokenizer-based offline tracker audit

Status: accepted (generated, pending human review)

## Context

Privacy reviews need a list of third-party trackers loaded by a page and their consent gating status without running a browser. The tool must be deterministic, fast, and safe to run on untrusted HTML.

## Decision

Implement a bounded linear scanner that tokenizes HTML without building a DOM, using a tolerant tag and attribute parser. Tracker matching uses an explicit vendor table of domains and inline signatures. Consent gating is inferred from type attributes and data-src usage.

## Consequences

The library is fast, offline, and has no dependencies. It may miss trackers loaded dynamically or with obfuscated domains, but it satisfies CI use cases on static HTML. The tokenizer is not a full HTML parser and may misinterpret edge cases, which are documented.
