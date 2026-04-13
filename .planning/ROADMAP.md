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
| 02 | DB Schema & Backend | 5 new collections, channel routes, model-config routes, Auth0 removal, pricing fix | Ready |
| 03 | Test Framework | pytest + Vitest + Playwright, coverage for all routes | Ready |

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
| 04 | AI Model Layer | Model-agnostic provider interface (script/voice/video/research) | Done |
| 05 | Celery Workers | Async video generation pipeline, queue management, retry logic | Backlog |
| 06 | Shorts + TikTok | Remotion 9:16 composition, TikTok Content Posting API v2 | Backlog |
| 07 | UI/UX Redesign | Channel dashboard, pipeline builder, model picker | Backlog |

### Phase 04: AI Model Layer

**Goal:** Wire 4 hardcoded AI call sites to read from saved model config, expose provider discovery endpoint, and ship a minimal frontend hook — making the AI pipeline model-agnostic per channel.

**Requirements:** MODEL-01, MODEL-02, MODEL-03, MODEL-04

**Plans:** 1 plan

Plans:
- [x] 04-01-PLAN.md — provider_config.py resolver + /providers endpoint + wire 4 call sites + useModelConfig hook + tests (COMPLETE 2026-04-13, commits a5d66ec + a46661e + b6819e0, 26/26 tests passing)

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
