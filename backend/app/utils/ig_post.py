"""
Instagram Reels uploader.
Passes video URL directly to Instagram — same pattern as test_fal_video.py.
"""

import time
import requests

GRAPH = "https://graph.facebook.com/v25.0"


def post_reel(video_url: str, caption: str, ig_account_id: str, access_token: str) -> dict:
    """Post a video to Instagram as a Reel."""
    try:
        # Step 1 — create container
        print(f"[ig] Creating container for {ig_account_id}...")
        r = requests.post(
            f"{GRAPH}/{ig_account_id}/media",
            data={
                "media_type": "REELS",
                "video_url": video_url,
                "caption": caption,
                "access_token": access_token,
            },
            timeout=30,
        )
        r.raise_for_status()
        creation_id = r.json().get("id")
        if not creation_id:
            return {"success": False, "error": str(r.json())}
        print(f"[ig] Container created: {creation_id}")

        # Step 2 — poll until FINISHED
        print("[ig] Waiting for Instagram to process...")
        for attempt in range(1, 61):
            time.sleep(10)
            r = requests.get(
                f"{GRAPH}/{creation_id}",
                params={"fields": "status_code,status", "access_token": access_token},
                timeout=10,
            )
            if r.status_code != 200:
                return {"success": False, "error": f"Instagram status check failed: {r.text}"}
            status = r.json().get("status_code")
            print(f"[ig] Attempt {attempt}/60: {status}")
            if status == "FINISHED":
                break
            if status == "ERROR":
                print(f"[ig] Error details: {r.json()}")
                return {"success": False, "error": f"Instagram processing failed: {r.json().get('status')}"}
        else:
            return {"success": False, "error": "Timed out waiting for Instagram to process video"}

        # Step 3 — publish
        print("[ig] Publishing...")
        r = requests.post(
            f"{GRAPH}/{ig_account_id}/media_publish",
            data={"creation_id": creation_id, "access_token": access_token},
            timeout=30,
        )
        r.raise_for_status()
        media_id = r.json().get("id")
        print(f"[ig] Published! media_id={media_id}")
        return {"success": True, "media_id": media_id}

    except Exception as e:
        print(f"[ig] Exception: {e}")
        return {"success": False, "error": str(e)}
