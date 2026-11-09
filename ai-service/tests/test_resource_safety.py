import os
import pytest
import io
from unittest.mock import MagicMock, patch
from PIL import Image
from fastapi.testclient import TestClient

from main import app, verify_magic, inference_semaphore
from app.core.config import settings
from services.image_detector import ImageDeepFakeDetector, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS
from preprocessing.frame_sampler import IntelligentFrameSampler


@pytest.fixture
def auth_headers():
    return {"X-Service-Key": settings.effective_service_key}


class TestImageDecompressionSafety:
    """Verifies PIL lazy header inspection and decompression bomb prevention."""

    def test_rejects_oversized_dimensions_before_full_decode(self, tmp_path):
        """Creates a synthetic image with header dimensions > 4096 and verifies rejection."""
        oversized_file = tmp_path / "oversized.png"
        img = Image.new("RGB", (4097, 100), color="blue")
        img.save(oversized_file)

        with patch("services.image_detector.GradCAM"):
            detector = ImageDeepFakeDetector(model=MagicMock(), device="cpu")
            with pytest.raises(ValueError) as excinfo:
                detector._preprocess(str(oversized_file))

        assert "exceeds maximum allowed" in str(excinfo.value)
        assert "4097x100" in str(excinfo.value)

    def test_rejects_oversized_pixel_count(self, tmp_path):
        """Verifies rejection when pixel count exceeds 16,000,000."""
        oversized_file = tmp_path / "huge_pixels.jpg"
        img = Image.new("RGB", (4000, 4001), color="white")
        img.save(oversized_file)

        with patch("services.image_detector.GradCAM"):
            detector = ImageDeepFakeDetector(model=MagicMock(), device="cpu")
            with pytest.raises(ValueError) as excinfo:
                detector._preprocess(str(oversized_file))

        assert "exceeds maximum allowed" in str(excinfo.value)

    def test_rejects_corrupted_image_safely(self, tmp_path):
        """Verifies corrupted image bytes fail safely with ValueError."""
        corrupt_file = tmp_path / "corrupt.jpg"
        corrupt_file.write_bytes(b"\xff\xd8\xff\xe0" + b"broken content")

        with patch("services.image_detector.GradCAM"):
            detector = ImageDeepFakeDetector(model=MagicMock(), device="cpu")
            with pytest.raises(ValueError) as excinfo:
                detector._preprocess(str(corrupt_file))

        assert "Corrupted or invalid image" in str(excinfo.value) or "Cannot read" in str(excinfo.value)


class TestMediaSignatureVerification:
    """Verifies magic byte validation across all supported media formats."""

    def test_quicktime_mov_signatures(self):
        assert verify_magic(b"\x00\x00\x00\x14ftypqt  ", "video/quicktime") is True
        assert verify_magic(b"\x00\x00\x00\x14moovxxxx", "video/quicktime") is True
        assert verify_magic(b"\x00\x00\x00\x14mdatxxxx", "video/quicktime") is True
        assert verify_magic(b"\x00\x00\x00\x14widexxxx", "video/quicktime") is True
        assert verify_magic(b"\x00\x00\x00\x14freexxxx", "video/quicktime") is True
        # Mismatch
        assert verify_magic(b"\x00\x00\x00\x14badbrand", "video/quicktime") is False

    def test_audio_mpeg_signatures(self):
        # ID3 header
        assert verify_magic(b"ID3\x03\x00\x00\x00\x00\x00\x00", "audio/mpeg") is True
        # Frame sync header (MPEG-1 Layer 3, no CRC)
        assert verify_magic(b"\xff\xfb\x90\x64\x00\x00", "audio/mpeg") is True
        # Bad audio
        assert verify_magic(b"NOT_MP3_DATA", "audio/mpeg") is False

    def test_standard_formats_signatures(self):
        assert verify_magic(b"\xff\xd8\xff\xe0", "image/jpeg") is True
        assert verify_magic(b"\x89PNG\r\n\x1a\n", "image/png") is True
        assert verify_magic(b"RIFF\x00\x00\x00\x00WEBP", "image/webp") is True
        assert verify_magic(b"\x00\x00\x00\x18ftypisom", "video/mp4") is True
        assert verify_magic(b"RIFF\x00\x00\x00\x00AVI ", "video/avi") is True
        assert verify_magic(b"RIFF\x00\x00\x00\x00WAVE", "audio/wav") is True
        assert verify_magic(b"fLaC\x00\x00\x00\x00", "audio/flac") is True

    def test_mismatched_signatures_fail_closed(self):
        assert verify_magic(b"\xff\xd8\xff\xe0", "image/png") is False
        assert verify_magic(b"RIFF....WEBP", "video/mp4") is False
        assert verify_magic(b"", "image/jpeg") is False
        assert verify_magic(b"abcd", "unknown/type") is False


class TestVideoDurationProtection:
    """Verifies duration and corruption guards in video frame sampling."""

    def test_rejects_unreadable_video_file(self):
        sampler = IntelligentFrameSampler()
        with pytest.raises(ValueError) as excinfo:
            sampler.extract_frames("nonexistent_video_path.mp4")
        assert "Cannot open video" in str(excinfo.value)

    @patch("cv2.VideoCapture")
    def test_rejects_video_exceeding_300s(self, mock_cv_class):
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        # 30 fps, 10000 frames = 333.3 seconds > 300s
        mock_cap.get.side_effect = lambda prop: 30.0 if prop == 5 else 10000
        mock_cv_class.return_value = mock_cap

        sampler = IntelligentFrameSampler()
        with pytest.raises(ValueError) as excinfo:
            sampler.extract_frames("dummy_long_video.mp4")

        assert "exceeds maximum allowed 300s" in str(excinfo.value)
        mock_cap.release.assert_called_once()


class TestInferenceConcurrencyProtection:
    """Verifies FastAPI inference semaphore bounds direct request flooding."""

    def test_direct_request_returns_429_when_semaphore_locked(self, auth_headers):
        client = TestClient(app)
        with patch.object(inference_semaphore, "locked", return_value=True):
            dummy_png = io.BytesIO(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00")
            res = client.post(
                "/detect/image",
                files={"file": ("test.png", dummy_png, "image/png")},
                headers=auth_headers
            )
            assert res.status_code == 429
            assert "maximum capacity" in res.json()["detail"]
