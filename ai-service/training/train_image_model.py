"""
EfficientNet-B4 Training Pipeline — 3-Phase Progressive Unfreezing
Hardware target: RTX 3050 4GB VRAM
Expected runtime: 4-5 hours for 35 epochs
Expected result: >0.96 AUC on FaceForensics++ test set
"""
import sys, os
from pathlib import Path

_training_dir = Path(__file__).resolve().parent
_ai_service_dir = _training_dir.parent
if str(_ai_service_dir) not in sys.path:
    sys.path.insert(0, str(_ai_service_dir))
if str(_training_dir) not in sys.path:
    sys.path.insert(0, str(_training_dir))

import torch, torch.nn as nn, torch.optim as optim
import numpy as np, pandas as pd, logging, time
from torch.cuda.amp import GradScaler, autocast
from tqdm import tqdm
from models.efficientnet_loader import DeepFakeDetector
from dataset_loader import create_dataloaders, compute_class_weights

logging.basicConfig(level=logging.INFO); logger = logging.getLogger(__name__)

class Config:
    IMAGE_SIZE=224; BATCH_SIZE=16; NUM_WORKERS=0
    EPOCHS_PHASE1=10; EPOCHS_PHASE2=15; EPOCHS_PHASE3=10
    LR_PHASE1=1e-3; LR_PHASE2=5e-4; LR_PHASE3=1e-4; LR_BACKBONE=0.1
    WEIGHT_DECAY=1e-4; DROPOUT_RATE=0.4; USE_AMP=True
    T_0=10; ETA_MIN=1e-7; PATIENCE=8; MIN_DELTA=1e-4
    SAVE_DIR="models/checkpoints"
    BEST_MODEL="models/efficientnet_b4_deepfake.pt"

class Trainer:
    def __init__(self, model, cfg, device, train_ld, val_ld, cw=None):
        self.m=model.to(device); self.cfg=cfg; self.dev=device
        self.tl=train_ld; self.vl=val_ld
        self.crit=nn.BCEWithLogitsLoss()
        self.scaler=GradScaler(init_scale=256.0, enabled=cfg.USE_AMP)
        self.best_auc=0.0; self.patience=0
        Path(cfg.SAVE_DIR).mkdir(parents=True, exist_ok=True)
        Path(cfg.BEST_MODEL).parent.mkdir(parents=True, exist_ok=True)

    def _opt(self, lr, backbone_groups=False):
        if not backbone_groups:
            params=filter(lambda p: p.requires_grad, self.m.parameters())
            opt=optim.AdamW(params, lr=lr, weight_decay=self.cfg.WEIGHT_DECAY)
        else:
            bp=[p for n,p in self.m.named_parameters() if "backbone.features" in n and p.requires_grad]
            hp=[p for n,p in self.m.named_parameters() if "backbone.classifier" in n and p.requires_grad]
            opt=optim.AdamW([{"params":bp,"lr":lr*self.cfg.LR_BACKBONE},{"params":hp,"lr":lr}],weight_decay=self.cfg.WEIGHT_DECAY)
        sch=optim.lr_scheduler.CosineAnnealingWarmRestarts(opt, T_0=self.cfg.T_0, eta_min=self.cfg.ETA_MIN)
        return opt, sch

    def _train_epoch(self, epoch, opt, sch):
        self.m.train(); tloss=correct=total=0
        for images, labels in tqdm(self.tl, desc=f"Ep{epoch}[Train]", leave=False):
            images=images.to(self.dev, non_blocking=True)
            labels=labels.float().unsqueeze(1).to(self.dev)
            opt.zero_grad(set_to_none=True)
            with autocast(enabled=self.cfg.USE_AMP):
                logits=self.m(images)
                loss=self.crit(logits, labels)
            self.scaler.scale(loss).backward()
            self.scaler.unscale_(opt)
            torch.nn.utils.clip_grad_norm_(self.m.parameters(), 1.0)
            self.scaler.step(opt); self.scaler.update()
            with torch.no_grad():
                probs=torch.sigmoid(logits.detach())
                correct+=(((probs>0.5).float()==labels).sum().item())
                total+=labels.size(0); tloss+=loss.item()
        sch.step()
        return tloss/len(self.tl), correct/total

    @torch.no_grad()
    def _validate(self):
        from sklearn.metrics import roc_auc_score
        self.m.eval(); all_p=[]; all_l=[]; vloss=0.0; vcorrect=0; vtotal=0
        for images, labels in tqdm(self.vl, desc="Val", leave=False):
            images=images.to(self.dev)
            lbl_dev=labels.float().unsqueeze(1).to(self.dev)
            with autocast(enabled=self.cfg.USE_AMP):
                logits=self.m(images)
                loss=self.crit(logits, lbl_dev)
            probs=torch.sigmoid(logits)
            vloss+=loss.item()
            vcorrect+=(((probs>0.5).float()==lbl_dev).sum().item())
            vtotal+=labels.size(0)
            all_p.extend(probs.cpu().numpy().flatten().tolist())
            all_l.extend(labels.numpy().tolist())
        return vloss/len(self.vl), vcorrect/vtotal, roc_auc_score(all_l, all_p)

    def train(self):
        epoch=0
        total_epochs=self.cfg.EPOCHS_PHASE1 + self.cfg.EPOCHS_PHASE2 + self.cfg.EPOCHS_PHASE3
        history=[]
        history_csv=Path(self.cfg.SAVE_DIR) / "training_history.csv"
        phases=[(1,self.cfg.EPOCHS_PHASE1,self.cfg.LR_PHASE1,False),
                (2,self.cfg.EPOCHS_PHASE2,self.cfg.LR_PHASE2,True),
                (3,self.cfg.EPOCHS_PHASE3,self.cfg.LR_PHASE3,True)]
        for ph,n_ep,lr,bg in phases:
            if ph==2: self.m.unfreeze_last_n_stages(2)
            elif ph==3: self.m.unfreeze_last_n_stages(8)
            opt, sch = self._opt(lr, backbone_groups=bg)
            for _ in range(n_ep):
                epoch+=1
                t0=time.time()
                cur_lr=opt.param_groups[0]['lr']
                tl, ta = self._train_epoch(epoch, opt, sch)
                vl, va, vauc = self._validate()
                dur=time.time() - t0
                vram_mb = torch.cuda.max_memory_allocated(self.dev)/(1024**2) if self.dev.type=="cuda" else 0.0
                logger.info(f"[P{ph}][Ep{epoch:02d}/{total_epochs:02d}] tLoss:{tl:.4f} tAcc:{ta:.4f} | vLoss:{vl:.4f} vAcc:{va:.4f} vAUC:{vauc:.4f} | lr:{cur_lr:.2e} time:{dur:.1f}s VRAM:{vram_mb:.0f}MB")
                row = {
                    "phase": ph, "epoch": epoch, "train_loss": round(tl, 4), "train_acc": round(ta, 4),
                    "val_loss": round(vl, 4), "val_acc": round(va, 4), "val_auc": round(vauc, 4),
                    "lr": cur_lr, "epoch_duration_sec": round(dur, 1), "peak_vram_mb": round(vram_mb, 1)
                }
                history.append(row)
                pd.DataFrame(history).to_csv(history_csv, index=False)
                if vauc > self.best_auc + self.cfg.MIN_DELTA:
                    self.best_auc=vauc; self.patience=0
                    torch.save({
                        "epoch": epoch,
                        "phase": ph,
                        "model_state_dict": self.m.state_dict(),
                        "val_auc": vauc,
                        "val_loss": vl,
                        "val_acc": va,
                        "train_loss": tl,
                        "train_acc": ta
                    }, self.cfg.BEST_MODEL)
                    logger.info(f"  ✅ Best AUC:{vauc:.4f} (Loss:{vl:.4f}, Acc:{va:.4f}) — saved to {self.cfg.BEST_MODEL}")
                else:
                    self.patience+=1
                    if self.patience>=self.cfg.PATIENCE:
                        logger.info(f"Early stopping triggered at epoch {epoch} (no improvement for {self.cfg.PATIENCE} epochs). Best AUC: {self.best_auc:.4f}")
                        return

def main():
    cfg=Config()
    device=torch.device("cuda" if torch.cuda.is_available() else "cpu")
    train_df=pd.read_csv("datasets/processed/metadata/train_labels.csv")
    cw=compute_class_weights(train_df)
    tl, vl, _ = create_dataloaders(
        train_csv   = "datasets/processed/metadata/train_labels.csv",
        val_csv     = "datasets/processed/metadata/val_labels.csv",
        test_csv    = "datasets/processed/metadata/test_labels.csv",
        img_root    = "datasets/processed/frames",
        batch_size  = cfg.BATCH_SIZE,
        num_workers = cfg.NUM_WORKERS,
        image_size  = cfg.IMAGE_SIZE,
    )
    model=DeepFakeDetector(num_classes=1, dropout_rate=cfg.DROPOUT_RATE, freeze_backbone=True)
    Trainer(model,cfg,device,tl,vl,cw).train()
    logger.info(f"Done. Model: {cfg.BEST_MODEL}")

if __name__=="__main__": main()
