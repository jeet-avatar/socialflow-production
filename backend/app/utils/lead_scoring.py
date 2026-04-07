"""
Lead Scoring Utility
Calculates lead scores based on company data and matching criteria.
Weights sum to exactly 100 (no base offset, no HQ premium).
"""

import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Company lead scoring helpers (max 100)
# ---------------------------------------------------------------------------

def _score_company_size(company_size: str) -> int:
    """Score based on company size string. Returns 0-15."""
    if not company_size:
        return 0
    size_lower = company_size.lower()
    if "10,000+" in size_lower or "10000+" in size_lower:
        return 15
    elif "1,000-5,000" in size_lower or "5,000-10,000" in size_lower:
        return 13
    elif "500-1,000" in size_lower or "1000-5000" in size_lower:
        return 11
    elif "200-500" in size_lower:
        return 9
    elif "50-200" in size_lower:
        return 7
    elif "11-50" in size_lower:
        return 5
    elif "2-10" in size_lower:
        return 3
    return 0


def _parse_followers(followers) -> int:
    """Parse followers value from string formats like '10,000' or '10K'. Returns int."""
    if isinstance(followers, str):
        try:
            followers = followers.replace(",", "").replace("K", "000").replace("M", "000000")
            return int(float(followers))
        except Exception:
            return 0
    return int(followers) if followers else 0


def _score_followers(followers: int) -> int:
    """Score based on LinkedIn follower count. Returns 0-10."""
    if followers > 100000:
        return 10
    elif followers > 50000:
        return 8
    elif followers > 10000:
        return 6
    elif followers > 5000:
        return 4
    elif followers > 1000:
        return 2
    elif followers > 500:
        return 1
    return 0


def _score_industry_match(company_industry: str, search_industry: str) -> int:
    """Score based on industry match between company and search term. Returns 0-20."""
    if not (search_industry and company_industry):
        return 0
    search_industry_lower = search_industry.lower()
    if search_industry_lower in company_industry or company_industry in search_industry_lower:
        return 20
    if any(word in company_industry for word in search_industry_lower.split()):
        return 10
    return 0


def _score_description(description: str) -> int:
    """Score based on company description length/quality. Returns 0-5."""
    if not description:
        return 0
    if len(description) > 200:
        return 5
    elif len(description) > 100:
        return 3
    elif len(description) > 50:
        return 2
    return 0


def _score_tech_stack(description: str, company_data: dict, search_tech_stack: list) -> int:
    """Score based on tech stack match against description and specialties. Returns 0-15."""
    if not search_tech_stack:
        return 0

    company_description_lower = description.lower() if description else ""
    company_specialties = company_data.get("specialties", [])
    if isinstance(company_specialties, str):
        company_specialties = [s.strip() for s in company_specialties.split(",")]

    company_specialties_lower = [s.lower() for s in company_specialties]

    matches = sum(
        1 for tech in search_tech_stack
        if tech.lower() in company_description_lower
        or any(tech.lower() in spec for spec in company_specialties_lower)
    )

    if matches == 0:
        return 0

    match_pct = (matches / len(search_tech_stack)) * 100
    if match_pct >= 75:
        return 15
    elif match_pct >= 50:
        return 10
    elif match_pct >= 25:
        return 6
    return 3


def _parse_employees_on_linkedin(value) -> int:
    """Parse employees_on_linkedin from string or numeric value. Returns int."""
    if isinstance(value, str):
        try:
            return int(value.replace(",", ""))
        except Exception:
            return 0
    return int(value) if value else 0


def _score_employees_on_linkedin(count: int) -> int:
    """Score based on number of employees listed on LinkedIn. Returns 0-5."""
    if count > 1000:
        return 5
    elif count > 500:
        return 4
    elif count > 100:
        return 3
    elif count > 50:
        return 2
    elif count > 10:
        return 1
    return 0


def _get(d: dict, *keys, default=None):
    """Return first non-falsy value found among the given keys."""
    for k in keys:
        v = d.get(k)
        if v is not None and v != "" and v is not False:
            return v
    return default


def calculate_lead_score(company_data: dict, search_industry: str = "", search_tech_stack: list = []) -> int:
    """
    Calculate lead score for a company lead.
    Score ranges 0-100.

    Handles both scraper field names (followers_count, about, verified_status)
    and normalised names (followers, description, verified) so mismatches never
    silently zero-out a signal.

    Base 30 — any company found on LinkedIn is a real B2B target.
    Remaining 70 from: company_size 15 + followers 10 + verified 5 +
    industry 15 + website 5 + description 5 + tech_stack 10 + employees 5 = 70
    """
    score = 30  # base: appeared in LinkedIn search

    score += _score_company_size(
        _get(company_data, "company_size", default="")
    )

    followers = _parse_followers(
        _get(company_data, "followers", "followers_count", default=0)
    )
    score += _score_followers(followers)

    if _get(company_data, "verified", "verified_status", default=False):
        score += 5

    industry = _get(company_data, "industry", default="")
    score += _score_industry_match(industry.lower() if industry else "", search_industry)

    if _get(company_data, "website", default=""):
        score += 5

    description = _get(company_data, "description", "about", default="")
    score += _score_description(description)

    score += _score_tech_stack(description, company_data, search_tech_stack)

    employees = _parse_employees_on_linkedin(
        _get(company_data, "employees_on_linkedin", default=0)
    )
    score += _score_employees_on_linkedin(employees)

    score = max(0, min(100, score))
    logger.debug(f"Company lead score: {score} for {_get(company_data, 'company_name', default='Unknown')}")
    return score


# ---------------------------------------------------------------------------
# Individual lead scoring
# ---------------------------------------------------------------------------

import re as _re

# Regex patterns — word-boundary aware so "saaspartners" ≠ "partner"
_EXEC_RE = _re.compile(
    r'\b(ceo|cto|cfo|coo|cmo|chief|founder|co[\-\s]?founder|cofounder'
    r'|president|owner|managing\s*director)\b',
    _re.IGNORECASE,
)
_VP_RE = _re.compile(
    r'\b(vp\b|vice\s*president|director|head\s+of|general\s*manager)\b',
    _re.IGNORECASE,
)
_MGR_RE = _re.compile(
    r'\b(manager|principal|senior|staff\s+engineer|lead\b)\b',
    _re.IGNORECASE,
)


def calculate_individual_score(profile: dict) -> int:
    """
    Calculate lead score for an individual LinkedIn profile.
    Score ranges 0-100 based on seniority and data completeness.

      base 20 + linkedin_url 15 + seniority 0-50 + company 10 + name 5 = 100

    Word-boundary regex is used for seniority matching to avoid false positives
    like 'partner' inside 'saaspartners'.
    """
    score = 20  # base — having a result at all

    title = (
        profile.get("title", "")
        or profile.get("jobTitle", "")
        or profile.get("Title", "")
    )
    company = profile.get("company", "") or profile.get("Company", "")
    name = (
        profile.get("name", "")
        or profile.get("Name", "")
        or profile.get("LeadName", "")
    )
    linkedin_url = (
        profile.get("linkedin_url", "")
        or profile.get("LinkedinLink", "")
        or profile.get("LinkedIn URL", "")
    )

    # LinkedIn URL present (15 pts)
    if linkedin_url:
        score += 15

    # Normalize DDG-concatenated titles before matching.
    # Order matters: split TitleCase boundary first, then uppercase-into-lowercase.
    # "VPMarketing" → "VP Marketing"  |  "VPofMarketing" → "VP of Marketing"
    # "ChiefExecutiveOfficer" → "Chief Executive Officer"
    title_norm = _re.sub(r'([A-Z]{2,})([A-Z][a-z])', r'\1 \2', title)  # "VPMarketing" → "VP Marketing"
    title_norm = _re.sub(r'([A-Z]{2,})([a-z])', r'\1 \2', title_norm)  # "VPof" → "VP of"
    title_norm = _re.sub(r'([a-z])([A-Z])', r'\1 \2', title_norm)      # "ofMarketing" → "of Marketing"

    # Seniority from title (0-50 pts) — word-boundary match on normalized title
    if _EXEC_RE.search(title_norm):
        score += 50
    elif _VP_RE.search(title_norm):
        score += 35
    elif _MGR_RE.search(title_norm):
        score += 20
    elif title:
        score += 5

    # Has company (10 pts)
    if company:
        score += 10

    # Has name (5 pts)
    if name:
        score += 5

    score = max(0, min(100, score))
    logger.debug(f"Individual lead score: {score} for {name or 'Unknown'}")
    return score
