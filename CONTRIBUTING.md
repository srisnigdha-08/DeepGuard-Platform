# Contributing to DeepGuard

Thank you for your interest in contributing to **DeepGuard — AI-Powered DeepFake Detection Platform**! We welcome contributions, bug reports, and suggestions to make deepfake forensics faster, more accurate, and accessible.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Tech Stack Overview](#tech-stack-overview)
- [Local Development Setup](#local-development-setup)
- [Branching Strategy & Workflow](#branching-strategy--workflow)
- [Coding Guidelines](#coding-guidelines)
- [Running Tests](#running-tests)
- [Reporting Bugs & Requesting Features](#reporting-bugs--requesting-features)
- [Submitting a Pull Request](#submitting-a-pull-request)

---

## Code of Conduct

Please maintain a respectful, constructive, and inclusive environment. Avoid harassment, dismissive language, or discriminatory behavior in issues and pull requests.

---

## Tech Stack Overview

- **Frontend**: React 18, Vite, Tailwind CSS, Framer Motion, Recharts
- **Backend API**: Node.js, Express, MongoDB (Mongoose), JWT, PDFKit, Multer
- **AI Microservice**: Python 3.11, FastAPI, PyTorch (CUDA), torchvision, MediaPipe, OpenCV, Grad-CAM
- **Optional/Prototypes**: Solidity (MediaVerification contract), Chrome Browser Extension

---

## Local Development Setup

### 1. Prerequisites
- **Node.js**: v18+ (tested up to Node 24)
- **Python**: 3.11 with CUDA-supported PyTorch
- **MongoDB**: Local instance running on `mongodb://127.0.0.1:27017/deepguard`
- **Git**

### 2. Clone & Environment Configuration

```bash
git clone https://github.com/<YOUR_USERNAME>/<YOUR_REPOSITORY>.git
cd deepguard-platform
```

Copy the `.env.example` templates in each service:
```bash
# Server configuration
cp server/.env.example server/.env

# AI Service configuration
cp ai-service/.env.example ai-service/.env

# Client configuration
cp client/.env.example client/.env
```

> ⚠️ **Never commit `.env` files or hardcode real API keys/credentials into source code.**

### 3. Launching Services (Native-First)

DeepGuard can be started using the PowerShell orchestration script or manual terminals:

**Option A: 1-Click Launch (PowerShell on Windows)**
```powershell
powershell -ExecutionPolicy Bypass -File scripts/start_native.ps1
```

**Option B: Separate Terminals**
1. **AI Microservice:**
   ```bash
   cd ai-service
   # Windows PowerShell: .\venv\Scripts\Activate.ps1
   # Linux/macOS: source venv/bin/activate
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```
2. **Backend Server:**
   ```bash
   cd server
   npm install
   npm run dev
   ```
3. **Frontend Client:**
   ```bash
   cd client
   npm install
   npm run dev
   ```

---

## Branching Strategy & Workflow

1. Fork or branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```
2. Keep commits concise and meaningful:
   - `feat: add temporal inconsistency metric`
   - `fix: resolve bounding box cropping on multi-face inputs`
   - `docs: update setup prerequisites for CUDA 12`

---

## Coding Guidelines

- **JavaScript / React**:
  - Follow ESLint / modern ES6+ standards.
  - Keep components modular and readable under `client/src/components/`.
  - Avoid inline styles where Tailwind utility classes can be applied.
- **Node.js / Express**:
  - Encapsulate logic within controllers and services; keep routes clean.
  - Always validate input schemas using `express-validator` and custom middleware.
  - Handle async operations cleanly with `asyncHandler`.
- **Python / AI Microservice**:
  - Follow PEP 8 guidelines.
  - Ensure type hints are used across FastAPI route signatures and service methods.
  - Do not commit large binary weights (`.pt`, `.pth`, `.onnx`) directly to git; use environment-specified model directories.

---

## Running Tests

Before opening a pull request, verify that existing tests pass:

### Backend Tests (Jest)
```bash
cd server
npm test
```

### AI Service Tests (pytest)
```bash
cd ai-service
pytest tests/
```

---

## Reporting Bugs & Requesting Features

- **Bug Reports**: Open an issue detailing the steps to reproduce, input media type (resolution/codec), expected vs. actual behavior, and relevant console/error logs.
- **Feature Requests**: Describe the specific forensic use case, target benefits, and potential architectural impacts.

---

## Submitting a Pull Request

1. Ensure all sensitive information (`.env`, real tokens, dataset dumps) is excluded.
2. Verify code passes linting and test suites.
3. Open a Pull Request against `main` with a clear title and description referencing any related issues.
4. Maintainers will review your PR and provide feedback promptly.
