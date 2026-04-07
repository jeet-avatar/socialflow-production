import pycountry
from scripts.linkedin_scrapper_company import extract_company_info, get_top_articles, get_google_news
import requests
import re
import json
from bs4 import BeautifulSoup
from ddgs import DDGS
import warnings
from utils.mongodb_service import mongodb_service
from datetime import datetime, timezone
import logging
from urllib.parse import quote

_HTTPS = "https://"
_HTTP = "http://"
_SOCIAL_MEDIA = "Social Media"
_FACEBOOK_DOMAIN = "facebook.com"
_X_DOMAIN = "x.com"
_INSTAGRAM_DOMAIN = "instagram.com"
_LI_COMPANY_PATH = "linkedin.com/company/"
_NEWS_TITLE = "News Title"

# Helper to build data sources table for the frontend
def _strip_url(url: str) -> str:
    """Strip query params and fragments from a URL, keep scheme + domain + path root."""
    try:
        from urllib.parse import urlparse
        p = urlparse(url)
        return f"{p.scheme}://{p.netloc}/"
    except Exception:
        return url


def _find_instagram_profile(company_name: str) -> str:
    """Search DDG for Instagram profile page (not posts)."""
    try:
        results = duckduckgo_search(f'site:{_INSTAGRAM_DOMAIN} "{company_name}"', 5)
        for r in results:
            href = r.get("href", "")
            if f"{_INSTAGRAM_DOMAIN}/" in href and "/p/" not in href and href.count("/") <= 4:
                return href
    except Exception:
        pass
    slug = company_name.lower().replace(" ", "").replace(".", "")
    return f"https://www.{_INSTAGRAM_DOMAIN}/{slug}/"


def _strip_scheme(url: str) -> str:
    return url.replace(_HTTPS, "").replace(_HTTP, "")

def build_data_sources(company: dict, handles: dict = None) -> list[dict]:
    company_name = company.get("company_name", "")
    website = _strip_url(company.get("website", "")) if company.get("website") else ""
    linkedin_url = company.get("linkedin_url") or ""
    google_link = company.get("google_url", "")
    handles = handles or {}

    encoded_query = quote(company_name)

    ig_handle = handles.get("Instagram", "")
    fb_handle = handles.get("Facebook", "")
    tw_handle = handles.get("Twitter", "")

    sources = [
        {"type": _SOCIAL_MEDIA, "name": "Twitter / X", "endpoint": f"https://{_X_DOMAIN}/{tw_handle}" if tw_handle else ""},
        {"type": "Professional", "name": "LinkedIn", "endpoint": linkedin_url or f"https://www.{_LI_COMPANY_PATH}{company_name.lower().replace(' ', '-')}/"},
        {"type": _SOCIAL_MEDIA, "name": "Instagram", "endpoint": f"https://www.{_INSTAGRAM_DOMAIN}/{ig_handle}" if ig_handle else ""},
        {"type": _SOCIAL_MEDIA, "name": "Facebook", "endpoint": f"https://www.{_FACEBOOK_DOMAIN}/{fb_handle}" if fb_handle else ""},
        {"type": "Search Engine", "name": "Google", "endpoint": google_link or f"https://www.google.com/search?q={encoded_query}"},
        {"type": "News Aggregator", "name": "Google News", "endpoint": f"https://news.google.com/search?q={encoded_query}"},
        {"type": "Company Website", "name": "Corporate Site", "endpoint": website},
    ]
    return [s for s in sources if s.get("endpoint")]

warnings.filterwarnings("ignore", category=UserWarning, module="pycountry")
logger = logging.getLogger(__name__)

def duckduckgo_search(query, num=1, timelimit: str = None):
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=num, timelimit=timelimit))
        return results
    except Exception as e:
        print("[ERROR] duckduckgo_search:", e)
        return []

# Domains that are never a company's own website
_SKIP_DOMAINS = {
    "linkedin.com", "google.com", _FACEBOOK_DOMAIN, "twitter.com", _X_DOMAIN,
    _INSTAGRAM_DOMAIN, "wikipedia.org", "youtube.com", "bing.com", "yahoo.com",
    "reddit.com", "quora.com", "zhihu.com", "glassdoor.com", "indeed.com",
    "crunchbase.com", "bloomberg.com", "reuters.com", "forbes.com", "fortune.com",
    "techcrunch.com", "businesswire.com", "prnewswire.com", "sec.gov",
    "zoominfo.com", "dnb.com", "craft.co", "owler.com", "pitchbook.com",
    "ambitionbox.com", "comparably.com", "trustpilot.com", "g2.com",
}


def _is_likely_company_website(domain: str, company_name: str) -> bool:
    """Return True if the domain looks like it could be the company's own site."""
    if any(skip in domain for skip in _SKIP_DOMAINS):
        return False
    # Domain should share at least one significant word with the company name
    company_words = [w.lower() for w in company_name.split() if len(w) > 2]
    domain_clean = domain.lower().replace("-", " ").replace(".", " ")
    return any(w in domain_clean for w in company_words)


def _is_valid_about(text: str) -> bool:
    """Return False if the text is garbage (non-Latin, error messages, or too short)."""
    if not text or len(text) < 30:
        return False
    # Reject if more than 10% non-ASCII characters (e.g., Chinese, Japanese text)
    non_ascii = sum(1 for c in text if ord(c) > 127)
    if non_ascii / len(text) > 0.1:
        return False
    # Reject common error message patterns
    error_keywords = ["504 gateway", "503 service", "502 bad gateway", "404 not found", "403 forbidden", "gateway timeout", "service unavailable"]
    lower = text.lower()
    if any(kw in lower for kw in error_keywords):
        return False
    return True


def _scrape_website_profile(url: str) -> dict:
    """Scrape a company's own website for name, description, HQ via meta tags / JSON-LD."""
    from scripts.linkedin_scrapper_company import _BROWSER_HEADERS, _parse_json_ld
    try:
        resp = requests.get(url, headers=_BROWSER_HEADERS, timeout=10, allow_redirects=True)
        if resp.status_code != 200:
            return {}
        soup = BeautifulSoup(resp.text, "html.parser")
        info = _parse_json_ld(soup)

        if not info.get("about"):
            for attr in [{"name": "description"}, {"property": "og:description"}]:
                tag = soup.find("meta", attrs=attr)
                val = tag.get("content", "").strip() if tag else ""
                if len(val) > 30:
                    info["about"] = val[:600]
                    break

        if not info.get("company_name"):
            og_name = soup.find("meta", attrs={"property": "og:site_name"})
            if og_name and og_name.get("content"):
                info["company_name"] = og_name["content"].strip()

        return info
    except Exception:
        return {}


def _li_slug_to_url(href: str) -> str:
    """Extract a normalized linkedin.com/company/ URL from an href, or return ''."""
    if _LI_COMPANY_PATH not in href:
        return ""
    parts = href.split(_LI_COMPANY_PATH)
    if len(parts) < 2:
        return ""
    slug = parts[1].split("/")[0].split("?")[0]
    return f"https://www.{_LI_COMPANY_PATH}{slug}/" if slug and len(slug) > 1 else ""


def _clean_li_snippet(snippet: str) -> str:
    """Strip the leading follower-count prefix from a LinkedIn DDG snippet."""
    return re.sub(r"^\d[\d,\.]*\+?\s*followers?\s+on\s+LinkedIn[.\s]*", "", snippet, flags=re.IGNORECASE).strip()


def _apply_linkedin_snippet(profile: dict, r: dict):
    """Apply company name, linkedin_url, and about from one DDG LinkedIn result."""
    href = r.get("href", "")
    snippet = r.get("body", "").strip()
    title = r.get("title", "")

    # Real company name from LinkedIn title
    if title:
        real_name = re.sub(r'\s*[\|\-]\s*LinkedIn.*$', '', title, flags=re.IGNORECASE).strip()
        if real_name and real_name.lower() not in ("linkedin", ""):
            profile["company_name"] = real_name

    # Extract LinkedIn slug / URL
    if not profile.get("linkedin_url"):
        li_url = _li_slug_to_url(href)
        if li_url:
            profile["linkedin_url"] = li_url

    # LinkedIn snippet often: "X followers on LinkedIn. <description>"
    if snippet and not profile.get("about"):
        clean = _clean_li_snippet(snippet)
        if _is_valid_about(clean):
            profile["about"] = clean[:600]


def _find_company_website(site_results: list, company_name: str) -> tuple:
    """Return (href, domain) for the best matching company website result."""
    from urllib.parse import urlparse
    for r in site_results:
        href = r.get("href", "")
        if not href:
            continue
        try:
            domain = urlparse(href).netloc.replace("www.", "")
        except Exception:
            continue
        if not _is_likely_company_website(domain, company_name):
            continue
        # Snippet must contain company name (avoid false positives like zhihu.com)
        combined = (r.get("body", "") + " " + r.get("title", "")).lower()
        name_words = [w.lower() for w in company_name.split() if len(w) > 3]
        if not any(w in combined for w in name_words):
            continue
        return href, domain
    return "", ""


_INDUSTRY_RE_1 = re.compile(
    r'\b(logistics|freight|shipping|warehousing|supply chain|technology|software|finance|banking|healthcare|manufacturing)\b',
    re.IGNORECASE
)
_INDUSTRY_RE_2 = re.compile(
    r'\b(retail|consulting|real estate|energy|media|education|hospitality|construction|transportation|automotive|telecom)\b',
    re.IGNORECASE
)


def _merge_site_data_into_profile(profile: dict, website_url: str):
    """Scrape the company website and merge any richer fields into profile."""
    site_data = _scrape_website_profile(website_url)
    site_about = site_data.get("about", "")
    if _is_valid_about(site_about) and len(site_about) > len(profile.get("about", "")):
        profile["about"] = site_about
    for field in ("company_name", "industry", "headquarters", "founded"):
        if not profile.get(field) and site_data.get(field):
            profile[field] = site_data[field]


def _fill_missing_from_snippets(profile: dict, all_snippets: str):
    """Infer industry and headquarters from raw DDG snippet text when still missing."""
    if not profile.get("industry"):
        m = _INDUSTRY_RE_1.search(all_snippets) or _INDUSTRY_RE_2.search(all_snippets)
        if m:
            profile["industry"] = m.group(1).title()

    if not profile.get("headquarters"):
        m = re.search(
            r'(?:based|headquartered|located|offices?)\s+in\s+([A-Z][A-Za-z\s,]{3,40}?)(?:\.|,\s+[a-z]|\s+and\b|\s+with\b)',
            all_snippets
        )
        if m:
            profile["headquarters"] = m.group(1).strip()


def build_company_profile_from_ddg(company_name: str, linkedin_url: str = "") -> dict:
    """
    Build a company profile from web search when LinkedIn direct scraping is blocked.
    Order: LinkedIn DDG snippet → company website scrape → broader web snippets.
    """
    profile: dict = {"company_name": company_name, "linkedin_url": linkedin_url, "data_source": "duckduckgo"}

    # 1. LinkedIn DDG snippet — most reliable source for company description & real name
    li_results = duckduckgo_search(f'site:{_LI_COMPANY_PATH} "{company_name}"', num=5)
    if not li_results:
        li_results = duckduckgo_search(f'site:{_LI_COMPANY_PATH} {company_name}', num=5)

    for r in li_results:
        _apply_linkedin_snippet(profile, r)
        if profile.get("company_name") and profile.get("about"):
            break

    # 2. Find and scrape company's own website
    site_results = duckduckgo_search(f'"{company_name}" official website', num=6)
    website_url, domain = _find_company_website(site_results, company_name)
    if website_url:
        profile["website"] = domain
        _merge_site_data_into_profile(profile, website_url)

    # 3. Extract industry / HQ from all snippets collected so far
    all_snippets = " ".join(r.get("body", "") for r in (li_results + site_results))
    _fill_missing_from_snippets(profile, all_snippets)

    logger.info(f"DDG profile for '{company_name}': {[k for k, v in profile.items() if v]}")
    return profile


def _extract_linkedin_company_url(results: list) -> str | None:
    """Return the first linkedin.com/company/ URL found, normalized to www."""
    for r in results:
        href = r.get("href", "")
        if _LI_COMPANY_PATH not in href:
            continue
        slug = href.split(_LI_COMPANY_PATH)[1].split("/")[0].split("?")[0]
        if slug and len(slug) > 1:
            return f"https://www.{_LI_COMPANY_PATH}{slug}/"
    return None


def find_linkedin_url_via_ddg(company_name: str) -> str | None:
    """Search DDG with exact-match query, prefer www.linkedin.com/company/ results."""
    queries = [
        f'"{company_name}" site:{_LI_COMPANY_PATH}',
        f'"{company_name}" site:linkedin.com',
        f"linkedin {company_name} company",
    ]
    for query in queries:
        try:
            logger.info(f"DDG search: {query}")
            with DDGS() as ddgs_client:
                results = list(ddgs_client.text(query, max_results=10))
            url = _extract_linkedin_company_url(results)
            if url:
                logger.info(f"DDG found: {url}")
                return url
        except Exception as e:
            logger.warning(f"DDG lookup failed for query '{query}': {e}")
    return None

def _make_social_post(platform, item, handle=""):
    link = item.get("href", "")
    author = handle or (link.split("/")[3] if len(link.split("/")) > 3 else "")
    return {"platform": platform, "content": item.get("body", "") or item.get("title", ""), "author": author, "url": link, "observedAt": ""}

_HANDLE_SKIP = {"p", "status", "posts", "videos", "permalink", "search", "explore", "in", "reel", "reels", "watch", "hashtag"}

def _is_root_domain(href: str, platform_domain: str) -> bool:
    """True only if href is on the root domain (not subdomains like developers.facebook.com)."""
    host = href.split("?")[0].replace(_HTTPS, "").replace(_HTTP, "").split("/")[0]
    return host in (platform_domain, f"www.{platform_domain}", f"m.{platform_domain}")

def _href_to_handle(href: str, platform_domain: str) -> str:
    """Extract handle from a root-domain URL, or return empty string."""
    if not _is_root_domain(href, platform_domain):
        return ""
    parts = href.split("?")[0].rstrip("/").replace(_HTTPS, "").replace(_HTTP, "").split("/")
    handle = parts[1] if len(parts) >= 2 else ""
    return handle if handle and handle not in _HANDLE_SKIP else ""

def _rank_handle(handle_key: str, company_key: str) -> int:
    """Lower = better match. 0=exact, 1=prefix, 2=contains, 3=no match."""
    if handle_key == company_key:
        return 0
    if handle_key.startswith(company_key):
        return 1
    if company_key in handle_key or handle_key in company_key:
        return 2
    return 3

def _scan_results_for_handle(results: list, platform_domain: str, company_key: str) -> tuple:
    """Return (best_match_handle, first_handle). Best = lowest rank score."""
    best_handle, best_score, first = "", 4, ""
    for r in results:
        handle = _href_to_handle(r.get("href", ""), platform_domain)
        if not handle:
            continue
        score = _rank_handle(re.sub(r'[^a-z0-9]', '', handle.lower()), company_key)
        if score < best_score:
            best_handle, best_score = handle, score
        if not first:
            first = handle
    if best_score < 3:
        return best_handle, ""
    return "", first

def _find_social_handle(company: str, platform_domain: str) -> str:
    """Search DDG for the company profile on a platform and return the handle."""
    company_key = re.sub(r'[^a-z0-9]', '', company.lower())
    matched, fallback = _scan_results_for_handle(duckduckgo_search(f'{company} site:{platform_domain}', 10), platform_domain, company_key)
    handle = matched or fallback
    if handle:
        logger.info(f"[Social] {platform_domain} handle → {handle}")
    return handle

def _find_all_social_handles(company: str) -> dict:
    """Phase 1: Find Twitter/X, Instagram, and Facebook handles for the company (concurrent)."""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    platforms = [("Twitter", _X_DOMAIN), ("Instagram", _INSTAGRAM_DOMAIN), ("Facebook", _FACEBOOK_DOMAIN)]
    handles = {}
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(_find_social_handle, company, domain): platform for platform, domain in platforms}
        for future in as_completed(futures):
            platform = futures[future]
            try:
                handle = future.result()
                if handle:
                    handles[platform] = handle
                    logger.info(f"[Social] Found {platform} handle for '{company}': {handle}")
                else:
                    logger.info(f"[Social] No {platform} handle found for '{company}'")
            except Exception as e:
                logger.warning(f"[Social] Handle search failed for {platform}: {e}")
    return handles

def _is_official_url(href: str, domain: str, handle: str) -> bool:
    """Return True only if the URL is under the official handle's path on the platform."""
    # Normalize: strip scheme variants (https://www., https://m.) → https://{domain}/
    norm = href.lower()
    for prefix in (f"https://www.{domain}/", f"https://m.{domain}/", f"http://www.{domain}/"):
        norm = norm.replace(prefix, f"https://{domain}/")
    return norm.startswith(f"https://{domain}/{handle.lower()}/") or norm.startswith(f"https://{domain}/{handle.lower()}?")

def _fill_posts_from_pass(pass_items: list, platform: str, posts: list, seen: set, limit: int, handle: str) -> bool:
    """Process one pass of results, appending qualifying items to posts. Returns True when limit is reached."""
    for item in pass_items:
        if len(posts) >= limit:
            return True
        href = item.get("href", "")
        if href in seen:
            continue
        body = item.get("body", "") or item.get("title", "")
        if len(body) > 20:
            posts.append(_make_social_post(platform, item, handle))
            seen.add(href)
    return len(posts) >= limit


def _collect_posts(platform: str, handle: str, domain: str, preferred_patterns: list, limit: int = 3) -> list:
    """Fetch up to `limit` posts for a platform handle from DDG.
    Only keeps URLs that belong to the official handle — filters out third-party pages."""
    if not handle:
        return []
    fetch = limit * 3  # over-fetch so we have enough after dedup + filter
    results = duckduckgo_search(f'site:{domain}/{handle}', fetch, timelimit="m")
    if not results:
        results = duckduckgo_search(f'site:{domain}/{handle}', fetch)
    # Drop results that don't belong to the official handle URL
    results = [r for r in results if _is_official_url(r.get("href", ""), domain, handle)]
    posts: list = []
    seen: set = set()
    preferred = [r for r in results if any(p in r.get("href", "") for p in preferred_patterns)]
    for pass_items in (preferred, results):
        if _fill_posts_from_pass(pass_items, platform, posts, seen, limit, handle):
            break
    return posts

def _get_twitter_posts(handle: str, limit: int = 3) -> list:
    return _collect_posts("Twitter", handle, _X_DOMAIN, ["/status/"], limit)

def _get_instagram_posts(handle: str, limit: int = 3) -> list:
    return _collect_posts("Instagram", handle, _INSTAGRAM_DOMAIN, ["/p/", "/reel/"], limit)

def _get_facebook_posts(handle: str, limit: int = 3) -> list:
    return _collect_posts("Facebook", handle, _FACEBOOK_DOMAIN, ["/posts/", "/videos/", "/permalink/"], limit)


def _collect_linkedin_posts_from_results(results, slug, posts, seen, limit, post_indicators):
    """Main pattern-match loop: collect LinkedIn posts matching post indicator paths."""
    for item in results:
        if len(posts) >= limit:
            break
        href = item.get("href", "")
        body = item.get("body", "") or item.get("title", "")
        if href in seen or len(body) <= 20:
            continue
        if f"/company/{slug}" in href and any(p in href for p in post_indicators):
            posts.append(_make_social_post("LinkedIn", item, slug))
            seen.add(href)


def _collect_linkedin_posts_fallback(results, slug, posts, seen, limit):
    """Fallback loop: collect any LinkedIn company page result with content."""
    for item in results:
        if len(posts) >= limit:
            break
        href = item.get("href", "")
        body = item.get("body", "") or item.get("title", "")
        if href not in seen and f"/company/{slug}" in href and len(body) > 20:
            posts.append(_make_social_post("LinkedIn", item, slug))
            seen.add(href)


def _get_linkedin_posts(linkedin_url: str, limit: int = 3) -> list:
    """Fetch up to `limit` recent posts from the company's LinkedIn page."""
    if not linkedin_url:
        return []
    parts = linkedin_url.rstrip("/").split("/")
    try:
        slug = parts[parts.index("company") + 1]
    except (ValueError, IndexError):
        return []
    _post_indicators = ("/posts", "/activity", "/update")
    posts, seen = [], set()
    for timelimit in ("m", None):
        for query in [f'site:{_LI_COMPANY_PATH}{slug}/posts', f'site:{_LI_COMPANY_PATH}{slug}']:
            results = duckduckgo_search(query, limit * 3, timelimit=timelimit)
            _collect_linkedin_posts_from_results(results, slug, posts, seen, limit, _post_indicators)
            _collect_linkedin_posts_fallback(results, slug, posts, seen, limit)
        if posts:
            break
    return posts

def get_social_signals(company_name: str, handles: dict = None) -> tuple:
    """Fetch up to 10 posts across Twitter, Instagram, Facebook, LinkedIn (concurrent).
    Returns (social_posts: list[max 10], handles: dict).
    If handles are provided, skips DDG handle discovery entirely.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    if handles is None:
        handles = _find_all_social_handles(company_name)

    _ORDER = ["Twitter", "Instagram", "Facebook"]
    tasks = {
        "Twitter":   lambda: _get_twitter_posts(handles.get("Twitter", "")),
        "Instagram": lambda: _get_instagram_posts(handles.get("Instagram", "")),
        "Facebook":  lambda: _get_facebook_posts(handles.get("Facebook", "")),
    }
    results: dict = {}
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(fn): name for name, fn in tasks.items()}
        for future in as_completed(futures):
            name = futures[future]
            try:
                results[name] = future.result() or []
            except Exception as e:
                logger.warning(f"[Social] Post fetch failed for {name}: {e}")
                results[name] = []

    # Merge in platform order, cap total at 10
    all_posts = []
    for platform in _ORDER:
        all_posts.extend(results.get(platform, []))
    social = all_posts[:10]
    logger.info(f"[Social] Collected {len(social)} signals for '{company_name}': {[s['platform'] for s in social]}")
    return social, handles


# Category name constants
_CAT_MA = "Mergers & Acquisitions"
_CAT_FUNDING = "Funding Rounds"
_CAT_IPO = "IPO"
_CAT_LEADERSHIP = "Leadership Changes"
_CAT_HIRING = "Rapid Hiring"
_CAT_ANNOUNCE = "Announcements"
_OTHER_NEWS = "Other News"

_NEWS_PER_CATEGORY = 5

# Event categories and their keywords (checked in order — first match wins)
event_types = {
    _CAT_MA:        ["merger", "acquisition", "acquires", "acquired", "buyout", "takeover", "deal", "stake"],
    _CAT_FUNDING:   ["funding", "raises", "raised", "venture capital", "seed round", "series a", "series b", "series c", "valuation", "investor"],
    _CAT_IPO:       ["ipo", "going public", "public listing", "stock market", "public offering", "listed on"],
    _CAT_LEADERSHIP: ["ceo", "cfo", "coo", "cto", "appoints", "appointed", "resigns", "resigned", "steps down", "new president", "new director"],
    _CAT_HIRING:    ["hiring", "recruitment", "new jobs", "headcount", "workforce expansion", "job opening", "recruiting"],
    _CAT_ANNOUNCE:  ["launches", "launched", "partnership", "contract", "opens", "expands", "new office", "signs deal"],
}


def categorize_news_by_event(articles: list) -> dict:
    """Classify articles into event categories (max 3 per category). Leftovers go to Other News."""
    categorized = {category: [] for category in event_types}
    other_news = []
    for article in articles:
        title_lower = article.get(_NEWS_TITLE, "").lower()
        matched = False
        for category, keywords in event_types.items():
            if len(categorized[category]) >= _NEWS_PER_CATEGORY:
                continue
            if any(kw.lower() in title_lower for kw in keywords):
                categorized[category].append(article)
                matched = True
                break
        if not matched:
            other_news.append(article)
    result = {k: v for k, v in categorized.items() if v}
    if other_news:
        result[_OTHER_NEWS] = other_news[:5]
    return result

_AI_CATEGORIES = [
    _CAT_MA,
    _CAT_FUNDING,
    _CAT_IPO,
    _CAT_LEADERSHIP,
    _CAT_HIRING,
    _CAT_ANNOUNCE,
    _OTHER_NEWS,
]

def classify_news_with_ai(articles: list, company_name: str) -> dict:
    """
    Classify articles into the 7 fixed categories using GPT.
    The model uses semantic understanding — not just keyword matching — so it
    correctly handles cases like:
      - 'Former Apple engineer raises $5M' → Other News (Apple is NOT raising)
      - 'Apple and TikTok launch new feature' → Announcements
    Falls back to keyword categorization if OpenAI is unavailable.
    """
    if not articles:
        return {}

    try:
        import os
        import anthropic as _anthropic

        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not set")

        numbered = "\n".join(
            f"{i+1}. {a.get(_NEWS_TITLE, '')}" for i, a in enumerate(articles)
        )

        prompt = f"""You are a precise financial news classifier evaluating business signals for investors and analysts.
For each headline, first decide if it is genuinely about "{company_name}" the company. Then classify it.

Categories:
- Mergers & Acquisitions: {company_name} is acquiring, merging with, or being acquired by another company. Must be a deal where {company_name} is a direct party.
- Funding Rounds: {company_name} itself is raising external capital (VC, private equity, Series A/B/C, debt financing). NOT investments {company_name} is making into others.
- IPO: {company_name} filing for or completing an IPO, going public, or listing on a stock exchange.
- Leadership Changes: C-suite or board-level appointments, resignations, or departures AT {company_name}.
- Rapid Hiring: {company_name} announcing significant headcount growth, mass hiring drives, or major new job openings.
- Announcements: HIGH-SIGNAL business events only — major new product launches, large commercial contracts, significant market expansions, or major strategic partnerships with clear revenue impact. EXCLUDE: sustainability initiatives, CSR programs, packaging changes, academic research collaborations, minor product updates, and charity work.
- Other News: Relevant to {company_name} but doesn't fit the above — market analysis, financial results, stock commentary, awards, ESG news, opinion pieces.
- Irrelevant: NOT about {company_name} the company — different entity with same name, {company_name} only mentioned in passing, articles about former employees/competitors/suppliers, or pure stock position changes by third-party investors with no company action.

Rules:
- {company_name} must be the ACTING SUBJECT, not just mentioned.
- Institutional investor buying/selling {company_name} stock → Irrelevant (no company action).
- Former employee, supplier, or competitor articles → Irrelevant.
- When unsure between a real category and Irrelevant, choose Irrelevant.

Headlines:
{numbered}

Respond with ONLY a JSON array (no markdown, no explanation):
[{{"index": 1, "category": "Category Name"}}, ...]"""

        claude = _anthropic.Anthropic(api_key=api_key)
        message = claude.messages.create(
            model="claude-opus-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = message.content[0].text.strip()
        raw = re.sub(r'^```(?:json)?\s*', '', raw)
        raw = re.sub(r'\s*```$', '', raw)

        classifications = json.loads(raw)

        # Build categorized dict — skip Irrelevant, cap each category at 5
        result: dict = {}
        for item in classifications:
            idx = item.get("index", 0) - 1
            cat = item.get("category", _OTHER_NEWS)
            if cat == "Irrelevant":
                continue
            if cat not in _AI_CATEGORIES:
                cat = _OTHER_NEWS
            if 0 <= idx < len(articles):
                bucket = result.setdefault(cat, [])
                if len(bucket) < 5:
                    bucket.append(articles[idx])

        # Remove empty categories
        result = {k: v for k, v in result.items() if v}

        logger.info(f"[AI Classifier] Classified {len(articles)} articles for '{company_name}': { {k: len(v) for k, v in result.items()} }")
        return result

    except Exception as e:
        logger.warning(f"[AI Classifier] Claude classification failed ({e}), falling back to keyword categorization")
        return categorize_news_by_event(articles)


_CAT_OTHER = "Other News"

# Targeted search query suffixes for each category
_CATEGORY_SEARCH_TERMS = {
    _CAT_MA:         "mergers acquisitions deal buyout takeover",
    _CAT_FUNDING:    "funding investment raises capital round",
    _CAT_IPO:        "IPO public listing stock offering",
    _CAT_LEADERSHIP: "CEO CFO CTO leadership appoints resigns",
    _CAT_HIRING:     "hiring jobs workforce recruitment",
    _CAT_ANNOUNCE:   "launch partnership contract expansion",
    _CAT_OTHER:      "",  # generic search — just company name
}


def _rss_item_to_article(item) -> dict | None:
    """Convert a BeautifulSoup RSS <item> to an article dict, or None if title is missing."""
    title = item.title.text.strip() if item.title else ""
    if not title:
        return None
    link_text = item.link.text.strip() if item.link else ""
    guid_text = item.guid.text.strip() if item.guid else ""
    return {
        _NEWS_TITLE: title,
        "Source": item.source.text.strip() if item.source else "",
        "Published Date": item.pubDate.text.strip() if item.pubDate else "",
        "Link": link_text or guid_text,
    }


def _fetch_category_articles(company_name: str, category: str, search_suffix: str, limit: int = 5) -> list:
    """Fetch top `limit` Google News articles for a specific category.
    Builds query as: "CompanyName" keyword1 keyword2 — company quoted, terms unquoted.
    """
    import urllib.parse
    # "Apple" mergers acquisitions — exact company match + unquoted category terms
    raw_query = f'"{company_name}"' + (f" {search_suffix}" if search_suffix else "")
    url = f"https://news.google.com/rss/search?q={urllib.parse.quote(raw_query)}&hl=en&gl=US&ceid=US:en"
    try:
        resp = requests.get(url, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        articles = []
        soup = BeautifulSoup(resp.content, "xml")
        for item in soup.find_all("item")[:limit]:
            article = _rss_item_to_article(item)
            if article:
                articles.append(article)
        return articles
    except Exception as e:
        logger.warning(f"[News] _fetch_category_articles failed for '{category}': {e}")
        return []


def fetch_company_news(company_name: str) -> dict:
    """
    Fetch ~35 news articles via per-category targeted searches, deduplicate by title.
    Returns categorized dict keyed by category name (no AI classification).
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    seen_titles: set = set()
    categorized: dict = {}

    def fetch_cat(category: str, suffix: str) -> tuple:
        return category, _fetch_category_articles(company_name, category, suffix, limit=5)

    with ThreadPoolExecutor(max_workers=len(_CATEGORY_SEARCH_TERMS)) as pool:
        futures = {
            pool.submit(fetch_cat, cat, suffix): cat
            for cat, suffix in _CATEGORY_SEARCH_TERMS.items()
        }
        for future in as_completed(futures):
            category, articles = future.result()
            unique = []
            for article in articles:
                title_key = (article.get(_NEWS_TITLE) or "").strip().lower()
                if title_key and title_key not in seen_titles:
                    seen_titles.add(title_key)
                    unique.append(article)
            if unique:
                categorized[category] = unique

    total = sum(len(v) for v in categorized.values())
    logger.info(f"[News] Fetched {total} deduplicated articles for '{company_name}': { {k: len(v) for k, v in categorized.items()} }")
    return categorized


def _resolve_country(candidate: str) -> str | None:
    """Resolve a location string to a country name via pycountry lookups."""
    try:
        c = pycountry.countries.get(alpha_2=candidate)
        if c:
            return c.name
        try:
            c = pycountry.countries.lookup(candidate)
            return c.name
        except LookupError:
            return None
    except Exception:
        return None


# Helper to extract countries from a list of locations
def extract_countries(locations: list[str]) -> list[str]:
    countries = set()
    for loc in locations or []:
        parts = [p.strip() for p in loc.split(",")]
        if parts:
            candidate = parts[-1]
            candidate = re.sub(r"Get directions$", "", candidate).strip()
            country_name = _resolve_country(candidate)
            if country_name:
                countries.add(country_name)
            else:
                countries.add(candidate)
    return sorted(countries)


def _company_info_from_ddg(url: str, slug_name: str) -> dict:
    """Build company info dict from DDG fallback when LinkedIn scrape returns no data."""
    logger.info(f"LinkedIn scrape returned no data for {url} — falling back to DDG profile builder")
    slug_name_resolved = slug_name
    if not slug_name_resolved and _LI_COMPANY_PATH in url:
        slug = url.split(_LI_COMPANY_PATH)[1].split("/")[0]
        slug_name_resolved = slug.replace("-", " ").title()
    ddg_profile = build_company_profile_from_ddg(slug_name_resolved or url, linkedin_url=url)
    return {
        "company_name": ddg_profile.get("company_name", slug_name_resolved),
        "about": ddg_profile.get("about", ""),
        "website": ddg_profile.get("website"),
        "industry": ddg_profile.get("industry"),
        "type": None,
        "logo_url": None,
        "headquarters": ddg_profile.get("headquarters"),
        "size": None,
        "founded": None,
        "specialties": None,
        "locations": None,
        "employees_preview": None,
        "linkedin_url": ddg_profile.get("linkedin_url", url),
        "data_source": "duckduckgo",
    }


# Helper function to extract company details from a LinkedIn company page
def get_company_details(url: str):
    # Try direct LinkedIn scrape first
    scraped = extract_company_info(url) or {}
    scraped_name = scraped.get("company_name", "")
    has_real_data = bool(scraped_name and scraped.get("industry") or scraped.get("website") or scraped.get("headquarters"))

    if has_real_data:
        # LinkedIn scrape succeeded
        company_info = {
            "company_name": scraped_name,
            "about": scraped.get("about", ""),
            "website": scraped.get("website"),
            "industry": scraped.get("industry"),
            "type": scraped.get("type"),
            "logo_url": scraped.get("logo_url"),
            "headquarters": scraped.get("headquarters"),
            "size": scraped.get("company_size"),
            "company_size": scraped.get("company_size"),
            "founded": scraped.get("founded"),
            "specialties": scraped.get("specialties"),
            "locations": scraped.get("locations"),
            "employees_preview": scraped.get("employees_preview"),
            "linkedin_url": url,
            "data_source": "linkedin_scrape",
            # LinkedIn-specific fields
            "headline": scraped.get("headline"),
            "cover_image_url": scraped.get("cover_image_url"),
            "verified_status": scraped.get("verified_status"),
            "followers_count": scraped.get("followers_count"),
            "linkedin_employee_count": scraped.get("linkedin_employee_count"),
            "recent_updates": scraped.get("recent_updates"),
        }
    else:
        # LinkedIn blocked — build profile from DuckDuckGo instead
        slug_name = ""
        if _LI_COMPANY_PATH in url:
            slug = url.split(_LI_COMPANY_PATH)[1].split("/")[0]
            slug_name = slug.replace("-", " ").title()
        company_info = _company_info_from_ddg(url, slug_name)

    if company_info.get("website"):
        company_info["website"] = _strip_url(company_info["website"])

    company_name = company_info["company_name"]
    news = []
    social = []
    handles = {}
    if company_name:
        # Discover social handles once — reuse for both data sources and post fetching
        handles = _find_all_social_handles(company_name)
        logger.info(f"[Social] Handles for '{company_name}': {handles}")
        news = fetch_company_news(company_name)
        social, _ = get_social_signals(company_name, handles=handles)
    data_sources = build_data_sources(company_info, handles)
    return {
        "company": company_info,
        "news": news,
        "social": social,
        "dataSources": data_sources,
    }


def _is_cache_empty(cached: dict) -> bool:
    """Return True if the cached document contains no meaningful company data."""
    company_info = cached.get("company", {})
    has_about = bool(company_info.get("about", "").strip())
    has_website = bool(company_info.get("website"))
    has_industry = bool(company_info.get("industry"))
    has_headquarters = bool(company_info.get("headquarters"))
    has_news = bool(cached.get("news") and any(
        isinstance(v, list) and len(v) > 0
        for v in cached.get("news", {}).values()
    ))
    return not has_about and not has_website and not has_industry and not has_headquarters and not has_news


def _associate_user_with_cache(cached: dict, user_id: str):
    """Add user_id to the cached company document's user_ids set."""
    if user_id and '_id' in cached:
        try:
            col = mongodb_service.companies_collection
            if col is not None:
                col.update_one(
                    {"_id": cached["_id"]},
                    {"$addToSet": {"user_ids": user_id}}
                )
        except Exception:
            pass


def _check_mongodb_cache(company_name: str, user_id: str) -> dict | None:
    """Check MongoDB for a cached company document within the 24h TTL. Returns doc or None."""
    try:
        cached = mongodb_service.get_company_by_name(company_name)
        if not cached:
            return None
        last_updated = cached.get("lastUpdated")
        if not last_updated:
            return None
        if isinstance(last_updated, str):
            last_updated = datetime.fromisoformat(last_updated.replace('Z', '+00:00'))
        age_hours = (datetime.now(timezone.utc) - last_updated.replace(tzinfo=None)).total_seconds() / 3600

        if _is_cache_empty(cached):
            logger.info(f"⚠️ Cached data for '{company_name}' is empty — ignoring cache and re-scraping")
            return None
        if age_hours >= 24:
            return None

        logger.info(f"✅ Cache hit for '{company_name}' ({age_hours:.1f}h old) — skipping scrape")
        _associate_user_with_cache(cached, user_id)
        if '_id' in cached:
            cached['_id'] = str(cached['_id'])
        cached["responseMetadata"] = {
            "source": "mongodb_cache",
            "cached": True,
            "age_hours": round(age_hours, 1),
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "company_name": company_name,
        }
        return cached
    except Exception as cache_err:
        logger.warning(f"Cache check failed, proceeding to scrape: {cache_err}")
        return None


def _upsert_fresh_data(fresh_data: dict, company_name: str, user_id: str | None) -> dict:
    """Upsert fresh_data to MongoDB and return the final document. Falls back to fresh_data on error."""
    logger.info(f" Upserting data to MongoDB for: {company_name}" + (f" (user_id: {user_id})" if user_id else ""))
    try:
        kwargs = {"user_id": user_id} if user_id is not None else {}
        final_document = mongodb_service.upsert_company_data(fresh_data, **kwargs)

        if final_document:
            logger.info(f" Successfully processed company data for: {company_name}")
            if '_id' in final_document:
                final_document['_id'] = str(final_document['_id'])
            final_document["responseMetadata"] = {
                "source": "mongodb",
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "company_name": company_name
            }
            return final_document
        else:
            raise RuntimeError("Failed to upsert company data")

    except Exception as mongo_error:
        logger.error(f"ERROR: MongoDB operation failed: {mongo_error}")
        logger.info(" Falling back to direct scraped data")
        fresh_data["responseMetadata"] = {
            "source": "fallback_scrape",
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "company_name": company_name,
            "mongodb_error": str(mongo_error)
        }
        return fresh_data


def get_company_credit_rating_with_mongodb(company_name: str, linkedin_url: str | None = None, user_id: str | None = None, force_refresh: bool = False):
    """
    Get company credit rating with MongoDB integration.
    Checks MongoDB cache first (24h TTL, global across all users).
    Falls back to fresh scrape when cache is stale or force_refresh=True.

    Args:
        company_name: Name of the company
        linkedin_url: LinkedIn URL of the company (optional)
        user_id: User ID for data isolation (optional)
        force_refresh: Skip cache and always scrape fresh data

    Returns:
        Dictionary containing company data from MongoDB after upsert
    """
    try:
        logger.info(f" Analyzing company: {company_name} (force_refresh={force_refresh})")

        # Step 1: Check MongoDB cache (global, 24h TTL) unless force_refresh
        force_refresh = True  # DEBUG: remove this line when done testing
        if not force_refresh:
            cached = _check_mongodb_cache(company_name, user_id)
            if cached is not None:
                return cached

        # Step 2: Find correct LinkedIn URL
        logger.info(f" Scraping fresh data for: {company_name}")
        if linkedin_url:
            scrape_url = linkedin_url
            logger.info(f"🔗 Using provided LinkedIn URL: {linkedin_url}")
            fresh_data = get_company_details(scrape_url)
        else:
            # Use DuckDuckGo to find the real LinkedIn URL
            scrape_url = find_linkedin_url_via_ddg(company_name)
            if not scrape_url:
                raise ValueError(f"Could not find a LinkedIn page for '{company_name}'. Try pasting the LinkedIn URL directly.")
            logger.info(f"🔗 Using DDG-resolved LinkedIn URL: {scrape_url}")
            fresh_data = get_company_details(scrape_url)
        if "dataSources" not in fresh_data:
            fresh_data["dataSources"] = []

        # Add metadata
        fresh_data["scrapedAt"] = datetime.now(timezone.utc)
        fresh_data["dataSource"] = "fresh_scrape"

        # Step 2: Upsert to MongoDB (handles both insert and smart update)
        return _upsert_fresh_data(fresh_data, company_name, user_id)

    except Exception as e:
        logger.error(f"ERROR: Error in get_company_credit_rating_with_mongodb: {e}")

        # Final fallback
        return {
            "company": {"name": company_name},
            "news": {},
            "social": [],
            "responseMetadata": {
                "source": "error_fallback",
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "company_name": company_name,
                "error": str(e)
            }
        }
