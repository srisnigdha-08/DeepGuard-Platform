import torch, gc, os

class VRAMOptimizer:
    @staticmethod
    def configure():
        if not torch.cuda.is_available():
            print("No GPU found — running on CPU")
            return
        torch.backends.cudnn.benchmark = True
        torch.backends.cuda.matmul.allow_tf32 = True
        os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "max_split_size_mb:512"
        props = torch.cuda.get_device_properties(0)
        print(f"GPU: {props.name} | VRAM: {props.total_memory/1e9:.1f}GB")

    @staticmethod
    def clear_cache():
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    @staticmethod
    def report_vram():
        if not torch.cuda.is_available():
            return
        a = torch.cuda.memory_allocated() / 1e9
        r = torch.cuda.memory_reserved() / 1e9
        t = torch.cuda.get_device_properties(0).total_memory / 1e9
        print(f"VRAM: {a:.2f}GB alloc | {r:.2f}GB reserved | {t-r:.2f}GB free")
