"""
AI helper chatbot route — streams responses via SSE using the Anthropic API.
"""
import json
import logging
import os

import anthropic
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Literal, Optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])

SYSTEM_PROMPT = """You are SocialFlow Assistant, a friendly and knowledgeable helper built into the SocialFlow platform — an AI-powered social media management SaaS.

Your role is to help users navigate and get the most out of SocialFlow. Here's what you know about the platform:

**Core Features:**
- **Dashboard**: Overview of campaign stats, active integrations, recent activity, and lead counts.
- **Campaigns**: Create and schedule multi-platform posts across Facebook, Instagram, LinkedIn, YouTube, and TikTok. AI generates captions and hashtags.
- **Lead Generation**: Search companies and contacts, score leads with AI, export lists. Use Individual or Company mode.
- **Credit / Risk Analysis**: AI-powered financial risk and credit scoring for companies — provides risk score, news signals, and social mentions.
- **Video Studio**: Generate AI videos using HeyGen + ElevenLabs voices, preview, edit, and publish directly to social platforms.
- **Social Integrations**: Connect Facebook, Instagram, LinkedIn, YouTube via OAuth or API keys. Manage tokens and refresh credentials from the Integrations section in the sidebar.
- **User Profile**: Update personal and company info, set AI preferences, manage billing and subscription.
- **Subscription**: Free, Pro, and Enterprise tiers via Stripe. Pro unlocks AI content generation and video studio.

**Getting Started Tips:**
1. Connect at least one social platform in the Integrations section (sidebar).
2. Create a Campaign and let AI generate your post copy.
3. Use Lead Generation to find prospects relevant to your industry.
4. Use Video Studio to create short-form video content.

**Troubleshooting:**
- If a platform shows "Not Connected", go to Integrations in the sidebar and reconnect.
- If video generation hangs, check that your HeyGen API key is configured.
- For billing issues, visit the Profile page and scroll to the Billing section.

Keep answers concise, helpful, and action-oriented. Use markdown formatting for clarity. Do not hallucinate features that don't exist."""


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    max_tokens: int = Field(default=1024, ge=1, le=4096)


@router.post("/stream")
async def chat_stream(request: ChatRequest, authorization: Optional[str] = Header(None)):
    """Stream a chat response using the Anthropic API (SSE)."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI assistant is not configured.")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")

    # Convert to Anthropic message format
    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    async def generate():
        try:
            client = anthropic.Anthropic(api_key=api_key)
            with client.messages.stream(
                model="claude-opus-4-6",
                max_tokens=request.max_tokens or 1024,
                system=SYSTEM_PROMPT,
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    yield f"data: {json.dumps({'type': 'text', 'text': text})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except anthropic.APIError as e:
            logger.error(f"Anthropic API error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        except Exception as e:
            logger.error(f"Chat stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': 'Something went wrong. Please try again.'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
