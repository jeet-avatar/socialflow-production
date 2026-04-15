# SocialFlow

Automated faceless content creation and multi-platform publishing.

## Quick Start (Local Dev)

Prerequisites: Docker Desktop, Python 3.11, Node 20.

```bash
# 1. Backend env file (copy and fill in secrets)
cp backend/.env.example backend/.env

# 2. Start all services
docker compose up --build

# Services:
#   http://localhost:8000  — FastAPI backend + React SPA
#   http://localhost:3001  — Remotion render service
#   redis:6379             — Broker + results + progress keys
```

## Environment Variables

### Required (backend/.env)

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET_KEY` | JWT signing secret (min 32 chars) |
| `CLERK_SECRET_KEY` | Clerk backend API key |
| `CLERK_PUBLISHABLE_KEY` | Clerk frontend publishable key |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_*` or `sk_test_*`) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `ANTHROPIC_API_KEY` | Claude AI (content generation) |
| `GOOGLE_AI_API_KEY` | Gemini (model-agnostic AI layer) |
| `OPENAI_API_KEY` | GPT-4o (model-agnostic AI layer) |
| `FAL_API_KEY` | fal.ai image generation |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS |
| `AWS_ACCESS_KEY_ID` | S3 video storage |
| `AWS_SECRET_ACCESS_KEY` | S3 video storage |
| `AWS_REGION` | S3 region (default: us-east-1) |
| `S3_BUCKET_NAME` | Video upload bucket |
| `YOUTUBE_CLIENT_ID` | YouTube OAuth app |
| `YOUTUBE_CLIENT_SECRET` | YouTube OAuth app |
| `TIKTOK_CLIENT_KEY` | TikTok OAuth app |
| `TIKTOK_CLIENT_SECRET` | TikTok OAuth app |
| `REDIS_URL` | Redis connection (default: redis://localhost:6379/2) |
| `CELERY_BROKER_URL` | Celery broker (default: redis://localhost:6379/0) |
| `CELERY_RESULT_BACKEND` | Celery results (default: redis://localhost:6379/1) |

### Scheduler Control

| Variable | Values | Notes |
|----------|--------|-------|
| `SCHEDULER_ENABLED` | `true` / `false` | Set `false` on every ECS task except the primary backend. APScheduler uses MongoDBJobStore — only one process should run cron jobs. |

**ECS rule:** If you run 2+ backend tasks, set `SCHEDULER_ENABLED=false` in the task definition of all secondary tasks. The primary task keeps `SCHEDULER_ENABLED=true`.

## Production Deployment

### Prerequisites

GitHub repository secrets required:
- `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` — IAM user with ECS+ECR permissions
- `ECR_REGISTRY` — ECR registry hostname (e.g. `123456789.dkr.ecr.us-east-1.amazonaws.com`)
- `PRODUCTION_URL` — Production API base URL (e.g. `https://api.socialflow.com`)
- `STAGING_URL` — Staging API base URL

### ECS Services (must exist before deploy workflows run)

| Cluster | Service | Image |
|---------|---------|-------|
| `socialflow-production` | `socialflow-backend` | `$ECR_REGISTRY/socialflow-backend:$SHA` |
| `socialflow-staging` | `socialflow-backend` | `$ECR_REGISTRY/socialflow-backend:$SHA` |

ECS task definitions are managed manually (no Terraform in this repo). Update the task definition's image URI after each ECR push, or configure ECS to always pull the latest tag.

### Deploy Staging

```bash
# Push code first — CI builds + pushes images to ECR on main
git push origin main

# Trigger staging deploy (force-new-deployment on socialflow-staging)
gh workflow run deploy-staging.yml

# Monitor
gh run list --workflow=deploy-staging.yml --limit 3
gh run watch <run-id>
```

### Deploy Production

```bash
# Trigger production deploy (requires typing DEPLOY as confirmation input)
gh workflow run deploy-production.yml -f confirm=DEPLOY

# Monitor
gh run list --workflow=deploy-production.yml --limit 3
gh run watch <run-id>
```

### Health Check

```bash
curl https://api.socialflow.com/health
# Expected: {"status":"healthy","services":{"redis":"ok","mongodb":"ok","celery":"ok"},...}
```

Status meanings:
- `healthy` — redis + mongodb reachable
- `degraded` — at least one critical service unreachable (deploy should not proceed)
- `celery: "no workers"` — non-fatal in staging; fatal in production (video pipeline broken)

## Architecture

See `ARCHITECTURE.md` for the full system design.

## CI

CI runs on every push to `main` and every PR:
- `test-backend` — pytest (hard-fail)
- `lint-backend` — ruff
- `test-frontend` — vitest (hard-fail)
- `build-images` — builds + pushes backend + remotion Docker images to ECR (main branch only, gated on all tests passing)
