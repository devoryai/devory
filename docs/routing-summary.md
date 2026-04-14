# Routing Outcome Summary

Devory’s lightweight routing review path is built on the execution outcome
ledger written by the VS Code run surface. It is intentionally small and local:
there is no dashboard service, no telemetry backend, and no inferred metrics
outside what the ledger truthfully records.

## Source Of Truth

- Ledger path: `artifacts/routing-outcomes/execution-outcomes.jsonl`
- Writer: `Devory: Start Factory Run`
- Reader: `Devory: Show Routing Outcome Summary`

Each JSONL record is append-only and preserves the difference between:

- what routing selected
- what target resolution and adapter resolution actually bound
- whether fallback occurred
- whether execution completed, failed, was cancelled, blocked, or produced a
  no-op run

The summary command aggregates those records. It does not rescan `runs/`,
rebuild routing decisions from artifacts, or guess values that were never
captured.

## What The Ledger Records

The outcome ledger is compact by design. Current fields include:

- timestamp and sequence
- run id when known
- task ids
- compact task profile summary when available
- selected provider class, target, and adapter
- actual provider class, target, and adapter
- preference used
- fallback taken and fallback reason
- readiness state
- execution path
- estimated cloud cost range when a dry-run estimate exists
- final result status
- short failure reason when the runtime exposes one
- decomposition recommendation and learnable flag when derivable

Unknown values stay `null`. The ledger does not fabricate token totals,
quality scores, or execution details the current runtime does not emit.

## What The Summary Aggregates

The summary reader currently supports:

- total records summarized
- selected provider class counts
- actual provider class counts
- concrete target counts
- fallback count
- blocked count
- result status counts
- top fallback and block reasons
- estimated cost-range exposure only from ledger-backed min/max estimate fields

This is enough for manual tuning questions such as:

- how often local versus cloud was selected
- whether selected versus actual drift is happening
- whether fallback is common
- whether cloud was blocked by policy often enough to revisit defaults
- which concrete targets are carrying most runs

## Command Behavior

`Devory: Show Routing Outcome Summary`

- Available in: VS Code Command Palette
- Reads: `artifacts/routing-outcomes/execution-outcomes.jsonl`
- Writes: nothing
- Output surface: the Devory run output channel

Current filter surface is intentionally small:

- last 25 records
- last 50 records
- last 100 records
- all records

If the ledger does not exist or no records match the selected filter, the
command reports that honestly instead of showing empty derived metrics.

## Limits

- The summary is only as complete as the current outcome ledger.
- It reflects VS Code-ledgered runs, not every possible runtime in the repo.
- It preserves selected versus actual truth; it does not collapse them into one
  synthetic “effective route”.
- It supports manual review and policy tuning only. No automatic tuning is
  implemented.
