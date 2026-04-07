"""
site_crawler.py

Crawl a site's internal pages starting from a root domain and extract structured data.

Usage:
    python site_crawler.py https://nexxen.com/ --max-pages 200 --output nexxen_scrape.json --use-sitemap

Dependencies:
    pip install requests beautifulsoup4 tldextract validators

Optional (for JS-heavy sites):
    pip install playwright
    playwright install
    (See fallback_playwright_fetch() below)
"""

import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import re
import time
import json
import argparse
import tldextract
import validators
import xml.etree.ElementTree as ET
from collections import deque
from urllib.robotparser import RobotFileParser
import csv
from concurrent.futures import ThreadPoolExecutor, as_completed

# ---------- Helpers ----------
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; SiteCrawler/1.0; +https://example.com/bot)"}
EMAIL_RE = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
PHONE_RE = re.compile(r"(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{2,4}\)|\d{2,4})[-.\s]?\d{3,4}[-.\s]?\d{3,4}")

def is_same_domain(root, url):
    try:
        root_e = tldextract.extract(root)
        u_e = tldextract.extract(url)
        return (root_e.domain == u_e.domain and root_e.suffix == u_e.suffix)
    except Exception:
        return False

def clean_url(u):
    # remove fragments
    p = urlparse(u)
    cleaned = p._replace(fragment="").geturl()
    # strip trailing slash (optional)
    return cleaned.rstrip("/")

def fetch_robots_txt(root_url):
    rp = RobotFileParser()
    parsed = urlparse(root_url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    try:
        rp.set_url(robots_url)
        rp.read()
    except Exception:
        # if cannot read robots.txt, allow by default (but be polite)
        rp = None
    return rp


def _parse_loc_urls(root_elem) -> list:
    """Find all <loc> URLs in an XML element, trying namespaced then plain tag."""
    locs = root_elem.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}loc")
    if not locs:
        locs = root_elem.findall(".//loc")
    return [loc.text.strip() for loc in locs if loc.text]


def _fetch_index_sitemap_urls(sitemap_tags) -> list:
    """Fetch each sub-sitemap referenced in a sitemap index and return all loc URLs."""
    urls = []
    for sitemap in sitemap_tags:
        loc = sitemap.find("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")
        if loc is not None and loc.text:
            sitemap_url_inner = loc.text.strip()
            try:
                r_inner = requests.get(sitemap_url_inner, headers=HEADERS, timeout=10)
                if r_inner.status_code == 200:
                    root_inner = ET.fromstring(r_inner.text)
                    urls.extend(_parse_loc_urls(root_inner))
            except Exception:
                continue
    return urls


def parse_sitemap(root_url):
    parsed = urlparse(root_url)
    sitemap_url = f"{parsed.scheme}://{parsed.netloc}/sitemap.xml"
    try:
        r = requests.get(sitemap_url, headers=HEADERS, timeout=10)
        if r.status_code != 200:
            return []
        root = ET.fromstring(r.text)

        # If the sitemap is an index sitemap (contains sitemap entries)
        sitemap_tags = root.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}sitemap")
        if sitemap_tags:
            return _fetch_index_sitemap_urls(sitemap_tags)
        else:
            return _parse_loc_urls(root)
    except Exception:
        return []

def extract_raw_text(html_text, is_xml=False):
    """
    Extracts raw text from HTML or XML.
    If is_xml is True, use 'xml' parser for BeautifulSoup.
    """
    parser = "xml" if is_xml else "html.parser"
    soup = BeautifulSoup(html_text, parser)
    # For XML, do not attempt to remove script/style/noscript
    if not is_xml:
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
    text = soup.get_text(separator="\n")
    lines = [line.strip() for line in text.splitlines()]
    cleaned_text = "\n".join(line for line in lines if line)
    return cleaned_text

# ---------- Page extraction ----------
def extract_page_data(url, html_text, is_xml=False):
    raw_text = extract_raw_text(html_text, is_xml=is_xml)
    return {
        "url": url,
        "raw_text": raw_text
    }

# ---------- Fetch functions ----------
def simple_fetch(session, url, timeout=30):
    r = session.get(url, headers=HEADERS, timeout=timeout)
    r.raise_for_status()
    return r.text

# Optional: fallback JS-rendered fetch using Playwright (uncomment to use)
def fallback_playwright_fetch(url, timeout=20):
    """
    OPTIONAL: If the site requires rendering (JS), use Playwright.
    pip install playwright
    playwright install
    """
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        raise RuntimeError("Playwright not installed. pip install playwright && playwright install")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, wait_until="networkidle", timeout=timeout * 1000)
        html = page.content()
        browser.close()
        return html


# ---------- Crawler helpers ----------
def _is_first_level_path(path: str) -> bool:
    """Return True if path is root '/' or has exactly one segment."""
    segments = [seg for seg in path.split("/") if seg]
    return len(segments) <= 1


def _collect_urls_to_crawl(root_url: str, use_sitemap: bool) -> list:
    """Build the deduplicated, first-level-filtered list of URLs to crawl."""
    urls_to_crawl = []
    if use_sitemap:
        urls = parse_sitemap(root_url)
        for u in urls:
            if is_same_domain(root_url, u):
                cleaned_u = clean_url(u)
                path = urlparse(cleaned_u).path
                if _is_first_level_path(path):
                    urls_to_crawl.append(cleaned_u)

    root_clean = clean_url(root_url)
    if root_clean not in urls_to_crawl:
        urls_to_crawl.insert(0, root_clean)

    return urls_to_crawl


def _crawl_urls_concurrently(urls_to_crawl: list, rp) -> dict:
    """Fetch all URLs concurrently, respecting robots.txt, and return {url: page_data}."""
    results = {}
    with requests.Session() as session:
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_url = {}
            for url in urls_to_crawl:
                if rp and not rp.can_fetch(HEADERS["User-Agent"], url):
                    print(f"[robots.txt] Skipping {url}")
                    continue
                future = executor.submit(simple_fetch, session, url)
                future_to_url[future] = url

            for future in as_completed(future_to_url):
                url = future_to_url[future]
                try:
                    print(f"[fetch] {url}")
                    html = future.result()
                    is_xml = urlparse(url).path.lower().endswith(".xml")
                    page_data = extract_page_data(url, html, is_xml=is_xml)
                    results[url] = page_data
                except Exception as e:
                    print(f"[err] {url} -> {e}")
    return results


# ---------- Crawler ----------
def crawl_site(root_url, max_pages=200, use_sitemap=False):
    root_url = root_url.rstrip("/")
    if not validators.url(root_url):
        raise ValueError("Invalid root URL")

    rp = fetch_robots_txt(root_url)
    if rp and not rp.can_fetch(HEADERS["User-Agent"], root_url):
        raise RuntimeError("Crawling disallowed by robots.txt for root URL")

    urls_to_crawl = _collect_urls_to_crawl(root_url, use_sitemap)

    # Limit to max_pages (if specified)
    if max_pages is not None and max_pages > 0:
        urls_to_crawl = urls_to_crawl[:max_pages]

    return _crawl_urls_concurrently(urls_to_crawl, rp)

# ---------- Main ----------
def main():
    start_time = time.time()
    root_url = "https://sandsoft.com"
    max_pages = 200000
    use_sitemap = True
    output_file = "scrape_output.json"
    txt_file = "scrape_output.txt"

    scraped = crawl_site(root_url, max_pages=max_pages, use_sitemap=use_sitemap)
    print(f"\nCrawled {len(scraped)} pages. Writing to {output_file} ...")
    # NOTE: For reporting/analysis, currently focusing only on core site pages (excluding blogs, careers, tags).

    # Prepare dictionary of {url: raw_text}
    raw_text_dict = {url: data.get("raw_text", "") for url, data in scraped.items()}
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(raw_text_dict, f, ensure_ascii=False, indent=2)

    # Write TXT output concatenating raw_text with separators
    with open(txt_file, "w", encoding="utf-8") as txtf:
        for url, data in scraped.items():
            txtf.write(f"----- URL: {url} -----\n")
            txtf.write(data.get("raw_text", "") + "\n\n")
    print(f"TXT output saved to {txt_file}")

    end_time = time.time()
    elapsed = end_time - start_time
    print(f"Time taken: {elapsed:.2f} seconds")
    print("Done.")

if __name__ == "__main__":
    main()
