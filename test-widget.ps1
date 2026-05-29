# Widget stress test via browser-harness CDP
# Start the widget first:  npm run dev  (in another terminal)
# Then run:                .\test-widget.ps1
#
# BU_CDP_URL is set only for this script's process and cleaned up at the end.
# It does NOT affect other terminals or your Chrome browser-harness usage.

$env:PATH = "$env:USERPROFILE\.local\bin;" + $env:PATH
$_old_cdp = $env:BU_CDP_URL          # save whatever was set before
$env:BU_CDP_URL = "http://127.0.0.1:9223"

try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect("127.0.0.1", 9223)
    $tcp.Close()
    Write-Host "[ok] Electron debug port open" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Port 9223 not open. Run 'npm run dev' first." -ForegroundColor Red
    $env:BU_CDP_URL = $_old_cdp
    exit 1
}

$pass = 0; $fail = 0

function bh($code) {
    $out = $code | browser-harness 2>&1
    Write-Host ($out -join "`n")
    return $out
}

function Check($name, $passed, $msg) {
    if ($passed) {
        Write-Host "  PASS: $name" -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host "  FAIL: $name — $msg" -ForegroundColor Red
        $script:fail++
    }
}

# ── shared helpers injected into every bh() call ─────────────────────────────
$H = @"
import time, json, os

WIDGET_DIR = r"$PSScriptRoot"

def widget_state():
    return js('''({
        sessionPct:   document.getElementById("sessionPercentage")?.textContent?.trim(),
        weeklyPct:    document.getElementById("weeklyPercentage")?.textContent?.trim(),
        sessionTime:  document.getElementById("sessionTimeText")?.textContent?.trim(),
        accountName:  document.getElementById("activeAccountName")?.textContent?.trim(),
        settingsOpen: document.getElementById("settingsOverlay")?.style.display !== "none",
        allAccBtn:    document.getElementById("allAccountsBtn")?.style.display,
        multiSection: document.getElementById("multiAccountSection")?.style.display,
        loginVisible: document.getElementById("loginContainer")?.style.display !== "none",
        accountItems: Array.from(document.querySelectorAll(".account-item")).map(el => ({
            label:  el.querySelector(".account-label")?.textContent?.trim(),
            active: el.classList.contains("active"),
        })),
    })''')

def screenshot(name):
    try:
        path = capture_screenshot(os.path.join(WIDGET_DIR, f"test-{name}.png"))
        print(f"  saved {name}.png")
    except Exception as e:
        print(f"  screenshot skipped: {e}")

def btn_pos(selector):
    return js(f'''(function(){{
        var el = document.querySelector("{selector}");
        if (!el) return null;
        var b = el.getBoundingClientRect();
        return {{x: b.left+b.width/2, y: b.top+b.height/2, visible: b.width>0}};
    }})()''')

def close_settings_if_open():
    state = widget_state()
    if state["settingsOpen"]:
        b = btn_pos("#closeSettingsBtn")
        if b and b["visible"]:
            click_at_xy(b["x"], b["y"])
            time.sleep(0.6)

"@

# ── TEST 1: baseline ──────────────────────────────────────────────────────────
Write-Host "`n=== TEST 1: Baseline ===" -ForegroundColor Cyan
$out = bh ($H + @"
close_settings_if_open()
state = widget_state()
print(json.dumps(state, indent=2))
screenshot("1-baseline")
print("RESULT_loginVisible=" + str(state["loginVisible"]))
print("RESULT_sessionPct=" + str(state["sessionPct"]))
"@)
Check "not on login screen" (-not ($out -match "RESULT_loginVisible=True")) "login screen is showing"
Check "session data present"  ($out -match 'RESULT_sessionPct=\d') "sessionPct missing or zero"

# ── TEST 2: settings opens, accounts listed ───────────────────────────────────
Write-Host "`n=== TEST 2: Settings + accounts ===" -ForegroundColor Cyan
$out = bh ($H + @"
close_settings_if_open()
b = btn_pos("#settingsBtn")
click_at_xy(b["x"], b["y"])
time.sleep(1.0)
state = widget_state()
screenshot("2-settings-open")
print("RESULT_settingsOpen=" + str(state["settingsOpen"]))
print("RESULT_accountCount=" + str(len(state["accountItems"])))
for a in state["accountItems"]:
    print(f"  account: {a['label']} active={a['active']}")
"@)
Check "settings opened"    ($out -match "RESULT_settingsOpen=True") "settings did not open"
Check "accounts listed"    ($out -match "RESULT_accountCount=[1-9]") "no accounts in list"

# ── TEST 3: switch account ────────────────────────────────────────────────────
Write-Host "`n=== TEST 3: Switch account ===" -ForegroundColor Cyan
$out = bh ($H + @"
# Ensure settings is open (may have been left open from test 2)
state = widget_state()
if not state["settingsOpen"]:
    b = btn_pos("#settingsBtn")
    click_at_xy(b["x"], b["y"])
    time.sleep(1.0)

switch_btn = btn_pos(".account-switch-btn")
if not switch_btn or not switch_btn["visible"]:
    print("RESULT_skipped=only_one_account")
else:
    before_name = widget_state()["accountName"]
    print(f"Switching away from: {before_name}")
    click_at_xy(switch_btn["x"], switch_btn["y"])
    time.sleep(1.5)
    screenshot("3-settings-after-switch")

    # Close settings — this triggers fetchUsageData + refreshAllAccountsData
    close_settings_if_open()
    time.sleep(4.0)   # wait for fetch to complete

    state = widget_state()
    screenshot("3-main-after-switch")
    print(f"After switch: accountName={state['accountName']} session={state['sessionPct']} time={state['sessionTime']}")
    print("RESULT_loginVisible=" + str(state["loginVisible"]))
    print("RESULT_sessionPct=" + str(state["sessionPct"]))
    print("RESULT_sessionTime=" + str(state["sessionTime"]))
"@)
if ($out -match "RESULT_skipped") {
    Write-Host "  SKIP: only one account saved" -ForegroundColor Yellow
} else {
    Check "no login screen after switch" (-not ($out -match "RESULT_loginVisible=True")) "login appeared"
    Check "session data loaded"  ($out -match 'RESULT_sessionPct=\d') "session pct missing"
    # 0% is only acceptable if the timer also says Not started (genuinely no usage)
    $joined = $out -join "`n"
    $pct  = if ($joined -match "RESULT_sessionPct=(.+)"  ) { $Matches[1].Trim() } else { "" }
    $time = if ($joined -match "RESULT_sessionTime=(.+)" ) { $Matches[1].Trim() } else { "" }
    if ($pct -eq "0%") {
        Check "0% matches Not started" ($time -eq "Not started") "0% but timer says '$time' — stale/wrong fetch"
    }
}

# ── TEST 4: all-accounts panel ────────────────────────────────────────────────
Write-Host "`n=== TEST 4: All-accounts panel ===" -ForegroundColor Cyan
$out = bh ($H + @"
close_settings_if_open()
state = widget_state()
if state["allAccBtn"] == "none":
    print("RESULT_skipped=one_account")
else:
    b = btn_pos("#allAccountsBtn")
    # If panel is already open from a previous run, close it first
    if state["multiSection"] != "none":
        click_at_xy(b["x"], b["y"])
        time.sleep(0.5)
    click_at_xy(b["x"], b["y"])
    time.sleep(6.0)   # sequential fetches take a few seconds each
    state = widget_state()
    blocks  = js('document.querySelectorAll(".multi-account-block").length')
    errors  = js('Array.from(document.querySelectorAll(".multi-account-error")).map(e=>e.textContent.trim())')
    screenshot("4-all-accounts")
    print(f"multiSection={state['multiSection']} blocks={blocks} errors={errors}")
    print("RESULT_sectionVisible=" + str(state["multiSection"] != "none"))
    print("RESULT_blocks=" + str(blocks))
    print("RESULT_errors=" + str(errors))
    # Close panel
    click_at_xy(b["x"], b["y"])
    time.sleep(0.4)
"@)
if ($out -match "RESULT_skipped") {
    Write-Host "  SKIP: only one account" -ForegroundColor Yellow
} else {
    Check "panel opened"      ($out -match "RESULT_sectionVisible=True") "multiSection stayed hidden"
    Check "blocks rendered"   ($out -match "RESULT_blocks=[1-9]") "no account blocks rendered"
    Check "no fetch errors"   (-not ($out -match "RESULT_errors=\['.+'\]")) ($out | Select-String "RESULT_errors")
}

# ── TEST 5: refresh ───────────────────────────────────────────────────────────
Write-Host "`n=== TEST 5: Refresh ===" -ForegroundColor Cyan
$out = bh ($H + @"
close_settings_if_open()
before = widget_state()
b = btn_pos("#refreshBtn")
click_at_xy(b["x"], b["y"])
time.sleep(5.0)
after = widget_state()
screenshot("5-after-refresh")
print(f"Before: session={before['sessionPct']} weekly={before['weeklyPct']}")
print(f"After:  session={after['sessionPct']}  weekly={after['weeklyPct']}")
print("RESULT_loginVisible=" + str(after["loginVisible"]))
print("RESULT_sessionPct=" + str(after["sessionPct"]))
"@)
Check "no login after refresh"  (-not ($out -match "RESULT_loginVisible=True")) "login appeared"
Check "data present after refresh" ($out -match 'RESULT_sessionPct=\d') "sessionPct gone after refresh"

# ── summary ───────────────────────────────────────────────────────────────────
Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "  Passed: $pass" -ForegroundColor Green
if ($fail -gt 0) {
    Write-Host "  Failed: $fail" -ForegroundColor Red
} else {
    Write-Host "  Failed: $fail" -ForegroundColor Green
}
Write-Host "  Screenshots: test-*.png in the widget folder"

# Restore BU_CDP_URL so this script doesn't pollute the shell session
$env:BU_CDP_URL = $_old_cdp
