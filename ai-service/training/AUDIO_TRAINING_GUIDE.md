# DeepGuard Audio DeepFake Detection — Model Training & Integration Guide

> **Current Operational Status:**
> - **Status:** `DISABLED / PROTOTYPE`
> - **Architecture Implemented:** `AudioDeepFakeCNN` (3-channel mel + delta MFCC + chroma)
> - **Production Checkpoint:** `NOT AVAILABLE` (pending model training on authenticated audio dataset)
> - **Inference:** `DISABLED`
> - **API Status:** `HTTP 503 Service Unavailable`
> - **Frontend UI:** `Audio — Coming Soon`
>
> *Note: This guide provides the complete, tested technical roadmap for training and integrating the production audio model. This workflow has not yet been executed due to lack of a local audio training dataset in this repository.*

---

## 1. Obtain an Appropriate Audio Deepfake Dataset

To train the `AudioDeepFakeCNN` classifier, a high-quality, balanced audio dataset containing both genuine speech and synthetic/voice-cloned audio is required. Recommended legal benchmarks:

- **ASVspoof 2019 / 2021 (Logical Access - LA):**
  - Standard international benchmark for speech synthesis and voice conversion detection.
  - Official portal: [https://www.asvspoof.org/](https://www.asvspoof.org/)
- **WaveFake:**
  - Contains audio generated across diverse neural vocoders (MelGAN, Parallel WaveGAN, Multi-band MelGAN, FullBand MelGAN, HiFi-GAN) paired with LJSpeech and Japanese speech.
  - Available via Zenodo / open research licenses.
- **In-the-Wild Audio Deepfakes:**
  - Curated real-world cloned audio samples paired with authentic speaker recordings from LibriSpeech or VCTK.

---

## 2. Dataset Directory Structure

Place the acquired audio files inside `d:\deepguard-platform\datasets\audio\` partitioned into `real` and `fake` subdirectories:

```text
datasets/
└── audio/
    ├── real/
    │   ├── authentic_speech_001.wav
    │   ├── authentic_speech_002.wav
    │   └── ...
    └── fake/
        ├── synthetic_clone_001.wav
        ├── synthetic_clone_002.wav
        └── ...
```

Supported audio formats: `.wav`, `.mp3`, `.flac`, `.ogg`, `.m4a` (16-bit PCM 16kHz recommended).

---

## 3. Audio Preprocessing Pipeline

The preprocessing pipeline is implemented in `ai-service/services/audio_detector.py` under the `AudioPreprocessor` class:

- **Target Sample Rate:** 16,000 Hz (mono)
- **Window Length:** 4.0 seconds ($64,000$ audio samples). Shorter clips are symmetrically reflected/padded; longer clips are center-cropped.
- **Normalization:** Peak amplitude normalization to $[-1.0, 1.0]$.
- **Extracted Feature Tensor ($3 \times 224 \times 224$):**
  - **Channel 0:** Log-Mel Spectrogram (128 mel filterbanks, $n_{\text{fft}}=512$, $\text{hop}=256$).
  - **Channel 1:** MFCC + First-Order Delta MFCC (40 coefficients + delta stack).
  - **Channel 2:** STFT Chromagram (12 pitch classes).
  Each channel is scaled to $[0, 255]$, resized to $224 \times 224$, and normalized to $[0.0, 1.0]$.

---

## 4. Train the Model

Execute the training script from the `ai-service` directory using the active virtual environment:

```powershell
cd d:\deepguard-platform\ai-service
.\venv\Scripts\Activate.ps1

python training/train_audio_model.py `
    --data_dir ..\datasets\audio `
    --output ..\models\audio_deepfake_cnn.pt `
    --epochs 25 `
    --batch_size 16 `
    --lr 0.001 `
    --device auto
```

### Training Highlights:
- **Optimizer:** `AdamW(lr=1e-3, weight_decay=1e-4)`
- **Loss:** `BCEWithLogitsLoss`
- **Scheduler:** `CosineAnnealingLR` (decaying to $10^{-6}$)
- **Checkpointing:** Tracks validation ROC-AUC; saves the best-performing weights.

---

## 5. Evaluate the Checkpoint

To evaluate the saved checkpoint against an isolated test set:

```powershell
python training/train_audio_model.py `
    --evaluate `
    --checkpoint ..\models\audio_deepfake_cnn.pt `
    --data_dir ..\datasets\audio\test `
    --device auto
```

The evaluator outputs:
- ROC-AUC
- Accuracy (%)
- Fake Precision (%)
- Fake Recall / Sensitivity (%)
- F1-Score

---

## 6. Checkpoint Format Specification

The checkpoint is saved as a PyTorch state dictionary package:

```python
torch.save({
    "model_state_dict": model.state_dict(),
    "epoch": epoch,
    "val_roc_auc": val_auc,
    "val_acc": val_acc,
    "architecture": "AudioDeepFakeCNN",
    "sample_rate": 16000,
    "duration_sec": 4.0,
}, "models/audio_deepfake_cnn.pt")
```

Both `AudioDeepFakeDetector` and `train_audio_model.py` support loading checkpoints with either `{"model_state_dict": ...}` or direct `state_dict` mappings.

---

## 7. Enable Production Inference

Once `models/audio_deepfake_cnn.pt` is generated:

1. **Verify Checkpoint Placement:**
   Ensure the checkpoint is located at `d:\deepguard-platform\models\audio_deepfake_cnn.pt` (or `ai-service/models/audio_deepfake_cnn.pt`).
2. **AI Microservice Startup:**
   `ai-service/main.py` automatically checks `Path(settings.AUDIO_MODEL_PATH).exists()` upon startup:
   - When the file exists, `AudioDeepFakeDetector` is initialized on CUDA/CPU.
   - `/health` will report `"models_loaded": { "image": true, "video": true, "audio": true }`.
3. **Update Node.js Backend Gateway:**
   In `server/controllers/detectionController.js`, update `detectAudio` to proxy the request to the AI service endpoint (`/detect/audio`) instead of returning 503.
4. **Update Frontend UI:**
   In `client/src/pages/Upload.jsx`, remove the `Coming Soon` badge and allow `.mp3`, `.wav`, and `.flac` file selections in the dropzone.

---

## 8. Test Real and Fake Audio End-to-End

Verify with curl or automated test scripts:

```powershell
# Test genuine audio
curl -X POST http://localhost:5000/api/detect/audio `
     -H "Authorization: Bearer <TOKEN>" `
     -F "audio=@tests/samples/real_speech.wav"

# Test synthetic clone
curl -X POST http://localhost:5000/api/detect/audio `
     -H "Authorization: Bearer <TOKEN>" `
     -F "audio=@tests/samples/fake_clone.wav"
```

Verify that the response includes:
- `verdict`: `REAL` or `FAKE`
- `confidence`: Confidence score
- `suspicious_segments`: Timestamps of flagged cloned voice snippets.
