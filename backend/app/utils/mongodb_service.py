from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
import logging
from utils.config import config

logging.basicConfig(level=getattr(logging, config.LOG_LEVEL.upper()))
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Field path constants (S1192)
# ---------------------------------------------------------------------------

_FLD_COMPANY_NAME = "company.company_name"
_FLD_COMPANY_WEBSITE = "company.website"
_FLD_COMPANY_LINKEDIN = "company.linkedin_url"
_REGEX_OP = "$regex"
_OPTS_OP = "$options"


def _now() -> datetime:
    """Return current UTC time as a timezone-aware datetime (S6903)."""
    return datetime.now(timezone.utc)


def _iregex(value: str) -> dict:
    """Build a case-insensitive regex match expression."""
    return {_REGEX_OP: f"^{value}$", _OPTS_OP: "i"}


class MongoDBService:
    def __init__(self):
        self.database_name = config.MONGODB_DATABASE
        self.collection_name = config.MONGODB_COLLECTION
        self.connection_string = config.get_mongodb_connection_string()

        self.client: Optional[MongoClient] = None
        self.db: Optional[Database] = None
        self.companies_collection: Optional[Collection] = None

    def connect(self):
        """Establish connection to MongoDB."""
        try:
            # TLS only for Atlas (mongodb+srv://) — local/Docker URIs don't use TLS
            _tls_opts = {"tls": True, "tlsAllowInvalidCertificates": True} \
                if self.connection_string.startswith("mongodb+srv://") else {}
            self.client = MongoClient(
                self.connection_string,
                serverSelectionTimeoutMS=30000,
                connectTimeoutMS=30000,
                socketTimeoutMS=30000,
                maxPoolSize=10,
                retryWrites=True,
                **_tls_opts,
            )
            self.client.admin.command("ping")
            self.db = self.client[self.database_name]
            self.companies_collection = self.db[self.collection_name]

            self.companies_collection.create_index(_FLD_COMPANY_NAME)
            self.companies_collection.create_index(_FLD_COMPANY_WEBSITE)
            self.companies_collection.create_index(_FLD_COMPANY_LINKEDIN)
            self.companies_collection.create_index("user_id")
            self.companies_collection.create_index("lastUpdated")

            logger.info(f"Connected to MongoDB Atlas: {self.database_name}.{self.collection_name}")
            return True

        except (ConnectionFailure, ServerSelectionTimeoutError) as e:
            logger.error(f"MongoDB Atlas connection failed: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error connecting to MongoDB: {e}")
            return False

    def get_database(self):
        """Get the database instance, connecting if necessary."""
        if self.db is None:
            self.connect()
        return self.db

    def disconnect(self):
        """Close MongoDB connection."""
        if self.client:
            self.client.close()
            logger.info("MongoDB connection closed")

    def _ensure_connected(self) -> bool:
        """Return True if the collection is ready; attempt connect otherwise."""
        return self.companies_collection is not None or self.connect()

    # -----------------------------------------------------------------------
    # Find helpers
    # -----------------------------------------------------------------------

    def find_existing_company(self, company_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Find existing company by company_name, website, or linkedin_url."""
        if not self._ensure_connected():  # S1066
            return None

        try:
            company_info = company_data.get("company", {})
            company_name = company_info.get("company_name") or company_info.get("name")
            website = company_info.get("website")
            linkedin_url = company_info.get("linkedin_url")

            search_criteria = []
            if company_name:
                search_criteria.append({_FLD_COMPANY_NAME: _iregex(company_name)})
                search_criteria.append({"company.name": _iregex(company_name)})
            if website:
                search_criteria.append({_FLD_COMPANY_WEBSITE: website})
            if linkedin_url:
                search_criteria.append({_FLD_COMPANY_LINKEDIN: linkedin_url})

            if not search_criteria:
                return None

            existing = self.companies_collection.find_one({"$or": search_criteria})
            if existing:
                logger.info(f"Found existing company: {company_name}")
            else:
                logger.info(f"No existing company found for: {company_name}")
            return existing

        except Exception as e:
            logger.error(f"Error finding existing company: {e}")
            return None

    def find_existing_company_for_user(
        self,
        company_name: str,
        website: str = None,
        linkedin_url: str = None,
        user_id: str = None,
    ) -> Optional[Dict[str, Any]]:
        """Find existing company for a specific user."""
        try:
            search_criteria = []
            if company_name:
                search_criteria.append({_FLD_COMPANY_NAME: _iregex(company_name)})
            if website:
                search_criteria.append({_FLD_COMPANY_WEBSITE: website})
            if linkedin_url:
                search_criteria.append({_FLD_COMPANY_LINKEDIN: linkedin_url})

            if not search_criteria:
                return None

            query = {
                "$and": [
                    {"user_id": user_id} if user_id else {},
                    {"$or": search_criteria},
                ]
            }
            existing = self.companies_collection.find_one(query)
            if existing:
                logger.info(f"Found existing company for user {user_id}: {company_name}")
            else:
                logger.info(f"No existing company found for user {user_id}: {company_name}")
            return existing

        except Exception as e:
            logger.error(f"Error finding existing company for user: {e}")
            return None

    # -----------------------------------------------------------------------
    # Deep-compare helpers (S3776 — extracted from compare_and_build_update)
    # -----------------------------------------------------------------------

    def _compare_lists(self, path: str, old_val: list, new_val: list, ops: dict) -> None:
        if new_val != old_val:
            ops[path] = new_val
            logger.info(f"Array updated: {path}")

    def _compare_values(self, path: str, old_val: Any, new_val: Any, ops: dict) -> None:
        if old_val != new_val:
            ops[path] = new_val
            logger.info(f"Field changed: {path}")

    def _deep_compare(
        self,
        old_dict: dict,
        new_dict: dict,
        ops: dict,
        path: str = "",
    ) -> None:
        """Recursively compare dicts and populate ``ops`` with changed fields."""
        for key, new_value in new_dict.items():
            if key.startswith("_"):
                continue
            current_path = f"{path}.{key}" if path else key
            if key not in old_dict:
                ops[current_path] = new_value
                logger.info(f"New field: {current_path}")
            elif isinstance(new_value, dict) and isinstance(old_dict[key], dict):
                self._deep_compare(old_dict[key], new_value, ops, current_path)
            elif isinstance(new_value, list) and isinstance(old_dict[key], list):
                self._compare_lists(current_path, old_dict[key], new_value, ops)
            else:
                self._compare_values(current_path, old_dict[key], new_value, ops)

    def compare_and_build_update(
        self, existing_data: Dict[str, Any], new_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Compare existing data with new data and build $set update operations."""
        update_ops: dict = {}

        # Always replace news wholesale so removed categories don't persist
        if "news" in new_data:
            update_ops["news"] = new_data["news"]

        new_data_no_news = {k: v for k, v in new_data.items() if k != "news"}
        self._deep_compare(existing_data, new_data_no_news, update_ops)

        update_ops["lastUpdated"] = _now()  # S6903

        if len(update_ops) > 1:  # more than just the timestamp
            logger.info(f"Changes detected, will update {len(update_ops)} fields")
        else:
            logger.info("No changes detected, only updating timestamp")

        return {"$set": update_ops} if update_ops else {}

    # -----------------------------------------------------------------------
    # Upsert helpers (S3776 — extracted from upsert_company_data)
    # -----------------------------------------------------------------------

    def _build_user_ids(self, existing_company: dict, user_id: str) -> list:
        """Return updated user_ids list with user_id added if missing."""
        existing_ids = existing_company.get("user_ids", [])
        if not isinstance(existing_ids, list):
            old_uid = existing_company.get("user_id")
            existing_ids = [old_uid] if old_uid else []
        if user_id not in existing_ids:
            existing_ids.append(user_id)
            logger.info(f"Adding user to company access list (total: {len(existing_ids)})")
        else:
            logger.info("User already has access to this company")
        return existing_ids

    def _apply_existing_update(
        self, existing_company: dict, company_data: dict, user_id: Optional[str]
    ) -> None:
        """Apply smart field-level update to an existing company document."""
        update_ops = self.compare_and_build_update(existing_company, company_data)

        if user_id:
            if not update_ops:
                update_ops = {"$set": {}}
            if "$set" not in update_ops:
                update_ops["$set"] = {}
            update_ops["$set"]["user_ids"] = self._build_user_ids(existing_company, user_id)

        if update_ops and update_ops.get("$set"):
            result = self.companies_collection.update_one({"_id": existing_company["_id"]}, update_ops)
            if result.modified_count > 0:
                logger.info("Updated existing company")
            else:
                logger.info("No actual changes made")
        else:
            logger.info("No updates needed")

    def _insert_new_company(self, company_data: dict, user_id: Optional[str]) -> dict:
        """Insert a new company document and return it."""
        company_data["createdAt"] = _now()  # S6903
        company_data["user_ids"] = [user_id] if user_id else []
        logger.info("Creating new company" + (" with first user access" if user_id else " without user association"))

        result = self.companies_collection.insert_one(company_data)
        if not result.inserted_id:
            raise RuntimeError("Failed to insert new company")  # S112
        logger.info("Inserted new company document")
        return self.companies_collection.find_one({"_id": result.inserted_id})

    def upsert_company_data(self, company_data: Dict[str, Any], user_id: str = None) -> Dict[str, Any]:
        """Insert new or smart-update existing company. Returns the final document."""
        if not self.connect():
            raise RuntimeError("MongoDB connection failed")  # S112

        try:
            company_data["lastUpdated"] = _now()  # S6903
            existing_company = self.find_existing_company(company_data)

            if existing_company:
                self._apply_existing_update(existing_company, company_data, user_id)
                return self.companies_collection.find_one({"_id": existing_company["_id"]})

            return self._insert_new_company(company_data, user_id)

        except Exception as e:
            logger.error(f"Error in upsert_company_data: {e}")
            raise

    # -----------------------------------------------------------------------
    # Query helpers
    # -----------------------------------------------------------------------

    def get_company_by_name(self, company_name: str, user_id: str = None) -> Optional[Dict[str, Any]]:
        """Get company by name with optional user filtering."""
        if not self._ensure_connected():  # S1066
            return None

        try:
            query: dict = {
                "$or": [
                    {_FLD_COMPANY_NAME: _iregex(company_name)},
                    {"company.name": _iregex(company_name)},
                ]
            }
            if user_id:
                query["user_ids"] = {"$in": [user_id]}
            return self.companies_collection.find_one(query)
        except Exception as e:
            logger.error(f"Error getting company by name: {e}")
            return None

    def get_all_companies(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get all companies sorted by last updated."""
        if not self._ensure_connected():  # S1066
            return []

        try:
            return list(self.companies_collection.find().limit(limit).sort("lastUpdated", -1))
        except Exception as e:
            logger.error(f"Error getting all companies: {e}")
            return []

    def get_companies_with_filter(self, query_filter: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        """Get companies with user-specific filtering."""
        if not self._ensure_connected():  # S1066
            return []

        try:
            return list(self.companies_collection.find(query_filter).limit(limit).sort("lastUpdated", -1))
        except Exception as e:
            logger.error(f"Error getting companies with filter: {e}")
            return []

    def save_company_with_user(self, company_data: Dict[str, Any], user_id: str) -> bool:
        """Save company data with user association."""
        try:
            company_data["user_id"] = user_id
            company_data["lastUpdated"] = _now()  # S6903

            company_info = company_data.get("company", {})
            existing = self.find_existing_company_for_user(
                company_info.get("company_name", ""),
                company_info.get("website", ""),
                company_info.get("linkedin_url", ""),
                user_id,
            )

            if existing:
                result = self.companies_collection.update_one({"_id": existing["_id"]}, {"$set": company_data})
                logger.info(f"Updated existing company for user {user_id}")
                return result.modified_count > 0

            result = self.companies_collection.insert_one(company_data)
            logger.info(f"Saved new company for user {user_id}: {result.inserted_id}")
            return True

        except Exception as e:
            logger.error(f"Error saving company with user: {e}")
            return False


# Global instance
mongodb_service = MongoDBService()
