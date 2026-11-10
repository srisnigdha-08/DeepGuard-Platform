from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import uvicorn, torch, uuid, os, logging, traceback, asyncio
from pathlib import Path
from contextlib import asynccontextmanager
from app.core.config import settings
from app.core.gpu_config import VRAMOptimizer
from app.core.security import verify_service_key
from models.efficientnet_loader import load_efficientnet

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

device = image_detector = video_detector = audio_detector = None
ALLOWED_IMAGE = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO = {"video/mp4", "video/avi", "video/quicktime"}
ALLOWED_AUDIO = {"audio/mpeg", "audio/wav", "audio/x-wav", "audio/flac"}

MAGIC = {
    "image/jpeg":  (b"\xff\xd8\xff", 0),
    "image/png":   (b"\x89PNG",        0),
    "image/webp":  (b"RIFF",           0),
    "video/mp4":   (b"ftyp",           4),
    "video/avi":   (b"RIFF",           0),
    "audio/mpeg":  (b"ID3",            0),
    "audio/wav":   (b"RIFF",           0),
    "audio/flac":  (b"fLaC",           0),
}

def verify_magic(header: bytes, content_type: str) -> bool:
    if not header or len(header) < 4:
        return False
    if content_type == "video/quicktime":
        if len(header) >= 8:
            brand = header[4:8]
            return brand in {b"ftyp", b"moov", b"mdat", b"wide", b"free", b"qt  "}
        return False
    if content_type == "audio/mpeg":
        return header.startswith(b"ID3") or (len(header) >= 2 and header[0] == 0xFF and (header[1] & 0xE0) == 0xE0)
    sig = MAGIC.get(content_type)
    if not sig:
        return False
    magic_bytes, offset = sig
    return header[offset:offset + len(magic_bytes)] == magic_bytes


@asynccontextmanager
async def lifespan(app: FastAPI):
    global device, image_detector, video_detector, audio_detector
    logger.info("=" * 50)
    logger.info("DeepGuard AI Service starting…")
    VRAMOptimizer.configure()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Device: {device}")
    efficientnet = load_efficientnet(settings.EFFICIENTNET_MODEL_PATH, device)
    from services.image_detector import ImageDeepFakeDetector
    from services.video_detector import VideoDeepFakeDetector
    image_detector = ImageDeepFakeDetector(efficientnet, device, settings.DECISION_THRESHOLD)
    video_detector = VideoDeepFakeDetector(efficientnet, device, settings.DECISION_THRESHOLD)
    if Path(settings.AUDIO_MODEL_PATH).exists():
        from services.audio_detector import AudioDeepFakeDetector
        audio_detector = AudioDeepFakeDetector(
            settings.AUDIO_MODEL_PATH, device, settings.AUDIO_THRESHOLD)
        logger.info("Audio model loaded ✅")
    else:
        logger.warning("Audio model not found – audio detection disabled")
    VRAMOptimizer.report_vram()
    logger.info("Service ready ✅")
    yield
    VRAMOptimizer.clear_cache()


app = FastAPI(title="DeepGuard AI Service", version="1.0.0",
              lifespan=lifespan, docs_url="/docs", redoc_url="/redoc")

app.add_middleware(CORSMiddleware,
    allow_origins=[settings.NODE_SERVICE_URL, "http://localhost:5000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-Service-Key"])

Path("static/heatmaps").mkdir(parents=True, exist_ok=True)
Path(settings.TEMP_UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.exception_handler(RequestValidationError)
async def validation_handler(req, exc):
    return JSONResponse(status_code=422,
        content={"status": "validation_error", "detail": exc.errors()})

@app.exception_handler(Exception)
async def general_handler(req, exc):
    if "CUDA out of memory" in str(exc):
        torch.cuda.empty_cache()
        return JSONResponse(status_code=503,
            content={"status": "gpu_oom", "detail": "GPU memory exhausted. Try a smaller file."})
    logger.error(traceback.format_exc())
    return JSONResponse(status_code=500,
        content={"status": "internal_error", "detail": "Analysis failed."})


async def save_upload(file: UploadFile, allowed: set, max_mb: int) -> str:
    if file.content_type not in allowed:
        raise HTTPException(415, f"Unsupported type: {file.content_type}")
    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "bin"
    fpath = os.path.join(settings.TEMP_UPLOAD_DIR, f"{uuid.uuid4().hex}.{ext}")
    total = 0
    with open(fpath, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            total += len(chunk)
            if total > max_mb * 1024 * 1024:
                break
            f.write(chunk)
    if total > max_mb * 1024 * 1024:
        if os.path.exists(fpath):
            try:
                os.unlink(fpath)
            except Exception:
                pass
        raise HTTPException(413, f"File exceeds {max_mb}MB limit")
    header = b""
    with open(fpath, "rb") as f:
        header = f.read(16)
    if not verify_magic(header, file.content_type):
        if os.path.exists(fpath):
            try:
                os.unlink(fpath)
            except Exception:
                pass
        raise HTTPException(400, "File content does not match declared type (magic bytes mismatch).")
    return fpath

def cleanup(path: str):
    try:
        if os.path.exists(path):
            os.unlink(path)
    except Exception as e:
        logger.warning(f"Cleanup failed for {path}: {e}")


@app.get("/health")
async def health():
    gpu = torch.cuda.is_available()
    vram = None
    if gpu:
        props = torch.cuda.get_device_properties(0)
        vram = round((props.total_memory - torch.cuda.memory_allocated()) / 1e9, 2)
    return {
        "status": "healthy",
        "gpu": gpu,
        "gpu_name": torch.cuda.get_device_name(0) if gpu else None,
        "vram_free_gb": vram,
        "models_loaded": {
            "image": image_detector is not None,
            "video": video_detector is not None,
            "audio": audio_detector is not None,
        },
    }

@app.get("/model/info", dependencies=[Security(verify_service_key)])
async def model_info():
    return {
        "model_name": "EfficientNet-B4 (Binary DeepFake Classifier)",
        "checkpoint_epoch": 34,
        "checkpoint_phase": 3,
        "input_resolution": "224x224 RGB",
        "decision_threshold": 0.50,
        "validation_metrics": {
            "roc_auc": 0.8766,
            "accuracy": 0.7958,
            "loss": 0.4441,
        },
        "isolated_test_metrics": {
            "roc_auc": 0.8853,
            "pr_auc": 0.9686,
            "accuracy": 0.7968,
            "fake_precision": 0.9450,
            "fake_recall_sensitivity": 0.7920,
            "specificity": 0.8160,
            "f1_score": 0.8618,
            "test_samples": 4991,
        },
        "image_model": "EfficientNet-B4 fine-tuned on FaceForensics++ C23",
        "video_model": "EfficientNet-B4 + scene-aware frame sampling + temporal aggregation",
        "audio_model": "AudioDeepFakeCNN (Prototype / In development / Checkpoint not loaded)",
    }

# Defense-in-depth: bound concurrent heavy inference on AI service directly
inference_semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_DETECTIONS)

@app.post("/detect/image", dependencies=[Security(verify_service_key)])
async def detect_image(file: UploadFile = File(...), bg: BackgroundTasks = BackgroundTasks()):
    if not image_detector:
        raise HTTPException(503, "Image detector not initialized")
    if inference_semaphore.locked():
        logger.warning(f"AI service inference semaphore saturated ({settings.MAX_CONCURRENT_DETECTIONS} active)")
        raise HTTPException(429, "AI service is currently at maximum capacity. Please retry shortly.")
    async with inference_semaphore:
        path = await save_upload(file, ALLOWED_IMAGE, settings.MAX_IMAGE_MB)
        bg.add_task(cleanup, path)
        result = image_detector.analyze(path)
        if result.get("status") == "failed":
            raise HTTPException(422, result.get("error", "Analysis failed"))
        return result

@app.post("/detect/video", dependencies=[Security(verify_service_key)])
async def detect_video(file: UploadFile = File(...), bg: BackgroundTasks = BackgroundTasks()):
    if not video_detector:
        raise HTTPException(503, "Video detector not initialized")
    if inference_semaphore.locked():
        logger.warning(f"AI service inference semaphore saturated ({settings.MAX_CONCURRENT_DETECTIONS} active)")
        raise HTTPException(429, "AI service is currently at maximum capacity. Please retry shortly.")
    async with inference_semaphore:
        path = await save_upload(file, ALLOWED_VIDEO, settings.MAX_VIDEO_MB)
        bg.add_task(cleanup, path)
        result = video_detector.analyze(path)
        if result.get("status") == "failed":
            raise HTTPException(422, result.get("error", "Analysis failed"))
        return result

@app.post("/detect/audio", dependencies=[Security(verify_service_key)])
async def detect_audio(file: UploadFile = File(...), bg: BackgroundTasks = BackgroundTasks()):
    if not audio_detector:
        raise HTTPException(503, "Audio model not loaded")
    if inference_semaphore.locked():
        logger.warning(f"AI service inference semaphore saturated ({settings.MAX_CONCURRENT_DETECTIONS} active)")
        raise HTTPException(429, "AI service is currently at maximum capacity. Please retry shortly.")
    async with inference_semaphore:
        path = await save_upload(file, ALLOWED_AUDIO, settings.MAX_AUDIO_MB)
        bg.add_task(cleanup, path)
        result = audio_detector.analyze(path)
        if result.get("status") == "failed":
            raise HTTPException(422, result.get("error", "Analysis failed"))
        return result

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, workers=1, reload=False)
