import io
import pytest
from fastapi.testclient import TestClient
from main import app
from app.core.config import settings
from app.core.security import verify_service_key


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


# ── 1. Unauthenticated Health Preservation ───────────────────────────────────

def test_health_remains_unauthenticated(client):
    """Preservation of intended health/readiness behavior: /health must never require authentication."""
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ["healthy", "ok"]
    assert "models_loaded" in data


# ── 2. Rejection of Missing Credentials ─────────────────────────────────────

@pytest.mark.parametrize("endpoint,method", [
    ("/model/info", "get"),
    ("/detect/image", "post"),
    ("/detect/video", "post"),
    ("/detect/audio", "post"),
])
def test_missing_service_key_rejected(client, endpoint, method):
    """Missing service key must be rejected with HTTP 401 across all protected routes."""
    if method == "get":
        res = client.get(endpoint)
    else:
        # Send empty payload without auth header
        res = client.post(endpoint, files={"file": ("dummy.jpg", b"dummy", "image/jpeg")})

    assert res.status_code == 401
    data = res.json()
    assert data.get("detail") == "Invalid or missing service authentication key"


# ── 3. Rejection of Invalid Credentials ─────────────────────────────────────

def test_invalid_service_key_rejected(client):
    """Invalid service key must be rejected with HTTP 401."""
    headers = {"X-Service-Key": "an-invalid-and-incorrect-service-key-12345"}
    res = client.get("/model/info", headers=headers)
    assert res.status_code == 401
    assert res.json().get("detail") == "Invalid or missing service authentication key"


# ── 4. Rejection of Malformed / Empty Headers ───────────────────────────────

@pytest.mark.parametrize("malformed_key", [
    "",
    "   ",
    "\t\n",
    "Bearer token-instead-of-key",
])
def test_malformed_service_key_rejected(client, malformed_key):
    """Malformed, whitespace-only, or empty service keys must be rejected with HTTP 401."""
    headers = {"X-Service-Key": malformed_key}
    res = client.get("/model/info", headers=headers)
    assert res.status_code == 401
    assert res.json().get("detail") == "Invalid or missing service authentication key"


# ── 5. Acceptance of Valid Service Authentication ───────────────────────────

def test_valid_service_key_accepted(client):
    """Legitimate backend request with valid X-Service-Key must succeed with HTTP 200."""
    headers = {"X-Service-Key": settings.effective_service_key}
    res = client.get("/model/info", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "model_name" in data
    assert "EfficientNet-B4" in data["model_name"]


# ── 6. Fail-Closed on Missing Server Configuration ──────────────────────────

def test_missing_server_secret_fails_closed(client, monkeypatch):
    """If AI microservice has no secret configured, all requests must fail closed with HTTP 500."""
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "")
    monkeypatch.setattr(settings, "SERVICE_SECRET_KEY", "")

    headers = {"X-Service-Key": "some-key"}
    res = client.get("/model/info", headers=headers)
    assert res.status_code == 500
    assert "configuration error" in res.json().get("detail", "").lower()


# ── 7. Rejection of Insecure Placeholders Across Environments ────────────────

@pytest.mark.parametrize("placeholder", [
    "change-this-in-production",
    "shared-secret-between-node-and-python",
    "your_64_char_hex_service_key_here",
    "default",
    "secret",
    "password",
])
def test_insecure_placeholder_fails_closed_across_environments(client, monkeypatch, placeholder):
    """Placeholder credentials must trigger fail-closed HTTP 500 in development, staging, or production."""
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", placeholder)
    monkeypatch.setattr(settings, "SERVICE_SECRET_KEY", placeholder)

    headers = {"X-Service-Key": placeholder}
    res = client.get("/model/info", headers=headers)
    assert res.status_code == 500
    assert "placeholder" in res.json().get("detail", "").lower() or "insecure" in res.json().get("detail", "").lower()


def test_short_key_rejected_in_production(client, monkeypatch):
    """In production mode, keys shorter than 32 characters must trigger HTTP 500 fail-closed."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "AI_SERVICE_KEY", "short-16-char-key!!")
    monkeypatch.setattr(settings, "SERVICE_SECRET_KEY", "short-16-char-key!!")

    headers = {"X-Service-Key": "short-16-char-key!!"}
    res = client.get("/model/info", headers=headers)
    assert res.status_code == 500
    assert "at least 32 characters" in res.json().get("detail", "").lower()


# ── 8. Prevention of Secret Exposure in API Responses and Headers ───────────

def test_secret_never_exposed_in_responses(client):
    """Verify raw secret key is never leaked in error messages, response bodies, or headers."""
    secret = settings.effective_service_key
    assert secret, "Test precondition: effective secret must not be empty"

    # Test 401 error response
    res_401 = client.get("/model/info", headers={"X-Service-Key": "wrong"})
    assert secret not in res_401.text
    for h_name, h_val in res_401.headers.items():
        assert secret not in h_val

    # Test 200 success response
    res_200 = client.get("/model/info", headers={"X-Service-Key": secret})
    assert secret not in res_200.text
    for h_name, h_val in res_200.headers.items():
        assert secret not in h_val


# ── 9. Backend-to-AI Service Request Simulation ─────────────────────────────

def test_backend_detection_request_simulation(client, monkeypatch):
    """
    Simulates the exact request format sent by Node.js AIService.analyzeImage:
    - Content-Type: multipart/form-data
    - Header: X-Service-Key
    - Valid JPEG payload with magic bytes (0xFF 0xD8 0xFF)
    """
    # Create valid minimal JPEG bytes
    jpeg_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\xff\xd9"

    # Mock image detector analyze to avoid running full GPU inference in this contract test
    mock_result = {
        "status": "success",
        "verdict": "REAL",
        "confidence": 0.05,
        "face_detected": True,
        "is_fake": False,
    }
    import main
    monkeypatch.setattr(main.image_detector, "analyze", lambda path: mock_result)

    headers = {
        "X-Service-Key": settings.effective_service_key,
    }
    files = {
        "file": ("backend_upload.jpg", io.BytesIO(jpeg_bytes), "image/jpeg"),
    }

    res = client.post("/detect/image", files=files, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["verdict"] == "REAL"
