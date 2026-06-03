export function installWorkTimeModalFeature(AppClass) {
  AppClass.prototype.openArbeitszeitenModal = async function(terminId) {
  // IMMER frisch aus der DB laden, damit aktuelle Werte angezeigt werden
  let termin = null;
  try {
    termin = await TermineService.getById(terminId);
    if (termin) {
      // Cache aktualisieren
      this.termineById[terminId] = termin;
    }
  } catch (e) {
    console.error('Fehler beim Laden des Termins:', e);
  }
  
  // Fallback auf Cache falls DB-Laden fehlschlägt
  if (!termin) {
    termin = this.termineById[terminId];
  }
  
  if (!termin) {
    alert('Termin nicht gefunden');
    return;
  }

  this.currentTerminId = terminId;
  const arbeitenListe = this.parseArbeiten(termin.arbeit || '');

  // Reset Teile-Status-Daten für separaten Bereich
  this.modalTeileStatusData = [];

  // Bringzeit und Datum formatieren
  const bringzeitText = termin.bring_zeit ? termin.bring_zeit.substring(0, 5) : '—';
  const datumFormatiert = new Date(termin.datum).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

  document.getElementById('modalTerminInfo').innerHTML =
    `<strong>${termin.termin_nr || '-'}</strong> - ${termin.kunde_name} - ${datumFormatiert}
     <span style="margin-left: 15px; padding: 4px 10px; background: #e3f2fd; border-radius: 4px; font-size: 0.9em;">
       🕐 Bringzeit: <strong>${bringzeitText}</strong>
     </span>`;

  // Status vorauswählen
  document.getElementById('modalTerminStatus').value = termin.status || 'geplant';

  // "Muss bearbeitet werden" Checkbox setzen
  const mussBearbeitetCheckbox = document.getElementById('modalMussBearbeitetCheckbox');
  if (mussBearbeitetCheckbox) {
    mussBearbeitetCheckbox.checked = termin.muss_bearbeitet_werden || false;
  }

  // Interne Auftragsnummer setzen
  const interneAuftragsnummerInput = document.getElementById('modalInterneAuftragsnummer');
  if (interneAuftragsnummerInput) {
    interneAuftragsnummerInput.value = termin.interne_auftragsnummer || '';
  }

  // Lade Mitarbeiter, Lehrlinge und Abwesenheiten für das Datum
  let mitarbeiter = [];
  let lehrlinge = [];
  let abwesenheiten = [];
  try {
    [mitarbeiter, lehrlinge, abwesenheiten] = await Promise.all([
      MitarbeiterService.getAktive(),
      LehrlingeService.getAktive(),
      EinstellungenService.getAbwesenheitenByDateRange(termin.datum, termin.datum)
    ]);
  } catch (error) {
    console.error('Fehler beim Laden der Mitarbeiter/Lehrlinge/Abwesenheiten:', error);
  }

  // Erstelle Set von abwesenden Personen für schnellen Lookup
  // API-Format: {mitarbeiter_id: 2, lehrling_id: null, ...} oder {mitarbeiter_id: null, lehrling_id: 1, ...}
  const abwesendeIds = new Set();
  if (Array.isArray(abwesenheiten)) {
    abwesenheiten.forEach(a => {
      if (a.mitarbeiter_id) {
        abwesendeIds.add(`ma_${a.mitarbeiter_id}`);
      }
      if (a.lehrling_id) {
        abwesendeIds.add(`l_${a.lehrling_id}`);
      }
    });
  }
  console.log('Abwesenheiten für', termin.datum, ':', abwesenheiten);
  console.log('Abwesende IDs:', [...abwesendeIds]);

  // Befülle Gesamt-Mitarbeiter-Dropdown (mit Mitarbeitern und Lehrlingen)
  const gesamtMitarbeiterSelect = document.getElementById('modalGesamtMitarbeiter');
  gesamtMitarbeiterSelect.innerHTML = '<option value="">-- Keine Zuordnung --</option>';
  
  // Prüfe aktuelle Zeit für Pause (nur wenn Termin vormittags ist)
  const terminStartzeit = termin.startzeit || '08:00';
  const sollPausePruefen = terminStartzeit < '13:00'; // Nur vormittags prüfen
  
  // Optgroup für Mitarbeiter
  if (mitarbeiter.length > 0) {
    mitarbeiter.forEach(ma => {
      const option = document.createElement('option');
      option.value = `ma_${ma.id}`;
      const istAbwesend = abwesendeIds.has(`ma_${ma.id}`);
      const inPause = sollPausePruefen && this.istPersonAktuellInPause(ma);
      
      if (istAbwesend) {
        option.textContent = `🚫 ${ma.name} (ABWESEND)`;
        option.style.color = '#c62828';
        option.disabled = true;
      } else if (inPause) {
        option.textContent = `🍽️ ${ma.name} (in Pause)`;
        option.style.color = '#f57c00';
        // NICHT disabled - Zuordnung erlauben
      } else {
        option.textContent = `👤 ${ma.name}`;
      }
      gesamtMitarbeiterSelect.appendChild(option);
    });
  }
  
  // Optgroup für Lehrlinge
  if (lehrlinge.length > 0) {
    lehrlinge.forEach(l => {
      const option = document.createElement('option');
      option.value = `l_${l.id}`;
      const istAbwesend = abwesendeIds.has(`l_${l.id}`);
      const schule = this.isLehrlingInBerufsschule(l, termin.datum);
      const inPause = sollPausePruefen && this.istPersonAktuellInPause(l);
      
      if (istAbwesend) {
        option.textContent = `🚫 ${l.name} (ABWESEND)`;
        option.style.color = '#c62828';
        option.disabled = true;
      } else if (schule.inSchule) {
        option.textContent = `📚 ${l.name} (KW ${schule.kw} - Berufsschule)`;
        option.style.color = '#1565c0';
        option.disabled = true;
      } else if (inPause) {
        option.textContent = `🍽️ ${l.name} (in Pause)`;
        option.style.color = '#f57c00';
        // NICHT disabled - Zuordnung erlauben
      } else {
        option.textContent = `🎓 ${l.name} (Lehrling)`;
      }
      gesamtMitarbeiterSelect.appendChild(option);
    });
  }

  // Speichere abwesendeIds für die einzelnen Arbeits-Dropdowns
  this.modalAbwesendeIds = abwesendeIds;
  this.modalMitarbeiter = mitarbeiter;
  this.modalLehrlinge = lehrlinge;

  const liste = document.getElementById('modalArbeitszeitenListe');
  liste.innerHTML = '';

  // Parse arbeitszeiten_details wenn vorhanden
  let arbeitszeitenDetails = {};
  if (termin.arbeitszeiten_details) {
    try {
      arbeitszeitenDetails = JSON.parse(termin.arbeitszeiten_details);
    } catch (e) {
      console.error('Fehler beim Parsen von arbeitszeiten_details:', e);
    }
  }

  // Lade Gesamt-Mitarbeiter-Zuordnung
  let gesamtMitarbeiterId = '';
  if (arbeitszeitenDetails._gesamt_mitarbeiter_id) {
    // Neue Struktur mit Typ
    if (typeof arbeitszeitenDetails._gesamt_mitarbeiter_id === 'object') {
      if (arbeitszeitenDetails._gesamt_mitarbeiter_id.type === 'lehrling') {
        gesamtMitarbeiterId = `l_${arbeitszeitenDetails._gesamt_mitarbeiter_id.id}`;
      } else {
        gesamtMitarbeiterId = `ma_${arbeitszeitenDetails._gesamt_mitarbeiter_id.id}`;
      }
    } else {
      // Alte Struktur: nur ID (Mitarbeiter)
      gesamtMitarbeiterId = `ma_${arbeitszeitenDetails._gesamt_mitarbeiter_id}`;
    }
  } else if (termin.mitarbeiter_id) {
    gesamtMitarbeiterId = `ma_${termin.mitarbeiter_id}`;
  }
  gesamtMitarbeiterSelect.value = gesamtMitarbeiterId;

  // Verwende die tatsächlich gespeicherte Zeit (falls vorhanden), sonst die geschätzte Zeit
  const gesamtzeit = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;
  console.log('[DEBUG openModal] Termin:', terminId, 'tatsaechliche_zeit:', termin.tatsaechliche_zeit, 'geschaetzte_zeit:', termin.geschaetzte_zeit, 'gesamtzeit:', gesamtzeit);
  const zeitProArbeit = arbeitenListe.length > 0 ? Math.round(gesamtzeit / arbeitenListe.length) : 30;

  // Füge Gesamtzeit-Eingabefeld VOR den einzelnen Arbeiten ein
  const gesamtzeitHeader = document.createElement('div');
  gesamtzeitHeader.style.cssText = 'margin-bottom: 20px; padding: 15px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #1976d2;';
  gesamtzeitHeader.innerHTML = `
    <div style="display: flex; align-items: center; gap: 15px;">
      <label style="font-weight: 600; font-size: 1.05em;">⏱️ Gesamtzeit:</label>
      <input type="number"
             id="modalGesamtzeitInput"
             value="${(gesamtzeit / 60).toFixed(2)}"
             min="0.25"
             step="0.25"
             placeholder="Std."
             title="Gesamtzeit in Stunden - wird gleichmäßig auf Arbeiten verteilt"
             style="padding: 8px 12px; border: 2px solid #1976d2; border-radius: 4px; width: 100px; font-size: 1.1em; font-weight: 600;"
             oninput="app.updateEinzelzeitenFromGesamtzeit()">
      <span style="color: #1565c0; font-size: 0.9em;">Std. (wird auf Arbeiten verteilt)</span>
    </div>
    <div style="margin-top: 8px; font-size: 0.85em; color: #666;">
      💡 Einzelzeiten unten auf 0 lassen = Gesamtzeit nutzen | Einzelzeiten > 0 = Termin wird geteilt
    </div>
  `;
  liste.appendChild(gesamtzeitHeader);
  console.log('[DEBUG openModal] Gesamtzeit-Input value gesetzt auf:', (gesamtzeit / 60).toFixed(2));

  arbeitenListe.forEach((arbeit, index) => {
    let zeitMinuten;
    let mitarbeiterId = '';
    let teileStatus = ''; // Teile-Status

    // Prüfe zuerst ob individuelle Zeit für diese Arbeit gespeichert ist
    let startzeit = '';
    if (arbeitszeitenDetails[arbeit]) {
      // Neue Struktur: {zeit: 30, mitarbeiter_id: 1, type: 'mitarbeiter', teile_status: 'vorrätig', startzeit: '09:00'} oder alte Struktur: 30
      if (typeof arbeitszeitenDetails[arbeit] === 'object') {
        // Wenn zeit-Feld existiert und > 0, verwende es, sonst 0 (= nutze Gesamtzeit)
        zeitMinuten = (arbeitszeitenDetails[arbeit].zeit && arbeitszeitenDetails[arbeit].zeit > 0) 
          ? arbeitszeitenDetails[arbeit].zeit 
          : 0;
        teileStatus = arbeitszeitenDetails[arbeit].teile_status || '';
        startzeit = arbeitszeitenDetails[arbeit].startzeit || '';
        // Ungültige Startzeiten normalisieren (z.B. "09:60" → "10:00")
        if (startzeit && startzeit.includes(':')) {
          const [_szH, _szM] = startzeit.split(':').map(Number);
          if (!isNaN(_szH) && !isNaN(_szM) && (_szM < 0 || _szM > 59)) {
            const _total = _szH * 60 + _szM;
            startzeit = `${String(Math.floor(_total / 60)).padStart(2, '0')}:${String(_total % 60).padStart(2, '0')}`;
          }
        }
        if (arbeitszeitenDetails[arbeit].type === 'lehrling') {
          mitarbeiterId = `l_${arbeitszeitenDetails[arbeit].mitarbeiter_id || arbeitszeitenDetails[arbeit].lehrling_id}`;
        } else if (arbeitszeitenDetails[arbeit].mitarbeiter_id) {
          mitarbeiterId = `ma_${arbeitszeitenDetails[arbeit].mitarbeiter_id}`;
        } else {
          mitarbeiterId = '';
        }
      } else {
        // Alte Struktur: nur Zahl
        zeitMinuten = arbeitszeitenDetails[arbeit];
        mitarbeiterId = '';
      }
    } else if (termin.tatsaechliche_zeit && termin.tatsaechliche_zeit > 0) {
      // Nutze die gespeicherte Gesamtzeit (gleichmäßig aufgeteilt)
      zeitMinuten = zeitProArbeit;
    } else {
      // Nutze die Standardzeit aus der Arbeitszeiten-Tabelle
      zeitMinuten = this.findArbeitszeit(arbeit) || zeitProArbeit;
    }

    // Wenn keine individuelle Zuordnung, verwende Gesamt-Zuordnung
    if (!mitarbeiterId && gesamtMitarbeiterId) {
      mitarbeiterId = gesamtMitarbeiterId;
    }

    const zeitStunden = (zeitMinuten / 60).toFixed(2);

    // Erstelle Dropdown für diese Aufgabe (mit Mitarbeitern und Lehrlingen)
    // Verwende gespeicherte Abwesenheiten
    const abwesendeIds = this.modalAbwesendeIds || new Set();
    const terminStartzeit = termin.startzeit || '08:00';
    const sollPausePruefen = terminStartzeit < '13:00';
    let mitarbeiterOptions = '<option value="">-- Keine Zuordnung --</option>';
    
    // Mitarbeiter
    if (mitarbeiter.length > 0) {
      mitarbeiter.forEach(ma => {
        const value = `ma_${ma.id}`;
        const selected = value === mitarbeiterId ? 'selected' : '';
        const istAbwesend = abwesendeIds.has(value);
        const inPause = sollPausePruefen && this.istPersonAktuellInPause(ma);
        let disabled = '';
        let label = `👤 ${ma.name}`;
        let style = '';
        
        if (istAbwesend) {
          disabled = 'disabled';
          label = `🚫 ${ma.name} (ABWESEND)`;
          style = 'style="color: #c62828;"';
        } else if (inPause) {
          // NICHT disabled - nur kennzeichnen
          label = `🍽️ ${ma.name} (in Pause)`;
          style = 'style="color: #f57c00;"';
        }
        mitarbeiterOptions += `<option value="${value}" ${selected} ${disabled} ${style}>${label}</option>`;
      });
    }
    
    // Lehrlinge
    if (lehrlinge.length > 0) {
      lehrlinge.forEach(l => {
        const value = `l_${l.id}`;
        const selected = value === mitarbeiterId ? 'selected' : '';
        const istAbwesend = abwesendeIds.has(value);
        const schule = this.isLehrlingInBerufsschule(l, termin.datum);
        const inPause = sollPausePruefen && this.istPersonAktuellInPause(l);
        let disabled = '';
        let label = `🎓 ${l.name} (Lehrling)`;
        let style = '';
        
        if (istAbwesend) {
          disabled = 'disabled';
          label = `🚫 ${l.name} (ABWESEND)`;
          style = 'style="color: #c62828;"';
        } else if (schule.inSchule) {
          disabled = 'disabled';
          label = `📚 ${l.name} (KW ${schule.kw} - Berufsschule)`;
          style = 'style="color: #1565c0;"';
        } else if (inPause) {
          // NICHT disabled - nur kennzeichnen
          label = `🍽️ ${l.name} (in Pause)`;
          style = 'style="color: #f57c00;"';
        }
        mitarbeiterOptions += `<option value="${value}" ${selected} ${disabled} ${style}>${label}</option>`;
      });
    }

    // Teile-Status Optionen - werden später separat angezeigt
    const teileStatusOptions = `
      <option value="" ${teileStatus === '' ? 'selected' : ''}>⚪ Keine Teile nötig</option>
      <option value="vorraetig" ${teileStatus === 'vorraetig' ? 'selected' : ''}>✅ Teile vorrätig</option>
      <option value="bestellt" ${teileStatus === 'bestellt' ? 'selected' : ''}>📦 Teile bestellt</option>
      <option value="bestellen" ${teileStatus === 'bestellen' ? 'selected' : ''}>⚠️ Muss bestellt werden</option>
      <option value="eingetroffen" ${teileStatus === 'eingetroffen' ? 'selected' : ''}>🚚 Teile eingetroffen</option>
    `;

    // Speichere Teile-Status für separaten Bereich
    this.modalTeileStatusData = this.modalTeileStatusData || [];
    this.modalTeileStatusData.push({
      index: index,
      arbeit: arbeit,
      teileStatus: teileStatus,
      teileStatusOptions: teileStatusOptions
    });

    const item = document.createElement('div');
    item.className = 'arbeitszeit-item';
    item.style.marginBottom = '15px';
    item.innerHTML = `
      <div style="margin-bottom: 5px;">
        <label style="font-weight: 600;">📋 ${arbeit}:</label>
      </div>
      <div style="display: grid; grid-template-columns: 80px 1fr 1fr; gap: 10px; margin-bottom: 5px;">
        <input type="text"
               id="modal_startzeit_${index}"
               value="${startzeit}"
               placeholder="HH:MM"
               pattern="[0-2][0-9]:[0-5][0-9]"
               maxlength="5"
               title="Startzeit im 24h-Format (z.B. 08:00, 14:30)"
               oninput="this.value = this.value.replace(/[^0-9:]/g, ''); if(this.value.length === 2 && !this.value.includes(':')) this.value += ':';"
               style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; text-align: center;">
        <input type="number"
               id="modal_zeit_${index}"
               value="${zeitStunden}"
               min="0.25"
               step="0.25"
               placeholder="Std."
               onchange="app.updateModalGesamtzeit()"
               onfocus="this.select()"
               title="Dauer in Stunden"
               style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        <select id="modal_mitarbeiter_${index}"
                title="Mitarbeiter zuordnen"
                style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          ${mitarbeiterOptions}
        </select>
      </div>
    `;
    liste.appendChild(item);
  });

  // Erstelle separaten Teile-Status Bereich
  this.renderModalTeileStatusSection();

  this.updateModalGesamtzeit();
  
  // Lade Phasen für diesen Termin
  await this.loadModalPhasen(terminId, termin.datum);
  
  // Event-Handler: Wenn Gesamt-Mitarbeiter geändert wird, alle einzelnen Dropdowns synchronisieren
  const gesamtSelect = document.getElementById('modalGesamtMitarbeiter');
  gesamtSelect.onchange = () => this.syncGesamtMitarbeiterToEinzelne();
  
  document.getElementById('arbeitszeitenModal').style.display = 'block';
}

// Synchronisiert den Gesamt-Mitarbeiter auf alle einzelnen Arbeits-Dropdowns;

  AppClass.prototype.syncGesamtMitarbeiterToEinzelne = function(forceAll = false) {
  const gesamtValue = document.getElementById('modalGesamtMitarbeiter').value;
  
  // Finde alle einzelnen Mitarbeiter-Selects
  const liste = document.getElementById('modalArbeitszeitenListe');
  const selects = liste.querySelectorAll('select[id^="modal_mitarbeiter_"]');
  
  selects.forEach(select => {
    // Bei forceAll: Alle setzen, sonst nur wenn keine individuelle Zuordnung
    if (forceAll || !select.value || select.value === '') {
      select.value = gesamtValue;
    }
  });
};

  AppClass.prototype.loadModalPhasen = async function(terminId, terminDatum) {
  // Reset
  this.modalPhasenCounter = 0;
  this.modalPhasenData = [];
  const phasenListe = document.getElementById('modalPhasenListe');
  phasenListe.innerHTML = '';
  
  // Lade existierende Phasen
  try {
    const phasen = await PhasenService.getByTerminId(terminId);
    if (phasen && phasen.length > 0) {
      // Phasen vorhanden - aktiviere Checkbox und zeige Section
      document.getElementById('modalMehrtaegigCheckbox').checked = true;
      document.getElementById('modalPhasenSection').style.display = 'block';
      
      // Füge Phasen hinzu
      phasen.forEach(phase => {
        this.addModalPhase(phase);
      });
    } else {
      // Keine Phasen - verstecke Section
      document.getElementById('modalMehrtaegigCheckbox').checked = false;
      document.getElementById('modalPhasenSection').style.display = 'none';
    }
  } catch (error) {
    console.error('Fehler beim Laden der Phasen:', error);
    document.getElementById('modalMehrtaegigCheckbox').checked = false;
    document.getElementById('modalPhasenSection').style.display = 'none';
  }
};

  AppClass.prototype.toggleModalPhasenSection = function() {
  const checkbox = document.getElementById('modalMehrtaegigCheckbox');
  const section = document.getElementById('modalPhasenSection');
  
  if (checkbox.checked) {
    section.style.display = 'block';
    // Füge eine erste Phase hinzu wenn leer
    const phasenListe = document.getElementById('modalPhasenListe');
    if (phasenListe.children.length === 0) {
      const termin = this.termineById[this.currentTerminId];
      this.addModalPhase({ datum: termin ? termin.datum : this.formatDateLocal(new Date()) });
    }
  } else {
    section.style.display = 'none';
  }
};

  AppClass.prototype.addModalPhase = function(existingPhase = null) {
  this.modalPhasenCounter = this.modalPhasenCounter || 0;
  this.modalPhasenCounter++;
  const phaseId = this.modalPhasenCounter;
  
  const termin = this.termineById[this.currentTerminId];
  const defaultDatum = existingPhase?.datum || (termin ? termin.datum : this.formatDateLocal(new Date()));
  const bezeichnung = existingPhase?.bezeichnung || `Phase ${phaseId}`;
  const zeit = existingPhase?.geschaetzte_zeit || 60;
  const zeitStunden = (zeit / 60).toFixed(2);
  const notizen = existingPhase?.notizen || '';
  const dbId = existingPhase?.id || '';
  
  const phasenListe = document.getElementById('modalPhasenListe');
  const phaseDiv = document.createElement('div');
  phaseDiv.id = `modal_phase_${phaseId}`;
  phaseDiv.className = 'phase-item';
  phaseDiv.dataset.dbId = dbId;
  phaseDiv.style.cssText = 'padding: 15px; background: #fff; border: 1px solid #ffcc80; border-radius: 8px; margin-bottom: 10px;';
  
  phaseDiv.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <strong style="color: #e65100;">Phase ${phaseId}</strong>
      <button type="button" onclick="app.removeModalPhase(${phaseId})" style="background: #ff5252; color: white; border: none; border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: 12px;">✕ Entfernen</button>
    </div>
    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; margin-bottom: 10px;">
      <div>
        <label style="font-size: 0.85em; color: #666;">Bezeichnung:</label>
        <input type="text" id="modal_phase_bez_${phaseId}" value="${bezeichnung}" placeholder="z.B. Zerlegen" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
      </div>
      <div>
        <label style="font-size: 0.85em; color: #666;">Datum:</label>
        <input type="date" id="modal_phase_datum_${phaseId}" value="${defaultDatum}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
      </div>
      <div>
        <label style="font-size: 0.85em; color: #666;">Zeit (h):</label>
        <input type="number" id="modal_phase_zeit_${phaseId}" value="${zeitStunden}" min="0.25" step="0.25" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
      </div>
    </div>
    <div>
      <label style="font-size: 0.85em; color: #666;">Notizen:</label>
      <input type="text" id="modal_phase_notizen_${phaseId}" value="${notizen}" placeholder="Optionale Notizen..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
    </div>
  `;
  
  phasenListe.appendChild(phaseDiv);
};

  AppClass.prototype.removeModalPhase = function(phaseId) {
  const phaseDiv = document.getElementById(`modal_phase_${phaseId}`);
  if (phaseDiv) {
    phaseDiv.remove();
  }
};

  AppClass.prototype.getModalPhasenFromForm = function() {
  const phasen = [];
  const phasenListe = document.getElementById('modalPhasenListe');
  const phaseItems = phasenListe.querySelectorAll('.phase-item');
  
  phaseItems.forEach((item, index) => {
    const idMatch = item.id.match(/modal_phase_(\d+)/);
    if (idMatch) {
      const phaseId = idMatch[1];
      const dbId = item.dataset.dbId || null;
      const bezeichnung = document.getElementById(`modal_phase_bez_${phaseId}`)?.value || `Phase ${index + 1}`;
      const datum = document.getElementById(`modal_phase_datum_${phaseId}`)?.value || '';
      const zeitStunden = parseFloat(document.getElementById(`modal_phase_zeit_${phaseId}`)?.value) || 1;
      const zeitMinuten = Math.round(zeitStunden * 60);
      const notizen = document.getElementById(`modal_phase_notizen_${phaseId}`)?.value || '';
      
      phasen.push({
        id: dbId ? parseInt(dbId, 10) : null,
        phase_nr: index + 1,
        bezeichnung: bezeichnung,
        datum: datum,
        geschaetzte_zeit: zeitMinuten,
        notizen: notizen
      });
    }
  });
  
  return phasen;
};

  AppClass.prototype.closeArbeitszeitenModal = function() {
  document.getElementById('arbeitszeitenModal').style.display = 'none';
  // Event-Handler entfernen
  const gesamtSelect = document.getElementById('modalGesamtMitarbeiter');
  if (gesamtSelect) gesamtSelect.onchange = null;
  this.currentTerminId = null;
  // Reset Phasen
  this.modalPhasenCounter = 0;
  this.modalPhasenData = [];
}

// ================================================
// TAGESÜBERSICHT POPUP/MODAL
// ================================================;

  AppClass.prototype.openTagesUebersichtModal = async function(datum) {
  const modal = document.getElementById('tagesUebersichtModal');
  const body = document.getElementById('tagesUebersichtBody');
  const titel = document.getElementById('tagesUebersichtTitel');
  const termineCount = document.getElementById('tagesTermineCount');
  const auslastungBadge = document.getElementById('tagesAuslastung');

  if (!modal || !body) return;

  // Formatiere das Datum für den Titel
  const datumObj = new Date(datum + 'T12:00:00');
  const wochentag = datumObj.toLocaleDateString('de-DE', { weekday: 'long' });
  const datumFormatiert = datumObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  
  titel.textContent = `📅 ${wochentag}, ${datumFormatiert}`;
  body.innerHTML = '<div class="loading">Termine werden geladen...</div>';
  modal.style.display = 'block';

  try {
    // Lade Termine und Auslastung für diesen Tag
    const allTermine = await TermineService.getAll();
    const termineForDay = allTermine.filter(t => t.datum === datum);
    const auslastung = await AuslastungService.getByDatum(datum);

    // Aktualisiere Stats
    termineCount.textContent = `${termineForDay.length} Termin${termineForDay.length !== 1 ? 'e' : ''}`;
    auslastungBadge.textContent = `${Math.round(auslastung.auslastung_prozent || 0)}% Auslastung`;

    if (termineForDay.length === 0) {
      body.innerHTML = `
        <div class="tages-keine-termine">
          <div class="emoji">📭</div>
          <p>Keine Termine an diesem Tag</p>
        </div>
      `;
      return;
    }

    // Sortiere Termine nach Uhrzeit (verwende bring_zeit oder abholung_zeit)
    termineForDay.sort((a, b) => {
      const zeitA = a.bring_zeit || a.abholung_zeit || '23:59';
      const zeitB = b.bring_zeit || b.abholung_zeit || '23:59';
      return zeitA.localeCompare(zeitB);
    });

    // Erstelle HTML für alle Termine
    let html = '';
    for (const termin of termineForDay) {
      const isIntern = termin.ist_intern === 1 || termin.ist_intern === true;
      const statusClass = `status-${termin.status || 'geplant'}`;
      const internClass = isIntern ? 'intern' : '';
      
      // Uhrzeit ermitteln (bring_zeit hat Vorrang)
      const uhrzeitAnzeige = termin.bring_zeit || termin.abholung_zeit || '';

      // Berechne Dauer - verwende endzeit_berechnet wenn verfügbar (enthält Nebenzeit + Erweiterungen)
      let dauerText = '';
      let dauerMinuten = 0;
      
      if (termin.startzeit && termin.endzeit_berechnet) {
        // Berechne aus Start- und Endzeit (inkl. Nebenzeit und Erweiterungen)
        const [startH, startM] = termin.startzeit.split(':').map(Number);
        const [endH, endM] = termin.endzeit_berechnet.split(':').map(Number);
        dauerMinuten = (endH * 60 + endM) - (startH * 60 + startM);
      } else {
        // Fallback: tatsächliche oder geschätzte Zeit
        dauerMinuten = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;
      }
      
      if (dauerMinuten > 0) {
        const stunden = Math.floor(dauerMinuten / 60);
        const minuten = dauerMinuten % 60;
        if (stunden > 0 && minuten > 0) {
          dauerText = `${stunden}h ${minuten}min`;
        } else if (stunden > 0) {
          dauerText = `${stunden}h`;
        } else {
          dauerText = `${minuten}min`;
        }
      }

      // Kundenname ermitteln
      let kundenName = 'Unbekannt';
      if (isIntern) {
        kundenName = '🔧 Interner Termin';
      } else if (termin.kunde_name) {
        kundenName = termin.kunde_name;
      } else if (termin.kunde_id) {
        const kunde = this.kundenCache.find(k => k.id === termin.kunde_id);
        if (kunde) kundenName = kunde.name;
      }

      // Arbeiten kürzen falls zu lang
      let arbeitText = termin.arbeit || '-';
      if (arbeitText.length > 100) {
        arbeitText = arbeitText.substring(0, 100) + '...';
      }

      // Status-Badge
      const statusLabels = {
        'geplant': '⏳ Geplant',
        'in_arbeit': '🔧 In Arbeit',
        'abgeschlossen': '✅ Abgeschlossen'
      };
      const statusLabel = statusLabels[termin.status] || '⏳ Geplant';

      html += `
        <div class="tages-termin-card ${statusClass} ${internClass}" data-termin-id="${termin.id}" style="cursor: pointer;" title="Klicken für Details">
          <div class="tages-termin-zeit">
            <span class="zeit">${uhrzeitAnzeige || '--:--'}</span>
            ${dauerText ? `<span class="dauer">${dauerText}</span>` : ''}
          </div>
          <div class="tages-termin-info">
            <div class="tages-termin-kunde">${this.escapeHtml(kundenName)}</div>
            ${!isIntern && termin.kennzeichen ? `<div class="tages-termin-kennzeichen">🚗 ${this.escapeHtml(termin.kennzeichen)}</div>` : ''}
            <div class="tages-termin-arbeit">${this.escapeHtml(arbeitText)}</div>
          </div>
          <div class="tages-termin-status">
            <span class="status-badge ${statusClass}">${statusLabel}</span>
          </div>
        </div>
      `;
    }

    body.innerHTML = html;

    // Click-Handler für Termin-Karten hinzufügen
    body.querySelectorAll('.tages-termin-card[data-termin-id]').forEach(card => {
      card.addEventListener('click', () => {
        const terminId = parseInt(card.dataset.terminId);
        if (terminId) {
          // Speichere Termin in termineById falls nicht vorhanden
          const termin = termineForDay.find(t => t.id === terminId);
          if (termin) {
            this.termineById[terminId] = termin;
          }
          // Schließe Tagesübersicht-Modal und öffne Termin-Details
          this.closeTagesUebersichtModal();
          this.showTerminDetails(terminId);
        }
      });
    });

  } catch (error) {
    console.error('Fehler beim Laden der Tagesübersicht:', error);
    body.innerHTML = '<div class="loading">Fehler beim Laden der Termine</div>';
  }
};

  AppClass.prototype.closeTagesUebersichtModal = function() {
  const modal = document.getElementById('tagesUebersichtModal');
  if (modal) {
    modal.style.display = 'none';
  }
};

  AppClass.prototype.updateModalGesamtzeit = function() {
  const liste = document.getElementById('modalArbeitszeitenListe');
  const inputs = liste.querySelectorAll('input[id^="modal_zeit_"]');
  let gesamtStunden = 0;

  inputs.forEach(input => {
    gesamtStunden += parseFloat(input.value) || 0;
  });

  document.getElementById('modalGesamtzeit').textContent = gesamtStunden.toFixed(2) + ' h';
  
  // Update das Gesamtzeit-Input NUR wenn Einzelzeiten vorhanden sind (> 0)
  // Wenn alle Einzelzeiten 0 sind, behalte den aktuellen Wert (nutzt Gesamtzeit)
  const gesamtzeitInput = document.getElementById('modalGesamtzeitInput');
  if (gesamtzeitInput && gesamtStunden > 0) {
    gesamtzeitInput.value = gesamtStunden.toFixed(2);
  }
}

// Setzt alle Einzelzeiten auf 0 wenn Gesamtzeit geändert wird;

  AppClass.prototype.updateEinzelzeitenFromGesamtzeit = function() {
  const gesamtzeitInput = document.getElementById('modalGesamtzeitInput');
  if (!gesamtzeitInput) return;
  
  const liste = document.getElementById('modalArbeitszeitenListe');
  const zeitInputs = liste.querySelectorAll('input[id^="modal_zeit_"]');
  
  if (zeitInputs.length === 0) return;
  
  // Setze ALLE Einzelzeiten auf 0 = Termin bleibt EINS
  zeitInputs.forEach(input => {
    input.value = '0.00';
  });
  
  // Update Anzeige
  const gesamtStunden = parseFloat(gesamtzeitInput.value) || 0;
  document.getElementById('modalGesamtzeit').textContent = gesamtStunden.toFixed(2) + ' h';
}

// Rendert den separaten Teile-Status-Bereich im Modal;

  AppClass.prototype.renderModalTeileStatusSection = function() {
  // Finde oder erstelle den Container
  let teileSection = document.getElementById('modalTeileStatusSection');
  
  if (!teileSection) {
    // Erstelle den Bereich nach der Arbeitszeiten-Liste
    const gesamtzeitDiv = document.getElementById('modalGesamtzeit').closest('div');
    teileSection = document.createElement('div');
    teileSection.id = 'modalTeileStatusSection';
    gesamtzeitDiv.insertAdjacentElement('afterend', teileSection);
  }

  // Prüfe ob überhaupt Teile-Status-Daten vorhanden sind
  if (!this.modalTeileStatusData || this.modalTeileStatusData.length === 0) {
    teileSection.innerHTML = '';
    return;
  }

  teileSection.innerHTML = `
    <div style="margin-top: 20px; padding: 15px; background: linear-gradient(135deg, #fff8e1 0%, #fffde7 100%); border-radius: 8px; border-left: 4px solid #ff9800;">
      <h4 style="margin: 0 0 15px 0; color: #e65100; display: flex; align-items: center; gap: 8px;">
        📦 Teile-Status
      </h4>
      <div class="teile-status-grid" style="display: grid; gap: 12px;">
        ${this.modalTeileStatusData.map(item => `
          <div class="teile-status-row" style="display: grid; grid-template-columns: 1fr 200px; gap: 10px; align-items: center; padding: 8px; background: white; border-radius: 6px; border: 1px solid #e0e0e0;">
            <span style="font-weight: 500; color: #333;">📋 ${item.arbeit}</span>
            <select id="modal_teile_${item.index}"
                    title="Teile-Status für ${item.arbeit}"
                    onchange="app.updateTeileStatusStyle(this)"
                    style="padding: 8px; border: 2px solid #ddd; border-radius: 4px; cursor: pointer;">
              ${item.teileStatusOptions}
            </select>
          </div>
        `).join('')}
      </div>
      <small style="display: block; margin-top: 12px; color: #666;">
        💡 Wählen Sie den Teile-Status für jede Arbeit aus. Bei "Muss bestellt werden" erscheint der Termin in der Teile-Übersicht.
      </small>
    </div>
  `;

  // Styles für alle Teile-Status-Selects anwenden
  this.modalTeileStatusData.forEach(item => {
    const select = document.getElementById(`modal_teile_${item.index}`);
    if (select) {
      this.updateTeileStatusStyle(select);
    }
  });
}

// Visuelles Styling für Teile-Status Dropdown;

  AppClass.prototype.updateTeileStatusStyle = function(selectElement) {
  if (!selectElement) return;
  
  const value = selectElement.value;
  const styles = {
    '': { bg: '#f8f9fa', border: '#ddd', color: '#666' },           // Keine Teile nötig
    'vorraetig': { bg: '#d4edda', border: '#28a745', color: '#155724' },  // Vorrätig - grün
    'bestellt': { bg: '#cce5ff', border: '#007bff', color: '#004085' },   // Bestellt - blau
    'bestellen': { bg: '#fff3cd', border: '#ffc107', color: '#856404' },  // Muss bestellt - gelb/orange
    'eingetroffen': { bg: '#d1ecf1', border: '#17a2b8', color: '#0c5460' } // Eingetroffen - türkis
  };
  
  const style = styles[value] || styles[''];
  selectElement.style.backgroundColor = style.bg;
  selectElement.style.borderColor = style.border;
  selectElement.style.color = style.color;
  selectElement.style.fontWeight = value ? '600' : 'normal';
}

// Teile-Status Badge für einzelne Arbeit;

  AppClass.prototype.getTeileStatusBadge = function(teileStatus) {
  const badges = {
    'vorraetig': '<span class="teile-badge teile-vorraetig">✅ Teile vorrätig</span>',
    'bestellt': '<span class="teile-badge teile-bestellt">📦 Teile bestellt</span>',
    'bestellen': '<span class="teile-badge teile-bestellen">⚠️ Teile bestellen!</span>',
    'eingetroffen': '<span class="teile-badge teile-eingetroffen">🚚 Teile da</span>'
  };
  return badges[teileStatus] || '';
}

// Teile-Status Badge für Termin-Übersicht (zeigt kritische Status an);

  AppClass.prototype.getTerminTeileStatusBadge = function(termin) {
  if (!termin.arbeitszeiten_details) return '';
  
  try {
    const details = typeof termin.arbeitszeiten_details === 'string' 
      ? JSON.parse(termin.arbeitszeiten_details) 
      : termin.arbeitszeiten_details;
    
    // Sammle alle Teile-Status
    let hatBestellen = false;
    let hatBestellt = false;
    let bestellenArbeiten = [];
    
    for (const [key, data] of Object.entries(details)) {
      if (key.startsWith('_')) continue; // Überspringe Meta-Felder
      if (data && data.teile_status) {
        if (data.teile_status === 'bestellen') {
          hatBestellen = true;
          bestellenArbeiten.push(key);
        } else if (data.teile_status === 'bestellt') {
          hatBestellt = true;
        }
      }
    }
    
    // Priorität: "bestellen" ist am wichtigsten
    if (hatBestellen) {
      const anzahl = bestellenArbeiten.length;
      const tooltip = bestellenArbeiten.join(', ');
      return `<span class="teile-badge teile-bestellen" title="Teile bestellen für: ${tooltip}">⚠️ ${anzahl}x Teile fehlen</span>`;
    }
    
    // Optional: Zeige "bestellt" an, wenn Teile unterwegs sind
    if (hatBestellt) {
      return '<span class="teile-badge teile-bestellt" title="Teile sind bestellt">📦 Warten auf Teile</span>';
    }
    
    return '';
  } catch (e) {
    console.error('Fehler beim Parsen der arbeitszeiten_details:', e);
    return '';
  }
};

  // Baut aus der Slot-Prüfung (Backend: slot_pruefung) eine Warnmeldung.
  // Gibt null zurück, wenn kein Konflikt vorliegt.
  AppClass.prototype.baueSlotWarnung = function(sp) {
  if (!sp) return null;
  const zeilen = [];
  if (sp.hat_doppelbuchung && Array.isArray(sp.konflikte) && sp.konflikte.length) {
    zeilen.push('⚠️ Doppelbuchung – Mitarbeiter ist im Zeitfenster bereits belegt:');
    sp.konflikte.forEach(k => {
      const kz = k.kennzeichen ? ` (${k.kennzeichen})` : '';
      zeilen.push(`   • ${k.von}–${k.bis}: ${k.kunde_name}${kz} [${k.termin_nr || k.termin_id}]`);
    });
  }
  if (sp.warte_konflikt && sp.warte_konflikt.konflikt) {
    const wk = sp.warte_konflikt;
    zeilen.push(`⏳ Warte-Kunden-Engpass: ${wk.gleichzeitig} gleichzeitig wartend, aber nur ${wk.verfuegbare_mitarbeiter} Mitarbeiter verfügbar.`);
  }
  return zeilen.length ? zeilen.join('\n') : null;
};

  AppClass.prototype.saveArbeitszeitenModal = async function() {
  if (!this.currentTerminId) {
    alert('Kein Termin ausgewählt');
    return;
  }
  console.log(`[ARBEITSZEITEN-SAVE] Start für Termin ${this.currentTerminId}`);

  const liste = document.getElementById('modalArbeitszeitenListe');
  const inputs = liste.querySelectorAll('input[type="number"]');
  const selects = liste.querySelectorAll('select[id^="modal_mitarbeiter_"]');
  let gesamtStunden = 0;
  
  // Lade aktuellen Termin frisch aus der Datenbank für korrekte arbeitszeiten_details
  const termin = await TermineService.getById(this.currentTerminId);
  
  // Bestehende arbeitszeiten_details beibehalten und nur überschreiben was geändert wird
  let arbeitszeitenDetails = {};
  if (termin.arbeitszeiten_details) {
    try {
      arbeitszeitenDetails = typeof termin.arbeitszeiten_details === 'string' 
        ? JSON.parse(termin.arbeitszeiten_details) 
        : termin.arbeitszeiten_details;
    } catch (e) {
      console.error('Fehler beim Parsen von arbeitszeiten_details:', e);
      arbeitszeitenDetails = {};
    }
  }
  
  // Prüfe ob Gesamtzeit-Input einen Wert hat (für Fall: Gesamtzeit eingegeben, Einzelzeiten alle 0)
  const gesamtzeitInput = document.getElementById('modalGesamtzeitInput');
  const gesamtzeitInputWert = gesamtzeitInput ? (parseFloat(gesamtzeitInput.value) || 0) : 0;

  // Sammle Gesamt-Mitarbeiter-Zuordnung
  const gesamtMitarbeiterValue = document.getElementById('modalGesamtMitarbeiter').value;
  if (gesamtMitarbeiterValue) {
    if (gesamtMitarbeiterValue.startsWith('ma_')) {
      const id = parseInt(gesamtMitarbeiterValue.replace('ma_', ''), 10);
      arbeitszeitenDetails._gesamt_mitarbeiter_id = { type: 'mitarbeiter', id: id };
    } else if (gesamtMitarbeiterValue.startsWith('l_')) {
      const id = parseInt(gesamtMitarbeiterValue.replace('l_', ''), 10);
      arbeitszeitenDetails._gesamt_mitarbeiter_id = { type: 'lehrling', id: id };
    }
  } else {
    // Keine Gesamt-Zuordnung -> entfernen
    delete arbeitszeitenDetails._gesamt_mitarbeiter_id;
  }

  // Sammle individuelle Zeiten und Mitarbeiter-Zuordnungen pro Arbeit
  const arbeitenListe = this.parseArbeiten(termin.arbeit || '');

  // Iteriere direkt über die Arbeitenliste statt über inputs
  arbeitenListe.forEach((arbeitName, index) => {
    // Zeit-Input auslesen
    const zeitInput = document.getElementById(`modal_zeit_${index}`);
    const stunden = zeitInput ? (parseFloat(zeitInput.value) || 0) : 0;
    gesamtStunden += stunden;

    const zeitMinuten = Math.round(stunden * 60);
    
    // Mitarbeiter-Select auslesen
    const mitarbeiterSelect = document.getElementById(`modal_mitarbeiter_${index}`);
    const mitarbeiterValue = mitarbeiterSelect ? mitarbeiterSelect.value : '';
    
    // Teile-Status auslesen
    const teileSelect = document.getElementById(`modal_teile_${index}`);
    const teileStatus = teileSelect ? teileSelect.value : '';
    
    // Startzeit auslesen und normalisieren (z.B. "09:60" → "10:00")
    const startzeitInput = document.getElementById(`modal_startzeit_${index}`);
    let startzeit = startzeitInput ? startzeitInput.value.trim() : '';
    if (startzeit && startzeit.includes(':')) {
      const [szH, szM] = startzeit.split(':').map(Number);
      if (!isNaN(szH) && !isNaN(szM) && (szM < 0 || szM > 59)) {
        const totalMin = szH * 60 + szM;
        startzeit = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
      }
    }

    // Prüfe welche Daten vorhanden sind
    const hatTeileStatus = !!teileStatus;
    const hatStartzeit = !!startzeit;
    const hatMitarbeiter = !!(mitarbeiterValue && mitarbeiterValue !== '');
    const hatZeit = zeitMinuten > 0;
    
    // Wenn KEINE Daten vorhanden sind: Diese Arbeit komplett überspringen
    if (!hatTeileStatus && !hatStartzeit && !hatMitarbeiter && !hatZeit) {
      // Entferne die Arbeit aus arbeitszeiten_details wenn vorhanden
      delete arbeitszeitenDetails[arbeitName];
      return; // Überspringe diese Arbeit
    }
    
    // Bestehende Arbeit-Details holen oder neues Objekt erstellen
    let existingDetails = arbeitszeitenDetails[arbeitName];
    
    // In Objekt-Format konvertieren wenn es nur eine Zahl ist
    if (typeof existingDetails === 'number') {
      existingDetails = { zeit: existingDetails };
    } else if (!existingDetails || typeof existingDetails !== 'object') {
      existingDetails = {};
    }
    
    // Aktualisiere die Werte
    // WICHTIG: zeit NUR speichern wenn > 0, sonst fällt getTerminGesamtdauer auf tatsaechliche_zeit zurück
    if (zeitMinuten > 0) {
      existingDetails.zeit = zeitMinuten;
    } else {
      // Zeit ist 0 -> NICHT speichern (damit Termin als GANZES bleibt)
      delete existingDetails.zeit;
    }
    
    if (teileStatus) {
      existingDetails.teile_status = teileStatus;
    }
    
    if (startzeit) {
      existingDetails.startzeit = startzeit;
    }
    
    // Mitarbeiter-Zuordnung aktualisieren
    if (mitarbeiterValue && mitarbeiterValue.startsWith('ma_')) {
      const id = parseInt(mitarbeiterValue.replace('ma_', ''), 10);
      existingDetails.mitarbeiter_id = id;
      existingDetails.type = 'mitarbeiter';
      delete existingDetails.lehrling_id;
    } else if (mitarbeiterValue && mitarbeiterValue.startsWith('l_')) {
      const id = parseInt(mitarbeiterValue.replace('l_', ''), 10);
      existingDetails.lehrling_id = id;
      existingDetails.mitarbeiter_id = id; // Für Kompatibilität
      existingDetails.type = 'lehrling';
    } else if (mitarbeiterValue === '') {
      // Explizit "Keine Zuordnung" gewählt -> Mitarbeiter entfernen
      delete existingDetails.mitarbeiter_id;
      delete existingDetails.lehrling_id;
      delete existingDetails.type;
    }
    // Wenn mitarbeiterValue undefined ist, bestehende Zuordnung beibehalten
    
    // Speichere das aktualisierte Objekt nur wenn Daten vorhanden sind
    if (Object.keys(existingDetails).length === 0) {
      // Keine Daten mehr -> Arbeit nicht speichern
      delete arbeitszeitenDetails[arbeitName];
    } else if (Object.keys(existingDetails).length === 1 && existingDetails.zeit) {
      // Nur Zeit vorhanden -> als einfache Zahl speichern (Rückwärtskompatibilität)
      arbeitszeitenDetails[arbeitName] = existingDetails.zeit;
    } else {
      // Objekt mit mehreren Feldern oder nur andere Daten (ohne Zeit)
      arbeitszeitenDetails[arbeitName] = existingDetails;
    }
  });

  // Setze _startzeit automatisch auf die früheste Startzeit aller Arbeiten
  let fruehesteStartzeit = null;
  for (const [key, val] of Object.entries(arbeitszeitenDetails)) {
    if (key.startsWith('_')) continue;
    if (typeof val === 'object' && val.startzeit) {
      if (!fruehesteStartzeit || val.startzeit < fruehesteStartzeit) {
        fruehesteStartzeit = val.startzeit;
      }
    }
  }
  if (fruehesteStartzeit) {
    arbeitszeitenDetails._startzeit = fruehesteStartzeit;
  }

  // Umrechnung von Stunden in Minuten für die Datenbank
  // WICHTIG: Wenn alle Einzelzeiten 0 sind, aber Gesamtzeit-Input ausgefüllt ist, nutze diesen Wert
  let gesamtzeitMinuten;
  if (gesamtStunden === 0 && gesamtzeitInputWert > 0) {
    // Nutze eingegebene Gesamtzeit (alle Einzelzeiten sind 0)
    gesamtzeitMinuten = Math.round(gesamtzeitInputWert * 60);
  } else {
    // Nutze Summe der Einzelzeiten
    gesamtzeitMinuten = Math.round(gesamtStunden * 60);
  }

  // Fallback auf den echten Termin-Status, wenn das Dropdown den Status nicht abbilden kann
  // (z.B. 'wartend'/'storniert' sind keine Optionen → Select-Wert wäre "" → Validierung schlägt fehl).
  let status = document.getElementById('modalTerminStatus').value || termin.status || 'geplant';

  // Bestimme Mitarbeiter für Termin (Gesamt-Zuordnung hat Vorrang, sonst Termin-Mitarbeiter)
  // Nur Mitarbeiter können dem Termin direkt zugeordnet werden, nicht Lehrlinge
  let terminMitarbeiterId = termin.mitarbeiter_id || null;
  if (gesamtMitarbeiterValue && gesamtMitarbeiterValue.startsWith('ma_')) {
    terminMitarbeiterId = parseInt(gesamtMitarbeiterValue.replace('ma_', ''), 10);
  }
  
  // WICHTIG: Wenn Gesamtzeit-Modus (keine individuellen Zeiten),
  // müssen wir die Zuordnung anpassen
  const hatIndividuelleZeiten = Object.keys(arbeitszeitenDetails).some(key => {
    if (key.startsWith('_')) return false;
    const val = arbeitszeitenDetails[key];
    if (typeof val === 'number' && val > 0) return true;
    if (typeof val === 'object' && val.zeit && val.zeit > 0) return true;
    return false;
  });
  
  if (!hatIndividuelleZeiten) {
    // Gesamtzeit-Modus: Entferne alle individuellen Zuordnungen aus Arbeiten
    Object.keys(arbeitszeitenDetails).forEach(key => {
      if (key.startsWith('_')) return; // Meta-Felder behalten
      const val = arbeitszeitenDetails[key];
      if (typeof val === 'object') {
        // Entferne Zuordnungen, behalte nur Startzeit und Teile-Status
        delete val.mitarbeiter_id;
        delete val.lehrling_id;
        delete val.type;
        
        // Wenn nur noch startzeit oder teile_status übrig ist (aber kein zeit), 
        // ist das auch OK - wird dann beim Laden als Gesamttermin behandelt
        // Aber wenn GAR NICHTS mehr übrig ist, entferne die Arbeit komplett
        const nurMetaDaten = !val.zeit && !val.startzeit && !val.teile_status;
        if (nurMetaDaten || Object.keys(val).length === 0) {
          delete arbeitszeitenDetails[key];
        }
      }
    });
    
    // Wenn Gesamt-Zuordnung ein LEHRLING ist, setze mitarbeiter_id auf NULL
    // (Lehrlinge können nicht auf Top-Level zugeordnet werden)
    if (gesamtMitarbeiterValue && gesamtMitarbeiterValue.startsWith('l_')) {
      terminMitarbeiterId = null;
    }
  }
  
  // Automatisch auf "geplant" setzen wenn Startzeit und Mitarbeiter vorhanden und Status "wartend"
  if (fruehesteStartzeit && (terminMitarbeiterId || gesamtMitarbeiterValue) && status === 'wartend') {
    status = 'geplant';
    // Aktualisiere auch das Dropdown zur Anzeige
    document.getElementById('modalTerminStatus').value = 'geplant';
  }

  // "Muss bearbeitet werden" Checkbox auslesen
  const mussBearbeitetCheckbox = document.getElementById('modalMussBearbeitetCheckbox');
  const mussBearbeitetWerden = mussBearbeitetCheckbox ? mussBearbeitetCheckbox.checked : false;

  // Interne Auftragsnummer auslesen
  const interneAuftragsnummerInput = document.getElementById('modalInterneAuftragsnummer');
  const interneAuftragsnummer = interneAuftragsnummerInput ? interneAuftragsnummerInput.value.trim() : '';

  // _dauer_override synchronisieren: Immer auf den gespeicherten Gesamtwert setzen,
  // damit getTerminGesamtdauer den richtigen Wert liefert (verhindert Stale-Override-Bug).
  if (gesamtzeitMinuten > 0) {
    arbeitszeitenDetails._dauer_override = gesamtzeitMinuten;
  } else {
    delete arbeitszeitenDetails._dauer_override;
  }

  // DEBUG: Zeige was gespeichert wird
  console.log(`[DEBUG SAVE] Termin ${termin.termin_nr}:`, {
    terminId: this.currentTerminId,
    tatsaechliche_zeit: gesamtzeitMinuten,
    mitarbeiter_id: terminMitarbeiterId,
    hatIndividuelleZeiten,
    gesamtMitarbeiterValue,
    arbeitszeitenDetails: JSON.parse(JSON.stringify(arbeitszeitenDetails)), // Deep copy für Log
    status
  });

  // Doppelbuchungs-/Warte-Kunden-Prüfung (warnen, aber erlauben)
  if (fruehesteStartzeit && gesamtzeitMinuten > 0) {
    let pruefMitarbeiterId = null;
    let pruefLehrlingId = null;
    if (gesamtMitarbeiterValue && gesamtMitarbeiterValue.startsWith('l_')) {
      pruefLehrlingId = parseInt(gesamtMitarbeiterValue.replace('l_', ''), 10);
    } else if (terminMitarbeiterId) {
      pruefMitarbeiterId = terminMitarbeiterId;
    }
    if (pruefMitarbeiterId || pruefLehrlingId) {
      try {
        const slot = await TermineService.checkSlot({
          datum: termin.datum,
          dauer: gesamtzeitMinuten,
          startzeit: fruehesteStartzeit,
          mitarbeiterId: pruefMitarbeiterId,
          lehrlingId: pruefLehrlingId,
          excludeTerminId: this.currentTerminId,
          abholungTyp: termin.abholung_typ
        });
        const meldung = this.baueSlotWarnung(slot && slot.slot_pruefung);
        if (meldung && !confirm(meldung + '\n\nTrotzdem speichern?')) {
          return; // Vom Benutzer abgebrochen
        }
      } catch (e) {
        console.warn('Slot-Prüfung fehlgeschlagen – speichere ohne Prüfung:', e);
      }
    }
  }

  try {
    await TermineService.update(this.currentTerminId, {
      tatsaechliche_zeit: gesamtzeitMinuten,
      geschaetzte_zeit: gesamtzeitMinuten,
      arbeitszeiten_details: JSON.stringify(arbeitszeitenDetails),
      status: status,
      mitarbeiter_id: terminMitarbeiterId,
      muss_bearbeitet_werden: mussBearbeitetWerden,
      interne_auftragsnummer: interneAuftragsnummer
    });
    console.log(`[ARBEITSZEITEN-SAVE] Termin ${this.currentTerminId} gespeichert: status=${status}, tatsaechliche_zeit=${gesamtzeitMinuten}min, mitarbeiter_id=${terminMitarbeiterId}`);

    // Speichere Phasen wenn mehrtägig aktiviert ist
    const mehrtaegigCheckbox = document.getElementById('modalMehrtaegigCheckbox');
    if (mehrtaegigCheckbox && mehrtaegigCheckbox.checked) {
      const phasen = this.getModalPhasenFromForm();
      if (phasen.length > 0) {
        await PhasenService.syncPhasen(this.currentTerminId, phasen);
        
        // Prüfe ob Folgetermine erstellt werden sollen
        const erstelleFolgetermineCheckbox = document.getElementById('modalErstelleFolgetermineCheckbox');
        if (erstelleFolgetermineCheckbox && erstelleFolgetermineCheckbox.checked && phasen.length > 1) {
          // Erstelle Folgetermine für Phasen an anderen Tagen
          const hauptTermin = {
            kunde_id: termin.kunde_id,
            kunde_name: termin.kunde_name,
            kunde_telefon: termin.kunde_telefon,
            kennzeichen: termin.kennzeichen,
            datum: termin.datum,
            mitarbeiter_id: terminMitarbeiterId,
            dringlichkeit: termin.dringlichkeit,
            vin: termin.vin,
            fahrzeugtyp: termin.fahrzeugtyp
          };
          
          const ergebnisse = await this.erstelleFolgetermineAusPhasen(
            hauptTermin,
            phasen,
            termin.termin_nr
          );
          
          if (ergebnisse.erfolg > 0) {
            alert(`Zeiten & Status gespeichert!\n\n📅 ${ergebnisse.erfolg} Folgetermin(e) für neue Phasen erstellt.`);
          }
        }
      }
    } else {
      // Wenn mehrtägig deaktiviert, lösche alle Phasen
      await PhasenService.syncPhasen(this.currentTerminId, []);
    }

    // Lösche den Termin aus dem Cache, damit er beim nächsten Mal frisch geladen wird
    delete this.termineById[this.currentTerminId];

    this.closeArbeitszeitenModal();
    this.loadTermine();
    this.loadDashboard();
    this.loadAuslastung();
    
    // Aktualisiere Planung & Zuweisung wenn sichtbar
    const planungTab = document.getElementById('auslastung-dragdrop');
    if (planungTab && planungTab.classList.contains('active')) {
      this.loadAuslastungDragDrop();
    }
    
    // Aktualisiere Teile-Status-Übersicht wenn sichtbar
    const teileStatusTab = document.getElementById('teileStatus');
    if (teileStatusTab && teileStatusTab.classList.contains('active')) {
      this.loadTeileStatusUebersicht();
    }
  } catch (error) {
    console.error('Fehler beim Speichern:', error);
    alert('Fehler beim Speichern der Zeiten & Status');
  }
};
}
