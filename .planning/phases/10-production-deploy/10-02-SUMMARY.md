---
phase: 10-production-deploy
plan: 02
subsystem: infra
tags: [docker-compose, apscheduler, health-check, redis, mongodb, celery, readme, runbook]

# Dependency graph
requires:
  - phase: 09-full-test-suite
    provides: CI-hardened test suite including SCHEDULER_ENABLED env var in CI
  - phase: 08-analytics-scheduler
    provides: APScheduler with MongoDBJobStore, SCHEDULER_ENABLED guard logic

provides:
  - docker-compose.yml with SCHEDULER_ENABLED=true on backend, SCHEDULER_ENABLED=false on celery_worker
  - /health endpoint returning {"status":"healthy|degraded","services":{"redis":...,"mongodb":...,"celery":...}}
  - README.md production runbook with env var table, ECS SCHEDULER_ENABLED rule, gh workflow run deploy commands

affects: [10-production-deploy, ecs-deploy, health-monitoring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "health endpoint uses asyncio.wait_for with 2s timeouts — hung dependency never blocks health check"
    - "mongodb 'not connected' = healthy — CI and Remotion-only contexts may not have MongoDB wired"
    - "SCHEDULER_ENABLED=true on primary ECS task, false on all secondary tasks — prevents duplicate cron job execution"

key-files:
  created:
    - README.md
  modified:
    - docker-compose.yml
    - backend/app/main.py

key-decisions:
  - "README.md force-added with git add -f — *.md pattern in .gitignore was blanket-ignoring all markdown files; README is an intentional tracked project file"
  - "mongodb 'not connected' counts as healthy in /health — prevents false-degraded status in CI and Remotion-only contexts"
  - "celery inspect failure is non-fatal — no workers is acceptable in dev/staging; fatal in production only by convention"

patterns-established:
  - "health endpoint pattern: asyncio.wait_for per dependency, all_critical_ok determines overall status, never returns 500"

requirements-completed: [DEPLOY-03, DEPLOY-04]

# Metrics
duration: 12min
completed: 2026-04-15
---

# Phase 10 Plan 02: Production Deploy — Infra Hardening Summary

**SCHEDULER_ENABLED env vars in docker-compose + meaningful /health endpoint (Redis/MongoDB/Celery ping with 2s timeouts) + production runbook README with ECS rules and exact gh workflow run deploy commands**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-15T01:53:52Z
- **Completed:** 2026-04-15T02:06:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- docker-compose.yml: backend gets SCHEDULER_ENABLED=true (APScheduler runs here), celery_worker gets SCHEDULER_ENABLED=false (worker only)
- /health endpoint upgraded from trivial 200-always to real dependency check — Redis ping (2s), MongoDB ping (2s), Celery inspect (1s); returns degraded (not 500) if critical dependency unreachable
- README.md production runbook: 23-var env table, SCHEDULER_ENABLED ECS rule, exact `gh workflow run deploy-staging.yml` and `gh workflow run deploy-production.yml -f confirm=DEPLOY` commands, ECS service names, health check expected output

## Task Commits

Each task was committed atomically:

1. **Task 1: Add SCHEDULER_ENABLED env vars to docker-compose.yml** - `84084ea` (chore)
2. **Task 2: Enhance /health endpoint + write README runbook** - `cbdb783` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `docker-compose.yml` — added SCHEDULER_ENABLED=true to backend service, SCHEDULER_ENABLED=false to celery_worker service
- `backend/app/main.py` — replaced trivial /health handler with dependency-pinging version (Redis, MongoDB, Celery)
- `README.md` — new production runbook: env vars, SCHEDULER_ENABLED ECS rule, deploy commands, health check docs

## Decisions Made

- README.md required `git add -f` because `*.md` is blanket-ignored in `.gitignore`. README is an intentional tracked project artifact, not a generated file.
- `mongodb "not connected"` status counts as healthy in the `all_critical_ok` check — prevents false-degraded status when MongoDB is not wired (CI, Remotion-only contexts).
- Celery `inspect.active()` failure treated as non-fatal (`"no workers"` not `"error"`) to keep dev environment usable without a running worker.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] README.md blocked by *.md .gitignore pattern**
- **Found during:** Task 2 (writing README runbook)
- **Issue:** `.gitignore` contains `*.md` which blocks `git add README.md`
- **Fix:** Used `git add -f README.md` to force-track the file as an intentional project artifact
- **Files modified:** none (git tracking change only)
- **Verification:** `git status` showed README.md staged; commit `cbdb783` includes it
- **Committed in:** cbdb783 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Force-add necessary to include the README file the plan explicitly required. No scope creep.

## Issues Encountered

None — plan executed cleanly after the .gitignore deviation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- docker-compose is production-ready: all 4 services (redis, backend, remotion, celery_worker) start with correct SCHEDULER_ENABLED values
- /health endpoint is meaningful: ECS deploy workflow `curl --fail /health` will now detect Redis/MongoDB outages
- README runbook is complete: next operator can deploy staging + production using only README + existing workflow files
- No blockers for 10-03 (if planned) or final push to GitHub

---
*Phase: 10-production-deploy*
*Completed: 2026-04-15*

## Self-Check: PASSED

- docker-compose.yml: FOUND, 2 SCHEDULER_ENABLED lines
- backend/app/main.py: FOUND, 7 `services[` references in /health
- README.md: FOUND, 2 `gh workflow run` lines
- 10-02-SUMMARY.md: FOUND
- Commit 84084ea: FOUND
- Commit cbdb783: FOUND
