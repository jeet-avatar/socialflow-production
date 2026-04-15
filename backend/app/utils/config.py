"""
Secure configuration management for AWS deployment
Loads environment variables and validates required settings
"""

import os
from typing import Optional
from dotenv import load_dotenv
import logging

# Load environment variables from .env file (for local development)
load_dotenv()

logger = logging.getLogger(__name__)

class Config:
    """Centralized configuration management"""

    # MongoDB Atlas Configuration — all values must come from environment variables
    MONGODB_USERNAME: Optional[str] = os.getenv('MONGODB_USERNAME')
    MONGODB_PASSWORD: Optional[str] = os.getenv('MONGODB_PASSWORD')
    MONGODB_CLUSTER: Optional[str] = os.getenv('MONGODB_CLUSTER')
    MONGODB_DATABASE: str = os.getenv('MONGODB_DATABASE', 'socialflow')
    MONGODB_COLLECTION: str = os.getenv('MONGODB_COLLECTION', 'companies')

    # API Keys
    OPENAI_API_KEY: Optional[str] = os.getenv('OPENAI_API_KEY')
    HEYGEN_API_KEY: Optional[str] = os.getenv('HEYGEN_API_KEY')

    # Application Settings
    ENVIRONMENT: str = os.getenv('ENVIRONMENT', 'development')
    LOG_LEVEL: str = os.getenv('LOG_LEVEL', 'INFO')
    PORT: int = int(os.getenv('PORT', '8000'))

    # Manual hosting doesn't need AWS settings

    @classmethod
    def validate_required_vars(cls) -> bool:
        """Validate that all required environment variables are set"""
        # MONGO_URI bypasses Atlas credentials — skip those checks
        if os.getenv("MONGO_URI", "").strip():
            required_vars = {'OPENAI_API_KEY': cls.OPENAI_API_KEY}
        else:
            required_vars = {
                'MONGODB_USERNAME': cls.MONGODB_USERNAME,
                'MONGODB_PASSWORD': cls.MONGODB_PASSWORD,
                'MONGODB_CLUSTER': cls.MONGODB_CLUSTER,
                'OPENAI_API_KEY': cls.OPENAI_API_KEY,
            }

        missing_vars = [var for var, value in required_vars.items() if not value]

        if missing_vars:
            logger.error(f"Missing required environment variables: {', '.join(missing_vars)}")
            logger.error("Please set these variables before running the application")
            return False

        return True

    @classmethod
    def is_production(cls) -> bool:
        """Check if running in production environment"""
        return cls.ENVIRONMENT.lower() == 'production'

    @classmethod
    def get_mongodb_connection_string(cls) -> str:
        """Build MongoDB connection string.

        Priority:
        1. MONGO_URI env var (local dev / Docker Compose / self-hosted)
        2. Atlas SRV URI built from MONGODB_USERNAME / PASSWORD / CLUSTER
        """
        direct_uri = os.getenv("MONGO_URI", "").strip()
        if direct_uri:
            return direct_uri

        import urllib.parse

        if not cls.MONGODB_USERNAME:
            raise ValueError("MONGODB_USERNAME (or MONGO_URI) is required")
        if not cls.MONGODB_PASSWORD:
            raise ValueError("MONGODB_PASSWORD (or MONGO_URI) is required")
        if not cls.MONGODB_CLUSTER:
            raise ValueError("MONGODB_CLUSTER (or MONGO_URI) is required")

        encoded_password = urllib.parse.quote_plus(cls.MONGODB_PASSWORD)
        return (
            f"mongodb+srv://{cls.MONGODB_USERNAME}:{encoded_password}@{cls.MONGODB_CLUSTER}/"
            f"?retryWrites=true&w=majority&appName=SocialFlow"
        )

# Global config instance
config = Config()

# Validate configuration on import
if not config.validate_required_vars():
    logger.warning("Some required environment variables are missing. Application may not function correctly.")
