export function installTerminFormFeature(AppClass) {
  Object.assign(AppClass.prototype, {
    async handleTerminSubmit(e) {
      e.preventDefault();

      const arbeitText = document.getElementById('arbeitEingabe').value.trim();

      const arbeitenListe = this.parseArbeiten(arbeitText);
      if (arbeitenListe.length === 0) {
        alert('Bitte mindestens eine Arbeit eingeben.');
        return;
      }

      // Duplikat-Erkennung (asynchron, blockiert nicht)
      if (arbeitenListe.length >= 2) {
        this.checkArbeitDuplikate(arbeitenListe).catch(() => {});
      }

      // Validiere Ersatzauto-Eingaben
      if (!this.validateErsatzautoEingaben()) {
        alert('Ersatzauto gewünscht: Bitte geben Sie entweder die Anzahl Tage ODER ein Rückgabe-Datum ein.');
        // Scroll zur Ersatzauto-Sektion
        document.getElementById('ersatzautoDauerGroup')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const abholungTypRadio = document.querySelector('input[name="abholung_typ"]:checked');
      const abholungTyp = abholungTypRadio ? abholungTypRadio.value : 'bringen';
      const abholungZeit = document.getElementById('abholung_zeit').value || null;
      const abholungDatum = document.getElementById('abholung_datum').value || null;
      const bringZeit = document.getElementById('bring_zeit').value || null;

      // Sammle alle ausgewählten Kontakt-Optionen
      const kontaktOptionen = [];
      if (document.getElementById('kontakt_kunde_anrufen').checked) {
        kontaktOptionen.push('Kunde anrufen');
      }
      if (document.getElementById('kontakt_kunde_ruft').checked) {
        kontaktOptionen.push('Kunde ruft selbst an');
      }
      const kontaktOption = kontaktOptionen.length > 0 ? kontaktOptionen.join(', ') : null;

      const kontaktAktiv = ['hol_bring', 'bringen', 'ruecksprache', 'warten'].includes(abholungTyp);

      const kilometerstandWert = document.getElementById('kilometerstand').value;

      // Ersatzauto-Daten sammeln
      const ersatzautoChecked = document.getElementById('ersatzauto').checked;
      const ersatzautoTage = document.getElementById('ersatzauto_tage')?.value?.trim() || '';

      // Nochmalige Validierung direkt vor dem Senden
      if (ersatzautoChecked) {
        const hatTage = ersatzautoTage !== '' && parseInt(ersatzautoTage, 10) > 0;
        const istTelRuecksprache = abholungTyp === 'ruecksprache';
        const hatAbholDatum = abholungDatum && abholungDatum.trim() !== '';
        const hatAbholZeit = abholungZeit && abholungZeit.trim() !== '';
        
        // Bei tel. Rücksprache: Tage sind Pflicht
        if (istTelRuecksprache && !hatTage) {
          alert('Ersatzauto bei tel. Rücksprache: Bitte geben Sie die geschätzte Anzahl Tage an.');
          document.getElementById('ersatzautoDauerGroup')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        
        // Bei anderen Typen: Entweder Tage oder Abholdatum
        if (!istTelRuecksprache && !hatTage && !hatAbholDatum && !hatAbholZeit) {
          alert('Ersatzauto: Bitte geben Sie die Anzahl Tage oder unten ein Abholdatum an.');
          document.getElementById('ersatzautoDauerGroup')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }

      // Berechne die geschätzte Zeit aus den Standardzeiten
      const geschaetzteZeit = this.getGeschaetzteZeit(arbeitenListe);
      console.log('[Termin] geschaetzte_zeit:', geschaetzteZeit,
        '| Feld:', document.getElementById('geschaetzte_zeit')?.value,
        '| Auto:', document.getElementById('geschaetzte_zeit_auto')?.value);

      // Bug 1 Debug: Datum aus Formular lesen
      const datumValue = document.getElementById('datum').value;
      console.log('[DEBUG] handleTerminSubmit - Datum aus Formular:', datumValue);

      if (!datumValue) {
        const fehler = document.getElementById('terminDatumFehler');
        const display = document.getElementById('selectedDatumDisplay');
        if (fehler) fehler.style.display = 'block';
        if (display) { display.style.border = '2px solid #dc3545'; display.style.color = '#dc3545'; }
        display?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const termin = {
        kennzeichen: document.getElementById('kennzeichen').value.trim(),
        arbeit: arbeitenListe.join(' || '),
        umfang: document.getElementById('umfang').value.trim(),
        geschaetzte_zeit: geschaetzteZeit,
        datum: datumValue,
        abholung_typ: abholungTyp,
        abholung_details: document.getElementById('abholung_details').value,
        abholung_zeit: kontaktAktiv ? abholungZeit : null,
        abholung_datum: kontaktAktiv ? abholungDatum : null,
        bring_zeit: kontaktAktiv ? bringZeit : null,
        kontakt_option: kontaktAktiv ? kontaktOption : null,
        kilometerstand: kilometerstandWert !== '' ? parseInt(kilometerstandWert, 10) : null,
        ersatzauto: ersatzautoChecked,
        ersatzauto_tage: ersatzautoChecked && ersatzautoTage ? parseInt(ersatzautoTage, 10) : null,
        // Wenn keine Tage angegeben, nutze Abholdatum als Ende-Datum
        ersatzauto_bis_datum: ersatzautoChecked && !ersatzautoTage && abholungDatum ? abholungDatum : null,
        ersatzauto_bis_zeit: ersatzautoChecked && !ersatzautoTage && abholungZeit ? abholungZeit : null,
        vin: document.getElementById('vin')?.value?.trim().toUpperCase() || null,
        fahrzeugtyp: document.getElementById('fahrzeugtyp')?.value?.trim() || null
      };

      const kundeId = document.getElementById('kunde_id').value;
      // Lese Kundenname aus neuem Feld oder Fallback auf altes
      const kundeNameEingabe = document.getElementById('terminNameSuche')?.value.trim() 
                             || document.getElementById('terminSchnellsuche')?.value.trim() 
                             || '';
      const kundeTelefon = document.getElementById('neuer_kunde_telefon').value.trim();

      let resolvedKundeId = kundeId ? parseInt(kundeId, 10) : null;
      let resolvedKundeName = kundeNameEingabe || null;

      if (!resolvedKundeId && kundeNameEingabe) {
        const existing = (this.kundenCache || []).find(
          k => k.name && k.name.toLowerCase() === kundeNameEingabe.toLowerCase()
        );
        if (existing) {
          resolvedKundeId = existing.id;
          resolvedKundeName = existing.name;
        }
        // Neuen Kunden NICHT mehr hier anlegen - das passiert später beim eigentlichen Speichern
      }

      if (!resolvedKundeId && !resolvedKundeName) {
        alert('Bitte wählen Sie einen Kunden oder geben Sie einen neuen Namen ein.');
        return;
      }

      // Bei Neukunden muss ein Kennzeichen angegeben werden
      if (!resolvedKundeId && resolvedKundeName && !termin.kennzeichen) {
        alert('Bei einem neuen Kunden ist das Kennzeichen ein Pflichtfeld.\nBitte geben Sie ein Kennzeichen ein.');
        document.getElementById('kennzeichen')?.focus();
        return;
      }

      // Speichere alle Daten für die spätere Verarbeitung
      this.pendingTerminData = {
        termin,
        arbeitenListe,
        resolvedKundeId,
        resolvedKundeName,
        kundeTelefon
      };

      // Zeige Vorschau-Modal mit Countdown
      this.showTerminVorschau(termin, resolvedKundeName, kundeTelefon, arbeitenListe, abholungTyp, ersatzautoChecked);
    },

    async handleSchnellerTerminSubmit(e) {
      e.preventDefault();

      const arbeitText = document.getElementById('schnell_arbeit').value.trim();
      if (!arbeitText) {
        alert('Bitte mindestens eine Arbeit eingeben.');
        return;
      }

      const datumValue = document.getElementById('schnell_datum').value;
      if (!datumValue) {
        const fehler = document.getElementById('schnellDatumFehler');
        const trigger = document.getElementById('schnellDatumTrigger');
        if (fehler) fehler.style.display = 'block';
        if (trigger) { trigger.style.borderColor = '#dc3545'; trigger.style.borderStyle = 'solid'; }
        trigger?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const kundenname = document.getElementById('schnell_kundenname').value.trim() || 'Laufkunde';
      const telefon = document.getElementById('schnell_telefon').value.trim() || null;
      const kennzeichen = document.getElementById('schnell_kennzeichen').value.trim().toUpperCase() || '';
      const fahrzeugtyp = document.getElementById('schnell_fahrzeugtyp').value.trim() || null;
      const zeitStunden = parseFloat(document.getElementById('schnell_zeit').value) || 1;
      const geschaetzteZeit = Math.round(zeitStunden * 60);
      const bringZeit = document.getElementById('schnell_bring_zeit').value || null;
      const abholungZeit = document.getElementById('schnell_abholung_zeit').value || null;
      const notizen = document.getElementById('schnell_notizen').value.trim() || '';

      // Neuen Kunden anlegen oder bestehenden suchen
      let kundeId = null;
      try {
        const existing = (this.kundenCache || []).find(
          k => k.name && k.name.toLowerCase() === kundenname.toLowerCase()
        );
        if (existing) {
          kundeId = existing.id;
        } else if (kundenname !== 'Laufkunde') {
          const created = await KundenService.create({ name: kundenname, telefon: telefon || null });
          kundeId = created.id;
          this.loadKunden();
        }
      } catch (err) {
        console.warn('Kunde nicht angelegt/gefunden, fahre ohne Kunden-ID fort:', err);
      }

      const termin = {
        kunde_id: kundeId || null,
        kunde_name: kundeId ? null : kundenname,
        kunde_telefon: telefon,
        kennzeichen: kennzeichen,
        fahrzeugtyp: fahrzeugtyp,
        arbeit: arbeitText,
        umfang: notizen,
        geschaetzte_zeit: geschaetzteZeit,
        datum: datumValue,
        abholung_typ: 'bringen',
        abholung_details: null,
        abholung_zeit: abholungZeit,
        bring_zeit: bringZeit,
        kontakt_option: null,
        kilometerstand: null,
        ersatzauto: false
      };

      try {
        await TermineService.create(termin);
        alert('⚡ Schneller Termin erfolgreich erstellt!');

        document.getElementById('schnellerTerminForm').reset();
        // Datum leeren – Benutzer muss beim nächsten Termin bewusst ein Datum wählen
        const schnellDatum = document.getElementById('schnell_datum');
        if (schnellDatum) schnellDatum.value = '';
        this.updateSchnellDatumDisplay();
        // Kalender zurücksetzen
        const fehler = document.getElementById('schnellDatumFehler');
        if (fehler) fehler.style.display = 'none';
        this.closeSchnellKalenderPopup();

        this.loadTermine();
        this.loadTermineCache();
        this.loadDashboard();
        this.loadTermineZeiten();
      } catch (error) {
        console.error('Fehler beim Erstellen des schnellen Termins:', error);
        const schnellKunde = document.getElementById('schnell_name')?.value?.trim();
        const schnellKundeInfo = schnellKunde ? ` (Kunde: ${schnellKunde})` : '';
        alert(`Fehler beim Erstellen des Schnelltermins${schnellKundeInfo}:\n${error.message || 'Unbekannter Fehler'}`);
      }
    },

    async handleInternerTerminSubmit(e) {
      console.log('=== INTERNER TERMIN SUBMIT GESTARTET ===');
      e.preventDefault();

      const arbeitText = document.getElementById('intern_arbeit').value.trim();
      console.log('Arbeit:', arbeitText);
      if (!arbeitText) {
        alert('Bitte Arbeitsumfang eingeben.');
        return;
      }

      const zeitStunden = parseFloat(document.getElementById('intern_zeit').value) || 1;
      const geschaetzteZeit = Math.round(zeitStunden * 60); // Konvertiere zu Minuten

      // Mitarbeiterzuordnung verarbeiten
      const selectedValue = document.getElementById('intern_mitarbeiter').value;
      console.log('Ausgewählter Wert:', selectedValue);
      let mitarbeiterIdValue = null;
      let arbeitszeitenDetails = null;

      if (selectedValue && selectedValue !== '') {
        const [type, id] = selectedValue.split('_');
        const numId = parseInt(id, 10);
        console.log('Type:', type, 'ID:', numId);

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

      console.log('Termin-Objekt:', { mitarbeiter_id: mitarbeiterIdValue, arbeitszeiten_details: arbeitszeitenDetails });

      // Dringlichkeit auslesen
      const dringlichkeitValue = document.getElementById('intern_dringlichkeit')?.value || null;

      // Interne Auftragsnummer auslesen (wird im Kennzeichen-Feld gespeichert)
      const interneAuftragsnummer = document.getElementById('intern_auftragsnummer')?.value?.trim() || '';
      const kennzeichenWert = interneAuftragsnummer || 'INTERN';

      const termin = {
        kunde_name: 'Intern',
        kunde_telefon: null,
        kennzeichen: kennzeichenWert,
        arbeit: arbeitText,
        umfang: document.getElementById('intern_notizen').value.trim(),
        geschaetzte_zeit: geschaetzteZeit,
        datum: document.getElementById('intern_datum').value,
        startzeit: document.getElementById('intern_zeit_von').value || null,
        abholung_typ: 'warten',
        abholung_details: 'Interner Termin',
        abholung_zeit: document.getElementById('intern_zeit_von').value || null,
        bring_zeit: document.getElementById('intern_zeit_bis').value || null,
        kontakt_option: null,
        kilometerstand: null,
        ersatzauto: false,
        mitarbeiter_id: mitarbeiterIdValue,
        dringlichkeit: dringlichkeitValue
      };

      // Füge arbeitszeiten_details hinzu, wenn Mitarbeiter/Lehrling zugeordnet
      if (arbeitszeitenDetails) {
        termin.arbeitszeiten_details = JSON.stringify(arbeitszeitenDetails);
      }

      console.log('=== FINALES TERMIN-OBJEKT ===', termin);

      try {
        console.log('Sende Termin an API...');
        await TermineService.create(termin);
        console.log('Termin erfolgreich erstellt!');
        alert('Interner Termin erfolgreich erstellt!');

        // Formular zurücksetzen und zum "Neuer Termin" Sub-Tab wechseln
        document.getElementById('internerTerminForm').reset();
        this.setInternerTerminTodayDate();
        this.resetTermineSubTabs();

        this.loadTermine();
        this.loadTermineCache(); // Cache für Kennzeichen-Suche aktualisieren
        this.loadDashboard();
        this.loadTermineZeiten();
      } catch (error) {
        console.error('Fehler beim Erstellen des internen Termins:', error);
        const auftragInfo = interneAuftragsnummer ? ` (Auftrag: ${interneAuftragsnummer})` : '';
        alert(`Fehler beim Erstellen des internen Auftrags${auftragInfo}:\n${error.message || 'Unbekannter Fehler'}`);
      }
    },

    async handleTerminEditSubmit(e) {
      e.preventDefault();
      
      const terminId = document.getElementById('edit_termin_id').value;
      if (!terminId) {
        alert('Kein Termin ausgewählt.');
        return;
      }
      
      const arbeitText = document.getElementById('edit_arbeitEingabe').value.trim();
      const arbeitenListe = this.parseArbeiten(arbeitText);
      if (arbeitenListe.length === 0) {
        alert('Bitte mindestens eine Arbeit eingeben.');
        return;
      }
      
      const abholungTyp = document.getElementById('edit_abholung_typ').value;
      const abholungZeit = document.getElementById('edit_abholung_zeit').value || null;
      const abholungDatum = document.getElementById('edit_abholung_datum').value || null;
      const bringZeit = document.getElementById('edit_bring_zeit').value || null;
      
      // Sammle alle ausgewählten Kontakt-Optionen
      const kontaktOptionen = [];
      if (document.getElementById('edit_kontakt_kunde_anrufen').checked) {
        kontaktOptionen.push('Kunde anrufen');
      }
      if (document.getElementById('edit_kontakt_kunde_ruft').checked) {
        kontaktOptionen.push('Kunde ruft selbst an');
      }
      const kontaktOption = kontaktOptionen.length > 0 ? kontaktOptionen.join(', ') : null;
      
      const kontaktAktiv = ['hol_bring', 'bringen', 'ruecksprache', 'warten'].includes(abholungTyp);
      
      const kilometerstandWert = document.getElementById('edit_kilometerstand').value;
      
      // Ersatzauto-Daten sammeln
      const ersatzautoChecked = document.getElementById('edit_ersatzauto').checked;
      const ersatzautoTage = document.getElementById('edit_ersatzauto_tage')?.value?.trim() || '';
      
      // Berechne die geschätzte Zeit aus den Standardzeiten
      const geschaetzteZeit = this.getGeschaetzteZeit(arbeitenListe);
      
      const terminData = {
        kennzeichen: document.getElementById('edit_kennzeichen').value.trim(),
        arbeit: arbeitenListe.join(' || '),
        umfang: document.getElementById('edit_umfang').value.trim(),
        geschaetzte_zeit: geschaetzteZeit,
        datum: document.getElementById('edit_datum').value,
        abholung_typ: abholungTyp,
        abholung_details: document.getElementById('edit_abholung_details').value,
        abholung_zeit: kontaktAktiv ? abholungZeit : null,
        abholung_datum: kontaktAktiv ? abholungDatum : null,
        bring_zeit: kontaktAktiv ? bringZeit : null,
        kontakt_option: kontaktAktiv ? kontaktOption : null,
        kilometerstand: kilometerstandWert !== '' ? parseInt(kilometerstandWert, 10) : null,
        ersatzauto: ersatzautoChecked,
        ersatzauto_tage: ersatzautoChecked && ersatzautoTage ? parseInt(ersatzautoTage, 10) : null,
        ersatzauto_bis_datum: ersatzautoChecked && !ersatzautoTage && abholungDatum ? abholungDatum : null,
        ersatzauto_bis_zeit: ersatzautoChecked && !ersatzautoTage && abholungZeit ? abholungZeit : null,
        vin: document.getElementById('edit_vin')?.value?.trim().toUpperCase() || null,
        fahrzeugtyp: document.getElementById('edit_fahrzeugtyp')?.value?.trim() || null
      };
      
      try {
        await this.ensureArbeitenExistieren(arbeitenListe, geschaetzteZeit);
        await TermineService.update(terminId, terminData);
        alert('Termin erfolgreich aktualisiert!');
        
        // Formular zurücksetzen und Termine neu laden
        this.resetTerminEditForm();
        this.loadEditTermine();
        this.loadTermine();
        this.loadTermineCache(); // Cache für Kennzeichen-Suche aktualisieren
        this.loadDashboard();
        this.loadArbeitszeiten();
        this.loadTermineZeiten();
      } catch (error) {
        console.error('Fehler beim Aktualisieren des Termins:', error);
        alert('Fehler beim Aktualisieren des Termins: ' + (error.message || 'Unbekannter Fehler'));
      }
    },
  });
}
