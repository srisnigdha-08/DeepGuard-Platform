import os
from pathlib import Path
from pydantic_settings import BaseSettings

_app_dir = Path(__file__).resolve().parent.parent.parent
_repo_dir = _app_dir.parent

def _resolve_checkpoint_path(default_rel: str) -> str:
    candidates = [
        Path(default_rel),
        _repo_dir / default_rel,
        _app_dir / default_rel,
    ]
    for c in candidates:
        if c.exists():
            return str(c.resolve())
    return str((_repo_dir / default_rel).resolve())

class Settings(BaseSettings):
    EFFICIENTNET_MODEL_PATH: str = _resolve_checkpoint_path("models/efficientnet_b4_deepfake.pt")
    AUDIO_MODEL_PATH: str = _resolve_checkpoint_path("models/audio_deepfake_cnn.pt")
    DECISION_THRESHOLD: float = 0.5
    AUDIO_THRESHOLD: float = 0.5
    NODE_SERVICE_URL: str = "http://localhost:5000"
    TEMP_UPLOAD_DIR: str = "temp_uploads"
    MAX_IMAGE_MB: int = 20
    MAX_VIDEO_MB: int = 500
    MAX_AUDIO_MB: int = 50
    BATCH_SIZE: int = 16
    MAX_VIDEO_FRAMES: int = 60
    MAX_CONCURRENT_DETECTIONS: int = 5
    SERVICE_SECRET_KEY: str = ""
    AI_SERVICE_KEY: str = ""
    ENVIRONMENT: str = "development"

    @property
    def effective_service_key(self) -> str:
        """
        Retrieves the configured service authentication secret.
        Prefers AI_SERVICE_KEY (matching Node backend config), falling back to SERVICE_SECRET_KEY.
        """
        if self.AI_SERVICE_KEY and self.AI_SERVICE_KEY.strip():
            return self.AI_SERVICE_KEY.strip()
        if self.SERVICE_SECRET_KEY and self.SERVICE_SECRET_KEY.strip():
            return self.SERVICE_SECRET_KEY.strip()
        return ""

    class Config:
        env_file = _app_dir / ".env"
        case_sensitive = False
        extra = "ignore"

settings = Settings()
