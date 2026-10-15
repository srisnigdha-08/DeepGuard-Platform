# ==============================================================================
# DeepGuard — Native 1-Click Platform Launcher
# Starts MongoDB, AI Microservice, Node Backend, and React Frontend natively
# No Docker, Docker Compose, or WSL2 required.
# ==============================================================================

param (
    [switch]$Stop,
    [switch]$CheckOnly
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $repoRoot

function Test-PortOpen([string]$ip, [int]$port) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect($ip, $port, $null, $null)
        $success = $iar.AsyncWaitHandle.WaitOne(1000, $false)
        if ($success -and $tcp.Connected) {
            $tcp.EndConnect($iar)
            $tcp.Close()
            return $true
        }
        $tcp.Close()
    } catch {}
    return $false
}

if ($Stop) {
    Write-Host ""
    Write-Host "Stopping DeepGuard native services..." -ForegroundColor Yellow
    Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -match "node" } | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.Path -match "ai-service" } | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "Native services stopped." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "           STARTING DEEPGUARD NATIVE PLATFORM                         " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Architecture: NATIVE-FIRST Host Pipeline"
Write-Host "  - Frontend   : http://localhost:3000"
Write-Host "  - Backend    : http://localhost:5000"
Write-Host "  - AI Service : http://localhost:8000"
Write-Host "  - Database   : mongodb://127.0.0.1:27017/deepguard"
Write-Host "  - Hardware   : Native PyTorch + CUDA + NVIDIA RTX 3050"
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------------------------
# 1. Verify / Launch MongoDB
# ------------------------------------------------------------------------------
Write-Host "[1/4] Checking MongoDB (127.0.0.1:27017)..." -NoNewline
if (Test-PortOpen "127.0.0.1" 27017) {
    Write-Host " [ALREADY RUNNING]" -ForegroundColor Green
} else {
    Write-Host " [STARTING]" -ForegroundColor Yellow
    
    # Try finding native Windows mongod
    $mongodPath = "C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe"
    if (-not (Test-Path $mongodPath)) {
        $found = Get-ChildItem "C:\Program Files\MongoDB" -Filter "mongod.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { $mongodPath = $found.FullName }
    }

    if (Test-Path $mongodPath) {
        $dbPath = Join-Path $repoRoot "data\db"
        if (-not (Test-Path $dbPath)) { New-Item -ItemType Directory -Path $dbPath -Force | Out-Null }
        $mongoLog = Join-Path $repoRoot "data\mongod.log"
        Start-Process -FilePath $mongodPath -ArgumentList "--dbpath `"$dbPath`" --bind_ip 127.0.0.1" -WindowStyle Hidden
    } else {
        # Fall back to net start
        & net start MongoDB 2>$null
    }

    # Wait up to 10 seconds for MongoDB port to open
    $ready = $false
    for ($i = 1; $i -le 10; $i++) {
        Start-Sleep -Seconds 1
        if (Test-PortOpen "127.0.0.1" 27017) {
            $ready = $true
            break
        }
    }
    if ($ready) {
        Write-Host "      MongoDB is now listening on 127.0.0.1:27017." -ForegroundColor Green
    } else {
        Write-Host "      Warning: Could not automatically start MongoDB. Please ensure MongoDB is running." -ForegroundColor Red
    }
}

if ($CheckOnly) {
    exit 0
}

# ------------------------------------------------------------------------------
# 2. Launch AI Microservice (FastAPI + PyTorch + CUDA)
# ------------------------------------------------------------------------------
Write-Host "[2/4] Launching FastAPI AI Microservice on :8000..." -NoNewline
if (Test-PortOpen "127.0.0.1" 8000) {
    Write-Host " [ALREADY RUNNING]" -ForegroundColor Green
} else {
    $aiVenv = Join-Path $repoRoot "ai-service\venv\Scripts\Activate.ps1"
    $aiDir = Join-Path $repoRoot "ai-service"
    $aiCmd = "Set-Location '$aiDir'; & '$aiVenv'; uvicorn main:app --host 0.0.0.0 --port 8000"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $aiCmd -WindowStyle Normal
    
    # Wait for AI service to initialize model
    Write-Host ""
    Write-Host "      Waiting for AI service & CUDA GPU initialization..." -NoNewline
    for ($i = 1; $i -le 25; $i++) {
        Start-Sleep -Seconds 1
        Write-Host "." -NoNewline
        try {
            $resp = Invoke-RestMethod -Uri "http://localhost:8000/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($resp.status -eq "healthy") {
                Write-Host " [READY]" -ForegroundColor Green
                Write-Host "      Device: $($resp.gpu_name) (CUDA Active: $($resp.gpu))" -ForegroundColor Gray
                break
            }
        } catch {}
    }
}

# ------------------------------------------------------------------------------
# 3. Launch Node.js Backend Server
# ------------------------------------------------------------------------------
Write-Host "[3/4] Launching Node.js Express Backend on :5000..." -NoNewline
if (Test-PortOpen "127.0.0.1" 5000) {
    Write-Host " [ALREADY RUNNING]" -ForegroundColor Green
} else {
    $serverDir = Join-Path $repoRoot "server"
    $serverCmd = "Set-Location '$serverDir'; node src/server.js"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $serverCmd -WindowStyle Normal

    for ($i = 1; $i -le 10; $i++) {
        Start-Sleep -Seconds 1
        if (Test-PortOpen "127.0.0.1" 5000) {
            Write-Host " [READY]" -ForegroundColor Green
            break
        }
    }
}

# ------------------------------------------------------------------------------
# 4. Launch React Vite Frontend
# ------------------------------------------------------------------------------
Write-Host "[4/4] Launching React Vite Frontend on :3000..." -NoNewline
if (Test-PortOpen "127.0.0.1" 3000) {
    Write-Host " [ALREADY RUNNING]" -ForegroundColor Green
} else {
    $clientDir = Join-Path $repoRoot "client"
    $clientCmd = "Set-Location '$clientDir'; npm run dev"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $clientCmd -WindowStyle Normal

    for ($i = 1; $i -le 10; $i++) {
        Start-Sleep -Seconds 1
        if (Test-PortOpen "127.0.0.1" 3000) {
            Write-Host " [READY]" -ForegroundColor Green
            break
        }
    }
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "           DEEPGUARD NATIVE STACK IS OPERATIONAL!                     " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Open your browser at:" -ForegroundColor White
Write-Host "  ➜  http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "To stop native services later, run:" -ForegroundColor Gray
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/start_native.ps1 -Stop" -ForegroundColor Gray
Write-Host "======================================================================" -ForegroundColor Cyan
