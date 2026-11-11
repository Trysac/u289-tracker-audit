# 0001 Record architecture decisions

## Status

Accepted.

## Context

The repository needs a durable record of the choices that shape the code, so that contributors and coding
agents do not undo them by accident. Several decisions are load-bearing and easy to "improve" wrongly: the
absence of a DOM parser, the absence of a Public Suffix List, and the gating rule.

## Decision

Architecture decisions are recorded as numbered Markdown files in `docs/decisions/`, named
`NNNN-title.md`, starting at `0001`. Each record states its status, context, decision and consequences.
Superseding a record writes a new one that links back instead of editing history.

The first decisions captured this way:

1. A bounded, linear, tolerant tokenizer replaces a DOM parser: no dependency, predictable cost on hostile
   input, and enough fidelity for the elements and attributes that matter.
2. The first-party test is a documented host-suffix approximation without the Public Suffix List; the
   approximation is called out in [ARCHITECTURE.md](../ARCHITECTURE.md).
3. Gating follows the `type` attribute for external and inline scripts alike, because consent managers use
   `type="text/plain"` for both forms.

## Consequences

- New architectural decisions require a new record and a changelog entry.
- Behaviour changes to the tokenizer, the matcher or the gating rule must reference the relevant record in
  their pull request.
- Documentation stays consistent with the code: a record that no longer matches the code is superseded, never
  silently edited.
