import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import logging

from utils.integrations_service import integrations_service
from utils.user_service import user_service

logger = logging.getLogger(__name__)


def _resolve_sender_company(user_id: str, sender_name: str) -> str:
    """Return company name from user profile, falling back to sender_name."""
    user_profile = user_service.get_user_by_supabase_id(user_id)
    if user_profile and user_profile.get('company_name'):
        name = user_profile['company_name']
        logger.info(f"✅ Found sender company name: {name}")
        return name
    logger.info(f"⚠️ No company name in profile, using sender name: {sender_name}")
    return sender_name


def _get_gmail_credentials(user_id: str) -> dict:
    """Return {'email': ..., 'password': ...} or {'error': ..., 'hint': ...}."""
    logger.info(f"🔍 Looking for Gmail integration for user: {user_id}")
    integration = integrations_service.get_integration(user_id, "gmail", decrypt=True)
    if not integration:
        logger.error(f"❌ No Gmail integration found for user: {user_id}")
        return {
            "error": "Gmail not configured. Please add your Gmail credentials in the Integrations tab.",
            "hint": "Go to Integrations → Gmail and add your email and app password",
        }
    credentials = integration.get('credentials', {})
    if not credentials:
        logger.error(f"❌ No credentials in Gmail integration for user: {user_id}")
        return {
            "error": "Gmail credentials not found. Please reconfigure Gmail in Integrations.",
            "hint": "Go to Integrations → Gmail and save your credentials again",
        }
    sender_email = credentials.get('email')
    app_password = credentials.get('appPassword')
    logger.info(f"📧 Credentials found - Email: {sender_email}, Password: {'*' * len(app_password) if app_password else 'None'}")
    if not sender_email or not app_password:
        logger.error(f"❌ Incomplete credentials - Email: {sender_email}, Password: {'Present' if app_password else 'Missing'}")
        return {
            "error": "Gmail credentials incomplete. Please check your email and app password.",
            "hint": "Go to Integrations → Gmail and verify your credentials",
        }
    return {"email": sender_email, "password": app_password}


def _build_email_message(
    sender_email: str,
    sender_company_name: str,
    recipient_email: str,
    subject: str,
    company_name: str,
    video_url: str,
) -> MIMEMultipart:
    """Build and return the MIME email message."""
    html = f"""
        <html>
          <head>
            <style>
              body {{
                margin: 0;
                padding: 0;
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                background-color: #f4f4f4;
              }}
              .email-container {{
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              }}
              .header {{
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 40px 20px;
                text-align: center;
                color: white;
              }}
              .header h1 {{
                margin: 0;
                font-size: 28px;
                font-weight: 600;
              }}
              .content {{
                padding: 40px 30px;
              }}
              .content p {{
                color: #555;
                line-height: 1.6;
                margin-bottom: 20px;
                font-size: 16px;
              }}
              .video-container {{
                margin: 30px 0;
                text-align: center;
                background-color: #f8f9fa;
                padding: 20px;
                border-radius: 8px;
              }}
              .cta-button {{
                display: inline-block;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-decoration: none;
                padding: 15px 40px;
                border-radius: 6px;
                font-weight: 600;
                font-size: 16px;
                margin: 20px 0;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
              }}
              .cta-button:hover {{
                box-shadow: 0 6px 16px rgba(102, 126, 234, 0.6);
              }}
              .video-link {{
                word-break: break-all;
                color: #667eea;
                font-size: 14px;
                margin-top: 15px;
              }}
              .footer {{
                background-color: #f8f9fa;
                padding: 20px;
                text-align: center;
                color: #888;
                font-size: 14px;
              }}
              .feature-list {{
                list-style: none;
                padding: 0;
                margin: 20px 0;
              }}
              .feature-list li {{
                padding: 10px 0;
                border-bottom: 1px solid #eee;
                color: #666;
              }}
              .feature-list li:last-child {{
                border-bottom: none;
              }}
              .highlight {{
                background-color: #fff3cd;
                padding: 15px;
                border-left: 4px solid #ffc107;
                margin: 20px 0;
                border-radius: 4px;
              }}
            </style>
          </head>
          <body>
            <div class="email-container">
              <!-- Header -->
              <div class="header">
                <h1>🤝 Collaboration Opportunity from {sender_company_name}</h1>
                <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">
                  Let's explore how we can work together
                </p>
              </div>

              <!-- Content -->
              <div class="content">
                <p>Hi {company_name} Team,</p>

                <p>
                  We at <strong>{sender_company_name}</strong> believe there's great potential for collaboration between
                  our companies. We've prepared a personalized video showcasing how we can work together.
                </p>

                <!-- Video Container -->
                <div class="video-container">
                  <p style="margin: 0 0 15px 0; color: #333; font-weight: 600;">
                    Please watch our collaboration proposal:
                  </p>
                  <a href="{video_url}" class="cta-button">
                    ▶️ Watch Video
                  </a>
                  <p class="video-link">
                    <small>Direct link: <a href="{video_url}" style="color: #667eea;">{video_url}</a></small>
                  </p>
                </div>

                <p style="margin-top: 30px;">
                  We believe our collaboration could bring mutual benefits and growth opportunities for both
                  <strong>{sender_company_name}</strong> and <strong>{company_name}</strong>.
                </p>

                <p style="margin-top: 20px;">
                  After watching the video, please check out the prospects of our potential collaboration.
                  We'd love to hear your thoughts and explore how we can work together.
                </p>

                <div style="background-color: #f0f7ff; padding: 20px; border-radius: 8px; margin: 30px 0;">
                  <p style="margin: 0; font-size: 16px; color: #333;">
                    <strong>📧 Ready to collaborate?</strong><br>
                    <span style="font-size: 14px; color: #666; line-height: 1.6;">
                      Please reply to this email to discuss collaboration opportunities.
                      We're excited to hear from you and explore how we can achieve great things together!
                    </span>
                  </p>
                </div>
              </div>

              <!-- Footer -->
              <div class="footer">
                <p style="margin: 0 0 10px 0;">
                  <strong>Campaign from {sender_company_name}</strong>
                </p>
                <p style="margin: 0; font-size: 12px;">
                  This personalized campaign was created for {company_name} using SocialFlow AI platform.
                </p>
              </div>
            </div>
          </body>
        </html>
        """

    plain_text = f"""
Collaboration Opportunity from {sender_company_name}

Hi {company_name} Team,

We at {sender_company_name} believe there's great potential for collaboration between our companies.
We've prepared a personalized video showcasing how we can work together.

Please watch our collaboration proposal: {video_url}

We believe our collaboration could bring mutual benefits and growth opportunities for both
{sender_company_name} and {company_name}.

After watching the video, please check out the prospects of our potential collaboration.
We'd love to hear your thoughts and explore how we can work together.

Ready to collaborate?
Please reply to this email to discuss collaboration opportunities.
We're excited to hear from you and explore how we can achieve great things together!

---
Campaign from {sender_company_name}
Created using SocialFlow AI platform
"""

    msg = MIMEMultipart("related")
    msg["From"] = f"{sender_company_name} <{sender_email}>"
    msg["To"] = recipient_email
    msg["Subject"] = subject

    msg_alternative = MIMEMultipart("alternative")
    msg.attach(msg_alternative)
    msg_alternative.attach(MIMEText(plain_text, "plain"))
    msg_alternative.attach(MIMEText(html, "html"))
    return msg


def _send_smtp(sender_email: str, app_password: str, recipient_email: str, msg: MIMEMultipart) -> dict:
    """Connect to Gmail SMTP, send msg, and return a result dict."""
    try:
        logger.info(f"📨 Connecting to Gmail SMTP for {recipient_email}...")
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        logger.info(f"📨 Logging in with {sender_email}...")
        server.login(sender_email, app_password.replace(' ', ''))
        server.sendmail(sender_email, recipient_email, msg.as_string())
        server.quit()
        logger.info(f" Email sent successfully to {recipient_email}")
        return {
            "success": True,
            "message": f"Email sent successfully to {recipient_email}",
            "recipient": recipient_email,
        }
    except smtplib.SMTPAuthenticationError as e:
        logger.error(f"ERROR: SMTP Authentication failed: {e}")
        return {"success": False, "error": "Email authentication failed. Please check email credentials.", "details": str(e)}
    except smtplib.SMTPException as e:
        logger.error(f"ERROR: SMTP Error: {e}")
        return {"success": False, "error": "Failed to send email via SMTP", "details": str(e)}
    except Exception as e:
        logger.error(f"ERROR: Failed to send email: {e}")
        return {"success": False, "error": str(e), "details": "Unexpected error occurred while sending email"}


def send_video_email(
    recipient_email: str,
    video_url: str,
    subject: str | None = None,
    company_name: str = "Client",
    sender_name: str = "SocialFlow AI",
    user_id: str | None = None,
    sender_company_name: str | None = None,
) -> dict:
    """
    Send a professional email with video link.

    Args:
        recipient_email: Recipient's email address
        video_url: URL of the generated video
        subject: Email subject line
        company_name: Name of the company the video is for (recipient company)
        sender_name: Name to display as sender
        user_id: User ID to get Gmail credentials from integrations
        sender_company_name: Name of the sender's company (optional, will fetch from profile if not provided)

    Returns:
        dict: Success status and message
    """
    if not user_id:
        logger.error("❌ No user_id provided to send_video_email")
        return {"success": False, "error": "User ID is required to send email"}

    if not sender_company_name:
        sender_company_name = _resolve_sender_company(user_id, sender_name)

    creds = _get_gmail_credentials(user_id)
    if "error" in creds:
        return {"success": False, **creds}

    sender_email = creds["email"]
    app_password = creds["password"]

    logger.info(f"📧 Using Gmail: {sender_email}")
    logger.info(f"📝 Subject received: '{subject}'")
    logger.info(f"🏢 Sender company: {sender_company_name}")
    logger.info(f"🏢 Target company: {company_name}")

    if not subject:
        subject = f"Collaboration Opportunity from {sender_company_name} to {company_name}"
        logger.info(f"✅ Using collaborative subject: {subject}")

    msg = _build_email_message(sender_email, sender_company_name, recipient_email, subject, company_name, video_url)
    return _send_smtp(sender_email, app_password, recipient_email, msg)
