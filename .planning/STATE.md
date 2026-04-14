# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Faceless content creators run automated YouTube/social channels without appearing on camera
**Current focus:** Wave 2 — Phase 04+ (next phase to plan/execute after Wave 1 complete)

## Current Position

Phase: 06-shorts-tiktok (Plan 02 complete ✅)
Plan: Wave 2 in progress — Phase 06 Plan 02 executed 2026-04-14
Status: 06-02 COMPLETE. TikTok OAuth 2.0 PKCE authorize + callback endpoints added to integrations_routes.py. GET /tiktok/oauth/authorize returns auth URL; GET /tiktok/oauth/callback exchanges code and stores accessToken/refreshToken/openId/tokenExpiresAt.
Last activity: 2026-04-14 — Phase 06-02 executed: backend/app/routes/integrations_routes.py

Progress: [███████████████░░░░░] ~50% (Wave 1 complete, Wave 2 phases 04+05+06-02 done)

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
- [2026-04-13]: Extracted _run_video_pipeline() in content_routes.py — Celery task delegates to it; avoids 200-line duplication
- [2026-04-13]: Redis DB split: DB0=broker, DB1=results, DB2=progress keys (TTL 7200s) — avoids key collisions
- [2026-04-13]: task_acks_late + task_reject_on_worker_lost — ensures task re-queued if worker OS process is killed
- [2026-04-13]: fal.ai idempotency via Redis — get_fal_request_id before submit, set_fal_request_id after receiving request_id
- [2026-04-14]: TikTok PKCE: inline `import requests as _req` in callback to avoid shadowing module-level requests import
- [2026-04-14]: TikTok state: base64 JSON encodes {user_id, code_verifier} — same pattern as YouTube OAuth
- [2026-04-14]: TikTok tokenExpiresAt stored as UTC epoch integer (int(time.time()) + expires_in) for easy downstream comparison

### Pending Todos

- Phase B (backlog): Wire Higgsfield API directly for auto video generation → store in S3. In ROADMAP.md backlog.

### Blockers/Concerns

- No MONGODB_URI, JWT_SECRET_KEY, or other secrets in local env — tests use mocks/mongomock (by design)
- 54-call frontend API audit complete: all routes verified. video-remotion + social posting routes confirmed.

## Session Continuity

Last session: 2026-04-14
Stopped at: Completed Phase 06 Plan 02 (TikTok OAuth PKCE — GET /tiktok/oauth/authorize + GET /tiktok/oauth/callback in integrations_routes.py)
Resume file: ~/.claude/handoffs/2026-04-13-socialflow-seedance-api-audit.md
