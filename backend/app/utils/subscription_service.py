"""
Subscription service for managing user subscriptions and usage limits
"""
from datetime import datetime, timezone
from typing import Optional, Dict
import logging
from utils.mongodb_service import mongodb_service


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)

logger = logging.getLogger(__name__)

class SubscriptionService:
    def __init__(self):
        self.db = None
        self.subscriptions_collection = None
        self.usage_collection = None

    def _ensure_connection(self):
        """Ensure database connection is established"""
        if self.db is None:
            self.db = mongodb_service.get_database()
            self.subscriptions_collection = self.db['subscriptions']
            self.usage_collection = self.db['usage_tracking']

            # Create indexes
            self.subscriptions_collection.create_index("user_id", unique=True)
            self.subscriptions_collection.create_index("stripe_subscription_id")
            self.usage_collection.create_index([("user_id", 1), ("period_start", 1)])

    # Prices by plan id — kept in sync with PLAN_CATALOG in subscription_routes.py
    _PLAN_PRICES = {"starter": 29, "creator": 79, "agency": 199}

    def create_subscription(self, user_id: str, stripe_data: Dict, plan: str = "starter") -> Dict:
        """Create or update subscription after successful payment"""
        self._ensure_connection()

        price = self._PLAN_PRICES.get(plan, self._PLAN_PRICES["starter"])
        subscription_data = {
            "user_id": user_id,
            "stripe_customer_id": stripe_data.get("customer"),
            "stripe_subscription_id": stripe_data.get("id"),
            "plan": plan,
            "status": "active",
            "price": price,
            "currency": "USD",
            "billing_cycle": "monthly",
            "current_period_start": datetime.fromtimestamp(stripe_data.get("current_period_start", 0)),
            "current_period_end": datetime.fromtimestamp(stripe_data.get("current_period_end", 0)),
            "cancel_at_period_end": False,
            "created_at": _utcnow(),
            "updated_at": _utcnow()
        }

        # Upsert subscription
        self.subscriptions_collection.update_one(
            {"user_id": user_id},
            {"$set": subscription_data},
            upsert=True
        )

        logger.info(f"Subscription created/updated for user {user_id}: {plan} plan (${price})")
        return subscription_data

    def get_subscription(self, user_id: str) -> Optional[Dict]:
        """Get user's subscription"""
        self._ensure_connection()
        return self.subscriptions_collection.find_one({"user_id": user_id})

    def update_subscription_status(self, stripe_subscription_id: str, status: str) -> bool:
        """Update subscription status"""
        self._ensure_connection()

        update_result = self.subscriptions_collection.update_one(
            {"stripe_subscription_id": stripe_subscription_id},
            {
                "$set": {
                    "status": status,
                    "updated_at": _utcnow()
                }
            }
        )

        logger.info(f"Subscription {stripe_subscription_id} status updated to: {status}")
        return update_result.modified_count > 0

    def cancel_subscription(self, user_id: str, immediate: bool = False) -> bool:
        """Cancel subscription"""
        self._ensure_connection()

        update_data = {
            "cancel_at_period_end": not immediate,
            "updated_at": _utcnow()
        }

        if immediate:
            update_data["status"] = "cancelled"
            update_data["cancelled_at"] = _utcnow()

        cancel_result = self.subscriptions_collection.update_one(
            {"user_id": user_id},
            {"$set": update_data}
        )

        logger.info(f"Subscription cancelled for user {user_id} (immediate: {immediate})")
        return cancel_result.modified_count > 0

    def get_user_plan(self, user_id: str) -> str:
        """Get user's current plan (free or professional)"""
        subscription = self.get_subscription(user_id)

        if not subscription:
            # Fall back to subscription_plan stored on the user document
            try:
                users_collection = self.db['users']
                user = users_collection.find_one({"supabase_user_id": user_id}, {"subscription_plan": 1})
                if user and user.get("subscription_plan") == "professional":
                    return "professional"
            except Exception:
                pass
            return "free"

        # Check if subscription is active and not expired
        if subscription.get("status") == "active":
            period_end = subscription.get("current_period_end")
            if isinstance(period_end, datetime):  # S1066: merged with enclosing check
                current_time = _utcnow().replace(tzinfo=None)
                return "professional" if period_end.replace(tzinfo=None) > current_time else "free"
            return "professional"  # active but no datetime period_end

        return "free"

    def check_usage_limit(self, user_id: str, resource_type: str) -> Dict:
        """
        Check if user has exceeded their usage limits
        
        Args:
            user_id: User ID
            resource_type: Type of resource (videos, platforms, etc.)
        
        Returns:
            Dict with allowed, current_usage, limit, and can_proceed
        """
        self._ensure_connection()

        plan = self.get_user_plan(user_id)

        # Define limits for each plan
        limits = {
            "free": {
                "videos": 5,
                "platforms": 1,
                "api_calls": 100
            },
            "professional": {
                "videos": -1,  # unlimited
                "platforms": -1,  # unlimited
                "api_calls": -1  # unlimited
            }
        }

        plan_limits = limits.get(plan, limits["free"])
        limit = plan_limits.get(resource_type, 0)

        # Get current usage for this month
        current_usage = self.get_current_usage(user_id, resource_type)

        # Check if user can proceed
        can_proceed = True
        if limit != -1:  # -1 means unlimited
            can_proceed = current_usage < limit

        return {
            "plan": plan,
            "resource_type": resource_type,
            "current_usage": current_usage,
            "limit": limit,
            "unlimited": limit == -1,
            "can_proceed": can_proceed,
            "remaining": limit - current_usage if limit != -1 else -1
        }

    def get_current_usage(self, user_id: str, resource_type: str) -> int:
        """Get current month's usage for a resource type"""
        self._ensure_connection()

        # Get start of current month
        now = _utcnow()
        period_start = datetime(now.year, now.month, 1)

        usage = self.usage_collection.find_one({
            "user_id": user_id,
            "period_start": period_start
        })

        if not usage:
            return 0

        return usage.get(resource_type, 0)

    def increment_usage(self, user_id: str, resource_type: str, amount: int = 1) -> bool:
        """Increment usage counter for a resource"""
        self._ensure_connection()

        # Get start of current month
        now = _utcnow()
        period_start = datetime(now.year, now.month, 1)
        period_end = datetime(now.year, now.month + 1, 1) if now.month < 12 else datetime(now.year + 1, 1, 1)

        self.usage_collection.update_one(
            {
                "user_id": user_id,
                "period_start": period_start
            },
            {
                "$inc": {resource_type: amount},
                "$set": {
                    "period_end": period_end,
                    "updated_at": _utcnow()
                },
                "$setOnInsert": {
                    "created_at": _utcnow()
                }
            },
            upsert=True
        )

        logger.info(f"Usage incremented for user {user_id}: {resource_type} +{amount}")
        return True

    def get_usage_stats(self, user_id: str) -> Dict:
        """Get comprehensive usage statistics for a user"""
        self._ensure_connection()

        plan = self.get_user_plan(user_id)
        subscription = self.get_subscription(user_id)

        # Get current month usage
        now = _utcnow()
        period_start = datetime(now.year, now.month, 1)

        usage = self.usage_collection.find_one({
            "user_id": user_id,
            "period_start": period_start
        }) or {}

        # Get limits
        videos_limit = self.check_usage_limit(user_id, "videos")
        platforms_limit = self.check_usage_limit(user_id, "platforms")

        stats = {
            "user_id": user_id,
            "plan": plan,
            "subscription": {
                "status": subscription.get("status") if subscription else "none",
                "current_period_end": subscription.get("current_period_end").isoformat() if subscription and subscription.get("current_period_end") else None
            },
            "usage": {
                "videos_created": usage.get("videos", 0),
                "videos_limit": videos_limit["limit"],
                "videos_remaining": videos_limit["remaining"],
                "platforms_connected": usage.get("platforms", 0),
                "platforms_limit": platforms_limit["limit"],
                "api_calls": usage.get("api_calls", 0)
            },
            "period": {
                "start": period_start.isoformat(),
                "end": usage.get("period_end").isoformat() if usage.get("period_end") else None
            }
        }

        return stats

# Global instance
subscription_service = SubscriptionService()
