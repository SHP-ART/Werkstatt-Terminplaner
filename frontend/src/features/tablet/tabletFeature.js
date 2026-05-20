export function installTabletFeature(AppClass) {
  Object.assign(AppClass.prototype, {
      async initInternTab() {
        // Stoppe eventuell laufende Auto-Refresh
        if (this.internRefreshInterval) {
          clearInterval(this.internRefreshInterval);
        }
    
        // Refresh-Button
        const refreshBtn = document.getElementById('internRefreshBtn');
        if (refreshBtn) {
          refreshBtn.onclick = () => this.loadInternTeamUebersicht();
        }
    
        // Tablet-Modus Button
        const tabletModeBtn = document.getElementById('internTabletModeBtn');
        if (tabletModeBtn) {
          tabletModeBtn.onclick = () => this.toggleInternTabletMode(true);
        }
    
        // Tablet-Modus Exit Button
        const tabletExitBtn = document.getElementById('internTabletExitBtn');
        if (tabletExitBtn) {
          tabletExitBtn.onclick = () => this.toggleInternTabletMode(false);
        }
    
        // Tablet-Modus Refresh Button
        const tabletRefreshBtn = document.getElementById('internTabletRefresh');
        if (tabletRefreshBtn) {
          tabletRefreshBtn.onclick = () => this.loadInternTeamUebersicht();
        }
    
        // Lade Team-Übersicht
        await this.loadInternTeamUebersicht();
    
        // Auto-Refresh alle 60 Sekunden
        this.internRefreshInterval = setInterval(() => {
          const internTab = document.getElementById('intern');
          if (internTab && (internTab.classList.contains('active') || internTab.classList.contains('intern-tablet-mode'))) {
            this.loadInternTeamUebersicht();
          }
        }, 60000);
      },

      toggleInternTabletMode(enable) {
        const internTab = document.getElementById('intern');
        const body = document.body;
        
        if (enable) {
          // Tablet-Modus aktivieren
          internTab.classList.add('intern-tablet-mode');
          body.classList.add('intern-tablet-mode-active');
          
          // Optional: Vollbild anfordern (funktioniert nicht auf allen Geräten)
          if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {
              // Ignoriere Fehler wenn Vollbild nicht möglich
            });
          }
          
          this.showToast('Tablet-Modus aktiviert 📱', 'info');
        } else {
          // Tablet-Modus deaktivieren
          internTab.classList.remove('intern-tablet-mode');
          body.classList.remove('intern-tablet-mode-active');
          
          // Vollbild beenden
          if (document.exitFullscreen && document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
          
          this.showToast('Tablet-Modus beendet', 'info');
        }
      },

      async loadInternTeamUebersicht() {
        const mitarbeiterContainer = document.getElementById('internMitarbeiterKacheln');
        const lehrlingeContainer = document.getElementById('internLehrlingeKacheln');
        const keineLehrlingeEl = document.getElementById('internKeineLehrlinge');
    
        // Loading State
        if (mitarbeiterContainer) {
          mitarbeiterContainer.innerHTML = `
            <div class="intern-loading">
              <span class="loading-spinner"></span>
              <span>Lade Team-Übersicht...</span>
            </div>
          `;
        }
    
        try {
          // Hole alle Daten parallel (inkl. Einstellungen für Nebenzeit)
          const heute = this.formatDateLocal(this.getToday());
          const [mitarbeiterRaw, lehrlingeRaw, termineRaw, einstellungen, abwesenheiten, aktiveArbeitspausen, aktivePausen, heutigePausen, tagesstempelRaw] = await Promise.all([
            ApiService.get('/mitarbeiter'),
            ApiService.get('/lehrlinge'),
            ApiService.get(`/termine?datum=${heute}`),
            EinstellungenService.getWerkstatt(),
            ApiService.get(`/abwesenheiten/datum/${heute}`).catch(() => []),
            ApiService.get('/arbeitspausen/aktive').catch(() => []),
            ApiService.get('/pause/aktive').catch(() => []),
            ApiService.get('/pause/heute').catch(() => []),
            ApiService.get(`/tagesstempel?datum=${heute}`).catch(() => [])
          ]);
    
          // Normalisieren: Controller gibt manchmal { termine, aktivePausen } statt reines Array
          const mitarbeiter = Array.isArray(mitarbeiterRaw) ? mitarbeiterRaw : (mitarbeiterRaw?.mitarbeiter || []);
          const lehrlinge   = Array.isArray(lehrlingeRaw)   ? lehrlingeRaw   : (lehrlingeRaw?.lehrlinge   || []);
          const termineHeute = Array.isArray(termineRaw)    ? termineRaw     : (termineRaw?.termine        || []);
    
          // Globale Nebenzeit aus Einstellungen
          const globaleNebenzeitProzent = einstellungen?.nebenzeit_prozent || 0;
    
          // Filtere aktive Mitarbeiter und Lehrlinge
          const aktiveMitarbeiter = mitarbeiter.filter(m => m.aktiv === 1);
          const aktiveLehrlinge = lehrlinge.filter(l => l.aktiv === 1);
    
          // Filtere relevante Termine (keine Import-Termine und keine internen Termine)
          const relevanteTermine = termineHeute.filter(t => {
            const istIntern = t.ist_intern === 1 || t.ist_intern === true || t.ist_intern === '1';
            return !istIntern &&
              t.arbeit !== 'Fahrzeug aus Import' &&
              t.arbeit !== 'Fahrzeug hinzugefügt';
          });
    
          // Arbeitszeiten für heute laden (für alle Mitarbeiter und Lehrlinge)
          const arbeitszeitenPromises = [
            ...aktiveMitarbeiter.map(m => 
              ApiService.get(`/arbeitszeiten-plan/for-date?mitarbeiter_id=${m.id}&datum=${heute}`)
                .then(data => ({ type: 'mitarbeiter', id: m.id, data }))
                .catch(() => ({ type: 'mitarbeiter', id: m.id, data: null }))
            ),
            ...aktiveLehrlinge.map(l =>
              ApiService.get(`/arbeitszeiten-plan/for-date?lehrling_id=${l.id}&datum=${heute}`)
                .then(data => ({ type: 'lehrling', id: l.id, data }))
                .catch(() => ({ type: 'lehrling', id: l.id, data: null }))
            )
          ];
    
          const arbeitszeitenResults = await Promise.all(arbeitszeitenPromises);
          
          // Map für schnellen Zugriff auf Arbeitszeiten
          const arbeitszeitenMap = {};
          arbeitszeitenResults.forEach(result => {
            const key = `${result.type}_${result.id}`;
            arbeitszeitenMap[key] = result.data;
          });
    
          // Tagesstempel-Maps aufbauen
          const tagesstempelMap = {};
          const unterbrechungenMap = {};
          const { stempel: tsStempel = [], unterbrechungen: tsUnterbrechungen = [] } = tagesstempelRaw || {};
          tsStempel.forEach(s => {
            const key = s.mitarbeiter_id ? `m_${s.mitarbeiter_id}` : `l_${s.lehrling_id}`;
            tagesstempelMap[key] = s;
          });
          tsUnterbrechungen.forEach(u => {
            const key = u.mitarbeiter_id ? `m_${u.mitarbeiter_id}` : `l_${u.lehrling_id}`;
            if (!unterbrechungenMap[key]) unterbrechungenMap[key] = [];
            unterbrechungenMap[key].push(u);
          });
    
          // Erstelle Map für Abwesenheiten (für schnellen Zugriff)
          const abwesenheitenMap = {};
          if (Array.isArray(abwesenheiten)) {
            abwesenheiten.forEach(abw => {
              if (abw.mitarbeiter_id) {
                abwesenheitenMap[`mitarbeiter_${abw.mitarbeiter_id}`] = abw;
              }
              if (abw.lehrling_id) {
                abwesenheitenMap[`lehrling_${abw.lehrling_id}`] = abw;
              }
            });
          }
    
          // Kontext für Berechnungen mit Nebenzeit/Aufgabenbewältigung + Arbeitszeiten
          const berechnungsKontext = {
            globaleNebenzeitProzent,
            mitarbeiter,
            lehrlinge,
            arbeitszeitenMap,
            abwesenheitenMap,
            aktiveArbeitspausen: Array.isArray(aktiveArbeitspausen) ? aktiveArbeitspausen : []
          };
    
          // Merge Mittagspause-Tracking in Person-Objekte
          const pausenMap = {};
          (aktivePausen || []).forEach(pause => {
            const key = pause.mitarbeiter_id
              ? `mitarbeiter_${pause.mitarbeiter_id}`
              : `lehrling_${pause.lehrling_id}`;
            pausenMap[key] = {
              pause_tracking_aktiv: true,
              pause_verbleibende_minuten: pause.verbleibende_minuten || 0
            };
          });
    
          const heutePausenSet = new Set();
          (heutigePausen || []).forEach(pause => {
            if (pause.abgeschlossen === 1) {
              const key = pause.mitarbeiter_id
                ? `mitarbeiter_${pause.mitarbeiter_id}`
                : `lehrling_${pause.lehrling_id}`;
              heutePausenSet.add(key);
            }
          });
    
          aktiveMitarbeiter.forEach(m => {
            const pauseInfo = pausenMap[`mitarbeiter_${m.id}`];
            if (pauseInfo) {
              m.pause_tracking_aktiv = pauseInfo.pause_tracking_aktiv;
              m.pause_verbleibende_minuten = pauseInfo.pause_verbleibende_minuten;
            }
            if (heutePausenSet.has(`mitarbeiter_${m.id}`)) {
              m.pause_bereits_gemacht = true;
            }
          });
    
          aktiveLehrlinge.forEach(l => {
            const pauseInfo = pausenMap[`lehrling_${l.id}`];
            if (pauseInfo) {
              l.pause_tracking_aktiv = pauseInfo.pause_tracking_aktiv;
              l.pause_verbleibende_minuten = pauseInfo.pause_verbleibende_minuten;
            }
            if (heutePausenSet.has(`lehrling_${l.id}`)) {
              l.pause_bereits_gemacht = true;
            }
          });
    
          // Stempel-Daten laden und an Termine hängen
          try {
            const stempelGruppen = await ApiService.get(`/stempelzeiten?datum=${heute}`);
            const stempelByTermin = {};
            for (const gruppe of stempelGruppen) {
              for (const a of gruppe.arbeiten) {
                if (!stempelByTermin[a.termin_id]) stempelByTermin[a.termin_id] = [];
                stempelByTermin[a.termin_id].push(a);
              }
            }
            for (const t of relevanteTermine) {
              t.termine_arbeiten_stempel = stempelByTermin[t.id] || [];
            }
          } catch (e) {
            console.warn('[Stempel] Stempel-Daten konnten nicht geladen werden:', e);
          }
    
          // Render Mitarbeiter-Kacheln
          if (mitarbeiterContainer) {
            mitarbeiterContainer.innerHTML = aktiveMitarbeiter.map(m => {
              const tsKey = `m_${m.id}`;
              return this.renderInternPersonKachel(m, relevanteTermine, 'mitarbeiter', berechnungsKontext, tagesstempelMap[tsKey] || null, unterbrechungenMap[tsKey] || []);
            }).join('');
          }
    
          // Render Lehrlinge-Kacheln
          if (lehrlingeContainer) {
            if (aktiveLehrlinge.length > 0) {
              if (keineLehrlingeEl) keineLehrlingeEl.style.display = 'none';
              lehrlingeContainer.innerHTML = aktiveLehrlinge.map(l => {
                const tsKey = `l_${l.id}`;
                return this.renderInternPersonKachel(l, relevanteTermine, 'lehrling', berechnungsKontext, tagesstempelMap[tsKey] || null, unterbrechungenMap[tsKey] || []);
              }).join('');
            } else {
              lehrlingeContainer.innerHTML = '';
              if (keineLehrlingeEl) keineLehrlingeEl.style.display = 'flex';
            }
          }
    
          // Lade auch die internen Termine
          await this.loadInterneTermineListe(mitarbeiter, lehrlinge);
    
        } catch (error) {
          console.error('Fehler beim Laden der Team-Übersicht:', error);
          if (mitarbeiterContainer) {
            mitarbeiterContainer.innerHTML = `
              <div class="intern-keine-auftraege">
                <span>⚠️</span> Fehler beim Laden der Team-Übersicht
              </div>
            `;
          }
        }
      },

      isTerminFuerPerson(termin, personId, isLehrling = false) {
        // Direkte Zuordnung prüfen
        if (isLehrling) {
          if (termin.lehrling_id == personId) return true;
        } else {
          if (termin.mitarbeiter_id == personId) return true;
        }
    
        // arbeitszeiten_details prüfen (JSON mit Mitarbeiter-Zuordnungen)
        if (termin.arbeitszeiten_details) {
          try {
            const details = typeof termin.arbeitszeiten_details === 'string'
              ? JSON.parse(termin.arbeitszeiten_details)
              : termin.arbeitszeiten_details;
    
            // Prüfe _gesamt_mitarbeiter_id (Hauptzuordnung)
            if (details._gesamt_mitarbeiter_id) {
              const gesamt = details._gesamt_mitarbeiter_id;
              if (isLehrling && gesamt.type === 'lehrling' && gesamt.id == personId) return true;
              if (!isLehrling && gesamt.type === 'mitarbeiter' && gesamt.id == personId) return true;
            }
    
            // Durchsuche alle Einträge in arbeitszeiten_details
            for (const key of Object.keys(details)) {
              if (key.startsWith('_')) continue; // Überspringe Meta-Felder
              const entry = details[key];
              if (entry && typeof entry === 'object') {
                if (isLehrling) {
                  if (entry.lehrling_id == personId) return true;
                  // Wenn type='lehrling' wird mitarbeiter_id als lehrling-Referenz gespeichert
                  if (entry.type === 'lehrling' && entry.mitarbeiter_id == personId) return true;
                } else {
                  // Einträge mit type='lehrling' NIEMALS einem Mitarbeiter zuordnen
                  if (entry.type !== 'lehrling' && entry.mitarbeiter_id == personId) return true;
                }
              }
            }
          } catch (e) {
            // JSON Parse Fehler ignorieren
          }
        }
    
        return false;
      },

      internGetArbeitenFromTermin(termin) {
        if (!termin) return [];
        try {
          let details = termin.arbeitszeiten_details;
          if (typeof details === 'string') details = JSON.parse(details);
          if (!details) return [];
          const arbeiten = Array.isArray(details) ? details : (details.arbeiten || []);
          return arbeiten.map((a, idx) => ({
            name: a.name || a.arbeit || `Arbeit ${idx + 1}`,
            zeit: a.dauer_minuten || a.zeit || 0,
            abgeschlossen: !!(a.abgeschlossen || a.fertig),
            index: idx
          }));
        } catch (e) {
          return [];
        }
      },

      internRenderArbeitenKompakt(termin) {
        const arbeiten = this.internGetArbeitenFromTermin(termin);
        if (!arbeiten.length) return '';
        return `<div class="intern-arbeiten-kompakt">${arbeiten.map(a =>
          `<span class="${a.abgeschlossen ? 'arbeit-erledigt' : 'arbeit-offen'}">${a.abgeschlossen ? '✅' : '•'} ${this.escapeHtml(a.name)}</span>`
        ).join('')}</div>`;
      },

      internRenderArbeitenListe(termin, personId, typ) {
        const arbeiten = this.internGetArbeitenFromTermin(termin);
        if (!arbeiten.length) return '';
    
        const stempelMap = {};
        if (Array.isArray(termin.termine_arbeiten_stempel)) {
          for (const s of termin.termine_arbeiten_stempel) {
            stempelMap[s.arbeit] = s;
          }
        }
    
        return `
          <div class="intern-arbeiten-liste">
            ${arbeiten.map(a => {
              const stempel = stempelMap[a.name] || {};
              const hatStart = !!stempel.stempel_start;
              const hatEnde  = !!stempel.stempel_ende;
              const safeArbeit = this.escapeHtml(a.name).replace(/'/g, "\\'");
              const startBtn = hatStart
                ? `<span class="intern-stempel-zeit" style="color:var(--success,#28a745);font-size:12px;">▶ ${stempel.stempel_start}</span>`
                : `<button class="intern-btn-stempel-start"
                    onclick="app.stempelSetzen(${termin.id}, '${safeArbeit}', 'start').then(() => app.loadInternTeamUebersicht())">▶ Start</button>`;
              const endeBtn = hatEnde
                ? `<span class="intern-stempel-zeit" style="color:var(--danger,#dc3545);font-size:12px;">■ ${stempel.stempel_ende}</span>`
                : `<button class="intern-btn-stempel-ende" ${!hatStart ? 'disabled' : ''}
                    onclick="app.stempelSetzen(${termin.id}, '${safeArbeit}', 'ende').then(() => app.loadInternTeamUebersicht())">■ Ende</button>`;
              return `
                <div class="intern-arbeit-item ${a.abgeschlossen ? 'abgeschlossen' : ''}">
                  <span class="arbeit-name">${a.abgeschlossen ? '✅' : '○'} ${this.escapeHtml(a.name)}</span>
                  <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                    ${startBtn}
                    ${endeBtn}
                    ${!a.abgeschlossen ? `<button class="intern-btn-einzelarbeit-fertig"
                      onclick="app.internBeendenEinzelarbeit(${termin.id}, ${a.index}, this)">✓ Fertig</button>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      },

      renderInternPersonKachel(person, alleTermine, typ = 'mitarbeiter', kontext = {}, tagesstempel = null, unterbrechungen = []) {
        const personId = person.id;
        const personName = person.name;
        const isLehrling = typ === 'lehrling';
    
        // Finde Termine für diese Person (inkl. arbeitszeiten_details)
        const personTermine = alleTermine.filter(t =>
          this.isTerminFuerPerson(t, personId, isLehrling)
        );
    
        // Sortiere: startzeit (DB) → arbeitszeiten_details._startzeit → bring_zeit
        const getSortZeit = t => {
          if (t.startzeit) return t.startzeit;
          if (t.arbeitszeiten_details) {
            try {
              const d = typeof t.arbeitszeiten_details === 'string' ? JSON.parse(t.arbeitszeiten_details) : t.arbeitszeiten_details;
              if (d && d._startzeit) return d._startzeit;
            } catch(e) {}
          }
          return t.bring_zeit || '23:59';
        };
        personTermine.sort((a, b) => getSortZeit(a).localeCompare(getSortZeit(b)));
    
        // Aktuelle Uhrzeit für Zeitvergleiche
        const jetzt = new Date();
        const jetztZeit = `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`;
    
        // Zeige nur Termine die explizit auf 'in_arbeit' gesetzt wurden
        const aktuellerAuftrag = personTermine.find(t => t.status === 'in_arbeit');
    
        // Finde nächsten Auftrag (noch nicht gestartet).
        // Für geplante Termine mit vergangener Startzeit gilt: Die dynamisch vorgerückte
        // Startzeit (nächste halbe Stunde) wird für die Anzeige verwendet.
        const aktivePausen = kontext.aktiveArbeitspausen || [];
        const pauseTerminIds = new Set(aktivePausen.map(p => Number(p.termin_id)));

        const naechsterAuftragRoh = personTermine.find(t => {
          if (t === aktuellerAuftrag) return false;
          if (pauseTerminIds.has(Number(t.id))) return false;
          if (t.status === 'storniert') return false;
          if (t.status === 'unterbrochen' || t.status === 'in_arbeit') return false;
          if (!['geplant', 'offen', 'wartend'].includes(t.status)) return false;
          if (t.status === 'abgeschlossen') {
            let hatAbgeschlossene = false;
            let hatOffene = false;
            if (t.arbeitszeiten_details) {
              try {
                const det = typeof t.arbeitszeiten_details === 'string'
                  ? JSON.parse(t.arbeitszeiten_details) : t.arbeitszeiten_details;
                for (const k of Object.keys(det)) {
                  if (k.startsWith('_')) continue;
                  if (det[k] && det[k].abgeschlossen === true) { hatAbgeschlossene = true; } else { hatOffene = true; }
                }
              } catch (e) {}
            }
            if (!(hatAbgeschlossene && hatOffene)) return false;
          }
          // Aufnehmen wenn: keine Startzeit, Startzeit in der Zukunft, ODER Startzeit
          // in der Vergangenheit (→ wird dynamisch vorgerückt)
          return true;
        });
        // Erstelle eine View-Kopie mit der effektiv angezeigten Startzeit (ohne DB zu ändern)
        const naechsterAuftrag = naechsterAuftragRoh
          ? { ...naechsterAuftragRoh, startzeit: this.getEffektiveDynamischStartzeit(naechsterAuftragRoh) }
          : null;
    
        // Erkenne ob Startzeit dynamisch vorgerückt wurde (zur visuellen Kennzeichnung)
        const naechsterAuftragOriginalStart = naechsterAuftragRoh
          ? (naechsterAuftragRoh.startzeit || naechsterAuftragRoh.bring_zeit)
          : null;
        const naechsterIstVerzoegert = naechsterAuftrag
          && naechsterAuftragOriginalStart
          && naechsterAuftrag.startzeit !== naechsterAuftragOriginalStart;
    
        // Heutiges Datum als String (YYYY-MM-DD) für API-Aufrufe
        const today = this.formatDateLocal(this.getToday());
    
        // Prüfe ob Lehrling in Berufsschule ist
        let inBerufsschule = false;
        if (isLehrling && person.berufsschul_wochen) {
          const schulCheck = this.isLehrlingInBerufsschule(person, this.getToday());
          inBerufsschule = schulCheck.inSchule;
        }
    
        // Prüfe ob Person gerade in Mittagspause ist (6h-Regel)
        const inPause = this.istPersonAktuellInPause(person, jetztZeit);
    
        // Prüfe ob Person eine aktive Arbeitspause hat (für aktuellen Auftrag)
        const aktiveArbeitspause = aktuellerAuftrag
          ? aktivePausen.find(p => p.termin_id === aktuellerAuftrag.id)
          : null;
        const pausierteAuftraege = aktivePausen
          .map(p => ({
            ...p,
            id: p.termin_id,
            mitarbeiter_id: p.termin_mitarbeiter_id || p.mitarbeiter_id,
            lehrling_id: p.termin_lehrling_id || p.lehrling_id,
            startzeit: p.startzeit || p.bring_zeit
          }))
          .filter(p => {
            const direktZugeordnet = isLehrling
              ? Number(p.lehrling_id) === Number(personId)
              : Number(p.mitarbeiter_id) === Number(personId);
            return direktZugeordnet || this.isTerminFuerPerson(p, personId, isLehrling);
          });
        const zeigtPausierteArbeit = !aktuellerAuftrag && pausierteAuftraege.length > 0;
        const istArbeitPausiert = !!aktiveArbeitspause || zeigtPausierteArbeit;
        const manuellePauseAktiv = !!person.pause_tracking_aktiv;
    
        // Prüfe ob Person heute abwesend ist (Urlaub/Krank/Lehrgang)
        const abwesenheitenMap = kontext.abwesenheitenMap || {};
        const abwesenheitKey = isLehrling ? `lehrling_${personId}` : `mitarbeiter_${personId}`;
        const abwesenheit = abwesenheitenMap[abwesenheitKey];
        const istAbwesend = !!abwesenheit;
        const abwesenheitsTyp = abwesenheit?.typ || '';
    
        // Status Badge bestimmen
        let badgeClass = 'frei';
        let badgeText = 'Frei';
        if (inPause) {
          badgeClass = 'pause';
          badgeText = '🍽️ Pause';
        } else if (istAbwesend) {
          // Spezifischer Badge für Abwesenheitstyp
          badgeClass = 'abwesend';
          const abwesenheitsLabels = {
            'urlaub': '🏖️ Urlaub',
            'krank': '🤒 Krank',
            'lehrgang': '📖 Lehrgang',
            'berufsschule': '📚 Berufsschule'
          };
          badgeText = abwesenheitsLabels[abwesenheitsTyp] || '🏥 Abwesend';
        } else if (inBerufsschule) {
          badgeClass = 'pause';
          badgeText = 'Berufsschule';
        } else if (istArbeitPausiert) {
          badgeClass = 'arbeit-pausiert';
          const grundLabels = {
            'teil_fehlt': 'Teil fehlt',
            'rueckfrage_kunde': 'Rückfrage',
            'vorrang': 'Vorrang',
            'sonstiges': 'Pause',
          };
          const pauseGrund = aktiveArbeitspause?.grund || pausierteAuftraege[0]?.grund || 'sonstiges';
          badgeText = `⏸️ ${grundLabels[pauseGrund] || 'Pause'}`;
        } else if (aktuellerAuftrag) {
          badgeClass = 'in-arbeit';
          badgeText = 'In Arbeit';
        }
    
        // Body Content
        let bodyContent = '';
        
        if (inPause && person.pause_tracking_aktiv) {
          bodyContent = `
            <div class="intern-person-schule">
              <div class="schule-icon">🍽️</div>
              <div class="schule-text">Mittagspause</div>
            </div>
          `;
        } else if (istAbwesend) {
          // Spezifische Anzeige für Abwesenheitstyp
          const abwesenheitsIcons = {
            'urlaub': '🏖️',
            'krank': '🤒',
            'lehrgang': '📖',
            'berufsschule': '📚'
          };
          const abwesenheitsTexte = {
            'urlaub': 'Im Urlaub',
            'krank': 'Krankgemeldet',
            'lehrgang': 'Im Lehrgang',
            'berufsschule': 'In der Berufsschule'
          };
          const icon = abwesenheitsIcons[abwesenheitsTyp] || '🏥';
          const text = abwesenheitsTexte[abwesenheitsTyp] || 'Abwesend';
          // Beschreibung nur bei Urlaub/Lehrgang/Berufsschule anzeigen, nicht bei Krankheit (Datenschutz)
          const beschreibung = (abwesenheit?.beschreibung && abwesenheitsTyp !== 'krank') 
            ? `<div style="margin-top: 5px; font-size: 0.9em; color: #666;">${this.escapeHtml(abwesenheit.beschreibung)}</div>` 
            : '';
          
          bodyContent = `
            <div class="intern-person-schule">
              <div class="schule-icon">${icon}</div>
              <div class="schule-text">${text}${beschreibung}</div>
            </div>
          `;
        } else if (inBerufsschule) {
          bodyContent = `
            <div class="intern-person-schule">
              <div class="schule-icon">📚</div>
              <div class="schule-text">Heute in der Berufsschule</div>
            </div>
          `;
        } else if (aktuellerAuftrag) {
          // Fortschritt: einfrieren wenn pausiert
          let fortschritt;
          if (istArbeitPausiert && aktiveArbeitspause.gestartet_am) {
            const pauseZeit = new Date(aktiveArbeitspause.gestartet_am);
            const startzeit = aktuellerAuftrag.startzeit || aktuellerAuftrag.bring_zeit;
            if (startzeit) {
              const startMin = this.timeToMinutes(startzeit);
              const startDate = new Date(pauseZeit);
              startDate.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
              const verstricheneMin = (pauseZeit - startDate) / 60000;
              if (verstricheneMin < 0) {
                // Randfall: Pausezeit liegt vor berechneter Startzeit (z.B. Tageswechsel)
                // → Fallback auf dynamische Berechnung
                fortschritt = this.berechneAuftragFortschrittMitFaktoren(aktuellerAuftrag, person, isLehrling, kontext);
              } else {
                const geschaetzteZeit = this.getEffektiveArbeitszeitMitFaktoren(aktuellerAuftrag, person, isLehrling, kontext);
                fortschritt = Math.round(Math.max(0, Math.min(100, (verstricheneMin / geschaetzteZeit) * 100)));
              }
            } else {
              fortschritt = 0;
            }
          } else {
            fortschritt = this.berechneAuftragFortschrittMitFaktoren(aktuellerAuftrag, person, isLehrling, kontext);
          }
          const restzeit = this.berechneRestzeitMitFaktoren(aktuellerAuftrag, person, isLehrling, kontext);
          const isUeberzogen = fortschritt > 100;
    
          // Arbeitszeiten aus arbeitszeiten_details extrahieren (nur zugeordnete Arbeiten)
          const arbeitenDetails = this.getArbeitenDetailsList(aktuellerAuftrag, person?.id, isLehrling);
    
          // Pausiert-Zeitangabe
          const pauseSeitText = istArbeitPausiert && aktiveArbeitspause.gestartet_am
            ? (() => {
                const d = new Date(aktiveArbeitspause.gestartet_am);
                return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} Uhr`;
              })()
            : null;
    
          // Prüfe verschoben und verspätet
          const istVerschoben = aktuellerAuftrag.verschoben_von_datum != null;
          const abholDatumGilt = !aktuellerAuftrag.abholung_datum || aktuellerAuftrag.abholung_datum === aktuellerAuftrag.datum;
          const istVerspaetet = abholDatumGilt && aktuellerAuftrag.endzeit_berechnet && aktuellerAuftrag.abholung_zeit &&
                                aktuellerAuftrag.endzeit_berechnet > aktuellerAuftrag.abholung_zeit;
          let statusBadges = '';
          if (istVerschoben) statusBadges += '<span class="badge-verschoben">📅 Verschoben</span>';
          if (istVerspaetet) statusBadges += '<span class="badge-verspaetet">⚠️ Verzögerung</span>';
          const interneNr = aktuellerAuftrag.interne_auftragsnummer && aktuellerAuftrag.interne_auftragsnummer.trim()
            ? this.escapeHtml(aktuellerAuftrag.interne_auftragsnummer.trim()) : null;
    
          // Pause/Fortsetzen-Button
          const pausePersonId = isLehrling ? `null, ${personId}` : `${personId}, null`;
          const pauseButton = istArbeitPausiert
            ? `<button class="intern-btn-arbeit-fortsetzen" onclick="app.interneArbeitFortsetzen(${aktuellerAuftrag.id}, this)">▶️ Fortsetzen</button>`
            : `<button class="intern-btn-arbeit-pause" onclick="app.interneArbeitPausieren(${aktuellerAuftrag.id}, ${pausePersonId})">⏸️ Pause</button>`;
    
          bodyContent = `
            <div class="intern-person-auftrag ${istVerschoben ? 'termin-verschoben' : ''} ${istVerspaetet ? 'termin-verspaetet' : ''}">
              <div class="auftrag-label">🔧 ${istArbeitPausiert ? 'Unterbrochener Auftrag' : 'Aktueller Auftrag'} ${statusBadges}</div>
              <div class="auftrag-nr">${aktuellerAuftrag.termin_nr || '-'}${interneNr ? ` · <span class="auftrag-interne-nr">${interneNr}</span>` : ''}</div>
              <div class="auftrag-kunde">${this.escapeHtml(aktuellerAuftrag.kunde_name || '-')}</div>
              <div class="auftrag-kennzeichen">${this.escapeHtml(aktuellerAuftrag.kennzeichen || '-')}</div>
              ${this.internRenderArbeitenKompakt(aktuellerAuftrag) || `<div class="auftrag-arbeit">${this.escapeHtml(aktuellerAuftrag.arbeit || '-')}</div>`}
              ${pauseSeitText ? `<div class="intern-arbeit-pause-seit">Pausiert seit: ${pauseSeitText}</div>` : ''}
            </div>
    
            ${this.internRenderArbeitenListe(aktuellerAuftrag, person.id, typ)}
    
    
    
            <div class="intern-person-zeit">
              <div class="intern-person-zeit-item">
                <div class="zeit-label">Beginn</div>
                <div class="zeit-value">${this.normalizeZeit(this.getEffektiveStartzeit(aktuellerAuftrag)) || '--:--'}</div>
              </div>
              <div class="intern-person-zeit-item">
                <div class="zeit-label">${aktuellerAuftrag.status === 'abgeschlossen' ? 'Fertig' : 'Fertig ca.'}</div>
                <div class="zeit-value">${this.berechneEndzeitMitFaktoren(aktuellerAuftrag, person, isLehrling, kontext)}</div>
              </div>
              <div class="intern-person-zeit-item">
                <div class="zeit-label">${aktuellerAuftrag.status === 'abgeschlossen' ? 'Dauer' : 'Rest'}</div>
                <div class="zeit-value" style="color: ${isUeberzogen ? '#dc3545' : 'var(--accent)'}">
                  ${aktuellerAuftrag.status === 'abgeschlossen'
                    ? this.formatMinutesToHours(aktuellerAuftrag.tatsaechliche_zeit || aktuellerAuftrag.geschaetzte_zeit || 0)
                    : restzeit}
                </div>
              </div>
            </div>
    
            <div class="intern-person-fortschritt">
              <div class="intern-person-fortschritt-bar">
                <div class="intern-person-fortschritt-fill ${isUeberzogen ? 'ueberzogen' : ''} ${istArbeitPausiert ? 'eingefroren' : ''}"
                     style="width: ${Math.min(fortschritt, 100)}%"></div>
              </div>
              <div class="intern-person-fortschritt-text">
                <span>Fortschritt${istArbeitPausiert ? ' 🧊' : ''}</span>
                <span>${Math.min(fortschritt, 150)}%</span>
              </div>
            </div>
    
            ${naechsterAuftrag ? `
              <div class="intern-person-naechster">
                <div class="naechster-label">📋 Danach:</div>
                <div class="naechster-info">
                  <span class="naechster-kunde">${this.escapeHtml(naechsterAuftrag.kunde_name || '-')} • ${this.escapeHtml(naechsterAuftrag.kennzeichen || '-')}</span>
                  <span class="naechster-zeit">${this.normalizeZeit(this.getEffektiveStartzeit(naechsterAuftrag)) || '--:--'}</span>
                </div>
              </div>
            ` : ''}
    
            <div class="intern-arbeit-pause-actions">
              ${pauseButton}
            </div>
          `;
        } else if (pausierteAuftraege.length > 0 || naechsterAuftrag) {
          // Kein aktueller Auftrag, aber nächster geplant
          const naechsterFertigCa = naechsterAuftrag
            ? this.berechneEndzeitMitFaktoren(naechsterAuftrag, person, isLehrling, kontext)
            : null;
          const pauseGrundLabels = {
            teil_fehlt: 'Teil fehlt',
            rueckfrage_kunde: 'Rückfrage Kunde',
            vorrang: 'Vorrang',
            sonstiges: 'Pause'
          };
          const pausierteHtml = pausierteAuftraege.length > 0 ? `
            <div class="intern-person-pausiert-liste">
              <div class="naechster-label">⏸️ Pausiert</div>
              ${pausierteAuftraege.map(p => {
                const pauseSeit = p.gestartet_am ? (() => {
                  const d = new Date(p.gestartet_am);
                  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} Uhr`;
                })() : '';
                const interneNr = p.interne_auftragsnummer && p.interne_auftragsnummer.trim()
                  ? ` · <span class="auftrag-interne-nr">${this.escapeHtml(p.interne_auftragsnummer.trim())}</span>` : '';
                return `
                  <div class="intern-person-auftrag intern-person-auftrag-pausiert">
                    <div class="auftrag-label">${this.escapeHtml(pauseGrundLabels[p.grund] || 'Pause')}${pauseSeit ? ` seit ${pauseSeit}` : ''}</div>
                    <div class="auftrag-nr">${p.termin_nr || '-'}${interneNr}</div>
                    <div class="auftrag-kunde">${this.escapeHtml(p.kunde_name || '-')}</div>
                    <div class="auftrag-kennzeichen">${this.escapeHtml(p.kennzeichen || '-')}</div>
                    <div class="auftrag-arbeit">${this.escapeHtml(p.arbeit || '-')}</div>
                    <button class="intern-btn-arbeit-fortsetzen" onclick="app.interneArbeitFortsetzen(${p.termin_id}, this)">▶️ Weiterführen</button>
                  </div>
                `;
              }).join('')}
            </div>
          ` : '';
          bodyContent = `
            <div class="intern-person-leer">
              <div class="leer-icon">☕</div>
              <div class="leer-text">Aktuell kein Auftrag</div>
            </div>
            ${pausierteHtml}

            ${naechsterAuftrag ? `<div class="intern-person-naechster">
              <div class="naechster-label">⏰ Nächster Auftrag:${naechsterIstVerzoegert ? ' <span style="color:#fd7e14;font-size:0.8em;">⚠ nachrückt</span>' : ''}</div>
              <div class="intern-person-auftrag" style="border-left-color: #28a745;">
                <div class="auftrag-nr">${naechsterAuftrag.termin_nr || '-'}</div>
                <div class="auftrag-kunde">${this.escapeHtml(naechsterAuftrag.kunde_name || '-')}</div>
                <div class="auftrag-kennzeichen">${this.escapeHtml(naechsterAuftrag.kennzeichen || '-')}</div>
                <div class="auftrag-arbeit">${this.escapeHtml(naechsterAuftrag.arbeit || '-')}</div>
              </div>
              <div class="intern-person-zeit" style="margin-top: 10px;">
                <div class="intern-person-zeit-item">
                  <div class="zeit-label">Start${naechsterIstVerzoegert ? ' ca.' : ''}</div>
                  <div class="zeit-value">${this.normalizeZeit(this.getEffektiveStartzeit(naechsterAuftrag)) || '--:--'}</div>
                </div>
                <div class="intern-person-zeit-item">
                  <div class="zeit-label">Fertig ca.</div>
                  <div class="zeit-value">${naechsterFertigCa}</div>
                </div>
                <div class="intern-person-zeit-item">
                  <div class="zeit-label">Wartezeit</div>
                  <div class="zeit-value">${this.berechneWartezeitBis(naechsterAuftrag)}</div>
                </div>
              </div>
            </div>` : ''}
          `;
        } else {
          // Keine Aufträge heute
          bodyContent = `
            <div class="intern-person-leer">
              <div class="leer-icon">${typ === 'lehrling' ? '🧹' : '🎉'}</div>
              <div class="leer-text">${typ === 'lehrling' ? 'Werkstatt-Reinigung' : 'Keine Aufträge für heute'}</div>
            </div>
          `;
        }
    
        // Arbeitszeit für heute ermitteln
        const arbeitszeitenMap = kontext.arbeitszeitenMap || {};
        const arbeitszeitKey = isLehrling ? `lehrling_${personId}` : `mitarbeiter_${personId}`;
        const arbeitszeit = arbeitszeitenMap[arbeitszeitKey];
        
        // Arbeitszeit nur anzeigen, wenn Person nicht abwesend ist (nicht in Pause, nicht in Berufsschule, nicht abwesend)
        const zeigeArbeitszeit = !inPause && !inBerufsschule && !istAbwesend;
    
        // === TABLET-STYLE ACTION BUTTONS (immer sichtbar im Header) ===
        const terminMitButtons = aktuellerAuftrag || naechsterAuftrag;
        const terminArbeiten = terminMitButtons ? this.internGetArbeitenFromTermin(terminMitButtons) : [];
        const kachelHatMehrereArbeiten = terminArbeiten.length > 1;
        const alleArbeitenAbgeschlossen = terminArbeiten.length > 0 && terminArbeiten.every(a => a.abgeschlossen);
    
        const kannStarten = terminMitButtons && !manuellePauseAktiv && !inBerufsschule && !istAbwesend && !inPause &&
                           (terminMitButtons.status === 'geplant' || terminMitButtons.status === 'offen' || terminMitButtons.status === 'wartend');
        const kannBeenden = terminMitButtons && !manuellePauseAktiv && !inBerufsschule && !istAbwesend && !inPause &&
                           terminMitButtons.status === 'in_arbeit' && (!kachelHatMehrereArbeiten || alleArbeitenAbgeschlossen);
        const kannAlleBeenden = kachelHatMehrereArbeiten && terminMitButtons && terminMitButtons.status === 'in_arbeit' && !manuellePauseAktiv;
    
        const _kn = this.escapeHtml(terminMitButtons ? (terminMitButtons.kunde_name || '') : '').replace(/'/g, '&#39;');
        let toggleButtonHtml = '';
        if (kannStarten) {
          toggleButtonHtml = `<button class="intern-tab-btn intern-tab-btn-confirm" onclick="app.internStarten(${terminMitButtons.id}, '${_kn}', ${personId}, '${typ}')"><span class="intern-tab-btn-icon">▶️</span> Starten</button>`;
        } else if (kannBeenden) {
          const btnText = (kachelHatMehrereArbeiten && alleArbeitenAbgeschlossen) ? 'Alle Fertig ✓' : 'Fertig';
          toggleButtonHtml = `<button class="intern-tab-btn intern-tab-btn-complete" onclick="app.internBeenden(${terminMitButtons.id}, '${_kn}')"><span class="intern-tab-btn-icon">✓</span> ${btnText}</button>`;
        } else if (kannAlleBeenden) {
          toggleButtonHtml = `<button class="intern-tab-btn intern-tab-btn-complete" onclick="app.internBeenden(${terminMitButtons.id}, '${_kn}')"><span class="intern-tab-btn-icon">✓</span> Fertig</button>`;
        } else {
          toggleButtonHtml = `<button class="intern-tab-btn intern-tab-btn-confirm" disabled><span class="intern-tab-btn-icon">▶️</span> Starten</button>`;
        }
    
        // Zeitfenster-Berechnung für Smart-Pause-Button (HTML wird nach aktiveUnterbrechung gebaut)
        const jetztNow = new Date();
        const jetztMinNow = jetztNow.getHours() * 60 + jetztNow.getMinutes();
        const [pHNow, pMNow] = (person.mittagspause_start || '12:00').split(':').map(Number);
        const pausenStartMinNow = pHNow * 60 + pMNow;
        const pausenEndeMinNow = pausenStartMinNow + (person.pausenzeit_minuten || 30);
        const pauseFensterMin = pausenStartMinNow - 60;
        const pauseFensterMax = pausenEndeMinNow + 60;
        const imAnzeigePauseFenster = jetztMinNow >= pauseFensterMin && jetztMinNow <= pauseFensterMax;
    
        // Tagesstempel-Strip + Buttons
        const mid = isLehrling ? null : personId;
        const lid = isLehrling ? personId : null;
        const midArg = mid !== null ? mid : 'null';
        const lidArg = lid !== null ? lid : 'null';
        const _z2m = z => { const [h, m] = z.substring(0, 5).split(':').map(Number); return h * 60 + m; };
        const hatKommen = tagesstempel && tagesstempel.kommen_zeit;
        const hatGehen  = tagesstempel && tagesstempel.gehen_zeit;
        const aktiveUnterbrechung = (unterbrechungen || []).find(u => !u.ende_zeit);
    
        // Smart-Pause-Button: ein Button der sich je nach Kontext automatisch anpasst
        let smartPauseBtn = '';
        if (hatKommen && !hatGehen && !istAbwesend && !inBerufsschule) {
          if (aktiveUnterbrechung) {
            // Unterbrechung aktiv → Weiterarbeiten
            smartPauseBtn = `<button class="intern-tab-btn" style="background:#ffc107;color:#333;border:none;border-radius:6px;padding:5px 12px;font-size:13px;font-weight:600;cursor:pointer;" onclick="app.webUnterbrechungEnde(${midArg}, ${lidArg})">▶ Weiterarbeiten</button>`;
          } else if (person.pause_tracking_aktiv) {
            // Mittagspause läuft → Countdown mit Fortschrittsbalken; Klick = Pause beenden
            const verblMin = person.pause_verbleibende_minuten || 0;
            const total = person.pausenzeit_minuten || 30;
            const pct = Math.round((1 - verblMin / total) * 100);
            const labelText = verblMin > 0 ? `🍽️ ${verblMin} Min · läuft • Klick = Stop` : '🍽️ Pause beenden';
            smartPauseBtn = `<button class="intern-tab-btn" style="background:#fd7e14;color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:13px;cursor:pointer;min-width:130px;" onclick="app.internPauseBeenden(${personId}, '${typ}')" title="Klicken um Pause zu beenden">
              <span>${labelText}</span>
              <span style="display:block;height:4px;background:rgba(255,255,255,0.35);border-radius:2px;margin-top:3px;"><span style="display:block;height:4px;background:#fff;border-radius:2px;width:${pct}%;"></span></span>
            </button>`;
          } else {
            // Nur Mittagspause-Button im Header – Arbeitsunterbrechung wandert in das 'Beenden'-Sheet
            let mittagsBtn = '';
            if (!person.pause_bereits_gemacht) {
              const labelMit = imAnzeigePauseFenster
                ? `🍽️ Mittagspause · ${person.mittagspause_start || '12:00'}`
                : '🍽️ Mittagspause';
              mittagsBtn = `<button class="intern-tab-btn intern-tab-btn-pause" style="background:#fd7e14;color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:13px;cursor:pointer;" onclick="app.internPauseStarten(${personId}, '${typ}', '${today}', ${imAnzeigePauseFenster})">${labelMit}</button>`;
            } else {
              mittagsBtn = `<button class="intern-tab-btn" disabled style="background:#e9ecef;color:#6c757d;border:none;border-radius:6px;padding:5px 12px;font-size:13px;cursor:not-allowed;" title="Mittagspause heute bereits gemacht">✅ Pause erledigt</button>`;
            }
            smartPauseBtn = mittagsBtn;
          }
        }
    
        let tagesstempelStripHtml = '';
        if (hatKommen) {
          const kommenZeit = tagesstempel.kommen_zeit.substring(0, 5);
          let nettoHtml = '';
          if (hatGehen) {
            const gehenZeit = tagesstempel.gehen_zeit.substring(0, 5);
            const ubMin = (unterbrechungen || []).filter(u => u.ende_zeit).reduce((s, u) => s + (_z2m(u.ende_zeit) - _z2m(u.start_zeit)), 0);
            const nettoMin = _z2m(gehenZeit) - _z2m(kommenZeit) - ubMin;
            const nH = Math.floor(nettoMin / 60); const nM = nettoMin % 60;
            nettoHtml = `<span style="color:#555;font-size:12px;">⏱ ${nH > 0 ? nH + 'h ' : ''}${nM}min</span>`;
          }
          const ubList = (unterbrechungen || []).filter(u => u.ende_zeit);
          const ubHtml = ubList.length ? `<span style="color:#888;font-size:12px;">⏸ ${ubList.map(u => u.start_zeit.substring(0,5)+'–'+u.ende_zeit.substring(0,5)).join(', ')}</span>` : '';
          const aktiveUbHtml = aktiveUnterbrechung
            ? `<span style="background:#ffc107;color:#333;padding:2px 10px;border-radius:10px;font-weight:700;font-size:12px;">⏸ In Pause seit ${aktiveUnterbrechung.start_zeit.substring(0,5)}</span>`
            : '';
          const gehenText = hatGehen ? `<span style="color:#dc3545;font-weight:600;">■ ${tagesstempel.gehen_zeit.substring(0,5)}</span>` : '';
          const _quelleIcon = q => q === 'stempel' ? '<span title="Live gestempelt" style="font-size:11px;">🟢</span>' : q === 'manuell' ? '<span title="Manuell korrigiert" style="font-size:11px;">✏️</span>' : q === 'auto' ? '<span title="Automatisch abgestempelt" style="font-size:11px;">🤖</span>' : '';
          const kommenIconHtml = _quelleIcon(tagesstempel.kommen_quelle);
          const gehenIconHtml  = hatGehen ? _quelleIcon(tagesstempel.gehen_quelle) : '';
          tagesstempelStripHtml = `<div style="padding:5px 12px;background:${aktiveUnterbrechung ? '#fff8e1' : '#f8f9fa'};border-top:1px solid ${aktiveUnterbrechung ? '#ffc107' : '#dee2e6'};display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:13px;">
            <span style="color:#198754;font-weight:600;">▶ ${kommenZeit}</span>${kommenIconHtml}${gehenText ? gehenText + gehenIconHtml : ''}${nettoHtml}${aktiveUbHtml}${ubHtml}</div>`;
        }
    
        let tagesstempelBtnHtml = '';
        if (!istAbwesend && !inBerufsschule) {
          if (!hatKommen) {
            tagesstempelBtnHtml = `<div style="padding:6px 12px;background:#f0fff4;border-top:1px solid #dee2e6;">
              <button class="intern-tab-btn" style="background:#28a745;color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:13px;cursor:pointer;" onclick="app.webTagesstempelKommen(${midArg}, ${lidArg})">▶ Arbeitsbeginn</button>
            </div>`;
          } else if (!hatGehen) {
            tagesstempelBtnHtml = `<div style="padding:6px 12px;background:#fff8f8;border-top:1px solid #dee2e6;">
              <button class="intern-tab-btn" style="background:#dc3545;color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:13px;cursor:pointer;" onclick="app.webBeendenSheet(${midArg}, ${lidArg})">🔴 Beenden <span style="opacity:0.85;font-size:0.9em;">▾</span></button>
            </div>`;
          }
        }
    
        return `
          <div class="intern-person-kachel ${isLehrling ? 'lehrling' : ''} ${istArbeitPausiert ? 'arbeit-pausiert' : ''}">
            <div class="intern-person-header">
              <div class="intern-person-header-left">
                <div class="intern-person-name">
                  <span class="person-icon">${isLehrling ? '🎓' : '👷'}</span>
                  <span>${this.escapeHtml(personName)}</span>
                </div>
                <div class="intern-person-badge ${badgeClass}">${badgeText}</div>
              </div>
              <div class="intern-kachel-tab-buttons">${toggleButtonHtml}${smartPauseBtn}</div>
            </div>
            ${tagesstempelStripHtml}
            ${tagesstempelBtnHtml}
            ${zeigeArbeitszeit && arbeitszeit && !arbeitszeit.ist_frei && arbeitszeit.arbeitszeit_start && arbeitszeit.arbeitszeit_ende && arbeitszeit.arbeitszeit_start !== arbeitszeit.arbeitszeit_ende ? `
            <div class="intern-person-arbeitszeit">
              <span class="arbeitszeit-label">⏰ Arbeitszeit:</span>
              <span class="arbeitszeit-wert">${arbeitszeit.arbeitszeit_start} - ${arbeitszeit.arbeitszeit_ende}</span>
            </div>
            ` : ''}
            <div class="intern-person-body">
              ${bodyContent}
            </div>
          </div>
        `;
      },

      async interneArbeitPausieren(terminId, mitarbeiterId, lehrlingId) {
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
    
        const grundLabels = {
          teil_fehlt: '⏳ Teil fehlt / wird geliefert',
          rueckfrage_kunde: '❓ Rückfrage beim Kunden',
          vorrang: '🔀 Vorrang dringenderer Auftrag'
        };
        grundLabels.sonstiges = 'Sonstige Unterbrechung';
    
        modal.innerHTML = `
          <div style="background:white;border-radius:12px;padding:24px;width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
              <strong style="font-size:15px;color:#333;">⏸️ Arbeit unterbrechen</strong>
              <span id="arbeitPauseModalClose" style="cursor:pointer;color:#999;font-size:20px;line-height:1;">✕</span>
            </div>
            <p style="font-size:13px;color:#666;margin-bottom:14px;">Warum wird die Arbeit unterbrochen?</p>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
              ${Object.entries(grundLabels).map(([val, label]) => `
                <label style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e0e0e0;border-radius:8px;cursor:pointer;font-size:14px;">
                  <input type="radio" name="arbeitPauseGrund" value="${val}" style="accent-color:#1976d2;">
                  ${label}
                </label>
              `).join('')}
            </div>
            <div style="display:flex;gap:8px;">
              <button id="arbeitPauseAbbrechen" style="flex:1;padding:10px;background:#f0f0f0;color:#555;border:none;border-radius:6px;font-size:13px;cursor:pointer;">Abbrechen</button>
              <button id="arbeitPauseBestaetigen" style="flex:1;padding:10px;background:#636e72;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">⏸️ Pausieren</button>
            </div>
          </div>
        `;
    
        document.body.appendChild(modal);
        const schliesseModal = () => document.body.removeChild(modal);
    
        modal.querySelector('#arbeitPauseModalClose').onclick = schliesseModal;
        modal.querySelector('#arbeitPauseAbbrechen').onclick = schliesseModal;
        modal.onclick = (e) => { if (e.target === modal) schliesseModal(); };
    
        modal.querySelector('#arbeitPauseBestaetigen').onclick = async () => {
          const selected = modal.querySelector('input[name="arbeitPauseGrund"]:checked');
          if (!selected) {
            alert('Bitte einen Grund auswählen.');
            return;
          }
          try {
            await ApiService.post('/arbeitspausen/starten', {
              termin_id: terminId,
              mitarbeiter_id: mitarbeiterId || null,
              lehrling_id: lehrlingId || null,
              grund: selected.value
            });
            schliesseModal();
            this.loadInternTeamUebersicht();
          } catch (e) {
            console.error('[Arbeitspause] Fehler beim Starten:', e);
            alert('Fehler beim Starten der Pause.');
          }
        };
      },

      async interneArbeitFortsetzen(terminId, btn) {
        // Doppelklick-Schutz
        if (btn) btn.disabled = true;
        try {
          await ApiService.post('/arbeitspausen/beenden', { termin_id: terminId });
          this.loadInternTeamUebersicht();
        } catch (e) {
          console.error('[Arbeitspause] Fehler beim Fortsetzen:', e);
          if (btn) btn.disabled = false;
          alert('Fehler beim Fortsetzen der Arbeit.');
        }
      },

      async internStarten(terminId, kundeName, personId = null, personTyp = null) {
        if (!confirm(`Termin für ${kundeName} starten?`)) return;
        try {
          const jetzt = new Date();
          const startzeit = `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`;
          await ApiService.put(`/termine/${terminId}`, { status: 'in_arbeit', startzeit });
          // Folgezeiten neu berechnen wenn Personzuordnung bekannt
          if (personId && personTyp) {
            const heute = this.formatDateLocal(this.getToday());
            await ApiService.post('/termine/berechne-zeiten-neu', {
              personId, personTyp, datum: heute, startTerminId: terminId
            }).catch(() => {}); // Fehler ignorieren – Hauptaktion war erfolgreich
          }
          this.loadInternTeamUebersicht();
        } catch (err) {
          console.error('internStarten Fehler:', err);
          alert('Fehler beim Starten des Termins.');
        }
      },

      async internBeenden(terminId, kundeName) {
        if (!confirm(`Termin für ${kundeName} als fertig markieren?`)) return;
        try {
          await ApiService.put(`/termine/${terminId}`, {
            status: 'abgeschlossen',
            fertigstellung_zeit: new Date().toISOString()
          });
          this.loadInternTeamUebersicht();
        } catch (err) {
          console.error('internBeenden Fehler:', err);
          alert('Fehler beim Beenden des Termins.');
        }
      },

      async internBeendenEinzelarbeit(terminId, arbeitIndex, btn) {
        if (btn && btn.disabled) return;
        if (btn) btn.disabled = true;
        try {
          await ApiService.post(`/termine/${terminId}/arbeit-beenden`, { arbeit_index: arbeitIndex });
          this.loadInternTeamUebersicht();
        } catch (err) {
          console.error('internBeendenEinzelarbeit Fehler:', err);
          if (btn) btn.disabled = false;
          alert('Fehler beim Abschließen der Arbeit.');
        }
      },

      async internPauseStarten(personId, personTyp, datum, imZeitfenster) {
        if (!imZeitfenster) {
          if (!confirm('Mittagspause außerhalb des üblichen Zeitfensters starten?')) return;
        }
        try {
          await ApiService.post('/pause/starten', { personId, personTyp, datum });
          this.loadInternTeamUebersicht();
        } catch (err) {
          console.error('internPauseStarten Fehler:', err);
          alert('Fehler beim Starten der Pause.');
        }
      },

      async internPauseBeenden(personId, personTyp) {
        try {
          await ApiService.post('/pause/beenden', { personId, personTyp });
          this.loadInternTeamUebersicht();
        } catch (err) {
          console.error('internPauseBeenden Fehler:', err);
          alert('Fehler beim Beenden der Pause.');
        }
      },

      berechneAuftragFortschritt(termin) {
        if (!termin.startzeit && !termin.bring_zeit) return 0;
        
        const startzeit = termin.startzeit || termin.bring_zeit;
        const geschaetzteZeit = this.getEffektiveArbeitszeit(termin);
        
        const jetzt = this.getToday();
        const [stunden, minuten] = startzeit.split(':').map(Number);
        const startDate = new Date(jetzt);
        startDate.setHours(stunden, minuten, 0, 0);
        
        const verstricheneMinuten = (jetzt - startDate) / 1000 / 60;
        const fortschritt = (verstricheneMinuten / geschaetzteZeit) * 100;
        
        return Math.round(Math.max(0, fortschritt));
      },

      berechneRestzeit(termin) {
        const startzeit = termin.startzeit || termin.bring_zeit;
        if (!startzeit) return '--:--';
        
        const geschaetzteZeit = this.getEffektiveArbeitszeit(termin);
        
        const jetzt = this.getToday();
        const startMin = this.timeToMinutes(startzeit);
        const startDate = new Date(jetzt);
        startDate.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
        
        const verstricheneMinuten = (jetzt - startDate) / 1000 / 60;
        const restMinuten = geschaetzteZeit - verstricheneMinuten;
        
        if (restMinuten <= 0) {
          const ueberzogen = Math.abs(Math.round(restMinuten));
          return `+${this.formatMinutesToHours(ueberzogen)}`;
        }
        
        return `~${this.formatMinutesToHours(Math.round(restMinuten))}`;
      },

      getEffektiveArbeitszeit(termin) {
        // 1. arbeitszeiten_details (manuell eingegebene Einzelarbeiten) - höchste Priorität
        // Wichtig: Details können die Gesamtzeit erhöhen, aber nie unter tatsaechliche_zeit
        // oder geschaetzte_zeit senken (Schutz vor unvollständigen Teileinträgen).
        if (termin.arbeitszeiten_details) {
          try {
            const details = typeof termin.arbeitszeiten_details === 'string' 
              ? JSON.parse(termin.arbeitszeiten_details) 
              : termin.arbeitszeiten_details;
            
            let summeMinuten = 0;
            for (const [key, value] of Object.entries(details)) {
              if (key.startsWith('_')) continue; // Meta-Felder überspringen
              if (typeof value === 'number') {
                summeMinuten += value;
              } else if (typeof value === 'object' && value.zeit) {
                summeMinuten += value.zeit;
              }
            }
            
            if (summeMinuten > 0) {
              // Verwende das Maximum aller verfügbaren Zeitangaben
              return Math.max(summeMinuten, termin.tatsaechliche_zeit || 0, termin.geschaetzte_zeit || 0);
            }
          } catch (e) {
            // JSON-Parse-Fehler ignorieren
          }
        }
        
        // 2. tatsaechliche_zeit (gesetzt vom System oder Benutzer, unabhängig vom Status)
        //    Beispiel: Ein "geplant"-Termin hat tatsaechliche_zeit=420 (7h) aber geschaetzte_zeit=30
        if (termin.tatsaechliche_zeit) {
          return termin.tatsaechliche_zeit;
        }
    
        // 3. geschaetzte_zeit (initiale Schätzung aus dem Arbeitskatalog)
        if (termin.geschaetzte_zeit) {
          return termin.geschaetzte_zeit;
        }
        
        // 4. Standard-Fallback
        return 60;
      },

      getEffektiveArbeitszeitMitFaktoren(termin, person, isLehrling, kontext = {}) {
        // Für abgeschlossene Termine: tatsaechliche_zeit (keine Faktoren anwenden)
        if (termin.status === 'abgeschlossen' && termin.tatsaechliche_zeit) {
          return termin.tatsaechliche_zeit;
        }
    
        // Basis-Arbeitszeit ermitteln
        let basisZeit = this.getEffektiveArbeitszeit(termin);
    
        // 1. Globale Nebenzeit (Werkstatt-Einstellung)
        const globaleNebenzeit = kontext.globaleNebenzeitProzent || 0;
        if (globaleNebenzeit > 0) {
          basisZeit = basisZeit * (1 + globaleNebenzeit / 100);
        }
    
        // 2. Aufgabenbewältigung für Lehrlinge (z.B. 150% = braucht 1.5x so lange)
        if (isLehrling && person) {
          if (person.aufgabenbewaeltigung_prozent && person.aufgabenbewaeltigung_prozent !== 100) {
            basisZeit = basisZeit * (person.aufgabenbewaeltigung_prozent / 100);
          }
        }
    
        return Math.round(basisZeit);
      },

      getEffektiveStartzeit(termin) {
        if (termin.arbeitszeiten_details) {
          try {
            const d = typeof termin.arbeitszeiten_details === 'string'
              ? JSON.parse(termin.arbeitszeiten_details)
              : termin.arbeitszeiten_details;
            if (d && d._startzeit) return d._startzeit;
          } catch (e) {}
        }
        return termin.startzeit || termin.bring_zeit || null;
      },

      berechneEndzeitMitFaktoren(termin, person, isLehrling, kontext = {}) {
        // Für abgeschlossene Termine: Verwende fertigstellung_zeit falls vorhanden
        if (termin.status === 'abgeschlossen' && termin.fertigstellung_zeit) {
          return termin.fertigstellung_zeit;
        }
    
        // Fallback: Berechne lokal aus Startzeit und Dauer MIT Faktoren
        const startzeit = this.getEffektiveStartzeit(termin);
        if (!startzeit) return '--:--';
    
        // Hole effektive Arbeitszeit MIT Faktoren
        const dauer = this.getEffektiveArbeitszeitMitFaktoren(termin, person, isLehrling, kontext);
    
        const startMinuten = this.timeToMinutes(startzeit);
        let gesamtMinuten = startMinuten + dauer;
    
        // Pausenberücksichtigung (6h-Regel beachten)
        if (person) {
          const wochenStunden = person.wochenarbeitszeit_stunden || person.arbeitsstunden_pro_tag * (person.arbeitstage_pro_woche || 5);
          const arbeitstage = person.arbeitstage_pro_woche || 5;
          const taeglicheStunden = wochenStunden / arbeitstage;
    
          // Nur bei >= 6h Arbeitszeit pro Tag Pause berücksichtigen
          if (taeglicheStunden >= 6) {
            const pauseStart = person.mittagspause_start;
            const pauseDauer = person.pausenzeit_minuten || 30;
    
            if (pauseStart && pauseDauer > 0) {
              const [pauseH, pauseM] = pauseStart.split(':').map(Number);
              const pausenStart = pauseH * 60 + pauseM;
              const pausenEnde = pausenStart + pauseDauer;
              const endMinutenOhnePause = startMinuten + dauer;
    
              // Fall 1: Arbeit beginnt vor Pause und endet nach Pause-Start
              if (startMinuten < pausenStart && endMinutenOhnePause > pausenStart) {
                gesamtMinuten += pauseDauer;
              }
              // Fall 2: Arbeit beginnt während der Pause
              else if (startMinuten >= pausenStart && startMinuten < pausenEnde) {
                const verschiebung = pausenEnde - startMinuten;
                gesamtMinuten += verschiebung;
              }
            }
          }
        }
    
        const endStunden = Math.floor(gesamtMinuten / 60);
        const endMin = gesamtMinuten % 60;
    
        return `${String(endStunden).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
      },

      berechneAuftragFortschrittMitFaktoren(termin, person, isLehrling, kontext = {}) {
        if (!termin.startzeit && !termin.bring_zeit) return 0;
    
        const startzeit = termin.startzeit || termin.bring_zeit;
        const jetzt = this.getToday();
        const startMin = this.timeToMinutes(startzeit);
        const startDate = new Date(jetzt);
        startDate.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
    
        const verstricheneMinuten = (jetzt - startDate) / 1000 / 60;
    
        // Gesamtdauer inkl. Pause über berechneEndzeitMitFaktoren ermitteln
        const endzeitStr = this.berechneEndzeitMitFaktoren(termin, person, isLehrling, kontext);
        if (!endzeitStr || endzeitStr === '--:--') {
          // Fallback: Netto-Arbeitszeit ohne Pause
          const geschaetzteZeit = this.getEffektiveArbeitszeitMitFaktoren(termin, person, isLehrling, kontext);
          return Math.round(Math.max(0, (verstricheneMinuten / geschaetzteZeit) * 100));
        }
    
        const endzeitMin = this.timeToMinutes(endzeitStr);
        const endzeitDate = new Date(jetzt);
        endzeitDate.setHours(Math.floor(endzeitMin / 60), endzeitMin % 60, 0, 0);
        const gesamtDauerMinuten = (endzeitDate - startDate) / 1000 / 60;
    
        if (gesamtDauerMinuten <= 0) return 100;
        const fortschritt = (verstricheneMinuten / gesamtDauerMinuten) * 100;
    
        return Math.round(Math.max(0, fortschritt));
      },

      berechneRestzeitMitFaktoren(termin, person, isLehrling, kontext = {}) {
        const startzeit = termin.startzeit || termin.bring_zeit;
        if (!startzeit) return '--:--';
    
        const jetzt = this.getToday();
    
        // Endzeit inkl. Pause via berechneEndzeitMitFaktoren ermitteln
        const endzeitStr = this.berechneEndzeitMitFaktoren(termin, person, isLehrling, kontext);
        if (!endzeitStr || endzeitStr === '--:--') return '--:--';
    
        const endzeitMin = this.timeToMinutes(endzeitStr);
        const endzeitDate = new Date(jetzt);
        endzeitDate.setHours(Math.floor(endzeitMin / 60), endzeitMin % 60, 0, 0);
    
        const restMinuten = (endzeitDate - jetzt) / 1000 / 60;
    
        if (restMinuten <= 0) {
          const ueberzogen = Math.abs(Math.round(restMinuten));
          return `+${this.formatMinutesToHours(ueberzogen)}`;
        }
    
        return `~${this.formatMinutesToHours(Math.round(restMinuten))}`;
      },

      getArbeitenDetailsList(termin, personId, isLehrling) {
        const arbeiten = [];
        
        if (!termin.arbeitszeiten_details) {
          return arbeiten;
        }
        
        try {
          const details = typeof termin.arbeitszeiten_details === 'string' 
            ? JSON.parse(termin.arbeitszeiten_details) 
            : termin.arbeitszeiten_details;
    
          // Prüfen ob individuelle Arbeitszuordnungen vorhanden sind
          let hatIndividuelleZuordnung = false;
          if (personId != null) {
            for (const [key, value] of Object.entries(details)) {
              if (key.startsWith('_')) continue;
              if (typeof value === 'object' && (value.mitarbeiter_id != null || value.lehrling_id != null)) {
                hatIndividuelleZuordnung = true;
                break;
              }
            }
          }
          
          for (const [key, value] of Object.entries(details)) {
            // Meta-Felder überspringen
            if (key.startsWith('_')) continue;
            
            if (typeof value === 'number') {
              // Einfaches Format: "Ölwechsel": 30 — keine individuelle Zuordnung
              arbeiten.push({ name: key, zeit: value });
            } else if (typeof value === 'object' && value.zeit != null) {
              // Detailliertes Format: "Bremsen": { zeit: 90, mitarbeiter_id: 2 }
              // Bei individuellen Zuordnungen nur Arbeiten dieser Person anzeigen
              if (hatIndividuelleZuordnung) {
                const zugeordnet = isLehrling
                  ? value.lehrling_id === personId
                  : value.mitarbeiter_id === personId;
                if (!zugeordnet) continue;
              }
              arbeiten.push({ name: key, zeit: value.zeit });
            }
          }
        } catch (e) {
          console.warn('Fehler beim Parsen von arbeitszeiten_details:', e);
        }
        
        return arbeiten;
      },

      istPersonAktuellInPause(person, aktuelleZeit = null) {
        if (!person) return false;
    
        // Berechne tägliche Arbeitszeit
        const wochenStunden = person.wochenarbeitszeit_stunden || person.arbeitsstunden_pro_tag * (person.arbeitstage_pro_woche || 5);
        const arbeitstage = person.arbeitstage_pro_woche || 5;
        const taeglicheStunden = wochenStunden / arbeitstage;
    
        // 6h-Regel: Keine Pause bei unter 6h Arbeitszeit pro Tag
        if (taeglicheStunden < 6) {
          return false;
        }
    
        // Prüfe ob Pausenzeiten definiert sind
        const pauseStart = person.mittagspause_start;
        const pauseDauer = person.pausenzeit_minuten || 30;
    
        if (!pauseStart || pauseDauer <= 0) {
          return false;
        }
    
        // Aktuelle Zeit bestimmen
        let jetztZeit = aktuelleZeit;
        if (!jetztZeit) {
          const jetzt = new Date();
          const h = jetzt.getHours();
          const m = jetzt.getMinutes();
          jetztZeit = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
    
        // Berechne Pause-Ende
        const [pauseH, pauseM] = pauseStart.split(':').map(Number);
        const pauseStartMinuten = pauseH * 60 + pauseM;
        const pauseEndeMinuten = pauseStartMinuten + pauseDauer;
        const pauseEndeH = Math.floor(pauseEndeMinuten / 60);
        const pauseEndeM = pauseEndeMinuten % 60;
        const pauseEnde = `${String(pauseEndeH).padStart(2, '0')}:${String(pauseEndeM).padStart(2, '0')}`;
    
        // Prüfe ob aktuelle Zeit innerhalb des Pausenfensters liegt
        return jetztZeit >= pauseStart && jetztZeit < pauseEnde;
      },

      getEffektiveDynamischStartzeit(termin) {
        const gespeichert = termin.startzeit || termin.bring_zeit;
    
        // Nur für noch nicht gestartete Termine dynamisch vorrücken
        if (termin.status === 'in_arbeit' || termin.status === 'abgeschlossen') {
          return gespeichert;
        }
    
        const now = new Date();
        const jetztMin = now.getHours() * 60 + now.getMinutes();
    
        // Wenn gespeicherte Zeit noch in der Zukunft liegt → unverändert verwenden
        if (gespeichert) {
          const gespeichertMin = this.timeToMinutes(gespeichert);
          if (gespeichertMin > jetztMin) {
            return gespeichert;
          }
        }
    
        // Startzeit liegt in der Vergangenheit (oder fehlt) → nächste halbe Stunde
        const naechsteHalbeStunde = Math.ceil(jetztMin / 30) * 30;
        const h = Math.floor(naechsteHalbeStunde / 60);
        const m = naechsteHalbeStunde % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      },

      berechneWartezeitBis(termin) {
        const zeit = this.getEffektiveStartzeit(termin);
        if (!zeit) return '--:--';
    
        const jetzt = this.getToday();
        const [stunden, minuten] = zeit.split(':').map(Number);
        const terminDate = new Date(jetzt);
        terminDate.setHours(stunden, minuten, 0, 0);
        
        const diffMs = terminDate - jetzt;
        if (diffMs < 0) return 'Jetzt';
        
        const diffMinuten = Math.round(diffMs / 1000 / 60);
        
        if (diffMinuten < 60) {
          return `${diffMinuten} min`;
        } else {
          const std = Math.floor(diffMinuten / 60);
          const min = diffMinuten % 60;
          return `${std}h ${min}m`;
        }
      },

      openTerminDetailFromIntern(terminId) {
        // Wechsle zum Termine-Tab und öffne Details (mit display toggle)
        const termineTab = this.getCachedElement('termine');
        const termineTabButton = document.querySelector('.tab-button[data-tab="termine"]');
    
        // Alle Tabs deaktivieren
        const contents = this.tabCache.contents || document.querySelectorAll('.tab-content');
        for (let i = 0; i < contents.length; i++) {
          contents[i].style.display = 'none';
          contents[i].classList.remove('active');
        }
        const buttons = this.tabCache.buttons || document.querySelectorAll('.tab-button');
        for (let i = 0; i < buttons.length; i++) {
          buttons[i].classList.remove('active');
        }
    
        // Termine-Tab aktivieren
        if (termineTab && termineTabButton) {
          termineTab.style.display = 'block';
          termineTab.classList.add('active');
          termineTabButton.classList.add('active');
    
          // Lade und zeige die Termin-Details
          setTimeout(() => {
            this.showTerminDetails(terminId);
          }, 100);
        }
      },

      async loadInterneTermineListe(mitarbeiterListe = null, lehrlingeListe = null) {
        const container = document.getElementById('internTermineListe');
        const keineTermineEl = document.getElementById('internKeineTermine');
        
        if (!container) return;
    
        try {
          // Hole alle Termine (nicht nur heutige) - limitiert auf aktuelle und zukünftige
          const alleTermine = await ApiService.get('/termine');
          
          // Filtere nur interne Termine (erkannt durch kunde_name='Intern' oder abholung_details='Interner Termin')
          const interneTermine = alleTermine.filter(t => 
            t.kunde_name === 'Intern' || 
            t.abholung_details === 'Interner Termin' ||
            t.kennzeichen === 'INTERN'
          );
    
          // Sortiere nach Datum (neueste zuerst, dann nach Status)
          interneTermine.sort((a, b) => {
            // Offene Termine zuerst, dann nach Datum
            if (a.status === 'abgeschlossen' && b.status !== 'abgeschlossen') return 1;
            if (a.status !== 'abgeschlossen' && b.status === 'abgeschlossen') return -1;
            
            // Nach Datum sortieren
            const datumA = new Date(a.datum);
            const datumB = new Date(b.datum);
            return datumA - datumB;
          });
    
          // Hole Mitarbeiter/Lehrlinge falls nicht übergeben
          if (!mitarbeiterListe) {
            mitarbeiterListe = await ApiService.get('/mitarbeiter');
          }
          if (!lehrlingeListe) {
            lehrlingeListe = await ApiService.get('/lehrlinge');
          }
    
          if (interneTermine.length === 0) {
            container.innerHTML = '';
            if (keineTermineEl) keineTermineEl.style.display = 'flex';
            return;
          }
    
          if (keineTermineEl) keineTermineEl.style.display = 'none';
    
          container.innerHTML = interneTermine.map(termin => 
            this.renderInternerTerminKachel(termin, mitarbeiterListe, lehrlingeListe)
          ).join('');
    
        } catch (error) {
          console.error('Fehler beim Laden der internen Termine:', error);
          container.innerHTML = `
            <div class="intern-keine-auftraege">
              <span>⚠️</span> Fehler beim Laden der internen Termine
            </div>
          `;
        }
      },

      renderInternerTerminKachel(termin, mitarbeiter, lehrlinge) {
        // Datum formatieren
        const datum = new Date(termin.datum);
        const heute = this.getToday();
        const istHeute = this.formatDateLocal(datum) === this.formatDateLocal(heute);
        const istVergangen = datum < heute && !istHeute;
        
        const datumFormatiert = datum.toLocaleDateString('de-DE', {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
    
        // Dringlichkeits-Klasse
        let dringlichkeitKlasse = '';
        let dringlichkeitLabel = '';
        if (termin.dringlichkeit === 'dringend') {
          dringlichkeitKlasse = 'dringend';
          dringlichkeitLabel = '🔴 Dringend';
        } else if (termin.dringlichkeit === 'heute') {
          dringlichkeitKlasse = 'heute';
          dringlichkeitLabel = '🟠 Heute';
        } else if (termin.dringlichkeit === 'woche') {
          dringlichkeitKlasse = 'woche';
          dringlichkeitLabel = '🟡 Laufe der Woche';
        }
    
        // Status-Klasse
        let statusKlasse = '';
        let statusLabel = 'Offen';
        if (termin.status === 'abgeschlossen') {
          statusKlasse = 'abgeschlossen';
          statusLabel = '✓ Erledigt';
        } else if (termin.status === 'in_arbeit') {
          statusLabel = '🔧 In Arbeit';
        }
    
        // Zuordnung ermitteln
        let zuordnungText = '';
        if (termin.arbeitszeiten_details) {
          try {
            const details = typeof termin.arbeitszeiten_details === 'string' 
              ? JSON.parse(termin.arbeitszeiten_details) 
              : termin.arbeitszeiten_details;
            
            if (details._gesamt_mitarbeiter_id) {
              const zuordnung = details._gesamt_mitarbeiter_id;
              if (zuordnung.type === 'mitarbeiter') {
                const ma = mitarbeiter.find(m => m.id === zuordnung.id);
                zuordnungText = ma ? `👷 ${ma.name}` : '';
              } else if (zuordnung.type === 'lehrling') {
                const l = lehrlinge.find(lg => lg.id === zuordnung.id);
                zuordnungText = l ? `🎓 ${l.name}` : '';
              }
            }
          } catch (e) {
            // Fehler ignorieren
          }
        } else if (termin.mitarbeiter_id) {
          const ma = mitarbeiter.find(m => m.id === termin.mitarbeiter_id);
          zuordnungText = ma ? `👷 ${ma.name}` : '';
        }
    
        // Zeitinfo
        let zeitInfo = '';
        if (termin.abholung_zeit) {
          zeitInfo = `🕐 ${termin.abholung_zeit}`;
        }
        if (termin.geschaetzte_zeit) {
          const stunden = Math.floor(termin.geschaetzte_zeit / 60);
          const minuten = termin.geschaetzte_zeit % 60;
          zeitInfo += zeitInfo ? ` • ` : '';
          zeitInfo += `⏱ ${stunden > 0 ? stunden + 'h ' : ''}${minuten > 0 ? minuten + 'min' : ''}`;
        }
    
        // Interne Auftragsnummer (wenn nicht "INTERN")
        const auftragsnummer = (termin.kennzeichen && termin.kennzeichen !== 'INTERN') ? termin.kennzeichen : '';
    
        return `
          <div class="intern-termin-kachel ${dringlichkeitKlasse} ${statusKlasse}" 
               onclick="app.openInternerTerminBearbeiten(${termin.id})"
               title="Klicken zum Bearbeiten">
            <div class="intern-termin-header">
              <div class="intern-termin-datum">
                ${istHeute ? '📅 Heute' : datumFormatiert}
              </div>
              <div class="intern-termin-status">${statusLabel}</div>
            </div>
            <div class="intern-termin-body">
              ${auftragsnummer ? `<div style="font-size: 0.8rem; color: #6366f1; font-weight: 600; margin-bottom: 4px;">📋 ${this.escapeHtml(auftragsnummer)}</div>` : ''}
              <div class="intern-termin-arbeit">${this.escapeHtml(termin.arbeit || '-')}</div>
              ${termin.umfang ? `<div style="font-size: 0.85rem; color: #64748b; margin-top: 4px;">${this.escapeHtml(termin.umfang)}</div>` : ''}
              <div class="intern-termin-info">
                <span class="intern-termin-zeit">${zeitInfo || '—'}</span>
                ${zuordnungText ? `<span class="intern-termin-zuordnung">${zuordnungText}</span>` : ''}
              </div>
              ${dringlichkeitLabel ? `
                <div class="intern-termin-dringlichkeit ${dringlichkeitKlasse}">${dringlichkeitLabel}</div>
              ` : ''}
            </div>
          </div>
        `;
      },

      async openInternerTerminBearbeiten(terminId) {
        try {
          // Lade den Termin
          const termin = await ApiService.get(`/termine/${terminId}`);
          
          // Öffne das Modal
          const modal = document.getElementById('internTerminBearbeitenModal');
          if (!modal) {
            console.error('Modal nicht gefunden');
            return;
          }
    
          // Lade Mitarbeiter/Lehrlinge für das Select
          await this.loadInternEditMitarbeiter();
    
          // Fülle das Formular
          document.getElementById('internEdit_id').value = termin.id;
          document.getElementById('internEdit_arbeit').value = termin.arbeit || '';
          document.getElementById('internEdit_datum').value = termin.datum || '';
          
          // Zeit aus Minuten in Stunden
          const zeitStunden = termin.geschaetzte_zeit ? (termin.geschaetzte_zeit / 60) : '';
          document.getElementById('internEdit_zeit').value = zeitStunden;
          
          document.getElementById('internEdit_zeit_von').value = termin.abholung_zeit || '';
          document.getElementById('internEdit_zeit_bis').value = termin.bring_zeit || '';
          document.getElementById('internEdit_dringlichkeit').value = termin.dringlichkeit || '';
          document.getElementById('internEdit_notizen').value = termin.umfang || '';
          document.getElementById('internEdit_status').value = termin.status || 'offen';
          
          // Interne Auftragsnummer (Kennzeichen-Feld, außer "INTERN")
          const auftragsnummer = (termin.kennzeichen && termin.kennzeichen !== 'INTERN') ? termin.kennzeichen : '';
          document.getElementById('internEdit_auftragsnummer').value = auftragsnummer;
    
          // Mitarbeiter/Lehrling aus arbeitszeiten_details
          let selectedValue = '';
          if (termin.arbeitszeiten_details) {
            try {
              const details = typeof termin.arbeitszeiten_details === 'string' 
                ? JSON.parse(termin.arbeitszeiten_details) 
                : termin.arbeitszeiten_details;
              
              if (details._gesamt_mitarbeiter_id) {
                const zuordnung = details._gesamt_mitarbeiter_id;
                if (zuordnung.type === 'mitarbeiter') {
                  selectedValue = `ma_${zuordnung.id}`;
                } else if (zuordnung.type === 'lehrling') {
                  selectedValue = `l_${zuordnung.id}`;
                }
              }
            } catch (e) {}
          } else if (termin.mitarbeiter_id) {
            selectedValue = `ma_${termin.mitarbeiter_id}`;
          }
          document.getElementById('internEdit_mitarbeiter').value = selectedValue;
    
          // Modal anzeigen
          modal.style.display = 'flex';
    
          // Event-Listener für Modal-Schließen
          const closeBtn = document.getElementById('closeInternTerminBearbeiten');
          if (closeBtn) {
            closeBtn.onclick = () => this.closeInternTerminBearbeitenModal();
          }
    
          // Event-Listener für Formular-Submit
          const form = document.getElementById('internTerminEditForm');
          form.onsubmit = (e) => this.handleInternTerminEditSubmit(e);
    
        } catch (error) {
          console.error('Fehler beim Öffnen des internen Termins:', error);
          this.showToast('Fehler beim Laden des Termins', 'error');
        }
      },

      async loadInternEditMitarbeiter() {
        const select = document.getElementById('internEdit_mitarbeiter');
        if (!select) return;
    
        try {
          const [mitarbeiter, lehrlinge] = await Promise.all([
            ApiService.get('/mitarbeiter'),
            ApiService.get('/lehrlinge')
          ]);
    
          select.innerHTML = '<option value="">-- Niemand zugeordnet --</option>';
    
          if (mitarbeiter.length > 0) {
            const maGroup = document.createElement('optgroup');
            maGroup.label = '👷 Mitarbeiter';
            mitarbeiter.forEach(ma => {
              const opt = document.createElement('option');
              opt.value = `ma_${ma.id}`;
              opt.textContent = ma.name;
              maGroup.appendChild(opt);
            });
            select.appendChild(maGroup);
          }
    
          if (lehrlinge.length > 0) {
            const lGroup = document.createElement('optgroup');
            lGroup.label = '🎓 Lehrlinge';
            lehrlinge.forEach(l => {
              const opt = document.createElement('option');
              opt.value = `l_${l.id}`;
              opt.textContent = l.name;
              lGroup.appendChild(opt);
            });
            select.appendChild(lGroup);
          }
        } catch (error) {
          console.error('Fehler beim Laden der Mitarbeiter:', error);
        }
      },

      closeInternTerminBearbeitenModal() {
        const modal = document.getElementById('internTerminBearbeitenModal');
        if (modal) {
          modal.style.display = 'none';
        }
      },

      async handleInternTerminEditSubmit(e) {
        e.preventDefault();
    
        const terminId = document.getElementById('internEdit_id').value;
        const arbeitText = document.getElementById('internEdit_arbeit').value.trim();
    
        if (!arbeitText) {
          alert('Bitte Arbeitsumfang eingeben.');
          return;
        }
    
        const zeitStunden = parseFloat(document.getElementById('internEdit_zeit').value) || 1;
        const geschaetzteZeit = Math.round(zeitStunden * 60);
    
        // Mitarbeiterzuordnung verarbeiten
        const selectedValue = document.getElementById('internEdit_mitarbeiter').value;
        let mitarbeiterIdValue = null;
        let arbeitszeitenDetails = null;
    
        if (selectedValue && selectedValue !== '') {
          const [type, id] = selectedValue.split('_');
          const numId = parseInt(id, 10);
    
          if (type === 'ma') {
            mitarbeiterIdValue = numId;
            arbeitszeitenDetails = {
              _gesamt_mitarbeiter_id: { type: 'mitarbeiter', id: numId }
            };
          } else if (type === 'l') {
            mitarbeiterIdValue = null;
            arbeitszeitenDetails = {
              _gesamt_mitarbeiter_id: { type: 'lehrling', id: numId }
            };
          }
        }
    
        const dringlichkeitValue = document.getElementById('internEdit_dringlichkeit')?.value || null;
        const statusValue = document.getElementById('internEdit_status')?.value || 'offen';
        
        // Interne Auftragsnummer auslesen
        const interneAuftragsnummer = document.getElementById('internEdit_auftragsnummer')?.value?.trim() || '';
        const kennzeichenWert = interneAuftragsnummer || 'INTERN';
    
        const updateData = {
          arbeit: arbeitText,
          umfang: document.getElementById('internEdit_notizen').value.trim(),
          geschaetzte_zeit: geschaetzteZeit,
          datum: document.getElementById('internEdit_datum').value,
          startzeit: document.getElementById('internEdit_zeit_von').value || null,
          abholung_zeit: document.getElementById('internEdit_zeit_von').value || null,
          bring_zeit: document.getElementById('internEdit_zeit_bis').value || null,
          mitarbeiter_id: mitarbeiterIdValue,
          dringlichkeit: dringlichkeitValue,
          status: statusValue,
          kennzeichen: kennzeichenWert,
          arbeitszeiten_details: arbeitszeitenDetails ? JSON.stringify(arbeitszeitenDetails) : null
        };
    
        try {
          await ApiService.put(`/termine/${terminId}`, updateData);
          this.showToast('Interner Termin erfolgreich aktualisiert!', 'success');
          this.closeInternTerminBearbeitenModal();
          
          // Listen aktualisieren
          this.loadInterneTermineImSubTab();
          this.loadDashboard();
        } catch (error) {
          console.error('Fehler beim Aktualisieren:', error);
          alert('Fehler beim Aktualisieren: ' + (error.message || 'Unbekannter Fehler'));
        }
      },

      async deleteInternerTerminFromModal() {
        const terminId = document.getElementById('internEdit_id').value;
        if (!terminId) return;
    
        if (!confirm('Möchten Sie diesen internen Termin wirklich löschen?')) {
          return;
        }
    
        try {
          await ApiService.delete(`/termine/${terminId}`);
          this.showToast('Interner Termin gelöscht', 'success');
          this.closeInternTerminBearbeitenModal();
          
          // Listen aktualisieren
          this.loadInterneTermineImSubTab();
          this.loadDashboard();
        } catch (error) {
          console.error('Fehler beim Löschen:', error);
          alert('Fehler beim Löschen: ' + (error.message || 'Unbekannter Fehler'));
        }
      },

      async loadInterneTermineImSubTab() {
        const container = document.getElementById('interneTermineSubTabListe');
        const keineEl = document.getElementById('interneTermineSubTabKeine');
        
        if (!container) return;
    
        try {
          const alleTermine = await ApiService.get('/termine');
          
          // Filtere nur interne Termine (abgeschlossene und stornierte ausblenden)
          const interneTermine = alleTermine.filter(t => 
            (t.kunde_name === 'Intern' || 
            t.abholung_details === 'Interner Termin' ||
            t.kennzeichen === 'INTERN') &&
            t.status !== 'abgeschlossen' &&
            t.status !== 'storniert'
          );
    
          // Sortiere nach Datum
          interneTermine.sort((a, b) => {
            return new Date(a.datum) - new Date(b.datum);
          });
    
          // Hole Mitarbeiter/Lehrlinge
          const [mitarbeiter, lehrlinge] = await Promise.all([
            ApiService.get('/mitarbeiter'),
            ApiService.get('/lehrlinge')
          ]);
    
          if (interneTermine.length === 0) {
            container.innerHTML = '';
            if (keineEl) keineEl.style.display = 'flex';
            return;
          }
    
          if (keineEl) keineEl.style.display = 'none';
    
          container.innerHTML = interneTermine.map(termin => 
            this.renderInternerTerminKachel(termin, mitarbeiter, lehrlinge)
          ).join('');
    
        } catch (error) {
          console.error('Fehler beim Laden der internen Termine:', error);
          container.innerHTML = `
            <div class="intern-keine-auftraege">
              <span>⚠️</span> Fehler beim Laden der internen Termine
            </div>
          `;
        }
      },

      async loadTabletEinstellungen() {
        try {
          const data = await TabletService.getEinstellungen();
          
          // Formular-Felder aktualisieren
          document.getElementById('display_einschaltzeit').value = data.display_einschaltzeit || '07:30';
          document.getElementById('display_ausschaltzeit').value = data.display_ausschaltzeit || '18:10';
          
          // Status anzeigen
          this.updateTabletDisplayStatusUI(data.manueller_display_status || 'auto');
        } catch (error) {
          console.error('Fehler beim Laden der Tablet-Einstellungen:', error);
          this.showToast('Fehler beim Laden der Tablet-Einstellungen', 'error');
        }
      },

      async handleTabletDisplaySubmit(e) {
        e.preventDefault();
        
        const einschaltzeit = document.getElementById('display_einschaltzeit').value;
        const ausschaltzeit = document.getElementById('display_ausschaltzeit').value;
        
        try {
          await TabletService.updateEinstellungen({
            display_einschaltzeit: einschaltzeit,
            display_ausschaltzeit: ausschaltzeit
          });
          
          this.showToast('✅ Einschaltzeiten gespeichert', 'success');
        } catch (error) {
          console.error('Fehler beim Speichern:', error);
          this.showToast('Fehler beim Speichern der Einschaltzeiten', 'error');
        }
      },

      async setTabletDisplayStatus(status) {
        try {
          await TabletService.setDisplayManuell(status);
          this.updateTabletDisplayStatusUI(status);
          
          const statusText = {
            'auto': 'Automatik aktiviert',
            'an': 'Alle Displays eingeschaltet',
            'aus': 'Alle Displays ausgeschaltet'
          };
          
          this.showToast(`✅ ${statusText[status]}`, 'success');
        } catch (error) {
          console.error('Fehler beim Setzen des Display-Status:', error);
          this.showToast('Fehler beim Setzen des Display-Status', 'error');
        }
      },

      updateTabletDisplayStatusUI(status) {
        const statusIcon = document.getElementById('tabletDisplayStatusIcon');
        const statusText = document.getElementById('tabletDisplayStatusText');
        const statusHint = document.getElementById('tabletDisplayStatusHint');
        const statusContainer = document.getElementById('tabletDisplayStatus');
        
        if (!statusIcon || !statusText || !statusHint || !statusContainer) return;
        
        const configs = {
          'auto': {
            icon: '🔄',
            text: 'Modus: Automatik',
            hint: 'Tablets folgen den eingestellten Schaltzeiten',
            bgColor: '#e3f2fd',
            borderColor: '#90caf9'
          },
          'an': {
            icon: '💡',
            text: 'Modus: Manuell EIN',
            hint: 'Alle Displays sind manuell eingeschaltet',
            bgColor: '#e8f5e9',
            borderColor: '#a5d6a7'
          },
          'aus': {
            icon: '🌙',
            text: 'Modus: Manuell AUS',
            hint: 'Alle Displays sind manuell ausgeschaltet',
            bgColor: '#fce4ec',
            borderColor: '#f48fb1'
          }
        };
        
        const config = configs[status] || configs['auto'];
        
        statusIcon.textContent = config.icon;
        statusText.textContent = config.text;
        statusHint.textContent = config.hint;
        statusContainer.style.background = config.bgColor;
        statusContainer.style.borderColor = config.borderColor;
      }
  });
}
