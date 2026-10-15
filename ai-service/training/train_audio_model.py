"""
Audio DeepFake Detection Model Training Pipeline
Trains the AudioDeepFakeCNN architecture on extracted 3-channel
mel-spectrogram + delta-MFCC + chroma features.

Target: RTX 3050 Laptop GPU / CUDA or CPU
Expected checkpoint: models/audio_deepfake_cnn.pt
"""
import sys, os, argparse, time, logging
from pathlib import Path

_training_dir = Path(__file__).resolve().parent
_ai_service_dir = _training_dir.parent
if str(_ai_service_dir) not in sys.path:
    sys.path.insert(0, str(_ai_service_dir))
if str(_training_dir) not in sys.path:
    sys.path.insert(0, str(_training_dir))

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
from sklearn.metrics import roc_auc_score, accuracy_score, precision_score, recall_score, f1_score

from services.audio_detector import AudioDeepFakeCNN, AudioPreprocessor

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


class AudioDataset(Dataset):
    """
    Loads audio clips from real and fake directories, extracting
    3-channel (mel, delta MFCC, chroma) 224x224 features.
    """
    def __init__(self, samples: list, preprocessor: AudioPreprocessor):
        self.samples = samples  # list of (audio_path, label: 0 for real, 1 for fake)
        self.preprocessor = preprocessor

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        feat = self.preprocessor.extract(path)
        if feat is None:
            # Fallback to zeros tensor if file read fails
            feat = np.zeros((3, 224, 224), dtype=np.float32)
        return torch.from_numpy(feat).float(), torch.tensor(label, dtype=torch.float32)


def collect_samples(data_dir: str):
    """
    Discovers real (label 0) and fake (label 1) audio files.
    Supports structures:
      data_dir/real/*.wav (or .mp3, .flac)
      data_dir/fake/*.wav (or .mp3, .flac)
    """
    data_path = Path(data_dir)
    real_dir = data_path / "real"
    fake_dir = data_path / "fake"

    extensions = ("*.wav", "*.mp3", "*.flac", "*.ogg", "*.m4a")
    real_files = []
    fake_files = []

    if real_dir.exists():
        for ext in extensions:
            real_files.extend(list(real_dir.glob(ext)))
    if fake_dir.exists():
        for ext in extensions:
            fake_files.extend(list(fake_dir.glob(ext)))

    samples = [(str(p), 0) for p in real_files] + [(str(p), 1) for p in fake_files]
    np.random.seed(42)
    np.random.shuffle(samples)
    return samples


def train_audio_model(data_dir: str, output_path: str, epochs: int = 20,
                      batch_size: int = 16, lr: float = 1e-3, device_str: str = "auto"):
    if device_str == "auto":
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    else:
        device = torch.device(device_str)

    logger.info(f"Training AudioDeepFakeCNN on device: {device}")
    samples = collect_samples(data_dir)

    if not samples:
        logger.error(f"No audio files found in {data_dir}. Expected 'real/' and 'fake/' subdirectories.")
        return

    n_val = max(1, int(len(samples) * 0.2))
    train_samples = samples[n_val:]
    val_samples = samples[:n_val]
    logger.info(f"Loaded {len(train_samples)} training samples and {len(val_samples)} validation samples.")

    preprocessor = AudioPreprocessor(dur=4.0)
    train_ds = AudioDataset(train_samples, preprocessor)
    val_ds = AudioDataset(val_samples, preprocessor)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=0)

    model = AudioDeepFakeCNN().to(device)
    criterion = nn.BCEWithLogitsLoss()
    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-6)

    best_auc = 0.0
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        for features, labels in train_loader:
            features = features.to(device)
            labels = labels.unsqueeze(1).to(device)

            optimizer.zero_grad()
            outputs = model(features)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

            train_loss += loss.item() * len(labels)

        scheduler.step()
        train_loss /= len(train_samples)

        # Validation
        model.eval()
        val_targets, val_preds = [], []
        with torch.no_grad():
            for features, labels in val_loader:
                features = features.to(device)
                outputs = model(features)
                probs = torch.sigmoid(outputs).cpu().numpy().flatten()
                val_preds.extend(probs)
                val_targets.extend(labels.numpy().flatten())

        val_targets = np.array(val_targets)
        val_preds = np.array(val_preds)
        binary_preds = (val_preds >= 0.5).astype(int)

        try:
            val_auc = roc_auc_score(val_targets, val_preds) if len(np.unique(val_targets)) > 1 else 0.5
        except Exception:
            val_auc = 0.5
        val_acc = accuracy_score(val_targets, binary_preds)

        logger.info(f"Epoch [{epoch}/{epochs}] - Loss: {train_loss:.4f} | Val AUC: {val_auc:.4f} | Val Acc: {val_acc:.4f}")

        if val_auc > best_auc:
            best_auc = val_auc
            torch.save({
                "model_state_dict": model.state_dict(),
                "epoch": epoch,
                "val_roc_auc": val_auc,
                "val_acc": val_acc,
                "architecture": "AudioDeepFakeCNN",
                "sample_rate": 16000,
                "duration_sec": 4.0,
            }, output_path)
            logger.info(f"--> Saved best checkpoint to {output_path} (AUC: {best_auc:.4f})")

    logger.info(f"Training completed. Best Val AUC: {best_auc:.4f}")


def evaluate_checkpoint(checkpoint_path: str, data_dir: str, device_str: str = "auto"):
    if device_str == "auto":
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    else:
        device = torch.device(device_str)

    if not Path(checkpoint_path).exists():
        logger.error(f"Checkpoint not found: {checkpoint_path}")
        return

    samples = collect_samples(data_dir)
    if not samples:
        logger.error(f"No audio files found in {data_dir}.")
        return

    preprocessor = AudioPreprocessor(dur=4.0)
    dataset = AudioDataset(samples, preprocessor)
    loader = DataLoader(dataset, batch_size=16, shuffle=False)

    model = AudioDeepFakeCNN().to(device)
    ckpt = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(ckpt.get("model_state_dict", ckpt))
    model.eval()

    all_targets, all_preds = [], []
    with torch.no_grad():
        for features, labels in loader:
            features = features.to(device)
            outputs = model(features)
            probs = torch.sigmoid(outputs).cpu().numpy().flatten()
            all_preds.extend(probs)
            all_targets.extend(labels.numpy().flatten())

    targets = np.array(all_targets)
    preds = np.array(all_preds)
    binary_preds = (preds >= 0.5).astype(int)

    auc = roc_auc_score(targets, preds) if len(np.unique(targets)) > 1 else 0.5
    acc = accuracy_score(targets, binary_preds)
    prec = precision_score(targets, binary_preds, zero_division=0)
    rec = recall_score(targets, binary_preds, zero_division=0)
    f1 = f1_score(targets, binary_preds, zero_division=0)

    logger.info("=" * 50)
    logger.info("AUDIO MODEL EVALUATION REPORT")
    logger.info("=" * 50)
    logger.info(f"Total Evaluated Samples: {len(targets)}")
    logger.info(f"ROC-AUC:               {auc:.4f}")
    logger.info(f"Accuracy:              {acc * 100:.2f}%")
    logger.info(f"Fake Precision:        {prec * 100:.2f}%")
    logger.info(f"Fake Recall:           {rec * 100:.2f}%")
    logger.info(f"F1-Score:              {f1:.4f}")
    logger.info("=" * 50)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train or evaluate AudioDeepFakeCNN")
    parser.add_argument("--data_dir", type=str, default="datasets/audio", help="Directory with real/ and fake/ subfolders")
    parser.add_argument("--output", type=str, default="models/audio_deepfake_cnn.pt", help="Path to save best checkpoint")
    parser.add_argument("--epochs", type=int, default=20, help="Number of training epochs")
    parser.add_argument("--batch_size", type=int, default=16, help="Batch size")
    parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate")
    parser.add_argument("--device", type=str, default="auto", help="Device (cuda, cpu, or auto)")
    parser.add_argument("--evaluate", action="store_true", help="Evaluate existing checkpoint against dataset")
    parser.add_argument("--checkpoint", type=str, default="models/audio_deepfake_cnn.pt", help="Checkpoint to evaluate")

    args = parser.parse_args()

    if args.evaluate:
        evaluate_checkpoint(args.checkpoint, args.data_dir, args.device)
    else:
        train_audio_model(args.data_dir, args.output, args.epochs, args.batch_size, args.lr, args.device)
