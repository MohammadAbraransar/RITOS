#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
(cd backend && python -m compileall -q app && python -m pytest -q)
(cd frontend && npm install --no-audit --no-fund && npm test && npm run build)
echo 'All local verification commands completed successfully.'
