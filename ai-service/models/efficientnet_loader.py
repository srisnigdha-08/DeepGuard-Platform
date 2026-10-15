import torch
import torch.nn as nn
import torchvision.models as models
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class DeepFakeDetector(nn.Module):
    """
    EfficientNet-B4 fine-tuned for binary deepfake classification.

    WHY EfficientNet-B4 over ResNet/Xception?
    - Compound scaling (depth + width + resolution) = best accuracy-per-param
    - 19M params fits in 4GB VRAM with batch size 32
    - Pre-trained ImageNet features transfer well to face forensics
    """
    def __init__(self, num_classes=1, dropout_rate=0.4, freeze_backbone=False):
        super().__init__()
        self.backbone = models.efficientnet_b4(
            weights=models.EfficientNet_B4_Weights.IMAGENET1K_V1)
        if freeze_backbone:
            for p in self.backbone.parameters():
                p.requires_grad = False
        in_f = self.backbone.classifier[1].in_features   # 1792
        self.backbone.classifier = nn.Sequential(
            nn.Dropout(p=dropout_rate, inplace=True),
            nn.Linear(in_f, 512), nn.BatchNorm1d(512), nn.SiLU(),
            nn.Dropout(p=dropout_rate * 0.5),
            nn.Linear(512, 256), nn.BatchNorm1d(256), nn.SiLU(),
            nn.Linear(256, num_classes))
        for m in self.backbone.classifier.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, mode="fan_out", nonlinearity="relu")
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0)

    def forward(self, x):
        return self.backbone(x)

    def unfreeze_last_n_stages(self, n=2):
        for p in self.backbone.features.parameters():
            p.requires_grad = False
        total = len(self.backbone.features)
        for i in range(total - n, total):
            for p in self.backbone.features[i].parameters():
                p.requires_grad = True
        for p in self.backbone.classifier.parameters():
            p.requires_grad = True
        trainable = sum(p.numel() for p in self.parameters() if p.requires_grad)
        logger.info(f"Unfroze last {n} stages. Trainable: {trainable:,}")


def load_efficientnet(model_path: str, device: torch.device) -> DeepFakeDetector:
    path = Path(model_path)
    if not path.exists():
        # Search relative to repo root and ai-service root
        app_dir = Path(__file__).resolve().parent.parent
        repo_dir = app_dir.parent
        candidates = [
            repo_dir / model_path,
            app_dir / model_path,
        ]
        for c in candidates:
            if c.exists():
                path = c
                break

    if not path.exists():
        err_msg = (
            f"CRITICAL ERROR: Evaluated EfficientNet-B4 checkpoint not found at: '{model_path}'. "
            "Production inference cannot proceed without the verified trained weights. "
            "Silent fallback to ImageNet weights is disabled."
        )
        logger.critical(err_msg)
        raise FileNotFoundError(err_msg)

    try:
        model = DeepFakeDetector(num_classes=1, dropout_rate=0.4)
        ckpt = torch.load(path, map_location=device)

        state_dict = ckpt.get("model_state_dict", ckpt) if isinstance(ckpt, dict) else ckpt
        missing, unexpected = model.load_state_dict(state_dict, strict=True)
        if len(missing) > 0 or len(unexpected) > 0:
            raise RuntimeError(f"State dict mismatch! Missing: {missing}, Unexpected: {unexpected}")

        model = model.to(device).eval()
        for p in model.parameters():
            p.requires_grad = False

        epoch = ckpt.get("epoch", "N/A") if isinstance(ckpt, dict) else "N/A"
        phase = ckpt.get("phase", "N/A") if isinstance(ckpt, dict) else "N/A"
        val_auc = ckpt.get("val_auc", None) if isinstance(ckpt, dict) else None
        total_params = sum(p.numel() for p in model.parameters())

        logger.info("=" * 65)
        logger.info("  EFFICIENTNET-B4 PRODUCTION MODEL LOADED SUCCESSFULLY")
        logger.info("=" * 65)
        logger.info(f"  Checkpoint Path:     {path.resolve()}")
        logger.info(f"  File Size:           {path.stat().st_size / (1024**2):.2f} MB")
        logger.info(f"  Checkpoint Epoch:    {epoch} (Phase {phase})")
        if val_auc is not None:
            logger.info(f"  Validation ROC-AUC:  {val_auc:.5f}")
        logger.info(f"  Architecture:        EfficientNet-B4 + 9-layer MLP Head")
        logger.info(f"  Total Parameters:    {total_params:,}")
        logger.info(f"  Weights Verification: Strict match (0 missing, 0 unexpected)")
        logger.info("=" * 65)

        return model

    except Exception as e:
        logger.critical(f"FATAL: Model load failed from {path}: {e}")
        raise RuntimeError(f"Production model load failed: {e}") from e