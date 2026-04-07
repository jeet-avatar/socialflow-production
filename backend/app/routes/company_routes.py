"""
Company Analysis and Management Routes
Handles company credit rating, reports, and company list endpoints
"""

import logging
from typing import Annotated, Optional
from urllib.parse import quote as urlquote

from fastapi import APIRouter, Depends, HTTPException, Header, Query

from utils.middleware.auth_middleware import auth_middleware
from utils.mongodb_service import mongodb_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["company"])


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
# Helpers
# ---------------------------------------------------------------------------

def _ddg_search(q: str) -> list:
    """Run a single DuckDuckGo text search, returning an empty list on error."""
    try:
        from ddgs import DDGS
        with DDGS() as ddgs_client:
            return list(ddgs_client.text(q, max_results=15))
    except Exception:
        return []


def _extract_company_entry(company_data: dict) -> Optional[dict]:
    """
    Extract a normalised company entry dict from a raw MongoDB document.
    Returns None if the company name is invalid.
    """
    company_info = company_data.get("company", {})
    company_name = (
        company_info.get("company_name")
        or company_info.get("name")
        or company_data.get("name")
        or company_data.get("company_name")
    )
    if not company_name or company_name == "Unknown":
        return None

    industry = company_info.get("industry", "") or company_data.get("industry", "")
    if industry and str(industry).lower() == "nan":
        industry = ""

    news_data = company_data.get("news", {})
    if isinstance(news_data, dict):
        news_count = sum(len(v) for v in news_data.values() if isinstance(v, list))
    elif isinstance(news_data, list):
        news_count = len(news_data)
    else:
        news_count = 0
    social_data = company_data.get("social", [])
    social_count = len(social_data) if isinstance(social_data, list) else 0

    return {
        "name": company_name,
        "industry": industry or "Technology",
        "news_signals": news_count,
        "social_signals": social_count,
        "last_updated": str(company_data.get("lastUpdated", "")),
        "logo_url": company_info.get("logo_url", ""),
        "headquarters": company_info.get("headquarters", ""),
        "company_size": company_info.get("company_size", "") or company_info.get("size", ""),
        "website": company_info.get("website", ""),
        "linkedin_url": company_info.get("linkedin_url", ""),
        "about": company_info.get("about", ""),
        "founded": company_info.get("founded", ""),
        "type": company_info.get("type", ""),
        "specialties": company_info.get("specialties", []),
        "followers_count": company_info.get("followers_count", ""),
        "risk_score": company_data.get("risk_score"),
        "risk_level": company_data.get("risk_level", ""),
        "risk_confidence": company_data.get("risk_confidence"),
    }


def _has_usable_news(news) -> bool:
    if isinstance(news, list):
        return len(news) > 0
    if isinstance(news, dict):
        return any(len(v) > 0 for v in news.values() if isinstance(v, list))
    return False


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/api/company-analysis/suggestions")
async def company_suggestions(
    query: Annotated[str, Query(description="Company name to find LinkedIn suggestions for")],
    authorization: Annotated[Optional[str], Header()] = None,
):
    """Return up to 5 LinkedIn company matches via DuckDuckGo for a given query."""
    try:
        all_results = (
            _ddg_search(f'"{query}" site:linkedin.com/company')
            + _ddg_search(f'"{query}" site:linkedin.com')
            + _ddg_search(f"linkedin {query} company")
        )

        suggestions = []
        seen_slugs: set = set()
        for r in all_results:
            href = r.get("href", "")
            if "linkedin.com/company/" not in href:
                continue
            slug = href.split("linkedin.com/company/")[1].split("/")[0].split("?")[0]
            if not slug or len(slug) < 2 or slug in seen_slugs:
                continue
            seen_slugs.add(slug)
            display_name = (
                r.get("title", "").replace("| LinkedIn", "").replace("- LinkedIn", "").strip()
            ) or slug.replace("-", " ").title()
            suggestions.append({
                "name": display_name,
                "slug": slug,
                "linkedin_url": f"https://www.linkedin.com/company/{slug}/",
                "snippet": r.get("body", "")[:150],
            })
            if len(suggestions) >= 5:
                break

        encoded = urlquote(query)
        fallback_links = [
            {
                "name": f'Search "{query}" on LinkedIn',
                "linkedin_url": f"https://www.linkedin.com/search/results/companies/?keywords={encoded}",
                "snippet": "Open LinkedIn company search in a new tab",
                "is_link": True,
            },
            {
                "name": f'Find "{query}" on Google',
                "linkedin_url": f"https://www.google.com/search?q={encoded}+linkedin+company",
                "snippet": "Search Google for the company's LinkedIn page",
                "is_link": True,
            },
        ]
        return {"success": True, "suggestions": suggestions, "fallback_links": fallback_links}

    except Exception as e:
        logger.error(f"Error getting company suggestions: {e}")
        encoded = urlquote(query)
        return {
            "success": True,
            "suggestions": [],
            "fallback_links": [{
                "name": f'Search "{query}" on LinkedIn',
                "slug": "",
                "linkedin_url": f"https://www.linkedin.com/search/results/companies/?keywords={encoded}",
                "snippet": "Open LinkedIn company search in a new tab",
                "is_link": True,
            }],
        }


@router.get("/api/company-analysis/lookup")
async def credit_rating_lookup(
    company_name: Annotated[Optional[str], Query(alias="companyName", description="Company name to analyze")] = None,
    linkedin_url: Annotated[Optional[str], Query(alias="linkedinUrl", description="LinkedIn URL of the company")] = None,
    force_refresh: Annotated[bool, Query(alias="forceRefresh", description="Skip cache and scrape fresh data")] = False,
    authorization: Annotated[Optional[str], Header()] = None,
):
    """Analyze company credit rating and details."""
    if not company_name:
        return {"success": False, "message": "companyName query parameter is required"}

    user_id = None
    if authorization:
        try:
            user_info = auth_middleware.verify_token(authorization)
            if user_info:
                user_id = user_info.get('user_id')
                logger.info(f"Company analysis for user: {user_info.get('email', user_id)}")
        except Exception as e:
            logger.warning(f"Could not verify token: {e}")

    try:
        from scripts.Linkedin_creditrating import (
            get_company_credit_rating_with_mongodb,
            _is_valid_about,
            _SKIP_DOMAINS,
        )

        details = get_company_credit_rating_with_mongodb(
            company_name=company_name,
            linkedin_url=linkedin_url,
            user_id=user_id,
            force_refresh=force_refresh,
        )

        company_info = details.get("company", {}) if details else {}
        about_text = company_info.get("about", "").strip()
        website = company_info.get("website", "")

        has_about = _is_valid_about(about_text)
        has_website = bool(website) and not any(skip in website for skip in _SKIP_DOMAINS)
        has_industry = bool(company_info.get("industry"))
        has_headquarters = bool(company_info.get("headquarters"))
        has_news = _has_usable_news(details.get("news") if details else None)

        if not (has_about or has_website or has_industry or has_headquarters or has_news):
            logger.warning(f"No usable data found for '{company_name}'")
            return {
                "success": False,
                "message": f"Could not find company data for '{company_name}'. Try the LinkedIn URL directly or pick from suggestions below.",
            }

        return {"success": True, "data": details}

    except Exception as e:
        logger.error(f"Error in credit_rating_lookup: {e}")
        return {"success": False, "message": str(e)}


@router.get(
    "/api/company-report",
    responses={400: {"description": "Missing link parameter"}, 502: {"description": "Failed to fetch report"}},
)
async def company_report(
    link: Annotated[Optional[str], Query(description="LinkedIn/company link to fetch report for")] = None,
):
    """Get detailed company report from LinkedIn profile, with DuckDuckGo fallback."""
    if not link:
        raise HTTPException(status_code=400, detail="Query parameter 'link' is required")
    try:
        from scripts.Linkedin_creditrating import get_company_details
        result = get_company_details(link)
        company_info = result.get("company", {})
        if "size" in company_info and "company_size" not in company_info:
            company_info["company_size"] = company_info["size"]
        return {"success": True, **company_info, "company_news": result.get("news", {})}
    except Exception as exc:
        logger.error(f"company_report error: {exc}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch company report: {exc}")


@router.patch(
    "/companies/risk-score",
    responses={401: {"description": "Authentication required"}, 404: {"description": "Company not found"}},
)
async def save_risk_score(
    user_info: Annotated[dict, Depends(get_current_user)],
    body: dict = None,
):
    """Persist the AI risk analysis score on a company document."""
    if not body:
        raise HTTPException(status_code=400, detail="Missing body")
    company_name = body.get("company_name", "")
    risk_score = body.get("risk_score")
    risk_level = body.get("risk_level", "")
    confidence = body.get("confidence")
    risk_analysis = body.get("risk_analysis")
    if not company_name:
        raise HTTPException(status_code=400, detail="company_name required")
    try:
        user_id = user_info["user_id"]
        doc = mongodb_service.get_company_by_name(company_name, user_id=user_id)
        if not doc:
            # user_ids array may not be populated yet — try global lookup
            doc = mongodb_service.get_company_by_name(company_name)
        if not doc:
            raise HTTPException(status_code=404, detail="Company not found")
        update_fields = {
            "risk_score": risk_score,
            "risk_level": risk_level,
            "risk_confidence": confidence,
        }
        if risk_analysis:
            update_fields["risk_analysis"] = risk_analysis
        mongodb_service.companies_collection.update_one(
            {"_id": doc["_id"]},
            {"$set": update_fields},
        )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving risk score: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/companies/report",
    responses={401: {"description": "Authentication required"}, 404: {"description": "Company not found"}},
)
async def get_company_report_from_db(
    user_info: Annotated[dict, Depends(get_current_user)],
    name: Annotated[str, Query(description="Company name to look up")],
):
    """Get full saved company report from the database (no re-scraping)."""
    try:
        user_id = user_info['user_id']
        doc = mongodb_service.get_company_by_name(name, user_id=user_id)
        if not doc:
            # Try without user filter as fallback
            doc = mongodb_service.get_company_by_name(name)
        if not doc:
            raise HTTPException(status_code=404, detail=f"Company '{name}' not found")

        company_info = doc.get("company", {})
        # Normalize size field
        if "size" in company_info and "company_size" not in company_info:
            company_info["company_size"] = company_info["size"]

        # Normalise size field inside company_info
        if "size" in company_info and "company_size" not in company_info:
            company_info["company_size"] = company_info["size"]

        return {
            "success": True,
            "company": company_info,
            "news": doc.get("news", {}),
            "social": doc.get("social", []),
            "dataSources": doc.get("dataSources", []),
            "lastUpdated": str(doc.get("lastUpdated", "")),
            "risk_score": doc.get("risk_score"),
            "risk_level": doc.get("risk_level", ""),
            "risk_confidence": doc.get("risk_confidence"),
            "risk_analysis": doc.get("risk_analysis"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching company report from DB: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/companies",
    responses={401: {"description": "Authentication required"}, 500: {"description": "Internal server error"}},
)
async def get_companies(user_info: Annotated[dict, Depends(get_current_user)]):
    """
    Get companies accessible to the authenticated user.
    Supports both legacy (user_id string) and new (user_ids array) document structures.
    """
    try:
        user_id = user_info['user_id']
        logger.info(f"Fetching companies for user: {user_info.get('email', user_id)}")

        query_filter = {
            "$or": [
                {"user_ids": {"$in": [user_id]}},
                {"user_id": user_id},
            ]
        }
        companies = mongodb_service.get_companies_with_filter(query_filter, limit=500)
        logger.info(f"Found {len(companies)} companies for user: {user_id}")

        company_list = []
        for idx, company_data in enumerate(companies):
            try:
                entry = _extract_company_entry(company_data)
                if entry:
                    company_list.append(entry)
                    if idx < 3:
                        logger.info(f"Company {idx + 1}: {entry['name']} ({entry['industry']})")
                else:
                    logger.debug(f"Skipping company {idx + 1}: invalid name")
            except Exception as err:
                logger.error(f"Error processing company {idx + 1}: {err}")

        logger.info(f"Returning {len(company_list)} valid companies")
        return {"companies": company_list}

    except Exception as e:
        logger.error(f"Error getting companies: {e}")
        return {"error": f"Failed to get companies: {str(e)}"}
