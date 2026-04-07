# SocialFlow — Complete Architecture & Gap Analysis
> Last updated: April 7, 2026

---

## 1. Product Overview

SocialFlow is an AI-powered social media management SaaS with three core capabilities:

1. **AI Video Studio** — Generate branded marketing videos using Remotion + ElevenLabs voiceover + fal.ai/DALL-E backgrounds
2. **Lead Intelligence** — LinkedIn scraping, live lead search, credit/risk scoring, AI-personalized outreach
3. **Social Publishing** — Multi-platform posting to Facebook, Instagram, LinkedIn, YouTube with OAuth credential management

**Target users:** B2B marketers, agencies, SMBs who need to create and distribute video content at scale.

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     USERS (Browser)                                  │
│                React 18 + TypeScript + Vite + Tailwind               │
│  Landing → Auth (Clerk) → Dashboard                                  │
│  Tabs: Home | Video Studio | Leads | Campaigns | Company Analysis    │
│        Social Integrations | Subscription | Profile                  │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ HTTPS / Axios
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  FastAPI Backend (Python 3.x)                        │
│                  Port 8000 | Single EC2 instance                     │
├──────────────────────────────────────────────────────────────────────┤
│  Routes:                                                             │
│  /auth          /campaigns      /leads          /videos              │
│  /api/integrations  /api/subscription  /api/chat  /api/risk-analysis │
│  /api/company-analysis  /api/live-leads  /api/user                  │
│                                                                      │
│  Middleware: JWT auth (Clerk) | CORS | Request logging               │
│  Encryption: AES for stored OAuth credentials (INTEGRATION_KEY)      │
└──────┬──────────────┬───────────────┬─────────────────┬─────────────┘
       │              │               │                 │
       ▼              ▼               ▼                 ▼
┌────────────┐ ┌───────────┐ ┌─────────────┐ ┌────────────────────┐
│  MongoDB   │ │  Remotion │ │  AWS S3 +   │ │  External APIs     │
│  Atlas     │ │  Service  │ │  CloudFront │ │                    │
│            │ │  Port 3001│ │             │ │  OpenAI (GPT-4o)   │
│  users     │ │           │ │  Video      │ │  Anthropic (Claude)│
│  leads     │ │  POST     │ │  storage &  │ │  ElevenLabs        │
│  campaigns │ │  /render  │ │  CDN        │ │  fal.ai / Kling    │
│  videos    │ │           │ │             │ │  Stripe            │
│  subscriptions  20 templates  d2nbx2qjod9 │  Facebook Graph    │
│  integrations   SocialFlow    qta.cloudfront│ Instagram Graph  │
│  usage_tracking Video comp    .net         │  LinkedIn API      │
│  companies │ └───────────┘ └─────────────┘ │  YouTube OAuth2    │
└────────────┘                                │  SMTP/Gmail        │
                                              │  DuckDuckGo        │
                                              └────────────────────┘
```

---

## 3. Service Breakdown

### 3.1 Backend (Python FastAPI)

| Route Prefix | File | Purpose |
|---|---|---|
| `/auth` | `auth_routes.py` | User sync, profile, AI summary, email notifications |
| `/campaigns` | `campaigns_routes.py` | CRUD campaigns, start/pause/complete, templates |
| `/leads` | `leads_routes.py` | CRUD leads, bulk import, LinkedIn import |
| `/api/live-leads` | `leads_routes.py` | Live DuckDuckGo + scraper lead search (cached 1hr) |
| `/videos` | `videos_routes.py` | CRUD video metadata, S3 presigned URLs, analytics |
| `/api/integrations` | `integrations_routes.py` | Save/test OAuth credentials (encrypted), YouTube OAuth2 |
| `/api/subscription` | `subscription_routes.py` | Stripe webhook, plans, usage limits, cancel/reactivate |
| `/api/chat` | `chat_routes.py` | Streaming chat via Claude Opus 4.6 |
| `/api/risk-analysis` | `risk_analysis_routes.py` | Claude-powered company risk scoring |
| `/api/company-analysis` | `company_routes.py` | Company suggestions via DuckDuckGo |
| `/api/user` | `user_routes.py` | Sender identity CRUD |
| `/content` | `content_routes.py` | Video generation pipeline (AI content → Remotion render) |

#### All API Endpoints

**Auth (`/auth`)**
```
POST   /auth/sync-user              Sync Clerk user to MongoDB on login
GET    /auth/user-profile           Get profile + stats
PUT    /auth/user-profile           Update profile fields
PUT    /auth/user-subscription      Update subscription plan/status
DELETE /auth/user-account           Delete account + all data
POST   /auth/profile-summary        Generate AI bio (GPT-4o)
POST   /auth/notify-login           Send login notification email
POST   /auth/notify-password-reset  Send password reset email
```

**Campaigns (`/campaigns`)**
```
POST   /campaigns                            Create campaign (checks video limit)
GET    /campaigns                            List campaigns (filter, paginate)
GET    /campaigns/{id}                       Get campaign
PUT    /campaigns/{id}                       Update campaign
PUT    /campaigns/{id}/metrics               Update sent/delivered/opened metrics
DELETE /campaigns/{id}                       Delete campaign
GET    /campaigns/stats/overview             Aggregate stats
GET    /campaigns/{id}/performance           Detailed performance breakdown
GET    /campaigns/search/{query}             Search campaigns
POST   /campaigns/{id}/start                 Set status → active
POST   /campaigns/{id}/pause                 Set status → paused
POST   /campaigns/{id}/complete              Set status → completed
POST   /campaigns/templates/{id}/create      Create from template
POST   /campaigns/dialogue/save-or-update    Save campaign dialogue content
```

**Leads (`/leads`, `/api/live-leads`)**
```
POST   /leads                   Create lead
GET    /leads                   List leads (filter by status/company)
GET    /leads/{id}              Get lead
PUT    /leads/{id}              Update lead
DELETE /leads/{id}              Delete lead
POST   /leads/bulk              Bulk create leads
GET    /leads/stats/overview    Lead statistics
GET    /leads/search/{query}    Search leads
POST   /leads/import/linkedin   Import from LinkedIn
GET    /api/live-leads          Live search (Hot/Warm/Cold tiers, 1hr cache)
```

**Videos (`/videos`)**
```
POST   /videos                      Create video metadata (checks subscription)
GET    /videos                      List videos (filter, sort)
GET    /videos/stats                Video statistics
GET    /videos/search/{query}       Search videos
GET    /videos/proxy-download       Stream video (no auth, URL param)
GET    /videos/{id}                 Get video metadata
PUT    /videos/{id}                 Update video metadata
POST   /videos/{id}/analytics       Increment views/downloads/shares
GET    /videos/{id}/download        Presigned S3 URL (1hr expiry)
GET    /videos/{id}/download-proxy  Proxy stream through backend
DELETE /videos/{id}                 Delete metadata (S3 cleanup separate)
```

**Integrations (`/api/integrations`)**
```
POST   /api/integrations/save                  Save platform credentials (AES encrypted)
GET    /api/integrations/list                  List all user integrations
GET    /api/integrations/{platform}            Get specific platform
DELETE /api/integrations/{platform}            Remove integration
POST   /api/integrations/test                  Test credentials (platform validators)
GET    /api/integrations/youtube/oauth/authorize  Start YouTube OAuth2 flow
GET    /api/integrations/youtube/oauth/callback   YouTube OAuth2 callback
```

**Subscriptions (`/api/subscription`)**
```
GET    /api/subscription/config                      Stripe public config
GET    /api/subscription/plans                       Available plans + pricing
GET    /api/subscription/status/{user_id}            Status + usage stats
POST   /api/subscription/webhook                     Stripe webhook (sig verified)
POST   /api/subscription/cancel/{user_id}            Cancel (end of period)
POST   /api/subscription/reactivate/{user_id}        Reactivate subscription
GET    /api/subscription/check-limit/{uid}/{type}    Check usage against limit
POST   /api/subscription/track-usage/{uid}/{type}    Increment usage counter
```

**Other**
```
POST   /api/chat/stream                   Claude Opus streaming chat
GET    /api/company-analysis/suggestions  DuckDuckGo company suggestions
POST   /api/risk-analysis                 Claude company risk scoring
GET    /api/user/sender-identity          Get sender identity
PUT    /api/user/sender-identity          Update sender identity
```

---

### 3.2 Frontend (React 18 + TypeScript + Vite)

#### Route/View Structure
```
/ (Landing)              Public marketing page
/auth                    Clerk auth handler
/auth/callback           OAuth callback
/dashboard               Main authenticated app shell
  ├── Home tab           Stats overview, recent activity
  ├── Video Studio       AI video generation (primary feature)
  ├── Leads              Lead database, live search, import
  ├── Campaigns          Campaign CRUD + management
  ├── Company Analysis   Risk scoring, company research
  ├── Social Integrations  OAuth connect Facebook/IG/LinkedIn/YouTube
  ├── Subscription       Plan picker, upgrade modal
  └── Profile            Account settings, sender identity
```

#### Key Components
| Component | Purpose |
|---|---|
| `AppWithAuth.tsx` | Clerk auth gate — redirects to Landing or Dashboard |
| `Dashboard.tsx` | Sidebar shell, tab routing |
| `VideoStudio.tsx` | Main video creator (dialogue → scenes → render → publish) |
| `VideoStudio2.tsx` | Alternative studio UI (legacy/A/B) |
| `ScenePreviewPlayer.tsx` | Live Remotion Player preview in editor |
| `VideoStudioConfigPopup.tsx` | Voice, background mode, template config |
| `useVideoStudioState.ts` | All studio state (scenes, dialogue, audio, publish targets) |
| `Leads.tsx` | Lead table, live search, import wizard |
| `SocialIntegration.tsx` | Platform OAuth connect/disconnect UI |
| `CreditRating.tsx` | Company risk score display |
| `ChatBot.tsx` | In-app Claude AI assistant |
| `Subscription.tsx` | Plan cards + Stripe embed |
| `SubscriptionModal.tsx` | Upgrade gate modal |
| `WelcomeModal.tsx` | First-login onboarding |
| `OnboardingTour.tsx` | Step-by-step feature tour |
| `NudgeCard.tsx` | Contextual upsell nudges |

#### Frontend Dependencies
```json
{
  "@clerk/clerk-react": "^5.61.4",
  "@auth0/auth0-react": "^2.15.0",
  "@remotion/player": "^4.0.435",
  "remotion": "^4.0.435",
  "axios": "^1.13.1",
  "framer-motion": "^12.23.24",
  "lucide-react": "^0.344.0",
  "openai": "^5.23.1",
  "react": "^18.3.1"
}
```

---

### 3.3 Remotion Video Service (Node.js, Port 3001)

**Render endpoint:** `POST /render`

**Request:**
```typescript
{
  voiceover_url: string        // ElevenLabs-generated audio
  bgm_url: string              // Background music
  client_logo_url: string      // Brand logo
  user_logo_url: string        // SocialFlow watermark
  subtitle_segments: []        // Word-level timing from Whisper
  caption_segments?: []        // Phrase-level captions overlay
  scene_descriptors: []        // Template specs per scene
  duration: number             // Total video seconds
  show_captions?: boolean      // Default: true
}
```

**Output:** MP4 → `/tmp` → uploaded to S3 → CloudFront URL returned

**20 Remotion Templates:**

| Category | Templates |
|---|---|
| Cinematic | CinematicReveal, CinematicBars, QuoteReveal |
| Kinetic/High-Energy | ZoomPunch, HorizontalSlam, WordBurst, CTABurst, GravityDrop, ElectricPulse, SplitReveal |
| Tech/Data | GlitchReveal, DataStream, TypeBurn, StatShot |
| Structured/Clear | ChromaSlice, SplitStage, NeonFrame, TimelineStep, IconHero, WaveText |

**Scene props per template:**
- `headline` (2–4 words), `subtext`, `accent_color` (16 presets)
- `icon` (12 options: person, rocket, chart, shield, etc.)
- `transition_out` (cross_fade, flash, zoom_out, none)
- `background_image_url`, `background_video_url`
- `particle_intensity` (0–1)

---

### 3.4 Database (MongoDB Atlas)

**Database name:** `socialflow`

| Collection | Key Fields |
|---|---|
| `users` | supabase_user_id, email, full_name, company_name, subscription_plan, sender_identity, ai_summary |
| `leads` | user_id, name, email, job_title, company, linkedin_url, lead_score, status, tags |
| `campaigns` | user_id, name, type, status, content, metrics (sent/delivered/opened), start/end dates |
| `videos` | user_id, campaign_id, video_url, s3_key, title, duration, status, views, downloads, shares |
| `subscriptions` | user_id, stripe_customer_id, stripe_subscription_id, plan, status, period_end |
| `usage_tracking` | user_id, period_start, videos_used, platforms_connected |
| `integrations` | user_id, platform, credentials (AES encrypted), is_connected, last_tested |
| `companies` | company_name, logo_url, website, risk_score, risk_level, news, social, user_ids |

---

### 3.5 Subscription Plans

| Feature | Free | Professional ($49/mo) |
|---|---|---|
| Videos/month | 5 | Unlimited |
| Platform connections | 1 | Unlimited |
| Analytics | Basic | Advanced |
| Custom branding | No | Yes |
| API access | No | Yes |
| Support | Email | Priority |

---

## 4. External Services & API Keys Required

| Service | Env Var | Used For |
|---|---|---|
| MongoDB Atlas | `MONGODB_URI` | Primary database |
| OpenAI | `OPENAI_API_KEY` | GPT-4o content gen, DALL-E backgrounds, profile summaries |
| Anthropic | `ANTHROPIC_API_KEY` | Claude Opus streaming chat, risk analysis, scene descriptor |
| ElevenLabs | `ELEVENLABS_API_KEY` | Voiceover synthesis |
| fal.ai / Kling | `FAL_API_KEY` | AI video background clips |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Subscriptions |
| AWS S3 | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` | Video storage |
| CloudFront | `CLOUDFRONT_DOMAIN` | Video CDN delivery |
| Clerk | `CLERK_FRONTEND_API` | User authentication |
| SMTP/Gmail | `SMTP_USER`, `SMTP_PASSWORD` | Transactional emails |
| Facebook Graph | User-supplied via UI | Post to Pages |
| Instagram Graph | User-supplied via UI | Post Reels/Feed |
| LinkedIn API | User-supplied via UI | Post to profile/page |
| YouTube OAuth2 | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (backend) | Upload videos |
| Encryption | `INTEGRATION_ENCRYPTION_KEY` | AES-encrypt stored OAuth creds |
| JWT | `JWT_SECRET_KEY` | Backend token validation |

---

## 5. What's Missing / Gap Analysis

### 🔴 Critical — Blocks Production

| Gap | Detail | Fix |
|---|---|---|
| **No CI/CD pipeline** | Zero `.github/workflows/`. Manual deploy via bash script on EC2 | Add GitHub Actions: test → build → deploy |
| **No Docker/containerization** | Single process, manual install, no isolation | Add `Dockerfile` + `docker-compose.yml` for all 3 services |
| **Remotion service not deployed** | Local only, no infra for cloud rendering | Deploy as separate ECS/EC2 service or use Remotion Lambda |
| **S3 cleanup on video delete** | `/videos/{id}` DELETE only removes MongoDB record, not the S3 object | Add `s3.delete_object()` in delete handler |
| **YouTube OAuth server-side PKCE** | `code_verifier` stored client-side — security risk | Move to server-side session |
| **No rate limiting** | All endpoints unprotected from abuse | Add slowapi / Redis rate limiter |
| **TLS validation disabled** | `tlsAllowInvalidCertificates=True` in MongoDB connection | Fix cert or use proper Atlas CA |

---

### 🟡 Important — Affects MVP Quality

| Gap | Detail | Fix |
|---|---|---|
| **Debug `print()` in production** | `fb_post_helper.py`, `youtube_post_helper.py` use raw print() | Replace with `logging.getLogger()` |
| **Hardcoded price ($49)** | Price in multiple files — breaks if pricing changes | Pull from Stripe product config |
| **No secrets management** | Env vars in `.env` file on disk | Use AWS Secrets Manager or Vault |
| **No input validation on some routes** | Risk of malformed data reaching DB | Add Pydantic models on all routes |
| **CORS set to `*`** | Dev config may leak to prod | Lock to specific frontend origins |
| **No automatic S3 presigned URL refresh** | 1hr expiry — long videos may expire mid-use | Implement refresh endpoint or extend TTL |
| **Twitter integration stubbed** | Listed in constants, no implementation | Implement or remove from UI |
| **No lead enrichment** | Leads imported but not auto-enriched (email, phone, company info) | Add enrichment via Apollo/Hunter/Clearbit API |
| **No video draft backend sync** | Draft state in localStorage only — lost on browser clear | Add `PUT /videos/{id}/draft` endpoint |
| **No batch/scheduled publish** | Videos published immediately only | Add scheduling queue (Celery + Redis) |

---

### 🟢 Enhancement — Post-MVP

| Gap | Detail |
|---|---|
| **No analytics dashboard** | Stats endpoints exist, no chart UI (no Chart.js/Recharts) |
| **No multi-language support** | All content English-only |
| **No webhook events** | No outbound webhooks for user automation (Zapier/n8n integration) |
| **No team/multi-user orgs** | Solo user only — no workspace sharing |
| **No video versioning** | Can't re-render or track previous versions of a video |
| **No A/B testing for video content** | No variant testing on video performance |
| **No in-app lead email sending** | Leads exist but no email campaign execution in-app |
| **Company database not persistent** | Company analysis uses DuckDuckGo live — no caching or DB population |
| **No mobile responsive design** | Dashboard is desktop-first |
| **HeyGen integration unused** | `heygen.ts` exists in frontend services but never called |

---

## 6. Infrastructure Gaps (Deployment)

### Current State
```
EC2 (single instance)
├── Python FastAPI (port 8000) — manual start via bash script
├── Remotion Node server (port 3001) — local only, not deployed
└── .env file on disk — no secrets rotation
```

### Target State (Production-Ready)
```
AWS
├── ECS Fargate
│   ├── Task: socialflow-backend (FastAPI, auto-scale)
│   └── Task: socialflow-remotion (Node render server, auto-scale)
├── MongoDB Atlas (managed, existing)
├── S3 + CloudFront (existing)
├── ALB (load balancer + SSL termination)
├── AWS Secrets Manager (all env vars)
├── CloudWatch (logs + alerts)
└── GitHub Actions CI/CD
    ├── On PR: lint + test
    └── On merge to main: build → push ECR → deploy ECS
```

---

## 7. Tech Debt Summary

### Backend
- `content_routes.py` — Very large file, needs splitting into smaller modules
- `mongodb_service.py` — Some services reinitialize connections instead of using singleton
- Inconsistent error response format across routes (some return `{"error": "..."}`, some raise `HTTPException`)
- No request ID / tracing (hard to debug prod issues)
- No health check endpoint (`GET /health`)

### Frontend
- Two video studio components (`VideoStudio.tsx` + `VideoStudio2.tsx`) — unclear which is active
- Both `@clerk/clerk-react` and `@auth0/auth0-react` installed — only Clerk is active; Auth0 should be removed
- `useSupabase.ts` hook exists but Supabase auth was replaced by Clerk — dead code
- `Auth.tsx` and `AuthCallback.tsx` may be redundant with Clerk's hosted auth

### Remotion Service
- No health endpoint on port 3001
- Bundle cached in memory — template changes require service restart
- No queue — concurrent render requests will contend for CPU
- `/tmp` output not cleaned up automatically

---

## 8. What's Built vs What's Missing (Summary Table)

| Feature | Status |
|---|---|
| User auth (Clerk) | ✅ Complete |
| MongoDB CRUD (leads, videos, campaigns) | ✅ Complete |
| Subscription / Stripe billing | ✅ Complete |
| Video metadata management | ✅ Complete |
| S3 video storage + CloudFront CDN | ✅ Complete |
| 20 Remotion video templates | ✅ Complete |
| ElevenLabs voiceover | ✅ Complete |
| fal.ai / DALL-E video backgrounds | ✅ Complete |
| AI scene descriptor (GPT picks templates) | ✅ Complete |
| Claude chat assistant | ✅ Complete |
| Lead CRUD + bulk import | ✅ Complete |
| Live lead search (DuckDuckGo) | ✅ Complete |
| LinkedIn scraper | ✅ Complete |
| Lead scoring | ✅ Complete |
| Company risk analysis (Claude) | ✅ Complete |
| Facebook/Instagram/LinkedIn/YouTube posting | ✅ Complete |
| Encrypted credential storage | ✅ Complete |
| YouTube OAuth2 flow | ✅ Complete |
| Campaign CRUD + lifecycle | ✅ Complete |
| Usage tracking + plan limits | ✅ Complete |
| CI/CD pipeline | ❌ Missing |
| Docker / containerization | ❌ Missing |
| Remotion service deployed to cloud | ❌ Missing |
| S3 cleanup on video delete | ❌ Missing |
| Rate limiting | ❌ Missing |
| Secrets management (AWS SM) | ❌ Missing |
| Scheduled/queued social posting | ❌ Missing |
| Lead enrichment (email, phone auto-fill) | ❌ Missing |
| Analytics dashboard (charts) | ❌ Missing |
| Twitter/X integration | ❌ Missing (stubbed) |
| Team/workspace multi-user | ❌ Missing |
| Health check endpoints | ❌ Missing |
| Video draft backend sync | ❌ Missing |
| Automatic S3 cleanup (temp files) | ❌ Missing |
