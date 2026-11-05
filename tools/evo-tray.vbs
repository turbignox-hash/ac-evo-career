' evo-tray.vbs - l'icona vicino all'orologio parte SENZA console (6/11/2026).
'
' Perche': con Windows Terminal come terminale predefinito, la vecchia via
' `powershell -WindowStyle Hidden` apre lo stesso una scheda nera "Windows
' PowerShell": Hidden arriva troppo tardi, quando la console e' gia' nata.
' WScript.Shell.Run con stile 0 crea il processo senza finestra alcuna:
' niente scheda, niente flash, resta solo l'icona vicino all'orologio.
Option Explicit
Dim sh, fso, radice, ps
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
' tools\evo-tray.vbs -> tools -> radice del progetto
radice = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
ps = sh.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
sh.Run """" & ps & """ -NoProfile -STA -ExecutionPolicy Bypass -File """ & radice & "\tools\evo-tray.ps1""", 0, False
