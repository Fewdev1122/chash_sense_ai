# CrashSense AI

CCTV collision analysis system. Detects vehicle collisions in recorded clips, reconstructs observed events before/during/after impact, packages replayable evidence, and routes results to a human operator dashboard with a priority derived from visible impact mechanics.

It describes. It does not adjudicate.

## Status

Specification stage. See [SPEC.md](SPEC.md) for the full software specification (architecture, requirements, data contracts, evaluation).

## Core Principles

- Modular monolith: one FastAPI app, one worker, no microservices.
- Explicit `UNKNOWN` over silence, null-as-guess, or imputation.
- Full evidence traceability — every displayed claim resolves to a stored measurement.
- No legal-fault claims anywhere in output.
- Deterministic reasoning — no randomness, network, clock, or learned weights in MVP.
- Human-in-the-loop — the system routes and describes; humans decide.
