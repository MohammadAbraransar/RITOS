# Terminate any processes listening on RITOS & ShopFlow ports, including their child processes.
# (uvicorn --reload serves from a child process that inherits the socket; killing only the parent leaves the port busy.)
# Shells and the editor are never killed, even if they show up as a port owner.
# pnpm passes the configured ports (scripts/dev/ports.mjs) as one comma-separated argument
param([string]$Ports = "5173,8000,3000")
# (a new name: PowerShell variables ignore case, so $ports would overwrite the [string] parameter)
$portList = $Ports -split "[,\s]+" | Where-Object { $_ } | ForEach-Object { [int]$_ }
$protected = "powershell|pwsh|cmd|code|conhost|WindowsTerminal"

function Stop-Tree([int]$procId) {
    if (-not $procId -or $procId -eq 0 -or $procId -eq $PID) { return }
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$procId" -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Tree $_.ProcessId }
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -match "^($protected)$") { return }
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

foreach ($port in $portList) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($conns) {
            $pids = $conns.OwningProcess | Select-Object -Unique
            foreach ($p in $pids) {
                $name = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName
                Write-Host "Freeing port $port ($(if ($name) { $name } else { 'exited parent' }), PID: $p)..."
                Stop-Tree $p
            }
        }
    } catch {}
}
