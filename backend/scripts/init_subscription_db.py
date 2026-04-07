#!/usr/bin/env python3
"""
Database Initialization Script for Subscription System
Run this script to set up MongoDB collections and indexes for the subscription system
"""

import sys
import os
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient, ASCENDING, DESCENDING
from dotenv import load_dotenv

# Add parent directory to path to import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables
load_dotenv()

_INDEX_ALREADY_EXISTS = "already exists"
_INDEX_SKIP_MSG = "     (Index already exists, skipping)"


def _create_safe_index(collection, index_spec, unique=False):
    """Create an index, ignoring conflicts if it already exists."""
    try:
        collection.create_index(index_spec, unique=unique)
    except Exception as e:
        if _INDEX_ALREADY_EXISTS in str(e) or "IndexKeySpecsConflict" in str(e):
            print(_INDEX_SKIP_MSG)
        else:
            raise


def _setup_subscriptions_collection(db):
    """Create subscriptions collection with indexes."""
    print("\n📦 Setting up 'subscriptions' collection...")
    subscriptions = db['subscriptions']

    print("  ├─ Creating index: user_id (unique)")
    subscriptions.create_index([("user_id", ASCENDING)], unique=True)
    print("  ├─ Creating index: stripe_customer_id")
    subscriptions.create_index([("stripe_customer_id", ASCENDING)])
    print("  ├─ Creating index: stripe_subscription_id")
    subscriptions.create_index([("stripe_subscription_id", ASCENDING)])
    print("  ├─ Creating index: status")
    subscriptions.create_index([("status", ASCENDING)])
    print("  ├─ Creating index: plan")
    subscriptions.create_index([("plan", ASCENDING)])
    print("  └─ Creating index: current_period_end")
    subscriptions.create_index([("current_period_end", ASCENDING)])
    print("  ✅ Subscriptions collection ready!")

    return subscriptions


def _setup_usage_tracking_collection(db):
    """Create usage_tracking collection with indexes."""
    print("\n📊 Setting up 'usage_tracking' collection...")
    usage_tracking = db['usage_tracking']

    print("  ├─ Creating compound index: user_id + period_start")
    _create_safe_index(
        usage_tracking,
        [("user_id", ASCENDING), ("period_start", ASCENDING)],
        unique=True,
    )
    print("  ├─ Creating index: period_start")
    _create_safe_index(usage_tracking, [("period_start", DESCENDING)])
    print("  └─ Creating index: period_end")
    _create_safe_index(usage_tracking, [("period_end", ASCENDING)])
    print("  ✅ Usage tracking collection ready!")

    return usage_tracking


def _seed_free_plans(subscriptions, users_collection):
    """Seed default free plans for all users without a subscription."""
    print("\n🌱 Seeding default free plans for existing users...")
    users = list(users_collection.find({}, {"_id": 1, "email": 1}))
    print(f"  Found {len(users)} users in database")

    seeded_count = 0
    skipped_count = 0

    for user in users:
        user_id = str(user["_id"])
        if subscriptions.find_one({"user_id": user_id}):
            print(f"  ⏭️  Skipping {user.get('email', user_id)} - already has subscription")
            skipped_count += 1
            continue

        now = datetime.now(timezone.utc)
        subscriptions.insert_one({
            "user_id": user_id,
            "plan": "free",
            "status": "active",
            "price": 0.00,
            "currency": "USD",
            "billing_cycle": "monthly",
            "current_period_start": now,
            "current_period_end": now + timedelta(days=30),
            "cancel_at_period_end": False,
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
            "created_at": now,
            "updated_at": now,
        })
        print(f"  ✅ Created free plan for {user.get('email', user_id)}")
        seeded_count += 1

    print("\n  📊 Summary:")
    print(f"     ├─ Seeded: {seeded_count} users")
    print(f"     └─ Skipped: {skipped_count} users (already had subscriptions)")


def _setup_test_user(subscriptions, users_collection):
    """Set up a permanent professional subscription for the test user."""
    print("\n🎯 Setting up permanent professional subscriber for testing...")
    test_email = "meghanajmr1@gmail.com"

    test_user = users_collection.find_one({"email": test_email})
    if not test_user:
        print(f"  ⚠️  Test user {test_email} not found in database")
        print("  ℹ️  User will be set up when they first log in")
        return

    user_id = str(test_user["_id"])
    print(f"  ✅ Found test user: {test_email} (ID: {user_id})")

    now = datetime.now(timezone.utc)
    permanent_end = now + timedelta(days=365 * 100)

    result = subscriptions.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "plan": "professional",
            "status": "active",
            "price": 0.00,
            "currency": "USD",
            "billing_cycle": "lifetime",
            "current_period_start": now,
            "current_period_end": permanent_end,
            "cancel_at_period_end": False,
            "stripe_customer_id": "test_customer_meghana",
            "stripe_subscription_id": "test_sub_meghana_permanent",
            "created_at": now,
            "updated_at": now,
            "notes": "PERMANENT TEST USER - DO NOT DELETE - HARDCODED PROFESSIONAL SUBSCRIBER",
        }},
        upsert=True,
    )

    action = "Created" if result.upserted_id else "Updated to"
    print(f"  ✅ {action} PERMANENT Professional subscription for {test_email}")
    print("  💎 Plan: Professional (Lifetime)")
    print(f"  📅 Expires: {permanent_end.strftime('%Y-%m-%d')} (100 years!)")
    print("  ⚠️  This user has UNLIMITED access for testing")


def _verify_setup(subscriptions, usage_tracking):
    """Print verification counts and index information."""
    print("\n🔍 Verifying database setup...")
    print(f"  ├─ Subscriptions: {subscriptions.count_documents({})} documents")
    print(f"  └─ Usage tracking: {usage_tracking.count_documents({})} documents")

    print("\n📋 Subscriptions indexes:")
    for index in subscriptions.list_indexes():
        print(f"  ├─ {index['name']}: {index['key']}")

    print("\n📋 Usage tracking indexes:")
    for index in usage_tracking.list_indexes():
        print(f"  ├─ {index['name']}: {index['key']}")

    print("\n🧪 Testing sample queries...")
    print(f"  ├─ Free users: {subscriptions.count_documents({'plan': 'free'})}")
    print(f"  ├─ Professional users: {subscriptions.count_documents({'plan': 'professional'})}")
    print(f"  └─ Active subscriptions: {subscriptions.count_documents({'status': 'active'})}")


def init_subscription_database():
    """Initialize subscription database collections and indexes"""

    mongodb_uri = os.getenv("MONGODB_URI", "mongodb://vibingworld.com:27017/socialflow")
    print(f"🔌 Connecting to MongoDB: {mongodb_uri}")

    client = MongoClient(mongodb_uri, tlsAllowInvalidCertificates=True)

    if "mongodb+srv://" in mongodb_uri or "mongodb://" in mongodb_uri:
        db_name = os.getenv("MONGODB_DB_NAME", "socialflow")
    else:
        db_name = mongodb_uri.split("/")[-1].split("?")[0]

    if not db_name:
        db_name = "socialflow"

    db = client[db_name]
    print(f"📊 Database: {db_name}")

    subscriptions = _setup_subscriptions_collection(db)
    usage_tracking = _setup_usage_tracking_collection(db)
    users_collection = db['users']

    _seed_free_plans(subscriptions, users_collection)
    _setup_test_user(subscriptions, users_collection)
    _verify_setup(subscriptions, usage_tracking)

    print("\n✅ Database initialization complete!")
    print("\n" + "="*60)
    print("📚 SETUP SUMMARY:")
    print("="*60)
    print("1. ✅ Database collections created")
    print("2. ✅ Indexes created for optimal performance")
    print("3. ✅ Existing users seeded with free plans")
    print("4. ✅ Test user (meghanajmr1@gmail.com) set as PERMANENT Professional")
    print("\n🎯 TEST USER DETAILS:")
    print("="*60)
    print("Email: meghanajmr1@gmail.com")
    print("Plan: Professional (Lifetime)")
    print("Status: Active")
    print("Expires: 100 years from now")
    print("Features:")
    print("  ✅ Unlimited video generation")
    print("  ✅ Unlimited platform connections")
    print("  ✅ Unlimited API calls")
    print("  ✅ Up to 5 team members")
    print("\n📚 NEXT STEPS:")
    print("="*60)
    print("1. ⚠️  TODO: Configure Stripe webhook URL")
    print("   → URL: https://your-domain.com/api/subscription/webhook")
    print("\n2. ⚠️  TODO: Test Stripe payment flow")
    print("   → Make a test payment and verify webhook")
    print("\n3. ⚠️  TODO: Monitor usage limits")
    print("   → Check logs for limit enforcement")
    print("="*60)

    client.close()


if __name__ == "__main__":
    print("="*60)
    print("🚀 SUBSCRIPTION SYSTEM DATABASE INITIALIZATION")
    print("="*60)

    try:
        init_subscription_database()
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
