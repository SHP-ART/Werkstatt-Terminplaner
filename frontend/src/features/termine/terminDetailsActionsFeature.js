export function installTerminDetailsActionsFeature(AppClass) {
  AppClass.prototype.loadTermine = async function() {
  const filterDatumInput = document.getElementById('filterDatum');
  const termineTable = document.getElementById('termineTable');
  if (!filterDatumInput || !termineTable) {
    return;
  }
  const filterDatum = filterDatumInput.value;

  try {
    const termine = await TermineService.getAll(filterDatum || null);
    if (!filterDatum) {
      this.termineCache = termine;
      this.updateTerminSuchliste();
    }
    this.termineById = {};

    const tbody = termineTable.getElementsByTagName('tbody')[0];
    tbody.innerHTML = '';

    termine.forEach(termin => {
      this.termineById[termin.id] = termin;
      const row = tbody.insertRow();
      const statusClass = `status-${termin.status}`;
      const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;

      // Zeit-Status: rot = nur geschätzt ODER muss noch bearbeitet werden, grün = tatsächlich erfasst UND nicht zur Bearbeitung markiert
      const hatTatsaechlicheZeit = termin.tatsaechliche_zeit && termin.tatsaechliche_zeit > 0;
      const mussNochBearbeitet = termin.muss_bearbeitet_werden || false;
      const zeitStatusIcon = (hatTatsaechlicheZeit && !mussNochBearbeitet) ? '🟢' : '🔴';

      // Dringlichkeit-Badge
      const terminDringlichkeit = this.getDringlichkeitBadge(termin.dringlichkeit);
      
      // Folgetermin-Badge
      const terminFolgetermin = this.getFolgeterminBadge(termin.arbeit);
      
      // Schwebend-Badge
      const schwebendBadge = termin.ist_schwebend ? '<span class="schwebend-badge">⏸️ Schwebend</span>' : '';
      
      // Split-Badge
      const splitBadge = termin.split_teil ? `<span class="split-badge">Teil ${termin.split_teil}</span>` : '';
      
      // Teile-Status Badge (zeigt an wenn Teile bestellt werden müssen)
      const teileStatusBadge = this.getTerminTeileStatusBadge(termin);

      // Wiederholungs-Badge
      const wiederholungBadge = termin.ist_wiederholung ? '<span class="wiederholung-badge">🔁 Wiederholung</span>' : '';

      // Arbeit-Anzeige formatieren
      const arbeitAnzeige = this.formatArbeitAnzeige(termin.arbeit);

      // Schwebende Termine visuell kennzeichnen
      if (termin.ist_schwebend) {
        row.classList.add('schwebend');
      }

      row.innerHTML = `
        <td style="text-align: center; font-size: 20px;">${zeitStatusIcon}</td>
        <td><strong>${termin.termin_nr || '-'}</strong>${terminDringlichkeit}${terminFolgetermin}${schwebendBadge}${splitBadge}${teileStatusBadge}${wiederholungBadge}</td>
        <td>${termin.datum}</td>
        <td>${termin.kunde_name}</td>
        <td>${termin.kennzeichen}</td>
        <td>${termin.kilometerstand || '-'}</td>
        <td>${termin.ersatzauto ? 'Ja' : 'Nein'}</td>
        <td title="${termin.arbeit || ''}">${arbeitAnzeige}</td>
        <td>${this.formatZeit(zeitAnzeige)}</td>
        <td>${termin.mitarbeiter_name || '-'}</td>
        <td><span class="status-badge ${statusClass}" style="cursor:pointer;" onclick="event.stopPropagation(); app.openStatusPopup(${termin.id}, this)">${termin.status}</span></td>
        <td class="action-buttons-grid">
          <button class="btn btn-edit action-btn-details" onclick="event.stopPropagation(); app.showTerminDetails(${termin.id})">
            📄 Details
          </button>
          <button class="btn btn-delete-icon" onclick="event.stopPropagation(); app.deleteTermin(${termin.id})" title="Löschen">
            🗑️
          </button>
        </td>
      `;

      // NACH innerHTML: Zeile klickbar machen
      row.style.cursor = 'pointer';
      if (termin.ist_wiederholung) {
        row.classList.add('wiederholung-row');
      }

      // Bei Klick auf die Zeile -> Modal öffnen
      row.onclick = (e) => {
        // Verhindere das Öffnen wenn auf einen Button geklickt wurde
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
          return;
        }
        this.openArbeitszeitenModal(termin.id);
      };
    });
    
    // Aktualisiere die Datum-Anzeige
    this.updateZeitverwaltungDatumAnzeige();
  } catch (error) {
    console.error('Fehler beim Laden der Termine:', error);
  }
};

  AppClass.prototype.showAllTermine = function() {
  document.getElementById('filterDatum').value = '';
  this.loadTermine();
  this.updateZeitverwaltungDatumAnzeige();
}

// Navigation für Zeitverwaltung (überspringt Sonntage);

  AppClass.prototype.openZeitModal = function(terminId, aktuelleZeit, status) {
  document.getElementById('termin_id').value = terminId;
  document.getElementById('tatsaechliche_zeit').value = aktuelleZeit;
  document.getElementById('status').value = status;
  document.getElementById('modal').style.display = 'block';
};

  AppClass.prototype.closeModal = function() {
  document.getElementById('modal').style.display = 'none';
};

  AppClass.prototype.updateTerminZeiten = async function(terminId) {
  const bringzeit = document.getElementById('detailBringzeit')?.value || null;
  const abholzeit = document.getElementById('detailAbholzeit')?.value || null;
  try {
    await TermineService.update(terminId, {
      bring_zeit: bringzeit || null,
      abholung_zeit: abholzeit || null
    });
    // Termin im Cache aktualisieren
    if (this.termineById[terminId]) {
      this.termineById[terminId].bring_zeit = bringzeit;
      this.termineById[terminId].abholung_zeit = abholzeit;
    }
    // Kurzes visuelles Feedback
    document.querySelectorAll('.btn-detail-zeit-save').forEach(btn => {
      const orig = btn.textContent;
      btn.textContent = '✅';
      btn.style.color = '#28a745';
      setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1500);
    });
    await this.loadTermine();
  } catch (err) {
    console.error('Fehler beim Speichern der Zeiten:', err);
    alert('Fehler beim Speichern der Zeiten.');
  }
};

  AppClass.prototype.updateTerminMitarbeiter = async function(terminId) {
  const selectedValue = document.getElementById('terminMitarbeiterSelect').value;
  
  // Hole den aktuellen Termin für vorhandene arbeitszeiten_details
  const termin = this.termineById[terminId];
  let existingDetails = {};
  
  if (termin && termin.arbeitszeiten_details) {
    try {
      existingDetails = JSON.parse(termin.arbeitszeiten_details);
    } catch (e) {
      // Ignoriere Parse-Fehler
    }
  }

  // Parse den Wert: "ma_1" oder "l_1" oder ""
  let mitarbeiterIdValue = null;
  let istSchwebend = termin ? termin.ist_schwebend : 0;

  if (selectedValue && selectedValue !== '') {
    const [type, id] = selectedValue.split('_');
    const numId = parseInt(id, 10);

    if (type === 'ma') {
      // Mitarbeiter: Speichere in mitarbeiter_id
      mitarbeiterIdValue = numId;
      // Aktualisiere _gesamt_mitarbeiter_id in bestehenden Details
      existingDetails._gesamt_mitarbeiter_id = { type: 'mitarbeiter', id: numId };
      // Wenn ein Mitarbeiter zugeordnet wird, ist der Termin nicht mehr schwebend
      istSchwebend = 0;
    } else if (type === 'l') {
      // Lehrling: Speichere nur in arbeitszeiten_details
      mitarbeiterIdValue = null; // Lehrlinge haben kein mitarbeiter_id
      existingDetails._gesamt_mitarbeiter_id = { type: 'lehrling', id: numId };
      // Wenn ein Lehrling zugeordnet wird, ist der Termin nicht mehr schwebend
      istSchwebend = 0;
    }
  } else {
    // Keine Zuordnung - entferne _gesamt_mitarbeiter_id
    delete existingDetails._gesamt_mitarbeiter_id;
  }

  // Wenn keine Startzeit vorhanden ist, aber eine Bringzeit existiert, diese als Startzeit verwenden
  let bringzeitAlsStartzeit = false;
  if (selectedValue && termin && !existingDetails._startzeit && termin.bring_zeit) {
    existingDetails._startzeit = termin.bring_zeit;
    bringzeitAlsStartzeit = true;
    console.log('Bringzeit als Startzeit übernommen:', termin.bring_zeit);
  }

  // Überschneidungsprüfung wenn Mitarbeiter/Lehrling zugeordnet wird und Termin eine Startzeit hat
  if (selectedValue && termin) {
    let terminStartzeit = null;
    if (existingDetails._startzeit) {
      terminStartzeit = existingDetails._startzeit;
    }
    
    // Nur prüfen wenn Startzeit vorhanden und kein schwebender/wartender Termin
    if (terminStartzeit && termin.datum && termin.datum !== '9999-12-31') {
      const [type, id] = selectedValue.split('_');
      const numId = parseInt(id, 10);
      const mitarbeiterId = type === 'ma' ? numId : null;
      const lehrlingId = type === 'l' ? numId : null;
      
      const ueberschneidungen = await this.checkTerminUeberschneidungen(
        termin.datum,
        terminStartzeit,
        termin.geschaetzte_zeit || 60,
        mitarbeiterId,
        lehrlingId,
        terminId
      );
      
      if (ueberschneidungen.length > 0) {
        const konfliktListe = ueberschneidungen.map(u => 
          `• ${u.termin.termin_nr}: ${u.startzeit} - ${u.endzeit} (${u.termin.kunde_name || 'Unbekannt'})`
        ).join('\n');
        
        const fortfahren = confirm(
          `⚠️ TERMINÜBERSCHNEIDUNG!\n\n` +
          `Der Termin überschneidet sich mit:\n${konfliktListe}\n\n` +
          `Trotzdem fortfahren?`
        );
        
        if (!fortfahren) return;
      }
    }
  }
  
  // Automatisch auf "geplant" setzen wenn Mitarbeiter zugeordnet wird und Startzeit vorhanden
  let neuerStatus = null;
  if (selectedValue && existingDetails._startzeit && termin.status === 'wartend') {
    neuerStatus = 'geplant';
  }
  
  try {
    const updateData = {
      mitarbeiter_id: mitarbeiterIdValue,
      arbeitszeiten_details: Object.keys(existingDetails).length > 0 ? JSON.stringify(existingDetails) : null,
      ist_schwebend: istSchwebend
    };
    
    // 🔍 DEBUG: Ausführliches Logging für Produktivsystem
    console.log('[DEBUG] updateTerminMitarbeiter - Start');
    console.log('[DEBUG] Termin-ID:', terminId);
    console.log('[DEBUG] Selected Value:', selectedValue);
    console.log('[DEBUG] Mitarbeiter ID (wird gespeichert):', mitarbeiterIdValue);
    console.log('[DEBUG] Schwebend-Status:', istSchwebend);
    console.log('[DEBUG] Existing Details:', existingDetails);
    console.log('[DEBUG] Update Data:', updateData);
    
    if (neuerStatus) {
      updateData.status = neuerStatus;
    }
    
    // Wenn Bringzeit als Startzeit übernommen wurde, auch in der Datenbank speichern
    if (bringzeitAlsStartzeit && termin.bring_zeit) {
      updateData.startzeit = termin.bring_zeit;
      
      // Endzeit berechnen basierend auf geschätzter Zeit
      const geschaetzteZeit = termin.geschaetzte_zeit || 60;
      const [stunden, minuten] = termin.bring_zeit.split(':').map(Number);
      const startMinuten = stunden * 60 + minuten;
      const endMinuten = startMinuten + geschaetzteZeit;
      const endStunden = Math.floor(endMinuten / 60);
      const endMin = endMinuten % 60;
      updateData.endzeit_berechnet = `${String(endStunden).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
      console.log('Startzeit und Endzeit in Datenbank gespeichert:', updateData.startzeit, '-', updateData.endzeit_berechnet);
    }
    
    // Interne Auftragsnummer speichern (falls geändert)
    const interneAuftragsnummerInput = document.getElementById('terminInterneAuftragsnummer');
    if (interneAuftragsnummerInput) {
      const neueAuftragsnummer = interneAuftragsnummerInput.value.trim();
      if (neueAuftragsnummer !== (termin.interne_auftragsnummer || '')) {
        updateData.interne_auftragsnummer = neueAuftragsnummer;
      }
    }
    
    console.log('[DEBUG] Sende API-Request: PUT /termine/' + terminId);
    console.log('[DEBUG] Request Body:', JSON.stringify(updateData, null, 2));
    
    const response = await TermineService.update(terminId, updateData);
    
    console.log('[DEBUG] API Response:', response);
    
    let hinweis = neuerStatus ? ' Status auf "Geplant" gesetzt.' : '';
    if (bringzeitAlsStartzeit) {
      hinweis += ' Bringzeit wurde als Startzeit übernommen.';
    }
    alert('Zuordnung gespeichert!' + hinweis);
    this.closeTerminDetails();
    this.loadTermine();
    this.loadAuslastung();
    if (this.loadHeuteTermine) {
      this.loadHeuteTermine();
    }
  } catch (error) {
    console.error('[ERROR] Fehler beim Speichern der Zuordnung:', error);
    console.error('[ERROR] Stack:', error.stack);
    alert('Fehler beim Speichern der Zuordnung: ' + error.message);
  }
};

  AppClass.prototype.detailKmVinSpeichern = async function(terminId) {
  const kmInput = document.getElementById('detailKilometerstand');
  const vinInput = document.getElementById('detailVin');
  if (!kmInput || !vinInput) return;

  const km = kmInput.value !== '' ? parseInt(kmInput.value, 10) : null;
  const vin = vinInput.value.trim().toUpperCase() || null;

  try {
    await TermineService.update(terminId, { kilometerstand: km, vin });
    // Cache aktualisieren
    if (this.termineById[terminId]) {
      this.termineById[terminId].kilometerstand = km;
      this.termineById[terminId].vin = vin;
    }
    const btn = document.querySelector('[onclick*="detailKmVinSpeichern"]');
    if (btn) {
      btn.textContent = '✅ Gespeichert';
      btn.style.background = '#16a34a';
      setTimeout(() => { btn.textContent = '💾 KM / VIN speichern'; btn.style.background = '#2563eb'; }, 2000);
    }
  } catch (e) {
    alert('Fehler beim Speichern: ' + e.message);
  }
}

// Zurück zu Termin-Details vom Arbeitszeiten-Modal;

  AppClass.prototype.backToTerminDetails = function() {
  // Schließe Arbeitszeiten-Modal
  document.getElementById('arbeitszeitenModal').style.display = 'none';
  
  // Öffne Termin-Details wieder, falls eine Termin-ID gespeichert ist
  if (this.currentTerminId) {
    this.showTerminDetails(this.currentTerminId);
  }
}

// Navigation zu Standardzeiten-Einstellungen;

  AppClass.prototype.navigateToStandardzeiten = function() {
  // Wechsle zum Einstellungen-Tab (mit display toggle)
  const buttons = this.tabCache.buttons || document.querySelectorAll('.tab-button');
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].classList.remove('active');
    if (buttons[i].getAttribute('data-tab') === 'einstellungen') {
      buttons[i].classList.add('active');
    }
  }

  const contents = this.tabCache.contents || document.querySelectorAll('.tab-content');
  for (let i = 0; i < contents.length; i++) {
    contents[i].style.display = 'none';
    contents[i].classList.remove('active');
  }

  const einstellungenTab = this.getCachedElement('einstellungen');
  if (einstellungenTab) {
    einstellungenTab.style.display = 'block';
    einstellungenTab.classList.add('active');
  }

  // Wechsle zum Standardzeiten Sub-Tab
  document.querySelectorAll('.sub-tab-button').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-sub-tab') === 'standardzeiten') {
      btn.classList.add('active');
    }
  });

  document.querySelectorAll('.sub-tab-content').forEach(content => {
    content.classList.remove('active');
    content.style.display = 'none';
  });
  const standardzeitenTab = this.getCachedElement('standardzeiten');
  if (standardzeitenTab) {
    standardzeitenTab.classList.add('active');
    standardzeitenTab.style.display = 'block';

    // Lade Arbeitszeiten neu
    this.loadArbeitszeiten();
  }
}

// ============================================
// TERMIN-SPLIT & SCHWEBEND FUNKTIONEN
// ============================================

// Termin auf nächsten Arbeitstag verschieben;

  AppClass.prototype.weiterfuehrenTermin = async function() {
  if (!this.currentDetailTerminId) return;

  const termin = this.termineById[this.currentDetailTerminId];
  if (!termin) return;

  // Nächsten Werktag ab aktuellem Datum ermitteln
  const d = new Date(termin.datum + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const neuesDatum = d.toISOString().slice(0, 10);
  const neuesDatumLabel = d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

  if (!confirm(`Termin auf ${neuesDatumLabel} weiterführen?\n\nDer Termin bleibt dem gleichen Mitarbeiter zugeordnet und erscheint in der Planung für diesen Tag.`)) return;

  try {
    const terminId = this.currentDetailTerminId;
    this.closeTerminDetails();
    await TermineService.weiterfuehren(terminId, neuesDatum);
    this.showToast(`📅 Termin auf ${neuesDatumLabel} weitergeführt`, 'success');
    delete this.termineById[terminId];
    await Promise.all([this.loadTermine(), this.loadAuslastung()]);
    // DragDrop-Ansicht auf neues Datum setzen und neu laden
    const dragDropDatum = document.getElementById('auslastungDragDropDatum');
    if (dragDropDatum && document.getElementById('auslastung-dragdrop')?.classList.contains('active')) {
      dragDropDatum.value = neuesDatum;
      this.loadAuslastungDragDrop();
    }
  } catch (error) {
    console.error('Fehler beim Weiterführen:', error);
    this.showToast('Fehler beim Weiterführen: ' + (error.message || 'Unbekannter Fehler'), 'error');
  }
}

/**
 * Öffnet einen Dialog: Termin heute ab einer Startzeit einplanen und morgen fortführen.
 * Optionale Verschiebung überlappender Termine nach hinten.
 */;

  AppClass.prototype.showEinplanenDialog = function(terminId, termin) {
  const existingDialog = document.getElementById('einplanenDialog');
  if (existingDialog) existingDialog.remove();

  const now = new Date();
  const defaultStart = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const gesamtMin = termin.geschaetzte_zeit || 60;
  const gesamtText = gesamtMin >= 60
    ? `${Math.floor(gesamtMin/60)}h ${gesamtMin%60 > 0 ? gesamtMin%60+'min' : ''}`.trim()
    : `${gesamtMin} min`;

  const overlay = document.createElement('div');
  overlay.id = 'einplanenDialog';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:11000;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:24px;max-width:420px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
      <h3 style="margin:0 0 6px 0;font-size:1.1rem;">⚡ Heute einplanen + morgen fortführen</h3>
      <p style="margin:0 0 16px 0;font-size:0.9rem;color:#555;">
        <strong>${termin.termin_nr}</strong> – ${termin.kunde_name || ''}<br>
        Gesamtzeit: <strong>${gesamtText}</strong>
      </p>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <label style="font-size:0.9rem;font-weight:600;">Startzeit heute:
          <input type="time" id="einplanenStart" value="${defaultStart}"
            style="display:block;margin-top:4px;padding:6px 10px;border:1px solid #ccc;border-radius:7px;font-size:1rem;width:100%;">
        </label>
        <label style="font-size:0.9rem;font-weight:600;">Feierabend (heute bis):
          <input type="time" id="einplanenFeierabend" value="17:00"
            style="display:block;margin-top:4px;padding:6px 10px;border:1px solid #ccc;border-radius:7px;font-size:1rem;width:100%;">
        </label>
        <div id="einplanenVorschau" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;font-size:0.88rem;"></div>
        <label style="display:flex;align-items:center;gap:8px;font-size:0.88rem;cursor:pointer;">
          <input type="checkbox" id="einplanenVerschieben" style="width:16px;height:16px;">
          Überlappende Termine nach hinten verschieben
        </label>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button id="einplanenBestaetigen" style="flex:1;background:#2e7d32;color:#fff;border:none;padding:10px;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;">✅ Einplanen</button>
        <button id="einplanenAbbrechen" style="flex:1;background:#f3f4f6;color:#333;border:1px solid #ddd;padding:10px;border-radius:8px;font-size:0.95rem;cursor:pointer;">❌ Abbrechen</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const updateVorschau = () => {
    const start = document.getElementById('einplanenStart')?.value || defaultStart;
    const feier = document.getElementById('einplanenFeierabend')?.value || '17:00';
    const [sh,sm] = start.split(':').map(Number);
    const [fh,fm] = feier.split(':').map(Number);
    const heuteMin = Math.max(0, (fh*60+fm) - (sh*60+sm));
    const restMin = Math.max(0, gesamtMin - heuteMin);
    const prev = document.getElementById('einplanenVorschau');
    if (!prev) return;
    if (heuteMin <= 0) {
      prev.innerHTML = '<span style="color:#d32f2f;">⚠️ Feierabend liegt vor oder auf der Startzeit.</span>';
      return;
    }
    const morgenStr = (() => { const d=new Date(); d.setDate(d.getDate()+1); while(d.getDay()===0||d.getDay()===6) d.setDate(d.getDate()+1); return d.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'}); })();
    if (restMin <= 0) {
      prev.innerHTML = `<span style="color:#2e7d32;">✅ Termin passt vollständig bis ${feier} Uhr (${heuteMin} Min.).</span>`;
    } else {
      prev.innerHTML = `<strong>Heute:</strong> ${heuteMin} Min. (${start}–${feier})<br><strong>Morgen (${morgenStr}):</strong> ${restMin} Min. ab 08:00`;
    }
  };
  updateVorschau();
  document.getElementById('einplanenStart').addEventListener('input', updateVorschau);
  document.getElementById('einplanenFeierabend').addEventListener('input', updateVorschau);

  document.getElementById('einplanenAbbrechen').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('einplanenBestaetigen').addEventListener('click', async () => {
    const startzeit = document.getElementById('einplanenStart')?.value || defaultStart;
    const feierabend = document.getElementById('einplanenFeierabend')?.value || '17:00';
    const verschieben = document.getElementById('einplanenVerschieben')?.checked || false;
    const [sh,sm] = startzeit.split(':').map(Number);
    const [fh,fm] = feierabend.split(':').map(Number);
    const heuteMin = (fh*60+fm) - (sh*60+sm);
    if (heuteMin <= 0) {
      this.showToast('⚠️ Feierabend liegt vor der Startzeit!', 'error');
      return;
    }
    overlay.remove();
    try {
      const result = await TermineService.folgearbeitErstellen(terminId, feierabend, startzeit, verschieben);
      const morgenLabel = (() => { const d=new Date(); d.setDate(d.getDate()+1); while(d.getDay()===0||d.getDay()===6) d.setDate(d.getDate()+1); return d.toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit'}); })();
      let msg = `✅ Heute ${result.heute_minuten} Min. ab ${startzeit}, morgen (${morgenLabel}) ${result.rest_minuten} Min.`;
      if (result.verschobene_termine?.length > 0) {
        msg += ` | ${result.verschobene_termine.length} Termin(e) verschoben`;
      }
      this.showToast(msg, 'success');
      await Promise.all([this.loadTermine(), this.loadAuslastung()]);
      if (document.getElementById('auslastung-dragdrop')?.classList.contains('active')) {
        this.loadAuslastungDragDrop();
      }
    } catch (err) {
      this.showToast('❌ Fehler: ' + (err.message || 'Unbekannter Fehler'), 'error');
    }
  });
}

// Termin als schwebend markieren/aufheben;

  AppClass.prototype.toggleTerminSchwebend = async function() {
  if (!this.currentDetailTerminId) return;
  
  const termin = this.termineById[this.currentDetailTerminId];
  const neuerStatus = !termin.ist_schwebend;
  
  // Wenn Termin eingeplant wird (von schwebend auf fest), Datum abfragen
  if (!neuerStatus) {
    this.openEinplanenDatumModal(this.currentDetailTerminId, termin);
    return;
  }
  
  try {
    await TermineService.setSchwebend(this.currentDetailTerminId, neuerStatus);
    
    // Aktualisiere lokalen Cache
    termin.ist_schwebend = neuerStatus ? 1 : 0;
    
    // Button-Text aktualisieren
    this.updateSchwebendButton(neuerStatus);
    
    alert(neuerStatus 
      ? 'Termin als schwebend markiert (wird nicht in Auslastung gezählt)' 
      : 'Termin fest eingeplant');
    
    this.loadTermine();
    this.loadAuslastung();
  } catch (error) {
    console.error('Fehler beim Setzen des Schwebend-Status:', error);
    alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
  }
};

  AppClass.prototype.updateSchwebendButton = function(istSchwebend) {
  const btn = document.getElementById('terminSchwebendBtn');
  if (btn) {
    if (istSchwebend) {
      btn.innerHTML = '▶️ Einplanen';
      btn.title = 'Termin fest einplanen (wird in Auslastung gezählt)';
    } else {
      btn.innerHTML = '⏸️ Schwebend';
      btn.title = 'Termin als schwebend markieren (wird nicht in Auslastung gezählt)';
    }
  }
}

// Termin aus Details-Modal löschen;

  AppClass.prototype.deleteTerminFromDetails = async function() {
  console.log('deleteTerminFromDetails aufgerufen');
  console.log('currentDetailTerminId:', this.currentDetailTerminId);
  
  if (!this.currentDetailTerminId) {
    console.log('Keine currentDetailTerminId vorhanden!');
    alert('Kein Termin ausgewählt');
    return;
  }
  
  // Schließe das Details-Modal
  const modal = document.getElementById('terminDetailsModal');
  if (modal) modal.style.display = 'none';
  
  // Rufe die bestehende deleteTermin-Funktion auf
  await this.deleteTermin(this.currentDetailTerminId);
}

/**
 * Zeigt alle verknüpften Termine (Original + Erweiterungen) in einem Modal
 */;

  AppClass.prototype.showVerknuepfteTermine = function(terminId) {
  const termin = this.termineById[terminId];
  if (!termin) return;

  // Sammle alle verknüpften Termine
  const verknuepfte = [];
  
  // Finde den Original-Termin (falls dieser eine Erweiterung ist)
  let originalId = terminId;
  if (termin.erweiterung_von_id) {
    originalId = termin.erweiterung_von_id;
  }
  
  // Hole den Original-Termin
  const originalTermin = this.termineById[originalId];
  if (originalTermin) {
    verknuepfte.push({
      ...originalTermin,
      istOriginal: true,
      istErweiterung: false
    });
  }
  
  // Hole alle Erweiterungen zum Original
  Object.values(this.termineById).forEach(t => {
    if (t.erweiterung_von_id === originalId && !t.ist_geloescht) {
      verknuepfte.push({
        ...t,
        istOriginal: false,
        istErweiterung: true
      });
    }
  });
  
  // Sortiere nach Datum und Zeit
  verknuepfte.sort((a, b) => {
    const datumA = a.datum || '';
    const datumB = b.datum || '';
    if (datumA !== datumB) return datumA.localeCompare(datumB);
    const zeitA = a.bring_zeit || '00:00';
    const zeitB = b.bring_zeit || '00:00';
    return zeitA.localeCompare(zeitB);
  });
  
  // Erstelle Modal falls nicht vorhanden
  let modal = document.getElementById('verknuepfteTermineModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'verknuepfteTermineModal';
    modal.className = 'modal';
    document.body.appendChild(modal);
  }
  
  // Baue Modal-Inhalt
  const terminListe = verknuepfte.map(t => {
    const icon = t.istOriginal ? '📋' : '🔗';
    const typClass = t.istOriginal ? 'original' : 'erweiterung';
    const typText = t.istOriginal ? 'Original' : 'Erweiterung';
    const datumFormatiert = this.formatDateGerman(t.datum);
    const endzeit = this.berechneEndzeit(t.bring_zeit, t.geschaetzte_zeit);
    const dauerText = this.formatMinutesToHours(t.geschaetzte_zeit || 0);
    const aktuellerTermin = t.id === terminId ? ' style="background: #e3f2fd; border-left: 3px solid #1976d2;"' : '';
    
    return `
      <div class="verkn-termin-item"${aktuellerTermin} onclick="app.showTerminDetails(${t.id}); document.getElementById('verknuepfteTermineModal').style.display='none';">
        <div class="verkn-termin-icon">${icon}</div>
        <div class="verkn-termin-info">
          <div class="verkn-termin-nr">${t.termin_nr || '#' + t.id}</div>
          <div class="verkn-termin-arbeit">${this.escapeHtml(t.arbeit || '-')}</div>
          <div class="verkn-termin-details">
            📅 ${datumFormatiert} | ⏰ ${t.bring_zeit || '08:00'} - ${endzeit} | ⏱️ ${dauerText}
          </div>
        </div>
        <div class="verkn-termin-typ ${typClass}">${typText}</div>
      </div>
    `;
  }).join('');
  
  const kundenInfo = originalTermin ? `${originalTermin.kunde_name || 'Kunde'} - ${originalTermin.kennzeichen || '-'}` : '-';
  
  modal.innerHTML = `
    <div class="modal-content verkn-modal-content">
      <span class="close" onclick="document.getElementById('verknuepfteTermineModal').style.display='none'">&times;</span>
      <h3>🔗 Verknüpfte Termine</h3>
      <p style="color: #666; margin-bottom: 15px;">${kundenInfo} • ${verknuepfte.length} verknüpfte(r) Termin(e)</p>
      <div class="verkn-termin-liste">
        ${terminListe}
      </div>
    </div>
  `;
  
  modal.style.display = 'block';
  
  // Schließen bei Klick außerhalb
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  };
}

// Einplanen-Datum Modal öffnen;

  AppClass.prototype.openEinplanenDatumModal = function(terminId, termin) {
  // Prüfe ob Modal existiert, sonst erstelle es
  let modal = document.getElementById('einplanenDatumModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'einplanenDatumModal';
    modal.className = 'modal';
    document.body.appendChild(modal);
  }
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <span class="close-btn" onclick="app.closeEinplanenDatumModal()">&times;</span>
      <h3 style="margin-bottom: 20px;">📅 Termin einplanen</h3>
      <div id="einplanenTerminInfo" style="background: #f5f5f5; padding: 10px; border-radius: 8px; margin-bottom: 20px;"></div>
      
      <div class="form-group">
        <label for="einplanenDatum"><strong>Datum für den Termin wählen:</strong></label>
        <input type="date" id="einplanenDatum" class="form-control" style="font-size: 16px; padding: 10px;">
      </div>
      
      <div class="form-group" style="margin-top: 15px;">
        <label for="einplanenUhrzeit"><strong>Startzeit (optional):</strong></label>
        <input type="text" id="einplanenUhrzeit" class="form-control" style="font-size: 16px; padding: 10px; text-align: center;" placeholder="HH:MM" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" oninput="this.value = this.value.replace(/[^0-9:]/g, ''); if(this.value.length === 2 && !this.value.includes(':')) this.value += ':';">
        <small style="color: #666; display: block; margin-top: 5px;">24h-Format (z.B. 08:00, 14:30). Wenn leer, wird der Termin automatisch eingeplant.</small>
      </div>
      
      <div class="form-group" style="margin-top: 15px;">
        <label for="einplanenBringzeit"><strong>Bringzeit (optional):</strong></label>
        <input type="text" id="einplanenBringzeit" class="form-control" style="font-size: 16px; padding: 10px; text-align: center;" placeholder="HH:MM" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" oninput="this.value = this.value.replace(/[^0-9:]/g, ''); if(this.value.length === 2 && !this.value.includes(':')) this.value += ':';">
        <small style="color: #666; display: block; margin-top: 5px;">24h-Format (z.B. 08:00, 14:30)</small>
      </div>
      
      <div class="form-group" style="margin-top: 15px;">
        <div id="einplanenBestehendeArbeitenBox" style="display:none; margin-bottom: 12px; padding: 8px 12px; background: #f0f4ff; border-radius: 6px; border-left: 3px solid #5c6bc0;">
          <div id="einplanenBestehendeArbeitenTitel" style="font-size: 0.8em; font-weight: 600; color: #3949ab; margin-bottom: 6px;">📋 Arbeiten:</div>
          <div id="einplanenBestehendeArbeitenListe" style="font-size: 0.88em; color: #333; display:flex; flex-direction:column; gap:4px;"></div>
          <div id="einplanenSplitHinweis" style="display:none;margin-top:6px;padding:5px 8px;background:#fff3cd;border-radius:4px;font-size:0.8em;color:#856404;">
            ℹ️ Nicht ausgewählte Arbeiten werden als neuer schwebender Termin gespeichert.
          </div>
        </div>
        <label><strong>➕ Neue Arbeit hinzufügen (optional):</strong></label>
        <div style="display: flex; gap: 10px; margin-top: 5px;">
          <input type="text" id="einplanenArbeitText" class="form-control" style="flex: 1;" placeholder="Arbeit eingeben...">
          <input type="number" id="einplanenArbeitZeit" class="form-control" style="width: 70px;" placeholder="h" min="0.1" step="0.1">
          <button type="button" class="btn btn-secondary" onclick="app.addArbeitToEinplanen()" style="white-space: nowrap;">
            ➕
          </button>
        </div>
        <div id="einplanenArbeitenListe" style="margin-top: 10px; max-height: 150px; overflow-y: auto;"></div>
        <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #666; font-size: 0.9em;">Zusätzliche Zeit neuer Arbeiten:</span>
          <strong id="einplanenGesamtzeit">0 h</strong>
        </div>
      </div>
      
      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <button type="button" class="btn btn-primary" onclick="app.confirmEinplanenDatum()" style="flex: 1;">
          ✅ Einplanen
        </button>
        <button type="button" class="btn btn-secondary" onclick="app.closeEinplanenDatumModal()" style="flex: 1;">
          ❌ Abbrechen
        </button>
      </div>
    </div>
  `;
  
  // Termin-Info anzeigen (nur Kunde und Kennzeichen, nicht die Arbeiten)
  document.getElementById('einplanenTerminInfo').innerHTML = `
    <strong>${termin.termin_nr || '-'}</strong> - ${termin.kunde_name || '-'}<br>
    <span style="color: #666;">${termin.kennzeichen || '-'}</span><br>
    <span style="color: #999; font-size: 0.9em;">Aktuelles Datum: ${termin.datum === '9999-12-31' ? 'Nicht gesetzt' : (termin.datum || 'Nicht gesetzt')}</span>
  `;
  
  // Datum vorbelegen (heute oder bestehendes Datum)
  const datumInput = document.getElementById('einplanenDatum');
  if (termin.datum && termin.datum !== '9999-12-31') {
    datumInput.value = termin.datum;
  } else {
    datumInput.value = new Date().toISOString().split('T')[0];
  }
  
  // Bringzeit vorbelegen (falls vorhanden)
  const bringzeitInput = document.getElementById('einplanenBringzeit');
  if (bringzeitInput && termin.bring_zeit) {
    bringzeitInput.value = termin.bring_zeit;
  }
  
  // Speichere aktuelle Termin-ID
  this.einplanenTerminId = terminId;
  
  // Speichere die ursprüngliche geschätzte Zeit des Termins
  this.einplanenUrspruenglicheZeit = termin.geschaetzte_zeit || 60;
  
  // Bestehende Arbeiten aus dem Termin als read-only Referenz speichern (NICHT in die editable Liste laden)
  this.einplanenBestehendeArbeiten = [];
  this.einplanenArbeiten = []; // Neue Arbeiten starten immer leer
  if (termin.arbeit) {
    // Parse arbeitszeiten_details für die Zeiten
    let details = {};
    if (termin.arbeitszeiten_details) {
      try {
        details = typeof termin.arbeitszeiten_details === 'string' 
          ? JSON.parse(termin.arbeitszeiten_details) 
          : termin.arbeitszeiten_details;
      } catch (e) {}
    }
    
    // Bestehende Arbeiten nur als Referenz speichern
    const arbeitenListe = termin.arbeit.split(/\n|\s*\|\|\s*/).map(a => a.trim()).filter(a => a);
    const gesamtZeitMinuten = termin.geschaetzte_zeit || 60;
    const standardZeitProArbeit = arbeitenListe.length > 0 ? Math.round(gesamtZeitMinuten / arbeitenListe.length) : 60;
    
    // Prüfen ob explizite Einzelzeiten gesetzt → Split-Modus
    let hatEinzelzeiten = false;
    arbeitenListe.forEach(bezeichnung => {
      let zeitMinuten = standardZeitProArbeit;
      let einzelzeitExplizit = false;
      if (details[bezeichnung]) {
        if (typeof details[bezeichnung] === 'object' && details[bezeichnung].zeit > 0) {
          zeitMinuten = details[bezeichnung].zeit;
          einzelzeitExplizit = true;
        } else if (typeof details[bezeichnung] === 'number' && details[bezeichnung] > 0) {
          zeitMinuten = details[bezeichnung];
          einzelzeitExplizit = true;
        }
      }
      if (einzelzeitExplizit) hatEinzelzeiten = true;
      this.einplanenBestehendeArbeiten.push({ bezeichnung, zeit: zeitMinuten, einzelzeitExplizit });
    });
    // Split-Modus nur wenn Termin mehrere Arbeiten UND Einzelzeiten hat
    this.einplanenSplitModus = hatEinzelzeiten && arbeitenListe.length > 1;
  }
  
  // Bestehende Arbeiten anzeigen – Modus abhängig von Einzelzeiten
  const bestehendeBox = document.getElementById('einplanenBestehendeArbeitenBox');
  const bestehendeListe = document.getElementById('einplanenBestehendeArbeitenListe');
  const splitHinweis = document.getElementById('einplanenSplitHinweis');
  const bestehendeTitle = document.getElementById('einplanenBestehendeArbeitenTitel');
  if (bestehendeBox && bestehendeListe) {
    if (this.einplanenBestehendeArbeiten.length > 0) {
      bestehendeBox.style.display = 'block';
      if (this.einplanenSplitModus) {
        // Split-Modus: Checkboxen + Hinweis
        if (bestehendeTitle) bestehendeTitle.textContent = '📋 Arbeiten auswählen (Haken = wird jetzt eingeplant):';
        bestehendeBox.style.background = '#f0f4ff';
        bestehendeBox.style.borderLeftColor = '#5c6bc0';
        bestehendeListe.innerHTML = this.einplanenBestehendeArbeiten
          .map((a, i) => {
            const zeitText = a.zeit >= 60
              ? `${Math.floor(a.zeit/60)}h${a.zeit%60>0?' '+(a.zeit%60)+'min':''}` : `${a.zeit}min`;
            return `<label style="display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer;">
              <input type="checkbox" class="einplanen-arbeit-check" data-index="${i}" checked
                style="width:16px;height:16px;cursor:pointer;">
              <span>${this.escapeHtml(a.bezeichnung)} <span style="color:#555;font-size:0.9em;">(${zeitText})</span></span>
            </label>`;
          })
          .join('');
        // Split-Hinweis dynamisch ein-/ausblenden
        bestehendeListe.addEventListener('change', () => {
          const checks = bestehendeListe.querySelectorAll('.einplanen-arbeit-check');
          const alleGesetzt = Array.from(checks).every(cb => cb.checked);
          if (splitHinweis) splitHinweis.style.display = alleGesetzt ? 'none' : 'block';
        });
      } else {
        // Komplett-Modus: Read-only, keine Checkboxen
        if (bestehendeTitle) bestehendeTitle.textContent = '📋 Alle Arbeiten werden komplett übernommen:';
        bestehendeBox.style.background = '#f0fdf4';
        bestehendeBox.style.borderLeftColor = '#16a34a';
        const gesamtZeit = this.einplanenBestehendeArbeiten.reduce((s, a) => s + a.zeit, 0);
        const gesamtText = gesamtZeit >= 60
          ? `${Math.floor(gesamtZeit/60)}h${gesamtZeit%60>0?' '+gesamtZeit%60+'min':''}` : `${gesamtZeit}min`;
        bestehendeListe.innerHTML = this.einplanenBestehendeArbeiten
          .map(a => `<div style="padding:2px 0;">✅ ${this.escapeHtml(a.bezeichnung)}</div>`)
          .join('')
          + `<div style="margin-top:6px;font-size:0.85em;color:#16a34a;">⏱️ Gesamtzeit: <strong>${gesamtText}</strong></div>`;
        if (splitHinweis) splitHinweis.style.display = 'none';
      }
    } else {
      bestehendeBox.style.display = 'none';
    }
  }
  
  // Arbeiten-Liste anzeigen (startet leer)
  this.renderEinplanenArbeiten();
  
  // Modal anzeigen
  modal.style.display = 'flex';
};

  AppClass.prototype.addArbeitToEinplanen = function() {
  const textInput = document.getElementById('einplanenArbeitText');
  const zeitInput = document.getElementById('einplanenArbeitZeit');
  
  const bezeichnung = textInput.value.trim();
  const zeitStunden = parseFloat(zeitInput.value) || 0.5;
  const zeitMinuten = Math.round(zeitStunden * 60);
  
  if (!bezeichnung) {
    alert('Bitte eine Arbeitsbeschreibung eingeben');
    return;
  }
  
  // Prüfe ob schon vorhanden
  if (this.einplanenArbeiten.find(a => a.bezeichnung === bezeichnung)) {
    alert('Diese Arbeit ist bereits hinzugefügt');
    return;
  }
  
  this.einplanenArbeiten.push({ bezeichnung, zeit: zeitMinuten, zeitStunden });
  this.renderEinplanenArbeiten();
  textInput.value = '';
  zeitInput.value = '';
};

  AppClass.prototype.removeArbeitFromEinplanen = function(index) {
  this.einplanenArbeiten.splice(index, 1);
  this.renderEinplanenArbeiten();
};

  AppClass.prototype.renderEinplanenArbeiten = function() {
  const liste = document.getElementById('einplanenArbeitenListe');
  if (!liste) return;
  
  if (this.einplanenArbeiten.length === 0) {
    liste.innerHTML = '<div style="color: #999; font-style: italic; padding: 5px;">Keine Arbeiten eingetragen</div>';
  } else {
    liste.innerHTML = this.einplanenArbeiten.map((a, i) => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 10px; background: #e8f5e9; border-radius: 4px; margin-bottom: 5px;">
        <span>${a.bezeichnung} <small style="color: #666;">(${(a.zeit / 60).toFixed(1)} h)</small></span>
        <button type="button" onclick="app.removeArbeitFromEinplanen(${i})" style="background: none; border: none; color: #f44336; cursor: pointer; font-size: 16px;">✕</button>
      </div>
    `).join('');
  }
  
  this.updateEinplanenGesamtzeit();
};

  AppClass.prototype.updateEinplanenGesamtzeit = function() {
  // Verwende die ursprüngliche geschätzte Zeit des Termins
  // Wenn Arbeiten hinzugefügt wurden, deren Gesamtzeit größer ist, verwende diese
  const arbeitenZeit = this.einplanenArbeiten.reduce((sum, a) => sum + a.zeit, 0);
  this.einplanenGesamtzeit = Math.max(this.einplanenUrspruenglicheZeit || 0, arbeitenZeit);
  
  const gesamtzeitEl = document.getElementById('einplanenGesamtzeit');
  if (gesamtzeitEl) {
    gesamtzeitEl.textContent = `${(this.einplanenGesamtzeit / 60).toFixed(1)} h`;
  }
};

  AppClass.prototype.closeEinplanenDatumModal = function() {
  const modal = document.getElementById('einplanenDatumModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Prüft auf Terminüberschneidungen bei einem Mitarbeiter/Lehrling;

  AppClass.prototype.checkTerminUeberschneidungen = async function(datum, startzeit, dauerMinuten, mitarbeiterId, lehrlingId, ausschlussTerminId = null) {
  const ueberschneidungen = [];
  
  if (!datum || !startzeit || (!mitarbeiterId && !lehrlingId)) {
    return ueberschneidungen;
  }
  
  // Lade Einstellungen für Nebenzeit
  let nebenzeitProzent = 0;
  try {
    const einstellungen = await EinstellungenService.getWerkstatt();
    nebenzeitProzent = einstellungen?.nebenzeit_prozent || 0;
  } catch (e) {}
  
  // Berechne Start- und Endzeit des neuen Termins (inkl. Nebenzeit)
  const [startH, startM] = startzeit.split(':').map(Number);
  const neuerStartMin = startH * 60 + startM;
  const dauerMitNebenzeit = nebenzeitProzent > 0 
    ? Math.round((dauerMinuten || 60) * (1 + nebenzeitProzent / 100))
    : (dauerMinuten || 60);
  const neuerEndeMin = neuerStartMin + dauerMitNebenzeit;
  
  // Lade alle Termine für dieses Datum
  const termine = await TermineService.getAll();
  const tagesTermine = termine.filter(t => 
    t.datum === datum && 
    t.id !== ausschlussTerminId &&
    !t.ist_schwebend
  );
  
  for (const t of tagesTermine) {
    // Prüfe ob dieser Termin dem gleichen Mitarbeiter/Lehrling zugeordnet ist
    let istGleicherMitarbeiter = false;
    
    if (mitarbeiterId && t.mitarbeiter_id === mitarbeiterId) {
      istGleicherMitarbeiter = true;
    }
    
    // Prüfe auch arbeitszeiten_details für Lehrlinge
    if (t.arbeitszeiten_details) {
      try {
        const details = JSON.parse(t.arbeitszeiten_details);
        if (details._gesamt_mitarbeiter_id) {
          if (mitarbeiterId && details._gesamt_mitarbeiter_id.type === 'mitarbeiter' && details._gesamt_mitarbeiter_id.id === mitarbeiterId) {
            istGleicherMitarbeiter = true;
          }
          if (lehrlingId && details._gesamt_mitarbeiter_id.type === 'lehrling' && details._gesamt_mitarbeiter_id.id === lehrlingId) {
            istGleicherMitarbeiter = true;
          }
        }
      } catch (e) {}
    }
    
    if (!istGleicherMitarbeiter) continue;
    
    // Hole Startzeit des bestehenden Termins (Priorität: startzeit-Feld, dann details._startzeit)
    let terminStartzeit = t.startzeit || null;
    if (!terminStartzeit && t.arbeitszeiten_details) {
      try {
        const details = JSON.parse(t.arbeitszeiten_details);
        terminStartzeit = details._startzeit;
        
        // Falls keine _startzeit, suche in den einzelnen Arbeiten nach startzeit
        if (!terminStartzeit) {
          for (const [key, val] of Object.entries(details)) {
            if (key.startsWith('_')) continue;
            if (typeof val === 'object' && val.startzeit) {
              terminStartzeit = val.startzeit;
              break;
            }
          }
        }
      } catch (e) {}
    }
    
    if (!terminStartzeit) continue;
    
    const [tStartH, tStartM] = terminStartzeit.split(':').map(Number);
    const tStartMin = tStartH * 60 + tStartM;
    const tDauer = t.geschaetzte_zeit || 60;
    // Nebenzeit auch auf bestehende Termine anwenden
    const tDauerMitNebenzeit = nebenzeitProzent > 0 
      ? Math.round(tDauer * (1 + nebenzeitProzent / 100))
      : tDauer;
    const tEndeMin = tStartMin + tDauerMitNebenzeit;
    
    // Prüfe Überschneidung: Neuer Termin startet vor Ende des bestehenden UND endet nach Start des bestehenden
    if (neuerStartMin < tEndeMin && neuerEndeMin > tStartMin) {
      ueberschneidungen.push({
        termin: t,
        startzeit: terminStartzeit,
        endzeit: `${Math.floor(tEndeMin/60).toString().padStart(2,'0')}:${(tEndeMin%60).toString().padStart(2,'0')}`
      });
    }
  }
  
  return ueberschneidungen;
}

// Prüft alle Termine eines Tages auf Überschneidungen und zeigt Vorschläge;

  AppClass.prototype.pruefeUeberschneidungen = async function() {
  const datum = document.getElementById('auslastungDatum').value;
  if (!datum) {
    alert('Bitte zuerst ein Datum auswählen!');
    return;
  }

  const modal = document.getElementById('ueberschneidungenModal');
  const body = document.getElementById('ueberschneidungenBody');
  const alleAnwendenBtn = document.getElementById('ueberschneidungenAlleAnwenden');
  
  modal.style.display = 'block';
  body.innerHTML = '<div class="loading">⏳ Prüfe Termine auf Überschneidungen...</div>';
  alleAnwendenBtn.style.display = 'none';

  try {
    // Lade Einstellungen für Nebenzeit
    const einstellungen = await EinstellungenService.getWerkstatt();
    const nebenzeitProzent = einstellungen?.nebenzeit_prozent || 0;

    // Lade alle Termine und Mitarbeiter
    const [termine, mitarbeiter, lehrlinge] = await Promise.all([
      TermineService.getAll(),
      MitarbeiterService.getAktive(),
      LehrlingeService.getAktive()
    ]);

    const tagesTermine = termine.filter(t => 
      t.datum === datum && 
      !t.ist_schwebend &&
      !t.geloescht_am  // Gelöschte Termine ausschließen
    );

    // Sammle alle Termin-IDs des Tages für Erweiterungssuche
    const tagesTerminIds = new Set(tagesTermine.map(t => t.id));
    
    // Finde Erweiterungen die zu Terminen dieses Tages gehören (auch wenn an anderem Tag)
    const erweiterungenVonHeute = termine.filter(t => 
      t.erweiterung_von_id && 
      tagesTerminIds.has(t.erweiterung_von_id) &&
      !t.geloescht_am &&
      !t.ist_schwebend
    );
    
    // Kombiniere Tages-Termine mit relevanten Erweiterungen
    const relevanteTermine = [...tagesTermine];
    for (const erw of erweiterungenVonHeute) {
      if (!tagesTerminIds.has(erw.id)) {
        relevanteTermine.push(erw);
      }
    }

    // Gruppiere Termine nach Mitarbeiter/Lehrling
    const termineMitZeit = [];
    
    for (const t of relevanteTermine) {
      let startzeit = null;
      let endzeit = null;
      let mitarbeiterId = t.mitarbeiter_id;
      let lehrlingId = null;
      let personTyp = 'mitarbeiter';
      let personId = mitarbeiterId;
      
      // NEUE SPALTEN: Primär startzeit und endzeit_berechnet aus dem Termin verwenden
      if (t.startzeit) {
        startzeit = t.startzeit;
      }
      if (t.endzeit_berechnet) {
        endzeit = t.endzeit_berechnet;
      }
      
      // Priorität: startzeit-Feld des Termins
      if (!startzeit && t.startzeit) {
        startzeit = t.startzeit;
      }
      
      // Fallback: bring_zeit als Startzeit
      if (!startzeit && t.bring_zeit) {
        startzeit = t.bring_zeit;
      }
      
      // Fallback: arbeitszeiten_details für ältere Termine
      if (t.arbeitszeiten_details) {
        try {
          const details = JSON.parse(t.arbeitszeiten_details);
          
          // Versuche _startzeit zu finden (falls nicht schon gesetzt)
          if (!startzeit && details._startzeit) {
            startzeit = details._startzeit;
          }
          
          // Falls keine startzeit, suche in den einzelnen Arbeiten
          if (!startzeit) {
            for (const [key, val] of Object.entries(details)) {
              if (key.startsWith('_')) continue;
              if (typeof val === 'object' && val.startzeit) {
                startzeit = val.startzeit;
                break;
              }
            }
          }
          
          // Mitarbeiter/Lehrling aus details
          if (details._gesamt_mitarbeiter_id) {
            personTyp = details._gesamt_mitarbeiter_id.type;
            personId = details._gesamt_mitarbeiter_id.id;
            if (personTyp === 'lehrling') {
              lehrlingId = personId;
              mitarbeiterId = null;
            }
          }
        } catch (e) {}
      }
      
      if (!startzeit || !personId) continue;
      
      // Startzeit in Minuten umrechnen
      const [startH, startM] = startzeit.split(':').map(Number);
      const startMin = startH * 60 + startM;
      
      // Endzeit berechnen
      let endeMin;
      if (endzeit) {
        // NEUE SPALTE: endzeit_berechnet direkt verwenden
        const [endeH, endeM] = endzeit.split(':').map(Number);
        endeMin = endeH * 60 + endeM;
      } else {
        // Fallback: aus tatsächlicher (abgeschlossen) oder geschätzter Zeit berechnen
        const dauer = (['abgeschlossen', 'in_arbeit'].includes(t.status) && t.tatsaechliche_zeit > 0)
          ? t.tatsaechliche_zeit
          : (t.geschaetzte_zeit || 60);
        const dauerMitNebenzeit = nebenzeitProzent > 0 
          ? Math.round(dauer * (1 + nebenzeitProzent / 100))
          : dauer;
        endeMin = startMin + dauerMitNebenzeit;
      }
      
      const dauer = endeMin - startMin;
      
      // Prüfe ob es eine Erweiterung ist
      const istErweiterung = t.ist_erweiterung === 1 || t.ist_erweiterung === true || t.erweiterung_von_id;
      
      termineMitZeit.push({
        termin: t,
        startzeit,
        endzeit: endzeit || `${Math.floor(endeMin/60).toString().padStart(2,'0')}:${(endeMin%60).toString().padStart(2,'0')}`,
        startMin,
        endeMin,
        dauer,
        personTyp,
        personId,
        personKey: `${personTyp}_${personId}`,
        istErweiterung,
        erweiterungVonId: t.erweiterung_von_id
      });
    }

    // Finde Überschneidungen pro Person
    const konflikte = [];
    const personenMap = new Map();
    
    for (const t of termineMitZeit) {
      if (!personenMap.has(t.personKey)) {
        personenMap.set(t.personKey, []);
      }
      personenMap.get(t.personKey).push(t);
    }

    // Für jede Person: Sortiere nach Startzeit und finde Konflikte
    for (const [personKey, personTermine] of personenMap) {
      // Sortiere nach Startzeit
      personTermine.sort((a, b) => a.startMin - b.startMin);
      
      for (let i = 0; i < personTermine.length; i++) {
        const current = personTermine[i];
        
        for (let j = i + 1; j < personTermine.length; j++) {
          const next = personTermine[j];
          
          // Überspringe wenn next eine Erweiterung von current ist (das ist gewollt!)
          if (next.erweiterungVonId === current.termin.id) {
            continue;
          }
          // Überspringe auch wenn current eine Erweiterung von next ist
          if (current.erweiterungVonId === next.termin.id) {
            continue;
          }
          
          // Korrekte Überschneidungsprüfung: Zwei Zeiträume überschneiden sich, wenn
          // der erste vor Ende des zweiten startet UND nach Beginn des zweiten endet
          // current: [startMin, endeMin), next: [startMin, endeMin)
          // Überschneidung wenn: current.startMin < next.endeMin && current.endeMin > next.startMin
          if (current.startMin < next.endeMin && current.endeMin > next.startMin) {
            // Berechne Vorschlag: Verschiebe next nach Ende von current
            const vorschlagStartMin = current.endeMin;
            const vorschlagStart = `${Math.floor(vorschlagStartMin/60).toString().padStart(2,'0')}:${(vorschlagStartMin%60).toString().padStart(2,'0')}`;
            
            // Prüfe ob Vorschlag im Rahmen (vor 18 Uhr) ist
            const vorschlagEndeMin = vorschlagStartMin + next.dauer;
            const istMachbar = vorschlagEndeMin <= 18 * 60;
            
            konflikte.push({
              termin1: current,
              termin2: next,
              vorschlagStart,
              vorschlagEndeMin,
              istMachbar,
              personKey
            });
          }
        }
      }
    }

    // Speichere Konflikte für "Alle anwenden"
    this.aktuelleKonflikte = konflikte;
    
    // === NEU: Prüfe Abholzeit-Konflikte (Fertigstellung nach Abholzeit) ===
    const abholzeitKonflikte = [];
    
    for (const t of termineMitZeit) {
      const termin = t.termin;
      
      // Hole Abholzeit aus dem Termin (DB-Feld: abholung_zeit)
      const abholzeit = termin.abholung_zeit;
      if (!abholzeit) continue;

      // Wenn Abholdatum gesetzt ist und nach dem Termindatum liegt → kein Konflikt möglich
      if (termin.abholung_datum && termin.abholung_datum > datum) continue;
      
      // Abholzeit in Minuten
      const [abholH, abholM] = abholzeit.split(':').map(Number);
      const abholMin = abholH * 60 + abholM;
      
      // Vergleiche mit berechneter Endzeit
      if (t.endeMin > abholMin) {
        abholzeitKonflikte.push({
          termin: termin,
          endzeit: t.endzeit,
          endeMin: t.endeMin,
          abholzeit: abholzeit,
          abholMin: abholMin,
          differenzMin: t.endeMin - abholMin
        });
      }
    }

    // Formatiere Datum für Anzeige
    const datumFormatiert = new Date(datum + 'T00:00:00').toLocaleDateString('de-DE', { 
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' 
    });

    // Render Ergebnis
    const hatProbleme = konflikte.length > 0 || abholzeitKonflikte.length > 0;
    
    if (!hatProbleme) {
      body.innerHTML = `
        <div style="text-align: center; padding: 30px;">
          <span style="font-size: 48px;">✅</span>
          <h4 style="color: #2e7d32; margin-top: 15px;">Keine Probleme gefunden!</h4>
          <p style="color: #666;">Alle Termine am ${datumFormatiert} sind zeitlich korrekt geplant.</p>
          <p style="color: #888; font-size: 0.9em; margin-top: 10px;">✓ Keine Überschneidungen &nbsp;•&nbsp; ✓ Abholterminzeiten werden eingehalten</p>
        </div>
      `;
    } else {
      // Hole Namen für Anzeige
      const mitarbeiterMap = new Map(mitarbeiter.map(m => [`mitarbeiter_${m.id}`, m.name]));
      const lehrlingeMap = new Map(lehrlinge.map(l => [`lehrling_${l.id}`, l.name]));
      const personenNamen = new Map([...mitarbeiterMap, ...lehrlingeMap]);

      let html = '';
      
      // === Abholzeit-Konflikte anzeigen ===
      if (abholzeitKonflikte.length > 0) {
        html += `
          <div style="background: #ffebee; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #d32f2f;">
            <strong>🚗 ${abholzeitKonflikte.length} Abholzeit-Konflikt(e)!</strong>
            <p style="margin: 5px 0 0 0; color: #666;">Diese Termine werden erst nach der geplanten Abholzeit fertig.</p>
          </div>
        `;
        
        abholzeitKonflikte.forEach((konflikt, index) => {
          const t = konflikt.termin;
          const differenzText = konflikt.differenzMin >= 60 
            ? `${Math.floor(konflikt.differenzMin/60)}h ${konflikt.differenzMin%60}min`
            : `${konflikt.differenzMin} min`;
          
          html += `
            <div class="konflikt-item" style="background: #fff8f8; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #ffcdd2;">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div>
                  <strong style="color: #d32f2f;">🚗 Abholzeit-Problem</strong>
                </div>
                <span style="background: #d32f2f; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em;">
                  ${differenzText} zu spät
                </span>
              </div>
              
              <div style="background: white; padding: 10px; border-radius: 5px; border-left: 3px solid #d32f2f;">
                <div style="font-weight: 600;">${t.termin_nr}</div>
                <div style="font-size: 0.9em; color: #666;">${t.kunde_name || 'Unbekannt'}</div>
                <div style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                  <div>
                    <span style="color: #666; font-size: 0.85em;">Fertigstellung:</span><br>
                    <span style="background: #ffcdd2; padding: 2px 6px; border-radius: 4px; font-weight: 600;">
                      ${konflikt.endzeit}
                    </span>
                  </div>
                  <div>
                    <span style="color: #666; font-size: 0.85em;">Abholzeit:</span><br>
                    <span style="background: #e8f5e9; padding: 2px 6px; border-radius: 4px; font-weight: 600;">
                      ${konflikt.abholzeit}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          `;
        });
      }
      
      // === Überschneidungs-Konflikte anzeigen ===
      if (konflikte.length > 0) {
        html += `
        <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ff9800;">
          <strong>⚠️ ${konflikte.length} Überschneidung(en) gefunden!</strong>
          <p style="margin: 5px 0 0 0; color: #666;">Klicken Sie auf "Anwenden" um den Vorschlag zu übernehmen.</p>
        </div>
      `;

        konflikte.forEach((konflikt, index) => {
          const personName = personenNamen.get(konflikt.personKey) || 'Unbekannt';
          const t1 = konflikt.termin1.termin;
          const t2 = konflikt.termin2.termin;
          
          const konfliktEnde1 = `${Math.floor(konflikt.termin1.endeMin/60).toString().padStart(2,'0')}:${(konflikt.termin1.endeMin%60).toString().padStart(2,'0')}`;
          const konfliktEnde2 = `${Math.floor(konflikt.termin2.endeMin/60).toString().padStart(2,'0')}:${(konflikt.termin2.endeMin%60).toString().padStart(2,'0')}`;
          
          // Erweiterungs-Badge
          const erw1Badge = konflikt.termin1.istErweiterung ? '<span style="background: #9c27b0; color: white; padding: 1px 5px; border-radius: 3px; font-size: 0.75em; margin-left: 5px;">Erw.</span>' : '';
          const erw2Badge = konflikt.termin2.istErweiterung ? '<span style="background: #9c27b0; color: white; padding: 1px 5px; border-radius: 3px; font-size: 0.75em; margin-left: 5px;">Erw.</span>' : '';
          
          // Datum-Info falls anderer Tag
          const datum1 = t1.datum !== datum ? `<div style="font-size: 0.8em; color: #9c27b0;">📅 ${new Date(t1.datum + 'T00:00:00').toLocaleDateString('de-DE')}</div>` : '';
          const datum2 = t2.datum !== datum ? `<div style="font-size: 0.8em; color: #9c27b0;">📅 ${new Date(t2.datum + 'T00:00:00').toLocaleDateString('de-DE')}</div>` : '';
          
          html += `
            <div class="konflikt-item" style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #ddd;">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div>
                  <strong style="color: #1976d2;">👷 ${personName}</strong>
                </div>
                <span style="background: #ff5722; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em;">
                  Konflikt ${index + 1}
                </span>
              </div>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                <div style="background: white; padding: 10px; border-radius: 5px; border-left: 3px solid #2196f3;">
                  <div style="font-weight: 600;">${t1.termin_nr}${erw1Badge}</div>
                  <div style="font-size: 0.9em; color: #666;">${t1.kunde_name || 'Unbekannt'}</div>
                  ${datum1}
                  <div style="margin-top: 5px;">
                    <span style="background: #e3f2fd; padding: 2px 6px; border-radius: 4px; font-size: 0.85em;">
                      ${konflikt.termin1.startzeit} - ${konfliktEnde1}
                    </span>
                  </div>
                </div>
                <div style="background: white; padding: 10px; border-radius: 5px; border-left: 3px solid #ff9800;">
                  <div style="font-weight: 600;">${t2.termin_nr}${erw2Badge}</div>
                  <div style="font-size: 0.9em; color: #666;">${t2.kunde_name || 'Unbekannt'}</div>
                  ${datum2}
                  <div style="margin-top: 5px;">
                    <span style="background: #fff3e0; padding: 2px 6px; border-radius: 4px; font-size: 0.85em;">
                      ${konflikt.termin2.startzeit} - ${konfliktEnde2}
                    </span>
                    <span style="color: #d32f2f; font-size: 0.85em; margin-left: 5px;">⚠️ Überschneidung</span>
                  </div>
                </div>
              </div>
              
              <div style="background: ${konflikt.istMachbar ? '#e8f5e9' : '#ffebee'}; padding: 10px; border-radius: 5px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <strong>💡 Vorschlag:</strong> ${t2.termin_nr} verschieben auf 
                  <span style="font-weight: 600; color: ${konflikt.istMachbar ? '#2e7d32' : '#d32f2f'};">
                    ${konflikt.vorschlagStart}
                  </span>
                  ${!konflikt.istMachbar ? '<span style="color: #d32f2f; font-size: 0.85em;"> (endet nach 18:00!)</span>' : ''}
                </div>
                <button class="btn ${konflikt.istMachbar ? 'btn-primary' : 'btn-secondary'}" 
                        onclick="app.wendeVorschlagAn(${index})"
                        ${!konflikt.istMachbar ? 'title="Endet nach 18 Uhr - trotzdem anwendbar"' : ''}>
                  ${konflikt.istMachbar ? '✅ Anwenden' : '⚠️ Anwenden'}
                </button>
              </div>
            </div>
          `;
        });
      }

      body.innerHTML = html;
      alleAnwendenBtn.style.display = konflikte.some(k => k.istMachbar) ? 'block' : 'none';
    }

  } catch (error) {
    console.error('Fehler bei Überschneidungsprüfung:', error);
    body.innerHTML = `
      <div style="text-align: center; padding: 30px; color: #d32f2f;">
        <span style="font-size: 48px;">❌</span>
        <h4>Fehler bei der Prüfung</h4>
        <p>${error.message || 'Unbekannter Fehler'}</p>
      </div>
    `;
  }
}

// Wendet einen einzelnen Verschiebungsvorschlag an;

  AppClass.prototype.wendeVorschlagAn = async function(index) {
  const konflikt = this.aktuelleKonflikte[index];
  if (!konflikt) return;

  const termin = konflikt.termin2.termin;
  
  try {
    // Lade aktuelle Details
    let details = {};
    if (termin.arbeitszeiten_details) {
      try {
        details = JSON.parse(termin.arbeitszeiten_details);
      } catch (e) {}
    }
    
    // Setze neue Startzeit (sowohl _startzeit als auch in allen Arbeiten)
    details._startzeit = konflikt.vorschlagStart;
    
    // Aktualisiere auch die Startzeit in den einzelnen Arbeiten
    for (const [key, val] of Object.entries(details)) {
      if (key.startsWith('_')) continue; // Überspringe Meta-Felder
      if (typeof val === 'object' && val.startzeit !== undefined) {
        val.startzeit = konflikt.vorschlagStart;
      }
    }
    
    // Speichern
    await TermineService.update(termin.id, {
      arbeitszeiten_details: JSON.stringify(details)
    });
    
    alert(`✅ ${termin.termin_nr} wurde auf ${konflikt.vorschlagStart} verschoben!`);
    
    // Modal schließen und neu laden
    document.getElementById('ueberschneidungenModal').style.display = 'none';
    this.loadAuslastung();
    this.loadZeitleiste(document.getElementById('auslastungDatum').value);
    
  } catch (error) {
    console.error('Fehler beim Anwenden des Vorschlags:', error);
    alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
  }
}

// Wendet alle machbaren Vorschläge an;

  AppClass.prototype.wendeAlleVorschlaegeAn = async function() {
  if (!this.aktuelleKonflikte || this.aktuelleKonflikte.length === 0) return;
  
  const machbareKonflikte = this.aktuelleKonflikte.filter(k => k.istMachbar);
  if (machbareKonflikte.length === 0) {
    alert('Keine anwendbaren Vorschläge vorhanden.');
    return;
  }

  if (!confirm(`${machbareKonflikte.length} Verschiebung(en) anwenden?`)) return;

  try {
    let erfolge = 0;
    
    for (const konflikt of machbareKonflikte) {
      const termin = konflikt.termin2.termin;
      
      let details = {};
      if (termin.arbeitszeiten_details) {
        try {
          details = JSON.parse(termin.arbeitszeiten_details);
        } catch (e) {}
      }
      
      // Setze neue Startzeit (sowohl _startzeit als auch in allen Arbeiten)
      details._startzeit = konflikt.vorschlagStart;
      
      // Aktualisiere auch die Startzeit in den einzelnen Arbeiten
      for (const [key, val] of Object.entries(details)) {
        if (key.startsWith('_')) continue;
        if (typeof val === 'object' && val.startzeit !== undefined) {
          val.startzeit = konflikt.vorschlagStart;
        }
      }
      
      await TermineService.update(termin.id, {
        arbeitszeiten_details: JSON.stringify(details)
      });
      
      erfolge++;
    }
    
    alert(`✅ ${erfolge} Termin(e) erfolgreich verschoben!`);
    
    // Modal schließen und neu laden
    document.getElementById('ueberschneidungenModal').style.display = 'none';
    this.loadAuslastung();
    this.loadZeitleiste(document.getElementById('auslastungDatum').value);
    
  } catch (error) {
    console.error('Fehler beim Anwenden aller Vorschläge:', error);
    alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
  }
};

  AppClass.prototype.confirmEinplanenDatum = async function() {
  const datumInput = document.getElementById('einplanenDatum');
  const uhrzeitInput = document.getElementById('einplanenUhrzeit');
  const bringzeitInput = document.getElementById('einplanenBringzeit');
  const neuesDatum = datumInput.value;
  const neueUhrzeit = uhrzeitInput ? uhrzeitInput.value : null;
  const neueBringzeit = bringzeitInput ? (bringzeitInput.value || null) : null;
  
  if (!neuesDatum) {
    alert('Bitte ein Datum wählen!');
    return;
  }
  
  if (!this.einplanenTerminId) {
    alert('Fehler: Kein Termin ausgewählt');
    return;
  }
  
  const termin = this.termineById[this.einplanenTerminId];
  if (!termin) {
    alert('Fehler: Termin nicht gefunden');
    return;
  }
  
  // Überschneidungsprüfung wenn Mitarbeiter zugeordnet und Uhrzeit angegeben
  if (neueUhrzeit && termin.mitarbeiter_id) {
    let mitarbeiterId = termin.mitarbeiter_id;
    let lehrlingId = null;
    
    // Prüfe auch ob Lehrling zugeordnet ist
    if (termin.arbeitszeiten_details) {
      try {
        const details = JSON.parse(termin.arbeitszeiten_details);
        if (details._gesamt_mitarbeiter_id?.type === 'lehrling') {
          lehrlingId = details._gesamt_mitarbeiter_id.id;
          mitarbeiterId = null;
        }
      } catch (e) {}
    }
    
    const ueberschneidungen = await this.checkTerminUeberschneidungen(
      neuesDatum, 
      neueUhrzeit, 
      this.einplanenGesamtzeit || termin.geschaetzte_zeit || 60,
      mitarbeiterId,
      lehrlingId,
      this.einplanenTerminId
    );
    
    if (ueberschneidungen.length > 0) {
      const konfliktListe = ueberschneidungen.map(u => 
        `• ${u.termin.termin_nr}: ${u.startzeit} - ${u.endzeit} (${u.termin.kunde_name || 'Unbekannt'})`
      ).join('\n');
      
      const fortfahren = confirm(
        `⚠️ TERMINÜBERSCHNEIDUNG!\n\n` +
        `Der Termin überschneidet sich mit:\n${konfliktListe}\n\n` +
        `Trotzdem fortfahren?`
      );
      
      if (!fortfahren) return;
    }
  }
  
  try {
    // Update-Daten vorbereiten
    const updateData = { datum: neuesDatum };
    
    // Bringzeit übernehmen (falls angegeben)
    if (neueBringzeit !== null) {
      updateData.bring_zeit = neueBringzeit;
    }
    
    // Bestehende arbeitszeiten_details als Basis laden
    let details = {};
    if (termin.arbeitszeiten_details) {
      try {
        details = typeof termin.arbeitszeiten_details === 'string'
          ? JSON.parse(termin.arbeitszeiten_details)
          : { ...termin.arbeitszeiten_details };
      } catch (e) {}
    }
    
    // Ausgewählte bestehende Arbeiten ermitteln
    // Direkt DOM-Checkboxen prüfen – unabhängig von einplanenSplitModus
    let ausgewaehlteBestehendeArbeiten = [...(this.einplanenBestehendeArbeiten || [])];
    let nichtAusgewaehlteArbeiten = [];
    const checkboxen = document.querySelectorAll('#einplanenDatumModal .einplanen-arbeit-check');
    if (checkboxen.length > 0 && (this.einplanenBestehendeArbeiten || []).length > 0) {
      ausgewaehlteBestehendeArbeiten = [];
      checkboxen.forEach(cb => {
        const idx = parseInt(cb.dataset.index, 10);
        const arbeit = this.einplanenBestehendeArbeiten[idx];
        if (!arbeit) return;
        if (cb.checked) ausgewaehlteBestehendeArbeiten.push(arbeit);
        else nichtAusgewaehlteArbeiten.push(arbeit);
      });
    }
    // Wenn keine Checkboxen (Komplett-Modus): alle bestehenden Arbeiten übernehmen, kein Split

    // Neue Arbeiten (aus dem ➕-Bereich) zu den ausgewählten HINZUFÜGEN, keine Duplikate
    const neueArbeiten = (this.einplanenArbeiten || []).filter(
      a => !ausgewaehlteBestehendeArbeiten.some(b => b.bezeichnung === a.bezeichnung)
    );
    const alleEinzuplanendeArbeiten = [...ausgewaehlteBestehendeArbeiten, ...neueArbeiten];

    if (alleEinzuplanendeArbeiten.length > 0) {
      updateData.arbeit = alleEinzuplanendeArbeiten.map(a => a.bezeichnung).join(' || ');
      updateData.geschaetzte_zeit = alleEinzuplanendeArbeiten.reduce((s, a) => s + a.zeit, 0);
      neueArbeiten.forEach(a => { details[a.bezeichnung] = { zeit: a.zeit }; });
      // Details von abgewählten Arbeiten entfernen
      nichtAusgewaehlteArbeiten.forEach(a => { delete details[a.bezeichnung]; });
    }
    // Wenn keine Auswahl geändert, bleiben bestehende unverändert
    
    // Wenn Uhrzeit angegeben, in arbeitszeiten_details speichern
    if (neueUhrzeit) {
      // Setze Startzeit als Gesamt-Startzeit; erste Arbeit bekommt auch Startzeit
      const ersteArbeitName = ausgewaehlteBestehendeArbeiten.length > 0
        ? ausgewaehlteBestehendeArbeiten[0].bezeichnung
        : (neueArbeiten.length > 0 ? neueArbeiten[0].bezeichnung : null);
      if (ersteArbeitName) {
        if (!details[ersteArbeitName]) details[ersteArbeitName] = {};
        details[ersteArbeitName].startzeit = neueUhrzeit;
      }
      details._startzeit = neueUhrzeit;
    }
    
    // Automatisch Status auf "geplant" setzen wenn Datum und Zeit vergeben
    if (neueUhrzeit && termin.mitarbeiter_id) {
      updateData.status = 'geplant';
    }
    
    // Details speichern
    updateData.arbeitszeiten_details = JSON.stringify(details);
    
    // Datum und Arbeiten aktualisieren
    await TermineService.update(this.einplanenTerminId, updateData);
    
    // Dann Schwebend-Status aufheben
    await TermineService.setSchwebend(this.einplanenTerminId, false);

    // Wenn nicht alle bestehenden Arbeiten ausgewählt → Rest als neuen schwebenden Termin anlegen
    if (nichtAusgewaehlteArbeiten.length > 0) {
      const restDetails = {};
      nichtAusgewaehlteArbeiten.forEach(a => {
        restDetails[a.bezeichnung] = { zeit: a.zeit };
      });
      const restTermin = {
        kunde_name: termin.kunde_name || null,
        kennzeichen: termin.kennzeichen || null,
        telefon: termin.telefon || null,
        arbeit: nichtAusgewaehlteArbeiten.map(a => a.bezeichnung).join(' || '),
        geschaetzte_zeit: nichtAusgewaehlteArbeiten.reduce((s, a) => s + a.zeit, 0),
        datum: '9999-12-31',
        ist_schwebend: 1,
        status: 'neu',
        bring_zeit: null,
        abholung_typ: termin.abholung_typ || null,
        abholung_details: termin.abholung_details || null,
        vin: termin.vin || null,
        fahrzeugtyp: termin.fahrzeugtyp || null,
        dringlichkeit: termin.dringlichkeit || null,
        kilometerstand: termin.kilometerstand || null,
        ersatzauto: termin.ersatzauto || false,
        arbeitszeiten_details: JSON.stringify(restDetails)
      };
      await TermineService.create(restTermin);
    }
    
    // Lokalen Cache aktualisieren
    termin.datum = neuesDatum;
    termin.ist_schwebend = 0;
    if (updateData.arbeit !== undefined) termin.arbeit = updateData.arbeit;
    if (updateData.geschaetzte_zeit !== undefined) termin.geschaetzte_zeit = updateData.geschaetzte_zeit;
    termin.arbeitszeiten_details = updateData.arbeitszeiten_details;
    if (updateData.bring_zeit !== undefined) {
      termin.bring_zeit = updateData.bring_zeit;
    }
    
    // Button-Text aktualisieren
    this.updateSchwebendButton(false);
    
    // Modal schließen
    this.closeEinplanenDatumModal();
    
    const uhrzeitText = neueUhrzeit ? ` um ${neueUhrzeit} Uhr` : '';
    const neueArbTxt = neueArbeiten.length > 0 ? `\n${neueArbeiten.length} neue Arbeit(en) hinzugefügt.` : '';
    const splitTxt = nichtAusgewaehlteArbeiten.length > 0
      ? `\n${nichtAusgewaehlteArbeiten.length} Arbeit(en) als neuen schwebenden Termin gespeichert.` : '';
    alert(`Termin wurde für ${neuesDatum}${uhrzeitText} eingeplant!${neueArbTxt}${splitTxt}`);
    
    // Daten neu laden
    this.loadTermine();
    this.loadAuslastung();
    
    // Wenn von Wartende Aktionen aufgerufen, auch diese Liste aktualisieren
    if (this.einplanenFromWartendeAktionen) {
      this.loadWartendeAktionen();
      this.einplanenFromWartendeAktionen = false;
    }
    
    // Details-Modal aktualisieren
    if (this.currentDetailTerminId === this.einplanenTerminId) {
      this.showTerminDetails(this.einplanenTerminId);
    }
  } catch (error) {
    console.error('Fehler beim Einplanen:', error);
    alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
  }
}

// Split-Modal öffnen;

  AppClass.prototype.openSplitModal = function() {
  if (!this.currentDetailTerminId) return;
  
  const termin = this.termineById[this.currentDetailTerminId];
  if (!termin) return;

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
};

  AppClass.prototype.updateSplitPreview = function() {
  const gesamtzeit = this.splitGesamtzeit || 60;
  const range = document.getElementById('splitTeil1Range');
  const teil1Zeit = parseInt(range.value) || 0;
  const teil2Zeit = gesamtzeit - teil1Zeit;
  
  document.getElementById('splitTeil1Zeit').value = teil1Zeit;
  document.getElementById('splitTeil2Zeit').value = teil2Zeit;
  
  document.getElementById('splitPreviewTeil1').textContent = `${teil1Zeit} Min. (${this.formatMinutesToHours(teil1Zeit)})`;
  document.getElementById('splitPreviewTeil2').textContent = `${teil2Zeit} Min. (${this.formatMinutesToHours(teil2Zeit)})`;
};

  AppClass.prototype.updateSplitFromInput = function() {
  const gesamtzeit = this.splitGesamtzeit || 60;
  let teil1Zeit = parseInt(document.getElementById('splitTeil1Zeit').value) || 0;
  
  // Begrenzen auf gültigen Bereich
  if (teil1Zeit < 1) teil1Zeit = 1;
  if (teil1Zeit >= gesamtzeit) teil1Zeit = gesamtzeit - 1;
  
  const teil2Zeit = gesamtzeit - teil1Zeit;
  
  document.getElementById('splitTeil1Range').value = teil1Zeit;
  document.getElementById('splitTeil2Zeit').value = teil2Zeit;
  
  document.getElementById('splitPreviewTeil1').textContent = `${teil1Zeit} Min. (${this.formatMinutesToHours(teil1Zeit)})`;
  document.getElementById('splitPreviewTeil2').textContent = `${teil2Zeit} Min. (${this.formatMinutesToHours(teil2Zeit)})`;
};

  AppClass.prototype.closeSplitModal = function() {
  document.getElementById('terminSplitModal').style.display = 'none';
};

  AppClass.prototype.executeSplit = async function() {
  if (!this.currentDetailTerminId) return;
  
  const teil1Zeit = parseInt(document.getElementById('splitTeil1Zeit').value);
  const teil2Datum = document.getElementById('splitTeil2Datum').value;
  const teil2Zeit = parseInt(document.getElementById('splitTeil2Zeit').value);
  
  // Validierung
  if (!teil1Zeit || teil1Zeit <= 0) {
    alert('Bitte geben Sie eine gültige Zeit für Teil 1 an.');
    return;
  }
  if (!teil2Datum) {
    alert('Bitte wählen Sie ein Datum für Teil 2.');
    return;
  }
  if (!teil2Zeit || teil2Zeit <= 0) {
    alert('Teil 2 muss mindestens 1 Minute haben.');
    return;
  }
  
  if (!confirm(`Termin aufteilen?\n\nTeil 1: ${teil1Zeit} Min.\nTeil 2: ${teil2Zeit} Min. am ${teil2Datum}`)) {
    return;
  }
  
  try {
    const result = await TermineService.splitTermin(
      this.currentDetailTerminId, 
      teil1Zeit, 
      teil2Datum, 
      teil2Zeit
    );
    
    alert(`Termin erfolgreich aufgeteilt!\n\nTeil 1: ${result.teil1.zeit} Min.\nTeil 2: ${result.teil2.termin_nr} am ${result.teil2.datum} (${result.teil2.zeit} Min.)`);
    
    this.closeSplitModal();
    this.closeTerminDetails();
    this.loadTermine();
    this.loadAuslastung();
  } catch (error) {
    console.error('Fehler beim Aufteilen des Termins:', error);
    alert('Fehler beim Aufteilen: ' + (error.message || 'Unbekannter Fehler'));
  }
}

// ============================================
// AUFTRAGSERWEITERUNG FUNKTIONEN
// ============================================

/**
 * Öffnet das Erweiterungs-Modal für einen bestimmten Termin (aus Schnell-Status-Dialog)
 */;

  AppClass.prototype.openErweiterungModalForTermin = async function(terminId) {
  console.log('=== openErweiterungModalForTermin aufgerufen ===');
  console.log('Termin-ID:', terminId);
  
  // Setze currentDetailTerminId und rufe dann openErweiterungModal auf
  this.currentDetailTerminId = terminId;
  
  // Stelle sicher, dass der Termin im Cache ist
  if (!this.termineById[terminId]) {
    console.log('Termin nicht im Cache, lade von API...');
    try {
      const termin = await TermineService.getById(terminId);
      console.log('Termin geladen:', termin);
      if (termin) {
        this.termineById[terminId] = termin;
      } else {
        console.error('Termin nicht gefunden (API returned null/undefined)');
        this.showToast('❌ Termin nicht gefunden', 'error');
        return;
      }
    } catch (error) {
      console.error('Fehler beim Laden des Termins:', error);
      this.showToast('❌ Termin konnte nicht geladen werden', 'error');
      return;
    }
  } else {
    console.log('Termin bereits im Cache:', this.termineById[terminId]);
  }
  
  // Öffne das normale Erweiterungs-Modal
  console.log('Öffne Erweiterungs-Modal...');
  await this.openErweiterungModal();
}

/**
 * Öffnet das Erweiterungs-Modal für den aktuellen Termin
 */;

  AppClass.prototype.openErweiterungModal = async function() {
  console.log('=== openErweiterungModal aufgerufen ===');
  console.log('currentDetailTerminId:', this.currentDetailTerminId);
  
  if (!this.currentDetailTerminId) {
    console.error('Fehler: Kein Termin ausgewählt (currentDetailTerminId ist null/undefined)');
    alert('Kein Termin ausgewählt.');
    return;
  }

  const termin = this.termineById[this.currentDetailTerminId];
  console.log('Termin aus Cache:', termin);
  
  if (!termin) {
    console.error('Fehler: Termin nicht im Cache gefunden für ID:', this.currentDetailTerminId);
    alert('Termin nicht gefunden.');
    return;
  }

  console.log('Termin gefunden, initialisiere Modal...');

  // Speichere Termin-Daten für spätere Verwendung
  this.erweiterungTermin = termin;
  this.erweiterungKonflikte = null;

  // Fülle Original-Termin-Info
  const detailsEl = document.getElementById('erweiterungTerminDetails');
  const endzeitBerechnet = this.berechneEndzeit(termin);
  
  detailsEl.innerHTML = `
    <span><strong>Nr:</strong> ${termin.termin_nr || '-'}</span>
    <span><strong>Kunde:</strong> ${termin.kunde_name || '-'}</span>
    <span><strong>Kennzeichen:</strong> ${termin.kennzeichen || '-'}</span>
    <span><strong>Datum:</strong> ${this.formatDateGerman(termin.datum)}</span>
    <span><strong>Zeit:</strong> ${termin.bring_zeit || termin.startzeit || '08:00'} - ${endzeitBerechnet}</span>
    <span><strong>Dauer:</strong> ${termin.geschaetzte_zeit || 0} Min</span>
  `;
  
  console.log('Lade bestehende Erweiterungen...');
  // Lade und zeige bestehende Erweiterungen
  await this.ladeBestehendeErweiterungen(termin.id);

  // Berechne "Morgen"-Datum (nächster Arbeitstag)
  const morgenDatum = this.naechsterArbeitstag(termin.datum);
  document.getElementById('morgenDatumAnzeige').textContent = this.formatDateGerman(morgenDatum);

  // Setze Mindestdatum für Datumswahl
  document.getElementById('erweiterungDatum').min = termin.datum;
  document.getElementById('erweiterungDatum').value = morgenDatum;

  // Reset Formular
  document.getElementById('erweiterungNeueArbeit').value = '';
  document.getElementById('erweiterungArbeitszeit').value = '0.5';
  document.getElementById('erweiterungTeileStatus').value = 'vorraetig';
  document.getElementById('typAnschluss').checked = true;
  document.getElementById('erweiterungDatumAuswahl').style.display = 'none';
  document.getElementById('erweiterungKonflikte').style.display = 'none';
  document.getElementById('erweiterungVorschlaege').style.display = 'none';

  // Initiale Vorschau aktualisieren
  this.updateErweiterungVorschau();

  console.log('Zeige Modal an...');
  // Modal anzeigen
  const modal = document.getElementById('erweiterungModal');
  modal.style.display = 'block';
  console.log('Modal display style gesetzt auf: block');

  // Prüfe Konflikte für "Im Anschluss"
  this.pruefeErweiterungsKonflikte();
  
  console.log('=== openErweiterungModal abgeschlossen ===');
}

/**
 * Schließt das Erweiterungs-Modal
 */;

  AppClass.prototype.closeErweiterungModal = function() {
  document.getElementById('erweiterungModal').style.display = 'none';
  this.erweiterungTermin = null;
  this.erweiterungKonflikte = null;
}

/**
 * Lädt und zeigt bestehende Erweiterungen für einen Termin
 */;

  AppClass.prototype.ladeBestehendeErweiterungen = async function(terminId) {
  const bestehendeBox = document.getElementById('erweiterungBestehendeBox');
  const bestehendeListe = document.getElementById('erweiterungBestehendeListe');
  
  if (!bestehendeBox || !bestehendeListe) return;
  
  // Sammle Erweiterungen aus dem Cache
  const erweiterungen = [];
  Object.values(this.termineById).forEach(t => {
    if (t.erweiterung_von_id === terminId && !t.ist_geloescht && t.geloescht_am === null) {
      erweiterungen.push(t);
    }
  });
  
  // Falls nicht im Cache, lade von der API
  if (erweiterungen.length === 0) {
    try {
      const apiErweiterungen = await TermineService.getErweiterungen(terminId);
      if (apiErweiterungen && apiErweiterungen.length > 0) {
        erweiterungen.push(...apiErweiterungen);
      }
    } catch (e) {
      console.warn('Fehler beim Laden der Erweiterungen:', e);
    }
  }
  
  if (erweiterungen.length === 0) {
    bestehendeBox.style.display = 'none';
    return;
  }
  
  // Sortiere nach Datum
  erweiterungen.sort((a, b) => {
    const datumA = a.datum || '';
    const datumB = b.datum || '';
    return datumA.localeCompare(datumB);
  });
  
  // Baue HTML für bestehende Erweiterungen
  let html = `<div class="erweiterung-bestehende-liste">`;
  
  erweiterungen.forEach(erw => {
    const dauerText = erw.geschaetzte_zeit ? `${erw.geschaetzte_zeit} Min` : '-';
    const zeitText = erw.bring_zeit ? erw.bring_zeit : '-';
    const statusClass = erw.status ? erw.status.toLowerCase().replace(' ', '-') : 'geplant';
    const statusIcon = this.getStatusIcon(erw.status);
    
    html += `
      <div class="erweiterung-bestehende-item" onclick="app.showTerminDetails(${erw.id}); app.closeErweiterungModal();">
        <div class="erweiterung-bestehende-header">
          <span class="erweiterung-bestehende-nr">${erw.termin_nr || '#' + erw.id}</span>
          <span class="erweiterung-bestehende-status status-badge-${statusClass}">${statusIcon} ${erw.status || 'geplant'}</span>
        </div>
        <div class="erweiterung-bestehende-details">
          <span>📅 ${this.formatDateGerman(erw.datum)}</span>
          <span>⏰ ${zeitText}</span>
          <span>⏱️ ${dauerText}</span>
        </div>
        <div class="erweiterung-bestehende-arbeit">${this.escapeHtml(erw.arbeit || '-')}</div>
      </div>
    `;
  });
  
  html += `</div>`;
  html += `<div class="erweiterung-bestehende-info">ℹ️ Klicken Sie auf eine Erweiterung, um Details anzuzeigen</div>`;
  
  bestehendeListe.innerHTML = html;
  bestehendeBox.style.display = 'block';
}

/**
 * Hilfsfunktion: Status-Icon zurückgeben
 */;

  AppClass.prototype.getStatusIcon = function(status) {
  const icons = {
    'geplant': '📋',
    'in_arbeit': '🔧',
    'in arbeit': '🔧',
    'wartend': '⏸️',
    'abgeschlossen': '✅',
    'storniert': '❌'
  };
  return icons[(status || '').toLowerCase()] || '📋';
}

/**
 * Zeitleisten-Kontextmenü: Auftrag erweitern
 */;

  AppClass.prototype.zeitleisteKontextErweitern = function() {
  this.closeZeitleisteKontextmenu();
  if (this.zeitleisteKontextTerminId) {
    this.currentDetailTerminId = this.zeitleisteKontextTerminId;
    // Stelle sicher dass der Termin im Cache ist
    if (!this.termineById[this.zeitleisteKontextTerminId]) {
      // Lade den Termin
      TermineService.getById(this.zeitleisteKontextTerminId).then(termin => {
        if (termin) {
          this.termineById[termin.id] = termin;
          this.openErweiterungModal();
        }
      });
    } else {
      this.openErweiterungModal();
    }
  }
}

/**
 * Öffnet den Dialog "Bis Feierabend – Folgearbeit morgen"
 */;

  AppClass.prototype.zeitleisteFolgearbeitErstellen = async function() {
  this.closeZeitleisteKontextmenu();
  if (!this.zeitleisteKontextTerminId) return;

  let termin = this.termineById[this.zeitleisteKontextTerminId];
  if (!termin) {
    try {
      termin = await TermineService.getById(this.zeitleisteKontextTerminId);
      if (!termin) {
        this.showToast('❌ Termin nicht gefunden', 'error');
        return;
      }
      this.termineById[termin.id] = termin;
    } catch (e) {
      this.showToast('❌ Termin konnte nicht geladen werden', 'error');
      return;
    }
  }

  this.folgearbeitTermin = termin;

  const bringZeit = termin.bring_zeit || '08:00';
  const std = Math.round(termin.geschaetzte_zeit / 60 * 10) / 10;
  document.getElementById('folgearbeitTerminInfo').innerHTML = `
    <strong>${termin.termin_nr || '#' + termin.id}</strong> – ${termin.kunde_name || 'Unbekannt'}<br>
    <small>${termin.arbeit || ''}</small><br>
    <small>Bring-Zeit: <strong>${bringZeit}</strong> &nbsp;|&nbsp; Geschätzte Gesamtzeit: <strong>${std} Std. (${termin.geschaetzte_zeit} Min.)</strong></small>
  `;

  document.getElementById('folgearbeitVorschau').style.display = 'none';
  document.getElementById('folgearbeitModal').style.display = 'block';
  this.updateFolgearbeitVorschau();
};

  AppClass.prototype.updateFolgearbeitVorschau = function() {
  if (!this.folgearbeitTermin) return;
  const feierabend = document.getElementById('folgearbeitFeierabend')?.value || '17:00';
  const bringZeit = this.folgearbeitTermin.bring_zeit || '08:00';
  const [bh, bm] = bringZeit.split(':').map(Number);
  const [fh, fm] = feierabend.split(':').map(Number);
  const heuteMinuten = (fh * 60 + fm) - (bh * 60 + bm);
  const restMinuten = this.folgearbeitTermin.geschaetzte_zeit - heuteMinuten;
  const vorschau = document.getElementById('folgearbeitVorschau');
  if (!vorschau) return;

  if (heuteMinuten <= 0) {
    vorschau.innerHTML = `<div style="padding:10px;background:#fff3e0;border-radius:6px;border-left:4px solid #ff9800;">⚠️ Feierabend-Zeit liegt vor der Bring-Zeit des Termins.</div>`;
    vorschau.style.display = 'block';
    return;
  }
  if (restMinuten <= 0) {
    vorschau.innerHTML = `<div style="padding:10px;background:#e3f2fd;border-radius:6px;border-left:4px solid #2196f3;">ℹ️ Der Termin kann bis ${feierabend} Uhr vollständig abgeschlossen werden – keine Folgearbeit nötig.</div>`;
    vorschau.style.display = 'block';
    return;
  }
  const heuteStd = Math.round(heuteMinuten / 60 * 10) / 10;
  const restStd = Math.round(restMinuten / 60 * 10) / 10;
  vorschau.innerHTML = `
    <div style="padding:12px;background:#e8f5e9;border-radius:8px;border-left:4px solid #4caf50;">
      <strong>📊 Vorschau:</strong>
      <ul style="margin:8px 0;padding-left:20px;">
        <li>Heute (${bringZeit} – ${feierabend} Uhr): <strong>${heuteMinuten} Min. (${heuteStd} Std.)</strong></li>
        <li>Morgen – Folgearbeit: <strong>${restMinuten} Min. (${restStd} Std.)</strong></li>
      </ul>
    </div>
  `;
  vorschau.style.display = 'block';
};

  AppClass.prototype.closeFolgearbeitModal = function() {
  const modal = document.getElementById('folgearbeitModal');
  if (modal) modal.style.display = 'none';
  this.folgearbeitTermin = null;
};

  AppClass.prototype.folgearbeitBestaetigen = async function() {
  if (!this.folgearbeitTermin) return;
  const feierabend = document.getElementById('folgearbeitFeierabend')?.value || '17:00';
  const btn = document.getElementById('btnFolgearbeitBestaetigen');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Wird erstellt…'; }
  try {
    const result = await TermineService.folgearbeitErstellen(this.folgearbeitTermin.id, feierabend);
    this.closeFolgearbeitModal();
    this.showToast(
      `✅ Folgearbeit erstellt: ${result.heute_minuten} Min. heute, ${result.rest_minuten} Min. am ${result.folge_datum}`,
      'success'
    );
    if (typeof this.loadZeitleiste === 'function') this.loadZeitleiste();
    if (typeof this.loadAuslastung === 'function') this.loadAuslastung();
    if (typeof this.loadTermine === 'function') this.loadTermine();
  } catch (err) {
    this.showToast('❌ Fehler: ' + (err.message || 'Unbekannter Fehler'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Folgearbeit erstellen'; }
  }
}

/**
 * Wird aufgerufen wenn der Erweiterungstyp geändert wird
 */;

  AppClass.prototype.updateErweiterungTyp = function() {
  const typ = document.querySelector('input[name="erweiterungTyp"]:checked').value;
  const datumAuswahl = document.getElementById('erweiterungDatumAuswahl');
  const konflikteSection = document.getElementById('erweiterungKonflikte');
  
  if (typ === 'datum') {
    datumAuswahl.style.display = 'block';
    konflikteSection.style.display = 'none';
  } else {
    datumAuswahl.style.display = 'none';
    
    if (typ === 'anschluss') {
      this.pruefeErweiterungsKonflikte();
    } else {
      konflikteSection.style.display = 'none';
    }
  }
  
  this.updateErweiterungVorschau();
  this.ladeSmartVorschlaege();
}

/**
 * Prüft auf Konflikte bei "Im Anschluss" Option
 */;

  AppClass.prototype.pruefeErweiterungsKonflikte = async function() {
  if (!this.erweiterungTermin) return;
  
  const arbeitszeitStunden = parseFloat(document.getElementById('erweiterungArbeitszeit').value) || 0.5;
  const arbeitszeit = Math.round(arbeitszeitStunden * 60); // In Minuten umrechnen
  const konflikteSection = document.getElementById('erweiterungKonflikte');
  const konfliktDetails = document.getElementById('konfliktDetails');
  
  try {
    const konflikte = await TermineService.pruefeErweiterungsKonflikte(
      this.erweiterungTermin.id, 
      arbeitszeit
    );
    
    this.erweiterungKonflikte = konflikte;
    
    if (konflikte.hat_konflikte || konflikte.folgetermine_zum_verschieben.length > 0) {
      // Es gibt Konflikte oder zu verschiebende Termine
      let detailsHtml = `
        <p><strong>Neue Endzeit:</strong> ${konflikte.neue_endzeit} (aktuell: ${konflikte.aktuelle_endzeit})</p>
      `;
      
      if (konflikte.folgetermine_zum_verschieben.length > 0) {
        detailsHtml += `
          <p style="margin-top: 10px;"><strong>Folgende Termine werden verschoben:</strong></p>
          <ul style="margin: 5px 0; padding-left: 20px;">
        `;
        konflikte.folgetermine_zum_verschieben.forEach(t => {
          detailsHtml += `<li>${t.termin_nr || '#' + t.id} - ${t.kunde_name || 'Kunde'} (${t.bring_zeit})</li>`;
        });
        detailsHtml += '</ul>';
      }
      
      konfliktDetails.innerHTML = detailsHtml;
      konflikteSection.style.display = 'block';
      
      // Lade verfügbare Mitarbeiter
      this.ladeVerfuegbareMitarbeiter();
    } else {
      konflikteSection.style.display = 'none';
    }
  } catch (error) {
    console.error('Fehler beim Prüfen der Konflikte:', error);
    konflikteSection.style.display = 'none';
  }
}

/**
 * Wird aufgerufen wenn die Konfliktlösung geändert wird
 */;

  AppClass.prototype.updateKonfliktLoesung = function() {
  const loesung = document.querySelector('input[name="konfliktLoesung"]:checked').value;
  const verfuegbareSection = document.getElementById('verfuegbareMitarbeiter');
  
  if (loesung === 'anderer') {
    verfuegbareSection.style.display = 'block';
    this.ladeVerfuegbareMitarbeiter();
  } else {
    verfuegbareSection.style.display = 'none';
  }
  
  this.updateErweiterungVorschau();
}

/**
 * Lädt verfügbare Mitarbeiter für den Zeitraum
 */;

  AppClass.prototype.ladeVerfuegbareMitarbeiter = async function() {
  if (!this.erweiterungTermin) return;
  
  const arbeitszeitStunden = parseFloat(document.getElementById('erweiterungArbeitszeit').value) || 0.5;
  const arbeitszeit = Math.round(arbeitszeitStunden * 60); // In Minuten umrechnen
  const endzeit = this.berechneEndzeit(this.erweiterungTermin.bring_zeit, this.erweiterungTermin.geschaetzte_zeit);
  
  const select = document.getElementById('erweiterungMitarbeiterSelect');
  const infoEl = document.getElementById('verfuegbarkeitInfo');
  
  select.innerHTML = '<option value="">Wird geladen...</option>';
  
  try {
    const verfuegbare = await TermineService.findeVerfuegbareMitarbeiter(
      this.erweiterungTermin.datum,
      endzeit,
      arbeitszeit
    );
    
    if (verfuegbare.length === 0) {
      select.innerHTML = '<option value="">Keine Mitarbeiter verfügbar</option>';
      infoEl.innerHTML = '⚠️ Kein Mitarbeiter hat ausreichend freie Kapazität.';
      infoEl.className = 'verfuegbarkeit-info nicht-verfuegbar';
    } else {
      select.innerHTML = verfuegbare.map(ma => {
        const status = ma.ist_sofort_verfuegbar ? '✅' : '⏰';
        const zeitInfo = ma.ist_sofort_verfuegbar 
          ? 'sofort verfügbar' 
          : `ab ${ma.naechster_freier_slot}`;
        return `<option value="${ma.id}" data-sofort="${ma.ist_sofort_verfuegbar}" data-slot="${ma.naechster_freier_slot}">
          ${status} ${ma.name} (${zeitInfo}, ${ma.restkapazitaet_minuten} Min frei)
        </option>`;
      }).join('');
      
      const erster = verfuegbare[0];
      if (erster.ist_sofort_verfuegbar) {
        infoEl.innerHTML = `✅ ${this._escapeHtml(erster.name)} kann die Arbeit direkt im Anschluss übernehmen.`;
        infoEl.className = 'verfuegbarkeit-info';
      } else {
        infoEl.innerHTML = `⏰ ${this._escapeHtml(erster.name)} hat den nächsten freien Slot um ${this._escapeHtml(erster.naechster_freier_slot)}.`;
        infoEl.className = 'verfuegbarkeit-info nicht-verfuegbar';
      }
    }
  } catch (error) {
    console.error('Fehler beim Laden der verfügbaren Mitarbeiter:', error);
    select.innerHTML = '<option value="">Fehler beim Laden</option>';
  }
}

/**
 * Lädt Smart-Vorschläge für die Erweiterung
 */;

  AppClass.prototype.ladeSmartVorschlaege = async function() {
  if (!this.erweiterungTermin) return;
  
  const vorschlaegeSection = document.getElementById('erweiterungVorschlaege');
  const vorschlaegeContent = document.getElementById('vorschlaegeContent');
  const typ = document.querySelector('input[name="erweiterungTyp"]:checked').value;
  const arbeitszeitStunden = parseFloat(document.getElementById('erweiterungArbeitszeit').value) || 0.5;
  const arbeitszeit = Math.round(arbeitszeitStunden * 60); // In Minuten umrechnen
  
  try {
    // Lade verfügbare Mitarbeiter für verschiedene Szenarien
    const endzeit = this.berechneEndzeit(this.erweiterungTermin.bring_zeit, this.erweiterungTermin.geschaetzte_zeit);
    const morgenDatum = this.naechsterArbeitstag(this.erweiterungTermin.datum);
    
    const [verfuegbareHeute, verfuegbareMorgen] = await Promise.all([
      TermineService.findeVerfuegbareMitarbeiter(this.erweiterungTermin.datum, endzeit, arbeitszeit),
      TermineService.findeVerfuegbareMitarbeiter(morgenDatum, '08:00', arbeitszeit)
    ]);
    
    let vorschlaege = [];
    
    // Vorschlag 1: Sofort verfügbarer anderer MA heute
    const sofortVerfuegbar = verfuegbareHeute.find(ma => 
      ma.ist_sofort_verfuegbar && ma.id !== this.erweiterungTermin.mitarbeiter_id
    );
    if (sofortVerfuegbar && typ === 'anschluss') {
      vorschlaege.push({
        text: `${sofortVerfuegbar.name} kann heute ab ${endzeit} übernehmen`,
        action: 'Auswählen →',
        onClick: () => {
          document.getElementById('loesungAndererMA').checked = true;
          this.updateKonfliktLoesung();
          document.getElementById('erweiterungMitarbeiterSelect').value = sofortVerfuegbar.id;
        }
      });
    }
    
    // Vorschlag 2: Morgen früh beim gleichen MA
    const gleicheMaMorgen = verfuegbareMorgen.find(ma => ma.id === this.erweiterungTermin.mitarbeiter_id);
    if (gleicheMaMorgen && typ !== 'morgen') {
      vorschlaege.push({
        text: `Morgen früh bei ${gleicheMaMorgen.name} (${gleicheMaMorgen.restkapazitaet_minuten} Min frei)`,
        action: 'Morgen wählen →',
        onClick: () => {
          document.getElementById('typMorgen').checked = true;
          this.updateErweiterungTyp();
        }
      });
    }
    
    if (vorschlaege.length > 0) {
      vorschlaegeContent.innerHTML = vorschlaege.map((v, i) => `
        <div class="vorschlag-item" onclick="app.erweiterungVorschlagAusfuehren(${i})">
          <span class="vorschlag-text">${v.text}</span>
          <span class="vorschlag-action">${v.action}</span>
        </div>
      `).join('');
      
      // Speichere onClick-Handler
      this.erweiterungVorschlaege = vorschlaege;
      vorschlaegeSection.style.display = 'block';
    } else {
      vorschlaegeSection.style.display = 'none';
    }
  } catch (error) {
    console.error('Fehler beim Laden der Vorschläge:', error);
    vorschlaegeSection.style.display = 'none';
  }
};

  AppClass.prototype.erweiterungVorschlagAusfuehren = function(index) {
  if (this.erweiterungVorschlaege && this.erweiterungVorschlaege[index]) {
    this.erweiterungVorschlaege[index].onClick();
  }
}

/**
 * Aktualisiert die Vorschau
 */;

  AppClass.prototype.updateErweiterungVorschau = function() {
  const arbeitszeitStunden = parseFloat(document.getElementById('erweiterungArbeitszeit').value) || 0;
  const typ = document.querySelector('input[name="erweiterungTyp"]:checked')?.value || 'anschluss';
  
  // Bug 1 Fix: Eindeutige IDs für Erweiterungs-Vorschau verwenden
  document.getElementById('erweiterungVorschauArbeitszeit').textContent = `${arbeitszeitStunden} h`;
  
  let datumText = '--';
  let mitarbeiterText = '--';
  
  if (this.erweiterungTermin) {
    if (typ === 'anschluss') {
      datumText = this.formatDateGerman(this.erweiterungTermin.datum) + ' (Anschluss)';
      
      const konfliktLoesung = document.querySelector('input[name="konfliktLoesung"]:checked')?.value;
      if (konfliktLoesung === 'anderer') {
        const select = document.getElementById('erweiterungMitarbeiterSelect');
        const selectedOption = select.options[select.selectedIndex];
        mitarbeiterText = selectedOption?.text?.split('(')[0]?.trim() || 'Anderer MA';
      } else {
        mitarbeiterText = this.erweiterungTermin.mitarbeiter_name || 'Gleicher MA';
      }
    } else if (typ === 'morgen') {
      const morgenDatum = this.naechsterArbeitstag(this.erweiterungTermin.datum);
      datumText = this.formatDateGerman(morgenDatum);
      mitarbeiterText = this.erweiterungTermin.mitarbeiter_name || 'Gleicher MA';
    } else if (typ === 'datum') {
      const datum = document.getElementById('erweiterungDatum').value;
      datumText = datum ? this.formatDateGerman(datum) : '--';
      mitarbeiterText = this.erweiterungTermin.mitarbeiter_name || 'Gleicher MA';
    }
  }
  
  // Bug 1 Fix: Eindeutige IDs für Erweiterungs-Vorschau verwenden
  document.getElementById('erweiterungVorschauDatum').textContent = datumText;
  document.getElementById('erweiterungVorschauMitarbeiter').textContent = mitarbeiterText;
}

/**
 * Speichert die Erweiterung
 */;

  AppClass.prototype.speichereErweiterung = async function() {
  if (!this.erweiterungTermin) {
    alert('Kein Termin ausgewählt.');
    return;
  }

  const neueArbeit = document.getElementById('erweiterungNeueArbeit').value.trim();
  const arbeitszeitStunden = parseFloat(document.getElementById('erweiterungArbeitszeit').value) || 0;
  const arbeitszeit = Math.round(arbeitszeitStunden * 60); // In Minuten umrechnen
  const teileStatus = document.getElementById('erweiterungTeileStatus').value;
  const typ = document.querySelector('input[name="erweiterungTyp"]:checked').value;

  // Validierung
  if (!neueArbeit) {
    alert('Bitte geben Sie eine Arbeitsbeschreibung ein.');
    document.getElementById('erweiterungNeueArbeit').focus();
    return;
  }
  if (arbeitszeitStunden < 0.1) {
    alert('Die Arbeitszeit muss mindestens 0.1 Stunden (6 Min) betragen.');
    document.getElementById('erweiterungArbeitszeit').focus();
    return;
  }

  // Daten sammeln
  const erweiterungsDaten = {
    neue_arbeit: neueArbeit,
    arbeitszeit_minuten: arbeitszeit,
    teile_status: teileStatus,
    erweiterung_typ: typ
  };

  // Typ-spezifische Daten
  if (typ === 'anschluss') {
    const konfliktLoesung = document.querySelector('input[name="konfliktLoesung"]:checked')?.value || 'gleicher';
    erweiterungsDaten.ist_gleicher_mitarbeiter = konfliktLoesung === 'gleicher';
    
    if (konfliktLoesung === 'anderer') {
      const mitarbeiterId = document.getElementById('erweiterungMitarbeiterSelect').value;
      if (!mitarbeiterId) {
        alert('Bitte wählen Sie einen Mitarbeiter aus.');
        return;
      }
      erweiterungsDaten.mitarbeiter_id = parseInt(mitarbeiterId);
    }
    
    // Folgetermine verschieben wenn gleicher MA und Konflikte vorhanden
    if (konfliktLoesung === 'gleicher' && this.erweiterungKonflikte?.folgetermine_zum_verschieben?.length > 0) {
      const verschieben = confirm(
        `${this.erweiterungKonflikte.folgetermine_zum_verschieben.length} Folgetermin(e) werden um ${arbeitszeit} Minuten nach hinten verschoben.\n\nFortfahren?`
      );
      if (!verschieben) return;
      erweiterungsDaten.folgetermine_verschieben = true;
    }
  } else if (typ === 'morgen') {
    erweiterungsDaten.datum = this.naechsterArbeitstag(this.erweiterungTermin.datum);
    erweiterungsDaten.ist_gleicher_mitarbeiter = false;
  } else if (typ === 'datum') {
    const datum = document.getElementById('erweiterungDatum').value;
    const uhrzeit = document.getElementById('erweiterungUhrzeit').value;
    
    if (!datum) {
      alert('Bitte wählen Sie ein Datum aus.');
      return;
    }
    
    erweiterungsDaten.datum = datum;
    erweiterungsDaten.uhrzeit = uhrzeit || null;
    erweiterungsDaten.ist_gleicher_mitarbeiter = false;
  }

  // Speichern
  const speichernBtn = document.getElementById('erweiterungSpeichernBtn');
  speichernBtn.disabled = true;
  speichernBtn.innerHTML = '⏳ Wird gespeichert...';

  try {
    const result = await TermineService.erweiterungErstellen(this.erweiterungTermin.id, erweiterungsDaten);
    
    let meldung = '✅ Auftragserweiterung erfolgreich erstellt!';
    
    // Hilfsfunktion: Minuten in h:mm formatieren
    const formatZeit = (minuten) => {
      const h = Math.floor(minuten / 60);
      const m = minuten % 60;
      return h > 0 ? `${h}h ${m > 0 ? m + 'min' : ''}`.trim() : `${m}min`;
    };
    
    // Berechne effektive Arbeitszeit inkl. Nebenzeit für Anzeige
    const effektiveArbeitszeit = await this.berechneEffektiveArbeitszeit(arbeitszeit);
    
    // Immer neuer Termin
    meldung += `\n\n📋 Neuer Erweiterungs-Termin: ${result.ergebnis.termin_nr}`;
    meldung += `\n📅 Datum: ${this.formatDateGerman(result.ergebnis.datum)}`;
    meldung += `\n⏱️ Arbeitszeit: ${formatZeit(arbeitszeit)} (effektiv: ${formatZeit(effektiveArbeitszeit)})`;
    
    if (typ === 'anschluss') {
      // Berechne effektive Endzeit mit Nebenzeit
      const bringZeit = this.erweiterungTermin.bring_zeit || this.erweiterungTermin.startzeit || '08:00';
      const originalGeschaetzt = this.erweiterungTermin.geschaetzte_zeit || 0;
      const effektiveOriginal = await this.berechneEffektiveArbeitszeit(originalGeschaetzt);
      const originalEndzeit = this.berechneEndzeit(bringZeit, effektiveOriginal);
      const neueEndzeit = this.berechneEndzeit(originalEndzeit, effektiveArbeitszeit);
      meldung += `\n🏁 Erweiterung endet ca.: ${neueEndzeit} Uhr`;
    }
    
    if (result.verschobene_termine && result.verschobene_termine.length > 0) {
      meldung += `\n\n🔄 ${result.verschobene_termine.length} Folgetermin(e) wurden verschoben.`;
    }
    
    alert(meldung);
    
    this.closeErweiterungModal();
    this.closeTerminDetails();
    this.loadTermine();
    this.loadAuslastung();
    
  } catch (error) {
    console.error('Fehler beim Erstellen der Erweiterung:', error);
    alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
  } finally {
    speichernBtn.disabled = false;
    speichernBtn.innerHTML = `
      <svg class="sparkle-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" fill="currentColor"/>
      </svg>
      <span class="btn-text">Erweiterung erstellen</span>
      <div class="dots-border"></div>
    `;
  }
}

// Hilfsfunktion: Berechnet Endzeit aus Startzeit und Dauer;

  AppClass.prototype.berechneEndzeit = function(startzeit, dauerMinuten) {
  return berechneEndzeit(startzeit, dauerMinuten);
}

// Hilfsfunktion: Berechnet effektive Arbeitszeit mit Nebenzeit;

  AppClass.prototype.berechneEffektiveArbeitszeit = async function(dauerMinuten) {
  if (!dauerMinuten) return 0;
  try {
    const werkstattEinstellungen = await EinstellungenService.getWerkstatt();
    const nebenzeitProzent = werkstattEinstellungen.nebenzeit_prozent || 0;
    if (nebenzeitProzent > 0) {
      return Math.round(dauerMinuten * (1 + nebenzeitProzent / 100));
    }
  } catch (e) {
    console.warn('Konnte Nebenzeit nicht laden:', e);
  }
  return dauerMinuten;
}

// Hilfsfunktion: Nächster Arbeitstag (überspringt Samstag und Sonntag);

  AppClass.prototype.naechsterArbeitstag = function(datum) {
  return naechsterArbeitstag(datum);
}

// Hilfsfunktion: Formatiert Datum auf Deutsch;

  AppClass.prototype.formatDateGerman = function(datum) {
  return formatDateGerman(datum);
}

// ============================================
// ENDE AUFTRAGSERWEITERUNG FUNKTIONEN
// ============================================

// ============================================
// ENDE TERMIN-SPLIT & SCHWEBEND FUNKTIONEN
// ============================================;
}
