"""
User Management Service for MongoDB Integration
Handles user creation, authentication sync, and data isolation
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any
import logging
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError
import os
from utils.config import config

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class UserService:
    def __init__(self):
        """Initialize MongoDB connection for user management"""
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
        self.users_collection = self.db['users']

        # Create indexes for better performance and uniqueness
        # Don't fail startup if MongoDB is not available
        try:
            self._create_indexes()
        except Exception as e:
            logger.warning(f"WARNING: MongoDB connection failed during startup: {e}")
            logger.info(" Server will start anyway. MongoDB operations will be retried when needed.")

    def _create_indexes(self):
        """Create necessary indexes for user collection"""
        try:
            # Unique index on supabase_user_id and email
            self.users_collection.create_index("supabase_user_id", unique=True)
            self.users_collection.create_index("email", unique=True)
            logger.info(" User collection indexes created successfully")
        except Exception as e:
            logger.error(f"ERROR: Error creating indexes: {e}")

    def _serialize_user_document(self, user_doc: Dict[str, Any]) -> Dict[str, Any]:
        """
        Serialize MongoDB user document for JSON response
        Converts ObjectId to string and handles datetime objects
        """
        if not user_doc:
            return None

        # Convert ObjectId to string
        if '_id' in user_doc:
            user_doc['_id'] = str(user_doc['_id'])

        # Convert datetime objects to ISO strings
        for field in ['created_at', 'updated_at', 'last_sign_in']:
            if field in user_doc and user_doc[field]:
                if hasattr(user_doc[field], 'isoformat'):
                    user_doc[field] = user_doc[field].isoformat()

        return user_doc

    def _extract_incoming_fields(self, user_data: dict) -> tuple:
        """Extract and return key fields from user_data along with a built auth_meta dict."""
        supabase_user_id = user_data.get('id')
        email = user_data.get('email')
        auth_meta = {
            "provider": user_data.get('app_metadata', {}).get('provider', 'email'),
            "email_confirmed": user_data.get('email_confirmed_at') is not None,
            "last_sign_in": user_data.get('last_sign_in_at'),
            "updated_at": datetime.now(timezone.utc),
        }
        from_meta = user_data.get('user_metadata', {})
        incoming_full_name = from_meta.get('full_name') or user_data.get('full_name')
        incoming_avatar = from_meta.get('avatar_url') or user_data.get('avatar_url')
        incoming_company = from_meta.get('company_name') or user_data.get('company_name')
        return (supabase_user_id, email, incoming_full_name, incoming_avatar, incoming_company, auth_meta)

    def _migrate_user_by_email(self, users_collection, db, email, supabase_user_id, auth_meta):
        """Find existing user by email, migrate supabase_user_id, update all data collections. Returns existing_user doc or None."""
        existing_user = users_collection.find_one({"email": email})
        if existing_user:
            old_uid = existing_user.get("supabase_user_id")
            if old_uid and old_uid != supabase_user_id:
                logger.info(f"Migrating user_id from {old_uid} → {supabase_user_id} for {email}")
                auth_meta["supabase_user_id"] = supabase_user_id
                # Migrate all data collections to new user ID
                for col in ['subscriptions', 'campaigns', 'leads', 'companies', 'videos']:
                    try:
                        db[col].update_many(
                            {"user_id": old_uid},
                            {"$set": {"user_id": supabase_user_id}}
                        )
                    except Exception as e:
                        logger.warning(f"Migration warning for {col}: {e}")
        return existing_user

    def _update_existing_user(self, users_collection, existing_user, auth_meta, incoming_full_name, incoming_avatar, incoming_company):
        """Conditionally update profile fields and persist; returns serialized user doc."""
        if not existing_user.get("avatar_url"):
            auth_meta["avatar_url"] = incoming_avatar
        if not existing_user.get("full_name"):
            auth_meta["full_name"] = incoming_full_name
        if not existing_user.get("company_name"):
            auth_meta["company_name"] = incoming_company
        users_collection.update_one(
            {"_id": existing_user["_id"]},
            {"$set": auth_meta}
        )
        email = existing_user.get("email", "")
        logger.info(f"Updated existing user: {email}")
        user_doc = users_collection.find_one({"_id": existing_user["_id"]})
        return self._serialize_user_document(user_doc)

    def _create_new_user(self, users_collection, supabase_user_id, email, incoming_full_name, incoming_company, incoming_avatar, auth_meta):
        """Build and insert a new user document; returns the inserted_id."""
        user_document = {
            "supabase_user_id": supabase_user_id,
            "email": email,
            "full_name": incoming_full_name,
            "company_name": incoming_company,
            "avatar_url": incoming_avatar,
            "subscription_plan": "free",
            "subscription_status": "active",
            "created_at": datetime.now(timezone.utc),
            **auth_meta,
        }
        result = users_collection.insert_one(user_document)
        logger.info(f"Created new user: {email} with ID: {result.inserted_id}")
        return result.inserted_id

    def create_or_update_user(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create or update user in MongoDB when they log in via Supabase

        Args:
            user_data: Dictionary containing user information from Supabase

        Returns:
            Dictionary containing the user document
        """
        try:
            supabase_user_id, email, incoming_full_name, incoming_avatar, incoming_company, auth_meta = \
                self._extract_incoming_fields(user_data)

            if not supabase_user_id or not email:
                raise ValueError("Missing required user data: id or email")

            # 1. Try exact match by supabase_user_id (Auth0 sub)
            existing_user = self.users_collection.find_one({"supabase_user_id": supabase_user_id})

            # 2. Fallback: find by email (covers old Supabase UUID users) and migrate
            if not existing_user:
                existing_user = self._migrate_user_by_email(
                    self.users_collection, self.db, email, supabase_user_id, auth_meta
                )

            if existing_user:
                # Only update auth/session fields — never overwrite user-edited profile fields
                return self._update_existing_user(
                    self.users_collection, existing_user, auth_meta,
                    incoming_full_name, incoming_avatar, incoming_company
                )
            else:
                # Create new user
                inserted_id = self._create_new_user(
                    self.users_collection, supabase_user_id, email,
                    incoming_full_name, incoming_company, incoming_avatar, auth_meta
                )
                self._initialize_user_collections(supabase_user_id)
                user_doc = self.users_collection.find_one({"_id": inserted_id})
                return self._serialize_user_document(user_doc)

        except DuplicateKeyError:
            # Last-resort safety net — should rarely hit this now
            logger.warning(f"DuplicateKeyError for {email}, returning existing doc")
            user_doc = self.users_collection.find_one({"email": email})
            return self._serialize_user_document(user_doc)
        except Exception as e:
            logger.error(f"ERROR: Error creating/updating user: {e}")
            raise

    def _initialize_user_collections(self, user_id: str):
        """
        Initialize user-specific data collections

        Args:
            user_id: Supabase user ID
        """
        try:
            # Create user-specific indexes for companies, leads, campaigns
            collections = ['companies', 'leads', 'campaigns', 'social_posts']

            for collection_name in collections:
                collection = self.db[collection_name]
                # Create index on user_id for fast filtering
                collection.create_index("user_id")

            logger.info(f" Initialized collections for user: {user_id}")

        except Exception as e:
            logger.error(f"ERROR: Error initializing user collections: {e}")

    def get_user_by_supabase_id(self, supabase_user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get user by Supabase user ID

        Args:
            supabase_user_id: Supabase user ID

        Returns:
            User document or None
        """
        try:
            user = self.users_collection.find_one({"supabase_user_id": supabase_user_id})
            return self._serialize_user_document(user)
        except Exception as e:
            logger.error(f"ERROR: Error getting user: {e}")
            return None

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """
        Get user by email

        Args:
            email: User email

        Returns:
            User document or None
        """
        try:
            user = self.users_collection.find_one({"email": email})
            if user:
                user['_id'] = str(user['_id'])
            return user
        except Exception as e:
            logger.error(f"ERROR: Error getting user by email: {e}")
            return None

    def update_user_subscription(self, supabase_user_id: str, plan: str, status: str) -> bool:
        """
        Update user subscription information

        Args:
            supabase_user_id: Supabase user ID
            plan: Subscription plan (free, starter, pro, enterprise)
            status: Subscription status (active, inactive, cancelled)

        Returns:
            True if successful, False otherwise
        """
        try:
            result = self.users_collection.update_one(
                {"supabase_user_id": supabase_user_id},
                {
                    "$set": {
                        "subscription_plan": plan,
                        "subscription_status": status,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )

            if result.modified_count > 0:
                logger.info(f" Updated subscription for user: {supabase_user_id}")
                return True
            else:
                logger.warning(f"WARNING: No user found to update: {supabase_user_id}")
                return False

        except Exception as e:
            logger.error(f"ERROR: Error updating subscription: {e}")
            return False

    def delete_user(self, supabase_user_id: str) -> bool:
        """
        Delete user and all associated data

        Args:
            supabase_user_id: Supabase user ID

        Returns:
            True if successful, False otherwise
        """
        try:
            # Delete user document
            user_result = self.users_collection.delete_one({"supabase_user_id": supabase_user_id})

            if user_result.deleted_count > 0:
                # Delete all user-specific data
                collections = ['companies', 'leads', 'campaigns', 'social_posts']

                for collection_name in collections:
                    collection = self.db[collection_name]
                    collection.delete_many({"user_id": supabase_user_id})

                logger.info(f" Deleted user and all data: {supabase_user_id}")
                return True
            else:
                logger.warning(f"WARNING: No user found to delete: {supabase_user_id}")
                return False

        except Exception as e:
            logger.error(f"ERROR: Error deleting user: {e}")
            return False

    def get_user_stats(self, supabase_user_id: str) -> Dict[str, Any]:
        """
        Get user statistics (companies, leads, campaigns count)

        Args:
            supabase_user_id: Supabase user ID

        Returns:
            Dictionary with user statistics
        """
        try:
            stats = {
                "companies_count": self.db.companies.count_documents({"user_id": supabase_user_id}),
                "leads_count": self.db.leads.count_documents({"user_id": supabase_user_id}),
                "campaigns_count": self.db.campaigns.count_documents({"user_id": supabase_user_id}),
                "social_posts_count": self.db.social_posts.count_documents({"user_id": supabase_user_id})
            }

            logger.info(f" Retrieved stats for user: {supabase_user_id}")
            return stats

        except Exception as e:
            logger.error(f"ERROR: Error getting user stats: {e}")
            return {
                "companies_count": 0,
                "leads_count": 0,
                "campaigns_count": 0,
                "social_posts_count": 0
            }

# Global instance
user_service = UserService()
