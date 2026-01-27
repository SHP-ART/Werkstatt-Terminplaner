Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' Pfade
BackendPath = "C:\Users\Sven\Documents\Github\Terminplaner\Werkstatt-Terminplaner\backend"
LogFile = "C:\Users\Sven\Documents\Github\Terminplaner\Werkstatt-Terminplaner\build-vbs.log"

' Lösche altes Log
If FSO.FileExists(LogFile) Then FSO.DeleteFile(LogFile)

' Erstelle Batch-Datei für Build
BatchFile = BackendPath & "\temp-build.bat"
Set f = FSO.CreateTextFile(BatchFile, True)
f.WriteLine "@echo off"
f.WriteLine "cd /d " & BackendPath
f.WriteLine "set CI=true"
f.WriteLine "set CSC_IDENTITY_AUTO_DISCOVERY=false"
f.WriteLine "echo Build gestartet um %TIME% > " & LogFile
f.WriteLine "call npm run build:allinone >> " & LogFile & " 2>&1"
f.WriteLine "echo Build beendet um %TIME% mit Code %ERRORLEVEL% >> " & LogFile
f.WriteLine "pause"
f.Close

' Starte Build in neuem CMD-Fenster
WshShell.Run "cmd.exe /c " & Chr(34) & BatchFile & Chr(34), 1, False

MsgBox "Build wurde gestartet!" & vbCrLf & vbCrLf & _
       "Ein CMD-Fenster sollte sich öffnen." & vbCrLf & _
       "Bitte NICHT schließen während des Builds!" & vbCrLf & vbCrLf & _
       "Der Build dauert ca. 3-5 Minuten." & vbCrLf & vbCrLf & _
       "Log-Datei: " & LogFile, vbInformation, "Werkstatt Terminplaner Build"
