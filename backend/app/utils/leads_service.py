"""
Leads Management Service for User-Specific Data
Handles lead creation, retrieval, and management with user isolation
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


class LeadsService:
    def __init__(self):
        """Initialize MongoDB connection for leads management"""
        try:
            self.mongo_uri = config.get_mongodb_connection_string()
        except ValueError:
            # Fallback to env variable if config fails
            self.mongo_uri = os.getenv('MONGODB_URI')
        self.client = MongoClient(
            self.mongo_uri,
            serverSelectionTimeoutMS=30000,
            connectTimeoutMS=30000,
            socketTimeoutMS=30000,
            maxPoolSize=10,
            retryWrites=True,
            tls=True,
            tlsAllowInvalidCertificates=True  # Allow invalid certificates to fix SSL issues
        )
        self.db = self.client['socialflow']
        self.leads_collection = self.db['leads']

        # Create indexes for better performance
        # Don't fail startup if MongoDB is not available
        try:
            self._create_indexes()
        except Exception as e:
            logger.warning(f"WARNING: MongoDB connection failed during startup: {e}")
            logger.info(" Server will start anyway. MongoDB operations will be retried when needed.")

    def _create_indexes(self):
        """Create necessary indexes for leads collection"""
        try:
            # Indexes for user-specific filtering and performance
            self.leads_collection.create_index("user_id")
            self.leads_collection.create_index("email", unique=False)  # Not unique across users
            self.leads_collection.create_index("linkedin_url", unique=False)
            self.leads_collection.create_index("company")
            self.leads_collection.create_index("created_at")
            self.leads_collection.create_index([("user_id", 1), ("email", 1)], unique=True)  # Unique per user
            logger.info(" Leads collection indexes created successfully")
        except Exception as e:
            logger.error(f"ERROR: Error creating leads indexes: {e}")

    def create_lead(self, lead_data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """
        Create a new lead for a specific user
        
        Args:
            lead_data: Dictionary containing lead information
            user_id: Supabase user ID
            
        Returns:
            Dictionary containing the created lead document
        """
        try:
            # Add user association and timestamps
            lead_document = {
                "user_id": user_id,
                "name": lead_data.get('name', ''),
                "email": lead_data.get('email', ''),
                "job_title": lead_data.get('job_title', ''),
                "company": lead_data.get('company', ''),
                "linkedin_url": lead_data.get('linkedin_url', ''),
                "phone": lead_data.get('phone', ''),
                "location": lead_data.get('location', ''),
                "industry": lead_data.get('industry', ''),
                "lead_score": lead_data.get('lead_score', 0),
                "status": lead_data.get('status', 'new'),  # new, contacted, qualified, converted, lost
                "source": lead_data.get('source', 'manual'),  # manual, linkedin, website, etc.
                "notes": lead_data.get('notes', ''),
                "tags": lead_data.get('tags', []),
                "custom_fields": lead_data.get('custom_fields', {}),
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }

            # Insert the lead
            result = self.leads_collection.insert_one(lead_document)

            # Return the created document
            created_lead = self.leads_collection.find_one({"_id": result.inserted_id})
            created_lead['_id'] = str(created_lead['_id'])

            logger.info(f" Created lead for user {user_id}: {lead_data.get('name', 'Unknown')}")
            return created_lead

        except DuplicateKeyError:
            logger.warning(f"WARNING: Lead already exists for user {user_id}: {lead_data.get('email', 'Unknown')}")
            raise ValueError("Lead with this email already exists for this user")
        except Exception as e:
            logger.error(f"ERROR: Error creating lead: {e}")
            raise

    def get_user_leads(self, user_id: str, limit: int = 100, skip: int = 0,
                       status: Optional[str] = None, company: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get leads for a specific user with optional filtering
        
        Args:
            user_id: Supabase user ID
            limit: Maximum number of leads to return
            skip: Number of leads to skip (for pagination)
            status: Filter by lead status
            company: Filter by company name
            
        Returns:
            List of lead documents
        """
        try:
            # Build query filter
            query_filter = {"user_id": user_id}

            if status:
                query_filter["status"] = status

            if company:
                query_filter["company"] = {_REGEX: company, _OPTIONS: "i"}

            # Execute query with sorting
            cursor = self.leads_collection.find(query_filter).sort("created_at", -1).skip(skip).limit(limit)
            leads = list(cursor)

            # Convert ObjectId to string for JSON serialization
            for lead in leads:
                lead['_id'] = str(lead['_id'])

            logger.info(f" Retrieved {len(leads)} leads for user {user_id}")
            return leads

        except Exception as e:
            logger.error(f"ERROR: Error getting user leads: {e}")
            return []

    def get_lead_by_id(self, lead_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific lead by ID for a user
        
        Args:
            lead_id: Lead document ID
            user_id: Supabase user ID
            
        Returns:
            Lead document or None
        """
        try:
            lead = self.leads_collection.find_one({
                "_id": ObjectId(lead_id),
                "user_id": user_id
            })

            if lead:
                lead['_id'] = str(lead['_id'])
                logger.info(f" Found lead {lead_id} for user {user_id}")
            else:
                logger.warning(f"WARNING: Lead {lead_id} not found for user {user_id}")

            return lead

        except Exception as e:
            logger.error(f"ERROR: Error getting lead by ID: {e}")
            return None

    def update_lead(self, lead_id: str, user_id: str, update_data: Dict[str, Any]) -> bool:
        """
        Update a lead for a specific user
        
        Args:
            lead_id: Lead document ID
            user_id: Supabase user ID
            update_data: Dictionary with fields to update
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Add updated timestamp
            update_data['updated_at'] = datetime.now(timezone.utc)

            result = self.leads_collection.update_one(
                {"_id": ObjectId(lead_id), "user_id": user_id},
                {"$set": update_data}
            )

            if result.modified_count > 0:
                logger.info(f" Updated lead {lead_id} for user {user_id}")
                return True
            else:
                logger.warning(f"WARNING: No lead found to update: {lead_id} for user {user_id}")
                return False

        except Exception as e:
            logger.error(f"ERROR: Error updating lead: {e}")
            return False

    def delete_lead(self, lead_id: str, user_id: str) -> bool:
        """
        Delete a lead for a specific user
        
        Args:
            lead_id: Lead document ID
            user_id: Supabase user ID
            
        Returns:
            True if successful, False otherwise
        """
        try:
            result = self.leads_collection.delete_one({
                "_id": ObjectId(lead_id),
                "user_id": user_id
            })

            if result.deleted_count > 0:
                logger.info(f" Deleted lead {lead_id} for user {user_id}")
                return True
            else:
                logger.warning(f"WARNING: No lead found to delete: {lead_id} for user {user_id}")
                return False

        except Exception as e:
            logger.error(f"ERROR: Error deleting lead: {e}")
            return False

    def bulk_create_leads(self, leads_data: List[Dict[str, Any]], user_id: str) -> Dict[str, Any]:
        """
        Create multiple leads for a user in bulk
        
        Args:
            leads_data: List of lead dictionaries
            user_id: Supabase user ID
            
        Returns:
            Dictionary with creation results
        """
        try:
            created_leads = []
            errors = []

            for lead_data in leads_data:
                try:
                    created_lead = self.create_lead(lead_data, user_id)
                    created_leads.append(created_lead)
                except Exception as e:
                    errors.append({
                        "lead_data": lead_data,
                        "error": str(e)
                    })

            logger.info(f" Bulk created {len(created_leads)} leads for user {user_id}, {len(errors)} errors")

            return {
                "created_count": len(created_leads),
                "error_count": len(errors),
                "created_leads": created_leads,
                "errors": errors
            }

        except Exception as e:
            logger.error(f"ERROR: Error in bulk create leads: {e}")
            raise

    def get_leads_stats(self, user_id: str) -> Dict[str, Any]:
        """
        Get lead statistics for a user
        
        Args:
            user_id: Supabase user ID
            
        Returns:
            Dictionary with lead statistics
        """
        try:
            # Aggregate statistics
            pipeline = [
                {"$match": {"user_id": user_id}},
                {
                    "$group": {
                        "_id": "$status",
                        "count": {"$sum": 1},
                        "avg_score": {"$avg": "$lead_score"}
                    }
                }
            ]

            status_stats = list(self.leads_collection.aggregate(pipeline))

            # Total count
            total_leads = self.leads_collection.count_documents({"user_id": user_id})

            # Recent leads (last 30 days)
            thirty_days_ago = datetime.now(timezone.utc).replace(day=datetime.now(timezone.utc).day - 30)
            recent_leads = self.leads_collection.count_documents({
                "user_id": user_id,
                "created_at": {"$gte": thirty_days_ago}
            })

            stats = {
                "total_leads": total_leads,
                "recent_leads": recent_leads,
                "status_breakdown": {stat["_id"]: stat["count"] for stat in status_stats},
                "average_scores": {stat["_id"]: stat["avg_score"] for stat in status_stats if stat["avg_score"]}
            }

            logger.info(f" Retrieved lead stats for user {user_id}")
            return stats

        except Exception as e:
            logger.error(f"ERROR: Error getting lead stats: {e}")
            return {
                "total_leads": 0,
                "recent_leads": 0,
                "status_breakdown": {},
                "average_scores": {}
            }

    def search_leads(self, user_id: str, search_query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Search leads for a user by name, email, or company
        
        Args:
            user_id: Supabase user ID
            search_query: Search term
            limit: Maximum number of results
            
        Returns:
            List of matching lead documents
        """
        try:
            # Create text search query
            query_filter = {
                "user_id": user_id,
                "$or": [
                    {"name": {_REGEX: search_query, _OPTIONS: "i"}},
                    {"email": {_REGEX: search_query, _OPTIONS: "i"}},
                    {"company": {_REGEX: search_query, _OPTIONS: "i"}},
                    {"job_title": {_REGEX: search_query, _OPTIONS: "i"}}
                ]
            }

            cursor = self.leads_collection.find(query_filter).sort("created_at", -1).limit(limit)
            leads = list(cursor)

            # Convert ObjectId to string
            for lead in leads:
                lead['_id'] = str(lead['_id'])

            logger.info(f" Search found {len(leads)} leads for user {user_id} with query: {search_query}")
            return leads

        except Exception as e:
            logger.error(f"ERROR: Error searching leads: {e}")
            return []

# Global instance
leads_service = LeadsService()
