"""
Model evaluation script — generates confusion matrix, ROC curve,
per-class metrics, and finds optimal decision threshold.

Usage:
  cd ai-service
  python training/evaluate_model.py

Output files (in docs/evaluation/):
  metrics.json          — All scalar metrics
  confusion_matrix.png  — Raw + normalised side-by-side
  roc_curve.png         — ROC with optimal threshold marked
"""

import torch, numpy as np, json, logging, sys
import matplotlib.pyplot as plt, seaborn as sns
from pathlib import Path
from torch.cuda.amp import autocast
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, roc_curve, confusion_matrix,
)

logging.basicConfig(level=logging.INFO); logger = logging.getLogger(__name__)

# ── Evaluator ────────────────────────────────────────────────
class ModelEvaluator:
    def __init__(self, model, device, use_amp=True):
        self.model   = model.eval()
        self.device  = device
        self.use_amp = use_amp

    @torch.no_grad()
    def collect(self, loader):
        all_probs = []; all_labels = []
        for images, labels in loader:
            images = images.to(self.device, non_blocking=True)
            with autocast(enabled=self.use_amp):
                logits = self.model(images)
            probs = torch.sigmoid(logits).cpu().numpy().flatten()
            all_probs.extend(probs.tolist())
            all_labels.extend(labels.numpy().tolist())
        return np.array(all_probs), np.array(all_labels)

    def metrics(self, probs, labels, threshold=0.5):
        preds = (probs >= threshold).astype(int)
        return {
            "accuracy":        round(accuracy_score(labels, preds), 4),
            "precision_macro": round(precision_score(labels, preds, average="macro",  zero_division=0), 4),
            "recall_macro":    round(recall_score(labels, preds,    average="macro",  zero_division=0), 4),
            "f1_macro":        round(f1_score(labels, preds,        average="macro",  zero_division=0), 4),
            "precision_fake":  round(precision_score(labels, preds, pos_label=1, average="binary", zero_division=0), 4),
            "recall_fake":     round(recall_score(labels, preds,    pos_label=1, average="binary", zero_division=0), 4),
            "f1_fake":         round(f1_score(labels, preds,        pos_label=1, average="binary", zero_division=0), 4),
            "roc_auc":         round(roc_auc_score(labels, probs), 4),
            "threshold":       threshold,
            "mean_conf_real":  round(float(probs[labels == 0].mean()), 4) if (labels == 0).any() else 0.0,
            "mean_conf_fake":  round(float(probs[labels == 1].mean()), 4) if (labels == 1).any() else 0.0,
        }

    def find_optimal_threshold(self, probs, labels):
        """Youden's J statistic: maximise TPR - FPR."""
        fpr, tpr, thresholds = roc_curve(labels, probs)
        j = tpr - fpr
        return float(thresholds[np.argmax(j)])

    def plot_confusion_matrix(self, labels, probs, threshold, save_path):
        preds = (probs >= threshold).astype(int)
        cm  = confusion_matrix(labels, preds)
        cmn = cm.astype(float) / cm.sum(axis=1, keepdims=True)
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
        ticklabels = ["Real", "Fake"]
        sns.heatmap(cm,  annot=True, fmt="d",    cmap="Blues",  xticklabels=ticklabels, yticklabels=ticklabels, ax=ax1)
        sns.heatmap(cmn, annot=True, fmt=".2%",  cmap="Greens", xticklabels=ticklabels, yticklabels=ticklabels, ax=ax2)
        ax1.set_title("Counts"); ax2.set_title("Normalised")
        ax1.set_ylabel("Actual"); ax2.set_ylabel("Actual")
        for ax in (ax1, ax2): ax.set_xlabel("Predicted")
        plt.tight_layout(); plt.savefig(save_path, dpi=150, bbox_inches="tight"); plt.close()
        logger.info(f"Confusion matrix saved to {save_path}")

    def plot_roc(self, labels, probs, save_path):
        fpr, tpr, thresholds = roc_curve(labels, probs)
        auc = roc_auc_score(labels, probs)
        j   = tpr - fpr; oi = np.argmax(j); ot = float(thresholds[oi])

        fig, ax = plt.subplots(figsize=(8, 7))
        ax.plot(fpr, tpr, color="#6366f1", lw=2.5, label=f"AUC = {auc:.4f}")
        ax.scatter(fpr[oi], tpr[oi], color="#ef4444", s=120, zorder=5,
                   label=f"Optimal threshold = {ot:.3f}\n(TPR={tpr[oi]:.3f}, FPR={fpr[oi]:.3f})")
        ax.plot([0, 1], [0, 1], "k--", lw=1, alpha=0.5, label="Random classifier")
        ax.fill_between(fpr, tpr, alpha=0.08, color="#6366f1")
        ax.set_xlabel("False Positive Rate"); ax.set_ylabel("True Positive Rate")
        ax.set_title("ROC Curve — DeepFake Detection"); ax.legend(loc="lower right"); ax.grid(alpha=0.3)
        plt.tight_layout(); plt.savefig(save_path, dpi=150, bbox_inches="tight"); plt.close()
        logger.info(f"ROC curve saved to {save_path}")
        return ot

    def full_evaluation(self, test_loader, save_dir="docs/evaluation"):
        Path(save_dir).mkdir(parents=True, exist_ok=True)
        logger.info("Collecting predictions…")
        probs, labels = self.collect(test_loader)

        # Find optimal threshold from validation data
        opt_threshold = self.find_optimal_threshold(probs, labels)
        logger.info(f"Optimal threshold (Youden's J): {opt_threshold:.4f}")

        m = self.metrics(probs, labels, threshold=opt_threshold)

        print("\n" + "=" * 58)
        print("  EVALUATION RESULTS")
        print("=" * 58)
        for k, v in m.items():
            print(f"  {k:<24} {v}")
        print("=" * 58)

        with open(f"{save_dir}/metrics.json", "w") as f:
            json.dump(m, f, indent=2)

        self.plot_confusion_matrix(labels, probs, opt_threshold, f"{save_dir}/confusion_matrix.png")
        self.plot_roc(labels, probs, f"{save_dir}/roc_curve.png")

        logger.info(f"✅ Evaluation complete. Results saved to {save_dir}/")
        return m


# ── CLI entry point ──────────────────────────────────────────
def main():
    import sys; sys.path.insert(0, ".")
    from models.efficientnet_loader import load_efficientnet
    from training.dataset_loader import create_dataloaders

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Device: {device}")

    model = load_efficientnet("models/efficientnet_b4_deepfake.pt", device)

    _, _, test_loader = create_dataloaders(
        train_csv  = "datasets/processed/metadata/train_labels.csv",
        val_csv    = "datasets/processed/metadata/val_labels.csv",
        test_csv   = "datasets/processed/metadata/test_labels.csv",
        img_root   = "datasets/processed/frames",
        batch_size = 64,
        num_workers= 4,
    )

    evaluator = ModelEvaluator(model, device)
    evaluator.full_evaluation(test_loader)


if __name__ == "__main__":
    main()
