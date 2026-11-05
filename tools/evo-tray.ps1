# evo-tray.ps1 - EVO Pitwall vive vicino all'orologio (4/11/2026).
#
# L'immediatezza voluta: un'icona nella tray di Windows,
# niente finestra del server nella barra delle applicazioni. Un clic apre
# la GUI; il menu dell'icona permette di riaprirla, riavviare il server o
# uscire. Lo script avvia il server se non c'e' gia', aspetta che risponda
# e apre il browser. Un mutex impedisce due icone/serve duplicati.
#
# Uso (da gui-run.cmd, nascosto):
#   powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden ^
#     -File tools\evo-tray.ps1

param(
    [string]$Root = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if (-not $Root) {
    $Root = Split-Path -Parent $PSScriptRoot
}
$Root = (Resolve-Path -LiteralPath $Root).Path
$Url = 'http://127.0.0.1:8642/'
$IconPath = Join-Path $Root 'gui\pitwall.ico'
$Node = Join-Path $Root '_node\node.exe'
if (-not (Test-Path -LiteralPath $Node)) {
    $Node = 'node'
}

# Una sola icona per installazione. Se c'e' gia', il secondo avvio apre
# soltanto la GUI e muore: niente doppioni nella tray.
$mutex = New-Object System.Threading.Mutex -ArgumentList @($false, 'Local\EVOPitwallTray')
$ownedMutex = $false
try {
    $ownedMutex = $mutex.WaitOne(0)
} catch [System.Threading.AbandonedMutexException] {
    $ownedMutex = $true
}
if (-not $ownedMutex) {
    Start-Process $Url
    exit 0
}

$script:server = $null
$script:ownsServer = $false
$icon = $null
$menu = $null

function Test-Server {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 1
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
    } catch {
        return $false
    }
}

function Show-Balloon([string]$Text, [string]$Title = 'EVO Pitwall') {
    if (-not $script:icon) { return }
    try {
        $script:icon.BalloonTipTitle = $Title
        $script:icon.BalloonTipText = $Text
        $script:icon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
        $script:icon.ShowBalloonTip(5000)
    } catch { }
}

function Start-Server {
    if (Test-Server) { return }
    try {
        $script:server = Start-Process -FilePath $Node `
            -ArgumentList @('webui.mjs') `
            -WorkingDirectory (Join-Path $Root 'src') `
            -WindowStyle Hidden -PassThru
        $script:ownsServer = $true
    } catch {
        Show-Balloon ('Server non avviato: ' + $_.Exception.Message)
        return
    }
    # La GUI impiega circa un secondo a caricare il save: si apre solo quando
    # la porta risponde, cosi' il browser non mostra una pagina di errore.
    for ($i = 0; $i -lt 40; $i++) {
        if (Test-Server) { return }
        if ($script:server -and $script:server.HasExited) { break }
        Start-Sleep -Milliseconds 250
    }
    if ($script:server -and $script:server.HasExited) {
        Show-Balloon 'Il server si e'' chiuso prima di rispondere. Riapri EVO Pitwall dal menu dell''icona.'
    } else {
        Show-Balloon 'Il server sta ancora partendo: tra poco la GUI sara'' pronta.'
    }
}

function Open-Gui {
    try {
        Start-Process $Url
    } catch {
        Show-Balloon ('Browser non aperto: ' + $_.Exception.Message)
    }
}

function Stop-OwnedServer {
    if (-not $script:ownsServer -or -not $script:server) { return }
    try {
        if (-not $script:server.HasExited) {
            Stop-Process -Id $script:server.Id -Force -ErrorAction SilentlyContinue
        }
    } catch { }
    $script:server = $null
    $script:ownsServer = $false
}

function Restart-Server {
    if (-not $script:ownsServer) {
        Show-Balloon 'Il server era gia'' attivo: lo uso senza riavviarlo.'
        Open-Gui
        return
    }
    Stop-OwnedServer
    Start-Server
    if (Test-Server) { Open-Gui }
}

function Exit-Tray {
    Stop-OwnedServer
    if ($script:icon) {
        $script:icon.Visible = $false
        $script:icon.Dispose()
        $script:icon = $null
    }
    if ($script:menu) {
        $script:menu.Dispose()
        $script:menu = $null
    }
    try { $mutex.ReleaseMutex() } catch { }
    [System.Windows.Forms.Application]::Exit()
}

[System.Windows.Forms.Application]::EnableVisualStyles()

$menu = New-Object System.Windows.Forms.ContextMenuStrip
[void]$menu.Items.Add('Apri EVO Pitwall')
[void]$menu.Items.Add('Riavvia server')
[void]$menu.Items.Add('-')
[void]$menu.Items.Add('Esci')
$menu.Items[0].add_Click({ Open-Gui })
$menu.Items[1].add_Click({ Restart-Server })
$menu.Items[3].add_Click({ Exit-Tray })

$icon = New-Object System.Windows.Forms.NotifyIcon
try {
    $icon.Icon = New-Object System.Drawing.Icon($IconPath)
} catch {
    $icon.Icon = [System.Drawing.SystemIcons]::Application
}
$icon.Text = 'EVO Pitwall - vicino all''orologio'
$icon.ContextMenuStrip = $menu
$icon.Visible = $true
$icon.add_MouseClick({
    param($sender, $eventArgs)
    if ($eventArgs.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Open-Gui }
})

Start-Server
Open-Gui
[System.Windows.Forms.Application]::Run()

if ($script:icon) {
    $script:icon.Visible = $false
    $script:icon.Dispose()
}
if ($script:menu) { $script:menu.Dispose() }
try { $mutex.ReleaseMutex() } catch { }
$mutex.Dispose()
