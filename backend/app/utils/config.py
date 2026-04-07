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

    # MongoDB Atlas Configuration
    MONGODB_USERNAME: str = os.getenv('MONGODB_USERNAME', 'jm_db_user')
    MONGODB_PASSWORD: Optional[str] = os.getenv('MONGODB_PASSWORD')
    MONGODB_CLUSTER: str = os.getenv('MONGODB_CLUSTER', 'socialflow.f2ucauv.mongodb.net')
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
        required_vars = {
            'MONGODB_PASSWORD': cls.MONGODB_PASSWORD,
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
        """Build secure MongoDB connection string"""
        import urllib.parse

        if not cls.MONGODB_PASSWORD:
            raise ValueError("MONGODB_PASSWORD is required")

        # URL encode the password to handle special characters
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
