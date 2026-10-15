import numpy as np
import librosa
import torch
import torch.nn as nn
import cv2
import time
import tempfile
import soundfile as sf
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class AudioDeepFakeCNN(nn.Module):
    """
    Lightweight CNN operating on mel-spectrogram + MFCC + chroma features.
    3-channel input mirrors RGB CNNs, enabling ImageNet-style transfer learning
    on audio data.
    """
    def __init__(self, dropout_rate=0.5):
        super().__init__()
        def blk(ci, co, dp):
            return nn.Sequential(
                nn.Conv2d(ci, co, 3, padding=1), nn.BatchNorm2d(co), nn.ReLU(True),
                nn.Conv2d(co, co, 3, padding=1), nn.BatchNorm2d(co), nn.ReLU(True),
                nn.MaxPool2d(2, 2), nn.Dropout2d(dp))
        self.b1 = blk(3, 32, 0.1)
        self.b2 = blk(32, 64, 0.1)
        self.b3 = blk(64, 128, 0.2)
        self.b4 = nn.Sequential(
            nn.Conv2d(128, 256, 3, padding=1), nn.BatchNorm2d(256),
            nn.ReLU(True), nn.MaxPool2d(2, 2))
        self.gap = nn.AdaptiveAvgPool2d(1)
        self.cls = nn.Sequential(
            nn.Dropout(dropout_rate),
            nn.Linear(256, 128), nn.BatchNorm1d(128), nn.ReLU(True),
            nn.Dropout(dropout_rate * 0.5), nn.Linear(128, 1))

    def forward(self, x):
        x = self.b1(x); x = self.b2(x)
        x = self.b3(x); x = self.b4(x)
        x = self.gap(x).view(x.size(0), -1)
        return self.cls(x)


class AudioPreprocessor:
    def __init__(self, sr=16000, dur=4.0, n_mels=128, n_mfcc=40,
                 n_fft=512, hop=256, sz=(224, 224), duration=None):
        if duration is not None:
            dur = duration
        self.sr = sr; self.dur = dur; self.n_mels = n_mels
        self.n_mfcc = n_mfcc; self.n_fft = n_fft; self.hop = hop; self.sz = sz
        self.max_samples = int(sr * dur)

    def _load(self, path):
        try:
            audio, _ = librosa.load(path, sr=self.sr, mono=True)
        except Exception as e:
            logger.error(f"Audio load failed: {e}"); return None
        if len(audio) < self.max_samples:
            pad = self.max_samples - len(audio)
            audio = np.pad(audio, (pad // 2, pad - pad // 2), mode="reflect")
        else:
            s = (len(audio) - self.max_samples) // 2
            audio = audio[s:s + self.max_samples]
        peak = np.abs(audio).max()
        if peak > 1e-6:
            audio = audio / peak
        return audio

    def _norm(self, f):
        n = (f - f.min()) / (f.max() - f.min() + 1e-8) * 255
        return cv2.resize(n.astype(np.uint8), self.sz, interpolation=cv2.INTER_LINEAR)

    def extract(self, path):
        audio = self._load(path)
        if audio is None:
            return None
        mel = self._norm(librosa.power_to_db(
            librosa.feature.melspectrogram(y=audio, sr=self.sr, n_mels=self.n_mels,
                                           n_fft=self.n_fft, hop_length=self.hop,
                                           fmin=50, fmax=7600), ref=np.max))
        mfcc = librosa.feature.mfcc(y=audio, sr=self.sr, n_mfcc=self.n_mfcc,
                                     n_fft=self.n_fft, hop_length=self.hop)
        mfcc_feat = self._norm(np.vstack([mfcc, librosa.feature.delta(mfcc)]))
        chroma    = self._norm(librosa.feature.chroma_stft(y=audio, sr=self.sr,
                                                            n_fft=self.n_fft,
                                                            hop_length=self.hop))
        feat = np.stack([mel, mfcc_feat, chroma], axis=-1).astype(np.float32) / 255.0
        return feat.transpose(2, 0, 1)


class AudioDeepFakeDetector:
    def __init__(self, model_path, device, decision_threshold=0.5,
                 seg_dur=4.0, overlap=0.5):
        self.device = device; self.threshold = decision_threshold
        self.seg_dur = seg_dur; self.overlap = overlap
        self.model = AudioDeepFakeCNN().to(device)
        if Path(model_path).exists():
            ckpt = torch.load(model_path, map_location=device)
            self.model.load_state_dict(ckpt.get("model_state_dict", ckpt), strict=False)
        else:
            logger.warning(f"Audio model not found at {model_path}")
        self.model.eval()
        for p in self.model.parameters():
            p.requires_grad = False
        self.pre = AudioPreprocessor(dur=seg_dur)

    def _infer_seg(self, path):
        feat = self.pre.extract(path)
        if feat is None:
            return None
        t = torch.from_numpy(feat).unsqueeze(0).float().to(self.device)
        with torch.no_grad():
            return torch.sigmoid(self.model(t)).item()

    def analyze(self, audio_path: str) -> dict:
        t0 = time.time()
        try:
            audio, sr = librosa.load(audio_path, sr=None, mono=True)
            duration = len(audio) / sr
        except Exception as e:
            return {"status": "failed", "error": str(e)}
        try:
            audio16, _ = librosa.load(audio_path, sr=16000, mono=True)
        except Exception as e:
            return {"status": "failed", "error": f"Resample failed: {e}"}
        sps = int(self.seg_dur * 16000)
        hop = int(sps * (1 - self.overlap))
        scores = []; timestamps = []
        for start in range(0, len(audio16) - sps + 1, hop):
            seg = audio16[start:start + sps]
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                sf.write(tmp.name, seg, 16000)
                score = self._infer_seg(tmp.name)
            if score is not None:
                scores.append(score); timestamps.append(start / 16000)
        if not scores:
            return {"status": "failed", "error": "Could not extract audio features"}
        arr = np.array(scores)
        final = float(0.5 * arr.mean() + 0.5 * arr.max())
        is_fake = final > self.threshold
        suspicious = [
            {"start_sec": round(timestamps[i], 2),
             "end_sec": round(timestamps[i] + self.seg_dur, 2),
             "clone_score": round(scores[i], 4)}
            for i in range(len(scores)) if scores[i] > self.threshold
        ]
        return {
            "status": "success",
            "verdict": "FAKE" if is_fake else "REAL",
            "confidence": round(final, 4),
            "confidence_percent": round(final * 100, 1),
            "is_fake": bool(is_fake),
            "audio_info": {"duration_sec": round(duration, 2),
                           "sample_rate": int(sr),
                           "segments_analyzed": len(scores)},
            "segment_scores": [{"timestamp": round(t, 2), "score": round(s, 4)}
                               for t, s in zip(timestamps, scores)],
            "suspicious_segments": suspicious,
            "mean_clone_score": round(float(arr.mean()), 4),
            "peak_clone_score": round(float(arr.max()), 4),
            "timings": {"total_ms": round((time.time() - t0) * 1000)},
            "model_version": "audio-cnn-v1.0",
        }
