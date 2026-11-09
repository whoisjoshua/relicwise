# relicwise: find your Honkai: Star Rail warp-history link (Windows / PC client)
#
# Open Warp > View Details > Records in game once, then run in PowerShell:
#   irm https://<your-relicwise-site>/tools/get-warp-url.ps1 | iex
#
# What it does: finds the game folder from the game's own log, reads the game's local web cache,
# and copies the newest warp-history link to your clipboard. It checks the link against the
# official HoYoverse API, and sends nothing anywhere else.

$ErrorActionPreference = 'Stop'
Write-Host ''
Write-Host 'relicwise - looking for your warp history link...' -ForegroundColor Magenta

$cn = -join ([char[]](0x5D29, 0x574F, 0xFF1A, 0x661F, 0x7A79, 0x94C1, 0x9053))
$low = Join-Path $env:USERPROFILE 'AppData\LocalLow'
$logs = @(
  (Join-Path $low 'Cognosphere\Star Rail\Player.log'),
  (Join-Path $low 'Cognosphere\Star Rail\Player-prev.log'),
  (Join-Path $low ("miHoYo\" + $cn + "\Player.log")),
  (Join-Path $low ("miHoYo\" + $cn + "\Player-prev.log"))
)

$dataDir = $null
foreach ($log in $logs) {
  if (-not (Test-Path -LiteralPath $log)) { continue }
  $hit = Select-String -LiteralPath $log -Pattern 'Loading player data from (.+?)data\.unity3d' -ErrorAction SilentlyContinue | Select-Object -Last 1
  if ($hit) { $dataDir = $hit.Matches[0].Groups[1].Value; break }
}
if (-not $dataDir) {
  Write-Host 'Could not find the game folder. Start the game once and open Warp history, then retry.' -ForegroundColor Red
  return
}

$cacheRoot = Join-Path $dataDir 'webCaches'
$candidates = @()
if (Test-Path -LiteralPath $cacheRoot) {
  $versions = Get-ChildItem -LiteralPath $cacheRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^\d+(\.\d+)*$' } |
    Sort-Object { [version]($_.Name + ('.0' * (3 - ($_.Name.Split('.').Count - 1)))) } -Descending
  foreach ($v in $versions) { $candidates += (Join-Path $v.FullName 'Cache\Cache_Data\data_2') }
  $candidates += (Join-Path $cacheRoot 'Cache\Cache_Data\data_2')
}
$cacheFile = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $cacheFile) {
  Write-Host 'No web cache found. Open Warp > View Details > Records in game, then retry.' -ForegroundColor Red
  return
}

# The game keeps the file open: read a copy
$tmp = Join-Path $env:TEMP ('relicwise_data2_' + [guid]::NewGuid().ToString('N'))
Copy-Item -LiteralPath $cacheFile -Destination $tmp -Force
try {
  $text = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($tmp))
} finally {
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}

$found = [regex]::Matches($text, 'https://[^\x00-\x20"<>]+?/(getGachaLog|getLdGachaLog)\?[^\x00-\x20"<>]+') |
  ForEach-Object { $_.Value } | Where-Object { $_ -match 'authkey=' }
if (-not $found) {
  Write-Host 'No warp link in the cache yet. Open Warp > View Details > Records in game, then retry.' -ForegroundColor Red
  return
}

# Newest first; keep the first one the API accepts
$link = $null
$list = @($found)
[array]::Reverse($list)
foreach ($u in ($list | Select-Object -Unique | Select-Object -First 8)) {
  try {
    $test = $u -replace '([?&])(page|size|gacha_type|end_id)=[^&]*', '$1'
    $test = $test.TrimEnd('&') + '&page=1&size=5&gacha_type=1&end_id=0&lang=en'
    $res = Invoke-RestMethod -Uri $test -TimeoutSec 15
    if ($res.retcode -eq 0) { $link = $u; break }
  } catch { }
}
if (-not $link) {
  $link = $list[0]
  Write-Host 'Found a link, but HoYoverse says it has expired. Reopen Warp history in game and run this again.' -ForegroundColor Yellow
}

try { Set-Clipboard -Value $link } catch { }
Write-Host ''
Write-Host $link
Write-Host ''
Write-Host 'Copied to clipboard. Paste it into relicwise > Warps.' -ForegroundColor Green
