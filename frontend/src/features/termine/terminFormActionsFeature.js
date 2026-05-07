export function installTerminFormActionsFeature(AppClass) {
  AppClass.prototype.toggleAbholungDetails = function() {
  const abholungTypRadio = document.querySelector('input[name="abholung_typ"]:checked');
  const abholungTyp = abholungTypRadio ? abholungTypRadio.value : 'bringen';
  const detailsGroup = document.getElementById('abholungDetailsGroup');
  const zeitRow = document.getElementById('abholungZeitRow');
  const bringzeitGroup = document.getElementById('bringzeitGroup');
  const abholzeitGroup = document.getElementById('abholzeitGroup');
  const kontaktOptionGroup = document.getElementById('kontaktOptionGroup');

  if (!detailsGroup || !zeitRow || !bringzeitGroup || !abholzeitGroup || !kontaktOptionGroup) {
    return;
  }

  // Details anzeigen bei hol_bring, bringen oder ruecksprache
  const showDetails = abholungTyp === 'hol_bring' || abholungTyp === 'ruecksprache' || abholungTyp === 'bringen';
  detailsGroup.style.display = showDetails ? 'block' : 'none';

  // Zeitfelder anzeigen bei abholung, hol_bring, bringen, warten oder ruecksprache
  const showZeitRow = abholungTyp === 'hol_bring' || abholungTyp === 'bringen' || abholungTyp === 'warten' || abholungTyp === 'ruecksprache';
  zeitRow.style.display = showZeitRow ? 'flex' : 'none';

  // Bringzeit bei hol_bring, bringen, warten oder ruecksprache
  const showBringzeit = abholungTyp === 'hol_bring' || abholungTyp === 'bringen' || abholungTyp === 'warten' || abholungTyp === 'ruecksprache';
  bringzeitGroup.style.display = showBringzeit ? 'block' : 'none';

  // Abholzeit bei hol_bring oder bringen
  const showAbholzeit = abholungTyp === 'hol_bring' || abholungTyp === 'bringen';
  abholzeitGroup.style.display = showAbholzeit ? 'block' : 'none';

  // Kontakt bei hol_bring, bringen oder ruecksprache
  const showKontakt = abholungTyp === 'hol_bring' || abholungTyp === 'bringen' || abholungTyp === 'ruecksprache';
  kontaktOptionGroup.style.display = showKontakt ? 'block' : 'none';

};

  AppClass.prototype.checkErsatzautoVerfuegbarkeit = async function() {
  const checkbox = document.getElementById('ersatzauto');
  const datumInput = document.getElementById('datum');
  const statusEl = document.getElementById('ersatzautoStatus');
  const dauerGroup = document.getElementById('ersatzautoDauerGroup');
  
  if (!checkbox || !datumInput || !statusEl) return;
  
  // Ersatzauto-Dauer-Gruppe anzeigen/ausblenden
  if (dauerGroup) {
    dauerGroup.style.display = checkbox.checked ? 'block' : 'none';
    
    // Setze Mindest-Datum für ersatzauto_bis_datum
    const bisDatumInput = document.getElementById('ersatzauto_bis_datum');
    if (bisDatumInput && datumInput.value) {
      bisDatumInput.min = datumInput.value;
    }
  }
  
  // Nur anzeigen wenn Checkbox aktiviert ist
  if (!checkbox.checked) {
    statusEl.style.display = 'none';
    // Entferne Details-Container falls vorhanden
    const detailsEl = document.getElementById('ersatzautoDetails');
    if (detailsEl) detailsEl.remove();
    return;
  }
  
  const datum = datumInput.value;
  if (!datum) {
    statusEl.style.display = 'none';
    return;
  }
  
  try {
    const verfuegbarkeit = await ErsatzautosService.getVerfuegbarkeit(datum);
    
    statusEl.style.display = 'inline-flex';
    const text = statusEl.querySelector('.status-text');
    
    const istVerfuegbar = verfuegbarkeit.verfuegbar > 0;
    
    if (istVerfuegbar) {
      statusEl.className = 'ersatzauto-status verfuegbar';
      text.textContent = `${verfuegbarkeit.verfuegbar} von ${verfuegbarkeit.gesamt} frei`;
      // Entferne alte Details
      const detailsEl = document.getElementById('ersatzautoDetails');
      if (detailsEl) detailsEl.remove();
    } else {
      statusEl.className = 'ersatzauto-status nicht-verfuegbar';
      text.textContent = `Alle ${verfuegbarkeit.gesamt} vergeben`;
      
      // Lade und zeige Details, welche Termine die Autos belegen
      this.showErsatzautoKonfliktDetails(datum, statusEl);
    }
  } catch (error) {
    console.error('Fehler beim Prüfen der Ersatzauto-Verfügbarkeit:', error);
    statusEl.style.display = 'none';
  }
}

// Zeige Details bei Ersatzauto-Konflikt;

  AppClass.prototype.showErsatzautoKonfliktDetails = async function(datum, statusEl) {
  try {
    const details = await ErsatzautosService.getVerfuegbarkeitDetails(datum);
    
    // Entferne alten Details-Container falls vorhanden
    let detailsEl = document.getElementById('ersatzautoDetails');
    if (detailsEl) detailsEl.remove();
    
    if (details.termine && details.termine.length > 0) {
      detailsEl = document.createElement('div');
      detailsEl.id = 'ersatzautoDetails';
      detailsEl.className = 'ersatzauto-konflikt-details';
      
      const terminListe = details.termine.slice(0, 3).map(t => 
        `<div class="konflikt-termin">
          <span class="konflikt-kunde">${t.kunde_name || 'Unbekannt'}</span>
          <span class="konflikt-kennzeichen">${t.kennzeichen || '-'}</span>
          <span class="konflikt-bis">bis ${t.ersatzauto_bis_datum || t.abholung_datum || t.datum}</span>
        </div>`
      ).join('');
      
      const mehrText = details.termine.length > 3 
        ? `<div class="konflikt-mehr">+${details.termine.length - 3} weitere</div>` 
        : '';
      
      detailsEl.innerHTML = `
        <div class="konflikt-header">⚠️ Diese Termine belegen Ersatzautos:</div>
        ${terminListe}
        ${mehrText}
      `;
      
      // Füge nach dem Status-Element ein
      statusEl.parentNode.insertBefore(detailsEl, statusEl.nextSibling);
    }
  } catch (error) {
    console.error('Fehler beim Laden der Ersatzauto-Konflikt-Details:', error);
  }
}

// Validiere Ersatzauto-Eingaben;

  AppClass.prototype.validateErsatzautoEingaben = function() {
  const checkbox = document.getElementById('ersatzauto');
  if (!checkbox || !checkbox.checked) return true; // Kein Ersatzauto = OK
  
  const abholungTypRadio = document.querySelector('input[name="abholung_typ"]:checked');
  const abholungTyp = abholungTypRadio ? abholungTypRadio.value : 'bringen';
  const ersatzautoTageEl = document.getElementById('ersatzauto_tage');
  const abholungDatumEl = document.getElementById('abholung_datum');
  const abholungZeitEl = document.getElementById('abholung_zeit');
  
  const ersatzautoTage = ersatzautoTageEl?.value?.trim() || '';
  const abholungDatum = abholungDatumEl?.value?.trim() || '';
  const abholungZeit = abholungZeitEl?.value?.trim() || '';
  
  const hatTage = ersatzautoTage !== '' && parseInt(ersatzautoTage, 10) > 0;
  const hatAbholungDatum = abholungDatum !== '';
  const hatAbholungZeit = abholungZeit !== '';
  
  const dauerGroup = document.getElementById('ersatzautoDauerGroup');
  
  // Bei "Telefonische Rücksprache" muss Anzahl Tage angegeben sein
  // Bei anderen Typen reicht auch das Abholdatum/Zeit
  const istTelefonRuecksprache = abholungTyp === 'ruecksprache';
  
  if (istTelefonRuecksprache && !hatTage) {
    // Bei tel. Rücksprache: Tage sind Pflicht
    if (dauerGroup) {
      dauerGroup.style.borderColor = '#dc3545';
      dauerGroup.style.background = '#fff5f5';
    }
    if (ersatzautoTageEl) ersatzautoTageEl.style.borderColor = '#dc3545';
    return false;
  }
  
  // Bei anderen Typen: Entweder Tage ODER Abholdatum muss vorhanden sein
  if (!istTelefonRuecksprache && !hatTage && !hatAbholungDatum && !hatAbholungZeit) {
    if (dauerGroup) {
      dauerGroup.style.borderColor = '#dc3545';
      dauerGroup.style.background = '#fff5f5';
    }
    if (ersatzautoTageEl) ersatzautoTageEl.style.borderColor = '#dc3545';
    return false;
  }
  
  // Alles OK - Styling zurücksetzen
  if (dauerGroup) {
    dauerGroup.style.borderColor = '#ffc107';
    dauerGroup.style.background = '#fff8e1';
  }
  if (ersatzautoTageEl) ersatzautoTageEl.style.borderColor = '';
  
  return true;
}

// Event-Handler für Ersatzauto-Optionen (vereinfacht);

  AppClass.prototype.setupErsatzautoOptionHandlers = function() {
  // Keine speziellen Handler mehr nötig - nur noch Tage-Feld
}

// Bug 1 Fix: forceOverwrite Parameter hinzugefügt
// Bei forceOverwrite=false wird das Termin-Datum nur gesetzt wenn es leer ist;

  AppClass.prototype.setTodayDate = function(forceOverwrite = true) {
  const today = this.formatDateLocal(new Date());
  
  // Termin-Datum bewusst NICHT vorauswählen – Benutzer muss aktiv wählen
  // (nur Auslastungs- und Abwesenheitsdatum auf heute setzen)

  // Auslastung-Datum immer auf heute setzen (separate Ansicht)
  const auslastungDatum = document.getElementById('auslastungDatum');
  if (auslastungDatum) {
    auslastungDatum.value = today;
  }
  
  const abwesenheitDatum = document.getElementById('abwesenheitDatum');
  if (abwesenheitDatum) {
    abwesenheitDatum.value = today;
  }
  this.toggleAbholungDetails();
  this.loadAuslastung();
};

  AppClass.prototype.setInternerTerminTodayDate = function() {
  const today = this.formatDateLocal(new Date());
  const internDatum = document.getElementById('intern_datum');
  if (internDatum) {
    internDatum.value = today;
  }
};

  AppClass.prototype.loadTerminAuslastungAnzeige = async function() {
  const datumInput = document.getElementById('datum');
  const anzeige = document.getElementById('terminAuslastungAnzeige');

  if (!datumInput || !anzeige) return;

  const datum = datumInput.value;
  if (!datum) {
    anzeige.style.display = 'none';
    return;
  }

  try {
    const data = await AuslastungService.getByDatum(datum);

    // Zeige die Anzeige
    anzeige.style.display = 'block';

    // Update Prozent
    const prozent = data.auslastung_prozent || 0;
    const prozentEl = document.getElementById('terminAuslastungProzent');
    if (prozentEl) {
      prozentEl.textContent = `${prozent}%`;
      // Farbe basierend auf Auslastung
      if (prozent > 100) {
        prozentEl.style.color = '#c62828';
      } else if (prozent > 80) {
        prozentEl.style.color = '#f57c00';
      } else {
        prozentEl.style.color = '#2e7d32';
      }
    }

    // Update Balken
    const balken = document.getElementById('terminAuslastungBalken');
    if (balken) {
      balken.style.width = `${Math.min(prozent, 100)}%`;
      // Farbe basierend auf Auslastung
      if (prozent > 100) {
        balken.style.background = '#c62828';
      } else if (prozent > 80) {
        balken.style.background = '#f57c00';
      } else {
        balken.style.background = '#2e7d32';
      }
    }

    // Update verfügbar
    const verfuegbarEl = document.getElementById('terminAuslastungVerfuegbar');
    if (verfuegbarEl) {
      const verfuegbarStunden = (data.verfuegbar_minuten || 0) / 60;
      verfuegbarEl.textContent = `${verfuegbarStunden.toFixed(1)} h`;
    }

    // Update gesamt
    const gesamtEl = document.getElementById('terminAuslastungGesamt');
    if (gesamtEl) {
      const gesamtStunden = (data.gesamt_minuten || 0) / 60;
      gesamtEl.textContent = `${gesamtStunden.toFixed(1)} h`;
    }
    
    // Termine für diesen Tag laden
    await this.loadNewTermineAmTag(datum);

  } catch (error) {
    console.error('Fehler beim Laden der Auslastung:', error);
    anzeige.style.display = 'none';
  }
};

  AppClass.prototype.loadNewTermineAmTag = async function(datum) {
  const termineListe = document.getElementById('newTermineListe');
  const termineAnzahl = document.getElementById('newTermineAnzahl');
  
  if (!termineListe) return;
  
  try {
    const termine = await TermineService.getAll(datum);
    
    // Filtere gelöschte Termine aus
    const aktiveTermine = termine.filter(t => !t.ist_geloescht);
    
    termineAnzahl.textContent = `${aktiveTermine.length} Termin${aktiveTermine.length !== 1 ? 'e' : ''}`;
    
    if (aktiveTermine.length === 0) {
      termineListe.innerHTML = '<div style="color: #28a745; padding: 8px; text-align: center;">✅ Noch keine Termine an diesem Tag</div>';
      return;
    }
    
    // Sortiere nach Bringzeit/Startzeit
    aktiveTermine.sort((a, b) => {
      const zeitA = a.bring_zeit || a.startzeit || '99:99';
      const zeitB = b.bring_zeit || b.startzeit || '99:99';
      return zeitA.localeCompare(zeitB);
    });
    
    let html = '';
    aktiveTermine.forEach(termin => {
      const bringZeit = termin.bring_zeit || '--:--';
      const abholZeit = termin.abholung_zeit || '--:--';
      const dauer = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;
      const dauerText = dauer >= 60 ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim() : `${dauer} min`;
      
      const statusFarbe = {
        'offen': '#ffc107',
        'geplant': '#17a2b8', 
        'in_arbeit': '#007bff',
        'abgeschlossen': '#28a745',
        'storniert': '#dc3545',
        'unterbrochen': '#e65100'
      }[termin.status] || '#6c757d';

      // Split-Termine: Zeitkorrektur-Button
      const splitZeitBtn = termin.split_teil === 1 && termin.status === 'unterbrochen'
        ? `<button onclick="app.showTerminDetails(${termin.id})" title="Tats\u00e4chliche Zeit korrigieren" style="border:none;background:#fff3e0;color:#e65100;border-radius:4px;padding:1px 6px;font-size:11px;cursor:pointer;margin-left:6px;">✏️ Zeit</button>`
        : '';
      
      html += `
        <div style="padding: 8px; margin-bottom: 6px; background: #fff; border-radius: 6px; border: 1px solid #dee2e6;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 600; color: #333;">
              ${termin.termin_nr || '-'}
            </div>
            <div style="display: flex; gap: 8px; font-size: 0.85em;">
              <span style="color: ${statusFarbe}; font-weight: 600;">${termin.status || '-'}</span>${splitZeitBtn}
            </div>
          </div>
          <div style="color: #555; font-size: 0.9em; margin-top: 4px;">
            🚗 ${termin.kennzeichen || '-'} • ${termin.kunde_name || 'Unbekannt'}
          </div>
          <div style="display: flex; gap: 12px; margin-top: 4px; color: #666; font-size: 0.85em;">
            <span>🚗↓ ${bringZeit}</span>
            <span>🚗↑ ${abholZeit}</span>
            <span>⏱️ ${dauerText}</span>
          </div>
          <div style="color: #888; font-size: 0.8em; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            📋 ${termin.arbeit || '-'}
          </div>
        </div>
      `;
    });
    
    termineListe.innerHTML = html;
    
  } catch (error) {
    console.error('Fehler beim Laden der Termine für den Tag:', error);
    termineListe.innerHTML = '<div style="color: #dc3545; padding: 8px;">❌ Fehler beim Laden</div>';
  }
};

  AppClass.prototype.loadInternerTerminMitarbeiter = async function() {
  const select = document.getElementById('intern_mitarbeiter');
  if (!select) return;

  try {
    const mitarbeiter = await MitarbeiterService.getAktive();
    const lehrlinge = await LehrlingeService.getAktive();

    let options = '<option value="">-- Niemand zugeordnet --</option>';

    if (mitarbeiter.length > 0) {
      options += '<optgroup label="Mitarbeiter">';
      options += mitarbeiter.map(m =>
        `<option value="ma_${m.id}">${m.name}</option>`
      ).join('');
      options += '</optgroup>';
    }

    if (lehrlinge.length > 0) {
      options += '<optgroup label="Lehrlinge">';
      options += lehrlinge.map(l =>
        `<option value="l_${l.id}">${l.name}</option>`
      ).join('');
      options += '</optgroup>';
    }

    select.innerHTML = options;
  } catch (error) {
    console.error('Fehler beim Laden der Mitarbeiter/Lehrlinge:', error);
  }
}

// Bug 1 Fix: preserveDatum Parameter hinzugefügt
// Bei preserveDatum=true bleibt das aktuelle Datum erhalten;

  AppClass.prototype.resetTerminForm = function(preserveDatum = false) {
  // Datum VOR dem Reset sichern wenn gewünscht
  const savedDatum = preserveDatum ? document.getElementById('datum')?.value : null;
  
  // Formular komplett zurücksetzen
  const form = document.getElementById('terminForm');
  if (form) {
    form.reset();
  }

  // Datum wiederherstellen (wenn preserveDatum) – sonst leer lassen
  if (savedDatum) {
    document.getElementById('datum').value = savedDatum;
    this.loadTerminAuslastungAnzeige();
  } else {
    // Datum leeren – Benutzer muss bewusst wählen
    const datumInput = document.getElementById('datum');
    if (datumInput) datumInput.value = '';
  }
  this.updateSelectedDatumDisplay();
  const datumFehler = document.getElementById('terminDatumFehler');
  if (datumFehler) datumFehler.style.display = 'none';
  this.setTodayDate(false); // Nur Auslastungs-/Abwesenheitsdatum auf heute

  // KM-Stand Placeholder und Styling zurücksetzen
  const kmStandInput = document.getElementById('kilometerstand');
  if (kmStandInput) {
    kmStandInput.classList.remove('has-previous-value');
    kmStandInput.placeholder = 'z.B. 128000';
    kmStandInput.value = '';
  }

  // Neue Suchfelder leeren
  const terminNameSuche = document.getElementById('terminNameSuche');
  if (terminNameSuche) {
    terminNameSuche.value = '';
  }
  const kzSucheBezirk = document.getElementById('kzSucheBezirk');
  if (kzSucheBezirk) kzSucheBezirk.value = '';
  const kzSucheBuchstaben = document.getElementById('kzSucheBuchstaben');
  if (kzSucheBuchstaben) kzSucheBuchstaben.value = '';
  const kzSucheNummer = document.getElementById('kzSucheNummer');
  if (kzSucheNummer) kzSucheNummer.value = '';
  
  // Vorschläge ausblenden
  this.hideVorschlaege('name');
  this.hideVorschlaege('kennzeichen');

  // Schnellsuche leeren (falls noch vorhanden)
  const schnellsuche = document.getElementById('terminSchnellsuche');
  if (schnellsuche) {
    schnellsuche.value = '';
  }
  
  // Schnellsuche-Status ausblenden
  const schnellsucheStatus = document.getElementById('schnellsucheStatus');
  if (schnellsucheStatus) {
    schnellsucheStatus.style.display = 'none';
  }
  
  // Kunde-Status-Badge ausblenden
  const kundeStatusAnzeige = document.getElementById('kundeStatusAnzeige');
  if (kundeStatusAnzeige) {
    kundeStatusAnzeige.style.display = 'none';
  }
  
  // Kennzeichen-Pflichtmarkierung zurücksetzen
  const kennzeichenField = document.getElementById('kennzeichen');
  const kennzeichenLabel = kennzeichenField?.parentElement?.querySelector('label');
  this.setKennzeichenPflicht(false, kennzeichenField, kennzeichenLabel);

  // Versteckte Felder zurücksetzen
  const kundeId = document.getElementById('kunde_id');
  if (kundeId) {
    kundeId.value = '';
  }

  // Verstecke Kundenanzeige
  this.hideGefundenerKunde();

  // Ersatzauto-Felder zurücksetzen
  const ersatzautoDauerGroup = document.getElementById('ersatzautoDauerGroup');
  if (ersatzautoDauerGroup) {
    ersatzautoDauerGroup.style.display = 'none';
    ersatzautoDauerGroup.style.borderColor = '#ffc107';
    ersatzautoDauerGroup.style.background = '#fff8e1';
  }
  const ersatzautoTage = document.getElementById('ersatzauto_tage');
  if (ersatzautoTage) {
    ersatzautoTage.value = '';
    ersatzautoTage.style.borderColor = '';
  }
  
  const abholungDatum = document.getElementById('abholung_datum');
  if (abholungDatum) {
    abholungDatum.value = '';
  }
  const ersatzautoStatus = document.getElementById('ersatzautoStatus');
  if (ersatzautoStatus) {
    ersatzautoStatus.style.display = 'none';
  }
  
  // Teile-Bestellen Checkbox zurücksetzen
  const teileBestellenCheckbox = document.getElementById('teileBestellenCheckbox');
  if (teileBestellenCheckbox) {
    teileBestellenCheckbox.checked = false;
  }

  // Warnung verstecken
  this.hideTerminWarnung();

  // Abholung-Details korrekt anzeigen
  this.toggleAbholungDetails();
  
  // Phasen zurücksetzen
  this.resetPhasen();
  
  // Auslastungsanzeige verstecken
  const terminAuslastungAnzeige = document.getElementById('terminAuslastungAnzeige');
  if (terminAuslastungAnzeige) {
    terminAuslastungAnzeige.style.display = 'none';
  }
  
  // Kalender-Popup verstecken
  const auslastungKalenderPopup = document.getElementById('auslastungKalenderPopup');
  if (auslastungKalenderPopup) {
    auslastungKalenderPopup.style.display = 'none';
  }
  
  // Autocomplete-Dropdown für Arbeiten verstecken
  const arbeitAutocomplete = document.getElementById('arbeitAutocomplete');
  if (arbeitAutocomplete) {
    arbeitAutocomplete.style.display = 'none';
    arbeitAutocomplete.innerHTML = '';
  }
  
  // Fahrzeug-Auswahl Modal verstecken (falls offen)
  const fahrzeugAuswahlModal = document.getElementById('fahrzeugAuswahlModal');
  if (fahrzeugAuswahlModal) {
    fahrzeugAuswahlModal.style.display = 'none';
  }
  this.fahrzeugAuswahlData = null;
}

// Alle schwebenden/floating Elemente verstecken (bei Tab-Wechsel);

  AppClass.prototype.hideAllFloatingElements = function() {
  // Auslastungsanzeige
  const terminAuslastungAnzeige = document.getElementById('terminAuslastungAnzeige');
  if (terminAuslastungAnzeige) {
    terminAuslastungAnzeige.style.display = 'none';
  }
  
  // Kalender-Popup
  const auslastungKalenderPopup = document.getElementById('auslastungKalenderPopup');
  if (auslastungKalenderPopup) {
    auslastungKalenderPopup.style.display = 'none';
  }
  
  // Autocomplete-Dropdowns
  const arbeitAutocomplete = document.getElementById('arbeitAutocomplete');
  if (arbeitAutocomplete) {
    arbeitAutocomplete.style.display = 'none';
  }
  
  // Namenssuche-Vorschläge
  const nameSucheVorschlaege = document.getElementById('nameSucheVorschlaege');
  if (nameSucheVorschlaege) {
    nameSucheVorschlaege.classList.remove('aktiv');
  }
  
  // Kennzeichen-Vorschläge
  const kennzeichenSucheVorschlaege = document.getElementById('kennzeichenSucheVorschlaege');
  if (kennzeichenSucheVorschlaege) {
    kennzeichenSucheVorschlaege.classList.remove('aktiv');
  }
  
  // Fahrzeug-Auswahl Modal
  const fahrzeugAuswahlModal = document.getElementById('fahrzeugAuswahlModal');
  if (fahrzeugAuswahlModal) {
    fahrzeugAuswahlModal.style.display = 'none';
  }
  
  // Gefundener Kunde Anzeige
  const gefundenerKundeAnzeige = document.getElementById('gefundenerKundeAnzeige');
  if (gefundenerKundeAnzeige) {
    gefundenerKundeAnzeige.style.display = 'none';
  }
  
  // Alle Modals verstecken
  document.querySelectorAll('.modal').forEach(modal => {
    modal.style.display = 'none';
  });
}

// Setzt die Sub-Tabs im "termine" Container auf den Standardzustand zurück;

  AppClass.prototype.resetTermineSubTabs = function() {
  const termineContainer = document.getElementById('termine');
  if (!termineContainer) return;
  
  // Alle Sub-Tab-Contents deaktivieren und verstecken
  termineContainer.querySelectorAll('.sub-tab-content').forEach(content => {
    content.classList.remove('active');
    content.style.display = 'none';
  });
  
  // Alle Sub-Tab-Buttons deaktivieren
  termineContainer.querySelectorAll('.sub-tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Ersten Sub-Tab (neuerTermin) aktivieren und anzeigen
  const neuerTerminContent = document.getElementById('neuerTermin');
  if (neuerTerminContent) {
    neuerTerminContent.classList.add('active');
    neuerTerminContent.style.display = 'block';
  }
  
  const neuerTerminButton = termineContainer.querySelector('.sub-tab-button[data-subtab="neuerTermin"]');
  if (neuerTerminButton) {
    neuerTerminButton.classList.add('active');
  }
  
  // Auch das Formular für internen Termin zurücksetzen
  const internerTerminForm = document.getElementById('internerTerminForm');
  if (internerTerminForm) {
    internerTerminForm.reset();
  }
  
  // Extra: Interner Termin explizit verstecken
  const internerTerminDiv = document.getElementById('internerTermin');
  if (internerTerminDiv) {
    internerTerminDiv.style.display = 'none';
  }
}

// === TERMIN BEARBEITEN METHODEN ===;

  AppClass.prototype.loadEditTermine = async function() {
  const datumInput = document.getElementById('editTerminDatum');
  const terminListe = document.getElementById('editTerminListe');
  
  if (!datumInput || !terminListe) return;
  
  // Setze heute als Standard wenn kein Datum
  if (!datumInput.value) {
    datumInput.value = this.formatDateLocal(new Date());
  }
  
  const datum = datumInput.value;
  
  try {
    const termine = await TermineService.getAll(datum);
    
    // Filter: Keine internen Termine und nicht gelöschte (Schnell-Termine ohne Kennzeichen werden eingeschlossen)
    const filteredTermine = termine.filter(t => 
      t.kennzeichen !== 'INTERN' &&
      t.abholung_details !== 'Interner Termin' &&
      t.kunde_name !== 'Intern' &&
      !t.ist_geloescht
    );
    
    // Sortiere nach Bringzeit/Startzeit
    filteredTermine.sort((a, b) => {
      const zeitA = a.bring_zeit || a.startzeit || '99:99';
      const zeitB = b.bring_zeit || b.startzeit || '99:99';
      return zeitA.localeCompare(zeitB);
    });
    
    if (filteredTermine.length === 0) {
      terminListe.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #28a745;">
          ✅ Keine Termine an diesem Tag
        </div>
      `;
    } else {
      let html = '';
      filteredTermine.forEach(termin => {
        const bringZeit = termin.bring_zeit || '--:--';
        const abholZeit = termin.abholung_zeit || '--:--';
        const dauer = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;
        const dauerText = dauer >= 60 ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim() : `${dauer} min`;
        
        const statusFarbe = {
          'offen': '#ffc107',
          'geplant': '#17a2b8', 
          'in_arbeit': '#007bff',
          'abgeschlossen': '#28a745',
          'storniert': '#dc3545'
        }[termin.status] || '#6c757d';
        
        html += `
          <div class="edit-termin-item" 
               data-termin-id="${termin.id}" 
               style="padding: 12px 15px; border-bottom: 1px solid #eee; cursor: pointer; transition: background 0.2s;"
               onmouseover="this.style.background='#e3f2fd'"
               onmouseout="this.style.background='#fff'">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="font-weight: 600; color: #1565c0; font-size: 1.05em;">
                ${termin.termin_nr || '-'}${termin.kennzeichen ? ' • ' + termin.kennzeichen : ' ⚡ Schnell-Termin'}
              </div>
              <div style="display: flex; gap: 8px; align-items: center;">
                <span style="background: ${statusFarbe}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75em; font-weight: 600;">${termin.status || '-'}</span>
                <span style="color: #1565c0; font-size: 1.2em;">✏️</span>
              </div>
            </div>
            <div style="color: #333; margin-top: 6px; font-size: 0.95em;">
              👤 ${termin.kunde_name || 'Unbekannt'}
            </div>
            <div style="display: flex; gap: 15px; margin-top: 6px; color: #666; font-size: 0.85em;">
              <span>🚗↓ ${bringZeit}</span>
              <span>🚗↑ ${abholZeit}</span>
              <span>⏱️ ${dauerText}</span>
            </div>
            <div style="color: #888; font-size: 0.8em; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              📋 ${termin.arbeit || '-'}
            </div>
          </div>
        `;
      });
      
      terminListe.innerHTML = html;
      
      // Click-Handler hinzufügen
      terminListe.querySelectorAll('.edit-termin-item').forEach(item => {
        item.addEventListener('click', () => {
          const terminId = item.dataset.terminId;
          this.loadTerminZumBearbeitenById(terminId);
          
          // Markiere ausgewählten Termin
          terminListe.querySelectorAll('.edit-termin-item').forEach(i => {
            i.style.background = '#fff';
            i.style.borderLeft = 'none';
          });
          item.style.background = '#e3f2fd';
          item.style.borderLeft = '4px solid #1565c0';
        });
      });
    }
    
    // Formular verstecken
    this.resetTerminEditForm();
  } catch (error) {
    console.error('Fehler beim Laden der Termine:', error);
    terminListe.innerHTML = '<div style="padding: 20px; text-align: center; color: #dc3545;">❌ Fehler beim Laden</div>';
  }
};

  AppClass.prototype.loadTerminZumBearbeitenById = async function(terminId) {
  if (!terminId) {
    this.resetTerminEditForm();
    return;
  }
  
  try {
    const termin = await TermineService.getById(terminId);
    
    if (!termin) {
      alert('Termin nicht gefunden.');
      return;
    }
    
    // Zeige das Formular
    document.getElementById('editTerminFormContainer').style.display = 'block';
    const keinAusgewaehlt = document.getElementById('editTerminKeinAusgewaehlt');
    if (keinAusgewaehlt) keinAusgewaehlt.style.display = 'none';
    
    // Fülle das Formular mit den Termin-Daten
    this.fillEditTerminForm(termin);
    
    // Scroll zum Formular
    document.getElementById('editTerminFormContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    
  } catch (error) {
    console.error('Fehler beim Laden des Termins:', error);
    alert('Fehler beim Laden des Termins.');
  }
};

  AppClass.prototype.fillEditTerminForm = function(termin) {
  document.getElementById('edit_termin_id').value = termin.id;
  document.getElementById('edit_kunde_id').value = termin.kunde_id || '';
  
  // Zeige Kundennamen in der Anzeige-Box
  const kundeNameDisplay = document.getElementById('edit_kunde_name_display');
  const kundeTelefonDisplay = document.getElementById('edit_kunde_telefon_display');
  if (kundeNameDisplay) {
    kundeNameDisplay.textContent = termin.kunde_name || 'Unbekannt';
  }
  // Telefon aus Cache holen
  if (kundeTelefonDisplay && termin.kunde_id) {
    const kunde = this.kundenCache.find(k => k.id === termin.kunde_id);
    kundeTelefonDisplay.textContent = kunde?.telefon ? `📞 ${kunde.telefon}` : '';
  }
  
  document.getElementById('edit_datum').value = termin.datum;
  const editKennzeichen = document.getElementById('edit_kennzeichen');
  const editKennzeichenPflicht = document.getElementById('edit_kennzeichen_pflicht');
  editKennzeichen.value = termin.kennzeichen || '';
  // Kennzeichen ist nur Pflicht wenn es kein Schnell-Termin (ohne Kennzeichen) ist
  if (termin.kennzeichen) {
    editKennzeichen.setAttribute('required', 'required');
    if (editKennzeichenPflicht) editKennzeichenPflicht.textContent = '*';
  } else {
    editKennzeichen.removeAttribute('required');
    if (editKennzeichenPflicht) editKennzeichenPflicht.textContent = '(optional)';
  }
  document.getElementById('edit_kilometerstand').value = termin.kilometerstand || '';
  document.getElementById('edit_vin').value = termin.vin || '';
  document.getElementById('edit_fahrzeugtyp').value = termin.fahrzeugtyp || '';
  
  // Arbeiten als mehrzeiligen Text - unterstützt neues ' || ' und altes ', ' Format
  const arbeitRaw = termin.arbeit || '';
  const arbeitText = arbeitRaw.includes(' || ') 
    ? arbeitRaw.split(' || ').map(a => a.trim()).join('\n')
    : arbeitRaw.split(',').map(a => a.trim()).join('\n');
  document.getElementById('edit_arbeitEingabe').value = arbeitText;
  
  document.getElementById('edit_umfang').value = termin.umfang || '';
  document.getElementById('edit_abholung_typ').value = termin.abholung_typ || 'bringen';
  document.getElementById('edit_abholung_details').value = termin.abholung_details || '';
  document.getElementById('edit_bring_zeit').value = termin.bring_zeit || '';
  document.getElementById('edit_abholung_zeit').value = termin.abholung_zeit || '';
  document.getElementById('edit_abholung_datum').value = termin.abholung_datum || '';
  
  // Kontakt-Optionen
  const kontaktOption = termin.kontakt_option || '';
  document.getElementById('edit_kontakt_kunde_anrufen').checked = kontaktOption.includes('Kunde anrufen');
  document.getElementById('edit_kontakt_kunde_ruft').checked = kontaktOption.includes('Kunde ruft selbst an');
  
  // Auslastungsanzeige aktualisieren
  this.loadEditTerminAuslastungAnzeige();
  
  // Abholungs-Felder aktualisieren
  this.toggleEditAbholungDetails();
  
  // Manuelles Zeitkorrektur-Feld zurücksetzen und Zeitschätzung neu berechnen
  const editZeitManual = document.getElementById('edit_geschaetzte_zeit');
  if (editZeitManual) editZeitManual.value = '';
  this.updateEditZeitschaetzung();
  
  // Edit-Kalender aktualisieren: Zeige den Monat des Termins
  if (termin.datum) {
    const terminDatum = new Date(termin.datum + 'T00:00:00');
    if (!this.editKalenderAktuellMonat) {
      this.editKalenderAktuellMonat = new Date();
    }
    this.editKalenderAktuellMonat = new Date(terminDatum.getFullYear(), terminDatum.getMonth(), 1);
    // Timeout damit das Formular erst sichtbar wird
    setTimeout(() => {
      this.renderEditAuslastungKalender();
      this.updateEditSelectedDatumDisplay();
    }, 50);
  }
};

  AppClass.prototype.loadTerminZumBearbeiten = async function() {
  // Diese Funktion wird nicht mehr benötigt - Termine werden jetzt per Klick auf Liste geladen
  console.log('loadTerminZumBearbeiten() ist deprecated - nutze loadTerminZumBearbeitenById() stattdessen');
};

  AppClass.prototype.loadTerminZumBearbeitenAlt = async function() {
  const select = document.getElementById('editTerminAuswahl');
  const terminId = select?.value;
  
  if (!terminId) {
    this.resetTerminEditForm();
    return;
  }
  
  try {
    // Lade alle Termine und finde den richtigen
    const datum = document.getElementById('editTerminDatum').value;
    const termine = await TermineService.getAll(datum);
    const termin = termine.find(t => t.id == terminId);
    
    if (!termin) {
      alert('Termin nicht gefunden.');
      return;
    }
    
    // Zeige das Formular
    document.getElementById('editTerminFormContainer').style.display = 'block';
    document.getElementById('editTerminKeinAusgewaehlt').style.display = 'none';
    
    // Fülle das Formular mit den Termin-Daten
    document.getElementById('edit_termin_id').value = termin.id;
    document.getElementById('edit_kunde_id').value = termin.kunde_id || '';
    
    // Zeige Kundennamen in der Anzeige-Box
    const kundeNameDisplay = document.getElementById('edit_kunde_name_display');
    const kundeTelefonDisplay = document.getElementById('edit_kunde_telefon_display');
    if (kundeNameDisplay) {
      kundeNameDisplay.textContent = termin.kunde_name || 'Unbekannt';
    }
    // Telefon aus Cache holen
    if (kundeTelefonDisplay && termin.kunde_id) {
      const kunde = this.kundenCache.find(k => k.id === termin.kunde_id);
      kundeTelefonDisplay.textContent = kunde?.telefon ? `📞 ${kunde.telefon}` : '';
    }
    
    document.getElementById('edit_datum').value = termin.datum;
    document.getElementById('edit_kennzeichen').value = termin.kennzeichen || '';
    document.getElementById('edit_kilometerstand').value = termin.kilometerstand || '';
    document.getElementById('edit_vin').value = termin.vin || '';
    document.getElementById('edit_fahrzeugtyp').value = termin.fahrzeugtyp || '';
    
    // Arbeiten als mehrzeiligen Text - unterstützt neues ' || ' und altes ', ' Format
    const arbeitRaw = termin.arbeit || '';
    const arbeitText = arbeitRaw.includes(' || ') 
      ? arbeitRaw.split(' || ').map(a => a.trim()).join('\n')
      : arbeitRaw.split(',').map(a => a.trim()).join('\n');
    document.getElementById('edit_arbeitEingabe').value = arbeitText;
    
    document.getElementById('edit_umfang').value = termin.umfang || '';
    document.getElementById('edit_abholung_typ').value = termin.abholung_typ || 'bringen';
    document.getElementById('edit_abholung_details').value = termin.abholung_details || '';
    document.getElementById('edit_bring_zeit').value = termin.bring_zeit || '';
    document.getElementById('edit_abholung_zeit').value = termin.abholung_zeit || '';
    document.getElementById('edit_abholung_datum').value = termin.abholung_datum || '';
    
    // Kontakt-Optionen
    const kontaktOption = termin.kontakt_option || '';
    document.getElementById('edit_kontakt_kunde_anrufen').checked = kontaktOption.includes('Kunde anrufen');
    document.getElementById('edit_kontakt_kunde_ruft').checked = kontaktOption.includes('Kunde ruft selbst an');
    
    // Ersatzauto
    document.getElementById('edit_ersatzauto').checked = !!termin.ersatzauto;
    document.getElementById('edit_ersatzauto_tage').value = termin.ersatzauto_tage || '';
    
    // Aktualisiere die Anzeigen
    this.toggleEditAbholungDetails();
    this.checkEditErsatzautoVerfuegbarkeit();
    this.updateEditZeitschaetzung();
    this.loadEditTerminAuslastungAnzeige();
    
    // Edit-Kalender aktualisieren: Zeige den Monat des Termins
    if (termin.datum) {
      const terminDatum = new Date(termin.datum + 'T00:00:00');
      if (!this.editKalenderAktuellMonat) {
        this.editKalenderAktuellMonat = new Date();
      }
      this.editKalenderAktuellMonat = new Date(terminDatum.getFullYear(), terminDatum.getMonth(), 1);
      await this.renderEditAuslastungKalender();
      this.updateEditSelectedDatumDisplay();
    }
    
  } catch (error) {
    console.error('Fehler beim Laden des Termins:', error);
    alert('Fehler beim Laden des Termins.');
  }
};

  AppClass.prototype.resetTerminEditForm = function() {
  document.getElementById('editTerminFormContainer').style.display = 'none';
  document.getElementById('editTerminKeinAusgewaehlt').style.display = 'block';
  
  const form = document.getElementById('terminEditForm');
  if (form) {
    form.reset();
  }
  
  // Entferne aktive Markierung von Termin-Liste
  const terminListe = document.getElementById('editTerminListe');
  if (terminListe) {
    const items = terminListe.querySelectorAll('.edit-termin-item');
    items.forEach(item => item.classList.remove('active'));
  }
  
  // Verstecke Ersatzauto-Dauer-Gruppe
  const dauerGroup = document.getElementById('editErsatzautoDauerGroup');
  if (dauerGroup) {
    dauerGroup.style.display = 'none';
  }
  
  // Verstecke Auslastungsanzeige
  const auslastung = document.getElementById('editTerminAuslastungAnzeige');
  if (auslastung) {
    auslastung.style.display = 'none';
  }
  
  // Verstecke Zeitschätzung
  const zeitschaetzung = document.getElementById('editZeitschaetzungAnzeige');
  if (zeitschaetzung) {
    zeitschaetzung.style.display = 'none';
  }

  // Delta-Badge zurücksetzen
  const delta = document.getElementById('editZeitschaetzungDelta');
  if (delta) delta.style.display = 'none';
};

  AppClass.prototype.toggleEditAbholungDetails = function() {
  const abholungTyp = document.getElementById('edit_abholung_typ').value;
  const detailsGroup = document.getElementById('editAbholungDetailsGroup');
  const zeitRow = document.getElementById('editAbholungZeitRow');
  const bringzeitGroup = document.getElementById('editBringzeitGroup');
  const abholzeitGroup = document.getElementById('editAbholzeitGroup');
  const kontaktOptionGroup = document.getElementById('editKontaktOptionGroup');

  // Details anzeigen bei hol_bring, bringen oder ruecksprache
  const showDetails = abholungTyp === 'hol_bring' || abholungTyp === 'ruecksprache' || abholungTyp === 'bringen';
  if (detailsGroup) detailsGroup.style.display = showDetails ? 'block' : 'none';

  // Zeitfelder anzeigen bei abholung, hol_bring oder bringen
  const showZeitRow = abholungTyp === 'hol_bring' || abholungTyp === 'bringen' || abholungTyp === 'warten';
  if (zeitRow) zeitRow.style.display = showZeitRow ? 'flex' : 'none';

  // Bringzeit nur bei hol_bring, bringen oder warten
  const showBringzeit = abholungTyp === 'hol_bring' || abholungTyp === 'bringen' || abholungTyp === 'warten';
  if (bringzeitGroup) bringzeitGroup.style.display = showBringzeit ? 'block' : 'none';

  // Abholzeit bei hol_bring oder bringen
  const showAbholzeit = abholungTyp === 'hol_bring' || abholungTyp === 'bringen';
  if (abholzeitGroup) abholzeitGroup.style.display = showAbholzeit ? 'block' : 'none';

  // Kontakt bei hol_bring, bringen oder ruecksprache
  const showKontakt = abholungTyp === 'hol_bring' || abholungTyp === 'bringen' || abholungTyp === 'ruecksprache';
  if (kontaktOptionGroup) kontaktOptionGroup.style.display = showKontakt ? 'block' : 'none';
};

  AppClass.prototype.checkEditErsatzautoVerfuegbarkeit = async function() {
  const checkbox = document.getElementById('edit_ersatzauto');
  const datumInput = document.getElementById('edit_datum');
  const statusEl = document.getElementById('editErsatzautoStatus');
  const dauerGroup = document.getElementById('editErsatzautoDauerGroup');
  
  if (!checkbox || !datumInput || !statusEl) return;
  
  // Ersatzauto-Dauer-Gruppe anzeigen/ausblenden
  if (dauerGroup) {
    dauerGroup.style.display = checkbox.checked ? 'block' : 'none';
  }
  
  // Nur anzeigen wenn Checkbox aktiviert ist
  if (!checkbox.checked) {
    statusEl.style.display = 'none';
    return;
  }
  
  const datum = datumInput.value;
  if (!datum) {
    statusEl.style.display = 'none';
    return;
  }
  
  try {
    const verfuegbarkeit = await ErsatzautosService.getVerfuegbarkeit(datum);
    
    statusEl.style.display = 'inline-flex';
    const text = statusEl.querySelector('.status-text');
    
    const istVerfuegbar = verfuegbarkeit.verfuegbar > 0;
    const gesperrt = verfuegbarkeit.gesperrt || 0;
    
    if (istVerfuegbar) {
      statusEl.className = 'ersatzauto-status verfuegbar';
      if (gesperrt > 0) {
        text.textContent = `${verfuegbarkeit.verfuegbar} frei (${gesperrt} gesperrt)`;
      } else {
        text.textContent = `${verfuegbarkeit.verfuegbar} von ${verfuegbarkeit.gesamt} frei`;
      }
    } else {
      statusEl.className = 'ersatzauto-status nicht-verfuegbar';
      if (gesperrt > 0 && verfuegbarkeit.vergeben === 0) {
        text.textContent = `Alle ${gesperrt} gesperrt`;
      } else if (gesperrt > 0) {
        text.textContent = `${verfuegbarkeit.vergeben} vergeben, ${gesperrt} gesperrt`;
      } else {
        text.textContent = `Alle ${verfuegbarkeit.gesamt} vergeben`;
      }
    }
  } catch (error) {
    console.error('Fehler beim Prüfen der Ersatzauto-Verfügbarkeit:', error);
    statusEl.style.display = 'none';
  }
};

  AppClass.prototype.updateEditZeitschaetzung = async function() {
  const arbeitText = document.getElementById('edit_arbeitEingabe').value.trim();
  const anzeige = document.getElementById('editZeitschaetzungAnzeige');
  const wertEl = document.getElementById('editZeitschaetzungWert');
  const detailsEl = document.getElementById('editZeitschaetzungDetails');
  
  if (!arbeitText || !anzeige || !wertEl) {
    const editAutoInput = document.getElementById('edit_geschaetzte_zeit_auto');
    if (editAutoInput) editAutoInput.value = '0';
    return;
  }
  
  const arbeiten = this.parseArbeiten(arbeitText);
  if (arbeiten.length === 0) {
    anzeige.style.display = 'none';
    const editAutoInput = document.getElementById('edit_geschaetzte_zeit_auto');
    if (editAutoInput) editAutoInput.value = '0';
    return;
  }
  
  // Berechne die Zeiten für jede Arbeit
  let gesamtMinuten = 0;
  const items = [];
  const nichtGefundenEdit = [];
  const gefundenArbeiten = []; // für KI-Vergleich

  arbeiten.forEach(arbeit => {
    // Suche mit Fuzzy-Matching (exakt → Alias → Teilwort/Wort-Überlappung)
    const gefunden = this.findArbeitszeitMitDetails(arbeit);
    if (gefunden) {
      const minuten = gefunden.standard_minuten || 0;
      gesamtMinuten += minuten;
      let hinweis = '';
      if (gefunden.matchTyp === 'alias') hinweis = ` → ${gefunden.bezeichnung}`;
      else if (gefunden.matchTyp === 'fuzzy') hinweis = ` ≈ ${gefunden.bezeichnung}`;
      items.push({ arbeit, minuten, labelHtml: `✓ ${arbeit}${hinweis}: `, manualOverride: false });
      gefundenArbeiten.push({ arbeit, itemIdx: items.length - 1, zeitverwaltungMinuten: minuten, hinweis });
    } else {
      nichtGefundenEdit.push(arbeit);
      items.push({ arbeit, minuten: 0, labelHtml: `⚠️ ${arbeit}: `, noTime: true, manualOverride: false });
    }
  });

  // Speichere Richtzeit-Basis (Zeitverwaltungs-Summe) vor KI-Override
  let richtzeitBasis = gesamtMinuten;

  // 📊 KI-Zeitvorschlag für ALLE Arbeiten (KI = primäre Basis):
  const alleArbeiten = [...gefundenArbeiten.map(g => g.arbeit), ...nichtGefundenEdit];
  if (alleArbeiten.length > 0) {
    try {
      const kiErgebnisse = await Promise.allSettled(
        alleArbeiten.map(a => window.AIService.getZeitVorschlag(a))
      );
      kiErgebnisse.forEach((result, i) => {
        const arbeit = alleArbeiten[i];
        if (result.status !== 'fulfilled' || !result.value?.minuten) return;
        const { minuten, basis, n } = result.value;
        const std = Math.floor(minuten / 60);
        const min = minuten % 60;
        const zeitStr = std > 0 ? `${std} h${min > 0 ? ` ${min} min` : ''}` : `${min} min`;
        const quellLabel = basis === 'historisch' ? `aus ${n} Terminen`
          : basis === 'historisch_ähnlich' ? `ähnl. Arbeit`
          : `Kategorie-Schätzung`;

        const gefundenEintrag = gefundenArbeiten.find(g => g.arbeit === arbeit);
        if (gefundenEintrag) {
          gesamtMinuten -= gefundenEintrag.zeitverwaltungMinuten;
          gesamtMinuten += minuten;
          items[gefundenEintrag.itemIdx].minuten = minuten;
          items[gefundenEintrag.itemIdx].labelHtml = `📊 ${arbeit}${gefundenEintrag.hinweis} <small style="color:#888">(${quellLabel})</small>: `;
        } else {
          gesamtMinuten += minuten;
          richtzeitBasis += minuten;
          const idx = items.findIndex(it => it.noTime && it.arbeit === arbeit);
          if (idx !== -1) {
            items[idx].minuten = minuten;
            items[idx].labelHtml = `📊 ${arbeit} <small style="color:#888">(${quellLabel})</small>: `;
            delete items[idx].noTime;
          }
        }
      });
    } catch (e) { /* KI-Zeitvorschlag nicht kritisch */ }
  }

  // 🧠 Puffer-ML: KI-basierten Puffer abfragen wenn aktiviert
  const pufferMLAktiv = document.getElementById('pufferMLEnabled')?.checked;
  let mlPufferMinuten = 0;
  let pufferHtml = '';
  if (pufferMLAktiv && gesamtMinuten > 0 && arbeitText.length > 2) {
    try {
      const empfehlung = await window.AIService.getPufferEmpfehlung(arbeitText);
      if (empfehlung && empfehlung.puffer_minuten > 0) {
        mlPufferMinuten = empfehlung.puffer_minuten;
        const basis = empfehlung.basis === 'ML' ? '🧠 ML' : '📊 Standard';
        pufferHtml = `<div style="font-size:0.82em;color:#aaa;margin-top:2px;">+ Puffer (${basis}): +${mlPufferMinuten} min</div>`;
      }
    } catch (e) { /* Puffer-Abfrage nicht kritisch */ }
  }

  // Anzeige + State speichern + rendern
  anzeige.style.display = 'block';
  this._editZeitState = { items, mlPufferMinuten, richtzeitBasis, pufferHtml };
  this._renderZeitItems('edit');
};

  AppClass.prototype.loadEditTerminAuslastungAnzeige = async function() {
  const datumInput = document.getElementById('edit_datum');
  const anzeige = document.getElementById('editTerminAuslastungAnzeige');

  if (!datumInput || !anzeige) return;

  const datum = datumInput.value;
  if (!datum) {
    anzeige.style.display = 'none';
    return;
  }

  try {
    const auslastung = await AuslastungService.getByDatum(datum);
    
    anzeige.style.display = 'block';
    
    const prozent = auslastung.auslastung_prozent || 0;
    const verfuegbar = auslastung.verfuegbare_minuten || 0;
    const gesamt = auslastung.gesamt_minuten || 0;
    
    document.getElementById('editTerminAuslastungProzent').textContent = `${Math.round(prozent)}%`;
    document.getElementById('editTerminAuslastungVerfuegbar').textContent = `${Math.round(verfuegbar / 60 * 10) / 10} h`;
    document.getElementById('editTerminAuslastungGesamt').textContent = `${Math.round(gesamt / 60 * 10) / 10} h`;
    
    const balken = document.getElementById('editTerminAuslastungBalken');
    balken.style.width = `${Math.min(prozent, 100)}%`;
    
    if (prozent >= 100) {
      balken.style.background = '#dc3545';
    } else if (prozent >= 80) {
      balken.style.background = '#ffc107';
    } else {
      balken.style.background = '#4a90e2';
    }
    
    // Termine für diesen Tag laden
    await this.loadEditTermineAmTag(datum);
    
  } catch (error) {
    console.error('Fehler beim Laden der Auslastung:', error);
    anzeige.style.display = 'none';
  }
};

  AppClass.prototype.loadEditTermineAmTag = async function(datum) {
  const termineListe = document.getElementById('editTermineListe');
  const termineAnzahl = document.getElementById('editTermineAnzahl');
  const aktuellBearbeiteterTerminId = parseInt(document.getElementById('edit_termin_id').value, 10);
  
  if (!termineListe) return;
  
  try {
    const termine = await TermineService.getAll(datum);
    
    // Filtere gelöschte Termine aus
    const aktiveTermine = termine.filter(t => !t.ist_geloescht);
    
    termineAnzahl.textContent = `${aktiveTermine.length} Termin${aktiveTermine.length !== 1 ? 'e' : ''}`;
    
    if (aktiveTermine.length === 0) {
      termineListe.innerHTML = '<div style="color: #28a745; padding: 8px; text-align: center;">✅ Keine anderen Termine an diesem Tag</div>';
      return;
    }
    
    // Sortiere nach Bringzeit/Startzeit
    aktiveTermine.sort((a, b) => {
      const zeitA = a.bring_zeit || a.startzeit || '99:99';
      const zeitB = b.bring_zeit || b.startzeit || '99:99';
      return zeitA.localeCompare(zeitB);
    });
    
    let html = '';
    aktiveTermine.forEach(termin => {
      const istAktueller = termin.id === aktuellBearbeiteterTerminId;
      const bringZeit = termin.bring_zeit || '--:--';
      const abholZeit = termin.abholung_zeit || '--:--';
      const dauer = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;
      const dauerText = dauer >= 60 ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim() : `${dauer} min`;
      
      const statusFarbe = {
        'offen': '#ffc107',
        'geplant': '#17a2b8', 
        'in_arbeit': '#007bff',
        'abgeschlossen': '#28a745',
        'storniert': '#dc3545'
      }[termin.status] || '#6c757d';
      
      html += `
        <div style="padding: 8px; margin-bottom: 6px; background: ${istAktueller ? '#e3f2fd' : '#fff'}; border-radius: 6px; border: 1px solid ${istAktueller ? '#2196f3' : '#dee2e6'}; ${istAktueller ? 'border-width: 2px;' : ''}">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 600; color: #333;">
              ${termin.termin_nr || '-'} ${istAktueller ? '<span style="color: #1565c0; font-size: 0.8em;">(aktuell)</span>' : ''}
            </div>
            <div style="display: flex; gap: 8px; font-size: 0.85em;">
              <span style="color: ${statusFarbe}; font-weight: 600;">${termin.status || '-'}</span>
            </div>
          </div>
          <div style="color: #555; font-size: 0.9em; margin-top: 4px;">
            🚗 ${termin.kennzeichen || '-'} • ${termin.kunde_name || 'Unbekannt'}
          </div>
          <div style="display: flex; gap: 12px; margin-top: 4px; color: #666; font-size: 0.85em;">
            <span>🚗↓ ${bringZeit}</span>
            <span>🚗↑ ${abholZeit}</span>
            <span>⏱️ ${dauerText}</span>
          </div>
          <div style="color: #888; font-size: 0.8em; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            📋 ${termin.arbeit || '-'}
          </div>
        </div>
      `;
    });
    
    termineListe.innerHTML = html;
    
  } catch (error) {
    console.error('Fehler beim Laden der Termine für den Tag:', error);
    termineListe.innerHTML = '<div style="color: #dc3545; padding: 8px;">❌ Fehler beim Laden</div>';
  }
}


// === ENDE TERMIN BEARBEITEN METHODEN ===

// === PHASEN-SYSTEM METHODEN ===

  AppClass.prototype.togglePhasenSection = function() {
  const checkbox = document.getElementById('mehrtaegigCheckbox');
  const phasenSection = document.getElementById('phasenSection');
  
  if (checkbox && phasenSection) {
    phasenSection.style.display = checkbox.checked ? 'block' : 'none';
    
    // Wenn aktiviert und keine Phasen vorhanden, füge erste Phase hinzu
    if (checkbox.checked && this.phasenData.length === 0) {
      this.addPhase();
    }
  }
};

  AppClass.prototype.addPhase = function() {
  this.phasenCounter++;
  const phasenListe = document.getElementById('phasenListe');
  const terminDatum = document.getElementById('datum').value || this.formatDateLocal(new Date());
  
  const phaseDiv = document.createElement('div');
  phaseDiv.className = 'phase-item';
  phaseDiv.id = `phase_${this.phasenCounter}`;
  phaseDiv.style.cssText = 'background: #fff; padding: 15px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #ddd;';
  
  phaseDiv.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <strong style="color: #e65100;">Phase ${this.phasenCounter}</strong>
      <button type="button" class="btn btn-delete-icon" onclick="app.removePhase(${this.phasenCounter})" title="Phase entfernen">🗑️</button>
    </div>
    <div class="form-row" style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px;">
      <div class="form-group" style="margin: 0;">
        <label style="font-size: 0.85em;">Arbeit/Bezeichnung:</label>
        <input type="text" id="phase_${this.phasenCounter}_bezeichnung" placeholder="z.B. Zerlegen (Karosserie)" required>
      </div>
      <div class="form-group" style="margin: 0;">
        <label style="font-size: 0.85em;">Datum:</label>
        <input type="date" id="phase_${this.phasenCounter}_datum" value="${terminDatum}" required>
      </div>
      <div class="form-group" style="margin: 0;">
        <label style="font-size: 0.85em;">Zeit (Stunden):</label>
        <input type="number" id="phase_${this.phasenCounter}_zeit" min="0.25" step="0.25" placeholder="z.B. 4" required>
      </div>
    </div>
    <div class="form-group" style="margin-top: 10px; margin-bottom: 0;">
      <label style="font-size: 0.85em;">Notizen (optional):</label>
      <input type="text" id="phase_${this.phasenCounter}_notizen" placeholder="z.B. Lackierer informieren">
    </div>
  `;
  
  phasenListe.appendChild(phaseDiv);
  
  // Speichere Phase-Referenz
  this.phasenData.push({
    id: this.phasenCounter,
    element: phaseDiv
  });
};

  AppClass.prototype.removePhase = function(phaseId) {
  const phaseElement = document.getElementById(`phase_${phaseId}`);
  if (phaseElement) {
    phaseElement.remove();
    this.phasenData = this.phasenData.filter(p => p.id !== phaseId);
  }
};

  AppClass.prototype.getPhasenFromForm = function() {
  const phasen = [];
  
  for (const phaseRef of this.phasenData) {
    const id = phaseRef.id;
    const bezeichnung = document.getElementById(`phase_${id}_bezeichnung`)?.value?.trim();
    const datum = document.getElementById(`phase_${id}_datum`)?.value;
    const zeitStunden = parseFloat(document.getElementById(`phase_${id}_zeit`)?.value) || 0;
    const notizen = document.getElementById(`phase_${id}_notizen`)?.value?.trim();
    
    if (bezeichnung && datum && zeitStunden > 0) {
      phasen.push({
        bezeichnung,
        datum,
        geschaetzte_zeit: Math.round(zeitStunden * 60), // In Minuten
        notizen
      });
    }
  }
  
  return phasen;
};

  AppClass.prototype.resetPhasen = function() {
  this.phasenCounter = 0;
  this.phasenData = [];
  const phasenListe = document.getElementById('phasenListe');
  if (phasenListe) {
    phasenListe.innerHTML = '';
  }
  const mehrtaegigCheckbox = document.getElementById('mehrtaegigCheckbox');
  if (mehrtaegigCheckbox) {
    mehrtaegigCheckbox.checked = false;
  }
  const phasenSection = document.getElementById('phasenSection');
  if (phasenSection) {
    phasenSection.style.display = 'none';
  }
  // Reset Folgetermine-Checkbox
  const folgetermineCheckbox = document.getElementById('erstelleFolgetermineCheckbox');
  if (folgetermineCheckbox) {
    folgetermineCheckbox.checked = true; // Standard: aktiviert
  }
}

// Erstellt Folgetermine aus den Phasen (außer der ersten Phase = Haupttermin);

  AppClass.prototype.erstelleFolgetermineAusPhasen = async function(hauptTermin, phasen, hauptTerminNr) {
  const ergebnisse = { erfolg: 0, fehler: 0, uebersprungen: 0 };
  
  // Lade existierende Termine für Duplikat-Prüfung
  let existierendeTermine = [];
  try {
    existierendeTermine = await TermineService.getAll();
  } catch (e) {
    console.warn('Konnte existierende Termine nicht laden für Duplikat-Prüfung:', e);
  }
  
  // Die erste Phase gehört zum Haupttermin, daher bei Index 1 starten
  for (let i = 1; i < phasen.length; i++) {
    const phase = phasen[i];
    
    // Folgetermin nur erstellen, wenn das Datum anders ist als der Haupttermin
    if (phase.datum === hauptTermin.datum) {
      continue; // Gleicher Tag - kein separater Termin nötig
    }
    
    // Prüfe ob bereits ein Folgetermin für diese Phase/Datum existiert
    const bereitsVorhanden = existierendeTermine.some(t => 
      t.kennzeichen === hauptTermin.kennzeichen &&
      t.datum === phase.datum &&
      t.arbeit && t.arbeit.includes(`[Folgetermin zu ${hauptTerminNr}]`)
    );
    
    if (bereitsVorhanden) {
      ergebnisse.uebersprungen++;
      continue;
    }
    
    try {
      const folgeTermin = {
        kunde_id: hauptTermin.kunde_id || null,
        kunde_name: hauptTermin.kunde_name,
        kunde_telefon: hauptTermin.kunde_telefon,
        kennzeichen: hauptTermin.kennzeichen,
        arbeit: `[Folgetermin zu ${hauptTerminNr}] ${phase.bezeichnung}`,
        umfang: phase.notizen || `Phase ${i + 1} von mehrtägiger Arbeit (${hauptTerminNr})`,
        geschaetzte_zeit: phase.geschaetzte_zeit,
        datum: phase.datum,
        abholung_typ: 'warten', // Folgetermin - Fahrzeug ist bereits da
        abholung_details: `Fortsetzung von ${hauptTerminNr}`,
        abholung_zeit: null,
        bring_zeit: null,
        kontakt_option: null,
        kilometerstand: null,
        ersatzauto: false,
        mitarbeiter_id: hauptTermin.mitarbeiter_id || null,
        dringlichkeit: hauptTermin.dringlichkeit || null,
        vin: hauptTermin.vin || null,
        fahrzeugtyp: hauptTermin.fahrzeugtyp || null
      };
      
      await TermineService.create(folgeTermin);
      ergebnisse.erfolg++;
    } catch (error) {
      console.error(`Fehler beim Erstellen des Folgetermins für Phase ${i + 1}:`, error);
      ergebnisse.fehler++;
    }
  }
  
  return ergebnisse;
}

// === ENDE PHASEN-SYSTEM METHODEN ===

// === SCHNELLZUGRIFF: Navigiert direkt zum "Neuer Termin" Formular ===;

  AppClass.prototype.navigateToNeuerTermin = function() {
  this.switchToTab('termine');

  setTimeout(() => {
    this.ensureTabContent('termine');
    const termineTab = this.getCachedElement('termine');
    if (!termineTab) return;

    const subTabsContainer = termineTab.querySelector('.sub-tabs');
    if (subTabsContainer) {
      this.setActiveSubTabInContainer(subTabsContainer, 'neuerTermin');
    } else if (window.switchSubTab) {
      window.switchSubTab('neuerTermin');
    }

    const kundenSuche = document.getElementById('terminNameSuche');
    if (kundenSuche) {
      kundenSuche.focus();
    }
  }, 0);
};

  AppClass.prototype.validateTerminEchtzeit = async function() {
  const datum = document.getElementById('datum')?.value;
  const arbeitText = document.getElementById('arbeitEingabe')?.value.trim();

  if (!datum || !arbeitText) {
    this.hideTerminWarnung();
    return;
  }

  const arbeitenListe = this.parseArbeiten(arbeitText);
  if (arbeitenListe.length === 0) {
    this.hideTerminWarnung();
    return;
  }

  const geschaetzteZeit = this.getGeschaetzteZeit(arbeitenListe);
  if (!geschaetzteZeit || geschaetzteZeit <= 0) {
    this.hideTerminWarnung();
    return;
  }

  try {
    const validation = await TermineService.checkAvailability(datum, geschaetzteZeit);
    this.showTerminWarnung(validation);
  } catch (error) {
    console.error('Fehler bei Echtzeit-Validierung:', error);
    this.hideTerminWarnung();
  }
};

  AppClass.prototype.showTerminVorschlaege = async function() {
  const datum = document.getElementById('datum')?.value;
  const arbeitText = document.getElementById('arbeitEingabe')?.value.trim();

  if (!datum) {
    alert('Bitte wählen Sie zuerst ein Datum.');
    return;
  }

  if (!arbeitText) {
    alert('Bitte geben Sie zuerst die Arbeiten ein.');
    return;
  }

  const arbeitenListe = this.parseArbeiten(arbeitText);
  if (arbeitenListe.length === 0) {
    alert('Bitte geben Sie mindestens eine Arbeit ein.');
    return;
  }

  const geschaetzteZeit = this.getGeschaetzteZeit(arbeitenListe);
  if (!geschaetzteZeit || geschaetzteZeit <= 0) {
    alert('Bitte geben Sie gültige Arbeiten ein.');
    return;
  }

  try {
    const vorschlaege = await TermineService.getVorschlaege(datum, geschaetzteZeit);
    this.displayTerminVorschlaege(vorschlaege);
  } catch (error) {
    console.error('Fehler beim Laden der Vorschläge:', error);
    alert('Fehler beim Laden der Terminvorschläge: ' + (error.message || 'Unbekannter Fehler'));
  }
};

  AppClass.prototype.displayTerminVorschlaege = function(vorschlaege) {
  const vorschlaegeListe = vorschlaege.vorschlaege || [];
  
  if (vorschlaegeListe.length === 0) {
    alert('Keine verfügbaren Termine gefunden für die nächsten 7 Tage.');
    return;
  }

  let message = 'Verfügbare Termine:\n\n';
  vorschlaegeListe.forEach((vorschlag, index) => {
    const datumFormatiert = new Date(vorschlag.datum + 'T00:00:00').toLocaleDateString('de-DE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const stunden = (vorschlag.verfuegbar_minuten / 60).toFixed(1);
    const empfehlung = vorschlag.empfohlen ? '⭐ EMPFOHLEN' : '';
    message += `${index + 1}. ${datumFormatiert}\n`;
    message += `   Verfügbar: ${stunden} Stunden (${vorschlag.auslastung_nach_termin}% Auslastung)\n`;
    message += `   ${empfehlung}\n\n`;
  });

  const auswahl = prompt(message + '\nGeben Sie die Nummer des gewünschten Termins ein (oder 0 zum Abbrechen):');
  const nummer = parseInt(auswahl, 10);

  if (nummer > 0 && nummer <= vorschlaegeListe.length) {
    const gewaehlterVorschlag = vorschlaegeListe[nummer - 1];
    document.getElementById('datum').value = gewaehlterVorschlag.datum;
    this.validateTerminEchtzeit();
    alert(`Datum auf ${new Date(gewaehlterVorschlag.datum + 'T00:00:00').toLocaleDateString('de-DE')} gesetzt.`);
  }
};

  AppClass.prototype.showTerminWarnung = function(validation) {
  let warnungElement = document.getElementById('terminWarnung');
  if (!warnungElement) {
    // Erstelle Warnungselement falls es nicht existiert
    const form = document.getElementById('terminForm');
    warnungElement = document.createElement('div');
    warnungElement.id = 'terminWarnung';
    warnungElement.style.cssText = 'padding: 10px; margin: 10px 0; border-radius: 4px; font-weight: bold;';
    form.insertBefore(warnungElement, form.firstChild);
  }

  if (validation.blockiert) {
    warnungElement.style.backgroundColor = '#ffebee';
    warnungElement.style.color = '#c62828';
    warnungElement.style.border = '2px solid #c62828';
    warnungElement.textContent = `⚠️ ${validation.warnung} (${validation.neue_auslastung_prozent}% Auslastung)`;
  } else if (validation.warnung) {
    warnungElement.style.backgroundColor = '#fff3e0';
    warnungElement.style.color = '#e65100';
    warnungElement.style.border = '2px solid #ff9800';
    warnungElement.textContent = `⚠️ ${validation.warnung} (${validation.neue_auslastung_prozent}% Auslastung)`;
  } else {
    this.hideTerminWarnung();
  }
};

  AppClass.prototype.hideTerminWarnung = function() {
  const warnungElement = document.getElementById('terminWarnung');
  if (warnungElement) {
    warnungElement.style.display = 'none';
  }
}


// ===== TERMIN VORSCHAU MIT COUNTDOWN =====;

  AppClass.prototype.showTerminVorschau = function(termin, kundeName, telefon, arbeitenListe, abholungTyp, ersatzauto) {
  const modal = document.getElementById('terminVorschauModal');
  if (!modal) {
    console.error('Termin Vorschau Modal nicht gefunden!');
    // Fallback: Direkt speichern ohne Vorschau
    this.executeTerminSave();
    return;
  }

  // Fülle die Vorschau-Daten
  document.getElementById('vorschauKunde').textContent = kundeName || 'Unbekannt';
  document.getElementById('vorschauTelefon').textContent = telefon || '-';
  
  // Bug 1 Fix: Datum robuster formatieren
  console.log('[DEBUG] showTerminVorschau - termin.datum:', termin.datum);
  let formatiertesDatum = '-';
  if (termin.datum && termin.datum.trim() !== '') {
    // Datum mit Zeitzone-sicherem Parsing
    const datumObj = new Date(termin.datum + 'T12:00:00');
    if (!isNaN(datumObj.getTime())) {
      formatiertesDatum = datumObj.toLocaleDateString('de-DE', { 
        weekday: 'long', 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      });
    }
  }
  console.log('[DEBUG] formatiertesDatum:', formatiertesDatum);
  document.getElementById('vorschauDatum').textContent = formatiertesDatum;
  
  document.getElementById('vorschauKennzeichen').textContent = termin.kennzeichen || '-';
  
  // Zeit formatieren
  const stunden = Math.floor(termin.geschaetzte_zeit / 60);
  const minuten = termin.geschaetzte_zeit % 60;
  const zeitText = stunden > 0 
    ? `${stunden} h ${minuten > 0 ? minuten + ' min' : ''}` 
    : `${minuten} min`;
  document.getElementById('vorschauZeit').textContent = zeitText;
  
  // Arbeiten als Liste darstellen
  const arbeitenHtml = arbeitenListe.map(a => `• ${a}`).join('<br>');
  document.getElementById('vorschauArbeiten').innerHTML = arbeitenHtml;
  
  // Abholungs-Typ
  const abholungTexte = {
    'bringen': 'Kunde bringt/holt selbst',
    'hol_bring': 'Hol- und Bringservice',
    'ruecksprache': 'Telefonische Rücksprache',
    'warten': 'Kunde wartet'
  };
  document.getElementById('vorschauAbholung').textContent = abholungTexte[abholungTyp] || abholungTyp;
  
  // Ersatzauto
  const ersatzautoRow = document.getElementById('vorschauErsatzautoRow');
  if (ersatzauto) {
    ersatzautoRow.style.display = 'flex';
    const tage = termin.ersatzauto_tage;
    document.getElementById('vorschauErsatzauto').textContent = tage ? `Ja (${tage} Tage)` : 'Ja';
  } else {
    ersatzautoRow.style.display = 'none';
  }

  // Modal anzeigen - sowohl display als auch active Klasse setzen
  modal.style.display = 'flex';
  // Kurze Verzögerung für Animation
  setTimeout(() => {
    modal.classList.add('active');
  }, 10);

  // Countdown starten
  this.startTerminCountdown();
};

  AppClass.prototype.startTerminCountdown = function() {
  // Vorherigen Countdown abbrechen falls vorhanden
  if (this.terminCountdownInterval) {
    clearInterval(this.terminCountdownInterval);
  }

  let sekunden = 5;
  const countdownZahl = document.getElementById('countdownZahl');
  const countdownBar = document.getElementById('countdownBar');

  // Initial setzen
  countdownZahl.textContent = sekunden;
  countdownBar.style.width = '100%';

  this.terminCountdownInterval = setInterval(() => {
    sekunden--;
    countdownZahl.textContent = sekunden;
    countdownBar.style.width = `${(sekunden / 5) * 100}%`;

    if (sekunden <= 0) {
      clearInterval(this.terminCountdownInterval);
      this.terminCountdownInterval = null;
      // Auto-Speichern
      this.executeTerminSave();
    }
  }, 1000);

  // Event-Listener für Buttons
  const abbrechenBtn = document.getElementById('vorschauAbbrechenBtn');
  const sofortBtn = document.getElementById('vorschauSofortSpeichernBtn');

  // Alte Listener entfernen
  abbrechenBtn.replaceWith(abbrechenBtn.cloneNode(true));
  sofortBtn.replaceWith(sofortBtn.cloneNode(true));

  // Neue Listener hinzufügen
  document.getElementById('vorschauAbbrechenBtn').addEventListener('click', () => {
    this.cancelTerminVorschau();
  });

  document.getElementById('vorschauSofortSpeichernBtn').addEventListener('click', () => {
    if (this.terminCountdownInterval) {
      clearInterval(this.terminCountdownInterval);
      this.terminCountdownInterval = null;
    }
    this.executeTerminSave();
  });

  // ESC-Taste zum Abbrechen
  this.terminVorschauEscHandler = (e) => {
    if (e.key === 'Escape') {
      this.cancelTerminVorschau();
    }
  };
  document.addEventListener('keydown', this.terminVorschauEscHandler);

  // Klick auf Hintergrund zum Abbrechen
  const modal = document.getElementById('terminVorschauModal');
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      this.cancelTerminVorschau();
    }
  });
};

  AppClass.prototype._zeigeWiederholungsDialog = async function(aehnlicheTermine, neuesTerminData) {
  return new Promise((resolve) => {
    // Alten Dialog entfernen
    const existing = document.getElementById('wiederholung-dialog');
    if (existing) existing.remove();

    const termineHtml = aehnlicheTermine.map(t => {
      const datumFormatiert = new Date(t.datum + 'T12:00:00').toLocaleDateString('de-DE');
      const arbeiten = t.arbeit && t.arbeit.length > 60 ? t.arbeit.substring(0, 60) + '…' : (t.arbeit || '—');
      return `<div style="padding:6px 8px;background:#f9fafb;border-radius:6px;margin-bottom:4px;font-size:12px;">
        <strong>${t.termin_nr || '?'}</strong> — ${datumFormatiert}<br>
        <span style="color:#6b7280;">${arbeiten}</span>
      </div>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'wiederholung-dialog';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';

    // XSS-Escaping für Kennzeichen
    const kennzeichenEscaped = (neuesTerminData.kennzeichen || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
        <h3 style="margin:0 0 8px;font-size:16px;color:#1f2937;">🔍 Ähnlicher Termin gefunden</h3>
        <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">
          Für <strong>${kennzeichenEscaped}</strong> gibt es ${aehnlicheTermine.length} Termin(e) in den nächsten/letzten 7 Tagen:
        </p>
        <div style="margin-bottom:16px;">${termineHtml}</div>
        <p style="margin:0 0 16px;font-size:13px;color:#374151;font-weight:500;">Was ist dieser neue Termin?</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button id="wdh-gleich" style="padding:10px;border-radius:8px;border:1px solid #93b4f5;background:#e8f0fe;color:#1a4a9b;font-weight:600;cursor:pointer;text-align:left;">
            ✏️ Gleicher Termin — bestehenden Termin bearbeiten
          </button>
          <button id="wdh-wiederholung" style="padding:10px;border-radius:8px;border:1px solid #f0a0a0;background:#fce8e8;color:#8a2020;font-weight:600;cursor:pointer;text-align:left;">
            🔁 Wiederholungstermin — neu anlegen (rot markiert)
          </button>
          <button id="wdh-kein" style="padding:10px;border-radius:8px;border:1px solid #d0d5dd;background:#f9fafb;color:#374151;cursor:pointer;text-align:left;">
            ➡️ Kein Zusammenhang — normal speichern
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#wdh-gleich').addEventListener('click', () => {
      overlay.remove();
      const ersterTreffer = aehnlicheTermine[0];
      resolve({ aktion: 'gleich', terminId: ersterTreffer.id });
    });

    overlay.querySelector('#wdh-wiederholung').addEventListener('click', () => {
      overlay.remove();
      resolve({ aktion: 'wiederholung' });
    });

    overlay.querySelector('#wdh-kein').addEventListener('click', () => {
      overlay.remove();
      resolve({ aktion: 'kein' });
    });
  });
};

  AppClass.prototype.cancelTerminVorschau = function() {
  // Countdown stoppen
  if (this.terminCountdownInterval) {
    clearInterval(this.terminCountdownInterval);
    this.terminCountdownInterval = null;
  }

  // ESC-Handler entfernen
  if (this.terminVorschauEscHandler) {
    document.removeEventListener('keydown', this.terminVorschauEscHandler);
    this.terminVorschauEscHandler = null;
  }

  // Modal schließen mit Animation
  const modal = document.getElementById('terminVorschauModal');
  if (modal) {
    modal.classList.remove('active');
    // Warte auf Animation, dann verstecken
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  }

  // Pending-Daten löschen
  this.pendingTerminData = null;
};

  AppClass.prototype.executeTerminSave = async function() {
  // ESC-Handler entfernen falls vorhanden
  if (this.terminVorschauEscHandler) {
    document.removeEventListener('keydown', this.terminVorschauEscHandler);
    this.terminVorschauEscHandler = null;
  }

  // Modal schließen
  const modal = document.getElementById('terminVorschauModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }

  const data = this.pendingTerminData;
  if (!data) {
    console.error('Keine Termin-Daten vorhanden');
    return;
  }

  let { termin, arbeitenListe, resolvedKundeId, resolvedKundeName, kundeTelefon } = data;

  // Falls neuer Kunde, jetzt anlegen
  if (!resolvedKundeId && resolvedKundeName) {
    try {
      const created = await KundenService.create({ name: resolvedKundeName, telefon: kundeTelefon || null });
      resolvedKundeId = created.id;
      this.loadKunden(); // Cache auffrischen
    } catch (err) {
      console.error('Fehler beim Anlegen des Kunden:', err);
    }
  }

  if (resolvedKundeId) {
    termin.kunde_id = resolvedKundeId;
  } else if (resolvedKundeName) {
    termin.kunde_name = resolvedKundeName;
  }
  if (kundeTelefon) {
    termin.kunde_telefon = kundeTelefon;
  }

  try {
    // Prüfe auf Duplikate (gleicher Kunde am gleichen Tag) – nur wenn Duplikat-Erkennung aktiviert
    if (document.getElementById('duplikatErkennungEnabled')?.checked !== false) {
    const duplikatCheck = await TermineService.checkDuplikate(
      termin.datum,
      resolvedKundeId,
      resolvedKundeName
    );

    if (duplikatCheck.hatDuplikate) {
      // Formatiere die bestehenden Termine für die Anzeige
      const termineInfo = duplikatCheck.termine.map(t => {
        const zeitInfo = t.bring_zeit ? ` um ${t.bring_zeit} Uhr` : '';
        const arbeiten = t.arbeit.length > 50 ? t.arbeit.substring(0, 50) + '...' : t.arbeit;
        return `• ${t.termin_nr}${zeitInfo}: ${arbeiten} (${t.kennzeichen || 'ohne Kennzeichen'})`;
      }).join('\n');

      const bestaetigung = confirm(
        `⚠️ Achtung: Es gibt bereits ${duplikatCheck.anzahl} Termin(e) für diesen Kunden am ${new Date(termin.datum + 'T12:00:00').toLocaleDateString('de-DE')}:\n\n` +
        `${termineInfo}\n\n` +
        `Möchten Sie trotzdem einen weiteren Termin anlegen?`
      );
      
      if (!bestaetigung) {
        this.pendingTerminData = null;
        return;
      }
    }
    } // Ende Duplikat-Erkennung Guard

    // Wiederholungstermin-Erkennung (gleiches Kennzeichen, ±7 Tage)
    if (termin.kennzeichen) {
      try {
        const aehnlichCheck = await TermineService.getAehnliche(termin.kennzeichen, termin.datum);
        if (aehnlichCheck.hatAehnliche) {
          const dialogResult = await this._zeigeWiederholungsDialog(aehnlichCheck.termine, termin);
          if (dialogResult.aktion === 'gleich') {
            // Bestehenden Termin zur Bearbeitung öffnen
            this.showTerminDetails(dialogResult.terminId);
            this.pendingTerminData = null;
            return;
          } else if (dialogResult.aktion === 'wiederholung') {
            termin.ist_wiederholung = 1;
          }
          // Bei 'kein': termin.ist_wiederholung bleibt undefined/0 → normaler Termin
        }
      } catch (aehnlichErr) {
        console.warn('[Wiederholungs-Check] Fehler (ignoriert):', aehnlichErr);
      }
    }

    // Validiere Termin vor dem Erstellen
    const validation = await TermineService.validate({
      datum: termin.datum,
      geschaetzte_zeit: termin.geschaetzte_zeit
    });

    if (validation.blockiert) {
      const bestaetigung = confirm(
        `${validation.warnung}\n\n` +
        `Aktuelle Auslastung würde auf ${validation.neue_auslastung_prozent}% steigen.\n` +
        `Möchten Sie den Termin trotzdem erstellen?`
      );
      if (!bestaetigung) {
        this.pendingTerminData = null;
        return;
      }
    } else if (validation.warnung) {
      const bestaetigung = confirm(
        `${validation.warnung}\n\n` +
        `Aktuelle Auslastung würde auf ${validation.neue_auslastung_prozent}% steigen.\n` +
        `Möchten Sie fortfahren?`
      );
      if (!bestaetigung) {
        this.pendingTerminData = null;
        return;
      }
    }

    await this.ensureArbeitenExistieren(arbeitenListe, termin.geschaetzte_zeit);
    
    // Prüfe ob Teile bestellt werden müssen
    const teileBestellenChecked = document.getElementById('teileBestellenCheckbox')?.checked;
    if (teileBestellenChecked && arbeitenListe.length > 0) {
      // Setze teile_status für alle Arbeiten auf "bestellen"
      const arbeitszeitenDetails = {};
      for (const arbeit of arbeitenListe) {
        arbeitszeitenDetails[arbeit] = {
          teile_status: 'bestellen'
        };
      }
      termin.arbeitszeiten_details = JSON.stringify(arbeitszeitenDetails);
    }
    
    const createdTermin = await TermineService.create(termin);
    
    // Wenn Phasen aktiviert sind, speichere diese und erstelle ggf. Folgetermine
    const mehrtaegigCheckbox = document.getElementById('mehrtaegigCheckbox');
    if (mehrtaegigCheckbox && mehrtaegigCheckbox.checked) {
      const phasen = this.getPhasenFromForm();
      const erstelleFolgetermine = document.getElementById('erstelleFolgetermineCheckbox')?.checked;
      
      if (phasen.length > 0 && createdTermin && createdTermin.id) {
        try {
          // Speichere Phasen für den Haupttermin
          await PhasenService.syncPhasen(createdTermin.id, phasen);
          
          // Wenn Folgetermine erstellt werden sollen
          if (erstelleFolgetermine && phasen.length > 1) {
            const folgetermineErgebnisse = await this.erstelleFolgetermineAusPhasen(
              termin, 
              phasen, 
              createdTermin.terminNr
            );
            
            if (folgetermineErgebnisse.erfolg > 0) {
              alert(`Termin erfolgreich erstellt!\n\n` +
                    `✅ Haupttermin: ${createdTermin.terminNr}\n` +
                    `📅 ${folgetermineErgebnisse.erfolg} Folgetermin(e) erstellt für weitere Phasen.`);
            } else {
              alert('Termin erfolgreich erstellt!');
            }
          } else {
            alert('Termin erfolgreich erstellt!');
          }
        } catch (phasenError) {
          console.error('Fehler beim Speichern der Phasen:', phasenError);
          alert('Termin erstellt, aber Phasen konnten nicht gespeichert werden: ' + phasenError.message);
        }
      } else {
        alert('Termin erfolgreich erstellt!');
      }
    } else {
      alert('Termin erfolgreich erstellt!');
    }

    // Kalender-Auslastungs-Cache leeren, damit neue Daten geladen werden
    this.kalenderAuslastungCache = {};

    // Formular komplett zurücksetzen
    this.resetTerminForm();
    this.resetPhasen();

    this.loadTermine();
    this.loadTermineCache(); // Cache für Kennzeichen-Suche aktualisieren
    this.loadDashboard();
    this.loadArbeitszeiten();
    this.loadTermineZeiten();
    
    // Pending-Daten löschen
    this.pendingTerminData = null;
  } catch (error) {
    console.error('Fehler beim Erstellen des Termins:', error);
    const kundeInfo = resolvedKundeName ? ` (Kunde: ${resolvedKundeName})` : '';
    alert(`Fehler beim Erstellen des Kundentermins${kundeInfo}:\n${error.message || 'Unbekannter Fehler'}`);
    this.pendingTerminData = null;
  }
}


// ========================================
// SCHNELLER TERMIN (ohne Kennzeichen)
// ========================================


// ========================================
// WARTENDE AKTIONEN FUNKTIONEN
// ========================================;
}
