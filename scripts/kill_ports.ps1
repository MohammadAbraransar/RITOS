# Terminate any processes listening on RITOS & ShopFlow ports, including their child processes.
# (uvicorn --reload serves from a child process that inherits the socket; killing only the parent leaves the port busy.)
$ports = @(5173, 8000, 3000, 3001)

function Stop-Tree([int]$procId) {
    if (-not $procId -or $procId -eq 0 -or $procId -eq $PID) { return }
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$procId" -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Tree $_.ProcessId }
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

foreach ($port in $ports) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($conns) {
            $pids = $conns.OwningProcess | Select-Object -Unique
            foreach ($p in $pids) {
<<<<<<< HEAD
                Write-Host "Freeing port $port (PID: $p)..."
                Stop-Tree $p
=======
                if ($p -and $p -ne 0 -and $p -ne $PID) {
                    $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
                    if ($proc -and $proc.ProcessName -notmatch "powershell|cmd|code|conhost") {
                        Write-Host "Freeing port $port ($($proc.ProcessName), PID: $p)..."
                        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
                    }
                }
>>>>>>> e1de4905cacc8e83ae5261d9468d857a9233cbff
            }
        }
    } catch {}
}
