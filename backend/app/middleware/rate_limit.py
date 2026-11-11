"""
Rate Limiting Middleware for PixelFlow

Prevents API abuse by limiting requests per time window.
All settings can be adjusted in app/core/security_config.py
"""

from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Dict, Tuple
import logging

from app.core.security_config import RateLimiting, SecurityLogging

logger = logging.getLogger(__name__)

# In-memory storage for rate limiting
# Format: {ip_address: {endpoint: [(timestamp, count)]}}
request_history: Dict[str, Dict[str, list]] = defaultdict(lambda: defaultdict(list))


def client_ip_for(request: Request) -> str:
    """The client's IP for rate limiting.

    With RateLimiting.TRUSTED_PROXY_HOPS = n > 0, take the n-th entry from the
    right of X-Forwarded-For (the one written by the outermost proxy we
    trust); entries further left are client-supplied and ignored.
    """
    hops = RateLimiting.TRUSTED_PROXY_HOPS
    if hops > 0:
        xff = request.headers.get("x-forwarded-for", "")
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        if len(parts) >= hops:
            return parts[-hops]
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware to enforce rate limiting on API endpoints"""
    
    def __init__(self, app):
        super().__init__(app)
        self.enabled = RateLimiting.ENABLED
    
    async def dispatch(self, request: Request, call_next):
        """Check rate limits before processing request"""
        
        # Skip if rate limiting is disabled
        if not self.enabled:
            return await call_next(request)
        
        # Get client IP (honours TRUSTED_PROXY_HOPS behind Render / Vercel)
        client_ip = client_ip_for(request)
        
        # Check if IP is exempted
        if client_ip in RateLimiting.EXEMPTED_IPS:
            return await call_next(request)

        # Get endpoint path
        path = request.url.path
        if path in RateLimiting.EXEMPTED_PATHS:
            return await call_next(request)
        
        # Determine rate limit based on endpoint
        limit, window = self._get_rate_limit(path)
        
        # Check if rate limit is exceeded
        if self._is_rate_limited(client_ip, path, limit, window):
            if SecurityLogging.LOG_RATE_LIMIT_VIOLATIONS:
                logger.warning(
                    f"Rate limit exceeded for IP {client_ip} on endpoint {path}. "
                    f"Limit: {limit} requests per {window.total_seconds()}s"
                )
            
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "Rate limit exceeded",
                    "message": RateLimiting.RATE_LIMIT_MESSAGE,
                    "limit": limit,
                    "window_seconds": int(window.total_seconds())
                }
            )
        
        # Record this request
        self._record_request(client_ip, path)
        
        # Process request
        response = await call_next(request)
        return response
    
    def _get_rate_limit(self, path: str) -> Tuple[int, timedelta]:
        """Determine rate limit based on endpoint path"""
        
        # Admin endpoints (most restrictive)
        if "/admin/" in path:
            return RateLimiting.ADMIN_REQUESTS, RateLimiting.ADMIN_WINDOW
        
        # Auth endpoints (strict)
        if "/auth/" in path or "/login" in path or "/register" in path:
            return RateLimiting.AUTH_REQUESTS, RateLimiting.AUTH_WINDOW
        
        # Upload endpoints
        if "/upload" in path or "/images/upload" in path:
            return RateLimiting.UPLOAD_REQUESTS, RateLimiting.UPLOAD_WINDOW
        
        # Processing endpoints
        if "/process" in path or "/processing/" in path:
            return RateLimiting.PROCESS_REQUESTS, RateLimiting.PROCESS_WINDOW
        
        # Default rate limit for all other endpoints
        return RateLimiting.DEFAULT_REQUESTS, RateLimiting.DEFAULT_WINDOW
    
    def _is_rate_limited(self, ip: str, endpoint: str, limit: int, window: timedelta) -> bool:
        """Check if the IP has exceeded the rate limit for this endpoint"""

        current_time = datetime.now(timezone.utc)
        cutoff_time = current_time - window

        # Get request history for this IP and endpoint
        history = request_history[ip][endpoint]

        # Remove old requests outside the time window
        request_history[ip][endpoint] = [
            req_time for req_time in history if req_time > cutoff_time
        ]

        # Prune the IP entirely if all its endpoint histories are now empty
        # (prevents the dict from growing unboundedly over time)
        if all(len(v) == 0 for v in request_history[ip].values()):
            del request_history[ip]

        # Check if limit is exceeded (re-read from dict in case we just pruned)
        return len(request_history.get(ip, {}).get(endpoint, [])) >= limit

    def _record_request(self, ip: str, endpoint: str):
        """Record a new request"""
        request_history[ip][endpoint].append(datetime.now(timezone.utc))
    
    @staticmethod
    def clear_history():
        """Clear all rate limiting history (useful for testing)"""
        request_history.clear()
    
    @staticmethod
    def get_stats() -> dict:
        """Get rate limiting statistics"""
        total_ips = len(request_history)
        total_requests = sum(
            sum(len(endpoints) for endpoints in ip_data.values())
            for ip_data in request_history.values()
        )
        
        return {
            "tracked_ips": total_ips,
            "total_requests_tracked": total_requests,
            "enabled": RateLimiting.ENABLED
        }
