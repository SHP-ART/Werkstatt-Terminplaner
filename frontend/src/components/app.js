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

  // Hilfsfunktion: Datum lokal formatieren (YYYY-MM-DD) ohne Zeitzonenkonvertierung
  formatDateLocal(date) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  init() {
    this.setupEventListeners();
    this.loadInitialData();
    this.setTodayDate();
    this.setInternerTerminTodayDate();
    this.loadInternerTerminMitarbeiter();
    this.setupWebSocket();
    this.setupErsatzautoOptionHandlers();
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
    
    // Ersatzauto-Formular
    const ersatzautoForm = document.getElementById('ersatzautoForm');
    if (ersatzautoForm) {
      ersatzautoForm.addEventListener('submit', (e) => this.handleErsatzautoSubmit(e));
    }

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
    
    // Excel Import Event-Listener
    const excelFileInput = document.getElementById('excelFileInput');
    if (excelFileInput) {
      excelFileInput.addEventListener('change', (e) => this.handleExcelFileSelect(e));
    }
    const confirmImportBtn = document.getElementById('confirmImportBtn');
    if (confirmImportBtn) {
      confirmImportBtn.addEventListener('click', () => this.confirmExcelImport());
    }
    const cancelImportBtn = document.getElementById('cancelImportBtn');
    if (cancelImportBtn) {
      cancelImportBtn.addEventListener('click', () => this.cancelExcelImport());
    }
    
    // Kundenliste-Suche Event-Listener
    const kundenListeSuche = document.getElementById('kundenListeSuche');
    if (kundenListeSuche) {
      kundenListeSuche.addEventListener('input', () => this.filterKundenListe());
      kundenListeSuche.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.clearKundenSuche();
        }
      });
    }
    const kundenSucheClearBtn = document.getElementById('kundenSucheClearBtn');
    if (kundenSucheClearBtn) {
      kundenSucheClearBtn.addEventListener('click', () => this.clearKundenSuche());
    }
    
    document.getElementById('terminSchnellsuche').addEventListener('change', () => this.handleTerminSchnellsuche());
    document.getElementById('terminSchnellsuche').addEventListener('input', () => this.updateSchnellsucheStatus());
    document.getElementById('terminSchnellsuche').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleTerminSchnellsuche();
      }
    });
    document.getElementById('abholung_typ').addEventListener('change', () => this.toggleAbholungDetails());

    // Ersatzauto Verfügbarkeit prüfen
    document.getElementById('ersatzauto').addEventListener('change', () => this.checkErsatzautoVerfuegbarkeit());
    document.getElementById('datum').addEventListener('change', () => this.checkErsatzautoVerfuegbarkeit());

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

    // Termin bearbeiten Event-Listener
    const editTerminLadenBtn = document.getElementById('editTerminLadenBtn');
    if (editTerminLadenBtn) {
      editTerminLadenBtn.addEventListener('click', () => this.loadEditTermine());
    }
    const editTerminDatum = document.getElementById('editTerminDatum');
    if (editTerminDatum) {
      editTerminDatum.addEventListener('change', () => this.loadEditTermine());
    }
    const editTerminAuswahl = document.getElementById('editTerminAuswahl');
    if (editTerminAuswahl) {
      editTerminAuswahl.addEventListener('change', () => this.loadTerminZumBearbeiten());
    }
    const terminEditForm = document.getElementById('terminEditForm');
    if (terminEditForm) {
      terminEditForm.addEventListener('submit', (e) => this.handleTerminEditSubmit(e));
    }
    const editTerminAbbrechenBtn = document.getElementById('editTerminAbbrechenBtn');
    if (editTerminAbbrechenBtn) {
      editTerminAbbrechenBtn.addEventListener('click', () => this.resetTerminEditForm());
    }
    const editAbholungTyp = document.getElementById('edit_abholung_typ');
    if (editAbholungTyp) {
      editAbholungTyp.addEventListener('change', () => this.toggleEditAbholungDetails());
    }
    const editErsatzauto = document.getElementById('edit_ersatzauto');
    if (editErsatzauto) {
      editErsatzauto.addEventListener('change', () => this.checkEditErsatzautoVerfuegbarkeit());
    }
    const editDatum = document.getElementById('edit_datum');
    if (editDatum) {
      editDatum.addEventListener('change', () => {
        this.checkEditErsatzautoVerfuegbarkeit();
        this.loadEditTerminAuslastungAnzeige();
      });
    }
    const editArbeitEingabe = document.getElementById('edit_arbeitEingabe');
    if (editArbeitEingabe) {
      editArbeitEingabe.addEventListener('input', () => this.updateEditZeitschaetzung());
    }

    // Phasen-System Event-Listener
    const mehrtaegigCheckbox = document.getElementById('mehrtaegigCheckbox');
    if (mehrtaegigCheckbox) {
      mehrtaegigCheckbox.addEventListener('change', () => this.togglePhasenSection());
    }
    const addPhaseBtn = document.getElementById('addPhaseBtn');
    if (addPhaseBtn) {
      addPhaseBtn.addEventListener('click', () => this.addPhase());
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

    // Kalender-Picker Event-Listener
    this.setupAuslastungKalender();

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
    document.getElementById('closeTagesUebersicht').addEventListener('click', () => this.closeTagesUebersichtModal());
    document.getElementById('saveArbeitszeitenBtn').addEventListener('click', () => this.saveArbeitszeitenModal());

    // Modal Phasen Event-Listener
    const modalMehrtaegigCheckbox = document.getElementById('modalMehrtaegigCheckbox');
    if (modalMehrtaegigCheckbox) {
      modalMehrtaegigCheckbox.addEventListener('change', () => this.toggleModalPhasenSection());
    }
    const modalAddPhaseBtn = document.getElementById('modalAddPhaseBtn');
    if (modalAddPhaseBtn) {
      modalAddPhaseBtn.addEventListener('click', () => this.addModalPhase());
    }

    window.addEventListener('click', (event) => {
      const modal = document.getElementById('modal');
      const detailsModal = document.getElementById('terminDetailsModal');
      const arbeitszeitenModal = document.getElementById('arbeitszeitenModal');
      const tagesUebersichtModal = document.getElementById('tagesUebersichtModal');
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
      if (event.target === tagesUebersichtModal) {
        this.closeTagesUebersichtModal();
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

  async checkErsatzautoVerfuegbarkeit() {
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
      } else {
        statusEl.className = 'ersatzauto-status nicht-verfuegbar';
        text.textContent = `Alle ${verfuegbarkeit.gesamt} vergeben`;
      }
    } catch (error) {
      console.error('Fehler beim Prüfen der Ersatzauto-Verfügbarkeit:', error);
      statusEl.style.display = 'none';
    }
  }

  // Validiere Ersatzauto-Eingaben
  validateErsatzautoEingaben() {
    const checkbox = document.getElementById('ersatzauto');
    if (!checkbox || !checkbox.checked) return true; // Kein Ersatzauto = OK
    
    const abholungTyp = document.getElementById('abholung_typ').value;
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

  // Event-Handler für Ersatzauto-Optionen (vereinfacht)
  setupErsatzautoOptionHandlers() {
    // Keine speziellen Handler mehr nötig - nur noch Tage-Feld
  }

  setTodayDate() {
    const today = this.formatDateLocal(new Date());
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
    const today = this.formatDateLocal(new Date());
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
    
    // Schnellsuche-Status ausblenden
    const schnellsucheStatus = document.getElementById('schnellsucheStatus');
    if (schnellsucheStatus) {
      schnellsucheStatus.style.display = 'none';
    }

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

    // Warnung verstecken
    this.hideTerminWarnung();

    // Abholung-Details korrekt anzeigen
    this.toggleAbholungDetails();
    
    // Phasen zurücksetzen
    this.resetPhasen();
  }

  // === TERMIN BEARBEITEN METHODEN ===

  async loadEditTermine() {
    const datumInput = document.getElementById('editTerminDatum');
    const select = document.getElementById('editTerminAuswahl');
    
    if (!datumInput || !select) return;
    
    // Setze heute als Standard wenn kein Datum
    if (!datumInput.value) {
      datumInput.value = this.formatDateLocal(new Date());
    }
    
    const datum = datumInput.value;
    
    try {
      const termine = await TermineService.getAll(datum);
      
      // Filter: Nur nicht-interne Termine (mit Kennzeichen)
      const filteredTermine = termine.filter(t => t.kennzeichen && t.kennzeichen.trim() !== '' && t.kennzeichen !== 'INTERN');
      
      select.innerHTML = '<option value="">-- Termin wählen --</option>';
      
      if (filteredTermine.length === 0) {
        select.innerHTML += '<option value="" disabled>Keine Termine an diesem Tag</option>';
      } else {
        filteredTermine.forEach(termin => {
          const kundeName = termin.kunde_name || 'Unbekannt';
          const arbeitKurz = (termin.arbeit || '').substring(0, 40) + ((termin.arbeit || '').length > 40 ? '...' : '');
          select.innerHTML += `<option value="${termin.id}">${termin.kennzeichen} - ${kundeName} (${arbeitKurz})</option>`;
        });
      }
      
      // Formular verstecken
      this.resetTerminEditForm();
    } catch (error) {
      console.error('Fehler beim Laden der Termine:', error);
      select.innerHTML = '<option value="">Fehler beim Laden</option>';
    }
  }

  async loadTerminZumBearbeiten() {
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
      
      // Arbeiten als mehrzeiligen Text
      const arbeitText = (termin.arbeit || '').split(',').map(a => a.trim()).join('\n');
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
      
    } catch (error) {
      console.error('Fehler beim Laden des Termins:', error);
      alert('Fehler beim Laden des Termins.');
    }
  }

  resetTerminEditForm() {
    document.getElementById('editTerminFormContainer').style.display = 'none';
    document.getElementById('editTerminKeinAusgewaehlt').style.display = 'block';
    
    const form = document.getElementById('terminEditForm');
    if (form) {
      form.reset();
    }
    
    const select = document.getElementById('editTerminAuswahl');
    if (select) {
      select.value = '';
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
  }

  toggleEditAbholungDetails() {
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
  }

  async checkEditErsatzautoVerfuegbarkeit() {
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
  }

  updateEditZeitschaetzung() {
    const arbeitText = document.getElementById('edit_arbeitEingabe').value.trim();
    const anzeige = document.getElementById('editZeitschaetzungAnzeige');
    const wertEl = document.getElementById('editZeitschaetzungWert');
    const detailsEl = document.getElementById('editZeitschaetzungDetails');
    
    if (!arbeitText || !anzeige || !wertEl) return;
    
    const arbeiten = this.parseArbeiten(arbeitText);
    if (arbeiten.length === 0) {
      anzeige.style.display = 'none';
      return;
    }
    
    // Berechne die Zeiten für jede Arbeit
    let gesamtMinuten = 0;
    const details = [];
    
    arbeiten.forEach(arbeit => {
      // Suche nach der Arbeit in den Standardzeiten (case-insensitive)
      const gefunden = this.arbeitszeiten.find(
        az => az.bezeichnung.toLowerCase() === arbeit.toLowerCase()
      );
      
      if (gefunden) {
        const minuten = gefunden.standard_minuten || 0;
        gesamtMinuten += minuten;
        details.push(`✓ ${arbeit}: ${minuten} min`);
      } else {
        details.push(`⚠️ ${arbeit}: keine Standardzeit`);
      }
    });
    
    // Formatiere die Gesamtzeit
    const gesamtStunden = Math.floor(gesamtMinuten / 60);
    const gesamtRestMinuten = gesamtMinuten % 60;
    let gesamtZeitStr = '';
    
    if (gesamtMinuten === 0) {
      gesamtZeitStr = 'Keine Standardzeiten';
    } else if (gesamtStunden > 0 && gesamtRestMinuten > 0) {
      gesamtZeitStr = `${gesamtStunden} h ${gesamtRestMinuten} min`;
    } else if (gesamtStunden > 0) {
      gesamtZeitStr = `${gesamtStunden} h`;
    } else {
      gesamtZeitStr = `${gesamtRestMinuten} min`;
    }
    
    anzeige.style.display = 'block';
    wertEl.textContent = gesamtZeitStr;
    
    if (detailsEl) {
      detailsEl.innerHTML = details.join(' | ');
    }
  }

  async loadEditTerminAuslastungAnzeige() {
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
    } catch (error) {
      console.error('Fehler beim Laden der Auslastung:', error);
      anzeige.style.display = 'none';
    }
  }

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
      arbeit: arbeitenListe.join(', '),
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
      this.loadDashboard();
      this.loadArbeitszeiten();
      this.loadTermineZeiten();
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Termins:', error);
      alert('Fehler beim Aktualisieren des Termins: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  // === ENDE TERMIN BEARBEITEN METHODEN ===

  // === PHASEN-SYSTEM METHODEN ===

  phasenCounter = 0;
  phasenData = [];

  togglePhasenSection() {
    const checkbox = document.getElementById('mehrtaegigCheckbox');
    const phasenSection = document.getElementById('phasenSection');
    
    if (checkbox && phasenSection) {
      phasenSection.style.display = checkbox.checked ? 'block' : 'none';
      
      // Wenn aktiviert und keine Phasen vorhanden, füge erste Phase hinzu
      if (checkbox.checked && this.phasenData.length === 0) {
        this.addPhase();
      }
    }
  }

  addPhase() {
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
  }

  removePhase(phaseId) {
    const phaseElement = document.getElementById(`phase_${phaseId}`);
    if (phaseElement) {
      phaseElement.remove();
      this.phasenData = this.phasenData.filter(p => p.id !== phaseId);
    }
  }

  getPhasenFromForm() {
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
  }

  resetPhasen() {
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

  // Erstellt Folgetermine aus den Phasen (außer der ersten Phase = Haupttermin)
  async erstelleFolgetermineAusPhasen(hauptTermin, phasen, hauptTerminNr) {
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

  handleTabChange(e) {
    // closest() verwenden, falls auf ein Kind-Element (z.B. <span>) geklickt wurde
    const button = e.target.closest('.tab-button');
    if (!button) return;
    
    const tabName = button.dataset.tab;
    if (!tabName) return;

    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });

    document.querySelectorAll('.tab-button').forEach(button => {
      button.classList.remove('active');
    });

    document.getElementById(tabName).classList.add('active');
    button.classList.add('active');

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
    } else if (tabName === 'ersatzautos') {
      this.loadErsatzautos();
    }
  }

  handleSubTabChange(e) {
    // Finde den Button, auch wenn auf ein inneres Element geklickt wurde
    const button = e.target.closest('.sub-tab-button');
    if (!button) return;
    
    const subTabName = button.dataset.subtab;
    if (!subTabName) return;

    // Finde den direkten Parent-Container der sub-tabs
    const subTabsContainer = button.closest('.sub-tabs');
    const parentContainer = subTabsContainer.parentElement;

    // Entferne active nur von Geschwister-Elementen (siblings)
    Array.from(parentContainer.children).forEach(child => {
      if (child.classList.contains('sub-tab-content')) {
        child.classList.remove('active');
      }
    });

    Array.from(subTabsContainer.children).forEach(btn => {
      if (btn.classList.contains('sub-tab-button')) {
        btn.classList.remove('active');
      }
    });

    const targetContent = document.getElementById(subTabName);
    if (targetContent) {
      targetContent.classList.add('active');
    }
    button.classList.add('active');

    if (subTabName === 'mitarbeiter') {
      this.loadWerkstattSettings();
      this.loadMitarbeiter();
      this.loadLehrlinge();
      this.loadAbwesenheitenPersonen();
      this.loadUrlaubListe();
    }

    if (subTabName === 'terminBearbeiten') {
      // Setze heute als Datum und lade Termine
      const datumInput = document.getElementById('editTerminDatum');
      if (datumInput && !datumInput.value) {
        datumInput.value = this.formatDateLocal(new Date());
      }
      this.loadEditTermine();
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
    this.loadTermineCache(); // Lade alle Termine für Cache
    this.loadTermine();
    this.loadArbeitszeiten();
    this.loadDashboard();
    this.loadWerkstattSettings();
    this.loadTermineZeiten();
    this.heuteTermine = [];
  }

  async loadTermineCache() {
    // Lade alle Termine (ohne Datum-Filter) für den Cache
    try {
      const alleTermine = await TermineService.getAll(null);
      this.termineCache = alleTermine;
      this.updateTerminSuchliste();
    } catch (error) {
      console.error('Fehler beim Laden des Termin-Caches:', error);
    }
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

      // Render die gefilterte Liste (oder alle wenn kein Suchbegriff)
      const sucheInput = document.getElementById('kundenListeSuche');
      const suchBegriff = sucheInput ? sucheInput.value.trim() : '';
      this.renderKundenListe(kunden, suchBegriff);

      this.updateTerminSuchliste();
    } catch (error) {
      console.error('Fehler beim Laden der Kunden:', error);
      alert('Fehler beim Laden der Kunden. Ist das Backend gestartet?');
    }
  }

  renderKundenListe(kunden, suchBegriff = '') {
    const tbody = document.getElementById('kundenTable')?.getElementsByTagName('tbody')[0];
    if (!tbody) return;

    // Update Badge
    const badge = document.getElementById('kundenAnzahlBadge');
    
    // Clear-Button anzeigen/verstecken
    const clearBtn = document.getElementById('kundenSucheClearBtn');
    if (clearBtn) {
      clearBtn.style.display = suchBegriff ? 'block' : 'none';
    }

    tbody.innerHTML = '';

    // Ohne Suchbegriff: Zeige Hinweis statt voller Liste
    if (!suchBegriff || suchBegriff.length < 2) {
      if (badge) {
        badge.textContent = `${kunden.length} Kunden gespeichert`;
        badge.classList.remove('filtered');
      }
      const row = tbody.insertRow();
      row.innerHTML = `<td colspan="7" class="suche-hinweis">🔍 Geben Sie mindestens 2 Zeichen ein, um Kunden zu suchen</td>`;
      return;
    }

    // Filtere Kunden basierend auf Suchbegriff
    const lower = suchBegriff.toLowerCase();
    const gefilterteKunden = kunden.filter(kunde => {
      return (kunde.name && kunde.name.toLowerCase().includes(lower)) ||
             (kunde.telefon && kunde.telefon.toLowerCase().includes(lower)) ||
             (kunde.email && kunde.email.toLowerCase().includes(lower)) ||
             (kunde.kennzeichen && kunde.kennzeichen.toLowerCase().includes(lower)) ||
             (kunde.fahrzeugtyp && kunde.fahrzeugtyp.toLowerCase().includes(lower)) ||
             (kunde.locosoft_id && kunde.locosoft_id.toLowerCase().includes(lower));
    });

    if (badge) {
      badge.textContent = `${gefilterteKunden.length} von ${kunden.length} Kunden`;
      badge.classList.add('filtered');
    }
    
    if (gefilterteKunden.length === 0) {
      const row = tbody.insertRow();
      row.innerHTML = `<td colspan="7" class="keine-ergebnisse">Keine Kunden gefunden für "${this.escapeHtml(suchBegriff)}"</td>`;
      return;
    }

    // Begrenze auf max. 100 Ergebnisse für Performance
    const maxResults = 100;
    const anzeigeKunden = gefilterteKunden.slice(0, maxResults);

    anzeigeKunden.forEach(kunde => {
      const row = tbody.insertRow();
      row.innerHTML = `
        <td>${this.highlightMatch(kunde.name || '', suchBegriff)}</td>
        <td>${this.highlightMatch(kunde.telefon || '-', suchBegriff)}</td>
        <td>${this.highlightMatch(kunde.email || '-', suchBegriff)}</td>
        <td>${this.highlightMatch(kunde.kennzeichen || '-', suchBegriff)}</td>
        <td>${this.highlightMatch(kunde.fahrzeugtyp || '-', suchBegriff)}</td>
        <td>${this.highlightMatch(kunde.locosoft_id || '-', suchBegriff)}</td>
        <td>
          <button class="btn btn-small btn-secondary" onclick="app.editKunde(${kunde.id})" title="Bearbeiten">✏️</button>
          <button class="btn btn-small btn-danger" onclick="app.deleteKunde(${kunde.id}, '${(kunde.name || '').replace(/'/g, "\\'")}')">🗑️</button>
        </td>
      `;
    });

    // Hinweis wenn mehr Ergebnisse vorhanden
    if (gefilterteKunden.length > maxResults) {
      const row = tbody.insertRow();
      row.innerHTML = `<td colspan="7" class="mehr-ergebnisse">... und ${gefilterteKunden.length - maxResults} weitere Treffer. Verfeinern Sie Ihre Suche.</td>`;
    }
  }

  highlightMatch(text, suchBegriff) {
    if (!suchBegriff || !text || text === '-') return this.escapeHtml(text);
    
    const escaped = this.escapeHtml(text);
    const lower = escaped.toLowerCase();
    const searchLower = suchBegriff.toLowerCase();
    const index = lower.indexOf(searchLower);
    
    if (index === -1) return escaped;
    
    const before = escaped.substring(0, index);
    const match = escaped.substring(index, index + suchBegriff.length);
    const after = escaped.substring(index + suchBegriff.length);
    
    return `${before}<mark class="highlight">${match}</mark>${after}`;
  }

  filterKundenListe() {
    const sucheInput = document.getElementById('kundenListeSuche');
    const suchBegriff = sucheInput ? sucheInput.value.trim() : '';
    this.renderKundenListe(this.kundenCache || [], suchBegriff);
  }

  clearKundenSuche() {
    const sucheInput = document.getElementById('kundenListeSuche');
    if (sucheInput) {
      sucheInput.value = '';
      sucheInput.focus();
    }
    this.filterKundenListe();
  }

  async handleKundenSubmit(e) {
    e.preventDefault();

    const form = document.getElementById('kundenForm');
    const editId = form.dataset.editId;

    const kunde = {
      name: document.getElementById('kunde_name').value,
      telefon: document.getElementById('telefon').value,
      email: document.getElementById('email').value,
      adresse: document.getElementById('adresse').value,
      locosoft_id: document.getElementById('locosoft_id').value,
      kennzeichen: document.getElementById('kunde_kennzeichen')?.value?.trim().toUpperCase() || null,
      vin: document.getElementById('kunde_vin')?.value?.trim().toUpperCase() || null,
      fahrzeugtyp: document.getElementById('kunde_fahrzeugtyp')?.value?.trim() || null
    };

    try {
      if (editId) {
        // Update bestehenden Kunden
        await KundenService.update(editId, kunde);
        alert('Kunde erfolgreich aktualisiert!');
        delete form.dataset.editId;
        
        // Button zurücksetzen
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Kunde anlegen';
        submitBtn.classList.remove('btn-warning');
      } else {
        // Neuen Kunden anlegen
        await KundenService.create(kunde);
        alert('Kunde erfolgreich angelegt!');
      }
      
      form.reset();
      this.loadKunden();
    } catch (error) {
      console.error('Fehler beim Speichern des Kunden:', error);
      alert('Fehler beim Speichern des Kunden');
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

  // Excel Import Handler
  async handleExcelFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = document.getElementById('selectedFileName');
    fileName.textContent = `📄 ${file.name}`;

    try {
      const data = await this.readExcelFile(file);
      await this.prepareImportPreview(data);
    } catch (error) {
      console.error('Fehler beim Lesen der Excel-Datei:', error);
      alert('Fehler beim Lesen der Datei: ' + error.message);
    }
  }

  readExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
          resolve(jsonData);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  async prepareImportPreview(excelData) {
    const preview = document.getElementById('importPreview');
    const stats = document.getElementById('importStats');
    const warnings = document.getElementById('importWarnings');
    const tableContainer = document.getElementById('importPreviewTable');

    // Lade existierende Kunden für Duplikat-Check
    const existingKunden = this.kundenCache || [];
    
    // Normalisiere Spaltennamen (verschiedene Schreibweisen unterstützen)
    const normalizedData = excelData.map(row => {
      const normalized = {};
      let fabrikat = '';
      let modell = '';
      let vorname = '';
      
      for (const [key, value] of Object.entries(row)) {
        const lowerKey = key.toLowerCase().trim().replace(/\n/g, '');
        const strValue = String(value || '').trim();
        
        if (lowerKey === 'name' || (lowerKey.includes('name') && !lowerKey.includes('datei') && !lowerKey.includes('vorname'))) {
          normalized.name = strValue;
        } else if (lowerKey === 'vorname' || lowerKey.includes('vorname')) {
          vorname = strValue;
        } else if (lowerKey.includes('telefon') || lowerKey.includes('tel') || lowerKey.includes('phone')) {
          normalized.telefon = strValue;
        } else if (lowerKey.includes('email') || lowerKey.includes('e-mail') || lowerKey.includes('mail')) {
          normalized.email = strValue;
        } else if (lowerKey.includes('adresse') || lowerKey.includes('address') || lowerKey.includes('anschrift')) {
          normalized.adresse = strValue;
        } else if (lowerKey.includes('kennzeichen') || lowerKey.includes('nummernschild') || lowerKey.includes('kfz')) {
          normalized.kennzeichen = strValue.toUpperCase();
        } else if (lowerKey.includes('fabrikat') || lowerKey.includes('marke') || lowerKey.includes('hersteller')) {
          fabrikat = strValue;
        } else if (lowerKey.includes('modell') || lowerKey.includes('typ')) {
          modell = strValue;
        } else if (lowerKey.includes('fahrzeug') || lowerKey.includes('auto')) {
          normalized.fahrzeugtyp = strValue;
        } else if (lowerKey.includes('vin') || lowerKey.includes('fahrgestell') || lowerKey.includes('fg-nr') || lowerKey === 'fg-nr') {
          normalized.vin = strValue.replace(/\n/g, '');
        } else if (lowerKey.includes('km') || lowerKey.includes('kilometer')) {
          normalized.kmStand = strValue;
        }
      }
      
      // Kombiniere Fabrikat und Modell zu Fahrzeugtyp
      if (!normalized.fahrzeugtyp && (fabrikat || modell)) {
        normalized.fahrzeugtyp = [fabrikat, modell].filter(x => x && x.trim()).join(' ');
      }
      
      // Kombiniere Name und Vorname wenn beide vorhanden
      if (vorname && vorname.trim() && normalized.name) {
        normalized.name = `${normalized.name}, ${vorname}`.trim();
      }
      
      return normalized;
    }).filter(row => row.name); // Nur Zeilen mit Namen

    // Duplikate und Warnungen sammeln
    const warningsList = [];
    const existingNames = new Set(existingKunden.map(k => k.name?.toLowerCase()));
    const existingKennzeichen = new Set(existingKunden.map(k => k.kennzeichen?.toUpperCase()).filter(k => k));
    
    // Sammle auch Kennzeichen aus Terminen
    const termineKennzeichen = new Set();
    if (this.termineCache) {
      this.termineCache.forEach(t => {
        if (t.kennzeichen) termineKennzeichen.add(t.kennzeichen.toUpperCase());
      });
    }

    const importNamesCount = {};
    const importKennzeichenCount = {};

    normalizedData.forEach((row, index) => {
      // Zähle Namen in Import-Daten
      const nameLower = row.name.toLowerCase();
      importNamesCount[nameLower] = (importNamesCount[nameLower] || 0) + 1;

      // Zähle Kennzeichen in Import-Daten
      if (row.kennzeichen) {
        const kz = row.kennzeichen.toUpperCase();
        importKennzeichenCount[kz] = (importKennzeichenCount[kz] || 0) + 1;
      }

      // Prüfe auf existierende Duplikate
      if (existingNames.has(nameLower)) {
        row._warnung = 'name_existiert';
        warningsList.push(`⚠️ Zeile ${index + 1}: Name "${row.name}" existiert bereits in der Datenbank`);
      }

      if (row.kennzeichen && existingKennzeichen.has(row.kennzeichen)) {
        row._warnung = (row._warnung || '') + '_kennzeichen_existiert';
        warningsList.push(`⚠️ Zeile ${index + 1}: Kennzeichen "${row.kennzeichen}" existiert bereits bei einem Kunden`);
      }

      if (row.kennzeichen && termineKennzeichen.has(row.kennzeichen)) {
        row._info = 'kennzeichen_in_terminen';
      }
    });

    // Prüfe auf Duplikate innerhalb der Import-Datei
    normalizedData.forEach((row, index) => {
      const nameLower = row.name.toLowerCase();
      if (importNamesCount[nameLower] > 1) {
        row._mehrfach = true;
        if (!row._warnung?.includes('mehrfach')) {
          row._info = (row._info || '') + '_mehrfach_name';
        }
      }
      
      if (row.kennzeichen && importKennzeichenCount[row.kennzeichen] > 1) {
        row._warnung = (row._warnung || '') + '_kennzeichen_mehrfach';
        if (!warningsList.some(w => w.includes(`Kennzeichen "${row.kennzeichen}" mehrfach`))) {
          warningsList.push(`⚠️ Kennzeichen "${row.kennzeichen}" kommt mehrfach in der Importdatei vor`);
        }
      }
    });

    // Speichere für späteren Import
    this.pendingImportData = normalizedData;

    // Statistik anzeigen
    const uniqueNames = new Set(normalizedData.map(r => r.name.toLowerCase())).size;
    const uniqueKennzeichen = new Set(normalizedData.filter(r => r.kennzeichen).map(r => r.kennzeichen)).size;
    const kundenMitMehrfachFahrzeugen = Object.values(importNamesCount).filter(c => c > 1).length;

    stats.innerHTML = `
      <div class="stat-item">📋 <strong>${normalizedData.length}</strong> Zeilen gefunden</div>
      <div class="stat-item">👥 <strong>${uniqueNames}</strong> verschiedene Kunden</div>
      <div class="stat-item">🚗 <strong>${uniqueKennzeichen}</strong> verschiedene Kennzeichen</div>
      ${kundenMitMehrfachFahrzeugen > 0 ? `<div class="stat-item">🔄 <strong>${kundenMitMehrfachFahrzeugen}</strong> Kunden mit mehreren Fahrzeugen</div>` : ''}
    `;

    // Warnungen anzeigen
    if (warningsList.length > 0) {
      warnings.innerHTML = `
        <div class="warnings-header">⚠️ ${warningsList.length} Hinweise:</div>
        <ul class="warnings-list">
          ${warningsList.slice(0, 10).map(w => `<li>${w}</li>`).join('')}
          ${warningsList.length > 10 ? `<li>... und ${warningsList.length - 10} weitere</li>` : ''}
        </ul>
      `;
      warnings.style.display = 'block';
    } else {
      warnings.innerHTML = '<div class="no-warnings">✅ Keine Duplikate gefunden</div>';
      warnings.style.display = 'block';
    }

    // Vorschau-Tabelle erstellen
    tableContainer.innerHTML = `
      <table class="preview-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Telefon</th>
            <th>Email</th>
            <th>Kennzeichen</th>
            <th>Fahrzeug</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${normalizedData.slice(0, 50).map((row, i) => `
            <tr class="${row._warnung ? 'warning-row' : ''} ${row._mehrfach ? 'mehrfach-row' : ''}">
              <td>${i + 1}</td>
              <td>${this.escapeHtml(row.name)}${row._mehrfach ? ' <span class="badge-mehrfach">👥 Mehrfach</span>' : ''}</td>
              <td>${this.escapeHtml(row.telefon || '-')}</td>
              <td>${this.escapeHtml(row.email || '-')}</td>
              <td>${this.escapeHtml(row.kennzeichen || '-')}</td>
              <td>${this.escapeHtml(row.fahrzeugtyp || '-')}</td>
              <td>
                ${row._warnung?.includes('name_existiert') ? '<span class="badge-warning">Name existiert</span>' : ''}
                ${row._warnung?.includes('kennzeichen_existiert') ? '<span class="badge-warning">Kennz. existiert</span>' : ''}
                ${row._warnung?.includes('kennzeichen_mehrfach') ? '<span class="badge-danger">Kennz. mehrfach!</span>' : ''}
                ${!row._warnung ? '<span class="badge-ok">✓ OK</span>' : ''}
              </td>
            </tr>
          `).join('')}
          ${normalizedData.length > 50 ? `<tr><td colspan="7" class="more-rows">... und ${normalizedData.length - 50} weitere Zeilen</td></tr>` : ''}
        </tbody>
      </table>
    `;

    preview.style.display = 'block';
  }

  async confirmExcelImport() {
    if (!this.pendingImportData || this.pendingImportData.length === 0) {
      alert('Keine Daten zum Importieren');
      return;
    }

    // Gruppiere nach Kundenname für intelligenten Import
    const kundenMap = new Map();
    
    this.pendingImportData.forEach(row => {
      const nameLower = row.name.toLowerCase();
      if (!kundenMap.has(nameLower)) {
        kundenMap.set(nameLower, {
          name: row.name,
          telefon: row.telefon,
          email: row.email,
          adresse: row.adresse,
          fahrzeuge: []
        });
      }
      
      const kunde = kundenMap.get(nameLower);
      // Ergänze fehlende Kontaktdaten
      if (!kunde.telefon && row.telefon) kunde.telefon = row.telefon;
      if (!kunde.email && row.email) kunde.email = row.email;
      if (!kunde.adresse && row.adresse) kunde.adresse = row.adresse;
      
      // Füge Fahrzeug hinzu wenn vorhanden
      if (row.kennzeichen) {
        kunde.fahrzeuge.push({
          kennzeichen: row.kennzeichen,
          fahrzeugtyp: row.fahrzeugtyp || '',
          vin: row.vin || ''
        });
      }
    });

    // Bestätigungsdialog
    const kundenCount = kundenMap.size;
    const fahrzeugCount = Array.from(kundenMap.values()).reduce((sum, k) => sum + k.fahrzeuge.length, 0);
    
    if (!confirm(`Import starten?\n\n${kundenCount} Kunden mit ${fahrzeugCount} Fahrzeugen werden importiert.\n\nHinweis: Bei Kunden mit mehreren Fahrzeugen wird das erste Fahrzeug als Hauptkennzeichen gespeichert.`)) {
      return;
    }

    try {
      // Bereite Kunden für API-Import vor
      const kundenZuImportieren = [];
      
      kundenMap.forEach((kundeData) => {
        const ersteFahrzeug = kundeData.fahrzeuge[0] || {};
        kundenZuImportieren.push({
          name: kundeData.name,
          telefon: kundeData.telefon || '',
          email: kundeData.email || '',
          adresse: kundeData.adresse || '',
          kennzeichen: ersteFahrzeug.kennzeichen || '',
          fahrzeugtyp: ersteFahrzeug.fahrzeugtyp || '',
          vin: ersteFahrzeug.vin || '',
          // Speichere alle Fahrzeuge als Info in Notizen falls mehrere
          notizen: kundeData.fahrzeuge.length > 1 
            ? 'Weitere Fahrzeuge: ' + kundeData.fahrzeuge.slice(1).map(f => f.kennzeichen).join(', ')
            : ''
        });
      });

      const result = await KundenService.import(kundenZuImportieren);
      alert(`✅ Import erfolgreich!\n\n${result.message}`);
      
      // Aufräumen
      this.cancelExcelImport();
      this.loadKunden();
      
    } catch (error) {
      console.error('Fehler beim Import:', error);
      alert('❌ Fehler beim Import: ' + error.message);
    }
  }

  cancelExcelImport() {
    this.pendingImportData = null;
    document.getElementById('importPreview').style.display = 'none';
    document.getElementById('excelFileInput').value = '';
    document.getElementById('selectedFileName').textContent = '';
  }

  // Kunde bearbeiten
  async editKunde(id) {
    try {
      const kunde = await KundenService.getById(id);
      if (!kunde) {
        alert('Kunde nicht gefunden');
        return;
      }

      // Formular mit Kundendaten füllen
      document.getElementById('kunde_name').value = kunde.name || '';
      document.getElementById('telefon').value = kunde.telefon || '';
      document.getElementById('email').value = kunde.email || '';
      document.getElementById('adresse').value = kunde.adresse || '';
      document.getElementById('locosoft_id').value = kunde.locosoft_id || '';
      document.getElementById('kunde_kennzeichen').value = kunde.kennzeichen || '';
      document.getElementById('kunde_vin').value = kunde.vin || '';
      document.getElementById('kunde_fahrzeugtyp').value = kunde.fahrzeugtyp || '';

      // Speichere ID für Update
      document.getElementById('kundenForm').dataset.editId = id;

      // Button-Text ändern
      const submitBtn = document.getElementById('kundenForm').querySelector('button[type="submit"]');
      submitBtn.textContent = 'Kunde aktualisieren';
      submitBtn.classList.add('btn-warning');

      // Scroll zum Formular
      document.getElementById('kundenForm').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      console.error('Fehler beim Laden des Kunden:', error);
      alert('Fehler beim Laden des Kunden');
    }
  }

  // Kunde löschen
  async deleteKunde(id, name) {
    if (!confirm(`Möchten Sie den Kunden "${name}" wirklich löschen?`)) {
      return;
    }

    try {
      await KundenService.delete(id);
      alert('Kunde erfolgreich gelöscht');
      this.loadKunden();
    } catch (error) {
      console.error('Fehler beim Löschen des Kunden:', error);
      alert('Fehler beim Löschen des Kunden');
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

    // Validiere Ersatzauto-Eingaben
    if (!this.validateErsatzautoEingaben()) {
      alert('Ersatzauto gewünscht: Bitte geben Sie entweder die Anzahl Tage ODER ein Rückgabe-Datum ein.');
      // Scroll zur Ersatzauto-Sektion
      document.getElementById('ersatzautoDauerGroup')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const abholungTyp = document.getElementById('abholung_typ').value;
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

    const termin = {
      kennzeichen: document.getElementById('kennzeichen').value.trim(),
      arbeit: arbeitenListe.join(', '),
      umfang: document.getElementById('umfang').value.trim(),
      geschaetzte_zeit: geschaetzteZeit,
      datum: document.getElementById('datum').value,
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

    // Dringlichkeit auslesen
    const dringlichkeitValue = document.getElementById('intern_dringlichkeit')?.value || null;

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

        // Dringlichkeit-Badge
        const terminDringlichkeit = this.getDringlichkeitBadge(termin.dringlichkeit);
        
        // Folgetermin-Badge
        const terminFolgetermin = this.getFolgeterminBadge(termin.arbeit);
        
        // Arbeit-Anzeige formatieren
        const arbeitAnzeige = this.formatArbeitAnzeige(termin.arbeit);

        row.innerHTML = `
          <td style="text-align: center; font-size: 20px;">${zeitStatusIcon}</td>
          <td><strong>${termin.termin_nr || '-'}</strong>${terminDringlichkeit}${terminFolgetermin}</td>
          <td>${termin.datum}</td>
          <td>${termin.kunde_name}</td>
          <td>${termin.kennzeichen}</td>
          <td>${termin.kilometerstand || '-'}</td>
          <td>${termin.ersatzauto ? 'Ja' : 'Nein'}</td>
          <td title="${termin.arbeit || ''}">${arbeitAnzeige}</td>
          <td>${this.formatZeit(zeitAnzeige)}</td>
          <td>${termin.mitarbeiter_name || '-'}</td>
          <td><span class="status-badge ${statusClass}">${termin.status}</span></td>
          <td class="action-buttons-grid">
            <button class="btn btn-edit action-btn-details" onclick="event.stopPropagation(); app.showTerminDetails(${termin.id})">
              📄 Details
            </button>
            <button class="btn btn-delete-icon" onclick="event.stopPropagation(); app.deleteTermin(${termin.id})" title="Löschen">
              🗑️
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
    
    filterDatum.value = this.formatDateLocal(currentDate);
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
    
    filterDatum.value = this.formatDateLocal(today);
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

          // Dringlichkeit-Badge
          const offeneTerminDringlichkeit = this.getDringlichkeitBadge(termin.dringlichkeit);
          
          // Folgetermin-Badge
          const offeneTerminFolgetermin = this.getFolgeterminBadge(termin.arbeit);
          
          // Arbeit-Anzeige formatieren
          const arbeitAnzeige = this.formatArbeitAnzeige(termin.arbeit);

          row.innerHTML = `
            <td style="text-align: center; font-size: 20px;">${zeitStatusIcon}</td>
            <td><strong>${termin.termin_nr || '-'}</strong>${offeneTerminDringlichkeit}${offeneTerminFolgetermin}</td>
            <td>${termin.datum}</td>
            <td>${termin.kunde_name}</td>
            <td>${termin.kennzeichen}</td>
            <td>${termin.kilometerstand || '-'}</td>
            <td>${termin.ersatzauto ? 'Ja' : 'Nein'}</td>
            <td title="${termin.arbeit || ''}">${arbeitAnzeige}</td>
            <td>${this.formatZeit(zeitAnzeige)}</td>
            <td>${termin.mitarbeiter_name || '-'}</td>
            <td><span class="status-badge ${statusClass}">${termin.status}</span></td>
            <td class="action-buttons-grid">
              <button class="btn btn-edit action-btn-details" onclick="event.stopPropagation(); app.showTerminDetails(${termin.id})">
                📄 Details
              </button>
              <button class="btn btn-delete-icon" onclick="event.stopPropagation(); app.deleteTermin(${termin.id})" title="Löschen">
                🗑️
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

    // Dringlichkeit für Details
    const dringlichkeitText = {
      'dringend': '🔴 Dringend',
      'heute': '🟠 Heute',
      'woche': '🟡 Laufe der Woche'
    }[termin.dringlichkeit] || '-';

    body.innerHTML = `
      <p><strong>Termin-Nr:</strong> ${termin.termin_nr || '-'}</p>
      <p><strong>Datum:</strong> ${termin.datum}</p>
      <p><strong>Kunde:</strong> ${termin.kunde_name || '-'} (${termin.kunde_telefon || '-'})</p>
      <p><strong>Kennzeichen:</strong> ${termin.kennzeichen || '-'}</p>
      <p><strong>Arbeiten:</strong> ${termin.arbeit || '-'}</p>
      <p><strong>Details/Wünsche:</strong> ${termin.umfang || '-'}</p>
      ${termin.dringlichkeit ? `<p><strong>Dringlichkeit:</strong> ${dringlichkeitText}</p>` : ''}
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
            // Nebenzeit wird auf belegte Zeit aufgeschlagen, nicht von Kapazität abgezogen
            const verfuegbar = (l.arbeitsstunden_pro_tag || 8) * 60;
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

      // Lade nicht zugeordnete Termine für diesen Tag
      await this.loadNichtZugeordneteTermine(datum, data);

    } catch (error) {
      console.error('Fehler beim Laden der Auslastung:', error);
    }
  }

  async loadNichtZugeordneteTermine(datum, auslastungData) {
    const section = document.getElementById('nichtZugeordnetSection');
    const container = document.getElementById('nichtZugeordnetContainer');
    const restkapazitaetDetails = document.getElementById('restkapazitaetDetails');
    
    if (!section || !container) return;

    try {
      // Hole alle Termine für den Tag
      const allTermine = await TermineService.getAll();
      const termineAmTag = allTermine.filter(t => t.datum === datum);
      
      // Finde Termine ohne Mitarbeiter-Zuordnung
      const nichtZugeordnet = termineAmTag.filter(termin => {
        // Prüfe ob mitarbeiter_id gesetzt ist
        if (termin.mitarbeiter_id) return false;
        
        // Prüfe auch arbeitszeiten_details auf Zuordnungen
        if (termin.arbeitszeiten_details) {
          try {
            const details = JSON.parse(termin.arbeitszeiten_details);
            if (details._gesamt_mitarbeiter_id) return false;
            // Prüfe auch einzelne Arbeiten
            for (const key in details) {
              if (!key.startsWith('_') && typeof details[key] === 'object' && details[key].mitarbeiter_id) {
                return false;
              }
            }
          } catch (e) {
            // Ignoriere Parse-Fehler
          }
        }
        
        return true;
      });

      // Zeige nicht zugeordnete Termine
      if (nichtZugeordnet.length > 0) {
        section.style.display = 'block';
        
        let html = `<div class="nicht-zugeordnet-liste">`;
        let gesamtNichtZugeordnetMinuten = 0;
        
        nichtZugeordnet.forEach(termin => {
          const zeit = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;
          gesamtNichtZugeordnetMinuten += zeit;
          
          const kundenName = termin.kunde_name || 'Unbekannt';
          const uhrzeitAnzeige = termin.bring_zeit || termin.abholung_zeit || '';
          
          html += `
            <div class="nicht-zugeordnet-item">
              <div class="nz-info">
                <span class="nz-zeit">${uhrzeitAnzeige || '--:--'}</span>
                <span class="nz-kunde">${this.escapeHtml(kundenName)}</span>
                <span class="nz-kennzeichen">${this.escapeHtml(termin.kennzeichen || '-')}</span>
              </div>
              <div class="nz-arbeit">${this.escapeHtml(termin.arbeit || '-')}</div>
              <div class="nz-dauer">${this.formatMinutesToHours(zeit)}</div>
            </div>
          `;
        });
        
        html += `</div>`;
        html += `<div class="nz-gesamt">
          <strong>Gesamt nicht zugeordnet:</strong> ${this.formatMinutesToHours(gesamtNichtZugeordnetMinuten)} 
          (${nichtZugeordnet.length} ${nichtZugeordnet.length === 1 ? 'Termin' : 'Termine'})
        </div>`;
        
        container.innerHTML = html;
      } else {
        // Keine nicht zugeordneten Termine
        section.style.display = 'block';
        container.innerHTML = `<div class="alle-zugeordnet">✅ Alle Termine sind Mitarbeitern zugeordnet</div>`;
      }

      // Berechne Restkapazität pro Mitarbeiter
      if (restkapazitaetDetails && auslastungData) {
        let restHtml = '<div class="restkapazitaet-grid">';
        let gesamtRestkapazitaet = 0;
        
        // Mitarbeiter Restkapazität
        if (auslastungData.mitarbeiter_auslastung && Array.isArray(auslastungData.mitarbeiter_auslastung)) {
          auslastungData.mitarbeiter_auslastung.forEach(ma => {
            if (ma.ist_abwesend) return;
            
            const rest = Math.max(0, (ma.verfuegbar_minuten || 0) - (ma.belegt_minuten || 0));
            gesamtRestkapazitaet += rest;
            
            const restColor = rest > 120 ? '#2e7d32' : rest > 60 ? '#f57c00' : '#c62828';
            
            restHtml += `
              <div class="restkapazitaet-item">
                <span class="rk-name">👤 ${ma.mitarbeiter_name}</span>
                <span class="rk-rest" style="color: ${restColor}; font-weight: bold;">${this.formatMinutesToHours(rest)} frei</span>
              </div>
            `;
          });
        }
        
        // Lehrlinge Restkapazität
        const lehrlingeAuslastung = auslastungData.lehrlinge_auslastung || [];
        if (Array.isArray(lehrlingeAuslastung)) {
          lehrlingeAuslastung.forEach(la => {
            if (la.ist_abwesend) return;
            
            const rest = Math.max(0, (la.verfuegbar_minuten || 0) - (la.belegt_minuten || 0));
            gesamtRestkapazitaet += rest;
            
            const restColor = rest > 120 ? '#2e7d32' : rest > 60 ? '#f57c00' : '#c62828';
            
            restHtml += `
              <div class="restkapazitaet-item">
                <span class="rk-name">🎓 ${la.lehrling_name || la.name}</span>
                <span class="rk-rest" style="color: ${restColor}; font-weight: bold;">${this.formatMinutesToHours(rest)} frei</span>
              </div>
            `;
          });
        }
        
        restHtml += '</div>';
        
        // Gesamt Restkapazität des Tages
        const gesamtVerfuegbar = auslastungData.verfuegbar_minuten || 0;
        const gesamtBelegt = (auslastungData.geplant_minuten || 0) + (auslastungData.in_arbeit_minuten || 0) + (auslastungData.abgeschlossen_minuten || 0);
        const tagesRest = Math.max(0, gesamtVerfuegbar);
        
        restHtml += `
          <div class="restkapazitaet-gesamt">
            <div class="rkg-item">
              <span>Gesamtkapazität:</span>
              <strong>${this.formatMinutesToHours(auslastungData.gesamt_minuten || 0)}</strong>
            </div>
            <div class="rkg-item">
              <span>Bereits verplant:</span>
              <strong>${this.formatMinutesToHours(gesamtBelegt)}</strong>
            </div>
            <div class="rkg-item highlight">
              <span>🕐 Noch verfügbar:</span>
              <strong style="color: ${tagesRest > 120 ? '#2e7d32' : tagesRest > 60 ? '#f57c00' : '#c62828'}">
                ${this.formatMinutesToHours(tagesRest)}
              </strong>
            </div>
          </div>
        `;
        
        restkapazitaetDetails.innerHTML = restHtml;
      }

    } catch (error) {
      console.error('Fehler beim Laden nicht zugeordneter Termine:', error);
      section.style.display = 'none';
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
      const today = this.formatDateLocal(new Date());

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
      const today = this.formatDateLocal(new Date());
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
          
          // Folgetermin-Badge für Dashboard
          const folgeterminBadge = this.getFolgeterminBadge(termin.arbeit);
          const arbeitAnzeige = this.formatArbeitAnzeige(termin.arbeit);

          row.innerHTML = `
            <td><strong>${termin.termin_nr || '-'}</strong>${folgeterminBadge}</td>
            <td>${termin.abholung_typ === 'warten' ? 'Ja' : 'Nein'}</td>
            <td>${termin.bring_zeit || '-'}</td>
            <td>${termin.abholung_zeit || '-'}</td>
            <td>${termin.kunde_name}</td>
            <td>${termin.kennzeichen}</td>
            <td title="${termin.arbeit || ''}">${arbeitAnzeige}</td>
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
      const today = this.formatDateLocal(new Date());
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

      // Sortiere nach Bringzeit (Termine mit Bringzeit zuerst, dann nach Zeit sortiert)
      const sortedTermine = [...termine].sort((a, b) => {
        const zeitA = a.bring_zeit || '';
        const zeitB = b.bring_zeit || '';
        
        // Termine ohne Bringzeit ans Ende
        if (!zeitA && !zeitB) return 0;
        if (!zeitA) return 1;
        if (!zeitB) return -1;
        
        // Sortiere nach Zeit (HH:MM Format)
        return zeitA.localeCompare(zeitB);
      });

      // Für Karten nur offene Termine
      const aktiveTermine = termine.filter(t => t.status !== 'abgeschlossen');

      this.heuteTermine = aktiveTermine;
      this.renderHeuteTabelle(sortedTermine); // Alle Termine (getrennt nach Status)
      this.renderHeuteKarten(aktiveTermine);  // Nur offene Termine für Karten
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
    const abgeschlossenSection = document.getElementById('abgeschlossenSection');
    const abgeschlossenTbody = document.querySelector('#heuteAbgeschlossenTable tbody');
    
    if (!tbody) return;

    tbody.innerHTML = '';
    if (abgeschlossenTbody) abgeschlossenTbody.innerHTML = '';

    // Trenne offene und abgeschlossene Termine
    const offeneTermine = termine.filter(t => t.status !== 'abgeschlossen');
    const abgeschlosseneTermine = termine.filter(t => t.status === 'abgeschlossen');

    // Rendere offene Termine
    if (offeneTermine.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="loading">Keine offenen Termine für heute 🎉</td></tr>';
    } else {
      offeneTermine.forEach(termin => {
        this.renderHeuteTerminRow(tbody, termin, true);
      });
    }

    // Rendere abgeschlossene Termine in separate Tabelle
    if (abgeschlossenSection && abgeschlossenTbody) {
      if (abgeschlosseneTermine.length > 0) {
        abgeschlossenSection.style.display = 'block';
        abgeschlosseneTermine.forEach(termin => {
          this.renderHeuteTerminRow(abgeschlossenTbody, termin, false);
        });
      } else {
        abgeschlossenSection.style.display = 'none';
      }
    }
  }

  renderHeuteTerminRow(tbody, termin, showWartet = true) {
    const row = tbody.insertRow();
    const statusClass = `status-${termin.status || 'geplant'}`;
    const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;

    // Hervorhebung für Bringzeit
    const bringZeitDisplay = termin.bring_zeit
      ? `<strong style="color: var(--accent); font-size: 1.1em;">${termin.bring_zeit}</strong>`
      : '<span style="color: #999;">-</span>';

    // Kunde wartet Anzeige
    const kundeWartet = termin.abholung_typ === 'warten'
      ? '<span style="color: #28a745; font-size: 1.2em; font-weight: bold;">✓</span>'
      : '';

    // Dringlichkeit-Badge erstellen
    const dringlichkeitBadge = this.getDringlichkeitBadge(termin.dringlichkeit);

    // Folgetermin-Badge erstellen
    const folgeterminBadge = this.getFolgeterminBadge(termin.arbeit);

    const aktuellerStatus = termin.status || 'geplant';
    const statusTexte = {
      'geplant': 'Geplant',
      'in_arbeit': 'In Arbeit',
      'abgeschlossen': 'Abgeschlossen',
      'abgesagt': 'Abgesagt'
    };

    // Arbeit-Anzeige (ohne Folgetermin-Prefix für bessere Lesbarkeit)
    const arbeitAnzeige = this.formatArbeitAnzeige(termin.arbeit);

    // Wartet-Spalte nur bei offenen Terminen
    const wartetCell = showWartet 
      ? `<td style="text-align: center;">${kundeWartet}</td>` 
      : '';

    row.innerHTML = `
      <td>${bringZeitDisplay}</td>
      <td>${termin.kunde_name || '-'}${dringlichkeitBadge}${folgeterminBadge}</td>
      <td>${termin.kunde_telefon || '-'}</td>
      <td>${termin.kennzeichen || '-'}</td>
      ${wartetCell}
      <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis;" title="${termin.arbeit || ''}">${arbeitAnzeige}</td>
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

      // Folgetermin-Banner (wenn es ein Folgetermin ist)
      const folgeterminMatch = termin.arbeit ? termin.arbeit.match(/\[Folgetermin zu (T-\d{4}-\d{3})\]/) : null;
      const folgeterminBanner = folgeterminMatch
        ? `<div style="background: #ff9800; color: white; padding: 8px; text-align: center; font-weight: bold; border-radius: ${termin.abholung_typ === 'warten' ? '0' : '5px 5px 0 0'};">🔗 FOLGETERMIN von ${folgeterminMatch[1]}</div>`
        : '';

      // Dringlichkeit-Badge für Karten
      const karteDringlichkeitBadge = this.getDringlichkeitBadge(termin.dringlichkeit);
      
      // Arbeit-Anzeige formatieren
      const arbeitAnzeige = this.formatArbeitAnzeige(termin.arbeit);

      karte.innerHTML = `
        ${kundeWartetBanner}
        ${folgeterminBanner}
        <div class="heute-karte-header">
          <div class="heute-karte-nr"><strong>${termin.termin_nr || '-'}</strong>${karteDringlichkeitBadge}</div>
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
            <p><strong>Arbeit(en):</strong> ${arbeitAnzeige}</p>
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
      const today = this.formatDateLocal(new Date());

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

        // Click-Event für Tagesübersicht-Popup
        card.dataset.datum = day.datum;
        card.onclick = () => this.openTagesUebersichtModal(day.datum);
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
        datum: this.formatDateLocal(day),
        formatted: day.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
        weekday: day.toLocaleDateString('de-DE', { weekday: 'short' })
      });
    }
    return days;
  }

  // Gibt Wochen für die Monatsübersicht zurück (5 Wochen, Mo-Sa)
  getWeeksForMonthView() {
    const weeks = [];
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    
    // Finde den Montag der aktuellen Woche
    const currentDay = today.getDay();
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay; // Sonntag = 0 -> gehe 6 Tage zurück
    const startMonday = new Date(today);
    startMonday.setDate(today.getDate() + mondayOffset);
    
    // 5 Wochen generieren (Mo-Sa = 6 Tage pro Woche = 30 Arbeitstage)
    for (let weekNum = 0; weekNum < 5; weekNum++) {
      const week = [];
      for (let dayNum = 0; dayNum < 6; dayNum++) { // Mo=0 bis Sa=5
        const day = new Date(startMonday);
        day.setDate(startMonday.getDate() + (weekNum * 7) + dayNum);
        
        const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
        
        week.push({
          datum: this.formatDateLocal(day),
          dayNum: day.getDate(),
          monthShort: monthNames[day.getMonth()],
          dayOfWeek: day.getDay() // 1=Mo, 2=Di, ..., 6=Sa
        });
      }
      weeks.push(week);
    }
    return weeks;
  }

  async loadMonatsUebersicht() {
    const container = document.getElementById('monatsUebersicht');
    if (!container) return;

    container.innerHTML = '<div class="loading">Monatsübersicht wird geladen...</div>';

    try {
      const allTermine = await TermineService.getAll();
      const weeks = this.getWeeksForMonthView();
      const today = this.formatDateLocal(new Date());

      // Sammle alle Tage für Auslastungsabfrage
      const allDays = weeks.flat();
      const auslastungPromises = allDays.map(day =>
        AuslastungService.getByDatum(day.datum).catch(() => ({ auslastung_prozent: 0 }))
      );
      const auslastungen = await Promise.all(auslastungPromises);
      
      // Erstelle Map für schnellen Zugriff
      const auslastungMap = {};
      allDays.forEach((day, index) => {
        auslastungMap[day.datum] = auslastungen[index] || { auslastung_prozent: 0 };
      });

      // Erstelle Kalender-Layout
      container.innerHTML = '';
      
      // Header mit Wochentagen
      const header = document.createElement('div');
      header.className = 'monats-header';
      header.innerHTML = `
        <div class="monats-header-cell">Mo</div>
        <div class="monats-header-cell">Di</div>
        <div class="monats-header-cell">Mi</div>
        <div class="monats-header-cell">Do</div>
        <div class="monats-header-cell">Fr</div>
        <div class="monats-header-cell">Sa</div>
      `;
      container.appendChild(header);

      // Wochen als Zeilen
      weeks.forEach(week => {
        const weekRow = document.createElement('div');
        weekRow.className = 'monats-week';

        week.forEach(day => {
          const termineForDay = allTermine.filter(t => t.datum === day.datum);
          const auslastung = auslastungMap[day.datum] || { auslastung_prozent: 0 };
          const isPast = day.datum < today;

          const card = document.createElement('div');
          card.className = 'monats-card';
          if (day.datum === today) {
            card.classList.add('heute');
          }
          if (isPast) {
            card.classList.add('vergangen');
          }
          if (day.dayOfWeek === 6) {
            card.classList.add('samstag');
          }

          card.innerHTML = `
            <div class="monats-datum">
              <span class="monats-tag">${day.dayNum}</span>
              <span class="monats-monat">${day.monthShort}</span>
            </div>
            <div class="monats-termine">${termineForDay.length}</div>
            <div class="mini-progress-bar">
              <div class="mini-progress-fill" style="width:${Math.min(auslastung.auslastung_prozent, 100)}%"></div>
            </div>
          `;

          // Click-Event für Tagesübersicht-Popup
          card.dataset.datum = day.datum;
          card.addEventListener('click', () => this.openTagesUebersichtModal(day.datum));

          weekRow.appendChild(card);
        });

        container.appendChild(weekRow);
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

    // Kundennamen hinzufügen
    (this.kundenCache || []).forEach(kunde => {
      if (kunde.name && !seen.has(kunde.name.toLowerCase())) {
        optionen.push({ value: kunde.name, label: `${kunde.name}` });
        seen.add(kunde.name.toLowerCase());
      }
      // Kennzeichen aus Kundentabelle hinzufügen
      if (kunde.kennzeichen && !seen.has(kunde.kennzeichen.toLowerCase())) {
        optionen.push({ value: kunde.kennzeichen, label: `${kunde.kennzeichen} (${kunde.name})` });
        seen.add(kunde.kennzeichen.toLowerCase());
      }
    });

    // Kennzeichen aus Terminen hinzufügen
    (this.termineCache || []).forEach(termin => {
      if (termin.kennzeichen && !seen.has(termin.kennzeichen.toLowerCase())) {
        optionen.push({ value: termin.kennzeichen, label: `${termin.kennzeichen}` });
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
    if (!eingabe) {
      this.hideGefundenerKunde();
      return;
    }

    const lower = eingabe.toLowerCase();
    
    // Erst exakter Match versuchen
    let kundeMatch = (this.kundenCache || []).find(kunde => kunde.name && kunde.name.toLowerCase() === lower);
    
    // Falls kein exakter Match, Teilsuche (beginnt mit oder enthält)
    if (!kundeMatch) {
      kundeMatch = (this.kundenCache || []).find(kunde => 
        kunde.name && kunde.name.toLowerCase().includes(lower)
      );
    }
    
    // Suche auch nach Kennzeichen in Kundendaten
    if (!kundeMatch) {
      kundeMatch = (this.kundenCache || []).find(kunde => 
        kunde.kennzeichen && kunde.kennzeichen.toLowerCase() === lower
      );
    }
    
    if (kundeMatch) {
      document.getElementById('kunde_id').value = kundeMatch.id;
      document.getElementById('neuer_kunde_telefon').value = kundeMatch.telefon || '';
      this.showGefundenerKunde(kundeMatch.name, kundeMatch.telefon);

      // Erst Kennzeichen aus Kundendaten prüfen, dann aus Terminen
      let kennzeichen = kundeMatch.kennzeichen || null;
      if (!kennzeichen) {
        kennzeichen = this.findLetztesKennzeichen(kundeMatch.id, kundeMatch.name);
      }
      
      if (kennzeichen) {
        document.getElementById('kennzeichen').value = kennzeichen;
      }
      
      // Fahrzeugtyp aus Kundendaten setzen
      if (kundeMatch.fahrzeugtyp) {
        document.getElementById('fahrzeugtyp').value = kundeMatch.fahrzeugtyp;
      }

      // Finde und zeige letzten KM-Stand als Hinweis (grau)
      const letzterKmStand = this.findLetztenKmStand(kundeMatch.id, kundeMatch.name, kennzeichen);
      const kmStandInput = document.getElementById('kilometerstand');
      if (letzterKmStand && kmStandInput) {
        kmStandInput.value = ''; // Leeres value - wird nicht submitted
        kmStandInput.placeholder = `Letzter KM-Stand: ${letzterKmStand.toLocaleString('de-DE')} km`;
        kmStandInput.classList.add('has-previous-value');
      }
      
      return;
    }

    // Suche Kennzeichen in Terminen
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
          this.showGefundenerKunde(kunde.name, kunde.telefon);
          
          // Fahrzeugtyp aus Kundendaten setzen
          if (kunde.fahrzeugtyp) {
            document.getElementById('fahrzeugtyp').value = kunde.fahrzeugtyp;
          }

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
        this.showGefundenerKunde(terminMatch.kunde_name, null);
      }
      return;
    }
    
    // Suche Kennzeichen direkt in Kundentabelle (für importierte Kunden ohne Termine)
    const kundeByKennzeichen = (this.kundenCache || []).find(kunde =>
      kunde.kennzeichen && kunde.kennzeichen.toLowerCase() === lower
    );
    if (kundeByKennzeichen) {
      document.getElementById('kennzeichen').value = kundeByKennzeichen.kennzeichen;
      document.getElementById('kunde_id').value = kundeByKennzeichen.id;
      document.getElementById('neuer_kunde_telefon').value = kundeByKennzeichen.telefon || '';
      this.showGefundenerKunde(kundeByKennzeichen.name, kundeByKennzeichen.telefon);
      
      // Fahrzeugtyp aus Kundendaten setzen
      if (kundeByKennzeichen.fahrzeugtyp) {
        document.getElementById('fahrzeugtyp').value = kundeByKennzeichen.fahrzeugtyp;
      }
      
      // Finde und zeige letzten KM-Stand als Hinweis (grau)
      const letzterKmStand = this.findLetztenKmStand(kundeByKennzeichen.id, kundeByKennzeichen.name, kundeByKennzeichen.kennzeichen);
      const kmStandInput = document.getElementById('kilometerstand');
      if (letzterKmStand && kmStandInput) {
        kmStandInput.value = '';
        kmStandInput.placeholder = `Letzter KM-Stand: ${letzterKmStand.toLocaleString('de-DE')} km`;
        kmStandInput.classList.add('has-previous-value');
      }
      
      return;
    }

    const siehtWieKennzeichenAus = /\d/.test(eingabe) || eingabe.includes('-');
    if (siehtWieKennzeichenAus) {
      document.getElementById('kennzeichen').value = eingabe;
      document.getElementById('kunde_id').value = '';
      document.getElementById('terminSchnellsuche').value = '';
      this.hideGefundenerKunde();
    } else {
      document.getElementById('kunde_id').value = '';
      document.getElementById('terminSchnellsuche').value = eingabe;
      this.hideGefundenerKunde();
    }
    this.updateSchnellsucheStatus();
  }

  showGefundenerKunde(name, telefon) {
    const anzeige = document.getElementById('gefundenerKundeAnzeige');
    const nameEl = document.getElementById('gefundenerKundeName');
    const telefonEl = document.getElementById('gefundenerKundeTelefon');
    
    if (anzeige && nameEl) {
      anzeige.style.display = 'block';
      nameEl.textContent = name || 'Unbekannt';
      if (telefonEl) {
        telefonEl.textContent = telefon ? `📞 ${telefon}` : '';
      }
    }
  }

  hideGefundenerKunde() {
    const anzeige = document.getElementById('gefundenerKundeAnzeige');
    if (anzeige) {
      anzeige.style.display = 'none';
    }
  }

  updateSchnellsucheStatus() {
    const eingabe = document.getElementById('terminSchnellsuche').value.trim();
    const statusEl = document.getElementById('schnellsucheStatus');
    
    if (!statusEl) return;
    
    if (!eingabe) {
      statusEl.style.display = 'none';
      return;
    }
    
    const lower = eingabe.toLowerCase();
    
    // Prüfe ob Kunde existiert (exakt oder Teilmatch)
    let kundeMatch = (this.kundenCache || []).find(kunde => 
      kunde.name && kunde.name.toLowerCase() === lower
    );
    if (!kundeMatch) {
      kundeMatch = (this.kundenCache || []).find(kunde => 
        kunde.name && kunde.name.toLowerCase().includes(lower)
      );
    }
    // Suche auch nach Kennzeichen in Kundendaten
    if (!kundeMatch) {
      kundeMatch = (this.kundenCache || []).find(kunde => 
        kunde.kennzeichen && kunde.kennzeichen.toLowerCase() === lower
      );
    }
    
    if (kundeMatch) {
      statusEl.textContent = '✓ Kunde gefunden';
      statusEl.className = 'schnellsuche-status gefunden';
      statusEl.style.display = 'inline-block';
      return;
    }
    
    // Prüfe ob Kennzeichen existiert in Terminen
    const terminMatch = (this.termineCache || []).find(termin =>
      termin.kennzeichen && termin.kennzeichen.toLowerCase() === lower
    );
    
    if (terminMatch) {
      statusEl.textContent = '✓ Kennzeichen gefunden';
      statusEl.className = 'schnellsuche-status kennzeichen';
      statusEl.style.display = 'inline-block';
      return;
    }
    
    // Sieht es nach einem Kennzeichen aus?
    const siehtWieKennzeichenAus = /\d/.test(eingabe) || eingabe.includes('-');
    
    if (siehtWieKennzeichenAus) {
      statusEl.textContent = '+ Neues Kennzeichen';
      statusEl.className = 'schnellsuche-status kennzeichen';
      statusEl.style.display = 'inline-block';
    } else {
      statusEl.textContent = '+ Neuer Kunde';
      statusEl.className = 'schnellsuche-status neu';
      statusEl.style.display = 'inline-block';
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
    const nebenzeitField = document.getElementById('nebenzeit_prozent');
    if (nebenzeitField) {
      nebenzeitField.value = einstellungen.nebenzeit_prozent || 0;
    }
  }

  // Ersatzautos laden und anzeigen
  async loadErsatzautos() {
    try {
      const [autos, heuteVerfuegbarkeit] = await Promise.all([
        ErsatzautosService.getAll(),
        ErsatzautosService.getVerfuegbarkeit(this.formatDateLocal(new Date()))
      ]);
      
      // Dashboard-Karten aktualisieren
      const gesamtEl = document.getElementById('ersatzautoGesamt');
      const verfuegbarEl = document.getElementById('ersatzautoHeuteVerfuegbar');
      const vergebenEl = document.getElementById('ersatzautoHeuteVergeben');
      const gesperrtEl = document.getElementById('ersatzautoGesperrt');
      
      if (gesamtEl) gesamtEl.textContent = autos.filter(a => a.aktiv).length;
      if (verfuegbarEl) verfuegbarEl.textContent = heuteVerfuegbarkeit.verfuegbar;
      if (vergebenEl) vergebenEl.textContent = heuteVerfuegbarkeit.vergeben;
      if (gesperrtEl) gesperrtEl.textContent = heuteVerfuegbarkeit.gesperrt || 0;
      
      // Schnellzugriff-Kacheln rendern
      this.renderErsatzautoKacheln(autos.filter(a => a.aktiv));
      
      // Liste rendern
      this.renderErsatzautoListe(autos);
      
      // Aktuelle Buchungen laden
      this.loadErsatzautoBuchungen();
      
      // Übersicht laden
      this.loadErsatzautoUebersicht();
    } catch (error) {
      console.error('Fehler beim Laden der Ersatzautos:', error);
    }
  }

  // Schnellzugriff-Kacheln für Ersatzautos rendern
  renderErsatzautoKacheln(autos) {
    const container = document.getElementById('ersatzautoKacheln');
    if (!container) return;
    
    if (!autos || autos.length === 0) {
      container.innerHTML = `
        <div style="padding: 20px; text-align: center; background: #f8fafc; border-radius: 8px; width: 100%;">
          <p style="margin: 0; color: #64748b;">Keine aktiven Ersatzautos vorhanden. Fügen Sie unten ein Fahrzeug hinzu.</p>
        </div>
      `;
      return;
    }
    
    const heute = this.formatDateLocal(new Date());
    
    container.innerHTML = autos.map(auto => {
      // Prüfen ob Sperrung abgelaufen ist
      const gesperrtBis = auto.gesperrt_bis;
      const istAbgelaufen = gesperrtBis && gesperrtBis < heute;
      const istGesperrt = auto.manuell_gesperrt === 1 && !istAbgelaufen;
      
      const statusClass = istGesperrt ? 'gesperrt' : 'verfuegbar';
      const statusText = istGesperrt 
        ? (gesperrtBis ? `Gesperrt bis ${new Date(gesperrtBis).toLocaleDateString('de-DE')}` : 'Gesperrt') 
        : 'Verfügbar';
      const icon = istGesperrt ? '🔴' : '🟢';
      const hinweisText = istGesperrt 
        ? '🔓 Klicken zum Freigeben' 
        : '🔒 Klicken zum Sperren';
      
      return `
        <div class="ersatzauto-kachel ${statusClass}" 
             data-id="${auto.id}" 
             data-name="${auto.name}"
             data-kennzeichen="${auto.kennzeichen}"
             data-gesperrt="${istGesperrt ? '1' : '0'}"
             onclick="app.toggleErsatzautoVerfuegbarkeit(${auto.id}, '${auto.name}', '${auto.kennzeichen}', ${istGesperrt})">
          <div class="kachel-header">
            <span class="kachel-icon">${icon}</span>
            <span class="kachel-status">${statusText}</span>
          </div>
          <div class="kachel-name">${auto.name}</div>
          <div class="kachel-kennzeichen">${auto.kennzeichen}</div>
          ${auto.typ ? `<div class="kachel-typ">📋 ${auto.typ}</div>` : ''}
          <div class="kachel-hinweis">
            <span>${hinweisText}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Ersatzauto-Verfügbarkeit umschalten mit Popup für Sperrung
  async toggleErsatzautoVerfuegbarkeit(id, name, kennzeichen, istGesperrt) {
    if (istGesperrt) {
      // Freigeben - einfache Bestätigung
      const bestaetigung = confirm(
        `🚗 Ersatzauto FREIGEBEN?\n\nDas Fahrzeug "${name}" (${kennzeichen}) wird wieder als VERFÜGBAR markiert.\n\nMöchten Sie fortfahren?`
      );
      
      if (!bestaetigung) return;
      
      try {
        await ErsatzautosService.entsperren(id);
        alert(`✅ ${name} (${kennzeichen}) ist jetzt wieder verfügbar.`);
        this.loadErsatzautos();
        this.loadDashboard();
      } catch (error) {
        console.error('Fehler beim Freigeben:', error);
        alert('❌ Fehler beim Freigeben. Bitte versuchen Sie es erneut.');
      }
    } else {
      // Sperren - Popup für Anzahl Tage anzeigen
      this.showSperrenPopup(id, name, kennzeichen);
    }
  }

  // Popup für Sperrung mit Tage-Auswahl anzeigen
  showSperrenPopup(id, name, kennzeichen) {
    // Bestehenden Modal entfernen falls vorhanden
    const existingModal = document.getElementById('sperrenModal');
    if (existingModal) existingModal.remove();
    
    const heute = new Date();
    const morgen = new Date(heute);
    morgen.setDate(morgen.getDate() + 1);
    const minDatum = this.formatDateLocal(heute);
    
    const modal = document.createElement('div');
    modal.id = 'sperrenModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content sperren-modal">
        <div class="modal-header">
          <h3>🔒 Ersatzauto sperren</h3>
          <button class="modal-close" onclick="app.closeSperrenModal()">&times;</button>
        </div>
        <div class="modal-body">
          <p><strong>${name}</strong> (${kennzeichen})</p>
          <p style="margin-bottom: 15px; color: #64748b;">Wie lange soll das Fahrzeug gesperrt werden?</p>
          
          <div class="sperren-optionen">
            <button class="sperren-option-btn" onclick="app.sperrenFuerTage(${id}, 1)">
              <span class="option-tage">1</span>
              <span class="option-label">Tag</span>
            </button>
            <button class="sperren-option-btn" onclick="app.sperrenFuerTage(${id}, 2)">
              <span class="option-tage">2</span>
              <span class="option-label">Tage</span>
            </button>
            <button class="sperren-option-btn" onclick="app.sperrenFuerTage(${id}, 3)">
              <span class="option-tage">3</span>
              <span class="option-label">Tage</span>
            </button>
            <button class="sperren-option-btn" onclick="app.sperrenFuerTage(${id}, 5)">
              <span class="option-tage">5</span>
              <span class="option-label">Tage</span>
            </button>
            <button class="sperren-option-btn" onclick="app.sperrenFuerTage(${id}, 7)">
              <span class="option-tage">7</span>
              <span class="option-label">Tage</span>
            </button>
            <button class="sperren-option-btn" onclick="app.sperrenFuerTage(${id}, 14)">
              <span class="option-tage">14</span>
              <span class="option-label">Tage</span>
            </button>
          </div>
          
          <div class="sperren-custom" style="margin-top: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Oder bis zu einem bestimmten Datum:</label>
            <input type="date" id="sperrenBisDatum" min="${minDatum}" class="form-input" style="width: 100%;">
          </div>
          
          <div class="sperren-vorschau" id="sperrenVorschau" style="margin-top: 15px; padding: 10px; background: #f8fafc; border-radius: 8px; display: none;">
            <span id="sperrenVorschauText"></span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="app.closeSperrenModal()">Abbrechen</button>
          <button class="btn btn-primary" id="sperrenBestaetigenBtn" onclick="app.bestaetigenSperrenMitDatum(${id})" disabled>
            🔒 Sperren
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event-Listener für Datum-Eingabe
    const datumInput = document.getElementById('sperrenBisDatum');
    datumInput.addEventListener('change', () => {
      this.updateSperrenVorschau(datumInput.value);
    });
    
    // Modal anzeigen
    setTimeout(() => modal.classList.add('active'), 10);
  }

  // Vorschau aktualisieren und Button aktivieren
  updateSperrenVorschau(datum) {
    const vorschau = document.getElementById('sperrenVorschau');
    const vorschauText = document.getElementById('sperrenVorschauText');
    const bestaetigenBtn = document.getElementById('sperrenBestaetigenBtn');
    
    if (datum) {
      if (vorschau) vorschau.style.display = 'block';
      if (vorschauText) vorschauText.innerHTML = `📅 Gesperrt bis: <strong>${new Date(datum).toLocaleDateString('de-DE')}</strong>`;
      if (bestaetigenBtn) {
        bestaetigenBtn.disabled = false;
        bestaetigenBtn.removeAttribute('disabled');
      }
    } else {
      if (vorschau) vorschau.style.display = 'none';
      if (bestaetigenBtn) bestaetigenBtn.disabled = true;
    }
  }

  // Schnell-Sperrung für eine bestimmte Anzahl Tage
  async sperrenFuerTage(id, tage) {
    const bisDatum = new Date();
    bisDatum.setDate(bisDatum.getDate() + tage);
    const bisDatumStr = this.formatDateLocal(bisDatum);
    
    // Datum-Input setzen und Vorschau aktualisieren
    const datumInput = document.getElementById('sperrenBisDatum');
    if (datumInput) {
      datumInput.value = bisDatumStr;
      this.updateSperrenVorschau(bisDatumStr);
    }
  }

  // Sperrung mit gewähltem Datum bestätigen
  async bestaetigenSperrenMitDatum(id) {
    const datumInput = document.getElementById('sperrenBisDatum');
    const bisDatum = datumInput?.value;
    
    if (!bisDatum) {
      alert('Bitte wählen Sie ein Datum aus.');
      return;
    }
    
    try {
      await ErsatzautosService.sperrenBis(id, bisDatum);
      this.closeSperrenModal();
      alert(`✅ Fahrzeug gesperrt bis ${new Date(bisDatum).toLocaleDateString('de-DE')}.`);
      this.loadErsatzautos();
      this.loadDashboard();
    } catch (error) {
      console.error('Fehler beim Sperren:', error);
      alert('❌ Fehler beim Sperren. Bitte versuchen Sie es erneut.');
    }
  }

  // Modal schließen
  closeSperrenModal() {
    const modal = document.getElementById('sperrenModal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 300);
    }
  }

  // Aktuelle Buchungen laden und anzeigen
  async loadErsatzautoBuchungen() {
    const container = document.getElementById('ersatzautoBuchungen');
    if (!container) return;
    
    try {
      const buchungen = await ErsatzautosService.getAktuelleBuchungen();
      
      if (!buchungen || buchungen.length === 0) {
        container.innerHTML = `
          <div class="ersatzauto-empty" style="padding: 20px; text-align: center; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
            <div style="font-size: 2rem; margin-bottom: 10px;">✅</div>
            <p style="margin: 0; color: #166534;">Aktuell sind keine Ersatzautos vergeben.</p>
          </div>
        `;
        return;
      }
      
      const heute = this.formatDateLocal(new Date());
      
      container.innerHTML = buchungen.map(buchung => {
        const vonDatum = new Date(buchung.datum);
        const bisDatum = buchung.bis_datum ? new Date(buchung.bis_datum) : vonDatum;
        
        const vonFormatiert = vonDatum.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const bisFormatiert = bisDatum.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        const istMehrtaegig = buchung.datum !== buchung.bis_datum;
        const istHeute = buchung.datum === heute || (buchung.datum <= heute && buchung.bis_datum >= heute);
        
        // Zeitraum-Anzeige
        let zeitraumText = vonFormatiert;
        if (istMehrtaegig) {
          zeitraumText = `${vonFormatiert} - ${bisFormatiert}`;
          if (buchung.ersatzauto_tage) {
            zeitraumText += ` (${buchung.ersatzauto_tage} Tage)`;
          }
        }
        if (buchung.ersatzauto_bis_zeit) {
          zeitraumText += ` bis ${buchung.ersatzauto_bis_zeit} Uhr`;
        }
        
        return `
          <div class="buchung-card${istHeute ? ' heute' : ''}" style="display: flex; gap: 15px; padding: 15px; background: ${istHeute ? '#fef3c7' : '#f8fafc'}; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${istHeute ? '#f59e0b' : '#3b82f6'};">
            <div class="buchung-icon" style="font-size: 2rem;">🚗</div>
            <div class="buchung-info" style="flex: 1;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <div>
                  <strong style="font-size: 1.1rem; color: #1e40af;">${buchung.kennzeichen}</strong>
                  ${buchung.termin_nr ? `<span style="margin-left: 10px; color: #6b7280; font-size: 0.85rem;">${buchung.termin_nr}</span>` : ''}
                </div>
                ${istHeute ? '<span style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">HEUTE</span>' : ''}
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 15px; font-size: 0.9rem; color: #4b5563;">
                <div>
                  <span style="color: #9ca3af;">👤 Kunde:</span>
                  <strong>${buchung.kunde_name || 'Unbekannt'}</strong>
                </div>
                ${buchung.kunde_telefon ? `<div><span style="color: #9ca3af;">📞</span> ${buchung.kunde_telefon}</div>` : ''}
              </div>
              <div style="margin-top: 8px; font-size: 0.85rem; color: #6b7280;">
                <span style="color: #9ca3af;">📅 Zeitraum:</span> ${zeitraumText}
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (error) {
      console.error('Fehler beim Laden der Buchungen:', error);
      container.innerHTML = '<div class="loading" style="color: #ef4444;">Fehler beim Laden der Buchungen</div>';
    }
  }

  renderErsatzautoListe(autos) {
    const container = document.getElementById('ersatzautoListe');
    if (!container) return;
    
    if (!autos || autos.length === 0) {
      container.innerHTML = `
        <div class="ersatzauto-empty">
          <div class="empty-icon">🚗</div>
          <p>Noch keine Ersatzfahrzeuge registriert.</p>
          <p style="font-size: 0.9rem;">Fügen Sie oben Ihr erstes Fahrzeug hinzu.</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = autos.map(auto => `
      <div class="ersatzauto-card${auto.aktiv ? '' : ' inaktiv'}">
        <div class="ea-icon">🚗</div>
        <div class="ea-info">
          <div class="ea-kennzeichen">${auto.kennzeichen}</div>
          <div class="ea-name">${auto.name}</div>
          ${auto.typ ? `<span class="ea-typ">${auto.typ}</span>` : ''}
        </div>
        <div class="ea-actions">
          <button class="btn-toggle" onclick="app.toggleErsatzautoAktiv(${auto.id}, ${auto.aktiv})" 
                  title="${auto.aktiv ? 'Deaktivieren' : 'Aktivieren'}">
            ${auto.aktiv ? '✓' : '○'}
          </button>
          <button class="btn-edit" onclick="app.editErsatzauto(${auto.id})" title="Bearbeiten">✏️</button>
          <button class="btn-delete" onclick="app.deleteErsatzauto(${auto.id})" title="Löschen">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  async handleErsatzautoSubmit(e) {
    e.preventDefault();
    
    const kennzeichenField = document.getElementById('ersatzautoKennzeichen');
    const nameField = document.getElementById('ersatzautoName');
    const typField = document.getElementById('ersatzautoTyp');
    const editIdField = document.getElementById('ersatzautoEditId');
    
    const kennzeichen = kennzeichenField.value.trim().toUpperCase();
    const name = nameField.value.trim();
    const typ = typField.value;
    const editId = editIdField.value;
    
    if (!kennzeichen || !name) {
      alert('Bitte Kennzeichen und Fahrzeugname eingeben.');
      return;
    }
    
    try {
      if (editId) {
        await ErsatzautosService.update(editId, { kennzeichen, name, typ, aktiv: 1 });
        alert('Fahrzeug aktualisiert.');
      } else {
        await ErsatzautosService.create({ kennzeichen, name, typ });
        alert('Fahrzeug hinzugefügt.');
      }
      
      // Form zurücksetzen
      kennzeichenField.value = '';
      nameField.value = '';
      typField.value = '';
      editIdField.value = '';
      
      this.loadErsatzautos();
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert(error.data?.error || 'Fahrzeug konnte nicht gespeichert werden.');
    }
  }

  async editErsatzauto(id) {
    try {
      const auto = await ErsatzautosService.getById(id);
      
      document.getElementById('ersatzautoKennzeichen').value = auto.kennzeichen;
      document.getElementById('ersatzautoName').value = auto.name;
      document.getElementById('ersatzautoTyp').value = auto.typ || '';
      document.getElementById('ersatzautoEditId').value = auto.id;
      
      // Scroll zum Formular
      document.getElementById('ersatzautoForm').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      console.error('Fehler beim Laden des Fahrzeugs:', error);
      alert('Fahrzeug konnte nicht geladen werden.');
    }
  }

  async deleteErsatzauto(id) {
    if (!confirm('Möchten Sie dieses Ersatzfahrzeug wirklich löschen?')) return;
    
    try {
      await ErsatzautosService.delete(id);
      this.loadErsatzautos();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fahrzeug konnte nicht gelöscht werden.');
    }
  }

  async toggleErsatzautoAktiv(id, currentStatus) {
    try {
      const auto = await ErsatzautosService.getById(id);
      await ErsatzautosService.update(id, {
        ...auto,
        aktiv: currentStatus ? 0 : 1
      });
      this.loadErsatzautos();
    } catch (error) {
      console.error('Fehler beim Ändern des Status:', error);
    }
  }

  // Ersatzauto-Übersicht laden
  async loadErsatzautoUebersicht() {
    const container = document.getElementById('ersatzautoUebersicht');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Lade Übersicht...</div>';
    
    try {
      // Generiere die nächsten 30 Tage (Mo-Sa)
      const days = this.getWeeksForMonthView().flat();
      const today = this.formatDateLocal(new Date());
      
      // Lade Verfügbarkeit für alle Tage parallel
      const verfuegbarkeitPromises = days.map(day => 
        ErsatzautosService.getVerfuegbarkeit(day.datum)
          .catch(() => ({ gesamt: 0, vergeben: 0, verfuegbar: 0 }))
      );
      const verfuegbarkeiten = await Promise.all(verfuegbarkeitPromises);
      
      container.innerHTML = '';
      
      days.forEach((day, index) => {
        const verf = verfuegbarkeiten[index];
        const isPast = day.datum < today;
        const isToday = day.datum === today;
        const gesperrt = verf.gesperrt || 0;
        
        let statusClass = 'frei';
        let statusText = `${verf.verfuegbar}/${verf.gesamt}`;
        let detailText = '';
        
        if (verf.gesamt === 0) {
          statusClass = 'frei';
          statusText = '-';
        } else if (verf.verfuegbar === 0) {
          statusClass = 'voll';
          // Unterscheide ob gesperrt oder vergeben
          if (gesperrt > 0 && verf.vergeben === 0) {
            statusText = `0/${verf.gesamt}`;
            detailText = `${gesperrt} gesperrt`;
          } else if (gesperrt > 0) {
            statusText = `0/${verf.gesamt}`;
            detailText = `${verf.vergeben} vergeben, ${gesperrt} gesperrt`;
          } else {
            detailText = `${verf.vergeben} vergeben`;
          }
        } else if (verf.vergeben > 0 || gesperrt > 0) {
          statusClass = 'teilweise';
          let details = [];
          if (verf.vergeben > 0) details.push(`${verf.vergeben} vergeben`);
          if (gesperrt > 0) details.push(`${gesperrt} gesperrt`);
          detailText = details.join(', ');
        }
        
        const wochentage = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
        const dateObj = new Date(day.datum);
        const wochentag = wochentage[dateObj.getDay()];
        
        const card = document.createElement('div');
        // Status-Klasse zur Karte hinzufügen für bessere Sichtbarkeit
        card.className = `ersatzauto-tag${isToday ? ' heute' : ''}${isPast ? ' vergangen' : ''} status-${statusClass}`;
        
        card.innerHTML = `
          <div class="ea-datum">${day.dayNum}. ${day.monthShort}</div>
          <div class="ea-wochentag">${wochentag}</div>
          <div class="ea-status ${statusClass}">
            <span class="ea-status-dot ea-${statusClass}"></span>
            ${statusText}
          </div>
          ${detailText ? `<div class="ea-details">${detailText}</div>` : ''}
        `;
        
        container.appendChild(card);
      });
    } catch (error) {
      console.error('Fehler beim Laden der Ersatzauto-Übersicht:', error);
      container.innerHTML = '<div class="loading" style="color: #ef4444;">Fehler beim Laden</div>';
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

    const maxDatumString = this.formatDateLocal(maxDatum);

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
    const ersatzautoField = document.getElementById('ersatzauto_anzahl');
    const nebenzeitField = document.getElementById('nebenzeit_prozent');
    
    if (!servicezeitField) {
      alert('Servicezeit-Feld nicht gefunden.');
      return;
    }

    const servicezeit = parseInt(servicezeitField.value, 10);
    const ersatzautoAnzahl = ersatzautoField ? parseInt(ersatzautoField.value, 10) : 2;
    const nebenzeit = nebenzeitField ? parseFloat(nebenzeitField.value) : 0;

    if (!Number.isFinite(servicezeit) || servicezeit < 0) {
      alert('Bitte eine gültige Servicezeit eingeben.');
      return;
    }

    if (!Number.isFinite(ersatzautoAnzahl) || ersatzautoAnzahl < 0) {
      alert('Bitte eine gültige Anzahl Ersatzautos eingeben.');
      return;
    }

    if (!Number.isFinite(nebenzeit) || nebenzeit < 0 || nebenzeit > 100) {
      alert('Bitte eine gültige Nebenzeit eingeben (0-100%).');
      return;
    }

    try {
      // Lade aktuelle Einstellungen, um Pufferzeit beizubehalten
      const aktuelleEinstellungen = await EinstellungenService.getWerkstatt();
      
      await EinstellungenService.updateWerkstatt({
        pufferzeit_minuten: aktuelleEinstellungen?.pufferzeit_minuten || 15,
        servicezeit_minuten: servicezeit,
        ersatzauto_anzahl: ersatzautoAnzahl,
        nebenzeit_prozent: nebenzeit
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
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Keine Mitarbeiter vorhanden</td></tr>';
        return;
      }

      mitarbeiter.forEach(ma => {
        const row = tbody.insertRow();
        row.innerHTML = `
          <td><input type="text" id="mitarbeiter_name_${ma.id}" value="${ma.name || ''}" style="width: 100%; padding: 5px;"></td>
          <td><input type="number" id="mitarbeiter_stunden_${ma.id}" value="${ma.arbeitsstunden_pro_tag || 8}" min="1" max="24" style="width: 100%; padding: 5px;"></td>
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
        tbody.innerHTML = '<tr><td colspan="4" class="loading">Keine Lehrlinge vorhanden</td></tr>';
        return;
      }

      lehrlinge.forEach(l => {
        const row = tbody.insertRow();
        row.innerHTML = `
          <td><input type="text" id="lehrling_name_${l.id}" value="${l.name || ''}" style="width: 100%; padding: 5px;"></td>
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
    const aufgabe = parseFloat(document.getElementById('new_lehrling_aufgabe').value);
    const aktiv = document.getElementById('new_lehrling_aktiv').checked;

    if (!name) {
      alert('Bitte einen Namen eingeben.');
      return;
    }

    try {
      await LehrlingeService.create({
        name,
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
    const aufgabe = parseFloat(document.getElementById(`lehrling_aufgabe_${id}`).value);
    const aktiv = document.getElementById(`lehrling_aktiv_${id}`).checked;

    if (!name) {
      alert('Bitte einen Namen eingeben.');
      return;
    }

    try {
      await LehrlingeService.update(id, {
        name,
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
    return this.formatDateLocal(monday);
  }

  getWeekEnd() {
    const weekStart = new Date(this.getWeekStart());
    const friday = new Date(weekStart);
    friday.setDate(weekStart.getDate() + 4);
    return this.formatDateLocal(friday);
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
    
    // Lade Phasen für diesen Termin
    await this.loadModalPhasen(terminId, termin.datum);
    
    document.getElementById('arbeitszeitenModal').style.display = 'block';
  }

  async loadModalPhasen(terminId, terminDatum) {
    // Reset
    this.modalPhasenCounter = 0;
    this.modalPhasenData = [];
    const phasenListe = document.getElementById('modalPhasenListe');
    phasenListe.innerHTML = '';
    
    // Lade existierende Phasen
    try {
      const phasen = await PhasenService.getByTerminId(terminId);
      if (phasen && phasen.length > 0) {
        // Phasen vorhanden - aktiviere Checkbox und zeige Section
        document.getElementById('modalMehrtaegigCheckbox').checked = true;
        document.getElementById('modalPhasenSection').style.display = 'block';
        
        // Füge Phasen hinzu
        phasen.forEach(phase => {
          this.addModalPhase(phase);
        });
      } else {
        // Keine Phasen - verstecke Section
        document.getElementById('modalMehrtaegigCheckbox').checked = false;
        document.getElementById('modalPhasenSection').style.display = 'none';
      }
    } catch (error) {
      console.error('Fehler beim Laden der Phasen:', error);
      document.getElementById('modalMehrtaegigCheckbox').checked = false;
      document.getElementById('modalPhasenSection').style.display = 'none';
    }
  }

  toggleModalPhasenSection() {
    const checkbox = document.getElementById('modalMehrtaegigCheckbox');
    const section = document.getElementById('modalPhasenSection');
    
    if (checkbox.checked) {
      section.style.display = 'block';
      // Füge eine erste Phase hinzu wenn leer
      const phasenListe = document.getElementById('modalPhasenListe');
      if (phasenListe.children.length === 0) {
        const termin = this.termineById[this.currentTerminId];
        this.addModalPhase({ datum: termin ? termin.datum : this.formatDateLocal(new Date()) });
      }
    } else {
      section.style.display = 'none';
    }
  }

  addModalPhase(existingPhase = null) {
    this.modalPhasenCounter = this.modalPhasenCounter || 0;
    this.modalPhasenCounter++;
    const phaseId = this.modalPhasenCounter;
    
    const termin = this.termineById[this.currentTerminId];
    const defaultDatum = existingPhase?.datum || (termin ? termin.datum : this.formatDateLocal(new Date()));
    const bezeichnung = existingPhase?.bezeichnung || `Phase ${phaseId}`;
    const zeit = existingPhase?.geschaetzte_zeit || 60;
    const zeitStunden = (zeit / 60).toFixed(2);
    const notizen = existingPhase?.notizen || '';
    const dbId = existingPhase?.id || '';
    
    const phasenListe = document.getElementById('modalPhasenListe');
    const phaseDiv = document.createElement('div');
    phaseDiv.id = `modal_phase_${phaseId}`;
    phaseDiv.className = 'phase-item';
    phaseDiv.dataset.dbId = dbId;
    phaseDiv.style.cssText = 'padding: 15px; background: #fff; border: 1px solid #ffcc80; border-radius: 8px; margin-bottom: 10px;';
    
    phaseDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <strong style="color: #e65100;">Phase ${phaseId}</strong>
        <button type="button" onclick="app.removeModalPhase(${phaseId})" style="background: #ff5252; color: white; border: none; border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: 12px;">✕ Entfernen</button>
      </div>
      <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; margin-bottom: 10px;">
        <div>
          <label style="font-size: 0.85em; color: #666;">Bezeichnung:</label>
          <input type="text" id="modal_phase_bez_${phaseId}" value="${bezeichnung}" placeholder="z.B. Zerlegen" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        <div>
          <label style="font-size: 0.85em; color: #666;">Datum:</label>
          <input type="date" id="modal_phase_datum_${phaseId}" value="${defaultDatum}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        <div>
          <label style="font-size: 0.85em; color: #666;">Zeit (h):</label>
          <input type="number" id="modal_phase_zeit_${phaseId}" value="${zeitStunden}" min="0.25" step="0.25" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
      </div>
      <div>
        <label style="font-size: 0.85em; color: #666;">Notizen:</label>
        <input type="text" id="modal_phase_notizen_${phaseId}" value="${notizen}" placeholder="Optionale Notizen..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
      </div>
    `;
    
    phasenListe.appendChild(phaseDiv);
  }

  removeModalPhase(phaseId) {
    const phaseDiv = document.getElementById(`modal_phase_${phaseId}`);
    if (phaseDiv) {
      phaseDiv.remove();
    }
  }

  getModalPhasenFromForm() {
    const phasen = [];
    const phasenListe = document.getElementById('modalPhasenListe');
    const phaseItems = phasenListe.querySelectorAll('.phase-item');
    
    phaseItems.forEach((item, index) => {
      const idMatch = item.id.match(/modal_phase_(\d+)/);
      if (idMatch) {
        const phaseId = idMatch[1];
        const dbId = item.dataset.dbId || null;
        const bezeichnung = document.getElementById(`modal_phase_bez_${phaseId}`)?.value || `Phase ${index + 1}`;
        const datum = document.getElementById(`modal_phase_datum_${phaseId}`)?.value || '';
        const zeitStunden = parseFloat(document.getElementById(`modal_phase_zeit_${phaseId}`)?.value) || 1;
        const zeitMinuten = Math.round(zeitStunden * 60);
        const notizen = document.getElementById(`modal_phase_notizen_${phaseId}`)?.value || '';
        
        phasen.push({
          id: dbId ? parseInt(dbId, 10) : null,
          phase_nr: index + 1,
          bezeichnung: bezeichnung,
          datum: datum,
          geschaetzte_zeit: zeitMinuten,
          notizen: notizen
        });
      }
    });
    
    return phasen;
  }

  closeArbeitszeitenModal() {
    document.getElementById('arbeitszeitenModal').style.display = 'none';
    this.currentTerminId = null;
    // Reset Phasen
    this.modalPhasenCounter = 0;
    this.modalPhasenData = [];
  }

  // ================================================
  // TAGESÜBERSICHT POPUP/MODAL
  // ================================================

  async openTagesUebersichtModal(datum) {
    const modal = document.getElementById('tagesUebersichtModal');
    const body = document.getElementById('tagesUebersichtBody');
    const titel = document.getElementById('tagesUebersichtTitel');
    const termineCount = document.getElementById('tagesTermineCount');
    const auslastungBadge = document.getElementById('tagesAuslastung');

    if (!modal || !body) return;

    // Formatiere das Datum für den Titel
    const datumObj = new Date(datum + 'T12:00:00');
    const wochentag = datumObj.toLocaleDateString('de-DE', { weekday: 'long' });
    const datumFormatiert = datumObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    
    titel.textContent = `📅 ${wochentag}, ${datumFormatiert}`;
    body.innerHTML = '<div class="loading">Termine werden geladen...</div>';
    modal.style.display = 'block';

    try {
      // Lade Termine und Auslastung für diesen Tag
      const allTermine = await TermineService.getAll();
      const termineForDay = allTermine.filter(t => t.datum === datum);
      const auslastung = await AuslastungService.getByDatum(datum);

      // Aktualisiere Stats
      termineCount.textContent = `${termineForDay.length} Termin${termineForDay.length !== 1 ? 'e' : ''}`;
      auslastungBadge.textContent = `${Math.round(auslastung.auslastung_prozent || 0)}% Auslastung`;

      if (termineForDay.length === 0) {
        body.innerHTML = `
          <div class="tages-keine-termine">
            <div class="emoji">📭</div>
            <p>Keine Termine an diesem Tag</p>
          </div>
        `;
        return;
      }

      // Sortiere Termine nach Uhrzeit (verwende bring_zeit oder abholung_zeit)
      termineForDay.sort((a, b) => {
        const zeitA = a.bring_zeit || a.abholung_zeit || '23:59';
        const zeitB = b.bring_zeit || b.abholung_zeit || '23:59';
        return zeitA.localeCompare(zeitB);
      });

      // Erstelle HTML für alle Termine
      let html = '';
      for (const termin of termineForDay) {
        const isIntern = termin.ist_intern === 1 || termin.ist_intern === true;
        const statusClass = `status-${termin.status || 'geplant'}`;
        const internClass = isIntern ? 'intern' : '';
        
        // Uhrzeit ermitteln (bring_zeit hat Vorrang)
        const uhrzeitAnzeige = termin.bring_zeit || termin.abholung_zeit || '';

        // Berechne Dauer - verwende tatsächliche Zeit wenn vorhanden, sonst geschätzte Zeit
        let dauerText = '';
        const arbeitszeit = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;
        if (arbeitszeit && arbeitszeit > 0) {
          const stunden = Math.floor(arbeitszeit / 60);
          const minuten = arbeitszeit % 60;
          if (stunden > 0 && minuten > 0) {
            dauerText = `${stunden}h ${minuten}min`;
          } else if (stunden > 0) {
            dauerText = `${stunden}h`;
          } else {
            dauerText = `${minuten}min`;
          }
        }

        // Kundenname ermitteln
        let kundenName = 'Unbekannt';
        if (isIntern) {
          kundenName = '🔧 Interner Termin';
        } else if (termin.kunde_name) {
          kundenName = termin.kunde_name;
        } else if (termin.kunde_id) {
          const kunde = this.kundenCache.find(k => k.id === termin.kunde_id);
          if (kunde) kundenName = kunde.name;
        }

        // Arbeiten kürzen falls zu lang
        let arbeitText = termin.arbeit || '-';
        if (arbeitText.length > 100) {
          arbeitText = arbeitText.substring(0, 100) + '...';
        }

        // Status-Badge
        const statusLabels = {
          'geplant': '⏳ Geplant',
          'in_arbeit': '🔧 In Arbeit',
          'abgeschlossen': '✅ Abgeschlossen'
        };
        const statusLabel = statusLabels[termin.status] || '⏳ Geplant';

        html += `
          <div class="tages-termin-card ${statusClass} ${internClass}">
            <div class="tages-termin-zeit">
              <span class="zeit">${uhrzeitAnzeige || '--:--'}</span>
              ${dauerText ? `<span class="dauer">${dauerText}</span>` : ''}
            </div>
            <div class="tages-termin-info">
              <div class="tages-termin-kunde">${this.escapeHtml(kundenName)}</div>
              ${!isIntern && termin.kennzeichen ? `<div class="tages-termin-kennzeichen">🚗 ${this.escapeHtml(termin.kennzeichen)}</div>` : ''}
              <div class="tages-termin-arbeit">${this.escapeHtml(arbeitText)}</div>
            </div>
            <div class="tages-termin-status">
              <span class="status-badge ${statusClass}">${statusLabel}</span>
            </div>
          </div>
        `;
      }

      body.innerHTML = html;

    } catch (error) {
      console.error('Fehler beim Laden der Tagesübersicht:', error);
      body.innerHTML = '<div class="loading">Fehler beim Laden der Termine</div>';
    }
  }

  closeTagesUebersichtModal() {
    const modal = document.getElementById('tagesUebersichtModal');
    if (modal) {
      modal.style.display = 'none';
    }
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

      // Speichere Phasen wenn mehrtägig aktiviert ist
      const mehrtaegigCheckbox = document.getElementById('modalMehrtaegigCheckbox');
      if (mehrtaegigCheckbox && mehrtaegigCheckbox.checked) {
        const phasen = this.getModalPhasenFromForm();
        if (phasen.length > 0) {
          await PhasenService.syncPhasen(this.currentTerminId, phasen);
          
          // Prüfe ob Folgetermine erstellt werden sollen
          const erstelleFolgetermineCheckbox = document.getElementById('modalErstelleFolgetermineCheckbox');
          if (erstelleFolgetermineCheckbox && erstelleFolgetermineCheckbox.checked && phasen.length > 1) {
            // Erstelle Folgetermine für Phasen an anderen Tagen
            const hauptTermin = {
              kunde_id: termin.kunde_id,
              kunde_name: termin.kunde_name,
              kunde_telefon: termin.kunde_telefon,
              kennzeichen: termin.kennzeichen,
              datum: termin.datum,
              mitarbeiter_id: terminMitarbeiterId,
              dringlichkeit: termin.dringlichkeit,
              vin: termin.vin,
              fahrzeugtyp: termin.fahrzeugtyp
            };
            
            const ergebnisse = await this.erstelleFolgetermineAusPhasen(
              hauptTermin,
              phasen,
              termin.termin_nr
            );
            
            if (ergebnisse.erfolg > 0) {
              alert(`Zeiten & Status gespeichert!\n\n📅 ${ergebnisse.erfolg} Folgetermin(e) für neue Phasen erstellt.`);
            }
          }
        }
      } else {
        // Wenn mehrtägig deaktiviert, lösche alle Phasen
        await PhasenService.syncPhasen(this.currentTerminId, []);
      }

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
        datum: this.formatDateLocal(day),
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

  // Dringlichkeit-Badge HTML generieren
  getDringlichkeitBadge(dringlichkeit) {
    if (!dringlichkeit) return '';
    
    const badges = {
      'dringend': '<span class="dringlichkeit-badge dringlichkeit-dringend">🔴 Dringend</span>',
      'heute': '<span class="dringlichkeit-badge dringlichkeit-heute">🟠 Heute</span>',
      'woche': '<span class="dringlichkeit-badge dringlichkeit-woche">🟡 Diese Woche</span>'
    };
    
    return badges[dringlichkeit] || '';
  }

  // Folgetermin-Badge HTML generieren
  getFolgeterminBadge(arbeitText) {
    if (!arbeitText) return '';
    
    // Prüfe ob es ein Folgetermin ist
    const match = arbeitText.match(/\[Folgetermin zu (T-\d{4}-\d{3})\]/);
    if (match) {
      return `<span style="display: inline-block; margin-left: 5px; padding: 2px 6px; background: #ff9800; color: white; border-radius: 4px; font-size: 0.75em; font-weight: bold;" title="Folgetermin von ${match[1]}">🔗 Folge</span>`;
    }
    return '';
  }

  // Arbeit-Anzeige formatieren (Folgetermin-Prefix entfernen für bessere Lesbarkeit)
  formatArbeitAnzeige(arbeitText) {
    if (!arbeitText) return '-';
    
    // Entferne Folgetermin-Prefix für kürzere Anzeige
    const cleaned = arbeitText.replace(/\[Folgetermin zu T-\d{4}-\d{3}\]\s*/, '');
    return cleaned || '-';
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

  // ==========================================
  // Auslastung Kalender-Picker Funktionen
  // ==========================================

  setupAuslastungKalender() {
    this.kalenderAktuellMonat = new Date();
    this.kalenderAuslastungCache = {};

    const datumPickerBtn = document.getElementById('datumPickerBtn');
    if (datumPickerBtn) {
      datumPickerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openAuslastungKalender();
      });
    }

    const kalenderPrevMonth = document.getElementById('kalenderPrevMonth');
    if (kalenderPrevMonth) {
      kalenderPrevMonth.addEventListener('click', () => this.navigateKalenderMonat(-1));
    }

    const kalenderNextMonth = document.getElementById('kalenderNextMonth');
    if (kalenderNextMonth) {
      kalenderNextMonth.addEventListener('click', () => this.navigateKalenderMonat(1));
    }

    const kalenderHeuteBtn = document.getElementById('kalenderHeuteBtn');
    if (kalenderHeuteBtn) {
      kalenderHeuteBtn.addEventListener('click', () => this.selectKalenderHeute());
    }

    const kalenderSchliessenBtn = document.getElementById('kalenderSchliessenBtn');
    if (kalenderSchliessenBtn) {
      kalenderSchliessenBtn.addEventListener('click', () => this.closeAuslastungKalender());
    }

    // Schließen bei Klick außerhalb
    document.addEventListener('click', (e) => {
      const popup = document.getElementById('auslastungKalenderPopup');
      const datumWrapper = e.target.closest('.datum-picker-wrapper');
      const datumFormGroup = e.target.closest('.form-group');
      if (popup && popup.style.display !== 'none' && !popup.contains(e.target) && !datumWrapper) {
        this.closeAuslastungKalender();
      }
    });
  }

  async openAuslastungKalender() {
    const popup = document.getElementById('auslastungKalenderPopup');
    if (!popup) return;

    // Setze den aktuellen Monat basierend auf ausgewähltem Datum oder heute
    const datumInput = document.getElementById('datum');
    if (datumInput && datumInput.value) {
      this.kalenderAktuellMonat = new Date(datumInput.value + 'T00:00:00');
    } else {
      this.kalenderAktuellMonat = new Date();
    }

    popup.style.display = 'block';
    await this.renderAuslastungKalender();
  }

  closeAuslastungKalender() {
    const popup = document.getElementById('auslastungKalenderPopup');
    if (popup) {
      popup.style.display = 'none';
    }
  }

  async navigateKalenderMonat(offset) {
    this.kalenderAktuellMonat.setMonth(this.kalenderAktuellMonat.getMonth() + offset);
    await this.renderAuslastungKalender();
  }

  async selectKalenderHeute() {
    const heute = new Date();
    const datumInput = document.getElementById('datum');
    if (datumInput) {
      datumInput.value = this.formatDateLocal(heute);
      datumInput.dispatchEvent(new Event('change'));
    }
    this.closeAuslastungKalender();
  }

  async renderAuslastungKalender() {
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
  }

  async loadMonatAuslastung(jahr, monat) {
    const cacheKey = `${jahr}-${monat}`;
    
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
  }

  selectKalenderDatum(datumStr) {
    const datumInput = document.getElementById('datum');
    if (datumInput) {
      datumInput.value = datumStr;
      datumInput.dispatchEvent(new Event('change'));
    }
    this.closeAuslastungKalender();
  }

  // Hilfsmethode zum Escapen von HTML
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

const app = new App();
