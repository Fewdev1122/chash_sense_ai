// Single source of truth for mandatory disclaimer strings (SPEC.md §13.4, §19.2).
// Mirrored in backend/app/domain/severity.py::SEVERITY_DISCLAIMER. Any surface
// rendering a Visual Impact Severity band or an event_description must show
// the exact corresponding string below, visible without hover or truncation
// (FE-AC-7, FE-AC-8, FE-10, FE-14, S-2).

export const SEVERITY_DISCLAIMER =
  "Visual impact estimate only — not an injury or medical assessment.";

export const EVENT_DESCRIPTION_DISCLAIMER =
  "AI-generated description based on observed visual evidence. It does not determine legal fault or responsibility.";
