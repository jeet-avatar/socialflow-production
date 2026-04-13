# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Faceless content creators run automated YouTube/social channels without appearing on camera
**Current focus:** Wave 2 — Phase 04+ (next phase to plan/execute after Wave 1 complete)

## Current Position

Phase: 04-ai-model-layer (Plan 01 complete ✅)
Plan: Wave 2 in progress — Phase 04 Plan 01 executed 2026-04-13
Status: 04-01 COMPLETE. AI pipeline model-agnostic via ModelConfig + resolve_model_config. 26/26 tests pass.
Last activity: 2026-04-13 — Phase 04-01 executed: provider_config.py, /providers endpoint, 4 call sites wired, useModelConfig hook

Progress: [████████████░░░░░░░░] ~35% (Wave 1 complete, Wave 2 next)

## Completed Milestones

- Wave 1 (PR #1 + #2 + #3): Infrastructure, DB schema, enterprise readiness, 25 backend tests, Seedance Studio — all merged to main.
- Phase 04 Plan 01: AI model layer — ModelConfig dataclass, resolve_model_config(), GET /providers, 4 call sites wired, useModelConfig hook, 4 tests passing.

## Performance Metrics

- Phases planned: 10
- Plans ready: 3 (Wave 1)
- Plans backlog: 7 (Waves 2-4)

## Accumulated Context

### Architecture Decisions

- Repo: `jeet-avatar/socialflow-production` (cleaned import from meghana-techcloudpro/socialflowproject)
- ARCHITECTURE.md committed with full gap analysis (6 critical gaps, 8 important gaps)
- Wave 1 detailed plan: `docs/superpowers/plans/2026-04-12-wave1-foundation.md` (1802 lines)
- Local clone: `/tmp/sf-prod/`
- Old working dir (no code): `/tmp/socialflow-final/` — ignore
- Pricing: $29 starter / $79 creator / $199 agency (DO NOT use $49 — hardcoded bug to fix in P2)

### Decisions

- [2026-04-12]: Parallel wave execution — same pattern as ArthaBuild. Phases 01/02/03 run simultaneously in git worktrees.
- [2026-04-12]: ArthaBuild rules apply — no approval gates, autonomous execution, 60% context = new window.
- [2026-04-12]: Auth: Clerk is active auth. Auth0 code is dead — remove it in Phase 02.
- [2026-04-12]: S3 bucket: `d2nbx2qjod9qta.cloudfront.net` (CloudFront) for video storage
- [2026-04-13]: API keys always from env vars in ModelConfig — never from DB doc (credential safety)
- [2026-04-13]: resolve_model_config() wraps DB access in try/except — DB unavailable must not crash AI pipeline
- [2026-04-13]: /providers route registered before /{channel_id} — FastAPI routes literal strings before path params
- [2026-04-13]: research_provider wiring deferred to phase-08 — TODO comment added in content_routes.py

### Pending Todos

- Phase B (backlog): Wire Higgsfield API directly for auto video generation → store in S3. In ROADMAP.md backlog.

### Blockers/Concerns

- No MONGODB_URI, JWT_SECRET_KEY, or other secrets in local env — tests use mocks/mongomock (by design)
- 54-call frontend API audit complete: all routes verified. video-remotion + social posting routes confirmed.

## Session Continuity

Last session: 2026-04-13
Stopped at: Completed Phase 04 Plan 01 (AI model layer — ModelConfig + resolve_model_config + /providers + useModelConfig hook)
Resume file: ~/.claude/handoffs/2026-04-13-socialflow-seedance-api-audit.md
