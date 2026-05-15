import { formatMinutesToHours } from '../../shared/formatters.js';

export function installTimelineFeature(AppClass) {
  AppClass.prototype._renderSchnellStatusPausen = function(pausen, terminId) {
  const id = terminId ? `id="schnell-arbeitspausen-${terminId}"` : '';
  if (!pausen || pausen.length === 0) {
    return `<div ${id}></div>`;
  }
  const grundLabels = { teil_fehlt: 'Teil fehlt', rueckfrage_kunde: 'Rückfrage Kunde', vorrang: 'Vorrang' };
  const isoToHHMM = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d) ? '—' : `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };
  const gesamtMinutenAbzug = pausen.reduce((sum, p) => {
    if (!p.gestartet_am) return sum;
    const start = new Date(p.gestartet_am);
    const end = p.beendet_am ? new Date(p.beendet_am) : new Date();
    const diff = Math.round((end - start) / 60000);
    return sum + (diff > 0 ? diff : 0);
  }, 0);
  const pausenRows = pausen.map(p => {
    const start = isoToHHMM(p.gestartet_am);
    const ende = p.beendet_am ? isoToHHMM(p.beendet_am) : '<span style="color:#fd7e14;">läuft…</span>';
    const dauerMin = p.gestartet_am ? Math.round(((p.beendet_am ? new Date(p.beendet_am) : new Date()) - new Date(p.gestartet_am)) / 60000) : 0;
    const grundTxt = grundLabels[p.grund] || p.grund || '';
    return `<div style="font-size:0.82em;color:#666;padding:1px 0;">🔧 ${start}–${ende} (${dauerMin} min)${grundTxt ? ' · ' + grundTxt : ''}</div>`;
  }).join('');
  const abzugText = gesamtMinutenAbzug > 0 ? ` <span style="color:#fd7e14;font-size:0.85em;">(−${gesamtMinutenAbzug} min)</span>` : '';
  return `<div ${id}>
    <div class="detail-row">
      <span class="detail-label">🔧</span>
      <span class="detail-value"><strong>Auftragsunterbrechungen</strong>${abzugText}
        ${pausenRows}
      </span>
    </div>
  </div>`;
};

  AppClass.prototype.showSchnellStatusDialog = function(termin, element, startzeit, dauer, arbeitName = null) {
  // Arbeitspausen async nachladen und Dialog aktualisieren
  const terminId = termin.id;
  if (!termin.arbeitspausen) {
    ApiService.get(`/arbeitspausen/termin/${terminId}`)
      .then(pausen => {
        termin.arbeitspausen = pausen || [];
        if (this.termineById[terminId]) this.termineById[terminId].arbeitspausen = termin.arbeitspausen;
        const container = document.getElementById(`schnell-arbeitspausen-${terminId}`);
        if (container) container.outerHTML = this._renderSchnellStatusPausen(termin.arbeitspausen);
      })
      .catch(() => {});
  }

  // Alten Dialog entfernen falls vorhanden
  const existingDialog = document.getElementById('schnellStatusDialog');
  if (existingDialog) existingDialog.remove();
  
  const currentStatus = termin.status || 'geplant';
  const heuteDatumStr = new Date().toISOString().slice(0, 10);
  const zeigeWeiterfuehren = termin.datum && termin.datum < heuteDatumStr && termin.datum !== '9999-12-31' && !['abgeschlossen', 'storniert'].includes(currentStatus);
  
  // Aktuelle Uhrzeit
  const jetzt = new Date();
  const aktuelleZeit = `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`;
  
  // Berechne wie lange der Termin schon läuft
  const [startH, startM] = startzeit.split(':').map(Number);
  const startMinuten = startH * 60 + startM;
  const jetztMinuten = jetzt.getHours() * 60 + jetzt.getMinutes();
  const verstricheneMinuten = Math.max(0, jetztMinuten - startMinuten);
  const verstricheneText = verstricheneMinuten >= 60 
    ? `${Math.floor(verstricheneMinuten/60)}h ${verstricheneMinuten%60}min` 
    : `${verstricheneMinuten} Min`;
  
  // Arbeiten aus Termin extrahieren
  const arbeitenText = this.getTerminArbeitenText(termin);
  
  // Abholzeit formatieren
  const abholzeitText = termin.abholung_zeit || termin.abhol_zeit || '—';
  const abholDatumText = (termin.abholung_datum || termin.abhol_datum)
    ? this.formatDatum(termin.abholung_datum || termin.abhol_datum)
    : (termin.datum ? this.formatDatum(termin.datum) : '—');
  
  // Geplante Dauer: immer die originale geschaetzte_zeit (ohne Lehrling-Faktor / tatsächliche Zeit)
  // dauer (Parameter) enthält die Timeline-Dauer (kann tatsächliche Zeit × Lehrling-Faktor sein)
  let geplanteDauer = dauer;
  {
    // Bevorzuge Summe der geplanten Einzelzeiten aus arbeitszeiten_details
    let summe = 0;
    try {
      const det = termin.arbeitszeiten_details
        ? (typeof termin.arbeitszeiten_details === 'string'
            ? JSON.parse(termin.arbeitszeiten_details)
            : termin.arbeitszeiten_details)
        : null;
      if (det) {
        for (const [k, v] of Object.entries(det)) {
          if (k.startsWith('_')) continue;
          if (typeof v === 'number' && v > 0) summe += v;
          else if (typeof v === 'object' && parseInt(v.zeit) > 0) summe += parseInt(v.zeit);
        }
      }
    } catch (e) {}
    if (summe > 0) {
      geplanteDauer = summe;
    } else if (parseInt(termin.geschaetzte_zeit) > 0) {
      geplanteDauer = parseInt(termin.geschaetzte_zeit);
    }
  }
  // Dauer formatieren
  const dauerText = geplanteDauer >= 60 
    ? `${Math.floor(geplanteDauer/60)}h ${geplanteDauer%60 > 0 ? (geplanteDauer%60) + 'min' : ''}`.trim()
    : `${geplanteDauer} min`;
  
  // Dialog erstellen
  const dialog = document.createElement('div');
  dialog.id = 'schnellStatusDialog';
  dialog.className = 'schnell-status-dialog';
  
  // Status-spezifischer Header und Aktionen
  let statusHeader = '';
  let statusAktionen = '';
  
  if (currentStatus === 'geplant') {
    statusHeader = `
      <div class="schnell-status-header">
        <span class="status-icon">🔵</span>
        <span>Status: <strong>Geplant</strong></span>
      </div>`;
    statusAktionen = `
      <div class="schnell-status-aktion">
        <button class="btn-schnell-status btn-in-arbeit" data-action="in_arbeit">
          🔧 In Arbeit setzen
        </button>
      </div>`;
  } else if (currentStatus === 'in_arbeit') {
    statusHeader = `
      <div class="schnell-status-header">
        <span class="status-icon">🔧</span>
        <span>Status: <strong>In Arbeit</strong></span>
      </div>`;
    statusAktionen = `
      <div class="schnell-status-frage">
        <p>⏱️ Läuft seit: <strong>${verstricheneText}</strong> (aktuell ${aktuelleZeit})</p>
        <p>🏁 Fertigstellung ca.: <strong>${(() => { const endMin = startMinuten + geplanteDauer; return String(Math.floor(endMin/60)%24).padStart(2,'0') + ':' + String(endMin%60).padStart(2,'0'); })()}</strong> (${geplanteDauer >= 60 ? Math.floor(geplanteDauer/60) + 'h ' + (geplanteDauer%60 > 0 ? geplanteDauer%60 + 'min' : '') : geplanteDauer + ' min'} geplant)</p>
      </div>
      <div class="schnell-status-zeit-eingabe">
        <label>🏁 Tatsächliche Arbeitszeit:</label>
        <div class="zeit-eingabe-row">
          <input type="number" id="schnellZeitStunden" min="0" max="23" value="${Math.floor(verstricheneMinuten/60)}" placeholder="Std"> h
          <input type="number" id="schnellZeitMinuten" min="0" max="59" value="${verstricheneMinuten%60}" placeholder="Min"> min
        </div>
      </div>
      <div class="schnell-status-aktionen">
        <button class="btn-schnell-status btn-abgeschlossen" data-action="abgeschlossen-custom">
          ✅ Abschließen
        </button>
        <button class="btn-schnell-status btn-weiter" data-action="close">
          ⏳ Läuft noch
        </button>
      </div>`;
  } else if (currentStatus === 'abgeschlossen') {
    statusHeader = `
      <div class="schnell-status-header">
        <span class="status-icon">✅</span>
        <span>Status: <strong>Abgeschlossen</strong></span>
      </div>`;
    statusAktionen = `
      <div class="schnell-status-aktion">
        <button class="btn-schnell-status btn-zurueck" data-action="in_arbeit">
          🔙 Zurück auf "In Arbeit"
        </button>
      </div>`;
  } else {
    statusHeader = `
      <div class="schnell-status-header">
        <span class="status-icon">❓</span>
        <span>Status: <strong>${currentStatus}</strong></span>
      </div>`;
    statusAktionen = `
      <div class="schnell-status-aktion">
        <button class="btn-schnell-status btn-in-arbeit" data-action="in_arbeit">
          🔧 In Arbeit setzen
        </button>
      </div>`;
  }
  
  // Einzelne Arbeit abschließen: Nur anzeigen wenn Multi-Arbeit-Termin und eine bestimmte Arbeit angeklickt wurde
  let einzelArbeitSektion = '';
  if (arbeitName && currentStatus !== 'abgeschlossen') {
    let arbeitDetails = null;
    let arbeitenCount = 0;
    try {
      const det = termin.arbeitszeiten_details
        ? (typeof termin.arbeitszeiten_details === 'string'
            ? JSON.parse(termin.arbeitszeiten_details)
            : termin.arbeitszeiten_details)
        : null;
      if (det) {
        for (const k of Object.keys(det)) {
          if (!k.startsWith('_')) arbeitenCount++;
        }
        arbeitDetails = det[arbeitName];
      }
    } catch (e) {}
    
    const istBereitsAbgeschlossen = arbeitDetails && arbeitDetails.abgeschlossen === true;
    
    if (arbeitenCount > 1 && !istBereitsAbgeschlossen) {
      einzelArbeitSektion = `
        <div class="detail-divider"></div>
        <div style="padding: 4px 0;">
          <p style="font-size:0.85em; color:#555; margin:0 0 6px;">📌 Angeklickte Arbeit: <strong>${arbeitName}</strong></p>
          <button class="btn-schnell-status" data-action="einzelarbeit-abschliessen"
            style="width:100%; background:linear-gradient(135deg, #10b981 0%, #34d399 100%); color:white; border:none; border-radius:8px; padding:10px; font-weight:600; cursor:pointer;">
            ✅ Nur "${arbeitName}" abschließen
          </button>
          <small style="color:#888; display:block; margin-top:4px;">Die anderen Arbeiten bleiben offen und können separat eingeplant werden.</small>
        </div>`;
    } else if (istBereitsAbgeschlossen) {
      einzelArbeitSektion = `
        <div class="detail-divider"></div>
        <div style="padding: 4px 0;">
          <p style="font-size:0.85em; color:#16a34a; margin:0;">✅ "${arbeitName}" ist bereits abgeschlossen</p>
        </div>`;
    }
  }
  
  dialog.innerHTML = `
    <div class="schnell-status-content erweitert">
      <button class="schnell-status-close" data-action="close">×</button>
      
      ${statusHeader}
      
      <div class="schnell-status-details">
        <div class="detail-row titel">
          <span class="detail-label">📋</span>
          <span class="detail-value"><strong>${termin.termin_nr}</strong> — ${termin.kunde_name || 'Unbekannt'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">🚗</span>
          <span class="detail-value">${termin.kennzeichen || '—'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">🔧</span>
          <span class="detail-value arbeit-text">${arbeitenText}</span>
        </div>
        <div class="detail-divider"></div>
        <div class="detail-row">
          <span class="detail-label">⏱️</span>
          <span class="detail-value">Geplant: <strong>${dauerText}</strong> ab ${startzeit}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">🏁</span>
          <span class="detail-value">Fertigstellung ca.: <strong>${(() => { const endMin = startMinuten + geplanteDauer; return String(Math.floor(endMin/60)%24).padStart(2,'0') + ':' + String(endMin%60).padStart(2,'0'); })()}</strong></span>
        </div>
        ${(() => {
          // Tatsächliche gestempelte Startzeit aus arbeitszeiten_details._startzeit
          let tatsStart = null;
          try {
            const det = typeof termin.arbeitszeiten_details === 'string'
              ? JSON.parse(termin.arbeitszeiten_details)
              : termin.arbeitszeiten_details;
            if (det && det._startzeit) tatsStart = det._startzeit;
          } catch(e) {}
          if (!tatsStart && termin.startzeit) tatsStart = termin.startzeit;
          const startRow = tatsStart ? `<div class="detail-row"><span class="detail-label">🕐</span><span class="detail-value">Gestartet: <strong style="color:#2563eb;">${tatsStart}</strong></span></div>` : '';
          // Tatsächliche Fertigstellungszeit
          let fertigRow = '';
          let fertigDate = null;
          if (termin.fertigstellung_zeit) {
            fertigDate = new Date(termin.fertigstellung_zeit);
            const fStr = String(fertigDate.getHours()).padStart(2,'0') + ':' + String(fertigDate.getMinutes()).padStart(2,'0');
            fertigRow = `<div class="detail-row"><span class="detail-label" style="color:#16a34a;">✅</span><span class="detail-value">Fertiggestellt: <strong style="color:#16a34a;">${fStr}</strong></span></div>`;
          }
          // Tatsächliche Arbeitszeit: Uhrzeit-Differenz (Start → Fertigstellung) bevorzugen,
          // da der DB-Wert oft aus der Einplanungs-Dauer stammt und ungenau sein kann.
          let tatsZeitRow = '';
          let tatsZeit = null;
          // Primär: echte Uhrzeit-Differenz wenn Fertigstellung und Startzeit bekannt
          if (fertigDate && !isNaN(fertigDate) && tatsStart) {
            const [sh, sm] = tatsStart.split(':').map(Number);
            const sd = new Date(fertigDate);
            sd.setHours(sh, sm, 0, 0);
            const diffMs = fertigDate - sd;
            if (diffMs > 0 && diffMs < 12 * 3600000) tatsZeit = Math.round(diffMs / 60000);
          }
          // Fallback: DB-Wert wenn keine Uhrzeit-Differenz berechnet werden konnte
          if (!tatsZeit && termin.tatsaechliche_zeit && parseInt(termin.tatsaechliche_zeit) > 0) {
            tatsZeit = parseInt(termin.tatsaechliche_zeit);
          }
          if (tatsZeit && tatsZeit > 0) {
            const tatsH = Math.floor(tatsZeit / 60);
            const tatsM = tatsZeit % 60;
            const tatsStr = tatsH > 0 ? `${tatsH}h${tatsM > 0 ? ' ' + tatsM + 'min' : ''}` : `${tatsM}min`;
            const diff = tatsZeit - geplanteDauer;
            const diffStr = diff !== 0 ? ` <span style="color:${diff > 0 ? '#dc3545' : '#16a34a'};font-size:0.85em;">(${diff > 0 ? '+' : ''}${diff}min)</span>` : '';
            tatsZeitRow = `<div class="detail-row"><span class="detail-label">⏱️</span><span class="detail-value">Tatsächlich: <strong style="color:#16a34a;">${tatsStr}</strong>${diffStr}</span></div>`;
          }
          return startRow + fertigRow + tatsZeitRow;
        })()}
        <div class="detail-row">
          <span class="detail-label">📅</span>
          <span class="detail-value">Abholung: <strong>${abholzeitText}</strong> (${abholDatumText})</span>
        </div>
        ${this._renderSchnellStatusPausen(termin.arbeitspausen, termin.id)}
        <div class="detail-divider"></div>
        <div class="detail-row" style="align-items: center; gap: 6px; flex-wrap: wrap;">
          <span class="detail-label">🕐</span>
          <span style="font-size: 0.85em; color: #555;">Startzeit:</span>
          <input type="time" id="schnellStatusStartzeit" value="${startzeit}"
            style="border: 1px solid #ccc; border-radius: 6px; padding: 3px 7px; font-size: 0.9em; width: 90px;">
          <button data-action="startzeit-setzen" class="btn-schnell-startzeit"
            style="padding: 3px 10px; font-size: 0.82em; border-radius: 6px; border: none; background: #2563eb; color: #fff; cursor: pointer; white-space: nowrap;">
            ✓ Übernehmen
          </button>
          <span id="schnellStartzeitHinweis" style="font-size: 0.78em; color: #16a34a; display: none;">✅ Geändert – Speichern nicht vergessen!</span>
        </div>
        <div class="detail-row" style="align-items: center; gap: 6px; flex-wrap: wrap;">
          <span class="detail-label">🏷️</span>
          <span style="font-size: 0.85em; color: #555;">Interne Nr.:</span>
          <input type="text" id="schnellStatusInterneNr" value="${(termin.interne_auftragsnummer || '').replace(/"/g, '&quot;')}" placeholder="optional"
            style="border: 1px solid #ccc; border-radius: 6px; padding: 3px 7px; font-size: 0.9em; flex: 1; min-width: 120px;">
          <button data-action="interne-nr-setzen" class="btn-schnell-startzeit"
            style="padding: 3px 10px; font-size: 0.82em; border-radius: 6px; border: none; background: #2563eb; color: #fff; cursor: pointer; white-space: nowrap;">
            ✓ Übernehmen
          </button>
          <span id="schnellInterneNrHinweis" style="font-size: 0.78em; color: #16a34a; display: none;">✅ Gespeichert</span>
        </div>
      </div>
      
      ${statusAktionen}
      
      ${einzelArbeitSektion}
      
      <div class="schnell-status-footer">
        <button class="btn-schnell-link" data-action="erweitern" title="Auftrag erweitern">
          ➕ Erweitern
        </button>
        <button class="btn-schnell-link" data-action="verknuepfen" title="Termin mit einem anderen Termin als Erweiterung verknüpfen">
          🔗 Verknüpfen
        </button>
        <button class="btn-schnell-link" data-action="erweitert" title="Mehr bearbeiten">
          ✏️ Mehr...
        </button>
      </div>
      ${zeigeWeiterfuehren ? `
      <div style="padding: 8px 12px 4px;">
        <button class="btn-schnell-link" data-action="weiterfuehren" style="width:100%;text-align:center;background:#fff3e0;color:#e65100;border:1px solid #ffcc80;border-radius:6px;padding:7px;font-weight:600;">
          📅 Am nächsten Arbeitstag weiterführen
        </button>
      </div>` : ''}
      ${!['abgeschlossen', 'storniert'].includes(currentStatus) ? `
      <div style="padding: 4px 12px 8px;">
        <button class="btn-schnell-link" data-action="einplanen" style="width:100%;text-align:center;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:6px;padding:7px;font-weight:600;">
          ⚡ Heute einplanen + morgen fortführen
        </button>
      </div>` : ''}
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  // Event-Listener für Buttons hinzufügen (Arrow-Function behält this-Kontext)
  dialog.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      
      if (action === 'close') {
        this.closeSchnellStatusDialog();
      } else if (action === 'startzeit-setzen') {
        const neueStartzeit = document.getElementById('schnellStatusStartzeit')?.value;
        if (!neueStartzeit) return;
        // Mitarbeiter-Zuweisung aus Termin-Daten lesen
        let type = 'mitarbeiter';
        let mitarbeiterId = termin.mitarbeiter_id || null;
        let lehrlingId = null;
        try {
          const details = termin.arbeitszeiten_details
            ? (typeof termin.arbeitszeiten_details === 'string'
                ? JSON.parse(termin.arbeitszeiten_details)
                : termin.arbeitszeiten_details)
            : {};
          const zuweisung = details._gesamt_mitarbeiter_id;
          if (zuweisung) {
            type = zuweisung.type || 'mitarbeiter';
            if (type === 'lehrling') {
              lehrlingId = zuweisung.id;
              mitarbeiterId = null;
            } else {
              mitarbeiterId = zuweisung.id;
            }
          }
        } catch (e) { /* ignorieren */ }
        await this.moveTerminToMitarbeiterWithTime(terminId, mitarbeiterId, lehrlingId, type, neueStartzeit);
        const hinweis = document.getElementById('schnellStartzeitHinweis');
        if (hinweis) hinweis.style.display = 'inline';
      } else if (action === 'interne-nr-setzen') {
        const neueInterneNr = (document.getElementById('schnellStatusInterneNr')?.value || '').trim();
        try {
          await TermineService.update(terminId, { interne_auftragsnummer: neueInterneNr || null });
          if (this.termineById[terminId]) {
            this.termineById[terminId].interne_auftragsnummer = neueInterneNr || null;
          }
          if (termin) termin.interne_auftragsnummer = neueInterneNr || null;
          const hinweisInt = document.getElementById('schnellInterneNrHinweis');
          if (hinweisInt) {
            hinweisInt.style.display = 'inline';
            setTimeout(() => { if (hinweisInt) hinweisInt.style.display = 'none'; }, 2000);
          }
          this.showToast('🏷️ Interne Auftragsnummer gespeichert', 'success');
        } catch (err) {
          console.error('Fehler beim Speichern der internen Auftragsnummer:', err);
          this.showToast('❌ Speichern fehlgeschlagen', 'error');
        }
      } else if (action === 'abgeschlossen') {
        const zeit = parseInt(btn.dataset.zeit) || null;
        this.setzeSchnellStatus(terminId, 'abgeschlossen', zeit);
      } else if (action === 'abgeschlossen-custom') {
        // Tatsächliche Zeit aus Eingabefeldern lesen
        const stunden = parseInt(document.getElementById('schnellZeitStunden')?.value) || 0;
        const minuten = parseInt(document.getElementById('schnellZeitMinuten')?.value) || 0;
        const gesamtMinuten = stunden * 60 + minuten;
        this.setzeSchnellStatus(terminId, 'abgeschlossen', gesamtMinuten > 0 ? gesamtMinuten : null);
      } else if (action === 'einzelarbeit-abschliessen') {
        this.closeSchnellStatusDialog();
        await this.abschliessenEinzelArbeit(terminId, arbeitName);
      } else if (action === 'erweitern') {
        // Auftrag erweitern - Modal öffnen
        this.closeSchnellStatusDialog();
        this.openErweiterungModalForTermin(terminId);
      } else if (action === 'verknuepfen') {
        this.closeSchnellStatusDialog();
        this.showVerknuepfenDialog(terminId);
      } else if (action === 'erweitert') {
        // Erweitertes Bearbeitungs-Popup öffnen
        this.closeSchnellStatusDialog();
        this.showSchnellBearbeitungDialog(termin);
      } else if (action === 'weiterfuehren') {
        this.closeSchnellStatusDialog();
        this.currentDetailTerminId = terminId;
        await this.weiterfuehrenTermin();
      } else if (action === 'einplanen') {
        this.closeSchnellStatusDialog();
        this.showEinplanenDialog(terminId, termin);
      } else {
        this.setzeSchnellStatus(terminId, action);
      }
    });
  });
  
  // Dialog zentriert im Viewport positionieren
  const dialogRect = dialog.getBoundingClientRect();
  const left = Math.max(10, (window.innerWidth - dialogRect.width) / 2);
  const top = Math.max(10, (window.innerHeight - dialogRect.height) / 2);
  
  dialog.style.left = `${left}px`;
  dialog.style.top = `${top}px`;
  
  // Animation
  setTimeout(() => dialog.classList.add('active'), 10);
  
  // Click außerhalb schließt Dialog
  if (!this.handleSchnellStatusOutsideClick) {
    this.handleSchnellStatusOutsideClick = (e) => {
      const activeDialog = document.getElementById('schnellStatusDialog');
      if (activeDialog && !activeDialog.contains(e.target)) {
        this.closeSchnellStatusDialog();
      }
    };
  }
  setTimeout(() => {
    document.addEventListener('click', this.handleSchnellStatusOutsideClick);
  }, 100);
}

// Dialog schließen;

  AppClass.prototype.closeSchnellStatusDialog = function() {
  const dialog = document.getElementById('schnellStatusDialog');
  if (dialog) {
    dialog.classList.remove('active');
    setTimeout(() => dialog.remove(), 200);
  }
  document.removeEventListener('click', this.handleSchnellStatusOutsideClick);
}

// Einzelne Arbeit eines Multi-Arbeit-Termins abschließen;

  AppClass.prototype.abschliessenEinzelArbeit = async function(terminId, arbeitName) {
  try {
    const termin = this.termineById[terminId];
    if (!termin) {
      this.showToast('❌ Termin nicht gefunden', 'error');
      return;
    }

    // arbeitszeiten_details parsen
    let details = termin.arbeitszeiten_details
      ? (typeof termin.arbeitszeiten_details === 'string'
          ? JSON.parse(termin.arbeitszeiten_details)
          : { ...termin.arbeitszeiten_details })
      : {};

    // Arbeit in Details finden und als abgeschlossen markieren
    if (!details[arbeitName]) {
      this.showToast(`❌ Arbeit "${arbeitName}" nicht in Details gefunden`, 'error');
      return;
    }

    if (typeof details[arbeitName] !== 'object') {
      details[arbeitName] = { zeit: details[arbeitName] };
    }
    details[arbeitName].abgeschlossen = true;

    // Tatsächliche Zeit: die geplante Zeit der Arbeit als Fallback
    if (!details[arbeitName].tatsaechliche_zeit) {
      details[arbeitName].tatsaechliche_zeit = details[arbeitName].zeit || 30;
    }

    // Prüfe ob ALLE Arbeiten nun abgeschlossen sind
    let alleAbgeschlossen = true;
    let arbeitenGesamt = 0;
    let arbeitenFertig = 0;
    for (const key of Object.keys(details)) {
      if (key.startsWith('_')) continue;
      arbeitenGesamt++;
      if (details[key] && details[key].abgeschlossen === true) {
        arbeitenFertig++;
      } else {
        alleAbgeschlossen = false;
      }
    }

    // Update-Payload
    const updateData = {
      arbeitszeiten_details: JSON.stringify(details)
    };

    // Termin-Status: in_arbeit setzen wenn noch nicht alle fertig, sonst abgeschlossen
    if (alleAbgeschlossen) {
      updateData.status = 'abgeschlossen';
      // Tatsächliche Gesamtzeit berechnen
      let gesamtTatsaechlich = 0;
      for (const key of Object.keys(details)) {
        if (key.startsWith('_')) continue;
        gesamtTatsaechlich += parseInt(details[key].tatsaechliche_zeit) || parseInt(details[key].zeit) || 0;
      }
      updateData.tatsaechliche_zeit = gesamtTatsaechlich;
    } else if (termin.status === 'geplant') {
      updateData.status = 'in_arbeit';
    }

    await TermineService.update(terminId, updateData);

    // Cache aktualisieren
    if (this.termineById[terminId]) {
      this.termineById[terminId].arbeitszeiten_details = JSON.stringify(details);
      if (updateData.status) {
        this.termineById[terminId].status = updateData.status;
      }
      if (updateData.tatsaechliche_zeit) {
        this.termineById[terminId].tatsaechliche_zeit = updateData.tatsaechliche_zeit;
      }
    }

    // Feedback
    if (alleAbgeschlossen) {
      this.showToast(`✅ Alle ${arbeitenGesamt} Arbeiten abgeschlossen — Termin fertig!`, 'success');
    } else {
      this.showToast(`✅ "${arbeitName}" abgeschlossen (${arbeitenFertig}/${arbeitenGesamt} fertig)`, 'success');
    }

    // Visuell aktualisieren
    const arbeitBlock = document.querySelector(`[id^="timeline-arbeit-${terminId}-"][data-arbeit-name="${arbeitName}"]`);
    if (arbeitBlock) {
      arbeitBlock.classList.add('arbeit-abgeschlossen');
      const titleEl = arbeitBlock.querySelector('.termin-title');
      if (titleEl && !titleEl.innerHTML.includes('arbeit-done-badge')) {
        titleEl.innerHTML += ' <span class="arbeit-done-badge">✓</span>';
      }
    }

    // Timeline-Status aktualisieren
    if (updateData.status) {
      this.updateTimelineBlockStatus(terminId, updateData.status);
    }

    // Views neu laden
    this.loadDashboard();
    await this.loadHeuteTermine();
    const planungTab = document.getElementById('auslastung-dragdrop');
    if (planungTab && planungTab.classList.contains('active')) {
      setTimeout(() => this.loadAuslastungDragDrop(), 300);
    }

  } catch (error) {
    console.error('Fehler beim Abschließen der Einzelarbeit:', error);
    this.showToast('❌ Fehler beim Abschließen', 'error');
  }
}

// Verknüpfen-Dialog: Termin mit einem anderen als Erweiterung verknüpfen;

  AppClass.prototype.showVerknuepfenDialog = function(terminId) {
  const existing = document.getElementById('verknuepfenDialog');
  if (existing) existing.remove();

  const termin = this.termineById[terminId];
  const terminNr = termin?.termin_nr || `#${terminId}`;

  const dialog = document.createElement('div');
  dialog.id = 'verknuepfenDialog';
  dialog.className = 'schnell-bearbeitung-dialog';
  dialog.innerHTML = `
    <div class="schnell-bearbeitung-overlay"></div>
    <div class="schnell-bearbeitung-content" style="max-width: 420px;">
      <div class="schnell-bearbeitung-header">
        <h3>🔗 Termin verknüpfen</h3>
        <button class="schnell-bearbeitung-close" data-action="close">×</button>
      </div>
      <div class="schnell-bearbeitung-info">
        <span>📋 <strong>${terminNr}</strong> als Erweiterung eines anderen Termins festlegen</span>
      </div>
      <div class="schnell-bearbeitung-form">
        <div class="form-group">
          <label>🔍 Haupt-Termin-Nr. eingeben (z.B. T-2026-045):</label>
          <input type="text" id="verknuepfenTerminNr" placeholder="T-2026-..." autocomplete="off"
            style="text-transform: uppercase;">
          <small style="color: #666; display:block; margin-top:4px;">
            Dieser Termin wird als Erweiterung des eingegebenen Termins markiert.
          </small>
        </div>
        <div id="verknuepfenFundAnzeige" style="display:none; padding:8px 12px; background:#e8f5e9; border-radius:6px; border-left:3px solid #4caf50; font-size:0.9em;"></div>
        <div id="verknuepfenFehler" style="display:none; padding:8px 12px; background:#ffebee; border-radius:6px; border-left:3px solid #f44336; font-size:0.9em; color:#c62828;"></div>
      </div>
      <div class="schnell-bearbeitung-footer">
        <button class="btn-schnell-cancel" data-action="close">Abbrechen</button>
        <button class="btn-schnell-save" data-action="suchen">🔍 Suchen</button>
        <button class="btn-schnell-save" data-action="verknuepfen" style="display:none; background:#7c3aed;">🔗 Verknüpfen</button>
        <button class="btn-schnell-save" data-action="trennen" style="display:none; background:#dc2626;">✂️ Trennen</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  // Aktuell verknüpft? Zeige "Trennen"-Button
  if (termin?.erweiterung_von_id) {
    const trennBtn = dialog.querySelector('[data-action="trennen"]');
    if (trennBtn) trennBtn.style.display = '';
  }

  let gefundenerElternId = null;

  dialog.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;

      if (action === 'close') {
        dialog.classList.remove('active');
        setTimeout(() => dialog.remove(), 200);

      } else if (action === 'suchen') {
        const eingabe = document.getElementById('verknuepfenTerminNr')?.value?.trim().toUpperCase();
        const fehlerEl = document.getElementById('verknuepfenFehler');
        const fundEl = document.getElementById('verknuepfenFundAnzeige');
        const verknuepfenBtn = dialog.querySelector('[data-action="verknuepfen"]');
        fehlerEl.style.display = 'none';
        fundEl.style.display = 'none';
        gefundenerElternId = null;
        verknuepfenBtn.style.display = 'none';

        if (!eingabe) { fehlerEl.textContent = 'Bitte Termin-Nr. eingeben.'; fehlerEl.style.display = ''; return; }

        try {
          // Suche in Cache zuerst
          const treffer = Object.values(this.termineById).find(t =>
            t.termin_nr && t.termin_nr.toUpperCase() === eingabe && t.id !== terminId
          );
          if (treffer) {
            gefundenerElternId = treffer.id;
            fundEl.innerHTML = `✅ Gefunden: <strong>${this._escapeHtml(treffer.termin_nr)}</strong> — ${this._escapeHtml(treffer.kunde_name || '?')} • ${this._escapeHtml(treffer.kennzeichen || '—')} • ${this._escapeHtml(treffer.datum || '')}`;
            fundEl.style.display = '';
            verknuepfenBtn.style.display = '';
          } else {
            fehlerEl.textContent = `Termin "${eingabe}" nicht im heutigen Cache gefunden. Bitte Datum laden.`;
            fehlerEl.style.display = '';
          }
        } catch (err) {
          fehlerEl.textContent = 'Fehler bei der Suche: ' + err.message;
          fehlerEl.style.display = '';
        }

      } else if (action === 'verknuepfen' && gefundenerElternId) {
        try {
          await TermineService.update(terminId, {
            erweiterung_von_id: gefundenerElternId,
            ist_erweiterung: 1
          });
          if (this.termineById[terminId]) {
            this.termineById[terminId].erweiterung_von_id = gefundenerElternId;
            this.termineById[terminId].ist_erweiterung = 1;
          }
          this.showToast('✅ Termin erfolgreich verknüpft', 'success');
          dialog.classList.remove('active');
          setTimeout(() => dialog.remove(), 200);
          this.loadAuslastungDragDrop?.();
        } catch (err) {
          document.getElementById('verknuepfenFehler').textContent = 'Fehler: ' + err.message;
          document.getElementById('verknuepfenFehler').style.display = '';
        }

      } else if (action === 'trennen') {
        try {
          await TermineService.update(terminId, {
            erweiterung_von_id: null,
            ist_erweiterung: 0
          });
          if (this.termineById[terminId]) {
            this.termineById[terminId].erweiterung_von_id = null;
            this.termineById[terminId].ist_erweiterung = 0;
          }
          this.showToast('✅ Verknüpfung aufgehoben', 'success');
          dialog.classList.remove('active');
          setTimeout(() => dialog.remove(), 200);
          this.loadAuslastungDragDrop?.();
        } catch (err) {
          document.getElementById('verknuepfenFehler').textContent = 'Fehler: ' + err.message;
          document.getElementById('verknuepfenFehler').style.display = '';
        }
      }
    });
  });

  dialog.querySelector('.schnell-bearbeitung-overlay').addEventListener('click', () => {
    dialog.classList.remove('active');
    setTimeout(() => dialog.remove(), 200);
  });

  // Enter-Taste im Suchfeld = Suchen
  document.getElementById('verknuepfenTerminNr')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') dialog.querySelector('[data-action="suchen"]').click();
  });

  setTimeout(() => dialog.classList.add('active'), 10);
  setTimeout(() => document.getElementById('verknuepfenTerminNr')?.focus(), 100);
}

// Schnell-Bearbeitungs-Dialog (erweitertes Popup);

  AppClass.prototype.showSchnellBearbeitungDialog = function(termin) {
  // Alten Dialog entfernen falls vorhanden
  const existingDialog = document.getElementById('schnellBearbeitungDialog');
  if (existingDialog) existingDialog.remove();
  
  const terminId = termin.id;
  
  // Aktuelle Werte
  const arbeitenText = this.getTerminArbeitenText(termin);
  const abholzeit = termin.abholung_zeit || termin.abhol_zeit || '';
  const abholDatum = termin.abhol_datum || termin.datum || '';
  
  // Fertigstellungszeit berechnen (Startzeit + Dauer)
  let fertigstellungszeit = '';
  const _fzRaw = termin.fertigstellung_zeit || termin.geplante_fertigstellung;
  if (_fzRaw) {
    // ISO-Datetime → HH:MM konvertieren (für <input type="time">)
    if (_fzRaw.includes('T') || _fzRaw.includes('Z') || _fzRaw.length > 5) {
      try {
        const _d = new Date(_fzRaw);
        if (!isNaN(_d)) fertigstellungszeit = String(_d.getHours()).padStart(2,'0') + ':' + String(_d.getMinutes()).padStart(2,'0');
        else fertigstellungszeit = _fzRaw;
      } catch(e) { fertigstellungszeit = _fzRaw; }
    } else {
      fertigstellungszeit = _fzRaw; // bereits HH:MM
    }
  }
  if (!fertigstellungszeit) {
    // Berechne aus Startzeit + Dauer
    const startzeit = termin.startzeit || termin.bring_zeit || '08:00';
    const dauer = termin.geschaetzte_dauer || this.getTerminGesamtdauer(termin) || 60;
    fertigstellungszeit = this.berechneEndzeit(startzeit, dauer);
  }
  
  // Dialog erstellen
  const dialog = document.createElement('div');
  dialog.id = 'schnellBearbeitungDialog';
  dialog.className = 'schnell-bearbeitung-dialog';
  
  dialog.innerHTML = `
    <div class="schnell-bearbeitung-overlay"></div>
    <div class="schnell-bearbeitung-content">
      <div class="schnell-bearbeitung-header">
        <h3>✏️ ${termin.termin_nr} bearbeiten</h3>
        <button class="schnell-bearbeitung-close" data-action="close">×</button>
      </div>
      
      <div class="schnell-bearbeitung-info">
        <span>🚗 ${termin.kennzeichen || '—'}</span>
        <span>👤 ${termin.kunde_name || 'Unbekannt'}</span>
      </div>
      
      <div class="schnell-bearbeitung-form">
        <div class="form-group">
          <label>🔧 Arbeit / Beschreibung</label>
          <textarea id="schnellArbeit" rows="3" placeholder="Arbeiten beschreiben...">${termin.arbeit || arbeitenText || ''}</textarea>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>📅 Abholdatum</label>
            <input type="date" id="schnellAbholDatum" value="${abholDatum}">
          </div>
          <div class="form-group">
            <label>🕐 Abholzeit</label>
            <input type="time" id="schnellAbholZeit" value="${abholzeit}">
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>🕒 Startzeit</label>
            <input type="time" id="schnellStartzeit" value="${termin.startzeit || termin.bring_zeit || '08:00'}">
          </div>
          <div class="form-group">
            <label>🏁 Fertigstellungszeit</label>
            <input type="time" id="schnellFertigstellung" value="${fertigstellungszeit}">
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>⏱️ Geschätzte Dauer (Min)</label>
            <input type="number" id="schnellDauer" min="0" value="${termin.geschaetzte_zeit || this.getTerminGesamtdauer(termin) || 60}">
          </div>
          <div class="form-group">
            <label>📝 Notizen</label>
            <input type="text" id="schnellNotizen" value="${termin.notizen || ''}" placeholder="Kurze Notiz...">
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>🏷️ Interne Auftragsnummer</label>
            <input type="text" id="schnellInterneAuftragsnummer" value="${termin.interne_auftragsnummer || ''}" placeholder="Optionale interne Nummer...">
          </div>
        </div>
      </div>
      
      <div class="schnell-bearbeitung-footer">
        <button class="btn-schnell-cancel" data-action="close">Abbrechen</button>
        <button class="btn-schnell-save" data-action="speichern">💾 Speichern</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  // Event-Listener
  dialog.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      
      if (action === 'close') {
        this.closeSchnellBearbeitungDialog();
      } else if (action === 'speichern') {
        await this.speichereSchnellBearbeitung(terminId);
      }
    });
  });
  
  // Overlay schließt Dialog
  dialog.querySelector('.schnell-bearbeitung-overlay').addEventListener('click', () => {
    this.closeSchnellBearbeitungDialog();
  });
  
  // Animation
  setTimeout(() => dialog.classList.add('active'), 10);
  
  // Focus auf erstes Feld
  setTimeout(() => {
    document.getElementById('schnellArbeit')?.focus();
  }, 100);
}

// Schnell-Bearbeitungs-Dialog schließen;

  AppClass.prototype.closeSchnellBearbeitungDialog = function() {
  const dialog = document.getElementById('schnellBearbeitungDialog');
  if (dialog) {
    dialog.classList.remove('active');
    setTimeout(() => dialog.remove(), 200);
  }
}

// Schnell-Bearbeitung speichern;

  AppClass.prototype.speichereSchnellBearbeitung = async function(terminId) {
  try {
    const updateData = {};
    const termin = this.termineById[terminId];
    
    // Werte aus Formular lesen
    const arbeit = document.getElementById('schnellArbeit')?.value?.trim();
    const abholDatum = document.getElementById('schnellAbholDatum')?.value;
    const abholZeit = document.getElementById('schnellAbholZeit')?.value;
    const startzeit = document.getElementById('schnellStartzeit')?.value;
    const fertigstellung = document.getElementById('schnellFertigstellung')?.value;
    let dauer = parseInt(document.getElementById('schnellDauer')?.value) || null;
    const notizen = document.getElementById('schnellNotizen')?.value?.trim();
    const interneAuftragsnummer = document.getElementById('schnellInterneAuftragsnummer')?.value?.trim();
    
    // Wenn Fertigstellungszeit geändert wurde, berechne neue Dauer
    // Startzeit aus Formular oder aus gespeichertem Termin (Fallback)
    const _effStartzeit = startzeit || termin?.startzeit || termin?.bring_zeit;
    if (fertigstellung && _effStartzeit) {
      const [startH, startM] = _effStartzeit.split(':').map(Number);
      const [endH, endM] = fertigstellung.split(':').map(Number);
      const berechnungsDauer = (endH * 60 + endM) - (startH * 60 + startM);
      if (berechnungsDauer > 0) {
        dauer = berechnungsDauer;
      }
    }
    
    // Nur geänderte Felder übernehmen
    if (arbeit !== undefined) updateData.arbeit = arbeit;
    if (abholDatum) updateData.abhol_datum = abholDatum;
    if (abholZeit) updateData.abholung_zeit = abholZeit;
    if (startzeit) updateData.startzeit = startzeit;
    if (fertigstellung) {
      // HH:MM → ISO-Datetime rekonstruieren für DB-Konsistenz
      const _datumStr = abholDatum || termin.abhol_datum || termin.datum;
      if (_datumStr) {
        try {
          const _iso = new Date(`${_datumStr}T${fertigstellung}:00`);
          updateData.fertigstellung_zeit = isNaN(_iso) ? fertigstellung : _iso.toISOString();
        } catch(e) { updateData.fertigstellung_zeit = fertigstellung; }
      } else {
        updateData.fertigstellung_zeit = fertigstellung;
      }
    }
    if (dauer) {
      // Bei "in_arbeit" oder "abgeschlossen" -> tatsaechliche_zeit für Balkenlänge
      // Sonst -> geschaetzte_zeit
      if (termin && (termin.status === 'in_arbeit' || termin.status === 'abgeschlossen')) {
        updateData.tatsaechliche_zeit = dauer;
      } else {
        updateData.geschaetzte_zeit = dauer;
      }
      // _dauer_override in arbeitszeiten_details speichern, damit getTerminGesamtdauer
      // den explizit gesetzten Wert gegenüber dem Einzel-Arbeiten-Summe bevorzugt.
      try {
        const existingDet = termin?.arbeitszeiten_details
          ? (typeof termin.arbeitszeiten_details === 'string'
              ? JSON.parse(termin.arbeitszeiten_details)
              : { ...termin.arbeitszeiten_details })
          : {};
        existingDet._dauer_override = dauer;
        updateData.arbeitszeiten_details = JSON.stringify(existingDet);
      } catch (e) {
        updateData.arbeitszeiten_details = JSON.stringify({ _dauer_override: dauer });
      }
    }
    if (notizen !== undefined) updateData.notizen = notizen;
    if (interneAuftragsnummer !== undefined) updateData.interne_auftragsnummer = interneAuftragsnummer;
    
    // Speichern
    await TermineService.update(terminId, updateData);
    
    // Cache aktualisieren
    if (this.termineById[terminId]) {
      Object.assign(this.termineById[terminId], updateData);
    }
    
    // Dialog schließen
    this.closeSchnellBearbeitungDialog();
    
    // Feedback
    this.showToast('✅ Termin aktualisiert', 'success');
    
    // Auslastung neu laden falls aktiv
    if (document.getElementById('auslastung-dragdrop')?.classList.contains('active')) {
      this.loadAuslastungDragDrop();
    }
    
  } catch (error) {
    console.error('Fehler beim Speichern:', error);
    this.showToast('❌ Fehler beim Speichern', 'error');
  }
}

// Schnell-Status setzen;

  AppClass.prototype.setzeSchnellStatus = async function(terminId, neuerStatus, tatsaechlicheMinuten = null) {
  try {
    const updateData = { status: neuerStatus };
    
    // Bei Abschluss: tatsächliche Zeit setzen
    if (neuerStatus === 'abgeschlossen' && tatsaechlicheMinuten !== null) {
      updateData.tatsaechliche_zeit = tatsaechlicheMinuten;
    }

    // Bei "in_arbeit": Wenn früher gestartet als geplant → tatsächliche Startzeit speichern
    if (neuerStatus === 'in_arbeit') {
      const termin = this.termineById[terminId];
      if (termin) {
        const jetzt = new Date();
        const jetztZeit = String(jetzt.getHours()).padStart(2, '0') + ':' + String(jetzt.getMinutes()).padStart(2, '0');
        const geplanteStartzeit = termin.startzeit || termin.bring_zeit;
        if (geplanteStartzeit && jetztZeit < geplanteStartzeit) {
          updateData.startzeit = jetztZeit;
          updateData.bring_zeit = jetztZeit;
          console.log(`[Vorrücken] Termin ${terminId}: früher gestartet (${geplanteStartzeit} → ${jetztZeit})`);
        }
      }
    }
    
    await TermineService.update(terminId, updateData);
    
    // Cache aktualisieren
    if (this.termineById[terminId]) {
      this.termineById[terminId].status = neuerStatus;
      if (tatsaechlicheMinuten !== null) {
        this.termineById[terminId].tatsaechliche_zeit = tatsaechlicheMinuten;
      }
      if (updateData.startzeit) {
        this.termineById[terminId].startzeit = updateData.startzeit;
        this.termineById[terminId].bring_zeit = updateData.bring_zeit;
      }
    }
    
    // Dialog schließen
    this.closeSchnellStatusDialog();
    
    // Feedback
    const statusEmoji = {
      'geplant': '🔵',
      'in_arbeit': '🔧',
      'abgeschlossen': '✅'
    };
    
    let message = `${statusEmoji[neuerStatus] || '✓'} Status geändert: ${neuerStatus.replace('_', ' ')}`;
    if (neuerStatus === 'abgeschlossen' && tatsaechlicheMinuten !== null) {
      const zeitText = tatsaechlicheMinuten >= 60 
        ? `${Math.floor(tatsaechlicheMinuten/60)}h ${tatsaechlicheMinuten%60}min`
        : `${tatsaechlicheMinuten} Min`;
      message += ` (Arbeitszeit: ${zeitText})`;
    }
    this.showToast(message, 'success');
    
    // Timeline aktualisieren (visuell den Balken kürzen bei Abschluss)
    if (neuerStatus === 'abgeschlossen' && tatsaechlicheMinuten !== null) {
      this.updateTimelineBlockVisual(terminId, tatsaechlicheMinuten);
    } else {
      // Nur Status-Klasse aktualisieren
      this.updateTimelineBlockStatus(terminId, neuerStatus);
    }
    
    // Nachrücken: Folge-Termine der selben Person verschieben
    if (neuerStatus === 'in_arbeit' || neuerStatus === 'abgeschlossen') {
      const termin = this.termineById[terminId];
      if (termin) {
        this._nachrueckenFuerTermin(termin).catch(e => console.warn('Nachrücken fehlgeschlagen:', e));
      }
    }

    // Dashboard und andere Views aktualisieren
    this.loadDashboard();
    await this.loadHeuteTermine();

    // Planungsansicht komplett neu laden falls aktiv (Fallback für korrekte Balkendarstellung)
    const planungTab = document.getElementById('auslastung-dragdrop');
    if (planungTab && planungTab.classList.contains('active')) {
      setTimeout(() => this.loadAuslastungDragDrop(), 500);
    }
    
  } catch (error) {
    console.error('Fehler beim Status-Wechsel:', error);
    this.showToast('❌ Fehler beim Status-Wechsel', 'error');
  }
}

// Timeline-Block Status visuell aktualisieren;

  AppClass.prototype.updateTimelineBlockStatus = function(terminId, neuerStatus) {
  // Status-Farben für border-left (überschreibt Inline-Styles)
  const statusFarben = {
    'geplant': '#1d4ed8',
    'in_arbeit': '#b45309',
    'in-arbeit': '#b45309',
    'abgeschlossen': '#047857'
  };
  
  // Status-Hintergründe
  const statusHintergrund = {
    'geplant': 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
    'in_arbeit': 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
    'in-arbeit': 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
    'abgeschlossen': 'linear-gradient(135deg, #10b981 0%, #34d399 100%)'
  };
  
  const statusKey = neuerStatus.toLowerCase().replace(' ', '-');
  
  const block = document.getElementById(`timeline-termin-${terminId}`);
  if (block) {
    // Alte Status-Klassen entfernen
    block.classList.remove('status-geplant', 'status-in_arbeit', 'status-in-arbeit', 'status-abgeschlossen', 'status-unterbrochen');
    // Neue Status-Klasse hinzufügen
    block.classList.add(`status-${statusKey}`);
    // Inline-Styles direkt setzen um CSS zu überschreiben
    if (statusFarben[statusKey]) {
      block.style.borderLeft = `4px solid ${statusFarben[statusKey]}`;
    }
    if (statusHintergrund[statusKey]) {
      block.style.background = statusHintergrund[statusKey];
    }
  }
  
  // Auch Arbeit-Blöcke aktualisieren
  document.querySelectorAll(`[id^="timeline-arbeit-${terminId}-"]`).forEach(arbeitBlock => {
    arbeitBlock.classList.remove('status-geplant', 'status-in_arbeit', 'status-in-arbeit', 'status-abgeschlossen', 'status-unterbrochen');
    arbeitBlock.classList.add(`status-${statusKey}`);
    // Inline-Styles direkt setzen um CSS zu überschreiben
    if (statusFarben[statusKey]) {
      arbeitBlock.style.borderLeft = `4px solid ${statusFarben[statusKey]}`;
    }
    if (statusHintergrund[statusKey]) {
      arbeitBlock.style.background = statusHintergrund[statusKey];
    }
  });
}

// Nachrücken: Folge-Termine einer Person neu berechnen und nach vorne verschieben;

  AppClass.prototype._nachrueckenFuerTermin = async function(termin) {
  if (!termin || !termin.datum) return;

  let personId = null;
  let personTyp = null;

  // Person aus arbeitszeiten_details._gesamt_mitarbeiter_id ermitteln
  if (termin.arbeitszeiten_details) {
    try {
      const details = typeof termin.arbeitszeiten_details === 'string'
        ? JSON.parse(termin.arbeitszeiten_details)
        : termin.arbeitszeiten_details;
      if (details._gesamt_mitarbeiter_id && details._gesamt_mitarbeiter_id.id) {
        personId = details._gesamt_mitarbeiter_id.id;
        personTyp = details._gesamt_mitarbeiter_id.type || 'mitarbeiter';
      }
    } catch (e) { /* ignorieren */ }
  }

  // Fallback: direkte mitarbeiter_id-Spalte
  if (!personId && termin.mitarbeiter_id) {
    personId = termin.mitarbeiter_id;
    personTyp = 'mitarbeiter';
  }

  if (!personId) return;

  try {
    await ApiService.post('/termine/berechne-zeiten-neu', {
      personId,
      personTyp,
      datum: termin.datum
    });
  } catch (e) {
    console.warn('Nachrücken-API Fehler:', e);
  }
}

// Timeline-Block visuell kürzen (bei Abschluss mit tatsächlicher Zeit);

  AppClass.prototype.updateTimelineBlockVisual = function(terminId, tatsaechlicheMinuten) {
  // Status immer aktualisieren – auch für Multi-Arbeit-Blöcke (timeline-arbeit-{id}-*),
  // die kein korrespondierendes timeline-termin-{id} Element besitzen.
  this.updateTimelineBlockStatus(terminId, 'abgeschlossen');

  const pixelPerMinute = 100 / 60;

  const block = document.getElementById(`timeline-termin-${terminId}`);
  if (block) {
    
    // Ursprüngliche Dauer aus data-Attribut holen
    const originalDauer = parseInt(block.dataset.dauer) || 0;
    
    // Balken auf tatsächliche Dauer anpassen (kürzen oder verlängern)
    if (tatsaechlicheMinuten !== originalDauer && tatsaechlicheMinuten > 0) {
      const neueBreite = Math.max(tatsaechlicheMinuten * pixelPerMinute, 40); // Mindestbreite 40px
      
      // Animation für den Balken
      block.style.transition = 'width 0.3s ease-out';
      block.style.width = `${neueBreite}px`;
      block.dataset.dauer = tatsaechlicheMinuten;
    }
    
    // Termin-Info aktualisieren
    const infoElement = block.querySelector('.termin-info');
    if (infoElement) {
      const zeitText = tatsaechlicheMinuten >= 60 
        ? `${Math.floor(tatsaechlicheMinuten/60)}h ${tatsaechlicheMinuten%60 > 0 ? (tatsaechlicheMinuten%60) + 'min' : ''}`.trim()
        : `${tatsaechlicheMinuten} min`;
      const kundenName = infoElement.textContent.split('•')[0].trim();
      infoElement.innerHTML = `${kundenName} • ✅ ${zeitText}`;
    }
    
    // Fortsetzungs-Teil entfernen falls vorhanden (nur wenn gekürzt)
    if (tatsaechlicheMinuten < originalDauer) {
      const teil2 = document.getElementById(`timeline-termin-${terminId}-teil2`);
      if (teil2) {
        teil2.style.transition = 'opacity 0.3s ease-out';
        teil2.style.opacity = '0';
        setTimeout(() => teil2.remove(), 300);
      }
    }
  }

  // Multi-Arbeit-Blöcke aktualisieren (timeline-arbeit-{id}-*)
  const arbeitBloecke = document.querySelectorAll(`[id^="timeline-arbeit-${terminId}-"]`);
  if (arbeitBloecke.length > 0) {
    // Per-Arbeit tatsächliche Zeiten aus Cache holen (falls verfügbar)
    let perArbeitZeiten = null;
    const termin = this.termineById ? this.termineById[terminId] : null;
    if (termin && termin.arbeitszeiten_details) {
      try {
        const details = typeof termin.arbeitszeiten_details === 'string'
          ? JSON.parse(termin.arbeitszeiten_details) : termin.arbeitszeiten_details;
        if (Array.isArray(details)) {
          perArbeitZeiten = {};
          details.forEach((a, idx) => {
            if (parseInt(a.tatsaechliche_zeit) > 0) {
              perArbeitZeiten[idx] = parseInt(a.tatsaechliche_zeit);
            }
          });
          if (Object.keys(perArbeitZeiten).length === 0) perArbeitZeiten = null;
        }
      } catch (e) { /* ignorieren */ }
    }

    // Gesamte geplante Dauer aller Haupt-Arbeit-Blöcke berechnen (für proportionale Verteilung)
    let gesamtGeplanteZeit = 0;
    const hauptBloecke = [];
    arbeitBloecke.forEach(ab => {
      if (!ab.id.endsWith('-teil2')) {
        gesamtGeplanteZeit += parseInt(ab.dataset.originalDauer) || parseInt(ab.dataset.dauer) || 0;
        hauptBloecke.push(ab);
      }
    });

    if (gesamtGeplanteZeit > 0 || hauptBloecke.length > 0) {
      // Erst alle teil2-Fortsetzungsblöcke entfernen (Pausen-Splits)
      arbeitBloecke.forEach(ab => {
        if (ab.id.endsWith('-teil2')) {
          ab.style.transition = 'opacity 0.3s ease-out';
          ab.style.opacity = '0';
          setTimeout(() => ab.remove(), 300);
        }
      });

      // Jeden Hauptblock einzeln aktualisieren
      hauptBloecke.forEach(ab => {
        const arbeitIndex = parseInt(ab.dataset.arbeitIndex);
        const blockOriginalDauer = parseInt(ab.dataset.originalDauer) || parseInt(ab.dataset.dauer) || 0;

        // Dauer bestimmen: per-Arbeit tatsächliche Zeit > proportional aus Gesamt
        let neueDauer;
        if (perArbeitZeiten && perArbeitZeiten[arbeitIndex] !== undefined) {
          neueDauer = perArbeitZeiten[arbeitIndex];
        } else if (gesamtGeplanteZeit > 0) {
          neueDauer = Math.max(1, Math.round(tatsaechlicheMinuten * (blockOriginalDauer / gesamtGeplanteZeit)));
        } else {
          neueDauer = Math.round(tatsaechlicheMinuten / hauptBloecke.length);
        }

        const neueBreite = Math.max(neueDauer * pixelPerMinute, 40);

        ab.style.transition = 'width 0.3s ease-out';
        ab.style.width = `${neueBreite}px`;
        ab.dataset.dauer = neueDauer;

        // Abgeschlossen-Klasse hinzufügen
        ab.classList.add('arbeit-abgeschlossen');

        // Dauer-Text aktualisieren
        const dauerInfo = ab.querySelector('.termin-info:not(.arbeit-name)');
        if (dauerInfo) {
          const dauerText = neueDauer >= 60
            ? `${Math.floor(neueDauer/60)}h ${neueDauer%60 > 0 ? (neueDauer%60) + 'min' : ''}`.trim()
            : `${neueDauer} min`;
          dauerInfo.textContent = `✅ ${dauerText}`;
        }
      });
    }
  }
}

// Aktuelle Buchungen laden und anzeigen (inkl. manuell gesperrte Autos)






// Ersatzauto-Übersicht laden (Wochen-Ansicht Mo-So)

// Gibt Wochen für Ersatzauto-Ansicht zurück (5 Wochen, Mo-So)

// Kalenderwoche berechnen




// Neue Funktionen für individuelle Abwesenheiten











// Berufsschul-Turnus für Lehrlinge laden und anzeigen

// Berufsschul-Wochen für einen Lehrling speichern


/**
 * Prüft wie viele andere Termine ±15 Minuten um die eingegebene Bringzeit liegen
 * und zeigt einen Hinweis sowie Vorschläge für freie Zeiten an
 */;

  AppClass.prototype.pruefeBringzeitUeberschneidung = async function(bringzeitInputId, datumInputId, hinweisElementId, excludeTerminId = null) {
  const bringzeitInput = document.getElementById(bringzeitInputId);
  const datumInput = document.getElementById(datumInputId);
  const hinweisElement = document.getElementById(hinweisElementId);
  
  if (!bringzeitInput || !datumInput || !hinweisElement) return;
  
  const bringzeit = bringzeitInput.value;
  const datum = datumInput.value;
  
  // Validiere Eingaben
  if (!bringzeit || !bringzeit.match(/^\d{2}:\d{2}$/) || !datum) {
    hinweisElement.style.display = 'none';
    return;
  }
  
  try {
    // API-Anfrage um Termine mit ähnlicher Bringzeit zu finden
    const response = await TermineService.getBringzeitUeberschneidungen(datum, bringzeit, excludeTerminId);
    
    const anzahl = response.anzahl || 0;
    const termine = response.termine || [];
    const vorschlaege = response.vorschlaege || [];
    
    let hinweisHtml = '';
    
    if (anzahl === 0) {
      hinweisHtml = `<span class="hinweis-icon">✅</span> Keine anderen Kunden um ${bringzeit}`;
      hinweisElement.className = 'bringzeit-hinweis hinweis-ok';
    } else if (anzahl <= 2) {
      const kundenText = termine.map(t => t.kunde_name || t.kennzeichen).slice(0, 2).join(', ');
      hinweisHtml = `<span class="hinweis-icon">ℹ️</span> ${anzahl} Kunde(n) um diese Zeit: ${kundenText}`;
      hinweisElement.className = 'bringzeit-hinweis hinweis-ok';
    } else if (anzahl <= 4) {
      hinweisHtml = `<span class="hinweis-icon">⚠️</span> ${anzahl} Kunden kommen ±15 Min. um ${bringzeit}`;
      hinweisElement.className = 'bringzeit-hinweis hinweis-warnung';
    } else {
      hinweisHtml = `<span class="hinweis-icon">🚨</span> ${anzahl} Kunden kommen ±15 Min. um ${bringzeit} - Zeitfenster voll!`;
      hinweisElement.className = 'bringzeit-hinweis hinweis-kritisch';
    }
    
    // Vorschläge für freie Zeiten anzeigen (wenn es Überschneidungen gibt)
    if (anzahl > 0 && vorschlaege.length > 0) {
      const freieZeiten = vorschlaege.filter(v => v.frei).slice(0, 4);
      const wenigBelegteZeiten = vorschlaege.filter(v => !v.frei).slice(0, 2);
      
      if (freieZeiten.length > 0 || wenigBelegteZeiten.length > 0) {
        hinweisHtml += `<div class="bringzeit-vorschlaege">`;
        hinweisHtml += `<span class="vorschlaege-label">💡 Freie Zeiten:</span>`;
        
        freieZeiten.forEach(v => {
          hinweisHtml += `<button type="button" class="vorschlag-btn vorschlag-frei" data-zeit="${v.zeit}" data-input="${bringzeitInputId}" title="Komplett frei">${v.zeit}</button>`;
        });
        
        wenigBelegteZeiten.forEach(v => {
          hinweisHtml += `<button type="button" class="vorschlag-btn vorschlag-wenig" data-zeit="${v.zeit}" data-input="${bringzeitInputId}" title="1 Kunde um diese Zeit">${v.zeit}</button>`;
        });
        
        hinweisHtml += `</div>`;
      }
    }
    
    hinweisElement.innerHTML = hinweisHtml;
    hinweisElement.style.display = 'block';
    
    // Event-Listener für Vorschlag-Buttons hinzufügen
    hinweisElement.querySelectorAll('.vorschlag-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const zeit = btn.dataset.zeit;
        const inputId = btn.dataset.input;
        const input = document.getElementById(inputId);
        if (input) {
          input.value = zeit;
          // Trigger change event um die Prüfung neu auszuführen
          input.dispatchEvent(new Event('change'));
        }
      });
    });
    
  } catch (error) {
    console.error('Fehler bei Bringzeit-Prüfung:', error);
    hinweisElement.style.display = 'none';
  }
};

  AppClass.prototype.stepZeitKorrektur = function(inputId, autoId, deltaId, step) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const current = parseFloat(input.value);
  const baseMin = parseInt(document.getElementById(autoId)?.value || '0', 10);
  const baseH = Number.isFinite(baseMin) ? Math.round(baseMin / 15) * 0.25 : 0.5;
  const cur = Number.isFinite(current) && current > 0 ? current : baseH;
  const next = Math.max(0.25, Math.round((cur + step) * 4) / 4);
  input.value = String(next);
  this.updateZeitKorrekturDelta(inputId, autoId, deltaId);
};

  AppClass.prototype.setZeitkorrektur = function(inputId, autoId, deltaId, minuten) {
  const input = document.getElementById(inputId);
  if (!input) return;
  // Minuten → Stunden, auf 0.25 gerundet
  input.value = String(Math.round(minuten / 15) * 0.25);
  this.updateZeitKorrekturDelta(inputId, autoId, deltaId);
};

  AppClass.prototype.updateZeitKorrekturDelta = function(inputId, autoId, deltaId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const valH = parseFloat(input.value);
  if (!Number.isFinite(valH) || valH <= 0) return;
  const valMin = Math.round(valH * 60);

  // Header immer auf Stepper-Wert setzen
  const wertId = deltaId.replace('Delta', 'Wert');
  const wertEl = document.getElementById(wertId);
  if (wertEl) {
    const std = Math.floor(valMin / 60);
    const min = valMin % 60;
    let zeitStr = std > 0 ? `${std} h${min > 0 ? ` ${min} min` : ''}` : `${min} min`;
    wertEl.textContent = zeitStr;
    if (valMin <= 60) wertEl.style.color = '#27ae60';
    else if (valMin <= 180) wertEl.style.color = '#4a90e2';
    else wertEl.style.color = '#e67e22';
  }
};

  AppClass.prototype.getGeschaetzteZeit = function(arbeitenListe) {
  // Sichtbares Feld speichert STUNDEN (z.B. 1.5) → in Minuten umrechnen
  const zeitFeld = document.getElementById('geschaetzte_zeit');
  const input = zeitFeld ? parseFloat(zeitFeld.value) : null;
  if (Number.isFinite(input) && input > 0) {
    return Math.round(input * 60);
  }

  // Edit-Modal manuelles Override-Feld (ebenfalls Stunden)
  const editZeitFeld = document.getElementById('edit_geschaetzte_zeit');
  const editInput = editZeitFeld ? parseFloat(editZeitFeld.value) : null;
  if (Number.isFinite(editInput) && editInput > 0) {
    return Math.round(editInput * 60);
  }

  // KI-Vorschlag aus Zeitschätzungs-Anzeige (Neu-Formular)
  const autoFeld = document.getElementById('geschaetzte_zeit_auto');
  if (autoFeld) {
    const autoMinuten = parseInt(autoFeld.value, 10);
    if (Number.isFinite(autoMinuten) && autoMinuten > 0) {
      return autoMinuten;
    }
  }

  // KI-Vorschlag aus Zeitschätzungs-Anzeige (Edit-Modal)
  const editAutoFeld = document.getElementById('edit_geschaetzte_zeit_auto');
  if (editAutoFeld) {
    const editAutoMinuten = parseInt(editAutoFeld.value, 10);
    if (Number.isFinite(editAutoMinuten) && editAutoMinuten > 0) {
      return editAutoMinuten;
    }
  }

  let summe = 0;
  arbeitenListe.forEach(arbeit => {
    const matchZeit = this.findArbeitszeit(arbeit);
    if (Number.isFinite(matchZeit)) {
      summe += matchZeit;
    } else {
      summe += 30;
    }
  });

  return summe > 0 ? summe : 30;
}

// Normalisiert Text für Fuzzy-Vergleich (So/Wi → so wi, Brems-Service → brems service);

  AppClass.prototype._normalizeForMatch = function(text) {
  return text.toLowerCase()
    .replace(/[\/\-_\.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

  AppClass.prototype.findArbeitszeit = function(arbeitName) {
  if (!this.arbeitszeiten || !arbeitName) return null;
  const suche = arbeitName.toLowerCase();
  const normSuche = this._normalizeForMatch(arbeitName);

  // 1. Exakte Bezeichnung
  let match = this.arbeitszeiten.find(a => a.bezeichnung.toLowerCase() === suche);
  if (match) return match.standard_minuten;

  // 2. Exakter Alias
  match = this.arbeitszeiten.find(a => {
    if (!a.aliase) return false;
    return a.aliase.split(',').map(al => al.trim().toLowerCase()).includes(suche);
  });
  if (match) return match.standard_minuten;

  // 3. Fuzzy: normalisierter Vergleich, Teilwort, Wort-Überlappung
  const suchWorte = normSuche.split(' ').filter(w => w.length >= 3);
  match = this.arbeitszeiten.find(a => {
    const normBez = this._normalizeForMatch(a.bezeichnung);
    // Normalisiert exakt
    if (normSuche === normBez) return true;
    // Teilwort (Suche in Bezeichnung oder umgekehrt)
    if (normBez.includes(normSuche) || normSuche.includes(normBez)) return true;
    // Wort-Überlappung
    const bezWorte = normBez.split(' ').filter(w => w.length >= 3);
    if (suchWorte.length > 0 && bezWorte.length > 0) {
      const ueberlappung = suchWorte.filter(sw => bezWorte.some(bw => bw.includes(sw) || sw.includes(bw)));
      if (ueberlappung.length > 0) return true;
    }
    // Alias fuzzy
    if (a.aliase) {
      const aliasListe = a.aliase.split(',').map(al => this._normalizeForMatch(al));
      for (const alias of aliasListe) {
        if (!alias) continue;
        if (alias === normSuche) return true;
        if (alias.includes(normSuche) || normSuche.includes(alias)) return true;
        const aliasWorte = alias.split(' ').filter(w => w.length >= 3);
        if (suchWorte.length > 0 && aliasWorte.length > 0) {
          const ueberlappung = suchWorte.filter(sw => aliasWorte.some(aw => aw.includes(sw) || sw.includes(aw)));
          if (ueberlappung.length > 0) return true;
        }
      }
    }
    return false;
  });
  if (match) return match.standard_minuten;

  return null;
}

// Fuzzy-Suche: Findet die passende Standardzeit inkl. des gefundenen Eintrags (für Anzeige);

  AppClass.prototype.findArbeitszeitMitDetails = function(arbeitName) {
  if (!this.arbeitszeiten || !arbeitName) return null;
  const suche = arbeitName.toLowerCase();
  const normSuche = this._normalizeForMatch(arbeitName);

  // 1. Exakte Bezeichnung
  let match = this.arbeitszeiten.find(a => a.bezeichnung.toLowerCase() === suche);
  if (match) return { ...match, matchTyp: 'exakt' };

  // 2. Exakter Alias
  match = this.arbeitszeiten.find(a => {
    if (!a.aliase) return false;
    return a.aliase.split(',').map(al => al.trim().toLowerCase()).includes(suche);
  });
  if (match) return { ...match, matchTyp: 'alias' };

  // 3. Fuzzy
  const suchWorte = normSuche.split(' ').filter(w => w.length >= 3);
  match = this.arbeitszeiten.find(a => {
    const normBez = this._normalizeForMatch(a.bezeichnung);
    if (normSuche === normBez) return true;
    if (normBez.includes(normSuche) || normSuche.includes(normBez)) return true;
    const bezWorte = normBez.split(' ').filter(w => w.length >= 3);
    if (suchWorte.length > 0 && bezWorte.length > 0) {
      const ueberlappung = suchWorte.filter(sw => bezWorte.some(bw => bw.includes(sw) || sw.includes(bw)));
      if (ueberlappung.length > 0) return true;
    }
    if (a.aliase) {
      const aliasListe = a.aliase.split(',').map(al => this._normalizeForMatch(al));
      for (const alias of aliasListe) {
        if (!alias) continue;
        if (alias === normSuche || alias.includes(normSuche) || normSuche.includes(alias)) return true;
        const aliasWorte = alias.split(' ').filter(w => w.length >= 3);
        if (suchWorte.length > 0 && aliasWorte.length > 0) {
          const ueberlappung = suchWorte.filter(sw => aliasWorte.some(aw => aw.includes(sw) || sw.includes(aw)));
          if (ueberlappung.length > 0) return true;
        }
      }
    }
    return false;
  });
  if (match) return { ...match, matchTyp: 'fuzzy' };

  return null;
};

  AppClass.prototype.parseArbeiten = function(text) {
  // Teile nach Zeilenumbruch, Komma ODER ||
  return text
    .split(/[\r\n,]+|\s*\|\|\s*/)
    .map(t => t.trim())
    .filter(Boolean);
};

  AppClass.prototype.formatMinutesToHours = function(minuten) {
  return formatMinutesToHours(minuten);
};

  AppClass.prototype.startZeitleisteNowLineUpdate = function() {
  // Vorherigen Interval stoppen falls vorhanden
  if (this.nowLineInterval) {
    clearInterval(this.nowLineInterval);
    this.nowLineInterval = null;
  }
  
  const updateZeitleisteMarker = () => {
    const heute = this.formatDateLocal(new Date());
    const selectedDatum = document.getElementById('auslastungDatum')?.value;
    
    // Nur aktualisieren wenn heute ausgewählt ist
    if (selectedDatum !== heute) {
      // Alle Marker entfernen wenn nicht heute
      document.querySelectorAll('.zeitleiste-jetzt-marker').forEach(m => m.remove());
      return;
    }
    
    const START_HOUR = 8;
    const END_HOUR = 18;
    const TOTAL_HOURS = END_HOUR - START_HOUR;
    
    const now = new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;
    
    // Außerhalb der sichtbaren Stunden
    if (currentHour < START_HOUR || currentHour > END_HOUR) {
      document.querySelectorAll('.zeitleiste-jetzt-marker').forEach(m => m.remove());
      return;
    }
    
    const jetztPosition = ((currentHour - START_HOUR) / TOTAL_HOURS) * 100;
    
    // Aktualisiere alle existierenden Marker
    document.querySelectorAll('.zeitleiste-jetzt-marker').forEach(marker => {
      marker.style.left = `${jetztPosition}%`;
    });
    
    // Falls noch keine Marker existieren, aber Zeilen da sind, füge sie hinzu
    document.querySelectorAll('.zeitleiste-row').forEach(row => {
      const timeline = row.querySelector('.zeitleiste-timeline');
      if (timeline && !timeline.querySelector('.zeitleiste-jetzt-marker')) {
        const marker = document.createElement('div');
        marker.className = 'zeitleiste-jetzt-marker';
        marker.style.left = `${jetztPosition}%`;
        timeline.appendChild(marker);
      }
    });
  };
  
  // Initial aktualisieren
  updateZeitleisteMarker();
  
  // Alle 60 Sekunden aktualisieren
  this.nowLineInterval = setInterval(updateZeitleisteMarker, 60000);
};

  AppClass.prototype.renderZeitleiste = function(container, arbeitenMap, ohneZuordnung, mitarbeiter, lehrlinge, mittagspauseDauer = 30, abwesendeMitarbeiter = new Set(), abwesendeLehrlinge = new Set(), datum = null) {
  // Prüfe ob es überhaupt Mitarbeiter oder Lehrlinge gibt
  const hatPersonal = mitarbeiter.length > 0 || lehrlinge.length > 0;
  
  // Keine Arbeiten und kein Personal?
  if (!hatPersonal) {
    container.innerHTML = `
      <div class="zeitleiste-leer">
        <span class="zeitleiste-leer-icon">📅</span>
        <p>Keine Mitarbeiter oder Lehrlinge vorhanden</p>
      </div>
    `;
    return;
  }

  const START_HOUR = 8;
  const END_HOUR = 18;
  const TOTAL_HOURS = END_HOUR - START_HOUR; // 10 Stunden

  let html = '';

  // Aktuelle Zeit Marker Position berechnen (falls heute)
  const heute = this.formatDateLocal(new Date());
  const selectedDatum = datum || document.getElementById('auslastungDatum')?.value || heute;
  let jetztMarkerHtml = '';
  
  if (selectedDatum === heute) {
    const now = new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;
    if (currentHour >= START_HOUR && currentHour <= END_HOUR) {
      const jetztPosition = ((currentHour - START_HOUR) / TOTAL_HOURS) * 100;
      jetztMarkerHtml = `<div class="zeitleiste-jetzt-marker" style="left: ${jetztPosition}%;"></div>`;
    }
  }

  // Mitarbeiter-Zeilen
  for (const ma of mitarbeiter) {
    const key = `m_${ma.id}`;
    const data = arbeitenMap.get(key);
    const arbeiten = data ? data.arbeiten : [];
    const mittagspauseStart = ma.mittagspause_start || '12:00';
    const istAbwesend = abwesendeMitarbeiter.has(ma.id);
    const abwesendStyle = istAbwesend ? 'abwesend' : false;
    const nameDisplay = istAbwesend ? `${ma.name} 🏥` : ma.name;
    
    html += this.renderZeitleisteRow(nameDisplay, 'Mitarbeiter', istAbwesend ? [] : arbeiten, START_HOUR, END_HOUR, TOTAL_HOURS, jetztMarkerHtml, abwesendStyle, mittagspauseStart, ma.pausenzeit_minuten || mittagspauseDauer);
  }

  // Lehrling-Zeilen
  for (const lehrling of lehrlinge) {
    const key = `l_${lehrling.id}`;
    const data = arbeitenMap.get(key);
    const arbeiten = data ? data.arbeiten : [];
    const mittagspauseStart = lehrling.mittagspause_start || '12:00';
    const istAbwesend = abwesendeLehrlinge.has(lehrling.id);
    
    // Prüfe ob Lehrling in Berufsschule ist
    const schule = this.isLehrlingInBerufsschule(lehrling, selectedDatum);
    const berufsschulBadge = schule.inSchule ? ` 📚 KW ${schule.kw}` : '';
    const abwesendBadge = istAbwesend ? ' 🏥' : '';
    
    // Rowstyle: abwesend hat Priorität, dann berufsschule
    let rowStyle = false;
    if (istAbwesend) {
      rowStyle = 'abwesend';
    } else if (schule.inSchule) {
      rowStyle = 'berufsschule';
    }
    
    html += this.renderZeitleisteRow(lehrling.name + berufsschulBadge + abwesendBadge, 'Lehrling', istAbwesend ? [] : arbeiten, START_HOUR, END_HOUR, TOTAL_HOURS, jetztMarkerHtml, rowStyle, mittagspauseStart, lehrling.pausenzeit_minuten || mittagspauseDauer);
  }

  // Nicht zugeordnete Arbeiten - ohne Zeiteinordnung, hintereinander
  if (ohneZuordnung.length > 0) {
    html += this.renderNichtZugeordnetRow(ohneZuordnung, TOTAL_HOURS);
  }

  container.innerHTML = html;
}

// Spezielle Render-Funktion für "Nicht zugeordnet" - Blöcke hintereinander ohne Zeiteinordnung;

  AppClass.prototype.renderNichtZugeordnetRow = function(arbeiten, totalHours) {
  // Berechne Gesamtzeit für proportionale Balken
  const gesamtMinuten = arbeiten.reduce((sum, a) => sum + (a.zeitMinuten || 60), 0);
  
  let bloeckeHtml = '';
  for (const arbeit of arbeiten) {
    const zeitMinuten = arbeit.zeitMinuten || 60;
    // Breite proportional zur Zeit (relativ zur Gesamtzeit, max 100%)
    const widthPercent = Math.max(5, (zeitMinuten / gesamtMinuten) * 100);
    
    // Status-Klasse
    let statusClass = 'status-geplant';
    if (arbeit.status === 'in_arbeit') statusClass = 'status-in-arbeit';
    else if (arbeit.status === 'abgeschlossen') statusClass = 'status-abgeschlossen';
    else if (arbeit.status === 'wartend') statusClass = 'status-wartend';
    else if (arbeit.status === 'unterbrochen') statusClass = 'status-unterbrochen';
    
    // Schwebend-Klasse
    const schwebendClass = arbeit.istSchwebend ? 'schwebend' : '';
    
    // Schwebend-Badge
    const schwebendBadge = arbeit.istSchwebend ? ' ⏸️' : '';
    
    // Erweiterungs-Badge
    const erweiterungBadge = arbeit.erweiterungAnzahl > 0 
      ? ` <span class="zeitleiste-erweiterung-badge" onclick="event.stopPropagation(); app.showVerknuepfteTermine(${arbeit.terminId})" title="${arbeit.erweiterungAnzahl} Erweiterung(en)">🔗${arbeit.erweiterungAnzahl}</span>` 
      : '';
    
    // Erweiterungs-Block-Klasse
    const erweiterungClass = arbeit.istErweiterung ? 'erweiterung-block' : '';
    
    // Zeit-Info für Tooltip und Anzeige
    const bringZeitText = arbeit.bringZeit ? `🚗↓ ${arbeit.bringZeit}` : '';
    const abholZeitText = arbeit.abholungZeit ? `🚗↑ ${arbeit.abholungZeit}` : '';
    const zeitInfo = [bringZeitText, abholZeitText].filter(t => t).join(' • ');
    
    // Tooltip
    const tooltip = `${arbeit.terminNr || ''}${schwebendBadge}&#10;${arbeit.kunde || '-'}&#10;${arbeit.kennzeichen || '-'}&#10;${arbeit.arbeit}&#10;⏱️ Dauer: ${zeitMinuten} Min. (${(zeitMinuten/60).toFixed(1)} h)${arbeit.bringZeit ? '&#10;🚗↓ Bringzeit: ' + arbeit.bringZeit : ''}${arbeit.abholungZeit ? '&#10;🚗↑ Abholzeit: ' + arbeit.abholungZeit : ''}${arbeit.erweiterungAnzahl > 0 ? '&#10;🔗 ' + arbeit.erweiterungAnzahl + ' Erweiterung(en)' : ''}${arbeit.istErweiterung ? '&#10;🔗 ERWEITERUNG' : ''}`;
    
    // Inhalt mit Bring/Abholzeit und Arbeitszeit
    const internInlineClass = arbeit.istIntern ? 'intern-termin' : '';
    const content = `
      <div class="zeitleiste-block-nummer">${arbeit.terminNr || '-'}${schwebendBadge}${erweiterungBadge}</div>
      <div class="zeitleiste-block-text">${arbeit.arbeit}</div>
      <div class="zeitleiste-block-zeit">⏱️ ${(zeitMinuten/60).toFixed(1)}h</div>
      ${zeitInfo ? `<div class="zeitleiste-block-zeiten">${zeitInfo}</div>` : ''}
    `;

    bloeckeHtml += `
      <div class="zeitleiste-block-inline ${statusClass} ${schwebendClass} ${erweiterungClass} ${internInlineClass}"
           style="flex: 0 0 ${widthPercent}%; min-width: 80px;"
           title="${tooltip}"
           onclick="app.showTerminDetails(${arbeit.terminId})">
        ${content}
      </div>
    `;
  }
  
  // Gesamtzeit anzeigen
  const gesamtStunden = (gesamtMinuten / 60).toFixed(1);
  
  return `
    <div class="zeitleiste-row nicht-zugeordnet">
      <div class="zeitleiste-person">
        <span class="zeitleiste-person-name">⚠️ Nicht zugeordnet</span>
        <span class="zeitleiste-person-typ">${arbeiten.length} Termin(e) • ${gesamtStunden} h</span>
      </div>
      <div class="zeitleiste-timeline nicht-zugeordnet-timeline">
        <div class="zeitleiste-inline-container">
          ${bloeckeHtml}
        </div>
      </div>
    </div>
  `;
};

  AppClass.prototype.renderZeitleisteRow = function(name, typ, arbeiten, startHour, endHour, totalHours, jetztMarkerHtml, isSpecial = false, mittagspauseStart = null, mittagspauseDauer = 30) {
  // isSpecial kann 'berufsschule', 'abwesend' sein oder true/false für alte Kompatibilität
  let rowClass = 'zeitleiste-row';
  if (isSpecial === true) {
    rowClass = 'zeitleiste-row nicht-zugeordnet';
  } else if (isSpecial === 'berufsschule') {
    rowClass = 'zeitleiste-row berufsschule';
  } else if (isSpecial === 'abwesend') {
    rowClass = 'zeitleiste-row abwesend';
  }
  
  // Gitter erstellen
  let gitterHtml = '<div class="zeitleiste-gitter">';
  for (let h = startHour; h <= endHour; h++) {
    gitterHtml += '<div class="zeitleiste-gitter-stunde"></div>';
  }
  gitterHtml += '</div>';

  // Mittagspause-Block erstellen (falls vorhanden und Dauer > 0 und NICHT abwesend)
  let mittagspauseHtml = '';
  if (mittagspauseStart && mittagspauseDauer > 0 && isSpecial !== 'abwesend') {
    const [pauseH, pauseM] = mittagspauseStart.split(':').map(Number);
    const pauseStartMinuten = pauseH * 60 + pauseM;
    const pauseEndMinuten = pauseStartMinuten + mittagspauseDauer;
    
    // Nur anzeigen wenn im sichtbaren Bereich (8-18 Uhr)
    const displayStart = Math.max(pauseStartMinuten, startHour * 60);
    const displayEnd = Math.min(pauseEndMinuten, endHour * 60);
    
    if (displayEnd > displayStart) {
      const leftPercent = ((displayStart - startHour * 60) / (totalHours * 60)) * 100;
      const widthPercent = ((displayEnd - displayStart) / (totalHours * 60)) * 100;
      const pauseEndZeit = this.minutesToTime(pauseEndMinuten);
      
      // Bei breiteren Blöcken mehr Info anzeigen
      const showLabel = widthPercent > 6;
      const pauseContent = showLabel 
        ? `<span class="zeitleiste-mittagspause-text">Pause</span><span class="zeitleiste-mittagspause-label">${mittagspauseStart} - ${pauseEndZeit}</span>`
        : `<span class="zeitleiste-mittagspause-text"></span>`;
      
      mittagspauseHtml = `
        <div class="zeitleiste-mittagspause" 
             style="left: ${leftPercent}%; width: ${widthPercent}%;"
             title="🍽️ Mittagspause&#10;${mittagspauseStart} - ${pauseEndZeit}&#10;Dauer: ${mittagspauseDauer} Min.">
          ${pauseContent}
        </div>
      `;
    }
  }

  // Arbeitsblöcke erstellen
  let bloeckeHtml = '<div class="zeitleiste-arbeiten">';
  
  // Berechne Mittagspause-Zeiten (in Minuten)
  let pauseStartMinuten = null;
  let pauseEndMinuten = null;
  if (mittagspauseStart && mittagspauseDauer > 0) {
    const [pauseH, pauseM] = mittagspauseStart.split(':').map(Number);
    pauseStartMinuten = pauseH * 60 + pauseM;
    pauseEndMinuten = pauseStartMinuten + mittagspauseDauer;
  }
  
  // Sortiere Arbeiten nach Startzeit
  const sortedArbeiten = [...arbeiten].sort((a, b) => {
    const zeitA = a.startzeit || '';
    const zeitB = b.startzeit || '';
    if (!zeitA && !zeitB) return 0;
    if (!zeitA) return 1;
    if (!zeitB) return -1;
    return zeitA.localeCompare(zeitB);
  });

  // Berechne Positionen für überlappende Blöcke
  let currentEndMinutes = startHour * 60;
  
  // Hilfsfunktion zum Rendern eines einzelnen Blocks
  const renderBlock = (arbeit, blockStartMinutes, blockEndMinutes, istFortsetzung = false) => {
    // Begrenzen auf 8-18 Uhr
    const displayStart = Math.max(blockStartMinutes, startHour * 60);
    const displayEnd = Math.min(blockEndMinutes, endHour * 60);
    
    const leftPercent = ((displayStart - startHour * 60) / (totalHours * 60)) * 100;
    const widthPercent = ((displayEnd - displayStart) / (totalHours * 60)) * 100;
    
    if (widthPercent <= 0) return '';
    
    const statusClass = arbeit.startzeit ? `status-${arbeit.status}` : 'status-keine-zeit';
    const internClass = arbeit.istIntern ? 'intern-termin' : '';
    const startZeitText = this.minutesToTime(blockStartMinutes);
    const endZeitText = this.minutesToTime(blockEndMinutes);
    const dauerMinuten = blockEndMinutes - blockStartMinutes;
    const dauerText = this.formatMinutesToHours(dauerMinuten);
    const auftragsnrText = arbeit.interneAuftragsnummer ? `&#10;Auftrag: ${arbeit.interneAuftragsnummer}` : '';
    const fortsetzungText = istFortsetzung ? ' (Forts.)' : '';
    
    // Hauptanzeige: Kennzeichen bevorzugt, sonst Name (bei internen Terminen)
    const hauptAnzeige = arbeit.kennzeichen ? arbeit.kennzeichen : (arbeit.istIntern ? '🔧 ' + arbeit.kunde : arbeit.kunde);
    const auftragsnrEscaped = arbeit.interneAuftragsnummer ? this.escapeHtml(arbeit.interneAuftragsnummer) : '';
    const schwebendClass = arbeit.istSchwebend ? 'schwebend-block' : '';
    const schwebendBadge = arbeit.istSchwebend ? '<span class="zeitleiste-schwebend-badge">⏸️</span>' : '';
    const schwebendTitleText = arbeit.istSchwebend ? '&#10;⏸️ SCHWEBEND' : '';
    const erweiterungClass = arbeit.istErweiterung ? 'erweiterung-block' : '';
    const erweiterungTitleText = arbeit.istErweiterung ? '&#10;🔗 ERWEITERUNG' : '';
    
    // Verknüpfungs-Badge für Termine mit Erweiterungen (am Ende des Balkens)
    const hatErweiterungen = arbeit.erweiterungAnzahl > 0;
    const erweiterungBadge = hatErweiterungen 
      ? `<span class="zeitleiste-erweiterung-badge-end" onclick="event.stopPropagation(); app.showVerknuepfteTermine(${arbeit.terminId})" title="${arbeit.erweiterungAnzahl} Erweiterung(en) - Klicken zum Anzeigen">🔗</span>` 
      : '';
    const erweiterungBadgeTitleText = hatErweiterungen ? `&#10;🔗 ${arbeit.erweiterungAnzahl} Erweiterung(en)` : '';
    
    // Icon am Ende für Erweiterungs-Termine (die selbst Erweiterungen sind)
    const istErweiterungIcon = arbeit.istErweiterung 
      ? '<span class="zeitleiste-ist-erweiterung-icon" title="Dies ist eine Erweiterung">🔗</span>' 
      : '';
    
    // Mehrteiliger Termin
    const arbeitenAnzahl = arbeit.arbeitenAnzahl || 1;
    
    // Arbeiten-Liste für Tooltip - bei zusammengefassten Blöcken alle Arbeiten auflisten
    let arbeitenTooltip = arbeit.arbeit;
    if (arbeit.arbeitenMitZeiten && arbeit.arbeitenMitZeiten.length > 1) {
      arbeitenTooltip = arbeit.arbeitenMitZeiten.map(a => 
        `${a.name} (${a.zeit} Min.)`
      ).join('&#10;🔧 ');
    }
    
    // Abholzeit-Info für Tooltip
    const abholzeitTooltip = arbeit.abholungZeit ? `&#10;🚗 Abholung: ${arbeit.abholungZeit}` : '';
    
    // Kurzanzeige der Arbeiten im Block (bei mehreren: erste + Anzahl)
    let arbeitKurzText = arbeit.arbeit;
    if (arbeit.arbeitenListe && arbeit.arbeitenListe.length > 1) {
      arbeitKurzText = `${arbeit.arbeitenListe[0]} +${arbeit.arbeitenListe.length - 1}`;
    }
    
    // Kennzeichen oben, Arbeit darunter; bei internen Terminen: Arbeit als primäres Anzeigefeld
    const blockHaupt = arbeit.istIntern
      ? arbeitKurzText
      : (arbeit.kennzeichen || arbeit.kunde);
    const blockArbeit = arbeit.istIntern
      ? (arbeit.kennzeichen && arbeit.kennzeichen !== 'INTERN'
          ? `<span class="zeitleiste-block-arbeit">🔧 ${this.escapeHtml(arbeit.kennzeichen)}</span>`
          : '')
      : `<span class="zeitleiste-block-arbeit">${this.escapeHtml(arbeitKurzText)}</span>`;

    // Nacharbeit-Badge und Style
    const nacharbeitClass = arbeit.istNacharbeit ? 'nacharbeit-block' : '';
    const nacharbeitBadge = arbeit.istNacharbeit
      ? `<span class="zeitleiste-nacharbeit-badge" title="Nacharbeit ab ${arbeit.nacharbeitStartZeit || '?'}">🔧</span>`
      : '';
    const nacharbeitTitleText = arbeit.istNacharbeit
      ? `&#10;🔧 NACHARBEIT (ab ${arbeit.nacharbeitStartZeit || '?'})`
      : '';

    return `
      <div class="zeitleiste-block ${statusClass} ${internClass} ${schwebendClass} ${erweiterungClass} ${nacharbeitClass}" 
           style="left: ${leftPercent}%; width: ${Math.max(widthPercent, 3)}%;"
           onclick="app.openZeitleisteKontextmenu(event, ${arbeit.terminId}, '${this.escapeHtml(arbeit.kunde)}', '${this.escapeHtml(arbeit.arbeit)}', '${arbeit.terminNr}', '${auftragsnrEscaped}')"
           title="${arbeit.kunde}${arbeit.kennzeichen ? ' - ' + arbeit.kennzeichen : ''}&#10;🔧 ${arbeitenTooltip}${fortsetzungText}&#10;${startZeitText} - ${endZeitText} (${dauerText})${abholzeitTooltip}${auftragsnrText}${schwebendTitleText}${erweiterungTitleText}${erweiterungBadgeTitleText}${nacharbeitTitleText}">
        ${nacharbeitBadge}${schwebendBadge}<span class="zeitleiste-block-haupt">${this.escapeHtml(blockHaupt)}</span>${blockArbeit}
        <span class="zeitleiste-block-zeit">${startZeitText} - ${endZeitText}</span>
        ${erweiterungBadge}${istErweiterungIcon}
      </div>
    `;
  };
  
  // Tracke das Ende von Blöcken pro Termin UND global, um Überlappungen zu vermeiden
  const terminEndzeiten = new Map(); // terminId -> letztes Ende in Minuten
  let globalLastEnd = startHour * 60; // Tracke das Ende des letzten Blocks dieser Person
  
  for (const arbeit of sortedArbeiten) {
    let startMinutes, endMinutes;
    
    // Feature 10: Für Anzeige die anzeigeZeitMinuten verwenden (bei abgeschlossenen Terminen = tatsächliche Zeit)
    const anzeigeZeit = arbeit.anzeigeZeitMinuten || arbeit.zeitMinuten;
    
    if (arbeit.startzeit) {
      // Mit Startzeit
      const [startH, startM] = arbeit.startzeit.split(':').map(Number);
      startMinutes = startH * 60 + startM;
      
      // BUG 8 FIX: Endzeit basierend auf individueller Arbeitszeit berechnen
      endMinutes = startMinutes + anzeigeZeit;
      
      // Kollisionsvermeidung: Arbeiten desselben Termins nahtlos aneinanderreihen
      // (Abstandspausen / Lücken UND Überlappungen zwischen den Arbeiten automatisch entfernen)
      const terminId = arbeit.terminId;
      if (terminEndzeiten.has(terminId)) {
        const vorherEnde = terminEndzeiten.get(terminId);
        // Immer direkt nach vorheriger Arbeit des gleichen Termins starten (keine Lücken)
        startMinutes = vorherEnde;
        endMinutes = startMinutes + anzeigeZeit;
      }
      
      // NEU: Prüfe auch auf Überlappung mit ALLEN vorherigen Blöcken (andere Termine)
      // Dies verhindert, dass verschiedene Termine sich überlagern
      if (startMinutes < globalLastEnd) {
        // Überlappung mit einem vorherigen Termin! Verschiebe ans Ende
        startMinutes = globalLastEnd;
        endMinutes = startMinutes + anzeigeZeit;
      }
      
      // Wenn die Startzeit in der Pause liegt, nach der Pause verschieben
      if (pauseStartMinuten !== null && startMinutes >= pauseStartMinuten && startMinutes < pauseEndMinuten) {
        startMinutes = pauseEndMinuten;
        // Nach Verschiebung immer Endzeit neu berechnen (endzeitBerechnet basiert auf alter Startzeit)
        endMinutes = startMinutes + anzeigeZeit;
      }
      
      // Speichere das Ende dieses Blocks für Kollisionsvermeidung
      terminEndzeiten.set(terminId, Math.max(terminEndzeiten.get(terminId) || 0, endMinutes));
      globalLastEnd = Math.max(globalLastEnd, endMinutes);
    } else {
      // Ohne Startzeit: Platziere nach letzter Arbeit (und nach Pause falls nötig)
      startMinutes = currentEndMinutes;
      // Wenn Start in der Pause liegt, nach der Pause beginnen
      if (pauseStartMinuten !== null && startMinutes >= pauseStartMinuten && startMinutes < pauseEndMinuten) {
        startMinutes = pauseEndMinuten;
      }
      
      // BUG 8 FIX: Immer individuelle Arbeitszeit verwenden
      endMinutes = startMinutes + anzeigeZeit;
    }
    
    // BUG 3 FIX: Prüfe ob der Termin über die Mittagspause geht - aufteilen!
    if (pauseStartMinuten !== null && pauseEndMinuten !== null) {
      // Fall 1: Termin beginnt VOR Pause und endet IN oder NACH der Pause
      if (startMinutes < pauseStartMinuten && endMinutes > pauseStartMinuten) {
        // Teil 1: Vor der Pause (bis Pause-Start)
        const teil1End = pauseStartMinuten;
        bloeckeHtml += renderBlock(arbeit, startMinutes, teil1End, false);
        
        // Teil 2: Nach der Pause (mit verbleibender Zeit)
        const verbrauchteZeit = teil1End - startMinutes;
        const verbleibendeZeit = anzeigeZeit - verbrauchteZeit;
        if (verbleibendeZeit > 0) {
          const teil2Start = pauseEndMinuten;
          const teil2End = teil2Start + verbleibendeZeit;
          bloeckeHtml += renderBlock(arbeit, teil2Start, teil2End, true);
          currentEndMinutes = teil2End;
          globalLastEnd = Math.max(globalLastEnd, teil2End);
          // Tatsächliches Ende nach Pause merken (für lückenlose Anreihung der nächsten Arbeit)
          terminEndzeiten.set(arbeit.terminId, Math.max(terminEndzeiten.get(arbeit.terminId) || 0, teil2End));
        } else {
          currentEndMinutes = pauseEndMinuten;
          globalLastEnd = Math.max(globalLastEnd, pauseEndMinuten);
          terminEndzeiten.set(arbeit.terminId, Math.max(terminEndzeiten.get(arbeit.terminId) || 0, pauseEndMinuten));
        }
        continue; // Springe zum nächsten Termin
      }
      
      // Fall 2: Termin beginnt WÄHREND der Pause - wurde oben bereits verschoben
      // Fall 3: Termin endet WÄHREND der Pause - Pause überspringen für nächsten Block
      if (endMinutes > pauseStartMinuten && endMinutes <= pauseEndMinuten) {
        bloeckeHtml += renderBlock(arbeit, startMinutes, endMinutes, false);
        currentEndMinutes = pauseEndMinuten; // Nächster Block beginnt NACH der Pause
        globalLastEnd = Math.max(globalLastEnd, pauseEndMinuten);
        terminEndzeiten.set(arbeit.terminId, Math.max(terminEndzeiten.get(arbeit.terminId) || 0, pauseEndMinuten));
        continue;
      }
    }
    
    // Kein Pausenkonflikt - normal rendern
    bloeckeHtml += renderBlock(arbeit, startMinutes, endMinutes, false);
    currentEndMinutes = endMinutes;
    globalLastEnd = Math.max(globalLastEnd, endMinutes);
  }

  bloeckeHtml += '</div>';

  // Arbeitspausen-Overlays: orange schraffierte Blöcke für Termin-Unterbrechungen
  let arbeitspausenHtml = '';
  const isoToMin = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d) ? null : d.getHours() * 60 + d.getMinutes();
  };
  const grundLabels = { teil_fehlt: 'Teil fehlt', rueckfrage_kunde: 'Rückfrage Kunde', vorrang: 'Vorrang' };
  const jetztMin = new Date().getHours() * 60 + new Date().getMinutes();
  for (const arbeit of sortedArbeiten) {
    if (!arbeit.arbeitspausen || arbeit.arbeitspausen.length === 0) continue;
    if (arbeit.status !== 'in_arbeit' && arbeit.status !== 'abgeschlossen' && arbeit.status !== 'wartend') continue;
    for (const p of arbeit.arbeitspausen) {
      const pStartMin = isoToMin(p.gestartet_am);
      if (pStartMin === null) continue;
      const pEndeMin = p.beendet_am ? isoToMin(p.beendet_am) : jetztMin;
      if (pEndeMin === null || pEndeMin <= pStartMin) continue;
      const displayStart = Math.max(pStartMin, startHour * 60);
      const displayEnd = Math.min(pEndeMin, endHour * 60);
      if (displayEnd <= displayStart) continue;
      const leftPct = ((displayStart - startHour * 60) / (totalHours * 60)) * 100;
      const widthPct = ((displayEnd - displayStart) / (totalHours * 60)) * 100;
      if (widthPct <= 0) continue;
      const istAktiv = !p.beendet_am;
      const grundTxt = grundLabels[p.grund] || p.grund || '';
      const dauerMin = Math.round(pEndeMin - pStartMin);
      const startHHMM = `${Math.floor(pStartMin/60).toString().padStart(2,'0')}:${(pStartMin%60).toString().padStart(2,'0')}`;
      const endeHHMM = `${Math.floor(pEndeMin/60).toString().padStart(2,'0')}:${(pEndeMin%60).toString().padStart(2,'0')}`;
      const tipText = `🔧 Auftragsunterbrechung&#10;${startHHMM}–${endeHHMM} (${dauerMin} min)${grundTxt ? '&#10;Grund: ' + grundTxt : ''}${istAktiv ? '&#10;(läuft…)' : ''}`;
      const label = widthPct > 3 ? `🔧 ${dauerMin}′` : '';
      arbeitspausenHtml += `<div class="zeitleiste-arbeitspause${istAktiv ? ' aktiv' : ''}" style="left:${leftPct.toFixed(2)}%;width:${widthPct.toFixed(2)}%;position:absolute;top:4px;bottom:4px;background:repeating-linear-gradient(45deg,#fd7e14,#fd7e14 3px,rgba(253,126,20,0.2) 3px,rgba(253,126,20,0.2) 7px);border-left:2px solid #fd7e14;border-right:2px solid #fd7e14;border-radius:3px;z-index:12;pointer-events:all;cursor:help;display:flex;align-items:center;justify-content:center;" title="${tipText}"><span style="font-size:10px;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.6);white-space:nowrap;pointer-events:none;">${label}</span></div>`;
    }
  }

  return `
    <div class="${rowClass}">
      <div class="zeitleiste-mitarbeiter">
        <span class="zeitleiste-mitarbeiter-name">${this.escapeHtml(name)}</span>
        ${typ ? `<span class="zeitleiste-mitarbeiter-typ">${typ}</span>` : ''}
      </div>
      <div class="zeitleiste-timeline" style="position:relative;">
        ${gitterHtml}
        ${mittagspauseHtml}
        ${jetztMarkerHtml}
        ${bloeckeHtml}
        ${arbeitspausenHtml}
      </div>
    </div>
  `;
};

  AppClass.prototype.minutesToTime = function(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

  AppClass.prototype.timeToMinutes = function(timeString) {
  if (!timeString || typeof timeString !== 'string') return 0;
  // Normalisiere HHMM (4-stellig ohne Doppelpunkt, z.B. "0501" → "05:01")
  let t = timeString.trim();
  if (/^\d{3,4}$/.test(t)) {
    t = t.padStart(4, '0');
    t = `${t.slice(0, 2)}:${t.slice(2)}`;
  }
  const [hours, minutes] = t.split(':').map(Number);
  return (hours * 60) + (minutes || 0);
}

// Normalisiert eine Zeitangabe auf das Format "HH:MM"
// z.B. "0501" → "05:01", "08:00" bleibt unverändert;

  AppClass.prototype.normalizeZeit = function(zeitStr) {
  if (!zeitStr || typeof zeitStr !== 'string') return zeitStr;
  const t = zeitStr.trim();
  if (/^\d{3,4}$/.test(t)) {
    const padded = t.padStart(4, '0');
    return `${padded.slice(0, 2)}:${padded.slice(2)}`;
  }
  return zeitStr;
}

// ==========================================
// ZEITLEISTE KONTEXTMENÜ
// ==========================================;

  AppClass.prototype.openZeitleisteKontextmenu = function(event, terminId, kunde, arbeit, terminNr, interneAuftragsnummer = '') {
  event.stopPropagation();
  
  const menu = document.getElementById('zeitleisteKontextmenu');
  const header = document.getElementById('zeitleisteKontextmenuHeader');
  
  // Speichere aktuelle Termin-Info
  this.zeitleisteKontextTerminId = terminId;
  
  // Header befüllen mit Auftragsnummer
  const auftragsnrHtml = interneAuftragsnummer ? `<small class="kontextmenu-auftragsnr">Interne Auftragsnr.: ${interneAuftragsnummer}</small>` : '';
  header.innerHTML = `
    <strong>${terminNr}</strong> - ${kunde}
    <small>${arbeit}</small>
    ${auftragsnrHtml}
  `;

  // Schnell-Zeitfelder mit aktuellen Werten vorbefüllen
  const termin = this.termineById[terminId];
  const startzeitInput = document.getElementById('kontextmenuStartzeit');
  const fertigInput = document.getElementById('kontextmenuFertigstellung');
  if (startzeitInput) {
    startzeitInput.value = (termin && termin.startzeit) ? String(termin.startzeit).substring(0, 5) : '';
    startzeitInput.style.borderColor = '';
  }
  if (fertigInput) {
    let fertig = '';
    if (termin && termin.fertigstellung_zeit) {
      const fz = termin.fertigstellung_zeit;
      if (fz.includes('T') || fz.includes('Z')) {
        const d = new Date(fz);
        if (!isNaN(d)) fertig = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      } else {
        fertig = String(fz).substring(0, 5);
      }
    }
    fertigInput.value = fertig;
    fertigInput.style.borderColor = '';
  }
  
  // Position berechnen
  let x = event.clientX;
  let y = event.clientY;
  
  // Menü anzeigen (temporär für Größenmessung)
  menu.style.display = 'block';
  menu.style.visibility = 'hidden';
  
  const menuRect = menu.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Sicherstellen, dass Menü im Viewport bleibt
  if (x + menuRect.width > viewportWidth) {
    x = viewportWidth - menuRect.width - 10;
  }
  if (y + menuRect.height > viewportHeight) {
    y = viewportHeight - menuRect.height - 10;
  }
  
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.visibility = 'visible';
  
  // Click außerhalb schließt Menü
  if (!this.closeZeitleisteKontextmenuHandler) {
    this.closeZeitleisteKontextmenuHandler = (outsideEvent) => {
      const activeMenu = document.getElementById('zeitleisteKontextmenu');
      if (activeMenu && !activeMenu.contains(outsideEvent.target)) {
        activeMenu.style.display = 'none';
        document.removeEventListener('click', this.closeZeitleisteKontextmenuHandler);
      }
    };
  }
  setTimeout(() => {
    document.addEventListener('click', this.closeZeitleisteKontextmenuHandler);
  }, 10);
}

  AppClass.prototype.closeZeitleisteKontextmenu = function() {
  const menu = document.getElementById('zeitleisteKontextmenu');
  if (menu) {
    menu.style.display = 'none';
  }
  document.removeEventListener('click', this.closeZeitleisteKontextmenuHandler);
};

  AppClass.prototype.zeitleisteKontextZeiten = function() {
  this.closeZeitleisteKontextmenu();
  if (this.zeitleisteKontextTerminId) {
    this.openArbeitszeitenModal(this.zeitleisteKontextTerminId);
  }
};

  AppClass.prototype.saveZeitleisteKontextZeitenSchnell = async function() {
  const terminId = this.zeitleisteKontextTerminId;
  if (!terminId) return;

  const startzeitInput = document.getElementById('kontextmenuStartzeit');
  const fertigInput = document.getElementById('kontextmenuFertigstellung');
  const zeitRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

  const startzeitVal = startzeitInput ? startzeitInput.value.trim() : '';
  const fertigVal = fertigInput ? fertigInput.value.trim() : '';

  // Validierung
  if (startzeitVal && !zeitRegex.test(startzeitVal)) {
    if (startzeitInput) startzeitInput.style.borderColor = '#cc4444';
    this.showToast('Startzeit-Stempelung: Bitte HH:MM eingeben', 'error');
    return;
  }
  if (fertigVal && !zeitRegex.test(fertigVal)) {
    if (fertigInput) fertigInput.style.borderColor = '#cc4444';
    this.showToast('Fertigstellungszeit: Bitte HH:MM eingeben', 'error');
    return;
  }
  if (!startzeitVal && !fertigVal) {
    this.showToast('Keine Zeiten eingegeben', 'warning');
    return;
  }

  const termin = this.termineById[terminId];
  const datum = termin ? termin.datum : new Date().toISOString().slice(0, 10);
  const updatePayload = {};

  if (startzeitVal) {
    updatePayload.startzeit = startzeitVal;
  }
  if (fertigVal) {
    const iso = new Date(`${datum}T${fertigVal}:00`);
    updatePayload.fertigstellung_zeit = isNaN(iso.getTime()) ? fertigVal : iso.toISOString();
  }

  try {
    await TermineService.update(terminId, updatePayload);
    // Cache aktualisieren
    if (this.termineById[terminId]) {
      if (updatePayload.startzeit) this.termineById[terminId].startzeit = updatePayload.startzeit;
      if (updatePayload.fertigstellung_zeit) this.termineById[terminId].fertigstellung_zeit = updatePayload.fertigstellung_zeit;
    }
    this.showToast('✅ Zeiten gespeichert', 'success');
    this.closeZeitleisteKontextmenu();
    this.updateTimelineBlockStatus(terminId, termin ? termin.status : null);
  } catch (e) {
    console.error('[saveZeitleisteKontextZeitenSchnell] Fehler:', e);
    this.showToast('Fehler beim Speichern der Zeiten', 'error');
  }
};

  AppClass.prototype.zeitleisteKontextDetails = function() {
  this.closeZeitleisteKontextmenu();
  if (this.zeitleisteKontextTerminId) {
    this.showTerminDetails(this.zeitleisteKontextTerminId);
  }
};

  AppClass.prototype.zeitleisteKontextLoeschen = function() {
  this.closeZeitleisteKontextmenu();
  if (this.zeitleisteKontextTerminId) {
    this.deleteTermin(this.zeitleisteKontextTerminId);
  }
};

  AppClass.prototype.zeitleisteKontextSplit = function() {
  this.closeZeitleisteKontextmenu();
  if (!this.zeitleisteKontextTerminId) return;
  
  const termin = this.termineById[this.zeitleisteKontextTerminId];
  if (!termin) {
    alert('Termin nicht gefunden');
    return;
  }

  // Setze currentDetailTerminId für die Split-Funktion
  this.currentDetailTerminId = this.zeitleisteKontextTerminId;

  const gesamtzeit = termin.geschaetzte_zeit || 60;
  
  // Info-Box befüllen
  document.getElementById('splitTerminInfo').innerHTML = `
    <strong>${termin.termin_nr || '-'}</strong> - ${termin.kunde_name || '-'}<br>
    <span style="color: #666;">${termin.arbeit || '-'}</span>
  `;
  document.getElementById('splitGesamtzeit').textContent = `${gesamtzeit} Min. (${this.formatMinutesToHours(gesamtzeit)})`;
  
  // Standard-Werte setzen (50/50 Split)
  const teil1Zeit = Math.round(gesamtzeit / 2);
  document.getElementById('splitTeil1Zeit').value = teil1Zeit;
  document.getElementById('splitTeil1Zeit').max = gesamtzeit - 1;
  document.getElementById('splitTeil1Range').max = gesamtzeit;
  document.getElementById('splitTeil1Range').value = teil1Zeit;
  
  // Teil 2 Zeit berechnen
  document.getElementById('splitTeil2Zeit').value = gesamtzeit - teil1Zeit;
  
  // Morgen als Standard-Datum für Teil 2
  const morgen = new Date();
  morgen.setDate(morgen.getDate() + 1);
  // Sonntag überspringen
  if (morgen.getDay() === 0) {
    morgen.setDate(morgen.getDate() + 1);
  }
  document.getElementById('splitTeil2Datum').value = this.formatDateLocal(morgen);
  document.getElementById('splitTeil2Datum').min = this.formatDateLocal(new Date());
  
  // Speichere Gesamtzeit für Range-Updates
  this.splitGesamtzeit = gesamtzeit;
  
  // Preview aktualisieren
  this.updateSplitPreview();
  
  // Split-Modal anzeigen
  document.getElementById('terminSplitModal').style.display = 'block';
  
  // Event-Listener für Teil1-Input
  document.getElementById('splitTeil1Zeit').oninput = () => this.updateSplitFromInput();
}

// =================================================================================
// FEATURE 9: DRAG & DROP AUSLASTUNG
// =================================================================================




/**
 * Fügt eine aktive Pause zur Timeline hinzu (30 min Block)
 * HINWEIS: Pausenblöcke sind nicht verschiebbar (locked), aber Termine können
 * darüber hinweg gezogen und in der Pausenzeit platziert werden (pointerEvents: none)
 * @param {HTMLElement} track - Timeline Track Element
 * @param {object} pauseInfo - Pause-Info Objekt mit pause_start_zeit und verbleibende_minuten
 * @param {number} startHour - Start der Timeline (z.B. 8)
 */

/**
 * Fügt gesperrte Zeitbereiche zur Timeline hinzu (vor Arbeitsbeginn und nach Arbeitsende)
 * @param {HTMLElement} track - Timeline Track Element
 * @param {string} arbeitsbeginn - Arbeitsbeginn im Format "HH:MM"
 * @param {string} arbeitsende - Arbeitsende im Format "HH:MM"
 * @param {number} startHour - Start der Timeline (z.B. 8)
 * @param {number} endHour - Ende der Timeline (z.B. 18)
 */

/**
 * Prüft ob eine Position (in Pixel) in einem gesperrten Bereich liegt
 * @param {HTMLElement} track - Timeline Track Element
 * @param {number} posX - X-Position in Pixel relativ zum Track
 * @returns {boolean} true wenn Position gesperrt ist
 */

/**
 * Rendert schwebende Termine als Balken im separaten Panel
 * @param {Array} schwebendeTermine - Array mit schwebenden Terminen
 * @param {HTMLElement} container - Container für die Balken
 */

/**
 * Richtet Drop-Zone für schwebende Termine ein (zum Verschieben von Terminen in "Nicht zugeordnet")
 */

/**
 * Sortiert das Array von schwebenden Terminen
 */

/**
 * Handler für Sortierungs-Änderung
 */

// =============================================================================
// ÜBERFÄLLIGE TERMINE (aus Vortagen, nicht abgeschlossen)
// =============================================================================

/**
 * Lädt unterbrochene Aufträge (Teil-2-Termine ohne Datum, warten auf Einplanung)
 */



/**
 * Lädt überfällige Termine (aus vergangenen Tagen, die noch nicht abgeschlossen sind)
 */

/**
 * Rendert die überfälligen Termine
 */

/**
 * Markiert einen überfälligen Termin als abgeschlossen
 */

/**
 * Plant einen überfälligen Termin auf ein neues Datum - öffnet Modal
 */

/**
 * Schließt das Neu-Einplanen Modal
 */

/**
 * Setzt das Datum im Neu-Einplanen Modal (Schnellauswahl)
 */

/**
 * Bestätigt das Neu-Einplanen und führt es aus
 */

/**
 * Aktualisiert den Auslastungsbalken in Planung & Zuweisung
 */

/**
 * Ermittelt die Dringlichkeit eines Termins
 */

/**
 * Erstellt einen Balken für einen schwebenden Termin
 */

/**
 * Schwebenden Termin in den aktuell gewählten Tag einplanen - Modal öffnen
 */

/**
 * Modal für schwebende Termine schließen
 */

/**
 * Schnellauswahl-Datum für schwebende Termine setzen
 */

/**
 * Schwebenden Termin einplanen bestätigen
 */

/**
 * Gibt einen kurzen Text zu den Arbeiten eines Termins zurück
 */

// Hilfsmethode: Ermittle Zuordnung einer einzelnen Arbeit

// Erstellt ein Timeline-Element für einen Arbeitsblock


// Hilfsfunktion: Drag Events für Arbeitsblöcke

// Erstellt eine Mini-Card für einen nicht zugeordneten Arbeitsblock

// Berechne die tatsächliche Gesamtdauer aus arbeitszeiten_details

// Erstellt Timeline-Termine mit Berücksichtigung der Mittagspause
// Gibt ein Array von Elementen zurück (1 Element normal, 2 Elemente wenn über Pause geteilt)

// Hilfsmethode: Erstellt ein einzelnes Timeline-Termin-Element

// Alte Methode für Kompatibilität (ohne Pause-Berücksichtigung)

// Zeit-Indikator erstellen

// Zeit-Indikator entfernen

// Zeit-Indikator aktualisieren


// Berechnet die Überlappungsdauer zwischen zwei Zeiträumen in Minuten

// Prüft nach Drop auf Überlappungen und zeigt detaillierte Warnung

// Prüft ob ein Drop an dieser Position eine Kollision verursacht
// excludeElementId kann terminId oder arbeit-block-id sein

// Versucht einen freien Slot zu finden und berücksichtigt nahe Termine

// Berechnet die optimale Startzeit wenn nahe an einem anderen Termin

// Vertikale Positionslinie anzeigen (mit Kollisions-Feedback)

// Verschiebt einen einzelnen Arbeitsblock (nicht den ganzen Termin)

// UI-Aktualisierung für verschobenen Arbeitsblock


// UI-Aktualisierung für verschobenen Termin (ohne Datenbank-Zugriff)

// Aktualisiere UI-Elemente für Änderungszähler

// Raster für Snap-Grid ändern

// Alle Änderungen speichern

// Alle Änderungen verwerfen

// Aktualisiert Balkenbreiten für alle laufenden (in_arbeit) Termine in der DragDrop-Timeline.
// Wird jede Minute aufgerufen damit der Balken "mitwächst" wenn der Termin länger dauert als geplant.

/**
 * Zeichnet Arbeitspausen-Overlays auf die Timeline-Tracks.
 * Für Termine mit echten Stempel-Zeiten (in_arbeit/wartend/abgeschlossen) wird jede
 * abgeschlossene Arbeitspause als orange schraffierter Block auf dem Track dargestellt.
 */






// =============================================================================
// KI-ASSISTENT FUNKTIONEN (Version 1.2.0)
// =============================================================================

/**
 * Initialisiert alle Event-Listener für den KI-Assistenten
 */

/**
 * Event-Listener für Teile-Bestellen Tab
 */;
}
