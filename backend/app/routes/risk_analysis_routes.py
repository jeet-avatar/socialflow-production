"""
Risk Analysis Routes - Claude-powered company risk assessment
Secure backend endpoint to keep API keys private
"""

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Annotated, Dict, Any, Optional

import anthropic
from fastapi import APIRouter, HTTPException, Depends, Header

from utils.middleware.auth_middleware import auth_middleware

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/risk-analysis", tags=["Risk Analysis"])

_SKIP_COMPANY_FIELDS = {"data_source", "logo_url", "employees_preview", "google_url", "_id"}
_VALID_RISK_LEVELS = {'Low', 'Low-Medium', 'Medium', 'Medium-High', 'High'}

_CLAUDE_SYSTEM_PROMPT = """You are an expert financial risk analyst specializing in company credit risk assessment.

CRITICAL: Respond with ONLY a valid JSON object — no markdown, no code fences, no explanatory text.

JSON structure:
{
  "overallRiskScore": number (0-100, 0=lowest risk),
  "riskLevel": "Low" | "Low-Medium" | "Medium" | "Medium-High" | "High",
  "sections": [
    {
      "section": "Company Information" | "News Analysis" | "Social Media Analysis",
      "sentiments": [{ "field": "...", "sentiment": "positive"|"negative"|"neutral", "score": 0-100, "reasoning": "..." }],
      "overallSentiment": "positive" | "negative" | "neutral",
      "overallScore": number (0-100),
      "summary": "..."
    }
  ],
  "keyRiskFactors": ["..."],
  "keyPositiveFactors": ["..."],
  "recommendation": "...",
  "confidence": number (0-100)
}

Risk score bands:
- 0-20: Low (established, stable, positive signals)
- 21-40: Low-Medium (generally stable, minor concerns)
- 41-60: Medium (mixed signals)
- 61-80: Medium-High (several concerns)
- 81-100: High (significant red flags)

News category risk weights:
- Mergers & Acquisitions: HIGH signal — raises uncertainty, integration risk
- Funding Rounds: POSITIVE signal — growth, investor confidence
- IPO: MIXED — opportunity but volatility risk
- Leadership Changes: WATCH signal — stability concern if multiple changes
- Rapid Hiring: POSITIVE — growth indicator
- Announcements: POSITIVE — active business development
- Other News: context-dependent

Scoring factors:
1. Company fundamentals (age, size, industry, HQ geography)
2. News volume + category mix (M&A / leadership churn = higher risk; funding / hiring = lower risk)
3. Social media presence and content tone
4. Industry-specific risk
5. Recent event patterns"""


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------

def get_current_user(authorization: Annotated[Optional[str], Header()] = None) -> dict:
    """Dependency to get current authenticated user"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_info = auth_middleware.verify_token(authorization)
    if not user_info:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user_info


# ---------------------------------------------------------------------------
# Validation helper
# ---------------------------------------------------------------------------

def validate_risk_analysis(analysis: Dict[str, Any]) -> None:
    """Validate the structure of risk analysis response"""
    score = analysis.get('overallRiskScore')
    if score is None or not isinstance(score, (int, float)) or score < 0 or score > 100:
        raise ValueError('Invalid overall risk score')
    if analysis.get('riskLevel') not in _VALID_RISK_LEVELS:
        raise ValueError('Invalid risk level')
    if not isinstance(analysis.get('sections'), list):
        raise ValueError('Invalid sections structure')
    if not isinstance(analysis.get('keyRiskFactors'), list) or not isinstance(analysis.get('keyPositiveFactors'), list):
        raise ValueError('Invalid factors structure')


# ---------------------------------------------------------------------------
# Prompt building helpers (reduce cognitive complexity)
# ---------------------------------------------------------------------------

def _prompt_company_section(company_data: Dict[str, Any]) -> str:
    company = company_data.get('company', {})
    if not company:
        return ""
    lines = ["COMPANY INFORMATION:"]
    for key, value in company.items():
        if not value or key in _SKIP_COMPANY_FIELDS:
            continue
        lines.append(f"{key}: {', '.join(str(v) for v in value)}" if isinstance(value, list) else f"{key}: {value}")
    return "\n".join(lines) + "\n\n"


def _flatten_news(news: Any) -> list:
    if isinstance(news, dict):
        return [a for articles in news.values() if isinstance(articles, list) for a in articles]
    if isinstance(news, list):
        return news
    return []


def _prompt_news_section(company_data: Dict[str, Any]) -> str:
    articles = _flatten_news(company_data.get('news'))
    if not articles:
        return ""
    lines = ["NEWS ANALYSIS:"]
    for i, article in enumerate(articles[:35], 1):
        title = article.get('News Title') or article.get('title', 'Untitled')
        source = article.get('Source') or article.get('source', '')
        date = article.get('Published Date') or article.get('date', '')
        meta = f"{source}, {date}".strip(", ")
        lines.append(f"  {i}. {title}" + (f" ({meta})" if meta else ""))
    return "\n".join(lines) + "\n\n"


def _prompt_social_section(company_data: Dict[str, Any]) -> str:
    social = company_data.get('social')
    if not social or not isinstance(social, list):
        return ""
    lines = ["SOCIAL MEDIA SIGNALS (Twitter / Instagram / Facebook):"]
    for i, post in enumerate(social[:10], 1):
        content = (post.get('content') or '')[:200]
        ellipsis = '...' if len(post.get('content') or '') > 200 else ''
        line = f"  {i}. [{post.get('platform', '')}] {content}{ellipsis}"
        if post.get('url'):
            line += f" — {post['url']}"
        lines.append(line)
    return "\n".join(lines) + "\n\n"


def build_analysis_prompt(company_data: Dict[str, Any]) -> str:
    """Build the analysis prompt from company data."""
    return (
        "Analyze the following company data for credit risk assessment:\n\n"
        + _prompt_company_section(company_data)
        + _prompt_news_section(company_data)
        + _prompt_social_section(company_data)
        + "Provide a comprehensive risk analysis in the specified JSON format."
    )


def _strip_markdown_fences(text: str) -> str:
    """Remove markdown code fences from OpenAI response."""
    text = re.sub(r'^```(?:json)?\s*', '', text.strip())
    return re.sub(r'\s*```$', '', text)


# ---------------------------------------------------------------------------
# Fallback analysis helpers (reduce cognitive complexity)
# ---------------------------------------------------------------------------

def _score_to_risk_level(score: int) -> str:
    if score <= 20:
        return 'Low'
    if score <= 40:
        return 'Low-Medium'
    if score <= 60:
        return 'Medium'
    if score <= 80:
        return 'Medium-High'
    return 'High'


def _analyze_company_age(company: dict) -> tuple:
    """Returns (score_delta, risk_factors, positive_factors)"""
    try:
        age = datetime.now(timezone.utc).year - int(company['founded'])
        if age > 20:
            return -10, [], [f"Established company ({age} years old)"]
        if age < 3:
            return 10, [f"Young company ({age} years old)"], []
    except (ValueError, KeyError, TypeError):
        pass
    return 0, [], []


def _analyze_company_size(company: dict) -> tuple:
    """Returns (score_delta, risk_factors, positive_factors)"""
    size = str(company.get('size', '')).lower()
    if '10,001+' in size or 'large' in size or '10000+' in size:
        return -8, [], ['Large enterprise']
    if '1-10' in size or 'startup' in size:
        return 8, ['Very small company'], []
    return 0, [], []


def _count_news(news: Any) -> int:
    if isinstance(news, dict):
        return sum(len(v) for v in news.values() if isinstance(v, list))
    if isinstance(news, list):
        return len(news)
    return 0


def _analyze_news(company_data: Dict[str, Any]) -> tuple:
    """Returns (score_delta, risk_factors, positive_factors, section)"""
    news_count = _count_news(company_data.get('news', []))
    if news_count > 10:
        delta, risks, positives = -5, [], ['Strong media presence']
    elif news_count < 2:
        delta, risks, positives = 3, ['Limited media coverage'], []
    else:
        delta, risks, positives = 0, [], []
    section = {
        "section": "News Analysis",
        "sentiments": [],
        "overallSentiment": "positive" if news_count > 5 else "neutral",
        "overallScore": min(70, 40 + news_count * 2),
        "summary": f"Found {news_count} news articles",
    }
    return delta, risks, positives, section


def _analyze_social(company_data: Dict[str, Any]) -> tuple:
    """Returns (score_delta, risk_factors, positive_factors, section)"""
    social_count = len(company_data.get('social', []))
    if social_count > 8:
        delta, risks, positives = -3, [], ['Active social media presence']
    elif social_count < 2:
        delta, risks, positives = 2, ['Limited social media activity'], []
    else:
        delta, risks, positives = 0, [], []
    section = {
        "section": "Social Media Analysis",
        "sentiments": [],
        "overallSentiment": "positive" if social_count > 5 else "neutral",
        "overallScore": min(70, 30 + social_count * 3),
        "summary": f"Found {social_count} social media posts",
    }
    return delta, risks, positives, section


# ---------------------------------------------------------------------------
# Core analysis functions
# ---------------------------------------------------------------------------

def perform_claude_risk_analysis(company_data: Dict[str, Any]) -> Dict[str, Any]:
    """Perform AI-powered risk analysis using Claude claude-opus-4-6 with adaptive thinking."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not configured")

    prompt = build_analysis_prompt(company_data)
    logger.info(f"Analysis prompt prepared, length: {len(prompt)}")

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4000,
        thinking={"type": "adaptive"},
        system=_CLAUDE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    # Extract the text block (adaptive thinking may prepend a thinking block)
    raw = next(
        (block.text for block in message.content if hasattr(block, "text")),
        None,
    )
    if not raw:
        raise ValueError("No text response from Claude")

    cleaned = _strip_markdown_fences(raw)
    logger.info(f"Claude response received, length: {len(cleaned)}")

    try:
        risk_analysis = json.loads(cleaned)
    except json.JSONDecodeError as parse_error:
        logger.error(f"JSON parsing failed: {parse_error}\nRaw: {cleaned[:300]}")
        raise ValueError(f"Failed to parse Claude response as JSON: {parse_error}") from parse_error

    try:
        validate_risk_analysis(risk_analysis)
    except ValueError as validation_error:
        logger.error(f"Risk analysis validation failed: {validation_error}")
        raise ValueError(f"Claude response validation failed: {validation_error}") from validation_error

    logger.info(
        f"Claude risk analysis completed: Score={risk_analysis.get('overallRiskScore')}, "
        f"Level={risk_analysis.get('riskLevel')}, Confidence={risk_analysis.get('confidence')}"
    )
    return risk_analysis


def perform_fallback_risk_analysis(company_data: Dict[str, Any]) -> Dict[str, Any]:
    """Fallback rule-based risk analysis when OpenAI is unavailable."""
    risk_score = 50
    key_risk_factors: list = []
    key_positive_factors: list = []
    sections: list = []

    company = company_data.get('company', {})

    for delta, risks, positives in [
        _analyze_company_age(company),
        _analyze_company_size(company),
    ]:
        risk_score += delta
        key_risk_factors.extend(risks)
        key_positive_factors.extend(positives)

    for delta, risks, positives, section in [
        _analyze_news(company_data),
        _analyze_social(company_data),
    ]:
        risk_score += delta
        key_risk_factors.extend(risks)
        key_positive_factors.extend(positives)
        sections.append(section)

    risk_score = max(0, min(100, risk_score))

    return {
        "overallRiskScore": risk_score,
        "riskLevel": _score_to_risk_level(risk_score),
        "sections": sections,
        "keyRiskFactors": key_risk_factors,
        "keyPositiveFactors": key_positive_factors,
        "recommendation": (
            "Risk analysis completed with rule-based methodology. "
            "For AI-powered analysis, please configure the ANTHROPIC_API_KEY."
        ),
        "confidence": 65,
    }


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("/analyze")
async def analyze_company_risk(
    company_data: Dict[str, Any],
    user_info: Annotated[dict, Depends(get_current_user)],
):
    """
    Analyze company risk using OpenAI GPT-4 or fallback to rule-based analysis.
    Requires authentication. Keeps OpenAI API key secure on backend.
    """
    try:
        logger.info(f"Risk analysis request from user: {user_info.get('email')}")
        analysis = await asyncio.to_thread(perform_claude_risk_analysis, company_data)
        return {"success": True, "analysis": analysis, "method": "claude"}
    except Exception as e:
        logger.error(f"Risk analysis error: {e}")
        return {
            "success": True,
            "analysis": perform_fallback_risk_analysis(company_data),
            "method": "fallback",
            "error": str(e),
        }
