' avvia-gui.vbs - il doppio click sulla scorciatoia «Carriera EVO» ancora meno
' rumore: fa nascosto tutto ciò che avvia.cmd faceva in console (6/11/2026).
'
' Perché: un .cmd al doppio click apre sempre una console (la scorciatoia
' «Carriera EVO» che punta a un .cmd la mostra per qualche secondo). Con
' WScript.Shell Run stile 0 nessun figlio nasce con una finestra: né i
' controlli di prima partenza, né il server, né l'icona vicino all'orologio.
' Resta solo il browser che si apre.
' avvia.cmd resta perfetto quando lo lanci da un terminale già aperto e nel
' menu del launcher: da lì le finestre servono.
Option Explicit
Dim sh
Set sh = CreateObject("WScript.Shell")

' metti un percorso fra apici doppi, che qui il doppio apice interno si scrive raddoppiato
Function Q(s)
  Q = """" & s & """"
End Function

Dim fso, radice, node, wscript
Set fso = CreateObject("Scripting.FileSystemObject")
radice = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)) ' tools -> radice
node = radice & "\_node\node.exe"
If Not fso.FileExists(node) Then node = "node.exe"
wscript = sh.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe")

' le stesse mosse di :aprigui in avvia.cmd, in fila e senza finestra
sh.Run Q(node) & " " & Q(radice & "\tools\aggiornamenti.mjs") & " --breve", 0, True
sh.Run Q(node) & " " & Q(radice & "\tools\salva-save.mjs"), 0, True
sh.Run Q(node) & " " & Q(radice & "\tools\crea-scorciatoia.mjs"), 0, True
sh.Run Q(node) & " " & Q(radice & "\tools\installa-gioco.mjs") & " --silenzioso", 0, True
' l'icona vicino all'orologio: apre il browser e, se manca, accende il server
sh.Run Q(wscript) & " //nologo " & Q(radice & "\tools\evo-tray.vbs"), 0, False
