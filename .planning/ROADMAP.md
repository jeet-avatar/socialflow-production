# SocialFlow — Milestone Roadmap

## Milestone: v1.0 Production Launch

**Goal:** Transform the existing SocialFlow prototype into a production-ready, fully automated content machine with multi-platform publishing, model-agnostic AI pipeline, Shorts/TikTok support, and a redesigned UI.

**Success criteria:**
- Automated channel runs end-to-end without human intervention
- Videos published to YouTube + Instagram + Facebook + TikTok
- All 3 pricing tiers enforced with Stripe
- Docker + CI/CD running
- 80%+ test coverage

---

## Wave 1 — Foundation (Parallel)

| Phase | Name | Goal | Status |
|-------|------|------|--------|
| 01 | Infra & DevOps | Docker, CI/CD, rate limiting, secrets, CORS, cleanup | Ready |
| 02 | DB Schema & Backend | 5 new collections, channel routes, model-config routes, Auth0 removal, pricing fix | 1/1 | Complete   | 2026-04-14 | Test Framework | pytest + Vitest + Playwright, coverage for all routes | Ready |

**Gate:** Wave 2 blocked until all 3 merge to main and CI passes.

---

## Wave 1.5 — Seedance Studio (shipped)

| Phase | Name | Goal | Status |
|-------|------|------|--------|
| 03.5 | Seedance Studio | Higgsfield Seedance 2.0 prompt generator in dashboard — 15 styles, Claude-powered, copy-to-paste | Done |

**Note:** Phase B (full Higgsfield API loop — auto-generate + store video) is a future enhancement tracked as backlog.

---

## Wave 2 — Core Features (Parallel)

| Phase | Name | Goal | Status |
|-------|------|------|--------|
| 04 | AI Model Layer | Complete    | 2026-04-13 |
| 05 | Celery Workers | Complete    | 2026-04-14 |
| 06 | Shorts + TikTok | Complete    | 2026-04-14 |
| 07 | 2/2 | Complete    | 2026-04-14 |

### Phase 04: AI Model Layer

**Goal:** Wire 4 hardcoded AI call sites to read from saved model config, expose provider discovery endpoint, and ship a minimal frontend hook — making the AI pipeline model-agnostic per channel.

**Requirements:** MODEL-01, MODEL-02, MODEL-03, MODEL-04

**Plans:** 1/1 plans complete

Plans:
- [x] 04-01-PLAN.md — provider_config.py resolver + /providers endpoint + wire 4 call sites + useModelConfig hook + tests (COMPLETE 2026-04-13, commits a5d66ec + a46661e + b6819e0, 26/26 tests passing)

---

### Phase 05: Celery Workers

**Goal:** Replace the synchronous POST /video-remotion HTTP handler with a Celery task so long-running AI jobs (ElevenLabs + Whisper + DALL-E/fal.ai + Remotion + S3) don't block HTTP workers or time out. Add Redis-backed progress tracking and retry logic.

**Requirements:** CELERY-01, CELERY-02, CELERY-03, CELERY-04, CELERY-05

**Plans:** 1/1 plans complete

Plans:
- [ ] 05-01-PLAN.md — celery_app.py + redis_client.py + video_tasks.py + content_routes refactor + docker-compose celery_worker + unit tests

### Phase 06: Shorts + TikTok

**Goal:** Add vertical 9:16 Remotion composition for YouTube Shorts / TikTok and wire the TikTok Content Posting API v2 so channels can auto-publish short-form videos alongside their existing 16:9 content.

**Requirements:** SHORTS-01, SHORTS-02, SHORTS-03, SHORTS-04

**Plans:** 3/3 plans complete

Plans:
- [x] 06-01-PLAN.md — Remotion SSR render pipeline (replace 501 stub) + SocialFlowVideoShorts 1080x1920 composition + both registered in index.tsx + pinned package versions
- [ ] 06-02-PLAN.md — TikTok OAuth PKCE flow (authorize + callback) added to integrations_routes.py; stores accessToken/refreshToken/openId/tokenExpiresAt
- [ ] 06-03-PLAN.md — tiktok_post_helper.py (token refresh + PULL_FROM_URL + FILE_UPLOAD fallback) + POST /post-to-tiktok route + 7 unit tests

---

### Phase 07: UI/UX Redesign

**Goal:** Redesign the channel dashboard, pipeline builder, and model picker so creators can configure and monitor their content channels without needing developer access.

**Requirements:** UI-01, UI-02, UI-03

**Plans:** 2/2 plans complete

Plans:
- [x] 07-01-PLAN.md — ChannelDashboard.tsx (channel list + create modal + auto_post toggle) + ModelPicker.tsx (reusable provider selector cards) (COMPLETE 2026-04-14, commits 19e5e00 + 6fa9fcb)
- [x] 07-02-PLAN.md — PipelineBuilder.tsx (per-channel pipeline config with ModelPicker) + Dashboard.tsx integration (Channels nav + tab + overlay) (COMPLETE 2026-04-14, commits 86da898 + db47320)

---

## Wave 3 — Quality (Parallel)

| Phase | Name | Goal | Status |
|-------|------|------|--------|
| 08 | Scheduling + Analytics | Cron-based auto-posting, cross-platform metrics | Backlog |
| 09 | Full Test Suite | 200+ test cases, E2E happy paths for all flows | Backlog |

---

## Wave 4 — Deployment (Sequential)

| Phase | Name | Goal | Status |
|-------|------|------|--------|
| 10 | Production Deploy | ECS cluster, staging → prod, CloudFront, monitoring | Backlog |
