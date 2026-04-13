import json
import logging
import os

logger = logging.getLogger(__name__)


def load_secrets_from_aws(secret_name: str) -> dict:
    """Fetch secrets from AWS Secrets Manager. Returns {} if not in production or on any error."""
    if os.getenv("ENVIRONMENT", "").lower() != "production":
        return {}
    try:
        import boto3
        client = boto3.client(
            "secretsmanager",
            region_name=os.getenv("AWS_REGION", "us-east-1"),
        )
        response = client.get_secret_value(SecretId=secret_name)
        secrets = json.loads(response["SecretString"])
        logger.info(f"Loaded {len(secrets)} secrets from AWS Secrets Manager ({secret_name})")
        return secrets
    except Exception as exc:
        logger.warning(f"Could not load secrets from AWS ({secret_name}): {exc}")
        return {}


def init_secrets() -> None:
    """Load secrets from AWS Secrets Manager into os.environ (only if key not already set)."""
    secret_name = os.getenv("AWS_SECRET_NAME", "")
    if not secret_name:
        return
    secrets = load_secrets_from_aws(secret_name)
    for key, value in secrets.items():
        if key not in os.environ:
            os.environ[key] = str(value)
