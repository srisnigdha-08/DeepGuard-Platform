import cv2
import mediapipe as mp
import numpy as np
import logging

logger = logging.getLogger(__name__)


class FaceExtractor:
    """
    MediaPipe-based face extractor with optional alignment.
    WHY MediaPipe over Dlib? 30x faster, GPU-accelerated, cross-platform.
    """
    def __init__(self, target_size=224, face_margin=0.4,
                 min_confidence=0.7, align_face=False):
        self.target_size = target_size
        self.face_margin = face_margin
        self.align_face = align_face
        self.detector = mp.solutions.face_detection.FaceDetection(
            model_selection=1, min_detection_confidence=min_confidence)
        # FaceMesh alignment disabled by default to match training pipeline (FaceForensics++ C23)
        self.mesh = (mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True, max_num_faces=1, min_detection_confidence=0.5)
            if align_face else None)

    def extract_largest_face(self, image_bgr: np.ndarray):
        h, w = image_bgr.shape[:2]
        res = self.detector.process(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
        if not res.detections:
            return None
        best = max(res.detections,
            key=lambda d: d.location_data.relative_bounding_box.width *
                          d.location_data.relative_bounding_box.height)
        bb = best.location_data.relative_bounding_box
        x, y = int(bb.xmin * w), int(bb.ymin * h)
        bw, bh = int(bb.width * w), int(bb.height * h)
        mx, my = int(bw * self.face_margin), int(bh * self.face_margin)
        x1, y1 = max(0, x - mx), max(0, y - my)
        x2, y2 = min(w, x + bw + mx), min(h, y + bh + my)
        crop = image_bgr[y1:y2, x1:x2]
        if crop.size == 0:
            return None
        if self.mesh:
            crop = self._align(crop)
        return cv2.resize(crop, (self.target_size, self.target_size),
                          interpolation=cv2.INTER_LANCZOS4)

    def _align(self, face_bgr):
        h, w = face_bgr.shape[:2]
        res = self.mesh.process(cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB))
        if not res.multi_face_landmarks:
            return face_bgr
        lm = res.multi_face_landmarks[0].landmark
        lx, ly = int(lm[33].x * w), int(lm[33].y * h)
        rx, ry = int(lm[263].x * w), int(lm[263].y * h)
        angle = np.degrees(np.arctan2(ry - ly, rx - lx))
        if abs(angle) < 1.0:
            return face_bgr
        M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
        return cv2.warpAffine(face_bgr, M, (w, h),
                               flags=cv2.INTER_LANCZOS4,
                               borderMode=cv2.BORDER_REPLICATE)
