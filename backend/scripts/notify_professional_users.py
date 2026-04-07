"""
One-time script: send "upgraded to Premium" email to all Professional plan users.

Run from the backend/ directory:
    source venv/bin/activate
    python scripts/notify_professional_users.py
"""
import sys
import os

# Make sure app/ imports resolve
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from utils.mongodb_service import mongodb_service
from utils.notifications import send_plan_reminder_notification

def main():
    mongodb_service.connect()
    users_col = mongodb_service.db['users']

    # Find all Professional plan users who have an email
    query = {
        "subscription_plan": {"$in": ["professional", "Professional"]},
        "email": {"$exists": True, "$ne": ""},
    }
    users = list(users_col.find(query, {"email": 1, "full_name": 1, "subscription_plan": 1}))

    if not users:
        print("No Professional plan users found.")
        return

    print(f"Found {len(users)} Professional plan user(s). Sending emails...\n")

    success_count = 0
    fail_count = 0

    for user in users:
        email = user.get("email", "")
        name  = user.get("full_name", "")
        if not email:
            continue

        result = send_plan_reminder_notification(email=email, name=name, plan="Professional")

        if result.get("success"):
            print(f"  ✅  {email}")
            success_count += 1
        else:
            print(f"  ❌  {email}  — {result.get('error', 'unknown error')}")
            fail_count += 1

    print(f"\nDone. {success_count} sent, {fail_count} failed.")

if __name__ == "__main__":
    main()
