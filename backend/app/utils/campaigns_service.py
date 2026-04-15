"""
Campaigns Management Service for User-Specific Data
Handles campaign creation, retrieval, and management with user isolation
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
import logging
from bson import ObjectId
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError
import os
from utils.config import config

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_REGEX = "$regex"
_OPTIONS = "$options"


class CampaignsService:
    def __init__(self):
        """Initialize MongoDB connection for campaigns management"""
        try:
            self.mongo_uri = config.get_mongodb_connection_string()
        except ValueError:
            # Fallback to env variable if config fails
            self.mongo_uri = os.getenv('MONGODB_URI')
        _tls_opts = {"tls": True, "tlsAllowInvalidCertificates": True} if self.mongo_uri.startswith("mongodb+srv://") else {}
        self.client = MongoClient(
            self.mongo_uri,
            serverSelectionTimeoutMS=30000,
            connectTimeoutMS=30000,
            socketTimeoutMS=30000,
            maxPoolSize=10,
            retryWrites=True,
            **_tls_opts  # Allow invalid certificates to fix SSL issues
        )
        self.db = self.client['socialflow']
        self.campaigns_collection = self.db['campaigns']

        # Create indexes for better performance
        # Don't fail startup if MongoDB is not available
        try:
            self._create_indexes()
        except Exception as e:
            logger.warning(f"WARNING: MongoDB connection failed during startup: {e}")
            logger.info(" Server will start anyway. MongoDB operations will be retried when needed.")

    def _create_indexes(self):
        """Create necessary indexes for campaigns collection"""
        try:
            # Indexes for user-specific filtering and performance
            self.campaigns_collection.create_index("user_id")
            self.campaigns_collection.create_index("name")
            self.campaigns_collection.create_index("status")
            self.campaigns_collection.create_index("campaign_type")
            self.campaigns_collection.create_index("created_at")
            self.campaigns_collection.create_index("start_date")
            self.campaigns_collection.create_index("end_date")
            self.campaigns_collection.create_index([("user_id", 1), ("name", 1)], unique=True)  # Unique per user
            logger.info(" Campaigns collection indexes created successfully")
        except Exception as e:
            logger.error(f"ERROR: Error creating campaigns indexes: {e}")

    def create_campaign(self, campaign_data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """
        Create a new campaign for a specific user
        
        Args:
            campaign_data: Dictionary containing campaign information
            user_id: Supabase user ID
            
        Returns:
            Dictionary containing the created campaign document
        """
        try:
            # Add user association and timestamps
            campaign_document = {
                "user_id": user_id,
                "name": campaign_data.get('name', ''),
                "description": campaign_data.get('description', ''),
                "company_name": campaign_data.get('company_name', ''),
                "logo_url": campaign_data.get('logo_url', ''),  # Company logo URL for video generation
                "campaign_type": campaign_data.get('campaign_type', 'email'),  # email, social, linkedin, etc.
                "status": campaign_data.get('status', 'draft'),  # draft, active, paused, completed, cancelled
                "target_audience": campaign_data.get('target_audience', {}),
                "content": campaign_data.get('content', {}),
                "settings": campaign_data.get('settings', {}),
                "start_date": campaign_data.get('start_date'),
                "end_date": campaign_data.get('end_date'),
                "budget": campaign_data.get('budget', 0),
                "goals": campaign_data.get('goals', {}),
                "metrics": {
                    "sent": 0,
                    "delivered": 0,
                    "opened": 0,
                    "clicked": 0,
                    "replied": 0,
                    "converted": 0,
                    "bounced": 0,
                    "unsubscribed": 0
                },
                "tags": campaign_data.get('tags', []),
                "custom_fields": campaign_data.get('custom_fields', {}),
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }

            # Insert the campaign
            result = self.campaigns_collection.insert_one(campaign_document)

            # Return the created document
            created_campaign = self.campaigns_collection.find_one({"_id": result.inserted_id})
            created_campaign['_id'] = str(created_campaign['_id'])

            logger.info(f" Created campaign for user {user_id}: {campaign_data.get('name', 'Unknown')}")
            return created_campaign

        except DuplicateKeyError:
            logger.warning(f"WARNING: Campaign already exists for user {user_id}: {campaign_data.get('name', 'Unknown')}")
            raise ValueError("Campaign with this name already exists for this user")
        except Exception as e:
            logger.error(f"ERROR: Error creating campaign: {e}")
            raise

    def get_user_campaigns(self, user_id: str, limit: int = 100, skip: int = 0,
                           status: Optional[str] = None, campaign_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get campaigns for a specific user with optional filtering
        
        Args:
            user_id: Supabase user ID
            limit: Maximum number of campaigns to return
            skip: Number of campaigns to skip (for pagination)
            status: Filter by campaign status
            campaign_type: Filter by campaign type
            
        Returns:
            List of campaign documents
        """
        try:
            # Build query filter
            query_filter = {"user_id": user_id}

            if status:
                query_filter["status"] = status

            if campaign_type:
                query_filter["campaign_type"] = campaign_type

            # Execute query with sorting
            cursor = self.campaigns_collection.find(query_filter).sort("created_at", -1).skip(skip).limit(limit)
            campaigns = list(cursor)

            # Convert ObjectId to string for JSON serialization
            for campaign in campaigns:
                campaign['_id'] = str(campaign['_id'])

            logger.info(f" Retrieved {len(campaigns)} campaigns for user {user_id}")
            return campaigns

        except Exception as e:
            logger.error(f"ERROR: Error getting user campaigns: {e}")
            return []

    def get_campaign_by_id(self, campaign_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific campaign by ID for a user
        
        Args:
            campaign_id: Campaign document ID
            user_id: Supabase user ID
            
        Returns:
            Campaign document or None
        """
        try:
            campaign = self.campaigns_collection.find_one({
                "_id": ObjectId(campaign_id),
                "user_id": user_id
            })

            if campaign:
                campaign['_id'] = str(campaign['_id'])
                logger.info(f" Found campaign {campaign_id} for user {user_id}")
            else:
                logger.warning(f"WARNING: Campaign {campaign_id} not found for user {user_id}")

            return campaign

        except Exception as e:
            logger.error(f"ERROR: Error getting campaign by ID: {e}")
            return None

    def update_campaign(self, campaign_id: str, user_id: str, update_data: Dict[str, Any]) -> bool:
        """
        Update a campaign for a specific user
        
        Args:
            campaign_id: Campaign document ID
            user_id: Supabase user ID
            update_data: Dictionary with fields to update
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Add updated timestamp
            update_data['updated_at'] = datetime.now(timezone.utc)

            result = self.campaigns_collection.update_one(
                {"_id": ObjectId(campaign_id), "user_id": user_id},
                {"$set": update_data}
            )

            if result.modified_count > 0:
                logger.info(f" Updated campaign {campaign_id} for user {user_id}")
                return True
            else:
                logger.warning(f"WARNING: No campaign found to update: {campaign_id} for user {user_id}")
                return False

        except Exception as e:
            logger.error(f"ERROR: Error updating campaign: {e}")
            return False

    def update_campaign_metrics(self, campaign_id: str, user_id: str, metrics_update: Dict[str, int]) -> bool:
        """
        Update campaign metrics (sent, opened, clicked, etc.)
        
        Args:
            campaign_id: Campaign document ID
            user_id: Supabase user ID
            metrics_update: Dictionary with metric updates
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Build the update query for metrics
            update_operations = {}
            for metric, value in metrics_update.items():
                if metric in ['sent', 'delivered', 'opened', 'clicked', 'replied', 'converted', 'bounced', 'unsubscribed']:
                    update_operations[f"metrics.{metric}"] = value

            if not update_operations:
                logger.warning("WARNING: No valid metrics to update")
                return False

            update_operations['updated_at'] = datetime.now(timezone.utc)

            result = self.campaigns_collection.update_one(
                {"_id": ObjectId(campaign_id), "user_id": user_id},
                {"$inc": update_operations}  # Use $inc to increment metrics
            )

            if result.modified_count > 0:
                logger.info(f" Updated campaign metrics {campaign_id} for user {user_id}")
                return True
            else:
                logger.warning(f"WARNING: No campaign found to update metrics: {campaign_id} for user {user_id}")
                return False

        except Exception as e:
            logger.error(f"ERROR: Error updating campaign metrics: {e}")
            return False

    def delete_campaign(self, campaign_id: str, user_id: str) -> bool:
        """
        Delete a campaign for a specific user
        
        Args:
            campaign_id: Campaign document ID
            user_id: Supabase user ID
            
        Returns:
            True if successful, False otherwise
        """
        try:
            result = self.campaigns_collection.delete_one({
                "_id": ObjectId(campaign_id),
                "user_id": user_id
            })

            if result.deleted_count > 0:
                logger.info(f" Deleted campaign {campaign_id} for user {user_id}")
                return True
            else:
                logger.warning(f"WARNING: No campaign found to delete: {campaign_id} for user {user_id}")
                return False

        except Exception as e:
            logger.error(f"ERROR: Error deleting campaign: {e}")
            return False

    def get_campaigns_stats(self, user_id: str) -> Dict[str, Any]:
        """
        Get campaign statistics for a user
        
        Args:
            user_id: Supabase user ID
            
        Returns:
            Dictionary with campaign statistics
        """
        try:
            # Aggregate statistics
            pipeline = [
                {"$match": {"user_id": user_id}},
                {
                    "$group": {
                        "_id": "$status",
                        "count": {"$sum": 1},
                        "total_sent": {"$sum": "$metrics.sent"},
                        "total_opened": {"$sum": "$metrics.opened"},
                        "total_clicked": {"$sum": "$metrics.clicked"},
                        "total_converted": {"$sum": "$metrics.converted"}
                    }
                }
            ]

            status_stats = list(self.campaigns_collection.aggregate(pipeline))

            # Total count
            total_campaigns = self.campaigns_collection.count_documents({"user_id": user_id})

            # Active campaigns
            active_campaigns = self.campaigns_collection.count_documents({
                "user_id": user_id,
                "status": "active"
            })

            # Recent campaigns (last 30 days)
            thirty_days_ago = datetime.now(timezone.utc).replace(day=datetime.now(timezone.utc).day - 30)
            recent_campaigns = self.campaigns_collection.count_documents({
                "user_id": user_id,
                "created_at": {"$gte": thirty_days_ago}
            })

            # Calculate overall metrics
            overall_metrics = {
                "total_sent": sum(stat["total_sent"] for stat in status_stats),
                "total_opened": sum(stat["total_opened"] for stat in status_stats),
                "total_clicked": sum(stat["total_clicked"] for stat in status_stats),
                "total_converted": sum(stat["total_converted"] for stat in status_stats)
            }

            # Calculate rates
            if overall_metrics["total_sent"] > 0:
                overall_metrics["open_rate"] = (overall_metrics["total_opened"] / overall_metrics["total_sent"]) * 100
                overall_metrics["click_rate"] = (overall_metrics["total_clicked"] / overall_metrics["total_sent"]) * 100
                overall_metrics["conversion_rate"] = (overall_metrics["total_converted"] / overall_metrics["total_sent"]) * 100
            else:
                overall_metrics["open_rate"] = 0
                overall_metrics["click_rate"] = 0
                overall_metrics["conversion_rate"] = 0

            stats = {
                "total_campaigns": total_campaigns,
                "active_campaigns": active_campaigns,
                "recent_campaigns": recent_campaigns,
                "status_breakdown": {stat["_id"]: stat["count"] for stat in status_stats},
                "overall_metrics": overall_metrics
            }

            logger.info(f" Retrieved campaign stats for user {user_id}")
            return stats

        except Exception as e:
            logger.error(f"ERROR: Error getting campaign stats: {e}")
            return {
                "total_campaigns": 0,
                "active_campaigns": 0,
                "recent_campaigns": 0,
                "status_breakdown": {},
                "overall_metrics": {}
            }

    def search_campaigns(self, user_id: str, search_query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Search campaigns for a user by name or description
        
        Args:
            user_id: Supabase user ID
            search_query: Search term
            limit: Maximum number of results
            
        Returns:
            List of matching campaign documents
        """
        try:
            # Create text search query
            query_filter = {
                "user_id": user_id,
                "$or": [
                    {"name": {_REGEX: search_query, _OPTIONS: "i"}},
                    {"description": {_REGEX: search_query, _OPTIONS: "i"}},
                    {"campaign_type": {_REGEX: search_query, _OPTIONS: "i"}}
                ]
            }

            cursor = self.campaigns_collection.find(query_filter).sort("created_at", -1).limit(limit)
            campaigns = list(cursor)

            # Convert ObjectId to string
            for campaign in campaigns:
                campaign['_id'] = str(campaign['_id'])

            logger.info(f" Search found {len(campaigns)} campaigns for user {user_id} with query: {search_query}")
            return campaigns

        except Exception as e:
            logger.error(f"ERROR: Error searching campaigns: {e}")
            return []

    def get_campaign_performance(self, campaign_id: str, user_id: str) -> Dict[str, Any]:
        """
        Get detailed performance metrics for a specific campaign
        
        Args:
            campaign_id: Campaign document ID
            user_id: Supabase user ID
            
        Returns:
            Dictionary with performance metrics
        """
        try:
            campaign = self.get_campaign_by_id(campaign_id, user_id)

            if not campaign:
                return {}

            metrics = campaign.get('metrics', {})

            # Calculate performance rates
            sent = metrics.get('sent', 0)
            performance = {
                "sent": sent,
                "delivered": metrics.get('delivered', 0),
                "opened": metrics.get('opened', 0),
                "clicked": metrics.get('clicked', 0),
                "replied": metrics.get('replied', 0),
                "converted": metrics.get('converted', 0),
                "bounced": metrics.get('bounced', 0),
                "unsubscribed": metrics.get('unsubscribed', 0)
            }

            if sent > 0:
                performance["delivery_rate"] = (performance["delivered"] / sent) * 100
                performance["open_rate"] = (performance["opened"] / sent) * 100
                performance["click_rate"] = (performance["clicked"] / sent) * 100
                performance["reply_rate"] = (performance["replied"] / sent) * 100
                performance["conversion_rate"] = (performance["converted"] / sent) * 100
                performance["bounce_rate"] = (performance["bounced"] / sent) * 100
                performance["unsubscribe_rate"] = (performance["unsubscribed"] / sent) * 100
            else:
                performance.update({
                    "delivery_rate": 0,
                    "open_rate": 0,
                    "click_rate": 0,
                    "reply_rate": 0,
                    "conversion_rate": 0,
                    "bounce_rate": 0,
                    "unsubscribe_rate": 0
                })

            logger.info(f" Retrieved performance for campaign {campaign_id}")
            return performance

        except Exception as e:
            logger.error(f"ERROR: Error getting campaign performance: {e}")
            return {}

# Global instance
campaigns_service = CampaignsService()
