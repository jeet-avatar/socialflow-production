# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Faceless content creators run automated YouTube/social channels without appearing on camera
**Current focus:** Wave 2 — Phase 04+ (next phase to plan/execute after Wave 1 complete)

## Current Position

Phase: 10-production-deploy (Plan 01 complete ✅)
Plan: Wave 2 in progress — Phase 10 Plan 01 executed 2026-04-15
Status: 06-01 COMPLETE. Remotion SSR pipeline (bundle+selectComposition+renderMedia); SocialFlowVideoShorts 9:16 portrait (1080x1920); both compositions registered in index.tsx; TypeScript zero errors; remotion@4.0.435 pinned.
       06-02 COMPLETE. TikTok OAuth 2.0 PKCE authorize + callback endpoints added to integrations_routes.py.
       06-03 COMPLETE. tiktok_post_helper.py with token refresh + PULL_FROM_URL + FILE_UPLOAD fallback; POST /post-to-tiktok route in content_routes.py; 7 unit tests all passing.
       07-01 COMPLETE. ChannelDashboard.tsx (channel list + create modal + auto-post toggle + onOpenPipeline); ModelPicker.tsx (reusable provider selector cards). TypeScript zero errors.
       07-02 COMPLETE. PipelineBuilder.tsx (per-channel AI pipeline config with 3 ModelPicker sections, save via POST /model-config); Dashboard.tsx wired with Channels nav + ChannelDashboard tab + AnimatePresence PipelineBuilder overlay.
       08-01 COMPLETE. APScheduler per-channel cron scheduling with MongoDBJobStore persistence; niche-to-dialogue generation before render_video_task dispatch; sync_channel() wired into channel PUT; scheduler lifespan + analytics_router registered in main.py.
       08-02 COMPLETE. analytics_fetcher.py (4 platform stats functions, lazy imports, TikTok N/A); analytics_routes.py (GET /posts + POST /refresh, 1h TTL); db_init.py platform_posts collection (4 indexes); content_routes.py platform_posts inserts in all 4 posting routes (non-fatal try/except).
       08-03 COMPLETE. ChannelAnalytics.tsx (recharts LineChart views/likes + BarChart comments + posts table + TikTok N/A); ChannelDashboard.tsx Analytics tab + selectedChannelId; recharts@^3.8.1 installed.
       09-01 COMPLETE. 53 new tests (20 analytics, 18 integrations, 15 scheduler); suite 29→82 tests; 3 bugs fixed in analytics_routes.py (route signature, timezone normalization, exception guard).
       09-02 COMPLETE. 28 new tests (18 analytics_fetcher unit, 10 content_routes smoke); Vitest configured for frontend; 2 frontend smoke tests (ChannelAnalytics+ChannelDashboard); CI hardened (no || true, correct pytest path, SCHEDULER_ENABLED env). Suite 82→110 tests.
       10-01 COMPLETE. CI hardening verified pre-complete from Phase 09-02 — all || true guards removed, SCHEDULER_ENABLED=false injected, build-images gated on test jobs.
Last activity: 2026-04-15 — Phase 10-01 verified: CI pipeline fully hardened (no code changes needed — 09-02 completed this)

Progress: [███████████████████████] ~94% (Wave 1 complete, Wave 2 phases 04+05+06-01+06-02+06-03+07-01+07-02+08-01+08-02+08-03+09-01+09-02+10-01 done)

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
- [2026-04-14]: Instagram analytics uses views metric (not impressions — deprecated April 21, 2025 per Meta developer changelog)
- [2026-04-14]: TikTok fetch_tiktok_stats always returns {} — publish_id is lifecycle ID not video ID; Research API requires academic approval
- [2026-04-14]: platform_posts inserts wrapped in try/except in content_routes.py — analytics failures must never break successful video publish responses
- [2026-04-14]: STATS_TTL_SECONDS=3600 in analytics_routes.py — prevents YouTube rate limit exhaustion (10K units/day) and Instagram throttling (200/hr/token)
- [Phase 08-03]: recharts LineChart for views/likes, BarChart for comments — distinct chart types for distinct metric types
- [Phase 08-03]: Analytics button on channel cards sets selectedChannelId and switches tab — single-click UX
- [Phase 09-01]: Lazy-import mock path: fetchers imported inside function body → patch at utils.analytics_fetcher.fn not routes.analytics_routes.fn
- [Phase 09-01]: IntegrationsService test bypass: assign mock_db["integrations"] directly to service.collection to skip _ensure_connection() DNS lookup
- [Phase 09-01]: _TESTERS dict patching: replace dict entry directly since dict holds function reference, module-level name patch is insufficient
- [Phase 09-01]: analytics_routes.py signature fix: `user_id: str = CurrentUser` → `user_id: CurrentUser` (Depends injection vs query param default)
- [Phase 09-01]: Timezone normalization in analytics refresh: mongomock returns naive datetimes; normalize with .replace(tzinfo=timezone.utc) before comparison
- [Phase 09-02]: Google SDK stub chain: youtube_post_helper.py has top-level google.oauth2 imports — must stub google.* AND googleapiclient.* subtrees AND import utils.youtube_post_helper explicitly before patch() can traverse it
- [Phase 09-02]: Aliased-import patch path: content_routes imports `from utils.redis_client import get_progress as _get_progress` (alias bound at import time) → patch at routes.content_routes._get_progress
- [Phase 09-02]: Frontend smoke tests mock recharts in both ChannelAnalytics and ChannelDashboard files — ChannelDashboard imports ChannelAnalytics which imports recharts
- [Phase 09-02]: CI hardened: pytest path fixed app/tests/ → tests/; SCHEDULER_ENABLED=false prevents APScheduler from starting in CI; JWT_SECRET_KEY added
- [Phase 10-production-deploy]: Plan 10-01 CI hardening was pre-completed by Phase 09-02; no duplicate changes needed

### Pending Todos

- Phase B (backlog): Wire Higgsfield API directly for auto video generation → store in S3. In ROADMAP.md backlog.

### Blockers/Concerns

- No MONGODB_URI, JWT_SECRET_KEY, or other secrets in local env — tests use mocks/mongomock (by design)
- 54-call frontend API audit complete: all routes verified. video-remotion + social posting routes confirmed.

## Session Continuity

Last session: 2026-04-15
Stopped at: Completed Phase 09 Plan 02 (test_analytics_fetcher.py 18 tests, test_content_routes_smoke.py 10 tests; Vitest frontend 11 tests; CI hardened; suite 82→110 tests)
Resume file: ~/.claude/handoffs/2026-04-13-socialflow-seedance-api-audit.md
