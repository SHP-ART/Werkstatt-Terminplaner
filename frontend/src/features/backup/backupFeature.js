export function installBackupFeature(AppClass) {
  Object.assign(AppClass.prototype, {
      formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
      },

      formatDate(value) {
        if (!value) return '-';
        const date = new Date(value);
        return date.toLocaleString('de-DE');
      },

      async loadBackupStatus() {
        try {
          const data = await BackupService.status();
          const dbPathEl = document.getElementById('backupDbPath');
          const dirEl = document.getElementById('backupDirPath');
          const sizeEl = document.getElementById('backupDbSize');
          const lastEl = document.getElementById('backupLast');
    
          if (dbPathEl) dbPathEl.textContent = data.dbPath || '-';
          if (dirEl) dirEl.textContent = data.backupDir || '-';
          if (sizeEl) sizeEl.textContent = this.formatBytes(data.dbSizeBytes);
          if (lastEl) {
            lastEl.textContent = data.lastBackup
              ? `${this.formatDate(data.lastBackup.createdAt)} (${this.formatBytes(data.lastBackup.sizeBytes)})`
              : 'Kein Backup vorhanden';
          }
        } catch (error) {
          console.error('Backup Status Fehler:', error);
          alert('Backup-Status konnte nicht geladen werden.');
        }
      },

      async loadBackupList() {
        try {
          const tbody = document.getElementById('backupTableBody');
          if (!tbody) return;
          tbody.innerHTML = '<tr><td colspan="4" class="loading">Backups werden geladen...</td></tr>';
    
          const data = await BackupService.list();
          const backups = data.backups || [];
    
          if (backups.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="loading">Noch keine Backups vorhanden</td></tr>';
            return;
          }
    
          tbody.innerHTML = '';
          backups.forEach(backup => {
            const row = tbody.insertRow();
            const downloadUrl = `${CONFIG.API_URL}/backup/download/${encodeURIComponent(backup.name)}`;
            row.innerHTML = `
              <td>${backup.name}</td>
              <td>${this.formatBytes(backup.sizeBytes)}</td>
              <td>${this.formatDate(backup.createdAt)}</td>
              <td class="dashboard-action-cell">
                <div class="dashboard-action-grid">
                  <button class="btn btn-secondary" onclick="window.open('${downloadUrl}', '_blank')">Download</button>
                  <button class="btn btn-primary" data-backup-restore="${backup.name}">Backup laden</button>
                </div>
              </td>
            `;
          });
        } catch (error) {
          console.error('Backup Liste Fehler:', error);
          alert('Backups konnten nicht geladen werden.');
        }
      },

      async handleCreateBackup() {
        const btn = document.getElementById('createBackupBtn');
        try {
          if (btn) {
            btn.disabled = true;
            btn.textContent = 'Erstelle...';
          }
          await BackupService.create();
          await this.loadBackupStatus();
          await this.loadBackupList();
        } catch (error) {
          console.error('Backup erstellen Fehler:', error);
          alert('Backup konnte nicht erstellt werden.');
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Backup erstellen';
          }
        }
      },

      async handleRestoreBackup(filename) {
        if (!filename) return;
        const confirmRestore = confirm(`Backup "${filename}" einspielen? Die aktuelle Datenbank wird überschrieben.`);
        if (!confirmRestore) return;
    
        try {
          await BackupService.restore(filename);
          await this.loadBackupStatus();
          alert('Backup wurde eingespielt. Bitte Anwendung neu laden, falls Daten nicht sofort sichtbar sind.');
          this.loadDashboard();
          this.loadKunden();
          this.loadTermine();
        } catch (error) {
          console.error('Backup Restore Fehler:', error);
          alert('Backup konnte nicht eingespielt werden.');
        }
      },

      async handleUploadAndRestore() {
        const uploadInput = document.getElementById('backupUploadInput');
        const uploadName = document.getElementById('backupUploadName');
        if (!uploadInput || !uploadInput.files || uploadInput.files.length === 0) {
          alert('Bitte zuerst eine Backup-Datei auswählen.');
          return;
        }
        const file = uploadInput.files[0];
        const reader = new FileReader();
    
        reader.onload = async () => {
          try {
            const base64 = reader.result.split(',')[1];
            await BackupService.upload({ filename: file.name, fileBase64: base64, restoreNow: true });
            await this.loadBackupStatus();
            await this.loadBackupList();
            alert('Backup hochgeladen und eingespielt. Anwendung ggf. neu laden, falls Daten nicht sofort sichtbar sind.');
            this.loadDashboard();
            this.loadKunden();
            this.loadTermine();
          } catch (error) {
            console.error('Backup Upload Fehler:', error);
            alert('Backup konnte nicht hochgeladen/geladen werden.');
          }
        };
    
        reader.readAsDataURL(file);
        if (uploadName) uploadName.textContent = 'Keine Datei ausgewählt';
        uploadInput.value = '';
      }
  });
}
