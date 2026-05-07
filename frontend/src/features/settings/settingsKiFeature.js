export function installSettingsKiFeature(AppClass) {
  Object.assign(AppClass.prototype, {
      async loadWerkstattSettings() {
        try {
          const einstellungen = await EinstellungenService.getWerkstatt();
          this.prefillWerkstattSettings(einstellungen);
          this.prefillKIExternalSettings(einstellungen);
          this.updateApiKeyStatus(einstellungen); // Setzt this._hasOpenAIKey
          this.updateRealtimeEnabledStatus(einstellungen?.realtime_enabled !== false);
          // Ollama-Modell vorbelegen (vor updateKIModeStatus, damit Badge korrekt angezeigt wird)
          if (einstellungen?.ollama_model) {
            this._ollamaModelName = einstellungen.ollama_model;
            const ollamaModelInput = document.getElementById('ollamaModelInput');
            if (ollamaModelInput) ollamaModelInput.value = einstellungen.ollama_model;
          }
          this.updateKIModeStatus(einstellungen?.ki_mode || 'local', !!einstellungen?.chatgpt_api_key_configured);
          if ((einstellungen?.ki_mode || 'local') === 'ollama') {
            this.checkOllamaStatus();
          }
          this.updateSmartSchedulingStatus(einstellungen?.smart_scheduling_enabled !== false);
          this.updateAnomalyDetectionStatus(einstellungen?.anomaly_detection_enabled !== false);
          this.checkKIStatus();
          // KI-Trainingsdaten laden
          this.loadKITrainingData();
          // Stelle sicher dass der externe Training-Container initial korrekt angezeigt wird
          this.ensureExternalTrainingContainerVisibility();
        } catch (error) {
          console.error('Fehler beim Laden der Werkstatt-Einstellungen:', error);
        }
    
        // Server-Konfiguration laden
        try {
          const serverConfig = CONFIG.getServerConfig();
          const serverIpField = document.getElementById('server_ip');
          const serverPortField = document.getElementById('server_port');
          const currentServerUrlField = document.getElementById('currentServerUrl');
          
          if (serverIpField) serverIpField.value = serverConfig.ip;
          if (serverPortField) serverPortField.value = serverConfig.port;
          if (currentServerUrlField) currentServerUrlField.textContent = serverConfig.url;
        } catch (error) {
          console.error('Fehler beim Laden der Server-Konfiguration:', error);
        }
      },

      prefillWerkstattSettings(einstellungen) {
        if (!einstellungen) return;
        const servicezeitField = document.getElementById('servicezeit_minuten');
        if (servicezeitField) {
          servicezeitField.value = einstellungen.servicezeit_minuten || 10;
        }
        const nebenzeitField = document.getElementById('nebenzeit_prozent');
        if (nebenzeitField) {
          nebenzeitField.value = einstellungen.nebenzeit_prozent || 0;
        }
        const mittagspauseField = document.getElementById('mittagspause_minuten');
        if (mittagspauseField) {
          mittagspauseField.value = einstellungen.mittagspause_minuten || 30;
        }
      },

      prefillKIExternalSettings(einstellungen) {
        const input = document.getElementById('ki_external_url');
        if (input) {
          input.value = einstellungen?.ki_external_url || '';
        }
      },

      updateApiKeyStatus(einstellungen) {
        const statusContainer = document.getElementById('apiKeyStatus');
        if (!statusContainer) return;
    
        const isConfigured = einstellungen?.chatgpt_api_key_configured;
        const maskedKey = einstellungen?.chatgpt_api_key_masked;
    
        // API-Key Status für KI-Modus-Anzeige speichern
        this._hasOpenAIKey = !!isConfigured;
    
        if (isConfigured) {
          statusContainer.innerHTML = `
            <div class="status-indicator configured">
              <span class="status-icon">🟢</span>
              <span class="status-text">API-Key konfiguriert: ${maskedKey || '****'}</span>
            </div>
          `;
        } else {
          statusContainer.innerHTML = `
            <div class="status-indicator not-configured">
              <span class="status-icon">⚪</span>
              <span class="status-text">Kein API-Key konfiguriert</span>
            </div>
          `;
        }
    
        // KI-Enabled Status aktualisieren
        this.updateKIEnabledStatus(einstellungen?.ki_enabled !== false);
      },

      updateKIEnabledStatus(enabled) {
        const toggle = document.getElementById('kiEnabledToggle');
        if (toggle) {
          toggle.checked = enabled;
        }
        
        // Body-Klasse setzen für CSS-basiertes Ein-/Ausblenden
        if (enabled) {
          document.body.classList.remove('ki-disabled');
        } else {
          document.body.classList.add('ki-disabled');
        }
        
        // KI-Analyse Checkbox deaktivieren wenn KI aus
        const kiAnalyseCheckbox = document.getElementById('kiAnalyseAktiv');
        if (kiAnalyseCheckbox && !enabled) {
          kiAnalyseCheckbox.checked = false;
        }
        
        // Speichere den Status für spätere Verwendung
        this.kiEnabled = enabled;
    
        const modeSelect = document.getElementById('kiModeSelect');
        if (modeSelect) {
          modeSelect.disabled = !enabled;
        }
    
        // KI-Modus Status-Indikator aktualisieren
        this.updateKIModeStatus(this.kiMode);
      },

      updateKIModeStatus(mode, hasApiKey = null, externalStatus = null) {
        const select = document.getElementById('kiModeSelect');
        if (select) {
          select.value = mode || 'local';
          select.disabled = !this.kiEnabled;
        }
        this.kiMode = mode || 'local';
    
        // Status-Indikator aktualisieren
        const statusContainer = document.getElementById('kiModeStatus');
        const statusIcon = document.getElementById('kiModeStatusIcon');
        const statusText = document.getElementById('kiModeStatusText');
        const statusHint = document.getElementById('kiModeStatusHint');
    
        if (statusContainer && statusIcon && statusText && statusHint) {
          if (!this.kiEnabled) {
            // KI deaktiviert
            statusContainer.style.background = '#f5f5f5';
            statusContainer.style.borderColor = '#e0e0e0';
            statusIcon.textContent = '⚪';
            statusText.textContent = 'KI deaktiviert';
            statusHint.textContent = 'Aktiviere KI-Funktionen oben, um den Modus zu nutzen';
          } else if (this.kiMode === 'openai') {
            // OpenAI Modus
            const apiKeyConfigured = hasApiKey !== null ? hasApiKey : this._hasOpenAIKey;
            if (apiKeyConfigured) {
              statusContainer.style.background = '#e3f2fd';
              statusContainer.style.borderColor = '#90caf9';
              statusIcon.textContent = '🔵';
              statusText.textContent = 'Aktiv: OpenAI (ChatGPT)';
              statusHint.textContent = 'Nutzt OpenAI API für intelligente Vorschläge (Internet erforderlich)';
              this._updateKIBadge('ChatGPT');
            } else {
              statusContainer.style.background = '#fff3e0';
              statusContainer.style.borderColor = '#ffcc80';
              statusIcon.textContent = '🟠';
              statusText.textContent = 'OpenAI ausgewählt - API-Key fehlt!';
              statusHint.textContent = 'Bitte konfiguriere unten einen API-Key für OpenAI';
            }
          } else if (this.kiMode === 'ollama') {
            // Ollama Modus — lokales LLM auf dem Server
            statusContainer.style.background = '#f3e5f5';
            statusContainer.style.borderColor = '#ce93d8';
            statusIcon.textContent = '🦙';
            statusText.textContent = 'Aktiv: Ollama (lokales LLM)';
            statusHint.textContent = `Modell: ${this._ollamaModelName || 'wird geladen...'} · Läuft direkt auf dem Server · kein Internet erforderlich`;
            this._updateKIBadge('Ollama');
          } else if (this.kiMode === 'external') {
            this._updateKIBadge('Externe KI');
            // Externer KI-Service
            const status = externalStatus || this._externalKIStatus;
            const deviceInfo = status?.device ? ` Gerät: ${status.device}` : '';
            if (!status) {
              statusContainer.style.background = '#ede7f6';
              statusContainer.style.borderColor = '#b39ddb';
              statusIcon.textContent = '🟣';
              statusText.textContent = 'Aktiv: Externe KI';
              statusHint.textContent = 'Status wird geprüft...';
            } else if (!status.configured) {
              statusContainer.style.background = '#f5f5f5';
              statusContainer.style.borderColor = '#e0e0e0';
              statusIcon.textContent = '⚪';
              statusText.textContent = 'Externe KI nicht konfiguriert';
              statusHint.textContent = 'Bitte Fallback-URL setzen oder Auto-Discovery nutzen';
            } else if (status.success) {
              statusContainer.style.background = '#e8f5e9';
              statusContainer.style.borderColor = '#a5d6a7';
              statusIcon.textContent = '🟢';
              statusText.textContent = 'Externe KI erreichbar';
              statusHint.textContent = `Lokaler KI-Service im Netzwerk.${deviceInfo}`;
            } else {
              statusContainer.style.background = '#fff3e0';
              statusContainer.style.borderColor = '#ffcc80';
              statusIcon.textContent = '🟠';
              statusText.textContent = 'Externe KI nicht erreichbar';
              statusHint.textContent = status.error || 'Bitte Service/Netzwerk prüfen';
            }
          } else {
            // Lokal Modus
            statusContainer.style.background = '#e8f5e9';
            statusContainer.style.borderColor = '#a5d6a7';
            statusIcon.textContent = '🟢';
            statusText.textContent = 'Aktiv: Lokale KI';
            statusHint.textContent = 'Nutzt Heuristiken auf dem Server (kein Internet erforderlich)';
          }
        }
    
        // Body-Klasse für KI-Modus setzen
        document.body.classList.remove('ki-mode-openai', 'ki-mode-local', 'ki-mode-external', 'ki-mode-ollama');
        if (this.kiEnabled && this.kiMode === 'openai') {
          document.body.classList.add('ki-mode-openai');
        } else if (this.kiEnabled && this.kiMode === 'external') {
          document.body.classList.add('ki-mode-external');
        } else if (this.kiEnabled && this.kiMode === 'ollama') {
          document.body.classList.add('ki-mode-ollama');
        } else {
          document.body.classList.add('ki-mode-local');
        }
      },

      updateRealtimeEnabledStatus(enabled) {
        const toggle = document.getElementById('realtimeEnabledToggle');
        if (toggle) {
          toggle.checked = enabled;
        }
    
        this.realtimeEnabled = enabled;
    
        if (enabled) {
          this.setupWebSocket();
        } else {
          this.stopWebSocket();
        }
      },

      updateSmartSchedulingStatus(enabled) {
        const toggle = document.getElementById('smartSchedulingToggle');
        if (toggle) {
          toggle.checked = enabled;
        }
        this.smartSchedulingEnabled = enabled;
      },

      updateAnomalyDetectionStatus(enabled) {
        const toggle = document.getElementById('anomalyDetectionToggle');
        if (toggle) {
          toggle.checked = enabled;
        }
        this.anomalyDetectionEnabled = enabled;
      },

      async loadKITrainingData() {
        const statusText = document.getElementById('kiTrainingStatusText');
        const detailsButton = document.getElementById('btnShowTrainingDetails');
        const excludeButton = document.getElementById('btnExcludeOutliers');
    
        if (!statusText) return;
    
        try {
          const result = await ApiService.get('/ai/training-data');
    
          if (result.success) {
            const { stats, termine, outlierCount } = result.data;
            const activeOutliers = termine.filter(t => t.isOutlier && !t.ki_training_exclude).length;
            const excludedCount = stats.ausgeschlossen || 0;
            const usableCount = stats.abgeschlossen - excludedCount;
    
            statusText.innerHTML = `
              <strong>${usableCount} nutzbare Trainingseinträge</strong>
              <div style="font-size: 0.85em; color: #666; margin-top: 4px;">
                ${stats.total} Einträge gesamt •
                ${activeOutliers > 0 ? `<span style="color: #e65100;">${activeOutliers} Ausreißer erkannt</span>` : '<span style="color: #2e7d32;">Keine Ausreißer</span>'}
                ${excludedCount > 0 ? ` • ${excludedCount} ausgeschlossen` : ''}
              </div>
            `;
    
            // Ausreißer-Button aktivieren/deaktivieren
            if (excludeButton) {
              excludeButton.disabled = activeOutliers === 0;
              excludeButton.textContent = activeOutliers > 0
                ? `🚫 ${activeOutliers} Ausreißer ausschließen`
                : '🚫 Keine Ausreißer';
            }
    
            // Daten für Details-Anzeige speichern
            this._kiTrainingData = termine;
          } else {
            statusText.innerHTML = '<strong style="color: #c62828;">Fehler beim Laden</strong>';
          }
        } catch (error) {
          console.error('Fehler beim Laden der KI-Trainingsdaten:', error);
          statusText.innerHTML = '<strong style="color: #c62828;">Fehler beim Laden</strong>';
        }
      },

      async handleExcludeOutliers() {
        if (!confirm('Alle erkannten Ausreißer vom Training ausschließen?')) return;
    
        try {
          const data = await ApiService.post('/ai/training-data/exclude-outliers', {});
    
          if (data.success) {
            this.showToast(`${data.excluded} Ausreißer ausgeschlossen`, 'success');
            this.loadKITrainingData();
            this.updateTrainingDetailsTable();
          } else {
            this.showToast('Fehler beim Ausschließen', 'error');
          }
        } catch (error) {
          console.error('Fehler beim Ausschließen der Ausreißer:', error);
          this.showToast('Fehler beim Ausschließen', 'error');
        }
      },

      async handleRetrainModel() {
        const btn = document.getElementById('btnRetrainModel');
        if (btn) btn.disabled = true;
    
        try {
          const data = await ApiService.post('/ai/retrain', {});
    
          if (data.success) {
            this.showToast(`Modell trainiert: ${data.model.sampleCount} Einträge`, 'success');
            this.loadKITrainingData();
          } else {
            this.showToast('Fehler beim Training', 'error');
          }
        } catch (error) {
          console.error('Fehler beim Neutraining:', error);
          this.showToast('Fehler beim Training', 'error');
        } finally {
          if (btn) btn.disabled = false;
        }
      },

      async handleRetrainExternalModel() {
        const btn = document.getElementById('btnRetrainExternalModel');
        const infoDiv = document.getElementById('externalTrainingInfo');
        if (btn) {
          btn.disabled = true;
          btn.textContent = '⏳ Training läuft...';
        }
    
        try {
          const result = await AIService.retrainExternalModel();
    
          if (result.success) {
            const data = result.data || {};
            const message = data.message || 'Training abgeschlossen';
            const samples = data.samples || 0;
            const samplesAdded = data.samples_added || 0;
            const cacheSize = data.cache_size || 0;
            
            // Erstelle detaillierte Nachricht
            let toastMessage = '✅ ' + message;
            if (samplesAdded > 0) {
              toastMessage = `✅ Training erfolgreich: ${samplesAdded} neue Samples trainiert (Gesamt: ${samples})`;
            } else if (samples > 0) {
              toastMessage = `ℹ️ Modell aktuell: ${samples} Samples, keine neuen Daten`;
            }
            
            this.showToast(toastMessage, samplesAdded > 0 ? 'success' : 'info', 6000);
            
            if (infoDiv) {
              infoDiv.textContent = `Letzte Synchronisation: ${new Date().toLocaleString('de-DE')} • ${samples} Samples`;
              infoDiv.style.display = 'block';
            }
            
            // Status aktualisieren
            await this.checkKIStatus();
          } else {
            const message = result.data?.message || 'Training fehlgeschlagen';
            this.showToast('⚠️ ' + message, 'warning', 6000);
          }
        } catch (error) {
          console.error('Fehler beim externen Training:', error);
          // Prüfe ob der Endpoint nicht gefunden wurde (404/Not Found)
          const errorMsg = error.message || String(error);
          if (errorMsg.includes('Not Found') || errorMsg.includes('404')) {
            this.showToast('⚠️ Dieser Endpoint ist in der aktuellen Service-Version nicht verfügbar. Bitte externes KI-Gerät aktualisieren (siehe Doku Abschnitt 6).', 'warning', 10000);
            if (infoDiv) {
              infoDiv.textContent = 'Service-Update erforderlich für manuelles Training';
              infoDiv.style.display = 'block';
            }
          } else {
            this.showToast('❌ Training fehlgeschlagen: ' + errorMsg, 'error');
          }
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = '🔄 Modell abgleichen';
          }
        }
      },

      async notifyExternalBackendUrl() {
        const btn = document.getElementById('btnNotifyBackendUrl');
        if (btn) {
          btn.disabled = true;
          btn.textContent = '⏳ Übertrage...';
        }
    
        try {
          const response = await fetch('/api/ai/external/notify-backend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          
          const result = await response.json();
    
          if (result.success) {
            this.showToast('✅ Backend-URL erfolgreich an externe KI übermittelt', 'success');
            // Status aktualisieren
            await this.checkKIStatus();
          } else {
            this.showToast('⚠️ ' + (result.error || 'Fehler beim Übermitteln'), 'warning');
          }
        } catch (error) {
          console.error('Fehler beim Benachrichtigen:', error);
          this.showToast('❌ Fehler: ' + error.message, 'error');
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = '📡 Backend-URL übertragen';
          }
        }
      },

      toggleTrainingDetails() {
        const details = document.getElementById('kiTrainingDetails');
        const btn = document.getElementById('btnShowTrainingDetails');
    
        if (details) {
          const isVisible = details.style.display !== 'none';
          details.style.display = isVisible ? 'none' : 'block';
          if (btn) btn.textContent = isVisible ? '📋 Details anzeigen' : '📋 Details ausblenden';
    
          if (!isVisible) {
            this.updateTrainingDetailsTable();
          }
        }
      },

      updateTrainingDetailsTable() {
        const tbody = document.getElementById('kiTrainingTableBody');
        if (!tbody || !this._kiTrainingData) return;
    
        tbody.innerHTML = this._kiTrainingData.map(t => {
          const statusClass = t.ki_training_exclude ? 'excluded' : (t.isOutlier ? 'outlier' : 'normal');
          const statusLabel = t.ki_training_exclude ? '❌ Ausgeschlossen' : (t.isOutlier ? '⚠️ Ausreißer' : '✅ OK');
          const rowStyle = t.ki_training_exclude ? 'background: #ffebee; color: #999;' : (t.isOutlier ? 'background: #fff3e0;' : '');
    
          return `
            <tr style="${rowStyle}">
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${t.datum || '-'}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${t.arbeit || '-'}</td>
              <td style="padding: 8px; text-align: right; border-bottom: 1px solid #eee;">${t.tatsaechliche_zeit || '-'}</td>
              <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee;">${statusLabel}</td>
              <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee;">
                <button onclick="window.app.toggleTrainingExclude(${t.id}, ${t.ki_training_exclude ? 0 : 1})"
                        style="padding: 4px 8px; font-size: 0.8em; cursor: pointer;">
                  ${t.ki_training_exclude ? '✅ Einschließen' : '🚫 Ausschließen'}
                </button>
              </td>
            </tr>
          `;
        }).join('');
      },

      async toggleTrainingExclude(id, exclude) {
        try {
          const data = await ApiService.post(`/ai/training-data/${id}/exclude`, { exclude: !!exclude });
    
          if (data.success) {
            // Lokale Daten aktualisieren
            const item = this._kiTrainingData.find(t => t.id === id);
            if (item) item.ki_training_exclude = exclude;
    
            this.updateTrainingDetailsTable();
            this.loadKITrainingData();
          }
        } catch (error) {
          console.error('Fehler beim Aktualisieren:', error);
          this.showToast('Fehler beim Aktualisieren', 'error');
        }
      },

      async handleKIEnabledToggle(e) {
        const enabled = e.target.checked;
        
        try {
          const result = await EinstellungenService.updateKIEnabled(enabled);
          
          if (result.success) {
            this.updateKIEnabledStatus(enabled);
            this.showToast(
              enabled ? '🤖 KI-Funktionen aktiviert' : '🔌 KI-Funktionen deaktiviert', 
              'success'
            );
          } else {
            // Fehler - Toggle zurücksetzen
            e.target.checked = !enabled;
            this.showToast('Fehler beim Speichern der Einstellung', 'error');
          }
        } catch (error) {
          console.error('Fehler beim Aktualisieren der KI-Einstellung:', error);
          e.target.checked = !enabled;
          this.showToast('Fehler beim Speichern der Einstellung', 'error');
        }
      },

      async handleKIModeChange(e) {
        const mode = e.target.value;
        const previous = this.kiMode;
        const modeLabels = {
          local: 'Lokal',
          openai: 'OpenAI',
          external: 'Extern',
          ollama: 'Ollama'
        };
    
        try {
          const result = await EinstellungenService.updateKIMode(mode);
    
          if (result.success) {
            this.updateKIModeStatus(mode);
            this.showToast(`🧠 KI-Modus: ${modeLabels[mode] || mode}`, 'success');
            this.checkKIStatus();
            if (mode === 'ollama') this.checkOllamaStatus();
          } else {
            e.target.value = previous;
            this.showToast('Fehler beim Speichern des KI-Modus', 'error');
          }
        } catch (error) {
          console.error('Fehler beim Aktualisieren des KI-Modus:', error);
          e.target.value = previous;
          this.showToast('Fehler beim Speichern des KI-Modus', 'error');
        }
      },

      async handleExternalKiSubmit(e) {
        e.preventDefault();
        const input = document.getElementById('ki_external_url');
        const url = input?.value?.trim() || '';
    
        try {
          const result = await EinstellungenService.updateKIExternalUrl(url);
          if (result.success) {
            this.showToast('Externe KI-URL gespeichert', 'success');
            this.prefillKIExternalSettings({ ki_external_url: result.ki_external_url });
            this.checkKIStatus();
          } else {
            this.showToast('Fehler beim Speichern der URL', 'error');
          }
        } catch (error) {
          console.error('Fehler beim Speichern der externen KI-URL:', error);
          this.showToast('Fehler beim Speichern der URL', 'error');
        }
      },

      async handleRealtimeEnabledToggle(e) {
        const enabled = e.target.checked;
    
        try {
          const result = await EinstellungenService.updateRealtimeEnabled(enabled);
    
          if (result.success) {
            this.updateRealtimeEnabledStatus(enabled);
            this.showToast(
              enabled ? '⚡ Echtzeit-Updates aktiviert' : '⏸️ Echtzeit-Updates deaktiviert',
              'success'
            );
          } else {
            e.target.checked = !enabled;
            this.showToast('Fehler beim Speichern der Einstellung', 'error');
          }
        } catch (error) {
          console.error('Fehler beim Aktualisieren der Echtzeit-Einstellung:', error);
          e.target.checked = !enabled;
          this.showToast('Fehler beim Speichern der Einstellung', 'error');
        }
      },

      async handleSmartSchedulingToggle(e) {
        const enabled = e.target.checked;
    
        try {
          const result = await EinstellungenService.updateSmartSchedulingEnabled(enabled);
    
          if (result.success) {
            this.updateSmartSchedulingStatus(enabled);
            this.showToast(
              enabled ? '🧭 Smart Scheduling aktiviert' : '🧭 Smart Scheduling deaktiviert',
              'success'
            );
          } else {
            e.target.checked = !enabled;
            this.showToast('Fehler beim Speichern der Einstellung', 'error');
          }
        } catch (error) {
          console.error('Fehler beim Aktualisieren von Smart Scheduling:', error);
          e.target.checked = !enabled;
          this.showToast('Fehler beim Speichern der Einstellung', 'error');
        }
      },

      async handleAnomalyDetectionToggle(e) {
        const enabled = e.target.checked;
    
        try {
          const result = await EinstellungenService.updateAnomalyDetectionEnabled(enabled);
    
          if (result.success) {
            this.updateAnomalyDetectionStatus(enabled);
            this.showToast(
              enabled ? '🛡️ Anomalie-Erkennung aktiviert' : '🛡️ Anomalie-Erkennung deaktiviert',
              'success'
            );
          } else {
            e.target.checked = !enabled;
            this.showToast('Fehler beim Speichern der Einstellung', 'error');
          }
        } catch (error) {
          console.error('Fehler beim Aktualisieren der Anomalie-Erkennung:', error);
          e.target.checked = !enabled;
          this.showToast('Fehler beim Speichern der Einstellung', 'error');
        }
      },

      toggleApiKeyVisibility() {
        const input = document.getElementById('chatgpt_api_key');
        const button = document.getElementById('toggleApiKeyVisibility');
        if (input && button) {
          if (input.type === 'password') {
            input.type = 'text';
            button.textContent = '🙈';
          } else {
            input.type = 'password';
            button.textContent = '👁️';
          }
        }
      },

      async handleChatGPTApiKeySubmit(e) {
        e.preventDefault();
        
        const apiKeyInput = document.getElementById('chatgpt_api_key');
        const apiKey = apiKeyInput?.value?.trim();
        
        if (!apiKey) {
          alert('Bitte geben Sie einen API-Key ein.');
          return;
        }
        
        if (!apiKey.startsWith('sk-')) {
          alert('Ungültiges Format. OpenAI API-Keys beginnen mit "sk-".');
          return;
        }
        
        try {
          const result = await EinstellungenService.updateChatGPTApiKey(apiKey);
          alert(result.message || 'API-Key wurde gespeichert.');
          apiKeyInput.value = ''; // Eingabefeld leeren
          await this.loadWerkstattSettings(); // Status aktualisieren
        } catch (error) {
          console.error('Fehler beim Speichern des API-Keys:', error);
          alert('Fehler: ' + (error.message || 'API-Key konnte nicht gespeichert werden.'));
        }
      },

      async testChatGPTApiKey() {
        const resultDiv = document.getElementById('apiKeyTestResult');
        if (!resultDiv) return;
        
        resultDiv.style.display = 'block';
        resultDiv.className = 'api-test-result testing';
        resultDiv.innerHTML = '<span class="loading-spinner">⏳</span> Verbindung wird getestet...';
        
        try {
          const result = await EinstellungenService.testChatGPTApiKey();
          
          if (result.success) {
            resultDiv.className = 'api-test-result success';
            resultDiv.innerHTML = '✅ ' + result.message;
          } else {
            resultDiv.className = 'api-test-result error';
            resultDiv.innerHTML = '❌ ' + (result.error || 'Test fehlgeschlagen');
          }
        } catch (error) {
          resultDiv.className = 'api-test-result error';
          resultDiv.innerHTML = '❌ ' + (error.message || 'Verbindungsfehler');
        }
        
        // Ergebnis nach 10 Sekunden ausblenden
        setTimeout(() => {
          resultDiv.style.display = 'none';
        }, 10000);
      },

      async deleteChatGPTApiKey() {
        if (!confirm('Möchten Sie den API-Key wirklich löschen?')) {
          return;
        }
        
        try {
          const result = await EinstellungenService.deleteChatGPTApiKey();
          alert(result.message || 'API-Key wurde gelöscht.');
          await this.loadWerkstattSettings(); // Status aktualisieren
        } catch (error) {
          console.error('Fehler beim Löschen des API-Keys:', error);
          alert('Fehler: ' + (error.message || 'API-Key konnte nicht gelöscht werden.'));
        }
      },

      async handleWerkstattSettingsSubmit(e) {
        e.preventDefault();
    
        const servicezeitField = document.getElementById('servicezeit_minuten');
        const ersatzautoField = document.getElementById('ersatzauto_anzahl');
        const nebenzeitField = document.getElementById('nebenzeit_prozent');
        const mittagspauseField = document.getElementById('mittagspause_minuten');
        
        if (!servicezeitField) {
          alert('Servicezeit-Feld nicht gefunden.');
          return;
        }
    
        const servicezeit = parseInt(servicezeitField.value, 10);
        const ersatzautoAnzahl = ersatzautoField ? parseInt(ersatzautoField.value, 10) : 2;
        const nebenzeit = nebenzeitField ? parseFloat(nebenzeitField.value) : 0;
        const mittagspause = mittagspauseField ? parseInt(mittagspauseField.value, 10) : 30;
    
        if (!Number.isFinite(servicezeit) || servicezeit < 0) {
          alert('Bitte eine gültige Servicezeit eingeben.');
          return;
        }
    
        if (!Number.isFinite(ersatzautoAnzahl) || ersatzautoAnzahl < 0) {
          alert('Bitte eine gültige Anzahl Ersatzautos eingeben.');
          return;
        }
    
        if (!Number.isFinite(nebenzeit) || nebenzeit < 0 || nebenzeit > 100) {
          alert('Bitte eine gültige Nebenzeit eingeben (0-100%).');
          return;
        }
    
        if (!Number.isFinite(mittagspause) || mittagspause < 0 || mittagspause > 120) {
          alert('Bitte eine gültige Mittagspause eingeben (0-120 Minuten).');
          return;
        }
    
        try {
          // Lade aktuelle Einstellungen, um Pufferzeit beizubehalten
          const aktuelleEinstellungen = await EinstellungenService.getWerkstatt();
          
          await EinstellungenService.updateWerkstatt({
            pufferzeit_minuten: aktuelleEinstellungen?.pufferzeit_minuten || 15,
            servicezeit_minuten: servicezeit,
            ersatzauto_anzahl: ersatzautoAnzahl,
            nebenzeit_prozent: nebenzeit,
            mittagspause_minuten: mittagspause
          });
          alert('Einstellungen gespeichert.');
          // WICHTIG: Erst Einstellungen laden, dann Auslastung (sonst überschreibt Auslastung mit alten Daten)
          await this.loadWerkstattSettings();
          this.loadAuslastung();
          this.loadDashboard();
        } catch (error) {
          console.error('Fehler beim Speichern der Einstellungen:', error);
          alert('Einstellungen konnten nicht gespeichert werden.');
        }
      },

      setupKIAssistentEventListeners() {
        if (this.kiAssistentListenersBound) {
          return;
        }
    
        // KI-Analyse Checkbox
        const kiCheckbox = document.getElementById('kiAnalyseAktiv');
        if (kiCheckbox) {
          // Gespeicherte Einstellung laden
          const savedState = localStorage.getItem('kiAnalyseAktiv');
          if (savedState !== null) {
            kiCheckbox.checked = savedState === 'true';
          }
          
          // Änderungen speichern
          this.bindEventListenerOnce(kiCheckbox, 'change', (e) => {
            localStorage.setItem('kiAnalyseAktiv', e.target.checked);
            if (!e.target.checked) {
              this.hideKIVorschlaege();
            }
          }, 'KiAnalyseAktivChange');
        }
    
        // VIN-Decoder Button
        const vinDecodeBtn = document.getElementById('vinDecodeBtn');
        this.bindEventListenerOnce(vinDecodeBtn, 'click', () => this.decodeVIN(), 'VinDecodeClick');
        
        // VIN-Eingabefeld: Auto-Decode bei 17 Zeichen
        const vinInput = document.getElementById('vin');
        if (vinInput) {
          this.bindEventListenerOnce(vinInput, 'input', (e) => {
            const vin = e.target.value.replace(/[^A-HJ-NPR-Z0-9]/gi, '');
            e.target.value = vin.toUpperCase();
            
            // Auto-Decode wenn 17 Zeichen erreicht
            if (vin.length === 17) {
              this.decodeVIN();
            } else {
              // Info ausblenden wenn weniger als 17 Zeichen
              const vinInfo = document.getElementById('vinInfoBereich');
              if (vinInfo) vinInfo.style.display = 'none';
            }
          }, 'VinInput');
        }
    
        // KI-Assistent Banner/Button
        const kiAssistentBtn = document.getElementById('kiAssistentBtn');
        this.bindEventListenerOnce(kiAssistentBtn, 'click', () => this.openKIAssistent(), 'KiAssistentOpen');
    
        // Modal schließen
        const closeKiAssistent = document.getElementById('closeKiAssistent');
        this.bindEventListenerOnce(closeKiAssistent, 'click', () => this.closeKIAssistent(), 'KiAssistentClose');
    
        // Abbrechen Button
        const kiAbbrechen = document.getElementById('kiAbbrechen');
        this.bindEventListenerOnce(kiAbbrechen, 'click', () => this.closeKIAssistent(), 'KiAbbrechen');
    
        // Analysieren Button
        const kiAnalysierenBtn = document.getElementById('kiAnalysierenBtn');
        this.bindEventListenerOnce(kiAnalysierenBtn, 'click', () => this.analyzeWithKI(), 'KiAnalysieren');
    
        // Übernehmen Button
        const kiUebernehmen = document.getElementById('kiUebernehmen');
        this.bindEventListenerOnce(kiUebernehmen, 'click', () => this.applyKIResults(), 'KiUebernehmen');
    
        // Beispiel-Buttons
        document.querySelectorAll('.ki-beispiel-btn').forEach(btn => {
          this.bindEventListenerOnce(btn, 'click', (e) => {
            const text = e.target.dataset.text;
            const textarea = document.getElementById('kiFreitextInput');
            if (textarea && text) {
              textarea.value = text;
              textarea.focus();
            }
          }, 'KiBeispielClick');
        });
    
        // Modal schließen bei Klick außerhalb
        const kiModal = document.getElementById('kiAssistentModal');
        this.bindEventListenerOnce(kiModal, 'click', (e) => {
          if (e.target === kiModal) {
            this.closeKIAssistent();
          }
        }, 'KiModalClick');
    
        // KI-Status beim Start prüfen
        this.checkKIStatus();
        this.kiAssistentListenersBound = true;
      },

      async saveOllamaModel() {
        const input = document.getElementById('ollamaModelInput');
        const btn   = document.getElementById('saveOllamaModelBtn');
        if (!input) return;
    
        const model = input.value.trim();
        if (!model) { this.showToast('Bitte einen Modellnamen eingeben', 'warning'); return; }
    
        btn && (btn.disabled = true);
        try {
          const res = await AIService.updateOllamaModel(model);
          if (res.success !== false) {
            this._ollamaModelName = model;
            this.showToast(`✅ Modell gespeichert: ${model} – Änderung ist sofort aktiv`, 'success');
            this.checkOllamaStatus();
            this.updateKIModeStatus(this.kiMode);
          } else {
            this.showToast(res.error || 'Fehler beim Speichern', 'error');
          }
        } catch (err) {
          this.showToast('Fehler: ' + (err.message || String(err)), 'error');
        } finally {
          btn && (btn.disabled = false);
        }
      },

      async runOllamaBenchmark() {
        const btn     = document.getElementById('ollamaBenchmarkBtn');
        const result  = document.getElementById('ollamaBenchmarkResult');
        const content = document.getElementById('ollamaBenchmarkContent');
        if (!result || !content) return;
    
        btn && (btn.disabled = true);
        btn && (btn.textContent = '⏳ Teste...');
        result.style.display = 'block';
        content.innerHTML = '<em style="color:#888">⏳ Prüfe Ollama und verfügbare Modelle...<br>Beim ersten Start muss das Modell in den RAM geladen werden – das kann 60–90 Sekunden dauern.</em>';
    
        const _esc = (s) => this._escapeHtml(String(s || ''));
    
        const _empfehlungsHTML = (empfehlungen, empfohlen) => {
          if (!empfehlungen || empfehlungen.length === 0) return '';
          const zeilen = empfehlungen.map(m => {
            const hl = m.name === empfohlen?.name ? 'background:#e8f5e9; font-weight:600;' : '';
            return `<tr style="${hl}">
              <td style="padding:3px 8px">${m.name === empfohlen?.name ? '⭐' : ''} <code>${_esc(m.name)}</code></td>
              <td style="padding:3px 8px; color:#888">${m.groesse_gb} GB</td>
              <td style="padding:3px 8px; color:#555">${_esc(m.qualitaet)}</td>
              <td style="padding:3px 8px"><code style="font-size:0.82em;color:#1565c0">ollama pull ${_esc(m.name)}</code></td>
            </tr>`;
          }).join('');
          return `
            <div style="margin-top:12px; border-top:1px solid #e0e0e0; padding-top:10px">
              <strong style="font-size:0.88em; color:#333">📋 Modell-Empfehlungen fuer diesen Server:</strong>
              <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:0.82em">
                <thead><tr style="color:#888; border-bottom:1px solid #eee">
                  <th style="text-align:left; padding:2px 8px">Modell</th>
                  <th style="text-align:left; padding:2px 8px">Groesse</th>
                  <th style="text-align:left; padding:2px 8px">Eignung</th>
                  <th style="text-align:left; padding:2px 8px">Installation</th>
                </tr></thead>
                <tbody>${zeilen}</tbody>
              </table>
              ${empfohlen ? `<div style="margin-top:6px;font-size:0.82em;color:#1b5e20">⭐ Empfohlen: <code>ollama pull ${_esc(empfohlen.name)}</code></div>` : ''}
            </div>`;
        };
    
        try {
          const res = await AIService.benchmarkOllama();
          const sys = res.system || {};
          const sysInfo = [
            sys.cpuKerne     ? `🖥️ CPU: ${sys.cpuKerne} Kerne` : null,
            sys.ramGesamt_gb ? `🧠 RAM: ${sys.ramFrei_mb} MB frei / ${sys.ramGesamt_gb} GB gesamt` : null
          ].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;');
    
          if (!res.success) {
            let titelIcon = '🔴', titelText = res.error || 'Benchmark fehlgeschlagen';
            let extra = '';
            if (res.fehler_typ === 'kein_modell') {
              titelIcon = '📥';
              titelText = 'Kein Ollama-Modell installiert';
              extra = `
                <div style="margin-top:10px;padding:10px;background:#fff8e1;border:1px solid #ffcc80;border-radius:6px;font-size:0.88em">
                  <strong>Passendes Modell fuer diesen Server (${sys.ramGesamt_gb} GB RAM):</strong><br>
                  <code style="font-size:1.05em;color:#e65100">${_esc(res.empfohlenes_modell?.name || 'tinyllama')}</code>
                  &nbsp;&ndash;&nbsp;${_esc(res.empfohlenes_modell?.qualitaet || '')}<br>
                  <div style="margin-top:8px;font-family:monospace;background:#f5f5f5;padding:6px 10px;border-radius:4px;color:#1565c0">
                    ollama pull ${_esc(res.empfohlenes_modell?.name || 'tinyllama')}
                  </div>
                  <small style="color:#888;margin-top:4px;display:block">Danach ~2-5 Minuten warten und Test erneut starten.</small>
                </div>`;
            } else if (res.fehler_typ === 'timeout') {
              titelIcon = '⏱️';
              titelText = 'Timeout (90 s) – Modell antwortet nicht';
              extra = `<div style="margin-top:10px;padding:10px;background:#fff8e1;border:1px solid #ffcc80;border-radius:6px;font-size:0.88em">
                <strong>Beim ersten Start lädt Ollama das Modell in den RAM (Cold Start).</strong><br>
                👉 Bitte nochmals auf ⚡ Performance-Test klicken – der zweite Aufruf ist deutlich schneller.
              </div>`;
            } else if (res.fehler_typ === 'nicht_erreichbar') {
              titelIcon = '🔌';
              titelText = 'Ollama nicht erreichbar';
            }
            content.innerHTML = `
              <div style="font-weight:600;font-size:1.05em;margin-bottom:6px">${titelIcon} ${_esc(titelText)}</div>
              ${res.hinweis ? `<div style="color:#555;font-size:0.9em;margin-bottom:6px">${_esc(res.hinweis)}</div>` : ''}
              ${sysInfo ? `<small style="color:#aaa">${sysInfo}</small>` : ''}
              ${extra}
              ${_empfehlungsHTML(res.modell_empfehlungen, res.empfohlenes_modell)}
            `;
            return;
          }
    
          const dauer_s   = (res.dauer_ms / 1000).toFixed(1);
          const tokenInfo = res.token_s ? `&nbsp;&nbsp;|&nbsp;&nbsp;🔤 ${res.token_s} Token/s` : '';
          const empfText  = {
            ausgezeichnet: 'Bestens geeignet – auch größere Modelle möglich.',
            gut:           'Gut geeignet für den täglichen Einsatz.',
            akzeptabel:    'Nutzbar mit kleinen Modellen (empfohlen: tinyllama). Auf CPU-Servern ist das normal.',
            langsam:       'Nutzbar, aber mit spürbarer Wartezeit. Kleineres Modell empfohlen.',
            zu_langsam:    'Für Produktivbetrieb zu langsam. Bitte kleineres Modell verwenden (z.B. tinyllama).'
          }[res.bewertung] || '';
          const cpuHinweis = res.cpu_only ? `<div style="margin-top:4px;padding:5px 8px;background:#e3f2fd;border-radius:4px;font-size:0.83em;color:#1565c0">🖥️ CPU-Betrieb erkannt – Token/s ist der relevante Wert; Antwortzeit schwankt je nach Modelllänge.</div>` : '';
    
          const installierteListe = (res.installierte_modelle || [])
            .map(m => `<code>${_esc(m.name)}</code> (${m.size_mb} MB)`).join(', ');
    
          const modellHinweis = res.test_modell !== res.konfig_modell
            ? ` <small style="color:#888">(kleinste verfuegbare - konfiguriert: <code>${_esc(res.konfig_modell)}</code>)</small>`
            : '';
    
          content.innerHTML = `
            <div style="margin-bottom:10px">
              <span style="font-size:1.3em;font-weight:700;color:${res.bewertungFarbe}">${res.bewertungLabel}</span>
              &nbsp;&nbsp;
              <span style="color:#555">${dauer_s} s Antwortzeit${tokenInfo}</span>
            </div>
            <div style="font-size:0.88em;color:#666;margin-bottom:4px">
              🦙 Getestetes Modell: <strong>${_esc(res.test_modell)}</strong>${modellHinweis}
            </div>
            ${sysInfo ? `<div style="font-size:0.85em;color:#888;margin-bottom:8px">${sysInfo}</div>` : ''}
            ${empfText ? `<div style="color:#555;font-size:0.88em;border-top:1px solid #e0e0e0;padding-top:8px">ℹ️ ${empfText}</div>` : ''}
            ${cpuHinweis}
            ${installierteListe ? `<div style="font-size:0.82em;color:#888;margin-top:6px">Installierte Modelle: ${installierteListe}</div>` : ''}
            ${res.antwort ? `<div style="margin-top:10px;padding:8px 10px;background:#fff;border:1px solid #e8e8e8;border-radius:5px;white-space:pre-wrap;color:#333;font-size:0.87em">${_esc(res.antwort)}</div>` : ''}
            ${_empfehlungsHTML(res.modell_empfehlungen, res.empfohlenes_modell)}
          `;
        } catch (err) {
          content.innerHTML = `<span style="color:red">Fehler: ${_esc(err.message || String(err))}</span>`;
        } finally {
          btn && (btn.disabled = false);
          btn && (btn.textContent = '⚡ Performance-Test');
        }
      },

      async checkOllamaStatus(showToast = false) {
        const box = document.getElementById('ollamaStatusBox');
        const icon = document.getElementById('ollamaStatusIcon');
        const text = document.getElementById('ollamaStatusText');
        const hint = document.getElementById('ollamaStatusHint');
        if (!box) return;
    
        icon && (icon.textContent = '⏳');
        text && (text.textContent = 'Prüfe Ollama...');
        hint && (hint.textContent = '');
    
        try {
          const res = await AIService.getOllamaStatus();
          if (res.success) {
            this._ollamaModelName = res.konfiguriertes_modell || null;
            box.style.background = '#f3e5f5';
            box.style.borderColor = '#ce93d8';
            icon && (icon.textContent = '🟢');
            text && (text.textContent = `Ollama erreichbar · Modell: ${res.konfiguriertes_modell || 'unbekannt'}`);
            const modelle = res.verfuegbareModelle?.length
              ? `Verfügbare Modelle: ${res.verfuegbareModelle.map(m => m.name || m).join(', ')}`
              : `URL: ${res.base_url || 'localhost:11434'}`;
            hint && (hint.textContent = modelle);
            if (showToast) this.showToast('🦙 Ollama ist erreichbar', 'success');
          } else {
            box.style.background = '#fff3e0';
            box.style.borderColor = '#ffcc80';
            icon && (icon.textContent = '🔴');
            text && (text.textContent = 'Ollama nicht erreichbar');
            hint && (hint.textContent = res.error || `Prüfe ob Ollama läuft: systemctl status ollama`);
            if (showToast) this.showToast('Ollama nicht erreichbar – läuft der Service?', 'warning');
          }
        } catch (err) {
          box.style.background = '#ffebee';
          box.style.borderColor = '#ef9a9a';
          icon && (icon.textContent = '🔴');
          text && (text.textContent = 'Fehler beim Abrufen des Ollama-Status');
          hint && (hint.textContent = err.message || '');
          if (showToast) this.showToast('Ollama-Status konnte nicht abgerufen werden', 'error');
        }
      },

      async sendOllamaTestPrompt() {
        const input = document.getElementById('ollamaTestPromptInput');
        const result = document.getElementById('ollamaPromptResult');
        const btn = document.getElementById('ollamaPromptSendBtn');
        if (!input || !result) return;
    
        const prompt = input.value.trim();
        if (!prompt) { this.showToast('Bitte einen Prompt eingeben', 'warning'); return; }
    
        btn && (btn.disabled = true);
        btn && (btn.textContent = '⏳ Warte auf Antwort...');
        result.style.display = 'none';
    
        try {
          const res = await AIService.testOllamaPrompt(prompt);
          result.style.display = 'block';
          if (res.success === false || res.error) {
            result.innerHTML = `<span style="color:#e53935">⚠ Ollama nicht erreichbar: ${this._escapeHtml(res.error || 'Unbekannter Fehler')}</span><br><small style="color:#999">${this._escapeHtml(res.hinweis || 'Stelle sicher dass Ollama läuft: systemctl status ollama')}</small>`;
          } else {
            result.innerHTML = `<strong>Modell:</strong> ${this._escapeHtml(res.modell || '?')} &nbsp;·&nbsp; <strong>Dauer:</strong> ${res.dauer_ms ? (res.dauer_ms / 1000).toFixed(1) + 's' : '?'}<br><br>${this._escapeHtml(res.antwort || '')}`;
          }
        } catch (err) {
          result.style.display = 'block';
          result.innerHTML = `<span style="color:red">Fehler: ${this._escapeHtml(err.message || String(err))}</span>`;
        } finally {
          btn && (btn.disabled = false);
          btn && (btn.textContent = '▶ Senden');
        }
      },

      _updateKIBadge(label) {
        const badge = document.getElementById('kiAssistentBadge');
        if (badge) badge.textContent = label;
      },

      async checkKIStatus(showToast = false) {
        try {
          const response = await AIService.getStatus();
          const banner = document.getElementById('kiAssistentBanner');
    
          if (response.mode === 'external') {
            this._externalKIStatus = response.health || null;
            this.updateExternalKIStatus(this._externalKIStatus);
            this.updateExternalTrainingStatus(this._externalKIStatus);
            if (this.kiMode === 'external') {
              this.updateKIModeStatus('external', null, this._externalKIStatus);
            }
            if (showToast) {
              const statusText = this._externalKIStatus?.success
                ? 'Externe KI erreichbar'
                : (this._externalKIStatus?.configured ? 'Externe KI nicht erreichbar' : 'Externe KI nicht konfiguriert');
              this.showToast(statusText, this._externalKIStatus?.success ? 'success' : 'warning');
            }
          }
          
          if (!response.enabled || !response.configured) {
            // KI nicht konfiguriert - Banner verstecken oder anpassen
            if (banner) {
              banner.style.opacity = '0.5';
              banner.title = response.mode === 'external'
                ? 'Externe KI nicht erreichbar oder nicht konfiguriert.'
                : 'KI-Assistent nicht konfiguriert. Bitte API-Key in Einstellungen hinterlegen.';
            }
          }
        } catch (error) {
          console.log('KI-Status konnte nicht geprüft werden:', error.message);
          // Bei Fehler Banner ausblenden
          const banner = document.getElementById('kiAssistentBanner');
          if (banner) {
            banner.style.display = 'none';
          }
          this.updateExternalKIStatus({
            success: false,
            configured: true,
            error: error.message || 'Status-Abfrage fehlgeschlagen'
          });
          this.updateExternalTrainingStatus({
            success: false,
            configured: true,
            error: error.message || 'Status-Abfrage fehlgeschlagen'
          });
        }
      },

      updateExternalKIStatus(status) {
        const statusContainer = document.getElementById('externalKiStatus');
        const statusIcon = document.getElementById('externalKiStatusIcon');
        const statusText = document.getElementById('externalKiStatusText');
    
        if (!statusContainer || !statusIcon || !statusText) return;
    
        if (!status) {
          statusContainer.style.background = '#f5f5f5';
          statusContainer.style.borderColor = '#ddd';
          statusIcon.textContent = '⚪';
          statusText.innerHTML = '<strong>Status wird geprüft...</strong>';
          return;
        }
    
        const activeUrl = status.activeUrl || status.discoveredUrl || status.manualUrl || null;
        const sourceLabel = status.source === 'discovered'
          ? 'automatisch gefunden'
          : (status.source === 'manual' ? 'manuell gesetzt' : (status.source === 'env' ? 'aus ENV' : ''));
        const details = activeUrl ? ` <span style="color:#666;">(${activeUrl}${sourceLabel ? ` · ${sourceLabel}` : ''})</span>` : '';
    
        if (!status.configured) {
          statusContainer.style.background = '#f5f5f5';
          statusContainer.style.borderColor = '#e0e0e0';
          statusIcon.textContent = '⚪';
          statusText.innerHTML = `<strong>Externe KI nicht konfiguriert</strong>${details}`;
          return;
        }
    
        if (status.success) {
          statusContainer.style.background = '#e8f5e9';
          statusContainer.style.borderColor = '#a5d6a7';
          statusIcon.textContent = '🟢';
          statusText.innerHTML = `<strong>Externe KI erreichbar</strong>${details}`;
          return;
        }
    
        statusContainer.style.background = '#fff3e0';
        statusContainer.style.borderColor = '#ffcc80';
        statusIcon.textContent = '🟠';
        statusText.innerHTML = `<strong>Externe KI nicht erreichbar</strong>${details}<div style="font-size:0.85em; color:#666; margin-top:4px;">${status.error || 'Bitte Service/Netzwerk prüfen'}</div>`;
      },

      ensureExternalTrainingContainerVisibility() {
        const trainingContainer = document.getElementById('externalKiTrainingContainer');
        const isExternalMode = this.kiMode === 'external';
        if (trainingContainer) {
          trainingContainer.style.display = isExternalMode ? 'block' : 'none';
          console.log('[External Training Container] KI-Modus:', this.kiMode, 'Display:', trainingContainer.style.display);
        }
      },

      updateExternalTrainingStatus(status) {
        const statusContainer = document.getElementById('externalKiTrainingStatus');
        const statusText = document.getElementById('externalKiTrainingStatusText');
        const retrainButton = document.getElementById('btnRetrainExternalModel');
        const trainingContainer = document.getElementById('externalKiTrainingContainer');
        const trainingHint = document.getElementById('externalKiTrainingHint');
        if (!statusContainer || !statusText) return;
    
        // Container je nach KI-Modus ein-/ausblenden
        const isExternalMode = this.kiMode === 'external';
        if (trainingContainer) {
          trainingContainer.style.display = isExternalMode ? 'block' : 'none';
          console.log('[updateExternalTrainingStatus] KI-Modus:', this.kiMode, 'Display:', trainingContainer.style.display);
        }
    
        if (!status) {
          statusText.innerHTML = '<strong>Externes KI-Training wird geprüft...</strong>';
          if (retrainButton) {
            retrainButton.disabled = true;
            retrainButton.textContent = '🔁 Externes Modell jetzt abgleichen';
          }
          if (trainingHint) {
            trainingHint.textContent = 'Status wird geprüft...';
            trainingHint.style.color = '#999';
          }
          return;
        }
    
        if (!status.configured) {
          statusText.innerHTML = '<strong>Externe KI nicht konfiguriert</strong>';
          if (retrainButton) {
            retrainButton.disabled = true;
            retrainButton.textContent = '🔁 Externes Modell jetzt abgleichen';
          }
          if (trainingHint) {
            trainingHint.textContent = 'Bitte externe KI-URL in den Einstellungen konfigurieren.';
            trainingHint.style.color = '#d32f2f';
          }
          return;
        }
    
        if (!status.success) {
          statusText.innerHTML = `<strong>Externes KI-Training nicht erreichbar</strong><div style="font-size:0.85em; color:#666; margin-top:4px;">${status.error || 'Bitte Service prüfen'}</div>`;
          if (retrainButton) {
            retrainButton.disabled = true;
            retrainButton.textContent = '🔁 Externes Modell jetzt abgleichen';
          }
          if (trainingHint) {
            trainingHint.textContent = 'Service ist nicht erreichbar. Bitte Netzwerk und Service prüfen.';
            trainingHint.style.color = '#d32f2f';
          }
          return;
        }
    
        const samples = status.model_samples ?? status.samples ?? 0;
        const trainedAt = status.trained_at ? new Date(status.trained_at * 1000) : null;
        const trainedText = trainedAt ? trainedAt.toLocaleString('de-DE') : 'unbekannt';
        const lastId = status.last_id ?? '-';
        const lookback = status.lookback_days ?? '-';
        const trainingInProgress = !!status.training_in_progress;
        const lastRequestAt = status.last_train_request_at ? new Date(status.last_train_request_at * 1000) : null;
        const requestText = lastRequestAt ? lastRequestAt.toLocaleString('de-DE') : 'unbekannt';
        const progressLine = trainingInProgress
          ? `<div style="font-size:0.85em; color:#6d4c41; margin-top:4px;">Training laeuft... (Start: ${requestText})</div>`
          : '';
    
        if (retrainButton) {
          retrainButton.disabled = trainingInProgress;
          retrainButton.textContent = trainingInProgress ? '⏳ Training läuft...' : '🔁 Externes Modell jetzt abgleichen';
        }
    
        if (trainingHint) {
          trainingHint.textContent = trainingInProgress 
            ? 'Training läuft gerade. Bitte warten...'
            : 'Synchronisieren Sie die Trainingsdaten mit Ihrem externen KI-Service.';
          trainingHint.style.color = trainingInProgress ? '#ff9800' : '#666';
        }
    
        statusText.innerHTML = `
          <strong>Externes Modell: ${samples} Samples</strong>
          <div style="font-size:0.85em; color:#666; margin-top:4px;">
            Letztes Training: ${trainedText} • Letzte ID: ${lastId} • Lookback: ${lookback} Tage
          </div>
          ${progressLine}
        `;
      },

      openKIAssistent() {
        const modal = document.getElementById('kiAssistentModal');
        if (modal) {
          modal.style.display = 'block';
          // Reset
          document.getElementById('kiFreitextInput').value = '';
          document.getElementById('kiErgebnisBereich').style.display = 'none';
          document.getElementById('kiUebernehmen').style.display = 'none';
          document.getElementById('kiFremdmarkenWarnung').style.display = 'none';
          document.getElementById('kiLoading').style.display = 'none';
          document.getElementById('kiAnalysierenBtn').disabled = false;
          
          // Fokus auf Eingabefeld
          setTimeout(() => {
            document.getElementById('kiFreitextInput').focus();
          }, 100);
        }
      },

      closeKIAssistent() {
        const modal = document.getElementById('kiAssistentModal');
        if (modal) {
          modal.style.display = 'none';
        }
      },

      async analyzeWithKI() {
        const textarea = document.getElementById('kiFreitextInput');
        const text = textarea.value.trim();
        
        if (text.length < 5) {
          this.showToast('Bitte mindestens 5 Zeichen eingeben.', 'warning');
          return;
        }
    
        // UI: Loading anzeigen
        const btn = document.getElementById('kiAnalysierenBtn');
        const loading = document.getElementById('kiLoading');
        btn.disabled = true;
        loading.style.display = 'flex';
    
        try {
          // KI-Analyse durchführen
          const response = await AIService.fullAnalysis(text, true);
          
          if (response.success && response.data) {
            this.displayKIResults(response.data);
          } else {
            throw new Error('Keine Daten von KI erhalten');
          }
        } catch (error) {
          console.error('KI-Analyse Fehler:', error);
          this.showToast('KI-Analyse fehlgeschlagen: ' + error.message, 'error');
        } finally {
          btn.disabled = false;
          loading.style.display = 'none';
        }
      },

      displayKIResults(data) {
        const ergebnisBereich = document.getElementById('kiErgebnisBereich');
        const uebernehmenBtn = document.getElementById('kiUebernehmen');
        
        // Speichere Ergebnisse für spätere Übernahme
        this.kiErgebnisse = data;
        
        const termin = data.termin || {};
        
        // Kunde
        const kundeEl = document.getElementById('kiErgebnisKunde');
        kundeEl.textContent = termin.kunde?.name || '-';
        
        // Fahrzeug
        const fahrzeugEl = document.getElementById('kiErgebnisFahrzeug');
        const fahrzeugText = [];
        if (termin.fahrzeug?.marke) fahrzeugText.push(termin.fahrzeug.marke);
        if (termin.fahrzeug?.modell) fahrzeugText.push(termin.fahrzeug.modell);
        if (termin.fahrzeug?.kennzeichen) fahrzeugText.push(`(${termin.fahrzeug.kennzeichen})`);
        fahrzeugEl.textContent = fahrzeugText.length > 0 ? fahrzeugText.join(' ') : '-';
        
        // Datum
        const datumEl = document.getElementById('kiErgebnisDatum');
        if (termin.termin?.datum) {
          const d = new Date(termin.termin.datum);
          datumEl.textContent = d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        } else {
          datumEl.textContent = 'Nicht erkannt';
        }
        
        // Uhrzeit
        const uhrzeitEl = document.getElementById('kiErgebnisUhrzeit');
        uhrzeitEl.textContent = termin.termin?.uhrzeit || 'Nicht erkannt';
        
        // Arbeiten
        const arbeitenEl = document.getElementById('kiErgebnisArbeiten');
        arbeitenEl.innerHTML = '';
        if (termin.arbeiten && termin.arbeiten.length > 0) {
          termin.arbeiten.forEach(arbeit => {
            const tag = document.createElement('span');
            tag.className = 'arbeit-tag';
            tag.textContent = arbeit;
            arbeitenEl.appendChild(tag);
          });
        } else {
          arbeitenEl.textContent = 'Keine erkannt';
        }
        
        // Dauer
        const dauerEl = document.getElementById('kiErgebnisDauer');
        if (data.zeitschaetzung?.gesamtdauer) {
          const stunden = data.zeitschaetzung.gesamtdauer;
          const h = Math.floor(stunden);
          const m = Math.round((stunden - h) * 60);
          dauerEl.textContent = h > 0 ? `${h}h ${m}min` : `${m}min`;
        } else if (termin.termin?.dauer_stunden) {
          const stunden = termin.termin.dauer_stunden;
          const h = Math.floor(stunden);
          const m = Math.round((stunden - h) * 60);
          dauerEl.textContent = h > 0 ? `${h}h ${m}min` : `${m}min`;
        } else {
          dauerEl.textContent = '-';
        }
        
        // Teile
        const teileBereich = document.getElementById('kiTeileBereich');
        const teileEl = document.getElementById('kiErgebnisTeile');
        teileEl.innerHTML = '';
        if (data.teile?.teile && data.teile.teile.length > 0) {
          teileBereich.style.display = 'block';
          data.teile.teile.forEach(teil => {
            const tag = document.createElement('span');
            tag.className = 'teil-tag';
            tag.textContent = teil.name;
            teileEl.appendChild(tag);
          });
        } else {
          teileBereich.style.display = 'none';
        }
        
        // Fremdmarken-Warnung
        const fremdmarkenWarnung = document.getElementById('kiFremdmarkenWarnung');
        const fremdmarkenText = document.getElementById('kiFremdmarkenText');
        if (termin.fremdmarke) {
          fremdmarkenWarnung.style.display = 'flex';
          fremdmarkenText.textContent = termin.fremdmarke_warnung || 'Achtung: Fremdmarke erkannt!';
          document.getElementById('kiBestandskundeCheck').checked = false;
        } else {
          fremdmarkenWarnung.style.display = 'none';
        }
        
        // Confidence
        const confidence = termin.confidence || 0.5;
        const confidenceFill = document.getElementById('kiConfidenceFill');
        const confidenceValue = document.getElementById('kiConfidenceValue');
        confidenceFill.style.width = `${confidence * 100}%`;
        confidenceValue.textContent = `${Math.round(confidence * 100)}%`;
        
        // Anzeigen
        ergebnisBereich.style.display = 'block';
        uebernehmenBtn.style.display = 'inline-flex';
      },

      applyKIResults() {
        if (!this.kiErgebnisse) {
          this.showToast('Keine KI-Ergebnisse vorhanden.', 'warning');
          return;
        }
    
        const termin = this.kiErgebnisse.termin || {};
        
        // Fremdmarken-Prüfung
        if (termin.fremdmarke) {
          const bestandskundeCheck = document.getElementById('kiBestandskundeCheck');
          if (!bestandskundeCheck.checked) {
            this.showToast('Bitte bestätigen Sie, dass es sich um einen Bestandskunden handelt.', 'warning');
            return;
          }
        }
    
        // Kunde - versuche zu finden oder Name setzen
        if (termin.kunde?.name) {
          const nameInput = document.getElementById('terminNameSuche');
          if (nameInput) {
            nameInput.value = termin.kunde.name;
            // Trigger Suche
            nameInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
    
        // Datum
        if (termin.termin?.datum) {
          const datumInput = document.getElementById('datum');
          if (datumInput) {
            datumInput.value = termin.termin.datum;
            datumInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Update Kalender-Display
            const displayEl = document.getElementById('selectedDatumDisplay');
            if (displayEl) {
              const d = new Date(termin.termin.datum);
              displayEl.textContent = d.toLocaleDateString('de-DE', { 
                weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' 
              });
            }
          }
        }
    
        // Uhrzeit
        if (termin.termin?.uhrzeit) {
          const uhrzeitInput = document.getElementById('startzeit');
          if (uhrzeitInput) {
            uhrzeitInput.value = termin.termin.uhrzeit;
          }
        }
    
        // Arbeiten
        if (termin.arbeiten && termin.arbeiten.length > 0) {
          const arbeitInput = document.getElementById('arbeitEingabe');
          if (arbeitInput) {
            arbeitInput.value = termin.arbeiten.join(', ');
            // Zeitschätzung aktualisieren
            this.updateZeitschaetzung();
          }
        }
    
        // Beschreibung
        if (termin.beschreibung) {
          const beschreibungInput = document.getElementById('beschreibung');
          if (beschreibungInput) {
            beschreibungInput.value = termin.beschreibung;
          }
        }
    
        // Modal schließen
        this.closeKIAssistent();
        
        // Erfolg anzeigen
        this.showToast('KI-Daten in Formular übernommen!', 'success');
        
        // Scroll zum Formular
        document.getElementById('terminForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
      },

      handleKIAutoSuggest(e) {
        // Prüfe ob KI global aktiviert ist
        if (this.kiEnabled === false) {
          this.hideKIVorschlaege();
          return;
        }
        
        // Prüfe ob KI-Analyse per Checkbox aktiviert ist
        const kiCheckbox = document.getElementById('kiAnalyseAktiv');
        if (!kiCheckbox || !kiCheckbox.checked) {
          this.hideKIVorschlaege();
          return;
        }
        
        const text = e.target.value.trim();
        
        // Nur wenn sich der Text geändert hat und lang genug ist
        if (text === this.kiSuggestLastText || text.length < 10) {
          return;
        }
        
        // Prüfe zuerst ob es eine Wartungsanfrage mit km-Stand ist
        const wartungInfo = this.detectWartungMitKm(text);
        
        // Prüfe ob es wie eine Problembeschreibung aussieht (nicht nur Stichworte)
        const istProblemBeschreibung = this.lookLikeProblemDescription(text);
        if (!istProblemBeschreibung && !wartungInfo) {
          this.hideKIVorschlaege();
          return;
        }
        
        this.kiSuggestLastText = text;
        
        // Debounce: Warte 1.5 Sekunden nach dem letzten Tastendruck
        if (this.kiSuggestTimeout) {
          clearTimeout(this.kiSuggestTimeout);
        }
        
        this.kiSuggestTimeout = setTimeout(() => {
          if (wartungInfo) {
            // Wartungsplan abrufen
            this.fetchWartungsplan(wartungInfo.kmStand);
          } else {
            // Normale KI-Vorschläge
            this.fetchKIVorschlaege(text);
          }
        }, 1500);
      },

      lookLikeProblemDescription(text) {
        // Schlüsselwörter die auf Problembeschreibungen hindeuten
        const problemKeywords = [
          // Geräusche
          'quietscht', 'quietschen', 'macht geräusch', 'geräusche',
          'klappert', 'klapper', 'vibriert', 'vibration', 'ruckelt', 'ruckeln',
          'schleift', 'kratzt', 'pfeift', 'brummt', 'summt', 'knackt', 'knacken',
          // Fahrverhalten
          'zieht', 'bremst schlecht', 'bremse', 'bremsen',
          'springt nicht an', 'startet nicht', 'läuft nicht', 'funktioniert nicht',
          'geht nicht', 'macht nicht', 'tut nicht',
          // Anzeigen/Warnungen
          'leuchtet', 'lampe', 'licht', 'warnung', 'warnleuchte', 'anzeige', 'fehler',
          'kontrollleuchte', 'display', 'bordcomputer',
          // Flüssigkeiten
          'undicht', 'tropft', 'verliert', 'öl', 'wasser', 'kühlmittel',
          // Klima/Heizung
          'kühlt nicht', 'heizt nicht', 'klima', 'klimaanlage', 'heizung', 'lüftung',
          // Allgemein
          'problem', 'defekt', 'kaputt', 'prüfen', 'checken', 'schauen',
          'vorderachse', 'hinterachse', 'achse', 'fahrwerk', 'stoßdämpfer',
          'motor', 'getriebe', 'kupplung', 'auspuff',
          // Wartung/Service
          'wartung', 'inspektion', 'service', 'durchsicht'
        ];
        
        const lowerText = text.toLowerCase();
        return problemKeywords.some(keyword => lowerText.includes(keyword));
      },

      detectWartungMitKm(text) {
        const lowerText = text.toLowerCase();
        
        // Prüfe auf Wartungs-Keywords
        const wartungsKeywords = ['wartung', 'inspektion', 'service', 'durchsicht', 'check'];
        const hatWartung = wartungsKeywords.some(kw => lowerText.includes(kw));
        
        if (!hatWartung) return null;
        
        // Suche nach km-Stand (verschiedene Formate)
        // z.B. "45000km", "45.000 km", "45000 kilometer", "km-stand 45000", "bei 45000"
        const kmPatterns = [
          /(\d{1,3}(?:[.,]\d{3})*)\s*(?:km|kilometer)/i,
          /(?:km[\-\s]?stand|kilometerstand)[:\s]*(\d{1,3}(?:[.,]\d{3})*)/i,
          /(?:bei|aktuell|stand)[:\s]*(\d{4,6})(?:\s|$)/i
        ];
        
        for (const pattern of kmPatterns) {
          const match = text.match(pattern);
          if (match) {
            // Extrahiere und normalisiere km-Zahl
            let kmStr = match[1];
            // Entferne Tausendertrennzeichen
            kmStr = kmStr.replace(/[.,]/g, '');
            const km = parseInt(kmStr, 10);
            
            // Validiere: km sollte realistisch sein (1000-500000)
            if (km >= 1000 && km <= 500000) {
              return { kmStand: km };
            }
          }
        }
        
        return null;
      },

      async fetchWartungsplan(kmStand) {
        const bereich = document.getElementById('kiVorschlaegeBereich');
        const liste = document.getElementById('kiVorschlaegeListe');
        
        if (!bereich || !liste) return;
        
        // Zeige Loading
        bereich.style.display = 'block';
        liste.innerHTML = `
          <div class="ki-vorschlaege-loading">
            <div class="ki-spinner"></div>
            <span>Wartungsplan wird erstellt...</span>
          </div>
        `;
        
        try {
          // Fahrzeuginfo aus Formular holen
          const fahrzeugtyp = document.getElementById('fahrzeugtyp')?.value || 'Citroën';
          
          const response = await AIService.getWartungsplan(fahrzeugtyp, kmStand);
          
          if (response.success && response.data) {
            this.displayWartungsplan(response.data);
          } else {
            this.hideKIVorschlaege();
            this.showToast('Wartungsplan konnte nicht erstellt werden', 'error');
          }
        } catch (error) {
          console.error('Wartungsplan Fehler:', error);
          this.hideKIVorschlaege();
          this.showToast('Fehler beim Abrufen des Wartungsplans', 'error');
        }
      },

      displayWartungsplan(data) {
        const bereich = document.getElementById('kiVorschlaegeBereich');
        const liste = document.getElementById('kiVorschlaegeListe');
        
        if (!data) {
          this.hideKIVorschlaege();
          return;
        }
        
        liste.innerHTML = '';
        
        // Header mit km-Stand
        const header = document.createElement('div');
        header.className = 'ki-wartungsplan-header';
        header.innerHTML = `
          <span class="ki-wartungsplan-icon">🔧</span>
          <div>
            <strong>Wartungsplan</strong>
            <span class="ki-wartungsplan-info">${data.fahrzeug || 'Citroën'} • ${(data.kmStand || 0).toLocaleString('de-DE')} km</span>
          </div>
          ${data.service_empfehlung ? `<span class="ki-service-badge">${data.service_empfehlung}</span>` : ''}
        `;
        liste.appendChild(header);
        
        // Jetzt fällige Arbeiten
        if (data.jetzt_faellig && data.jetzt_faellig.length > 0) {
          const nowSection = document.createElement('div');
          nowSection.className = 'ki-wartung-section ki-wartung-jetzt';
          nowSection.innerHTML = '<div class="ki-wartung-section-title">⚠️ Jetzt fällig:</div>';
          
          data.jetzt_faellig.forEach(item => {
            const arbeitDiv = document.createElement('div');
            arbeitDiv.className = 'ki-wartung-item ki-wartung-item-jetzt';
            arbeitDiv.innerHTML = `
              <span class="ki-wartung-name">${item.arbeit}</span>
              <span class="ki-wartung-details">${item.dauer_stunden}h ${item.grund ? '• ' + item.grund : ''}</span>
              <span class="ki-wartung-add" title="Zur Arbeitsliste hinzufügen">+</span>
            `;
            
            arbeitDiv.querySelector('.ki-wartung-add').addEventListener('click', () => {
              this.addKIVorschlagToArbeiten(item.arbeit);
            });
            
            nowSection.appendChild(arbeitDiv);
          });
          
          liste.appendChild(nowSection);
        }
        
        // Bald fällige Arbeiten
        if (data.bald_faellig && data.bald_faellig.length > 0) {
          const soonSection = document.createElement('div');
          soonSection.className = 'ki-wartung-section ki-wartung-bald';
          soonSection.innerHTML = '<div class="ki-wartung-section-title">📅 Bald fällig:</div>';
          
          data.bald_faellig.forEach(item => {
            const arbeitDiv = document.createElement('div');
            arbeitDiv.className = 'ki-wartung-item ki-wartung-item-bald';
            arbeitDiv.innerHTML = `
              <span class="ki-wartung-name">${item.arbeit}</span>
              <span class="ki-wartung-details">bei ${(item.faellig_bei_km || 0).toLocaleString('de-DE')} km</span>
            `;
            soonSection.appendChild(arbeitDiv);
          });
          
          liste.appendChild(soonSection);
        }
        
        // Citroën-Hinweise
        if (data.citroen_hinweise && data.citroen_hinweise.length > 0) {
          const hinweisDiv = document.createElement('div');
          hinweisDiv.className = 'ki-wartung-hinweise';
          hinweisDiv.innerHTML = `
            <div class="ki-wartung-hinweise-title">💡 Citroën-Hinweise:</div>
            <ul>${data.citroen_hinweise.map(h => `<li>${h}</li>`).join('')}</ul>
          `;
          liste.appendChild(hinweisDiv);
        }
        
        // Footer mit Gesamtzeit
        if (data.geschaetzte_gesamtzeit) {
          const footer = document.createElement('div');
          footer.className = 'ki-wartung-footer';
          footer.innerHTML = `
            <span>⏱️ Geschätzte Gesamtzeit: <strong>${data.geschaetzte_gesamtzeit}h</strong></span>
            ${data.naechste_inspektion_km ? `<span>📍 Nächste Inspektion: ${data.naechste_inspektion_km.toLocaleString('de-DE')} km</span>` : ''}
          `;
          liste.appendChild(footer);
        }
        
        bereich.style.display = 'block';
      },

      async fetchKIVorschlaege(beschreibung) {
        const bereich = document.getElementById('kiVorschlaegeBereich');
        const liste = document.getElementById('kiVorschlaegeListe');
        
        if (!bereich || !liste) return;
        
        // Zeige Loading
        bereich.style.display = 'block';
        liste.innerHTML = `
          <div class="ki-vorschlaege-loading">
            <div class="ki-spinner"></div>
            <span>KI analysiert...</span>
          </div>
        `;
        
        try {
          // Fahrzeuginfo aus Formular holen
          const fahrzeugtyp = document.getElementById('fahrzeugtyp')?.value || '';
          
          const response = await AIService.suggestArbeiten(beschreibung, fahrzeugtyp);
          
          if (response.success && response.data?.arbeiten) {
            this.displayKIVorschlaege(response.data);
          } else {
            this.hideKIVorschlaege();
          }
        } catch (error) {
          console.error('KI-Vorschläge Fehler:', error);
          this.hideKIVorschlaege();
        }
      },

      displayKIVorschlaege(data) {
        const bereich = document.getElementById('kiVorschlaegeBereich');
        const liste = document.getElementById('kiVorschlaegeListe');
        
        if (!data.arbeiten || data.arbeiten.length === 0) {
          this.hideKIVorschlaege();
          return;
        }
        
        liste.innerHTML = '';
        
        data.arbeiten.forEach(arbeit => {
          const item = document.createElement('div');
          item.className = 'ki-vorschlag-item';
          item.innerHTML = `
            <span class="ki-vorschlag-icon">🔧</span>
            <div class="ki-vorschlag-text">
              <span class="ki-vorschlag-name">${arbeit.name}</span>
              <span class="ki-vorschlag-zeit">${arbeit.dauer_stunden}h - ${arbeit.kategorie || ''}</span>
            </div>
            <span class="ki-vorschlag-add">+</span>
          `;
          
          item.addEventListener('click', () => {
            this.addKIVorschlagToArbeiten(arbeit.name);
          });
          
          liste.appendChild(item);
        });
        
        // Empfehlung anzeigen
        if (data.empfehlung) {
          const empfehlung = document.createElement('div');
          empfehlung.style.cssText = 'padding: 10px; background: #e8f5e9; border-radius: 6px; margin-top: 8px; font-size: 0.85em; color: #2e7d32;';
          empfehlung.innerHTML = `💡 ${data.empfehlung}`;
          liste.appendChild(empfehlung);
        }
        
        bereich.style.display = 'block';
      },

      addKIVorschlagToArbeiten(arbeitName) {
        const textarea = document.getElementById('arbeitEingabe');
        if (!textarea) return;
        
        const currentValue = textarea.value.trim();
        const lines = currentValue.split('\n').map(l => l.trim()).filter(l => l);
        
        // Prüfe ob schon vorhanden
        if (!lines.includes(arbeitName)) {
          lines.push(arbeitName);
          textarea.value = lines.join('\n');
          
          // Zeitschätzung aktualisieren
          this.updateZeitschaetzung();
          
          this.showToast(`"${arbeitName}" hinzugefügt`, 'success');
        } else {
          this.showToast('Arbeit bereits vorhanden', 'info');
        }
      },

      hideKIVorschlaege() {
        const bereich = document.getElementById('kiVorschlaegeBereich');
        if (bereich) {
          bereich.style.display = 'none';
        }
      },

      async decodeVIN() {
        const vinInput = document.getElementById('vin');
        const vinInfoBereich = document.getElementById('vinInfoBereich');
        const vinDecodeBtn = document.getElementById('vinDecodeBtn');
        
        if (!vinInput || !vinInfoBereich) return;
        
        const vin = vinInput.value.trim().toUpperCase();
        
        // Validierung
        if (vin.length !== 17) {
          this.showToast('VIN muss 17 Zeichen haben', 'warning');
          return;
        }
        
        // Button deaktivieren während Laden
        if (vinDecodeBtn) {
          vinDecodeBtn.disabled = true;
          vinDecodeBtn.textContent = '⏳';
        }
        
        try {
          const response = await AIService.decodeVIN(vin);
          
          if (response.success) {
            this.displayVINInfo(response, vinInfoBereich);
          } else {
            vinInfoBereich.innerHTML = `
              <div style="color: #c62828; padding: 10px;">
                ❌ ${response.error || 'VIN konnte nicht dekodiert werden'}
              </div>
            `;
            vinInfoBereich.style.display = 'block';
          }
          
        } catch (error) {
          console.error('VIN-Decode Fehler:', error);
          vinInfoBereich.innerHTML = `
            <div style="color: #c62828; padding: 10px;">
              ❌ Fehler beim Dekodieren: ${error.message}
            </div>
          `;
          vinInfoBereich.style.display = 'block';
        } finally {
          if (vinDecodeBtn) {
            vinDecodeBtn.disabled = false;
            vinDecodeBtn.textContent = '🔍';
          }
        }
      },

      displayVINInfo(data, container) {
        const istCitroen = data.istCitroen;
        const markenBadge = istCitroen 
          ? '<span class="vin-citroen-badge">✓ Citroën</span>'
          : '<span class="vin-fremdmarke-badge">⚠ Fremdmarke</span>';
        
        let html = `
          <div class="vin-info-header">
            <span class="vin-marke">${istCitroen ? '🚗' : '🚙'}</span>
            <div>
              <span class="vin-fahrzeug">${data.hersteller} ${data.modell}</span>
              ${markenBadge}
              <span class="vin-baujahr">${data.generation || ''} ${data.baujahr ? '• ' + data.baujahr : ''}</span>
            </div>
          </div>
          
          <div class="vin-info-grid">
            <div class="vin-info-item">
              <span class="label">Motor</span>
              <span class="value">${data.motor?.typ || 'Unbekannt'} ${data.motor?.ps ? '(' + data.motor.ps + ' PS)' : ''}</span>
            </div>
            <div class="vin-info-item">
              <span class="label">Motorcode</span>
              <span class="value">${data.motor?.code || 'n/a'}</span>
            </div>
            <div class="vin-info-item">
              <span class="label">Getriebe</span>
              <span class="value">${data.getriebe || 'n/a'}</span>
            </div>
            <div class="vin-info-item">
              <span class="label">Werk</span>
              <span class="value">${data.werk || 'n/a'}</span>
            </div>
          </div>
        `;
        
        // Teile-Hinweise (Öl, Filter)
        if (data.teile && data.teile.hinweise && data.teile.hinweise.length > 0) {
          html += `
            <div class="vin-teile-hinweise">
              <div class="vin-teile-hinweise-title">📋 Teile-Info für dieses Fahrzeug:</div>
              <ul>
                ${data.teile.hinweise.map(h => `<li>${h}</li>`).join('')}
              </ul>
            </div>
          `;
        }
        
        // Warnungen (Stabi, Bremsen, etc.)
        if (data.teile && data.teile.warnungen && data.teile.warnungen.length > 0) {
          html += `
            <div class="vin-warnungen">
              <div class="vin-warnungen-title">⚠️ Beachten bei Teilebestellung:</div>
              ${data.teile.warnungen.map(w => `
                <div class="vin-warnung-item">
                  <span class="vin-warnung-teil">${w.teil}:</span>
                  <span class="vin-warnung-text">${w.warnung}</span>
                </div>
              `).join('')}
            </div>
          `;
        }
        
        // Motor-Hinweise
        if (data.motor && data.motor.hinweise && data.motor.hinweise.length > 0) {
          html += `
            <div style="margin-top: 10px; padding: 10px; background: #e3f2fd; border-radius: 6px; font-size: 0.85em;">
              <strong>💡 Motor-Hinweise:</strong>
              <ul style="margin: 5px 0 0 20px; padding: 0;">
                ${data.motor.hinweise.map(h => `<li>${h}</li>`).join('')}
              </ul>
            </div>
          `;
        }
        
        // Auto-Fill Button
        html += `
          <button type="button" class="vin-auto-fill-btn" onclick="app.autoFillFromVIN('${data.hersteller}', '${data.modell}', '${data.motor?.typ || ''}', ${data.baujahr || 0})">
            ✨ Fahrzeugtyp automatisch eintragen
          </button>
        `;
        
        // Fremdmarken-Warnung
        if (!istCitroen) {
          html += `
            <div style="margin-top: 10px; padding: 10px; background: #fff3e0; border-radius: 6px; border-left: 3px solid #ff9800; font-size: 0.85em;">
              <strong>⚠️ Fremdmarke erkannt!</strong><br>
              Als Citroën-Markenwerkstatt nehmen wir Fremdmarken nur von <strong>Bestandskunden</strong> an.
            </div>
          `;
        }
        
        container.innerHTML = html;
        container.style.display = 'block';
      },

      autoFillFromVIN(hersteller, modell, motor, baujahr) {
        const fahrzeugtypInput = document.getElementById('fahrzeugtyp');
        if (!fahrzeugtypInput) return;
        
        let fahrzeugtyp = `${hersteller} ${modell}`;
        if (motor && motor !== 'Unbekannt') {
          fahrzeugtyp += ` ${motor}`;
        }
        if (baujahr && baujahr > 0) {
          fahrzeugtyp += ` (${baujahr})`;
        }
        
        fahrzeugtypInput.value = fahrzeugtyp;
        this.showToast('Fahrzeugtyp eingetragen', 'success');
      },

      async checkArbeitDuplikate(arbeiten) {
        if (!Array.isArray(arbeiten) || arbeiten.length < 2) return;
        try {
          const result = await window.AIService.checkDuplikatArbeiten(arbeiten);
          if (result && result.duplikate && result.duplikate.length > 0) {
            const hinweis = result.duplikate.map(d => `"${d.a}" ≈ "${d.b}"`).join('\n');
            this.showToast(`⚠️ Mögliche Duplikat-Arbeiten erkannt:\n${hinweis}`, 'warning');
          }
        } catch (e) { /* silent */ }
      },

      async loadAutomationLog() {
        const liste = document.getElementById('automationLogListe');
        if (!liste) return;
        const limitEl = document.getElementById('autoLogLimit');
        const limit = limitEl ? parseInt(limitEl.value) : 20;
        liste.innerHTML = '<p class="hint">Wird geladen...</p>';
        try {
          const data = await window.AIService.getAutomationLog(limit);
          if (!data || !data.log || data.log.length === 0) {
            liste.innerHTML = '<p class="hint">Keine Einträge vorhanden.</p>';
            return;
          }
          liste.innerHTML = `<table class="automation-log-table">
            <thead><tr><th>Zeit</th><th>Typ</th><th>Beschreibung</th><th>Ergebnis</th></tr></thead>
            <tbody>${data.log.map(e => `<tr>
              <td style="white-space:nowrap;font-size:0.85em;">${new Date(e.erstellt_am).toLocaleString('de-DE')}</td>
              <td><span class="log-badge log-${e.typ}">${e.typ}</span></td>
              <td>${this._escapeHtml(e.beschreibung || '')}</td>
              <td style="font-size:0.85em;color:#666;">${this._escapeHtml(e.ergebnis || '')}</td>
            </tr>`).join('')}</tbody>
          </table>`;
        } catch (err) {
          liste.innerHTML = `<p class="hint" style="color:red;">Fehler: ${err.message}</p>`;
        }
      },

      async loadKiLernStatistiken() {
        const container = document.getElementById('kiLernStatistiken');
        if (!container) return;
        container.innerHTML = '<p class="hint">Wird geladen...</p>';
        try {
          const data = await window.AIService.getKiLernStatistiken();
          if (!data || data.gesamt_datenpunkte === 0) {
            container.innerHTML = '<p class="hint">Noch keine Lerndaten vorhanden. Schliessen Sie Termine mit tatsächlicher Zeit ab – die KI lernt automatisch.</p>';
            return;
          }
          const katRows = (data.kategorien || []).map(k => {
            const genauigkeit = Math.max(0, Math.min(100, k.schaetzgenauigkeit || 0));
            const farbe = genauigkeit >= 80 ? '#27ae60' : genauigkeit >= 60 ? '#e67e22' : '#e74c3c';
            return `<tr>
              <td><strong>${this._escapeHtml(k.kategorie || '–')}</strong></td>
              <td style="text-align:center;">${k.datenpunkte}</td>
              <td style="text-align:center;">${Math.round(k.avg_geschaetzt || 0)} min</td>
              <td style="text-align:center;">${Math.round(k.avg_tatsaechlich || 0)} min</td>
              <td style="text-align:center;color:${k.avg_abweichung_pct > 0 ? '#e74c3c' : '#27ae60'}">
                ${k.avg_abweichung_pct > 0 ? '+' : ''}${Math.round(k.avg_abweichung_pct || 0)}%
              </td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;">
                  <div style="flex:1;background:#eee;border-radius:4px;height:8px;">
                    <div style="width:${genauigkeit}%;background:${farbe};height:8px;border-radius:4px;"></div>
                  </div>
                  <span style="font-size:0.85em;color:${farbe};min-width:35px;">${genauigkeit}%</span>
                </div>
              </td>
            </tr>`;
          }).join('');
    
          container.innerHTML = `
            <div style="margin-bottom:12px;">
              <strong>📊 Gesamt: ${data.gesamt_datenpunkte} Lerndatenpunkte</strong>
              <span style="color:#666;font-size:0.85em;"> – aus abgeschlossenen Terminen</span>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:0.9em;margin-bottom:16px;">
              <thead>
                <tr style="background:#f5f5f5;text-align:left;">
                  <th style="padding:6px 8px;">Kategorie</th>
                  <th style="padding:6px 8px;text-align:center;">Datenpunkte</th>
                  <th style="padding:6px 8px;text-align:center;">Ø Geschätzt</th>
                  <th style="padding:6px 8px;text-align:center;">Ø Tatsächlich</th>
                  <th style="padding:6px 8px;text-align:center;">Ø Abweichung</th>
                  <th style="padding:6px 8px;min-width:120px;">Genauigkeit</th>
                </tr>
              </thead>
              <tbody>${katRows}</tbody>
            </table>
            <div style="border-top:1px solid #eee;padding-top:14px;">
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
                <strong>📋 Alle Lerndaten</strong>
                <input type="text" id="kiLernSuche" placeholder="Arbeit suchen..." style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;flex:1;min-width:140px;" oninput="app._kiLernDatenLaden()">
                <select id="kiLernKatFilter" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;" onchange="app._kiLernDatenLaden()">
                  <option value="">Alle Kategorien</option>
                </select>
                <button class="btn btn-secondary btn-sm" onclick="app._kiLernDatenLaden()">🔄</button>
              </div>
              <div id="kiLernDatenTabelle"><p class="hint">Lädt...</p></div>
            </div>
          `;
          // Daten laden
          await this._kiLernDatenLaden();
        } catch (err) {
          container.innerHTML = `<p class="hint" style="color:red;">Fehler: ${err.message}</p>`;
        }
      },

      async _kiLernDatenLaden(offset = 0) {
        const tabelle = document.getElementById('kiLernDatenTabelle');
        if (!tabelle) return;
        const arbeit = document.getElementById('kiLernSuche')?.value || '';
        const kat    = document.getElementById('kiLernKatFilter')?.value || '';
        tabelle.innerHTML = '<p class="hint">Lädt...</p>';
        try {
          const data = await window.AIService.getKiLernDaten({ arbeit, kategorie: kat, limit: 100, offset });
          // Kategorien-Dropdown befüllen (nur einmalig)
          const katSelect = document.getElementById('kiLernKatFilter');
          if (katSelect && data.kategorien && katSelect.options.length <= 1) {
            data.kategorien.forEach(k => {
              const o = document.createElement('option');
              o.value = k; o.textContent = k;
              if (k === kat) o.selected = true;
              katSelect.appendChild(o);
            });
          }
          if (!data.rows || data.rows.length === 0) {
            tabelle.innerHTML = '<p class="hint">Keine Einträge gefunden.</p>';
            return;
          }
          const rows = data.rows.map(r => {
            const abw = Math.round(r.abweichung_prozent || 0);
            const excBtnLabel = r.exclude ? '✅ Einschließen' : '❌ Ausschließen';
            const excBtnClr   = r.exclude ? '#27ae60' : '#e74c3c';
            const rowStyle    = r.exclude ? 'opacity:0.45;' : '';
            return `<tr style="${rowStyle}">
              <td style="padding:3px 6px;">${this._escapeHtml(r.arbeit)}</td>
              <td style="padding:3px 6px;color:#888;">${r.kategorie || '–'}</td>
              <td style="padding:3px 6px;text-align:center;">${r.geschaetzte_min} min</td>
              <td style="padding:3px 6px;text-align:center;">${r.tatsaechliche_min} min</td>
              <td style="padding:3px 6px;text-align:center;color:${abw > 0 ? '#e74c3c' : '#27ae60'};">
                ${abw > 0 ? '+' : ''}${abw}%
              </td>
              <td style="padding:3px 6px;color:#888;">${r.datum || ''}</td>
              <td style="padding:3px 6px;">
                <button style="font-size:0.75em;padding:2px 6px;border:1px solid ${excBtnClr};color:${excBtnClr};background:transparent;border-radius:3px;cursor:pointer;"
                  onclick="app._kiLernExclude(${r.id}, ${r.exclude ? 0 : 1})">${excBtnLabel}</button>
              </td>
            </tr>`;
          }).join('');
          const showingFrom = offset + 1;
          const showingTo   = offset + data.rows.length;
          tabelle.innerHTML = `
            <div style="font-size:0.85em;color:#666;margin-bottom:6px;">
              Zeige ${showingFrom}–${showingTo} von ${data.total} Einträgen
              ${data.total > 100 ? `
                <button class="btn btn-secondary btn-sm" style="margin-left:8px;" ${offset === 0 ? 'disabled' : ''}
                  onclick="app._kiLernDatenLaden(${Math.max(0, offset - 100)})">◀ Zurück</button>
                <button class="btn btn-secondary btn-sm" ${showingTo >= data.total ? 'disabled' : ''}
                  onclick="app._kiLernDatenLaden(${offset + 100})">Weiter ▶</button>
              ` : ''}
            </div>
            <div style="overflow-x:auto;">
              <table style="width:100%;border-collapse:collapse;font-size:0.85em;">
                <thead><tr style="background:#f5f5f5;">
                  <th style="padding:4px 6px;text-align:left;">Arbeit</th>
                  <th style="padding:4px 6px;text-align:left;">Kategorie</th>
                  <th style="padding:4px 6px;text-align:center;">Geschätzt</th>
                  <th style="padding:4px 6px;text-align:center;">Tatsächlich</th>
                  <th style="padding:4px 6px;text-align:center;">Abweichung</th>
                  <th style="padding:4px 6px;text-align:left;">Datum</th>
                  <th style="padding:4px 6px;"></th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`;
        } catch (err) {
          tabelle.innerHTML = `<p class="hint" style="color:red;">Fehler: ${err.message}</p>`;
        }
      },

      async _kiLernExclude(id, exclude) {
        try {
          await window.AIService.patchKiLernDatenExclude(id, exclude);
          await this._kiLernDatenLaden();
        } catch (err) {
          this.showToast('Fehler: ' + err.message, 'error');
        }
      },

      async loadAutomationSettings() {
        try {
          const settings = await window.EinstellungenService.getWerkstatt();
          if (!settings) return;
          const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.checked = !!(val === 1 || val === true || val === '1');
          };
          set('pufferMLEnabled', settings.dynamischer_puffer_enabled);
          set('slotNachfuellungEnabled', settings.slot_nachfuellung_enabled);
          set('duplikatErkennungEnabled', settings.duplikat_erkennung_enabled);
          set('autoSlotEnabled', settings.auto_slot_enabled);
          set('kiZeitlernEnabled', settings.ki_zeitlern_enabled !== undefined ? settings.ki_zeitlern_enabled : true);
          // Auto-Slot Button sichtbarkeit steuern
          const slotBtn = document.getElementById('btnFreienSlotFinden');
          if (slotBtn) slotBtn.style.display = (settings.auto_slot_enabled === 0 || settings.auto_slot_enabled === '0') ? 'none' : '';
        } catch (e) {
          console.warn('Automation-Einstellungen konnte nicht geladen werden:', e);
        }
      },

      async saveAutomationSettings() {
        const settings = {
          dynamischer_puffer_enabled: document.getElementById('pufferMLEnabled')?.checked ? 1 : 0,
          slot_nachfuellung_enabled: document.getElementById('slotNachfuellungEnabled')?.checked ? 1 : 0,
          duplikat_erkennung_enabled: document.getElementById('duplikatErkennungEnabled')?.checked ? 1 : 0,
          auto_slot_enabled: document.getElementById('autoSlotEnabled')?.checked ? 1 : 0,
          ki_zeitlern_enabled: document.getElementById('kiZeitlernEnabled')?.checked ? 1 : 0,
        };
        try {
          await window.EinstellungenService.updateWerkstatt(settings);
          // Auto-Slot Button sichtbarkeit direkt aktualisieren
          const slotBtn = document.getElementById('btnFreienSlotFinden');
          if (slotBtn) slotBtn.style.display = settings.auto_slot_enabled ? '' : 'none';
          this.showToast('Automatisierungs-Einstellungen gespeichert', 'success');
        } catch (err) {
          this.showToast('Fehler beim Speichern: ' + err.message, 'error');
        }
      }
  });
}
