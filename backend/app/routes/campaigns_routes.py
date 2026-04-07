"""
Campaigns API Routes with User Authentication and Data Isolation
"""

from fastapi import APIRouter, HTTPException, Header, Query, Depends
from pydantic import BaseModel
from typing import Annotated, Optional, List, Dict, Any
from datetime import datetime, timezone
import logging
from utils.campaigns_service import campaigns_service
from utils.middleware.auth_middleware import auth_middleware
from utils.subscription_service import subscription_service
from utils.mongodb_service import mongodb_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

class CampaignCreateRequest(BaseModel):
    """Request model for creating a campaign"""
    name: str
    description: Optional[str] = ""
    campaign_type: Optional[str] = "email"  # email, social, linkedin, etc.
    status: Optional[str] = "draft"
    target_audience: Optional[Dict[str, Any]] = {}
    content: Optional[Dict[str, Any]] = {}
    settings: Optional[Dict[str, Any]] = {}
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    budget: Optional[float] = 0
    goals: Optional[Dict[str, Any]] = {}
    tags: Optional[List[str]] = []
    custom_fields: Optional[Dict[str, Any]] = {}

class CampaignUpdateRequest(BaseModel):
    """Request model for updating a campaign"""
    name: Optional[str] = None
    description: Optional[str] = None
    campaign_type: Optional[str] = None
    status: Optional[str] = None
    target_audience: Optional[Dict[str, Any]] = None
    content: Optional[Dict[str, Any]] = None
    settings: Optional[Dict[str, Any]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    budget: Optional[float] = None
    goals: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    custom_fields: Optional[Dict[str, Any]] = None

class MetricsUpdateRequest(BaseModel):
    """Request model for updating campaign metrics"""
    sent: Optional[int] = 0
    delivered: Optional[int] = 0
    opened: Optional[int] = 0
    clicked: Optional[int] = 0
    replied: Optional[int] = 0
    converted: Optional[int] = 0
    bounced: Optional[int] = 0
    unsubscribed: Optional[int] = 0

_NO_AUTH = "Authentication required"
_TOKEN_INVALID = "Invalid or expired token"
_CAMPAIGN_NOT_FOUND = "Campaign not found"


def get_current_user(authorization: Annotated[Optional[str], Header()] = None) -> str:
    """Dependency to get current authenticated user"""
    if not authorization:
        raise HTTPException(status_code=401, detail=_NO_AUTH)

    user_info = auth_middleware.verify_token(authorization)
    if not user_info:
        raise HTTPException(status_code=401, detail=_TOKEN_INVALID)

    return user_info['user_id']


CurrentUser = Annotated[str, Depends(get_current_user)]


@router.post(
    "/",
    response_model=dict,
    responses={
        401: {"description": _NO_AUTH},
        403: {"description": "Video limit exceeded"},
        400: {"description": "Validation error"},
        500: {"description": "Internal server error"},
    },
)
async def create_campaign(campaign_data: CampaignCreateRequest, user_id: CurrentUser):
    """Create a new campaign for the authenticated user"""
    try:
        logger.info(f"🎬 Creating campaign for user: {user_id}")

        # 🛡️ CHECK SUBSCRIPTION LIMIT (campaigns create videos)
        limit_check = subscription_service.check_usage_limit(user_id, "videos")

        if not limit_check["can_proceed"]:
            logger.warning(f"⚠️ User {user_id} exceeded video limit for campaign: {limit_check['current_usage']}/{limit_check['limit']}")
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "limit_exceeded",
                    "message": f"You've reached your limit of {limit_check['limit']} videos this month",
                    "current_usage": limit_check["current_usage"],
                    "limit": limit_check["limit"],
                    "plan": limit_check["plan"],
                    "upgrade_message": "Upgrade to Professional for unlimited campaigns!",
                    "upgrade_url": "/subscription"
                }
            )

        campaign = campaigns_service.create_campaign(campaign_data.dict(), user_id)

        # ✅ TRACK USAGE AFTER SUCCESS (campaigns generate videos)
        subscription_service.increment_usage(user_id, "videos", 1)
        logger.info(f"✅ Campaign created and usage tracked for user {user_id}")

        # Get updated usage stats
        updated_limit = subscription_service.check_usage_limit(user_id, "videos")

        return {
            "success": True,
            "message": "Campaign created successfully",
            "campaign": campaign,
            "usage": {
                "videos_used": updated_limit["current_usage"],
                "videos_limit": updated_limit["limit"],
                "videos_remaining": updated_limit["remaining"],
                "plan": updated_limit["plan"]
            }
        }

    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"WARNING: Campaign creation validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"ERROR: Campaign creation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create campaign: {str(e)}")

@router.get(
    "/",
    response_model=List[dict],
    responses={
        401: {"description": _NO_AUTH},
        400: {"description": "Invalid query parameters"},
        500: {"description": "Internal server error"},
    },
)
async def get_campaigns(
    user_id: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    skip: Annotated[int, Query(ge=0)] = 0,
    status: Annotated[Optional[str], Query()] = None,
    campaign_type: Annotated[Optional[str], Query()] = None,
):
    """Get campaigns for the authenticated user with optional filtering"""
    try:
        logger.info(f" Getting campaigns for user: {user_id}")

        campaigns = campaigns_service.get_user_campaigns(
            user_id=user_id,
            limit=limit,
            skip=skip,
            status=status,
            campaign_type=campaign_type
        )

        logger.info(f" Retrieved {len(campaigns)} campaigns for user: {user_id}")
        return campaigns

    except Exception as e:
        logger.error(f"ERROR: Failed to get campaigns: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get campaigns: {str(e)}")

@router.get(
    "/{campaign_id}",
    response_model=dict,
    responses={
        401: {"description": _NO_AUTH},
        404: {"description": _CAMPAIGN_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
async def get_campaign(campaign_id: str, user_id: CurrentUser):
    """Get a specific campaign by ID for the authenticated user"""
    try:
        logger.info(f" Getting campaign {campaign_id} for user: {user_id}")

        campaign = campaigns_service.get_campaign_by_id(campaign_id, user_id)

        if not campaign:
            raise HTTPException(status_code=404, detail=_CAMPAIGN_NOT_FOUND)

        return {
            "success": True,
            "campaign": campaign
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR: Failed to get campaign: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get campaign: {str(e)}")

@router.put(
    "/{campaign_id}",
    response_model=dict,
    responses={
        401: {"description": _NO_AUTH},
        400: {"description": "No valid fields to update"},
        404: {"description": _CAMPAIGN_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
async def update_campaign(
    campaign_id: str,
    update_data: CampaignUpdateRequest,
    user_id: CurrentUser,
):
    """Update a campaign for the authenticated user"""
    try:
        logger.info(f" Updating campaign {campaign_id} for user: {user_id}")

        # Filter out None values
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}

        if not update_dict:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        success = campaigns_service.update_campaign(campaign_id, user_id, update_dict)

        if not success:
            raise HTTPException(status_code=404, detail=_CAMPAIGN_NOT_FOUND)

        return {
            "success": True,
            "message": "Campaign updated successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR: Failed to update campaign: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update campaign: {str(e)}")

@router.put(
    "/{campaign_id}/metrics",
    response_model=dict,
    responses={
        401: {"description": _NO_AUTH},
        400: {"description": "No valid metrics to update"},
        404: {"description": _CAMPAIGN_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
async def update_campaign_metrics(
    campaign_id: str,
    metrics_data: MetricsUpdateRequest,
    user_id: CurrentUser,
):
    """Update campaign metrics for the authenticated user"""
    try:
        logger.info(f" Updating campaign metrics {campaign_id} for user: {user_id}")

        # Filter out zero values for incremental updates
        metrics_dict = {k: v for k, v in metrics_data.dict().items() if v > 0}

        if not metrics_dict:
            raise HTTPException(status_code=400, detail="No valid metrics to update")

        success = campaigns_service.update_campaign_metrics(campaign_id, user_id, metrics_dict)

        if not success:
            raise HTTPException(status_code=404, detail=_CAMPAIGN_NOT_FOUND)

        return {
            "success": True,
            "message": "Campaign metrics updated successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR: Failed to update campaign metrics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update campaign metrics: {str(e)}")

@router.delete(
    "/{campaign_id}",
    response_model=dict,
    responses={
        401: {"description": _NO_AUTH},
        404: {"description": _CAMPAIGN_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
async def delete_campaign(campaign_id: str, user_id: CurrentUser):
    """Delete a campaign for the authenticated user"""
    try:
        logger.info(f" Deleting campaign {campaign_id} for user: {user_id}")

        success = campaigns_service.delete_campaign(campaign_id, user_id)

        if not success:
            raise HTTPException(status_code=404, detail=_CAMPAIGN_NOT_FOUND)

        return {
            "success": True,
            "message": "Campaign deleted successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR: Failed to delete campaign: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete campaign: {str(e)}")

@router.get(
    "/stats/overview",
    response_model=dict,
    responses={
        401: {"description": _NO_AUTH},
        500: {"description": "Internal server error"},
    },
)
async def get_campaigns_stats(user_id: CurrentUser):
    """Get campaign statistics for the authenticated user"""
    try:
        logger.info(f" Getting campaign stats for user: {user_id}")

        stats = campaigns_service.get_campaigns_stats(user_id)

        return {
            "success": True,
            "stats": stats
        }

    except Exception as e:
        logger.error(f"ERROR: Failed to get campaign stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get campaign stats: {str(e)}")

@router.get(
    "/{campaign_id}/performance",
    response_model=dict,
    responses={
        401: {"description": _NO_AUTH},
        404: {"description": _CAMPAIGN_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
async def get_campaign_performance(campaign_id: str, user_id: CurrentUser):
    """Get detailed performance metrics for a specific campaign"""
    try:
        logger.info(f" Getting campaign performance {campaign_id} for user: {user_id}")

        performance = campaigns_service.get_campaign_performance(campaign_id, user_id)

        if not performance:
            raise HTTPException(status_code=404, detail=_CAMPAIGN_NOT_FOUND)

        return {
            "success": True,
            "performance": performance
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR: Failed to get campaign performance: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get campaign performance: {str(e)}")

@router.get(
    "/search/{search_query}",
    response_model=List[dict],
    responses={
        401: {"description": _NO_AUTH},
        500: {"description": "Internal server error"},
    },
)
async def search_campaigns(
    search_query: str,
    user_id: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
):
    """Search campaigns for the authenticated user"""
    try:
        logger.info(f" Searching campaigns for user: {user_id} with query: {search_query}")

        campaigns = campaigns_service.search_campaigns(user_id, search_query, limit)

        logger.info(f" Found {len(campaigns)} campaigns matching search query")
        return campaigns

    except Exception as e:
        logger.error(f"ERROR: Campaign search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Campaign search failed: {str(e)}")

@router.post(
    "/{campaign_id}/start",
    response_model=dict,
    responses={
        401: {"description": _NO_AUTH},
        404: {"description": _CAMPAIGN_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
async def start_campaign(campaign_id: str, user_id: CurrentUser):
    """Start a campaign (change status to active)"""
    try:
        logger.info(f" Starting campaign {campaign_id} for user: {user_id}")

        update_data = {
            "status": "active",
            "start_date": datetime.now(timezone.utc).isoformat()
        }

        success = campaigns_service.update_campaign(campaign_id, user_id, update_data)

        if not success:
            raise HTTPException(status_code=404, detail=_CAMPAIGN_NOT_FOUND)

        return {
            "success": True,
            "message": "Campaign started successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR: Failed to start campaign: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start campaign: {str(e)}")

@router.post(
    "/{campaign_id}/pause",
    response_model=dict,
    responses={
        401: {"description": _NO_AUTH},
        404: {"description": _CAMPAIGN_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
async def pause_campaign(campaign_id: str, user_id: CurrentUser):
    """Pause a campaign (change status to paused)"""
    try:
        logger.info(f" Pausing campaign {campaign_id} for user: {user_id}")

        update_data = {"status": "paused"}
        success = campaigns_service.update_campaign(campaign_id, user_id, update_data)

        if not success:
            raise HTTPException(status_code=404, detail=_CAMPAIGN_NOT_FOUND)

        return {
            "success": True,
            "message": "Campaign paused successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR: Failed to pause campaign: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to pause campaign: {str(e)}")

@router.post(
    "/{campaign_id}/complete",
    response_model=dict,
    responses={
        401: {"description": _NO_AUTH},
        404: {"description": _CAMPAIGN_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
async def complete_campaign(campaign_id: str, user_id: CurrentUser):
    """Complete a campaign (change status to completed)"""
    try:
        logger.info(f" Completing campaign {campaign_id} for user: {user_id}")

        update_data = {
            "status": "completed",
            "end_date": datetime.now(timezone.utc).isoformat()
        }

        success = campaigns_service.update_campaign(campaign_id, user_id, update_data)

        if not success:
            raise HTTPException(status_code=404, detail=_CAMPAIGN_NOT_FOUND)

        return {
            "success": True,
            "message": "Campaign completed successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR: Failed to complete campaign: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to complete campaign: {str(e)}")

@router.post(
    "/templates/{template_id}/create",
    response_model=dict,
    responses={
        401: {"description": _NO_AUTH},
        500: {"description": "Internal server error"},
    },
)
async def create_campaign_from_template(
    template_id: str,
    campaign_name: str,
    user_id: CurrentUser,
):
    """Create a new campaign from a template"""
    try:
        logger.info(f" Creating campaign from template {template_id} for user: {user_id}")

        # This would typically load a template and create a campaign
        # For now, we'll create a basic campaign structure
        campaign_data = {
            "name": campaign_name,
            "description": f"Campaign created from template {template_id}",
            "campaign_type": "email",
            "status": "draft",
            "source": "template",
            "template_id": template_id
        }

        campaign = campaigns_service.create_campaign(campaign_data, user_id)

        return {
            "success": True,
            "message": "Campaign created from template successfully",
            "campaign": campaign
        }

    except Exception as e:
        logger.error(f"ERROR: Failed to create campaign from template: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create campaign from template: {str(e)}")

class CampaignDialogueRequest(BaseModel):
    """Request model for saving campaign dialogue"""
    company_name: str
    logo_url: Optional[str] = ""
    video_title: Optional[str] = ""
    video_dialogue: Optional[str] = ""
    social_caption: Optional[str] = ""
    generated_prompt: Optional[str] = ""
    source_data: Optional[Dict[str, Any]] = {}

@router.post(
    "/dialogue/save-or-update",
    response_model=dict,
    responses={
        401: {"description": _NO_AUTH},
        500: {"description": "Internal server error"},
    },
)
async def save_or_update_campaign_dialogue(
    dialogue_data: CampaignDialogueRequest,
    user_id: CurrentUser,
):
    """Save or update campaign dialogue for a company. If campaign exists, replace it; otherwise create new."""
    try:
        logger.info(f" Saving/updating campaign dialogue for company '{dialogue_data.company_name}' for user: {user_id}")

        # Fetch logo URL from companies collection
        logo_url = dialogue_data.logo_url  # Use provided logo_url as fallback
        if dialogue_data.company_name:
            companies_collection = mongodb_service.db['companies']

            # Search for company by name
            company = companies_collection.find_one({
                'company.company_name': dialogue_data.company_name,
                'user_ids': user_id
            })

            if company and company.get('company', {}).get('logo_url'):
                logo_url = company['company']['logo_url']
                logger.info(f" Fetched logo URL from companies collection: {logo_url[:80]}...")
            else:
                logger.warning(f"WARNING: Company '{dialogue_data.company_name}' not found in companies collection or has no logo")

        # Check if a campaign already exists for this company
        existing_campaigns = campaigns_service.search_campaigns(
            user_id,
            dialogue_data.company_name,
            limit=10
        )

        # Filter to find exact match by company name in custom_fields
        matching_campaign = None
        for campaign in existing_campaigns:
            if campaign.get('custom_fields', {}).get('company_name') == dialogue_data.company_name:
                matching_campaign = campaign
                break

        # Prepare ONLY dialogue content data (no company details)
        content_data = {
            "video_title": dialogue_data.video_title,
            "video_dialogue": dialogue_data.video_dialogue,
            "social_caption": dialogue_data.social_caption,
            "generated_prompt": dialogue_data.generated_prompt,
        }

        if matching_campaign:
            # Update existing campaign - ONLY replace dialogue content
            campaign_id = matching_campaign['_id']
            logger.info(f"✏️ Updating dialogue content for campaign {campaign_id}")

            update_data = {
                "content": content_data,
                "logo_url": logo_url,  # Update logo URL from companies collection
                "custom_fields": {
                    "company_name": dialogue_data.company_name,  # Keep for search purposes only
                    "last_generated": datetime.now(timezone.utc).isoformat()
                }
            }

            success = campaigns_service.update_campaign(campaign_id, user_id, update_data)

            if not success:
                raise HTTPException(status_code=500, detail="Failed to update campaign")

            return {
                "success": True,
                "message": "Campaign dialogue updated successfully",
                "action": "updated",
                "campaign_id": campaign_id
            }
        else:
            # Create new campaign - ONLY store dialogue content
            logger.info("✨ Creating new campaign with dialogue content")

            campaign_data = {
                "name": f"Campaign - {dialogue_data.company_name}",
                "description": "AI-generated dialogue content",
                "company_name": dialogue_data.company_name,
                "logo_url": logo_url,  # Store company logo URL from companies collection
                "campaign_type": "content",
                "status": "draft",
                "content": content_data,  # Only dialogue content
                "custom_fields": {
                    "company_name": dialogue_data.company_name,  # Keep for search purposes only
                    "last_generated": datetime.now(timezone.utc).isoformat()
                }
            }

            campaign = campaigns_service.create_campaign(campaign_data, user_id)

            return {
                "success": True,
                "message": "Campaign dialogue saved successfully",
                "action": "created",
                "campaign_id": campaign['_id']
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR: Failed to save/update campaign dialogue: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save/update campaign dialogue: {str(e)}")
