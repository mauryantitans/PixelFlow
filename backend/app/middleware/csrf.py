"""
CSRF protection middleware (double-submit cookie).

Cookie-based auth is automatically attached by the browser, which makes
state-changing requests forgeable across sites. To prevent that, the SPA reads
the non-httpOnly ``pf_csrf`` cookie and echoes it back in the ``X-CSRF-Token``
header; this middleware rejects unsafe requests whose header doesn't match the
cookie.

Enforcement is scoped so it never affects non-browser clients or the
session-establishing endpoints:
  * only unsafe methods (POST/PUT/DELETE/PATCH) under ``/api``,
  * only when an auth cookie is actually present (pure ``Authorization: Bearer``
    API clients are not cookie-driven and therefore not CSRF-able), and
  * never on the endpoints that create the session before a CSRF cookie exists
    (login / register / Google OAuth).
"""

import secrets

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.utils.auth import ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE

UNSAFE_METHODS = {"POST", "PUT", "DELETE", "PATCH"}

# Endpoints exempt from CSRF:
#  * login/register/oauth — establish the session before any CSRF cookie exists.
#  * forgot-password/reset-password/verify-email — reached from an emailed link,
#    possibly in a browser with no session; they act only through the address or
#    the signed single-use token in the body, never through the auth cookie.
#  * heartbeat/cleanup-session — keyed by a client-supplied session_id (not the
#    authenticated identity) and reached via fetch/sendBeacon which can't set
#    custom headers; forging them can't act on the user's account.
EXEMPT_PATHS = {
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/google/login",
    "/api/auth/google/callback",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/auth/verify-email",
    "/api/images/heartbeat",
    "/api/images/cleanup-session",
}


class CSRFMiddleware(BaseHTTPMiddleware):
    """Enforce double-submit-cookie CSRF protection on cookie-authenticated writes."""

    async def dispatch(self, request, call_next):
        path = request.url.path
        if (
            request.method in UNSAFE_METHODS
            and path.startswith("/api")
            and path not in EXEMPT_PATHS
        ):
            has_auth_cookie = bool(
                request.cookies.get(ACCESS_COOKIE) or request.cookies.get(REFRESH_COOKIE)
            )
            if has_auth_cookie:
                header = request.headers.get("x-csrf-token")
                cookie = request.cookies.get(CSRF_COOKIE)
                if not header or not cookie or not secrets.compare_digest(header, cookie):
                    return JSONResponse(
                        status_code=403,
                        content={
                            "success": False,
                            "error": "CSRF validation failed",
                            "message": "Missing or invalid CSRF token.",
                        },
                    )
        return await call_next(request)
