# _invia-tasto.ps1 — un tasto a EVO con SendInput (i giochi a schermo intero
# ignorano il vecchio SendKeys; SendInput è l'ingresso vero da tastiera).
param([string]$Tasto = 'Left')
$vkMap = @{ Left = 0x25; Right = 0x27; Up = 0x26; Down = 0x28; Enter = 0x0D; Esc = 0x1B }
if (-not $vkMap.ContainsKey($Tasto)) { Write-Output "tasto sconosciuto: $Tasto"; exit 1 }
$vk = $vkMap[$Tasto]

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class KeyTap {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint SendInput(uint count, KEYBDINPUT[] v, int size);
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; public int padA; public int padB; public int padC; }
  public static void Tap(ushort vk) {
    var down = new KEYBDINPUT { wVk = vk, time = 0, dwFlags = 0 };
    var up = new KEYBDINPUT { wVk = vk, time = 0, dwFlags = 2 };
    SendInput(1, new KEYBDINPUT[]{ down }, Marshal.SizeOf(typeof(KEYBDINPUT)));
    System.Threading.Thread.Sleep(60);
    SendInput(1, new KEYBDINPUT[]{ up }, Marshal.SizeOf(typeof(KEYBDINPUT)));
  }
}
"@
$p = Get-Process -Name AssettoCorsaEVO -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p) { Write-Output 'EVO non trovato'; exit 1 }
$s = New-Object -ComObject WScript.Shell
$ok = $s.AppActivate($p.Id)
Start-Sleep -Milliseconds 600
[KeyTap]::Tap([uint16]$vk)
Write-Output "inviato (SendInput): $Tasto (appactivate=$ok, pid=$($p.Id))"
