"""
Leads API Routes with User Authentication and Data Isolation
"""

import re
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Annotated, Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Header, Query
from pydantic import BaseModel

from utils.leads_service import leads_service
from utils.middleware.auth_middleware import auth_middleware
from utils.lead_scoring import calculate_lead_score, calculate_individual_score

# ---------------------------------------------------------------------------
# Simple in-memory TTL cache for live-leads results (1 hour)
# ---------------------------------------------------------------------------
_LEADS_CACHE: dict = {}
_CACHE_TTL = 3600  # seconds


def _cache_key(*parts) -> str:
    return "|".join(str(p) for p in parts)


def _get_cached(key: str):
    entry = _LEADS_CACHE.get(key)
    if entry and (time.time() - entry["ts"] < _CACHE_TTL):
        return entry["data"]
    return None


def _set_cached(key: str, data) -> None:
    _LEADS_CACHE[key] = {"data": data, "ts": time.time()}

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/leads", tags=["leads"])

_LEAD_NOT_FOUND = "Lead not found"

_NON_COMPANY_WORDS = [
    'Former', 'Prev', 'Previous', 'Ex', 'Software', 'Engineer',
    'Manager', 'Developer', 'Architect', 'Lead', 'Senior', 'Junior',
]
_COMPANY_PATTERNS = [
    r'(?:@|at)\s+([^|,\n]+)',
    r'-\s+([A-Z][^|,\n]*)',
    r'\|\s+([A-Z][^|,\n]*)',
    r'(?:^|\s)([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*)\s*$',
]
_LINKEDIN_BRANDING = [
    "| LinkedIn", "- LinkedIn", " | LinkedIn", " - LinkedIn",
    "|LinkedIn", "-LinkedIn", " |LinkedIn", " -LinkedIn",
    "LinkedIn |", "LinkedIn -", "LinkedIn | ", "LinkedIn - ",
    " LinkedIn",
]


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class LeadCreateRequest(BaseModel):
    """Request model for creating a lead"""
    name: str
    email: str
    job_title: Optional[str] = ""
    company: Optional[str] = ""
    linkedin_url: Optional[str] = ""
    phone: Optional[str] = ""
    location: Optional[str] = ""
    industry: Optional[str] = ""
    lead_score: Optional[int] = 0
    status: Optional[str] = "new"
    source: Optional[str] = "manual"
    notes: Optional[str] = ""
    tags: Optional[List[str]] = []
    custom_fields: Optional[Dict[str, Any]] = {}


class LeadUpdateRequest(BaseModel):
    """Request model for updating a lead"""
    name: Optional[str] = None
    email: Optional[str] = None
    job_title: Optional[str] = None
    company: Optional[str] = None
    linkedin_url: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    industry: Optional[str] = None
    lead_score: Optional[int] = None
    status: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    custom_fields: Optional[Dict[str, Any]] = None


class BulkLeadsRequest(BaseModel):
    """Request model for bulk lead creation"""
    leads: List[LeadCreateRequest]


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------

def get_current_user(authorization: Annotated[Optional[str], Header()] = None) -> str:
    """Dependency to get current authenticated user"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_info = auth_middleware.verify_token(authorization)
    if not user_info:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user_info['user_id']


CurrentUser = Annotated[str, Depends(get_current_user)]


# ---------------------------------------------------------------------------
# Helpers for live-leads processing
# ---------------------------------------------------------------------------

def _clean_linkedin_text(text: str) -> str:
    """Remove LinkedIn branding from text."""
    if not text:
        return ""
    cleaned = text
    for pattern in _LINKEDIN_BRANDING:
        cleaned = cleaned.replace(pattern, "")
    cleaned = cleaned.strip()
    if cleaned.startswith("LinkedIn "):
        cleaned = cleaned[9:].strip()
    if cleaned.endswith(" LinkedIn"):
        cleaned = cleaned[:-9].strip()
    return "" if cleaned == "LinkedIn" else cleaned.strip()


def _extract_company_from_title(title: str) -> tuple[str, str]:
    """
    Try to extract a company name embedded in a job title string.
    Returns (company, cleaned_title).
    """
    for pattern in _COMPANY_PATTERNS:
        match = re.search(pattern, title)
        if not match:
            continue
        candidate = match.group(1).strip()
        is_non_company = any(w.lower() in candidate.lower() for w in _NON_COMPANY_WORDS)
        if candidate and len(candidate) > 2 and not is_non_company:
            cleaned = re.sub(pattern, '', title).strip()
            cleaned = re.sub(r'[|,\-]\s*$', '', cleaned).strip()
            cleaned = re.sub(r'^\s*[|,\-]\s*', '', cleaned).strip()
            return candidate, cleaned
    return "", title


def _build_individual_lead(idx: int, profile: dict, url_mapping: dict) -> dict:
    """Build a lead dict from an individual LinkedIn profile."""
    title = profile.get("title", profile.get("Title", ""))
    company = profile.get("company", profile.get("Company", ""))

    if not company and title:
        company, title = _extract_company_from_title(title)

    linkedin_url = (
        url_mapping.get(idx - 1, "")
        or profile.get("linkedin_url")
        or profile.get("LinkedIn URL")
        or profile.get("LinkedIn_URL")
        or profile.get("url")
        or profile.get("link")
        or ""
    )

    return {
        "id": linkedin_url or str(idx),
        "LeadName": profile.get("name", profile.get("Name", "")),
        "jobTitle": title,
        "LinkedinLink": linkedin_url,
        "company": company,
    }


def _build_company_lead(idx: int, site: dict, details: dict, lead_score: int) -> dict:
    """Build a lead dict from a company LinkedIn result."""
    resolved_url = details.get("linkedin_url") or site.get("link", "")
    return {
        "id": resolved_url or str(idx),
        "LeadName": _clean_linkedin_text(site.get("title", "")),
        "jobTitle": details.get("type", "") or details.get("industry", ""),
        "LinkedinLink": resolved_url,
        "profilepicImage": details.get("logo_url", ""),
        "company": _clean_linkedin_text(details.get("company_name", "")),
        "location": details.get("location", ""),
        "industry": details.get("industry", ""),
        "website": details.get("website", ""),
        "leadScore": lead_score,
    }


def _process_individual_leads(linkedin_leads: list, clean_profiles_fn) -> list:
    """Process individual LinkedIn profiles into enriched lead dicts with scores."""
    url_mapping = {idx: lead.get('link', '') for idx, lead in enumerate(linkedin_leads)}
    cleaned = clean_profiles_fn(linkedin_leads)
    leads = []
    for idx, profile in enumerate(cleaned, 1):
        lead = _build_individual_lead(idx, profile, url_mapping)
        lead["leadScore"] = calculate_individual_score(lead)
        leads.append(lead)
    return leads


def _process_one_company(args):
    """Worker for parallel company lead processing."""
    idx, site, get_details_fn, extract_info_fn, industry, tech_stack_list = args
    details = get_details_fn(site['link'])
    try:
        detailed_data = extract_info_fn(site['link'])
        lead_score = calculate_lead_score(detailed_data or {}, industry, tech_stack_list)
    except Exception as exc:
        logger.error(f"Score error for {site['link']}: {exc}")
        lead_score = 50
    return idx, site, details, lead_score


def _process_company_leads(
    linkedin_leads: list,
    get_details_fn,
    extract_info_fn,
    industry: str,
    tech_stack_list: list,
) -> list:
    """Process company LinkedIn results in parallel and return enriched lead dicts."""
    args_list = [
        (idx, site, get_details_fn, extract_info_fn, industry, tech_stack_list)
        for idx, site in enumerate(linkedin_leads, 1)
    ]
    results: list[tuple] = []
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(_process_one_company, args): args[0] for args in args_list}
        for future in as_completed(futures):
            try:
                results.append(future.result())
            except Exception as exc:
                logger.error(f"Company lead processing error: {exc}")
    # Sort by original idx so order is deterministic
    results.sort(key=lambda t: t[0])
    return [_build_company_lead(idx, site, details, score) for idx, site, details, score in results]


# ---------------------------------------------------------------------------
# CRUD routes
# ---------------------------------------------------------------------------

@router.post(
    "/",
    response_model=dict,
    responses={400: {"description": "Validation error"}, 500: {"description": "Internal server error"}},
)
async def create_lead(lead_data: LeadCreateRequest, user_id: CurrentUser):
    """Create a new lead for the authenticated user"""
    try:
        logger.info(f"Creating lead for user: {user_id}")
        lead = leads_service.create_lead(lead_data.dict(), user_id)
        return {"success": True, "message": "Lead created successfully", "lead": lead}
    except ValueError as e:
        logger.warning(f"Lead creation validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Lead creation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create lead: {str(e)}")


@router.get(
    "/",
    response_model=List[dict],
    responses={500: {"description": "Internal server error"}},
)
async def get_leads(
    user_id: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    skip: Annotated[int, Query(ge=0)] = 0,
    status: Annotated[Optional[str], Query()] = None,
    company: Annotated[Optional[str], Query()] = None,
):
    """Get leads for the authenticated user with optional filtering"""
    try:
        logger.info(f"Getting leads for user: {user_id}")
        leads = leads_service.get_user_leads(
            user_id=user_id, limit=limit, skip=skip, status=status, company=company
        )
        logger.info(f"Retrieved {len(leads)} leads for user: {user_id}")
        return leads
    except Exception as e:
        logger.error(f"Failed to get leads: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get leads: {str(e)}")


@router.get(
    "/{lead_id}",
    response_model=dict,
    responses={404: {"description": _LEAD_NOT_FOUND}, 500: {"description": "Internal server error"}},
)
async def get_lead(lead_id: str, user_id: CurrentUser):
    """Get a specific lead by ID for the authenticated user"""
    try:
        logger.info(f"Getting lead {lead_id} for user: {user_id}")
        lead = leads_service.get_lead_by_id(lead_id, user_id)
        if not lead:
            raise HTTPException(status_code=404, detail=_LEAD_NOT_FOUND)
        return {"success": True, "lead": lead}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get lead: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get lead: {str(e)}")


@router.put(
    "/{lead_id}",
    response_model=dict,
    responses={
        400: {"description": "No valid fields to update"},
        404: {"description": _LEAD_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
async def update_lead(lead_id: str, update_data: LeadUpdateRequest, user_id: CurrentUser):
    """Update a lead for the authenticated user"""
    try:
        logger.info(f"Updating lead {lead_id} for user: {user_id}")
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        if not update_dict:
            raise HTTPException(status_code=400, detail="No valid fields to update")
        success = leads_service.update_lead(lead_id, user_id, update_dict)
        if not success:
            raise HTTPException(status_code=404, detail=_LEAD_NOT_FOUND)
        return {"success": True, "message": "Lead updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update lead: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update lead: {str(e)}")


@router.delete(
    "/{lead_id}",
    response_model=dict,
    responses={404: {"description": _LEAD_NOT_FOUND}, 500: {"description": "Internal server error"}},
)
async def delete_lead(lead_id: str, user_id: CurrentUser):
    """Delete a lead for the authenticated user"""
    try:
        logger.info(f"Deleting lead {lead_id} for user: {user_id}")
        success = leads_service.delete_lead(lead_id, user_id)
        if not success:
            raise HTTPException(status_code=404, detail=_LEAD_NOT_FOUND)
        return {"success": True, "message": "Lead deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete lead: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete lead: {str(e)}")


@router.post(
    "/bulk",
    response_model=dict,
    responses={500: {"description": "Internal server error"}},
)
async def bulk_create_leads(bulk_data: BulkLeadsRequest, user_id: CurrentUser):
    """Create multiple leads in bulk for the authenticated user"""
    try:
        logger.info(f"Bulk creating {len(bulk_data.leads)} leads for user: {user_id}")
        leads_data = [lead.dict() for lead in bulk_data.leads]
        result = leads_service.bulk_create_leads(leads_data, user_id)
        return {
            "success": True,
            "message": f"Bulk operation completed: {result['created_count']} created, {result['error_count']} errors",
            "result": result,
        }
    except Exception as e:
        logger.error(f"Bulk lead creation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Bulk lead creation failed: {str(e)}")


@router.get(
    "/stats/overview",
    response_model=dict,
    responses={500: {"description": "Internal server error"}},
)
async def get_leads_stats(user_id: CurrentUser):
    """Get lead statistics for the authenticated user"""
    try:
        logger.info(f"Getting lead stats for user: {user_id}")
        stats = leads_service.get_leads_stats(user_id)
        return {"success": True, "stats": stats}
    except Exception as e:
        logger.error(f"Failed to get lead stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get lead stats: {str(e)}")


@router.get(
    "/search/{search_query}",
    response_model=List[dict],
    responses={500: {"description": "Internal server error"}},
)
async def search_leads(
    search_query: str,
    user_id: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
):
    """Search leads for the authenticated user"""
    try:
        logger.info(f"Searching leads for user: {user_id} with query: {search_query}")
        leads = leads_service.search_leads(user_id, search_query, limit)
        logger.info(f"Found {len(leads)} leads matching search query")
        return leads
    except Exception as e:
        logger.error(f"Lead search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Lead search failed: {str(e)}")


@router.post(
    "/import/linkedin",
    response_model=dict,
    responses={400: {"description": "No valid lead data"}, 500: {"description": "Internal server error"}},
)
async def import_leads_from_linkedin(linkedin_data: dict, user_id: CurrentUser):
    """Import leads from LinkedIn search results"""
    try:
        logger.info(f"Importing LinkedIn leads for user: {user_id}")
        leads_data = [
            {
                "name": p.get('name', ''),
                "job_title": p.get('title', ''),
                "company": p.get('company', ''),
                "linkedin_url": p.get('url', ''),
                "location": p.get('location', ''),
                "source": "linkedin",
                "lead_score": p.get('lead_score', 0),
            }
            for p in linkedin_data.get('profiles', [])
        ]
        if not leads_data:
            raise HTTPException(status_code=400, detail="No valid lead data found in LinkedIn import")
        result = leads_service.bulk_create_leads(leads_data, user_id)
        return {
            "success": True,
            "message": f"LinkedIn import completed: {result['created_count']} leads imported",
            "result": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LinkedIn import failed: {e}")
        raise HTTPException(status_code=500, detail=f"LinkedIn import failed: {str(e)}")


# ---------------------------------------------------------------------------
# Live leads router (separate prefix)
# ---------------------------------------------------------------------------

live_leads_router = APIRouter(tags=["leads"])


@live_leads_router.get("/api/live-leads")
async def live_leads(
    user_id: CurrentUser,
    query: str,
    mode: Optional[str] = None,
    location: Optional[str] = None,
    industry: Optional[str] = None,
    tech_stack: Annotated[Optional[str], Query(alias="techStack")] = None,
    limit: Annotated[int, Query(ge=1, le=20)] = 10,
):
    """
    Authenticated live LinkedIn lead search with caching and Hot/Warm/Cold tiers.
    Supports company and individual profile modes.
    """
    from scripts.Leads_scraper import search_linkedin_duckduckgo, get_lead_company_details, clean_linkedin_profiles
    from scripts.linkedin_scrapper_company import extract_company_info

    tech_stack_norm = tech_stack or ""
    # Cache key excludes thresholds — only raw leads are cached so threshold
    # changes take effect immediately without a restart.
    cache_key = _cache_key(query, mode, location, industry, tech_stack_norm, limit)
    cached = _get_cached(cache_key)

    if cached is not None:
        logger.info(f"Live-leads cache hit for key: {cache_key[:60]}")
        all_leads = cached
    else:
        if mode == "individual":
            profile_type = "in"
        else:
            profile_type = "company"

        linkedin_leads = search_linkedin_duckduckgo(
            query, location=location or "", num_results=limit, profile_type=profile_type
        )

        tech_stack_list = [t.strip() for t in tech_stack_norm.split(",") if t.strip()] if tech_stack_norm else []

        if mode == "individual":
            all_leads = _process_individual_leads(linkedin_leads, clean_linkedin_profiles)
        else:
            all_leads = _process_company_leads(
                linkedin_leads, get_lead_company_details, extract_company_info,
                industry or "", tech_stack_list,
            )

        _set_cached(cache_key, all_leads)

    # Categorize after cache retrieval so threshold changes apply immediately.
    # Thresholds calibrated to realistic score ranges:
    #   No filters  → 30–55  (base + size + website + description)
    #   + industry  → up to 70
    #   + tech stack → up to 80+
    # Hot ≥ 65 (filter match), Warm ≥ 35 (found + has data), Cold < 35 (bare stub)
    hot   = [l for l in all_leads if l.get("leadScore", 0) >= 65]
    warm  = [l for l in all_leads if 35 <= l.get("leadScore", 0) < 65]
    cold  = [l for l in all_leads if l.get("leadScore", 0) < 35]

    categories = []
    if hot:
        categories.append({"title": "Hot Leads",  "count": len(hot),  "leads": hot})
    if warm:
        categories.append({"title": "Warm Leads", "count": len(warm), "leads": warm})
    if cold:
        categories.append({"title": "Cold Leads", "count": len(cold), "leads": cold})

    if not categories:
        label = "Individual Leads" if mode == "individual" else ("Company Leads" if mode == "company" else "Leads")
        categories = [{"title": label, "count": len(all_leads), "leads": all_leads}]

    return {"categories": categories, "total": len(all_leads)}
