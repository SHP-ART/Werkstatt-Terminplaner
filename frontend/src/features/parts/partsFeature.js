import { escapeHtml } from '../../shared/dom.js';

export function installPartsFeature(AppClass) {
  AppClass.prototype.loadTeileStatusUebersicht = async function() {
  const tbody = document.getElementById('teileStatusTableBody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6" style="text-align: center; padding: 30px; color: #666;">
        <span style="font-size: 24px;">⏳</span><br>
        Lade Teile-Status...
      </td>
    </tr>
  `;

  try {
    // OPTIMIERT: Nutze den neuen Backend-Endpoint der bereits gefiltert und geparst ist
    const response = await TermineService.getTeileStatus();
    
    const termineWithTeile = response.termine || [];
    const stats = response.stats || { bestellen: 0, bestellt: 0, eingetroffen: 0, vorraetig: 0 };

    // Statistik-Karten aktualisieren
    const bestellenEl = document.getElementById('teileBestellenCount');
    const bestelltEl = document.getElementById('teileBestelltCount');
    const eingetroffenEl = document.getElementById('teileEingetroffenCount');
    const vorraetigEl = document.getElementById('teileVorraetigCount');
    
    if (bestellenEl) bestellenEl.textContent = stats.bestellen;
    if (bestelltEl) bestelltEl.textContent = stats.bestellt;
    if (eingetroffenEl) eingetroffenEl.textContent = stats.eingetroffen;
    if (vorraetigEl) vorraetigEl.textContent = stats.vorraetig;

    // Speichern für Filter
    this.teileStatusData = termineWithTeile;

    // Tabelle rendern
    this.renderTeileStatusTable(termineWithTeile);

  } catch (error) {
    console.error('Fehler beim Laden der Teile-Status-Übersicht:', error);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 30px; color: #c62828;">
          <span style="font-size: 24px;">❌</span><br>
          Fehler beim Laden
        </td>
      </tr>
    `;
  }
};

  AppClass.prototype.renderTeileStatusTable = function(termine, aktiveFilter = null) {
  const tbody = document.getElementById('teileStatusTableBody');
  if (!tbody) return;

  // Aktualisiere Filter-Anzeige
  const filterAnzeige = document.getElementById('teileAktiverFilter');
  const filterLabel = document.getElementById('teileFilterLabel');
  if (filterAnzeige && filterLabel) {
    if (aktiveFilter && aktiveFilter !== 'alle') {
      const filterNames = {
        'bestellen': '⚠️ Muss bestellt werden',
        'bestellt': '📦 Bestellt (wartend)',
        'eingetroffen': '🚚 Eingetroffen',
        'vorraetig': '✅ Vorrätig'
      };
      filterAnzeige.style.display = 'flex';
      filterLabel.textContent = `Filter: ${filterNames[aktiveFilter] || aktiveFilter}`;
    } else {
      filterAnzeige.style.display = 'none';
    }
  }

  // Highlight aktive Statistik-Karte
  document.querySelectorAll('.teile-filter-card').forEach(card => {
    card.style.transform = card.dataset.filter === aktiveFilter ? 'scale(1.05)' : 'scale(1)';
    card.style.boxShadow = card.dataset.filter === aktiveFilter ? '0 4px 12px rgba(0,0,0,0.15)' : 'none';
  });

  if (termine.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 30px; color: #666;">
          <span style="font-size: 24px;">✅</span><br>
          Keine Termine mit Teile-Status gefunden
        </td>
      </tr>
    `;
    return;
  }

  // Gruppiere Termine nach Status
  const statusGroups = {
    'bestellen': { 
      icon: '⚠️', 
      title: 'Muss bestellt werden', 
      color: '#f44336', 
      bgColor: '#ffebee',
      termine: [] 
    },
    'bestellt': { 
      icon: '📦', 
      title: 'Bestellt (wartend)', 
      color: '#ff9800', 
      bgColor: '#fff3e0',
      termine: [] 
    },
    'eingetroffen': { 
      icon: '🚚', 
      title: 'Eingetroffen', 
      color: '#4caf50', 
      bgColor: '#e8f5e9',
      termine: [] 
    },
    'vorraetig': { 
      icon: '✅', 
      title: 'Vorrätig', 
      color: '#2196f3', 
      bgColor: '#e3f2fd',
      termine: [] 
    }
  };

  // Sortiere Termine in Gruppen
  termine.forEach(termin => {
    if (statusGroups[termin.teile_status]) {
      statusGroups[termin.teile_status].termine.push(termin);
    }
  });

  // Sortiere innerhalb jeder Gruppe nach Datum (älteste zuerst - dringender)
  Object.values(statusGroups).forEach(group => {
    group.termine.sort((a, b) => new Date(a.datum) - new Date(b.datum));
  });

  let html = '';
  const statusOrder = ['bestellen', 'bestellt', 'eingetroffen', 'vorraetig'];

  statusOrder.forEach(statusKey => {
    const group = statusGroups[statusKey];
    if (group.termine.length === 0) return;

    // Gruppen-Header
    html += `
      <tr class="teile-group-header" style="background: ${group.bgColor};">
        <td colspan="6" style="padding: 12px 15px; border-left: 4px solid ${group.color}; font-weight: bold;">
          <span style="font-size: 18px; margin-right: 8px;">${group.icon}</span>
          <span style="color: ${group.color};">${group.title}</span>
          <span style="float: right; background: ${group.color}; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px;">
            ${group.termine.length} ${group.termine.length === 1 ? 'Termin' : 'Termine'}
          </span>
        </td>
      </tr>
    `;

    // Termine in dieser Gruppe
    group.termine.forEach(termin => {
      const datum = new Date(termin.datum).toLocaleDateString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit'
      });

      const statusMap = {
        'bestellen': { icon: '⚠️', text: 'Muss bestellt werden', class: 'teile-bestellen' },
        'bestellt': { icon: '📦', text: 'Bestellt', class: 'teile-bestellt' },
        'eingetroffen': { icon: '🚚', text: 'Eingetroffen', class: 'teile-eingetroffen' },
        'vorraetig': { icon: '✅', text: 'Vorrätig', class: 'teile-vorraetig' }
      };

      const status = statusMap[termin.teile_status] || { icon: '❓', text: termin.teile_status, class: '' };

      // Escape den Arbeit-Namen für JavaScript
      const arbeitNameEscaped = (termin.arbeit_name || '').replace(/'/g, "\\'").replace(/"/g, '\\"');

      // Berechne ob dringend (Termin in der Vergangenheit oder heute)
      const heute = new Date();
      heute.setHours(0, 0, 0, 0);
      const terminDatum = new Date(termin.datum);
      terminDatum.setHours(0, 0, 0, 0);
      const istDringend = terminDatum <= heute && statusKey === 'bestellen';

      html += `
        <tr class="teile-row ${istDringend ? 'teile-dringend' : ''}" data-status="${termin.teile_status}" data-termin-id="${termin.id}" style="${istDringend ? 'background: #fff5f5;' : ''}">
          <td style="padding-left: 25px;">${istDringend ? '🔴 ' : ''}${datum}</td>
          <td>${this.escapeHtml(termin.kunde_name || 'Unbekannt')}</td>
          <td><strong>${this.escapeHtml(termin.kennzeichen || '-')}</strong></td>
          <td>${this.escapeHtml(termin.arbeit_name || termin.arbeiten || '-')}</td>
          <td>
            <select class="teile-status-select ${status.class}" 
                    onchange="app.updateTeileStatusDirekt(${termin.id}, '${arbeitNameEscaped}', this.value)">
              <option value="bestellen" ${termin.teile_status === 'bestellen' ? 'selected' : ''}>⚠️ Muss bestellt werden</option>
              <option value="bestellt" ${termin.teile_status === 'bestellt' ? 'selected' : ''}>📦 Bestellt</option>
              <option value="eingetroffen" ${termin.teile_status === 'eingetroffen' ? 'selected' : ''}>🚚 Eingetroffen</option>
              <option value="vorraetig" ${termin.teile_status === 'vorraetig' ? 'selected' : ''}>✅ Vorrätig</option>
              <option value="" ${!termin.teile_status ? 'selected' : ''}>⚪ Keine Teile nötig</option>
            </select>
          </td>
          <td>
            <button class="btn btn-small" onclick="app.openArbeitszeitenModal(${termin.id})" title="Termin bearbeiten">
              ✏️ Bearbeiten
            </button>
          </td>
        </tr>
      `;
    });
  });

  tbody.innerHTML = html;
};

  AppClass.prototype.filterTeileStatus = function(filter) {
  // Alle Karten zurücksetzen, dann aktive highlighten
  document.querySelectorAll('.teile-filter-card').forEach(card => {
    card.style.transform = 'scale(1)';
    card.style.boxShadow = 'none';
  });

  if (!this.teileStatusData) return;

  let filteredData = this.teileStatusData;
  if (filter !== 'alle') {
    filteredData = this.teileStatusData.filter(t => t.teile_status === filter);
  }

  this.renderTeileStatusTable(filteredData, filter);
};

  AppClass.prototype.updateTeileStatusDirekt = async function(terminId, arbeitName, neuerStatus) {
  try {
    // Lade aktuelle Termin-Daten
    const termin = await TermineService.getById(terminId);
    if (!termin) {
      alert('Termin nicht gefunden');
      return;
    }

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

    // Update den Teile-Status für die spezifische Arbeit
    if (details[arbeitName]) {
      if (typeof details[arbeitName] === 'object') {
        details[arbeitName].teile_status = neuerStatus;
      } else {
        // Alte Struktur (nur Zahl) - konvertiere zu neuer Struktur
        details[arbeitName] = {
          zeit: details[arbeitName],
          teile_status: neuerStatus
        };
      }
    } else {
      details[arbeitName] = {
        zeit: 0,
        teile_status: neuerStatus
      };
    }

    // Speichern
    await TermineService.update(terminId, {
      arbeitszeiten_details: JSON.stringify(details)
    });

    // Style des Selects aktualisieren
    const select = document.querySelector(`tr[data-termin-id="${terminId}"] .teile-status-select`);
    if (select) {
      select.className = 'teile-status-select';
      if (neuerStatus === 'bestellen') select.classList.add('teile-bestellen');
      else if (neuerStatus === 'bestellt') select.classList.add('teile-bestellt');
      else if (neuerStatus === 'eingetroffen') select.classList.add('teile-eingetroffen');
      else if (neuerStatus === 'vorraetig') select.classList.add('teile-vorraetig');
    }

    // Daten neu laden für korrekte Statistiken
    await this.loadTeileStatusUebersicht();

    this.showToast('Teile-Status aktualisiert', 'success');

  } catch (error) {
    console.error('Fehler beim Aktualisieren des Teile-Status:', error);
    alert('Fehler beim Aktualisieren: ' + error.message);
  }
};



  AppClass.prototype.setupTeileBestellenEventListeners = function() {
  if (this.teileBestellenListenersBound) {
    return;
  }

  // Filter-Checkboxen mit Debounce
  const filterOffen = document.getElementById('teileFilterOffen');
  const filterBestellt = document.getElementById('teileFilterBestellt');
  const filterGeliefert = document.getElementById('teileFilterGeliefert');
  const filterZeitraum = document.getElementById('teileFilterZeitraum');
  
  // Debounce-Funktion um zu schnelle Aufrufe zu vermeiden
  let teileFilterTimeout = null;
  const debouncedLoad = () => {
    if (teileFilterTimeout) clearTimeout(teileFilterTimeout);
    teileFilterTimeout = setTimeout(() => this.loadTeileBestellungen(), 300);
  };
  
  if (filterOffen || filterBestellt || filterGeliefert || filterZeitraum) {
    this.teileBestellenListenersBound = true;
  }

  this.bindEventListenerOnce(filterOffen, 'change', debouncedLoad, 'TeileFilterOffen');
  this.bindEventListenerOnce(filterBestellt, 'change', debouncedLoad, 'TeileFilterBestellt');
  this.bindEventListenerOnce(filterGeliefert, 'change', debouncedLoad, 'TeileFilterGeliefert');
  this.bindEventListenerOnce(filterZeitraum, 'change', debouncedLoad, 'TeileFilterZeitraum');
};



  AppClass.prototype._escapeHtml = function(str) {
  return escapeHtml(str);
};



  AppClass.prototype.loadTeileBestellungen = async function() {
  const container = document.getElementById('teileBestellListe');
  if (!container) return;
  
  // Verhindere gleichzeitige Aufrufe
  if (this._loadingTeile) {
    console.log('Teile-Bestellungen werden bereits geladen, überspringe...');
    return;
  }
  this._loadingTeile = true;
  
  container.innerHTML = '<div class="teile-loading"><span class="spinner"></span> Lade Teile-Bestellungen...</div>';
  
  try {
    // Filter aus UI lesen
    const zeitraum = document.getElementById('teileFilterZeitraum')?.value || '7';
    const tage = zeitraum === 'alle' ? 365 : parseInt(zeitraum);
    
    const response = await TeileBestellService.getFaellige(tage);

    // Cache für Tab-Wechsel ohne Reload
    this._letzteTeileAntwort = response;

    // Badge-Zähler pro Status-Tab
    const alleFlat = response.alle || [];
    const ofBadge = document.getElementById('teileTabBadge_offen');
    const beBadge = document.getElementById('teileTabBadge_bestellt');
    const geBadge = document.getElementById('teileTabBadge_geliefert');
    if (ofBadge) ofBadge.textContent = alleFlat.filter(b => b.status === 'offen').length;
    if (beBadge) beBadge.textContent = alleFlat.filter(b => b.status === 'bestellt').length;
    if (geBadge) geBadge.textContent = alleFlat.filter(b => b.status === 'geliefert').length;
    
    // Statistik aktualisieren (alles aus einer Response)
    if (response.statistik) {
      const schwebendEl = document.getElementById('teileSchwebendCount');
      if (schwebendEl) schwebendEl.textContent = response.statistik.schwebend || 0;
      const dringendEl = document.getElementById('teileDringendCount');
      if (dringendEl) dringendEl.textContent = response.statistik.dringend || 0;
      const dieseWocheEl = document.getElementById('teileDieseWocheCount');
      if (dieseWocheEl) dieseWocheEl.textContent = response.statistik.dieseWoche || 0;
      const naechsteWocheEl = document.getElementById('teileNaechsteWocheCount');
      if (naechsteWocheEl) naechsteWocheEl.textContent = response.statistik.naechsteWoche || 0;
      const bestelltEl = document.getElementById('teileBestelltCount');
      if (bestelltEl) bestelltEl.textContent = response.statistik.bestellt || 0;
    }
    
    // Bestellungen gruppiert anzeigen
    this.renderTeileBestellungen(response.gruppiert, container);
    
    // Dropdowns werden LAZY geladen - erst wenn "Neue Bestellung" geklickt wird
    // this.loadTermineFuerTeileDropdown(); // Entfernt für Performance
    
  } catch (error) {
    console.error('Fehler beim Laden der Teile-Bestellungen:', error);
    container.innerHTML = `
      <div class="teile-error">
        ❌ Fehler beim Laden: ${error.message}
        <button onclick="app.loadTeileBestellungen()" class="btn btn-secondary">🔄 Erneut versuchen</button>
      </div>
    `;
  } finally {
    this._loadingTeile = false;
  }
}

/**
 * Rendert die Teile-Bestellungen gruppiert nach Dringlichkeit
 */;

  AppClass.prototype.renderTeileBestellungen = function(gruppiert, container) {
  const aktiverStatusTab = this._aktiveTeileStatusTab || 'offen';
  
  let html = '';
  
  // Funktion zum Filtern: nur Einträge des aktiven Status-Tabs
  const filterBestellung = (b) => b.status === aktiverStatusTab;
  
  // Kunden-Direkt (ohne Termin)
  const kundenDirektGefiltert = (gruppiert.kundenDirekt || []).filter(filterBestellung);
  if (kundenDirektGefiltert.length > 0) {
    html += this.renderTeileGruppe('👤 NUR KUNDE (ohne Termin)', 'kunden-direkt', kundenDirektGefiltert, false, true);
  }
  
  // Schwebende Termine (ohne festes Datum)
  const schwebendGefiltert = (gruppiert.schwebend || []).filter(filterBestellung);
  if (schwebendGefiltert.length > 0) {
    html += this.renderTeileGruppe('⏸️ SCHWEBENDE TERMINE', 'schwebend', schwebendGefiltert, true);
  }
  
  // Dringende Bestellungen (Termin heute/morgen)
  const dringendGefiltert = (gruppiert.dringend || []).filter(filterBestellung);
  if (dringendGefiltert.length > 0) {
    html += this.renderTeileGruppe('🔴 DRINGEND', 'dringend', dringendGefiltert);
  }
  
  // Diese Woche
  const dieseWocheGefiltert = (gruppiert.dieseWoche || []).filter(filterBestellung);
  if (dieseWocheGefiltert.length > 0) {
    html += this.renderTeileGruppe('🟡 Diese Woche', 'diese-woche', dieseWocheGefiltert);
  }
  
  // Nächste Woche
  const naechsteWocheGefiltert = (gruppiert.naechsteWoche || []).filter(filterBestellung);
  if (naechsteWocheGefiltert.length > 0) {
    html += this.renderTeileGruppe('🟢 Nächste Woche', 'naechste-woche', naechsteWocheGefiltert);
  }
  
  // Keine Bestellungen?
  if (html === '') {
    const emptyMessages = {
      offen: '🎉 Keine Teile müssen bestellt werden',
      bestellt: '📦 Keine bestellten Teile vorhanden',
      geliefert: '✅ Keine eingetroffenen Teile vorhanden'
    };
    html = `
      <div class="teile-leer">
        <span class="teile-leer-icon">📦</span>
        <p>${emptyMessages[aktiverStatusTab] || 'Keine Teile-Bestellungen für den ausgewählten Zeitraum'}</p>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

/**
 * Wechselt den aktiven Status-Tab im Teile-Bestellen-Tab
 * @param {string} status - 'offen' | 'bestellt' | 'geliefert'
 */;

  AppClass.prototype.teileStatusTabWechseln = function(status) {
  this._aktiveTeileStatusTab = status;

  // Tab-Buttons umschalten
  ['offen', 'bestellt', 'geliefert'].forEach(s => {
    const btn = document.getElementById(`teileTab_${s}`);
    if (btn) btn.classList.toggle('active', s === status);
  });

  // Kontextbezogene Aktions-Buttons
  const btnBestellt = document.getElementById('teileBtn_bestellt');
  const btnEingetroffen = document.getElementById('teileBtn_eingetroffen');
  if (btnBestellt) btnBestellt.style.display = status === 'offen' ? '' : 'none';
  if (btnEingetroffen) btnEingetroffen.style.display = status === 'bestellt' ? '' : 'none';

  // Neu rendern mit gecachten Daten (kein Netzwerk-Reload nötig)
  if (this._letzteTeileAntwort) {
    const container = document.getElementById('teileBestellListe');
    if (container) this.renderTeileBestellungen(this._letzteTeileAntwort.gruppiert, container);
  }
}

/**
 * Rendert eine Gruppe von Bestellungen
 * @param {string} titel - Gruppentitel
 * @param {string} klasse - CSS-Klasse
 * @param {Array} bestellungen - Bestellungen in der Gruppe
 * @param {boolean} istSchwebend - Ob es schwebende Termine sind
 * @param {boolean} istKundenDirekt - Ob es Kunden-direkt Bestellungen sind (ohne Termin)
 */;

  AppClass.prototype.renderTeileGruppe = function(titel, klasse, bestellungen, istSchwebend = false, istKundenDirekt = false) {
  // Gruppiere nach Termin oder Kunde
  const nachTermin = {};
  bestellungen.forEach(b => {
    // Bei Kunden-direkt: gruppiere nach kunde_id statt termin_id
    const key = istKundenDirekt ? `kunde_${b.kunde_id}` : b.termin_id;
    if (!nachTermin[key]) {
      nachTermin[key] = {
        termin: {
          id: istKundenDirekt ? null : b.termin_id,
          kundeId: b.kunde_id || b.direkt_kunde_id,
          datum: b.termin_datum,
          kunde: b.kunde_name || b.direkt_kunde_name,
          kennzeichen: b.kunde_kennzeichen || b.termin_kennzeichen,
          fahrzeug: b.termin_fahrzeug,
          arbeiten: b.termin_arbeiten,
          istSchwebend: b.ist_schwebend,
          prioritaet: b.schwebend_prioritaet || 'mittel',
          istKundenDirekt: istKundenDirekt
        },
        teile: []
      };
    }
    nachTermin[key].teile.push(b);
  });
  
  let html = `
    <div class="teile-gruppe ${klasse}">
      <div class="teile-gruppe-header">${titel}</div>
  `;
  
  Object.values(nachTermin).forEach(gruppe => {
    const t = gruppe.termin;
    
    // Für Kunden-direkt: Keine Datum-Anzeige
    let datumOderPrio;
    if (t.istKundenDirekt) {
      datumOderPrio = '👤 Ohne Termin';
    } else if (istSchwebend || t.istSchwebend) {
      const prioIcons = { hoch: '🔴', mittel: '🟡', niedrig: '🟢' };
      const prioLabels = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' };
      datumOderPrio = `${prioIcons[t.prioritaet] || '🟡'} Prio: ${prioLabels[t.prioritaet] || 'Mittel'}`;
    } else {
      datumOderPrio = t.datum ? new Date(t.datum).toLocaleDateString('de-DE', { 
        weekday: 'short', day: '2-digit', month: '2-digit' 
      }) : 'Unbekannt';
      datumOderPrio = `📅 ${datumOderPrio}`;
    }
    
    const datumFormatiert = t.datum ? new Date(t.datum).toLocaleDateString('de-DE', { 
      weekday: 'short', day: '2-digit', month: '2-digit' 
    }) : 'Unbekannt';
    
    html += `
      <div class="teile-termin-gruppe ${istSchwebend ? 'schwebend-termin' : ''} ${t.istKundenDirekt ? 'kunden-direkt-termin' : ''}">
        <div class="teile-termin-header">
          <span class="termin-datum">${datumOderPrio}</span>
          <span class="termin-kunde">${t.kunde || 'Unbekannt'}</span>
          <span class="termin-fahrzeug">${t.fahrzeug || ''} ${t.kennzeichen || ''}</span>
        </div>
        <div class="teile-termin-teile">
    `;
    
    gruppe.teile.forEach(teil => {
      // Prüfen ob es eine Teile-Status-Markierung vom Termin ist (kein echter Eintrag in teile_bestellungen)
      const istTeileStatusMarkierung = teil.ist_teile_status_markierung === true;
      // Prüfen ob es eine Arbeiten-Teile-Status-Markierung ist (aus arbeitszeiten_details JSON)
      const istArbeitenTeileStatus = teil.ist_arbeiten_teile_status === true;
      
      const statusClass = teil.status === 'bestellt' ? 'bestellt' : teil.status === 'geliefert' ? 'geliefert' : 'offen';
      const statusIcon = teil.status === 'bestellt' ? '📦' : teil.status === 'geliefert' ? '✅' : '⬜';
      
      if (istTeileStatusMarkierung || istArbeitenTeileStatus) {
        // Spezielle Anzeige für Termine mit teile_status = 'bestellen'
        const arbeitName = istArbeitenTeileStatus ? teil.fuer_arbeit : '';
        html += `
          <div class="teile-item teile-status-markierung ${statusClass}" data-termin-id="${teil.termin_id}">
            <div class="teile-status-icon">⚠️</div>
            <div class="teile-info">
              <span class="teil-name teil-name-warnung">${istArbeitenTeileStatus ? `Teile für: ${arbeitName}` : 'Teile müssen bestellt werden'}</span>
              <span class="teil-hinweis">Klicke auf "Bearbeiten", um konkrete Teile hinzuzufügen</span>
            </div>
            <div class="teile-arbeit">${teil.fuer_arbeit || ''}</div>
            <div class="teile-aktionen-item">
              <button class="btn-mini btn-primary" onclick="app.terminBearbeitenAusTeile(${teil.termin_id})" title="Termin bearbeiten">✏️ Bearbeiten</button>
              <button class="btn-mini btn-warning" onclick="app.arbeitenTeileStatusSetzen(${teil.termin_id}, '${(teil.fuer_arbeit || '').replace(/'/g, "\\'")}', 'bestellt')" title="Teile wurden bestellt">📦 Teile bestellt</button>
              <button class="btn-mini btn-success" onclick="app.arbeitenTeileStatusSetzen(${teil.termin_id}, '${(teil.fuer_arbeit || '').replace(/'/g, "\\'")}', 'eingetroffen')" title="Teile eingetroffen">✅ Eingetroffen</button>
              <button class="btn-mini btn-secondary" onclick="app.arbeitenTeileStatusAufLoesen(${teil.termin_id}, '${(teil.fuer_arbeit || '').replace(/'/g, "\\'")}')" title="Als erledigt/vorrätig markieren">🟢 Erlädigt</button>
            </div>
          </div>
        `;
      } else {
        // Normale Teile-Bestellung
        html += `
          <div class="teile-item ${statusClass}" data-id="${teil.id}">
            <label class="teile-checkbox">
              <input type="checkbox" class="teil-select" data-id="${teil.id}" ${teil.status !== 'offen' ? 'disabled' : ''}>
              <span class="status-icon">${statusIcon}</span>
            </label>
            <div class="teile-info">
              <span class="teil-name">${teil.teil_name}</span>
              ${teil.teil_oe_nummer ? `<span class="teil-oe">OE: ${teil.teil_oe_nummer}</span>` : ''}
              ${teil.menge > 1 ? `<span class="teil-menge">x${teil.menge}</span>` : ''}
            </div>
            <div class="teile-arbeit">${teil.fuer_arbeit || ''}</div>
            <div class="teile-aktionen-item">
              ${teil.status === 'offen' ? `
                <button class="btn-mini btn-primary" onclick="app.teileStatusAendern(${teil.id}, 'bestellt')" title="Als bestellt markieren">📦</button>
              ` : ''}
              ${teil.status === 'bestellt' ? `
                <button class="btn-mini btn-success" onclick="app.teileStatusAendern(${teil.id}, 'geliefert')" title="Als geliefert markieren">✅</button>
              ` : ''}
              <button class="btn-mini btn-danger" onclick="app.teileLoeschen(${teil.id})" title="Löschen">🗑️</button>
            </div>
          </div>
        `;
      }
    });
    
    html += `
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  return html;
}

/**
 * Lazy-Loading für Termine-Dropdown (nur beim ersten Klick)
 */;

  AppClass.prototype.loadTermineFuerTeileDropdownLazy = async function() {
  const select = document.getElementById('teileNeuTermin');
  if (!select) return;
  
  // Nur laden wenn noch nicht geladen
  if (this._termineDropdownGeladen) return;
  this._termineDropdownGeladen = true;
  
  select.innerHTML = '<option value="">⏳ Lade Termine...</option>';
  await this.loadTermineFuerTeileDropdown();
}

/**
 * Lazy-Loading für Kunden-Dropdown (nur beim ersten Klick)
 */

/**
 * Lädt Termine für das Dropdown bei neuer Bestellung
 */;

  AppClass.prototype.loadTermineFuerTeileDropdown = async function() {
  const select = document.getElementById('teileNeuTermin');
  if (!select) return;
  
  try {
    // OPTIMIERT: Nutze kompakten Dropdown-Endpoint (nur ID, Name, Datum)
    const response = await ApiService.get('/termine/dropdown');
    const termine = response.termine || [];
    const schwebende = response.schwebende || [];
    
    select.innerHTML = '<option value="">-- Termin auswählen --</option>';
    
    // Schwebende Termine zuerst (mit Optgroup)
    if (schwebende.length > 0) {
      select.innerHTML += '<optgroup label="⏸️ Schwebende Termine">';
      schwebende.forEach(t => {
        const kunde = t.kunde_name || 'Unbekannt';
        const prioIcon = { hoch: '🔴', mittel: '🟡', niedrig: '🟢' }[t.schwebend_prioritaet] || '🟡';
        select.innerHTML += `<option value="${t.id}">${prioIcon} ${kunde} (${t.fahrzeugtyp || t.kennzeichen || 'Fahrzeug'})</option>`;
      });
      select.innerHTML += '</optgroup>';
    }
    
    // Normale Termine
    if (termine.length > 0) {
      select.innerHTML += '<optgroup label="📅 Geplante Termine">';
      termine.forEach(t => {
        const datum = new Date(t.datum).toLocaleDateString('de-DE');
        const kunde = t.kunde_name || 'Unbekannt';
        select.innerHTML += `<option value="${t.id}">${datum} - ${kunde} (${t.fahrzeugtyp || t.kennzeichen || 'Fahrzeug'})</option>`;
      });
      select.innerHTML += '</optgroup>';
    }
  } catch (error) {
    console.error('Fehler beim Laden der Termine:', error);
    select.innerHTML = '<option value="">Fehler beim Laden</option>';
  }
}

/**
 * Lädt Kunden für das Dropdown bei neuer Bestellung (ohne Termin)
 */

/**
 * Wechselt zwischen Termin- und Kunden-Zuordnung
 */;

  AppClass.prototype.teileZuordnungGeaendert = function() {
  const zuordnung = document.getElementById('teileNeuZuordnung')?.value || 'termin';
  const terminSelect = document.getElementById('teileNeuTermin');
  const kundeSelect = document.getElementById('teileNeuKunde');
  
  if (zuordnung === 'termin') {
    terminSelect.style.display = '';
    kundeSelect.style.display = 'none';
    terminSelect.required = true;
    kundeSelect.required = false;
  } else {
    terminSelect.style.display = 'none';
    kundeSelect.style.display = '';
    terminSelect.required = false;
    kundeSelect.required = true;
  }
}

/**
 * Alle Teile-Checkboxen auswählen/abwählen
 */;

  AppClass.prototype.teileAlleAuswaehlen = function() {
  const checkboxen = document.querySelectorAll('.teil-select:not(:disabled)');
  const alleAusgewaehlt = Array.from(checkboxen).every(cb => cb.checked);
  
  checkboxen.forEach(cb => {
    cb.checked = !alleAusgewaehlt;
  });
  
  this.showToast(alleAusgewaehlt ? 'Auswahl aufgehoben' : 'Alle ausgewählt', 'info');
}

/**
 * Ausgewählte Teile als bestellt markieren
 */;

  AppClass.prototype.teileAlsBestellt = async function() {
  const ausgewaehlt = Array.from(document.querySelectorAll('.teil-select:checked'))
    .map(cb => parseInt(cb.dataset.id));
  
  if (ausgewaehlt.length === 0) {
    this.showToast('Bitte wählen Sie Teile aus', 'warning');
    return;
  }
  
  try {
    await TeileBestellService.markAlsBestellt(ausgewaehlt);
    this.showToast(`${ausgewaehlt.length} Teile als bestellt markiert`, 'success');
    this.loadTeileBestellungen();
  } catch (error) {
    console.error('Fehler beim Markieren:', error);
    this.showToast('Fehler: ' + error.message, 'error');
  }
}

/**
 * Ausgewählte Teile als eingetroffen (geliefert) markieren
 */;

  AppClass.prototype.teileAlsEingetroffen = async function() {
  const ausgewaehlt = Array.from(document.querySelectorAll('.teil-select:checked'))
    .map(cb => parseInt(cb.dataset.id));
  
  if (ausgewaehlt.length === 0) {
    this.showToast('Bitte wählen Sie Teile aus', 'warning');
    return;
  }
  
  try {
    await TeileBestellService.markAlsEingetroffen(ausgewaehlt);
    this.showToast(`${ausgewaehlt.length} Teile als eingetroffen markiert`, 'success');
    this.loadTeileBestellungen();
  } catch (error) {
    console.error('Fehler beim Markieren:', error);
    this.showToast('Fehler: ' + error.message, 'error');
  }
}

/**
 * Status einer einzelnen Bestellung ändern
 */;

  AppClass.prototype.teileStatusAendern = async function(id, status) {
  try {
    await TeileBestellService.updateStatus(id, status);
    this.showToast(`Status geändert: ${status}`, 'success');
    this.loadTeileBestellungen();
  } catch (error) {
    console.error('Fehler beim Status-Update:', error);
    this.showToast('Fehler: ' + error.message, 'error');
  }
}

/**
 * Bestellung löschen
 */;

  AppClass.prototype.teileLoeschen = async function(id) {
  if (!confirm('Bestellung wirklich löschen?')) return;
  
  try {
    await TeileBestellService.delete(id);
    this.showToast('Bestellung gelöscht', 'success');
    this.loadTeileBestellungen();
  } catch (error) {
    console.error('Fehler beim Löschen:', error);
    this.showToast('Fehler: ' + error.message, 'error');
  }
}

/**
 * Neue Bestellung hinzufügen
 * Unterstützt sowohl Termin- als auch Kunden-Zuordnung
 */;

  AppClass.prototype.teileNeuHinzufuegen = async function() {
  const zuordnung = document.getElementById('teileNeuZuordnung')?.value || 'termin';
  const terminId = document.getElementById('teileNeuTermin')?.value;
  const kundeId = document.getElementById('teileNeuKunde')?.value;
  const name = document.getElementById('teileNeuName')?.value?.trim();
  const oe = document.getElementById('teileNeuOE')?.value?.trim();
  const menge = parseInt(document.getElementById('teileNeuMenge')?.value) || 1;
  const arbeit = document.getElementById('teileNeuArbeit')?.value?.trim();
  
  if (!name) {
    this.showToast('Bitte Teilename angeben', 'warning');
    return;
  }
  
  if (zuordnung === 'termin' && !terminId) {
    this.showToast('Bitte Termin auswählen', 'warning');
    return;
  }
  
  if (zuordnung === 'kunde' && !kundeId) {
    this.showToast('Bitte Kunde auswählen', 'warning');
    return;
  }
  
  try {
    const bestellDaten = {
      teil_name: name,
      teil_oe_nummer: oe || null,
      menge: menge,
      fuer_arbeit: arbeit || null
    };
    
    if (zuordnung === 'termin') {
      bestellDaten.termin_id = parseInt(terminId);
    } else {
      bestellDaten.kunde_id = parseInt(kundeId);
    }
    
    await TeileBestellService.create(bestellDaten);
    
    this.showToast('Bestellung hinzugefügt', 'success');
    
    // Felder leeren
    document.getElementById('teileNeuName').value = '';
    document.getElementById('teileNeuOE').value = '';
    document.getElementById('teileNeuMenge').value = '1';
    document.getElementById('teileNeuArbeit').value = '';
    
    this.loadTeileBestellungen();
  } catch (error) {
    console.error('Fehler beim Hinzufügen:', error);
    this.showToast('Fehler: ' + error.message, 'error');
  }
}

/**
 * Druckt die aktuelle Teile-Bestellliste
 */;

  AppClass.prototype.teileDrucken = function() {
  const liste = document.getElementById('teileBestellListe');
  if (!liste) return;
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Teile-Bestellliste</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #333; border-bottom: 2px solid #ac1e44; padding-bottom: 10px; }
        .teile-gruppe { margin: 20px 0; }
        .teile-gruppe-header { font-weight: bold; font-size: 1.2em; margin-bottom: 10px; }
        .teile-termin-gruppe { border: 1px solid #ddd; margin: 10px 0; padding: 10px; }
        .teile-termin-header { background: #f5f5f5; padding: 8px; margin: -10px -10px 10px -10px; }
        .teile-item { padding: 5px 0; border-bottom: 1px dotted #eee; display: flex; gap: 10px; }
        .teil-name { font-weight: bold; }
        .teil-oe { color: #666; }
        .status-icon { margin-right: 5px; }
        .dringend .teile-gruppe-header { color: #c62828; }
        .diese-woche .teile-gruppe-header { color: #f57c00; }
        .naechste-woche .teile-gruppe-header { color: #388e3c; }
        .teile-aktionen-item, .teile-checkbox input { display: none; }
        @media print { .no-print { display: none; } }
      </style>
    </head>
    <body>
      <h1>🛒 Teile-Bestellliste</h1>
      <p>Stand: ${new Date().toLocaleString('de-DE')}</p>
      ${liste.innerHTML}
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
}

/**
 * Öffnet den Termin zur Bearbeitung aus dem Teile-Bestellen Tab
 * @param {number} terminId - ID des Termins
 */;

  AppClass.prototype.terminBearbeitenAusTeile = async function(terminId) {
  try {
    // Lade den Termin zuerst
    const termin = await ApiService.get(`/termine/${terminId}`);
    
    if (!termin) {
      this.showToast('Termin nicht gefunden', 'error');
      return;
    }
    
    // Speichere Termin im Cache
    this.termineById[terminId] = termin;
    
    // Öffne Termin-Details-Modal direkt
    await this.showTerminDetails(terminId);
    
    this.showToast('Termin geladen - hier können Sie Teile hinzufügen', 'info');
  } catch (error) {
    console.error('Fehler beim Laden des Termins:', error);
    this.showToast('Fehler beim Laden des Termins', 'error');
  }
}

/**
 * Setzt den teile_status eines Termins auf 'vorraetig' (als erledigt markieren)
 * @param {number} terminId - ID des Termins
 */;

  AppClass.prototype.teileStatusAufLoesen = async function(terminId) {
  try {
    // Bestätigung anfordern
    if (!confirm('Soll der Teile-Status auf "Vorrätig" gesetzt werden?')) {
      return;
    }
    
    // Termin laden
    const termin = await ApiService.get(`/termine/${terminId}`);
    
    if (!termin) {
      this.showToast('Termin nicht gefunden', 'error');
      return;
    }
    
    // Teile-Status auf vorrätig setzen
    await ApiService.put(`/termine/${terminId}`, {
      ...termin,
      teile_status: 'vorraetig'
    });
    
    this.showToast('Teile-Status aktualisiert', 'success');
    this.loadTeileBestellungen();
  } catch (error) {
    console.error('Fehler beim Aktualisieren:', error);
    this.showToast('Fehler: ' + error.message, 'error');
  }
}

/**
 * Setzt den teile_status einer Arbeit im arbeitszeiten_details JSON auf 'vorraetig'
 * @param {number} terminId - ID des Termins
 * @param {string} arbeitName - Name der Arbeit
 */
/**
 * Teile-Status einer Arbeit setzen (bestellt / eingetroffen)
 * Aktualisiert arbeitszeiten_details JSON-Feld im Termin
 */;

  AppClass.prototype.arbeitenTeileStatusSetzen = async function(terminId, arbeitName, neuerStatus) {
  try {
    const termin = await ApiService.get(`/termine/${terminId}`);
    if (!termin) { this.showToast('Termin nicht gefunden', 'error'); return; }
    
    let details = {};
    try {
      details = typeof termin.arbeitszeiten_details === 'string'
        ? JSON.parse(termin.arbeitszeiten_details || '{}')
        : (termin.arbeitszeiten_details || {});
    } catch (e) { details = {}; }

    // Status setzen: 'bestellt' bleibt als teile_status sichtbar, 'eingetroffen' = vorraetig
    const dbStatus = neuerStatus === 'eingetroffen' ? 'vorraetig' : 'bestellt';

    if (details[arbeitName] && typeof details[arbeitName] === 'object') {
      details[arbeitName].teile_status = dbStatus;
    } else {
      // Auch am Termin-Level setzen (für einfache Markierungen ohne arbeitszeiten_details)
      await ApiService.put(`/termine/${terminId}`, {
        ...termin,
        teile_status: dbStatus
      });
      const label = neuerStatus === 'eingetroffen' ? 'Eingetroffen' : 'Bestellt';
      this.showToast(`Teile-Status: ${label} ✅`, 'success');
      this.loadTeileBestellungen();
      return;
    }

    await ApiService.put(`/termine/${terminId}`, {
      ...termin,
      arbeitszeiten_details: JSON.stringify(details)
    });

    const label = neuerStatus === 'eingetroffen' ? 'Eingetroffen ✅' : 'Bestellt 📦';
    this.showToast(`Teile-Status: ${label}`, 'success');
    this.loadTeileBestellungen();
  } catch (error) {
    console.error('Fehler beim Setzen des Teile-Status:', error);
    this.showToast('Fehler: ' + error.message, 'error');
  }
};

  AppClass.prototype.arbeitenTeileStatusAufLoesen = async function(terminId, arbeitName) {
  try {
    // Bestätigung anfordern
    if (!confirm(`Soll der Teile-Status für "${arbeitName}" auf "Vorrätig" gesetzt werden?`)) {
      return;
    }
    
    // Termin laden
    const termin = await ApiService.get(`/termine/${terminId}`);
    
    if (!termin) {
      this.showToast('Termin nicht gefunden', 'error');
      return;
    }
    
    // arbeitszeiten_details parsen und aktualisieren
    let details = {};
    try {
      details = typeof termin.arbeitszeiten_details === 'string' 
        ? JSON.parse(termin.arbeitszeiten_details || '{}')
        : (termin.arbeitszeiten_details || {});
    } catch (e) {
      console.error('Fehler beim Parsen von arbeitszeiten_details:', e);
      details = {};
    }
    
    // Teile-Status für die spezifische Arbeit auf 'vorraetig' setzen
    if (details[arbeitName] && typeof details[arbeitName] === 'object') {
      details[arbeitName].teile_status = 'vorraetig';
    }
    
    // Termin aktualisieren
    await ApiService.put(`/termine/${terminId}`, {
      ...termin,
      arbeitszeiten_details: JSON.stringify(details)
    });
    
    this.showToast('Teile-Status auf "Vorrätig" gesetzt ✅', 'success');
    this.loadTeileBestellungen();
  } catch (error) {
    console.error('Fehler beim Aktualisieren:', error);
    this.showToast('Teile-Status auf "Vorrätig" gesetzt ✅', 'error');
  }
}

// ==================== KI-PLANUNGS-FUNKTIONEN ====================

/**
 * Auslastungs-Warnungen für einen Tag laden und im Banner anzeigen (nicht blockierend)
 */;
}
