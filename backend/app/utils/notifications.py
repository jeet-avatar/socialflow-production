"""
Platform-level transactional email notifications.
Uses the platform's own SMTP credentials (env vars), NOT the user's Gmail integration.
"""
import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime

logger = logging.getLogger(__name__)

_SMTP_HOST     = os.getenv("SMTP_HOST", "smtp.gmail.com")
_SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
_SMTP_USER     = os.getenv("SMTP_USER", "")
_SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
_FROM_NAME     = "SocialFlow"
_BRAND_COLOR   = "#3b82f6"

# ---------------------------------------------------------------------------
# Shared HTML helpers
# ---------------------------------------------------------------------------

def _wrap_html(title: str, body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#080a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080a0f;padding:48px 16px 64px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

        <!-- Logo bar -->
        <tr>
          <td style="padding-bottom:28px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:linear-gradient(135deg,#1d4ed8,#0ea5e9);border-radius:10px;padding:8px 14px;">
                  <span style="font-size:15px;font-weight:800;color:#fff;letter-spacing:-0.3px;">⚡ SocialFlow</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#0f1117;border-radius:20px;border:1px solid rgba(255,255,255,0.07);overflow:hidden;">

            <!-- Top accent line -->
            <tr>
              <td style="background:linear-gradient(90deg,#1d4ed8,#0ea5e9,#06b6d4);height:3px;font-size:0;line-height:0;">&nbsp;</td>
            </tr>

            <!-- Title band -->
            <tr>
              <td style="padding:32px 36px 24px;">
                <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.4px;line-height:1.3;">{title}</p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:0 36px 36px;">
                {body_html}
              </td>
            </tr>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:28px 4px 0;">
            <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);line-height:1.7;text-align:center;">
              This is an automated notification from SocialFlow.<br>
              If you did not expect this, you can safely ignore it.<br>
              &copy; {datetime.now().year} SocialFlow &nbsp;·&nbsp; <a href="https://socialflow.network" style="color:rgba(255,255,255,0.25);text-decoration:none;">socialflow.network</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _p(text: str, muted: bool = False) -> str:
    color = "rgba(255,255,255,0.38)" if muted else "rgba(255,255,255,0.70)"
    return f'<p style="margin:0 0 18px;font-size:15px;color:{color};line-height:1.7;">{text}</p>'


def _badge(text: str, color: str = _BRAND_COLOR) -> str:
    return (
        f'<span style="display:inline-block;padding:5px 14px;border-radius:99px;'
        f'background:{color}18;border:1px solid {color}35;'
        f'color:{color};font-size:12px;font-weight:700;letter-spacing:0.02em;">{text}</span>'
    )


def _info_block(rows: list[tuple[str, str]]) -> str:
    cells = "".join(
        f'<tr>'
        f'<td style="padding:10px 16px;font-size:12px;color:rgba(255,255,255,0.30);'
        f'width:110px;border-bottom:1px solid rgba(255,255,255,0.04);white-space:nowrap;">{k}</td>'
        f'<td style="padding:10px 16px;font-size:13px;color:rgba(255,255,255,0.72);'
        f'font-weight:600;border-bottom:1px solid rgba(255,255,255,0.04);">{v}</td>'
        f'</tr>'
        for k, v in rows
    )
    return (
        f'<table width="100%" cellpadding="0" cellspacing="0" '
        f'style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);'
        f'border-radius:12px;overflow:hidden;margin:0 0 22px;">'
        f'{cells}</table>'
    )


# ---------------------------------------------------------------------------
# Low-level send
# ---------------------------------------------------------------------------

def _send(to_email: str, subject: str, html: str, plain: str) -> dict:
    if not _SMTP_USER or not _SMTP_PASSWORD:
        logger.warning("SMTP_USER / SMTP_PASSWORD not configured — skipping notification email")
        return {"success": False, "error": "SMTP not configured"}
    try:
        msg = MIMEMultipart("alternative")
        msg["From"]    = f"{_FROM_NAME} <{_SMTP_USER}>"
        msg["To"]      = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(html,  "html"))

        with smtplib.SMTP(_SMTP_HOST, _SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(_SMTP_USER, _SMTP_PASSWORD.replace(" ", ""))
            server.sendmail(_SMTP_USER, to_email, msg.as_string())

        logger.info(f"✅ Notification sent to {to_email}: {subject}")
        return {"success": True}
    except smtplib.SMTPAuthenticationError as e:
        logger.error(f"❌ SMTP auth failed: {e}")
        return {"success": False, "error": "SMTP authentication failed"}
    except Exception as e:
        logger.error(f"❌ Notification send failed: {e}")
        return {"success": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Public notification functions
# ---------------------------------------------------------------------------

def send_login_notification(email: str, name: str = "") -> dict:
    """Send a 'successful sign-in' notification to the user."""
    display = name or email.split("@")[0]
    now     = datetime.now().strftime("%B %d, %Y at %I:%M %p")

    body = (
        _p(f"Hi <strong style='color:#fff;'>{display}</strong>,")
        + _p("You have successfully signed in to your SocialFlow account.")
        + _info_block([
            ("Account",   email),
            ("Time",      now),
            ("Platform",  "SocialFlow AI"),
        ])
        + _p(
            "If this was you, no action is needed. If you did not sign in, please "
            "<a href='https://socialflow.network/reset-password' "
            "style='color:#3b82f6;text-decoration:none;font-weight:600;'>reset your password</a> immediately.",
            muted=True,
        )
    )

    html  = _wrap_html("Sign-in Notification", body)
    plain = (
        f"Hi {display},\n\n"
        f"You have successfully signed in to your SocialFlow account.\n\n"
        f"Account: {email}\nTime: {now}\n\n"
        f"If this was not you, please reset your password at https://socialflow.network/reset-password\n\n"
        f"— The SocialFlow Team"
    )
    return _send(email, "Successful Sign-in to SocialFlow", html, plain)


_PRO_FEATURES = [
    "Unlimited AI company analyses",
    "Advanced lead scoring & enrichment",
    "AI video generation (HeyGen + ElevenLabs)",
    "Multi-platform campaign scheduling",
    "Priority support",
]

_PLAN_FEATURES = {
    "Professional": _PRO_FEATURES,
    "Premium":      _PRO_FEATURES,
    "Enterprise": [
        "Everything in Professional",
        "Custom AI model training",
        "Dedicated account manager",
        "SLA guarantees",
        "White-label options",
    ],
}


def send_plan_upgrade_notification(email: str, name: str = "", plan: str = "Professional") -> dict:
    """Send a plan upgrade confirmation email to the user."""
    display = name or email.split("@")[0]
    now     = datetime.now().strftime("%B %d, %Y")

    features = _PLAN_FEATURES.get(plan, _PRO_FEATURES)
    feature_items = "".join(
        f'<li style="padding:5px 0;font-size:14px;color:rgba(255,255,255,0.65);">✓ {f}</li>'
        for f in features
    )

    body = (
        _p(f"Hi <strong style='color:#fff;'>{display}</strong>,")
        + _p(f"Congratulations! Your SocialFlow account has been upgraded to the "
             f"<strong style='color:#fff;'>{plan}</strong> plan.")
        + _info_block([
            ("Plan",       plan),
            ("Activated",  now),
            ("Account",    email),
        ])
        + f'<p style="margin:20px 0 8px;font-size:13px;font-weight:600;color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:.05em;">What\'s included</p>'
        + f'<ul style="margin:0;padding-left:0;list-style:none;">{feature_items}</ul>'
        + '<br>'
        + _p(
            f'<a href="https://socialflow.network/dashboard" '
            f'style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#1d4ed8,#0ea5e9);'
            f'color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">'
            f'Go to Dashboard →</a>'
        )
    )

    html  = _wrap_html(f"Welcome to {plan}!", body)
    plain = (
        f"Hi {display},\n\n"
        f"Your SocialFlow account has been upgraded to the {plan} plan!\n\n"
        f"Plan: {plan}\nActivated: {now}\nAccount: {email}\n\n"
        f"Included features:\n" + "\n".join(f"  • {f}" for f in features) + "\n\n"
        f"Visit your dashboard: https://socialflow.network/dashboard\n\n"
        f"— The SocialFlow Team"
    )
    return _send(email, f"Your SocialFlow plan has been upgraded to {plan}!", html, plain)


def send_plan_reminder_notification(email: str, name: str = "", plan: str = "Professional") -> dict:
    """Send a reminder email to existing paid-plan users about their current plan benefits."""
    display = name or email.split("@")[0]

    features = _PLAN_FEATURES.get(plan, _PRO_FEATURES)
    feature_items = "".join(
        f'<li style="padding:5px 0;font-size:14px;color:rgba(255,255,255,0.65);">✓ {f}</li>'
        for f in features
    )

    body = (
        _p(f"Hi <strong style='color:#fff;'>{display}</strong>,")
        + _p(f"Just a reminder — you're on the <strong style='color:#fff;'>{plan}</strong> plan "
             f"on SocialFlow. Here's everything you have access to:")
        + f'<ul style="margin:0 0 20px;padding-left:0;list-style:none;">{feature_items}</ul>'
        + _p(
            "Make the most of your plan by exploring all the features in your dashboard.",
            muted=True,
        )
        + _p(
            f'<a href="https://socialflow.network/dashboard" '
            f'style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#1d4ed8,#0ea5e9);'
            f'color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">'
            f'Go to Dashboard →</a>'
        )
    )

    html  = _wrap_html(f"Your {plan} Plan Benefits", body)
    plain = (
        f"Hi {display},\n\n"
        f"Just a reminder — you're on the {plan} plan on SocialFlow.\n\n"
        f"Here's what's included:\n" + "\n".join(f"  • {f}" for f in features) + "\n\n"
        f"Visit your dashboard: https://socialflow.network/dashboard\n\n"
        f"— The SocialFlow Team"
    )
    return _send(email, f"Your SocialFlow {plan} Plan — Here's What You Have Access To", html, plain)


def send_password_reset_notification(email: str, name: str = "") -> dict:
    """Send a password reset request security notice to the user."""
    display = name or email.split("@")[0]
    now     = datetime.now().strftime("%B %d, %Y at %I:%M %p")

    body = (
        _p(f"Hi <strong style='color:#fff;'>{display}</strong>,")
        + _p("We received a request to reset the password for your SocialFlow account.")
        + _info_block([
            ("Account",  email),
            ("Time",     now),
        ])
        + _p(
            "A password reset link has been sent separately. The link will expire in 24 hours.",
            muted=True,
        )
        + _p(
            "If you did not request a password reset, your account may be at risk. "
            "Please contact us immediately at "
            "<a href='mailto:support@socialflow.network' style='color:#3b82f6;'>support@socialflow.network</a>.",
            muted=True,
        )
    )

    html  = _wrap_html("Password Reset Requested", body)
    plain = (
        f"Hi {display},\n\n"
        f"We received a request to reset the password for your SocialFlow account.\n\n"
        f"Account: {email}\nTime: {now}\n\n"
        f"A password reset link has been sent separately. The link expires in 24 hours.\n\n"
        f"If you did not request this, contact us at support@socialflow.network\n\n"
        f"— The SocialFlow Team"
    )
    return _send(email, "SocialFlow — Password Reset Requested", html, plain)
