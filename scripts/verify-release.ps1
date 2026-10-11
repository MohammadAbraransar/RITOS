$ErrorActionPreference = 'Stop'
Write-Host 'RITOS release verification' -ForegroundColor Cyan
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$venvPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
  Write-Host 'Creating isolated Python environment...' -ForegroundColor Yellow
  py -3.13 -m venv (Join-Path $projectRoot '.venv')
  if ($LASTEXITCODE -ne 0) { throw 'Could not create Python 3.13 virtual environment. Install Python 3.13 or create .venv manually.' }
}
Push-Location (Join-Path $projectRoot 'backend')
try {
  & $venvPython -m pip install --upgrade pip
  if ($LASTEXITCODE -ne 0) { throw 'Python package installer upgrade failed' }
  & $venvPython -m pip install -r requirements.txt
  if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed' }
  & $venvPython -m compileall -q app
  if ($LASTEXITCODE -ne 0) { throw 'Python compilation failed' }
  & $venvPython -m pytest -q
  if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed' }
} finally { Pop-Location }
Push-Location frontend
try {
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed' }
  npm test
  if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend production build failed' }
} finally { Pop-Location }
Write-Host 'All local verification commands completed successfully.' -ForegroundColor Green
