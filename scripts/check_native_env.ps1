# ==============================================================================
# DeepGuard — Native Environment Pre-flight Validator
# Verifies host dependencies for Native runtime (no Docker required)
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $repoRoot

$overallPass = $true
$results = @{}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "         DEEPGUARD NATIVE ENVIRONMENT PRE-FLIGHT AUDIT                " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Target: NATIVE-FIRST Host Runtime (PyTorch + CUDA + RTX 3050)"
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# ------------------------------------------------------------------------------
# 1. Node.js Verification
# ------------------------------------------------------------------------------
Write-Host "[-] Checking Node.js runtime..." -NoNewline
try {
    $nodeVer = & node -v 2>$null
    if ($nodeVer -match "v(\d+)\.") {
        $major = [int]$matches[1]
        if ($major -ge 18) {
            Write-Host " [PASS] ($nodeVer)" -ForegroundColor Green
            $results["Node.js"] = "PASS ($nodeVer)"
        } else {
            Write-Host " [FAIL] ($nodeVer - Node 18+ required)" -ForegroundColor Red
            $results["Node.js"] = "FAIL"
            $overallPass = $false
        }
    } else {
        Write-Host " [FAIL] (Node.js not found in PATH)" -ForegroundColor Red
        $results["Node.js"] = "FAIL"
        $overallPass = $false
    }
} catch {
    Write-Host " [FAIL] ($($_.Exception.Message))" -ForegroundColor Red
    $results["Node.js"] = "FAIL"
    $overallPass = $false
}

# ------------------------------------------------------------------------------
# 2. Python Virtual Environment
# ------------------------------------------------------------------------------
Write-Host "[-] Checking Python Virtual Environment..." -NoNewline
$pythonPath = Join-Path $repoRoot "ai-service\venv\Scripts\python.exe"
if (Test-Path $pythonPath) {
    $pyVer = & $pythonPath --version 2>&1
    Write-Host " [PASS] ($pyVer at $pythonPath)" -ForegroundColor Green
    $results["Python venv"] = "PASS ($pyVer)"
} else {
    Write-Host " [FAIL] (ai-service\venv\Scripts\python.exe not found)" -ForegroundColor Red
    $results["Python venv"] = "FAIL"
    $overallPass = $false
}

# ------------------------------------------------------------------------------
# 3. PyTorch, CUDA & RTX 3050 Detection
# ------------------------------------------------------------------------------
Write-Host "[-] Checking PyTorch, CUDA, and GPU Acceleration..." -NoNewline
if (Test-Path $pythonPath) {
    $cudaCheckScript = "import torch, json, sys; res = {'torch': torch.__version__, 'cuda_available': torch.cuda.is_available()}; res['cuda_version'] = torch.version.cuda if res['cuda_available'] else None; res['device_name'] = torch.cuda.get_device_name(0) if res['cuda_available'] else 'CPU'; res['device_count'] = torch.cuda.device_count() if res['cuda_available'] else 0; print(json.dumps(res))"
    try {
        $cudaJson = & $pythonPath -c $cudaCheckScript 2>$null
        $cudaObj = $cudaJson | ConvertFrom-Json
        if ($cudaObj.cuda_available) {
            Write-Host " [PASS]" -ForegroundColor Green
            Write-Host "    - PyTorch Version : $($cudaObj.torch)" -ForegroundColor Gray
            Write-Host "    - CUDA Driver/Lib : $($cudaObj.cuda_version)" -ForegroundColor Gray
            Write-Host "    - Dedicated GPU   : $($cudaObj.device_name)" -ForegroundColor Gray
            $results["PyTorch"] = "PASS ($($cudaObj.torch))"
            $results["CUDA"] = "PASS (v$($cudaObj.cuda_version))"
            $results["NVIDIA RTX 3050"] = "PASS ($($cudaObj.device_name))"
        } else {
            Write-Host " [WARN] (PyTorch found but CUDA not available; running on CPU)" -ForegroundColor Yellow
            $results["PyTorch"] = "PASS ($($cudaObj.torch))"
            $results["CUDA"] = "FAIL (CPU Only)"
            $results["NVIDIA RTX 3050"] = "FAIL"
            $overallPass = $false
        }
    } catch {
        Write-Host " [FAIL] ($($_.Exception.Message))" -ForegroundColor Red
        $results["PyTorch"] = "FAIL"
        $results["CUDA"] = "FAIL"
        $overallPass = $false
    }
} else {
    Write-Host " [SKIP] (Venv missing)" -ForegroundColor Yellow
    $results["PyTorch"] = "SKIP"
    $results["CUDA"] = "SKIP"
    $overallPass = $false
}

# ------------------------------------------------------------------------------
# 4. EfficientNet-B4 Checkpoint Verification
# ------------------------------------------------------------------------------
Write-Host "[-] Checking EfficientNet-B4 Checkpoint..." -NoNewline
$ckpt1 = Join-Path $repoRoot "models\efficientnet_b4_deepfake.pt"
$ckpt2 = Join-Path $repoRoot "ai-service\models\efficientnet_b4_deepfake.pt"
$ckptCandidates = @($ckpt1, $ckpt2)
$foundCkpt = $null
foreach ($c in $ckptCandidates) {
    if (Test-Path $c) {
        $foundCkpt = Get-Item $c
        break
    }
}

if ($foundCkpt -and $foundCkpt.Length -gt 1000000) {
    $sizeMB = [math]::Round($foundCkpt.Length / 1MB, 2)
    Write-Host " [PASS] ($($foundCkpt.Name) - $sizeMB MB)" -ForegroundColor Green
    $results["EfficientNet-B4"] = "PASS ($sizeMB MB)"
} else {
    Write-Host " [FAIL] (Checkpoint not found in models/)" -ForegroundColor Red
    $results["EfficientNet-B4"] = "FAIL"
    $overallPass = $false
}

# ------------------------------------------------------------------------------
# 5. MongoDB Native Connectivity (127.0.0.1:27017)
# ------------------------------------------------------------------------------
Write-Host "[-] Checking MongoDB connectivity (127.0.0.1:27017)..." -NoNewline
$mongoLive = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $iar = $tcp.BeginConnect("127.0.0.1", 27017, $null, $null)
    $success = $iar.AsyncWaitHandle.WaitOne(1500, $false)
    if ($success -and $tcp.Connected) {
        $tcp.EndConnect($iar)
        $mongoLive = $true
    }
    $tcp.Close()
} catch {}

if ($mongoLive) {
    Write-Host " [PASS] (Active on port 27017)" -ForegroundColor Green
    $results["MongoDB"] = "PASS (127.0.0.1:27017)"
} else {
    Write-Host " [FAIL] (Port 27017 closed)" -ForegroundColor Yellow
    # Check if Windows service or binary exists
    $mongoService = Get-Service *mongo* -ErrorAction SilentlyContinue
    if ($mongoService) {
        Write-Host "    Note: Native Windows service '$($mongoService.Name)' is $($mongoService.Status)." -ForegroundColor Gray
        Write-Host "    Start it with: net start MongoDB  or  scripts/start_native.ps1" -ForegroundColor Gray
    } else {
        Write-Host "    Note: Start local mongod with: mongod --dbpath data/db" -ForegroundColor Gray
    }
    $results["MongoDB"] = "FAIL (Port 27017 closed)"
    $overallPass = $false
}

# ------------------------------------------------------------------------------
# 6. Required Runtime Directories
# ------------------------------------------------------------------------------
Write-Host "[-] Checking runtime storage directories..." -NoNewline
$requiredDirs = @(
    "server\uploads",
    "server\logs",
    "ai-service\temp_uploads",
    "ai-service\static\heatmaps",
    "data\db"
)
$dirSuccess = $true
foreach ($d in $requiredDirs) {
    $fullPath = Join-Path $repoRoot $d
    if (-not (Test-Path $fullPath)) {
        try {
            New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        } catch {
            $dirSuccess = $false
        }
    }
}

if ($dirSuccess) {
    Write-Host " [PASS] (All directories ready)" -ForegroundColor Green
    $results["Directories"] = "PASS"
} else {
    Write-Host " [WARN] (Some directories could not be created)" -ForegroundColor Yellow
    $results["Directories"] = "WARN"
}

# ------------------------------------------------------------------------------
# Summary Output
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "AUDIT SUMMARY:" -ForegroundColor Cyan
foreach ($k in $results.Keys) {
    $statusColor = if ($results[$k] -match "PASS") { "Green" } else { "Red" }
    Write-Host "  $($k.PadRight(22)) : " -NoNewline
    Write-Host "$($results[$k])" -ForegroundColor $statusColor
}
Write-Host "======================================================================" -ForegroundColor Cyan

if ($overallPass) {
    Write-Host "✅ Native environment is READY for deepfake detection!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "⚠️  One or more native checks failed or require attention." -ForegroundColor Yellow
    exit 1
}
