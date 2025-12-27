class App {
  constructor() {
    this.kundenCache = [];
    this.arbeitszeiten = [];
    this.termineCache = [];
    this.termineById = {};
    this.autocompleteSelectedIndex = -1;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadInitialData();
    this.setTodayDate();
    this.setupWebSocket();
  }

  setupWebSocket() {
    const serverConfig = CONFIG.getServerConfig();
    if (!serverConfig || !serverConfig.ip || !serverConfig.port) {
        console.error("Server-Konfiguration nicht gefunden. WebSocket kann nicht gestartet werden.");
        return;
    }
    
    const wsUrl = `ws://${serverConfig.ip}:${serverConfig.port}`;
    console.log(`Connecting WebSocket to ${wsUrl}`);

    const connect = () => {
        const ws = new WebSocket(wsUrl);

        ws.addEventListener('open', () => {
            console.log('WebSocket-Verbindung hergestellt.');
        });

        ws.addEventListener('close', (event) => {
            console.log(`WebSocket-Verbindung getrennt. Code: ${event.code}, Grund: '${event.reason}'. Erneuter Verbindungsversuch in 5 Sekunden...`);
            setTimeout(connect, 5000);
        });

        ws.addEventListener('error', (err) => {
            console.error('WebSocket-Fehler:', err);
        });
    }

    connect();
  }

  setupEventListeners() {
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', (e) => this.handleTabChange(e));
    });

    document.querySelectorAll('.sub-tab-button').forEach(button => {
      button.addEventListener('click', (e) => this.handleSubTabChange(e));
    });

    document.getElementById('terminForm').addEventListener('submit', (e) => this.handleTerminSubmit(e));
    document.getElementById('kundenForm').addEventListener('submit', (e) => this.handleKundenSubmit(e));
    document.getElementById('zeitAnpassungForm').addEventListener('submit', (e) => this.handleZeitAnpassungSubmit(e));
    document.getElementById('serverConfigForm').addEventListener('submit', (e) => this.handleServerConfigSubmit(e));
    document.getElementById('werkstattSettingsForm').addEventListener('submit', (e) => this.handleWerkstattSettingsSubmit(e));
    document.getElementById('abwesenheitForm').addEventListener('submit', (e) => this.handleAbwesenheitSubmit(e));

    const arbeitEingabe = document.getElementById('arbeitEingabe');
    if (arbeitEingabe) {
      arbeitEingabe.addEventListener('input', (e) => {
        this.updateZeitschaetzung();
        this.handleArbeitAutocomplete(e);
        this.validateTerminEchtzeit();
      });
      arbeitEingabe.addEventListener('keydown', (e) => this.handleArbeitKeydown(e));
    }
    document.getElementById('filterDatum').addEventListener('change', () => this.loadTermine());
    document.getElementById('alleTermineBtn').addEventListener('click', () => this.showAllTermine());
    document.getElementById('auslastungDatum').addEventListener('change', () => this.loadAuslastung());
    document.getElementById('abwesenheitDatum').addEventListener('change', () => this.loadAbwesenheit());
    document.getElementById('importBtn').addEventListener('click', () => this.importKunden());
    document.getElementById('testConnectionBtn').addEventListener('click', () => this.testConnection());
    document.getElementById('terminSchnellsuche').addEventListener('change', () => this.handleTerminSchnellsuche());
    document.getElementById('terminSchnellsuche').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleTerminSchnellsuche();
      }
    });
    document.getElementById('abholung_typ').addEventListener('change', () => this.toggleAbholungDetails());

    const heuteTabellenBtn = document.getElementById('heuteTabellenAnsicht');
    if (heuteTabellenBtn) {
      heuteTabellenBtn.addEventListener('click', () => this.handleHeuteViewSwitch('tabelle'));
    }
    const heuteKartenBtn = document.getElementById('heuteKartenAnsicht');
    if (heuteKartenBtn) {
      heuteKartenBtn.addEventListener('click', () => this.handleHeuteViewSwitch('karten'));
    }

    // Echtzeit-Validierung für Termin-Formular
    const datumInput = document.getElementById('datum');
    if (datumInput) {
      datumInput.addEventListener('change', () => this.validateTerminEchtzeit());
    }

    // Entferne Placeholder-Styling wenn Benutzer KM-Stand eingibt
    const kmStandInput = document.getElementById('kilometerstand');
    if (kmStandInput) {
      kmStandInput.addEventListener('input', () => {
        if (kmStandInput.value) {
          kmStandInput.classList.remove('has-previous-value');
          kmStandInput.placeholder = 'z.B. 128000';
        }
      });
    }

    const createBackupBtn = document.getElementById('createBackupBtn');
    if (createBackupBtn) {
      createBackupBtn.addEventListener('click', () => this.handleCreateBackup());
    }
    const refreshBackupsBtn = document.getElementById('refreshBackupsBtn');
    if (refreshBackupsBtn) {
      refreshBackupsBtn.addEventListener('click', () => {
        this.loadBackupStatus();
        this.loadBackupList();
      });
    }
    const backupTable = document.getElementById('backupTable');
    if (backupTable) {
      backupTable.addEventListener('click', (e) => {
        const restoreBtn = e.target.closest('[data-backup-restore]');
        if (restoreBtn) {
          this.handleRestoreBackup(restoreBtn.dataset.backupRestore);
        }
      });
    }

    const uploadInput = document.getElementById('backupUploadInput');
    const uploadName = document.getElementById('backupUploadName');
    if (uploadInput && uploadName) {
      uploadInput.addEventListener('change', () => {
        const file = uploadInput.files && uploadInput.files[0];
        uploadName.textContent = file ? file.name : 'Keine Datei ausgewählt';
      });
    }
    const uploadRestoreBtn = document.getElementById('uploadRestoreBtn');
    if (uploadRestoreBtn && uploadInput) {
      uploadRestoreBtn.addEventListener('click', () => this.handleUploadAndRestore());
    }

    document.querySelector('.close').addEventListener('click', () => this.closeModal());
    document.getElementById('closeDetails').addEventListener('click', () => this.closeTerminDetails());
    document.getElementById('closeArbeitszeitenModal').addEventListener('click', () => this.closeArbeitszeitenModal());
    document.getElementById('saveArbeitszeitenBtn').addEventListener('click', () => this.saveArbeitszeitenModal());

    window.addEventListener('click', (event) => {
      const modal = document.getElementById('modal');
      const detailsModal = document.getElementById('terminDetailsModal');
      const arbeitszeitenModal = document.getElementById('arbeitszeitenModal');
      const autocomplete = document.getElementById('arbeitAutocomplete');
      const arbeitEingabe = document.getElementById('arbeitEingabe');

      if (event.target === modal) {
        this.closeModal();
      }
      if (event.target === detailsModal) {
        this.closeTerminDetails();
      }
      if (event.target === arbeitszeitenModal) {
        this.closeArbeitszeitenModal();
      }

      // Schließe Autocomplete wenn außerhalb geklickt wird
      if (autocomplete && !autocomplete.contains(event.target) && event.target !== arbeitEingabe) {
        this.closeAutocomplete();
      }
    });
  }

  toggleAbholungDetails() {
    const abholungTyp = document.getElementById('abholung_typ').value;
    const detailsGroup = document.getElementById('abholungDetailsGroup');
    const zeitRow = document.getElementById('abholungZeitRow');
    const bringzeitGroup = document.getElementById('bringzeitGroup');
    const abholzeitGroup = document.getElementById('abholzeitGroup');
    const kontaktOptionGroup = document.getElementById('kontaktOptionGroup');

    // Details anzeigen bei hol_bring, bringen oder ruecksprache
    const showDetails = abholungTyp === 'hol_bring' || abholungTyp === 'ruecksprache' || abholungTyp === 'bringen';
    detailsGroup.style.display = showDetails ? 'block' : 'none';

    // Zeitfelder anzeigen bei abholung, hol_bring oder bringen
    const showZeitRow = abholungTyp === 'hol_bring' || abholungTyp === 'bringen' || abholungTyp === 'warten';
    zeitRow.style.display = showZeitRow ? 'flex' : 'none';

    // Bringzeit nur bei hol_bring, bringen oder warten
    const showBringzeit = abholungTyp === 'hol_bring' || abholungTyp === 'bringen' || abholungTyp === 'warten';
    bringzeitGroup.style.display = showBringzeit ? 'block' : 'none';

    // Abholzeit bei hol_bring oder bringen
    const showAbholzeit = abholungTyp === 'hol_bring' || abholungTyp === 'bringen';
    abholzeitGroup.style.display = showAbholzeit ? 'block' : 'none';

    // Kontakt bei hol_bring, bringen oder ruecksprache
    const showKontakt = abholungTyp === 'hol_bring' || abholungTyp === 'bringen' || abholungTyp === 'ruecksprache';
    kontaktOptionGroup.style.display = showKontakt ? 'block' : 'none';

  }

  setTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('datum').value = today;
    document.getElementById('auslastungDatum').value = today;
    const abwesenheitDatum = document.getElementById('abwesenheitDatum');
    if (abwesenheitDatum) {
      abwesenheitDatum.value = today;
    }
    this.toggleAbholungDetails();
    this.loadAuslastung();
  }

  handleTabChange(e) {
    const tabName = e.target.dataset.tab;

    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });

    document.querySelectorAll('.tab-button').forEach(button => {
      button.classList.remove('active');
    });

    document.getElementById(tabName).classList.add('active');
    e.target.classList.add('active');

    if (tabName === 'auslastung') {
      this.loadAuslastung();
    } else if (tabName === 'dashboard') {
      this.loadDashboard();
    } else if (tabName === 'heute') {
      this.loadHeuteTermine();
    } else if (tabName === 'einstellungen') {
      this.loadWerkstattSettings();
      this.loadAbwesenheit();
      const backupTabButton = document.querySelector('#einstellungen .sub-tab-button[data-subtab="settingsBackup"]');
      if (backupTabButton && backupTabButton.classList.contains('active')) {
        this.loadBackupStatus();
        this.loadBackupList();
      }
      const kundenTabButton = document.querySelector('#einstellungen .sub-tab-button[data-subtab="settingsKunden"]');
      if (kundenTabButton && kundenTabButton.classList.contains('active')) {
        this.loadKunden();
      }
    } else if (tabName === 'zeitverwaltung') {
      this.loadTermineZeiten();
    }
  }

  handleSubTabChange(e) {
    const subTabName = e.target.dataset.subtab;
    const container = e.target.closest('.tab-content') || document;

    container.querySelectorAll('.sub-tab-content').forEach(content => {
      content.classList.remove('active');
    });

    container.querySelectorAll('.sub-tab-button').forEach(button => {
      button.classList.remove('active');
    });

    const targetContent = document.getElementById(subTabName);
    if (targetContent) {
      targetContent.classList.add('active');
    }
    e.target.classList.add('active');

    if (subTabName === 'mitarbeiter') {
      this.loadWerkstattSettings();
      this.loadAbwesenheit();
    }

    if (subTabName === 'settingsBackup') {
      this.loadBackupStatus();
      this.loadBackupList();
    }

    if (subTabName === 'settingsKunden') {
      this.loadKunden();
    }
  }

  switchToTab(tabName) {
    const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (tabButton) {
      tabButton.click();
    }
  }

  loadInitialData() {
    this.loadKunden();
    this.loadTermine();
    this.loadArbeitszeiten();
    this.loadDashboard();
    this.loadWerkstattSettings();
    this.loadAbwesenheit();
    this.loadTermineZeiten();
    this.heuteTermine = [];
  }

  async loadKunden() {
    try {
      const kunden = await KundenService.getAll();
      this.kundenCache = kunden;

      const kundenListe = document.getElementById('kundenListe');
      if (kundenListe) {
        kundenListe.innerHTML = '';
        kunden.forEach(kunde => {
          const option = document.createElement('option');
          option.value = kunde.name;
          option.dataset.id = kunde.id;
          option.label = kunde.telefon ? `${kunde.name} (${kunde.telefon})` : kunde.name;
          kundenListe.appendChild(option);
        });
      }

      const tbody = document.getElementById('kundenTable').getElementsByTagName('tbody')[0];
      tbody.innerHTML = '';
      kunden.forEach(kunde => {
        const row = tbody.insertRow();
        row.innerHTML = `
          <td>${kunde.name}</td>
          <td>${kunde.telefon || '-'}</td>
          <td>${kunde.email || '-'}</td>
          <td>${kunde.locosoft_id || '-'}</td>
        `;
      });

      this.updateTerminSuchliste();
    } catch (error) {
      console.error('Fehler beim Laden der Kunden:', error);
      alert('Fehler beim Laden der Kunden. Ist das Backend gestartet?');
    }
  }

  async handleKundenSubmit(e) {
    e.preventDefault();

    const kunde = {
      name: document.getElementById('kunde_name').value,
      telefon: document.getElementById('telefon').value,
      email: document.getElementById('email').value,
      adresse: document.getElementById('adresse').value,
      locosoft_id: document.getElementById('locosoft_id').value
    };

    try {
      await KundenService.create(kunde);
      alert('Kunde erfolgreich angelegt!');
      document.getElementById('kundenForm').reset();
      this.loadKunden();
    } catch (error) {
      console.error('Fehler beim Anlegen des Kunden:', error);
      alert('Fehler beim Anlegen des Kunden');
    }
  }

  async importKunden() {
    const data = document.getElementById('importData').value;

    try {
      const kunden = JSON.parse(data);
      const result = await KundenService.import(kunden);
      alert(result.message);
      document.getElementById('importData').value = '';
      this.loadKunden();
    } catch (error) {
      console.error('Fehler beim Import:', error);
      alert('Fehler beim Import. Bitte überprüfen Sie das JSON-Format.');
    }
  }

  async loadArbeitszeiten() {
    try {
      const arbeitszeiten = await ArbeitszeitenService.getAll();
      this.arbeitszeiten = arbeitszeiten;

      const arbeitListe = document.getElementById('arbeitListe');
      arbeitListe.innerHTML = '';
      arbeitszeiten.forEach(arbeit => {
        const option = document.createElement('option');
        option.value = arbeit.bezeichnung;
        arbeitListe.appendChild(option);
      });

      const tbody = document.getElementById('arbeitszeitenTable').getElementsByTagName('tbody')[0];
      tbody.innerHTML = '';
      arbeitszeiten.forEach(arbeit => {
        const row = tbody.insertRow();
        row.innerHTML = `
          <td>
            <input type="text"
                   id="bezeichnung_${arbeit.id}"
                   data-id="${arbeit.id}"
                   value="${arbeit.bezeichnung}"
                   style="width: 100%; min-width: 150px; padding: 8px;">
          </td>
          <td>
            <input type="number"
                   id="zeit_${arbeit.id}"
                   data-id="${arbeit.id}"
                   value="${arbeit.standard_minuten}"
                   min="1"
                   style="width: 100px; padding: 8px;">
          </td>
        `;
      });
    } catch (error) {
      console.error('Fehler beim Laden der Arbeitszeiten:', error);
    }
  }

  // Diese Funktion ist jetzt in loadTermine() integriert
  async loadTermineZeiten() {
    // Rufe loadTermine() auf, da die Tabelle jetzt in Zeitverwaltung ist
    await this.loadTermine();
  }

  updateZeitschaetzung() {
    // Diese Funktion wird nicht mehr benötigt, da die Zeitschätzung
    // direkt aus den Standardzeiten berechnet wird
  }

  updateGesamtzeit() {
    // Diese Funktion wird nicht mehr benötigt
  }

  async updateArbeitszeit(id) {
    const minuten = document.getElementById(`zeit_${id}`).value;
    const bezeichnung = document.getElementById(`bezeichnung_${id}`).value.trim();

    if (!bezeichnung) {
      alert('Bitte eine Bezeichnung eingeben.');
      return;
    }

    try {
      await ArbeitszeitenService.update(id, {
        bezeichnung: bezeichnung,
        standard_minuten: parseInt(minuten)
      });
      alert('Arbeitszeit aktualisiert!');
      this.loadArbeitszeiten();
    } catch (error) {
      console.error('Fehler beim Update:', error);
      alert('Fehler beim Aktualisieren');
    }
  }

  async saveAllArbeitszeiten() {
    const tbody = document.getElementById('arbeitszeitenTable').getElementsByTagName('tbody')[0];
    const rows = tbody.getElementsByTagName('tr');

    let hasError = false;
    const updates = [];

    // Sammle alle Updates
    for (let row of rows) {
      const bezeichnungInput = row.querySelector('input[type="text"]');
      const zeitInput = row.querySelector('input[type="number"]');

      if (bezeichnungInput && zeitInput) {
        const id = bezeichnungInput.dataset.id;
        const bezeichnung = bezeichnungInput.value.trim();
        const minuten = parseInt(zeitInput.value);

        if (!bezeichnung) {
          alert('Bitte alle Bezeichnungen ausfüllen.');
          hasError = true;
          break;
        }

        updates.push({
          id: id,
          bezeichnung: bezeichnung,
          standard_minuten: minuten
        });
      }
    }

    if (hasError || updates.length === 0) {
      return;
    }

    try {
      // Speichere alle Updates
      for (let update of updates) {
        await ArbeitszeitenService.update(update.id, {
          bezeichnung: update.bezeichnung,
          standard_minuten: update.standard_minuten
        });
      }

      alert('Alle Arbeitszeiten erfolgreich gespeichert!');
      this.loadArbeitszeiten();
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern der Arbeitszeiten');
    }
  }

  async validateTerminEchtzeit() {
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
  }

  async showTerminVorschlaege() {
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
  }

  displayTerminVorschlaege(vorschlaege) {
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
  }

  showTerminWarnung(validation) {
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
  }

  hideTerminWarnung() {
    const warnungElement = document.getElementById('terminWarnung');
    if (warnungElement) {
      warnungElement.style.display = 'none';
    }
  }

  async handleTerminSubmit(e) {
    e.preventDefault();

    const arbeitText = document.getElementById('arbeitEingabe').value.trim();

    const arbeitenListe = this.parseArbeiten(arbeitText);
    if (arbeitenListe.length === 0) {
      alert('Bitte mindestens eine Arbeit eingeben.');
      return;
    }

    const abholungTyp = document.getElementById('abholung_typ').value;
    const abholungZeit = document.getElementById('abholung_zeit').value || null;
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

    // Berechne die geschätzte Zeit aus den Standardzeiten
    const geschaetzteZeit = this.getGeschaetzteZeit(arbeitenListe);

    const termin = {
      kennzeichen: document.getElementById('kennzeichen').value.trim(),
      arbeit: arbeitenListe.join(', '),
      umfang: document.getElementById('umfang').value.trim(),
      geschaetzte_zeit: geschaetzteZeit,
      datum: document.getElementById('datum').value,
      abholung_typ: abholungTyp,
      abholung_details: document.getElementById('abholung_details').value,
      abholung_zeit: kontaktAktiv ? abholungZeit : null,
      bring_zeit: kontaktAktiv ? bringZeit : null,
      kontakt_option: kontaktAktiv ? kontaktOption : null,
      kilometerstand: kilometerstandWert !== '' ? parseInt(kilometerstandWert, 10) : null,
      ersatzauto: document.getElementById('ersatzauto').checked
    };

    const kundeId = document.getElementById('kunde_id').value;
    const kundeNameEingabe = document.getElementById('terminSchnellsuche').value.trim();
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
      } else {
        try {
          const created = await KundenService.create({ name: kundeNameEingabe, telefon: kundeTelefon || null });
          resolvedKundeId = created.id;
          this.loadKunden(); // Cache auffrischen
        } catch (err) {
          console.error('Fehler beim Anlegen des Kunden:', err);
        }
      }
    }

    if (resolvedKundeId) {
      termin.kunde_id = resolvedKundeId;
    } else if (resolvedKundeName) {
      termin.kunde_name = resolvedKundeName;
    } else {
      alert('Bitte wählen Sie einen Kunden oder geben Sie einen neuen Namen ein.');
      return;
    }
    if (kundeTelefon) {
      termin.kunde_telefon = kundeTelefon;
    }

    try {
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
          return;
        }
      } else if (validation.warnung) {
        const bestaetigung = confirm(
          `${validation.warnung}\n\n` +
          `Aktuelle Auslastung würde auf ${validation.neue_auslastung_prozent}% steigen.\n` +
          `Möchten Sie fortfahren?`
        );
        if (!bestaetigung) {
          return;
        }
      }

      await this.ensureArbeitenExistieren(arbeitenListe, termin.geschaetzte_zeit);
      await TermineService.create(termin);
      alert('Termin erfolgreich erstellt!');
      document.getElementById('terminForm').reset();

      this.toggleAbholungDetails();
      this.setTodayDate();
      this.loadTermine();
      this.loadDashboard();
      this.loadArbeitszeiten();
      this.loadTermineZeiten();
    } catch (error) {
      console.error('Fehler beim Erstellen des Termins:', error);
      alert('Fehler beim Erstellen des Termins: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  async loadTermine() {
    const filterDatum = document.getElementById('filterDatum').value;

    try {
      const termine = await TermineService.getAll(filterDatum || null);
      if (!filterDatum) {
        this.termineCache = termine;
        this.updateTerminSuchliste();
      }
      this.termineById = {};

      const tbody = document.getElementById('termineTable').getElementsByTagName('tbody')[0];
      tbody.innerHTML = '';

      termine.forEach(termin => {
        this.termineById[termin.id] = termin;
        const row = tbody.insertRow();
        const statusClass = `status-${termin.status}`;
        const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;

        // Zeit-Status: rot = nur geschätzt, grün = tatsächlich erfasst
        const hatTatsaechlicheZeit = termin.tatsaechliche_zeit && termin.tatsaechliche_zeit > 0;
        const zeitStatusIcon = hatTatsaechlicheZeit ? '🟢' : '🔴';

        row.innerHTML = `
          <td style="text-align: center; font-size: 20px;">${zeitStatusIcon}</td>
          <td><strong>${termin.termin_nr || '-'}</strong></td>
          <td>${termin.datum}</td>
          <td>${termin.kunde_name}</td>
          <td>${termin.kennzeichen}</td>
          <td>${termin.kilometerstand || '-'}</td>
          <td>${termin.ersatzauto ? 'Ja' : 'Nein'}</td>
          <td>${termin.arbeit}</td>
          <td>${zeitAnzeige} Min</td>
          <td><span class="status-badge ${statusClass}">${termin.status}</span></td>
          <td class="action-buttons">
            <button class="btn btn-edit" onclick="event.stopPropagation(); app.showTerminDetails(${termin.id})">
              📄 Details
            </button>
          </td>
        `;

        // NACH innerHTML: Zeile klickbar machen
        row.style.cursor = 'pointer';

        // Bei Klick auf die Zeile -> Modal öffnen
        row.onclick = (e) => {
          // Verhindere das Öffnen wenn auf einen Button geklickt wurde
          if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
            return;
          }
          this.openArbeitszeitenModal(termin.id);
        };
      });
    } catch (error) {
      console.error('Fehler beim Laden der Termine:', error);
    }
  }

  showAllTermine() {
    document.getElementById('filterDatum').value = '';
    this.loadTermine();
  }

  openZeitModal(terminId, aktuelleZeit, status) {
    document.getElementById('termin_id').value = terminId;
    document.getElementById('tatsaechliche_zeit').value = aktuelleZeit;
    document.getElementById('status').value = status;
    document.getElementById('modal').style.display = 'block';
  }

  closeModal() {
    document.getElementById('modal').style.display = 'none';
  }

  showTerminDetails(terminId) {
    const termin = this.termineById[terminId];
    if (!termin) return;

    const body = document.getElementById('terminDetailsBody');
    const kontaktText = termin.kontakt_option || '-';
    const abholungText = termin.abholung_typ || '-';

    body.innerHTML = `
      <p><strong>Termin-Nr:</strong> ${termin.termin_nr || '-'}</p>
      <p><strong>Datum:</strong> ${termin.datum}</p>
      <p><strong>Kunde:</strong> ${termin.kunde_name || '-'} (${termin.kunde_telefon || '-'})</p>
      <p><strong>Kennzeichen:</strong> ${termin.kennzeichen || '-'}</p>
      <p><strong>Arbeiten:</strong> ${termin.arbeit || '-'}</p>
      <p><strong>Details/Wünsche:</strong> ${termin.umfang || '-'}</p>
      <p><strong>Abholung/Bringen:</strong> ${abholungText}</p>
      <p><strong>Bringzeit:</strong> ${termin.bring_zeit || '-'}</p>
      <p><strong>Abholzeit:</strong> ${termin.abholung_zeit || '-'}</p>
      <p><strong>Kontakt:</strong> ${kontaktText}</p>
      <p><strong>Abhol-Details:</strong> ${termin.abholung_details || '-'}</p>
      <p><strong>Kilometerstand:</strong> ${termin.kilometerstand || '-'}</p>
      <p><strong>Ersatzauto:</strong> ${termin.ersatzauto ? 'Ja' : 'Nein'}</p>
      <p><strong>Status:</strong> ${termin.status}</p>
    `;

    document.getElementById('terminDetailsModal').style.display = 'block';
  }

  closeTerminDetails() {
    document.getElementById('terminDetailsModal').style.display = 'none';
  }

  async handleZeitAnpassungSubmit(e) {
    e.preventDefault();

    const terminId = document.getElementById('termin_id').value;
    const data = {
      tatsaechliche_zeit: parseInt(document.getElementById('tatsaechliche_zeit').value),
      status: document.getElementById('status').value
    };

    try {
      await TermineService.update(terminId, data);
      alert('Termin aktualisiert!');
      this.closeModal();
      this.loadTermine();
      this.loadAuslastung();
    } catch (error) {
      console.error('Fehler beim Update:', error);
      alert('Fehler beim Aktualisieren');
    }
  }

  async loadAuslastung() {
    const datum = document.getElementById('auslastungDatum').value;

    if (!datum) return;

    try {
      const data = await AuslastungService.getByDatum(datum);
      await this.loadAuslastungWoche();

      // Zeige die Zeiten nach Status
      document.getElementById('geplant').textContent = this.formatMinutesToHours(data.geplant_minuten || 0);
      document.getElementById('inArbeit').textContent = this.formatMinutesToHours(data.in_arbeit_minuten || 0);
      document.getElementById('abgeschlossen').textContent = this.formatMinutesToHours(data.abgeschlossen_minuten || 0);
      document.getElementById('verfuegbar').textContent = this.formatMinutesToHours(data.verfuegbar_minuten);
      const auslastungProzent = data.auslastung_prozent || 0;
      const prozentElement = document.getElementById('prozent');
      if (prozentElement) {
        prozentElement.textContent = `${auslastungProzent}%`;
        
        // Farbcodierung basierend auf Auslastung
        prozentElement.style.color = '';
        prozentElement.style.fontWeight = 'bold';
        if (auslastungProzent > 100) {
          prozentElement.style.color = '#c62828'; // Rot
        } else if (auslastungProzent > 80) {
          prozentElement.style.color = '#f57c00'; // Orange
        } else {
          prozentElement.style.color = '#2e7d32'; // Grün
        }
      }

      if (data.gesamt_minuten) {
        document.getElementById('verfuegbar').textContent =
          `${this.formatMinutesToHours(data.verfuegbar_minuten)} (${this.formatMinutesToHours(data.gesamt_minuten)} gesamt)`;
      }
      if (data.einstellungen) {
        this.prefillWerkstattSettings(data.einstellungen);
      }
      if (data.abwesenheit) {
        this.prefillAbwesenheit(datum, data.abwesenheit);
      }

      // Berechne Prozentanteile für die Segmente
      const gesamtMinuten = data.gesamt_minuten || 1;
      const geplantProzent = ((data.geplant_minuten || 0) / gesamtMinuten) * 100;
      const inArbeitProzent = ((data.in_arbeit_minuten || 0) / gesamtMinuten) * 100;
      const abgeschlossenProzent = ((data.abgeschlossen_minuten || 0) / gesamtMinuten) * 100;

      // Setze die Breite der Segmente
      const geplantSegment = document.getElementById('progressGeplant');
      const inArbeitSegment = document.getElementById('progressInArbeit');
      const abgeschlossenSegment = document.getElementById('progressAbgeschlossen');

      if (geplantSegment && inArbeitSegment && abgeschlossenSegment) {
        geplantSegment.style.width = `${Math.min(geplantProzent, 100)}%`;
        inArbeitSegment.style.width = `${Math.min(inArbeitProzent, 100)}%`;
        abgeschlossenSegment.style.width = `${Math.min(abgeschlossenProzent, 100)}%`;

        // Farbcodierung für Gesamtauslastung
        const gesamtAuslastung = auslastungProzent;
        const progressBar = geplantSegment.parentElement;
        if (progressBar) {
          if (gesamtAuslastung > 100) {
            progressBar.style.borderColor = '#c62828';
            progressBar.style.backgroundColor = '#ffebee';
          } else if (gesamtAuslastung > 80) {
            progressBar.style.borderColor = '#f57c00';
            progressBar.style.backgroundColor = '#fff3e0';
          } else {
            progressBar.style.borderColor = '#2e7d32';
            progressBar.style.backgroundColor = '#e8f5e9';
          }
        }

        // Zeige oder verstecke den "Keine Termine" Text
        const emptyText = document.getElementById('progressEmpty');
        if (emptyText) {
          const hasTermine = (data.geplant_minuten || 0) + (data.in_arbeit_minuten || 0) + (data.abgeschlossen_minuten || 0) > 0;
          emptyText.style.display = hasTermine ? 'none' : 'block';
        }

        // Optional: Zeige Prozent-Text in den Segmenten
        if (geplantProzent > 10) {
          geplantSegment.textContent = `${Math.round(geplantProzent)}%`;
        } else {
          geplantSegment.textContent = '';
        }

        if (inArbeitProzent > 10) {
          inArbeitSegment.textContent = `${Math.round(inArbeitProzent)}%`;
        } else {
          inArbeitSegment.textContent = '';
        }

        if (abgeschlossenProzent > 10) {
          abgeschlossenSegment.textContent = `${Math.round(abgeschlossenProzent)}%`;
        } else {
          abgeschlossenSegment.textContent = '';
        }
      } else {
        console.error('Progress-Segmente nicht gefunden:', {
          geplant: !!geplantSegment,
          inArbeit: !!inArbeitSegment,
          abgeschlossen: !!abgeschlossenSegment
        });
      }
    } catch (error) {
      console.error('Fehler beim Laden der Auslastung:', error);
    }
  }

  async loadAuslastungWoche() {
    const days = this.getWeekDays();
    if (!days || days.length === 0) return;

    try {
      const auslastungData = await Promise.all(
        days.map(day => AuslastungService.getByDatum(day.datum).catch(() => null))
      );

      // Prognose: Zeige durchschnittliche Auslastung für die Woche
      const auslastungen = auslastungData.filter(d => d !== null);
      if (auslastungen.length > 0) {
        const durchschnittlicheAuslastung = auslastungen.reduce((sum, d) => sum + (d.auslastung_prozent || 0), 0) / auslastungen.length;
        const prognoseElement = document.getElementById('wochePrognose');
        if (prognoseElement) {
          prognoseElement.textContent = `Durchschnitt: ${Math.round(durchschnittlicheAuslastung)}%`;
          prognoseElement.style.color = durchschnittlicheAuslastung > 100 ? '#c62828' :
                                       durchschnittlicheAuslastung > 80 ? '#f57c00' : '#2e7d32';
        }
      }

      let geplant = 0;
      let inArbeit = 0;
      let abgeschlossen = 0;
      let verfuegbar = 0;
      let gesamt = 0;

      auslastungData.forEach(d => {
        if (!d) return;
        geplant += d.geplant_minuten || 0;
        inArbeit += d.in_arbeit_minuten || 0;
        abgeschlossen += d.abgeschlossen_minuten || 0;
        verfuegbar += d.verfuegbar_minuten || 0;
        gesamt += d.gesamt_minuten || 0;
      });

      const gesamtMinuten = gesamt || 1;
      const geplantProzent = (geplant / gesamtMinuten) * 100;
      const inArbeitProzent = (inArbeit / gesamtMinuten) * 100;
      const abgeschlossenProzent = (abgeschlossen / gesamtMinuten) * 100;

      document.getElementById('wocheGeplant').textContent = this.formatMinutesToHours(geplant);
      document.getElementById('wocheInArbeit').textContent = this.formatMinutesToHours(inArbeit);
      document.getElementById('wocheAbgeschlossen').textContent = this.formatMinutesToHours(abgeschlossen);
      document.getElementById('wocheVerfuegbar').textContent = this.formatMinutesToHours(verfuegbar);
      document.getElementById('wocheProzent').textContent = `${Math.round((geplant + inArbeit + abgeschlossen) / (verfuegbar || gesamtMinuten) * 100)}%`;

      const geplantSegment = document.getElementById('progressWocheGeplant');
      const inArbeitSegment = document.getElementById('progressWocheInArbeit');
      const abgeschlossenSegment = document.getElementById('progressWocheAbgeschlossen');
      const emptyText = document.getElementById('progressWocheEmpty');

      if (geplantSegment && inArbeitSegment && abgeschlossenSegment) {
        geplantSegment.style.width = `${Math.min(geplantProzent, 100)}%`;
        inArbeitSegment.style.width = `${Math.min(inArbeitProzent, 100)}%`;
        abgeschlossenSegment.style.width = `${Math.min(abgeschlossenProzent, 100)}%`;

        const hasTermine = geplant + inArbeit + abgeschlossen > 0;
        if (emptyText) {
          emptyText.style.display = hasTermine ? 'none' : 'block';
        }

        geplantSegment.textContent = geplantProzent > 10 ? `${Math.round(geplantProzent)}%` : '';
        inArbeitSegment.textContent = inArbeitProzent > 10 ? `${Math.round(inArbeitProzent)}%` : '';
        abgeschlossenSegment.textContent = abgeschlossenProzent > 10 ? `${Math.round(abgeschlossenProzent)}%` : '';
      }
    } catch (error) {
      console.error('Fehler beim Laden der Wochen-Auslastung:', error);
    }
  }

  async loadDashboard() {
    await this.loadDashboardStats();
    await this.loadDashboardTermineHeute();
    await this.loadWochenUebersicht();
    await this.loadMonatsUebersicht();
  }

  async loadDashboardStats() {
    try {
      const today = new Date().toISOString().split('T')[0];

      const termineHeute = await TermineService.getAll(today);
      const allKunden = await KundenService.getAll();
      const auslastungHeute = await AuslastungService.getByDatum(today);

      const weekStart = this.getWeekStart();
      const weekEnd = this.getWeekEnd();
      const allTermine = await TermineService.getAll();
      const termineWoche = allTermine.filter(t => t.datum >= weekStart && t.datum <= weekEnd);

      document.getElementById('termineHeute').textContent = termineHeute.length;
      const geplant = termineHeute.filter(t => t.status === 'geplant').length;
      const inArbeit = termineHeute.filter(t => t.status === 'in_arbeit').length;
      document.getElementById('termineHeuteStatus').textContent =
        `${geplant} geplant, ${inArbeit} in Arbeit`;

      document.getElementById('auslastungHeute').textContent = `${auslastungHeute.auslastung_prozent}%`;
      const auslastungText = auslastungHeute.auslastung_prozent <= 80 ? 'Gut' :
                             auslastungHeute.auslastung_prozent <= 100 ? 'Voll' : 'Überlastet';
      document.getElementById('auslastungHeuteStatus').textContent = auslastungText;

      document.getElementById('kundenGesamt').textContent = allKunden.length;

      document.getElementById('termineWoche').textContent = termineWoche.length;

      // Dashboard Auslastungsbalken aktualisieren
      this.updateDashboardAuslastung(auslastungHeute);

    } catch (error) {
      console.error('Fehler beim Laden der Dashboard-Statistiken:', error);
    }
  }

  async loadDashboardTermineHeute() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const termine = await TermineService.getAll(today);
      termine.forEach(t => {
        this.termineById[t.id] = t;
      });

      const table = document.getElementById('dashboardTermineTable');
      const tbody = table.getElementsByTagName('tbody')[0];
      tbody.innerHTML = '';

      if (termine.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading">Keine Termine für heute</td></tr>';
        return;
      }

      const renderRows = (list) => {
        tbody.innerHTML = '';
        list.forEach(termin => {
          const row = tbody.insertRow();
          const statusClass = `status-${termin.status}`;
          const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;

          row.innerHTML = `
            <td><strong>${termin.termin_nr || '-'}</strong></td>
            <td>${termin.abholung_typ === 'warten' ? 'Ja' : 'Nein'}</td>
            <td>${termin.bring_zeit || '-'}</td>
            <td>${termin.abholung_zeit || '-'}</td>
            <td>${termin.kunde_name}</td>
            <td>${termin.kennzeichen}</td>
            <td>${termin.arbeit}</td>
            <td>${zeitAnzeige} Min</td>
            <td class="dashboard-action-cell">
              <div class="dashboard-action-grid">
                <span class="status-badge ${statusClass}">${termin.status}</span>
                <button class="btn btn-edit" onclick="app.showTerminDetails(${termin.id})">Details</button>
              </div>
            </td>
          `;
        });
      };

      renderRows(termine);

      const headers = table.querySelectorAll('th');
      const sortConfig = { index: null, asc: true };

      const sortData = (index) => {
        const sorted = [...termine].sort((a, b) => {
          const getValue = (t) => {
            switch (index) {
              case 0: return t.termin_nr || '';
              case 1: return t.abholung_typ === 'warten' ? 1 : 0;
              case 2: return t.bring_zeit || '';
              case 3: return t.abholung_zeit || '';
              case 4: return t.kunde_name || '';
              case 5: return t.kennzeichen || '';
              case 6: return t.arbeit || '';
              case 7: return t.tatsaechliche_zeit || t.geschaetzte_zeit || 0;
              default: return '';
            }
          };

          const va = getValue(a);
          const vb = getValue(b);

          if (typeof va === 'number' && typeof vb === 'number') {
            return sortConfig.asc ? va - vb : vb - va;
          }
          return sortConfig.asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        });
        renderRows(sorted);
      };

      headers.forEach((th, idx) => {
        th.style.cursor = 'pointer';
        th.onclick = () => {
          if (sortConfig.index === idx) {
            sortConfig.asc = !sortConfig.asc;
          } else {
            sortConfig.index = idx;
            sortConfig.asc = true;
          }
          sortData(idx);
        };
      });
    } catch (error) {
      console.error('Fehler beim Laden der heutigen Termine:', error);
    }
  }

  async loadHeuteTermine() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const heuteDatumEl = document.getElementById('heuteDatum');
      if (heuteDatumEl) {
        const date = new Date(today);
        heuteDatumEl.textContent = date.toLocaleDateString('de-DE', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }

      const termine = await TermineService.getAll(today);
      termine.forEach(t => {
        this.termineById[t.id] = t;
      });

      this.heuteTermine = termine;
      this.renderHeuteTabelle(termine);
      this.renderHeuteKarten(termine);
    } catch (error) {
      console.error('Fehler beim Laden der heutigen Termine:', error);
      const tbody = document.querySelector('#heuteTermineTable tbody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="15" class="loading">Fehler beim Laden der Termine</td></tr>';
      }
      const kartenGrid = document.getElementById('heuteKartenGrid');
      if (kartenGrid) {
        kartenGrid.innerHTML = '<div class="loading">Fehler beim Laden der Termine</div>';
      }
    }
  }

  renderHeuteTabelle(termine) {
    const tbody = document.querySelector('#heuteTermineTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (termine.length === 0) {
      tbody.innerHTML = '<tr><td colspan="15" class="loading">Keine Termine für heute</td></tr>';
      return;
    }

    termine.forEach(termin => {
      const row = tbody.insertRow();
      const statusClass = `status-${termin.status || 'geplant'}`;
      const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || '-';
      const abholungTypText = {
        'bringen': 'Kunde bringt/holt selbst',
        'hol_bring': 'Hol- und Bringservice',
        'ruecksprache': 'Telefonische Rücksprache',
        'warten': 'Kunde wartet'
      }[termin.abholung_typ] || termin.abholung_typ || '-';

      row.innerHTML = `
        <td><strong>${termin.termin_nr || '-'}</strong></td>
        <td>${termin.kunde_name || '-'}</td>
        <td>${termin.kunde_telefon || '-'}</td>
        <td>${termin.kennzeichen || '-'}</td>
        <td>${termin.arbeit || '-'}</td>
        <td>${termin.umfang || '-'}</td>
        <td>${abholungTypText}</td>
        <td>${termin.bring_zeit || '-'}</td>
        <td>${termin.abholung_zeit || '-'}</td>
        <td>${termin.kontakt_option || '-'}</td>
        <td>${termin.kilometerstand || '-'}</td>
        <td>${termin.ersatzauto ? 'Ja' : 'Nein'}</td>
        <td>${zeitAnzeige} ${zeitAnzeige !== '-' ? 'Min' : ''}</td>
        <td><span class="status-badge ${statusClass}">${termin.status || 'geplant'}</span></td>
        <td>
          <button class="btn btn-edit" onclick="app.showTerminDetails(${termin.id})">Details</button>
        </td>
      `;
    });
  }

  renderHeuteKarten(termine) {
    const kartenGrid = document.getElementById('heuteKartenGrid');
    if (!kartenGrid) return;

    kartenGrid.innerHTML = '';

    if (termine.length === 0) {
      kartenGrid.innerHTML = '<div class="loading">Keine Termine für heute</div>';
      return;
    }

    termine.forEach(termin => {
      const statusClass = `status-${termin.status || 'geplant'}`;
      const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || '-';
      const abholungTypText = {
        'bringen': 'Kunde bringt/holt selbst',
        'hol_bring': 'Hol- und Bringservice',
        'ruecksprache': 'Telefonische Rücksprache',
        'warten': 'Kunde wartet'
      }[termin.abholung_typ] || termin.abholung_typ || '-';

      const karte = document.createElement('div');
      karte.className = 'heute-karte';
      karte.innerHTML = `
        <div class="heute-karte-header">
          <div class="heute-karte-nr"><strong>${termin.termin_nr || '-'}</strong></div>
          <span class="status-badge ${statusClass}">${termin.status || 'geplant'}</span>
        </div>
        <div class="heute-karte-body">
          <div class="heute-karte-section">
            <h4>Kunde</h4>
            <p><strong>Name:</strong> ${termin.kunde_name || '-'}</p>
            <p><strong>Telefon:</strong> ${termin.kunde_telefon || '-'}</p>
          </div>
          <div class="heute-karte-section">
            <h4>Fahrzeug</h4>
            <p><strong>Kennzeichen:</strong> ${termin.kennzeichen || '-'}</p>
            <p><strong>Kilometerstand:</strong> ${termin.kilometerstand || '-'}</p>
            <p><strong>Ersatzauto:</strong> ${termin.ersatzauto ? 'Ja' : 'Nein'}</p>
          </div>
          <div class="heute-karte-section">
            <h4>Reparatur</h4>
            <p><strong>Arbeit(en):</strong> ${termin.arbeit || '-'}</p>
            <p><strong>Umfang/Details:</strong> ${termin.umfang || '-'}</p>
            <p><strong>Zeit:</strong> ${zeitAnzeige} ${zeitAnzeige !== '-' ? 'Min' : ''}</p>
          </div>
          <div class="heute-karte-section">
            <h4>Abholung/Bringservice</h4>
            <p><strong>Typ:</strong> ${abholungTypText}</p>
            ${termin.abholung_details ? `<p><strong>Details:</strong> ${termin.abholung_details}</p>` : ''}
            ${termin.bring_zeit ? `<p><strong>Bringzeit:</strong> ${termin.bring_zeit}</p>` : ''}
            ${termin.abholung_zeit ? `<p><strong>Abholzeit:</strong> ${termin.abholung_zeit}</p>` : ''}
            ${termin.kontakt_option ? `<p><strong>Kontakt:</strong> ${termin.kontakt_option}</p>` : ''}
          </div>
        </div>
        <div class="heute-karte-footer">
          <button class="btn btn-edit" onclick="app.showTerminDetails(${termin.id})">Details anzeigen</button>
        </div>
      `;
      kartenGrid.appendChild(karte);
    });
  }

  handleHeuteViewSwitch(viewType) {
    const tabellenContainer = document.getElementById('heuteTabellenContainer');
    const kartenContainer = document.getElementById('heuteKartenContainer');
    const tabellenBtn = document.getElementById('heuteTabellenAnsicht');
    const kartenBtn = document.getElementById('heuteKartenAnsicht');

    if (viewType === 'tabelle') {
      if (tabellenContainer) tabellenContainer.style.display = 'block';
      if (kartenContainer) kartenContainer.style.display = 'none';
      if (tabellenBtn) {
        tabellenBtn.classList.remove('btn-secondary');
        tabellenBtn.classList.add('btn-primary');
      }
      if (kartenBtn) {
        kartenBtn.classList.remove('btn-primary');
        kartenBtn.classList.add('btn-secondary');
      }
    } else {
      if (tabellenContainer) tabellenContainer.style.display = 'none';
      if (kartenContainer) kartenContainer.style.display = 'block';
      if (tabellenBtn) {
        tabellenBtn.classList.remove('btn-primary');
        tabellenBtn.classList.add('btn-secondary');
      }
      if (kartenBtn) {
        kartenBtn.classList.remove('btn-secondary');
        kartenBtn.classList.add('btn-primary');
      }
    }
  }

  async loadWochenUebersicht() {
    try {
      const allTermine = await TermineService.getAll();
      const weekDays = this.getWeekDays();
      const today = new Date().toISOString().split('T')[0];

      for (const [index, day] of weekDays.entries()) {
        const dayName = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag'][index];
        const card = document.getElementById(dayName);

        if (!card) continue;

        const termineForDay = allTermine.filter(t => t.datum === day.datum);
        const auslastung = await AuslastungService.getByDatum(day.datum);

        card.querySelector('.wochentag-datum').textContent = day.formatted;
        card.querySelector('.wochentag-termine').textContent = `${termineForDay.length} Termine`;

        const progressFill = card.querySelector('.mini-progress-fill');
        progressFill.style.width = `${Math.min(auslastung.auslastung_prozent, 100)}%`;

        if (day.datum === today) {
          card.classList.add('heute');
        } else {
          card.classList.remove('heute');
        }
      }
    } catch (error) {
      console.error('Fehler beim Laden der Wochenübersicht:', error);
    }
  }

  getNextDays(count = 30) {
    const days = [];
    const start = new Date();
    start.setHours(12, 0, 0, 0); // stabil gegen Zeitzonen/DST
    // Starte ab dem nächsten/aktuellen Montag (nicht in der Vergangenheit)
    while (start.getDay() !== 1) {
      start.setDate(start.getDate() + 1);
    }
    let offset = 0;

    while (days.length < count && offset < 90) {
      const day = new Date(start);
      day.setDate(start.getDate() + offset);
      offset += 1;

      // Überspringe Sonntag
      if (day.getDay() === 0) {
        continue;
      }

      days.push({
        datum: day.toISOString().split('T')[0],
        formatted: day.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
        weekday: day.toLocaleDateString('de-DE', { weekday: 'short' })
      });
    }
    return days;
  }

  async loadMonatsUebersicht() {
    const container = document.getElementById('monatsUebersicht');
    if (!container) return;

    container.innerHTML = '<div class="loading">Monatsübersicht wird geladen...</div>';

    try {
      const allTermine = await TermineService.getAll();
      const days = this.getNextDays(30);
      const today = new Date().toISOString().split('T')[0];

      const auslastungPromises = days.map(day =>
        AuslastungService.getByDatum(day.datum).catch(() => ({ auslastung_prozent: 0 }))
      );
      const auslastungen = await Promise.all(auslastungPromises);

      container.innerHTML = '';
      days.forEach((day, index) => {
        const termineForDay = allTermine.filter(t => t.datum === day.datum);
        const auslastung = auslastungen[index] || { auslastung_prozent: 0 };

        const card = document.createElement('div');
        card.className = 'monats-card';
        if (day.datum === today) {
          card.classList.add('heute');
        }

        card.innerHTML = `
          <div class="monats-datum">
            <span class="monats-wochentag">${day.weekday}</span>
            <span class="monats-tag">${day.formatted}</span>
          </div>
          <div class="monats-termine">${termineForDay.length} Termine</div>
          <div class="mini-progress-bar">
            <div class="mini-progress-fill" style="width:${Math.min(auslastung.auslastung_prozent, 100)}%"></div>
          </div>
        `;

        container.appendChild(card);
      });
    } catch (error) {
      console.error('Fehler beim Laden der Monatsübersicht:', error);
      container.innerHTML = '<div class="loading">Monatsübersicht konnte nicht geladen werden</div>';
    }
  }

  updateTerminSuchliste() {
    const liste = document.getElementById('terminSuchListe');
    if (!liste) return;

    const optionen = [];
    const seen = new Set();

    (this.kundenCache || []).forEach(kunde => {
      if (kunde.name && !seen.has(kunde.name.toLowerCase())) {
        optionen.push({ value: kunde.name, label: `Kunde: ${kunde.name}` });
        seen.add(kunde.name.toLowerCase());
      }
    });

    (this.termineCache || []).forEach(termin => {
      if (termin.kennzeichen && !seen.has(termin.kennzeichen.toLowerCase())) {
        optionen.push({ value: termin.kennzeichen, label: `Kennzeichen: ${termin.kennzeichen}` });
        seen.add(termin.kennzeichen.toLowerCase());
      }
    });

    liste.innerHTML = '';
    optionen.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.label = opt.label;
      liste.appendChild(option);
    });
  }

  handleTerminSchnellsuche() {
    const eingabe = document.getElementById('terminSchnellsuche').value.trim();
    if (!eingabe) return;

    const lower = eingabe.toLowerCase();
    const kundeMatch = (this.kundenCache || []).find(kunde => kunde.name && kunde.name.toLowerCase() === lower);
    if (kundeMatch) {
      document.getElementById('kunde_id').value = kundeMatch.id;
      document.getElementById('neuer_kunde_telefon').value = kundeMatch.telefon || '';

      const letztesKennzeichen = this.findLetztesKennzeichen(kundeMatch.id, kundeMatch.name);
      if (letztesKennzeichen) {
        document.getElementById('kennzeichen').value = letztesKennzeichen;

        // Finde und zeige letzten KM-Stand als Hinweis (grau)
        const letzterKmStand = this.findLetztenKmStand(kundeMatch.id, kundeMatch.name, letztesKennzeichen);
        const kmStandInput = document.getElementById('kilometerstand');
        if (letzterKmStand && kmStandInput) {
          kmStandInput.value = ''; // Leeres value - wird nicht submitted
          kmStandInput.placeholder = `Letzter KM-Stand: ${letzterKmStand.toLocaleString('de-DE')} km`;
          kmStandInput.classList.add('has-previous-value');
        }
      }
      return;
    }

    const terminMatch = (this.termineCache || []).find(termin =>
      termin.kennzeichen && termin.kennzeichen.toLowerCase() === lower
    );
    if (terminMatch) {
      document.getElementById('kennzeichen').value = terminMatch.kennzeichen;
      if (terminMatch.kunde_id && this.kundenCache.length > 0) {
        const kunde = this.kundenCache.find(k => k.id === terminMatch.kunde_id);
        if (kunde) {
          document.getElementById('kunde_id').value = kunde.id;
          document.getElementById('neuer_kunde_telefon').value = kunde.telefon || '';

          // Finde und zeige letzten KM-Stand als Hinweis (grau)
          const letzterKmStand = this.findLetztenKmStand(kunde.id, kunde.name, terminMatch.kennzeichen);
          const kmStandInput = document.getElementById('kilometerstand');
          if (letzterKmStand && kmStandInput) {
            kmStandInput.value = ''; // Leeres value - wird nicht submitted
            kmStandInput.placeholder = `Letzter KM-Stand: ${letzterKmStand.toLocaleString('de-DE')} km`;
            kmStandInput.classList.add('has-previous-value');
          }
        }
      } else if (terminMatch.kunde_name) {
        document.getElementById('kunde_id').value = '';
        document.getElementById('terminSchnellsuche').value = terminMatch.kunde_name;
      }
      return;
    }

    const siehtWieKennzeichenAus = /\d/.test(eingabe) || eingabe.includes('-');
    if (siehtWieKennzeichenAus) {
      document.getElementById('kennzeichen').value = eingabe;
      document.getElementById('kunde_id').value = '';
      document.getElementById('terminSchnellsuche').value = '';
    } else {
      document.getElementById('kunde_id').value = '';
      document.getElementById('terminSchnellsuche').value = eingabe;
    }
  }

  findLetztesKennzeichen(kundeId, kundeName) {
    const termine = (this.termineCache || []).filter(t => {
      if (kundeId && t.kunde_id) {
        return t.kunde_id === kundeId;
      }
      return kundeName && t.kunde_name && t.kunde_name === kundeName;
    });

    if (termine.length === 0) return null;

    let letztes = termine[0];
    termine.forEach(t => {
      if (new Date(t.datum) > new Date(letztes.datum)) {
        letztes = t;
      }
    });
    return letztes.kennzeichen;
  }

  findLetztenKmStand(kundeId, kundeName, kennzeichen) {
    const termine = (this.termineCache || []).filter(t => {
      // Filter nach Kunde UND Kennzeichen für präzisere Ergebnisse
      const kundeMatch = (kundeId && t.kunde_id === kundeId) ||
                         (kundeName && t.kunde_name === kundeName);
      const kennzeichenMatch = kennzeichen && t.kennzeichen &&
                               t.kennzeichen.toLowerCase() === kennzeichen.toLowerCase();

      return kundeMatch && kennzeichenMatch && t.kilometerstand;
    });

    if (termine.length === 0) return null;

    // Finde den neuesten Termin mit KM-Stand
    let letztes = termine[0];
    termine.forEach(t => {
      if (new Date(t.datum) > new Date(letztes.datum)) {
        letztes = t;
      }
    });

    return letztes.kilometerstand;
  }

  async ensureArbeitenExistieren(arbeitenListe, totalMinuten) {
    const durchschnitt = arbeitenListe.length > 0 ? Math.max(Math.floor((Number(totalMinuten) || 0) / arbeitenListe.length), 1) : 30;
    for (const arbeit of arbeitenListe) {
      const existiert = (this.arbeitszeiten || []).some(a => a.bezeichnung.toLowerCase() === arbeit.toLowerCase());
      if (existiert) continue;
      const matchZeit = this.findArbeitszeit(arbeit);
      const standardMinuten = Number.isFinite(matchZeit) ? matchZeit : durchschnitt || 30;
      try {
        await ArbeitszeitenService.create({ bezeichnung: arbeit, standard_minuten: standardMinuten });
      } catch (error) {
        console.error('Fehler beim Anlegen der neuen Arbeit:', error);
      }
    }
    await this.loadArbeitszeiten();
  }

  async updateTerminZeit(terminId) {
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

  async loadWerkstattSettings() {
    try {
      const einstellungen = await EinstellungenService.getWerkstatt();
      this.prefillWerkstattSettings(einstellungen);
    } catch (error) {
      console.error('Fehler beim Laden der Werkstatt-Einstellungen:', error);
    }

    // Server-Konfiguration laden
    const serverConfig = CONFIG.getServerConfig();
    document.getElementById('server_ip').value = serverConfig.ip;
    document.getElementById('server_port').value = serverConfig.port;
    document.getElementById('currentServerUrl').textContent = serverConfig.url;
  }

  prefillWerkstattSettings(einstellungen) {
    if (!einstellungen) return;
    document.getElementById('mitarbeiter_anzahl').value = einstellungen.mitarbeiter_anzahl || 1;
    document.getElementById('arbeitsstunden_pro_tag').value = einstellungen.arbeitsstunden_pro_tag || 8;
  }

  async loadAbwesenheit() {
    const datum = document.getElementById('abwesenheitDatum').value;
    if (!datum) return;

    try {
      const data = await EinstellungenService.getAbwesenheit(datum);
      this.prefillAbwesenheit(datum, data);
      // sync mit Auslastungs-Datum, wenn gleich
      const auslastungDatum = document.getElementById('auslastungDatum').value;
      if (auslastungDatum === datum) {
        this.loadAuslastung();
      }
    } catch (error) {
      console.error('Fehler beim Laden der Abwesenheit:', error);
    }
  }

  prefillAbwesenheit(datum, abwesenheit) {
    if (!abwesenheit) return;
    const abwesenheitDatum = document.getElementById('abwesenheitDatum');
    if (abwesenheitDatum && !abwesenheitDatum.value) {
      abwesenheitDatum.value = datum;
    }
    document.getElementById('abwesenheitUrlaub').value = abwesenheit.urlaub || 0;
    document.getElementById('abwesenheitKrank').value = abwesenheit.krank || 0;
  }

  async handleAbwesenheitSubmit(e) {
    e.preventDefault();
    const datum = document.getElementById('abwesenheitDatum').value;
    const urlaub = parseInt(document.getElementById('abwesenheitUrlaub').value, 10) || 0;
    const krank = parseInt(document.getElementById('abwesenheitKrank').value, 10) || 0;

    try {
      await EinstellungenService.updateAbwesenheit(datum, { urlaub, krank });
      alert('Abwesenheit gespeichert.');
      if (datum === document.getElementById('auslastungDatum').value) {
        this.loadAuslastung();
      }
      this.loadDashboard();
    } catch (error) {
      console.error('Fehler beim Speichern der Abwesenheit:', error);
      alert('Abwesenheit konnte nicht gespeichert werden.');
    }
  }

  getGeschaetzteZeit(arbeitenListe) {
    const zeitFeld = document.getElementById('geschaetzte_zeit');
    const input = zeitFeld ? zeitFeld.value : null;
    const inputMinuten = input ? parseInt(input, 10) : null;
    if (Number.isFinite(inputMinuten) && inputMinuten > 0) {
      return inputMinuten;
    }

    let summe = 0;
    arbeitenListe.forEach(arbeit => {
      const matchZeit = this.findArbeitszeit(arbeit);
      if (Number.isFinite(matchZeit)) {
        summe += matchZeit;
      } else {
        summe += 30;
      }
    });

    return summe > 0 ? summe : 30;
  }

  findArbeitszeit(arbeitName) {
    const match = (this.arbeitszeiten || []).find(a => a.bezeichnung.toLowerCase() === arbeitName.toLowerCase());
    return match ? match.standard_minuten : null;
  }

  parseArbeiten(text) {
    // Teile nach Zeilenumbruch ODER Komma
    return text
      .split(/[\r\n,]+/)
      .map(t => t.trim())
      .filter(Boolean);
  }

  formatMinutesToHours(minuten) {
    const hours = (Number(minuten) || 0) / 60;
    return `${hours.toFixed(1)} h`;
  }

  async handleWerkstattSettingsSubmit(e) {
    e.preventDefault();

    const mitarbeiter = parseInt(document.getElementById('mitarbeiter_anzahl').value, 10);
    const stunden = parseInt(document.getElementById('arbeitsstunden_pro_tag').value, 10);

    if (!mitarbeiter || !stunden) {
      alert('Bitte Mitarbeiteranzahl und Arbeitsstunden ausfüllen.');
      return;
    }

    try {
      await EinstellungenService.updateWerkstatt({
        mitarbeiter_anzahl: mitarbeiter,
        arbeitsstunden_pro_tag: stunden
      });
      alert('Einstellungen gespeichert.');
      this.loadAuslastung();
      this.loadDashboard();
    } catch (error) {
      console.error('Fehler beim Speichern der Einstellungen:', error);
      alert('Einstellungen konnten nicht gespeichert werden.');
    }
  }

  handleServerConfigSubmit(e) {
    e.preventDefault();

    const ip = document.getElementById('server_ip').value.trim();
    const port = document.getElementById('server_port').value.trim();

    if (!ip || !port) {
      alert('Bitte IP-Adresse und Port eingeben.');
      return;
    }

    CONFIG.setServerConfig(ip, port);
  }

  async testConnection() {
    const statusDiv = document.getElementById('connectionStatus');
    statusDiv.textContent = 'Verbindung wird getestet...';
    statusDiv.style.color = 'blue';

    try {
      // Use the /health endpoint for a clean 200 OK
      const healthCheckUrl = CONFIG.API_URL.endsWith('/api') 
        ? CONFIG.API_URL.slice(0, -4) + '/api/health' 
        : CONFIG.API_URL + '/health';
      const response = await fetch(healthCheckUrl);
      
      if (response.ok) {
        statusDiv.textContent = '✓ Verbindung erfolgreich!';
        statusDiv.style.color = 'green';
      } else {
        statusDiv.textContent = '✗ Verbindung fehlgeschlagen (Status: ' + response.status + ')';
        statusDiv.style.color = 'red';
      }
    } catch (error) {
      statusDiv.textContent = '✗ Verbindung fehlgeschlagen: ' + error.message;
      statusDiv.style.color = 'red';
    }
  }

  getWeekStart() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    return monday.toISOString().split('T')[0];
  }

  getWeekEnd() {
    const weekStart = new Date(this.getWeekStart());
    const friday = new Date(weekStart);
    friday.setDate(weekStart.getDate() + 4);
    return friday.toISOString().split('T')[0];
  }

  openArbeitszeitenModal(terminId) {
    const termin = this.termineById[terminId];
    if (!termin) {
      alert('Termin nicht gefunden');
      return;
    }

    this.currentTerminId = terminId;
    const arbeitenListe = this.parseArbeiten(termin.arbeit || '');

    document.getElementById('modalTerminInfo').textContent =
      `${termin.termin_nr || '-'} - ${termin.kunde_name} - ${termin.datum}`;

    // Status vorauswählen
    document.getElementById('modalTerminStatus').value = termin.status || 'geplant';

    const liste = document.getElementById('modalArbeitszeitenListe');
    liste.innerHTML = '';

    // Berechne Standardzeit pro Arbeit
    const gesamtzeit = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;
    const zeitProArbeit = arbeitenListe.length > 0 ? Math.round(gesamtzeit / arbeitenListe.length) : 30;

    arbeitenListe.forEach((arbeit, index) => {
      const standardZeitMinuten = this.findArbeitszeit(arbeit) || zeitProArbeit;
      const standardZeitStunden = (standardZeitMinuten / 60).toFixed(2);

      const item = document.createElement('div');
      item.className = 'arbeitszeit-item';
      item.innerHTML = `
        <label>📋 ${arbeit}:</label>
        <input type="number"
               id="modal_zeit_${index}"
               value="${standardZeitStunden}"
               min="0.25"
               step="0.25"
               placeholder="0"
               onchange="app.updateModalGesamtzeit()"
               onfocus="this.select()">
      `;
      liste.appendChild(item);
    });

    this.updateModalGesamtzeit();
    document.getElementById('arbeitszeitenModal').style.display = 'block';
  }

  closeArbeitszeitenModal() {
    document.getElementById('arbeitszeitenModal').style.display = 'none';
    this.currentTerminId = null;
  }

  updateModalGesamtzeit() {
    const liste = document.getElementById('modalArbeitszeitenListe');
    const inputs = liste.querySelectorAll('input[type="number"]');
    let gesamtStunden = 0;

    inputs.forEach(input => {
      gesamtStunden += parseFloat(input.value) || 0;
    });

    document.getElementById('modalGesamtzeit').textContent = gesamtStunden.toFixed(2) + ' h';
  }

  async saveArbeitszeitenModal() {
    if (!this.currentTerminId) {
      alert('Kein Termin ausgewählt');
      return;
    }

    const liste = document.getElementById('modalArbeitszeitenListe');
    const inputs = liste.querySelectorAll('input[type="number"]');
    let gesamtStunden = 0;

    inputs.forEach(input => {
      gesamtStunden += parseFloat(input.value) || 0;
    });

    // Umrechnung von Stunden in Minuten für die Datenbank
    const gesamtzeitMinuten = Math.round(gesamtStunden * 60);

    const status = document.getElementById('modalTerminStatus').value;

    try {
      await TermineService.update(this.currentTerminId, {
        tatsaechliche_zeit: gesamtzeitMinuten,
        status: status
      });

      this.closeArbeitszeitenModal();
      this.loadTermine();
      this.loadDashboard();
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern der Zeiten & Status');
    }
  }

  updateDashboardAuslastung(data) {
    // Zeige die Zeiten nach Status
    document.getElementById('dashboardGeplant').textContent = this.formatMinutesToHours(data.geplant_minuten || 0);
    document.getElementById('dashboardInArbeit').textContent = this.formatMinutesToHours(data.in_arbeit_minuten || 0);
    document.getElementById('dashboardAbgeschlossen').textContent = this.formatMinutesToHours(data.abgeschlossen_minuten || 0);
    document.getElementById('dashboardVerfuegbar').textContent = this.formatMinutesToHours(data.verfuegbar_minuten);

    if (data.gesamt_minuten) {
      document.getElementById('dashboardVerfuegbar').textContent =
        `${this.formatMinutesToHours(data.verfuegbar_minuten)} (${this.formatMinutesToHours(data.gesamt_minuten)} gesamt)`;
    }

    // Berechne Prozentanteile für die Segmente
    const gesamtMinuten = data.gesamt_minuten || 1;
    const geplantProzent = ((data.geplant_minuten || 0) / gesamtMinuten) * 100;
    const inArbeitProzent = ((data.in_arbeit_minuten || 0) / gesamtMinuten) * 100;
    const abgeschlossenProzent = ((data.abgeschlossen_minuten || 0) / gesamtMinuten) * 100;

    // Setze die Breite der Segmente
    const geplantSegment = document.getElementById('dashboardProgressGeplant');
    const inArbeitSegment = document.getElementById('dashboardProgressInArbeit');
    const abgeschlossenSegment = document.getElementById('dashboardProgressAbgeschlossen');

    if (geplantSegment && inArbeitSegment && abgeschlossenSegment) {
      geplantSegment.style.width = `${Math.min(geplantProzent, 100)}%`;
      inArbeitSegment.style.width = `${Math.min(inArbeitProzent, 100)}%`;
      abgeschlossenSegment.style.width = `${Math.min(abgeschlossenProzent, 100)}%`;

      // Zeige oder verstecke den "Keine Termine" Text
      const emptyText = document.getElementById('dashboardProgressEmpty');
      if (emptyText) {
        const hasTermine = (data.geplant_minuten || 0) + (data.in_arbeit_minuten || 0) + (data.abgeschlossen_minuten || 0) > 0;
        emptyText.style.display = hasTermine ? 'none' : 'block';
      }

      // Optional: Zeige Prozent-Text in den Segmenten
      if (geplantProzent > 10) {
        geplantSegment.textContent = `${Math.round(geplantProzent)}%`;
      } else {
        geplantSegment.textContent = '';
      }

      if (inArbeitProzent > 10) {
        inArbeitSegment.textContent = `${Math.round(inArbeitProzent)}%`;
      } else {
        inArbeitSegment.textContent = '';
      }

      if (abgeschlossenProzent > 10) {
        abgeschlossenSegment.textContent = `${Math.round(abgeschlossenProzent)}%`;
      } else {
        abgeschlossenSegment.textContent = '';
      }
    }
  }

  handleArbeitAutocomplete(e) {
    const textarea = e.target;
    const text = textarea.value;
    const cursorPos = textarea.selectionStart;

    // Finde die aktuelle Zeile
    const beforeCursor = text.substring(0, cursorPos);
    const lines = beforeCursor.split('\n');
    const currentLine = lines[lines.length - 1].trim();

    if (currentLine.length < 2) {
      this.closeAutocomplete();
      return;
    }

    // Filtere passende Arbeiten
    const matches = this.arbeitszeiten.filter(arbeit =>
      arbeit.bezeichnung.toLowerCase().includes(currentLine.toLowerCase())
    );

    if (matches.length === 0) {
      this.closeAutocomplete();
      return;
    }

    this.showAutocomplete(matches, currentLine);
  }

  showAutocomplete(matches, currentText) {
    const dropdown = document.getElementById('arbeitAutocomplete');
    dropdown.innerHTML = '';
    this.autocompleteSelectedIndex = -1;

    matches.forEach((arbeit, index) => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.textContent = arbeit.bezeichnung;
      item.dataset.index = index;

      item.addEventListener('click', () => {
        this.selectAutocompleteItem(arbeit.bezeichnung);
      });

      dropdown.appendChild(item);
    });

    dropdown.classList.add('show');
    this.currentAutocompleteMatches = matches;
  }

  handleArbeitKeydown(e) {
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
  }

  updateAutocompleteSelection(items) {
    items.forEach((item, index) => {
      if (index === this.autocompleteSelectedIndex) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
  }

  selectAutocompleteItem(bezeichnung) {
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
  }

  closeAutocomplete() {
    const dropdown = document.getElementById('arbeitAutocomplete');
    if (dropdown) {
      dropdown.classList.remove('show');
      dropdown.innerHTML = '';
    }
    this.autocompleteSelectedIndex = -1;
    this.currentAutocompleteMatches = [];
  }

  formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    return date.toLocaleString('de-DE');
  }

  async loadBackupStatus() {
    try {
      const data = await BackupService.status();
      const dbPathEl = document.getElementById('backupDbPath');
      const dirEl = document.getElementById('backupDirPath');
      const sizeEl = document.getElementById('backupDbSize');
      const lastEl = document.getElementById('backupLast');

      if (dbPathEl) dbPathEl.textContent = data.dbPath || '-';
      if (dirEl) dirEl.textContent = data.backupDir || '-';
      if (sizeEl) sizeEl.textContent = this.formatBytes(data.dbSizeBytes);
      if (lastEl) {
        lastEl.textContent = data.lastBackup
          ? `${this.formatDate(data.lastBackup.createdAt)} (${this.formatBytes(data.lastBackup.sizeBytes)})`
          : 'Kein Backup vorhanden';
      }
    } catch (error) {
      console.error('Backup Status Fehler:', error);
      alert('Backup-Status konnte nicht geladen werden.');
    }
  }

  async loadBackupList() {
    try {
      const tbody = document.getElementById('backupTableBody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="4" class="loading">Backups werden geladen...</td></tr>';

      const data = await BackupService.list();
      const backups = data.backups || [];

      if (backups.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading">Noch keine Backups vorhanden</td></tr>';
        return;
      }

      tbody.innerHTML = '';
      backups.forEach(backup => {
        const row = tbody.insertRow();
        const downloadUrl = `${CONFIG.API_URL}/backup/download/${encodeURIComponent(backup.name)}`;
        row.innerHTML = `
          <td>${backup.name}</td>
          <td>${this.formatBytes(backup.sizeBytes)}</td>
          <td>${this.formatDate(backup.createdAt)}</td>
          <td class="dashboard-action-cell">
            <div class="dashboard-action-grid">
              <button class="btn btn-secondary" onclick="window.open('${downloadUrl}', '_blank')">Download</button>
              <button class="btn btn-primary" data-backup-restore="${backup.name}">Backup laden</button>
            </div>
          </td>
        `;
      });
    } catch (error) {
      console.error('Backup Liste Fehler:', error);
      alert('Backups konnten nicht geladen werden.');
    }
  }

  async handleCreateBackup() {
    const btn = document.getElementById('createBackupBtn');
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Erstelle...';
      }
      await BackupService.create();
      await this.loadBackupStatus();
      await this.loadBackupList();
    } catch (error) {
      console.error('Backup erstellen Fehler:', error);
      alert('Backup konnte nicht erstellt werden.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Backup erstellen';
      }
    }
  }

  async handleRestoreBackup(filename) {
    if (!filename) return;
    const confirmRestore = confirm(`Backup "${filename}" einspielen? Die aktuelle Datenbank wird überschrieben.`);
    if (!confirmRestore) return;

    try {
      await BackupService.restore(filename);
      await this.loadBackupStatus();
      alert('Backup wurde eingespielt. Bitte Anwendung neu laden, falls Daten nicht sofort sichtbar sind.');
      this.loadDashboard();
      this.loadKunden();
      this.loadTermine();
    } catch (error) {
      console.error('Backup Restore Fehler:', error);
      alert('Backup konnte nicht eingespielt werden.');
    }
  }

  async handleUploadAndRestore() {
    const uploadInput = document.getElementById('backupUploadInput');
    const uploadName = document.getElementById('backupUploadName');
    if (!uploadInput || !uploadInput.files || uploadInput.files.length === 0) {
      alert('Bitte zuerst eine Backup-Datei auswählen.');
      return;
    }
    const file = uploadInput.files[0];
    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const base64 = reader.result.split(',')[1];
        await BackupService.upload({ filename: file.name, fileBase64: base64, restoreNow: true });
        await this.loadBackupStatus();
        await this.loadBackupList();
        alert('Backup hochgeladen und eingespielt. Anwendung ggf. neu laden, falls Daten nicht sofort sichtbar sind.');
        this.loadDashboard();
        this.loadKunden();
        this.loadTermine();
      } catch (error) {
        console.error('Backup Upload Fehler:', error);
        alert('Backup konnte nicht hochgeladen/geladen werden.');
      }
    };

    reader.readAsDataURL(file);
    if (uploadName) uploadName.textContent = 'Keine Datei ausgewählt';
    uploadInput.value = '';
  }

  getWeekDays() {
    const weekStart = new Date(this.getWeekStart());
    const days = [];

    for (let i = 0; i < 5; i++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      days.push({
        datum: day.toISOString().split('T')[0],
        formatted: day.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
      });
    }

    return days;
  }
}

const app = new App();
