# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Faceless content creators run automated YouTube/social channels without appearing on camera
**Current focus:** Wave 2 — Phase 04+ (next phase to plan/execute after Wave 1 complete)

## Current Position

Phase: 08-scheduling-analytics (Plan 01 complete ✅)
Plan: Wave 2 in progress — Phase 08 Plan 01 executed 2026-04-14
Status: 06-01 COMPLETE. Remotion SSR pipeline (bundle+selectComposition+renderMedia); SocialFlowVideoShorts 9:16 portrait (1080x1920); both compositions registered in index.tsx; TypeScript zero errors; remotion@4.0.435 pinned.
       06-02 COMPLETE. TikTok OAuth 2.0 PKCE authorize + callback endpoints added to integrations_routes.py.
       06-03 COMPLETE. tiktok_post_helper.py with token refresh + PULL_FROM_URL + FILE_UPLOAD fallback; POST /post-to-tiktok route in content_routes.py; 7 unit tests all passing.
       07-01 COMPLETE. ChannelDashboard.tsx (channel list + create modal + auto-post toggle + onOpenPipeline); ModelPicker.tsx (reusable provider selector cards). TypeScript zero errors.
       07-02 COMPLETE. PipelineBuilder.tsx (per-channel AI pipeline config with 3 ModelPicker sections, save via POST /model-config); Dashboard.tsx wired with Channels nav + ChannelDashboard tab + AnimatePresence PipelineBuilder overlay.
       08-01 COMPLETE. APScheduler per-channel cron scheduling with MongoDBJobStore persistence; niche-to-dialogue generation before render_video_task dispatch; sync_channel() wired into channel PUT; scheduler lifespan + analytics_router registered in main.py.
Last activity: 2026-04-14 — Phase 08-01 executed: scheduler.py, channel_routes.py, main.py, requirements.txt

Progress: [████████████████████] ~72% (Wave 1 complete, Wave 2 phases 04+05+06-01+06-02+06-03+07-01+07-02+08-01 done)

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
- [2026-04-14]: Remotion compositionId defaults to SocialFlowVideo — existing callers unaffected when compositionId not passed
- [2026-04-14]: bundle() runs once at startup (not per-request) — improves p99 render latency; 503 until bundleReady=true
- [2026-04-14]: Safe-zone wrapper uses CSS padding (15%/8%/25%) inside AbsoluteFill for TikTok/Shorts UI chrome avoidance
- [2026-04-14]: TikTok post: PULL_FROM_URL for URLs, FILE_UPLOAD fallback for local paths or domain_not_verified errors
- [2026-04-14]: TikTok token refresh window 60 min — refresh before posting if tokenExpiresAt within 3600s
- [2026-04-14]: TikTok privacy defaults to SELF_ONLY for unaudited apps; PUBLIC_TO_EVERYONE only if creator_info confirms it
- [2026-04-14]: ChannelDashboard uses optimistic update with revert on PUT failure — avoids loading state for toggle UX
- [2026-04-14]: ModelPicker is named export (not default) — PipelineBuilder (plan 02) imports it as named import
- [2026-04-14]: Full Tailwind class strings only in ModelPicker — no template literals with variable color segments (purge safety)
- [2026-04-14]: TikTok status poll PROCESSING after 2 min is non-fatal (success=True) — post is in-flight
- [2026-04-14]: PipelineBuilder channelId is required string (not optional) — Dashboard gates mount with activePipelineChannel && check
- [2026-04-14]: PipelineBuilder updateConfig calls POST /model-config (upsert) — no PUT route exists in backend
- [2026-04-14]: AnimatePresence wraps the overlay div; framer-motion motion.div inside PipelineBuilder handles slide-in animation
- [2026-04-14]: APScheduler MongoDBJobStore persists jobs in apscheduler_jobs collection — cron jobs survive ECS restarts
- [2026-04-14]: generate_marketing_package called inside _run_channel_pipeline BEFORE render_video_task.delay — prevents "dialogue is required" silent Celery failures
- [2026-04-14]: SCHEDULER_ENABLED=false env var disables APScheduler on non-primary ECS tasks (multi-process distributed locking not supported)
- [2026-04-14]: analytics_router registered in main.py in Plan 08-01 — Plan 08-02 must create analytics_routes.py before app can start successfully

### Pending Todos

- Phase B (backlog): Wire Higgsfield API directly for auto video generation → store in S3. In ROADMAP.md backlog.

### Blockers/Concerns

- No MONGODB_URI, JWT_SECRET_KEY, or other secrets in local env — tests use mocks/mongomock (by design)
- 54-call frontend API audit complete: all routes verified. video-remotion + social posting routes confirmed.

## Session Continuity

Last session: 2026-04-14
Stopped at: Completed Phase 08 Plan 01 (APScheduler per-channel cron scheduling — scheduler.py, channel_routes.py sync_channel wiring, main.py scheduler lifespan + analytics_router registration, APScheduler==3.11.* in requirements.txt)
Resume file: ~/.claude/handoffs/2026-04-13-socialflow-seedance-api-audit.md
