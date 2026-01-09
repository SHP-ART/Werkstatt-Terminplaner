; Werkstatt Terminplaner - NSIS Installer Script
; Sichert die Datenbank vor der Installation und stellt sie danach wieder her

!macro customHeader
  !include "FileFunc.nsh"
!macroend

!macro preInit
  ; Nichts zu tun
!macroend

!macro customInit
  ; Bei Update: Bestehende Datenbank sichern BEVOR neue Dateien kopiert werden
  ; Prüfe ob Installationsverzeichnis existiert und Datenbank vorhanden ist
  IfFileExists "$INSTDIR\database\werkstatt.db" 0 NoExistingDB
    ; Erstelle temporäres Backup
    CreateDirectory "$TEMP\werkstatt-backup"
    CopyFiles /SILENT "$INSTDIR\database\werkstatt.db" "$TEMP\werkstatt-backup\werkstatt.db"
    ; Kopiere auch eventuelle Backup-Dateien
    IfFileExists "$INSTDIR\database\backups\*.*" 0 +2
      CopyFiles /SILENT "$INSTDIR\database\backups\*.*" "$TEMP\werkstatt-backup\"
    DetailPrint "Datenbank-Backup erstellt in: $TEMP\werkstatt-backup"
  NoExistingDB:
!macroend

!macro customInstall
  ; Nach der Installation: Backup wiederherstellen falls vorhanden
  
  ; Stelle sicher dass database Ordner existiert
  CreateDirectory "$INSTDIR\database"
  CreateDirectory "$INSTDIR\database\backups"
  
  ; Prüfe ob Backup existiert
  IfFileExists "$TEMP\werkstatt-backup\werkstatt.db" 0 NoBackupToRestore
    ; Lösche eventuell vorhandene leere/neue Datenbank
    Delete "$INSTDIR\database\werkstatt.db"
    ; Backup wiederherstellen
    CopyFiles /SILENT "$TEMP\werkstatt-backup\werkstatt.db" "$INSTDIR\database\werkstatt.db"
    ; Backup-Dateien wiederherstellen
    IfFileExists "$TEMP\werkstatt-backup\*.db" 0 +2
      CopyFiles /SILENT "$TEMP\werkstatt-backup\*.db" "$INSTDIR\database\backups\"
    ; Temporäres Backup löschen
    RMDir /r "$TEMP\werkstatt-backup"
    DetailPrint "Datenbank wurde aus Backup wiederhergestellt"
    Goto DoneRestore
  NoBackupToRestore:
    DetailPrint "Keine vorherige Datenbank gefunden - neue Installation"
  DoneRestore:
!macroend

!macro customUnInstall
  ; Bei Deinstallation: Frage ob Datenbank gelöscht werden soll
  MessageBox MB_YESNO "Möchten Sie auch die Datenbank und alle Termine löschen?$\n$\nDie Datenbank befindet sich in:$\n$INSTDIR\database\werkstatt.db" IDYES DeleteDB IDNO KeepDB
  DeleteDB:
    RMDir /r "$INSTDIR\database"
    DetailPrint "Datenbank wurde gelöscht"
    Goto DoneUninstall
  KeepDB:
    DetailPrint "Datenbank wird beibehalten in: $INSTDIR\database"
  DoneUninstall:
!macroend
