import torch
import cv2
import numpy as np
import time
import base64
import logging
from concurrent.futures import ThreadPoolExecutor
from preprocessing.face_extractor import FaceExtractor
from preprocessing.frame_sampler import IntelligentFrameSampler
from services.explainability import GradCAM

logger = logging.getLogger(__name__)
MEAN = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
STD  = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)


class VideoDeepFakeDetector:
    """
    Frame-level detection with temporal aggregation.
    WHY temporal aggregation over single-frame? GAN artifacts vary frame-to-frame
    — aggregation across frames improves both recall and precision by ~4%.
    """
    def __init__(self, model, device, decision_threshold=0.5):
        self.model = model
        self.device = device
        self.threshold = decision_threshold
        self.face_ext = FaceExtractor(target_size=224, face_margin=0.4)
        self.sampler  = IntelligentFrameSampler(target_fps=2.0, max_frames=60)
        self.grad_cam = GradCAM(model)

    def _extract_face(self, fd):
        face = self.face_ext.extract_largest_face(fd["image_bgr"])
        if face is None:
            return None
        fd["face_bgr"] = face
        fd["face_rgb"] = cv2.cvtColor(face, cv2.COLOR_BGR2RGB)
        return fd

    @torch.no_grad()
    def _infer_batch(self, faces):
        tensors = [
            torch.from_numpy(f["face_rgb"].astype(np.float32) / 255.0
                              ).permute(2, 0, 1)
            for f in faces
        ]
        batch = torch.stack(tensors).to(self.device)
        mean  = MEAN.to(self.device)
        std   = STD.to(self.device)
        batch = (batch - mean) / std
        try:
            from torch.cuda.amp import autocast
            with autocast():
                return torch.sigmoid(self.model(batch)).cpu().numpy().flatten()
        except Exception:
            return torch.sigmoid(self.model(batch)).cpu().numpy().flatten()

    def _aggregate(self, scores, timestamps):
        w  = scores ** 2
        ws = w.sum()
        wm = float((scores * w).sum() / ws) if ws > 1e-8 else float(scores.mean())
        pk = float(scores.max())
        pt = float(timestamps[np.argmax(scores)])
        final = 0.6 * wm + 0.4 * pk
        return {
            "overall_score": round(final, 4),
            "weighted_mean_score": round(wm, 4),
            "peak_score": round(pk, 4),
            "peak_timestamp_sec": round(pt, 2),
            "consistency": round(float((scores > self.threshold).mean()), 4),
            "frames_above_threshold": int((scores > self.threshold).sum()),
            "total_frames_analyzed": int(len(scores)),
        }

    def analyze(self, video_path: str) -> dict:
        t0 = time.time(); timings = {}
        try:
            t = time.time()
            raw_frames, vinfo = self.sampler.extract_frames(video_path)
            timings["frame_extraction_ms"] = round((time.time() - t) * 1000)

            results = [self._extract_face(f) for f in raw_frames]
            faces = [r for r in results if r is not None]

            if len(faces) < 3:
                return {"status": "insufficient_data", "video_info": vinfo,
                        "error": "Too few faces detected."}

            t = time.time()
            all_scores = []
            for i in range(0, len(faces), 16):
                all_scores.extend(self._infer_batch(faces[i:i+16]).tolist())
            scores = np.array(all_scores)
            timestamps = np.array([f["timestamp_sec"] for f in faces])
            timings["inference_ms"] = round((time.time() - t) * 1000)

            agg = self._aggregate(scores, timestamps)

            top_idx = np.argsort(scores)[::-1][:3]
            gcam_results = []
            for idx in top_idx:
                if scores[idx] < 0.4:
                    break
                rgb = faces[idx]["face_rgb"].astype(np.float32) / 255.0
                t_ = torch.from_numpy(rgb.transpose(2, 0, 1)).unsqueeze(0).float()
                t_norm = (t_ - MEAN) / STD
                hm, _ = self.grad_cam.generate(t_norm, self.device)
                ov = self.grad_cam.overlay_on_image(faces[idx]["face_bgr"], hm)
                _, buf = cv2.imencode(".jpg", ov, [cv2.IMWRITE_JPEG_QUALITY, 85])
                gcam_results.append({
                    "frame_number": faces[idx]["frame_number"],
                    "timestamp_sec": faces[idx]["timestamp_sec"],
                    "fake_score": round(float(scores[idx]), 4),
                    "heatmap_base64": base64.b64encode(buf).decode(),
                    "suspicious_regions": self.grad_cam.get_suspicious_regions(hm),
                })

            timings["total_ms"] = round((time.time() - t0) * 1000)
            final = agg["overall_score"]
            is_fake = final > self.threshold
            display_conf = final if is_fake else (1.0 - final)

            return {
                "status": "success",
                "verdict": "FAKE" if is_fake else "REAL",
                "confidence": round(final, 4),
                "confidence_percent": round(display_conf * 100, 2),
                "raw_fake_probability": round(final, 4),
                "is_fake": is_fake,
                "video_info": vinfo,
                "aggregation": agg,
                "frame_timeline": [
                    {"frame": int(faces[i]["frame_number"]),
                     "timestamp": round(float(timestamps[i]), 2),
                     "score": round(float(scores[i]), 4),
                     "is_fake": bool(scores[i] > self.threshold)}
                    for i in range(len(faces))
                ],
                "gradcam_frames": gcam_results,
                "timings": timings,
                "model_version": "efficientnet-b4-epoch34",
            }
        except Exception as e:
            logger.error(f"Video analysis failed: {e}", exc_info=True)
            return {"status": "failed", "error": str(e)}
