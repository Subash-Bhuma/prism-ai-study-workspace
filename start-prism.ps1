$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$url = "http://localhost:8000"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("Python was not found. Install Python 3.11 or newer, then run START_PRISM again.", "Prism")
    exit 1
}

$distIndex = Join-Path $frontend "dist\index.html"
$frontendEnv = Join-Path $frontend ".env.local"
$needsBuild = -not (Test-Path $distIndex) -or ((Test-Path $frontendEnv) -and (Get-Item $frontendEnv).LastWriteTime -gt (Get-Item $distIndex).LastWriteTime)
if ($needsBuild) {
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show("The frontend needs to be built, but Node.js was not found.", "Prism")
        exit 1
    }
    Push-Location $frontend
    try {
        & npm.cmd install
        & npm.cmd run build
    } finally {
        Pop-Location
    }
}

$listener = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
    Start-Process -FilePath "python" `
        -ArgumentList "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000" `
        -WorkingDirectory $backend `
        -WindowStyle Hidden
}

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing "$url/api/health" -TimeoutSec 1
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 350
    }
}

if ($ready) {
    Start-Process $url
} else {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("Prism could not start. Run backend\RUN_DIAGNOSTICS.cmd for details.", "Prism")
    exit 1
}
