# test-autorefresh-scheduling.ps1
# Tests the auto-refresh scheduling fix: sets a short refresh interval and
# a fake-but-usable legacy session key (proven in earlier testing to reach
# a full fetch cycle without crashing), then watches for MULTIPLE scheduled
# ticks over ~50 seconds. The original bug fired exactly once and then
# silently stopped rescheduling forever - this should now keep firing.
#
# NOTE: this test's key evidence appears in the app's DevTools console
# (Ctrl+Shift+I once the window is open), not the terminal - the
# [AutoUpdateTest] logging lives in the renderer process. Open DevTools
# BEFORE this script launches the app, or reopen it quickly once the window
# appears, so you don't miss the early ticks.

$ErrorActionPreference = 'Stop'
$repoRoot = 'C:\coding\claude-usage-widget'
$electronExe = Join-Path $repoRoot 'node_modules\electron\dist\electron.exe'
$profileName = 'autorefreshtest'
$profileDir = Join-Path $env:APPDATA "claude-usage-widget\profiles\$profileName"

Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
$configPath = Join-Path $profileDir 'config.json'

$storeContent = @{
    sessionKey     = 'test-legacy-plaintext-key-do-not-use'
    organizationId = 'test-org-id-autorefresh'
    settings       = @{
        refreshInterval = '15'  # 15 seconds - short enough to see 2-3 ticks quickly
    }
}
$jsonContent = $storeContent | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($configPath, $jsonContent, [System.Text.UTF8Encoding]::new($false))

Write-Host "Wrote config.json (refreshInterval=15s):"
Get-Content $configPath
Write-Host "`nLaunching app with profile '$profileName'..."
Write-Host "OPEN DEVTOOLS NOW (Ctrl+Shift+I) to see [AutoUpdateTest] logs." -ForegroundColor Yellow
Write-Host "This will block until you close the app window manually.`n"

Push-Location $repoRoot
& $electronExe . --profile=$profileName
Pop-Location
