#!/usr/bin/env python3
"""
Sync usage tracking with actual video counts
"""
import sys
import os
from datetime import datetime, timezone

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

from utils.mongodb_service import mongodb_service

def sync_usage_with_videos():
    """Sync usage tracking with actual video counts"""
    db = mongodb_service.get_database()
    videos_collection = db['videos']
    usage_collection = db['usage_tracking']
    
    print("\n🔄 Syncing Usage Tracking with Actual Video Counts")
    print("=" * 80)
    
    # Get video counts per user
    pipeline = [
        {"$group": {
            "_id": "$user_id",
            "video_count": {"$sum": 1}
        }}
    ]
    
    video_counts = list(videos_collection.aggregate(pipeline))
    
    # Get current month period
    now = datetime.now(timezone.utc)
    period_start = datetime(now.year, now.month, 1)
    period_end = datetime(now.year, now.month + 1, 1) if now.month < 12 else datetime(now.year + 1, 1, 1)
    
    for item in video_counts:
        user_id = item['_id']
        actual_count = item['video_count']
        
        # Get current tracked count
        usage = usage_collection.find_one({
            "user_id": user_id,
            "period_start": period_start
        })
        
        tracked_count = usage.get('videos', 0) if usage else 0
        
        print(f"\n👤 User ID: {user_id}")
        print(f"   Actual Videos: {actual_count}")
        print(f"   Tracked Videos: {tracked_count}")
        
        if actual_count != tracked_count:
            print(f"   ⚠️  MISMATCH! Updating to {actual_count}...")
            
            # Update usage tracking
            result = usage_collection.update_one(
                {
                    "user_id": user_id,
                    "period_start": period_start
                },
                {
                    "$set": {
                        "videos": actual_count,
                        "period_end": period_end,
                        "updated_at": datetime.now(timezone.utc)
                    },
                    "$setOnInsert": {
                        "created_at": datetime.now(timezone.utc),
                        "platforms": 0,
                        "team_members": 0,
                        "api_calls": 0
                    }
                },
                upsert=True
            )
            
            if result.modified_count > 0 or result.upserted_id:
                print("   ✅ Updated successfully!")
            else:
                print("   ⚠️  Update failed")
        else:
            print("   ✅ Already in sync")

    print("\n" + "=" * 80)
    print("✅ Sync complete!")

if __name__ == "__main__":
    sync_usage_with_videos()
