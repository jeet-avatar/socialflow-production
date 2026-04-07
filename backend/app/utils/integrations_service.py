from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from pymongo.collection import Collection
import logging
from utils.mongodb_service import mongodb_service
from cryptography.fernet import Fernet
import os
import base64

logger = logging.getLogger(__name__)

class IntegrationsService:
    """Service for managing user's social media platform integrations"""

    def __init__(self):
        self.collection_name = "integrations"
        self.collection: Optional[Collection] = None
        # Initialize encryption key (in production, store this securely in environment)
        self.encryption_key = self._get_or_create_encryption_key()
        self.cipher = Fernet(self.encryption_key)

    def _get_or_create_encryption_key(self) -> bytes:
        """Get or create encryption key for credentials"""
        key = os.getenv("INTEGRATION_ENCRYPTION_KEY")
        if key:
            return key.encode()
        else:
            # Generate a new key (for development only)
            new_key = Fernet.generate_key()
            logger.warning("WARNING:  Using generated encryption key. Set INTEGRATION_ENCRYPTION_KEY in production!")
            return new_key

    def _ensure_connection(self):
        """Ensure MongoDB connection is established"""
        if self.collection is None:
            if not mongodb_service.connect():
                raise RuntimeError("Failed to connect to MongoDB")
            self.collection = mongodb_service.db[self.collection_name]

            # Create indexes for better performance
            try:
                # Compound unique index on user_id and platform
                self.collection.create_index(
                    [("user_id", 1), ("platform", 1)],
                    unique=True,
                    name="user_platform_unique"
                )
                # Single index on user_id for user-specific queries
                self.collection.create_index("user_id", name="user_id_idx")
                # Index on last_updated for sorting
                self.collection.create_index("last_updated", name="last_updated_idx")

                logger.info(" Integrations collection indexes created successfully")
            except Exception as e:
                logger.warning(f"WARNING:  Index creation warning (may already exist): {e}")

    def _encrypt_credentials(self, credentials: Dict[str, str]) -> Dict[str, str]:
        """Encrypt sensitive credential fields"""
        encrypted = {}
        for key, value in credentials.items():
            if value:
                # Encrypt the value
                encrypted_value = self.cipher.encrypt(value.encode())
                encrypted[key] = base64.b64encode(encrypted_value).decode()
            else:
                encrypted[key] = ""
        return encrypted

    def _decrypt_credentials(self, encrypted_credentials: Dict[str, str]) -> Dict[str, str]:
        """Decrypt credential fields"""
        decrypted = {}
        for key, value in encrypted_credentials.items():
            if value:
                try:
                    # Decrypt the value
                    encrypted_value = base64.b64decode(value.encode())
                    decrypted_value = self.cipher.decrypt(encrypted_value)
                    decrypted[key] = decrypted_value.decode()
                except Exception as e:
                    logger.error(f"Failed to decrypt field {key}: {e}")
                    decrypted[key] = ""
            else:
                decrypted[key] = ""
        return decrypted

    def save_integration(
        self,
        user_id: str,
        platform: str,
        credentials: Dict[str, str],
        is_connected: bool = True
    ) -> Dict[str, Any]:
        """
        Save or update integration credentials for a user
        
        Args:
            user_id: User ID
            platform: Platform name (facebook, youtube, linkedin, etc.)
            credentials: Dictionary of credential fields
            is_connected: Whether the integration is connected
            
        Returns:
            Saved integration document
        """
        self._ensure_connection()

        try:
            # Encrypt credentials
            encrypted_credentials = self._encrypt_credentials(credentials)

            integration_data = {
                "user_id": user_id,
                "platform": platform,
                "credentials": encrypted_credentials,
                "is_connected": is_connected,
                "last_updated": datetime.now(timezone.utc),
                "last_tested": datetime.now(timezone.utc) if is_connected else None
            }

            # Upsert - update if exists, insert if not
            result = self.collection.update_one(
                {"user_id": user_id, "platform": platform},
                {
                    "$set": integration_data,
                    "$setOnInsert": {"created_at": datetime.now(timezone.utc)}
                },
                upsert=True
            )

            if result.upserted_id:
                logger.info(f" Created new integration for user {user_id}: {platform}")
            else:
                logger.info(f" Updated integration for user {user_id}: {platform}")

            # Return the saved document (without decrypted credentials for security)
            saved_doc = self.collection.find_one({"user_id": user_id, "platform": platform})
            if saved_doc:
                saved_doc.pop('credentials', None)  # Remove credentials from response
            return saved_doc

        except Exception as e:
            logger.error(f"ERROR: Error saving integration: {e}")
            raise

    def get_integration(self, user_id: str, platform: str, decrypt: bool = False) -> Optional[Dict[str, Any]]:
        """
        Get integration for a specific platform
        
        Args:
            user_id: User ID
            platform: Platform name
            decrypt: Whether to decrypt credentials (only for authorized operations)
            
        Returns:
            Integration document or None
        """
        self._ensure_connection()

        try:
            integration = self.collection.find_one({
                "user_id": user_id,
                "platform": platform
            })

            if not integration:
                return None

            # Decrypt credentials if requested
            if decrypt and "credentials" in integration:
                integration["credentials"] = self._decrypt_credentials(integration["credentials"])
            else:
                # Remove credentials from response for security
                integration.pop("credentials", None)

            return integration

        except Exception as e:
            logger.error(f"ERROR: Error getting integration: {e}")
            return None

    def get_all_integrations(self, user_id: str, decrypt: bool = False) -> List[Dict[str, Any]]:
        """
        Get all integrations for a user
        
        Args:
            user_id: User ID
            decrypt: Whether to decrypt credentials
            
        Returns:
            List of integration documents
        """
        self._ensure_connection()

        try:
            integrations = list(self.collection.find({"user_id": user_id}))

            for integration in integrations:
                if decrypt and "credentials" in integration:
                    integration["credentials"] = self._decrypt_credentials(integration["credentials"])
                else:
                    integration.pop("credentials", None)

            return integrations

        except Exception as e:
            logger.error(f"ERROR: Error getting integrations: {e}")
            return []

    def delete_integration(self, user_id: str, platform: str) -> bool:
        """
        Delete an integration
        
        Args:
            user_id: User ID
            platform: Platform name
            
        Returns:
            True if deleted, False otherwise
        """
        self._ensure_connection()

        try:
            result = self.collection.delete_one({
                "user_id": user_id,
                "platform": platform
            })

            if result.deleted_count > 0:
                logger.info(f"  Deleted integration for user {user_id}: {platform}")
                return True
            else:
                logger.warning(f"WARNING:  No integration found to delete for user {user_id}: {platform}")
                return False

        except Exception as e:
            logger.error(f"ERROR: Error deleting integration: {e}")
            return False

    def update_connection_status(
        self,
        user_id: str,
        platform: str,
        is_connected: bool,
        error_message: Optional[str] = None
    ) -> bool:
        """
        Update the connection status of an integration
        
        Args:
            user_id: User ID
            platform: Platform name
            is_connected: Whether the integration is connected
            error_message: Optional error message if connection failed
            
        Returns:
            True if updated, False otherwise
        """
        self._ensure_connection()

        try:
            update_data = {
                "is_connected": is_connected,
                "last_tested": datetime.now(timezone.utc)
            }

            if error_message:
                update_data["last_error"] = error_message
            else:
                update_data["last_error"] = None

            result = self.collection.update_one(
                {"user_id": user_id, "platform": platform},
                {"$set": update_data}
            )

            if result.modified_count > 0:
                logger.info(f" Updated connection status for user {user_id}: {platform} -> {is_connected}")
                return True
            else:
                logger.warning(f"WARNING:  No integration found to update for user {user_id}: {platform}")
                return False

        except Exception as e:
            logger.error(f"ERROR: Error updating connection status: {e}")
            return False

# Global instance
integrations_service = IntegrationsService()
