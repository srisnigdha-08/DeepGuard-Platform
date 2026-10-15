# 🛡️ DeepGuard — AI-Powered DeepFake Detection Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![React](https://img.shields.io/badge/Frontend-React%2018%20%7C%20Vite-61DAFB?logo=react&logoColor=black)](client/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js%20%7C%20Express-339933?logo=node.js&logoColor=white)](server/)
[![FastAPI](https://img.shields.io/badge/AI%20Microservice-FastAPI%20%7C%20Python-009688?logo=fastapi&logoColor=white)](ai-service/)
[![PyTorch](https://img.shields.io/badge/Inference-PyTorch%20%7C%20CUDA-EE4C2C?logo=pytorch&logoColor=white)](ai-service/)

> Production-grade deepfake detection platform utilizing a fine-tuned **EfficientNet-B4** neural network with **Grad-CAM visual explainability**, intelligent temporal frame aggregation, and automated forensic report generation. Built with a React SPA frontend, an Express/Node.js orchestration backend, MongoDB persistence, and a high-performance Python FastAPI AI microservice.

---

## 📌 Problem Statement & Objectives

Synthetic media and generative AI manipulation have outpaced conventional forensic tools, enabling hyper-realistic face-swaps, identity spoofing, and misinformation campaigns. 

**DeepGuard** was designed to address this challenge with four core objectives:
1. **Accurate Detection**: Fine-tuned classification on industry benchmarks (FaceForensics++ C23) targeting subtle boundary and blending artifacts.
2. **Transparent Explainability**: Moving beyond black-box classification by generating Grad-CAM heatmaps to visually isolate manipulated facial regions.
3. **Multi-Modal Forensics**: Supporting standalone images, multi-frame video aggregation, and live webcam streams with strict human face presence verification.
4. **Audit-Ready Reporting**: Exporting verifiable forensic artifacts, confidence scores, and structured PDF reports for documentation and analysis.

---

## 🏗️ System Architecture

```text
React Frontend (Vite SPA) ── [Port 3000]
       │
       │ REST API / JWT Authentication
       ▼
Node.js / Express Backend ── [Port 5000]
       │
       ├── Internal Service API / Magic-Byte Validation
       ▼
FastAPI AI Microservice ── [Port 8000]
       │
       ├── PyTorch 2.3 + NVIDIA CUDA (Native GPU)
       ├── MediaPipe Face Detection & Cropping
       ├── EfficientNet-B4 Classification Head
       └── Grad-CAM Explainability Heatmaps
       │
MongoDB Database (Audit Logs, Analysis History & Analytics) ── [Port 27017]
```

---

## 📸 Screenshots & Forensic Visualizations

### Detection Results & Forensic Heatmaps
| Fake Image Detection (Grad-CAM Heatmap) | Authentic Image Verification |
| :---: | :---: |
| ![Fake Detection Result](docs/acceptance_screenshots/acceptance_fake_image_result.png) | ![Real Verification Result](docs/acceptance_screenshots/acceptance_real_image_result.png) |

| Video Temporal Analysis & Timeline | Model Evaluation & Confusion Matrix |
| :---: | :---: |
| ![Video Analysis Result](docs/acceptance_screenshots/acceptance_fake_video_result.png) | ![Confusion Matrix](docs/evaluation/test_confusion_matrix.png) |

---

## 📊 Validated Model Performance

The deepfake classifier utilizes **EfficientNet-B4** with a custom multi-layer perceptron (MLP) classification head fine-tuned on the **FaceForensics++ C23** benchmark. Performance evaluated on the isolated test set (4,991 evaluated frames):

| Metric | Value | Evaluation Set |
| :--- | :--- | :--- |
| **ROC-AUC** | **0.8853** | FaceForensics++ C23 Isolated Test Set |
| **PR-AUC** | **0.9686** | FaceForensics++ C23 Isolated Test Set |
| **Accuracy** | **79.68%** | FaceForensics++ C23 Isolated Test Set |
| **Fake Precision** | **94.50%** | FaceForensics++ C23 Isolated Test Set |
| **Fake Recall (Sensitivity)** | **79.20%** | FaceForensics++ C23 Isolated Test Set |
| **Specificity** | **81.60%** | FaceForensics++ C23 Isolated Test Set |
| **F1 Score (Fake)** | **86.18%** | FaceForensics++ C23 Isolated Test Set |
| **Inference Latency** | **~82ms** | NVIDIA GeForce RTX 3050 Laptop GPU / CUDA |

*Note: Preprocessing utilizes MediaPipe FaceDetection (min detection confidence: 0.7, model selection: 1, face margin: 0.4, resolution: 224×224 INTER_LANCZOS4, ImageNet normalization).*

---

## 🔍 Feature Status

| Feature | Status | Description |
| :--- | :--- | :--- |
| **Image Detection** | ✅ Operational | Upload JPEG, PNG, or WebP to detect manipulated facial features with Grad-CAM overlays. |
| **Video Detection** | ✅ Operational | Intelligent frame sampling, batch GPU inference, temporal aggregation, and keyframe timeline. |
| **Live Webcam** | ✅ Operational | Browser canvas capture with rolling confidence evaluation and live feedback. |
| **Grad-CAM Heatmaps** | ✅ Operational | Visual explanations highlight specific facial regions triggering manipulation flags. |
| **No-Face Handling** | ✅ Operational | Strictly verifies human face presence; cleanly returns `UNCERTAIN` when no face is found. |
| **PDF Forensic Reports** | ✅ Operational | Generates downloadable forensic summaries with timings, confidence, and region analysis. |
| **Audio Detection** | ⏳ Prototype | Audio deepfake detection is implemented at the API/UI integration level, but production inference is disabled pending final AudioDeepFakeCNN production checkpoint. |
| **Blockchain Verification** | 🔬 Prototype | Includes a Solidity-based `MediaVerification` smart contract prototype (unit-tested locally; not deployed to live public networks). |

---

## 📁 Repository Structure

```text
deepguard-platform/
├── .github/workflows/         # Continuous integration pipelines
├── ai-service/                # Python FastAPI AI microservice
│   ├── app/core/              # Service configuration & GPU allocator
│   ├── models/                # EfficientNet loader & architecture definitions
│   ├── preprocessing/         # MediaPipe face extraction & frame sampling
│   ├── services/              # Image, video, audio & explainability engines
│   ├── tests/                 # pytest test suite
│   ├── training/              # Training pipelines & dataset loaders
│   ├── requirements.txt       # Python dependencies
│   └── main.py                # FastAPI entry point
├── blockchain/                # Solidity MediaVerification prototype & unit tests
├── browser-extension/         # DeepGuard Chrome extension prototype
├── client/                    # React SPA (Vite + Tailwind CSS)
│   ├── src/components/        # UI components (HeatmapViewer, ConfidenceGauge, etc.)
│   ├── src/pages/             # App pages (Dashboard, Upload, History, Analytics)
│   └── src/services/          # Frontend API integration & Auth services
├── docs/                      # Screenshots, metrics, and forensic evaluations
├── scripts/                   # Native-first PowerShell management & launch scripts
├── server/                    # Node.js / Express backend API
│   ├── src/controllers/       # Auth, detection, history, report controllers
│   ├── src/middleware/        # JWT auth, rate limiting, file validation
│   ├── src/models/            # Mongoose schemas (DetectionResult, User, AuditLog)
│   ├── src/routes/            # Express REST route definitions
│   ├── src/services/          # Internal AI proxy, PDFKit generator
│   └── tests/                 # Jest integration tests
├── docker-compose.yml         # Container orchestration (Development profile)
├── docker-compose.prod.yml    # Container orchestration (Production profile)
├── CONTRIBUTING.md            # Guidelines for open-source contributions
└── LICENSE                    # MIT License
```

---

## 🚀 Native-First Setup & Quick Start

DeepGuard is built **Native-First**. It executes directly on the host operating system with native NVIDIA CUDA GPU acceleration, and **does not require Docker, Docker Desktop, Docker Compose, WSL2, or NVIDIA Container Toolkit**.

### Host Prerequisites
- **Node.js**: v18+ (Node 20/24 supported)
- **Python**: 3.11 with CUDA-enabled PyTorch (CUDA 12.1 recommended)
- **MongoDB**: Local MongoDB instance listening on `mongodb://127.0.0.1:27017/deepguard`
- **GPU**: NVIDIA GPU with CUDA driver (verified on NVIDIA GeForce RTX 3050 Laptop GPU)

### 1. Pre-Flight Environment Audit
Verify your native host dependencies with the built-in validator script:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/check_native_env.ps1
```

### 2. Configure Environment Variables
Copy the `.env.example` templates in each component directory:
```powershell
# Server configuration
Copy-Item server/.env.example server/.env

# AI Service configuration
Copy-Item ai-service/.env.example ai-service/.env

# Client configuration
Copy-Item client/.env.example client/.env
```

### 3. 1-Click Native Launch
Start the entire platform (MongoDB, AI Microservice, Node Backend, and React Frontend) with a single command:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/start_native.ps1
```

*(To stop all running services later, run `powershell -ExecutionPolicy Bypass -File scripts/start_native.ps1 -Stop`)*

---

### Manual Step-by-Step Launch

If you prefer to run services in individual terminals:

#### Step 1: AI Microservice (FastAPI + PyTorch CUDA)
```powershell
cd ai-service
.\venv\Scripts\Activate.ps1
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### Step 2: Backend Server (Node.js + Express)
```powershell
cd server
npm install
npm run dev
```

#### Step 3: Frontend Client (React + Vite)
```powershell
cd client
npm install
npm run dev
```

Visit `http://localhost:3000` to register an account and start analyzing media.

---

## 🐳 Optional Container Deployment (Docker Profile)

> [!NOTE]
> **Docker is optional.** The native host setup above is the official, default runtime for development, automated testing, demonstrations, and native CUDA GPU acceleration.

If containerized delivery is preferred:

- **Development Stack** (Mongo 7, Client dev hot-reload, Express backend, FastAPI):
  ```powershell
  docker compose up --build
  ```

- **Production Stack** (Nginx SPA, Node backend, GPU-enabled AI service, persistent volumes):
  ```powershell
  docker compose -f docker-compose.prod.yml up --build
  ```

---

## 📡 Key API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register a new user account | No |
| `POST` | `/api/auth/login` | Authenticate and obtain JWT tokens | No |
| `POST` | `/api/auth/refresh` | Exchange refresh token for new access token | No |
| `POST` | `/api/auth/logout` | Invalidate active session | Yes |
| `GET` | `/api/auth/me` | Fetch authenticated user profile | Yes |

### Detection & Analysis (`/api/detect`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/detect/image` | Upload image for face extraction & Grad-CAM analysis | Yes |
| `POST` | `/api/detect/video` | Upload video for frame sampling & temporal aggregation | Yes |
| `POST` | `/api/detect/audio` | Audio file inference endpoint (prototype) | Yes |
| `GET` | `/api/detect/result/:id` | Retrieve detection output by analysis ID | Yes |

### History & Reports (`/api/history`, `/api/reports`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/history` | Paginated list of previous scans for the user | Yes |
| `GET` | `/api/reports/:id/pdf` | Download forensic PDF report with metadata & heatmap | Yes |

---

## 🧪 Testing Instructions

DeepGuard includes test suites across backend orchestration and AI inference components:

### Backend Tests (Jest)
Runs API route tests, auth validation, and mock detection tests:
```bash
cd server
npm test
```

### AI Microservice Tests (pytest)
Runs preprocessing, face extraction, and FastAPI endpoint tests:
```bash
cd ai-service
pytest tests/
```

---

## 🔮 Future Enhancements

- [ ] **Full Audio Model Deployment**: Finalize checkpoint training for `AudioDeepFakeCNN` to enable production speech synthesis detection.
- [ ] **Multi-Face Scene Forensics**: Simultaneous bounding box and Grad-CAM generation for scenes with multiple subjects.
- [ ] **Decentralized Hash Registry**: Deploy the Polygon `MediaVerification` smart contract to a testnet with automated digest notarization.
- [ ] **Wasm / WebGPU Edge Inference**: Client-side face pre-screening to eliminate network transmission for non-face images.

---

## 👥 Author & License

- **Author**: Sri Snigdha
- **License**: Released under the [MIT License](LICENSE).
- **Contributions**: Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
