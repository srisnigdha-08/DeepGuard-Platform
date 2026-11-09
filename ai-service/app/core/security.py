import logging
import secrets
from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader
from app.core.config import settings

logger = logging.getLogger(__name__)

# APIKeyHeader extracts the header value; auto_error=False lets us return custom sanitized 401s
API_KEY_HEADER = APIKeyHeader(name="X-Service-Key", auto_error=False)

DISALLOWED_SERVICE_KEYS = {
    "change-this-in-production",
    "shared-secret-between-node-and-python",
    "replace_with_secure_random_64_char_hex_key",
    "your_64_char_hex_service_key_here",
    "your_ai_service_secret_key_here",
    "default",
    "secret",
    "password",
    "admin",
    "123456",
}

def verify_service_key(api_key: str = Security(API_KEY_HEADER)) -> str:
    """
    Verifies that incoming service-to-service requests present a valid X-Service-Key.
    
    Security controls:
    1. Rejects missing, empty, or whitespace-only headers with HTTP 401.
    2. Uses constant-time comparison (secrets.compare_digest) to prevent timing attacks.
    3. Fails closed with HTTP 500 if the service has no valid secret configured.
    4. Rejects well-known example/placeholder secrets across all operational environments.
    5. Enforces minimum 32-character key entropy in production.
    6. Sanitizes logging: never prints secret keys in log records, exceptions, or responses.
    """
    expected_key = settings.effective_service_key

    # 1. Fail-closed check: Service has no valid secret configured
    if not expected_key:
        logger.error("AI service authentication misconfigured: No service key configured.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Service authentication configuration error",
        )

    # 2. Insecure placeholder rejection across development, staging, and production
    normalized_expected = expected_key.strip().lower()
    if normalized_expected in DISALLOWED_SERVICE_KEYS:
        logger.error("AI service authentication misconfigured: Insecure placeholder key detected.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Insecure service authentication configuration: Placeholder credentials are not permitted",
        )

    # 3. Production key entropy requirement (minimum 32 chars)
    if settings.ENVIRONMENT.lower() == "production" and len(expected_key.strip()) < 32:
        logger.error("AI service authentication misconfigured: Key length insufficient for production (min 32 chars).")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Insecure service authentication configuration: Key length must be at least 32 characters in production",
        )

    # 4. Rejection of missing, empty, or non-string headers
    if not api_key or not isinstance(api_key, str) or not api_key.strip():
        logger.warning("Authentication rejected: Missing or empty X-Service-Key header.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing service authentication key",
        )

    # 5. Timing-safe constant-time string comparison
    clean_provided = api_key.strip()
    if not secrets.compare_digest(clean_provided, expected_key.strip()):
        logger.warning("Authentication rejected: Invalid X-Service-Key provided.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing service authentication key",
        )

    return clean_provided
