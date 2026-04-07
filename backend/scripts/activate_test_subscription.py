#!/usr/bin/env python3
"""
Script to activate a Professional subscription for a test user
Usage: python3 -m scripts.activate_test_subscription
"""

import os
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# MongoDB configuration
MONGODB_USERNAME = os.getenv('MONGODB_USERNAME', 'jm_db_user')
MONGODB_PASSWORD = os.getenv('MONGODB_PASSWORD')
MONGODB_CLUSTER = os.getenv('MONGODB_CLUSTER', 'socialflow.f2ucauv.mongodb.net')
MONGODB_DATABASE = os.getenv('MONGODB_DATABASE', 'socialflow')

# Build MongoDB URL
if MONGODB_PASSWORD:
    MONGODB_URL = f"mongodb+srv://{MONGODB_USERNAME}:{MONGODB_PASSWORD}@{MONGODB_CLUSTER}/?retryWrites=true&w=majority"
else:
    MONGODB_URL = f"mongodb+srv://{MONGODB_CLUSTER}/?retryWrites=true&w=majority"

def activate_subscription(email: str):
    """Activate Professional subscription for a user"""
    
    # Connect to MongoDB (with SSL cert verification disabled for local testing)
    client = MongoClient(MONGODB_URL, tlsAllowInvalidCertificates=True)
    db = client[MONGODB_DATABASE]
    
    users_collection = db['users']
    subscriptions_collection = db['subscriptions']
    
    # Find user by email
    user = users_collection.find_one({"email": email})
    
    if not user:
        print(f"❌ User not found with email: {email}")
        return False
    
    # Try to get user_id from different possible fields
    user_id = user.get('user_id') or user.get('supabase_user_id') or user.get('id')
    mongodb_id = str(user.get('_id'))
    
    print(f"✅ Found user: {email}")
    print(f"   Available fields: {list(user.keys())}")
    
    if not user_id:
        print("⚠️  No user_id field found, using MongoDB ID")
        user_id = mongodb_id
    
    print(f"   Using User ID: {user_id}")
    
    # Calculate dates
    start_date = datetime.now(timezone.utc)
    end_date = start_date + timedelta(days=30)  # 30 days from now
    
    # Create or update subscription
    subscription_data = {
        "user_id": user_id,
        "plan": "professional",
        "status": "active",
        "price": 49.00,
        "currency": "USD",
        "billing_cycle": "monthly",
        "start_date": start_date,
        "current_period_start": start_date,
        "current_period_end": end_date,
        "cancel_at_period_end": False,
        "stripe_subscription_id": f"test_sub_{user_id}",
        "stripe_customer_id": f"test_cus_{user_id}",
        "created_at": start_date,
        "updated_at": start_date
    }
    
    # Upsert subscription
    result = subscriptions_collection.update_one(
        {"user_id": user_id},
        {"$set": subscription_data},
        upsert=True
    )
    
    if result.modified_count > 0 or result.upserted_id:
        print("✅ Subscription activated successfully!")
        print("   Plan: Professional")
        print("   Status: Active")
        print("   Price: $49/month")
        print(f"   Start Date: {start_date.strftime('%Y-%m-%d')}")
        print(f"   End Date: {end_date.strftime('%Y-%m-%d')}")
        print("   Cancel at Period End: False")
        
        # Also update user profile
        users_collection.update_one(
            {"email": email},
            {
                "$set": {
                    "subscription_plan": "professional",
                    "subscription_status": "active",
                    "updated_at": start_date
                }
            }
        )
        print("✅ User profile updated")

        return True
    else:
        print("❌ Failed to activate subscription")
        return False

if __name__ == "__main__":
    # Test user email
    TEST_EMAIL = "saiprabhukalva@outlook.com"
    
    print("=" * 60)
    print("🚀 Activating Professional Subscription")
    print("=" * 60)
    print(f"Email: {TEST_EMAIL}")
    print()
    
    success = activate_subscription(TEST_EMAIL)
    
    print()
    print("=" * 60)
    if success:
        print("✅ SUBSCRIPTION ACTIVATION COMPLETE!")
        print()
        print("You can now:")
        print("1. Login with this email")
        print("2. Go to User Profile/Settings")
        print("3. See the subscription details")
        print("4. Test the cancellation feature")
    else:
        print("❌ SUBSCRIPTION ACTIVATION FAILED!")
    print("=" * 60)
