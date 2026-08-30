import time
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from app.core.logging import set_request_id, get_logger

logger = get_logger("middleware.request")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming_rid = request.headers.get("X-Request-ID")
        rid = set_request_id(incoming_rid)
        start_time = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception as exc:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            logger.error(
                "%s %s -> FAILED after %.2fms: %s",
                request.method,
                request.url.path,
                duration_ms,
                exc,
            )
            raise exc

        duration_ms = (time.perf_counter() - start_time) * 1000.0
        response.headers["X-Request-ID"] = rid
        response.headers["X-Process-Time-Ms"] = f"{duration_ms:.2f}"
        
        # Log non-static requests
        if not request.url.path.startswith("/static"):
            logger.info(
                "%s %s -> status %d in %.2fms",
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
            )

        return response
