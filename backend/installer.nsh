; Werkstatt Terminplaner - NSIS Installer Script
; Sichert die Datenbank vor der Installation und stellt sie danach wieder her

!macro customHeader
  !system "echo Werkstatt Terminplaner Custom NSIS Script"
!macroend

!macro preInit
  ; Vor der Installation: Backup der Datenbank erstellen
  SetShellVarContext all
!macroend

!macro customInit
  ; Bei Update: Bestehende Datenbank sichern BEVOR neue Dateien kopiert werden
  IfFileExists "$INSTDIR\database\werkstatt.db" 0 NoExistingDB
    ; Erstelle Backup-Verzeichnis falls nicht vorhanden
    CreateDirectory "$INSTDIR\database\backups"
    ; Erstelle Backup mit Zeitstempel
    ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
    CopyFiles /SILENT "$INSTDIR\database\werkstatt.db" "$INSTDIR\database\werkstatt.db.pre-update-backup"
    DetailPrint "Datenbank-Backup erstellt: werkstatt.db.pre-update-backup"
  NoExistingDB:
!macroend

!macro customInstall
  ; Nach der Installation: Backup wiederherstellen falls vorhanden
  IfFileExists "$INSTDIR\database\werkstatt.db.pre-update-backup" 0 NoBackupToRestore
    ; Lösche die eventuell neue/leere Datenbank
    Delete "$INSTDIR\database\werkstatt.db"
    ; Backup wiederherstellen
    Rename "$INSTDIR\database\werkstatt.db.pre-update-backup" "$INSTDIR\database\werkstatt.db"
    DetailPrint "Datenbank wurde aus Backup wiederhergestellt"
    Goto DoneRestore
  NoBackupToRestore:
    DetailPrint "Keine vorherige Datenbank gefunden - neue Installation"
  DoneRestore:
  
  ; Stelle sicher dass database Ordner existiert
  CreateDirectory "$INSTDIR\database"
  CreateDirectory "$INSTDIR\database\backups"
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
