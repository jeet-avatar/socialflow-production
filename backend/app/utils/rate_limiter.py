from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

LIMIT_AUTH = "20/minute"
LIMIT_VIDEO_CREATE = "10/minute"
LIMIT_CONTENT_GENERATE = "5/minute"
LIMIT_LEADS_SEARCH = "30/minute"
