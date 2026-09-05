# Worker entrypoint — same image as backend/app, different entrypoint (SPEC.md §4).
# FR-003 Job Queue & Worker Lifecycle: claims analysis_jobs with
# SELECT ... FOR UPDATE SKIP LOCKED, heartbeats, terminates in
# SUCCEEDED/FAILED/FAILED_PERMANENT, retries with JOB_MAX_ATTEMPTS backoff.
# Runs the ai/ pipeline (SPEC.md §6) and POSTs the result to
# /internal/incidents with WORKER_API_KEY (SPEC.md §3).
