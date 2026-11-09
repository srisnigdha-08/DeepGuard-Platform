import torch
import cv2
import numpy as np
import time
import base64
import logging
from PIL import Image, UnidentifiedImageError, ImageFile

from preprocessing.face_extractor import FaceExtractor
from services.explainability import GradCAM
from app.core.gpu_config import VRAMOptimizer

logger = logging.getLogger(__name__)

# Ensure truncated/malformed files do not hang the decoder
ImageFile.LOAD_TRUNCATED_IMAGES = False

# Maximum permitted image dimensions and pixel count (16 Megapixels)
MAX_IMAGE_DIMENSION = 4096
MAX_IMAGE_PIXELS = 16_000_000

# PIL built-in decompression bomb ceiling
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class ImageDeepFakeDetector:
    def __init__(self, model, device, decision_threshold=0.5):
        self.model = model
        self.device = device
        self.threshold = decision_threshold
        self.face_ext = FaceExtractor(target_size=224, face_margin=0.4)
        self.grad_cam = GradCAM(model)
        VRAMOptimizer.configure()

    def _preprocess(self, image_path: str):
        # Step 1: Pre-decoding header inspection via PIL without allocating full decompressed bitmap
        try:
            with Image.open(image_path) as img:
                w, h = img.size
                if w <= 0 or h <= 0:
                    raise ValueError(f"Invalid image dimensions: {w}x{h}")
                if w > MAX_IMAGE_DIMENSION or h > MAX_IMAGE_DIMENSION or (w * h) > MAX_IMAGE_PIXELS:
                    raise ValueError(
                        f"Image resolution {w}x{h} ({w * h:,} pixels) exceeds maximum allowed {MAX_IMAGE_DIMENSION}x{MAX_IMAGE_DIMENSION} ({MAX_IMAGE_PIXELS:,} pixels) limit"
                    )
                # Verify container stream consistency
                img.verify()
        except Image.DecompressionBombError as e:
            raise ValueError(f"Decompression bomb detected: {e}")
        except (UnidentifiedImageError, OSError, SyntaxError) as e:
            raise ValueError(f"Corrupted or invalid image file: {e}")

        # Step 2: Safe pixel decoding after headers and dimension limits are strictly confirmed
        image = cv2.imread(image_path)

        if image is None:
            raise ValueError(f"Cannot read image: {image_path}")

        face = self.face_ext.extract_largest_face(image)

        if face is None:
            return None, None

        rgb = cv2.cvtColor(face, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        norm = (rgb - IMAGENET_MEAN) / IMAGENET_STD

        tensor = (
            torch.from_numpy(norm.transpose(2, 0, 1))
            .unsqueeze(0)
            .float()
        )

        return face, tensor

    def analyze(self, image_path: str) -> dict:
        start_time = time.time()
        timings = {}

        try:
            # -----------------------------
            # Preprocessing
            # -----------------------------
            t = time.time()

            face, tensor = self._preprocess(image_path)

            timings["preprocessing_ms"] = round(
                (time.time() - t) * 1000
            )

            if face is None or tensor is None:
                timings["total_ms"] = round((time.time() - start_time) * 1000)
                return {
                    "status": "no_face_detected",
                    "verdict": "UNCERTAIN",
                    "confidence": 0.0,
                    "confidence_percent": 0.0,
                    "raw_fake_probability": 0.0,
                    "is_fake": False,
                    "face_detected": False,
                    "suspicious_regions": [],
                    "region_count": 0,
                    "error": "No detectable face was found in this image.",
                    "message": "Unable to analyze: No detectable face was found in this image.",
                    "timings": timings,
                    "model_version": "efficientnet-b4-epoch34",
                    "threshold_used": self.threshold,
                }

            # -----------------------------
            # Model Prediction
            # -----------------------------
            t = time.time()

            heatmap, confidence = self.grad_cam.generate(
                tensor,
                self.device
            )

            raw_fake = float(confidence)

            print("\n" + "=" * 60)
            print("MODEL DEBUG")
            print("=" * 60)
            print(f"P(Fake)    : {raw_fake:.6f}")
            print(f"Threshold  : {self.threshold}")
            print(
                f"Prediction : {'FAKE' if raw_fake > self.threshold else 'REAL'}"
            )
            print("=" * 60 + "\n")

            timings["inference_ms"] = round(
                (time.time() - t) * 1000
            )

            # -----------------------------
            # GradCAM
            # -----------------------------
            t = time.time()

            overlay = self.grad_cam.overlay_on_image(
                face,
                heatmap
            )

            suspicious_regions = self.grad_cam.get_suspicious_regions(
                heatmap
            )

            timings["gradcam_ms"] = round(
                (time.time() - t) * 1000
            )

            # -----------------------------
            # Encode images
            # -----------------------------
            def encode(img):
                _, buffer = cv2.imencode(
                    ".jpg",
                    img,
                    [cv2.IMWRITE_JPEG_QUALITY, 90],
                )
                return base64.b64encode(buffer).decode()

            timings["total_ms"] = round(
                (time.time() - start_time) * 1000
            )

            is_fake = raw_fake > self.threshold
            # Displayed confidence: P(Fake) for FAKE, 1 - P(Fake) for REAL
            display_conf = raw_fake if is_fake else (1.0 - raw_fake)

            return {
                "status": "success",
                "verdict": "FAKE" if is_fake else "REAL",
                "confidence": round(raw_fake, 4),
                "confidence_percent": round(display_conf * 100, 2),
                "raw_fake_probability": round(raw_fake, 4),
                "is_fake": is_fake,
                "face_detected": True,
                "suspicious_regions": suspicious_regions,
                "region_count": len(suspicious_regions),
                "heatmap_base64": encode(overlay),
                "face_crop_base64": encode(face),
                "timings": timings,
                "model_version": "efficientnet-b4-epoch34",
                "threshold_used": self.threshold,
            }

        except Exception as e:
            logger.exception("Image analysis failed")
            return {
                "status": "failed",
                "error": str(e),
            }