export function installKiPlanningFeature(AppClass) {
  AppClass.prototype.requestKITagesplanung = async function() {
  // Prüfe ob KI global aktiviert ist
  if (this.kiEnabled === false) {
    this.showToast('🔌 KI-Funktionen sind deaktiviert. Aktivieren Sie diese unter Einstellungen → KI / API', 'warning');
    return;
  }
  if (!this.smartSchedulingEnabled) {
    this.showToast('🧭 Smart Scheduling ist deaktiviert. Bitte in den Einstellungen aktivieren.', 'warning');
    return;
  }
  
  const datumInput = document.getElementById('auslastungDragDropDatum');
  if (!datumInput || !datumInput.value) {
    alert('Bitte wählen Sie zuerst ein Datum aus.');
    return;
  }
  
  const datum = datumInput.value;
  this.showKIPlanungModal('tages', datum);
  
  try {
    const result = await KIPlanungService.getTagesvorschlag(datum);
    if (result.async && result.jobId) {
      this._pollKIPlanungJob(result.jobId, 'tages', datum);
    } else if (result.success && result.vorschlag) {
      this.displayKITagesvorschlag(result.vorschlag, datum);
    } else {
      this.showKIPlanungError(result.error || 'Unbekannter Fehler');
    }
  } catch (error) {
    console.error('KI-Tagesplanung Fehler:', error);
    this.showKIPlanungError(error.message || 'Verbindungsfehler zum Server');
  }
}

/**
 * KI-Wochenplanungsvorschlag anfordern (schwebende Termine verteilen)
 */;

  AppClass.prototype.requestKIWochenplanung = async function() {
  // Prüfe ob KI global aktiviert ist
  if (this.kiEnabled === false) {
    this.showToast('🔌 KI-Funktionen sind deaktiviert. Aktivieren Sie diese unter Einstellungen → KI / API', 'warning');
    return;
  }
  if (!this.smartSchedulingEnabled) {
    this.showToast('🧭 Smart Scheduling ist deaktiviert. Bitte in den Einstellungen aktivieren.', 'warning');
    return;
  }
  
  const datumInput = document.getElementById('auslastungDragDropDatum');
  if (!datumInput || !datumInput.value) {
    alert('Bitte wählen Sie zuerst ein Datum aus.');
    return;
  }
  
  const datum = datumInput.value;
  this.showKIPlanungModal('wochen', datum);
  
  try {
    const result = await KIPlanungService.getWochenvorschlag(datum);
    if (result.async && result.jobId) {
      this._pollKIPlanungJob(result.jobId, 'wochen', datum);
    } else if (result.success && result.vorschlag) {
      this.displayKIWochenvorschlag(result.vorschlag, result.wochentage);
    } else {
      this.showKIPlanungError(result.error || 'Unbekannter Fehler');
    }
  } catch (error) {
    console.error('KI-Wochenplanung Fehler:', error);
    this.showKIPlanungError(error.message || 'Verbindungsfehler zum Server');
  }
}

/**
 * Ollama-Job pollen bis fertig (alle 3 Sekunden)
 */;

  AppClass.prototype._pollKIPlanungJob = async function(jobId, type, datum, attempt = 0) {
  if (attempt > 40) { // max ~2 Minuten
    this.showKIPlanungError('Timeout: Ollama hat zu lange gebraucht. Bitte erneut versuchen.');
    return;
  }
  // Fortschrittstext aktualisieren
  const loading = document.getElementById('kiPlanungLoading');
  if (loading) {
    const sek = attempt * 3;
    const dots = '.'.repeat((attempt % 3) + 1);
    const span = loading.querySelector('span') || loading;
    span.textContent = `🦙 Ollama denkt${dots} (${sek}s) – läuft im Hintergrund`;
  }
  await new Promise(r => setTimeout(r, 3000));
  try {
    const res = await KIPlanungService.getJobStatus(jobId);
    if (res.status === 'pending') {
      this._pollKIPlanungJob(jobId, type, datum, attempt + 1);
    } else if (res.status === 'done' && res.vorschlag) {
      if (type === 'tages') this.displayKITagesvorschlag(res.vorschlag, datum);
      else this.displayKIWochenvorschlag(res.vorschlag, res.wochentage);
    } else {
      this.showKIPlanungError(res.error || 'Fehler bei der KI-Verarbeitung');
    }
  } catch (err) {
    this.showKIPlanungError(err.message || 'Verbindungsfehler beim Abrufen des Ergebnisses');
  }
}

/**
 * KI-Modal anzeigen mit Ladeindikator
 */;

  AppClass.prototype.showKIPlanungModal = function(type, datum) {
  const modal = document.getElementById('kiPlanungModal');
  const title = document.getElementById('kiModalTitle');
  const loading = document.getElementById('kiPlanungLoading');
  const error = document.getElementById('kiPlanungError');
  const content = document.getElementById('kiPlanungContent');
  const footer = document.getElementById('kiModalFooter');
  
  // Titel setzen
  if (type === 'wochen') {
    title.textContent = '🤖 KI-Wochenverteilung';
  } else {
    const datumFormatiert = new Date(datum).toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: '2-digit'
    });
    title.textContent = `🤖 KI-Tagesplanung für ${datumFormatiert}`;
  }
  
  // Reset
  loading.style.display = 'flex';
  error.style.display = 'none';
  content.style.display = 'none';
  footer.style.display = 'none';
  
  // Speichere aktuellen Typ und Datum
  this._kiPlanungType = type;
  this._kiPlanungDatum = datum;
  this._kiVorschlaege = null;
  
  modal.style.display = 'flex';
}

/**
 * KI-Modal schließen
 */;

  AppClass.prototype.closeKIPlanungModal = function() {
  const modal = document.getElementById('kiPlanungModal');
  modal.style.display = 'none';
  this._kiVorschlaege = null;
}

/**
 * Fehler im KI-Modal anzeigen
 */;

  AppClass.prototype.showKIPlanungError = function(message) {
  const loading = document.getElementById('kiPlanungLoading');
  const error = document.getElementById('kiPlanungError');
  const errorText = document.getElementById('kiPlanungErrorText');
  
  loading.style.display = 'none';
  error.style.display = 'flex';
  errorText.textContent = message;
}

/**
 * KI-Tagesvorschlag anzeigen
 */;

  AppClass.prototype.displayKITagesvorschlag = function(vorschlag, datum) {
  const loading = document.getElementById('kiPlanungLoading');
  const content = document.getElementById('kiPlanungContent');
  const footer = document.getElementById('kiModalFooter');
  
  loading.style.display = 'none';
  content.style.display = 'block';
  
  // Speichere Vorschläge für spätere Übernahme
  this._kiVorschlaege = vorschlag;
  
  // Zusammenfassung
  document.getElementById('kiZusammenfassung').textContent = 
    vorschlag.zusammenfassung || 'Keine Zusammenfassung verfügbar.';
  
  // Kapazitätsanalyse
  const kapazitaetDiv = document.getElementById('kiKapazitaet');
  if (vorschlag.kapazitaetsAnalyse) {
    const ka = vorschlag.kapazitaetsAnalyse;
    kapazitaetDiv.innerHTML = `
      <div class="ki-capacity-item">
        <span class="label">Gesamt:</span>
        <span class="value">${ka.gesamtKapazitaet || '-'}</span>
      </div>
      <div class="ki-capacity-item">
        <span class="label">Belegt:</span>
        <span class="value">${ka.genutzt || '-'}</span>
      </div>
      <div class="ki-capacity-item highlight">
        <span class="label">Frei:</span>
        <span class="value">${ka.frei || '-'}</span>
      </div>
    `;
  } else {
    kapazitaetDiv.innerHTML = '<p class="muted">Keine Kapazitätsdaten</p>';
  }
  
  // Warnungen
  const warnungenSection = document.getElementById('kiWarnungenSection');
  const warnungenList = document.getElementById('kiWarnungen');
  if (vorschlag.warnungen && vorschlag.warnungen.length > 0) {
    warnungenSection.style.display = 'block';
    warnungenList.innerHTML = vorschlag.warnungen.map(w => `<li>${w}</li>`).join('');
  } else {
    warnungenSection.style.display = 'none';
  }
  
  // Tages-Zuordnungen
  const tagesSection = document.getElementById('kiTagesSection');
  const tagesDiv = document.getElementById('kiTagesZuordnungen');
  if (vorschlag.tagesZuordnungen && vorschlag.tagesZuordnungen.length > 0) {
    tagesSection.style.display = 'block';
    tagesDiv.innerHTML = vorschlag.tagesZuordnungen.map(z => this.renderKIZuordnung(z, 'tages')).join('');
    footer.style.display = 'flex';
  } else {
    tagesSection.style.display = 'none';
  }
  
  // Schwebende Termine Vorschläge
  const schwebendeSection = document.getElementById('kiSchwebendeSection');
  const schwebendeDiv = document.getElementById('kiSchwebendeVorschlaege');
  if (vorschlag.schwebendeVorschlaege && vorschlag.schwebendeVorschlaege.length > 0) {
    schwebendeSection.style.display = 'block';
    schwebendeDiv.innerHTML = vorschlag.schwebendeVorschlaege.map(v => this.renderKISchwebendVorschlag(v)).join('');
    footer.style.display = 'flex';
  } else {
    schwebendeSection.style.display = 'none';
  }

  // Nicht platzierte Termine
  const nichtPlatziertSection = document.getElementById('kiNichtPlatziertSection');
  const nichtPlatziertDiv = document.getElementById('kiNichtPlatziert');
  if (nichtPlatziertSection && nichtPlatziertDiv) {
    if (vorschlag.nichtPlatziertTermine && vorschlag.nichtPlatziertTermine.length > 0) {
      nichtPlatziertSection.style.display = 'block';
      const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      nichtPlatziertDiv.innerHTML = vorschlag.nichtPlatziertTermine.map(t => `
        <div class="ki-suggestion-item invalid" style="margin-bottom:6px;padding:8px 12px;">
          <strong>#${t.terminId}: ${esc(t.terminInfo)}</strong>
          <div style="color:#999;font-size:12px;margin-top:2px;">
            ${t.dauerMin} Min – ${esc(t.grund)}
          </div>
        </div>
      `).join('');
    } else {
      nichtPlatziertSection.style.display = 'none';
    }
  }

  // Wochen-Section verstecken
  document.getElementById('kiWochenSection').style.display = 'none';
  
  // Footer nur zeigen wenn es Vorschläge gibt
  const hatVorschlaege = (vorschlag.tagesZuordnungen?.length > 0) || 
                        (vorschlag.schwebendeVorschlaege?.length > 0);
  footer.style.display = hatVorschlaege ? 'flex' : 'none';
}

/**
 * KI-Wochenvorschlag anzeigen
 */

  AppClass.prototype.displayKIWochenvorschlag = function(vorschlag, wochentage) {
  const loading = document.getElementById('kiPlanungLoading');
  const content = document.getElementById('kiPlanungContent');
  const footer = document.getElementById('kiModalFooter');
  
  loading.style.display = 'none';
  content.style.display = 'block';
  
  this._kiVorschlaege = vorschlag;
  this._kiWochentage = wochentage;
  
  // Zusammenfassung
  document.getElementById('kiZusammenfassung').textContent = 
    vorschlag.zusammenfassung || 'Keine Zusammenfassung verfügbar.';
  
  // Kapazität verstecken für Wochenansicht
  document.getElementById('kiKapazitaet').innerHTML = '';
  
  // Warnungen
  const warnungenSection = document.getElementById('kiWarnungenSection');
  const warnungenList = document.getElementById('kiWarnungen');
  if (vorschlag.warnungen && vorschlag.warnungen.length > 0) {
    warnungenSection.style.display = 'block';
    warnungenList.innerHTML = vorschlag.warnungen.map(w => `<li>${w}</li>`).join('');
  } else {
    warnungenSection.style.display = 'none';
  }
  
  // Tages- und Schwebend-Sections verstecken
  document.getElementById('kiTagesSection').style.display = 'none';
  document.getElementById('kiSchwebendeSection').style.display = 'none';
  const npSection = document.getElementById('kiNichtPlatziertSection');
  if (npSection) npSection.style.display = 'none';
  
  // Wochen-Section anzeigen
  const wochenSection = document.getElementById('kiWochenSection');
  const wochenAuslastung = document.getElementById('kiWochenAuslastung');
  const wochenVerteilung = document.getElementById('kiWochenVerteilung');
  
  wochenSection.style.display = 'block';
  
  // Wochenauslastung als Balken
  if (vorschlag.wochenAuslastung) {
    const tage = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag'];
    const tageLabel = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
    
    wochenAuslastung.innerHTML = tage.map((tag, i) => {
      const prozent = parseInt(vorschlag.wochenAuslastung[tag]) || 0;
      const farbe = prozent > 90 ? '#e74c3c' : prozent > 70 ? '#f39c12' : '#27ae60';
      return `
        <div class="ki-week-day">
          <span class="day-label">${tageLabel[i]}</span>
          <div class="day-bar">
            <div class="day-fill" style="width: ${Math.min(prozent, 100)}%; background: ${farbe};"></div>
          </div>
          <span class="day-percent">${prozent}%</span>
        </div>
      `;
    }).join('');
  }
  
  // Verteilungsvorschläge
  if (vorschlag.verteilung && vorschlag.verteilung.length > 0) {
    wochenVerteilung.innerHTML = vorschlag.verteilung.map(v => this.renderKIWochenVerteilung(v)).join('');
    footer.style.display = 'flex';
  } else {
    wochenVerteilung.innerHTML = '<p class="muted">Keine Verteilungsvorschläge</p>';
    footer.style.display = 'none';
  }
}

/**
 * Einzelne KI-Zuordnung rendern
 */;

  AppClass.prototype.renderKIZuordnung = function(zuordnung, type) {
  const statusClass = zuordnung.gueltig ? 'valid' : 'invalid';
  const personIcon = zuordnung.mitarbeiterTyp === 'lehrling' ? '🎓' : '👷';
  
  return `
    <div class="ki-suggestion-item ${statusClass}" data-termin-id="${zuordnung.terminId}" id="ki-item-${type}-${zuordnung.terminId}">
      <div class="ki-suggestion-header">
        <label class="ki-suggestion-checkbox">
          <input type="checkbox" checked data-type="${type}" data-termin-id="${zuordnung.terminId}">
        </label>
        <span class="ki-suggestion-termin">#${zuordnung.terminId}: ${zuordnung.terminInfo || 'Termin'}</span>
        <div class="ki-suggestion-actions">
          <button class="btn btn-xs btn-success" onclick="app.uebernehmeEinzelnenVorschlag('${type}', ${zuordnung.terminId})" title="Diesen Vorschlag sofort übernehmen">
            ✓
          </button>
          <button class="btn btn-xs btn-danger" onclick="app.verwerfenEinzelnenVorschlag('${type}', ${zuordnung.terminId})" title="Diesen Vorschlag verwerfen">
            ✗
          </button>
        </div>
      </div>
      <div class="ki-suggestion-details">
        <span class="ki-suggestion-person">${personIcon} ${zuordnung.personName || 'Unbekannt'}</span>
        <span class="ki-suggestion-time">⏰ ${zuordnung.startzeit || '-'}</span>
      </div>
      <div class="ki-suggestion-reason">
        💡 ${zuordnung.begruendung || 'Keine Begründung'}
      </div>
    </div>
  `;
}

/**
 * Schwebender Termin Vorschlag rendern
 */;

  AppClass.prototype.renderKISchwebendVorschlag = function(vorschlag) {
  const statusClass = vorschlag.gueltig ? 'valid' : 'invalid';
  const personIcon = vorschlag.mitarbeiterTyp === 'lehrling' ? '🎓' : '👷';
  const empfehlungBadge = vorschlag.empfehlung === 'heute_einplanen' 
    ? '<span class="badge badge-success">Heute einplanen</span>'
    : '<span class="badge badge-info">Später</span>';
  
  return `
    <div class="ki-suggestion-item schwebend ${statusClass}" data-termin-id="${vorschlag.terminId}" id="ki-item-schwebend-${vorschlag.terminId}">
      <div class="ki-suggestion-header">
        <label class="ki-suggestion-checkbox">
          <input type="checkbox" ${vorschlag.empfehlung === 'heute_einplanen' ? 'checked' : ''} 
                 data-type="schwebend" data-termin-id="${vorschlag.terminId}">
        </label>
        <span class="ki-suggestion-termin">⏸️ #${vorschlag.terminId}: ${vorschlag.terminInfo || 'Termin'}</span>
        ${empfehlungBadge}
        <div class="ki-suggestion-actions">
          <button class="btn btn-xs btn-success" onclick="app.uebernehmeEinzelnenVorschlag('schwebend', ${vorschlag.terminId})" title="Diesen Vorschlag sofort übernehmen">
            ✓
          </button>
          <button class="btn btn-xs btn-danger" onclick="app.verwerfenEinzelnenVorschlag('schwebend', ${vorschlag.terminId})" title="Diesen Vorschlag verwerfen">
            ✗
          </button>
        </div>
      </div>
      <div class="ki-suggestion-details">
        <span class="ki-suggestion-person">${personIcon} ${vorschlag.personName || 'Unbekannt'}</span>
        <span class="ki-suggestion-time">⏰ ${vorschlag.startzeit || '-'}</span>
      </div>
      <div class="ki-suggestion-reason">
        💡 ${vorschlag.begruendung || 'Keine Begründung'}
      </div>
    </div>
  `;
}

/**
 * Wochen-Verteilungsvorschlag rendern
 */;

  AppClass.prototype.renderKIWochenVerteilung = function(verteilung) {
  const statusClass = verteilung.gueltig ? 'valid' : 'invalid';
  const datumFormatiert = verteilung.empfohlenesDatum 
    ? new Date(verteilung.empfohlenesDatum).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
    : '-';
  
  return `
    <div class="ki-suggestion-item wochen ${statusClass}" data-termin-id="${verteilung.terminId}" id="ki-item-wochen-${verteilung.terminId}">
      <div class="ki-suggestion-header">
        <label class="ki-suggestion-checkbox">
          <input type="checkbox" checked data-type="wochen" data-termin-id="${verteilung.terminId}" 
                 data-datum="${verteilung.empfohlenesDatum}">
        </label>
        <span class="ki-suggestion-termin">⏸️ #${verteilung.terminId}: ${verteilung.terminInfo || 'Termin'}</span>
        <span class="badge badge-primary">📅 ${datumFormatiert}</span>
        <div class="ki-suggestion-actions">
          <button class="btn btn-xs btn-success" onclick="app.uebernehmeEinzelnenVorschlag('wochen', ${verteilung.terminId}, '${verteilung.empfohlenesDatum}')" title="Diesen Vorschlag sofort übernehmen">
            ✓
          </button>
          <button class="btn btn-xs btn-danger" onclick="app.verwerfenEinzelnenVorschlag('wochen', ${verteilung.terminId})" title="Diesen Vorschlag verwerfen">
            ✗
          </button>
        </div>
      </div>
      <div class="ki-suggestion-reason">
        💡 ${verteilung.begruendung || 'Keine Begründung'}
      </div>
    </div>
  `;
}

/**
 * Alle/Keine Checkboxen auswählen
 */;

  AppClass.prototype.kiSelectAll = function(select) {
  const checkboxes = document.querySelectorAll('#kiPlanungContent input[type="checkbox"]');
  checkboxes.forEach(cb => cb.checked = select);
  this.updateKIUebernehmenButton();
}

/**
 * Übernehmen-Button Text aktualisieren
 */;

  AppClass.prototype.updateKIUebernehmenButton = function() {
  const checkboxes = document.querySelectorAll('#kiPlanungContent input[type="checkbox"]:checked');
  const btn = document.getElementById('kiAlleUebernehmenBtn');
  if (btn) {
    const count = checkboxes.length;
    btn.textContent = count > 0 ? `✅ ${count} Vorschlag${count > 1 ? 'e' : ''} übernehmen` : '✅ Keine ausgewählt';
    btn.disabled = count === 0;
  }
}

/**
 * Einzelnen Vorschlag sofort übernehmen
 */;

  AppClass.prototype.uebernehmeEinzelnenVorschlag = async function(type, terminId, datum = null) {
  const item = document.getElementById(`ki-item-${type}-${terminId}`);
  if (item) {
    item.classList.add('ki-processing');
  }
  
  try {
    if (type === 'tages') {
      const zuordnung = this._kiVorschlaege.tagesZuordnungen?.find(z => z.terminId === terminId);
      if (zuordnung) {
        await this.uebernehmeKIZuordnung(zuordnung);
      }
    } else if (type === 'schwebend') {
      const vorschlag = this._kiVorschlaege.schwebendeVorschlaege?.find(v => v.terminId === terminId);
      if (vorschlag) {
        await this.uebernehmeSchwebendVorschlag(vorschlag, this._kiPlanungDatum);
      }
    } else if (type === 'wochen') {
      const verteilung = this._kiVorschlaege.verteilung?.find(v => v.terminId === terminId);
      if (verteilung && datum) {
        await this.uebernehmeWochenVerteilung(verteilung, datum);
      }
    }
    
    // Erfolgreich - Item als übernommen markieren
    if (item) {
      item.classList.remove('ki-processing');
      item.classList.add('ki-accepted');
      item.innerHTML = `
        <div class="ki-suggestion-accepted">
          ✅ Vorschlag #${terminId} übernommen
        </div>
      `;
    }
    
    this.showToast(`Vorschlag #${terminId} übernommen`, 'success');
    
    // Planungsansicht im Hintergrund aktualisieren
    this.loadAuslastungDragDrop();
    
  } catch (error) {
    console.error('Fehler beim Übernehmen:', error);
    if (item) {
      item.classList.remove('ki-processing');
      item.classList.add('ki-error');
    }
    this.showToast(`Fehler: ${error.message}`, 'error');
  }
}

/**
 * Einzelnen Vorschlag verwerfen (aus Liste entfernen)
 */;

  AppClass.prototype.verwerfenEinzelnenVorschlag = function(type, terminId) {
  const item = document.getElementById(`ki-item-${type}-${terminId}`);
  if (item) {
    item.classList.add('ki-rejected');
    setTimeout(() => {
      item.remove();
      this.updateKIUebernehmenButton();
      
      // Prüfen ob noch Vorschläge übrig sind
      const verbleibend = document.querySelectorAll('.ki-suggestion-item:not(.ki-accepted):not(.ki-rejected)');
      if (verbleibend.length === 0) {
        document.getElementById('kiModalFooter').style.display = 'none';
      }
    }, 300);
  }
}

/**
 * Alle ausgewählten KI-Vorschläge übernehmen
 */;

  AppClass.prototype.uebernehmeAlleKIVorschlaege = async function() {
  if (!this._kiVorschlaege) {
    this.showToast('Keine Vorschläge zum Übernehmen', 'warning');
    return;
  }
  
  const checkboxes = document.querySelectorAll('#kiPlanungContent input[type="checkbox"]:checked');
  
  if (checkboxes.length === 0) {
    this.showToast('Keine Vorschläge ausgewählt', 'warning');
    return;
  }
  
  const btn = document.getElementById('kiAlleUebernehmenBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Wird übernommen...';
  
  let erfolg = 0;
  let fehler = 0;
  
  for (const checkbox of checkboxes) {
    const type = checkbox.dataset.type;
    const terminId = parseInt(checkbox.dataset.terminId);
    
    try {
      if (type === 'tages') {
        // Tages-Zuordnung übernehmen
        const zuordnung = this._kiVorschlaege.tagesZuordnungen?.find(z => z.terminId === terminId);
        if (zuordnung) {
          await this.uebernehmeKIZuordnung(zuordnung);
          erfolg++;
        }
      } else if (type === 'schwebend') {
        // Schwebenden Termin für heute einplanen
        const vorschlag = this._kiVorschlaege.schwebendeVorschlaege?.find(v => v.terminId === terminId);
        if (vorschlag && vorschlag.empfehlung === 'heute_einplanen') {
          await this.uebernehmeSchwebendVorschlag(vorschlag, this._kiPlanungDatum);
          erfolg++;
        }
      } else if (type === 'wochen') {
        // Wochen-Verteilung übernehmen
        const datum = checkbox.dataset.datum;
        const verteilung = this._kiVorschlaege.verteilung?.find(v => v.terminId === terminId);
        if (verteilung && datum) {
          await this.uebernehmeWochenVerteilung(verteilung, datum);
          erfolg++;
        }
      }
    } catch (error) {
      console.error(`Fehler bei Termin ${terminId}:`, error);
      fehler++;
    }
  }
  
  btn.disabled = false;
  btn.textContent = '✅ Alle Vorschläge übernehmen';
  
  this.closeKIPlanungModal();
  
  // Planungsansicht neu laden
  this.loadAuslastungDragDrop();
  
  // Feedback
  if (fehler === 0) {
    this.showToast(`✅ ${erfolg} Vorschläge erfolgreich übernommen`, 'success');
  } else {
    this.showToast(`${erfolg} übernommen, ${fehler} Fehler`, 'warning');
  }
}

/**
 * Einzelne KI-Zuordnung übernehmen (Tagesplanung)
 */;

  AppClass.prototype.uebernehmeKIZuordnung = async function(zuordnung) {
  const termin = this.termineById[zuordnung.terminId];
  if (!termin) {
    throw new Error('Termin nicht gefunden');
  }
  
  // arbeitszeiten_details aktualisieren
  let details = {};
  if (termin.arbeitszeiten_details) {
    try {
      details = typeof termin.arbeitszeiten_details === 'string'
        ? JSON.parse(termin.arbeitszeiten_details)
        : termin.arbeitszeiten_details;
    } catch (e) {
      details = {};
    }
  }
  
  // Gesamt-Zuordnung setzen
  details._gesamt_mitarbeiter_id = {
    id: zuordnung.mitarbeiterId,
    type: zuordnung.mitarbeiterTyp || 'mitarbeiter'
  };
  
  if (zuordnung.startzeit) {
    details._startzeit = zuordnung.startzeit;
  }
  
  // Update-Payload
  const updateData = {
    arbeitszeiten_details: JSON.stringify(details)
  };
  
  // Mitarbeiter-ID auch auf Termin-Ebene setzen (für Kompatibilität)
  if (zuordnung.mitarbeiterTyp === 'mitarbeiter') {
    updateData.mitarbeiter_id = zuordnung.mitarbeiterId;
  }
  
  await TermineService.update(zuordnung.terminId, updateData);
}

/**
 * Schwebenden Termin für ein Datum einplanen
 */;

  AppClass.prototype.uebernehmeSchwebendVorschlag = async function(vorschlag, datum) {
  let details = {};
  
  const termin = await TermineService.getById(vorschlag.terminId);
  if (termin && termin.arbeitszeiten_details) {
    try {
      details = typeof termin.arbeitszeiten_details === 'string'
        ? JSON.parse(termin.arbeitszeiten_details)
        : termin.arbeitszeiten_details;
    } catch (e) {
      details = {};
    }
  }
  
  // Zuordnung setzen
  details._gesamt_mitarbeiter_id = {
    id: vorschlag.mitarbeiterId,
    type: vorschlag.mitarbeiterTyp || 'mitarbeiter'
  };
  
  if (vorschlag.startzeit) {
    details._startzeit = vorschlag.startzeit;
  }
  
  const updateData = {
    datum: datum,
    ist_schwebend: 0, // Nicht mehr schwebend
    arbeitszeiten_details: JSON.stringify(details)
  };
  
  if (vorschlag.mitarbeiterTyp === 'mitarbeiter') {
    updateData.mitarbeiter_id = vorschlag.mitarbeiterId;
  }
  
  await TermineService.update(vorschlag.terminId, updateData);
}

/**
 * Wochen-Verteilung übernehmen (Datum für schwebenden Termin setzen)
 */;

  AppClass.prototype.uebernehmeWochenVerteilung = async function(verteilung, datum) {
  await TermineService.update(verteilung.terminId, {
    datum: datum,
    ist_schwebend: 0
  });
}

// ================================================
// INTERN TAB - Team Arbeitsübersicht
// ================================================

/**
 * Initialisiert den Intern-Tab
 */

/**
 * Schaltet den Tablet-Modus ein/aus
 */

/**
 * Lädt die komplette Team-Übersicht (alle Mitarbeiter + Lehrlinge)
 */

/**
 * Prüft ob ein Termin einer Person zugeordnet ist
 * Berücksichtigt sowohl direkte ID als auch arbeitszeiten_details
 */

















/**
 * Rendert eine Kachel für einen Mitarbeiter oder Lehrling
 * @param {Object} person - Mitarbeiter oder Lehrling
 * @param {Array} alleTermine - Alle Termine für heute
 * @param {string} typ - 'mitarbeiter' oder 'lehrling'
 * @param {Object} kontext - Berechnungskontext mit globaleNebenzeitProzent, mitarbeiter, lehrlinge
 */

/**
 * Öffnet Pause-Modal und startet Arbeitspause nach Grundauswahl
 */

/**
 * Beendet aktive Arbeitspause für einen Termin
 */






/**
 * Berechnet den Fortschritt basierend auf der verstrichenen Zeit
 */

/**
 * Berechnet die verbleibende Zeit
 */

/**
 * Ermittelt die effektive Arbeitszeit eines Termins
 * Priorität: arbeitszeiten_details > geschaetzte_zeit > 60 Min (Fallback)
 */

/**
 * Ermittelt die effektive Arbeitszeit eines Termins MIT Nebenzeit und Aufgabenbewältigung
 * Wird für die Intern-Ansicht verwendet, wo die Person bekannt ist
 * @param {Object} termin - Der Termin
 * @param {Object} person - Mitarbeiter oder Lehrling
 * @param {boolean} isLehrling - Ob es ein Lehrling ist
 * @param {Object} kontext - Berechnungskontext mit globaleNebenzeitProzent
 */

/**
 * Liest die effektive Startzeit eines Termins:
 * Bevorzugt arbeitszeiten_details._startzeit (geplante Einsatzzeit),
 * fällt auf termin.startzeit bzw. bring_zeit zurück.
 */

/**
 * Berechnet die geplante Endzeit MIT Nebenzeit/Aufgabenbewältigung
 */

/**
 * Berechnet den Fortschritt basierend auf der verstrichenen Zeit MIT Faktoren.
 * Verwendet die berechnete Endzeit (inkl. Pause) als Basis, damit Fortschritt
 * und "Fertig ca."-Anzeige konsistent bleiben.
 */

/**
 * Berechnet die verbleibende Zeit MIT Faktoren.
 * Basiert auf der berechneten Endzeit (inkl. Pause), damit "Rest" und
 * "Fertig ca." konsistent sind.
 */

/**
 * Extrahiert Arbeiten aus arbeitszeiten_details für die Anzeige
 * @param {Object} termin - Der Termin
 * @returns {Array} Array mit {name, zeit}
 */

/**
 * Berechnet die geplante Endzeit
 */;

  AppClass.prototype.calculateTageskapazitaetMinuten = async function(person, datum, abwesenheiten = null) {
  if (!person || !datum) {
    return 0;
  }

  // 1. Abwesenheiten prüfen
  if (!abwesenheiten) {
    try {
      abwesenheiten = await fetch(`${CONFIG.API_URL}/abwesenheiten/datum/${datum}`)
        .then(res => res.json());
    } catch (error) {
      console.error('Fehler beim Laden von Abwesenheiten:', error);
      abwesenheiten = [];
    }
  }

  // Prüfe ob person an diesem Datum abwesend ist
  const istAbwesend = abwesenheiten.some(ab => {
    if (person.id) {
      // person.id könnte mitarbeiter_id oder lehrling_id sein - prüfe beide
      return (ab.mitarbeiter_id === person.id || ab.lehrling_id === person.id);
    }
    return false;
  });

  if (istAbwesend) {
    return 0; // Bei Abwesenheit keine Kapazität
  }

  // 2. Versuche flexible Arbeitszeiten-API (neue Funktion seit v1.6.0)
  try {
    const mitarbeiterId = person.mitarbeiter_id || (person.id && !person.aufgabenbewaeltigung_prozent ? person.id : null);
    const lehrlingId = person.lehrling_id || (person.id && person.aufgabenbewaeltigung_prozent !== undefined ? person.id : null);

    if (mitarbeiterId || lehrlingId) {
      const queryParam = mitarbeiterId ? `mitarbeiter_id=${mitarbeiterId}` : `lehrling_id=${lehrlingId}`;
      const arbeitszeitenEintrag = await fetch(
        `${CONFIG.API_URL}/arbeitszeiten-plan/for-date?${queryParam}&datum=${datum}`
      ).then(res => res.ok ? res.json() : null);

      // Wenn spezifischer Eintrag oder Wochentag-Muster gefunden
      if (arbeitszeitenEintrag && arbeitszeitenEintrag.arbeitsstunden !== undefined) {
        const istFrei = arbeitszeitenEintrag.ist_frei === 1;
        if (istFrei) {
          return 0; // Freier Tag
        }

        // HINWEIS: Pausenzeit wird NICHT abgezogen - 8h Arbeitszeit = 8h verfügbar
        const arbeitsMinuten = (arbeitszeitenEintrag.arbeitsstunden * 60);
        
        // Nebenzeit berücksichtigen
        const nebenzeit = person.nebenzeit_prozent || 0;
        const mitNebenzeit = arbeitsMinuten * (1 + nebenzeit / 100);
        
        return Math.max(0, mitNebenzeit);
      }
    }
  } catch (error) {
    console.warn('Flexible Arbeitszeiten-API nicht verfügbar, nutze Fallback:', error.message);
  }

  // 3. Fallback: Alte Logik mit Standard-Wochenarbeitszeit
  const date = new Date(datum + 'T12:00:00');
  const wochentag = date.getDay();

  // Sonntag = immer 0 Minuten
  if (wochentag === 0) {
    return 0;
  }

  // 3. Samstag - prüfe ob aktiv
  if (wochentag === 6) {
    const samstagAktiv = person.samstag_aktiv === 1 || person.samstag_aktiv === true;
    if (!samstagAktiv) {
      return 0; // Samstag nicht aktiv
    }

    // Berechne Samstags-Kapazität aus Zeitfenster
    const start = person.samstag_start || '09:00';
    const ende = person.samstag_ende || '12:00';
    // HINWEIS: Pausenzeit wird NICHT abgezogen
    const pause = person.samstag_pausenzeit_minuten || 0;

    const [startH, startM] = start.split(':').map(Number);
    const [endeH, endeM] = ende.split(':').map(Number);
    const startMinuten = startH * 60 + startM;
    const endeMinuten = endeH * 60 + endeM;
    const arbeitszeit = endeMinuten - startMinuten; // Pause NICHT abziehen

    // Nebenzeit berücksichtigen (nur bei Mitarbeitern relevant)
    const nebenzeit = person.nebenzeit_prozent || 0;
    const mitNebenzeit = arbeitszeit * (1 + nebenzeit / 100);

    return Math.max(0, mitNebenzeit);
  }

  // 4. Mo-Fr: Berechne aus Wochenarbeitszeit
  const wochenarbeitszeit = person.wochenarbeitszeit_stunden || 40;
  const arbeitstage = person.arbeitstage_pro_woche || 5;
  const pausenzeit = person.pausenzeit_minuten || 30;

  // Tageskapazität = (Wochenarbeitszeit / Arbeitstage × 60)
  // HINWEIS: Pausenzeit wird NICHT abgezogen - 8h Arbeitszeit = 8h verfügbar
  const tagesStunden = wochenarbeitszeit / arbeitstage;
  const tagesMinuten = (tagesStunden * 60);

  // Nebenzeit berücksichtigen
  const nebenzeit = person.nebenzeit_prozent || 0;
  const mitNebenzeit = tagesMinuten * (1 + nebenzeit / 100);

  // Fallback: Wenn Wochenarbeitszeit nicht gesetzt, nutze alte arbeitsstunden_pro_tag
  if (!person.wochenarbeitszeit_stunden && person.arbeitsstunden_pro_tag) {
    const altesSystem = (person.arbeitsstunden_pro_tag * 60);
    const mitNebenzeit = altesSystem * (1 + nebenzeit / 100);
    return Math.max(0, mitNebenzeit);
  }

  return Math.max(0, mitNebenzeit);
}

/**
 * Synchrone Version: Berechnet Tageskapazität ohne API-Aufruf
 * Verwendet bereits geladene Abwesenheiten
 * 
 * @param {Object} person - Mitarbeiter- oder Lehrling-Objekt
 * @param {String} datum - Datum im Format YYYY-MM-DD
 * @param {Array} abwesenheiten - Liste aller Abwesenheiten
 * @returns {Number} Verfügbare Minuten (0 bei Abwesenheit/Sonntag)
 */;

  AppClass.prototype.calculateTageskapazitaetMinutenSync = function(person, datum, abwesenheiten = []) {
  if (!person || !datum) {
    return 0;
  }

  // 1. Prüfe ob person an diesem Datum abwesend ist
  const istAbwesend = abwesenheiten.some(ab => {
    if (person.id) {
      return (ab.mitarbeiter_id === person.id || ab.lehrling_id === person.id);
    }
    return false;
  });

  if (istAbwesend) {
    return 0; // Bei Abwesenheit keine Kapazität
  }

  // 2. Wochentag ermitteln (0 = Sonntag, 6 = Samstag)
  const date = new Date(datum + 'T12:00:00');
  const wochentag = date.getDay();

  // Sonntag = immer 0 Minuten
  if (wochentag === 0) {
    return 0;
  }

  // 3. Samstag - prüfe ob aktiv
  if (wochentag === 6) {
    const samstagAktiv = person.samstag_aktiv === 1 || person.samstag_aktiv === true;
    if (!samstagAktiv) {
      return 0; // Samstag nicht aktiv
    }

    // Berechne Samstags-Kapazität aus Zeitfenster
    const start = person.samstag_start || '09:00';
    const ende = person.samstag_ende || '12:00';
    // HINWEIS: Pausenzeit wird NICHT abgezogen
    const pause = person.samstag_pausenzeit_minuten || 0;

    const [startH, startM] = start.split(':').map(Number);
    const [endeH, endeM] = ende.split(':').map(Number);
    const startMinuten = startH * 60 + startM;
    const endeMinuten = endeH * 60 + endeM;
    const arbeitszeit = endeMinuten - startMinuten; // Pause NICHT abziehen

    // Nebenzeit berücksichtigen (nur bei Mitarbeitern relevant)
    const nebenzeit = person.nebenzeit_prozent || 0;
    const mitNebenzeit = arbeitszeit * (1 + nebenzeit / 100);

    return Math.max(0, mitNebenzeit);
  }

  // 4. Mo-Fr: Berechne aus Wochenarbeitszeit
  const wochenarbeitszeit = person.wochenarbeitszeit_stunden || 40;
  const arbeitstage = person.arbeitstage_pro_woche || 5;
  const pausenzeit = person.pausenzeit_minuten || 30;

  // Tageskapazität = (Wochenarbeitszeit / Arbeitstage × 60)
  // HINWEIS: Pausenzeit wird NICHT abgezogen - 8h Arbeitszeit = 8h verfügbar
  const tagesStunden = wochenarbeitszeit / arbeitstage;
  const tagesMinuten = (tagesStunden * 60);

  // Nebenzeit berücksichtigen
  const nebenzeit = person.nebenzeit_prozent || 0;
  const mitNebenzeit = tagesMinuten * (1 + nebenzeit / 100);

  // Fallback: Wenn Wochenarbeitszeit nicht gesetzt, nutze alte arbeitsstunden_pro_tag
  if (!person.wochenarbeitszeit_stunden && person.arbeitsstunden_pro_tag) {
    const altesSystem = (person.arbeitsstunden_pro_tag * 60);
    const mitNebenzeit = altesSystem * (1 + nebenzeit / 100);
    return Math.max(0, mitNebenzeit);
  }

  return Math.max(0, mitNebenzeit);
}

/**
 * Findet den nächsten verfügbaren Arbeitstag mit ausreichender Kapazität
 * 
 * @param {Object} person - Mitarbeiter oder Lehrling
 * @param {String} startDatum - Start-Datum für Suche (YYYY-MM-DD)
 * @param {Number} benoetigteMinuten - Benötigte Kapazität in Minuten
 * @param {Number} maxTage - Maximale Anzahl Tage vorausschauend (Standard: 14)
 * @returns {Promise<Object>} { datum, verfuegbareMinuten } oder null
 */;

  AppClass.prototype.findeNaechstenVerfuegbarenTag = async function(person, startDatum, benoetigteMinuten, maxTage = 14) {
  const startDate = new Date(startDatum + 'T12:00:00');
  
  // Abwesenheiten für Zeitraum laden
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + maxTage);
  const endDatumStr = this.formatDateLocal(endDate);
  
  let abwesenheiten = [];
  try {
    abwesenheiten = await fetch(`${CONFIG.API_URL}/abwesenheiten/range?datum_von=${startDatum}&datum_bis=${endDatumStr}`)
      .then(res => res.json());
  } catch (error) {
    console.error('Fehler beim Laden von Abwesenheiten:', error);
  }

  // Iteriere durch die nächsten Tage
  for (let i = 1; i <= maxTage; i++) {
    const checkDate = new Date(startDate);
    checkDate.setDate(checkDate.getDate() + i);
    const checkDatumStr = this.formatDateLocal(checkDate);

    const kapazitaet = await this.calculateTageskapazitaetMinuten(person, checkDatumStr, abwesenheiten);

    if (kapazitaet >= benoetigteMinuten) {
      return {
        datum: checkDatumStr,
        verfuegbareMinuten: kapazitaet
      };
    }
  }

  return null; // Kein passender Tag gefunden
};

  AppClass.prototype.openKompetenzModal = async function() {
    const modal = document.getElementById('kompetenzModal');
    const matrix = document.getElementById('kompetenzMatrix');
    modal.style.display = 'flex';
    matrix.innerHTML = '<p>Lade…</p>';

    try {
      const [mitarbeiterRes, lehrlingeRes, settingsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/mitarbeiter`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/lehrlinge`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/einstellungen/werkstatt`).then(r => r.json())
      ]);

      const personen = [
        ...(Array.isArray(mitarbeiterRes) ? mitarbeiterRes : (mitarbeiterRes.data || [])).filter(m => m.aktiv).map(m => ({ ...m, typ: 'mitarbeiter' })),
        ...(Array.isArray(lehrlingeRes) ? lehrlingeRes : (lehrlingeRes.data || [])).filter(l => l.aktiv).map(l => ({ ...l, typ: 'lehrling' }))
      ];

      let mapping = {};
      try {
        if (settingsRes.kompetenz_mapping) {
          mapping = JSON.parse(settingsRes.kompetenz_mapping);
        }
      } catch {}

      const kategorien = ['Inspektion', 'Bremsen', 'Motor', 'Elektrik', 'Klima', 'Reifen', 'Karosserie'];
      const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

      matrix.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #eee;">Kategorie</th>
              ${personen.map(p => `<th style="text-align:center;padding:6px 4px;border-bottom:2px solid #eee;font-weight:normal;">
                <div style="font-weight:600;">${esc(p.name)}</div>
                <div style="color:#999;font-size:11px;">${p.typ === 'lehrling' ? 'Lehrling' : 'MA'}</div>
              </th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${kategorien.map(kat => `
              <tr>
                <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-weight:500;">${esc(kat)}</td>
                ${personen.map(p => {
                  const checked = Array.isArray(mapping[kat]) && mapping[kat].includes(p.id) ? 'checked' : '';
                  return `<td style="text-align:center;padding:6px 4px;border-bottom:1px solid #f0f0f0;">
                    <input type="checkbox" data-kat="${esc(kat)}" data-person-id="${p.id}" ${checked}>
                  </td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      matrix.innerHTML = `<p style="color:red;">Fehler beim Laden: ${String(err.message || err).replace(/</g,'&lt;')}</p>`;
    }
  };

  AppClass.prototype.closeKompetenzModal = function() {
    document.getElementById('kompetenzModal').style.display = 'none';
  };

  AppClass.prototype.saveKompetenzMapping = async function() {
    const checkboxes = document.querySelectorAll('#kompetenzMatrix input[type=checkbox]');
    const mapping = {};
    checkboxes.forEach(cb => {
      if (!cb.checked) return;
      const kat = cb.dataset.kat;
      const id = parseInt(cb.dataset.personId, 10);
      if (!mapping[kat]) mapping[kat] = [];
      mapping[kat].push(id);
    });

    try {
      const res = await fetch(`${API_BASE_URL}/api/einstellungen/werkstatt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kompetenz_mapping: JSON.stringify(mapping) })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.closeKompetenzModal();
      if (typeof this.showToast === 'function') {
        this.showToast('✅ Kompetenz-Zuordnung gespeichert', 'success');
      }
    } catch (err) {
      if (typeof this.showToast === 'function') {
        this.showToast(`Fehler beim Speichern: ${String(err.message || err)}`, 'error');
      }
    }
  };
}

