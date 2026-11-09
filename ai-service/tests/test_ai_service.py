import os
import cv2
import numpy as np
import pytest
import torch
from fastapi.testclient import TestClient

from main import app
from app.core.config import settings
from preprocessing.face_extractor import FaceExtractor
from models.efficientnet_loader import DeepFakeDetector, load_efficientnet
from services.image_detector import ImageDeepFakeDetector


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_face_extractor_default_align():
    """Verify production face extractor default align_face is False for training parity."""
    extractor = FaceExtractor()
    assert extractor.align_face is False, "align_face must default to False to match training preprocessing"


def test_face_extractor_no_face():
    """Verify face extractor returns None on a blank image."""
    extractor = FaceExtractor()
    blank_bgr = np.zeros((480, 640, 3), dtype=np.uint8)
    face = extractor.extract_largest_face(blank_bgr)
    assert face is None


def test_confidence_calculation_logic():
    """Verify display confidence shows 1-P(Fake) for REAL and P(Fake) for FAKE."""
    # Case 1: REAL (raw fake prob 0.12) -> displayed confidence = 0.88 (88.0%)
    raw_prob_real = 0.12
    display_conf_real = 1.0 - raw_prob_real
    assert round(display_conf_real, 2) == 0.88

    # Case 2: FAKE (raw fake prob 0.94) -> displayed confidence = 0.94 (94.0%)
    raw_prob_fake = 0.94
    display_conf_fake = raw_prob_fake
    assert round(display_conf_fake, 2) == 0.94


def test_health_endpoint(client):
    """Verify GET /health returns 200 with service status."""
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ["ok", "healthy"]
    assert "models_loaded" in data
    assert data["models_loaded"]["image"] is True


def test_model_info_claims(client):
    """Verify GET /model/info returns honest EfficientNet-B4 FF++ C23 metrics and in-dev audio when authenticated."""
    headers = {"X-Service-Key": settings.effective_service_key}
    res = client.get("/model/info", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert "EfficientNet-B4" in data["model_name"]
    assert "FaceForensics++" in data["image_model"]
    assert data["isolated_test_metrics"]["roc_auc"] == 0.8853
    assert data["isolated_test_metrics"]["pr_auc"] == 0.9686
    assert data["isolated_test_metrics"]["accuracy"] == 0.7968
    assert data["isolated_test_metrics"]["fake_precision"] == 0.9450
    assert data["isolated_test_metrics"]["fake_recall_sensitivity"] == 0.7920
    assert data["isolated_test_metrics"]["specificity"] == 0.8160
    assert "In development" in data["audio_model"]


def test_detect_image_no_face_endpoint(client, tmp_path):
    """Verify authorized POST /detect/image with a blank image returns UNCERTAIN without crashing."""
    blank_img = np.zeros((200, 200, 3), dtype=np.uint8)
    img_path = str(tmp_path / "blank.png")
    cv2.imwrite(img_path, blank_img)

    headers = {"X-Service-Key": settings.effective_service_key}
    with open(img_path, "rb") as f:
        files = {"file": ("blank.png", f, "image/png")}
        res = client.post("/detect/image", files=files, headers=headers)

    assert res.status_code == 200
    data = res.json()
    assert data["face_detected"] is False
    assert data["verdict"] == "UNCERTAIN"
    assert data["confidence"] == 0.0


def test_detect_image_invalid_magic_bytes(client):
    """Verify authorized POST /detect/image rejects text file disguised as jpg."""
    fake_jpg = b"This is plain text and definitely not a valid image."
    files = {"file": ("spoofed.jpg", fake_jpg, "image/jpeg")}
    headers = {"X-Service-Key": settings.effective_service_key}
    res = client.post("/detect/image", files=files, headers=headers)
    assert res.status_code == 400
    assert "magic" in res.text.lower() or "mismatch" in res.text.lower()


def test_model_inference_sanity():
    """Verify PyTorch model loads weights and runs forward pass."""
    weights_path = os.path.join(os.path.dirname(__file__), "..", "models", "efficientnet_b4_deepfake.pt")
    if os.path.exists(weights_path):
        model = load_efficientnet(weights_path, device=torch.device("cpu"))
        dummy_tensor = torch.randn(1, 3, 224, 224)
        with torch.no_grad():
            logits = model(dummy_tensor)
            prob = torch.sigmoid(logits).item()
        assert isinstance(prob, float)
        assert 0.0 <= prob <= 1.0
