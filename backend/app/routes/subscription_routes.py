"""
Subscription and payment routes using Stripe
"""
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel
from typing import Annotated, Optional
import os
import logging
from datetime import datetime, timezone
from utils.subscription_service import subscription_service
from utils.mongodb_service import mongodb_service
from utils.notifications import send_plan_upgrade_notification
import stripe

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/subscription", tags=["Subscription"])

# Stripe Configuration - Load from environment variables (SECURE)
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "")
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_BUY_BUTTON_ID = os.getenv("STRIPE_BUY_BUTTON_ID", "")
STRIPE_CHECKOUT_URL = os.getenv("STRIPE_CHECKOUT_URL", "")
SUBSCRIPTION_PRICE = 49.00

_SUB_NOT_FOUND = "Subscription not found"
_WEBHOOK_CONFIG_ERROR = "Webhook configuration error"
_MISSING_SIGNATURE = "Missing signature"
_INVALID_SIGNATURE = "Invalid signature"
_VERIFICATION_FAILED = "Verification failed"

# Initialize Stripe with secret key
if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY
else:
    logger.warning("⚠️ STRIPE_SECRET_KEY not configured! Stripe functionality will be limited.")

class SubscriptionInfo(BaseModel):
    plan: str = "Professional"
    price: float = 49.00
    currency: str = "USD"
    billing_cycle: str = "monthly"
    features: list = [
        "Unlimited AI Video Generation",
        "Multi-Platform Publishing",
        "Advanced Analytics",
        "Priority Support",
        "Custom Branding",
        "API Access"
    ]

class UserSubscription(BaseModel):
    user_id: str
    subscription_id: Optional[str] = None
    status: str = "inactive"  # inactive, active, cancelled, expired
    plan: str = "free"
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    auto_renew: bool = True

@router.get("/config")
async def get_subscription_config():
    """
    Get Stripe configuration for frontend
    """
    return {
        "publishable_key": STRIPE_PUBLISHABLE_KEY,
        "buy_button_id": STRIPE_BUY_BUTTON_ID,
        "checkout_url": STRIPE_CHECKOUT_URL,
        "price": SUBSCRIPTION_PRICE,
        "currency": "USD"
    }

@router.get("/plans")
async def get_subscription_plans():
    """
    Get available subscription plans
    """
    return {
        "plans": [
            {
                "id": "free",
                "name": "Free",
                "price": 0,
                "currency": "USD",
                "billing_cycle": "monthly",
                "features": [
                    "5 Videos per month",
                    "Basic Analytics",
                    "Email Support",
                    "Single Platform Publishing"
                ],
                "limits": {
                    "videos_per_month": 5,
                    "platforms": 1,
                }
            },
            {
                "id": "professional",
                "name": "Professional",
                "price": 49,
                "currency": "USD",
                "billing_cycle": "monthly",
                "features": [
                    "Unlimited AI Video Generation",
                    "Multi-Platform Publishing",
                    "Advanced Analytics",
                    "Priority Support",
                    "Custom Branding",
                    "API Access",
                    "Webhook Integrations"
                ],
                "limits": {
                    "videos_per_month": -1,  # unlimited
                    "platforms": -1,  # unlimited
                },
                "stripe_url": STRIPE_CHECKOUT_URL,
                "buy_button_id": STRIPE_BUY_BUTTON_ID,
                "popular": True
            }
        ]
    }

@router.get(
    "/status/{user_id}",
    responses={500: {"description": "Internal server error"}},
)
async def get_subscription_status(user_id: str):
    """
    Get user's subscription status with real data from database
    """
    try:
        # Get subscription and usage stats from database
        stats = subscription_service.get_usage_stats(user_id)
        subscription = subscription_service.get_subscription(user_id)

        response = {
            "user_id": user_id,
            "plan": stats["plan"],
            "subscription": stats["subscription"],
            "usage": stats["usage"],
            "period": stats["period"]
        }

        # Add subscription details if exists
        if subscription:
            response["subscription_details"] = {
                "price": subscription.get("price", 0),
                "currency": subscription.get("currency", "USD"),
                "billing_cycle": subscription.get("billing_cycle", "monthly"),
                "cancel_at_period_end": subscription.get("cancel_at_period_end", False)
            }

        return response
    except Exception as e:
        logger.error(f"Error fetching subscription status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post(
    "/webhook",
    responses={
        400: {"description": "Bad request — missing or invalid signature"},
        500: {"description": "Webhook configuration error or internal server error"},
    },
)
async def stripe_webhook(
    request: Request,
    stripe_signature: Annotated[Optional[str], Header(alias="Stripe-Signature")] = None,
):
    """
    Handle Stripe webhook events with signature verification (SECURE)
    """
    try:
        payload = await request.body()

        # SECURITY: Verify webhook signature to ensure request is from Stripe
        if not STRIPE_WEBHOOK_SECRET:
            logger.error("🔴 STRIPE_WEBHOOK_SECRET not configured! Webhook verification disabled.")
            raise HTTPException(status_code=500, detail=_WEBHOOK_CONFIG_ERROR)

        if not stripe_signature:
            logger.error("🔴 Missing Stripe-Signature header")
            raise HTTPException(status_code=400, detail=_MISSING_SIGNATURE)

        try:
            # Verify the webhook signature
            event = stripe.Webhook.construct_event(
                payload,
                stripe_signature,
                STRIPE_WEBHOOK_SECRET
            )
            logger.info("✅ Webhook signature verified successfully")
        except stripe.error.SignatureVerificationError as e:
            logger.error(f"🔴 Invalid webhook signature: {e}")
            raise HTTPException(status_code=400, detail=_INVALID_SIGNATURE)
        except Exception as e:
            logger.error(f"🔴 Webhook verification error: {e}")
            raise HTTPException(status_code=400, detail=_VERIFICATION_FAILED)

        event_type = event.get('type')
        logger.info(f"📨 Received verified Stripe webhook: {event_type}")

        # Handle different event types
        if event_type == 'checkout.session.completed':
            session = event['data']['object']
            handle_successful_payment(session)

        elif event_type == 'customer.subscription.created':
            subscription = event['data']['object']
            handle_subscription_created(subscription)

        elif event_type == 'customer.subscription.updated':
            subscription = event['data']['object']
            handle_subscription_updated(subscription)

        elif event_type == 'customer.subscription.deleted':
            subscription = event['data']['object']
            handle_subscription_cancelled(subscription)

        elif event_type == 'invoice.payment_succeeded':
            invoice = event['data']['object']
            handle_payment_succeeded(invoice)

        elif event_type == 'invoice.payment_failed':
            invoice = event['data']['object']
            handle_payment_failed(invoice)
        else:
            logger.info(f"ℹ️ Unhandled webhook event type: {event_type}")

        return {"status": "success", "received": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"🔴 Webhook processing error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


def get_user_id_from_email(email: str) -> Optional[str]:
    """Map customer email to user_id from database"""
    try:
        db = mongodb_service.get_database()
        users_collection = db['users']

        user = users_collection.find_one({"email": email})
        if user:
            supabase_id = user.get('supabase_user_id') or user.get('user_id') or user.get('id')
            if supabase_id:
                logger.info(f"✅ Found user_id: {supabase_id} for email: {email}")
                return supabase_id
            logger.warning(f"⚠️ No user_id found for {email}, falling back to MongoDB _id")
            return str(user.get('_id'))
        return None
    except Exception as e:
        logger.error(f"Error mapping email to user_id: {e}")
        return None


def handle_successful_payment(session):
    """Handle successful payment - upgrade user to Professional"""
    try:
        logger.info(f"💳 Payment successful: {session.get('id')}")

        customer_email = session.get('customer_details', {}).get('email')
        customer_name  = session.get('customer_details', {}).get('name', '')

        user_id = None
        if customer_email:
            user_id = get_user_id_from_email(customer_email)
            logger.info(f"📧 Mapped email {customer_email} to user_id: {user_id}")

        if not user_id:
            logger.error(f"❌ Could not find user_id for email: {customer_email}")
            return

        logger.info(f"✅ Upgrading user {user_id} to Professional plan")

        # Send plan upgrade notification email
        if customer_email:
            try:
                send_plan_upgrade_notification(
                    email=customer_email,
                    name=customer_name,
                    plan="Professional",
                )
                logger.info(f"📧 Plan upgrade notification sent to {customer_email}")
            except Exception as notify_err:
                logger.warning(f"⚠️ Could not send plan upgrade notification: {notify_err}")

    except Exception as e:
        logger.error(f"❌ Error handling successful payment: {e}")


def handle_subscription_created(subscription):
    """Handle subscription creation - create subscription record"""
    try:
        logger.info(f"🎉 Subscription created: {subscription.get('id')}")

        customer_id = subscription.get('customer')

        try:
            customer = stripe.Customer.retrieve(customer_id)
            customer_email = customer.get('email')

            user_id = None
            if customer_email:
                user_id = get_user_id_from_email(customer_email)
                logger.info(f"📧 Mapped email {customer_email} to user_id: {user_id}")

            if not user_id:
                logger.error(f"❌ Could not find user_id for customer: {customer_id}")
                return

            subscription_service.create_subscription(
                user_id=user_id,
                stripe_data=subscription
            )

            logger.info(f"✅ Subscription record created for user {user_id}")

        except stripe.error.StripeError as e:
            logger.error(f"❌ Stripe API error: {e}")
            return

    except Exception as e:
        logger.error(f"❌ Error creating subscription: {e}")


def handle_subscription_updated(subscription):
    """Handle subscription update"""
    try:
        logger.info(f"🔄 Subscription updated: {subscription.get('id')}")

        subscription_id = subscription.get('id')
        status = subscription.get('status')

        subscription_service.update_subscription_status(subscription_id, status)

        logger.info(f"✅ Subscription {subscription_id} updated to status: {status}")

    except Exception as e:
        logger.error(f"❌ Error updating subscription: {e}")


def handle_subscription_cancelled(subscription):
    """Handle subscription cancellation"""
    try:
        logger.info(f"❌ Subscription cancelled: {subscription.get('id')}")

        subscription_id = subscription.get('id')

        subscription_service.update_subscription_status(subscription_id, "cancelled")

        logger.info(f"✅ Subscription {subscription_id} marked as cancelled")

    except Exception as e:
        logger.error(f"❌ Error cancelling subscription: {e}")


def handle_payment_succeeded(invoice):
    """Handle successful payment - extend subscription period"""
    try:
        logger.info(f"💰 Payment succeeded: {invoice.get('id')}")

        subscription_id = invoice.get('subscription')
        customer_id = invoice.get('customer')

        logger.info(f"✅ Payment processed for customer {customer_id}, subscription {subscription_id}")

    except Exception as e:
        logger.error(f"❌ Error handling payment success: {e}")


def handle_payment_failed(invoice):
    """Handle failed payment - notify user"""
    try:
        logger.warning(f"⚠️ Payment failed: {invoice.get('id')}")

        customer_id = invoice.get('customer')
        subscription_id = invoice.get('subscription')

        logger.warning(f"⚠️ Payment failed for customer {customer_id}, subscription {subscription_id}")
        # Send email notification to user about failed payment
        # Consider grace period before downgrading

    except Exception as e:
        logger.error(f"❌ Error handling payment failure: {e}")


@router.post(
    "/cancel/{user_id}",
    responses={
        404: {"description": _SUB_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
async def cancel_subscription(user_id: str):
    """
    Cancel user's subscription (at end of billing period)
    """
    try:
        success = subscription_service.cancel_subscription(user_id, immediate=False)

        if not success:
            raise HTTPException(status_code=404, detail=_SUB_NOT_FOUND)

        return {
            "status": "success",
            "message": "Subscription will be cancelled at the end of billing period",
            "user_id": user_id,
            "cancelled_at": datetime.now(timezone.utc).isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/reactivate/{user_id}",
    responses={
        404: {"description": _SUB_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
async def reactivate_subscription(user_id: str):
    """
    Reactivate cancelled subscription
    """
    try:
        subscription = subscription_service.get_subscription(user_id)

        if not subscription:
            raise HTTPException(status_code=404, detail=_SUB_NOT_FOUND)

        subscription_service.subscriptions_collection.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "cancel_at_period_end": False,
                    "status": "active",
                    "updated_at": datetime.now(timezone.utc)
                },
                "$unset": {"cancelled_at": ""}
            }
        )

        return {
            "status": "success",
            "message": "Subscription reactivated successfully",
            "user_id": user_id,
            "reactivated_at": datetime.now(timezone.utc).isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reactivating subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/check-limit/{user_id}/{resource_type}",
    responses={500: {"description": "Internal server error"}},
)
async def check_usage_limit(user_id: str, resource_type: str):
    """
    Check if user can use a specific resource based on their plan limits
    """
    try:
        limit_check = subscription_service.check_usage_limit(user_id, resource_type)
        return limit_check
    except Exception as e:
        logger.error(f"Error checking usage limit: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/track-usage/{user_id}/{resource_type}",
    responses={
        403: {"description": "Usage limit exceeded"},
        500: {"description": "Internal server error"},
    },
)
async def track_usage(user_id: str, resource_type: str, amount: int = 1):
    """
    Track usage of a resource (increment counter)
    """
    try:
        limit_check = subscription_service.check_usage_limit(user_id, resource_type)

        if not limit_check["can_proceed"]:
            raise HTTPException(
                status_code=403,
                detail=f"Usage limit exceeded. You have reached your {resource_type} limit of {limit_check['limit']} for the {limit_check['plan']} plan. Please upgrade to Professional plan."
            )

        subscription_service.increment_usage(user_id, resource_type, amount)

        updated_check = subscription_service.check_usage_limit(user_id, resource_type)

        return {
            "status": "success",
            "message": f"Usage tracked for {resource_type}",
            "usage": updated_check
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error tracking usage: {e}")
        raise HTTPException(status_code=500, detail=str(e))
