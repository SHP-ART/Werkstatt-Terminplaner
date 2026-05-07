export function installFormHelpersFeature(AppClass) {
  AppClass.prototype.handleArbeitAutocomplete = function(e) {
  const textarea = e.target;
  const text = textarea.value;
  const cursorPos = textarea.selectionStart;

  // Finde die aktuelle Zeile
  const beforeCursor = text.substring(0, cursorPos);
  const lines = beforeCursor.split('\n');
  const currentLine = lines[lines.length - 1].trim();

  console.log('Autocomplete: Eingabe erkannt, aktuelle Zeile:', currentLine);

  if (currentLine.length < 2) {
    this.closeAutocomplete();
    return;
  }

  // Sicherstellen, dass arbeitszeiten ein Array ist
  if (!this.arbeitszeiten || !Array.isArray(this.arbeitszeiten)) {
    console.warn('Arbeitszeiten nicht geladen, lade jetzt...');
    this.loadArbeitszeiten();
    return;
  }

  console.log('Autocomplete: Suche in', this.arbeitszeiten.length, 'Arbeitszeiten');

  // Filtere passende Arbeiten - suche in Bezeichnung UND Aliasen
  const suchBegriff = currentLine.toLowerCase();
  const matches = this.arbeitszeiten.filter(arbeit => {
    // Suche in Bezeichnung
    if (arbeit.bezeichnung && arbeit.bezeichnung.toLowerCase().includes(suchBegriff)) {
      return true;
    }
    // Suche in Aliasen
    if (arbeit.aliase) {
      const aliasListe = arbeit.aliase.split(',').map(a => a.trim().toLowerCase());
      return aliasListe.some(alias => alias.includes(suchBegriff));
    }
    return false;
  });

  console.log('Autocomplete: Gefundene Matches:', matches.length);

  if (matches.length === 0) {
    this.closeAutocomplete();
    return;
  }

  this.showAutocomplete(matches, currentLine);
};

  AppClass.prototype.showAutocomplete = function(matches, currentText) {
  const dropdown = document.getElementById('arbeitAutocomplete');
  const textarea = document.getElementById('arbeitEingabe');
  
  if (!dropdown) {
    console.error('Autocomplete dropdown nicht gefunden!');
    return;
  }
  
  if (!textarea) {
    console.error('Textarea nicht gefunden!');
    return;
  }
  
  dropdown.innerHTML = '';
  this.autocompleteSelectedIndex = -1;

  // Positioniere das Dropdown mit fixed positioning für garantierte Sichtbarkeit
  const textareaRect = textarea.getBoundingClientRect();
  
  // Alle Styles inline setzen für garantierte Anzeige
  dropdown.style.cssText = `
    display: block !important;
    position: fixed !important;
    top: ${textareaRect.bottom + 2}px !important;
    left: ${textareaRect.left}px !important;
    width: ${textareaRect.width}px !important;
    z-index: 999999 !important;
    background: #ffffff !important;
    border: 3px solid #4a90e2 !important;
    border-radius: 8px !important;
    max-height: 250px !important;
    overflow-y: auto !important;
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4) !important;
  `;

  matches.forEach((arbeit, index) => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.style.cssText = `
      padding: 12px 15px !important;
      cursor: pointer !important;
      border-bottom: 1px solid #f0f0f0 !important;
      background: #ffffff !important;
      color: #333 !important;
      font-size: 14px !important;
    `;
    item.textContent = arbeit.bezeichnung;
    item.dataset.index = index;

    item.addEventListener('mouseenter', () => {
      item.style.background = '#4a90e2';
      item.style.color = '#ffffff';
    });
    
    item.addEventListener('mouseleave', () => {
      item.style.background = '#ffffff';
      item.style.color = '#333';
    });

    item.addEventListener('click', () => {
      this.selectAutocompleteItem(arbeit.bezeichnung);
    });

    dropdown.appendChild(item);
  });

  dropdown.classList.add('show');
  this.currentAutocompleteMatches = matches;
  
  console.log('Autocomplete angezeigt mit', matches.length, 'Vorschlägen, Position:', textareaRect.bottom, textareaRect.left, 'Display:', dropdown.style.display);
};

  AppClass.prototype.handleArbeitKeydown = function(e) {
  const dropdown = document.getElementById('arbeitAutocomplete');
  if (!dropdown.classList.contains('show')) {
    return;
  }

  const items = dropdown.querySelectorAll('.autocomplete-item');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    this.autocompleteSelectedIndex = Math.min(this.autocompleteSelectedIndex + 1, items.length - 1);
    this.updateAutocompleteSelection(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    this.autocompleteSelectedIndex = Math.max(this.autocompleteSelectedIndex - 1, -1);
    this.updateAutocompleteSelection(items);
  } else if (e.key === 'Enter' && this.autocompleteSelectedIndex >= 0) {
    e.preventDefault();
    const selectedItem = this.currentAutocompleteMatches[this.autocompleteSelectedIndex];
    if (selectedItem) {
      this.selectAutocompleteItem(selectedItem.bezeichnung);
    }
  } else if (e.key === 'Escape') {
    this.closeAutocomplete();
  }
};

  AppClass.prototype.updateAutocompleteSelection = function(items) {
  items.forEach((item, index) => {
    if (index === this.autocompleteSelectedIndex) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
};

  AppClass.prototype.selectAutocompleteItem = function(bezeichnung) {
  const textarea = document.getElementById('arbeitEingabe');
  const text = textarea.value;
  const cursorPos = textarea.selectionStart;

  // Finde die aktuelle Zeile
  const beforeCursor = text.substring(0, cursorPos);
  const afterCursor = text.substring(cursorPos);
  const lines = beforeCursor.split('\n');
  const currentLineIndex = lines.length - 1;

  // Ersetze die aktuelle Zeile mit der Auswahl
  lines[currentLineIndex] = bezeichnung;
  const newText = lines.join('\n') + afterCursor;

  textarea.value = newText;

  // Setze Cursor ans Ende der eingefügten Zeile
  const newCursorPos = lines.join('\n').length;
  textarea.setSelectionRange(newCursorPos, newCursorPos);

  this.closeAutocomplete();
  this.updateZeitschaetzung();
  textarea.focus();
};

  AppClass.prototype.closeAutocomplete = function() {
  const dropdown = document.getElementById('arbeitAutocomplete');
  if (dropdown) {
    dropdown.classList.remove('show');
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
  }
  this.autocompleteSelectedIndex = -1;
  this.currentAutocompleteMatches = [];
};

  AppClass.prototype.getWeekDays = function() {
  const weekStart = new Date(this.getWeekStart());
  const days = [];

  // Montag bis Samstag (6 Tage)
  for (let i = 0; i < 6; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    days.push({
      datum: this.formatDateLocal(day),
      formatted: day.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
    });
  }

  return days;
}






// Dringlichkeit-Badge HTML generieren;

  AppClass.prototype.getDringlichkeitBadge = function(dringlichkeit) {
  if (!dringlichkeit) return '';
  
  const badges = {
    'dringend': '<span class="dringlichkeit-badge dringlichkeit-dringend">🔴 Dringend</span>',
    'heute': '<span class="dringlichkeit-badge dringlichkeit-heute">🟠 Heute</span>',
    'woche': '<span class="dringlichkeit-badge dringlichkeit-woche">🟡 Diese Woche</span>'
  };
  
  return badges[dringlichkeit] || '';
}

// Folgetermin-Badge HTML generieren;

  AppClass.prototype.getFolgeterminBadge = function(arbeitText) {
  if (!arbeitText) return '';
  
  // Prüfe ob es ein Folgetermin ist
  const match = arbeitText.match(/\[Folgetermin zu (T-\d{4}-\d{3})\]/);
  if (match) {
    return `<span style="display: inline-block; margin-left: 5px; padding: 2px 6px; background: #ff9800; color: white; border-radius: 4px; font-size: 0.75em; font-weight: bold;" title="Folgetermin von ${match[1]}">🔗 Folge</span>`;
  }
  return '';
}

// Arbeit-Anzeige formatieren (Folgetermin-Prefix entfernen für bessere Lesbarkeit);

  AppClass.prototype.formatArbeitAnzeige = function(arbeitText) {
  if (!arbeitText) return '-';
  
  // Entferne Folgetermin-Prefix für kürzere Anzeige
  const cleaned = arbeitText.replace(/\[Folgetermin zu T-\d{4}-\d{3}\]\s*/, '');
  return cleaned || '-';
};

  AppClass.prototype.getStatusColor = function(status) {
  const colors = {
    'geplant': '#4a90e2',
    'in_arbeit': '#f39c12',
    'abgeschlossen': '#27ae60',
    'abgesagt': '#e74c3c'
  };
  return colors[status] || '#95a5a6';
};

  AppClass.prototype.getStatusText = function(status) {
  const texts = {
    'geplant': 'Geplant',
    'in_arbeit': 'In Arbeit',
    'abgeschlossen': 'Abgeschlossen',
    'abgesagt': 'Abgesagt'
  };
  return texts[status] || status || 'Unbekannt';
}

// ==========================================
// Auslastung Kalender-Picker Funktionen
// ==========================================;

  AppClass.prototype.setupAuslastungKalender = function() {
  const kalenderTage = document.getElementById('kalenderTage');
  const kalenderMonatJahr = document.getElementById('kalenderMonatJahr');
  if (!kalenderTage || !kalenderMonatJahr) {
    // Element noch nicht im DOM - wird später beim Tab-Wechsel aufgerufen
    return;
  }

  // Prüfe ob bereits initialisiert - wenn ja, nur rendern
  if (this.auslastungKalenderInitialized) {
    // Kalender neu rendern falls er leer ist
    if (kalenderTage.children.length === 0 || !kalenderTage.querySelector('.kalender-tag')) {
      this.renderAuslastungKalender();
      this.updateSelectedDatumDisplay();
    }
    return;
  }

  this.kalenderAktuellMonat = new Date();
  this.kalenderAuslastungCache = {};

  // Navigation Buttons
  const kalenderPrevMonth = document.getElementById('kalenderPrevMonth');
  this.bindEventListenerOnce(kalenderPrevMonth, 'click', () => this.navigateKalenderMonat(-1), 'KalenderPrevMonth');

  const kalenderNextMonth = document.getElementById('kalenderNextMonth');
  this.bindEventListenerOnce(kalenderNextMonth, 'click', () => this.navigateKalenderMonat(1), 'KalenderNextMonth');

  const kalenderHeuteBtn = document.getElementById('kalenderHeuteBtn');
  this.bindEventListenerOnce(kalenderHeuteBtn, 'click', () => this.selectKalenderHeute(), 'KalenderHeute');

  // Kalender sofort rendern (inline, immer sichtbar)
  this.renderAuslastungKalender();
  
  // Datum-Anzeige initial aktualisieren
  this.updateSelectedDatumDisplay();
  this.auslastungKalenderInitialized = true;
}

// Aktualisiert die Datum-Anzeige über dem Kalender;

  AppClass.prototype.updateSelectedDatumDisplay = function() {
  const datumInput = document.getElementById('datum');
  const display = document.getElementById('selectedDatumDisplay');
  const fehler = document.getElementById('terminDatumFehler');
  if (!display) return;
  
  if (datumInput && datumInput.value) {
    const datum = new Date(datumInput.value + 'T00:00:00');
    const optionen = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    display.textContent = datum.toLocaleDateString('de-DE', optionen);
    display.style.color = '#1565c0';
    display.style.border = '2px solid #2196f3';
    if (fehler) fehler.style.display = 'none';
  } else {
    display.textContent = 'Bitte Datum wählen...';
    display.style.color = '#94a3b8';
    display.style.border = '2px dashed #94a3b8';
  }
};

  AppClass.prototype.openAuslastungKalender = async function() {
  // Nicht mehr benötigt - Kalender ist immer sichtbar
  // Aber wir lassen die Funktion für Kompatibilität
  await this.renderAuslastungKalender();
};

  AppClass.prototype.closeAuslastungKalender = function() {
  // Nicht mehr benötigt - Kalender ist immer sichtbar
};

  AppClass.prototype.navigateKalenderMonat = async function(offset) {
  this.kalenderAktuellMonat.setMonth(this.kalenderAktuellMonat.getMonth() + offset);
  await this.renderAuslastungKalender();
};

  AppClass.prototype.selectKalenderHeute = async function() {
  const heute = new Date();
  const datumInput = document.getElementById('datum');
  if (datumInput) {
    datumInput.value = this.formatDateLocal(heute);
    datumInput.dispatchEvent(new Event('change'));
  }
  // Aktualisiere Anzeige und navigiere zum aktuellen Monat
  this.updateSelectedDatumDisplay();
  this.kalenderAktuellMonat = new Date(heute.getFullYear(), heute.getMonth(), 1);
  await this.renderAuslastungKalender();
};

  AppClass.prototype.renderAuslastungKalender = async function() {
  const kalenderTage = document.getElementById('kalenderTage');
  const kalenderMonatJahr = document.getElementById('kalenderMonatJahr');
  
  if (!kalenderTage || !kalenderMonatJahr) return;

  // Zeige Ladeanimation
  kalenderTage.innerHTML = '<div class="kalender-loading">Lade Auslastung...</div>';

  const jahr = this.kalenderAktuellMonat.getFullYear();
  const monat = this.kalenderAktuellMonat.getMonth();

  // Monatsname anzeigen
  const monatNamen = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 
                      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  kalenderMonatJahr.textContent = `${monatNamen[monat]} ${jahr}`;

  // Lade Auslastungsdaten für den gesamten Monat
  const auslastungDaten = await this.loadMonatAuslastung(jahr, monat);

  // Berechne ersten und letzten Tag
  const ersterTag = new Date(jahr, monat, 1);
  const letzterTag = new Date(jahr, monat + 1, 0);
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  // Wochentag des ersten Tags (0 = Sonntag, anpassen für Montag-Start)
  let startWochentag = ersterTag.getDay();
  startWochentag = startWochentag === 0 ? 6 : startWochentag - 1; // Montag = 0

  // Aktuell ausgewähltes Datum
  const datumInput = document.getElementById('datum');
  const selectedDate = datumInput && datumInput.value ? datumInput.value : null;

  let html = '';

  // Leere Zellen vor dem ersten Tag
  for (let i = 0; i < startWochentag; i++) {
    html += '<div class="kalender-tag kalender-tag-leer"></div>';
  }

  // Tage des Monats
  for (let tag = 1; tag <= letzterTag.getDate(); tag++) {
    const datum = new Date(jahr, monat, tag);
    const datumStr = this.formatDateLocal(datum);
    const istHeute = datum.getTime() === heute.getTime();
    const istVergangen = datum < heute;
    const istWochenende = datum.getDay() === 0 || datum.getDay() === 6;
    const istAusgewaehlt = datumStr === selectedDate;

    // Auslastung für diesen Tag
    const auslastung = auslastungDaten[datumStr];
    let auslastungProzent = auslastung ? auslastung.auslastung_prozent : 0;
    let auslastungKlasse = '';

    if (!istWochenende && !istVergangen) {
      if (auslastungProzent > 100) {
        auslastungKlasse = 'kalender-tag-auslastung-over-100';
      } else if (auslastungProzent > 80) {
        auslastungKlasse = 'kalender-tag-auslastung-81-100';
      } else if (auslastungProzent > 50) {
        auslastungKlasse = 'kalender-tag-auslastung-51-80';
      } else {
        auslastungKlasse = 'kalender-tag-auslastung-0-50';
      }
    }

    const klassen = [
      'kalender-tag',
      istHeute ? 'kalender-tag-heute' : '',
      istVergangen ? 'kalender-tag-vergangen' : '',
      istWochenende ? 'kalender-tag-wochenende' : '',
      istAusgewaehlt ? 'kalender-tag-selected' : '',
      auslastungKlasse
    ].filter(k => k).join(' ');

    html += `
      <div class="${klassen}" data-datum="${datumStr}" ${istVergangen && !istHeute ? '' : 'onclick="app.selectKalenderDatum(\'' + datumStr + '\')"'}>
        <span class="kalender-tag-nummer">${tag}</span>
        ${!istWochenende && auslastung ? `<span class="kalender-tag-prozent">${Math.round(auslastungProzent)}%</span>` : ''}
      </div>
    `;
  }

  kalenderTage.innerHTML = html;
};

  AppClass.prototype.loadMonatAuslastung = async function(jahr, monat) {
  const cacheKey = `${jahr}-${monat}`;
  
  // Initialisiere Cache falls noch nicht vorhanden
  if (!this.kalenderAuslastungCache) {
    this.kalenderAuslastungCache = {};
  }
  
  // Prüfe Cache
  if (this.kalenderAuslastungCache[cacheKey]) {
    return this.kalenderAuslastungCache[cacheKey];
  }

  const ersterTag = new Date(jahr, monat, 1);
  const letzterTag = new Date(jahr, monat + 1, 0);
  const auslastungDaten = {};

  try {
    // Lade Auslastung für jeden Tag des Monats (nur Werktage)
    const promises = [];
    for (let tag = 1; tag <= letzterTag.getDate(); tag++) {
      const datum = new Date(jahr, monat, tag);
      // Überspringe Wochenende
      if (datum.getDay() === 0 || datum.getDay() === 6) continue;
      
      const datumStr = this.formatDateLocal(datum);
      promises.push(
        AuslastungService.getByDatum(datumStr)
          .then(data => {
            auslastungDaten[datumStr] = data;
          })
          .catch(err => {
            console.warn(`Fehler beim Laden der Auslastung für ${datumStr}:`, err);
            auslastungDaten[datumStr] = { auslastung_prozent: 0 };
          })
      );
    }

    await Promise.all(promises);
    
    // Cache speichern
    this.kalenderAuslastungCache[cacheKey] = auslastungDaten;
    
  } catch (error) {
    console.error('Fehler beim Laden der Monatsauslastung:', error);
  }

  return auslastungDaten;
};

  AppClass.prototype.selectKalenderDatum = async function(datumStr) {
  const datumInput = document.getElementById('datum');
  if (datumInput) {
    datumInput.value = datumStr;
    datumInput.dispatchEvent(new Event('change'));
  }
  const fehler = document.getElementById('terminDatumFehler');
  if (fehler) fehler.style.display = 'none';
  // Aktualisiere Anzeige und re-rendere Kalender für Markierung
  this.updateSelectedDatumDisplay();
  await this.renderAuslastungKalender();
}

// ==========================================
// Edit-Kalender Funktionen (Termin bearbeiten)
// ==========================================;

  AppClass.prototype.setupEditAuslastungKalender = function() {
  const kalenderTage = document.getElementById('editKalenderTage');
  const kalenderMonatJahr = document.getElementById('editKalenderMonatJahr');
  if (!kalenderTage || !kalenderMonatJahr || this.editAuslastungKalenderInitialized) {
    return;
  }

  this.editKalenderAktuellMonat = new Date();

  // Navigation Buttons für Edit-Kalender
  const editKalenderPrevMonth = document.getElementById('editKalenderPrevMonth');
  this.bindEventListenerOnce(editKalenderPrevMonth, 'click', () => this.navigateEditKalenderMonat(-1), 'EditKalenderPrevMonth');

  const editKalenderNextMonth = document.getElementById('editKalenderNextMonth');
  this.bindEventListenerOnce(editKalenderNextMonth, 'click', () => this.navigateEditKalenderMonat(1), 'EditKalenderNextMonth');

  const editKalenderHeuteBtn = document.getElementById('editKalenderHeuteBtn');
  this.bindEventListenerOnce(editKalenderHeuteBtn, 'click', () => this.selectEditKalenderHeute(), 'EditKalenderHeute');

  // Kalender initial NICHT rendern - wird erst beim Laden eines Termins gerendert
  this.editAuslastungKalenderInitialized = true;
}

// Aktualisiert die Datum-Anzeige über dem Edit-Kalender;

  AppClass.prototype.updateEditSelectedDatumDisplay = function() {
  const datumInput = document.getElementById('edit_datum');
  const display = document.getElementById('editSelectedDatumDisplay');
  if (!display) return;
  
  if (datumInput && datumInput.value) {
    const datum = new Date(datumInput.value + 'T00:00:00');
    const optionen = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    display.textContent = datum.toLocaleDateString('de-DE', optionen);
    display.style.color = '#1565c0';
  } else {
    display.textContent = 'Bitte Datum wählen...';
    display.style.color = '#94a3b8';
  }
};

  AppClass.prototype.navigateEditKalenderMonat = async function(offset) {
  if (!this.editKalenderAktuellMonat) {
    this.editKalenderAktuellMonat = new Date();
  }
  this.editKalenderAktuellMonat.setMonth(this.editKalenderAktuellMonat.getMonth() + offset);
  await this.renderEditAuslastungKalender();
};

  AppClass.prototype.selectEditKalenderHeute = async function() {
  const heute = new Date();
  const datumInput = document.getElementById('edit_datum');
  if (datumInput) {
    datumInput.value = this.formatDateLocal(heute);
    datumInput.dispatchEvent(new Event('change'));
  }
  // Aktualisiere Anzeige und navigiere zum aktuellen Monat
  this.updateEditSelectedDatumDisplay();
  this.editKalenderAktuellMonat = new Date(heute.getFullYear(), heute.getMonth(), 1);
  await this.renderEditAuslastungKalender();
};

  AppClass.prototype.selectEditKalenderDatum = async function(datumStr) {
  const datumInput = document.getElementById('edit_datum');
  if (datumInput) {
    datumInput.value = datumStr;
    datumInput.dispatchEvent(new Event('change'));
  }
  // Aktualisiere Anzeige und re-rendere Kalender für Markierung
  this.updateEditSelectedDatumDisplay();
  await this.renderEditAuslastungKalender();
};

  AppClass.prototype.renderEditAuslastungKalender = async function() {
  const kalenderTage = document.getElementById('editKalenderTage');
  const kalenderMonatJahr = document.getElementById('editKalenderMonatJahr');
  
  if (!kalenderTage || !kalenderMonatJahr) {
    console.warn('Edit-Auslastung-Kalender Elemente nicht gefunden');
    return;
  }

  // Fallback für editKalenderAktuellMonat
  if (!this.editKalenderAktuellMonat) {
    this.editKalenderAktuellMonat = new Date();
  }

  const jahr = this.editKalenderAktuellMonat.getFullYear();
  const monat = this.editKalenderAktuellMonat.getMonth();

  // Monatsname anzeigen
  const monatNamen = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 
                      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  kalenderMonatJahr.textContent = `${monatNamen[monat]} ${jahr}`;

  // Berechne ersten und letzten Tag
  const ersterTag = new Date(jahr, monat, 1);
  const letzterTag = new Date(jahr, monat + 1, 0);
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  // Wochentag des ersten Tags (0 = Sonntag, anpassen für Montag-Start)
  let startWochentag = ersterTag.getDay();
  startWochentag = startWochentag === 0 ? 6 : startWochentag - 1; // Montag = 0

  // Aktuell ausgewähltes Datum (aus Edit-Feld)
  const datumInput = document.getElementById('edit_datum');
  const selectedDate = datumInput && datumInput.value ? datumInput.value : null;

  let html = '';

  // Leere Zellen vor dem ersten Tag
  for (let i = 0; i < startWochentag; i++) {
    html += '<div class="kalender-tag kalender-tag-leer"></div>';
  }

  // Tage des Monats - sofort rendern ohne auf Auslastung zu warten
  for (let tag = 1; tag <= letzterTag.getDate(); tag++) {
    const datum = new Date(jahr, monat, tag);
    const datumStr = this.formatDateLocal(datum);
    const istHeute = datum.getTime() === heute.getTime();
    const istVergangen = datum < heute;
    const istWochenende = datum.getDay() === 0 || datum.getDay() === 6;
    const istAusgewaehlt = datumStr === selectedDate;

    const klassen = [
      'kalender-tag',
      istHeute ? 'kalender-tag-heute' : '',
      istVergangen ? 'kalender-tag-vergangen' : '',
      istWochenende ? 'kalender-tag-wochenende' : '',
      istAusgewaehlt ? 'kalender-tag-selected' : '',
      (!istWochenende && !istVergangen) ? 'kalender-tag-auslastung-0-50' : '' // Default grün
    ].filter(k => k).join(' ');

    // Für Edit-Kalender: selectEditKalenderDatum statt selectKalenderDatum
    html += `
      <div class="${klassen}" data-datum="${datumStr}" ${istVergangen && !istHeute ? '' : 'onclick="app.selectEditKalenderDatum(\'' + datumStr + '\')"'} style="${istVergangen && !istHeute ? '' : 'cursor: pointer;'}">
        <span class="kalender-tag-nummer">${tag}</span>
      </div>
    `;
  }

  kalenderTage.innerHTML = html;
  
  // Lade Auslastung asynchron im Hintergrund
  this.loadEditKalenderAuslastung(jahr, monat);
};

  AppClass.prototype.loadEditKalenderAuslastung = async function(jahr, monat) {
  try {
    const auslastungDaten = await this.loadMonatAuslastung(jahr, monat);
    const kalenderTage = document.getElementById('editKalenderTage');
    if (!kalenderTage) return;
    
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    
    // Aktualisiere die Auslastungsfarben für jeden Tag
    const tagElemente = kalenderTage.querySelectorAll('.kalender-tag[data-datum]');
    tagElemente.forEach(tagEl => {
      const datumStr = tagEl.dataset.datum;
      const datum = new Date(datumStr + 'T00:00:00');
      const istVergangen = datum < heute;
      const auslastung = auslastungDaten[datumStr];
      
      if (auslastung && !tagEl.classList.contains('kalender-tag-wochenende') && !istVergangen) {
        const prozent = auslastung.auslastung_prozent || 0;
        
        // Entferne alte Auslastungsklassen
        tagEl.classList.remove('kalender-tag-auslastung-0-50', 'kalender-tag-auslastung-51-80', 
                                'kalender-tag-auslastung-81-100', 'kalender-tag-auslastung-over-100');
        
        // Füge passende Klasse hinzu
        if (prozent > 100) {
          tagEl.classList.add('kalender-tag-auslastung-over-100');
        } else if (prozent > 80) {
          tagEl.classList.add('kalender-tag-auslastung-81-100');
        } else if (prozent > 50) {
          tagEl.classList.add('kalender-tag-auslastung-51-80');
        } else {
          tagEl.classList.add('kalender-tag-auslastung-0-50');
        }
        
        // Füge Prozent-Anzeige hinzu wenn noch nicht vorhanden
        if (!tagEl.querySelector('.kalender-tag-prozent')) {
          const prozentSpan = document.createElement('span');
          prozentSpan.className = 'kalender-tag-prozent';
          prozentSpan.textContent = `${Math.round(prozent)}%`;
          tagEl.appendChild(prozentSpan);
        }
      }
    });
  } catch (error) {
    console.warn('Fehler beim Laden der Auslastung für Edit-Kalender:', error);
  }
}

// ==========================================
// Edit-Such-Kalender Funktionen (Termin zum Bearbeiten suchen)
// ==========================================;

  AppClass.prototype.setupEditSuchKalender = function() {
  const kalenderTage = document.getElementById('editSuchKalenderTage');
  const kalenderMonatJahr = document.getElementById('editSuchKalenderMonatJahr');
  if (!kalenderTage || !kalenderMonatJahr || this.editSuchKalenderInitialized) {
    return;
  }

  this.editSuchKalenderAktuellMonat = new Date();

  // Navigation Buttons für Such-Kalender
  const editSuchKalenderPrevMonth = document.getElementById('editSuchKalenderPrevMonth');
  this.bindEventListenerOnce(editSuchKalenderPrevMonth, 'click', () => this.navigateEditSuchKalenderMonat(-1), 'EditSuchKalenderPrevMonth');

  const editSuchKalenderNextMonth = document.getElementById('editSuchKalenderNextMonth');
  this.bindEventListenerOnce(editSuchKalenderNextMonth, 'click', () => this.navigateEditSuchKalenderMonat(1), 'EditSuchKalenderNextMonth');

  const editSuchKalenderHeuteBtn = document.getElementById('editSuchKalenderHeuteBtn');
  this.bindEventListenerOnce(editSuchKalenderHeuteBtn, 'click', () => this.selectEditSuchKalenderHeute(), 'EditSuchKalenderHeute');

  // Kalender sofort rendern
  this.renderEditSuchKalender();
  this.updateEditSuchDatumDisplay();
  this.editSuchKalenderInitialized = true;
}

// Aktualisiert die Datum-Anzeige über dem Such-Kalender;

  AppClass.prototype.updateEditSuchDatumDisplay = function() {
  const datumInput = document.getElementById('editTerminDatum');
  const display = document.getElementById('editSuchDatumDisplay');
  if (!display) return;
  
  if (datumInput && datumInput.value) {
    const datum = new Date(datumInput.value + 'T00:00:00');
    const optionen = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    display.textContent = datum.toLocaleDateString('de-DE', optionen);
    display.style.color = '#1565c0';
  } else {
    display.textContent = 'Bitte Datum wählen...';
    display.style.color = '#94a3b8';
  }
};

  AppClass.prototype.navigateEditSuchKalenderMonat = async function(offset) {
  if (!this.editSuchKalenderAktuellMonat) {
    this.editSuchKalenderAktuellMonat = new Date();
  }
  this.editSuchKalenderAktuellMonat.setMonth(this.editSuchKalenderAktuellMonat.getMonth() + offset);
  await this.renderEditSuchKalender();
};

  AppClass.prototype.selectEditSuchKalenderHeute = async function() {
  const heute = new Date();
  const datumInput = document.getElementById('editTerminDatum');
  if (datumInput) {
    datumInput.value = this.formatDateLocal(heute);
    datumInput.dispatchEvent(new Event('change'));
  }
  // Aktualisiere Anzeige und navigiere zum aktuellen Monat
  this.updateEditSuchDatumDisplay();
  this.editSuchKalenderAktuellMonat = new Date(heute.getFullYear(), heute.getMonth(), 1);
  await this.renderEditSuchKalender();
  // Termine für dieses Datum laden
  await this.loadEditTermine();
};

  AppClass.prototype.selectEditSuchKalenderDatum = async function(datumStr) {
  const datumInput = document.getElementById('editTerminDatum');
  if (datumInput) {
    datumInput.value = datumStr;
    datumInput.dispatchEvent(new Event('change'));
  }
  // Aktualisiere Anzeige und re-rendere Kalender für Markierung
  this.updateEditSuchDatumDisplay();
  await this.renderEditSuchKalender();
  // Termine für dieses Datum laden
  await this.loadEditTermine();
};

  AppClass.prototype.renderEditSuchKalender = async function() {
  const kalenderTage = document.getElementById('editSuchKalenderTage');
  const kalenderMonatJahr = document.getElementById('editSuchKalenderMonatJahr');
  
  if (!kalenderTage || !kalenderMonatJahr) {
    console.warn('Edit-Such-Kalender Elemente nicht gefunden');
    return;
  }

  // Fallback für editSuchKalenderAktuellMonat
  if (!this.editSuchKalenderAktuellMonat) {
    this.editSuchKalenderAktuellMonat = new Date();
  }

  const jahr = this.editSuchKalenderAktuellMonat.getFullYear();
  const monat = this.editSuchKalenderAktuellMonat.getMonth();

  // Monatsname anzeigen
  const monatNamen = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 
                      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  kalenderMonatJahr.textContent = `${monatNamen[monat]} ${jahr}`;

  // Berechne ersten und letzten Tag
  const ersterTag = new Date(jahr, monat, 1);
  const letzterTag = new Date(jahr, monat + 1, 0);
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  // Wochentag des ersten Tags (0 = Sonntag, anpassen für Montag-Start)
  let startWochentag = ersterTag.getDay();
  startWochentag = startWochentag === 0 ? 6 : startWochentag - 1; // Montag = 0

  // Aktuell ausgewähltes Datum (aus Such-Feld)
  const datumInput = document.getElementById('editTerminDatum');
  const selectedDate = datumInput && datumInput.value ? datumInput.value : null;

  let html = '';

  // Leere Zellen vor dem ersten Tag
  for (let i = 0; i < startWochentag; i++) {
    html += '<div class="kalender-tag kalender-tag-leer"></div>';
  }

  // Tage des Monats - ALLE Tage klickbar (auch vergangene, da man alte Termine bearbeiten will)
  for (let tag = 1; tag <= letzterTag.getDate(); tag++) {
    const datum = new Date(jahr, monat, tag);
    const datumStr = this.formatDateLocal(datum);
    const istHeute = datum.getTime() === heute.getTime();
    const istVergangen = datum < heute;
    const istWochenende = datum.getDay() === 0 || datum.getDay() === 6;
    const istAusgewaehlt = datumStr === selectedDate;

    const klassen = [
      'kalender-tag',
      istHeute ? 'kalender-tag-heute' : '',
      istVergangen ? 'kalender-tag-vergangen' : '',
      istWochenende ? 'kalender-tag-wochenende' : '',
      istAusgewaehlt ? 'kalender-tag-selected' : '',
      !istWochenende ? 'kalender-tag-auslastung-0-50' : '' // Default grün
    ].filter(k => k).join(' ');

    // Für Such-Kalender: ALLE Tage klickbar (auch vergangene)
    html += `
      <div class="${klassen}" data-datum="${datumStr}" onclick="app.selectEditSuchKalenderDatum('${datumStr}')" style="cursor: pointer;">
        <span class="kalender-tag-nummer">${tag}</span>
      </div>
    `;
  }

  kalenderTage.innerHTML = html;
  
  // Lade Auslastung asynchron im Hintergrund und aktualisiere Farben
  this.loadEditSuchKalenderAuslastung(jahr, monat);
};

  AppClass.prototype.loadEditSuchKalenderAuslastung = async function(jahr, monat) {
  try {
    const auslastungDaten = await this.loadMonatAuslastung(jahr, monat);
    const kalenderTage = document.getElementById('editSuchKalenderTage');
    if (!kalenderTage) return;
    
    // Aktualisiere die Auslastungsfarben für jeden Tag
    const tagElemente = kalenderTage.querySelectorAll('.kalender-tag[data-datum]');
    tagElemente.forEach(tagEl => {
      const datumStr = tagEl.dataset.datum;
      const auslastung = auslastungDaten[datumStr];
      
      if (auslastung && !tagEl.classList.contains('kalender-tag-wochenende')) {
        const prozent = auslastung.auslastung_prozent || 0;
        
        // Entferne alte Auslastungsklassen
        tagEl.classList.remove('kalender-tag-auslastung-0-50', 'kalender-tag-auslastung-51-80', 
                                'kalender-tag-auslastung-81-100', 'kalender-tag-auslastung-over-100');
        
        // Füge passende Klasse hinzu
        if (prozent > 100) {
          tagEl.classList.add('kalender-tag-auslastung-over-100');
        } else if (prozent > 80) {
          tagEl.classList.add('kalender-tag-auslastung-81-100');
        } else if (prozent > 50) {
          tagEl.classList.add('kalender-tag-auslastung-51-80');
        } else {
          tagEl.classList.add('kalender-tag-auslastung-0-50');
        }
        
        // Füge Prozent-Anzeige hinzu wenn noch nicht vorhanden
        if (!tagEl.querySelector('.kalender-tag-prozent')) {
          const prozentSpan = document.createElement('span');
          prozentSpan.className = 'kalender-tag-prozent';
          prozentSpan.textContent = `${Math.round(prozent)}%`;
          tagEl.appendChild(prozentSpan);
        }
      }
    });
  } catch (error) {
    console.warn('Fehler beim Laden der Auslastung für Kalender:', error);
  }
}

// ==========================================
// SCHNELL-TERMIN KALENDER
// ==========================================;

  AppClass.prototype.setupSchnellKalender = function() {
  const kalenderTage = document.getElementById('schnellKalenderTage');
  const kalenderMonatJahr = document.getElementById('schnellKalenderMonatJahr');
  if (!kalenderTage || !kalenderMonatJahr) return;

  // Immer neu rendern wenn Kalender leer ist
  if (this.schnellKalenderInitialized) {
    if (!kalenderTage.querySelector('.kalender-tag')) {
      this.renderSchnellKalender();
      this.updateSchnellDatumDisplay();
    }
    return;
  }

  this.schnellKalenderAktuellMonat = new Date();

  const prevBtn = document.getElementById('schnellKalenderPrevMonth');
  this.bindEventListenerOnce(prevBtn, 'click', () => this.navigateSchnellKalenderMonat(-1), 'SchnellKalenderPrev');

  const nextBtn = document.getElementById('schnellKalenderNextMonth');
  this.bindEventListenerOnce(nextBtn, 'click', () => this.navigateSchnellKalenderMonat(1), 'SchnellKalenderNext');

  const heuteBtn = document.getElementById('schnellKalenderHeuteBtn');
  this.bindEventListenerOnce(heuteBtn, 'click', () => this.selectSchnellKalenderHeute(), 'SchnellKalenderHeute');

  // Außen-Klick schließt das Popup
  if (!this._schnellPopupOutsideHandler) {
    this._schnellPopupOutsideHandler = (e) => {
      const popup = document.getElementById('schnellKalenderPopup');
      const trigger = document.getElementById('schnellDatumTrigger');
      if (popup && popup.style.display !== 'none' &&
          !popup.contains(e.target) && e.target !== trigger && !trigger?.contains(e.target)) {
        this.closeSchnellKalenderPopup();
      }
    };
    document.addEventListener('click', this._schnellPopupOutsideHandler);
  }

  this.renderSchnellKalender();
  this.updateSchnellDatumDisplay();
  this.schnellKalenderInitialized = true;
};

  AppClass.prototype.updateSchnellDatumDisplay = function() {
  const datumInput = document.getElementById('schnell_datum');
  const display = document.getElementById('schnellDatumDisplay');
  const trigger = document.getElementById('schnellDatumTrigger');
  const fehler = document.getElementById('schnellDatumFehler');
  if (!display) return;
  if (datumInput && datumInput.value) {
    const datum = new Date(datumInput.value + 'T00:00:00');
    const optionen = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    display.textContent = datum.toLocaleDateString('de-DE', optionen);
    display.style.color = '#1565c0';
    if (trigger) {
      trigger.style.borderColor = '#2196f3';
      trigger.style.borderStyle = 'solid';
      trigger.style.background = '#e3f2fd';
    }
    if (fehler) fehler.style.display = 'none';
  } else {
    display.textContent = 'Datum wählen...';
    display.style.color = '#94a3b8';
    if (trigger) {
      trigger.style.borderColor = '#94a3b8';
      trigger.style.borderStyle = 'dashed';
      trigger.style.background = '#f8fafc';
    }
  }
};

  AppClass.prototype.toggleSchnellKalenderPopup = function() {
  const popup = document.getElementById('schnellKalenderPopup');
  const arrow = document.getElementById('schnellDatumArrow');
  if (!popup) return;
  if (popup.style.display === 'none' || !popup.style.display) {
    popup.style.display = 'block';
    if (arrow) arrow.style.transform = 'rotate(180deg)';
    // Kalender rendern falls noch nicht geschehen
    if (!this.schnellKalenderInitialized) {
      this.setupSchnellKalender();
    } else {
      this.renderSchnellKalender();
    }
  } else {
    this.closeSchnellKalenderPopup();
  }
};

  AppClass.prototype.closeSchnellKalenderPopup = function() {
  const popup = document.getElementById('schnellKalenderPopup');
  const arrow = document.getElementById('schnellDatumArrow');
  if (popup) popup.style.display = 'none';
  if (arrow) arrow.style.transform = 'rotate(0deg)';
};

  AppClass.prototype.navigateSchnellKalenderMonat = async function(offset) {
  if (!this.schnellKalenderAktuellMonat) this.schnellKalenderAktuellMonat = new Date();
  this.schnellKalenderAktuellMonat.setMonth(this.schnellKalenderAktuellMonat.getMonth() + offset);
  await this.renderSchnellKalender();
};

  AppClass.prototype.selectSchnellKalenderHeute = async function() {
  const heute = new Date();
  const datumInput = document.getElementById('schnell_datum');
  if (datumInput) {
    datumInput.value = this.formatDateLocal(heute);
    datumInput.dispatchEvent(new Event('change'));
  }
  this.updateSchnellDatumDisplay();
  this.schnellKalenderAktuellMonat = new Date(heute.getFullYear(), heute.getMonth(), 1);
  await this.renderSchnellKalender();
  this.closeSchnellKalenderPopup();
};

  AppClass.prototype.selectSchnellKalenderDatum = async function(datumStr) {
  const datumInput = document.getElementById('schnell_datum');
  if (datumInput) {
    datumInput.value = datumStr;
    datumInput.dispatchEvent(new Event('change'));
  }
  this.updateSchnellDatumDisplay();
  await this.renderSchnellKalender();
  this.closeSchnellKalenderPopup();
};

  AppClass.prototype.renderSchnellKalender = async function() {
  const kalenderTage = document.getElementById('schnellKalenderTage');
  const kalenderMonatJahr = document.getElementById('schnellKalenderMonatJahr');
  if (!kalenderTage || !kalenderMonatJahr) return;

  if (!this.schnellKalenderAktuellMonat) this.schnellKalenderAktuellMonat = new Date();

  const jahr = this.schnellKalenderAktuellMonat.getFullYear();
  const monat = this.schnellKalenderAktuellMonat.getMonth();

  const monatNamen = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  kalenderMonatJahr.textContent = `${monatNamen[monat]} ${jahr}`;

  const ersterTag = new Date(jahr, monat, 1);
  const letzterTag = new Date(jahr, monat + 1, 0);
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  let startWochentag = ersterTag.getDay();
  startWochentag = startWochentag === 0 ? 6 : startWochentag - 1;

  const datumInput = document.getElementById('schnell_datum');
  const selectedDate = datumInput && datumInput.value ? datumInput.value : null;

  let html = '';
  for (let i = 0; i < startWochentag; i++) {
    html += '<div class="kalender-tag kalender-tag-leer"></div>';
  }

  for (let tag = 1; tag <= letzterTag.getDate(); tag++) {
    const datum = new Date(jahr, monat, tag);
    const datumStr = this.formatDateLocal(datum);
    const istHeute = datum.getTime() === heute.getTime();
    const istVergangen = datum < heute;
    const istWochenende = datum.getDay() === 0 || datum.getDay() === 6;
    const istAusgewaehlt = datumStr === selectedDate;

    const klassen = [
      'kalender-tag',
      istHeute ? 'kalender-tag-heute' : '',
      istVergangen ? 'kalender-tag-vergangen' : '',
      istWochenende ? 'kalender-tag-wochenende' : '',
      istAusgewaehlt ? 'kalender-tag-selected' : '',
      !istWochenende ? 'kalender-tag-auslastung-0-50' : ''
    ].filter(k => k).join(' ');

    html += `
      <div class="${klassen}" data-datum="${datumStr}" onclick="app.selectSchnellKalenderDatum('${datumStr}')" style="cursor: pointer;">
        <span class="kalender-tag-nummer">${tag}</span>
      </div>
    `;
  }

  kalenderTage.innerHTML = html;
  this.loadSchnellKalenderAuslastung(jahr, monat);
};

  AppClass.prototype.loadSchnellKalenderAuslastung = async function(jahr, monat) {
  try {
    const auslastungDaten = await this.loadMonatAuslastung(jahr, monat);
    const kalenderTage = document.getElementById('schnellKalenderTage');
    if (!kalenderTage) return;

    kalenderTage.querySelectorAll('.kalender-tag[data-datum]').forEach(tagEl => {
      const datumStr = tagEl.dataset.datum;
      const auslastung = auslastungDaten[datumStr];
      if (auslastung && !tagEl.classList.contains('kalender-tag-wochenende')) {
        const prozent = auslastung.auslastung_prozent || 0;
        tagEl.classList.remove('kalender-tag-auslastung-0-50', 'kalender-tag-auslastung-51-80',
                                'kalender-tag-auslastung-81-100', 'kalender-tag-auslastung-over-100');
        if (prozent > 100) tagEl.classList.add('kalender-tag-auslastung-over-100');
        else if (prozent > 80) tagEl.classList.add('kalender-tag-auslastung-81-100');
        else if (prozent > 50) tagEl.classList.add('kalender-tag-auslastung-51-80');
        else tagEl.classList.add('kalender-tag-auslastung-0-50');

        if (!tagEl.querySelector('.kalender-tag-prozent')) {
          const prozentSpan = document.createElement('span');
          prozentSpan.className = 'kalender-tag-prozent';
          prozentSpan.textContent = `${Math.round(prozent)}%`;
          tagEl.appendChild(prozentSpan);
        }
      }
    });
  } catch (error) {
    console.warn('Fehler beim Laden der Auslastung für Schnell-Kalender:', error);
  }
}

// Hilfsmethode zum Escapen von HTML;
}
