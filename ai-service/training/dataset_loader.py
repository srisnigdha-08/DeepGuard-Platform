import torch, numpy as np, pandas as pd, cv2, os
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
import albumentations as A
from albumentations.pytorch import ToTensorV2

def get_train_transforms(sz=224):
    return A.Compose([
        A.RandomResizedCrop(height=sz, width=sz, scale=(0.8, 1.0)),
        A.HorizontalFlip(p=0.5),
        A.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1, hue=0.05, p=0.5),
        A.GaussNoise(var_limit=(5, 30), p=0.3),
        A.ImageCompression(quality_lower=70, quality_upper=95, p=0.4),
        A.OneOf([A.GaussianBlur(blur_limit=(3, 7)), A.MedianBlur(blur_limit=5)], p=0.2),
        A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ToTensorV2()])

def get_val_transforms(sz=224):
    return A.Compose([
        A.Resize(height=sz, width=sz),
        A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ToTensorV2()])

class DeepFakeDataset(Dataset):
    def __init__(self, csv_path, img_root, transform=None, split="train"):
        self.df = pd.read_csv(csv_path)
        if "split" in self.df.columns and split is not None:
            filtered = self.df[self.df["split"] == split]
            if len(filtered) > 0:
                self.df = filtered
        self.df = self.df.reset_index(drop=True)
        self.img_root = img_root; self.transform = transform; self.split = split

    def __len__(self): return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        sp = row["split"] if "split" in row and pd.notna(row["split"]) else self.split
        label_str = row["label_str"] if "label_str" in row and pd.notna(row["label_str"]) else ("real" if int(row["label"]) == 0 else "fake")
        path = os.path.join(self.img_root, sp, label_str, row["filename"])
        image = cv2.imread(path)
        if image is None:
            image = np.zeros((224, 224, 3), dtype=np.uint8)
        else:
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        if self.transform:
            image = self.transform(image=image)["image"]
        return image, int(row["label"])

def compute_class_weights(train_df):
    counts = np.bincount(train_df["label"].values)
    w = 1.0 / counts
    return torch.tensor([w[1] / w[0]])

def create_dataloaders(
    train_csv="datasets/processed/metadata/train_labels.csv",
    val_csv="datasets/processed/metadata/val_labels.csv",
    test_csv="datasets/processed/metadata/test_labels.csv",
    img_root="datasets/processed/frames",
    batch_size=32,
    num_workers=4,
    image_size=224,
    csv_path=None,
):
    """
    Create DataLoaders for train, val, and test splits.
    Supports separate per-split CSVs or a single combined CSV.
    """
    from pathlib import Path

    # Backward compatibility with legacy signature:
    # create_dataloaders(csv_path, img_root, batch_size, num_workers, image_size)
    if csv_path is not None:
        single_csv = csv_path
    elif isinstance(val_csv, str) and not val_csv.endswith(".csv"):
        single_csv = train_csv
        img_root = val_csv
        if isinstance(test_csv, int):
            batch_size = test_csv
    elif val_csv is None and test_csv is None:
        single_csv = train_csv
    else:
        single_csv = None

    if single_csv is not None:
        p = Path(single_csv)
        df_head = pd.read_csv(single_csv, nrows=100)
        if "split" in df_head.columns and len(df_head["split"].unique()) > 1:
            train_src, val_src, test_src = single_csv, single_csv, single_csv
        else:
            meta_dir = p.parent
            train_src = meta_dir / "train_labels.csv" if (meta_dir / "train_labels.csv").exists() else single_csv
            val_src   = meta_dir / "val_labels.csv"   if (meta_dir / "val_labels.csv").exists() else single_csv
            test_src  = meta_dir / "test_labels.csv"  if (meta_dir / "test_labels.csv").exists() else single_csv
    else:
        train_src, val_src, test_src = train_csv, val_csv, test_csv

    train_ds = DeepFakeDataset(train_src, img_root, get_train_transforms(image_size), "train")
    val_ds   = DeepFakeDataset(val_src,   img_root, get_val_transforms(image_size),   "val")
    test_ds  = DeepFakeDataset(test_src,  img_root, get_val_transforms(image_size),   "test")

    labels  = train_ds.df["label"].values
    cw      = 1.0 / np.bincount(labels)
    sampler = WeightedRandomSampler(cw[labels], num_samples=len(labels), replacement=True)
    return (DataLoader(train_ds, batch_size=batch_size, sampler=sampler,
                       num_workers=num_workers, pin_memory=True, drop_last=True),
            DataLoader(val_ds,   batch_size=batch_size*2, shuffle=False,
                       num_workers=num_workers, pin_memory=True),
            DataLoader(test_ds,  batch_size=batch_size*2, shuffle=False,
                       num_workers=num_workers, pin_memory=True))
