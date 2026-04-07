"""
Videos Service - Handles video metadata CRUD operations with user isolation
Videos are stored in S3, only metadata (~1KB per video) is stored in MongoDB
"""

import logging
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone
from bson import ObjectId
from utils.mongodb_service import mongodb_service

logger = logging.getLogger(__name__)

_REGEX = "$regex"
_OPTIONS = "$options"


class VideosService:
    """Service for managing video metadata with user isolation"""

    def __init__(self):
        self.collection_name = 'videos'

    def create_video(self, video_data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """
        Create a new video metadata record for a user
        Stores only metadata (~1KB), actual video is in S3
        
        Args:
            video_data: Video metadata (NOT the video file)
            user_id: User ID who owns the video
            
        Returns:
            Created video document with _id
        """
        try:
            collection = mongodb_service.db[self.collection_name]

            # Prepare video metadata document
            video_doc = {
                **video_data,
                'user_id': user_id,
                'views': 0,
                'downloads': 0,
                'shares': 0,
                'created_at': datetime.now(timezone.utc).isoformat(),
                'updated_at': datetime.now(timezone.utc).isoformat()
            }

            # Insert metadata into MongoDB (NOT the video file)
            result = collection.insert_one(video_doc)
            video_doc['_id'] = str(result.inserted_id)

            logger.info(f"Created video metadata {video_doc['_id']} for user: {user_id}")
            logger.info(f"Video stored in S3: {video_data.get('s3_key', 'N/A')}")
            return video_doc

        except Exception as e:
            logger.error(f"ERROR: Failed to create video metadata: {e}")
            raise

    def get_user_videos(
        self,
        user_id: str,
        limit: int = 50,
        skip: int = 0,
        status: Optional[str] = None,
        company_name: Optional[str] = None,
        category: Optional[str] = None,
        is_favorite: Optional[bool] = None,
        sort_by: str = "created_at",
        sort_order: int = -1  # -1 for descending, 1 for ascending
    ) -> List[Dict[str, Any]]:
        """
        Get all video metadata for a specific user with filtering and pagination
        Returns metadata only, videos are streamed from S3
        
        Args:
            user_id: User ID to filter videos
            limit: Maximum number of videos to return
            skip: Number of videos to skip (for pagination)
            status: Filter by status (completed, processing, failed)
            company_name: Filter by company name
            category: Filter by category
            is_favorite: Filter favorites
            sort_by: Field to sort by
            sort_order: Sort order (-1 desc, 1 asc)
            
        Returns:
            List of video metadata documents
        """
        try:
            collection = mongodb_service.db[self.collection_name]

            # Build query with user isolation
            query = {'user_id': user_id}

            # Add optional filters
            if status:
                query['status'] = status
            if company_name:
                query['company_name'] = {_REGEX: company_name, _OPTIONS: 'i'}
            if category:
                query['category'] = category
            if is_favorite is not None:
                query['is_favorite'] = is_favorite

            logger.info(f"[videos_service] Query: {query}")
            logger.info(f"[videos_service] Sort: {sort_by} {sort_order}, Skip: {skip}, Limit: {limit}")

            # Execute query with pagination and sorting
            cursor = collection.find(query).sort(sort_by, sort_order).skip(skip).limit(limit)

            videos = []
            for doc in cursor:
                doc['_id'] = str(doc['_id'])
                videos.append(doc)

            logger.info(f"Retrieved {len(videos)} video metadata records for user: {user_id}")
            return videos

        except Exception as e:
            logger.error(f"ERROR: Failed to get videos: {e}")
            raise

    def get_video_by_id(self, video_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get specific video metadata by ID (with user isolation)
        
        Args:
            video_id: Video ID
            user_id: User ID (for authorization)
            
        Returns:
            Video metadata or None if not found
        """
        try:
            collection = mongodb_service.db[self.collection_name]

            # Query with user isolation
            video = collection.find_one({
                '_id': ObjectId(video_id),
                'user_id': user_id
            })

            if video:
                video['_id'] = str(video['_id'])
                logger.info(f"Retrieved video metadata {video_id} for user: {user_id}")
            else:
                logger.warning(f"WARNING: Video {video_id} not found for user: {user_id}")

            return video

        except Exception as e:
            logger.error(f"ERROR: Failed to get video: {e}")
            return None

    def update_video(self, video_id: str, user_id: str, update_data: Dict[str, Any]) -> bool:
        """
        Update video metadata (with user isolation)
        
        Args:
            video_id: Video ID
            user_id: User ID (for authorization)
            update_data: Fields to update
            
        Returns:
            True if updated, False otherwise
        """
        try:
            collection = mongodb_service.db[self.collection_name]

            # Add updated_at timestamp
            update_data['updated_at'] = datetime.now(timezone.utc).isoformat()

            # Update with user isolation
            result = collection.update_one(
                {'_id': ObjectId(video_id), 'user_id': user_id},
                {'$set': update_data}
            )

            if result.modified_count > 0:
                logger.info(f"Updated video metadata {video_id} for user: {user_id}")
                return True
            else:
                logger.warning(f"WARNING: Video {video_id} not found or not modified for user: {user_id}")
                return False

        except Exception as e:
            logger.error(f"ERROR: Failed to update video: {e}")
            return False

    def update_analytics(self, video_id: str, user_id: str, analytics_update: Dict[str, bool]) -> bool:
        """
        Update video analytics (views, downloads, shares)
        
        Args:
            video_id: Video ID
            user_id: User ID
            analytics_update: Dict with increment flags
            
        Returns:
            True if updated, False otherwise
        """
        try:
            collection = mongodb_service.db[self.collection_name]

            # Build increment operations
            inc_ops = {}
            if analytics_update.get('increment_views'):
                inc_ops['views'] = 1
            if analytics_update.get('increment_downloads'):
                inc_ops['downloads'] = 1
            if analytics_update.get('increment_shares'):
                inc_ops['shares'] = 1

            if not inc_ops:
                return False

            # Update analytics with user isolation
            update_ops = {
                '$inc': inc_ops,
                '$set': {
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                    'last_viewed_at': datetime.now(timezone.utc).isoformat()
                }
            }

            result = collection.update_one(
                {'_id': ObjectId(video_id), 'user_id': user_id},
                update_ops
            )

            if result.modified_count > 0:
                logger.info(f"Updated analytics for video {video_id}")
                return True
            return False

        except Exception as e:
            logger.error(f"ERROR: Failed to update analytics: {e}")
            return False

    def delete_video(self, video_id: str, user_id: str) -> Dict[str, Any]:
        """
        Delete video metadata (with user isolation)
        NOTE: This only deletes metadata. S3 cleanup should be done separately
        
        Args:
            video_id: Video ID
            user_id: User ID (for authorization)
            
        Returns:
            Dict with success status and S3 info for cleanup
        """
        try:
            collection = mongodb_service.db[self.collection_name]

            # Get video info before deletion (for S3 cleanup)
            video = collection.find_one({
                '_id': ObjectId(video_id),
                'user_id': user_id
            })

            if not video:
                logger.warning(f"WARNING: Video {video_id} not found for user: {user_id}")
                return {'success': False, 's3_key': None}

            # Delete metadata from MongoDB
            result = collection.delete_one({
                '_id': ObjectId(video_id),
                'user_id': user_id
            })

            if result.deleted_count > 0:
                logger.info(f"Deleted video metadata {video_id} for user: {user_id}")
                logger.info(f"S3 cleanup needed for: {video.get('s3_key', 'N/A')}")
                return {
                    'success': True,
                    's3_key': video.get('s3_key'),
                    's3_bucket': video.get('s3_bucket'),
                    'video_url': video.get('video_url')
                }
            else:
                return {'success': False, 's3_key': None}

        except Exception as e:
            logger.error(f"ERROR: Failed to delete video: {e}")
            return {'success': False, 's3_key': None}

    def get_videos_stats(self, user_id: str) -> Dict[str, Any]:
        """
        Get video statistics for a user
        
        Args:
            user_id: User ID
            
        Returns:
            Statistics dictionary
        """
        try:
            collection = mongodb_service.db[self.collection_name]

            # Get total count
            total_videos = collection.count_documents({'user_id': user_id})

            # Get count by status
            completed = collection.count_documents({'user_id': user_id, 'status': 'completed'})
            processing = collection.count_documents({'user_id': user_id, 'status': 'processing'})
            failed = collection.count_documents({'user_id': user_id, 'status': 'failed'})

            # Get total duration and file size
            pipeline = [
                {'$match': {'user_id': user_id, 'status': 'completed'}},
                {'$group': {
                    '_id': None,
                    'total_duration': {'$sum': '$duration'},
                    'total_file_size': {'$sum': '$file_size'},
                    'total_views': {'$sum': '$views'},
                    'total_downloads': {'$sum': '$downloads'}
                }}
            ]
            agg_result = list(collection.aggregate(pipeline))

            if agg_result:
                stats_data = agg_result[0]
                total_duration = stats_data.get('total_duration', 0)
                total_file_size = stats_data.get('total_file_size', 0)
                total_views = stats_data.get('total_views', 0)
                total_downloads = stats_data.get('total_downloads', 0)
            else:
                total_duration = 0
                total_file_size = 0
                total_views = 0
                total_downloads = 0

            stats = {
                'total_videos': total_videos,
                'completed': completed,
                'processing': processing,
                'failed': failed,
                'total_duration_seconds': total_duration,
                'total_duration_minutes': round(total_duration / 60, 2),
                'total_file_size_bytes': total_file_size,
                'total_file_size_mb': round(total_file_size / (1024 * 1024), 2),
                'total_views': total_views,
                'total_downloads': total_downloads
            }

            logger.info(f"Retrieved video stats for user: {user_id}")
            return stats

        except Exception as e:
            logger.error(f"ERROR: Failed to get video stats: {e}")
            return {
                'total_videos': 0,
                'completed': 0,
                'processing': 0,
                'failed': 0,
                'total_duration_seconds': 0,
                'total_duration_minutes': 0,
                'total_file_size_bytes': 0,
                'total_file_size_mb': 0,
                'total_views': 0,
                'total_downloads': 0
            }

    def search_videos(self, user_id: str, search_query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Search video metadata by title, description, company name, or tags
        
        Args:
            user_id: User ID
            search_query: Search query string
            limit: Maximum results
            
        Returns:
            List of matching video metadata
        """
        try:
            collection = mongodb_service.db[self.collection_name]

            # Build search query
            query = {
                'user_id': user_id,
                '$or': [
                    {'title': {_REGEX: search_query, _OPTIONS: 'i'}},
                    {'description': {_REGEX: search_query, _OPTIONS: 'i'}},
                    {'company_name': {_REGEX: search_query, _OPTIONS: 'i'}},
                    {'tags': {_REGEX: search_query, _OPTIONS: 'i'}},
                    {'category': {_REGEX: search_query, _OPTIONS: 'i'}}
                ]
            }

            cursor = collection.find(query).sort('created_at', -1).limit(limit)

            videos = []
            for doc in cursor:
                doc['_id'] = str(doc['_id'])
                videos.append(doc)

            logger.info(f"Found {len(videos)} videos matching '{search_query}' for user: {user_id}")
            return videos

        except Exception as e:
            logger.error(f"ERROR: Failed to search videos: {e}")
            return []

# Create singleton instance
videos_service = VideosService()
