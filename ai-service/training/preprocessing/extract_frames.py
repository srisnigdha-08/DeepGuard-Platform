"""
Frame extraction pipeline for FaceForensics++ dataset.

Usage:
  python training/preprocessing/extract_frames.py

Prerequisites:
  1. Request FF++ access: https://github.com/ondyari/FaceForensics
  2. Download c23 (H.264) videos to datasets/FaceForensics/
  3. Run this script to extract 10 face crops per video
  4. Metadata CSVs saved to datasets/processed/metadata/

Architecture note:
  MediaPipe face detection runs in parallel across CPU cores via
  ThreadPoolExecutor. Each worker is stateless — safe to parallelise.
  GPU is NOT used here (MediaPipe CPU is fast enough for preprocessing).
"""

import cv2, os, numpy as np, pandas as pd, mediapipe as mp, logging
from pathlib import Path
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


class FrameExtractor:
    """Extract aligned face crops from video files."""

    def __init__(self, frames_per_video=10, target_size=224,
                 face_margin=0.4, min_confidence=0.7):
        import threading
        self.fpv            = frames_per_video
        self.target_size    = target_size
        self.face_margin    = face_margin
        self.min_confidence = min_confidence
        self._local         = threading.local()

    def _get_detector(self):
        """Get per-thread MediaPipe detector (thread-safe reuse)."""
        if not hasattr(self._local, "detector"):
            self._local.detector = mp.solutions.face_detection.FaceDetection(
                model_selection=1, min_detection_confidence=self.min_confidence)
        return self._local.detector

    def extract(self, video_path: str, output_dir: str, label: int, video_id: str):
        """
        Extract self.fpv evenly-spaced face crops from video_path.
        Returns list of metadata dicts for each saved frame.
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.warning(f"Cannot open: {video_path}")
            return []

        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        # Sample from middle 80% of video (skip intros/outros)
        start = int(total * 0.1); end = int(total * 0.9)
        sample_pts = np.linspace(start, end, self.fpv, dtype=int)

        detector = self._get_detector()
        extracted = []

        for fn in sample_pts:
            fname = f"{video_id}_f{fn:06d}.jpg"
            out_path = os.path.join(output_dir, fname)

            # Resume if frame already exists on disk
            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                extracted.append({
                    "filename":     fname,
                    "video_id":     video_id,
                    "frame_number": int(fn),
                    "label":        label,
                    "label_str":    "real" if label == 0 else "fake",
                    "source_video": video_path,
                })
                continue

            cap.set(cv2.CAP_PROP_POS_FRAMES, fn)
            ret, frame = cap.read()
            if not ret:
                continue
            face = self._detect_and_crop(frame, detector)
            if face is None:
                continue
            cv2.imwrite(out_path, face, [cv2.IMWRITE_JPEG_QUALITY, 95])
            extracted.append({
                "filename":     fname,
                "video_id":     video_id,
                "frame_number": int(fn),
                "label":        label,
                "label_str":    "real" if label == 0 else "fake",
                "source_video": video_path,
            })

        cap.release()
        return extracted

    def _detect_and_crop(self, frame, detector):
        h, w = frame.shape[:2]
        rgb  = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res  = detector.process(rgb)
        if not res.detections:
            return None

        best = max(res.detections,
                   key=lambda d: d.location_data.relative_bounding_box.width
                                 * d.location_data.relative_bounding_box.height)
        bb = best.location_data.relative_bounding_box
        x, y   = int(bb.xmin * w), int(bb.ymin * h)
        bw, bh = int(bb.width * w), int(bb.height * h)
        mx, my = int(bw * self.face_margin), int(bh * self.face_margin)
        x1, y1 = max(0, x - mx), max(0, y - my)
        x2, y2 = min(w, x + bw + mx), min(h, y + bh + my)
        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None
        return cv2.resize(crop, (self.target_size, self.target_size),
                          interpolation=cv2.INTER_LANCZOS4)


def build_split_mapping(
    ff_root="datasets/FaceForensics",
    split={"train": 0.8, "val": 0.1, "test": 0.1},
    seed=42,
):
    """
    Build a deterministic source-level split mapping ensuring zero data leakage.
    Each manipulation pair (e.g. 000 and 003 forming 000_003 and 003_000) forms
    a connected component. All real and manipulated videos involving these sources
    are assigned strictly to the same split (train, val, or test).

    Returns:
        dict: mapping of video stem (e.g. '000', '000_003') -> split name ('train', 'val', 'test')
    """
    import random
    from collections import defaultdict

    ff = Path(ff_root)
    real_dir = ff / "original_sequences/youtube/c23/videos"
    real_stems = sorted([p.stem for p in real_dir.glob("*.mp4")])

    methods = ["Deepfakes", "Face2Face", "FaceSwap", "NeuralTextures"]
    all_fake_stems = set()
    for m in methods:
        fdir = ff / f"manipulated_sequences/{m}/c23/videos"
        if fdir.exists():
            all_fake_stems.update([p.stem for p in fdir.glob("*.mp4")])

    # Graph connecting co-occurring source IDs
    adj = defaultdict(set)
    for s in real_stems:
        adj[s] = adj[s]  # ensure isolated node exists
    for s in all_fake_stems:
        parts = s.split("_")
        if len(parts) >= 2:
            adj[parts[0]].add(parts[1])
            adj[parts[1]].add(parts[0])
        else:
            adj[s] = adj[s]

    # Find connected components deterministically
    visited = set()
    components = []
    for node in sorted(adj.keys()):
        if node not in visited:
            comp = []
            queue = [node]
            visited.add(node)
            while queue:
                curr = queue.pop(0)
                comp.append(curr)
                for neighbor in sorted(adj[curr]):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
            components.append(sorted(comp))

    # Sort components deterministically by their primary ID
    components.sort(key=lambda c: c[0])

    # Deterministic shuffle using fixed seed
    rng = random.Random(seed)
    rng.shuffle(components)

    n = len(components)
    n_train = int(round(n * split["train"]))
    n_val = int(round(n * split["val"]))

    train_comps = components[:n_train]
    val_comps = components[n_train : n_train + n_val]
    test_comps = components[n_train + n_val :]

    source_to_split = {}
    for c in train_comps:
        for s in c:
            source_to_split[s] = "train"
    for c in val_comps:
        for s in c:
            source_to_split[s] = "val"
    for c in test_comps:
        for s in c:
            source_to_split[s] = "test"

    stem_to_split = {}
    for s in real_stems:
        stem_to_split[s] = source_to_split.get(s, "train")
    for s in all_fake_stems:
        primary = s.split("_")[0]
        stem_to_split[s] = source_to_split.get(primary, "train")

    logger.info(
        f"Source-level split (seed={seed}): {len(components)} components -> "
        f"train={len(train_comps)}, val={len(val_comps)}, test={len(test_comps)}"
    )
    return stem_to_split


def process_dataset(
    ff_root   = "datasets/FaceForensics",
    out_root  = "datasets/processed",
    split     = {"train": 0.8, "val": 0.1, "test": 0.1},
    workers   = 4,
    seed      = 42,
    dry_run   = False,
):
    stem_to_split = build_split_mapping(ff_root=ff_root, split=split, seed=seed)

    real_videos = sorted(
        Path(ff_root).glob("original_sequences/youtube/c23/videos/*.mp4"))

    def process_video(args):
        vpath, label, method, sp = args
        vid = f"{method}_{vpath.stem}" if method else vpath.stem
        out = Path(out_root) / "frames" / sp / ("real" if label == 0 else "fake")
        out.mkdir(parents=True, exist_ok=True)
        frames = extractor.extract(str(vpath), str(out), label, vid)
        for f in frames:
            f["split"] = sp
            f["method"] = method if method else "original"
            f["source_id"] = vpath.stem
        return frames

    # Collect all video tasks
    tasks = [(vp, 0, None, stem_to_split.get(vp.stem, "train")) for vp in real_videos]
    for method in ["Deepfakes", "Face2Face", "FaceSwap", "NeuralTextures"]:
        fake_dir = Path(ff_root) / f"manipulated_sequences/{method}/c23/videos"
        if not fake_dir.exists():
            logger.warning(f"Not found: {fake_dir}")
            continue
        fake_vids = sorted(fake_dir.glob("*.mp4"))
        tasks += [(vp, 1, method, stem_to_split.get(vp.stem, "train")) for vp in fake_vids]

    # Summary of task distribution
    split_counts = {
        "train": {"real": 0, "fake": 0},
        "val":   {"real": 0, "fake": 0},
        "test":  {"real": 0, "fake": 0},
    }
    for vp, label, method, sp in tasks:
        key = "real" if label == 0 else "fake"
        split_counts[sp][key] += 1

    for sp, c in split_counts.items():
        logger.info(f"Split {sp:5s}: {c['real']:,} real + {c['fake']:,} fake = {c['real']+c['fake']:,} videos")

    if dry_run:
        logger.info("Dry run requested. Skipping actual frame extraction.")
        return split_counts

    extractor = FrameExtractor()
    all_meta  = []

    logger.info(f"Processing {len(tasks)} videos with {workers} workers…")
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(process_video, t): t for t in tasks}
        for fut in tqdm(as_completed(futures), total=len(futures), desc="Extracting"):
            try:
                all_meta.extend(fut.result())
            except Exception as e:
                logger.error(f"Worker error: {e}")

    # Save per-split CSVs and master CSV
    df = pd.DataFrame(all_meta)
    meta_dir = Path(out_root) / "metadata"
    meta_dir.mkdir(parents=True, exist_ok=True)
    for sp in ["train", "val", "test"]:
        sdf = df[df["split"] == sp]
        sdf.to_csv(meta_dir / f"{sp}_labels.csv", index=False)
        r = len(sdf[sdf.label == 0]); fk = len(sdf[sdf.label == 1])
        logger.info(f"{sp:5s}: {r:,} real + {fk:,} fake = {r+fk:,} total")
    df.to_csv(meta_dir / "all_labels.csv", index=False)

    logger.info(f"✅ Done. Total frames: {len(all_meta):,}")
    return all_meta


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Extract face crops from FaceForensics++")
    parser.add_argument("--ff-root", default="datasets/FaceForensics", help="Path to FaceForensics dataset")
    parser.add_argument("--out-root", default="datasets/processed", help="Output path for frames & metadata")
    parser.add_argument("--workers", type=int, default=4, help="Number of worker threads")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for deterministic split")
    parser.add_argument("--dry-run", action="store_true", help="Verify dataset paths and split counts without extracting")
    args = parser.parse_args()

    process_dataset(
        ff_root=args.ff_root,
        out_root=args.out_root,
        workers=args.workers,
        seed=args.seed,
        dry_run=args.dry_run,
    )
