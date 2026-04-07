from ddgs import DDGS
from scripts.linkedin_scrapper_company import extract_company_info
from urllib.parse import urlparse
from utils.utils import client  # type: ignore
import json
from typing import Any

_COMPANY_PROFILE_TYPE = "company"
_COMPANY_PATH = "/company"
_IN_PATH = "/in"

# Helper function to extract company details from a LinkedIn company page
def get_lead_company_details(url: str) -> dict[str, Any]:
    try:
        data = extract_company_info(url) or {}
    except Exception as exc:
        print(f"Error fetching company details from LinkedIn for {url}: {exc}")
        data = {}

    has_real_data = bool(
        data.get("company_name") and (
            data.get("industry") or data.get("website") or data.get("headquarters")
        )
    )

    if not has_real_data:
        # LinkedIn is login-gated — fall back to DDG profile builder
        from scripts.Linkedin_creditrating import build_company_profile_from_ddg
        slug_name = ""
        if "linkedin.com/company/" in url:
            slug = url.split("linkedin.com/company/")[1].split("/")[0]
            slug_name = slug.replace("-", " ").title()
        if slug_name:
            ddg = build_company_profile_from_ddg(slug_name, linkedin_url=url)
            # Only use DDG result if it found a real LinkedIn URL (not the same guessed one)
            resolved_url = ddg.get("linkedin_url") or url
            return {
                "company_name": ddg.get("company_name", slug_name),
                "website": ddg.get("website", ""),
                "industry": ddg.get("industry", ""),
                "type": "",
                "logo_url": "",
                "location": ddg.get("headquarters", ""),
                "linkedin_url": resolved_url,
                "data_source": "duckduckgo",
            }

    return {
        "company_name": data.get("company_name", ""),
        "website": data.get("website", ""),
        "industry": data.get("industry", ""),
        "type": data.get("type", ""),
        "logo_url": data.get("logo_url", ""),
        "location": data.get("headquarters", ""),
        "linkedin_url": url,
        "data_source": "linkedin_scrape",
    }

def search_duckduckgo(query: str, num_results: int = 5) -> list[dict[str, str]]:
    """Search DuckDuckGo for results and return a list of dicts."""
    results = []
    with DDGS() as ddgs:
        for r in ddgs.text(query, max_results=num_results):
            results.append({
                "title": r.get("title", ""),
                "link": r.get("href", ""),
                "snippet": r.get("body", "")
            })
    return results

def _normalize_linkedin_url(url: str, profile_type: str) -> str:
    """Normalize LinkedIn company URLs and strip regional subdomains."""
    parsed = urlparse(url)
    # Replace regional subdomains with www
    domain_parts = parsed.netloc.split('.')
    if len(domain_parts) == 3 and domain_parts[1] == "linkedin" and domain_parts[2] == "com":
        netloc = "www.linkedin.com"
    else:
        netloc = parsed.netloc
    # Ensure path starts with /company or /in depending on profile_type
    path = parsed.path
    if profile_type == _COMPANY_PROFILE_TYPE:
        if not path.startswith(_COMPANY_PATH) and path.startswith(_IN_PATH):
            path = path.replace(_IN_PATH, _COMPANY_PATH, 1)
    elif not path.startswith(_IN_PATH) and path.startswith(_COMPANY_PATH):
        path = path.replace(_COMPANY_PATH, _IN_PATH, 1)
    return f"https://{netloc}{path}"


def _should_skip_result(profile_type: str, link: str) -> bool:
    """Return True if the DuckDuckGo result should be excluded."""
    if profile_type == _COMPANY_PROFILE_TYPE:
        return f"linkedin.com{_COMPANY_PATH}" not in link
    return f"linkedin.com{_IN_PATH}" not in link


def _clean_linkedin_title(title: str) -> str:
    """Strip LinkedIn branding from a search-result title."""
    for pattern in [
        "| LinkedIn", "- LinkedIn", " | LinkedIn", " - LinkedIn",
        "|LinkedIn", "-LinkedIn", " |LinkedIn", " -LinkedIn",
        "LinkedIn |", "LinkedIn -", "LinkedIn | ", "LinkedIn - ",
        " LinkedIn",
    ]:
        if pattern in title:
            title = title.replace(pattern, "").strip()
    if title.endswith("LinkedIn"):
        title = title[:-8].strip()
    return title


def search_linkedin_duckduckgo(company: str, location: str = "", num_results: int = 5, profile_type: str = _COMPANY_PROFILE_TYPE) -> list[dict[str, str]]:
    """Search LinkedIn company or individual profiles using DuckDuckGo."""
    site = f"site:linkedin.com{_COMPANY_PATH}" if profile_type == _COMPANY_PROFILE_TYPE else f"site:linkedin.com{_IN_PATH}"
    query = f"{site} {company} {location}".strip()
    results = search_duckduckgo(query, num_results=num_results * 2)

    linkedin_results = []
    seen = set()
    for res in results:
        link = res.get("link", "")
        if _should_skip_result(profile_type, link):
            continue
        norm_url = _normalize_linkedin_url(link, profile_type)
        if norm_url in seen:
            continue
        seen.add(norm_url)
        linkedin_results.append({
            "title": _clean_linkedin_title(res.get("title", "")),
            "link": norm_url,
        })
        if len(linkedin_results) >= num_results:
            break
    return linkedin_results
def _regex_preparse(raw_profiles: list[dict]) -> list[dict]:
    """
    Pre-parse raw DuckDuckGo LinkedIn results with regex before sending to Claude.
    Typical title format: "First Last - Job Title | LinkedIn"
    """
    import re
    parsed = []
    _BRANDING = ["| LinkedIn", "- LinkedIn", " | LinkedIn", " - LinkedIn",
                 "|LinkedIn", "-LinkedIn", " LinkedIn"]
    for p in raw_profiles:
        title_raw = p.get("title", "")
        link = p.get("link", "")
        snippet = p.get("snippet", "")

        # Strip LinkedIn branding first
        cleaned_title = title_raw
        for pat in _BRANDING:
            cleaned_title = cleaned_title.replace(pat, "").strip()

        # "First Last - Job Title at Company" or "First Last | Job Title"
        name = ""
        title = ""
        m = re.match(r"^([^|–\-]+?)\s*(?:[-–|]\s*(.+))?$", cleaned_title)
        if m:
            name = m.group(1).strip()
            title = (m.group(2) or "").strip()

        parsed.append({
            "name": name,
            "title": title,
            "link": link,
            "snippet": snippet,
            "raw_title": title_raw,
        })
    return parsed


def clean_linkedin_profiles(raw_profiles: list[dict]) -> list[dict]:
    """
    Clean raw LinkedIn individual profiles using Claude claude-opus-4-6.
    Regex pre-parsing is applied first to reduce Claude's workload.
    Falls back to regex-only result when ANTHROPIC_API_KEY is absent.
    """
    import os

    pre_parsed = _regex_preparse(raw_profiles)

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        # Fallback: use regex result without AI enrichment
        return [
            {
                "name": p["name"],
                "title": p["title"],
                "company": "",
                "linkedin_url": p["link"],
            }
            for p in pre_parsed
        ]

    import anthropic

    prompt = (
        "Given the following list of LinkedIn profile data, "
        "extract and clean these fields for each profile: name, title, company, linkedin_url.\n"
        "Rules:\n"
        "- Return ONLY a JSON array of objects with keys: 'name', 'title', 'company', 'linkedin_url'.\n"
        "- Use empty string for missing fields.\n"
        "- linkedin_url must be the full LinkedIn /in/ URL (use the 'link' field).\n"
        "- Extract company from title when present (e.g. 'Engineer at Acme' → company='Acme').\n"
        "- No markdown, no explanation — raw JSON only.\n\n"
        f"Data:\n{pre_parsed}"
    )

    try:
        claude = anthropic.Anthropic(api_key=api_key)
        message = claude.messages.create(
            model="claude-opus-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        content = message.content[0].text.strip()
        if content.startswith("```"):
            content = content.lstrip("`").rstrip("`").strip()
            if content.lower().startswith("json"):
                content = content[4:].strip()
        return json.loads(content)
    except Exception as exc:
        print(f"Claude profile cleaning failed: {exc} — using regex fallback")
        return [
            {
                "name": p["name"],
                "title": p["title"],
                "company": "",
                "linkedin_url": p["link"],
            }
            for p in pre_parsed
        ]


if __name__ == "__main__":
    company_name = "Sandsoft International Tech Ltd."
    linkedin_company_leads = search_linkedin_duckduckgo(company_name, num_results=10, profile_type=_COMPANY_PROFILE_TYPE)
    linkedin_individual_leads = search_linkedin_duckduckgo(company_name, num_results=10, profile_type="in")

    print("="*50)
    print("Top 10 LinkedIn Company Profiles")
    print("="*50)
    for idx, site in enumerate(linkedin_company_leads, start=1):
        print(f"{idx}. {site['title']}")
        print(f"   Full Link   : {site['link']}")
        details = get_lead_company_details(site['link'])
        print(f"   company_name: {details.get('company_name', '')}")
        print(f"   website     : {details.get('website', '')}")
        print(f"   industry    : {details.get('industry', '')}")
        print(f"   type        : {details.get('type', '')}")
        print(f"   logo_url    : {details.get('logo_url', '')}")
        print(f"   location    : {details.get('location', '')}")
        print()

    cleaned_profiles = clean_linkedin_profiles(linkedin_individual_leads)
    print("="*50)
    print("Cleaned LinkedIn Individual Profiles")
    print("="*50)

    def _print_profiles(profiles):
        if isinstance(profiles, list) and all(isinstance(p, dict) for p in profiles):
            for idx, profile in enumerate(profiles, start=1):
                print(f"Profile {idx}:")
                print(f"  Name         : {profile.get('name', '')}")
                print(f"  Title        : {profile.get('title', '')}")
                print(f"  Company      : {profile.get('company', '')}")
                print(f"  LinkedIn URL : {profile.get('LinkedIn URL', profile.get('LinkedIn_URL', profile.get('linkedin_url', profile.get('url', ''))))}")
                print()
        else:
            # Fallback to JSON dump for unexpected structure
            print(json.dumps(profiles, indent=2))
    try:
        _print_profiles(cleaned_profiles)
    except Exception:
        print(json.dumps(cleaned_profiles, indent=2))
