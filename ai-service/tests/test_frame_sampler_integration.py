import os
import cv2
import pytest
import numpy as np
import torch
from unittest.mock import patch, MagicMock

from preprocessing.frame_sampler import IntelligentFrameSampler
from models.efficientnet_loader import load_efficientnet
from preprocessing.face_extractor import FaceExtractor

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FIXTURES_DIR = os.path.join(REPO_ROOT, "docs", "research", "performance", "synthetic_fixtures")
REAL_VIDEO_AUTH = os.path.join(REPO_ROOT, "datasets", "FaceForensics", "original_sequences", "youtube", "c23", "videos", "000.mp4")
REAL_VIDEO_MANIP = os.path.join(REPO_ROOT, "datasets", "FaceForensics", "manipulated_sequences", "Deepfakes", "c23", "videos", "000_003.mp4")
CHECKPOINT_PATH = os.path.join(REPO_ROOT, "models", "efficientnet_b4_deepfake.pt")


class TestFrameSamplerStrategyConfiguration:
    """Verifies default behavior, strategy selection, and input validation."""

    def test_default_is_sequential(self):
        sampler = IntelligentFrameSampler()
        assert sampler.decode_strategy == "sequential"

    def test_opt_in_legacy_initialization(self):
        sampler = IntelligentFrameSampler(decode_strategy="legacy")
        assert sampler.decode_strategy == "legacy"

    def test_opt_in_sequential_initialization(self):
        sampler = IntelligentFrameSampler(decode_strategy="sequential")
        assert sampler.decode_strategy == "sequential"

    def test_invalid_initialization_strategy_raises(self):
        with pytest.raises(ValueError) as exc:
            IntelligentFrameSampler(decode_strategy="invalid_mode")
        assert "Invalid decode_strategy" in str(exc.value)

    def test_extract_frames_runtime_override(self):
        sampler = IntelligentFrameSampler()
        # Passing invalid strategy at runtime should raise
        with pytest.raises(ValueError) as exc:
            sampler.extract_frames(REAL_VIDEO_AUTH, strategy="unsupported")
        assert "Invalid decode_strategy" in str(exc.value)

    def test_repeated_invocations_release_resources(self):
        """Verifies repeated sequential extractions cleanly close and release handles."""
        sampler = IntelligentFrameSampler()
        for _ in range(5):
            frames, info = sampler.extract_frames(REAL_VIDEO_AUTH)
            assert len(frames) > 0
            assert "total_frames" in info


class TestLegacyAndSequentialParityOnRealVideos:
    """Verifies bit-for-bit pixel, timestamp, and index parity on real FaceForensics++ media."""

    @pytest.mark.parametrize("video_path", [REAL_VIDEO_AUTH, REAL_VIDEO_MANIP])
    def test_exact_parity_on_real_video(self, video_path):
        if not os.path.exists(video_path):
            pytest.skip(f"Test video missing: {video_path}")

        legacy_sampler = IntelligentFrameSampler(decode_strategy="legacy")
        seq_sampler = IntelligentFrameSampler(decode_strategy="sequential")

        leg_frames, leg_info = legacy_sampler.extract_frames(video_path)
        seq_frames, seq_info = seq_sampler.extract_frames(video_path)

        # 1. Info dict parity
        assert leg_info["total_frames"] == seq_info["total_frames"]
        assert leg_info["fps"] == seq_info["fps"]
        assert leg_info["duration_sec"] == seq_info["duration_sec"]
        assert leg_info["resolution"] == seq_info["resolution"]
        assert leg_info["scene_count"] == seq_info["scene_count"]

        # 2. Frame count parity
        assert len(leg_frames) == len(seq_frames)
        assert len(leg_frames) > 0

        # 3. Index and timestamp parity
        leg_indices = [f["frame_number"] for f in leg_frames]
        seq_indices = [f["frame_number"] for f in seq_frames]
        assert leg_indices == seq_indices

        leg_timestamps = [f["timestamp_sec"] for f in leg_frames]
        seq_timestamps = [f["timestamp_sec"] for f in seq_frames]
        assert leg_timestamps == seq_timestamps

        # 4. Bit-for-bit exact decoded pixel parity
        for i in range(len(leg_frames)):
            diff = np.abs(leg_frames[i]["image_bgr"].astype(np.int32) - seq_frames[i]["image_bgr"].astype(np.int32))
            assert np.max(diff) == 0, f"Pixel difference detected at index {leg_indices[i]}"


class TestSyntheticEdgeCasesAndParity:
    """Verifies edge cases: single-frame fallback, short clips, rapid scenes, corrupt, empty."""

    def test_single_frame_legacy_fallback_parity(self):
        video_path = os.path.join(FIXTURES_DIR, "single_frame.mp4")
        if not os.path.exists(video_path):
            pytest.skip("Fixture not found")

        sampler_leg = IntelligentFrameSampler(decode_strategy="legacy")
        sampler_seq = IntelligentFrameSampler(decode_strategy="sequential")

        leg_frames, leg_info = sampler_leg.extract_frames(video_path)
        seq_frames, seq_info = sampler_seq.extract_frames(video_path)

        assert len(leg_frames) == len(seq_frames)
        assert [f["frame_number"] for f in leg_frames] == [f["frame_number"] for f in seq_frames]

    @pytest.mark.parametrize("filename", [
        "very_short_5f.mp4",
        "budget_8f.mp4",
        "odd_count_17f.mp4",
        "odd_count_33f.mp4",
        "rapid_scenes_30f.mp4",
        "no_faces_constant_gray.mp4",
    ])
    def test_synthetic_fixtures_parity(self, filename):
        video_path = os.path.join(FIXTURES_DIR, filename)
        if not os.path.exists(video_path):
            pytest.skip(f"Fixture not found: {filename}")

        sampler_leg = IntelligentFrameSampler(decode_strategy="legacy")
        sampler_seq = IntelligentFrameSampler(decode_strategy="sequential")

        leg_frames, leg_info = sampler_leg.extract_frames(video_path)
        seq_frames, seq_info = sampler_seq.extract_frames(video_path)

        assert len(leg_frames) == len(seq_frames)
        assert [f["frame_number"] for f in leg_frames] == [f["frame_number"] for f in seq_frames]
        for lf, sf in zip(leg_frames, seq_frames):
            diff = np.max(np.abs(lf["image_bgr"].astype(int) - sf["image_bgr"].astype(int)))
            assert diff == 0

    def test_empty_0byte_video_rejection(self):
        video_path = os.path.join(FIXTURES_DIR, "empty_0byte.mp4")
        if not os.path.exists(video_path):
            pytest.skip("Fixture not found")

        sampler_leg = IntelligentFrameSampler(decode_strategy="legacy")
        sampler_seq = IntelligentFrameSampler(decode_strategy="sequential")

        with pytest.raises(ValueError):
            sampler_leg.extract_frames(video_path)

        with pytest.raises(ValueError):
            sampler_seq.extract_frames(video_path)

    def test_corrupt_file_video_rejection(self):
        video_path = os.path.join(FIXTURES_DIR, "corrupt_file.mp4")
        if not os.path.exists(video_path):
            pytest.skip("Fixture not found")

        sampler_leg = IntelligentFrameSampler(decode_strategy="legacy")
        sampler_seq = IntelligentFrameSampler(decode_strategy="sequential")

        with pytest.raises(ValueError):
            sampler_leg.extract_frames(video_path)

        with pytest.raises(ValueError):
            sampler_seq.extract_frames(video_path)


class TestSequentialFallbackMechanism:
    """Verifies that unexpected errors in sequential decoding cleanly fall back to legacy."""

    def test_pass1_exception_triggers_legacy_fallback(self):
        sampler = IntelligentFrameSampler(decode_strategy="sequential")

        # Mock _detect_scenes_sequential to simulate a stream decoding exception
        with patch.object(sampler, "_detect_scenes_sequential", side_effect=RuntimeError("Simulated Pass 1 decoder fault")):
            frames, info = sampler.extract_frames(REAL_VIDEO_AUTH)
            assert len(frames) > 0
            assert "total_frames" in info

    def test_pass1_grab_failure_triggers_legacy_fallback(self):
        sampler = IntelligentFrameSampler(decode_strategy="sequential")

        class FlakyVideoCapture:
            def __init__(self, path):
                self._real = cv2.VideoCapture(path)
                self.grab_count = 0

            def isOpened(self):
                return self._real.isOpened()

            def get(self, prop):
                return self._real.get(prop)

            def read(self):
                return self._real.read()

            def grab(self):
                self.grab_count += 1
                if self.grab_count >= 3:
                    return False
                return self._real.grab()

            def release(self):
                return self._real.release()

        call_idx = [0]
        original_cap = cv2.VideoCapture

        def mock_factory(path):
            call_idx[0] += 1
            if call_idx[0] == 1:
                return FlakyVideoCapture(path)
            return original_cap(path)

        with patch("cv2.VideoCapture", side_effect=mock_factory):
            frames, info = sampler.extract_frames(REAL_VIDEO_AUTH)
            assert len(frames) > 0
            assert "total_frames" in info

    def test_pass2_exception_triggers_legacy_fallback(self):
        sampler = IntelligentFrameSampler(decode_strategy="sequential")

        # Mock VideoCapture for pass 2 to raise an exception
        original_cap = cv2.VideoCapture
        call_count = [0]

        def flaky_videocapture(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 2:
                # Second call is pass 2: raise unexpected error
                raise RuntimeError("Simulated Pass 2 stream error")
            return original_cap(*args, **kwargs)

        with patch("cv2.VideoCapture", side_effect=flaky_videocapture):
            frames, info = sampler.extract_frames(REAL_VIDEO_AUTH)
            assert len(frames) > 0


class TestMLInferenceParity:
    """Verifies that model inference scores and decisions are mathematically identical."""

    @pytest.mark.parametrize("video_path, expected_label", [
        (REAL_VIDEO_AUTH, "AUTHENTIC"),
        (REAL_VIDEO_MANIP, "DEEPFAKE"),
    ])
    def test_end_to_end_score_and_verdict_parity(self, video_path, expected_label):
        if not os.path.exists(video_path) or not os.path.exists(CHECKPOINT_PATH):
            pytest.skip("Missing test video or checkpoint")

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = load_efficientnet(CHECKPOINT_PATH, device=device)
        model.eval()

        sampler_leg = IntelligentFrameSampler(decode_strategy="legacy")
        sampler_seq = IntelligentFrameSampler(decode_strategy="sequential")
        face_ext = FaceExtractor(target_size=224, face_margin=0.4)

        mean = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1).to(device)
        std = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1).to(device)

        def run_pipeline(sampler):
            frames, _ = sampler.extract_frames(video_path)
            scores = []
            for fd in frames:
                face = face_ext.extract_largest_face(fd["image_bgr"])
                if face is None:
                    continue
                face_rgb = cv2.cvtColor(face, cv2.COLOR_BGR2RGB)
                tensor = torch.from_numpy(face_rgb.astype(np.float32) / 255.0).permute(2, 0, 1).unsqueeze(0).to(device)
                tensor = (tensor - mean) / std
                with torch.no_grad():
                    logits = model(tensor)
                    score = torch.sigmoid(logits).item()
                scores.append(score)

            arr = np.array(scores, dtype=np.float64)
            w = arr ** 2
            w_sum = np.sum(w)
            if w_sum < 1e-9:
                a0 = float(np.mean(arr))
            else:
                a0 = float(0.6 * np.sum(arr * w) / w_sum + 0.4 * np.max(arr))
            verdict = "DEEPFAKE" if a0 >= 0.50 else "AUTHENTIC"
            return scores, a0, verdict

        leg_scores, leg_a0, leg_verdict = run_pipeline(sampler_leg)
        seq_scores, seq_a0, seq_verdict = run_pipeline(sampler_seq)

        assert len(leg_scores) == len(seq_scores)
        assert leg_scores == pytest.approx(seq_scores, abs=1e-6)
        assert abs(leg_a0 - seq_a0) < 1e-6
        assert leg_verdict == seq_verdict
        assert leg_verdict == expected_label
