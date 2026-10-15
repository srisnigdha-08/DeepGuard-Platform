import torch
import torch.nn as nn
import numpy as np
import cv2
import logging

logger = logging.getLogger(__name__)


class GradCAM:
    """
    Gradient-weighted Class Activation Mapping.

    WHY Grad-CAM over LIME/SHAP?
    - Zero inference overhead (hooks on existing layers)
    - Spatial resolution matches input image
    - No sampling required (unlike LIME)
    - Produces human-interpretable overlay
    """
    def __init__(self, model: nn.Module):
        self.model = model.eval()
        self.gradients = None
        self.activations = None
        self._find_target_layer()
        self._register_hooks()

    def _find_target_layer(self):
        self.target_layer = None
        for m in self.model.backbone.features[-1].modules():
            if isinstance(m, nn.Conv2d):
                self.target_layer = m

    def _register_hooks(self):
        def fwd(mod, inp, out):
            self.activations = out.detach()
        def bwd(mod, gi, go):
            self.gradients = go[0].detach()
        self.fh = self.target_layer.register_forward_hook(fwd)
        self.bh = self.target_layer.register_full_backward_hook(bwd)

    def generate(self, tensor: torch.Tensor, device: torch.device):
        tensor = tensor.to(device)
        tensor.requires_grad = True
        self.model.zero_grad()
        logits = self.model(tensor)
        confidence = torch.sigmoid(logits).item()
        logits[0, 0].backward()
        weights = self.gradients[0].mean(dim=(1, 2))
        cam = torch.zeros(self.activations[0].shape[1:], device=device)
        for k, w in enumerate(weights):
            cam += w * self.activations[0][k]
        cam = torch.clamp(cam, min=0).cpu().numpy()
        mn, mx = cam.min(), cam.max()
        cam = (cam - mn) / (mx - mn + 1e-8)
        cam = cv2.resize(cam, (224, 224), interpolation=cv2.INTER_CUBIC)
        cam = np.clip(cam, 0.0, 1.0)
        return cam, confidence

    def overlay_on_image(self, orig: np.ndarray, heatmap: np.ndarray, alpha=0.45):
        if orig.shape[:2] != (224, 224):
            orig = cv2.resize(orig, (224, 224))
        colored = cv2.applyColorMap((heatmap * 255).astype(np.uint8), cv2.COLORMAP_JET)
        return cv2.addWeighted(colored.astype(np.float32), alpha,
                               orig.astype(np.float32), 1 - alpha, 0).astype(np.uint8)

    def get_suspicious_regions(self, heatmap: np.ndarray,
                                threshold=0.6, min_area=100):
        binary = (heatmap > threshold).astype(np.uint8) * 255
        num, labels, stats, _ = cv2.connectedComponentsWithStats(binary)
        regions = []
        for i in range(1, num):
            area = stats[i, cv2.CC_STAT_AREA]
            if area < min_area:
                continue
            intensity = float(heatmap[labels == i].mean())
            regions.append({
                "x": int(stats[i, cv2.CC_STAT_LEFT]),
                "y": int(stats[i, cv2.CC_STAT_TOP]),
                "width": int(stats[i, cv2.CC_STAT_WIDTH]),
                "height": int(stats[i, cv2.CC_STAT_HEIGHT]),
                "area": int(area),
                "intensity": round(intensity, 3),
                "suspicion_level": ("high" if intensity > 0.8
                                    else "medium" if intensity > 0.65 else "low"),
            })
        return sorted(regions, key=lambda r: r["intensity"], reverse=True)

    def cleanup(self):
        self.fh.remove()
        self.bh.remove()
