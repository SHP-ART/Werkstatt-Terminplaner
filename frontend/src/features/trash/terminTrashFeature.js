export function installTerminTrashFeature(AppClass) {
  AppClass.prototype.updateTerminZeit = async function(terminId) {
  const feld = document.getElementById(`terminZeit_${terminId}`);
  const arbeitFeld = document.getElementById(`terminArbeit_${terminId}`);
  if (!feld) return;
  const stunden = parseFloat(feld.value);
  if (!Number.isFinite(stunden) || stunden <= 0) {
    alert('Bitte eine gültige Zeit in Stunden angeben.');
    return;
  }
  const minuten = Math.round(stunden * 60);
  const arbeit = arbeitFeld ? arbeitFeld.value.trim() : null;

  try {
    await TermineService.update(terminId, { geschaetzte_zeit: minuten, arbeit });
    alert('Zeit gespeichert.');
    this.loadAuslastung();
    this.loadDashboard();
  } catch (error) {
    console.error('Fehler beim Speichern der Terminzeit:', error);
    alert('Zeit konnte nicht gespeichert werden.');
  }
}

// Papierkorb-Funktionen;

  AppClass.prototype.deleteTermin = async function(terminId) {
  const termin = this.termineById[terminId];
  if (!termin) {
    console.log('deleteTermin: Termin nicht im Cache gefunden, lade neu...');
    // Versuche den Termin zu laden
    try {
      const freshTermin = await TermineService.getById(terminId);
      if (freshTermin) {
        this.termineById[terminId] = freshTermin;
        return this.deleteTermin(terminId); // Retry mit frischem Termin
      }
    } catch (e) {
      console.error('Fehler beim Nachladen des Termins:', e);
    }
    return;
  }

  console.log('deleteTermin aufgerufen für:', terminId);
  console.log('Termin-Daten:', termin);
  console.log('ist_erweiterung:', termin.ist_erweiterung);
  console.log('erweiterung_von_id:', termin.erweiterung_von_id);

  // Prüfe ob dieser Termin eine Erweiterung ist
  const istErweiterung = termin.ist_erweiterung === 1 || termin.ist_erweiterung === true || termin.erweiterung_von_id;
  
  // Prüfe ob dieser Termin Erweiterungen hat
  const hatErweiterungen = Object.values(this.termineById).some(
    t => t.erweiterung_von_id === terminId && !t.ist_geloescht
  );

  console.log('istErweiterung:', istErweiterung);
  console.log('hatErweiterungen:', hatErweiterungen);

  let loeschAktion = 'einzeln'; // 'einzeln' oder 'alle'

  if (istErweiterung) {
    // Dieser Termin ist eine Erweiterung - frage ob nur diese oder Original + alle Erweiterungen
    const originalTermin = this.termineById[termin.erweiterung_von_id];
    const originalInfo = originalTermin 
      ? `\n\nOriginal-Termin: ${originalTermin.termin_nr || originalTermin.id} - ${originalTermin.arbeit}`
      : '';
    
    const wahl = confirm(
      `Dieser Termin ist eine Erweiterung.${originalInfo}\n\n` +
      `OK = Nur diese Erweiterung löschen\n` +
      `Abbrechen = Nichts löschen\n\n` +
      `(Um den Original-Termin mit allen Erweiterungen zu löschen, öffnen Sie den Original-Termin)`
    );
    
    if (!wahl) {
      return; // Abbrechen gewählt
    }
    loeschAktion = 'einzeln';
    
  } else if (hatErweiterungen) {
    // Dieser Termin hat Erweiterungen - frage ob nur dieser oder alle
    const erweiterungen = Object.values(this.termineById).filter(
      t => t.erweiterung_von_id === terminId && !t.ist_geloescht
    );
    const anzahlErweiterungen = erweiterungen.length;
    
    const erweiterungsInfo = erweiterungen
      .map(e => `  🔗 ${e.termin_nr || e.id}: ${e.arbeit}`)
      .join('\n');
    
    // Verwende prompt für drei Optionen
    const eingabe = prompt(
      `Dieser Termin hat ${anzahlErweiterungen} Erweiterung(en):\n${erweiterungsInfo}\n\n` +
      `Was möchten Sie löschen?\n\n` +
      `1 = Nur diesen Termin (Erweiterungen bleiben)\n` +
      `2 = Alles löschen (Original + alle Erweiterungen)\n` +
      `Leer/Abbrechen = Nichts löschen\n\n` +
      `Bitte 1 oder 2 eingeben:`,
      ''
    );
    
    if (!eingabe || eingabe.trim() === '') {
      return; // Abbrechen
    }
    
    if (eingabe.trim() === '2') {
      loeschAktion = 'alle';
    } else if (eingabe.trim() === '1') {
      loeschAktion = 'einzeln';
    } else {
      alert('Ungültige Eingabe. Löschen abgebrochen.');
      return;
    }
    
  } else {
    // Normaler Termin ohne Erweiterungen
    const confirmMsg = `Möchten Sie den Termin "${termin.termin_nr || termin.id}" wirklich in den Papierkorb verschieben?\n\nKunde: ${termin.kunde_name}\nKennzeichen: ${termin.kennzeichen}\nArbeit: ${termin.arbeit}`;
    if (!confirm(confirmMsg)) {
      return;
    }
  }

  try {
    if (loeschAktion === 'alle') {
      // Lösche alle Erweiterungen zuerst
      const erweiterungen = Object.values(this.termineById).filter(
        t => t.erweiterung_von_id === terminId && !t.ist_geloescht
      );
      for (const erw of erweiterungen) {
        await TermineService.delete(erw.id);
      }
      // Dann den Original-Termin
      await TermineService.delete(terminId);
      alert(`Termin und ${erweiterungen.length} Erweiterung(en) wurden in den Papierkorb verschoben.`);
    } else {
      await TermineService.delete(terminId);
      alert('Termin wurde in den Papierkorb verschoben.');
    }
    
    this.loadTermine();
    this.loadDashboard();
    this.loadAuslastung();
  } catch (error) {
    console.error('Fehler beim Löschen des Termins:', error);
    alert('Fehler beim Löschen: ' + (error.message || 'Unbekannter Fehler'));
  }
};

  AppClass.prototype.loadPapierkorb = async function() {
  try {
    const papierkorbTable = document.getElementById('papierkorbTable');
    if (!papierkorbTable) return;

    const termine = await TermineService.getDeleted();
    const tbody = papierkorbTable.getElementsByTagName('tbody')[0];
    tbody.innerHTML = '';

    if (termine.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px; color: #666;">Papierkorb ist leer</td></tr>';
      return;
    }

    termine.forEach(termin => {
      const row = tbody.insertRow();
      const geloeschtAm = new Date(termin.geloescht_am);
      const geloeschtAmFormatiert = geloeschtAm.toLocaleDateString('de-DE') + ' ' + geloeschtAm.toLocaleTimeString('de-DE');

      row.innerHTML = `
        <td><strong>${termin.termin_nr || '-'}</strong></td>
        <td>${termin.datum}</td>
        <td>${termin.kunde_name}</td>
        <td>${termin.kennzeichen}</td>
        <td>${termin.arbeit}</td>
        <td>${this.formatZeit(termin.geschaetzte_zeit)}</td>
        <td>${termin.mitarbeiter_name || '-'}</td>
        <td>${geloeschtAmFormatiert}</td>
        <td class="action-buttons">
          <button class="btn btn-primary" onclick="app.restoreTermin(${termin.id})">
            ↩️ Wiederherstellen
          </button>
          <button class="btn btn-delete" onclick="app.permanentDeleteTermin(${termin.id})" style="margin-left: 5px;">
            ❌ Endgültig löschen
          </button>
        </td>
      `;
    });
  } catch (error) {
    console.error('Fehler beim Laden des Papierkorbs:', error);
  }
};

  AppClass.prototype.restoreTermin = async function(terminId) {
  if (!confirm('Möchten Sie diesen Termin wirklich wiederherstellen?')) {
    return;
  }

  try {
    await TermineService.restore(terminId);
    alert('Termin wurde wiederhergestellt.');
    this.loadPapierkorb();
    this.loadTermine();
    this.loadDashboard();
    this.loadAuslastung();
  } catch (error) {
    console.error('Fehler beim Wiederherstellen:', error);
    alert('Fehler beim Wiederherstellen: ' + (error.message || 'Unbekannter Fehler'));
  }
};

  AppClass.prototype.permanentDeleteTermin = async function(terminId) {
  const confirmMsg = '⚠️ ACHTUNG! ⚠️\n\nDieser Termin wird ENDGÜLTIG gelöscht und kann NICHT wiederhergestellt werden!\n\nMöchten Sie wirklich fortfahren?';

  if (!confirm(confirmMsg)) {
    return;
  }

  try {
    await TermineService.permanentDelete(terminId);
    alert('Termin wurde endgültig gelöscht.');
    this.loadPapierkorb();
  } catch (error) {
    console.error('Fehler beim permanenten Löschen:', error);
    alert('Fehler beim Löschen: ' + (error.message || 'Unbekannter Fehler'));
  }
}




// ChatGPT API-Key Status anzeigen

// KI-Funktionen Status aktualisieren (UI ein-/ausblenden)

// KI-Modus aktualisieren (local/openai/external)

// Echtzeit-Updates Status aktualisieren (WebSocket ein-/aus)

// Smart Scheduling Status aktualisieren

// Anomalie-Erkennung Status aktualisieren

// KI-Trainingsdaten laden und anzeigen

// Alle Ausreißer automatisch ausschließen

// Modell neu trainieren

// Externes Modell neu trainieren (Daten abgleichen)

// Benachrichtige externe KI über Backend-URL

// Details-Tabelle anzeigen/verstecken

// Details-Tabelle aktualisieren

// Einzelnen Eintrag vom Training ein-/ausschließen

// KI-Funktionen aktivieren/deaktivieren (Toggle-Handler)

  // KI-Modus ändern


// Echtzeit-Updates aktivieren/deaktivieren (Toggle-Handler)

// Smart Scheduling aktivieren/deaktivieren

// Anomalie-Erkennung aktivieren/deaktivieren

// API-Key Sichtbarkeit umschalten

// ChatGPT API-Key speichern

// ChatGPT API-Key testen

// ChatGPT API-Key löschen

// Ersatzautos laden und anzeigen

// Schnellzugriff-Kacheln für Ersatzautos rendern

// Handler für Klick auf vergebenes Ersatzauto

// Ersatzauto-Verfügbarkeit umschalten mit Popup für Sperrung

// Popup für Sperrung mit Tage-Auswahl anzeigen

// Vorschau aktualisieren und Button aktivieren

// Schnell-Sperrung für eine bestimmte Anzahl Tage

// Sperrung mit gewähltem Datum bestätigen

// Modal schließen

// ========== SCHNELL-STATUS-WECHSEL (Shift+Click in Planung) ==========

// Schnell-Status-Dialog für Timeline-Termin anzeigen
// Rendert Arbeitspausen-Sektion für den SchnellStatusDialog;
}
