# personalised_message.py
import json
import logging
import os
import anthropic
from scripts.linkedin_scrapper_company import extract_company_info

logger = logging.getLogger(__name__)
claude_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))

DEFAULT_COMPANY = "our company"
_NEWS_RAPID_HIRING = "Rapid Hiring"
_NEWS_FUNDING_ROUNDS = "Funding Rounds"
_NEWS_ANNOUNCEMENTS = "Announcements"
_NEWS_PRODUCT_LAUNCHES = "Product Launches"
_NEWS_LEADERSHIP_CHANGES = "Leadership Changes"
_NEWS_MERGERS = "Mergers & Acquisitions"
_NEWS_OTHER = "Other News"



def _get_sender_context(user_id: str) -> dict:
    """
    Fetch the user's sender_identity and ai_summary from MongoDB.
    Returns a dict with keys: company_name, what_we_do, who_we_are,
    value_proposition, outreach_angles, target_audience, fallback (bool).
    """
    try:
        from utils.mongodb_service import mongodb_service
        user = mongodb_service.db['users'].find_one(
            {"supabase_user_id": user_id},
            {"sender_identity": 1, "ai_summary": 1, "full_name": 1, "company_name": 1}
        )
        if not user:
            return {"fallback": True}

        identity = user.get("sender_identity") or {}
        summary = user.get("ai_summary") or {}

        # Prefer ai_summary (richer, AI-written) but fall back to raw identity fields
        what_we_do = (
            summary.get("company_positioning")
            or identity.get("value_proposition")
            or identity.get("company_description")
            or ""
        )
        who_we_are = (
            summary.get("professional_identity")
            or identity.get("personal_bio")
            or ""
        )
        outreach_angles = summary.get("outreach_angles") or []
        target_audience = (
            summary.get("ideal_customer_profile")
            or identity.get("target_audience")
            or ""
        )
        company_name = (
            identity.get("company_name")
            or user.get("company_name")
            or ""
        )
        sender_name = identity.get("full_name") or user.get("full_name") or ""
        job_title = identity.get("job_title") or ""
        industry = identity.get("company_industry") or ""
        tagline = identity.get("company_tagline") or ""

        return {
            "fallback": False,
            "sender_name": sender_name,
            "job_title": job_title,
            "company_name": company_name,
            "industry": industry,
            "tagline": tagline,
            "what_we_do": what_we_do,
            "who_we_are": who_we_are,
            "outreach_angles": outreach_angles,
            "target_audience": target_audience,
        }
    except Exception as e:
        logger.warning(f"Could not fetch sender context for user {user_id}: {e}")
        return {"fallback": True}


_DURATION_WORD_COUNTS = {
    "short":  ("18–22",  "~8 seconds"),
    "medium": ("50–60",  "~20 seconds"),
    "long":   ("75–85",  "~30 seconds"),
}


def _build_system_message(ctx: dict, sender_mode: str = 'personal', target_duration: str = 'short') -> str:  # NOSONAR
    """Build a dynamic system prompt from the user's profile context."""
    word_range, spoken_time = _DURATION_WORD_COUNTS.get(target_duration, ("18–22", "~8 seconds"))

    if ctx.get("fallback"):
        return f"""You are a B2B marketing expert creating personalized short video ad scripts.
Your role is to write a punchy {word_range} word video dialogue ({spoken_time} when spoken aloud) for outreach to a prospect company.
It must hook immediately, reference a specific recent activity of the prospect, connect it to the sender's offer, and end with a call-to-action.
Return output strictly as JSON with keys: video_title, video_dialogue, social_caption."""

    sender = ctx.get("sender_name") or "our team"
    company = ctx.get("company_name") or DEFAULT_COMPANY
    job_title = ctx.get("job_title") or ""
    what = ctx.get("what_we_do") or "B2B solutions that drive growth"
    who = ctx.get("who_we_are") or ""
    tagline = ctx.get("tagline") or ""
    industry = ctx.get("industry") or ""
    angles = ctx.get("outreach_angles") or []
    audience = ctx.get("target_audience") or ""

    angles_block = ""
    if angles:
        angles_block = "\n    KEY OUTREACH ANGLES TO USE:\n"
        for a in angles:
            angles_block += f"    - {a}\n"

    audience_block = f"\n    TARGET AUDIENCE CONTEXT: {audience}" if audience else ""
    industry_block = f"\n    OUR INDUSTRY: {industry}" if industry else ""

    if sender_mode == 'company':
        # Brand voice — the company speaks, not the individual
        brand_desc = company
        if tagline:
            brand_desc += f" — {tagline}"

        return f"""You are a B2B marketing expert writing personalized video campaign scripts on behalf of {brand_desc}.

    WHAT WE OFFER: {what}
    {industry_block}
    {audience_block}
    {angles_block}

    CRITICAL REQUIREMENTS for the dialogue:
    - Dialogue: EXACTLY {word_range} words total ({spoken_time} when spoken aloud) — count every word, stay within the range
    - Written in first person as the company brand ("At {company}, we...", "We at {company}...")
    - Do NOT reference any individual by name — this is the company speaking as a brand
    - Hook immediately with a specific recent activity of the prospect
    - One clear value connection between our offer and their current situation
    - End with a single direct call-to-action line
    - Do NOT use generic AI/tech jargon unless it genuinely applies to our offer above
    - Title: under 60 characters
    - Caption: under 150 characters, LinkedIn-friendly with relevant hashtags

    Return output strictly as JSON with keys: video_title, video_dialogue, social_caption."""

    else:
        # Personal voice — the individual speaks
        sender_desc = f"{sender}" + (f", {job_title}" if job_title else "") + f" at {company}"
        if tagline:
            sender_desc += f" ({tagline})"
        who_block = f"\n    ABOUT THE SENDER: {who}" if who else ""

        return f"""You are a B2B marketing expert writing personalized video campaign scripts on behalf of {sender_desc}.

    WHAT WE OFFER: {what}
    {who_block}
    {industry_block}
    {audience_block}
    {angles_block}

    CRITICAL REQUIREMENTS for the dialogue:
    - Dialogue: EXACTLY {word_range} words total ({spoken_time} when spoken aloud) — count every word, stay within the range
    - Written in first person as {sender} ("Hi, I'm {sender}..." or similar warm opener)
    - Hook immediately with a specific recent activity of the prospect
    - One clear value connection between our offer and their current situation
    - End with a single direct call-to-action line
    - Do NOT use generic AI/tech jargon unless it genuinely applies to our offer above
    - Title: under 60 characters
    - Caption: under 150 characters, LinkedIn-friendly with relevant hashtags

    Return output strictly as JSON with keys: video_title, video_dialogue, social_caption."""


def generate_marketing_package(prompt: str, user_id: str, sender_mode: str = 'personal', target_duration: str = 'short') -> dict:
    """
    Uses Claude to generate a package with video dialogue, title, and caption.
    sender_mode: 'personal' (individual voice) or 'company' (brand voice)
    target_duration: 'short' | 'medium' | 'long' — controls word count
    """
    ctx = _get_sender_context(user_id)
    system_message = _build_system_message(ctx, sender_mode, target_duration)

    logger.info("Sending to Claude: prompt length=%d, preview=%s", len(prompt), prompt[:200])

    response = claude_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=system_message,
        messages=[
            {"role": "user", "content": f"Prompt: {prompt}\n\nRespond with valid JSON only."},
        ],
    )
    try:
        raw = response.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw.strip())
        logger.info("Claude response received: title=%s, dialogue_length=%d", result.get('video_title', 'N/A'), len(result.get('video_dialogue', '')))
        return result
    except Exception as e:
        logger.error("Failed to parse Claude response: %s", e)
        return {"error": "Failed to parse Claude response"}

def generate_intelligent_prompt_from_company_data(company_name: str, user_id: str, sender_mode: str = 'personal', target_duration: str = 'short') -> dict:  # NOSONAR
    """
    Generate an intelligent AI solutions marketing prompt based on comprehensive company data analysis from MongoDB
    """
    try:
        from utils.mongodb_service import mongodb_service

        # Get company data from MongoDB
        company_data = mongodb_service.get_company_by_name(company_name, user_id)

        if not company_data:
            # Fallback: create a basic campaign even without detailed data
            logger.warning("No detailed company data found for %s, creating basic campaign", company_name)
            _ctx = _get_sender_context(user_id)
            _offer = _ctx.get("what_we_do") or "our solutions"
            _our = _ctx.get("company_name") or DEFAULT_COMPANY
            basic_prompt = f"Create a personalized outreach campaign for {company_name} on behalf of {_our}. Our offer: {_offer}. Reference how we can help them streamline operations, grow, and solve their key business challenges."
            package = generate_marketing_package(basic_prompt, user_id, sender_mode, target_duration)
            package["source_data"] = {
                "company_name": company_name,
                "industry": "Technology",
                "hiring_signals": 0,
                "business_signals": 0,
                "social_signals": 0,
                "generated_prompt": basic_prompt,
                "news_categories": [],
                "social_platforms": [],
                "tech_stack": [],
                "specialties": [],
                "website_links": [],
                "news_links": []
            }
            return package

        # Extract relevant information
        company_info = company_data.get("company", {})
        news_data = company_data.get("news", {})
        social_data = company_data.get("social", [])

        # Basic company info
        company_name = company_info.get("company_name", company_name)
        industry = company_info.get("industry", "technology")
        company_size = company_info.get("size", "")
        website = company_info.get("website", "")
        linkedin_url = company_info.get("linkedin_url", "")

        # Extract tech stack and specialties from company description and other fields
        tech_stack = []
        specialties = []

        # Analyze company description for tech stack and specialties
        description = company_info.get("description", "")
        if description:
            # Common tech stack keywords
            tech_keywords = ["Python", "JavaScript", "Java", "React", "Node.js", "AWS", "Azure", "Docker", "Kubernetes",
                             "MongoDB", "PostgreSQL", "MySQL", "Redis", "GraphQL", "REST API", "Microservices",
                             "Machine Learning", "AI", "Artificial Intelligence", "Data Science", "Analytics",
                             "Cloud Computing", "DevOps", "CI/CD", "Agile", "Scrum", "Blockchain", "IoT",
                             "Mobile Development", "Web Development", "Full Stack", "Frontend", "Backend"]

            for tech in tech_keywords:
                if tech.lower() in description.lower():
                    tech_stack.append(tech)

            # Extract specialties (industry-specific terms)
            specialty_keywords = ["SaaS", "E-commerce", "Fintech", "Healthcare", "EdTech", "PropTech", "InsurTech",
                                  "Digital Marketing", "CRM", "ERP", "Business Intelligence", "Data Analytics",
                                  "Automation", "Integration", "API", "Platform", "Enterprise", "B2B", "B2C"]

            for specialty in specialty_keywords:
                if specialty.lower() in description.lower():
                    specialties.append(specialty)

        # Analyze hiring trends
        hiring_signals = []
        if _NEWS_RAPID_HIRING in news_data and news_data[_NEWS_RAPID_HIRING]:
            hiring_signals.append(f"rapid hiring ({len(news_data[_NEWS_RAPID_HIRING])} announcements)")

        # Analyze company news and signals
        business_signals = []
        if _NEWS_FUNDING_ROUNDS in news_data and news_data[_NEWS_FUNDING_ROUNDS]:
            business_signals.append(f"recently secured funding ({len(news_data[_NEWS_FUNDING_ROUNDS])} announcements)")
        if _NEWS_ANNOUNCEMENTS in news_data and news_data[_NEWS_ANNOUNCEMENTS]:
            business_signals.append(f"{len(news_data[_NEWS_ANNOUNCEMENTS])} major business announcements")
        if _NEWS_PRODUCT_LAUNCHES in news_data and news_data[_NEWS_PRODUCT_LAUNCHES]:
            business_signals.append(f"launching {len(news_data[_NEWS_PRODUCT_LAUNCHES])} new products/features")
        if _NEWS_LEADERSHIP_CHANGES in news_data and news_data[_NEWS_LEADERSHIP_CHANGES]:
            business_signals.append(f"leadership transitions ({len(news_data[_NEWS_LEADERSHIP_CHANGES])} changes)")
        if _NEWS_MERGERS in news_data and news_data[_NEWS_MERGERS]:
            business_signals.append(f"M&A activity ({len(news_data[_NEWS_MERGERS])} deals)")

        social_signals = []
        if social_data:
            platforms = {post.get("platform", "") for post in social_data if post.get("platform")}
            if platforms:
                social_signals.append(f"active on {', '.join(platforms)} ({len(social_data)} recent posts)")

        # Collect news article details
        news_links = []
        news_details = ""
        news_categories = {
            _NEWS_RAPID_HIRING: 3,
            _NEWS_FUNDING_ROUNDS: 2,
            _NEWS_ANNOUNCEMENTS: 2,
            _NEWS_PRODUCT_LAUNCHES: 2,
            _NEWS_LEADERSHIP_CHANGES: 2,
            _NEWS_MERGERS: 2,
            _NEWS_OTHER: 2,
        }
        for category, limit in news_categories.items():
            articles = (news_data.get(category) or [])[:limit]
            if articles:
                news_details += f"\n{category} ({company_name}):\n"
                for article in articles:
                    title = article.get('News Title', '')
                    source = article.get('Source', '')
                    link = article.get('Link', '')
                    if title:
                        news_details += f"  - {title}"
                        if source:
                            news_details += f" ({source})"
                        if link:
                            news_details += f" — {link}"
                            news_links.append(link)
                        news_details += "\n"

        social_details = ""
        if social_data:
            social_details = f"\nRecent Social Activity ({company_name}):\n"
            for post in social_data[:3]:
                platform = post.get("platform", "")
                content = (post.get("content") or "")[:150]
                if content:
                    social_details += f"  - {platform}: {content}...\n"

        website_links = [w for w in [website, linkedin_url] if w]

        # Build the final prompt — describe the TARGET company in detail,
        # let the system message (which has the SENDER's full profile) handle the connection
        final_prompt = """PROSPECT COMPANY: {company_name}
PROSPECT INDUSTRY: {industry}
{f'PROSPECT SIZE: {company_size}' if company_size else ''}

SENDER COMPANY: {our_company}
SENDER OFFER: {our_offer}
{f'SENDER INDUSTRY: {our_industry}' if our_industry else ''}

RECENT SIGNALS about {company_name}:"""

        if hiring_signals:
            final_prompt += f"\n  Hiring: {', '.join(hiring_signals)}"
        if business_signals:
            final_prompt += f"\n  Business: {', '.join(business_signals)}"
        if social_signals:
            final_prompt += f"\n  Social: {', '.join(social_signals)}"

        final_prompt += news_details
        final_prompt += social_details

        if website_links:
            final_prompt += f"\nProspect Web Presence: {', '.join(website_links)}\n"

        final_prompt += """
TASK: Write a compelling outreach dialogue FROM {our_company} TO {company_name}.

CRITICAL RULES:
1. Open by referencing a SPECIFIC recent activity of {company_name} listed above (news, hiring, product launch, social post)
2. Creatively bridge what {our_company} offers with what {company_name} needs RIGHT NOW given their recent activities
3. Even if the two companies are in different industries, find the genuine business opportunity (e.g., branded partnerships, cross-industry services, shared audiences, technology needs)
4. Be specific — mention their actual news/signals, not generic praise
5. Do NOT assume the sender is an AI company unless that is explicitly stated in the sender offer above
6. End with a clear, specific call-to-action to schedule a discovery call
7. The dialogue should feel like it was written by someone who genuinely follows {company_name}'s business"""

        # Generate the marketing package using the intelligent prompt as user_prompt
        package = generate_marketing_package(final_prompt, user_id, sender_mode, target_duration)

        # Add metadata about the data used
        package["source_data"] = {
            "company_name": company_name,
            "industry": industry,
            "hiring_signals": len(hiring_signals),
            "business_signals": len(business_signals),
            "social_signals": len(social_signals),
            "generated_prompt": final_prompt,
            "news_categories": list(news_data.keys()) if news_data else [],
            "social_platforms": list({post.get("platform", "") for post in social_data if post.get("platform")}) if social_data else [],
            "tech_stack": tech_stack,
            "specialties": specialties,
            "website_links": website_links,
            "news_links": news_links,
            "company_size": company_size
        }

        return package

    except Exception as e:
        logger.error("Error generating intelligent prompt: %s", e)
        _ctx = _get_sender_context(user_id)
        _offer = _ctx.get("what_we_do") or "our solutions"
        _our = _ctx.get("company_name") or DEFAULT_COMPANY
        return generate_marketing_package(f"Create a personalized outreach campaign for {company_name} on behalf of {_our}. Our offer: {_offer}. Help them grow and solve their key challenges.", user_id, sender_mode, target_duration)

def generate_marketing_package_from_linkedin(url: str, user_id: str) -> dict:
    company_info = extract_company_info(url)
    company_name = company_info.get("name", "the company")  # type: ignore
    industry = company_info.get("industry", "their industry")  # type: ignore
    user_prompt = f"Create a marketing package targeting {company_name} in the {industry} industry. Emphasize how our AI digital marketing firm can help them grow."
    package = generate_marketing_package(user_prompt, user_id)
    return package

def generate_video_for_package(package: dict):
    if "video_dialogue" in package:
        from utils.video import generate_video  # lazy import — moviepy may not be available
        video_result = generate_video(narration_text=package["video_dialogue"], logo_url="https://media.licdn.com/dms/image/v2/C560BAQHU8F8sB_tA4w/company-logo_200_200/company-logo_200_200/0/1630642915783/labware_logo?e=1762992000&v=beta&t=nZ8F1YtbflBg44K3TCGeO-SLNmVwTp_R2PIDgSurYqM")
        return video_result
    else:
        return {"error": "No video_dialogue found in package"}

if __name__ == "__main__":
    sample_url = "https://www.linkedin.com/company/tech-cloud-pro/"
    test_user_id = "test-user-123"
    package = generate_marketing_package_from_linkedin(sample_url, test_user_id)
    print(json.dumps({"marketing_package": package}, indent=2))
    video_result = generate_video_for_package(package)
    print(json.dumps({"video_result": video_result}, indent=2))
