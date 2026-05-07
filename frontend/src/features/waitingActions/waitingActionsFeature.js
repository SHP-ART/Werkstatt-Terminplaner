export function installWaitingActionsFeature(AppClass) {
  AppClass.prototype.setupWartendeAktionenKundensuche = function() {
  const nameSuche = document.getElementById('wartendNameSuche');
  const kzBezirk = document.getElementById('wartendKzBezirk');
  const kzBuchstaben = document.getElementById('wartendKzBuchstaben');
  const kzNummer = document.getElementById('wartendKzNummer');

  this.bindEventListenerOnce(nameSuche, 'input', () => this.handleWartendNameSuche(), 'WartendNameInput');
  this.bindEventListenerOnce(nameSuche, 'keydown', (e) => this.handleWartendSucheKeydown(e, 'name'), 'WartendNameKeydown');
  this.bindEventListenerOnce(nameSuche, 'blur', () => setTimeout(() => this.hideWartendVorschlaege('name'), 350), 'WartendNameBlur');

  // Kennzeichen-Suche mit 3 Feldern
  const kzFelder = [kzBezirk, kzBuchstaben, kzNummer];
  const kzFeldIds = ['wartendKzBezirk', 'wartendKzBuchstaben', 'wartendKzNummer'];
  
  kzFelder.forEach((feld, index) => {
    const fieldKey = kzFeldIds[index];
    this.bindEventListenerOnce(feld, 'input', (e) => {
      e.target.value = e.target.value.toUpperCase();
      this.handleWartendKennzeichenSuche();
      if (kzFeldIds[index] === 'wartendKzBezirk' && e.target.value.length >= 3) {
        document.getElementById('wartendKzBuchstaben')?.focus();
      } else if (kzFeldIds[index] === 'wartendKzBuchstaben' && e.target.value.length >= 2) {
        document.getElementById('wartendKzNummer')?.focus();
      }
    }, `WartendKzInput${fieldKey}`);
    this.bindEventListenerOnce(feld, 'keydown', (e) => this.handleWartendSucheKeydown(e, 'kennzeichen'), `WartendKzKeydown${fieldKey}`);
    this.bindEventListenerOnce(feld, 'blur', () => {
      setTimeout(() => {
        const aktivesElement = document.activeElement;
        const aktivesId = aktivesElement ? aktivesElement.id : '';
        if (!kzFeldIds.includes(aktivesId)) {
          this.hideWartendVorschlaege('kennzeichen');
        }
      }, 100);
    }, `WartendKzBlur${fieldKey}`);
  });
}

// Namenssuche für Wartende Aktionen (nutzt Cache wie Hauptformular);

  AppClass.prototype.handleWartendNameSuche = function() {
  const eingabe = document.getElementById('wartendNameSuche')?.value.trim() || '';
  const vorschlaegeDiv = document.getElementById('wartendNameVorschlaege');
  const statusBadge = document.getElementById('wartendKundeStatusAnzeige');
  
  if (!vorschlaegeDiv) return;
  
  // Status-Badge aktualisieren (für wartende Aktionen)
  this.updateWartendKundeStatusBadge(eingabe, statusBadge);
  
  if (eingabe.length < 2) {
    vorschlaegeDiv.classList.remove('aktiv');
    vorschlaegeDiv.innerHTML = '';
    return;
  }
  
  const lower = eingabe.toLowerCase();
  
  // Suche in Kunden nach Name (nutzt Cache)
  const treffer = (this.kundenCache || []).filter(kunde => 
    kunde.name && kunde.name.toLowerCase().includes(lower)
  ).slice(0, 10);
  
  if (treffer.length === 0) {
    vorschlaegeDiv.innerHTML = '<div class="keine-vorschlaege">Kein Kunde gefunden - wird als neuer Kunde angelegt</div>';
    vorschlaegeDiv.classList.add('aktiv');
    return;
  }
  
  vorschlaegeDiv.innerHTML = treffer.map((kunde, idx) => `
    <div class="vorschlag-item" data-index="${idx}" onmousedown="event.preventDefault(); app.selectWartendeKundeVorschlag(${kunde.id})">
      <div>
        <span class="vorschlag-name">${this.highlightMatch(kunde.name, eingabe)}</span>
        ${kunde.telefon ? `<span class="vorschlag-telefon"> · ${kunde.telefon}</span>` : ''}
      </div>
      ${kunde.kennzeichen ? `<span class="vorschlag-kennzeichen">${kunde.kennzeichen}</span>` : ''}
    </div>
  `).join('');
  
  vorschlaegeDiv.classList.add('aktiv');
  this.wartendVorschlaegeIndex = -1;
  this.wartendVorschlaege = treffer;
}

// Status-Badge für Neuer Kunde bei Wartende Aktionen;

  AppClass.prototype.updateWartendKundeStatusBadge = function(eingabe, statusBadge) {
  if (!statusBadge) return;
  
  if (!eingabe || eingabe.length < 2) {
    statusBadge.style.display = 'none';
    // Kennzeichen-Pflicht zurücksetzen
    this.setWartendKennzeichenPflicht(false);
    return;
  }
  
  const lower = eingabe.toLowerCase();
  const kundeId = document.getElementById('wartend_kunde_id')?.value;
  
  // Prüfe ob exakter Kunde ausgewählt wurde
  if (kundeId) {
    statusBadge.textContent = '✓ Kunde ausgewählt';
    statusBadge.className = 'kunde-status-badge gefunden';
    statusBadge.style.display = 'inline-block';
    // Bekannter Kunde - Kennzeichen nicht Pflicht
    this.setWartendKennzeichenPflicht(false);
    return;
  }
  
  // Prüfe ob Kunde mit genau diesem Namen existiert
  const exakterTreffer = (this.kundenCache || []).find(kunde => 
    kunde.name && kunde.name.toLowerCase() === lower
  );
  
  if (exakterTreffer) {
    statusBadge.textContent = '✓ Bekannter Kunde';
    statusBadge.className = 'kunde-status-badge gefunden';
    statusBadge.style.display = 'inline-block';
    // Bekannter Kunde - Kennzeichen nicht Pflicht
    this.setWartendKennzeichenPflicht(false);
  } else {
    statusBadge.textContent = '+ Neuer Kunde';
    statusBadge.className = 'kunde-status-badge neuer-kunde';
    statusBadge.style.display = 'inline-block';
    // Neuer Kunde - Kennzeichen ist Pflichtfeld
    this.setWartendKennzeichenPflicht(true);
  }
}

// Markiert Kennzeichen-Feld bei Wartende Aktionen als Pflichtfeld;

  AppClass.prototype.setWartendKennzeichenPflicht = function(isPflicht) {
  const kennzeichenFeld = document.getElementById('wartend_kennzeichen');
  // Label ist im Parent-div .form-group
  const label = kennzeichenFeld?.parentElement?.querySelector('label');
  
  if (isPflicht) {
    // Feld rot markieren
    if (kennzeichenFeld) {
      kennzeichenFeld.style.borderColor = '#e53935';
      kennzeichenFeld.style.backgroundColor = '#ffebee';
    }
    // Label mit Pflichtfeld-Marker versehen (falls noch nicht vorhanden)
    if (label && !label.innerHTML.includes('style="color:#e53935"')) {
      label.innerHTML = '🚗 Kennzeichen: <span style="color:#e53935;font-weight:bold">*</span>';
    }
  } else {
    // Feld zurücksetzen
    if (kennzeichenFeld) {
      kennzeichenFeld.style.borderColor = '';
      kennzeichenFeld.style.backgroundColor = '';
    }
    // Label zurücksetzen
    if (label) {
      label.innerHTML = '🚗 Kennzeichen: *';
    }
  }
}

// Kennzeichen-Suche für Wartende Aktionen (nutzt Cache wie Hauptformular);

  AppClass.prototype.handleWartendKennzeichenSuche = function() {
  const bezirk = document.getElementById('wartendKzBezirk')?.value.trim().toUpperCase() || '';
  const buchstaben = document.getElementById('wartendKzBuchstaben')?.value.trim().toUpperCase() || '';
  const nummer = document.getElementById('wartendKzNummer')?.value.trim().toUpperCase() || '';
  const vorschlaegeDiv = document.getElementById('wartendKzVorschlaege');
  
  if (!vorschlaegeDiv) return;
  
  // Mindestens ein Feld muss ausgefüllt sein
  if (!bezirk && !buchstaben && !nummer) {
    vorschlaegeDiv.classList.remove('aktiv');
    vorschlaegeDiv.innerHTML = '';
    return;
  }
  
  // Sammle alle Kennzeichen aus Kunden und Terminen (gleiche Logik wie Hauptformular)
  const alleKennzeichen = new Map();
  
  // Aus Kundentabelle
  (this.kundenCache || []).forEach(kunde => {
    if (kunde.kennzeichen) {
      const kzNormalized = this.normalizeKennzeichen(kunde.kennzeichen);
      if (!alleKennzeichen.has(kzNormalized)) {
        alleKennzeichen.set(kzNormalized, {
          kennzeichen: kunde.kennzeichen,
          kundeId: kunde.id,
          kundeName: kunde.name,
          kundeTelefon: kunde.telefon,
          fahrzeugtyp: kunde.fahrzeugtyp
        });
      }
    }
  });
  
  // Aus Terminen (falls Kennzeichen nicht in Kunden)
  (this.termineCache || []).forEach(termin => {
    if (termin.kennzeichen) {
      const kzNormalized = this.normalizeKennzeichen(termin.kennzeichen);
      if (!alleKennzeichen.has(kzNormalized)) {
        alleKennzeichen.set(kzNormalized, {
          kennzeichen: termin.kennzeichen,
          kundeId: termin.kunde_id,
          kundeName: termin.kunde_name,
          kundeTelefon: null,
          fahrzeugtyp: null
        });
      }
    }
  });
  
  // Filtern nach den eingegebenen Teilen (flexible Suche)
  const treffer = [];
  alleKennzeichen.forEach((data) => {
    const kzParts = this.parseKennzeichen(data.kennzeichen);
    const normalized = this.normalizeKennzeichen(data.kennzeichen);
    
    let match = false;
    
    // Flexible Suche: Kombiniere alle eingegebenen Teile
    const suchMuster = (bezirk || '') + (buchstaben || '') + (nummer || '');
    
    if (suchMuster) {
      // Prüfe ob das Suchmuster im normalisierten Kennzeichen vorkommt
      match = normalized.includes(suchMuster);
      
      // Zusätzliche Prüfung: Einzelne Felder müssen auch passen
      if (match) {
        // Wenn separate Felder genutzt werden, prüfe auch Teilmatches
        if (bezirk && buchstaben) {
          // Beide Felder gefüllt: Bezirk muss beginnen, Buchstaben passen
          match = kzParts.bezirk.startsWith(bezirk) || normalized.startsWith(suchMuster);
        }
      }
    }
    
    if (match) {
      treffer.push(data);
    }
  });
  
  if (treffer.length === 0) {
    vorschlaegeDiv.innerHTML = '<div class="keine-vorschlaege">Kein Kennzeichen gefunden</div>';
    vorschlaegeDiv.classList.add('aktiv');
    return;
  }
  
  // Sortieren: Exakte Treffer zuerst
  treffer.sort((a, b) => {
    const aExakt = this.parseKennzeichen(a.kennzeichen);
    const bExakt = this.parseKennzeichen(b.kennzeichen);
    const aScore = (aExakt.bezirk === bezirk ? 3 : 0) + (aExakt.buchstaben === buchstaben ? 2 : 0) + (aExakt.nummer === nummer ? 1 : 0);
    const bScore = (bExakt.bezirk === bezirk ? 3 : 0) + (bExakt.buchstaben === buchstaben ? 2 : 0) + (bExakt.nummer === nummer ? 1 : 0);
    return bScore - aScore;
  });
  
  vorschlaegeDiv.innerHTML = treffer.slice(0, 10).map((data, idx) => {
    return `
      <div class="vorschlag-item" data-index="${idx}" onmousedown="event.preventDefault(); app.selectWartendeKennzeichenVorschlag(${data.kundeId || 'null'}, '${this.escapeHtml(data.kennzeichen)}', '${this.escapeHtml(data.kundeName || '')}', '${this.escapeHtml(data.kundeTelefon || '')}', '${this.escapeHtml(data.fahrzeugtyp || '')}')">
        <div>
          <span class="vorschlag-kennzeichen" style="margin-right: 10px;">${this.formatKennzeichenHighlight(data.kennzeichen, bezirk, buchstaben, nummer)}</span>
          <span class="vorschlag-name">${data.kundeName || 'Unbekannter Kunde'}</span>
        </div>
        ${data.fahrzeugtyp ? `<span class="vorschlag-telefon">${data.fahrzeugtyp}</span>` : ''}
      </div>
    `;
  }).join('');
  
  vorschlaegeDiv.classList.add('aktiv');
  this.wartendKzVorschlaegeIndex = -1;
  this.wartendKzVorschlaege = treffer.slice(0, 10);
}

// Vorschlag auswählen (Name);

  AppClass.prototype.selectWartendeKundeVorschlag = async function(kundeId) {
  const kunde = (this.kundenCache || []).find(k => k.id === kundeId);
  if (!kunde) return;
  
  // Fahrzeuge direkt vom Backend laden (inkl. aller Termine-Kennzeichen)
  try {
    const fahrzeuge = await KundenService.getFahrzeuge(kundeId);
    
    // Modal immer anzeigen (auch bei nur 1 Fahrzeug), damit neue angelegt werden können
    if (fahrzeuge.length >= 1) {
      this.showWartendeFahrzeugAuswahlModal(kunde, fahrzeuge);
      this.hideWartendVorschlaege('name');
      return;
    }
    
    // Kein Fahrzeug vorhanden - direkt auswählen (Kennzeichen muss manuell eingegeben werden)
    const fahrzeug = null;
    this.selectWartendeKunde(kundeId, kunde.name, kunde.telefon, 
      kunde.kennzeichen, 
      kunde.fahrzeugtyp);
    this.hideWartendVorschlaege('name');
  } catch (error) {
    console.error('Fehler beim Laden der Fahrzeuge:', error);
    // Fallback: Nur den Kunden ohne Fahrzeugauswahl übernehmen
    this.selectWartendeKunde(kundeId, kunde.name, kunde.telefon, kunde.kennzeichen, kunde.fahrzeugtyp);
    this.hideWartendVorschlaege('name');
  }
}

// Fahrzeug-Auswahl Modal für Wartende Aktionen;

  AppClass.prototype.showWartendeFahrzeugAuswahlModal = function(kunde, fahrzeuge) {
  const modal = document.getElementById('fahrzeugAuswahlModal');
  const kundeInfo = document.getElementById('fahrzeugAuswahlKunde');
  const liste = document.getElementById('fahrzeugAuswahlListe');
  
  kundeInfo.innerHTML = `<strong>${this._escapeHtml(kunde.name)}</strong>${kunde.telefon ? ` · ${this._escapeHtml(kunde.telefon)}` : ''}<br>
    <span style="font-size: 0.9em;">Dieser Kunde hat ${fahrzeuge.length} Fahrzeuge:</span>`;

  liste.innerHTML = fahrzeuge.map((fz, idx) => {
    const letzterTermin = fz.letzter_termin || fz.letzterTermin;
    const letzterKmStand = fz.letzter_km_stand || fz.letzterKmStand;

    return `
    <div class="fahrzeug-auswahl-item" onclick="app.selectWartendeFahrzeugFromModal(${kunde.id}, ${idx})" style="
      padding: 15px;
      margin-bottom: 10px;
      background: ${idx === 0 ? '#e8f5e9' : '#f8f9fa'};
      border-radius: 8px;
      border: 2px solid ${idx === 0 ? '#4caf50' : '#dee2e6'};
      cursor: pointer;
      transition: all 0.2s;
    " onmouseover="this.style.borderColor='#4a90e2'; this.style.background='#e3f2fd';"
       onmouseout="this.style.borderColor='${idx === 0 ? '#4caf50' : '#dee2e6'}'; this.style.background='${idx === 0 ? '#e8f5e9' : '#f8f9fa'}';">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="font-size: 1.2em; font-weight: bold;">🚗 ${this._escapeHtml(fz.kennzeichen)}</span>
          ${fz.fahrzeugtyp ? `<span style="color: #666; margin-left: 10px;">${this._escapeHtml(fz.fahrzeugtyp)}</span>` : ''}
        </div>
        ${idx === 0 ? '<span style="background: #4caf50; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;">Zuletzt</span>' : ''}
      </div>
      ${fz.vin ? `<div style="font-size: 0.85em; color: #888; margin-top: 5px;">VIN: ${this._escapeHtml(fz.vin)}</div>` : ''}
      <div style="font-size: 0.85em; color: #666; margin-top: 5px;">
        ${letzterTermin ? `Letzter Termin: ${this.formatDatum(letzterTermin)}` : 'Aus Kundenstamm'}
        ${letzterKmStand ? ` · ${Number(letzterKmStand).toLocaleString('de-DE')} km` : ''}
      </div>
    </div>
  `}).join('');
  
  // Speichere die Daten für späteren Zugriff (für Wartende Aktionen)
  this.wartendeFahrzeugAuswahlData = { kunde, fahrzeuge };
  
  modal.style.display = 'block';
}

// Fahrzeug aus Modal für Wartende Aktionen auswählen;

  AppClass.prototype.selectWartendeFahrzeugFromModal = function(kundeId, fahrzeugIndex) {
  if (!this.wartendeFahrzeugAuswahlData) return;
  
  const { kunde, fahrzeuge } = this.wartendeFahrzeugAuswahlData;
  const fahrzeug = fahrzeuge[fahrzeugIndex];
  
  this.selectWartendeKunde(kundeId, kunde.name, kunde.telefon, fahrzeug.kennzeichen, fahrzeug.fahrzeugtyp);
  
  // Modal schließen
  document.getElementById('fahrzeugAuswahlModal').style.display = 'none';
  this.wartendeFahrzeugAuswahlData = null;
}

// Vorschlag auswählen (Kennzeichen);

  AppClass.prototype.selectWartendeKennzeichenVorschlag = function(kundeId, kennzeichen, kundeName, kundeTelefon, fahrzeugtyp) {
  this.selectWartendeKunde(kundeId, kundeName, kundeTelefon, kennzeichen, fahrzeugtyp);
  this.hideWartendVorschlaege('kennzeichen');
};

  AppClass.prototype.selectWartendeKunde = function(kundeId, name, telefon, kennzeichen, fahrzeugtyp) {
  document.getElementById('wartend_kunde_id').value = kundeId || '';
  document.getElementById('wartendKundeName').textContent = name || 'Unbekannt';
  document.getElementById('wartendKundeTelefon').textContent = telefon ? `📞 ${telefon}` : '';
  document.getElementById('wartendGefundenerKunde').style.display = 'block';
  
  if (kennzeichen) {
    document.getElementById('wartend_kennzeichen').value = kennzeichen;
  }
  if (fahrzeugtyp) {
    document.getElementById('wartend_fahrzeugtyp').value = fahrzeugtyp;
  }

  // Suchfelder zurücksetzen
  document.getElementById('wartendNameSuche').value = '';
  document.getElementById('wartendKzBezirk').value = '';
  document.getElementById('wartendKzBuchstaben').value = '';
  document.getElementById('wartendKzNummer').value = '';
  
  // Status-Badge zurücksetzen/verstecken da jetzt ein Kunde ausgewählt ist
  const statusBadge = document.getElementById('wartendKundeStatusAnzeige');
  if (statusBadge) {
    statusBadge.style.display = 'none';
  }
  
  // Kennzeichen-Pflicht zurücksetzen (bekannter Kunde ausgewählt)
  this.setWartendKennzeichenPflicht(false);
};

  AppClass.prototype.hideWartendVorschlaege = function(typ) {
  if (typ === 'name') {
    const div = document.getElementById('wartendNameVorschlaege');
    if (div) {
      div.classList.remove('aktiv');
      div.innerHTML = '';
    }
  } else if (typ === 'kennzeichen') {
    const div = document.getElementById('wartendKzVorschlaege');
    if (div) {
      div.classList.remove('aktiv');
      div.innerHTML = '';
    }
  }
};

  AppClass.prototype.handleWartendSucheKeydown = function(e, typ) {
  const vorschlaegeDiv = typ === 'name' 
    ? document.getElementById('wartendNameVorschlaege')
    : document.getElementById('wartendKzVorschlaege');
  
  if (!vorschlaegeDiv || !vorschlaegeDiv.classList.contains('aktiv')) return;
  
  const items = vorschlaegeDiv.querySelectorAll('.vorschlag-item');
  const currentIndex = typ === 'name' ? this.wartendVorschlaegeIndex : this.wartendKzVorschlaegeIndex;
  
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const newIndex = Math.min(currentIndex + 1, items.length - 1);
    this.updateWartendVorschlagHighlight(items, newIndex, typ);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const newIndex = Math.max(currentIndex - 1, 0);
    this.updateWartendVorschlagHighlight(items, newIndex, typ);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (currentIndex >= 0 && items[currentIndex]) {
      items[currentIndex].click();
    }
  } else if (e.key === 'Escape') {
    this.hideWartendVorschlaege(typ);
  }
};

  AppClass.prototype.updateWartendVorschlagHighlight = function(items, newIndex, typ) {
  items.forEach((item, i) => {
    item.classList.toggle('highlighted', i === newIndex);
  });
  if (typ === 'name') {
    this.wartendVorschlaegeIndex = newIndex;
  } else {
    this.wartendKzVorschlaegeIndex = newIndex;
  }
}

// Schnellauswahl für Wartende Aktionen Grund;

  AppClass.prototype.setWartendGrund = function(grund) {
  const textarea = document.getElementById('wartend_beschreibung');
  if (textarea) {
    // Wenn schon Text vorhanden, auf neue Zeile anhängen
    if (textarea.value.trim()) {
      textarea.value = textarea.value.trim() + '\n' + grund;
    } else {
      textarea.value = grund;
    }
    textarea.focus();
  }
};

  AppClass.prototype.handleWartendeAktionSubmit = async function(e) {
  e.preventDefault();

  let kundeId = document.getElementById('wartend_kunde_id').value;
  const kennzeichen = document.getElementById('wartend_kennzeichen').value.trim();
  const fahrzeugtyp = document.getElementById('wartend_fahrzeugtyp').value.trim();
  const beschreibung = document.getElementById('wartend_beschreibung').value.trim();
  const zeitStunden = parseFloat(document.getElementById('wartend_zeit').value) || 1;
  const notizen = document.getElementById('wartend_notizen').value.trim();
  const teileStatus = document.getElementById('wartend_teile_status')?.value || '';
  const kundeNameEingabe = document.getElementById('wartendNameSuche')?.value.trim() || '';
  const prioritaet = document.querySelector('input[name="wartendPrioritaet"]:checked')?.value || 'mittel';

  if (!kennzeichen || !beschreibung) {
    alert('Bitte Kennzeichen und Beschreibung ausfüllen.');
    return;
  }

  // Kundenname ermitteln
  let kundeName = 'Unbekannt';
  if (kundeId) {
    kundeName = document.getElementById('wartendKundeName').textContent || 'Unbekannt';
  } else if (kundeNameEingabe) {
    // Prüfe ob Kunde existiert oder neu angelegt werden soll
    const existierenderKunde = (this.kundenCache || []).find(k => 
      k.name && k.name.toLowerCase() === kundeNameEingabe.toLowerCase()
    );
    
    if (existierenderKunde) {
      kundeId = existierenderKunde.id;
      kundeName = existierenderKunde.name;
    } else {
      // Neuen Kunden anlegen
      try {
        const created = await KundenService.create({ name: kundeNameEingabe, telefon: null });
        kundeId = created.id;
        kundeName = kundeNameEingabe;
        this.loadKunden(); // Cache auffrischen
        console.log(`Neuer Kunde angelegt: ${kundeName} (ID: ${kundeId})`);
      } catch (err) {
        console.error('Fehler beim Anlegen des Kunden:', err);
        // Fahre trotzdem fort, aber ohne kunde_id
        kundeName = kundeNameEingabe;
      }
    }
  }

  // Arbeitszeiten mit Teile-Status erstellen
  let arbeitszeitenDetails = {};
  if (teileStatus) {
    arbeitszeitenDetails[beschreibung] = {
      zeit: Math.round(zeitStunden * 60),
      teile_status: teileStatus
    };
  }

  const termin = {
    kunde_id: kundeId || null,
    kunde_name: kundeName,
    kunde_telefon: null,
    kennzeichen: kennzeichen,
    fahrzeugtyp: fahrzeugtyp || null,
    arbeit: beschreibung,
    umfang: notizen,
    geschaetzte_zeit: Math.round(zeitStunden * 60),
    datum: '9999-12-31', // Platzhalter-Datum für schwebende Termine (DB erfordert NOT NULL)
    ist_schwebend: 1,
    abholung_typ: 'warten',
    abholung_details: 'Wartende Aktion',
    status: 'wartend',
    arbeitszeiten_details: teileStatus ? JSON.stringify(arbeitszeitenDetails) : null,
    schwebend_prioritaet: prioritaet
  };

  try {
    await TermineService.create(termin);
    alert('Wartende Aktion erfolgreich erstellt!');

    // Formular zurücksetzen
    document.getElementById('wartendeAktionForm').reset();
    document.getElementById('wartendGefundenerKunde').style.display = 'none';
    document.getElementById('wartend_kunde_id').value = '';
    
    // Status-Badge zurücksetzen
    const statusBadge = document.getElementById('wartendKundeStatusAnzeige');
    if (statusBadge) {
      statusBadge.style.display = 'none';
    }

    // Liste und Cache aktualisieren
    this.loadWartendeAktionen();
    this.loadTermineCache(); // Cache für Kennzeichen-Suche aktualisieren
    this.loadDashboard();
  } catch (error) {
    console.error('Fehler beim Erstellen der wartenden Aktion:', error);
    alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
  }
};

  AppClass.prototype.loadWartendeAktionen = async function() {
  const listeDiv = document.getElementById('wartendeAktionenListe');
  const anzahlSpan = document.getElementById('wartendeAnzahl');
  
  if (!listeDiv) return;

  try {
    const termine = await TermineService.getAll(null);
    const wartendeAktionen = termine.filter(t => t.ist_schwebend === 1 || t.ist_schwebend === true);

    anzahlSpan.textContent = wartendeAktionen.length;

    if (wartendeAktionen.length === 0) {
      listeDiv.innerHTML = `
        <div class="wartende-leer">
          <div class="wartende-leer-icon">✅</div>
          <p>Keine wartenden Aktionen vorhanden</p>
          <p style="font-size: 0.9em;">Erstellen Sie oben eine neue wartende Aktion</p>
        </div>
      `;
      return;
    }

    listeDiv.innerHTML = wartendeAktionen.map(termin => {
      const erstelltAm = termin.erstellt_am ? new Date(termin.erstellt_am).toLocaleDateString('de-DE') : 'Unbekannt';
      const zeitAnzeige = termin.geschaetzte_zeit ? `${(termin.geschaetzte_zeit / 60).toFixed(1)} h` : '-';
      
      // Priorität Badge
      const prioritaet = termin.schwebend_prioritaet || 'mittel';
      const prioritaetBadgeMap = {
        'hoch': '<span class="prioritaet-badge prioritaet-badge-hoch" title="Hohe Priorität">🔴 Hoch</span>',
        'mittel': '<span class="prioritaet-badge prioritaet-badge-mittel" title="Mittlere Priorität">🟡 Mittel</span>',
        'niedrig': '<span class="prioritaet-badge prioritaet-badge-niedrig" title="Niedrige Priorität">🟢 Niedrig</span>'
      };
      const prioritaetBadge = prioritaetBadgeMap[prioritaet] || prioritaetBadgeMap['mittel'];
      
      // Teile-Status aus arbeitszeiten_details extrahieren
      let teileStatusHtml = '';
      if (termin.arbeitszeiten_details) {
        try {
          const details = typeof termin.arbeitszeiten_details === 'string' 
            ? JSON.parse(termin.arbeitszeiten_details) 
            : termin.arbeitszeiten_details;
          
          // Suche nach teile_status in den Details
          for (const key of Object.keys(details)) {
            if (details[key] && details[key].teile_status) {
              const status = details[key].teile_status;
              const statusMap = {
                'bestellen': { icon: '⚠️', text: 'Muss bestellt werden', class: 'teile-bestellen' },
                'bestellt': { icon: '📦', text: 'Teile bestellt', class: 'teile-bestellt' },
                'eingetroffen': { icon: '🚚', text: 'Teile eingetroffen', class: 'teile-eingetroffen' },
                'vorraetig': { icon: '✅', text: 'Teile vorrätig', class: 'teile-vorraetig' }
              };
              const statusInfo = statusMap[status] || { icon: '📦', text: status, class: '' };
              teileStatusHtml = `<span class="wartende-teile-status ${statusInfo.class}">${statusInfo.icon} ${statusInfo.text}</span>`;
              break;
            }
          }
        } catch (e) {
          console.error('Fehler beim Parsen der arbeitszeiten_details:', e);
        }
      }
      
      return `
        <div class="wartende-karte" data-termin-id="${termin.id}">
          <div class="wartende-karte-erstellt">
            ${prioritaetBadge}
            <span style="margin-left: auto;">Erstellt: ${erstelltAm}</span>
          </div>
          <div class="wartende-karte-header">
            <span class="wartende-karte-kunde">${termin.kunde_name || 'Unbekannt'}</span>
            <span class="wartende-karte-kennzeichen">${termin.kennzeichen || '-'}</span>
          </div>
          <div class="wartende-karte-body">
            <div class="wartende-karte-beschreibung">${this.escapeHtml(termin.arbeit || '')}</div>
            ${teileStatusHtml}
            <div class="wartende-karte-meta">
              ${termin.fahrzeugtyp ? `<span>🚗 ${termin.fahrzeugtyp}</span>` : ''}
              <span>⏱️ ${zeitAnzeige}</span>
              ${termin.umfang ? `<span>📝 ${termin.umfang}</span>` : ''}
            </div>
          </div>
          <div class="wartende-karte-footer">
            <button class="btn btn-einplanen" onclick="app.wartendeAktionEinplanen(${termin.id})">
              📅 Einplanen
            </button>
            <button class="btn btn-teile-status" onclick="app.wartendeAktionTeileStatus(${termin.id})" title="Teile-Status ändern">
              📦
            </button>
            <button class="btn btn-bearbeiten-wartend" onclick="app.showTerminDetails(${termin.id})">
              ✏️ Bearbeiten
            </button>
            <button class="btn btn-erledigt" onclick="app.wartendeAktionErledigt(${termin.id})">
              ✓ Erledigt
            </button>
            <button class="btn btn-loeschen-wartend" onclick="app.wartendeAktionLoeschen(${termin.id})" title="Löschen">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Fehler beim Laden der wartenden Aktionen:', error);
    listeDiv.innerHTML = '<div class="error">Fehler beim Laden</div>';
  }
};

  AppClass.prototype.wartendeAktionEinplanen = async function(terminId) {
  // Lade Termin und öffne das Einplanen-Modal
  try {
    const termin = await TermineService.getById(terminId);
    this.termineById[terminId] = termin; // Speichere für das Modal
    this.einplanenFromWartendeAktionen = true; // Merker für spezielle Behandlung
    this.openEinplanenDatumModal(terminId, termin);
  } catch (error) {
    console.error('Fehler beim Laden des Termins:', error);
    alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
  }
};

  AppClass.prototype.wartendeAktionErledigt = async function(terminId) {
  if (!confirm('Diese wartende Aktion als erledigt markieren?\n(Der Termin wird gelöscht)')) return;

  try {
    await TermineService.delete(terminId);
    alert('Wartende Aktion wurde erledigt und entfernt.');
    this.loadWartendeAktionen();
    this.loadDashboard();
  } catch (error) {
    console.error('Fehler beim Erledigen:', error);
    alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
  }
};

  AppClass.prototype.wartendeAktionLoeschen = async function(terminId) {
  if (!confirm('Diese wartende Aktion wirklich löschen?')) return;

  try {
    await TermineService.delete(terminId);
    alert('Wartende Aktion wurde gelöscht.');
    this.loadWartendeAktionen();
    this.loadDashboard();
  } catch (error) {
    console.error('Fehler beim Löschen:', error);
    alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
  }
};

  AppClass.prototype.wartendeAktionTeileStatus = async function(terminId) {
  try {
    const termin = await TermineService.getById(terminId);
    
    // Aktuellen Teile-Status ermitteln
    let currentStatus = '';
    if (termin.arbeitszeiten_details) {
      try {
        const details = typeof termin.arbeitszeiten_details === 'string' 
          ? JSON.parse(termin.arbeitszeiten_details) 
          : termin.arbeitszeiten_details;
        
        for (const key of Object.keys(details)) {
          if (details[key] && details[key].teile_status) {
            currentStatus = details[key].teile_status;
            break;
          }
        }
      } catch (e) {
        console.error('Fehler beim Parsen:', e);
      }
    }

    // Modal anzeigen
    const modal = document.getElementById('teileStatusModal');
    const terminInfo = document.getElementById('teileStatusTerminInfo');
    const aktuellDiv = document.getElementById('teileStatusAktuell');
    const closeBtn = document.getElementById('closeTeileStatusModal');
    const statusBtns = modal.querySelectorAll('.teile-status-btn');

    // Status-Labels
    const statusLabels = {
      '': '❌ Nicht relevant',
      'bestellen': '⚠️ Muss bestellt werden',
      'bestellt': '📦 Teile bestellt',
      'eingetroffen': '🚚 Teile eingetroffen',
      'vorraetig': '✅ Teile vorrätig'
    };

    // Termin-Info anzeigen
    terminInfo.innerHTML = `
      <strong>${termin.kunde_name || 'Unbekannter Kunde'}</strong><br>
      <span style="color: #666;">${termin.arbeit || 'Keine Arbeit angegeben'}</span>
    `;

    // Aktuellen Status markieren
    aktuellDiv.innerHTML = `<strong>Aktueller Status:</strong> ${statusLabels[currentStatus] || 'Nicht gesetzt'}`;

    // Aktiven Button hervorheben
    statusBtns.forEach(btn => {
      const btnStatus = btn.dataset.status;
      if (btnStatus === currentStatus) {
        btn.style.boxShadow = '0 0 0 3px #ff9800';
        btn.style.transform = 'scale(1.02)';
      } else {
        btn.style.boxShadow = 'none';
        btn.style.transform = 'none';
      }
    });

    // Modal anzeigen (mit display und opacity für Sichtbarkeit)
    modal.style.display = 'flex';
    modal.style.opacity = '1';
    modal.classList.add('active');

    // Event-Handler für Status-Buttons
    const handleStatusClick = async (e) => {
      const btn = e.target.closest('.teile-status-btn');
      if (!btn) return;

      const selectedStatus = btn.dataset.status;

      // Event-Handler entfernen
      statusBtns.forEach(b => b.removeEventListener('click', handleStatusClick));
      closeBtn.removeEventListener('click', handleClose);
      modal.removeEventListener('click', handleOutsideClick);

      // Modal schließen
      modal.style.display = 'none';
      modal.style.opacity = '0';
      modal.classList.remove('active');

      // Status speichern
      await this.saveTeileStatus(termin, selectedStatus);
    };

    const handleClose = () => {
      statusBtns.forEach(b => b.removeEventListener('click', handleStatusClick));
      closeBtn.removeEventListener('click', handleClose);
      modal.removeEventListener('click', handleOutsideClick);
      modal.style.display = 'none';
      modal.style.opacity = '0';
      modal.classList.remove('active');
    };

    const handleOutsideClick = (e) => {
      if (e.target === modal) {
        handleClose();
      }
    };

    // Event-Listener hinzufügen
    statusBtns.forEach(btn => btn.addEventListener('click', handleStatusClick));
    closeBtn.addEventListener('click', handleClose);
    modal.addEventListener('click', handleOutsideClick);
    
  } catch (error) {
    console.error('Fehler beim Öffnen des Teile-Status-Dialogs:', error);
    alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
  }
};

  AppClass.prototype.saveTeileStatus = async function(termin, selectedStatus) {
  try {
    // Arbeitszeiten_details aktualisieren
    let arbeitszeitenDetails = {};
    if (termin.arbeitszeiten_details) {
      try {
        arbeitszeitenDetails = typeof termin.arbeitszeiten_details === 'string' 
          ? JSON.parse(termin.arbeitszeiten_details) 
          : termin.arbeitszeiten_details;
      } catch (e) {
        arbeitszeitenDetails = {};
      }
    }

    // Wenn keine Details vorhanden, erstelle neuen Eintrag
    const arbeit = termin.arbeit || 'Arbeit';
    if (!arbeitszeitenDetails[arbeit]) {
      arbeitszeitenDetails[arbeit] = {
        zeit: termin.geschaetzte_zeit || 60
      };
    }
    
    if (selectedStatus) {
      arbeitszeitenDetails[arbeit].teile_status = selectedStatus;
    } else {
      delete arbeitszeitenDetails[arbeit].teile_status;
    }

    // Speichern
    await TermineService.update(termin.id, {
      arbeitszeiten_details: JSON.stringify(arbeitszeitenDetails)
    });

    // Kurze Erfolgsanzeige
    this.showToast('Teile-Status aktualisiert!', 'success');
    this.loadWartendeAktionen();
    
  } catch (error) {
    console.error('Fehler beim Speichern des Teile-Status:', error);
    alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
  }
};
}
