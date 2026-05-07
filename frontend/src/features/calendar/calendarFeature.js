export function installCalendarFeature(AppClass) {
  AppClass.prototype.loadKalender = function() {
  if (!this.kalenderState.datum) {
    this.kalenderState.datum = this.getToday();
  }
  if (!this.kalenderState.initialized) {
    this.kalenderState.initialized = true;
    this.bindKalenderEvents();
  }
  this.updateKalenderDatumDisplay();
  // Standard-Sub-Tab laden falls noch nicht geschehen
  const activeSubTab = this.kalenderState.activeSubTab || 'kalenderWoche';
  this.kalenderLoadActiveSubTab(activeSubTab);
}

/**
 * Event-Listener für den Kalender-Tab binden
 */;

  AppClass.prototype.bindKalenderEvents = function() {
  const kalenderContainer = document.getElementById('kalender');
  if (!kalenderContainer) return;

  // Navigation
  const prevBtn = document.getElementById('kalenderPrev');
  const nextBtn = document.getElementById('kalenderNext');
  const heuteBtn = document.getElementById('kalenderHeute');
  if (prevBtn) prevBtn.addEventListener('click', () => this.kalenderNavigate(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => this.kalenderNavigate(1));
  if (heuteBtn) heuteBtn.addEventListener('click', () => this.kalenderGoToToday());

  // Ansichts-Toggle (Zeitleiste / Liste)
  kalenderContainer.querySelectorAll('.kalender-ansicht-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const ansicht = e.currentTarget.dataset.ansicht;
      this.toggleKalenderAnsicht(ansicht);
    });
  });

  // Sub-Tab-Wechsel: Ansicht laden und auf heute springen
  kalenderContainer.querySelectorAll('.kalender-sub-tabs .sub-tab-button').forEach(btn => {
    btn.addEventListener('click', () => {
      const subTab = btn.dataset.subtab;
      if (subTab) {
        this.kalenderState.activeSubTab = subTab;
        this.kalenderState.datum = this.getToday();
        this.updateKalenderDatumDisplay();
        this.kalenderLoadActiveSubTab(subTab);
      }
    });
  });
}

/**
 * Navigation: +1 / -1 je nach aktiver Sub-Tab-Ansicht
 */;

  AppClass.prototype.kalenderNavigate = function(direction) {
  const d = new Date(this.kalenderState.datum);
  switch (this.kalenderState.activeSubTab) {
    case 'kalenderTag':
      d.setDate(d.getDate() + direction);
      break;
    case 'kalenderWoche':
      d.setDate(d.getDate() + (7 * direction));
      break;
    case 'kalenderMonat':
      d.setMonth(d.getMonth() + direction);
      break;
    case 'kalenderJahr':
      d.setFullYear(d.getFullYear() + direction);
      break;
  }
  this.kalenderState.datum = d;
  this.updateKalenderDatumDisplay();
  this.kalenderLoadActiveSubTab(this.kalenderState.activeSubTab);
}

/**
 * Zum heutigen Datum springen
 */;

  AppClass.prototype.kalenderGoToToday = function() {
  this.kalenderState.datum = this.getToday();
  this.updateKalenderDatumDisplay();
  this.kalenderLoadActiveSubTab(this.kalenderState.activeSubTab);
}

/**
 * Aktiven Sub-Tab laden
 */;

  AppClass.prototype.kalenderLoadActiveSubTab = function(subTab) {
  switch (subTab) {
    case 'kalenderTag': this.loadKalenderTag(); break;
    case 'kalenderWoche': this.loadKalenderWoche(); break;
    case 'kalenderMonat': this.loadKalenderMonat(); break;
    case 'kalenderJahr': this.loadKalenderJahr(); break;
  }
}

/**
 * Datum-Anzeige aktualisieren
 */;

  AppClass.prototype.updateKalenderDatumDisplay = function() {
  const display = document.getElementById('kalenderDatumDisplay');
  if (!display) return;
  const d = this.kalenderState.datum;
  const wochentage = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const monate = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  
  switch (this.kalenderState.activeSubTab) {
    case 'kalenderTag':
      display.textContent = `${wochentage[d.getDay()]}, ${d.getDate()}. ${monate[d.getMonth()]} ${d.getFullYear()}`;
      break;
    case 'kalenderWoche': {
      const montag = this.kalenderGetMontag(d);
      const sonntag = new Date(montag);
      sonntag.setDate(sonntag.getDate() + 6);
      const kw = this.kalenderGetKW(d);
      display.textContent = `KW ${kw}: ${montag.getDate()}.${montag.getMonth()+1}. – ${sonntag.getDate()}.${sonntag.getMonth()+1}.${sonntag.getFullYear()}`;
      break;
    }
    case 'kalenderMonat':
      display.textContent = `${monate[d.getMonth()]} ${d.getFullYear()}`;
      break;
    case 'kalenderJahr':
      display.textContent = `${d.getFullYear()}`;
      break;
  }
}

/**
 * Ansicht umschalten (Zeitleiste / Liste)
 */;

  AppClass.prototype.toggleKalenderAnsicht = function(ansicht) {
  this.kalenderState.ansicht = ansicht;
  // Toggle-Buttons aktualisieren
  const container = document.getElementById('kalender');
  if (container) {
    container.querySelectorAll('.kalender-ansicht-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.ansicht === ansicht);
    });
  }
  // Aktiven Sub-Tab neu rendern
  this.kalenderLoadActiveSubTab(this.kalenderState.activeSubTab);
}

// --- Hilfsfunktionen ---;

  AppClass.prototype.kalenderGetMontag = function(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

  AppClass.prototype.kalenderGetKW = function(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
};

  AppClass.prototype.kalenderFormatDatum = function(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

  AppClass.prototype.kalenderIstHeute = function(d) {
  const heute = this.getToday();
  return d.getFullYear() === heute.getFullYear() && d.getMonth() === heute.getMonth() && d.getDate() === heute.getDate();
};

  AppClass.prototype.kalenderGetStatusCSS = function(status) {
  if (!status) return '';
  return 'status-' + status.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '_');
};

  AppClass.prototype.kalenderGetStatusFarbe = function(status) {
  const map = {
    'geplant': '#ffc107', 'offen': '#ffc107',
    'in_bearbeitung': '#17a2b8', 'in bearbeitung': '#17a2b8',
    'abgeschlossen': '#28a745',
    'storniert': '#dc3545'
  };
  return map[(status || '').toLowerCase()] || '#6c757d';
};

  AppClass.prototype.kalenderGetStatusLabel = function(status) {
  const map = {
    'geplant': 'Geplant', 'offen': 'Offen',
    'in_bearbeitung': 'In Arbeit', 'in bearbeitung': 'In Arbeit',
    'abgeschlossen': 'Fertig',
    'storniert': 'Storniert'
  };
  return map[(status || '').toLowerCase()] || status || '—';
}

/**
 * Termine für einen Datumsbereich laden (aus Cache oder API)
 */;

  AppClass.prototype.kalenderLadeTermine = async function(datumVon, datumBis) {
  try {
    // Alle Termine laden und im Frontend filtern
    const response = await TermineService.getAll();
    const alle = response.termine || response || [];
    const von = datumVon;
    const bis = datumBis;
    return alle.filter(t => {
      const d = t.datum;
      return d >= von && d <= bis && !t.geloescht_am;
    });
  } catch (err) {
    console.error('Kalender: Fehler beim Laden der Termine:', err);
    return [];
  }
}

/**
 * Abwesenheiten für einen Datumsbereich laden
 */;

  AppClass.prototype.kalenderLadeAbwesenheiten = async function(datumVon, datumBis) {
  try {
    const response = await EinstellungenService.getAbwesenheitenByDateRange(datumVon, datumBis);
    return response.abwesenheiten || response || [];
  } catch (err) {
    console.error('Kalender: Fehler beim Laden der Abwesenheiten:', err);
    return [];
  }
}

// =====================================================
// ========== TAGESANSICHT =============================
// =====================================================;

  AppClass.prototype.loadKalenderTag = async function() {
  const datum = this.kalenderState.datum;
  const datumStr = this.kalenderFormatDatum(datum);
  const wochentage = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  
  // Header
  const header = document.getElementById('kalenderTagHeader');
  if (header) {
    header.innerHTML = `
      <span class="tag-datum">${wochentage[datum.getDay()]}, ${datum.getDate()}.${datum.getMonth()+1}.${datum.getFullYear()}</span>
      <button class="kalender-tag-neu-btn" data-datum="${datumStr}">➕ Neuer Termin</button>
    `;
    header.querySelector('.kalender-tag-neu-btn')?.addEventListener('click', () => {
      this.openKalenderNeuerTerminModal(datumStr, '08:00');
    });
  }

  // Termine laden
  const termine = await this.kalenderLadeTermine(datumStr, datumStr);
  
  // Abwesenheiten
  const abwesenheiten = await this.kalenderLadeAbwesenheiten(datumStr, datumStr);
  const abwContainer = document.getElementById('kalenderTagAbwesenheiten');
  if (abwContainer) {
    if (abwesenheiten.length > 0) {
      abwContainer.innerHTML = abwesenheiten.map(a => `
        <div class="kalender-abwesenheit-bar">
          <span class="abw-icon">${a.grund === 'Urlaub' ? '🏖️' : a.grund === 'Krank' ? '🤒' : a.grund === 'Lehrgang' ? '📚' : a.grund === 'Berufsschule' ? '🎓' : '📋'}</span>
          <span>${a.person_name || 'Mitarbeiter'}: ${a.grund || 'Abwesend'}${a.ganztags ? ' (ganztags)' : ''}</span>
        </div>
      `).join('');
    } else {
      abwContainer.innerHTML = '';
    }
  }

  // Auslastungsdaten laden (für Mitarbeiter-Karten und Mitarbeiter-Ansicht)
  let auslastung = null;
  try {
    auslastung = await AuslastungService.getByDatum(datumStr);
    this.renderKalenderTagMitarbeiterKarten(auslastung, datumStr);
  } catch (e) {
    console.warn('Tagesansicht: Fehler beim Laden der Auslastung', e);
  }

  // Zeitleiste, Liste oder Mitarbeiter rendern
  const zeitleisteEl = document.getElementById('kalenderTagZeitleiste');
  const listeEl = document.getElementById('kalenderTagListe');
  const maEl = document.getElementById('kalenderTagMitarbeiter');

  const ansicht = this.kalenderState.ansicht;
  if (zeitleisteEl) zeitleisteEl.style.display = ansicht === 'zeitleiste' ? 'block' : 'none';
  if (listeEl) listeEl.style.display = ansicht === 'liste' ? 'block' : 'none';
  if (maEl) maEl.style.display = ansicht === 'mitarbeiter' ? 'block' : 'none';

  if (ansicht === 'zeitleiste') {
    this.renderKalenderTagZeitleiste(termine, zeitleisteEl);
  } else if (ansicht === 'liste') {
    this.renderKalenderTagListe(termine, listeEl, datumStr);
  } else if (ansicht === 'mitarbeiter') {
    this.renderKalenderTagMitarbeiter(termine, maEl, datumStr, auslastung, abwesenheiten);
  }
};

  AppClass.prototype.renderKalenderTagMitarbeiterKarten = function(data, datumStr) {
  const container = document.getElementById('kalenderTagMitarbeiterKarten');
  if (!container) return;

  const personen = [
    ...(data.mitarbeiter_auslastung || []).map(ma => ({ ...ma, _typ: 'mitarbeiter' })),
    ...(data.lehrlinge_auslastung || []).map(la => ({ ...la, _typ: 'lehrling' }))
  ];

  if (personen.length === 0) {
    container.innerHTML = '';
    return;
  }

  const karten = personen.map(p => {
    const istAbwesend = p.ist_abwesend === true;
    const abwesenheitsTyp = p.abwesenheits_typ || '';
    const prozent = istAbwesend ? 0 : (p.auslastung_prozent || 0);
    const name = p.mitarbeiter_name || p.lehrling_name || p.name || '–';

    const abwesendIcons = { urlaub: '🏖️', krank: '🤒', berufsschule: '🏫', lehrgang: '📚' };
    const abwIcon = abwesendIcons[abwesenheitsTyp] || '🏥';

    const farbe = prozent > 100 ? '#f44336' : prozent > 80 ? '#ff9800' : prozent > 50 ? '#ffc107' : '#4caf50';
    const balkenBreite = Math.min(prozent, 100);

    const lehrlingBadge = p._typ === 'lehrling'
      ? '<span class="ktma-badge ktma-badge-lehrling">Lehrling</span>'
      : '';

    if (istAbwesend) {
      return `
        <div class="ktma-karte ktma-abwesend">
          <div class="ktma-name">${this.escapeHtml(name)}${lehrlingBadge}</div>
          <div class="ktma-abw-icon">${abwIcon}</div>
        </div>`;
    }

    const belegtMin = p.belegt_minuten || 0;
    const verfuegbarMin = p.verfuegbar_minuten || 0;
    const terminAnzahl = p.termin_anzahl || 0;

    return `
      <div class="ktma-karte">
        <div class="ktma-name">${this.escapeHtml(name)}${lehrlingBadge}</div>
        <div class="ktma-balken-wrap">
          <div class="ktma-balken">
            <div class="ktma-balken-fill" style="width:${balkenBreite}%;background:${farbe};"></div>
          </div>
          <span class="ktma-prozent" style="color:${farbe}">${prozent}%</span>
        </div>
        <div class="ktma-details">${this.formatMinutesToHours(belegtMin)} / ${this.formatMinutesToHours(verfuegbarMin)} · ${terminAnzahl} Termin${terminAnzahl !== 1 ? 'e' : ''}</div>
      </div>`;
  });

  container.innerHTML = `<div class="ktma-grid">${karten.join('')}</div>`;
}

/**
 * Tagesansicht: Zeitleiste rendern (8:00 - 18:00)
 */;

  AppClass.prototype.renderKalenderTagZeitleiste = function(termine, container) {
  if (!container) return;
  const startStunde = 7;
  const endStunde = 18;
  const slotHoehe = 50; // px pro Stunde

  // Termine ohne Uhrzeit separat oben anzeigen
  const ohneZeit = termine.filter(t => !t.bring_zeit && !t.startzeit && !t.abholung_zeit);
  const mitZeit = termine.filter(t => t.bring_zeit || t.startzeit || t.abholung_zeit);

  let ohneZeitHtml = '';
  if (ohneZeit.length > 0) {
    ohneZeitHtml = `<div class="kalender-ohne-zeit-section">
      <div class="ohne-zeit-header">📋 Ohne Uhrzeit</div>
      <div class="ohne-zeit-liste">${ohneZeit.map(t => {
        const statusClass = this.kalenderGetStatusCSS(t.status);
        const arbeiten = (t.arbeit || '').split('\n').filter(Boolean);
        return `<div class="ohne-zeit-termin ${statusClass}" data-termin-id="${t.id}">
          <span class="ohne-zeit-nr">${t.termin_nr || ''}</span>
          <span class="ohne-zeit-kunde">${t.kunde_name || 'Unbekannt'}</span>
          ${t.kennzeichen ? `<span class="ohne-zeit-kz">${t.kennzeichen}</span>` : ''}
          <span class="ohne-zeit-arbeit">${arbeiten[0] || ''}</span>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  let html = '';
  for (let h = startStunde; h <= endStunde; h++) {
    const zeitLabel = `${String(h).padStart(2, '0')}:00`;
    html += `
      <div class="kalender-zeit-spalte">
        <div class="kalender-zeit-label">${zeitLabel}</div>
        <div class="kalender-zeit-slot" data-stunde="${h}" data-datum="${this.kalenderFormatDatum(this.kalenderState.datum)}">
          <div class="slot-halbstunde"></div>
        </div>
      </div>
    `;
  }
  container.innerHTML = ohneZeitHtml + html;

  // Klick auf Ohne-Zeit-Karten
  container.querySelectorAll('.ohne-zeit-termin').forEach(el => {
    el.addEventListener('click', () => this.kalenderTerminClick(parseInt(el.dataset.terminId)));
  });

  // Termin-Blöcke positionieren (nur Termine MIT Uhrzeit)
  mitZeit.forEach(termin => {
    const startzeit = termin.bring_zeit || termin.startzeit || termin.abholung_zeit || '08:00';
    const istAbgeschlossen = termin.status === 'abgeschlossen' && termin.tatsaechliche_zeit > 0;
    const dauer = istAbgeschlossen ? termin.tatsaechliche_zeit : (termin.geschaetzte_zeit || 60);
    const [sh, sm] = startzeit.split(':').map(Number);
    if (isNaN(sh)) return;
    const topOffset = (sh - startStunde + sm / 60) * slotHoehe;
    const height = Math.max((dauer / 60) * slotHoehe, 25);
    const statusClass = this.kalenderGetStatusCSS(termin.status);
    const schwebendClass = termin.ist_schwebend ? ' schwebend' : '';
    
    const block = document.createElement('div');
    block.className = `kalender-termin-block ${statusClass}${schwebendClass}`;
    block.style.top = `${topOffset}px`;
    block.style.height = `${height}px`;
    block.dataset.terminId = termin.id;
    
    const arbeiten = (termin.arbeit || '').split('\n').filter(Boolean);
    block.innerHTML = `
      <div class="termin-block-zeit">${startzeit} (${dauer} Min.${istAbgeschlossen ? ' ✓' : ''})</div>
      <div class="termin-block-titel">${termin.kunde_name || 'Unbekannt'} · ${termin.kennzeichen || ''}</div>
      <div class="termin-block-arbeit">${arbeiten[0] || ''}${arbeiten.length > 1 ? ` +${arbeiten.length - 1}` : ''}</div>
    `;
    block.addEventListener('click', () => this.kalenderTerminClick(termin.id));
    container.appendChild(block);
  });

  // Klick auf leere Slots → neuer Termin
  container.querySelectorAll('.kalender-zeit-slot').forEach(slot => {
    slot.addEventListener('click', (e) => {
      if (e.target.closest('.kalender-termin-block')) return;
      const stunde = slot.dataset.stunde;
      const datum = slot.dataset.datum;
      this.openKalenderNeuerTerminModal(datum, `${String(stunde).padStart(2, '0')}:00`);
    });
  });

  // "Jetzt"-Linie
  if (this.kalenderIstHeute(this.kalenderState.datum)) {
    const jetzt = new Date();
    const jetztH = jetzt.getHours();
    const jetztM = jetzt.getMinutes();
    const jetztZeit = `${String(jetztH).padStart(2,'0')}:${String(jetztM).padStart(2,'0')}`;
    if (jetztH >= startStunde && jetztH <= endStunde) {
      const jetztTop = (jetztH - startStunde + jetztM / 60) * slotHoehe;
      const jetztLinie = document.createElement('div');
      jetztLinie.style.cssText = `position:absolute;left:70px;right:0;top:${jetztTop}px;height:2px;background:var(--accent);z-index:20;pointer-events:none;`;
      const jetztDot = document.createElement('div');
      jetztDot.style.cssText = `position:absolute;left:62px;top:${jetztTop - 5}px;width:12px;height:12px;background:var(--accent);border-radius:50%;z-index:20;pointer-events:none;`;
      const jetztLabel = document.createElement('div');
      jetztLabel.style.cssText = `position:absolute;left:72px;top:${jetztTop + 4}px;font-size:0.68em;font-weight:700;color:var(--accent);z-index:20;pointer-events:none;background:rgba(255,255,255,0.85);padding:1px 4px;border-radius:3px;`;
      jetztLabel.textContent = jetztZeit;
      container.appendChild(jetztLinie);
      container.appendChild(jetztDot);
      container.appendChild(jetztLabel);
    }
  }
}

/**
 * Tagesansicht: Listenansicht rendern
 */;

  AppClass.prototype.renderKalenderTagListe = function(termine, container, datumStr) {
  if (!container) return;
  if (termine.length === 0) {
    container.innerHTML = `
      <div class="kalender-tag-leer">
        <div class="leer-icon">📭</div>
        <div>Keine Termine an diesem Tag</div>
        <button class="kalender-tag-neu-btn" data-datum="${datumStr}">➕ Neuer Termin erstellen</button>
      </div>
    `;
    container.querySelector('.kalender-tag-neu-btn')?.addEventListener('click', () => {
      this.openKalenderNeuerTerminModal(datumStr, '08:00');
    });
    return;
  }
  
  // Termine ohne Uhrzeit oben, dann Rest nach Uhrzeit sortiert
  const ohneZeit = termine.filter(t => !t.bring_zeit && !t.startzeit && !t.abholung_zeit);
  const mitZeit = termine.filter(t => t.bring_zeit || t.startzeit || t.abholung_zeit);
  const sortiert = [...mitZeit].sort((a, b) => {
    const za = a.bring_zeit || a.startzeit || a.abholung_zeit || '99:99';
    const zb = b.bring_zeit || b.startzeit || b.abholung_zeit || '99:99';
    return za.localeCompare(zb);
  });

  const renderEintrag = (t, zeit) => {
    const statusClass = this.kalenderGetStatusCSS(t.status);
    const statusLabel = this.kalenderGetStatusLabel(t.status);
    const statusFarbe = this.kalenderGetStatusFarbe(t.status);
    const arbeiten = (t.arbeit || '').split('\n').filter(Boolean);
    return `
      <div class="kalender-liste-termin ${statusClass}" data-termin-id="${t.id}">
        <div class="liste-zeit">${zeit}</div>
        <div class="liste-info">
          <div class="liste-kunde">${t.termin_nr ? `<span class="liste-termin-nr">${t.termin_nr}</span> ` : ''}${t.kunde_name || 'Unbekannt'}</div>
          <div class="liste-kennzeichen">${t.kennzeichen || ''} · ${t.geschaetzte_zeit || '?'} Min.</div>
          <div class="liste-arbeit">${arbeiten.join(', ')}</div>
        </div>
        <span class="liste-status" style="background:${statusFarbe}22;color:${statusFarbe}">${statusLabel}</span>
      </div>
    `;
  };

  const ohneZeitHtml = ohneZeit.length > 0
    ? `<div class="kalender-ohne-zeit-section liste-variante">
        <div class="ohne-zeit-header">📋 Ohne Uhrzeit</div>
        ${ohneZeit.map(t => renderEintrag(t, '–')).join('')}
      </div>`
    : '';

  container.innerHTML = ohneZeitHtml + sortiert.map(t => {
    const zeit = t.bring_zeit || t.startzeit || t.abholung_zeit || '–';
    return renderEintrag(t, zeit);
  }).join('');

  container.querySelectorAll('.kalender-liste-termin').forEach(el => {
    el.addEventListener('click', () => {
      this.kalenderTerminClick(parseInt(el.dataset.terminId));
    });
  });
}

/**
 * Tagesansicht: Mitarbeiter-Spalten mit Zeitleiste
 */;

  AppClass.prototype.renderKalenderTagMitarbeiter = function(termine, container, datumStr, auslastung, abwesenheiten) {
  if (!container) return;
  const startStunde = 7;
  const endStunde = 18;
  const slotHoehe = 50;

  // Spalten aus Auslastungsdaten aufbauen
  const spalten = [];
  if (auslastung) {
    (auslastung.mitarbeiter_auslastung || []).forEach(ma => {
      spalten.push({
        typ: 'mitarbeiter',
        id: ma.mitarbeiter_id || ma.id,
        name: ma.mitarbeiter_name || ma.name || '–',
        prozent: ma.ist_abwesend ? 0 : (ma.auslastung_prozent || 0),
        istAbwesend: ma.ist_abwesend === true,
        abwesenheitsTyp: ma.abwesenheits_typ || ''
      });
    });
    (auslastung.lehrlinge_auslastung || []).forEach(la => {
      spalten.push({
        typ: 'lehrling',
        id: la.lehrling_id || la.id,
        name: la.lehrling_name || la.name || '–',
        prozent: la.ist_abwesend ? 0 : (la.auslastung_prozent || 0),
        istAbwesend: la.ist_abwesend === true,
        abwesenheitsTyp: la.abwesenheits_typ || ''
      });
    });
  }

  // Termine den Spalten zuordnen
  const termineSpalte = {};
  const nichtZugewiesen = [];

  termine.forEach(t => {
    let zuordnung = null;

    // 1. arbeitszeiten_details._gesamt_mitarbeiter_id
    if (t.arbeitszeiten_details) {
      try {
        const details = typeof t.arbeitszeiten_details === 'string'
          ? JSON.parse(t.arbeitszeiten_details)
          : t.arbeitszeiten_details;
        if (details._gesamt_mitarbeiter_id) {
          zuordnung = {
            typ: details._gesamt_mitarbeiter_id.type,
            id: details._gesamt_mitarbeiter_id.id
          };
        }
      } catch (e) { /* ignore parse errors */ }
    }

    // 2. Fallback: mitarbeiter_id vom Termin
    if (!zuordnung && t.mitarbeiter_id) {
      zuordnung = { typ: 'mitarbeiter', id: t.mitarbeiter_id };
    }

    if (zuordnung) {
      const key = `${zuordnung.typ}_${zuordnung.id}`;
      if (!termineSpalte[key]) termineSpalte[key] = [];
      termineSpalte[key].push(t);
    } else {
      nichtZugewiesen.push(t);
    }
  });

  // "Nicht zugewiesen"-Spalte hinzufügen wenn nötig
  if (nichtZugewiesen.length > 0) {
    spalten.push({
      typ: 'nicht_zugewiesen',
      id: 0,
      name: 'Nicht zugew.',
      prozent: 0,
      istAbwesend: false,
      abwesenheitsTyp: ''
    });
    termineSpalte['nicht_zugewiesen_0'] = nichtZugewiesen;
  }

  // Keine Spalten? Fallback
  if (spalten.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#999;padding:40px;">Keine Mitarbeiter für diesen Tag gefunden</div>';
    return;
  }

  // Grid HTML aufbauen
  const abwIcons = { urlaub: '🏖️', krank: '🤒', berufsschule: '🏫', lehrgang: '📚' };

  let html = '<div class="kalender-tag-ma-grid">';

  // Zeitspalte links
  html += '<div class="kalender-tag-ma-zeit-spalte">';
  html += '<div class="ma-zeit-header"></div>';
  for (let h = startStunde; h <= endStunde; h++) {
    html += `<div class="ma-zeit-label">${String(h).padStart(2, '0')}:00</div>`;
  }
  html += '</div>';

  // MA-Spalten
  spalten.forEach(sp => {
    const key = `${sp.typ}_${sp.id}`;
    const spTermine = termineSpalte[key] || [];
    const farbe = sp.prozent > 100 ? '#f44336' : sp.prozent > 80 ? '#ff9800' : sp.prozent > 50 ? '#ffc107' : '#4caf50';
    const headerClass = sp.istAbwesend ? ' abwesend' : (sp.typ === 'nicht_zugewiesen' ? ' nicht-zugewiesen' : '');
    const abwIcon = sp.istAbwesend ? (abwIcons[sp.abwesenheitsTyp] || '🥼') : '';

    html += `<div class="kalender-tag-ma-spalte">`;

    // Header
    html += `<div class="kalender-tag-ma-spalte-header${headerClass}">`;
    html += `<span class="ma-name">${this.escapeHtml(sp.name)}</span>`;
    if (sp.istAbwesend) {
      html += `<span>${abwIcon} ${sp.abwesenheitsTyp}</span>`;
    } else if (sp.typ !== 'nicht_zugewiesen') {
      html += `<div class="ma-auslastung">
        <div class="ma-auslastung-track"><div class="ma-auslastung-fill" style="width:${Math.min(sp.prozent, 100)}%;background:${farbe};"></div></div>
        <span class="ma-auslastung-pct">${sp.prozent}%</span>
      </div>`;
    }
    html += '</div>';

    // Body mit Zeitreihen
    html += '<div class="kalender-tag-ma-spalte-body">';
    for (let h = startStunde; h <= endStunde; h++) {
      html += `<div class="ma-zeit-row"></div>`;
    }

    // Termin-Blöcke positionieren
    spTermine.forEach(t => {
      let startzeit = null;
      if (t.arbeitszeiten_details) {
        try {
          const details = typeof t.arbeitszeiten_details === 'string'
            ? JSON.parse(t.arbeitszeiten_details)
            : t.arbeitszeiten_details;
          if (details._startzeit) startzeit = details._startzeit;
        } catch (e) { /* ignore */ }
      }
      if (!startzeit) startzeit = t.startzeit || t.bring_zeit;
      if (!startzeit) return;

      const istAbgeschlossen = t.status === 'abgeschlossen' && t.tatsaechliche_zeit > 0;
      const dauer = istAbgeschlossen ? t.tatsaechliche_zeit : (t.geschaetzte_zeit || 60);
      const [sh, sm] = startzeit.split(':').map(Number);
      if (isNaN(sh)) return;

      const top = (sh - startStunde + (sm || 0) / 60) * slotHoehe;
      const height = Math.max((dauer / 60) * slotHoehe, 25);
      const statusClass = this.kalenderGetStatusCSS(t.status);
      const schwebendClass = t.ist_schwebend ? ' schwebend' : '';

      const endMinuten = (sh * 60 + (sm || 0)) + dauer;
      const endH = Math.floor(endMinuten / 60);
      const endM = endMinuten % 60;
      const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      const zeitInfo = istAbgeschlossen
        ? `${startzeit} – ${endStr} (${dauer}m ✓)`
        : t.status === 'in_bearbeitung' || t.status === 'in-bearbeitung'
          ? `${startzeit} – läuft...`
          : `${startzeit} (~${dauer}m)`;

      const arbeiten = (t.arbeit || '').split('\n').filter(Boolean);

      html += `<div class="kalender-tag-ma-termin ${statusClass}${schwebendClass}" data-termin-id="${t.id}" style="top:${top}px;height:${height}px;">
        <div class="mat-titel">${this.escapeHtml(t.kennzeichen || t.kunde_name || '?')}</div>
        <div class="mat-arbeit">${this.escapeHtml(arbeiten[0] || '')}</div>
        <div class="mat-zeit">${zeitInfo}</div>
      </div>`;
    });

    html += '</div>'; // spalte-body
    html += '</div>'; // spalte
  });

  html += '</div>'; // grid

  container.innerHTML = html;

  // Jetzt-Linie
  if (this.kalenderIstHeute(this.kalenderState.datum)) {
    const jetzt = new Date();
    const jetztH = jetzt.getHours();
    const jetztM = jetzt.getMinutes();
    if (jetztH >= startStunde && jetztH <= endStunde) {
      const topOffset = (jetztH - startStunde + jetztM / 60) * slotHoehe;
      const gridEl = container.querySelector('.kalender-tag-ma-grid');
      if (gridEl) {
        gridEl.querySelectorAll('.kalender-tag-ma-spalte-body').forEach(body => {
          const linie = document.createElement('div');
          linie.className = 'kalender-tag-ma-jetzt-linie';
          linie.style.top = `${topOffset}px`;
          body.appendChild(linie);
        });
      }
    }
  }

  // Termin-Klick-Handler
  container.querySelectorAll('[data-termin-id]').forEach(el => {
    el.addEventListener('click', () => {
      this.kalenderTerminClick(parseInt(el.dataset.terminId));
    });
  });
}

// =====================================================
// ========== WOCHENANSICHT ============================
// =====================================================;

  AppClass.prototype.loadKalenderWoche = async function() {
  const montag = this.kalenderGetMontag(this.kalenderState.datum);
  const tage = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(montag);
    d.setDate(d.getDate() + i);
    tage.push(d);
  }

  const datumVon = this.kalenderFormatDatum(tage[0]);
  const datumBis = this.kalenderFormatDatum(tage[6]);
  
  const [termine, abwesenheiten, ...auslastungen] = await Promise.all([
    this.kalenderLadeTermine(datumVon, datumBis),
    this.kalenderLadeAbwesenheiten(datumVon, datumBis),
    ...tage.map(d => AuslastungService.getByDatum(this.kalenderFormatDatum(d)).catch(() => null))
  ]);

  // Auslastungen nach Datum mappen
  const auslastungProTag = {};
  tage.forEach((d, i) => {
    auslastungProTag[this.kalenderFormatDatum(d)] = auslastungen[i];
  });

  // Termine nach Datum gruppieren
  const terminePropTag = {};
  tage.forEach(d => { terminePropTag[this.kalenderFormatDatum(d)] = []; });
  termine.forEach(t => {
    if (terminePropTag[t.datum]) {
      terminePropTag[t.datum].push(t);
    }
  });

  // Abwesenheiten nach Datum gruppieren
  const abwProTag = {};
  abwesenheiten.forEach(a => {
    if (!abwProTag[a.datum]) abwProTag[a.datum] = [];
    abwProTag[a.datum].push(a);
  });

  const grid = document.getElementById('kalenderWochenGrid');
  if (!grid) return;

  const wt = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const isZeitleiste = this.kalenderState.ansicht === 'zeitleiste';

  grid.innerHTML = tage.map((tag, i) => {
    const datumStr = this.kalenderFormatDatum(tag);
    const istHeute = this.kalenderIstHeute(tag);
    const tageTermine = terminePropTag[datumStr] || [];
    const tageAbw = abwProTag[datumStr] || [];

    let bodyContent = '';
    if (isZeitleiste) {
      bodyContent = this.renderKalenderWocheZeitleiste(tageTermine, datumStr);
    } else {
      bodyContent = this.renderKalenderWocheListe(tageTermine, datumStr);
    }

    // Auslastung für diesen Tag
    const tageAuslastung = auslastungProTag[datumStr];
    const auslastungProzent = tageAuslastung?.auslastung_prozent || 0;
    const auslastungFarbe = auslastungProzent < 50 ? '#4caf50' : auslastungProzent < 75 ? '#ffc107' : auslastungProzent < 90 ? '#ff9800' : '#f44336';

    // Abwesenheiten kompakt für Header
    const abwesendIcons = { Urlaub: '🏖️', Krank: '🤒', Berufsschule: '🏫', Lehrgang: '📚' };
    let abwHeaderHtml = '';
    if (tageAbw.length > 0) {
      const abwKurz = tageAbw.map(a => {
        const icon = abwesendIcons[a.grund] || '📋';
        const kuerzel = (a.person_name || '').split(' ').map(w => w[0]).join('');
        return `${icon}${kuerzel}`;
      }).join(' ');
      abwHeaderHtml = `<div class="kwt-abw">${abwKurz}</div>`;
    }

    const istVergangen = datumStr < new Date().toISOString().split('T')[0] && !istHeute;

    return `
      <div class="kalender-wochen-tag${istHeute ? ' ist-heute' : ''}${istVergangen ? ' ist-vergangen' : ''}">
        <div class="kalender-wochen-tag-header${istHeute ? ' ist-heute' : ''}${istVergangen ? ' ist-vergangen' : ''}" data-datum="${datumStr}">
          <span class="wt-name">${wt[i]}</span>
          <span class="wt-datum">${tag.getDate()}.${tag.getMonth()+1}.</span>
          <span class="wt-count">${tageTermine.length} Termin${tageTermine.length !== 1 ? 'e' : ''}</span>
          <div class="kwt-auslastung">
            <div class="kwt-auslastung-track">
              <div class="kwt-auslastung-fill" style="width:${Math.min(auslastungProzent, 100)}%;background:${auslastungFarbe};"></div>
            </div>
            <span class="kwt-auslastung-pct">${auslastungProzent}%</span>
          </div>
          ${abwHeaderHtml}
        </div>
        <div class="kalender-wochen-tag-body ${isZeitleiste ? 'zeitleiste-modus' : 'listen-modus'}">
          ${bodyContent}
        </div>
        <div class="kalender-wochen-tag-footer">
          <button class="kalender-woche-neu-btn" data-datum="${datumStr}">+ Termin</button>
        </div>
      </div>
    `;
  }).join('');

  // Event-Listener
  grid.querySelectorAll('.kalender-wochen-tag-header').forEach(el => {
    el.addEventListener('click', () => {
      const datum = el.dataset.datum;
      this.kalenderState.datum = new Date(datum + 'T00:00:00');
      this.kalenderState.activeSubTab = 'kalenderTag';
      // Sub-Tab UI umschalten
      const kalenderEl = document.getElementById('kalender');
      if (kalenderEl) {
        kalenderEl.querySelectorAll('.kalender-sub-tabs .sub-tab-button').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.subtab === 'kalenderTag');
        });
        kalenderEl.querySelectorAll('.sub-tab-content').forEach(el => {
          el.classList.remove('active');
          el.style.display = 'none';
        });
        const tagContent = document.getElementById('kalenderTag');
        if (tagContent) {
          tagContent.classList.add('active');
          tagContent.style.display = 'block';
        }
      }
      this.updateKalenderDatumDisplay();
      this.loadKalenderTag();
    });
  });

  grid.querySelectorAll('.kalender-woche-neu-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      this.openKalenderNeuerTerminModal(btn.dataset.datum, '08:00');
    });
  });

  // Termin-Blöcke / Listen-Items klickbar machen
  grid.querySelectorAll('[data-termin-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.kalender-woche-neu-btn')) return;
      this.kalenderTerminClick(parseInt(el.dataset.terminId));
    });
  });

  // Klick auf leere Zeitleisten-Slots
  grid.querySelectorAll('.kalender-woche-zeit-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-termin-id]')) return;
      const stunde = row.dataset.stunde;
      const tagEl = row.closest('.kalender-wochen-tag');
      const datum = tagEl?.querySelector('.kalender-wochen-tag-header')?.dataset.datum;
      if (datum && stunde) {
        this.openKalenderNeuerTerminModal(datum, `${String(stunde).padStart(2, '0')}:00`);
      }
    });
  });
}

/**
 * Wochenansicht: Zeitleiste pro Tag
 */;

  AppClass.prototype.renderKalenderWocheZeitleiste = function(termine, datumStr) {
  const startStunde = 7;
  const endStunde = 18;
  const slotHoehe = 50;

  // Termine ohne Uhrzeit separat
  const ohneZeit = termine.filter(t => !t.bring_zeit && !t.startzeit && !t.abholung_zeit);
  const mitZeit = termine.filter(t => t.bring_zeit || t.startzeit || t.abholung_zeit);

  let html = '<div class="kalender-woche-zeitachse" style="position:relative;">';

  // Ohne-Zeit-Chips oben im Tagesblock
  if (ohneZeit.length > 0) {
    html += `<div class="kalender-woche-ohne-zeit">${ohneZeit.map(t => {
      const statusClass = this.kalenderGetStatusCSS(t.status);
      return `<div class="kwoz-chip ${statusClass}" data-termin-id="${t.id}" title="${t.termin_nr || ''} – ${t.kunde_name || ''}">
        ${t.termin_nr || t.kennzeichen || t.kunde_name || '?'}
      </div>`;
    }).join('')}</div>`;
  }

  for (let h = startStunde; h <= endStunde; h++) {
    html += `<div class="kalender-woche-zeit-row" data-stunde="${h}" style="height:${slotHoehe}px;"><span class="wz-label">${h}:00</span></div>`;
  }

  // Termin-Blöcke (nur mit Uhrzeit)
  mitZeit.forEach(t => {
    const startzeit = t.bring_zeit || t.startzeit || t.abholung_zeit || '08:00';
    const dauer = (t.status === 'abgeschlossen' && t.tatsaechliche_zeit > 0) ? t.tatsaechliche_zeit : (t.geschaetzte_zeit || 60);
    const [sh, sm] = startzeit.split(':').map(Number);
    if (isNaN(sh)) return;
    const top = (sh - startStunde + (sm || 0) / 60) * slotHoehe;
    const height = Math.max((dauer / 60) * slotHoehe, 20);
    const statusClass = this.kalenderGetStatusCSS(t.status);
    const schwebendClass = t.ist_schwebend ? ' schwebend' : '';
    const arbeiten = (t.arbeit || '').split('\n').filter(Boolean);

    html += `<div class="kalender-woche-termin-block ${statusClass}${schwebendClass}" data-termin-id="${t.id}" style="top:${top}px;height:${height}px;">
      <div class="wb-titel">${t.kennzeichen || t.kunde_name || '?'}</div>
      <div class="wb-arbeit">${arbeiten[0] || ''}</div>
    </div>`;
  });

  html += '</div>';
  return html;
}

/**
 * Wochenansicht: Listenansicht pro Tag
 */;

  AppClass.prototype.renderKalenderWocheListe = function(termine, datumStr) {
  if (termine.length === 0) {
    return '<div style="text-align:center;color:#ccc;padding:20px;font-size:0.8em;">Keine Termine</div>';
  }

  const ohneZeit = termine.filter(t => !t.bring_zeit && !t.startzeit && !t.abholung_zeit);
  const mitZeit = termine.filter(t => t.bring_zeit || t.startzeit || t.abholung_zeit);
  const sortiert = [...mitZeit].sort((a, b) => {
    const za = a.bring_zeit || a.startzeit || a.abholung_zeit || '99:99';
    const zb = b.bring_zeit || b.startzeit || b.abholung_zeit || '99:99';
    return za.localeCompare(zb);
  });

  const renderZeile = (t, zeit) => {
    const statusClass = this.kalenderGetStatusCSS(t.status);
    const arbeiten = (t.arbeit || '').split('\n').filter(Boolean);
    return `
      <div class="kalender-woche-liste-termin ${statusClass}" data-termin-id="${t.id}">
        <div class="wl-zeit">${zeit}</div>
        <div class="wl-kunde">${t.termin_nr ? `<span style="font-size:0.78em;opacity:0.7">${t.termin_nr}</span><br>` : ''}${t.kunde_name || t.kennzeichen || 'Unbekannt'}</div>
        <div class="wl-arbeit">${arbeiten[0] || ''}${arbeiten.length > 1 ? ` +${arbeiten.length - 1}` : ''}</div>
      </div>
    `;
  };

  const ohneZeitBlock = ohneZeit.map(t => renderZeile(t, '–')).join('');
  const mitZeitBlock = sortiert.map(t => {
    const zeit = t.bring_zeit || t.startzeit || t.abholung_zeit || '–';
    return renderZeile(t, zeit);
  }).join('');

  return ohneZeitBlock + mitZeitBlock;
}

// =====================================================
// ========== MONATSANSICHT ============================
// =====================================================;

  AppClass.prototype.loadKalenderMonat = async function() {
  const d = this.kalenderState.datum;
  const year = d.getFullYear();
  const month = d.getMonth();

  // Erster Tag des Monats
  const ersterTag = new Date(year, month, 1);
  // Letzter Tag des Monats
  const letzterTag = new Date(year, month + 1, 0);

  // Grid beginnt beim Montag der ersten Woche
  const startGrid = this.kalenderGetMontag(ersterTag);
  // Grid endet am Sonntag der letzten Woche
  const endGrid = new Date(letzterTag);
  const endDay = endGrid.getDay();
  if (endDay !== 0) endGrid.setDate(endGrid.getDate() + (7 - endDay));

  const datumVon = this.kalenderFormatDatum(startGrid);
  const datumBis = this.kalenderFormatDatum(endGrid);

  const [termine, abwesenheiten] = await Promise.all([
    this.kalenderLadeTermine(datumVon, datumBis),
    this.kalenderLadeAbwesenheiten(datumVon, datumBis)
  ]);

  // Abwesenheiten nach Datum gruppieren
  const abwProTag = {};
  abwesenheiten.forEach(a => {
    if (!abwProTag[a.datum]) abwProTag[a.datum] = [];
    abwProTag[a.datum].push(a);
  });

  // Termine nach Datum gruppieren
  const terminePropTag = {};
  termine.forEach(t => {
    if (!terminePropTag[t.datum]) terminePropTag[t.datum] = [];
    terminePropTag[t.datum].push(t);
  });

  const grid = document.getElementById('kalenderMonatGrid');
  if (!grid) return;

  let html = '';
  const cursor = new Date(startGrid);
  while (cursor <= endGrid) {
    const datumStr = this.kalenderFormatDatum(cursor);
    const istAktuellerMonat = cursor.getMonth() === month;
    const istHeute = this.kalenderIstHeute(cursor);
    const tageTermine = terminePropTag[datumStr] || [];
    
    // Auslastung berechnen (vereinfacht: Minuten / 480 * 100)
    const gesamtMinuten = tageTermine.reduce((sum, t) => sum + (t.geschaetzte_zeit || 0), 0);
    const auslastungProzent = Math.min(Math.round((gesamtMinuten / 480) * 100), 100);
    const auslastungFarbe = auslastungProzent < 50 ? '#4caf50' : auslastungProzent < 75 ? '#ffc107' : auslastungProzent < 90 ? '#ff9800' : '#f44336';

    const istVergangen = datumStr < new Date().toISOString().split('T')[0] && !istHeute;

    // Abwesenheiten für diesen Tag
    const tageAbw = abwProTag[datumStr] || [];
    const abwesendIcons = { Urlaub: '🏖️', Krank: '🤒', Berufsschule: '🏫', Lehrgang: '📚' };
    let abwHtml = '';
    if (tageAbw.length > 0) {
      const abwKurz = tageAbw.map(a => {
        const icon = abwesendIcons[a.grund] || '📋';
        const kuerzel = (a.person_name || '').split(' ').map(w => w[0]).join('');
        return `${icon}${kuerzel}`;
      }).join(' ');
      abwHtml = `<div class="mz-abwesenheiten">${abwKurz}</div>`;
    }

    // Auslastung + Terminzahl kompakt
    const terminInfo = tageTermine.length > 0 ? `<div class="mz-info">${tageTermine.length} Termin${tageTermine.length !== 1 ? 'e' : ''} · ${auslastungProzent}%</div>` : '';

    html += `
      <div class="kalender-monat-zelle${istHeute ? ' ist-heute' : ''}${!istAktuellerMonat ? ' anderer-monat' : ''}${istVergangen ? ' ist-vergangen' : ''}" data-datum="${datumStr}">
        <div class="mz-datum">
          <span class="mz-tag">${cursor.getDate()}</span>
          <button class="mz-neu-btn" data-datum="${datumStr}" title="Neuer Termin">+</button>
        </div>
        ${abwHtml}
        ${tageTermine.length > 0 ? `<div class="mz-auslastung"><div class="mz-auslastung-bar" style="width:${auslastungProzent}%;background:${auslastungFarbe}"></div></div>` : ''}
        ${terminInfo}
      </div>
    `;
    cursor.setDate(cursor.getDate() + 1);
  }

  grid.innerHTML = html;

  // Event-Listener
  grid.querySelectorAll('.kalender-monat-zelle').forEach(zelle => {
    zelle.addEventListener('click', (e) => {
      if (e.target.closest('.mz-neu-btn')) return;
      const datum = zelle.dataset.datum;
      this.kalenderState.datum = new Date(datum + 'T00:00:00');
      this.kalenderState.activeSubTab = 'kalenderTag';
      const kalenderEl = document.getElementById('kalender');
      if (kalenderEl) {
        kalenderEl.querySelectorAll('.kalender-sub-tabs .sub-tab-button').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.subtab === 'kalenderTag');
        });
        kalenderEl.querySelectorAll('.sub-tab-content').forEach(el => {
          el.classList.remove('active');
          el.style.display = 'none';
        });
        const tagContent = document.getElementById('kalenderTag');
        if (tagContent) {
          tagContent.classList.add('active');
          tagContent.style.display = 'block';
        }
      }
      this.updateKalenderDatumDisplay();
      this.loadKalenderTag();
    });
  });

  grid.querySelectorAll('.mz-neu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openKalenderNeuerTerminModal(btn.dataset.datum, '08:00');
    });
  });
}

// =====================================================
// ========== JAHRESANSICHT ============================
// =====================================================;

  AppClass.prototype.loadKalenderJahr = async function() {
  const year = this.kalenderState.datum.getFullYear();
  const datumVon = `${year}-01-01`;
  const datumBis = `${year}-12-31`;

  // Termine werden für die Auslastungsanzeige geladen
  const termine = await this.kalenderLadeTermine(datumVon, datumBis);
  
  // Termine pro Tag als Map
  const termineProTag = {};
  termine.forEach(t => {
    if (!termineProTag[t.datum]) termineProTag[t.datum] = 0;
    termineProTag[t.datum] += (t.geschaetzte_zeit || 0);
  });

  const grid = document.getElementById('kalenderJahrGrid');
  if (!grid) return;

  const monate = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const wtKurz = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  let html = '';
  for (let m = 0; m < 12; m++) {
    const ersterTag = new Date(year, m, 1);
    const letzterTag = new Date(year, m + 1, 0);
    const startDay = (ersterTag.getDay() + 6) % 7; // 0=Mo

    html += `<div class="kalender-mini-monat">
      <div class="kalender-mini-monat-header" data-monat="${m}">${monate[m]}</div>
      <div class="kalender-mini-monat-tage-header">${wtKurz.map(w => `<span>${w}</span>`).join('')}</div>
      <div class="kalender-mini-monat-grid">`;

    // Leere Tage am Anfang
    for (let i = 0; i < startDay; i++) {
      html += '<div class="kalender-mini-tag leer"></div>';
    }

    // Tage des Monats
    for (let tag = 1; tag <= letzterTag.getDate(); tag++) {
      const d = new Date(year, m, tag);
      const datumStr = this.kalenderFormatDatum(d);
      const istHeute = this.kalenderIstHeute(d);
      const minuten = termineProTag[datumStr] || 0;
      
      // Auslastungs-Klasse (0-4)
      let auslastungKlasse = 'auslastung-0';
      if (minuten > 0 && minuten < 240) auslastungKlasse = 'auslastung-1';
      else if (minuten >= 240 && minuten < 400) auslastungKlasse = 'auslastung-2';
      else if (minuten >= 400 && minuten < 480) auslastungKlasse = 'auslastung-3';
      else if (minuten >= 480) auslastungKlasse = 'auslastung-4';

      html += `<div class="kalender-mini-tag ${auslastungKlasse}${istHeute ? ' ist-heute' : ''}" data-datum="${datumStr}" title="${minuten > 0 ? Math.round(minuten/60) + 'h geplant' : 'Frei'}">${tag}</div>`;
    }

    html += '</div></div>';
  }

  grid.innerHTML = html;

  // Event-Listener
  grid.querySelectorAll('.kalender-mini-monat-header').forEach(el => {
    el.addEventListener('click', () => {
      const monat = parseInt(el.dataset.monat);
      this.kalenderState.datum = new Date(year, monat, 1);
      this.kalenderState.activeSubTab = 'kalenderMonat';
      const kalenderEl = document.getElementById('kalender');
      if (kalenderEl) {
        kalenderEl.querySelectorAll('.kalender-sub-tabs .sub-tab-button').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.subtab === 'kalenderMonat');
        });
        kalenderEl.querySelectorAll('.sub-tab-content').forEach(el => {
          el.classList.remove('active');
          el.style.display = 'none';
        });
        const monatContent = document.getElementById('kalenderMonat');
        if (monatContent) {
          monatContent.classList.add('active');
          monatContent.style.display = 'block';
        }
      }
      this.updateKalenderDatumDisplay();
      this.loadKalenderMonat();
    });
  });

  grid.querySelectorAll('.kalender-mini-tag:not(.leer)').forEach(el => {
    el.addEventListener('click', () => {
      const datum = el.dataset.datum;
      this.kalenderState.datum = new Date(datum + 'T00:00:00');
      this.kalenderState.activeSubTab = 'kalenderTag';
      const kalenderEl = document.getElementById('kalender');
      if (kalenderEl) {
        kalenderEl.querySelectorAll('.kalender-sub-tabs .sub-tab-button').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.subtab === 'kalenderTag');
        });
        kalenderEl.querySelectorAll('.sub-tab-content').forEach(el => {
          el.classList.remove('active');
          el.style.display = 'none';
        });
        const tagContent = document.getElementById('kalenderTag');
        if (tagContent) {
          tagContent.classList.add('active');
          tagContent.style.display = 'block';
        }
      }
      this.updateKalenderDatumDisplay();
      this.loadKalenderTag();
    });
  });
}

// =====================================================
// ========== TERMIN-KLICK =============================
// =====================================================;

  AppClass.prototype.kalenderTerminClick = function(terminId) {
  // Bestehendes Termin-Details-Modal verwenden (falls vorhanden)
  if (typeof this.showTerminDetails === 'function') {
    this.showTerminDetails(terminId);
  } else if (typeof this.openTerminDetailsModal === 'function') {
    this.openTerminDetailsModal(terminId);
  } else {
    // Fallback: zum Termine-Tab wechseln
    console.log('Kalender: Termin angeklickt:', terminId);
  }
}

// =====================================================
// ========== NEUER TERMIN MODAL =======================
// =====================================================;

  AppClass.prototype.openKalenderNeuerTerminModal = function(datum, uhrzeit) {
  const modal = document.getElementById('kalenderNeuerTerminModal');
  if (!modal) return;

  // Felder zurücksetzen
  const form = document.getElementById('kalenderTerminForm');
  if (form) form.reset();
  
  // Datum und Uhrzeit vorausfüllen
  const datumInput = document.getElementById('kalTerminDatum');
  const uhrzeitInput = document.getElementById('kalTerminUhrzeit');
  if (datumInput) datumInput.value = datum;
  if (uhrzeitInput) uhrzeitInput.value = uhrzeit || '08:00';

  // Abholtermin und Ersatzauto-Status zurücksetzen
  const abholDatumInput = document.getElementById('kalTerminAbholDatum');
  const abholZeitInput = document.getElementById('kalTerminAbholZeit');
  if (abholDatumInput) abholDatumInput.value = '';
  if (abholZeitInput) abholZeitInput.value = '';
  const ersatzautoStatusEl = document.getElementById('kalTerminErsatzautoStatus');
  if (ersatzautoStatusEl) { ersatzautoStatusEl.style.display = 'none'; ersatzautoStatusEl.textContent = ''; }

  // Hidden fields resetten
  const kundeIdInput = document.getElementById('kalTerminKundeId');
  if (kundeIdInput) kundeIdInput.value = '';

  // Modal anzeigen
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('active'), 10);

  // Event-Listener binden (einmalig)
  if (!this._kalenderModalBound) {
    this._kalenderModalBound = true;
    
    // Schließen-Buttons
    document.getElementById('closeKalenderTerminModal')?.addEventListener('click', () => this.closeKalenderTerminModal());
    document.getElementById('kalenderTerminAbbrechen')?.addEventListener('click', () => this.closeKalenderTerminModal());
    
    // Overlay-Klick schließt Modal
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeKalenderTerminModal();
    });

    // Speichern
    document.getElementById('kalenderTerminSpeichern')?.addEventListener('click', () => this.handleKalenderTerminSubmit());

    // Ersatzauto-Verfügbarkeitsprüfung
    document.getElementById('kalTerminErsatzauto')?.addEventListener('change', () => this.kalenderCheckErsatzautoVerfuegbarkeit());
    document.getElementById('kalTerminDatum')?.addEventListener('change', () => {
      if (document.getElementById('kalTerminErsatzauto')?.checked) this.kalenderCheckErsatzautoVerfuegbarkeit();
    });
    document.getElementById('kalTerminAbholDatum')?.addEventListener('change', () => {
      if (document.getElementById('kalTerminErsatzauto')?.checked) this.kalenderCheckErsatzautoVerfuegbarkeit();
    });

    // Kundensuche Autocomplete
    const kundenSuche = document.getElementById('kalTerminKundenSuche');
    if (kundenSuche) {
      let debounceTimer;
      kundenSuche.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => this.kalenderKundenSuche(kundenSuche.value), 300);
      });
      kundenSuche.addEventListener('blur', () => {
        setTimeout(() => {
          const ergebnisse = document.getElementById('kalTerminKundenSucheErgebnisse');
          if (ergebnisse) ergebnisse.style.display = 'none';
        }, 400);
      });
    }

    // Event-Delegation auf Ergebnisse-Container (mousedown verhindert blur)
    const ergebnisseContainer = document.getElementById('kalTerminKundenSucheErgebnisse');
    if (ergebnisseContainer) {
      ergebnisseContainer.addEventListener('mousedown', async (e) => {
        e.preventDefault(); // Verhindert blur auf dem Suchfeld

        // Fahrzeugauswahl (2. Ebene)
        const fzItem = e.target.closest('[data-fz-index]');
        if (fzItem) {
          const fz = this._kalTerminFahrzeugListe?.[parseInt(fzItem.dataset.fzIndex)];
          if (fz) {
            this.applyFahrzeugZuKalenderModal(fz);
            ergebnisseContainer.style.display = 'none';
          }
          return;
        }

        // Kundenauswahl (1. Ebene)
        const kundeItem = e.target.closest('[data-kunde-id]');
        if (!kundeItem) return;

        const kundeId = kundeItem.dataset.kundeId;
        const name = kundeItem.dataset.name;
        const kzFallback = kundeItem.dataset.kennzeichen;

        document.getElementById('kalTerminKundenSuche').value = name;
        document.getElementById('kalTerminKundeId').value = kundeId;

        // Fahrzeuge des Kunden laden
        let fahrzeuge = [];
        try {
          const resp = await KundenService.getFahrzeuge(kundeId);
          fahrzeuge = Array.isArray(resp) ? resp : (resp.fahrzeuge || []);
        } catch (_) {
          // Fallback aus termineCache
          if (this.termineCache?.length) {
            const seen = new Set();
            fahrzeuge = this.termineCache
              .filter(t => t.kunde_id == kundeId && t.kennzeichen)
              .filter(t => {
                const k = (t.kennzeichen || '').replace(/\s+/g, '').toUpperCase();
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
              })
              .map(t => ({ kennzeichen: t.kennzeichen, fahrzeugtyp: t.fahrzeugtyp || '', vin: t.vin || '' }));
          }
        }

        if (fahrzeuge.length === 1) {
          this.applyFahrzeugZuKalenderModal(fahrzeuge[0]);
          ergebnisseContainer.style.display = 'none';
        } else if (fahrzeuge.length > 1) {
          this._kalTerminFahrzeugListe = fahrzeuge;
          ergebnisseContainer.innerHTML = `
            <div style="padding:6px 10px;font-size:0.8em;color:#666;border-bottom:1px solid #eee;">🚗 Fahrzeug auswählen:</div>
            ${fahrzeuge.map((fz, i) => `
              <div class="autocomplete-item" data-fz-index="${i}">
                <strong>${fz.kennzeichen}</strong>
                ${fz.fahrzeugtyp ? `<span style="color:#666;"> · ${fz.fahrzeugtyp}</span>` : ''}
                ${i === 0 ? '<span style="float:right;font-size:0.75em;color:#aaa;">Letzter</span>' : ''}
              </div>
            `).join('')}
          `;
          ergebnisseContainer.style.display = 'block';
        } else {
          // Keine Fahrzeuge → Fallback aus Suchergebnis-Cache
          if (kzFallback) {
            document.getElementById('kalTerminKennzeichen').value = kzFallback;
          }
          ergebnisseContainer.style.display = 'none';
        }
      });
    }
  }

  // Fokus auf Kundensuche
  setTimeout(() => {
    document.getElementById('kalTerminKundenSuche')?.focus();
  }, 100);
};

  AppClass.prototype.closeKalenderTerminModal = function() {
  const modal = document.getElementById('kalenderNeuerTerminModal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => { modal.style.display = 'none'; }, 200);
  }
}

/**
 * Ersatzauto-Verfügbarkeit im Kalender-Modal prüfen
 */;

  AppClass.prototype.kalenderCheckErsatzautoVerfuegbarkeit = async function() {
  const statusEl = document.getElementById('kalTerminErsatzautoStatus');
  const checkbox = document.getElementById('kalTerminErsatzauto');
  if (!statusEl) return;

  if (!checkbox?.checked) {
    statusEl.style.display = 'none';
    return;
  }

  const datum = document.getElementById('kalTerminDatum')?.value;
  const abholDatum = document.getElementById('kalTerminAbholDatum')?.value;

  if (!datum) {
    statusEl.style.display = 'none';
    return;
  }

  statusEl.style.display = 'block';
  statusEl.style.cssText = 'display:block; padding:8px 12px; border-radius:6px; font-size:0.85rem; background:#f0f0f0; color:#666; border:1px solid #ddd;';
  statusEl.textContent = '⏳ Prüfe Verfügbarkeit...';

  try {
    const start = await ErsatzautosService.getVerfuegbarkeit(datum);
    let minVerfuegbar = start.verfuegbar;
    let gesamtInfo = `${start.gesamt} Fahrzeug(e) gesamt, ${start.vergeben} vergeben`;

    if (abholDatum && abholDatum !== datum) {
      const end = await ErsatzautosService.getVerfuegbarkeit(abholDatum);
      minVerfuegbar = Math.min(minVerfuegbar, end.verfuegbar);
      // Anzahl Tage berechnen und anzeigen
      const d1 = new Date(datum);
      const d2 = new Date(abholDatum);
      const tage = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
      if (tage > 0) gesamtInfo += ` · ${tage} Tag(e)`;
    }

    if (minVerfuegbar > 0) {
      statusEl.style.cssText = 'display:block; padding:8px 12px; border-radius:6px; font-size:0.85rem; background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7;';
      statusEl.textContent = `✅ ${minVerfuegbar} Ersatzauto(s) verfügbar – ${gesamtInfo}`;
    } else {
      statusEl.style.cssText = 'display:block; padding:8px 12px; border-radius:6px; font-size:0.85rem; background:#ffebee; color:#c62828; border:1px solid #ef9a9a;';
      statusEl.textContent = `❌ Kein Ersatzauto verfügbar – ${gesamtInfo}`;
    }
  } catch (err) {
    statusEl.style.cssText = 'display:block; padding:8px 12px; border-radius:6px; font-size:0.85rem; background:#fff3e0; color:#e65100; border:1px solid #ffcc80;';
    statusEl.textContent = '⚠️ Verfügbarkeit konnte nicht geprüft werden';
  }
}

/**
 * Kundensuche im Kalender-Modal
 */

/**
 * Fahrzeugdaten in das Kalender-Modal-Formular übernehmen
 */

/**
 * Termin-Erstellung aus dem Kalender-Modal
 */;

  AppClass.prototype.handleKalenderTerminSubmit = async function() {
  const datum = document.getElementById('kalTerminDatum')?.value;
  const uhrzeit = document.getElementById('kalTerminUhrzeit')?.value;
  const kundeId = document.getElementById('kalTerminKundeId')?.value;
  const kundeName = document.getElementById('kalTerminKundenSuche')?.value?.trim();
  const kennzeichen = document.getElementById('kalTerminKennzeichen')?.value?.trim();
  const arbeitenRaw = document.getElementById('kalTerminArbeiten')?.value?.trim();
  const abholtyp = document.querySelector('input[name="kalTerminAbholtyp"]:checked')?.value || 'bringen';
  const vin = document.getElementById('kalTerminVin')?.value?.trim();
  const fahrzeugtyp = document.getElementById('kalTerminFahrzeugtyp')?.value?.trim();
  const kilometerstand = document.getElementById('kalTerminKilometerstand')?.value;
  const dringlichkeit = document.getElementById('kalTerminDringlichkeit')?.value;
  const ersatzauto = document.getElementById('kalTerminErsatzauto')?.checked ? 1 : 0;
  const abholDatum = document.getElementById('kalTerminAbholDatum')?.value;
  const abholZeit = document.getElementById('kalTerminAbholZeit')?.value;
  const notizen = document.getElementById('kalTerminNotizen')?.value?.trim();

  // Validierung
  if (!datum) {
    alert('Bitte ein Datum auswählen.');
    return;
  }
  if (!kennzeichen) {
    alert('Bitte ein Kennzeichen eingeben.');
    return;
  }
  if (!arbeitenRaw) {
    alert('Bitte mindestens eine Arbeit eingeben.');
    return;
  }
  if (!kundeName && !kundeId) {
    alert('Bitte einen Kunden angeben.');
    return;
  }

  // Arbeiten und geschätzte Zeit berechnen
  const arbeiten = arbeitenRaw.split('\n').filter(a => a.trim());
  const arbeitText = arbeiten.join('\n');
  let geschaetzteZeit = 60; // Default 60 Min.
  if (typeof this.getGeschaetzteZeit === 'function') {
    geschaetzteZeit = this.getGeschaetzteZeit(arbeiten) || 60;
  }

  const terminDaten = {
    datum,
    kennzeichen,
    arbeit: arbeitText,
    geschaetzte_zeit: geschaetzteZeit,
    abholung_typ: abholtyp,
    bring_zeit: uhrzeit || null,
    status: 'geplant'
  };

  if (kundeId) terminDaten.kunde_id = parseInt(kundeId);
  if (kundeName) terminDaten.kunde_name = kundeName;
  if (vin) terminDaten.vin = vin;
  if (fahrzeugtyp) terminDaten.fahrzeugtyp = fahrzeugtyp;
  if (kilometerstand) terminDaten.kilometerstand = parseInt(kilometerstand);
  if (dringlichkeit) terminDaten.dringlichkeit = dringlichkeit;
  if (ersatzauto) terminDaten.ersatzauto = ersatzauto;
  if (abholDatum) terminDaten.abholung_datum = abholDatum;
  if (abholZeit) terminDaten.abholung_zeit = abholZeit;
  // Ersatzauto-Tage automatisch aus Datumsrange berechnen
  if (ersatzauto && abholDatum && datum) {
    const d1 = new Date(datum);
    const d2 = new Date(abholDatum);
    const diffTage = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
    if (diffTage > 0) terminDaten.ersatzauto_tage = diffTage;
  }
  if (notizen) terminDaten.notizen = notizen;

  try {
    const speichernBtn = document.getElementById('kalenderTerminSpeichern');
    if (speichernBtn) {
      speichernBtn.disabled = true;
      speichernBtn.textContent = '⏳ Speichern...';
    }

    await TermineService.create(terminDaten);
    
    this.closeKalenderTerminModal();
    
    // Kalender-Ansicht aktualisieren
    this.kalenderLoadActiveSubTab(this.kalenderState.activeSubTab);
    
    // Erfolgs-Feedback
    this.showToast?.('✅ Termin erfolgreich erstellt!', 'success') || alert('Termin erfolgreich erstellt!');

  } catch (err) {
    console.error('Kalender: Termin-Erstellung fehlgeschlagen:', err);
    alert('Fehler beim Erstellen des Termins: ' + (err.message || 'Unbekannter Fehler'));
  } finally {
    const speichernBtn = document.getElementById('kalenderTerminSpeichern');
    if (speichernBtn) {
      speichernBtn.disabled = false;
      speichernBtn.textContent = '✅ Termin speichern';
    }
  }
}

// === ENDE KALENDER TAB ===

// =========================================================================
// KPI DASHBOARD (Feature B2)
// =========================================================================

// =========================================================================
// AUTO-SLOT – Nächsten freien Termin finden (Feature A1)
// =========================================================================;

  AppClass.prototype.handleNaechsterSlot = async function() {
  const arbeitInput = document.getElementById('arbeitEingabe');
  const arbeiten = arbeitInput ? this.parseArbeiten(arbeitInput.value) : [];
  let vorschlag = this.getGeschaetzteZeit(arbeiten);
  if (!vorschlag || vorschlag < 15) vorschlag = 60;
  this._oeffneZeitangabeModal(vorschlag, arbeiten.length > 0);
};

  AppClass.prototype._oeffneZeitangabeModal = function(vorschlagMinuten, hatArbeiten) {
  const chips = [
    { label: '30 min', wert: 30 },
    { label: '1 Std.', wert: 60 },
    { label: '1,5 Std.', wert: 90 },
    { label: '2 Std.', wert: 120 },
    { label: '4 Std.', wert: 240 },
  ];

  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.6); display: flex;
    align-items: center; justify-content: center; z-index: 10000;
  `;

  const hinweisHtml = hatArbeiten
    ? `<div style="font-size:11px;color:#4a90e2;background:#e8f4fd;border-radius:6px;padding:6px 10px;margin-bottom:16px;">
         ℹ️ Vorausgefüllt aus eingetragenen Arbeiten
       </div>`
    : '';

  const chipsHtml = chips.map(c => {
    const aktiv = c.wert === vorschlagMinuten;
    return `<span class="zeitangabe-chip" data-wert="${c.wert}" style="
      display:inline-block; padding:6px 14px; border-radius:20px; cursor:pointer;
      font-size:13px; margin:3px;
      background:${aktiv ? '#e8f4fd' : '#fff'};
      border:${aktiv ? '2px solid #4a90e2' : '1px solid #ddd'};
      color:${aktiv ? '#4a90e2' : '#555'};
      font-weight:${aktiv ? '600' : 'normal'};
    ">${c.label}</span>`;
  }).join('');

  modal.innerHTML = `
    <div style="background:white;border-radius:12px;padding:24px;width:320px;
                box-shadow:0 8px 32px rgba(0,0,0,0.3);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <strong style="font-size:15px;color:#333;">⏱️ Geschätzte Arbeitszeit</strong>
        <span id="zeitangabeModalClose" style="cursor:pointer;color:#999;font-size:20px;line-height:1;">✕</span>
      </div>
      <div style="font-size:12px;color:#777;margin-bottom:14px;">
        Wie lange dauert die Arbeit voraussichtlich?
      </div>
      <div style="margin-bottom:14px;">${chipsHtml}</div>
      ${hinweisHtml}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
        <input id="zeitangabeMinuten" type="number" min="5" max="960" value="${vorschlagMinuten}"
          style="flex:1;padding:9px 12px;border:1px solid #ccc;border-radius:6px;
                 font-size:14px;text-align:center;">
        <span style="font-size:13px;color:#666;white-space:nowrap;">Minuten</span>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="zeitangabeAbbrechen" style="flex:1;padding:10px;background:#f0f0f0;
          color:#555;border:none;border-radius:6px;font-size:13px;cursor:pointer;">
          Abbrechen
        </button>
        <button id="zeitangabeSuchen" style="flex:1;padding:10px;background:#4a90e2;
          color:white;border:none;border-radius:6px;font-size:13px;
          font-weight:600;cursor:pointer;">
          🔍 Slot suchen
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const schliesseModal = () => document.body.removeChild(modal);

  modal.querySelectorAll('.zeitangabe-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      modal.querySelectorAll('.zeitangabe-chip').forEach(c => {
        c.style.background = '#fff';
        c.style.border = '1px solid #ddd';
        c.style.color = '#555';
        c.style.fontWeight = 'normal';
      });
      chip.style.background = '#e8f4fd';
      chip.style.border = '2px solid #4a90e2';
      chip.style.color = '#4a90e2';
      chip.style.fontWeight = '600';
      document.getElementById('zeitangabeMinuten').value = chip.dataset.wert;
    });
  });

  modal.querySelector('#zeitangabeModalClose').addEventListener('click', schliesseModal);
  modal.querySelector('#zeitangabeAbbrechen').addEventListener('click', schliesseModal);
  modal.addEventListener('click', e => { if (e.target === modal) schliesseModal(); });

  modal.querySelector('#zeitangabeSuchen').addEventListener('click', async () => {
    const input = document.getElementById('zeitangabeMinuten');
    let minuten = parseInt(input.value, 10);
    if (!Number.isFinite(minuten) || minuten < 5) minuten = 60;
    schliesseModal();

    const btn = document.getElementById('btnFreienSlotFinden');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Suche...'; }
    try {
      const slotResponse = await window.TermineService.getNaechsterSlot(minuten, null, null);
      const slots = Array.isArray(slotResponse) ? slotResponse : (slotResponse.slots || []);
      this._zeigeSlotVorschlaege(slots);
    } catch (err) {
      this.showToast('Slot-Suche fehlgeschlagen: ' + (err.message || err), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔍 Freien Slot finden'; }
    }
  });
};

  AppClass.prototype._zeigeSlotVorschlaege = function(slots) {
  const container = document.getElementById('slotVorschlaegeDropdown');
  if (!container) return;
  if (!slots || slots.length === 0) {
    container.innerHTML = '<div class="slot-kein-ergebnis">Kein freier Slot in den nächsten 14 Tagen gefunden.</div>';
    container.style.display = 'block';
    return;
  }
  const zeilen = slots.map(s => {
    const datum = new Date(s.datum).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
    const zeiten = (s.zeiten || (s.startzeit ? [s.startzeit] : []));
    if (zeiten.length === 0) return '';
    const maNameSafe = (s.mitarbeiter_name || '').replace(/'/g, "\\'");
    const chipsHtml = zeiten.map(zeit =>
      `<span class="slot-zeit-chip" onclick="app._uebernimmSlot('${s.datum}','${s.mitarbeiter_id || ''}','${maNameSafe}','${zeit}')" style="display:inline-block;padding:4px 10px;border-radius:14px;cursor:pointer;font-size:12px;font-weight:600;margin:2px;background:#e8f4fd;color:#4a90e2;border:1px solid #4a90e2;">${zeit}</span>`
    ).join('');
    return `<div class="slot-item-row" style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid #f0f0f0;gap:10px;flex-wrap:wrap;">
      <span style="min-width:130px;font-weight:600;color:#333;font-size:13px;">${datum}</span>
      <span style="display:flex;flex-wrap:wrap;flex:1;gap:4px;">${chipsHtml}</span>
      <span class="slot-auslastung" style="font-size:11px;color:#888;white-space:nowrap;">${s.mitarbeiter_name} · ${s.auslastung_prozent}% ausgelastet</span>
    </div>`;
  }).join('');
  container.innerHTML =
    '<div class="slot-header">🗓️ Vorgeschlagene freie Slots:</div>' +
    zeilen +
    '<div class="slot-close" onclick="document.getElementById(\'slotVorschlaegeDropdown\').style.display=\'none\'" style="padding:8px 14px;text-align:right;cursor:pointer;color:#999;font-size:12px;">✕ Schließen</div>';
  container.style.display = 'block';
};

  AppClass.prototype._uebernimmSlot = function(datum, mitarbeiterId, mitarbeiterName, zeit) {
  // Datum ins Terminformular übernehmen
  const datumInput = document.getElementById('datum');
  if (datumInput) {
    datumInput.value = datum;
    datumInput.dispatchEvent(new Event('change'));
  }
  // Bringzeit setzen
  const bringZeitInput = document.getElementById('bring_zeit');
  if (bringZeitInput && zeit) {
    bringZeitInput.value = zeit;
    bringZeitInput.dispatchEvent(new Event('change'));
  }
  // Kalender auf das Datum setzen
  if (this.setupAuslastungKalender) {
    const d = new Date(datum);
    this.currentKalenderDatum = d;
    this.selectedDatum = datum;
    this.renderAuslastungKalender();
    const display = document.getElementById('selectedDatumDisplay');
    if (display) display.textContent = d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }
  // Mitarbeiter vorauswählen falls Feld vorhanden
  const maSelect = document.getElementById('mitarbeiterId') || document.getElementById('mitarbeiterSelect');
  if (maSelect && mitarbeiterId) {
    maSelect.value = mitarbeiterId;
  }
  document.getElementById('slotVorschlaegeDropdown').style.display = 'none';
  this.showToast(`Slot ${datum} ${zeit ? 'um ' + zeit + ' Uhr ' : ''}übernommen`, 'success');
}

// =========================================================================
// DUPLIKAT-ERKENNUNG (Feature D3)
// =========================================================================

// =========================================================================
// AUTOMATISIERUNGS-PROTOKOLL (Feature C4)
// =========================================================================




// =========================================================================
// AUTOMATISIERUNGS-EINSTELLUNGEN laden & speichern
// =========================================================================


// =========================================================================
// GLOBALE SUCHE (Feature C5)
// =========================================================================





// =========================================================================
// KEYBOARD SHORTCUTS (Feature C3)
// =========================================================================;
}
