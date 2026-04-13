import logging
import os

logger = logging.getLogger(__name__)

_s3_client = None


def _get_client():
    global _s3_client
    if _s3_client is None:
        import boto3
        _s3_client = boto3.client(
            "s3",
            region_name=os.getenv("AWS_REGION", "us-east-1"),
        )
    return _s3_client


def delete_s3_object(bucket: str, key: str) -> bool:
    """Delete an object from S3. Returns True on success, False on failure — never raises."""
    if not bucket or not key:
        logger.warning("delete_s3_object called with empty bucket or key — skipping")
        return False
    try:
        _get_client().delete_object(Bucket=bucket, Key=key)
        logger.info(f"S3 object deleted: s3://{bucket}/{key}")
        return True
    except Exception as exc:
        logger.warning(f"S3 delete failed for s3://{bucket}/{key}: {exc}")
        return False
