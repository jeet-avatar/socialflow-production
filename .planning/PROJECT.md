# SocialFlow — Project

## What This Is

AI-powered faceless content automation SaaS. Creators set up channels, SocialFlow autonomously generates scripts, voiceovers, branded videos, and publishes to YouTube, Instagram, Facebook, TikTok, LinkedIn — on a fully automated schedule. Users choose AI models per pipeline step (script, voice, video background). Agency plan supports 10 channels.

## Core Value

Creators run profitable faceless YouTube/social channels without ever appearing on camera or writing scripts.

## Validated Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| P1-INFRA | Docker + CI/CD + rate limiting + CORS + secrets manager | Planning |
| P2-DB | Channels, queued_videos, brand_kits, topics, model_configs collections + channel/model-config routes | Planning |
| P3-TESTS | pytest + Vitest + Playwright framework with coverage | Planning |
| P4-AI | Model-agnostic AI layer (GPT-4o/Claude/Gemini for script; ElevenLabs/OpenAI TTS for voice; fal.ai/Runway for video) | Backlog |
| P5-CELERY | Celery workers for async video generation pipeline | Backlog |
| P6-SHORTS | Remotion 9:16 Shorts composition + TikTok Content Posting API v2 | Backlog |
| P7-UI | UI/UX redesign: channel dashboard, pipeline builder, model picker | Backlog |
| P8-ANALYTICS | Scheduling engine + cross-platform analytics | Backlog |
| P9-QA | Full test suite (200+ cases) | Backlog |
| P10-DEPLOY | ECS production deploy (staging → prod) | Backlog |

## Active Requirements (Wave 1)

- P1-INFRA: Dockerfile (backend + remotion), docker-compose, GitHub Actions CI, rate limiting (slowapi), CORS lockdown, S3 cleanup on delete, remove debug print() → structured logging, Remotion /tmp cleanup, AWS Secrets Manager
- P2-DB: 5 new MongoDB collections with indexes, channel CRUD routes, model-config routes, remove Auth0 dead code, fix $29/$79/$199 pricing sync
- P3-TESTS: pytest infrastructure with motor-asyncio test DB, Vitest + @testing-library/react, Playwright E2E, coverage for all existing routes

## Out of Scope (Wave 1)

- Celery workers (P5)
- TikTok posting (P6)
- UI redesign (P7)
- New AI model providers (P4 — only scaffolding in P2)
- Analytics dashboard (P8)
- Production ECS deploy (P10)

## Key Decisions

| Date | Decision | Outcome |
|------|----------|---------|
| 2026-04-12 | Target users | Faceless content creators, NOT corporate enterprise |
| 2026-04-12 | Automation level | Hybrid C — fully autonomous default, optional review window |
| 2026-04-12 | Phasing approach | Parallel waves (same as ArthaBuild) |
| 2026-04-12 | TikTok priority | TikTok > X/Twitter — full impl in P6 |
| 2026-04-12 | AI model layer | Model-agnostic: GPT-4o default, Claude/Gemini/ElevenLabs switchable per step |
| 2026-04-12 | Enterprise SKU | Separate future product — SocialFlow.network stays creator-focused |
| 2026-04-12 | Pricing | Starter $29 / Creator $79 / Agency $199 (matches frontend constants.ts) |

## Constraints

- MongoDB Atlas (existing) — no migration to SQL
- Clerk auth (existing) — Auth0 code is dead, remove it
- Remotion for video rendering (existing) — extend for 9:16 Shorts in P6
- AWS S3 + CloudFront for video storage (existing)
- Single EC2 → ECS migration in P10

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11, FastAPI, Motor (async MongoDB) |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Video renderer | Remotion, Node 20, Chromium |
| Queue | Celery + Redis (P5) |
| Auth | Clerk JWT |
| Storage | AWS S3 + CloudFront |
| DB | MongoDB Atlas |
| Payments | Stripe |
| CI/CD | GitHub Actions |
| Container | Docker (multi-stage) |
| Secrets | AWS Secrets Manager |
