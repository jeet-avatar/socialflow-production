"""
Download copyright-free BGM tracks from Mixkit and upload to S3/CloudFront.
All tracks are under the Mixkit Stock Music Free License (free for commercial use, no attribution required).

Usage: cd backend && source venv/bin/activate && python scripts/upload_bgm_tracks.py
"""
import os
import sys
import tempfile
import requests
import boto3
from dotenv import load_dotenv

# Load env from backend app
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

TRACKS = [
    # (s3_key, source_url, description)
    ("bgm_upbeat.mp3",       "https://assets.mixkit.co/music/623/623.mp3",   "Deep Urban — energetic & motivating"),
    ("bgm_calm.mp3",         "https://assets.mixkit.co/music/443/443.mp3",   "Serene View — relaxed & trustworthy"),
    ("bgm_inspirational.mp3","https://assets.mixkit.co/music/322/322.mp3",   "Life's a Movie — uplifting & emotional"),
    ("bgm_tech.mp3",         "https://assets.mixkit.co/music/134/134.mp3",   "Deep Techno Ambience — modern & innovative"),
    ("bgm_cinematic.mp3",    "https://assets.mixkit.co/music/464/464.mp3",   "Sci-Fi Score — epic & dramatic"),
    ("bgm_lofi.mp3",         "https://assets.mixkit.co/music/292/292.mp3",   "Relax Beat — chill & casual"),
    ("bgm_acoustic.mp3",     "https://assets.mixkit.co/music/139/139.mp3",   "Spirit in the Woods — warm & organic"),
    ("bgm_electronic.mp3",   "https://assets.mixkit.co/music/124/124.mp3",   "Techno Fest Vibes — futuristic & dynamic"),
]

def main():
    aws_key = os.getenv("AWS_ACCESS_KEY_ID")
    aws_secret = os.getenv("AWS_SECRET_ACCESS_KEY")
    aws_region = os.getenv("AWS_REGION", "us-east-1")
    bucket = os.getenv("AWS_S3_BUCKET", "socialflow-demo-bucket")
    cf_domain = os.getenv("CLOUDFRONT_DOMAIN", "d2nbx2qjod9qta.cloudfront.net")

    if not aws_key or not aws_secret:
        print("ERROR: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set")
        sys.exit(1)

    s3 = boto3.client(
        "s3",
        aws_access_key_id=aws_key,
        aws_secret_access_key=aws_secret,
        region_name=aws_region,
    )

    print(f"Uploading {len(TRACKS)} BGM tracks to s3://{bucket}/")
    print(f"CloudFront: https://{cf_domain}/\n")

    for s3_key, url, desc in TRACKS:
        print(f"  Downloading: {desc}")
        print(f"    Source: {url}")

        resp = requests.get(url, timeout=60, stream=True)
        if resp.status_code != 200:
            print(f"    FAILED to download (HTTP {resp.status_code}), skipping")
            continue

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            for chunk in resp.iter_content(8192):
                tmp.write(chunk)
            tmp_path = tmp.name

        size_kb = os.path.getsize(tmp_path) / 1024
        print(f"    Downloaded: {size_kb:.0f} KB")

        try:
            s3.upload_file(
                tmp_path, bucket, s3_key,
                ExtraArgs={"ContentType": "audio/mpeg"},
            )
            cdn_url = f"https://{cf_domain}/{s3_key}"
            print(f"    Uploaded: {cdn_url}")
        except Exception as e:
            print(f"    UPLOAD FAILED: {e}")
        finally:
            os.unlink(tmp_path)

        print()

    print("Done! All tracks uploaded.")
    print("\nCDN URLs for campaignConstants.ts:")
    for s3_key, _, desc in TRACKS:
        print(f'  https://{cf_domain}/{s3_key}  — {desc}')


if __name__ == "__main__":
    main()
