# SocialFlow Enterprise — Wave 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SocialFlow production-ready at the infrastructure, schema, and testing layer — before any new features are built.

**Architecture:** Three parallel phases (P1 Infra, P2 DB/Backend, P3 Tests) run simultaneously in isolated git worktrees. Each phase is independently mergeable. Wave 2 is blocked until all three complete.

**Tech Stack:** Docker, GitHub Actions, AWS Secrets Manager, slowapi, pytest, Vitest, Playwright, FastAPI, MongoDB, React 18

---

## Chunk 1: Phase 1 — Infrastructure & DevOps

### Task 1.1: Dockerfile — Backend

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

- [ ] **Step 1: Write backend Dockerfile**

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim AS base
WORKDIR /app

# System deps (ffmpeg for video processing)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM deps AS production
COPY backend/app ./app
COPY backend/scripts ./scripts

# Non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

- [ ] **Step 2: Write .dockerignore**

```
__pycache__/
*.pyc
*.pyo
.env
.env.*
!.env.example
venv/
.venv/
*.egg-info/
.git/
.pytest_cache/
*.log
```

- [ ] **Step 3: Build and verify locally**

```bash
cd /tmp/socialflow-final
docker build -f backend/Dockerfile -t socialflow-backend:test .
docker run --rm -e MONGODB_URI=test -e JWT_SECRET_KEY=test socialflow-backend:test uvicorn app.main:app --help
```

Expected: uvicorn help text printed, no import errors

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore
git commit -m "feat(infra): add backend Dockerfile with healthcheck and non-root user"
```

---

### Task 1.2: Dockerfile — Remotion Service

**Files:**
- Create: `remotion-service/Dockerfile`
- Create: `remotion-service/.dockerignore`

- [ ] **Step 1: Write Remotion Dockerfile**

```dockerfile
# remotion-service/Dockerfile
FROM node:20-slim AS base
WORKDIR /app

# Chrome deps for Remotion headless rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fonts-liberation libgbm1 libnss3 libatk-bridge2.0-0 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 \
    curl && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_PATH=/usr/bin/chromium

FROM base AS deps
COPY remotion-service/package*.json ./
RUN npm ci --only=production

FROM base AS builder
COPY remotion-service/package*.json ./
RUN npm ci
COPY remotion-service/src ./src
COPY remotion-service/tsconfig.json .
RUN npm run build

FROM base AS production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/render-server.js"]
```

- [ ] **Step 2: Add build script to remotion-service/package.json**

```json
"scripts": {
  "build": "tsc",
  "start": "node dist/render-server.js",
  "dev": "ts-node src/render-server.ts"
}
```

- [ ] **Step 3: Commit**

```bash
git add remotion-service/Dockerfile remotion-service/.dockerignore
git commit -m "feat(infra): add Remotion service Dockerfile with Chrome deps"
```

---

### Task 1.3: docker-compose.yml (Local Dev)

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.override.yml`

- [ ] **Step 1: Write docker-compose.yml**

```yaml
# docker-compose.yml
version: '3.9'

services:
  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    ports:
      - "8000:8000"
    env_file: backend/app/.env
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  remotion:
    build:
      context: .
      dockerfile: remotion-service/Dockerfile
    ports:
      - "3001:3001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  celery-worker:
    build:
      context: .
      dockerfile: backend/Dockerfile
    command: celery -A app.workers.celery_app worker --loglevel=info --concurrency=4
    env_file: backend/app/.env
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  flower:
    image: mher/flower:2.0
    ports:
      - "5555:5555"
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
    depends_on:
      - redis

  frontend:
    build:
      context: ./frontend
      dockerfile: .dockerignore  # placeholder; frontend served via Vite dev or CDN
    profiles: ["dev"]
```

- [ ] **Step 2: Verify compose starts**

```bash
cd /tmp/socialflow-final
docker compose up redis --wait
docker compose ps
```

Expected: redis shows as healthy

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(infra): add docker-compose for local dev (backend, remotion, celery, redis, flower)"
```

---

### Task 1.4: GitHub Actions CI/CD

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy-staging.yml`
- Create: `.github/workflows/deploy-production.yml`

- [ ] **Step 1: Write CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
      - run: pip install -r backend/requirements.txt -r backend/requirements-test.txt
      - run: pytest backend/tests/ -v --cov=backend/app --cov-report=xml
        env:
          MONGODB_URI: ${{ secrets.TEST_MONGODB_URI }}
          JWT_SECRET_KEY: test-secret-key-for-ci
          REDIS_URL: redis://localhost:6379/0
      - uses: codecov/codecov-action@v4

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      - run: cd frontend && npm ci
      - run: cd frontend && npm run test -- --coverage

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install ruff
      - run: ruff check backend/app/
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd frontend && npm ci && npm run lint

  build-images:
    runs-on: ubuntu-latest
    needs: [test-backend, test-frontend, lint]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - uses: aws-actions/amazon-ecr-login@v2
      - name: Build and push backend
        run: |
          docker build -f backend/Dockerfile -t $ECR_REGISTRY/socialflow-backend:${{ github.sha }} .
          docker push $ECR_REGISTRY/socialflow-backend:${{ github.sha }}
        env:
          ECR_REGISTRY: ${{ secrets.ECR_REGISTRY }}
      - name: Build and push remotion
        run: |
          docker build -f remotion-service/Dockerfile -t $ECR_REGISTRY/socialflow-remotion:${{ github.sha }} .
          docker push $ECR_REGISTRY/socialflow-remotion:${{ github.sha }}
        env:
          ECR_REGISTRY: ${{ secrets.ECR_REGISTRY }}
```

- [ ] **Step 2: Write deploy-staging workflow**

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy to Staging

on:
  workflow_dispatch:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: []
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - name: Deploy backend to ECS staging
        run: |
          aws ecs update-service \
            --cluster socialflow-staging \
            --service socialflow-backend-staging \
            --force-new-deployment
      - name: Deploy remotion to ECS staging
        run: |
          aws ecs update-service \
            --cluster socialflow-staging \
            --service socialflow-remotion-staging \
            --force-new-deployment
      - name: Wait for stability
        run: |
          aws ecs wait services-stable \
            --cluster socialflow-staging \
            --services socialflow-backend-staging socialflow-remotion-staging
      - name: Smoke test staging
        run: |
          curl -f https://api-staging.socialflow.network/health
          curl -f https://api-staging.socialflow.network/api/subscription/plans
```

- [ ] **Step 3: Write deploy-production workflow**

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  workflow_dispatch:
    inputs:
      confirm:
        description: 'Type DEPLOY to confirm'
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    if: github.event.inputs.confirm == 'DEPLOY'
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - name: Deploy to ECS production
        run: |
          aws ecs update-service --cluster socialflow-production \
            --service socialflow-backend --force-new-deployment
          aws ecs update-service --cluster socialflow-production \
            --service socialflow-remotion --force-new-deployment
          aws ecs wait services-stable \
            --cluster socialflow-production \
            --services socialflow-backend socialflow-remotion
      - name: Production smoke test
        run: |
          curl -f https://api.socialflow.network/health
```

- [ ] **Step 4: Create GitHub Actions secrets list (document only)**

Create `.github/SECRETS.md`:
```markdown
# Required GitHub Actions Secrets
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- ECR_REGISTRY
- TEST_MONGODB_URI
```

- [ ] **Step 5: Commit**

```bash
git add .github/
git commit -m "feat(ci): add GitHub Actions CI/CD (test → build → ECR → ECS deploy)"
```

---

### Task 1.5: Rate Limiting

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/app/utils/rate_limiter.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add slowapi to requirements**

```
slowapi==0.1.9
```

- [ ] **Step 2: Create rate_limiter.py**

```python
# backend/app/utils/rate_limiter.py
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"error": "Rate limit exceeded", "detail": str(exc.detail)},
    )

# Per-endpoint limits
LIMITS = {
    "auth": "20/minute",
    "videos_create": "10/minute",
    "content_generate": "5/minute",
    "leads_search": "30/minute",
}
```

- [ ] **Step 3: Wire into main.py**

Add to `backend/app/main.py` after existing imports:
```python
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.utils.rate_limiter import limiter

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

- [ ] **Step 4: Write test**

```python
# backend/tests/test_rate_limiting.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_rate_limit_applied(async_client: AsyncClient):
    """Hitting /auth/sync-user 25 times should trigger 429."""
    responses = []
    for _ in range(25):
        r = await async_client.post("/auth/sync-user", json={})
        responses.append(r.status_code)
    assert 429 in responses
```

- [ ] **Step 5: Run test**

```bash
pytest backend/tests/test_rate_limiting.py -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/utils/rate_limiter.py backend/app/main.py backend/requirements.txt
git commit -m "feat(security): add slowapi rate limiting (100/min default, stricter on auth/generate)"
```

---

### Task 1.6: CORS Lockdown

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Fix CORS to require explicit origins**

Replace the CORS block in `backend/app/main.py`:
```python
# Replace existing CORS setup
import os
from fastapi.middleware.cors import CORSMiddleware

_raw_origins = os.getenv("ALLOWED_ORIGINS", "")
if not _raw_origins or _raw_origins == "*":
    raise RuntimeError(
        "ALLOWED_ORIGINS env var must be set to explicit origins in production. "
        "Example: https://socialflow.network,https://www.socialflow.network"
    )
allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)
```

- [ ] **Step 2: Update .env.example**

```
ALLOWED_ORIGINS=https://socialflow.network,https://www.socialflow.network
```

- [ ] **Step 3: Write test**

```python
# backend/tests/test_cors.py
def test_cors_rejects_unknown_origin(client):
    response = client.options("/health", headers={"Origin": "https://evil.com"})
    assert "access-control-allow-origin" not in response.headers
```

- [ ] **Step 4: Commit**

```bash
git commit -am "fix(security): lock CORS to explicit ALLOWED_ORIGINS — reject wildcard"
```

---

### Task 1.7: S3 Cleanup on Video Delete

**Files:**
- Modify: `backend/app/routes/videos_routes.py`
- Create: `backend/app/utils/s3_service.py`

- [ ] **Step 1: Create s3_service.py**

```python
# backend/app/utils/s3_service.py
import boto3
import logging
from app.utils.config import settings

logger = logging.getLogger(__name__)
_s3 = None

def get_s3_client():
    global _s3
    if _s3 is None:
        _s3 = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
    return _s3

def delete_s3_object(bucket: str, key: str) -> bool:
    """Delete an object from S3. Returns True on success."""
    try:
        get_s3_client().delete_object(Bucket=bucket, Key=key)
        logger.info(f"Deleted S3 object: s3://{bucket}/{key}")
        return True
    except Exception as e:
        logger.error(f"Failed to delete S3 object s3://{bucket}/{key}: {e}")
        return False
```

- [ ] **Step 2: Wire into video delete endpoint**

In `backend/app/routes/videos_routes.py`, find the DELETE endpoint and add:
```python
from app.utils.s3_service import delete_s3_object

# Inside the delete handler, after fetching video metadata:
if video.get("s3_bucket") and video.get("s3_key"):
    delete_s3_object(video["s3_bucket"], video["s3_key"])
```

- [ ] **Step 3: Write test**

```python
# backend/tests/test_video_delete.py
from unittest.mock import patch, MagicMock

@pytest.mark.asyncio
async def test_video_delete_cleans_s3(async_client, mock_video_in_db):
    with patch("app.utils.s3_service.get_s3_client") as mock_s3:
        mock_s3.return_value.delete_object = MagicMock()
        response = await async_client.delete(f"/videos/{mock_video_in_db['_id']}")
        assert response.status_code == 200
        mock_s3.return_value.delete_object.assert_called_once_with(
            Bucket=mock_video_in_db["s3_bucket"],
            Key=mock_video_in_db["s3_key"]
        )
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/utils/s3_service.py backend/app/routes/videos_routes.py
git commit -m "fix: delete S3 object when video is deleted (was orphaning files)"
```

---

### Task 1.8: Remove Debug print() → logging

**Files:**
- Modify: `backend/app/utils/fb_post_helper.py`
- Modify: `backend/app/utils/youtube_post_helper.py`
- Modify: `backend/app/utils/linkedin_post_helper.py`
- Modify: `backend/app/utils/video.py`
- Modify: `backend/app/utils/instagram_post_helper.py`

- [ ] **Step 1: Run automated replacement**

```bash
cd /tmp/socialflow-final

# Add logger to each file and replace print() with logger.debug()
for f in backend/app/utils/fb_post_helper.py \
          backend/app/utils/youtube_post_helper.py \
          backend/app/utils/linkedin_post_helper.py \
          backend/app/utils/video.py \
          backend/app/utils/instagram_post_helper.py; do

  # Add import if not present
  grep -q "^import logging" "$f" || sed -i '1s/^/import logging\nlogger = logging.getLogger(__name__)\n\n/' "$f"

  # Replace print( with logger.debug(
  sed -i 's/\bprint(\(f\?\)/logger.debug(\1/g' "$f"
done
```

- [ ] **Step 2: Verify no bare print() remain in utils**

```bash
grep -rn "^    print(" backend/app/utils/ | grep -v "logger"
```

Expected: no output

- [ ] **Step 3: Fix hardcoded $49 price**

```bash
grep -rn "49\.00\|49,\|\"49\"" backend/app/utils/subscription_service.py
```

Find and replace with env var:
```python
# backend/app/utils/subscription_service.py
import os
PROFESSIONAL_PRICE = float(os.getenv("PROFESSIONAL_PLAN_PRICE", "79.00"))
```

Update `.env.example`:
```
PROFESSIONAL_PLAN_PRICE=79.00
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/utils/
git commit -m "fix: replace 100+ debug print() with structured logging; fix hardcoded price"
```

---

### Task 1.9: Remotion /tmp Cleanup

**Files:**
- Modify: `remotion-service/src/render-server.ts`

- [ ] **Step 1: Add cleanup after S3 upload**

In `render-server.ts`, after the S3 upload completes, add:
```typescript
import fs from 'fs';

// After successful S3 upload:
try {
  fs.unlinkSync(outputPath);
  console.log(`Cleaned up temp file: ${outputPath}`);
} catch (cleanupErr) {
  console.warn(`Failed to clean up temp file ${outputPath}:`, cleanupErr);
  // Non-fatal — file will be cleaned by OS eventually
}
```

- [ ] **Step 2: Add periodic /tmp cleanup (files older than 1hr)**

```typescript
// Add to server startup
setInterval(() => {
  const tmpDir = os.tmpdir();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  try {
    fs.readdirSync(tmpDir)
      .filter(f => f.startsWith('socialflow-') && f.endsWith('.mp4'))
      .forEach(f => {
        const fullPath = path.join(tmpDir, f);
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < oneHourAgo) {
          fs.unlinkSync(fullPath);
          console.log(`Cleaned stale temp file: ${fullPath}`);
        }
      });
  } catch (e) { /* non-fatal */ }
}, 30 * 60 * 1000); // every 30 min
```

- [ ] **Step 3: Commit**

```bash
git add remotion-service/src/render-server.ts
git commit -m "fix: clean up /tmp render files after S3 upload + periodic stale file cleanup"
```

---

### Task 1.10: AWS Secrets Manager Integration

**Files:**
- Create: `backend/app/utils/secrets.py`
- Modify: `backend/app/utils/config.py`

- [ ] **Step 1: Create secrets.py**

```python
# backend/app/utils/secrets.py
import json
import logging
import os
import boto3

logger = logging.getLogger(__name__)

def load_secrets_from_aws(secret_name: str) -> dict:
    """Load secrets from AWS Secrets Manager. Falls back to env vars in dev."""
    if os.getenv("ENVIRONMENT", "development") == "development":
        logger.info("Development mode — skipping AWS Secrets Manager")
        return {}
    try:
        client = boto3.client("secretsmanager", region_name=os.getenv("AWS_REGION", "us-east-1"))
        response = client.get_secret_value(SecretId=secret_name)
        return json.loads(response["SecretString"])
    except Exception as e:
        logger.error(f"Failed to load secrets from AWS: {e}")
        return {}

def init_secrets():
    """Load all app secrets at startup and inject into environment."""
    secret_name = os.getenv("AWS_SECRET_NAME", "socialflow/production")
    secrets = load_secrets_from_aws(secret_name)
    for key, value in secrets.items():
        if key not in os.environ:
            os.environ[key] = str(value)
    logger.info(f"Loaded {len(secrets)} secrets from AWS Secrets Manager")
```

- [ ] **Step 2: Call init_secrets() at startup in main.py**

```python
# In backend/app/main.py, add at the very top before other imports:
from app.utils.secrets import init_secrets
init_secrets()
```

- [ ] **Step 3: Update .env.example with new vars**

```
AWS_SECRET_NAME=socialflow/production
ENVIRONMENT=production
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/utils/secrets.py backend/app/main.py
git commit -m "feat(security): add AWS Secrets Manager integration with local env fallback"
```

---

## Chunk 2: Phase 2 — Database & Backend Schema

### Task 2.1: New MongoDB Collections & Indexes

**Files:**
- Create: `backend/app/utils/db_init.py`
- Modify: `backend/app/utils/mongodb_service.py`

- [ ] **Step 1: Create db_init.py with all new collections**

```python
# backend/app/utils/db_init.py
"""
Initialize new MongoDB collections and indexes for SocialFlow enterprise features.
Run once on startup or via: python -m app.utils.db_init
"""
import asyncio
import logging
from motor.motor_asyncio import AsyncIOMotorClient
import os

logger = logging.getLogger(__name__)

NEW_COLLECTIONS = {
    "channels": [
        {"key": [("user_id", 1)], "name": "channels_user_id"},
        {"key": [("user_id", 1), ("platform", 1)], "name": "channels_user_platform"},
    ],
    "queued_videos": [
        {"key": [("channel_id", 1), ("status", 1)], "name": "qv_channel_status"},
        {"key": [("scheduled_at", 1)], "name": "qv_scheduled_at"},
        {"key": [("user_id", 1), ("status", 1)], "name": "qv_user_status"},
    ],
    "brand_kits": [
        {"key": [("user_id", 1)], "name": "bk_user_id", "unique": True},
        {"key": [("channel_id", 1)], "name": "bk_channel_id"},
    ],
    "topics": [
        {"key": [("channel_id", 1), ("status", 1)], "name": "topics_channel_status"},
        {"key": [("created_at", -1)], "name": "topics_created_at"},
    ],
    "model_configs": [
        {"key": [("user_id", 1)], "name": "mc_user_id", "unique": True},
        {"key": [("channel_id", 1)], "name": "mc_channel_id"},
    ],
}

async def init_collections(db):
    existing = await db.list_collection_names()
    for collection_name, indexes in NEW_COLLECTIONS.items():
        if collection_name not in existing:
            await db.create_collection(collection_name)
            logger.info(f"Created collection: {collection_name}")
        col = db[collection_name]
        for idx in indexes:
            await col.create_index(idx["key"], name=idx["name"], unique=idx.get("unique", False))
            logger.info(f"Created index {idx['name']} on {collection_name}")

if __name__ == "__main__":
    client = AsyncIOMotorClient(os.getenv("MONGODB_URI"))
    db = client[os.getenv("MONGODB_DB_NAME", "socialflow")]
    asyncio.run(init_collections(db))
    print("DB initialization complete.")
```

- [ ] **Step 2: Run init script**

```bash
cd /tmp/socialflow-final
MONGODB_URI=$YOUR_MONGO_URI python -m backend.app.utils.db_init
```

Expected: "Created collection: channels", "Created collection: queued_videos" etc.

- [ ] **Step 3: Write test**

```python
# backend/tests/test_db_init.py
@pytest.mark.asyncio
async def test_new_collections_created(test_db):
    from app.utils.db_init import init_collections
    await init_collections(test_db)
    collections = await test_db.list_collection_names()
    for name in ["channels", "queued_videos", "brand_kits", "topics", "model_configs"]:
        assert name in collections
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/utils/db_init.py
git commit -m "feat(db): add 5 new MongoDB collections with indexes (channels, queued_videos, brand_kits, topics, model_configs)"
```

---

### Task 2.2: Channel Routes

**Files:**
- Create: `backend/app/routes/channel_routes.py`
- Create: `backend/app/utils/channel_service.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create channel_service.py**

```python
# backend/app/utils/channel_service.py
from datetime import datetime
from bson import ObjectId
from app.utils.mongodb_service import get_db

PLATFORM_LIMITS = {"starter": 1, "creator": 3, "agency": 10}

async def get_user_channel_count(user_id: str) -> int:
    db = await get_db()
    return await db.channels.count_documents({"user_id": user_id, "is_active": True})

async def create_channel(user_id: str, plan: str, data: dict) -> dict:
    limit = PLATFORM_LIMITS.get(plan, 1)
    count = await get_user_channel_count(user_id)
    if count >= limit:
        raise ValueError(f"Plan '{plan}' allows {limit} channel(s). Upgrade to add more.")
    doc = {
        "user_id": user_id,
        "name": data["name"],
        "niche": data.get("niche", ""),
        "platforms": data.get("platforms", []),  # ["youtube", "tiktok", "instagram"]
        "posting_frequency": data.get("posting_frequency", {}),
        "review_window_hours": data.get("review_window_hours", 0),
        "is_active": True,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    db = await get_db()
    result = await db.channels.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc

async def list_channels(user_id: str) -> list:
    db = await get_db()
    cursor = db.channels.find({"user_id": user_id, "is_active": True})
    channels = []
    async for ch in cursor:
        ch["_id"] = str(ch["_id"])
        channels.append(ch)
    return channels

async def update_channel(channel_id: str, user_id: str, data: dict) -> dict:
    db = await get_db()
    data["updated_at"] = datetime.utcnow()
    await db.channels.update_one(
        {"_id": ObjectId(channel_id), "user_id": user_id},
        {"$set": data}
    )
    doc = await db.channels.find_one({"_id": ObjectId(channel_id)})
    doc["_id"] = str(doc["_id"])
    return doc

async def delete_channel(channel_id: str, user_id: str) -> bool:
    db = await get_db()
    result = await db.channels.update_one(
        {"_id": ObjectId(channel_id), "user_id": user_id},
        {"$set": {"is_active": False}}
    )
    return result.modified_count > 0
```

- [ ] **Step 2: Create channel_routes.py**

```python
# backend/app/routes/channel_routes.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.utils.channel_service import create_channel, list_channels, update_channel, delete_channel
from app.utils.auth_middleware import require_auth

router = APIRouter(prefix="/channels", tags=["channels"])

class ChannelCreate(BaseModel):
    name: str
    niche: Optional[str] = ""
    platforms: List[str] = []
    posting_frequency: Optional[dict] = {}
    review_window_hours: Optional[int] = 0

class ChannelUpdate(BaseModel):
    name: Optional[str]
    niche: Optional[str]
    platforms: Optional[List[str]]
    posting_frequency: Optional[dict]
    review_window_hours: Optional[int]

@router.post("")
async def create(body: ChannelCreate, user=Depends(require_auth)):
    try:
        return await create_channel(user["id"], user.get("plan", "starter"), body.dict())
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

@router.get("")
async def list_all(user=Depends(require_auth)):
    return await list_channels(user["id"])

@router.put("/{channel_id}")
async def update(channel_id: str, body: ChannelUpdate, user=Depends(require_auth)):
    return await update_channel(channel_id, user["id"], body.dict(exclude_none=True))

@router.delete("/{channel_id}")
async def delete(channel_id: str, user=Depends(require_auth)):
    ok = await delete_channel(channel_id, user["id"])
    if not ok:
        raise HTTPException(status_code=404, detail="Channel not found")
    return {"deleted": True}
```

- [ ] **Step 3: Register router in main.py**

```python
from app.routes.channel_routes import router as channel_router
app.include_router(channel_router)
```

- [ ] **Step 4: Write tests**

```python
# backend/tests/test_channels.py
@pytest.mark.asyncio
async def test_create_channel_starter_limit(async_client, starter_user_token):
    headers = {"Authorization": f"Bearer {starter_user_token}"}
    # Create first channel — should succeed
    r1 = await async_client.post("/channels", json={"name": "Finance Tips"}, headers=headers)
    assert r1.status_code == 200
    # Create second channel on starter — should fail
    r2 = await async_client.post("/channels", json={"name": "Tech News"}, headers=headers)
    assert r2.status_code == 403
    assert "1 channel" in r2.json()["detail"]

@pytest.mark.asyncio
async def test_list_channels(async_client, creator_user_token):
    headers = {"Authorization": f"Bearer {creator_user_token}"}
    await async_client.post("/channels", json={"name": "Ch1"}, headers=headers)
    await async_client.post("/channels", json={"name": "Ch2"}, headers=headers)
    r = await async_client.get("/channels", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 2
```

- [ ] **Step 5: Run tests**

```bash
pytest backend/tests/test_channels.py -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/routes/channel_routes.py backend/app/utils/channel_service.py
git commit -m "feat(api): add /channels CRUD with plan-based limits (1/3/10 per plan)"
```

---

### Task 2.3: Model Config Routes

**Files:**
- Create: `backend/app/routes/model_config_routes.py`
- Create: `backend/app/utils/model_config_service.py`

- [ ] **Step 1: Create model_config_service.py**

```python
# backend/app/utils/model_config_service.py
from datetime import datetime
from app.utils.mongodb_service import get_db

SUPPORTED_MODELS = {
    "script": ["gpt-4o", "claude-sonnet-4-5", "claude-opus-4-6", "gemini-2.0-pro"],
    "voiceover": ["elevenlabs", "openai-tts-hd", "playht", "murf"],
    "video_bg": ["kling", "seedream-2.0", "runway-gen3", "pika-2.1", "dalle-3"],
    "research": ["serper", "brave", "perplexity", "youtube-trending"],
}

DEFAULT_CONFIG = {
    "script": "gpt-4o",
    "voiceover": "elevenlabs",
    "video_bg": "kling",
    "research": "serper",
}

async def get_model_config(user_id: str, channel_id: str = None) -> dict:
    db = await get_db()
    query = {"user_id": user_id}
    if channel_id:
        query["channel_id"] = channel_id
    doc = await db.model_configs.find_one(query)
    if not doc:
        return {**DEFAULT_CONFIG, "user_id": user_id, "channel_id": channel_id}
    doc["_id"] = str(doc["_id"])
    return doc

async def upsert_model_config(user_id: str, channel_id: str = None, config: dict = {}) -> dict:
    # Validate model choices
    for step, model in config.items():
        if step in SUPPORTED_MODELS and model not in SUPPORTED_MODELS[step]:
            raise ValueError(f"Model '{model}' not supported for step '{step}'. "
                           f"Choose from: {SUPPORTED_MODELS[step]}")
    db = await get_db()
    query = {"user_id": user_id}
    if channel_id:
        query["channel_id"] = channel_id
    update = {"$set": {**config, "updated_at": datetime.utcnow()},
              "$setOnInsert": {"user_id": user_id, "channel_id": channel_id,
                               "created_at": datetime.utcnow()}}
    await db.model_configs.update_one(query, update, upsert=True)
    return await get_model_config(user_id, channel_id)
```

- [ ] **Step 2: Create model_config_routes.py**

```python
# backend/app/routes/model_config_routes.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from app.utils.model_config_service import get_model_config, upsert_model_config, SUPPORTED_MODELS
from app.utils.auth_middleware import require_auth

router = APIRouter(prefix="/model-config", tags=["model-config"])

class ModelConfigUpdate(BaseModel):
    channel_id: Optional[str] = None
    script: Optional[str] = None
    voiceover: Optional[str] = None
    video_bg: Optional[str] = None
    research: Optional[str] = None

@router.get("/supported")
async def get_supported_models():
    return SUPPORTED_MODELS

@router.get("")
async def get_config(channel_id: Optional[str] = None, user=Depends(require_auth)):
    return await get_model_config(user["id"], channel_id)

@router.put("")
async def update_config(body: ModelConfigUpdate, user=Depends(require_auth)):
    update = body.dict(exclude_none=True)
    channel_id = update.pop("channel_id", None)
    return await upsert_model_config(user["id"], channel_id, update)
```

- [ ] **Step 3: Write tests**

```python
# backend/tests/test_model_config.py
@pytest.mark.asyncio
async def test_get_default_config(async_client, auth_headers):
    r = await async_client.get("/model-config", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["script"] == "gpt-4o"
    assert data["voiceover"] == "elevenlabs"

@pytest.mark.asyncio
async def test_update_model_to_seedream(async_client, auth_headers):
    r = await async_client.put("/model-config",
        json={"video_bg": "seedream-2.0"}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["video_bg"] == "seedream-2.0"

@pytest.mark.asyncio
async def test_reject_unsupported_model(async_client, auth_headers):
    r = await async_client.put("/model-config",
        json={"script": "gpt-3"}, headers=auth_headers)
    assert r.status_code == 422
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/routes/model_config_routes.py backend/app/utils/model_config_service.py
git commit -m "feat(api): add /model-config — user-configurable AI models per pipeline step (Seedream 2.0, Kling, ElevenLabs etc)"
```

---

### Task 2.4: Remove Auth0 Dead Code

**Files:**
- Delete: `frontend/src/utils/auth0Client.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/src/components/Auth.tsx`

- [ ] **Step 1: Remove auth0Client.ts**

```bash
rm frontend/src/utils/auth0Client.ts
```

- [ ] **Step 2: Remove @auth0/auth0-react from package.json**

```bash
cd frontend && npm uninstall @auth0/auth0-react
```

- [ ] **Step 3: Verify no remaining Auth0 imports**

```bash
grep -rn "auth0\|Auth0" frontend/src/ | grep -v "node_modules"
```

Expected: no output

- [ ] **Step 4: Rename useSupabase.ts → useAuth.ts**

```bash
mv frontend/src/hooks/useSupabase.ts frontend/src/hooks/useAuth.ts
# Update all imports
grep -rln "useSupabase\|from.*hooks/useSupabase" frontend/src/ | \
  xargs sed -i 's|hooks/useSupabase|hooks/useAuth|g; s|useSupabase|useAuth|g'
```

- [ ] **Step 5: Build frontend to verify no broken imports**

```bash
cd frontend && npm run build
```

Expected: build succeeds with no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "chore: remove Auth0 dead code, rename useSupabase→useAuth (Clerk is the auth provider)"
```

---

### Task 2.5: Fix Pricing Sync

**Files:**
- Modify: `backend/app/utils/subscription_service.py`
- Modify: `backend/app/.env.example`

- [ ] **Step 1: Replace hardcoded $49 with env-driven config**

Find in `subscription_service.py` and replace:
```python
# OLD
"price": 49.00

# NEW — matches frontend constants.ts ($29/$79/$199)
PLAN_PRICES = {
    "starter": float(os.getenv("STARTER_PLAN_PRICE", "29.00")),
    "creator": float(os.getenv("CREATOR_PLAN_PRICE", "79.00")),
    "agency": float(os.getenv("AGENCY_PLAN_PRICE", "199.00")),
}
```

- [ ] **Step 2: Update plan names to match frontend**

Frontend `constants.ts` uses: `starter`, `creator`, `agency`
Backend uses: `free`, `professional` — update backend to match.

- [ ] **Step 3: Write test**

```python
def test_plan_prices_match_frontend():
    from app.utils.subscription_service import PLAN_PRICES
    assert PLAN_PRICES["starter"] == 29.00
    assert PLAN_PRICES["creator"] == 79.00
    assert PLAN_PRICES["agency"] == 199.00
```

- [ ] **Step 4: Commit**

```bash
git commit -am "fix: sync pricing between frontend ($29/$79/$199) and backend; replace hardcoded $49"
```

---

## Chunk 3: Phase 3 — Test Framework Setup

### Task 3.1: Backend Test Infrastructure

**Files:**
- Create: `backend/requirements-test.txt`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/pytest.ini`

- [ ] **Step 1: Create requirements-test.txt**

```
pytest==8.1.1
pytest-asyncio==0.23.6
pytest-cov==5.0.0
httpx==0.27.0
anyio==4.3.0
mongomock-motor==0.0.21
fakeredis==2.23.0
```

- [ ] **Step 2: Create pytest.ini**

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short --strict-markers
markers =
    unit: Unit tests (no external services)
    integration: Integration tests (requires DB)
    e2e: End-to-end tests
```

- [ ] **Step 3: Create conftest.py**

```python
# backend/tests/conftest.py
import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock
import mongomock_motor
import fakeredis.aioredis

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()

@pytest.fixture
async def test_db(monkeypatch):
    """In-memory MongoDB for tests."""
    client = mongomock_motor.AsyncMongoMockClient()
    db = client["socialflow_test"]
    monkeypatch.setattr("app.utils.mongodb_service._db", db)
    yield db
    client.close()

@pytest.fixture
async def async_client(test_db):
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client

@pytest.fixture
def mock_openai(monkeypatch):
    mock = AsyncMock()
    mock.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content="Test script content"))]
    )
    monkeypatch.setattr("app.utils.script_generator.openai_client", mock)
    return mock

@pytest.fixture
def mock_elevenlabs(monkeypatch):
    mock = AsyncMock()
    mock.generate.return_value = b"fake-audio-bytes"
    monkeypatch.setattr("app.utils.voiceover_service.elevenlabs_client", mock)
    return mock

@pytest.fixture
def mock_s3(monkeypatch):
    mock = MagicMock()
    mock.upload_fileobj.return_value = None
    mock.delete_object.return_value = None
    monkeypatch.setattr("app.utils.s3_service.get_s3_client", lambda: mock)
    return mock

@pytest.fixture
def auth_headers():
    """JWT token for test user."""
    import jwt, os, datetime
    payload = {
        "sub": "test_user_123",
        "email": "test@example.com",
        "plan": "creator",
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1)
    }
    token = jwt.encode(payload, os.getenv("JWT_SECRET_KEY", "test-secret"), algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def starter_user_token():
    import jwt, datetime
    payload = {"sub": "starter_user", "email": "starter@example.com", "plan": "starter",
               "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1)}
    return jwt.encode(payload, "test-secret", algorithm="HS256")

@pytest.fixture
def creator_user_token():
    import jwt, datetime
    payload = {"sub": "creator_user", "email": "creator@example.com", "plan": "creator",
               "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1)}
    return jwt.encode(payload, "test-secret", algorithm="HS256")
```

- [ ] **Step 4: Run existing tests to establish baseline**

```bash
cd /tmp/socialflow-final
pip install -r backend/requirements-test.txt
pytest backend/tests/ -v --tb=short 2>&1 | head -50
```

- [ ] **Step 5: Commit**

```bash
git add backend/tests/ backend/requirements-test.txt backend/pytest.ini
git commit -m "feat(tests): add pytest infrastructure with mongomock, fakeredis, and API mock fixtures"
```

---

### Task 3.2: Frontend Test Infrastructure

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`
- Modify: `frontend/package.json`

- [ ] **Step 1: Install test dependencies**

```bash
cd frontend
npm install -D vitest @vitest/coverage-v8 @testing-library/react \
  @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Create vitest.config.ts**

```typescript
// frontend/vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
      thresholds: { lines: 60, functions: 60 }
    },
  },
});
```

- [ ] **Step 3: Create test setup**

```typescript
// frontend/src/test/setup.ts
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Clerk auth
vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ user: { id: 'test-user', emailAddresses: [{ emailAddress: 'test@example.com' }] }, isLoaded: true }),
  useAuth: () => ({ getToken: async () => 'mock-token', isSignedIn: true }),
  useClerk: () => ({ signOut: vi.fn() }),
  ClerkProvider: ({ children }: any) => children,
}));

// Mock API base URL
vi.mock('../config/api', () => ({ API_BASE_URL: 'http://localhost:8000' }));
```

- [ ] **Step 4: Add test scripts to package.json**

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

- [ ] **Step 5: Write first component test to verify setup**

```typescript
// frontend/src/test/Dashboard.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Dashboard from '../components/Dashboard';

describe('Dashboard', () => {
  it('renders without crashing', () => {
    render(<Dashboard onLogout={() => {}} />);
    expect(document.body).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run tests**

```bash
cd frontend && npm test
```

- [ ] **Step 7: Commit**

```bash
git add frontend/vitest.config.ts frontend/src/test/ frontend/package.json
git commit -m "feat(tests): add Vitest + React Testing Library with Clerk mock and 60% coverage threshold"
```

---

### Task 3.3: Playwright E2E Framework

**Files:**
- Create: `e2e/playwright.config.ts`
- Create: `e2e/tests/onboarding.spec.ts`
- Create: `e2e/tests/video-creation.spec.ts`
- Create: `e2e/package.json`

- [ ] **Step 1: Set up Playwright**

```bash
mkdir -p /tmp/socialflow-final/e2e
cd /tmp/socialflow-final/e2e
npm init -y
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create playwright.config.ts**

```typescript
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html'], ['github']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});
```

- [ ] **Step 3: Write onboarding E2E test**

```typescript
// e2e/tests/onboarding.spec.ts
import { test, expect } from '@playwright/test';

test.describe('New user onboarding', () => {
  test('can reach landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/SocialFlow/i);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('get started button is visible', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByRole('button', { name: /get started|start free/i });
    await expect(cta).toBeVisible();
  });
});
```

- [ ] **Step 4: Write video creation E2E test (stub — requires auth)**

```typescript
// e2e/tests/video-creation.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Video Studio', () => {
  test.beforeEach(async ({ page }) => {
    // Use test auth token — inject via localStorage
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('__clerk_db_jwt', 'test-token');
    });
  });

  test('video studio page loads', async ({ page }) => {
    await page.goto('/dashboard');
    // This is a smoke test — real auth tested in staging
    await expect(page.locator('body')).toBeVisible();
  });
});
```

- [ ] **Step 5: Add to CI workflow**

Add to `.github/workflows/ci.yml`:
```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: [test-backend, test-frontend]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd e2e && npm ci && npx playwright install --with-deps chromium
      - run: cd e2e && npx playwright test --reporter=github
        env:
          E2E_BASE_URL: http://localhost:5173
```

- [ ] **Step 6: Commit**

```bash
git add e2e/
git commit -m "feat(tests): add Playwright E2E framework (onboarding + video creation smoke tests)"
```

---

### Task 3.4: Test Coverage for Existing Routes

**Files:**
- Create: `backend/tests/test_auth_routes.py`
- Create: `backend/tests/test_video_routes.py`
- Create: `backend/tests/test_subscription_routes.py`

- [ ] **Step 1: Write auth route tests**

```python
# backend/tests/test_auth_routes.py
import pytest

@pytest.mark.asyncio
async def test_sync_user_creates_profile(async_client, test_db):
    r = await async_client.post("/auth/sync-user", json={
        "clerk_user_id": "user_abc123",
        "email": "test@example.com",
        "full_name": "Test User"
    })
    assert r.status_code == 200
    user = await test_db.users.find_one({"email": "test@example.com"})
    assert user is not None

@pytest.mark.asyncio
async def test_get_profile_requires_auth(async_client):
    r = await async_client.get("/auth/user-profile")
    assert r.status_code == 401

@pytest.mark.asyncio
async def test_get_profile_returns_user(async_client, auth_headers, test_db):
    await test_db.users.insert_one({
        "supabase_user_id": "test_user_123",
        "email": "test@example.com",
        "full_name": "Test User",
        "subscription_plan": "creator"
    })
    r = await async_client.get("/auth/user-profile", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["email"] == "test@example.com"
```

- [ ] **Step 2: Write video route tests**

```python
# backend/tests/test_video_routes.py
import pytest
from unittest.mock import patch

@pytest.mark.asyncio
async def test_list_videos_empty(async_client, auth_headers):
    r = await async_client.get("/videos", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == [] or "videos" in r.json()

@pytest.mark.asyncio
async def test_create_video_metadata(async_client, auth_headers):
    r = await async_client.post("/videos", json={
        "title": "Test Video",
        "video_url": "https://example.com/video.mp4",
        "duration": 120
    }, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["title"] == "Test Video"

@pytest.mark.asyncio
async def test_delete_video_cleans_s3(async_client, auth_headers, test_db, mock_s3):
    # Insert a video
    from bson import ObjectId
    vid_id = str(ObjectId())
    await test_db.videos.insert_one({
        "_id": ObjectId(vid_id),
        "user_id": "test_user_123",
        "title": "To Delete",
        "s3_bucket": "my-bucket",
        "s3_key": "videos/test.mp4",
        "video_url": "https://cdn.example.com/test.mp4"
    })
    r = await async_client.delete(f"/videos/{vid_id}", headers=auth_headers)
    assert r.status_code == 200
    mock_s3.delete_object.assert_called_once()
```

- [ ] **Step 3: Run all tests and verify baseline**

```bash
pytest backend/tests/ -v --cov=backend/app --cov-report=term-missing 2>&1 | tail -20
```

Expected: All tests pass, coverage > 40% baseline

- [ ] **Step 4: Commit**

```bash
git add backend/tests/
git commit -m "test: add test coverage for auth, video, and subscription routes (Wave 1 baseline)"
```

---

## Wave 1 Completion Gate

Before merging Wave 1 PRs, verify:

- [ ] `docker compose up` starts all services without errors
- [ ] `curl http://localhost:8000/health` returns `{"status": "healthy"}`
- [ ] `curl http://localhost:3001/health` returns `{"status": "ok"}`
- [ ] `pytest backend/tests/ -v` — all tests pass
- [ ] `cd frontend && npm test` — all tests pass
- [ ] `cd frontend && npm run build` — no TypeScript errors
- [ ] GitHub Actions CI runs on push to main
- [ ] No `print(` in `backend/app/utils/*.py`
- [ ] No wildcard CORS in production config
- [ ] S3 delete called when video deleted (verified by test)
- [ ] Pricing matches frontend: starter=$29, creator=$79, agency=$199

```bash
# Final verification command
cd /tmp/socialflow-final
pytest backend/tests/ -v --tb=short
cd frontend && npm test && npm run build
grep -rn "^    print(" backend/app/utils/ && echo "FAIL: print() found" || echo "PASS: no print()"
docker compose config --quiet && echo "PASS: compose valid"
```

```bash
# Push Wave 1
git push origin main
gh workflow run ci.yml --ref main
```
