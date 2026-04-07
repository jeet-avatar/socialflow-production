#!/usr/bin/env python3
"""
Script to activate Professional subscriptions for specific users
Usage: python3 -m scripts.activate_subscribed_users
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

def activate_subscription(email: str, db):
    """Activate Professional subscription for a user"""
    
    users_collection = db['users']
    subscriptions_collection = db['subscriptions']
    
    # Find user by email
    user = users_collection.find_one({"email": email})
    
    if not user:
        print(f"❌ User not found with email: {email}")
        print("   Creating new user...")
        
        # Create new user
        new_user = {
            "email": email,
            "name": email.split('@')[0].title(),
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "is_active": True
        }
        
        result = users_collection.insert_one(new_user)
        user_id = str(result.inserted_id)
        print(f"✅ User created with ID: {user_id}")
    else:
        # Try to get user_id from different possible fields
        user_id = user.get('user_id') or user.get('supabase_user_id') or user.get('id') or str(user.get('_id'))
        print(f"✅ Found user: {email}")
        print(f"   User ID: {user_id}")
    
    # Calculate dates - 1 year subscription
    start_date = datetime.now(timezone.utc)
    end_date = start_date + timedelta(days=365)  # 1 year from now
    
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
        "stripe_subscription_id": f"sub_{user_id}_{int(start_date.timestamp())}",
        "stripe_customer_id": f"cus_{user_id}_{int(start_date.timestamp())}",
        "created_at": start_date,
        "updated_at": start_date,
        "notes": "Subscribed user - Professional plan"
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
    # Users to activate
    USERS_TO_ACTIVATE = [
        "visheshzyre@gmail.com",
        "jm@techcloudpro.com"
    ]
    
    print("=" * 60)
    print("🚀 Activating Professional Subscriptions")
    print("=" * 60)
    print()
    
    # Connect to MongoDB (with SSL cert verification disabled for local testing)
    client = MongoClient(MONGODB_URL, tlsAllowInvalidCertificates=True)
    db = client[MONGODB_DATABASE]
    
    results = {}
    
    for email in USERS_TO_ACTIVATE:
        print(f"\n📧 Processing: {email}")
        print("-" * 60)
        success = activate_subscription(email, db)
        results[email] = success
        print("-" * 60)
    
    # Summary
    print()
    print("=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)
    
    for email, success in results.items():
        status = "✅ SUCCESS" if success else "❌ FAILED"
        print(f"{status}: {email}")
    
    print()
    print("=" * 60)
    
    all_success = all(results.values())
    if all_success:
        print("✅ ALL SUBSCRIPTIONS ACTIVATED SUCCESSFULLY!")
        print()
        print("Users can now:")
        print("1. Login with their email")
        print("2. Access Professional plan features")
        print("3. Enjoy unlimited video generation")
        print("4. Connect unlimited platforms")
    else:
        print("⚠️  SOME SUBSCRIPTIONS FAILED!")
        print("Please check the errors above.")
    
    print("=" * 60)
    
    client.close()
