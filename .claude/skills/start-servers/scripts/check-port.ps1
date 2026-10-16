# ポートを使っているプロセスと、リポジトリの最後のコミット日時を表示する（読み取りのみ。何も止めない）
# 使い方：powershell -NoProfile -File check-port.ps1 -Port 8080 [-Repo C:\path\to\repo]
param(
    [Parameter(Mandatory = $true)][int]$Port,
    [string]$Repo
)

[Console]::OutputEncoding = [Text.Encoding]::UTF8

$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $conns) {
    Write-Output "ポート ${Port}: 空いています"
} else {
    foreach ($procId in ($conns.OwningProcess | Sort-Object -Unique)) {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$procId"
        Write-Output "ポート ${Port}: 使用中"
        Write-Output "  PID       : $procId"
        Write-Output "  起動日時  : $($p.CreationDate.ToString('yyyy-MM-dd HH:mm:ss'))"
        Write-Output "  コマンド  : $($p.CommandLine)"
    }
}

if ($Repo) {
    $last = git -C $Repo log -1 --format='%cd' --date=format:'%Y-%m-%d %H:%M:%S' 2>$null
    $branch = git -C $Repo symbolic-ref --short HEAD 2>$null
    if ($last) {
        Write-Output "リポジトリ  : $Repo（ブランチ $branch、最後のコミット $last）"
        Write-Output "  起動日時が最後のコミットより前なら、古いコードで動いています"
    }
}
