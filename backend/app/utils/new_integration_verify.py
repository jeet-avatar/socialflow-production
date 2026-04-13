import logging
import requests
from typing import Tuple
import smtplib
import ssl
import certifi
logger = logging.getLogger(__name__)


class APIKeyVerifier:
    """Verifies API keys for various social media and video platforms"""

    def __init__(self):
        self.session = requests.Session()
        self.session.timeout = 30  # type: ignore

    def verify_gmail_smtp(self, email: str, password: str) -> Tuple[bool, str]:
        try:
            context = ssl.create_default_context(cafile=certifi.where())
            with smtplib.SMTP("smtp.gmail.com", 587) as server:
                server.starttls(context=context)
                server.login(email, password)
            return True, " Gmail SMTP login successful"
        except smtplib.SMTPAuthenticationError as e:
            return False, f"ERROR: Authentication failed: {e}"
        except Exception as e:
            return False, f"ERROR: SMTP connection error: {str(e)}"

    def verify_mailchimp_api_key(self, api_key: str) -> Tuple[bool, str]:
        """Verifies Mailchimp API key"""
        try:
            if '-' not in api_key:
                return False, "ERROR: Mailchimp API key format invalid (missing data center suffix)"
            parts = api_key.rsplit('-', 1)
            if len(parts) != 2 or not parts[1]:
                return False, "ERROR: Mailchimp API key format invalid (missing data center suffix)"
            dc = parts[1]
            url = f"https://{dc}.api.mailchimp.com/3.0/ping"
            response = self.session.get(url, auth=("anystring", api_key))
            if response.status_code == 200:
                return True, " Mailchimp API key is valid and responded successfully"
            elif response.status_code == 401:
                return False, "ERROR: Mailchimp API key is invalid or unauthorized"
            else:
                return False, f"ERROR: Mailchimp API verification failed with status {response.status_code}: {response.text}"
        except requests.exceptions.RequestException as e:
            return False, f"ERROR: Mailchimp API request failed: {str(e)}"
        except Exception as e:
            return False, f"ERROR: Mailchimp API verification error: {str(e)}"

    def verify_facebook_instagram_token(self, access_token: str) -> Tuple[bool, str]:
        """
        Verifies Facebook/Instagram access token and fetches Page ID
        and Instagram Business Account ID dynamically.
        """
        try:
            # Step 1: Verify token + get user
            me_resp = self.session.get(
                "https://graph.facebook.com/me",
                params={"access_token": access_token}
            )
            if me_resp.status_code != 200:
                return False, f"ERROR: Invalid token: {me_resp.text}"

            user = me_resp.json()
            user_name = user.get("name")
            user_id = user.get("id")

            # Step 2: Fetch pages the user has access to
            pages_resp = self.session.get(
                "https://graph.facebook.com/me/accounts",
                params={
                    "access_token": access_token,
                    "fields": "id,name,instagram_business_account"
                }
            )
            if pages_resp.status_code != 200:
                return False, f"ERROR: Failed to fetch Facebook Pages: {pages_resp.text}"

            pages = pages_resp.json().get("data", [])

            # Case 1: Token is valid but user has NO Facebook Pages
            if not pages:
                return False, (
                    "ERROR: Facebook token is valid, but no Facebook Pages are linked.\n"
                    "Reason: User is not an admin/editor of any Facebook Page."
                )

            output_lines = [
                " Facebook/Instagram token is valid.",
                f" User: {user_name or user_id}",
                ""
            ]

            has_instagram = False

            for page in pages:
                page_id = page.get("id")
                page_name = page.get("name")
                ig_account = page.get("instagram_business_account")

                output_lines.append(f" Facebook Page: {page_name}")
                output_lines.append(f"  - Page ID: {page_id}")

                # Case 2: Facebook Page exists but NO Instagram Business account linked
                if ig_account and ig_account.get("id"):
                    has_instagram = True
                    output_lines.append(
                        f"  - Instagram Business Account ID: {ig_account.get('id')}"
                    )
                else:
                    output_lines.append(
                        "  - Instagram Business Account ID: Not linked to this Page"
                    )

                output_lines.append("")

            # Case 3: Pages exist but NONE have Instagram linked
            if not has_instagram:
                output_lines.append(
                    " WARNING: No Instagram Business Account is linked to any of the above Pages."
                )

            return True, "\n".join(output_lines)

        except Exception as e:
            return False, f"ERROR: Facebook/Instagram verification error: {str(e)}"

    def verify_linkedin_access_token(self, access_token: str) -> Tuple[bool, str]:
        """
        Verifies LinkedIn OAuth2 access token using /v2/userinfo endpoint.
        This endpoint is compliant with LinkedIn's OpenID Connect flow.
        """
        try:
            url = "https://api.linkedin.com/v2/userinfo"
            params = {
                "oauth2_access_token": access_token
            }

            response = self.session.get(url, params=params)

            if response.status_code == 200:
                data = response.json()

                # Common fields returned by LinkedIn userinfo
                sub = data.get("sub")
                name = data.get("name")
                given_name = data.get("given_name")
                family_name = data.get("family_name")
                email = data.get("email")
                email_verified = data.get("email_verified")
                locale = data.get("locale")

                pretty_output = (
                    " LinkedIn access token is valid.\n"
                    f" User ID (sub): {sub}\n"
                    f" Full Name: {name}\n"
                    f" First Name: {given_name}\n"
                    f" Last Name: {family_name}\n"
                    f" Email: {email}\n"
                    f" Email Verified: {email_verified}\n"
                    f" Locale: {locale}"
                )

                return True, pretty_output

            elif response.status_code in (401, 403):
                return False, "ERROR: LinkedIn access token is invalid, expired, or lacks required scopes"

            else:
                return False, (
                    f"ERROR: LinkedIn token verification failed\n"
                    f"Status: {response.status_code}\n"
                    f"Response: {response.text}"
                )

        except Exception as e:
            return False, f"ERROR: LinkedIn token verification error: {str(e)}"

    def verify_youtube_client_id_secret(
        self,
        client_id: str,
        client_secret: str
    ) -> Tuple[bool, str]:
        """
        Verifies Google/YouTube OAuth Client ID & Client Secret ONLY.
        This checks whether the credentials are valid by calling the
        OAuth token endpoint with an intentionally invalid grant.

        IMPORTANT:
        - If client_id / client_secret are VALID → Google returns `invalid_grant`
        - If they are INVALID → Google returns `invalid_client`
        """
        try:
            resp = self.session.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "grant_type": "authorization_code",
                    "code": "INVALID_CODE_ON_PURPOSE",
                    "redirect_uri": "http://localhost"
                },
            )

            data = resp.json()
            error = data.get("error")

            if error == "invalid_grant":
                return True, " YouTube (Google) Client ID & Secret are valid."

            if error == "invalid_client":
                return False, "ERROR: Invalid YouTube Client ID or Client Secret."

            return False, (
                "ERROR: Unexpected response while verifying YouTube credentials\n"
                f"Status: {resp.status_code}\n"
                f"Response: {resp.text}"
            )

        except Exception as e:
            return False, f"ERROR: YouTube client verification error: {str(e)}"

verifier = APIKeyVerifier()

def main():
    """Example usage of API key verifiers"""
    verifier = APIKeyVerifier()

    # Example usage of Gmail SMTP verification (uncomment and replace with actual credentials)
    gmail_email = "socialflow.network@gmail.com"
    gmail_password = os.getenv("GMAIL_APP_PASSWORD", "")
    _, smtp_message = verifier.verify_gmail_smtp(gmail_email, gmail_password)
    logger.info("\n Starting Gmail SMTP Verification...\n")
    logger.info(" SMTP Verification Result:")
    logger.info("=" * 50)
    logger.info(smtp_message)

    # Example usage of Facebook/Instagram Graph API token verification
    fb_ig_access_token = os.getenv("FB_IG_ACCESS_TOKEN", "")
    if not fb_ig_access_token:
        logger.warning("FB_IG_ACCESS_TOKEN not set — skipping Facebook/Instagram verification")
        message = "Skipped: FB_IG_ACCESS_TOKEN env var not set"
    else:
        _, message = verifier.verify_facebook_instagram_token(fb_ig_access_token)
    logger.info("\n Starting Facebook/Instagram Graph API Token Verification...\n")
    logger.info(" Facebook/Instagram Token Verification Result:")
    logger.info("=" * 50)
    logger.info(message)

    # Example usage of LinkedIn access token verification using /v2/userinfo endpoint
    linkedin_access_token = os.getenv("LINKEDIN_ACCESS_TOKEN", "")
    logger.info("\n Starting LinkedIn Access Token Verification...\n")
    if not linkedin_access_token:
        logger.warning("LINKEDIN_ACCESS_TOKEN not set — skipping LinkedIn verification")
        linkedin_message = "Skipped: LINKEDIN_ACCESS_TOKEN env var not set"
    else:
        _, linkedin_message = verifier.verify_linkedin_access_token(linkedin_access_token)
    logger.info(" LinkedIn Token Verification Result:")
    logger.info("=" * 50)
    logger.info(linkedin_message)

    # Example usage of YouTube Client ID & Secret verification (NO refresh token)
    youtube_client_id = "YOUR_YOUTUBE_CLIENT_ID.apps.googleusercontent.com"
    youtube_client_secret = "YOUR_YOUTUBE_CLIENT_SECRET"

    logger.info("\n Starting YouTube Client ID & Secret Verification...\n")
    _, yt_client_message = verifier.verify_youtube_client_id_secret(
        youtube_client_id,
        youtube_client_secret
    )
    logger.info(" YouTube Client Credential Verification Result:")
    logger.info("=" * 50)
    logger.info(yt_client_message)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
