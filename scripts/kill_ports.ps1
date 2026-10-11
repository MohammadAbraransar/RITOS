# Gracefully terminate any processes listening on RITOS & ShopFlow ports
$ports = @(5173, 8000, 3000, 3001)

foreach ($port in $ports) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($conns) {
            $pids = $conns.OwningProcess | Select-Object -Unique
            foreach ($p in $pids) {
                if ($p -and $p -ne 0 -and $p -ne $PID) {
                    Write-Host "Freeing port $port (PID: $p)..."
                    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
                }
            }
        }
    } catch {}
}
