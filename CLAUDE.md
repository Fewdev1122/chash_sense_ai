# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

The full `SPEC.md` §5 repository layout has been scaffolded (`backend/`, `ai/`, `config/`, `frontend/`, `worker/`, `docs/evaluation/`, `tests/`) — every file and directory the spec names exists, each stub annotated with its owning `FR-xxx`/section. **No pipeline, API, or business logic has been implemented yet.** Two exceptions carry real content because the spec gives it verbatim: `config/event_extractors.yaml` (the E-1…E-9 extractor definitions) and the `SEVERITY_DISCLAIMER`/`EVENT_DESCRIPTION_DISCLAIMER` strings (`frontend/src/constants/disclaimers.ts`, mirrored into `backend/app/domain/severity.py`). There is no build, lint, or test tooling wired up yet, and no Phase 0 dataset work has started (`docs/evaluation/*.md` are all placeholders).

Per `SPEC.md` §30/§31, actual implementation follows the phase order and Dev1(CV)/Dev2(backend+frontend)/Member3(eval+annotation) split already defined there — that table is the project plan; nothing else tracks "what's next" separately. Before writing logic into any stub, read the relevant `SPEC.md` section for that feature (`FR-xxx` requirement IDs are referenced throughout) — this project treats a spec/implementation mismatch as a defect, not a style choice.

## Project

CrashSense AI analyses recorded CCTV clips, detects vehicle collisions, reconstructs what was visually observed before/during/after impact, packages replayable evidence, and routes incidents to a human operator dashboard with a priority derived from visible impact mechanics. **It describes; it does not adjudicate** — no output may ever assert legal fault, cause, or liability (SPEC.md §0.1 P-4).

## Founding principles (binding — SPEC.md §0.1)

These constraints override normal engineering instincts and apply to every change:

- **Modular monolith.** One FastAPI app, one worker process, clear module boundaries. No microservices, no message broker beyond PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` as the job queue.
- **Explicit `UNKNOWN`.** Any value the system cannot establish is returned as `UNKNOWN` with a machine-readable `reason_code`. Never silently null, guess, or impute.
- **Full evidence traceability.** Every displayed claim must resolve to a stored measurement — a claim without a measurement is a defect.
- **No legal-fault language anywhere** — not in code, logs, UI strings, field names, or comments. See the forbidden-concept list below.
- **`original_ai_output` is immutable.** Operator corrections are stored alongside it, never in place of it, and must survive schema migration.
- **`config_hash` + `model_version` on every incident** — analysis must be reproducible from its recorded configuration.
- **Deterministic reasoning (MVP).** All MVP reasoning is a pure function of its inputs: no randomness, no network, no clock, no learned weights.
- **Rejected candidates are persisted** with their score breakdown and rejection reason, not discarded.
- **Evidence package or it didn't happen** — every incident ships all 7 replayable artefacts, produced atomically with incident creation.
- **Human-in-the-loop.** The system routes, prioritises, and describes. Humans decide.
- **TBD-BASELINE over invention.** An unmeasured threshold/target is written literally as `TBD-BASELINE`, never a provisional number. It must be resolved to a measured value in `docs/evaluation/` before appearing in any published artefact.

## Forbidden-concept guard (F-9 / F-10)

The spec bans cause/fault/blame vocabulary from the entire MVP code path, enforced by two tests that any new code must pass:

- **F-9** (contract, repo-wide grep): zero occurrences of `contributing_factor`, `likely_contributing_factors`, `RED_LIGHT_VIOLATION`, `UNSAFE_INTERSECTION_ENTRY`, `SUDDEN_LANE_CHANGE_OR_CUT_IN`, `LATE_OR_INSUFFICIENT_BRAKING`, `FAILURE_TO_STOP`, `cause_engine`, `cause_rules`, `cause_analysis`, `likely_cause`. Only Appendix A of SPEC.md and the F-9 test itself may name these strings.
- **F-10** (structural, symbol introspection): public symbols in `EventFactType` and the `ai/reasoning` package are split on snake_case/camelCase/dotted boundaries and lower-cased; no whole word may be in `{cause, causes, causal, causation, fault, faults, faulty, factor, factors, violation, violations, violated, blame, blames, liability, liable, guilt, guilty, negligence, negligent, responsibility, responsible, culpable, culpability}`. Note `factory`/`default_factory` are fine — whole-word matching only; `factor` and `primary_cause`-style compounds are not.

When naming anything in the reasoning/timeline/decision path, check both lists first.

## Planned architecture (SPEC.md §3–§6)

Single EC2 instance, docker compose, no CDN, no container orchestration:

- **API** — FastAPI (Python 3.11, Pydantic v2), modular: `api/`, `domain/`, `db/`, `core/`.
- **Worker** — same image, different entrypoint; polls `analysis_jobs` via `SELECT ... FOR UPDATE SKIP LOCKED`; reports terminal state `SUCCEEDED`/`FAILED`/`FAILED_PERMANENT`, always with a `reason_code`.
- **DB** — PostgreSQL 16, SQLAlchemy 2.0, Alembic migrations, JSONB for evidence structures. Also serves as the job queue.
- **CV pipeline** (`ai/`) — OpenCV 5 for decode/frame-sampling/HSV analysis/morphology/optical-flow/appearance/annotated rendering (must do *real* work, not be decorative — P-11); YOLO exported to ONNX + ONNX Runtime for detection (CUDA EP → CPU EP fallback); ByteTrack (pure Python) for tracking.
- **Frontend** — React 18 + TypeScript + Vite + TanStack Query + Tailwind + MapLibre.
- **Storage** — S3 for source video and evidence artefacts, accessed via presigned URLs (no CDN, no separate cache tier).
- **Narration (STRETCH, default off)** — provider-agnostic LLM client behind one interface.

Planned repo layout (SPEC.md §5):

```
crashsense/
├── backend/app/{api,domain,db,core}/
├── ai/{ingest,detect,track,trajectory,signals,collision,features,timeline,reasoning}/
├── config/*.yaml          # event_extractors.yaml, thresholds.yaml, severity_weights.yaml
├── frontend/src/{components,constants}/
├── worker/
├── docs/evaluation/
└── tests/
```

### Canonical processing pipeline

```
Decode/sample (OpenCV) → YOLO/ONNX detection → ByteTrack tracking → trajectory/motion features
  → collision signals S1–S6 → detection+verification (t0) → classification → accident timeline
  → observed event facts (stage 1) → StructuredEventEvidence (stage 2) → event description (stage 3, deterministic; optional constrained LLM narration falls back to deterministic on any failure)
  → Visual Impact Severity (parallel to description) → agentic decision engine
  → evidence package (7 artefacts) → incident creation (same atomic transaction as packaging)
  → operator dashboard + verification
```

Within stage 7 (FR-014), stage 1 → stage 2 → stage 3 is a strict dependency order: stage 2 is a pure projection of stage 1 and cannot be built first. Signal association (FR-008/FR-009) and vehicle appearance (FR-022) are optional inputs feeding into facts/evidence and are MVP SHOULD, not MUST. Narration (FR-023) is STRETCH, always downstream of the deterministic description, and never gates or influences the decision engine (see N-5).

## Key terminology (SPEC.md §0.4) — use exactly, don't rename

- **Observed Event Fact** — one measurement-backed statement about motion/geometry from the closed `EventFactType` enum. Never a conclusion.
- **Structured Event Evidence** — the machine-readable projection of all facts for one collision; sole input to description generation.
- **Event Description** — the natural-language paragraph, produced deterministically by default.
- **Accident Timeline** — chronologically ordered events, sharing the `EventFactType` vocabulary.
- **Visual Impact Severity** — heuristic band (`LOW`/`MODERATE`/`HIGH`/`UNKNOWN`) describing visible collision mechanics only — never medical/injury.
- **`relative_speed_proxy`** — internal, scale-normalised motion magnitude. Never displayed to a user, never given physical units (no km/h, mph, kph, vehicle-lengths, px/s — enforced by FE-15).
- **t0** — impact timestamp; all event offsets are `time_offset_s` relative to it.
- **Simulated responder workflow** — dashboard-only lifecycle states. No real external dispatch system exists or is contacted; this must be disclosed in the UI (FE-12).

## Requirement tiers (SPEC.md §0.2)

- **MVP MUST** — demo doesn't exist without it; blocks Definition of Done. Never dropped.
- **MVP SHOULD** — built if phase capacity allows; degrades cleanly to `UNKNOWN`/absence; never load-bearing.
- **STRETCH** — built only after all MVP MUST items are green; default-off; must be removable without touching another module.
- **V2** — explicitly out of scope; recorded to prevent scope creep.

If a STRETCH item threatens an MVP MUST item, cut the STRETCH item — don't compromise the MUST item to keep it.

## Testing (SPEC.md §32, once code exists)

Tests are ID-tagged in the spec (e.g. `T-3`, `C-1`, `DEC-2`, `EX-1`, `F-9`, `S-1`, `FE-9`, `E2E-1`) and grouped by kind: Unit, Integration, Contract, Structural, Migration, Frontend, End-to-end, Pipeline. When implementing a requirement, check SPEC.md §32 for the test IDs tied to it and implement against that exact assertion — the IDs are the source of truth for expected behavior, not just labels.

Two invariants worth internalizing because they're easy to violate accidentally:
- Determinism (`DEC-2`, `EX-1`, `T-1`): reasoning/decision/extraction code must not call `time`/`datetime`, `random`, or any network client, and must be provably unchanged under a patched clock and reseeded RNG.
- No fabrication (`TPL-2`, `EX-6`): a missing fact drops its clause in generated text; nothing is ever invented to fill a gap.

## Build Gate (SPEC.md §29)

Phase 5 exit gate — if it fails, drop tiers in this exact order: ENHANCED tier → FR-024 RTSP → FR-023 narration → FR-022 appearance → FR-008/FR-009 signal analysis. MVP MUST items are never dropped.
