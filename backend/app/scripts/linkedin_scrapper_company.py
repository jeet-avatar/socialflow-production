import requests
from bs4 import BeautifulSoup
import re
import json

event_types = {
    "Product Launches": ["product launch", "new product", "release", "feature launch"],
    "Rapid Hiring": ["hiring spree", "expansion", "job opening", "recruitment drive"],
    "Signals": ["signal", "trend", "indicator", "insight"],
    "Layoffs / Regulations": ["layoff", "downsizing", "regulation", "compliance", "fired", "job cut", "redundancy"],
    "Competitor Activity": ["competitor", "competition", "market share", "rival"],
    "Event Attendance": ["conference", "summit", "expo", "event", "webinar", "attending"],
    "News": ["news", "article", "headline", "report"],
}

def get_google_news(company_name: str, limit: int = 10) -> list:
    """Fetch latest news articles for a company from Google News RSS."""
    import urllib.parse
    query = urllib.parse.quote(f'"{company_name}"')
    url = f"https://news.google.com/rss/search?q={query}&hl=en&gl=US&ceid=US:en"
    try:
        resp = requests.get(url, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(resp.content, "xml")
        articles = []
        for item in soup.find_all("item")[:limit]:
            title = item.title.text.strip() if item.title else ""
            if not title:
                continue
            link_text = item.link.text.strip() if item.link else ""
            guid_text = item.guid.text.strip() if item.guid else ""
            articles.append({
                "News Title": title,
                "Source": item.source.text.strip() if item.source else "",
                "Published Date": item.pubDate.text.strip() if item.pubDate else "",
                "Link": link_text or guid_text,
            })
        return articles
    except Exception as e:
        print(f"[ERROR] get_google_news: {e}")
        return []


def _ascii_lower(s: str) -> str:
    """Lowercase + strip accents/diacritics for accent-insensitive matching."""
    import unicodedata
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii").lower()


def get_top_articles(company, keywords, limit=5):
    articles = []
    # Use ASCII form of company name for both the search query and headline check
    # so "Mondelēz" matches articles written as "Mondelez"
    company_ascii = _ascii_lower(company)
    query = f'"{company}" ({" OR ".join(keywords)})'
    url = f"https://news.google.com/rss/search?q={requests.utils.quote(query)}&hl=en"  # pyright: ignore[reportAttributeAccessIssue]
    try:
        resp = requests.get(url, timeout=5)
        soup = BeautifulSoup(resp.content, "xml")  # pyright: ignore[reportArgumentType]
        items = soup.find_all("item")
        for item in items[:limit]:
            title = item.title.text if item.title else ""
            # Accent-insensitive check so "Mondelez" matches "Mondelēz"
            if company_ascii not in _ascii_lower(title):
                continue
            articles.append({
                "News Title": title,
                "Source": item.source.text if item.source else "",
                "Published Date": item.pubDate.text if item.pubDate else "",
                "Link": item.link.text if item.link else ""
            })
    except Exception as e:
        print("[ERROR] get_top_articles:", e)
        return []
    return articles

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
}


def _apply_org_data(info: dict, data: dict):
    """Apply fields from a JSON-LD Organization/Corporation/LocalBusiness block into info."""
    if data.get("name"):
        info["company_name"] = data["name"]
    if data.get("url"):
        info["website"] = data["url"]
    if data.get("description"):
        info["about"] = data["description"]
    if data.get("logo"):
        logo = data["logo"]
        info["logo_url"] = logo.get("url", logo) if isinstance(logo, dict) else logo
    if data.get("foundingDate"):
        info["founded"] = data["foundingDate"]
    addr = data.get("address", {})
    if addr:
        parts = [addr.get("addressLocality", ""), addr.get("addressRegion", ""), addr.get("addressCountry", "")]
        hq = ", ".join(p for p in parts if p)
        if hq:
            info["headquarters"] = hq
    emp = data.get("numberOfEmployees", {})
    if isinstance(emp, dict) and emp.get("value"):
        info["company_size"] = str(emp["value"])
    if data.get("industry"):
        info["industry"] = data["industry"]


def _parse_json_ld(soup) -> dict:
    """Extract company info from JSON-LD structured data (LinkedIn embeds this for SEO)."""
    info = {}
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            org_type = data.get("@type", "")
            if org_type not in ("Organization", "Corporation", "LocalBusiness"):
                continue
            _apply_org_data(info, data)
        except Exception:
            continue
    return info


def _extract_number(text: str):
    """Extract a numeric value (int or float) from a text string."""
    match = re.search(r"([\d,\.]+)", text)
    if match:
        num_str = match.group(1).replace(",", "")
        try:
            if '.' in num_str:
                return float(num_str)
            else:
                return int(num_str)
        except Exception:
            return None
    return None


def _get_dd_text(soup_el) -> str:
    """Find a <dd> element inside soup_el and return its stripped text, or empty string."""
    dd = soup_el.find("dd")
    return dd.text.strip() if dd else ""


def _extract_basic_fields(soup, company_info: dict):
    """Extract title, headline, about, website, and 5 data-test-id structured fields."""
    title = soup.find("title")
    if title:
        company_name = title.text.replace("| LinkedIn", "").replace("- LinkedIn", "").strip()
        company_info["company_name"] = company_name

    headline = soup.find("h2", class_="top-card-layout__headline")
    if headline:
        company_info["headline"] = headline.text.strip()

    about_section = soup.find("p", {"data-test-id": "about-us__description"})
    if about_section:
        company_info["about"] = about_section.text.strip()
        careers_match = re.search(r"https://career\S+", company_info["about"])
        if careers_match:
            company_info["careers_url"] = careers_match.group(0)

    website = soup.find("div", {"data-test-id": "about-us__website"})
    if website:
        link = website.find("a")
        if link:
            company_info["website"] = link.text.strip()

    structured_fields = [
        ("about-us__industry", "industry"),
        ("about-us__size", "company_size"),
        ("about-us__headquarters", "headquarters"),
        ("about-us__organizationType", "type"),
        ("about-us__foundedOn", "founded"),
    ]
    for data_test_id, field_key in structured_fields:
        el = soup.find("div", {"data-test-id": data_test_id})
        if el:
            text = _get_dd_text(el)
            if text:
                company_info[field_key] = text


def _extract_logo(soup, company_info: dict):
    """Extract the company logo URL from the page."""
    logo_container = soup.find("div", class_="top-card-layout__entity-image-container")
    if logo_container:
        img_tag = logo_container.find("img")
        if img_tag:
            logo_url = img_tag.get("data-delayed-url") or img_tag.get("src") or img_tag.get("data-src")
            if logo_url:
                company_info["logo_url"] = logo_url


def _is_cover_or_banner(text: str) -> bool:
    """Return True if text contains 'cover' or 'banner'."""
    return "cover" in text or "banner" in text


def _find_cover_img_from_tags(soup) -> str:
    """Scan img tags for a cover/banner image URL."""
    for img in soup.find_all("img"):
        alt = img.get("alt", "").lower()
        cls = " ".join(img.get("class", [])).lower()
        if _is_cover_or_banner(alt) or _is_cover_or_banner(cls):
            url = img.get("src") or img.get("data-delayed-url")
            if url:
                return url
    return ""


def _find_cover_img_from_styles(soup) -> str:
    """Scan inline styles for a cover/banner background-image URL."""
    for div in soup.find_all(style=True):
        style = div["style"]
        match = re.search(r'background-image:\s*url\(["\']?(.*?)["\']?\)', style)
        if match:
            url = match.group(1)
            if _is_cover_or_banner(url):
                return url
    return ""


def _extract_cover_image(soup) -> str:
    """Scan for a cover/banner image via img tags and inline styles. Returns URL or ''."""
    return _find_cover_img_from_tags(soup) or _find_cover_img_from_styles(soup)


def _extract_specialties(soup) -> list:
    """Extract company specialties from the about-us__specialties section."""
    specialties_div = soup.find("div", {"data-test-id": "about-us__specialties"})
    specialties = []
    if specialties_div:
        dd = specialties_div.find("dd")
        if dd:
            specialties_text = dd.text.strip()
            if specialties_text:
                specialties.append(specialties_text)
        else:
            lis = specialties_div.find_all("li")
            for li in lis:
                text = li.text.strip()
                if text:
                    specialties.append(text)
    return specialties


def _extract_followers_count(soup):
    """Return followers count as a number, or None."""
    for tag in soup.find_all(["span", "div"]):
        text = tag.get_text(strip=True).lower()
        if "followers" in text:
            count = _extract_number(text)
            if count is not None:
                return count
    return None


def _extract_linkedin_employee_count(soup):
    """Return LinkedIn employee count as a number, or None."""
    for tag in soup.find_all(string=True):
        text = tag.strip()
        if "employees on linkedin" in text.lower():
            count = _extract_number(text)
            if count is not None:
                return count
    return None


def _extract_verified_status(soup) -> bool:
    """Return True if a 'verified' label is found on the page."""
    for tag in soup.find_all(["span", "div"]):
        text = tag.get_text(strip=True).lower()
        if "verified" in text:
            return True
    return False


def _extract_locations(soup) -> list:
    """Extract office locations from the locations section."""
    locations_section = soup.find("section", class_="locations")
    locations = []
    if locations_section:
        for loc in locations_section.find_all("li"):
            text = " ".join(loc.stripped_strings)
            if text:
                locations.append(text)
    return locations


def _extract_employees(soup) -> list:
    """Extract employee name previews from the employees-at section."""
    employees_section = soup.find("section", {"data-test-id": "employees-at"})
    employees = []
    if employees_section:
        for card in employees_section.find_all("h3", class_="base-main-card__title"):
            employees.append(card.text.strip())
    return employees


def _extract_update_counts(social_counts) -> tuple:
    """Return (likes, comments) extracted from a social-counts element."""
    likes = None
    comments = None
    if social_counts:
        likes_tag = social_counts.find(lambda tag: tag.name in ["span", "div"] and "like" in tag.get_text(strip=True).lower())
        comments_tag = social_counts.find(lambda tag: tag.name in ["span", "div"] and "comment" in tag.get_text(strip=True).lower())
        if likes_tag:
            likes = _extract_number(likes_tag.get_text(strip=True))
        if comments_tag:
            comments = _extract_number(comments_tag.get_text(strip=True))
    return likes, comments


def _build_update_entry(post) -> dict:
    """Build an update entry dict from a post element, including likes/comments if available."""
    update_text = post.text.strip()
    likes, comments = None, None
    if post.parent:
        social_counts = post.parent.find(class_="social-counts")
        likes, comments = _extract_update_counts(social_counts)
    entry: dict = {"text": update_text}
    if likes is not None:
        entry["likes"] = int(likes) if isinstance(likes, float) else likes
    if comments is not None:
        entry["comments"] = int(comments) if isinstance(comments, float) else comments
    return entry


def _extract_recent_updates(soup) -> list:
    """Extract recent post updates from the updates section."""
    updates_section = soup.find("section", {"data-test-id": "updates"})
    if not updates_section:
        return []
    return [
        _build_update_entry(post)
        for post in updates_section.find_all("p", class_="attributed-text-segment-list__content")
    ]


def extract_company_info(url: str):
    try:
        response = requests.get(url, headers=_BROWSER_HEADERS, timeout=12, allow_redirects=True)
    except Exception:
        return None

    # LinkedIn returns 999 for bot detection; still try to parse what we get
    if response.status_code not in (200, 999):
        return None

    html = response.text
    soup = BeautifulSoup(html, "html.parser")

    # Try JSON-LD first — most reliable when LinkedIn doesn't fully block
    company_info = _parse_json_ld(soup)
    if not company_info:
        company_info = {}

    company_info = {}

    # --- Basic Info + structured fields ---
    _extract_basic_fields(soup, company_info)

    # --- Logo ---
    _extract_logo(soup, company_info)

    # --- Cover / Banner Image ---
    cover_img = _extract_cover_image(soup)
    if cover_img:
        company_info["cover_image_url"] = cover_img

    # --- Specialties ---
    specialties = _extract_specialties(soup)
    if specialties:
        company_info["specialties"] = specialties

    # --- Followers Count ---
    followers_count = _extract_followers_count(soup)
    if followers_count is not None:
        company_info["followers_count"] = followers_count

    # --- Linkedin Employee Count ---
    linkedin_employee_count = _extract_linkedin_employee_count(soup)
    if linkedin_employee_count is not None:
        company_info["linkedin_employee_count"] = linkedin_employee_count

    # --- Verified Status ---
    company_info["verified_status"] = _extract_verified_status(soup)

    # --- Locations ---
    locations = _extract_locations(soup)
    if locations:
        company_info["locations"] = locations

    # --- Employees (sample list from profiles) ---
    employees = _extract_employees(soup)
    if employees:
        company_info["employees_preview"] = employees

    # --- Updates / Recent posts ---
    updates = _extract_recent_updates(soup)
    if updates:
        company_info["recent_updates"] = updates

    # --- Company news by event types ---
    company_news = {}
    company_name = company_info.get("company_name")
    if company_name:
        for category, keywords in event_types.items():
            articles = get_top_articles(company_name, keywords)
            company_news[category] = articles
    company_info["company_news"] = company_news

    return company_info


def _print_field(data: dict, key: str, title: str):
    """Print a single field value, or a warning if it is missing."""
    if key in data:
        print(f"## {title}\n- {data[key]}\n")
    else:
        print(f"WARNING: {title} not found in HTML\n")


def _print_list_field(data: dict, key: str, title: str):
    """Print a list field with one bullet per item, or a warning if missing."""
    if key in data:
        print(f"## {title}")
        for item in data[key]:
            print(f"- {item}")
        print()
    else:
        print(f"WARNING: {title} not found in HTML\n")


def _print_verified_status(data: dict):
    """Print the verified status section."""
    if "verified_status" in data:
        verified_text = "Yes" if data["verified_status"] else "No"
        print(f"## Verified Status\n- {verified_text}\n")
    else:
        print("WARNING: Verified Status not found in HTML\n")


def _print_recent_updates(data: dict):
    """Print the recent updates section."""
    if "recent_updates" not in data:
        print("WARNING: Recent Updates not found in HTML\n")
        return
    print("## Recent Updates")
    for update in data["recent_updates"]:
        print(f"- {update.get('text', '')}")
        if "likes" in update:
            print(f"  - Likes: {update['likes']}")
        if "comments" in update:
            print(f"  - Comments: {update['comments']}")
    print()


def _print_company_news(data: dict):
    """Print the company news by event type section."""
    if "company_news" not in data:
        return
    print("===== Company News by Event Type =====")
    for category, articles in data["company_news"].items():
        print(f"\n--- {category} ---")
        if articles:
            for art in articles:
                print(f"• {art['News Title']} ({art['Source']}, {art['Published Date']})")
                print(f"  {art['Link']}")
        else:
            print("No articles found.")
    print()


def pretty_print(data: dict):
    print("\n# Company Information\n")

    simple_keys = [
        ("company_name", "Company Name"),
        ("headline", "Headline"),
        ("about", "About"),
        ("website", "Website"),
        ("careers_url", "Careers"),
        ("industry", "Industry"),
        ("company_size", "Size"),
        ("headquarters", "Headquarters"),
        ("type", "Type"),
        ("founded", "Founded"),
        ("followers_count", "Followers"),
        ("linkedin_employee_count", "LinkedIn Employee Count"),
    ]

    for key, title in simple_keys:
        _print_field(data, key, title)

    _print_list_field(data, "specialties", "Specialties")
    _print_verified_status(data)
    _print_list_field(data, "locations", "Locations")
    _print_list_field(data, "employees_preview", "Employees Preview")
    _print_recent_updates(data)
    _print_company_news(data)


if __name__ == "__main__":
    url = "https://www.linkedin.com/company/tech-cloud-pro/"
    data = extract_company_info(url)
    if data is None:
        print("Failed to fetch LinkedIn page.")
    else:
        # print(json.dumps(data, indent=2, ensure_ascii=False))
        pretty_print(data)
