class App {
  constructor() {
    this.kundenCache = [];
    this.arbeitszeiten = [];
    this.termineCache = [];
    this.termineById = {};
    this.autocompleteSelectedIndex = -1;
    this.uhrzeitInterval = null;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadInitialData();
    this.setTodayDate();
    this.setInternerTerminTodayDate();
    this.loadInternerTerminMitarbeiter();
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
    document.getElementById('internerTerminForm').addEventListener('submit', (e) => this.handleInternerTerminSubmit(e));
    document.getElementById('kundenForm').addEventListener('submit', (e) => this.handleKundenSubmit(e));
    document.getElementById('zeitAnpassungForm').addEventListener('submit', (e) => this.handleZeitAnpassungSubmit(e));
    document.getElementById('serverConfigForm').addEventListener('submit', (e) => this.handleServerConfigSubmit(e));
    document.getElementById('werkstattSettingsForm').addEventListener('submit', (e) => this.handleWerkstattSettingsSubmit(e));

    // Neue Abwesenheiten-Formulare
    document.getElementById('urlaubForm').addEventListener('submit', (e) => this.handleUrlaubSubmit(e));
    document.getElementById('krankForm').addEventListener('submit', (e) => this.handleKrankSubmit(e));

    const arbeitEingabe = document.getElementById('arbeitEingabe');
    if (arbeitEingabe) {
      arbeitEingabe.addEventListener('input', (e) => {
        this.updateZeitschaetzung();
        this.handleArbeitAutocomplete(e);
        this.validateTerminEchtzeit();
      });
      arbeitEingabe.addEventListener('keydown', (e) => this.handleArbeitKeydown(e));
    }
    document.getElementById('filterDatum').addEventListener('change', () => {
      this.loadTermine();
      this.updateZeitverwaltungDatumAnzeige();
    });
    document.getElementById('alleTermineBtn').addEventListener('click', () => this.showAllTermine());
    document.getElementById('auslastungDatum').addEventListener('change', () => this.loadAuslastung());

    // Zeitverwaltung Navigation Buttons
    document.getElementById('prevDayBtn').addEventListener('click', () => this.navigateZeitverwaltung(-1, 'day'));
    document.getElementById('nextDayBtn').addEventListener('click', () => this.navigateZeitverwaltung(1, 'day'));
    document.getElementById('prevWeekBtn').addEventListener('click', () => this.navigateZeitverwaltung(-7, 'week'));
    document.getElementById('nextWeekBtn').addEventListener('click', () => this.navigateZeitverwaltung(7, 'week'));
    document.getElementById('todayBtn').addEventListener('click', () => this.goToToday());
    document.getElementById('offeneTermineBtn').addEventListener('click', () => this.showOffeneTermine());

    // Event-Listener für 7-Tage-Limit bei Krankmeldungen
    document.getElementById('krankVonDatum').addEventListener('change', () => this.validateKrankDatum());
    document.getElementById('krankBisDatum').addEventListener('change', () => this.validateKrankDatum());
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

    // Kunden-Suche Event-Listener
    const kundenSearchInput = document.getElementById('kundenSearchInput');
    const kundenSearchBtn = document.getElementById('kundenSearchBtn');
    if (kundenSearchInput && kundenSearchBtn) {
      kundenSearchBtn.addEventListener('click', () => this.searchKunden());
      kundenSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.searchKunden();
        }
      });
    }

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
      datumInput.addEventListener('change', () => {
        this.validateTerminEchtzeit();
        this.loadTerminAuslastungAnzeige();
      });
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
    this.loadTerminAuslastungAnzeige();
  }

  setInternerTerminTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    const internDatum = document.getElementById('intern_datum');
    if (internDatum) {
      internDatum.value = today;
    }
  }

  async loadTerminAuslastungAnzeige() {
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

    } catch (error) {
      console.error('Fehler beim Laden der Auslastung:', error);
      anzeige.style.display = 'none';
    }
  }

  async loadInternerTerminMitarbeiter() {
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

  resetTerminForm() {
    // Formular komplett zurücksetzen
    const form = document.getElementById('terminForm');
    if (form) {
      form.reset();
    }

    // Datum auf heute setzen
    this.setTodayDate();

    // KM-Stand Placeholder und Styling zurücksetzen
    const kmStandInput = document.getElementById('kilometerstand');
    if (kmStandInput) {
      kmStandInput.classList.remove('has-previous-value');
      kmStandInput.placeholder = 'z.B. 128000';
      kmStandInput.value = '';
    }

    // Schnellsuche leeren
    const schnellsuche = document.getElementById('terminSchnellsuche');
    if (schnellsuche) {
      schnellsuche.value = '';
    }

    // Versteckte Felder zurücksetzen
    const kundeId = document.getElementById('kunde_id');
    if (kundeId) {
      kundeId.value = '';
    }

    // Warnung verstecken
    this.hideTerminWarnung();

    // Abholung-Details korrekt anzeigen
    this.toggleAbholungDetails();
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

    if (tabName === 'termine') {
      // Formular komplett zurücksetzen beim Öffnen des Termine-Tabs
      this.resetTerminForm();
      this.setInternerTerminTodayDate();
      this.loadInternerTerminMitarbeiter();
      this.loadTerminAuslastungAnzeige();
    } else if (tabName === 'auslastung') {
      this.loadAuslastung();
    } else if (tabName === 'dashboard') {
      this.loadDashboard();
    } else if (tabName === 'heute') {
      // Stoppe Uhrzeit-Interval wenn von anderem Tab gewechselt wird
      if (this.uhrzeitInterval) {
        clearInterval(this.uhrzeitInterval);
        this.uhrzeitInterval = null;
      }
      this.loadHeuteTermine();
    } else if (tabName === 'einstellungen') {
      this.loadWerkstattSettings();
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

      // Lade Mitarbeiter/Lehrlinge und Abwesenheiten-Daten wenn der Mitarbeiter-Sub-Tab aktiv ist
      const mitarbeiterTabButton = document.querySelector('#zeitverwaltung .sub-tab-button[data-subtab="mitarbeiter"]');
      if (mitarbeiterTabButton && mitarbeiterTabButton.classList.contains('active')) {
        this.loadWerkstattSettings();
        this.loadMitarbeiter();
        this.loadLehrlinge();
        this.loadAbwesenheitenPersonen();
        this.loadUrlaubListe();
      }
    } else if (tabName === 'papierkorb') {
      this.loadPapierkorb();
    } else if (tabName === 'kunden') {
      this.loadKundenSearch();
    }
  }

  handleSubTabChange(e) {
    const subTabName = e.target.dataset.subtab;

    // Finde den direkten Parent-Container der sub-tabs
    const subTabsContainer = e.target.closest('.sub-tabs');
    const parentContainer = subTabsContainer.parentElement;

    // Entferne active nur von Geschwister-Elementen (siblings)
    Array.from(parentContainer.children).forEach(child => {
      if (child.classList.contains('sub-tab-content')) {
        child.classList.remove('active');
      }
    });

    Array.from(subTabsContainer.children).forEach(button => {
      if (button.classList.contains('sub-tab-button')) {
        button.classList.remove('active');
      }
    });

    const targetContent = document.getElementById(subTabName);
    if (targetContent) {
      targetContent.classList.add('active');
    }
    e.target.classList.add('active');

    if (subTabName === 'mitarbeiter') {
      this.loadWerkstattSettings();
      this.loadMitarbeiter();
      this.loadLehrlinge();
      this.loadAbwesenheitenPersonen();
      this.loadUrlaubListe();
    }

    if (subTabName === 'urlaubAbwesenheit') {
      this.loadAbwesenheitenPersonen();
      this.loadUrlaubListe();
    }

    if (subTabName === 'krankAbwesenheit') {
      this.loadAbwesenheitenPersonen();
      this.loadKrankListe();
      this.validateKrankDatum();
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
        const stundenWert = (arbeit.standard_minuten / 60).toFixed(2);
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
                   value="${stundenWert}"
                   min="0.01"
                   step="0.25"
                   placeholder="z.B. 0.25"
                   title="Eingabe in Stunden (z.B. 0.25 = 15 Min, 0.5 = 30 Min, 1 = 60 Min)"
                   style="width: 120px; padding: 8px;">
          </td>
          <td>
            <button class="btn btn-danger delete-arbeitszeit-btn" data-id="${arbeit.id}" style="padding: 6px 12px; font-size: 14px;">🗑️ Löschen</button>
          </td>
        `;
      });

      // Event-Listener für alle Löschen-Buttons hinzufügen
      // Entferne zuerst alle vorhandenen Listener, um Duplikate zu vermeiden
      tbody.querySelectorAll('.delete-arbeitszeit-btn').forEach(btn => {
        // Klone den Button, um alle Event-Listener zu entfernen
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          const idStr = newBtn.dataset.id;
          const id = parseInt(idStr, 10);
          
          if (Number.isFinite(id) && id > 0) {
            this.deleteArbeitszeit(id);
          } else {
            alert('Fehler: Ungültige ID - ' + idStr);
          }
        });
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
    const arbeitEingabe = document.getElementById('arbeitEingabe');
    const zeitschaetzungAnzeige = document.getElementById('zeitschaetzungAnzeige');
    const zeitschaetzungWert = document.getElementById('zeitschaetzungWert');
    const zeitschaetzungDetails = document.getElementById('zeitschaetzungDetails');
    
    if (!arbeitEingabe || !zeitschaetzungAnzeige) return;
    
    const eingabe = arbeitEingabe.value.trim();
    
    // Wenn keine Eingabe, verstecke die Anzeige
    if (!eingabe) {
      zeitschaetzungAnzeige.style.display = 'none';
      return;
    }
    
    // Teile die Eingabe in einzelne Arbeiten auf (nach Zeilenumbruch oder Komma)
    const arbeiten = eingabe
      .split(/[\r\n,]+/)
      .map(a => a.trim())
      .filter(a => a.length > 0);
    
    if (arbeiten.length === 0) {
      zeitschaetzungAnzeige.style.display = 'none';
      return;
    }
    
    // Berechne die Zeiten für jede Arbeit
    let gesamtMinuten = 0;
    const details = [];
    const nichtGefunden = [];
    
    arbeiten.forEach(arbeit => {
      // Suche nach der Arbeit in den Standardzeiten (case-insensitive)
      const gefunden = this.arbeitszeiten.find(
        az => az.bezeichnung.toLowerCase() === arbeit.toLowerCase()
      );
      
      if (gefunden) {
        const minuten = gefunden.standard_minuten || 0;
        gesamtMinuten += minuten;
        
        // Formatiere die Zeit
        const stundenAnteil = Math.floor(minuten / 60);
        const minutenAnteil = minuten % 60;
        let zeitStr = '';
        if (stundenAnteil > 0) {
          zeitStr = `${stundenAnteil} h`;
          if (minutenAnteil > 0) zeitStr += ` ${minutenAnteil} min`;
        } else {
          zeitStr = `${minutenAnteil} min`;
        }
        
        details.push(`✓ ${arbeit}: <strong>${zeitStr}</strong>`);
      } else {
        nichtGefunden.push(arbeit);
        details.push(`⚠️ ${arbeit}: <em>keine Standardzeit hinterlegt</em>`);
      }
    });
    
    // Formatiere die Gesamtzeit in Stunden und Minuten
    const gesamtStunden = Math.floor(gesamtMinuten / 60);
    const gesamtRestMinuten = gesamtMinuten % 60;
    let gesamtZeitStr = '';
    
    if (gesamtMinuten === 0) {
      gesamtZeitStr = '0 min';
    } else if (gesamtStunden === 0) {
      gesamtZeitStr = `${gesamtRestMinuten} min`;
    } else if (gesamtRestMinuten === 0) {
      gesamtZeitStr = `${gesamtStunden} h`;
    } else {
      gesamtZeitStr = `${gesamtStunden} h ${gesamtRestMinuten} min`;
    }
    
    // Zeige auch Dezimalstunden für bessere Übersicht
    const dezimalStunden = (gesamtMinuten / 60).toFixed(2);
    gesamtZeitStr += ` (${dezimalStunden} h)`;
    
    // Aktualisiere die Anzeige
    zeitschaetzungAnzeige.style.display = 'block';
    zeitschaetzungWert.textContent = gesamtZeitStr;
    zeitschaetzungDetails.innerHTML = details.join('<br>');
    
    // Färbe die Gesamtzeit je nach Dauer
    if (gesamtMinuten === 0) {
      zeitschaetzungWert.style.color = '#999';
    } else if (gesamtMinuten <= 60) {
      zeitschaetzungWert.style.color = '#27ae60'; // Grün - kurz
    } else if (gesamtMinuten <= 180) {
      zeitschaetzungWert.style.color = '#4a90e2'; // Blau - mittel
    } else {
      zeitschaetzungWert.style.color = '#e67e22'; // Orange - lang
    }
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
        const stunden = parseFloat(zeitInput.value);

        if (!bezeichnung) {
          alert('Bitte alle Bezeichnungen ausfüllen.');
          hasError = true;
          break;
        }

        if (!Number.isFinite(stunden) || stunden <= 0) {
          alert(`Bitte gültige Stunden für "${bezeichnung}" eingeben (z.B. 0.25 für 15 Minuten).`);
          hasError = true;
          break;
        }

        // Konvertiere Stunden in Minuten
        const minuten = Math.round(stunden * 60);

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

  addArbeitszeit() {
    const tbody = document.getElementById('arbeitszeitenTable').getElementsByTagName('tbody')[0];
    if (!tbody) {
      return;
    }

    // Prüfe, ob bereits eine Eingabezeile existiert
    const existingNewRow = tbody.querySelector('tr.new-arbeitszeit-row');
    if (existingNewRow) {
      alert('Bitte speichern Sie zuerst die bereits hinzugefügte Zeile oder brechen Sie ab.');
      return;
    }

    // Erstelle neue Zeile für Eingabe
    const row = tbody.insertRow(0);
    row.className = 'new-arbeitszeit-row';
    row.style.backgroundColor = '#f0f7ff';
    row.innerHTML = `
      <td>
        <input type="text"
               id="new_bezeichnung"
               placeholder="z.B. Ölwechsel"
               style="width: 100%; min-width: 150px; padding: 8px;"
               required>
      </td>
      <td>
        <input type="number"
               id="new_zeit"
               placeholder="z.B. 0.5"
               min="0.01"
               step="0.25"
               value="0.5"
               title="Eingabe in Stunden (z.B. 0.25 = 15 Min, 0.5 = 30 Min, 1 = 60 Min)"
               style="width: 120px; padding: 8px;"
               required>
      </td>
      <td>
        <button class="btn btn-success save-new-arbeitszeit-btn" style="padding: 6px 12px; font-size: 14px; margin-right: 5px;">💾 Speichern</button>
        <button class="btn btn-secondary cancel-new-arbeitszeit-btn" style="padding: 6px 12px; font-size: 14px;">❌ Abbrechen</button>
      </td>
    `;

    // Event-Listener für Speichern-Button
    const saveBtn = row.querySelector('.save-new-arbeitszeit-btn');
    saveBtn.addEventListener('click', () => {
      this.saveNewArbeitszeit();
    });

    // Event-Listener für Abbrechen-Button
    const cancelBtn = row.querySelector('.cancel-new-arbeitszeit-btn');
    cancelBtn.addEventListener('click', () => {
      this.cancelNewArbeitszeit();
    });

    // Fokus auf Bezeichnungsfeld setzen
    const bezeichnungInput = document.getElementById('new_bezeichnung');
    if (bezeichnungInput) {
      bezeichnungInput.focus();
    }
  }

  async saveNewArbeitszeit() {
    const bezeichnungInput = document.getElementById('new_bezeichnung');
    const zeitInput = document.getElementById('new_zeit');

    if (!bezeichnungInput || !zeitInput) {
      alert('Eingabefelder nicht gefunden');
      return;
    }

    const bezeichnung = bezeichnungInput.value.trim();
    const stunden = parseFloat(zeitInput.value);

    if (!bezeichnung) {
      alert('Bitte geben Sie eine Bezeichnung ein.');
      bezeichnungInput.focus();
      return;
    }

    if (!Number.isFinite(stunden) || stunden <= 0) {
      alert('Bitte eine gültige Zeit in Stunden eingeben (z.B. 0.5 für 30 Minuten).');
      zeitInput.focus();
      return;
    }

    const minuten = Math.round(stunden * 60);

    try {
      await ArbeitszeitenService.create({
        bezeichnung: bezeichnung,
        standard_minuten: minuten
      });
      
      alert('Standardzeit erfolgreich hinzugefügt!');
      await this.loadArbeitszeiten();
    } catch (error) {
      console.error('Fehler beim Hinzufügen:', error);
      alert('Fehler beim Hinzufügen der Standardzeit: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  cancelNewArbeitszeit() {
    const tbody = document.getElementById('arbeitszeitenTable').getElementsByTagName('tbody')[0];
    if (!tbody) return;

    const newRow = tbody.querySelector('tr.new-arbeitszeit-row');
    if (newRow) {
      newRow.remove();
    }
  }

  async deleteArbeitszeit(id) {
    if (!id || !Number.isFinite(id)) {
      alert('Fehler: Ungültige ID');
      return;
    }

    this.performDeleteArbeitszeit(id);
  }

  async performDeleteArbeitszeit(id) {
    try {
      const result = await ArbeitszeitenService.delete(id);
      
      if (result && result.changes === 0) {
        alert('Die Standardzeit wurde nicht gefunden oder konnte nicht gelöscht werden.');
        await this.loadArbeitszeiten();
        return;
      }
      
      alert('Standardzeit erfolgreich gelöscht!');
      await this.loadArbeitszeiten();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      
      let errorMessage = error.message || 'Unbekannter Fehler';
      if (error.status === 404) {
        errorMessage = 'Die Standardzeit wurde nicht gefunden.';
      } else if (error.status === 500) {
        errorMessage = 'Server-Fehler beim Löschen. Bitte versuchen Sie es erneut.';
      }
      
      alert('Fehler beim Löschen der Standardzeit: ' + errorMessage);
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

      // Formular komplett zurücksetzen
      this.resetTerminForm();

      this.loadTermine();
      this.loadDashboard();
      this.loadArbeitszeiten();
      this.loadTermineZeiten();
    } catch (error) {
      console.error('Fehler beim Erstellen des Termins:', error);
      alert('Fehler beim Erstellen des Termins: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

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

    const termin = {
      kunde_name: 'Intern',
      kunde_telefon: null,
      kennzeichen: 'INTERN',
      arbeit: arbeitText,
      umfang: document.getElementById('intern_notizen').value.trim(),
      geschaetzte_zeit: geschaetzteZeit,
      datum: document.getElementById('intern_datum').value,
      abholung_typ: 'warten',
      abholung_details: 'Interner Termin',
      abholung_zeit: null,
      bring_zeit: null,
      kontakt_option: null,
      kilometerstand: null,
      ersatzauto: false,
      mitarbeiter_id: mitarbeiterIdValue
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

      // Formular zurücksetzen
      document.getElementById('internerTerminForm').reset();
      this.setInternerTerminTodayDate();

      this.loadTermine();
      this.loadDashboard();
      this.loadTermineZeiten();
    } catch (error) {
      console.error('Fehler beim Erstellen des internen Termins:', error);
      alert('Fehler beim Erstellen des internen Termins: ' + (error.message || 'Unbekannter Fehler'));
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
          <td>${this.formatZeit(zeitAnzeige)}</td>
          <td>${termin.mitarbeiter_name || '-'}</td>
          <td><span class="status-badge ${statusClass}">${termin.status}</span></td>
          <td class="action-buttons">
            <button class="btn btn-edit" onclick="event.stopPropagation(); app.showTerminDetails(${termin.id})">
              📄 Details
            </button>
            <button class="btn btn-delete" onclick="event.stopPropagation(); app.deleteTermin(${termin.id})" style="margin-left: 5px;">
              🗑️ Löschen
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
      
      // Aktualisiere die Datum-Anzeige
      this.updateZeitverwaltungDatumAnzeige();
    } catch (error) {
      console.error('Fehler beim Laden der Termine:', error);
    }
  }

  showAllTermine() {
    document.getElementById('filterDatum').value = '';
    this.loadTermine();
    this.updateZeitverwaltungDatumAnzeige();
  }

  // Navigation für Zeitverwaltung (überspringt Sonntage)
  navigateZeitverwaltung(days, type) {
    const filterDatum = document.getElementById('filterDatum');
    let currentDate;
    
    if (filterDatum.value) {
      currentDate = new Date(filterDatum.value);
    } else {
      currentDate = new Date();
    }
    
    currentDate.setDate(currentDate.getDate() + days);
    
    // Überspringe Sonntage (0 = Sonntag)
    if (currentDate.getDay() === 0) {
      // Bei Vorwärts-Navigation: gehe zum Montag
      // Bei Rückwärts-Navigation: gehe zum Samstag
      if (days > 0) {
        currentDate.setDate(currentDate.getDate() + 1); // Montag
      } else {
        currentDate.setDate(currentDate.getDate() - 1); // Samstag
      }
    }
    
    filterDatum.value = currentDate.toISOString().split('T')[0];
    this.loadTermine();
    this.updateZeitverwaltungDatumAnzeige();
  }

  goToToday() {
    const filterDatum = document.getElementById('filterDatum');
    let today = new Date();
    
    // Falls heute Sonntag ist, zeige Montag
    if (today.getDay() === 0) {
      today.setDate(today.getDate() + 1);
    }
    
    filterDatum.value = today.toISOString().split('T')[0];
    this.loadTermine();
    this.updateZeitverwaltungDatumAnzeige();
  }

  async showOffeneTermine() {
    // Zeige alle Termine ohne tatsächliche Zeit (offene Termine)
    document.getElementById('filterDatum').value = '';
    
    try {
      const termine = await TermineService.getAll(null);
      
      // Filtere nur Termine ohne tatsächliche Zeit
      const offeneTermine = termine.filter(t => !t.tatsaechliche_zeit || t.tatsaechliche_zeit <= 0);
      
      this.termineCache = termine;
      this.updateTerminSuchliste();
      this.termineById = {};

      const tbody = document.getElementById('termineTable').getElementsByTagName('tbody')[0];
      tbody.innerHTML = '';

      if (offeneTermine.length === 0) {
        const row = tbody.insertRow();
        row.innerHTML = '<td colspan="12" style="text-align: center; padding: 30px; color: #27ae60;">✅ Keine offenen Termine - alle Zeiten sind erfasst!</td>';
      } else {
        offeneTermine.forEach(termin => {
          this.termineById[termin.id] = termin;
          const row = tbody.insertRow();
          const statusClass = `status-${termin.status}`;
          const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;

          const zeitStatusIcon = '🔴';

          row.innerHTML = `
            <td style="text-align: center; font-size: 20px;">${zeitStatusIcon}</td>
            <td><strong>${termin.termin_nr || '-'}</strong></td>
            <td>${termin.datum}</td>
            <td>${termin.kunde_name}</td>
            <td>${termin.kennzeichen}</td>
            <td>${termin.kilometerstand || '-'}</td>
            <td>${termin.ersatzauto ? 'Ja' : 'Nein'}</td>
            <td>${termin.arbeit}</td>
            <td>${this.formatZeit(zeitAnzeige)}</td>
            <td>${termin.mitarbeiter_name || '-'}</td>
            <td><span class="status-badge ${statusClass}">${termin.status}</span></td>
            <td class="action-buttons">
              <button class="btn btn-edit" onclick="event.stopPropagation(); app.showTerminDetails(${termin.id})">
                📄 Details
              </button>
              <button class="btn btn-delete" onclick="event.stopPropagation(); app.deleteTermin(${termin.id})" style="margin-left: 5px;">
                🗑️ Löschen
              </button>
            </td>
          `;

          row.style.cursor = 'pointer';
          row.onclick = (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
              return;
            }
            this.openArbeitszeitenModal(termin.id);
          };
        });
      }
      
      // Aktualisiere die Datum-Anzeige
      const datumAnzeige = document.getElementById('zeitverwaltungDatumText');
      if (datumAnzeige) {
        datumAnzeige.textContent = `🔴 Offene Termine (${offeneTermine.length})`;
        datumAnzeige.parentElement.style.borderLeftColor = '#e67e22';
      }
    } catch (error) {
      console.error('Fehler beim Laden der offenen Termine:', error);
    }
  }

  updateZeitverwaltungDatumAnzeige() {
    const filterDatum = document.getElementById('filterDatum');
    const datumAnzeige = document.getElementById('zeitverwaltungDatumText');
    
    if (!datumAnzeige) return;
    
    if (!filterDatum.value) {
      datumAnzeige.textContent = '📋 Alle Termine';
      datumAnzeige.parentElement.style.borderLeftColor = '#4a90e2';
    } else {
      const datum = new Date(filterDatum.value);
      const heute = new Date();
      heute.setHours(0, 0, 0, 0);
      datum.setHours(0, 0, 0, 0);
      
      const wochentage = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
      const wochentag = wochentage[datum.getDay()];
      
      const formatiertesDatum = datum.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      
      let prefix = '';
      let color = '#4a90e2';
      
      if (datum.getTime() === heute.getTime()) {
        prefix = '📅 Heute - ';
        color = '#27ae60';
      } else if (datum.getTime() === heute.getTime() - 86400000) {
        prefix = '⏪ Gestern - ';
        color = '#95a5a6';
      } else if (datum.getTime() === heute.getTime() + 86400000) {
        prefix = '⏩ Morgen - ';
        color = '#3498db';
      }
      
      datumAnzeige.textContent = `${prefix}${wochentag}, ${formatiertesDatum}`;
      datumAnzeige.parentElement.style.borderLeftColor = color;
    }
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

  async showTerminDetails(terminId) {
    const termin = this.termineById[terminId];
    if (!termin) return;

    // Prüfe ob ein Lehrling zugeordnet ist (aus arbeitszeiten_details)
    let zugeordneteLehrlingId = null;
    if (termin.arbeitszeiten_details) {
      try {
        const details = JSON.parse(termin.arbeitszeiten_details);
        if (details._gesamt_mitarbeiter_id && typeof details._gesamt_mitarbeiter_id === 'object') {
          if (details._gesamt_mitarbeiter_id.type === 'lehrling') {
            zugeordneteLehrlingId = details._gesamt_mitarbeiter_id.id;
          }
        }
      } catch (e) {
        // Ignoriere Parse-Fehler
      }
    }

    // Lade aktive Mitarbeiter und Lehrlinge für Dropdown
    let mitarbeiterOptions = '<option value="">-- Niemand zugeordnet --</option>';
    try {
      const mitarbeiter = await MitarbeiterService.getAktive();
      const lehrlinge = await LehrlingeService.getAktive();

      // Erstelle Optgroups für bessere Übersicht
      if (mitarbeiter.length > 0) {
        mitarbeiterOptions += '<optgroup label="Mitarbeiter">';
        mitarbeiterOptions += mitarbeiter.map(m =>
          `<option value="ma_${m.id}" ${termin.mitarbeiter_id === m.id ? 'selected' : ''}>${m.name}</option>`
        ).join('');
        mitarbeiterOptions += '</optgroup>';
      }

      if (lehrlinge.length > 0) {
        mitarbeiterOptions += '<optgroup label="Lehrlinge">';
        mitarbeiterOptions += lehrlinge.map(l =>
          `<option value="l_${l.id}" ${zugeordneteLehrlingId === l.id ? 'selected' : ''}>${l.name}</option>`
        ).join('');
        mitarbeiterOptions += '</optgroup>';
      }
    } catch (error) {
      console.error('Fehler beim Laden der Mitarbeiter/Lehrlinge:', error);
    }

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
      <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ddd;">
        <label><strong>Mitarbeiter/Lehrling zuordnen:</strong></label>
        <select id="terminMitarbeiterSelect" style="width: 100%; padding: 8px; margin-top: 5px;">
          ${mitarbeiterOptions}
        </select>
        <button class="btn btn-primary" onclick="app.updateTerminMitarbeiter(${termin.id})" style="margin-top: 10px; width: 100%;">
          Zuordnung speichern
        </button>
      </div>
    `;

    document.getElementById('terminDetailsModal').style.display = 'block';
  }

  async updateTerminMitarbeiter(terminId) {
    const selectedValue = document.getElementById('terminMitarbeiterSelect').value;

    // Parse den Wert: "ma_1" oder "l_1" oder ""
    let mitarbeiterIdValue = null;
    let arbeitszeitenDetails = null;

    if (selectedValue && selectedValue !== '') {
      const [type, id] = selectedValue.split('_');
      const numId = parseInt(id, 10);

      if (type === 'ma') {
        // Mitarbeiter: Speichere in mitarbeiter_id
        mitarbeiterIdValue = numId;
        // Speichere auch in arbeitszeiten_details für konsistente Zuordnung
        arbeitszeitenDetails = {
          _gesamt_mitarbeiter_id: { type: 'mitarbeiter', id: numId }
        };
      } else if (type === 'l') {
        // Lehrling: Speichere nur in arbeitszeiten_details
        mitarbeiterIdValue = null; // Lehrlinge haben kein mitarbeiter_id
        arbeitszeitenDetails = {
          _gesamt_mitarbeiter_id: { type: 'lehrling', id: numId }
        };
      }
    }

    try {
      await TermineService.update(terminId, {
        mitarbeiter_id: mitarbeiterIdValue,
        arbeitszeiten_details: arbeitszeitenDetails ? JSON.stringify(arbeitszeitenDetails) : null
      });
      alert('Zuordnung gespeichert!');
      this.closeTerminDetails();
      this.loadTermine();
      this.loadAuslastung();
      if (this.loadHeuteTermine) {
        this.loadHeuteTermine();
      }
    } catch (error) {
      console.error('Fehler beim Speichern der Zuordnung:', error);
      alert('Fehler beim Speichern der Zuordnung.');
    }
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
        let verfuegbarText = `${this.formatMinutesToHours(data.verfuegbar_minuten)} (${this.formatMinutesToHours(data.gesamt_minuten)} gesamt)`;
        if (data.servicezeit_minuten && data.servicezeit_minuten > 0) {
          verfuegbarText += ` - Servicezeit: ${this.formatMinutesToHours(data.servicezeit_minuten)}`;
        }
        document.getElementById('verfuegbar').textContent = verfuegbarText;
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

      // Zeige pro-Mitarbeiter- und Lehrling-Auslastung zusammen
      const container = document.getElementById('mitarbeiterAuslastungContainer');
      const section = document.getElementById('mitarbeiterAuslastungSection');
      
      if (container && section) {
        let html = '';
        
        // Mitarbeiter-Auslastung
        if (data.mitarbeiter_auslastung && Array.isArray(data.mitarbeiter_auslastung) && data.mitarbeiter_auslastung.length > 0) {
          html += data.mitarbeiter_auslastung.map(ma => {
            // Abwesende Mitarbeiter rot markieren
            const istAbwesend = ma.ist_abwesend === true;
            const abwesendStyle = istAbwesend ? 'background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%); border-left: 4px solid #c62828;' : '';
            const abwesendBadge = istAbwesend ? '<span style="background: #c62828; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 10px;">🏥 Abwesend</span>' : '';
            
            const prozentColor = istAbwesend ? '#c62828' :
                                ma.auslastung_prozent > 100 ? '#c62828' :
                                ma.auslastung_prozent > 80 ? '#f57c00' : '#2e7d32';
            const nurServiceBadge = ma.nur_service ? '<span style="background: #2196f3; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 10px;">Nur Service</span>' : '';
            const verfuegbarText = istAbwesend ? '<span style="color: #c62828;">0 h (abwesend)</span>' : this.formatMinutesToHours(ma.verfuegbar_minuten);
            const cardStyle = istAbwesend 
              ? 'margin-bottom: 20px; padding: 15px; background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%); border-radius: 8px; border-left: 4px solid #c62828;'
              : `margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid ${prozentColor};`;
            return `
              <div style="${cardStyle}">
                <h4 style="margin: 0 0 10px 0;">${ma.mitarbeiter_name}${abwesendBadge}${nurServiceBadge}</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 10px;">
                  <div><strong>Verfügbar:</strong> ${verfuegbarText}</div>
                  <div><strong>Belegt:</strong> ${this.formatMinutesToHours(ma.belegt_minuten)}</div>
                  <div><strong>Auslastung:</strong> <span style="color: ${prozentColor}; font-weight: bold;">${istAbwesend ? '-' : ma.auslastung_prozent + '%'}</span></div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; font-size: 0.9em; color: #666; margin-bottom: 5px;">
                  <div>Geplant: ${this.formatMinutesToHours(ma.geplant_minuten)}</div>
                  <div>In Arbeit: ${this.formatMinutesToHours(ma.in_arbeit_minuten)}</div>
                  <div>Abgeschlossen: ${this.formatMinutesToHours(ma.abgeschlossen_minuten)}</div>
                  <div>Servicezeit: ${this.formatMinutesToHours(ma.servicezeit_minuten || 0)}</div>
                </div>
                <div style="margin-top: 10px; height: 20px; background: #e0e0e0; border-radius: 4px; overflow: hidden; position: relative;">
                  <div style="height: 100%; width: ${istAbwesend ? 0 : Math.min(ma.auslastung_prozent, 100)}%; background: ${prozentColor}; transition: width 0.3s;"></div>
                </div>
              </div>
            `;
          }).join('');
        }
        
        // Lehrling-Auslastung - immer anzeigen, auch wenn keine Termine vorhanden
        // Prüfe sowohl lehrlinge_auslastung als auch lehrlinge (Fallback)
        const lehrlingeAuslastung = data.lehrlinge_auslastung || [];
        if (Array.isArray(lehrlingeAuslastung) && lehrlingeAuslastung.length > 0) {
          html += lehrlingeAuslastung.map(la => {
            // Abwesende Lehrlinge rot markieren
            const istAbwesend = la.ist_abwesend === true;
            const abwesendBadge = istAbwesend ? '<span style="background: #c62828; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 10px;">🏥 Abwesend</span>' : '';
            
            const prozentColor = istAbwesend ? '#c62828' :
                                la.auslastung_prozent > 100 ? '#c62828' :
                                la.auslastung_prozent > 80 ? '#f57c00' : '#2e7d32';
            const lehrlingBadge = '<span style="background: #9c27b0; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 10px;">Lehrling</span>';
            const verfuegbarText = istAbwesend ? '<span style="color: #c62828;">0 h (abwesend)</span>' : this.formatMinutesToHours(la.verfuegbar_minuten || 0);
            const cardStyle = istAbwesend 
              ? 'margin-bottom: 20px; padding: 15px; background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%); border-radius: 8px; border-left: 4px solid #c62828;'
              : `margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid ${prozentColor};`;
            return `
              <div style="${cardStyle}">
                <h4 style="margin: 0 0 10px 0;">${la.lehrling_name || la.name || 'Unbekannt'}${abwesendBadge}${lehrlingBadge}</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 10px;">
                  <div><strong>Verfügbar:</strong> ${verfuegbarText}</div>
                  <div><strong>Belegt:</strong> ${this.formatMinutesToHours(la.belegt_minuten || 0)}</div>
                  <div><strong>Auslastung:</strong> <span style="color: ${prozentColor}; font-weight: bold;">${istAbwesend ? '-' : (la.auslastung_prozent || 0) + '%'}</span></div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; font-size: 0.9em; color: #666; margin-bottom: 5px;">
                  <div>Geplant: ${this.formatMinutesToHours(la.geplant_minuten || 0)}</div>
                  <div>In Arbeit: ${this.formatMinutesToHours(la.in_arbeit_minuten || 0)}</div>
                  <div>Abgeschlossen: ${this.formatMinutesToHours(la.abgeschlossen_minuten || 0)}</div>
                  <div>Servicezeit: ${this.formatMinutesToHours(la.servicezeit_minuten || 0)}</div>
                </div>
                <div style="margin-top: 10px; height: 20px; background: #e0e0e0; border-radius: 4px; overflow: hidden; position: relative;">
                  <div style="height: 100%; width: ${istAbwesend ? 0 : Math.min(la.auslastung_prozent || 0, 100)}%; background: ${prozentColor}; transition: width 0.3s;"></div>
                </div>
              </div>
            `;
          }).join('');
        } else if (data.lehrlinge && Array.isArray(data.lehrlinge) && data.lehrlinge.length > 0) {
          // Fallback: Wenn lehrlinge_auslastung nicht vorhanden, aber lehrlinge vorhanden sind,
          // zeige sie trotzdem an (mit 0% Auslastung)
          html += data.lehrlinge.map(l => {
            const lehrlingBadge = '<span style="background: #9c27b0; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 10px;">Lehrling</span>';
            const arbeitszeitMinuten = (l.arbeitsstunden_pro_tag || 8) * 60;
            const nebenzeitMinuten = arbeitszeitMinuten * ((l.nebenzeit_prozent || 0) / 100);
            const verfuegbar = arbeitszeitMinuten - nebenzeitMinuten;
            return `
              <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #2e7d32;">
                <h4 style="margin: 0 0 10px 0;">${l.name || 'Unbekannt'}${lehrlingBadge}</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 10px;">
                  <div><strong>Verfügbar:</strong> ${this.formatMinutesToHours(verfuegbar)}</div>
                  <div><strong>Belegt:</strong> ${this.formatMinutesToHours(0)}</div>
                  <div><strong>Auslastung:</strong> <span style="color: #2e7d32; font-weight: bold;">0%</span></div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; font-size: 0.9em; color: #666; margin-bottom: 5px;">
                  <div>Geplant: ${this.formatMinutesToHours(0)}</div>
                  <div>In Arbeit: ${this.formatMinutesToHours(0)}</div>
                  <div>Abgeschlossen: ${this.formatMinutesToHours(0)}</div>
                  <div>Servicezeit: ${this.formatMinutesToHours(0)}</div>
                </div>
                <div style="margin-top: 10px; height: 20px; background: #e0e0e0; border-radius: 4px; overflow: hidden; position: relative;">
                  <div style="height: 100%; width: 0%; background: #2e7d32; transition: width 0.3s;"></div>
                </div>
              </div>
            `;
          }).join('');
        }
        
        // Zeige Sektion nur wenn es Mitarbeiter oder Lehrlinge gibt
        if (html) {
          section.style.display = 'block';
          container.innerHTML = html;
        } else {
          section.style.display = 'none';
        }
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
            <td>${this.formatZeit(zeitAnzeige)}</td>
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

      // Filtere abgeschlossene Termine aus
      const aktiveTermine = termine.filter(t => t.status !== 'abgeschlossen');

      // Sortiere nach Bringzeit (Termine mit Bringzeit zuerst, dann nach Zeit sortiert)
      const sortedTermine = aktiveTermine.sort((a, b) => {
        const zeitA = a.bring_zeit || '';
        const zeitB = b.bring_zeit || '';
        
        // Termine ohne Bringzeit ans Ende
        if (!zeitA && !zeitB) return 0;
        if (!zeitA) return 1;
        if (!zeitB) return -1;
        
        // Sortiere nach Zeit (HH:MM Format)
        return zeitA.localeCompare(zeitB);
      });

      this.heuteTermine = sortedTermine;
      this.renderHeuteTabelle(sortedTermine);
      this.renderHeuteKarten(sortedTermine);
      this.updateHeuteInfoKacheln(sortedTermine);
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
      tbody.innerHTML = '<tr><td colspan="9" class="loading">Keine Termine für heute</td></tr>';
      return;
    }

    termine.forEach(termin => {
      const row = tbody.insertRow();
      const statusClass = `status-${termin.status || 'geplant'}`;
      const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;
      const abholungTypText = {
        'bringen': 'Kunde bringt/holt selbst',
        'hol_bring': 'Hol- und Bringservice',
        'ruecksprache': 'Telefonische Rücksprache',
        'warten': 'Kunde wartet'
      }[termin.abholung_typ] || termin.abholung_typ || '-';

      // Hervorhebung für Bringzeit
      const bringZeitDisplay = termin.bring_zeit
        ? `<strong style="color: var(--accent); font-size: 1.1em;">${termin.bring_zeit}</strong>`
        : '<span style="color: #999;">-</span>';

      // Kunde wartet Anzeige
      const kundeWartet = termin.abholung_typ === 'warten'
        ? '<span style="color: #28a745; font-size: 1.2em; font-weight: bold;">✓</span>'
        : '';

      const aktuellerStatus = termin.status || 'geplant';
      const statusTexte = {
        'geplant': 'Geplant',
        'in_arbeit': 'In Arbeit',
        'abgeschlossen': 'Abgeschlossen',
        'abgesagt': 'Abgesagt'
      };

      row.innerHTML = `
        <td>${bringZeitDisplay}</td>
        <td>${termin.kunde_name || '-'}</td>
        <td>${termin.kunde_telefon || '-'}</td>
        <td>${termin.kennzeichen || '-'}</td>
        <td style="text-align: center;">${kundeWartet}</td>
        <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis;" title="${termin.arbeit || ''}">${termin.arbeit || '-'}</td>
        <td>${this.formatZeit(zeitAnzeige)}</td>
        <td>
          <span class="status-badge ${statusClass}" data-termin-id="${termin.id}" data-status="${aktuellerStatus}" style="cursor: pointer; user-select: none;">
            ${statusTexte[aktuellerStatus]}
          </span>
          <select class="status-select-dropdown" data-termin-id="${termin.id}" style="display: none; padding: 6px 10px; border-radius: 4px; border: 1px solid #ddd; font-size: 0.9em; min-width: 120px;">
            <option value="geplant" ${aktuellerStatus === 'geplant' ? 'selected' : ''}>Geplant</option>
            <option value="in_arbeit" ${aktuellerStatus === 'in_arbeit' ? 'selected' : ''}>In Arbeit</option>
            <option value="abgeschlossen" ${aktuellerStatus === 'abgeschlossen' ? 'selected' : ''}>Abgeschlossen</option>
            <option value="abgesagt" ${aktuellerStatus === 'abgesagt' ? 'selected' : ''}>Abgesagt</option>
          </select>
        </td>
        <td>
          <button class="btn btn-edit" onclick="app.showTerminDetails(${termin.id})">Details</button>
        </td>
      `;

      // Event-Listener für Status-Badge Klick
      const statusBadge = row.querySelector('.status-badge');
      const statusDropdown = row.querySelector('.status-select-dropdown');

      if (statusBadge && statusDropdown) {
        statusBadge.addEventListener('click', () => {
          statusBadge.style.display = 'none';
          statusDropdown.style.display = 'inline-block';
          statusDropdown.focus();
        });

        statusDropdown.addEventListener('change', async (e) => {
          const terminId = parseInt(e.target.dataset.terminId);
          const neuerStatus = e.target.value;
          await this.updateTerminStatus(terminId, neuerStatus);
        });

        statusDropdown.addEventListener('blur', () => {
          statusDropdown.style.display = 'none';
          statusBadge.style.display = 'inline-block';
        });
      }
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
      const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;
      const aktuellerStatus = termin.status || 'geplant';
      const statusTexte = {
        'geplant': 'Geplant',
        'in_arbeit': 'In Arbeit',
        'abgeschlossen': 'Abgeschlossen',
        'abgesagt': 'Abgesagt'
      };
      const abholungTypText = {
        'bringen': 'Kunde bringt/holt selbst',
        'hol_bring': 'Hol- und Bringservice',
        'ruecksprache': 'Telefonische Rücksprache',
        'warten': 'Kunde wartet'
      }[termin.abholung_typ] || termin.abholung_typ || '-';

      const karte = document.createElement('div');
      karte.className = 'heute-karte';

      // Wenn Kunde wartet, füge eine auffällige Markierung hinzu
      const kundeWartetBanner = termin.abholung_typ === 'warten'
        ? '<div style="background: #28a745; color: white; padding: 8px; text-align: center; font-weight: bold; border-radius: 5px 5px 0 0;">⚠️ KUNDE WARTET ⚠️</div>'
        : '';

      karte.innerHTML = `
        ${kundeWartetBanner}
        <div class="heute-karte-header">
          <div class="heute-karte-nr"><strong>${termin.termin_nr || '-'}</strong></div>
          <div class="status-container" style="position: relative;">
            <span class="status-badge ${statusClass}" data-termin-id="${termin.id}" data-status="${aktuellerStatus}" style="cursor: pointer; user-select: none;">
              ${statusTexte[aktuellerStatus]}
            </span>
            <select class="status-select-dropdown" data-termin-id="${termin.id}" style="display: none; padding: 6px 10px; border-radius: 4px; border: 1px solid #ddd; font-size: 0.9em; min-width: 120px;">
              <option value="geplant" ${aktuellerStatus === 'geplant' ? 'selected' : ''}>Geplant</option>
              <option value="in_arbeit" ${aktuellerStatus === 'in_arbeit' ? 'selected' : ''}>In Arbeit</option>
              <option value="abgeschlossen" ${aktuellerStatus === 'abgeschlossen' ? 'selected' : ''}>Abgeschlossen</option>
              <option value="abgesagt" ${aktuellerStatus === 'abgesagt' ? 'selected' : ''}>Abgesagt</option>
            </select>
          </div>
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
            <p><strong>Zeit:</strong> ${this.formatZeit(zeitAnzeige)}</p>
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

      // Event-Listener für Status-Badge Klick in der Karte
      const cardStatusBadge = karte.querySelector('.status-badge');
      const cardStatusDropdown = karte.querySelector('.status-select-dropdown');

      if (cardStatusBadge && cardStatusDropdown) {
        cardStatusBadge.addEventListener('click', () => {
          cardStatusBadge.style.display = 'none';
          cardStatusDropdown.style.display = 'inline-block';
          cardStatusDropdown.focus();
        });

        cardStatusDropdown.addEventListener('change', async (e) => {
          const terminId = parseInt(e.target.dataset.terminId);
          const neuerStatus = e.target.value;
          await this.updateTerminStatus(terminId, neuerStatus);
        });

        cardStatusDropdown.addEventListener('blur', () => {
          cardStatusDropdown.style.display = 'none';
          cardStatusBadge.style.display = 'inline-block';
        });
      }
    });
  }

  updateHeuteInfoKacheln(termine) {
    // Aktuelle Uhrzeit aktualisieren
    this.updateAktuelleUhrzeit();
    
    // Nächster Kunde berechnen
    this.updateNaechsterKunde(termine);
    
    // Uhrzeit jede Sekunde aktualisieren
    if (this.uhrzeitInterval) {
      clearInterval(this.uhrzeitInterval);
    }
    this.uhrzeitInterval = setInterval(() => {
      this.updateAktuelleUhrzeit();
      this.updateNaechsterKunde(termine);
    }, 1000);
  }

  updateAktuelleUhrzeit() {
    const now = new Date();
    const uhrzeitEl = document.getElementById('aktuelleUhrzeit');
    const datumEl = document.getElementById('aktuelleUhrzeitDatum');
    
    if (uhrzeitEl) {
      const stunden = String(now.getHours()).padStart(2, '0');
      const minuten = String(now.getMinutes()).padStart(2, '0');
      uhrzeitEl.textContent = `${stunden}:${minuten}`;
    }
    
    if (datumEl) {
      datumEl.textContent = now.toLocaleDateString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit'
      });
    }
  }

  updateNaechsterKunde(termine) {
    const jetzt = new Date();
    const aktuelleStunde = jetzt.getHours();
    const aktuelleMinute = jetzt.getMinutes();
    const aktuelleZeitMinuten = aktuelleStunde * 60 + aktuelleMinute;
    
    const zeitEl = document.getElementById('naechsterKundeZeit');
    const infoEl = document.getElementById('naechsterKundeInfo');
    
    if (!zeitEl || !infoEl) return;
    
    // Finde den nächsten Termin mit Bringzeit, der noch nicht vorbei ist
    let naechsterTermin = null;
    let minDiff = Infinity;
    
    termine.forEach(termin => {
      if (!termin.bring_zeit) return;
      
      const [stunden, minuten] = termin.bring_zeit.split(':').map(Number);
      const terminZeitMinuten = stunden * 60 + minuten;
      
      // Nur Termine in der Zukunft oder jetzt
      if (terminZeitMinuten >= aktuelleZeitMinuten) {
        const diff = terminZeitMinuten - aktuelleZeitMinuten;
        if (diff < minDiff) {
          minDiff = diff;
          naechsterTermin = termin;
        }
      }
    });
    
    if (naechsterTermin && minDiff < Infinity) {
      const [stunden, minuten] = naechsterTermin.bring_zeit.split(':').map(Number);
      const terminZeitMinuten = stunden * 60 + minuten;
      const diffMinuten = terminZeitMinuten - aktuelleZeitMinuten;
      
      if (diffMinuten <= 0) {
        zeitEl.textContent = 'JETZT';
        zeitEl.style.color = 'var(--accent)';
        infoEl.textContent = `${naechsterTermin.kunde_name || 'Kunde'} - ${naechsterTermin.kennzeichen || ''}`;
      } else {
        const diffStunden = Math.floor(diffMinuten / 60);
        const diffMin = diffMinuten % 60;
        
        if (diffStunden > 0) {
          zeitEl.textContent = `${String(diffStunden).padStart(2, '0')}:${String(diffMin).padStart(2, '0')}`;
        } else {
          zeitEl.textContent = `00:${String(diffMin).padStart(2, '0')}`;
        }
        zeitEl.style.color = diffMinuten <= 15 ? 'var(--accent)' : 'inherit';
        infoEl.textContent = `${naechsterTermin.kunde_name || 'Kunde'} - ${naechsterTermin.kennzeichen || ''} (${naechsterTermin.bring_zeit})`;
      }
    } else {
      zeitEl.textContent = '--:--';
      zeitEl.style.color = 'inherit';
      infoEl.textContent = 'Keine weiteren Termine heute';
    }
  }

  async updateTerminStatus(terminId, status) {
    try {
      await TermineService.update(terminId, { status: status });

      // Aktualisiere den Termin im Cache
      if (this.termineById[terminId]) {
        this.termineById[terminId].status = status;
      }

      // Aktualisiere Dashboard, Auslastung und Heute-Ansicht
      this.loadDashboard();
      await this.loadHeuteTermine();
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Status:', error);
      alert('Fehler beim Aktualisieren des Status: ' + (error.message || 'Unbekannter Fehler'));

      // Lade Tabelle neu, um den alten Status wieder anzuzeigen
      await this.loadHeuteTermine();
    }
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
        const dayName = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'][index];
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

  // Papierkorb-Funktionen
  async deleteTermin(terminId) {
    const termin = this.termineById[terminId];
    if (!termin) return;

    const confirmMsg = `Möchten Sie den Termin "${termin.termin_nr || termin.id}" wirklich in den Papierkorb verschieben?\n\nKunde: ${termin.kunde_name}\nKennzeichen: ${termin.kennzeichen}\nArbeit: ${termin.arbeit}`;

    if (!confirm(confirmMsg)) {
      return;
    }

    try {
      await TermineService.delete(terminId);
      alert('Termin wurde in den Papierkorb verschoben.');
      this.loadTermine();
      this.loadDashboard();
      this.loadAuslastung();
    } catch (error) {
      console.error('Fehler beim Löschen des Termins:', error);
      alert('Fehler beim Löschen: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  async loadPapierkorb() {
    try {
      const termine = await TermineService.getDeleted();
      const tbody = document.getElementById('papierkorbTable').getElementsByTagName('tbody')[0];
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
  }

  async restoreTermin(terminId) {
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
  }

  async permanentDeleteTermin(terminId) {
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
    const servicezeitField = document.getElementById('servicezeit_minuten');
    if (servicezeitField) {
      servicezeitField.value = einstellungen.servicezeit_minuten || 10;
    }
  }

  async loadAbwesenheit() {
    // Legacy-Funktion - nur ausführen wenn alte Felder noch existieren
    const abwesenheitDatumField = document.getElementById('abwesenheitDatum');
    if (!abwesenheitDatumField) return;

    const datum = abwesenheitDatumField.value;
    if (!datum) return;

    try {
      const data = await EinstellungenService.getAbwesenheit(datum);
      this.prefillAbwesenheit(datum, data);
      // sync mit Auslastungs-Datum, wenn gleich
      const auslastungDatum = document.getElementById('auslastungDatum');
      if (auslastungDatum && auslastungDatum.value === datum) {
        this.loadAuslastung();
      }
    } catch (error) {
      console.error('Fehler beim Laden der Abwesenheit:', error);
    }
  }

  prefillAbwesenheit(datum, abwesenheit) {
    if (!abwesenheit) return;

    // Diese Felder existieren im neuen System nicht mehr, daher nur befüllen wenn vorhanden
    const abwesenheitDatum = document.getElementById('abwesenheitDatum');
    if (abwesenheitDatum && !abwesenheitDatum.value) {
      abwesenheitDatum.value = datum;
    }

    const urlaubField = document.getElementById('abwesenheitUrlaub');
    if (urlaubField) {
      urlaubField.value = abwesenheit.urlaub || 0;
    }

    const krankField = document.getElementById('abwesenheitKrank');
    if (krankField) {
      krankField.value = abwesenheit.krank || 0;
    }
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

  // Neue Funktionen für individuelle Abwesenheiten
  async loadAbwesenheitenPersonen() {
    try {
      const mitarbeiter = await MitarbeiterService.getAktive();
      const lehrlinge = await LehrlingeService.getAktive();

      // Urlaub-Dropdown befüllen
      const urlaubSelect = document.getElementById('urlaubPerson');
      if (!urlaubSelect) {
        return;
      }
      urlaubSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';

      if (mitarbeiter.length > 0) {
        const maOptgroup = document.createElement('optgroup');
        maOptgroup.label = 'Mitarbeiter';
        mitarbeiter.forEach(m => {
          const option = document.createElement('option');
          option.value = `ma_${m.id}`;
          option.textContent = m.name;
          maOptgroup.appendChild(option);
        });
        urlaubSelect.appendChild(maOptgroup);
      }

      if (lehrlinge.length > 0) {
        const lOptgroup = document.createElement('optgroup');
        lOptgroup.label = 'Lehrlinge';
        lehrlinge.forEach(l => {
          const option = document.createElement('option');
          option.value = `l_${l.id}`;
          option.textContent = l.name;
          lOptgroup.appendChild(option);
        });
        urlaubSelect.appendChild(lOptgroup);
      }

      // Krank-Dropdown befüllen (gleiche Struktur)
      const krankSelect = document.getElementById('krankPerson');
      krankSelect.innerHTML = urlaubSelect.innerHTML;

    } catch (error) {
      console.error('Fehler beim Laden der Mitarbeiter/Lehrlinge:', error);
    }
  }

  async handleUrlaubSubmit(e) {
    e.preventDefault();

    const personValue = document.getElementById('urlaubPerson').value;
    const vonDatum = document.getElementById('urlaubVonDatum').value;
    const bisDatum = document.getElementById('urlaubBisDatum').value;

    if (!personValue || !vonDatum || !bisDatum) {
      alert('Bitte füllen Sie alle Pflichtfelder aus.');
      return;
    }

    // Person-ID und Typ extrahieren
    const [typ, id] = personValue.split('_');
    const data = {
      typ: 'urlaub',
      von_datum: vonDatum,
      bis_datum: bisDatum
    };

    if (typ === 'ma') {
      data.mitarbeiter_id = parseInt(id, 10);
    } else if (typ === 'l') {
      data.lehrling_id = parseInt(id, 10);
    }

    try {
      await EinstellungenService.createAbwesenheit(data);
      alert('Urlaub eingetragen.');

      // Formular zurücksetzen
      document.getElementById('urlaubForm').reset();

      // Liste neu laden
      this.loadUrlaubListe();
      this.loadDashboard();
    } catch (error) {
      console.error('Fehler beim Eintragen des Urlaubs:', error);
      alert('Urlaub konnte nicht eingetragen werden: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  async handleKrankSubmit(e) {
    e.preventDefault();

    const personValue = document.getElementById('krankPerson').value;
    const vonDatum = document.getElementById('krankVonDatum').value;
    const bisDatum = document.getElementById('krankBisDatum').value;

    if (!personValue || !vonDatum || !bisDatum) {
      alert('Bitte füllen Sie alle Pflichtfelder aus.');
      return;
    }

    // 7-Tage-Validierung
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    const maxDatum = new Date(heute);
    maxDatum.setDate(maxDatum.getDate() + 7);

    const vonDatumDate = new Date(vonDatum);
    const bisDatumDate = new Date(bisDatum);

    if (vonDatumDate > maxDatum || bisDatumDate > maxDatum) {
      alert('Krankmeldungen können nur für die nächsten 7 Tage eingetragen werden.');
      return;
    }

    // Person-ID und Typ extrahieren
    const [typ, id] = personValue.split('_');
    const data = {
      typ: 'krank',
      von_datum: vonDatum,
      bis_datum: bisDatum
    };

    if (typ === 'ma') {
      data.mitarbeiter_id = parseInt(id, 10);
    } else if (typ === 'l') {
      data.lehrling_id = parseInt(id, 10);
    }

    try {
      await EinstellungenService.createAbwesenheit(data);
      alert('Krankmeldung eingetragen.');

      // Formular zurücksetzen
      document.getElementById('krankForm').reset();

      // Liste neu laden
      this.loadKrankListe();
      this.loadDashboard();
    } catch (error) {
      console.error('Fehler beim Eintragen der Krankmeldung:', error);
      alert('Krankmeldung konnte nicht eingetragen werden: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  validateKrankDatum() {
    const vonDatumInput = document.getElementById('krankVonDatum');
    const bisDatumInput = document.getElementById('krankBisDatum');

    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    const maxDatum = new Date(heute);
    maxDatum.setDate(maxDatum.getDate() + 7);

    const maxDatumString = maxDatum.toISOString().split('T')[0];

    // Setze max-Attribut
    vonDatumInput.setAttribute('max', maxDatumString);
    bisDatumInput.setAttribute('max', maxDatumString);

    // Validiere existierende Werte
    if (vonDatumInput.value) {
      const vonDatum = new Date(vonDatumInput.value);
      if (vonDatum > maxDatum) {
        vonDatumInput.value = '';
        alert('Das Von-Datum darf maximal 7 Tage in der Zukunft liegen.');
      }
    }

    if (bisDatumInput.value) {
      const bisDatum = new Date(bisDatumInput.value);
      if (bisDatum > maxDatum) {
        bisDatumInput.value = '';
        alert('Das Bis-Datum darf maximal 7 Tage in der Zukunft liegen.');
      }
    }
  }

  async loadUrlaubListe() {
    try {
      const abwesenheiten = await EinstellungenService.getAllAbwesenheiten();
      const urlaube = abwesenheiten.filter(a => a.typ === 'urlaub');

      const tbody = document.querySelector('#urlaubTable tbody');
      tbody.innerHTML = '';

      if (urlaube.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #666;">Keine Urlaube eingetragen</td></tr>';
        return;
      }

      urlaube.forEach(urlaub => {
        const row = document.createElement('tr');
        const personName = urlaub.mitarbeiter_name || urlaub.lehrling_name || 'Unbekannt';

        row.innerHTML = `
          <td>${personName}</td>
          <td>${this.formatDatum(urlaub.von_datum)}</td>
          <td>${this.formatDatum(urlaub.bis_datum)}</td>
          <td>
            <button class="btn btn-danger" onclick="app.deleteAbwesenheit(${urlaub.id}, 'urlaub')">Löschen</button>
          </td>
        `;
        tbody.appendChild(row);
      });
    } catch (error) {
      console.error('Fehler beim Laden der Urlaube:', error);
    }
  }

  async loadKrankListe() {
    try {
      const abwesenheiten = await EinstellungenService.getAllAbwesenheiten();
      const krankmeldungen = abwesenheiten.filter(a => a.typ === 'krank');

      const tbody = document.querySelector('#krankTable tbody');
      tbody.innerHTML = '';

      if (krankmeldungen.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #666;">Keine Krankmeldungen eingetragen</td></tr>';
        return;
      }

      krankmeldungen.forEach(krank => {
        const row = document.createElement('tr');
        const personName = krank.mitarbeiter_name || krank.lehrling_name || 'Unbekannt';

        row.innerHTML = `
          <td>${personName}</td>
          <td>${this.formatDatum(krank.von_datum)}</td>
          <td>${this.formatDatum(krank.bis_datum)}</td>
          <td>
            <button class="btn btn-danger" onclick="app.deleteAbwesenheit(${krank.id}, 'krank')">Löschen</button>
          </td>
        `;
        tbody.appendChild(row);
      });
    } catch (error) {
      console.error('Fehler beim Laden der Krankmeldungen:', error);
    }
  }

  async deleteAbwesenheit(id, typ) {
    if (!confirm(`Möchten Sie diese ${typ === 'urlaub' ? 'Urlaubseintrag' : 'Krankmeldung'} wirklich löschen?`)) {
      return;
    }

    try {
      await EinstellungenService.deleteAbwesenheit(id);
      alert(`${typ === 'urlaub' ? 'Urlaub' : 'Krankmeldung'} gelöscht.`);

      if (typ === 'urlaub') {
        this.loadUrlaubListe();
      } else {
        this.loadKrankListe();
      }

      this.loadDashboard();
    } catch (error) {
      console.error('Fehler beim Löschen der Abwesenheit:', error);
      alert('Abwesenheit konnte nicht gelöscht werden.');
    }
  }

  formatDatum(datum) {
    if (!datum) return '-';
    const d = new Date(datum);
    const tag = String(d.getDate()).padStart(2, '0');
    const monat = String(d.getMonth() + 1).padStart(2, '0');
    const jahr = d.getFullYear();
    return `${tag}.${monat}.${jahr}`;
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

    const servicezeitField = document.getElementById('servicezeit_minuten');
    if (!servicezeitField) {
      alert('Servicezeit-Feld nicht gefunden.');
      return;
    }

    const servicezeit = parseInt(servicezeitField.value, 10);

    if (!Number.isFinite(servicezeit) || servicezeit < 0) {
      alert('Bitte eine gültige Servicezeit eingeben.');
      return;
    }

    try {
      // Lade aktuelle Einstellungen, um Pufferzeit beizubehalten
      const aktuelleEinstellungen = await EinstellungenService.getWerkstatt();
      
      await EinstellungenService.updateWerkstatt({
        pufferzeit_minuten: aktuelleEinstellungen?.pufferzeit_minuten || 15,
        servicezeit_minuten: servicezeit
      });
      alert('Einstellungen gespeichert.');
      this.loadAuslastung();
      this.loadDashboard();
      // Lade Einstellungen neu, um sicherzustellen, dass die Werte korrekt sind
      this.loadWerkstattSettings();
    } catch (error) {
      console.error('Fehler beim Speichern der Einstellungen:', error);
      alert('Einstellungen konnten nicht gespeichert werden.');
    }
  }

  async loadMitarbeiter() {
    try {
      const mitarbeiter = await MitarbeiterService.getAll();
      const tbody = document.getElementById('mitarbeiterTable').getElementsByTagName('tbody')[0];
      tbody.innerHTML = '';

      if (mitarbeiter.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Keine Mitarbeiter vorhanden</td></tr>';
        return;
      }

      mitarbeiter.forEach(ma => {
        const row = tbody.insertRow();
        row.innerHTML = `
          <td><input type="text" id="mitarbeiter_name_${ma.id}" value="${ma.name || ''}" style="width: 100%; padding: 5px;"></td>
          <td><input type="number" id="mitarbeiter_stunden_${ma.id}" value="${ma.arbeitsstunden_pro_tag || 8}" min="1" max="24" style="width: 100%; padding: 5px;"></td>
          <td><input type="number" id="mitarbeiter_nebenzeit_${ma.id}" value="${ma.nebenzeit_prozent || 0}" min="0" max="100" step="0.1" style="width: 100%; padding: 5px;"></td>
          <td><input type="checkbox" id="mitarbeiter_nur_service_${ma.id}" ${ma.nur_service === 1 || ma.nur_service === true ? 'checked' : ''} title="Nur Service (Annahme/Rechnung)"></td>
          <td><input type="checkbox" id="mitarbeiter_aktiv_${ma.id}" ${ma.aktiv !== 0 ? 'checked' : ''}></td>
          <td>
            <button class="btn btn-primary" onclick="app.saveMitarbeiter(${ma.id})">💾</button>
            <button class="btn btn-danger" onclick="app.deleteMitarbeiter(${ma.id})">🗑️</button>
          </td>
        `;
      });
    } catch (error) {
      console.error('Fehler beim Laden der Mitarbeiter:', error);
    }
  }

  async loadLehrlinge() {
    try {
      const lehrlinge = await LehrlingeService.getAll();
      const tbody = document.getElementById('lehrlingeTable').getElementsByTagName('tbody')[0];
      tbody.innerHTML = '';

      if (lehrlinge.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Keine Lehrlinge vorhanden</td></tr>';
        return;
      }

      lehrlinge.forEach(l => {
        const row = tbody.insertRow();
        row.innerHTML = `
          <td><input type="text" id="lehrling_name_${l.id}" value="${l.name || ''}" style="width: 100%; padding: 5px;"></td>
          <td><input type="number" id="lehrling_nebenzeit_${l.id}" value="${l.nebenzeit_prozent || 0}" min="0" max="100" step="0.1" style="width: 100%; padding: 5px;"></td>
          <td><input type="number" id="lehrling_aufgabe_${l.id}" value="${l.aufgabenbewaeltigung_prozent || 100}" min="0" max="500" step="1" style="width: 100%; padding: 5px;"></td>
          <td><input type="checkbox" id="lehrling_aktiv_${l.id}" ${l.aktiv !== 0 ? 'checked' : ''}></td>
          <td>
            <button class="btn btn-primary" onclick="app.saveLehrling(${l.id})">💾</button>
            <button class="btn btn-danger" onclick="app.deleteLehrling(${l.id})">🗑️</button>
          </td>
        `;
      });
    } catch (error) {
      console.error('Fehler beim Laden der Lehrlinge:', error);
    }
  }

  addMitarbeiter() {
    const tbody = document.getElementById('mitarbeiterTable').getElementsByTagName('tbody')[0];
    const row = tbody.insertRow();
    row.className = 'new-mitarbeiter-row';
    row.innerHTML = `
      <td><input type="text" id="new_mitarbeiter_name" placeholder="Name" style="width: 100%; padding: 5px;"></td>
      <td><input type="number" id="new_mitarbeiter_stunden" value="8" min="1" max="24" style="width: 100%; padding: 5px;"></td>
      <td><input type="number" id="new_mitarbeiter_nebenzeit" value="0" min="0" max="100" step="0.1" style="width: 100%; padding: 5px;"></td>
      <td><input type="checkbox" id="new_mitarbeiter_nur_service" title="Nur Service (Annahme/Rechnung)"></td>
      <td><input type="checkbox" id="new_mitarbeiter_aktiv" checked></td>
      <td>
        <button class="btn btn-primary" onclick="app.saveNewMitarbeiter()">💾</button>
        <button class="btn btn-secondary" onclick="app.cancelNewMitarbeiter()">❌</button>
      </td>
    `;
  }

  cancelNewMitarbeiter() {
    const tbody = document.getElementById('mitarbeiterTable').getElementsByTagName('tbody')[0];
    const newRow = tbody.querySelector('tr.new-mitarbeiter-row');
    if (newRow) {
      newRow.remove();
    }
  }

  async saveNewMitarbeiter() {
    const name = document.getElementById('new_mitarbeiter_name').value.trim();
    const stunden = parseInt(document.getElementById('new_mitarbeiter_stunden').value, 10);
    const nebenzeit = parseFloat(document.getElementById('new_mitarbeiter_nebenzeit').value);
    const nurService = document.getElementById('new_mitarbeiter_nur_service').checked;
    const aktiv = document.getElementById('new_mitarbeiter_aktiv').checked;

    if (!name) {
      alert('Bitte einen Namen eingeben.');
      return;
    }

    try {
      await MitarbeiterService.create({
        name,
        arbeitsstunden_pro_tag: stunden || 8,
        nebenzeit_prozent: nebenzeit || 0,
        nur_service: nurService,
        aktiv: aktiv ? 1 : 0
      });
      await this.loadMitarbeiter();
      alert('Mitarbeiter hinzugefügt!');
    } catch (error) {
      console.error('Fehler beim Hinzufügen:', error);
      alert('Fehler beim Hinzufügen des Mitarbeiters.');
    }
  }

  async saveMitarbeiter(id) {
    const name = document.getElementById(`mitarbeiter_name_${id}`).value.trim();
    const stunden = parseInt(document.getElementById(`mitarbeiter_stunden_${id}`).value, 10);
    const nebenzeit = parseFloat(document.getElementById(`mitarbeiter_nebenzeit_${id}`).value);
    const nurService = document.getElementById(`mitarbeiter_nur_service_${id}`).checked;
    const aktiv = document.getElementById(`mitarbeiter_aktiv_${id}`).checked;

    if (!name) {
      alert('Bitte einen Namen eingeben.');
      return;
    }

    try {
      await MitarbeiterService.update(id, {
        name,
        arbeitsstunden_pro_tag: stunden || 8,
        nebenzeit_prozent: nebenzeit || 0,
        nur_service: nurService,
        aktiv: aktiv ? 1 : 0
      });
      await this.loadMitarbeiter();
      alert('Mitarbeiter aktualisiert!');
      this.loadAuslastung();
    } catch (error) {
      console.error('Fehler beim Aktualisieren:', error);
      alert('Fehler beim Aktualisieren des Mitarbeiters.');
    }
  }

  async deleteMitarbeiter(id) {
    if (!confirm('Mitarbeiter wirklich löschen?')) {
      return;
    }

    try {
      await MitarbeiterService.delete(id);
      await this.loadMitarbeiter();
      alert('Mitarbeiter gelöscht!');
      this.loadAuslastung();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen des Mitarbeiters.');
    }
  }

  addLehrling() {
    const tbody = document.getElementById('lehrlingeTable').getElementsByTagName('tbody')[0];
    const row = tbody.insertRow();
    row.className = 'new-lehrling-row';
    row.innerHTML = `
      <td><input type="text" id="new_lehrling_name" placeholder="Name" style="width: 100%; padding: 5px;"></td>
      <td><input type="number" id="new_lehrling_nebenzeit" value="0" min="0" max="100" step="0.1" style="width: 100%; padding: 5px;"></td>
      <td><input type="number" id="new_lehrling_aufgabe" value="100" min="0" max="500" step="1" style="width: 100%; padding: 5px;"></td>
      <td><input type="checkbox" id="new_lehrling_aktiv" checked></td>
      <td>
        <button class="btn btn-primary" onclick="app.saveNewLehrling()">💾</button>
        <button class="btn btn-secondary" onclick="app.cancelNewLehrling()">❌</button>
      </td>
    `;
  }

  cancelNewLehrling() {
    const tbody = document.getElementById('lehrlingeTable').getElementsByTagName('tbody')[0];
    const newRow = tbody.querySelector('tr.new-lehrling-row');
    if (newRow) {
      newRow.remove();
    }
  }

  async saveNewLehrling() {
    const name = document.getElementById('new_lehrling_name').value.trim();
    const nebenzeit = parseFloat(document.getElementById('new_lehrling_nebenzeit').value);
    const aufgabe = parseFloat(document.getElementById('new_lehrling_aufgabe').value);
    const aktiv = document.getElementById('new_lehrling_aktiv').checked;

    if (!name) {
      alert('Bitte einen Namen eingeben.');
      return;
    }

    try {
      await LehrlingeService.create({
        name,
        nebenzeit_prozent: nebenzeit || 0,
        aufgabenbewaeltigung_prozent: aufgabe || 100,
        aktiv: aktiv ? 1 : 0
      });
      await this.loadLehrlinge();
      alert('Lehrling hinzugefügt!');
    } catch (error) {
      console.error('Fehler beim Hinzufügen:', error);
      alert('Fehler beim Hinzufügen des Lehrlings.');
    }
  }

  async saveLehrling(id) {
    const name = document.getElementById(`lehrling_name_${id}`).value.trim();
    const nebenzeit = parseFloat(document.getElementById(`lehrling_nebenzeit_${id}`).value);
    const aufgabe = parseFloat(document.getElementById(`lehrling_aufgabe_${id}`).value);
    const aktiv = document.getElementById(`lehrling_aktiv_${id}`).checked;

    if (!name) {
      alert('Bitte einen Namen eingeben.');
      return;
    }

    try {
      await LehrlingeService.update(id, {
        name,
        nebenzeit_prozent: nebenzeit || 0,
        aufgabenbewaeltigung_prozent: aufgabe || 100,
        aktiv: aktiv ? 1 : 0
      });
      await this.loadLehrlinge();
      alert('Lehrling aktualisiert!');
      this.loadAuslastung();
    } catch (error) {
      console.error('Fehler beim Aktualisieren:', error);
      alert('Fehler beim Aktualisieren des Lehrlings.');
    }
  }

  async deleteLehrling(id) {
    if (!confirm('Lehrling wirklich löschen?')) {
      return;
    }

    try {
      await LehrlingeService.delete(id);
      await this.loadLehrlinge();
      alert('Lehrling gelöscht!');
      this.loadAuslastung();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen des Lehrlings.');
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

  async openArbeitszeitenModal(terminId) {
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

    // Lade Mitarbeiter und Lehrlinge für Dropdowns
    let mitarbeiter = [];
    let lehrlinge = [];
    try {
      mitarbeiter = await MitarbeiterService.getAktive();
      lehrlinge = await LehrlingeService.getAktive();
    } catch (error) {
      console.error('Fehler beim Laden der Mitarbeiter/Lehrlinge:', error);
    }

    // Befülle Gesamt-Mitarbeiter-Dropdown (mit Mitarbeitern und Lehrlingen)
    const gesamtMitarbeiterSelect = document.getElementById('modalGesamtMitarbeiter');
    gesamtMitarbeiterSelect.innerHTML = '<option value="">-- Keine Zuordnung --</option>';
    
    // Optgroup für Mitarbeiter
    if (mitarbeiter.length > 0) {
      mitarbeiter.forEach(ma => {
        const option = document.createElement('option');
        option.value = `ma_${ma.id}`;
        option.textContent = `👤 ${ma.name}`;
        gesamtMitarbeiterSelect.appendChild(option);
      });
    }
    
    // Optgroup für Lehrlinge
    if (lehrlinge.length > 0) {
      lehrlinge.forEach(l => {
        const option = document.createElement('option');
        option.value = `l_${l.id}`;
        option.textContent = `🎓 ${l.name} (Lehrling)`;
        gesamtMitarbeiterSelect.appendChild(option);
      });
    }

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
    const zeitProArbeit = arbeitenListe.length > 0 ? Math.round(gesamtzeit / arbeitenListe.length) : 30;

    arbeitenListe.forEach((arbeit, index) => {
      let zeitMinuten;
      let mitarbeiterId = '';

      // Prüfe zuerst ob individuelle Zeit für diese Arbeit gespeichert ist
      if (arbeitszeitenDetails[arbeit]) {
        // Neue Struktur: {zeit: 30, mitarbeiter_id: 1, type: 'mitarbeiter'} oder alte Struktur: 30
        if (typeof arbeitszeitenDetails[arbeit] === 'object') {
          zeitMinuten = arbeitszeitenDetails[arbeit].zeit || arbeitszeitenDetails[arbeit];
          if (arbeitszeitenDetails[arbeit].type === 'lehrling') {
            mitarbeiterId = `l_${arbeitszeitenDetails[arbeit].mitarbeiter_id || arbeitszeitenDetails[arbeit].lehrling_id}`;
          } else if (arbeitszeitenDetails[arbeit].mitarbeiter_id) {
            mitarbeiterId = `ma_${arbeitszeitenDetails[arbeit].mitarbeiter_id}`;
          } else {
            mitarbeiterId = '';
          }
        } else {
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
      let mitarbeiterOptions = '<option value="">-- Keine Zuordnung --</option>';
      
      // Mitarbeiter
      if (mitarbeiter.length > 0) {
        mitarbeiter.forEach(ma => {
          const value = `ma_${ma.id}`;
          const selected = value === mitarbeiterId ? 'selected' : '';
          mitarbeiterOptions += `<option value="${value}" ${selected}>👤 ${ma.name}</option>`;
        });
      }
      
      // Lehrlinge
      if (lehrlinge.length > 0) {
        lehrlinge.forEach(l => {
          const value = `l_${l.id}`;
          const selected = value === mitarbeiterId ? 'selected' : '';
          mitarbeiterOptions += `<option value="${value}" ${selected}>🎓 ${l.name} (Lehrling)</option>`;
        });
      }

      const item = document.createElement('div');
      item.className = 'arbeitszeit-item';
      item.style.marginBottom = '15px';
      item.innerHTML = `
        <div style="margin-bottom: 5px;">
          <label style="font-weight: 600;">📋 ${arbeit}:</label>
        </div>
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin-bottom: 5px;">
          <input type="number"
                 id="modal_zeit_${index}"
                 value="${zeitStunden}"
                 min="0.25"
                 step="0.25"
                 placeholder="0"
                 onchange="app.updateModalGesamtzeit()"
                 onfocus="this.select()"
                 style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          <select id="modal_mitarbeiter_${index}"
                  style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            ${mitarbeiterOptions}
          </select>
        </div>
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
    const selects = liste.querySelectorAll('select[id^="modal_mitarbeiter_"]');
    let gesamtStunden = 0;
    const arbeitszeitenDetails = {};

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
    }

    // Sammle individuelle Zeiten und Mitarbeiter-Zuordnungen pro Arbeit
    const termin = this.termineById[this.currentTerminId];
    const arbeitenListe = this.parseArbeiten(termin.arbeit || '');

    inputs.forEach((input, index) => {
      const stunden = parseFloat(input.value) || 0;
      gesamtStunden += stunden;

      // Speichere die Zeit in Minuten für jede Arbeit
      if (arbeitenListe[index]) {
        const zeitMinuten = Math.round(stunden * 60);
        const mitarbeiterSelect = document.getElementById(`modal_mitarbeiter_${index}`);
        const mitarbeiterValue = mitarbeiterSelect ? mitarbeiterSelect.value : '';

        // Neue Struktur: {zeit: 30, mitarbeiter_id: 1, type: 'mitarbeiter'} oder {zeit: 30, lehrling_id: 1, type: 'lehrling'}
        if (mitarbeiterValue) {
          if (mitarbeiterValue.startsWith('ma_')) {
            const id = parseInt(mitarbeiterValue.replace('ma_', ''), 10);
            arbeitszeitenDetails[arbeitenListe[index]] = {
              zeit: zeitMinuten,
              mitarbeiter_id: id,
              type: 'mitarbeiter'
            };
          } else if (mitarbeiterValue.startsWith('l_')) {
            const id = parseInt(mitarbeiterValue.replace('l_', ''), 10);
            arbeitszeitenDetails[arbeitenListe[index]] = {
              zeit: zeitMinuten,
              lehrling_id: id,
              mitarbeiter_id: id, // Für Kompatibilität
              type: 'lehrling'
            };
          }
        } else {
          // Wenn keine individuelle Zuordnung, nur Zeit speichern (kompatibel mit alter Struktur)
          arbeitszeitenDetails[arbeitenListe[index]] = zeitMinuten;
        }
      }
    });

    // Umrechnung von Stunden in Minuten für die Datenbank
    const gesamtzeitMinuten = Math.round(gesamtStunden * 60);

    const status = document.getElementById('modalTerminStatus').value;

    // Bestimme Mitarbeiter für Termin (Gesamt-Zuordnung hat Vorrang, sonst Termin-Mitarbeiter)
    // Nur Mitarbeiter können dem Termin direkt zugeordnet werden, nicht Lehrlinge
    let terminMitarbeiterId = termin.mitarbeiter_id || null;
    if (gesamtMitarbeiterValue && gesamtMitarbeiterValue.startsWith('ma_')) {
      terminMitarbeiterId = parseInt(gesamtMitarbeiterValue.replace('ma_', ''), 10);
    }

    try {
      await TermineService.update(this.currentTerminId, {
        tatsaechliche_zeit: gesamtzeitMinuten,
        arbeitszeiten_details: JSON.stringify(arbeitszeitenDetails),
        status: status,
        mitarbeiter_id: terminMitarbeiterId
      });

      this.closeArbeitszeitenModal();
      this.loadTermine();
      this.loadDashboard();
      this.loadAuslastung();
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

    // Montag bis Samstag (6 Tage)
    for (let i = 0; i < 6; i++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      days.push({
        datum: day.toISOString().split('T')[0],
        formatted: day.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
      });
    }

    return days;
  }

  loadKundenSearch() {
    // Beim Öffnen des Tabs: Suchfeld leeren und Ergebnisse ausblenden
    const searchInput = document.getElementById('kundenSearchInput');
    const resultsContainer = document.getElementById('kundenSearchResults');
    const emptyContainer = document.getElementById('kundenSearchEmpty');
    const loadingContainer = document.getElementById('kundenSearchLoading');

    if (searchInput) searchInput.value = '';
    if (resultsContainer) resultsContainer.style.display = 'none';
    if (emptyContainer) emptyContainer.style.display = 'none';
    if (loadingContainer) loadingContainer.style.display = 'none';
  }

  async searchKunden() {
    const searchInput = document.getElementById('kundenSearchInput');
    const resultsContainer = document.getElementById('kundenSearchResults');
    const emptyContainer = document.getElementById('kundenSearchEmpty');
    const loadingContainer = document.getElementById('kundenSearchLoading');
    const resultsContent = document.getElementById('kundenResultsContainer');

    if (!searchInput || !searchInput.value.trim()) {
      alert('Bitte geben Sie einen Suchbegriff ein.');
      return;
    }

    const searchTerm = searchInput.value.trim();

    // Loading-State anzeigen
    if (resultsContainer) resultsContainer.style.display = 'none';
    if (emptyContainer) emptyContainer.style.display = 'none';
    if (loadingContainer) loadingContainer.style.display = 'block';

    try {
      const kunden = await KundenService.search(searchTerm);

      // Loading-State ausblenden
      if (loadingContainer) loadingContainer.style.display = 'none';

      if (!kunden || kunden.length === 0) {
        // Keine Ergebnisse
        if (emptyContainer) emptyContainer.style.display = 'block';
        if (resultsContainer) resultsContainer.style.display = 'none';
        return;
      }

      // Ergebnisse anzeigen
      if (emptyContainer) emptyContainer.style.display = 'none';
      if (resultsContainer) resultsContainer.style.display = 'block';
      
      // Ergebnisse rendern
      if (resultsContent) {
        resultsContent.innerHTML = kunden.map(kunde => this.renderKundeWithTermine(kunde)).join('');
      }
    } catch (error) {
      console.error('Fehler bei der Kundensuche:', error);
      alert('Fehler bei der Suche: ' + (error.message || 'Unbekannter Fehler'));
      if (loadingContainer) loadingContainer.style.display = 'none';
    }
  }

  renderKundeWithTermine(kunde) {
    const termineHtml = kunde.termine && kunde.termine.length > 0
      ? `
        <div style="margin-top: 15px;">
          <h4 style="margin-bottom: 10px; color: var(--steel);">Terminhistorie (${kunde.termine.length})</h4>
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <thead>
              <tr style="background: #f5f7fa; border-bottom: 2px solid #ddd;">
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Datum</th>
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Termin-Nr</th>
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Kennzeichen</th>
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Arbeit</th>
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Umfang</th>
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Zeit</th>
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${kunde.termine.map(termin => `
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 10px;">${this.formatDateShort(termin.datum)}</td>
                  <td style="padding: 10px;">${termin.termin_nr || '-'}</td>
                  <td style="padding: 10px;">${termin.kennzeichen || '-'}</td>
                  <td style="padding: 10px;">${termin.arbeit || '-'}</td>
                  <td style="padding: 10px;">${termin.umfang || '-'}</td>
                  <td style="padding: 10px;">${this.formatZeit(termin.tatsaechliche_zeit)}</td>
                  <td style="padding: 10px;">
                    <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; 
                      background: ${this.getStatusColor(termin.status)}; 
                      color: white;">
                      ${this.getStatusText(termin.status)}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      : '<p style="margin-top: 15px; color: #666; font-style: italic;">Keine Termine vorhanden</p>';

    return `
      <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h3 style="margin-top: 0; color: var(--accent);">${kunde.name || 'Unbekannt'}</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px;">
          ${kunde.telefon ? `<div><strong>Telefon:</strong> ${kunde.telefon}</div>` : ''}
          ${kunde.email ? `<div><strong>E-Mail:</strong> ${kunde.email}</div>` : ''}
          ${kunde.adresse ? `<div><strong>Adresse:</strong> ${kunde.adresse}</div>` : ''}
        </div>
        ${termineHtml}
      </div>
    `;
  }

  formatDateShort(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatZeit(minuten) {
    if (!minuten || minuten === 0) return '-';
    const stunden = (Number(minuten) || 0) / 60;
    return `${stunden.toFixed(2)} h`;
  }

  getStatusColor(status) {
    const colors = {
      'geplant': '#4a90e2',
      'in_arbeit': '#f39c12',
      'abgeschlossen': '#27ae60',
      'abgesagt': '#e74c3c'
    };
    return colors[status] || '#95a5a6';
  }

  getStatusText(status) {
    const texts = {
      'geplant': 'Geplant',
      'in_arbeit': 'In Arbeit',
      'abgeschlossen': 'Abgeschlossen',
      'abgesagt': 'Abgesagt'
    };
    return texts[status] || status || 'Unbekannt';
  }
}

const app = new App();
