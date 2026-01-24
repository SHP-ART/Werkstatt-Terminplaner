class App {
  constructor() {
    this.kundenCache = [];
    this.arbeitszeiten = [];
    this.termineCache = [];
    this.termineById = {};
    this.autocompleteSelectedIndex = -1;
    this.uhrzeitInterval = null;
    this.kiAssistentListenersBound = false;
    this.teileBestellenListenersBound = false;
    this.auslastungKalenderInitialized = false;
    this.editAuslastungKalenderInitialized = false;
    this.editSuchKalenderInitialized = false;
    
    // KI-Funktionen Status (wird beim Laden der Einstellungen aktualisiert)
    this.kiEnabled = true; // Standard: aktiviert
    // KI-Modus (local/openai)
    this.kiMode = 'local';
    // Echtzeit-Updates Status (wird beim Laden der Einstellungen aktualisiert)
    this.realtimeEnabled = true; // Standard: aktiviert
    // Smart Scheduling Status
    this.smartSchedulingEnabled = true;
    // Anomalie-Erkennung Status
    this.anomalyDetectionEnabled = true;
    
    // Test-Datum Override: Setze auf null für echtes Datum, oder z.B. '2026-01-04' für Tests
    // Kann auch über Browser-Konsole gesetzt werden: app.testDatum = '2026-01-05'
    this.testDatum = null; // null = echtes Systemdatum verwenden
    
    // Planungs-Drag&Drop: Lokaler Änderungspuffer
    this.planungAenderungen = new Map(); // terminId -> { startzeit, mitarbeiter_id, lehrling_id, type, originalData }
    this.planungRaster = 5; // Standard-Raster: 5 Minuten

    // === Performance-Optimierung: Tab-Element-Caching ===
    // Cache für häufig verwendete DOM-Elemente
    this.tabCache = {
      buttons: null,         // Alle Tab-Buttons
      contents: null,        // Alle Tab-Inhalte
      subTabButtons: null,   // Alle Sub-Tab-Buttons
      subTabContents: null,  // Alle Sub-Tab-Inhalte
      byId: new Map()        // Element-Cache nach ID
    };
    this.currentTab = 'dashboard';
    this.tabStateStore = new Map();
    this.stickyTabs = new Set(['dashboard']);
    this.ws = null;
    this.wsReconnectTimer = null;

    // Fuzzy Search Index für Kundensuche
    this.fuzzySearchIndex = null;

    this.init();
  }

  // Gibt das aktuelle "Heute"-Datum zurück (für Tests überschreibbar)
  getToday() {
    if (this.testDatum) {
      return new Date(this.testDatum + 'T12:00:00');
    }
    return new Date();
  }

  // Hilfsfunktion: Datum lokal formatieren (YYYY-MM-DD) ohne Zeitzonenkonvertierung
  formatDateLocal(date) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Hilfsfunktion: Kalenderwoche berechnen (ISO 8601)
  getKalenderwoche(date) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    d.setHours(0, 0, 0, 0);
    // Donnerstag dieser Woche bestimmt das Jahr der KW
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  }

  // Prüft, ob ein Lehrling an einem bestimmten Datum in der Berufsschule ist
  isLehrlingInBerufsschule(lehrling, datum) {
    if (!lehrling || !lehrling.berufsschul_wochen || !datum) {
      return { inSchule: false, kw: null };
    }
    // berufsschul_wochen kann sein: "1,5,9,13" oder "1, 5, 9, 13"
    const kw = this.getKalenderwoche(datum);
    const schulwochen = lehrling.berufsschul_wochen.split(',')
      .map(w => parseInt(w.trim(), 10))
      .filter(w => !isNaN(w));
    const inSchule = schulwochen.includes(kw);
    return { inSchule, kw };
  }

  // Toast-Benachrichtigung anzeigen
  showToast(message, type = 'info') {
    // Prüfen ob bereits ein Toast-Container existiert
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toastContainer';
      toastContainer.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px;';
      document.body.appendChild(toastContainer);
    }

    // Toast erstellen
    const toast = document.createElement('div');
    const colors = {
      success: { bg: '#4caf50', icon: '✅' },
      error: { bg: '#f44336', icon: '❌' },
      warning: { bg: '#ff9800', icon: '⚠️' },
      info: { bg: '#2196f3', icon: 'ℹ️' }
    };
    const color = colors[type] || colors.info;

    toast.style.cssText = `
      background: ${color.bg}; color: white; padding: 15px 20px; border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 10px;
      font-size: 14px; font-weight: 500; animation: slideIn 0.3s ease-out;
      max-width: 350px; word-wrap: break-word;
    `;
    toast.innerHTML = `<span>${color.icon}</span><span>${message}</span>`;

    // CSS Animation hinzufügen falls noch nicht vorhanden
    if (!document.getElementById('toastAnimationStyle')) {
      const style = document.createElement('style');
      style.id = 'toastAnimationStyle';
      style.textContent = `
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
      `;
      document.head.appendChild(style);
    }

    toastContainer.appendChild(toast);

    // Nach 3 Sekunden ausblenden
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-out forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  init() {
    this.initTabCache(); // Tab-Caching initialisieren (Performance-Optimierung)
    this.setupEventListeners();
    this.initSubTabs(); // Sub-Tabs initialisieren
    this.loadInitialData();
    this.setTodayDate();
    this.setInternerTerminTodayDate();
    this.loadInternerTerminMitarbeiter();
    this.setupWebSocket();
    this.setupErsatzautoOptionHandlers();
    this.loadServerVersion();
  }

  // === Performance-Optimierung: Tab-Element-Caching ===
  // Initialisiert den Cache für Tab-Elemente (einmalig beim Start)
  initTabCache() {
    // Tab-Buttons cachen
    this.tabCache.buttons = document.querySelectorAll('.tab-button');
    this.tabCache.contents = document.querySelectorAll('.tab-content');
    this.tabCache.subTabButtons = document.querySelectorAll('.sub-tab-button');
    this.tabCache.subTabContents = document.querySelectorAll('.sub-tab-content');

    // Elemente nach ID cachen für schnellen Zugriff
    this.tabCache.contents.forEach(content => {
      if (content.id) {
        this.tabCache.byId.set(content.id, content);
      }
    });
    this.tabCache.subTabContents.forEach(content => {
      if (content.id) {
        this.tabCache.byId.set(content.id, content);
      }
    });

    console.log(`[Tab-Cache] Initialisiert: ${this.tabCache.buttons.length} Tabs, ${this.tabCache.subTabButtons.length} Sub-Tabs`);
  }

  // Cached getElementById - vermeidet wiederholte DOM-Abfragen
  getCachedElement(id) {
    if (this.tabCache.byId.has(id)) {
      const cached = this.tabCache.byId.get(id);
      if (cached && document.contains(cached)) {
        return cached;
      }
      this.tabCache.byId.delete(id);
    }
    const element = document.getElementById(id);
    if (element) {
      this.tabCache.byId.set(id, element);
    }
    return element;
  }

  escapeSelector(value) {
    if (window.CSS && CSS.escape) {
      return CSS.escape(value);
    }
    return String(value).replace(/["'\\]/g, '\\$&');
  }

  saveTabState(tabName) {
    const container = this.getCachedElement(tabName);
    if (!container) return;
    if (container.dataset.templateId && container.dataset.loaded !== 'true') return;

    const fields = [];
    container.querySelectorAll('input, select, textarea').forEach(field => {
      if (!field.id && !field.name) return;
      if (field.type === 'file') return;

      const entry = {
        kind: field.tagName.toLowerCase(),
        type: field.type || null,
        id: field.id || null,
        name: field.name || null
      };

      if (field.tagName === 'SELECT') {
        if (field.multiple) {
          entry.multiple = true;
          entry.selectedValues = Array.from(field.selectedOptions).map(option => option.value);
        } else {
          entry.value = field.value;
        }
        fields.push(entry);
        return;
      }

      if (field.type === 'checkbox') {
        entry.checked = field.checked;
        fields.push(entry);
        return;
      }

      if (field.type === 'radio') {
        if (field.checked) {
          entry.value = field.value;
          fields.push(entry);
        }
        return;
      }

      entry.value = field.value;
      fields.push(entry);
    });

    const subTabs = [];
    container.querySelectorAll('.sub-tabs').forEach((subTabsContainer, index) => {
      const activeButton = subTabsContainer.querySelector('.sub-tab-button.active');
      const activeName = activeButton ? activeButton.dataset.subtab : null;
      subTabs.push({ index, activeName });
    });

    this.tabStateStore.set(tabName, {
      fields,
      subTabs,
      scrollTop: container.scrollTop || 0
    });
  }

  restoreTabSubTabs(tabName) {
    const state = this.tabStateStore.get(tabName);
    if (!state || !state.subTabs) return;

    const container = this.getCachedElement(tabName);
    if (!container) return;

    const subTabsContainers = container.querySelectorAll('.sub-tabs');
    state.subTabs.forEach(saved => {
      const subTabsContainer = subTabsContainers[saved.index];
      if (!subTabsContainer || !saved.activeName) return;
      this.setActiveSubTabInContainer(subTabsContainer, saved.activeName);
    });
  }

  restoreTabFields(tabName) {
    const state = this.tabStateStore.get(tabName);
    if (!state) return;

    const container = this.getCachedElement(tabName);
    if (!container) return;

    if (typeof state.scrollTop === 'number') {
      container.scrollTop = state.scrollTop;
    }

    state.fields.forEach(entry => {
      let field = null;
      if (entry.id) {
        field = container.querySelector(`#${this.escapeSelector(entry.id)}`);
      }

      if (entry.type === 'radio') {
        if (!entry.name) return;
        const selector = `input[type="radio"][name="${this.escapeSelector(entry.name)}"][value="${this.escapeSelector(entry.value)}"]`;
        const radio = container.querySelector(selector);
        if (radio) {
          radio.checked = true;
        }
        return;
      }

      if (!field && entry.name) {
        field = container.querySelector(`[name="${this.escapeSelector(entry.name)}"]`);
      }

      if (!field) return;

      if (field.tagName === 'SELECT' && entry.multiple) {
        const values = new Set(entry.selectedValues || []);
        Array.from(field.options).forEach(option => {
          option.selected = values.has(option.value);
        });
        return;
      }

      if (entry.type === 'checkbox') {
        field.checked = !!entry.checked;
        return;
      }

      if ('value' in entry) {
        field.value = entry.value;
      }
    });
  }

  unloadTabContent(tabName) {
    if (this.stickyTabs.has(tabName)) return;
    const container = this.getCachedElement(tabName);
    if (!container || !container.dataset.templateId) return;
    if (container.dataset.loaded !== 'true') return;

    this.saveTabState(tabName);
    container.querySelectorAll('[id]').forEach(element => {
      if (element.id) {
        this.tabCache.byId.delete(element.id);
      }
    });
    container.innerHTML = '';
    container.dataset.loaded = 'false';
    console.log(`[Lazy-Tab] Unloaded: ${tabName}`);
  }

  setActiveSubTabInContainer(subTabsContainer, subTabName) {
    const buttons = subTabsContainer.querySelectorAll('.sub-tab-button');
    const hasMatch = Array.from(buttons).some(btn => btn.dataset.subtab === subTabName);
    if (!hasMatch) return;
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const name = btn.dataset.subtab;
      btn.classList.toggle('active', name === subTabName);
      if (name) {
        const content = this.getCachedElement(name);
        if (content) {
          const isActive = name === subTabName;
          content.style.display = isActive ? 'block' : 'none';
          content.classList.toggle('active', isActive);
        }
      }
    }
  }

  bindEventListenerOnce(element, event, handler, key) {
    if (!element) return;
    const datasetKey = `bound${key}`;
    if (element.dataset[datasetKey]) return;
    element.addEventListener(event, handler);
    element.dataset[datasetKey] = 'true';
  }

  initSubTabsFor(container) {
    if (!container) return;
    container.querySelectorAll('.sub-tab-content').forEach(content => {
      if (!content.classList.contains('active')) {
        content.style.display = 'none';
      } else {
        content.style.display = 'block';
      }
    });
  }

  ensureTabContent(tabName) {
    const container = this.getCachedElement(tabName);
    if (!container) return;

    const templateId = container.dataset.templateId;
    if (!templateId) return;
    if (container.dataset.loaded === 'true' && container.innerHTML.trim() === '') {
      console.warn(`[Lazy-Tab] Leerer Container trotz loaded=true, lade neu: ${tabName}`);
      container.dataset.loaded = 'false';
    }
    if (container.dataset.loaded === 'true') return;

    const template = document.getElementById(templateId);
    if (!template) return;

    container.appendChild(template.content.cloneNode(true));
    container.dataset.loaded = 'true';
    this.initSubTabsFor(container);
    this.bindSubTabDelegation();
    this.bindLazyEventListeners();
  }

  // Lädt und zeigt die Server-Version im Header an
  async loadServerVersion() {
    try {
      const response = await ApiService.get('/server-info');
      if (response && response.version) {
        const versionEl = document.getElementById('appVersion');
        if (versionEl) {
          versionEl.textContent = `v${response.version}`;
        }
      }
    } catch (error) {
      console.warn('Server-Version konnte nicht geladen werden:', error);
    }
  }

  // Initialisiert alle Sub-Tabs und setzt display:none für nicht-aktive
  initSubTabs() {
    document.querySelectorAll('.sub-tab-content').forEach(content => {
      if (!content.classList.contains('active')) {
        content.style.display = 'none';
      } else {
        content.style.display = 'block';
      }
    });
  }

  setupWebSocket() {
    if (!this.realtimeEnabled) {
      console.log('Echtzeit-Updates deaktiviert. WebSocket wird nicht gestartet.');
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const serverConfig = CONFIG.getServerConfig();
    if (!serverConfig || !serverConfig.ip || !serverConfig.port) {
        console.error("Server-Konfiguration nicht gefunden. WebSocket kann nicht gestartet werden.");
        return;
    }
    
    const wsUrl = `ws://${serverConfig.ip}:${serverConfig.port}`;
    console.log(`Connecting WebSocket to ${wsUrl}`);

    const connect = () => {
        if (!this.realtimeEnabled) {
            return;
        }
        const ws = new WebSocket(wsUrl);
        this.ws = ws;

        ws.addEventListener('open', () => {
            if (!this.realtimeEnabled) {
              ws.close(1000, 'Realtime disabled');
              return;
            }
            console.log('WebSocket-Verbindung hergestellt.');
        });

        ws.addEventListener('message', (event) => {
            if (!this.realtimeEnabled) return;
            this.handleWebSocketMessage(event);
        });

        ws.addEventListener('close', (event) => {
            console.log(`WebSocket-Verbindung getrennt. Code: ${event.code}, Grund: '${event.reason}'. Erneuter Verbindungsversuch in 5 Sekunden...`);
            if (this.ws === ws) {
              this.ws = null;
            }
            if (this.realtimeEnabled) {
              this.clearWebSocketReconnect();
              this.wsReconnectTimer = setTimeout(connect, 5000);
            }
        });

        ws.addEventListener('error', (err) => {
            console.error('WebSocket-Fehler:', err);
        });
    }

    this.clearWebSocketReconnect();
    connect();
  }

  clearWebSocketReconnect() {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
  }

  stopWebSocket() {
    this.clearWebSocketReconnect();
    if (this.ws) {
      try {
        this.ws.close(1000, 'Realtime disabled');
      } catch (err) {
        // ignore close errors
      }
      this.ws = null;
    }
  }

  handleWebSocketMessage(event) {
    let message = null;
    try {
      message = JSON.parse(event.data);
    } catch (err) {
      return;
    }

    if (!message || !message.event) return;

    const eventName = message.event;
    const data = message.data || {};

    if (eventName.startsWith('kunde.')) {
      this.handleRealtimeKundenEvent(eventName, data);
      return;
    }

    if (eventName.startsWith('termin.')) {
      this.handleRealtimeTerminEvent(eventName, data);
    }
  }

  handleRealtimeKundenEvent(eventName, data) {
    this.loadKunden();

    if (this.currentTab === 'dashboard') {
      this.loadDashboard();
    }
  }

  handleRealtimeTerminEvent(eventName, data) {
    const activeTab = this.currentTab;

    this.loadTermineCache();

    if (activeTab === 'dashboard') {
      this.loadDashboard();
    }

    if (activeTab === 'heute') {
      this.loadHeuteTermine();
    }

    if (activeTab === 'termine') {
      this.loadTerminAuslastungAnzeige();

      const activeSubTab = document.querySelector('#termine .sub-tab-button.active');
      const subTabName = activeSubTab ? activeSubTab.dataset.subtab : null;

      if (subTabName === 'terminBearbeiten') {
        this.loadEditTermine();
      }
      if (subTabName === 'wartendeAktionen') {
        this.loadWartendeAktionen();
      }
      if (subTabName === 'internerTermin') {
        this.loadInterneTermineImSubTab();
      }
    }

    if (activeTab === 'zeitverwaltung') {
      this.loadTermine();
      this.loadTermineZeiten();
    }

    if (activeTab === 'auslastung') {
      const selectedDatum = document.getElementById('auslastungDatum')?.value;
      if (!selectedDatum || this.eventTouchesDatum(data, selectedDatum)) {
        this.loadAuslastung();
      }
    }

    if (activeTab === 'auslastung-dragdrop') {
      const selectedDatum = document.getElementById('auslastungDragDropDatum')?.value;
      if (!selectedDatum || this.eventTouchesDatum(data, selectedDatum)) {
        this.loadAuslastungDragDrop();
      }
    }

    if (activeTab === 'papierkorb' && (eventName === 'termin.deleted' || eventName === 'termin.restored')) {
      this.loadPapierkorb();
    }
  }

  eventTouchesDatum(data, datum) {
    if (!datum) return true;
    return data.datum === datum || data.oldDatum === datum || data.newDatum === datum;
  }

  bindPlanungEventListeners() {
    const dragDropDatum = document.getElementById('auslastungDragDropDatum');
    this.bindEventListenerOnce(dragDropDatum, 'change', () => {
      this.updatePlanungWocheInfo();
      this.loadAuslastungDragDrop();
    }, 'PlanungDatumChange');

    const planungPrevTag = document.getElementById('planungPrevTag');
    const planungNextTag = document.getElementById('planungNextTag');
    const planungPrevWoche = document.getElementById('planungPrevWoche');
    const planungNextWoche = document.getElementById('planungNextWoche');
    const planungHeuteBtn = document.getElementById('planungHeuteBtn');

    this.bindEventListenerOnce(planungPrevTag, 'click', () => this.navigatePlanung(-1, 'day'), 'PlanungPrevTag');
    this.bindEventListenerOnce(planungNextTag, 'click', () => this.navigatePlanung(1, 'day'), 'PlanungNextTag');
    this.bindEventListenerOnce(planungPrevWoche, 'click', () => this.navigatePlanung(-7, 'week'), 'PlanungPrevWoche');
    this.bindEventListenerOnce(planungNextWoche, 'click', () => this.navigatePlanung(7, 'week'), 'PlanungNextWoche');
    this.bindEventListenerOnce(planungHeuteBtn, 'click', () => this.goToPlanungHeute(), 'PlanungHeute');
  }

  bindSubTabDelegation() {
    document.querySelectorAll('.sub-tabs').forEach(container => {
      this.bindEventListenerOnce(container, 'click', (e) => {
        const button = e.target.closest('.sub-tab-button');
        if (button) {
          this.handleSubTabChange(e);
        }
      }, 'SubTabDelegation');
    });
  }

  bindLazyEventListeners() {
    this.bindEventListenerOnce(document.getElementById('terminForm'), 'submit', (e) => this.handleTerminSubmit(e), 'TerminFormSubmit');
    this.bindEventListenerOnce(document.getElementById('internerTerminForm'), 'submit', (e) => this.handleInternerTerminSubmit(e), 'InternerTerminFormSubmit');
    this.bindEventListenerOnce(document.getElementById('kundenForm'), 'submit', (e) => this.handleKundenSubmit(e), 'KundenFormSubmit');
    this.bindEventListenerOnce(document.getElementById('zeitAnpassungForm'), 'submit', (e) => this.handleZeitAnpassungSubmit(e), 'ZeitAnpassungFormSubmit');
    this.bindEventListenerOnce(document.getElementById('serverConfigForm'), 'submit', (e) => this.handleServerConfigSubmit(e), 'ServerConfigFormSubmit');
    this.bindEventListenerOnce(document.getElementById('werkstattSettingsForm'), 'submit', (e) => this.handleWerkstattSettingsSubmit(e), 'WerkstattSettingsFormSubmit');

    const chatgptApiKeyForm = document.getElementById('chatgptApiKeyForm');
    this.bindEventListenerOnce(chatgptApiKeyForm, 'submit', (e) => this.handleChatGPTApiKeySubmit(e), 'ChatGPTApiKeySubmit');

    const toggleApiKeyVisibility = document.getElementById('toggleApiKeyVisibility');
    this.bindEventListenerOnce(toggleApiKeyVisibility, 'click', () => this.toggleApiKeyVisibility(), 'ToggleApiKeyVisibility');

    const testApiKeyBtn = document.getElementById('testApiKeyBtn');
    this.bindEventListenerOnce(testApiKeyBtn, 'click', () => this.testChatGPTApiKey(), 'TestApiKey');

    const deleteApiKeyBtn = document.getElementById('deleteApiKeyBtn');
    this.bindEventListenerOnce(deleteApiKeyBtn, 'click', () => this.deleteChatGPTApiKey(), 'DeleteApiKey');

    const kiEnabledToggle = document.getElementById('kiEnabledToggle');
    this.bindEventListenerOnce(kiEnabledToggle, 'change', (e) => this.handleKIEnabledToggle(e), 'KiEnabledToggle');
    const realtimeEnabledToggle = document.getElementById('realtimeEnabledToggle');
    this.bindEventListenerOnce(realtimeEnabledToggle, 'change', (e) => this.handleRealtimeEnabledToggle(e), 'RealtimeEnabledToggle');
    const smartSchedulingToggle = document.getElementById('smartSchedulingToggle');
    this.bindEventListenerOnce(smartSchedulingToggle, 'change', (e) => this.handleSmartSchedulingToggle(e), 'SmartSchedulingToggle');
    const anomalyDetectionToggle = document.getElementById('anomalyDetectionToggle');
    this.bindEventListenerOnce(anomalyDetectionToggle, 'change', (e) => this.handleAnomalyDetectionToggle(e), 'AnomalyDetectionToggle');
    const kiModeSelect = document.getElementById('kiModeSelect');
    this.bindEventListenerOnce(kiModeSelect, 'change', (e) => this.handleKIModeChange(e), 'KIModeChange');

    // KI-Trainingsdaten Buttons
    const btnExcludeOutliers = document.getElementById('btnExcludeOutliers');
    this.bindEventListenerOnce(btnExcludeOutliers, 'click', () => this.handleExcludeOutliers(), 'ExcludeOutliers');
    const btnRetrainModel = document.getElementById('btnRetrainModel');
    this.bindEventListenerOnce(btnRetrainModel, 'click', () => this.handleRetrainModel(), 'RetrainModel');
    const btnShowTrainingDetails = document.getElementById('btnShowTrainingDetails');
    this.bindEventListenerOnce(btnShowTrainingDetails, 'click', () => this.toggleTrainingDetails(), 'ShowTrainingDetails');

    const wartendeAktionForm = document.getElementById('wartendeAktionForm');
    this.bindEventListenerOnce(wartendeAktionForm, 'submit', (e) => this.handleWartendeAktionSubmit(e), 'WartendeAktionSubmit');

    this.setupWartendeAktionenKundensuche();

    const ersatzautoForm = document.getElementById('ersatzautoForm');
    this.bindEventListenerOnce(ersatzautoForm, 'submit', (e) => this.handleErsatzautoSubmit(e), 'ErsatzautoSubmit');

    this.bindEventListenerOnce(document.getElementById('urlaubForm'), 'submit', (e) => this.handleUrlaubSubmit(e), 'UrlaubFormSubmit');
    this.bindEventListenerOnce(document.getElementById('krankForm'), 'submit', (e) => this.handleKrankSubmit(e), 'KrankFormSubmit');

    const arbeitEingabe = document.getElementById('arbeitEingabe');
    this.bindEventListenerOnce(arbeitEingabe, 'input', (e) => {
      this.updateZeitschaetzung();
      this.handleArbeitAutocomplete(e);
      this.validateTerminEchtzeit();
      this.handleKIAutoSuggest(e);
    }, 'ArbeitEingabeInput');
    this.bindEventListenerOnce(arbeitEingabe, 'keydown', (e) => this.handleArbeitKeydown(e), 'ArbeitEingabeKeydown');

    const kiVorschlaegeClose = document.getElementById('kiVorschlaegeClose');
    this.bindEventListenerOnce(kiVorschlaegeClose, 'click', () => this.hideKIVorschlaege(), 'KiVorschlaegeClose');

    this.bindEventListenerOnce(document.getElementById('filterDatum'), 'change', () => {
      this.loadTermine();
      this.updateZeitverwaltungDatumAnzeige();
    }, 'FilterDatumChange');
    this.bindEventListenerOnce(document.getElementById('alleTermineBtn'), 'click', () => this.showAllTermine(), 'AlleTermineClick');
    this.bindEventListenerOnce(document.getElementById('auslastungDatum'), 'change', () => this.loadAuslastung(), 'AuslastungDatumChange');

    this.bindPlanungEventListeners();

    this.bindEventListenerOnce(document.getElementById('auslastungPrevTag'), 'click', () => this.navigateAuslastung(-1, 'day'), 'AuslastungPrevTag');
    this.bindEventListenerOnce(document.getElementById('auslastungNextTag'), 'click', () => this.navigateAuslastung(1, 'day'), 'AuslastungNextTag');
    this.bindEventListenerOnce(document.getElementById('auslastungPrevWoche'), 'click', () => this.navigateAuslastung(-7, 'week'), 'AuslastungPrevWoche');
    this.bindEventListenerOnce(document.getElementById('auslastungNextWoche'), 'click', () => this.navigateAuslastung(7, 'week'), 'AuslastungNextWoche');
    this.bindEventListenerOnce(document.getElementById('auslastungHeuteBtn'), 'click', () => this.goToAuslastungHeute(), 'AuslastungHeute');

    this.bindEventListenerOnce(document.getElementById('prevDayBtn'), 'click', () => this.navigateZeitverwaltung(-1, 'day'), 'ZeitverwaltungPrevDay');
    this.bindEventListenerOnce(document.getElementById('nextDayBtn'), 'click', () => this.navigateZeitverwaltung(1, 'day'), 'ZeitverwaltungNextDay');
    this.bindEventListenerOnce(document.getElementById('prevWeekBtn'), 'click', () => this.navigateZeitverwaltung(-7, 'week'), 'ZeitverwaltungPrevWeek');
    this.bindEventListenerOnce(document.getElementById('nextWeekBtn'), 'click', () => this.navigateZeitverwaltung(7, 'week'), 'ZeitverwaltungNextWeek');
    this.bindEventListenerOnce(document.getElementById('todayBtn'), 'click', () => this.goToToday(), 'ZeitverwaltungToday');
    this.bindEventListenerOnce(document.getElementById('morgenBtn'), 'click', () => this.goToMorgen(), 'ZeitverwaltungMorgen');
    this.bindEventListenerOnce(document.getElementById('wocheBtn'), 'click', () => this.showWocheTermine(), 'ZeitverwaltungWoche');
    this.bindEventListenerOnce(document.getElementById('offeneTermineBtn'), 'click', () => this.showOffeneTermine(), 'ZeitverwaltungOffene');
    this.bindEventListenerOnce(document.getElementById('schwebendeTermineBtn'), 'click', () => this.showSchwebendeTermine(), 'ZeitverwaltungSchwebende');

    const schwebendDisplay = document.getElementById('schwebendDisplay');
    this.bindEventListenerOnce(schwebendDisplay, 'click', () => this.showSchwebendeTermine(), 'SchwebendDisplayClick');

    this.bindEventListenerOnce(document.getElementById('krankVonDatum'), 'change', () => this.validateKrankDatum(), 'KrankVonDatum');
    this.bindEventListenerOnce(document.getElementById('krankBisDatum'), 'change', () => this.validateKrankDatum(), 'KrankBisDatum');
    this.bindEventListenerOnce(document.getElementById('importBtn'), 'click', () => this.importKunden(), 'ImportKunden');
    this.bindEventListenerOnce(document.getElementById('testConnectionBtn'), 'click', () => this.testConnection(), 'TestConnection');

    this.setupKIAssistentEventListeners();
    this.setupTeileBestellenEventListeners();

    const excelFileInput = document.getElementById('excelFileInput');
    this.bindEventListenerOnce(excelFileInput, 'change', (e) => this.handleExcelFileSelect(e), 'ExcelFileChange');
    const confirmImportBtn = document.getElementById('confirmImportBtn');
    this.bindEventListenerOnce(confirmImportBtn, 'click', () => this.confirmExcelImport(), 'ConfirmExcelImport');
    const cancelImportBtn = document.getElementById('cancelImportBtn');
    this.bindEventListenerOnce(cancelImportBtn, 'click', () => this.cancelExcelImport(), 'CancelExcelImport');

    const bringZeitInputNew = document.getElementById('bring_zeit');
    const datumInputForBringzeit = document.getElementById('datum');
    this.bindEventListenerOnce(bringZeitInputNew, 'blur', () => this.pruefeBringzeitUeberschneidung('bring_zeit', 'datum', 'bringzeitHinweis'), 'BringzeitBlur');
    this.bindEventListenerOnce(bringZeitInputNew, 'change', () => this.pruefeBringzeitUeberschneidung('bring_zeit', 'datum', 'bringzeitHinweis'), 'BringzeitChange');
    this.bindEventListenerOnce(datumInputForBringzeit, 'change', () => {
      const bringzeit = document.getElementById('bring_zeit')?.value;
      if (bringzeit && bringzeit.match(/^\d{2}:\d{2}$/)) {
        this.pruefeBringzeitUeberschneidung('bring_zeit', 'datum', 'bringzeitHinweis');
      }
    }, 'BringzeitDatumChange');

    const editBringZeitInputNew = document.getElementById('edit_bring_zeit');
    const editDatumInputNew = document.getElementById('edit_datum');
    this.bindEventListenerOnce(editBringZeitInputNew, 'blur', () => this.pruefeBringzeitUeberschneidung('edit_bring_zeit', 'edit_datum', 'editBringzeitHinweis', this.editingTerminId), 'EditBringzeitBlur');
    this.bindEventListenerOnce(editBringZeitInputNew, 'change', () => this.pruefeBringzeitUeberschneidung('edit_bring_zeit', 'edit_datum', 'editBringzeitHinweis', this.editingTerminId), 'EditBringzeitChange');
    this.bindEventListenerOnce(editDatumInputNew, 'change', () => {
      const bringzeit = document.getElementById('edit_bring_zeit')?.value;
      if (bringzeit && bringzeit.match(/^\d{2}:\d{2}$/)) {
        this.pruefeBringzeitUeberschneidung('edit_bring_zeit', 'edit_datum', 'editBringzeitHinweis', this.editingTerminId);
      }
    }, 'EditBringzeitDatumChange');

    const closeFahrzeugAuswahl = document.getElementById('closeFahrzeugAuswahl');
    this.bindEventListenerOnce(closeFahrzeugAuswahl, 'click', () => this.closeFahrzeugAuswahlModal(), 'CloseFahrzeugAuswahl');
    const fahrzeugAuswahlZurueck = document.getElementById('fahrzeugAuswahlZurueck');
    this.bindEventListenerOnce(fahrzeugAuswahlZurueck, 'click', () => this.closeFahrzeugAuswahlModal(), 'FahrzeugAuswahlZurueck');

    const closeFahrzeugVerwaltung = document.getElementById('closeFahrzeugVerwaltung');
    this.bindEventListenerOnce(closeFahrzeugVerwaltung, 'click', () => this.closeFahrzeugVerwaltungModal(), 'CloseFahrzeugVerwaltung');
    const fahrzeugVerwaltungSchliessen = document.getElementById('fahrzeugVerwaltungSchliessen');
    this.bindEventListenerOnce(fahrzeugVerwaltungSchliessen, 'click', () => this.closeFahrzeugVerwaltungModal(), 'FahrzeugVerwaltungSchliessen');
    const fahrzeugHinzufuegenBtn = document.getElementById('fahrzeugHinzufuegenBtn');
    this.bindEventListenerOnce(fahrzeugHinzufuegenBtn, 'click', () => this.addFahrzeugFromModal(), 'FahrzeugHinzufuegen');

    const kundenListeSuche = document.getElementById('kundenListeSuche');
    this.bindEventListenerOnce(kundenListeSuche, 'input', () => this.filterKundenListe(), 'KundenListeSucheInput');
    this.bindEventListenerOnce(kundenListeSuche, 'keydown', (e) => {
      if (e.key === 'Escape') {
        this.clearKundenSuche();
      }
    }, 'KundenListeSucheKeydown');
    const kundenSucheClearBtn = document.getElementById('kundenSucheClearBtn');
    this.bindEventListenerOnce(kundenSucheClearBtn, 'click', () => this.clearKundenSuche(), 'KundenSucheClear');

    const terminNameSuche = document.getElementById('terminNameSuche');
    this.bindEventListenerOnce(terminNameSuche, 'input', () => this.handleNameSuche(), 'TerminNameSucheInput');
    this.bindEventListenerOnce(terminNameSuche, 'keydown', (e) => this.handleSucheKeydown(e, 'name'), 'TerminNameSucheKeydown');
    this.bindEventListenerOnce(terminNameSuche, 'blur', () => setTimeout(() => this.hideVorschlaege('name'), 350), 'TerminNameSucheBlur');

    const kzFelder = ['kzSucheBezirk', 'kzSucheBuchstaben', 'kzSucheNummer'];
    const kzFelderSet = new Set(kzFelder);
    kzFelder.forEach((feldId) => {
      const feld = document.getElementById(feldId);
      this.bindEventListenerOnce(feld, 'input', (e) => {
        e.target.value = e.target.value.toUpperCase();
        this.handleKennzeichenSuche();
        if (feldId === 'kzSucheBezirk' && e.target.value.length >= 3) {
          document.getElementById('kzSucheBuchstaben')?.focus();
        } else if (feldId === 'kzSucheBuchstaben' && e.target.value.length >= 2) {
          document.getElementById('kzSucheNummer')?.focus();
        }
      }, `KzSucheInput${feldId}`);
      this.bindEventListenerOnce(feld, 'keydown', (e) => this.handleSucheKeydown(e, 'kennzeichen'), `KzSucheKeydown${feldId}`);
      this.bindEventListenerOnce(feld, 'blur', () => {
        setTimeout(() => {
          const aktivesElement = document.activeElement;
          const aktivesId = aktivesElement ? aktivesElement.id : '';
          if (!kzFelderSet.has(aktivesId)) {
            this.hideVorschlaege('kennzeichen');
          }
        }, 100);
      }, `KzSucheBlur${feldId}`);
    });

    document.querySelectorAll('input[name="abholung_typ"]').forEach(radio => {
      this.bindEventListenerOnce(radio, 'change', () => this.toggleAbholungDetails(), 'AbholungTypChange');
    });

    this.bindEventListenerOnce(document.getElementById('ersatzauto'), 'change', () => this.checkErsatzautoVerfuegbarkeit(), 'ErsatzautoChange');
    this.bindEventListenerOnce(document.getElementById('datum'), 'change', () => this.checkErsatzautoVerfuegbarkeit(), 'ErsatzautoDatumChange');

    const kundenSearchInput = document.getElementById('kundenSearchInput');
    const kundenSearchBtn = document.getElementById('kundenSearchBtn');
    this.bindEventListenerOnce(kundenSearchBtn, 'click', () => this.searchKunden(), 'KundenSearchClick');
    this.bindEventListenerOnce(kundenSearchInput, 'keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.searchKunden();
      }
    }, 'KundenSearchEnter');

    const editTerminLadenBtn = document.getElementById('editTerminLadenBtn');
    this.bindEventListenerOnce(editTerminLadenBtn, 'click', () => this.loadEditTermine(), 'EditTerminLaden');
    const editTerminDatum = document.getElementById('editTerminDatum');
    this.bindEventListenerOnce(editTerminDatum, 'change', () => this.loadEditTermine(), 'EditTerminDatum');
    const terminEditForm = document.getElementById('terminEditForm');
    this.bindEventListenerOnce(terminEditForm, 'submit', (e) => this.handleTerminEditSubmit(e), 'TerminEditSubmit');
    const editTerminAbbrechenBtn = document.getElementById('editTerminAbbrechenBtn');
    this.bindEventListenerOnce(editTerminAbbrechenBtn, 'click', () => this.resetTerminEditForm(), 'EditTerminAbbrechen');
    const editAbholungTyp = document.getElementById('edit_abholung_typ');
    this.bindEventListenerOnce(editAbholungTyp, 'change', () => this.toggleEditAbholungDetails(), 'EditAbholungTyp');
    const editErsatzauto = document.getElementById('edit_ersatzauto');
    this.bindEventListenerOnce(editErsatzauto, 'change', () => this.checkEditErsatzautoVerfuegbarkeit(), 'EditErsatzauto');
    const editDatum = document.getElementById('edit_datum');
    this.bindEventListenerOnce(editDatum, 'change', () => {
      this.checkEditErsatzautoVerfuegbarkeit();
      this.loadEditTerminAuslastungAnzeige();
      this.updateEditSelectedDatumDisplay();
    }, 'EditDatum');
    const editArbeitEingabe = document.getElementById('edit_arbeitEingabe');
    this.bindEventListenerOnce(editArbeitEingabe, 'input', () => this.updateEditZeitschaetzung(), 'EditArbeitInput');

    const mehrtaegigCheckbox = document.getElementById('mehrtaegigCheckbox');
    this.bindEventListenerOnce(mehrtaegigCheckbox, 'change', () => this.togglePhasenSection(), 'MehrtaegigChange');
    const addPhaseBtn = document.getElementById('addPhaseBtn');
    this.bindEventListenerOnce(addPhaseBtn, 'click', () => this.addPhase(), 'AddPhase');

    const heuteTabellenBtn = document.getElementById('heuteTabellenAnsicht');
    this.bindEventListenerOnce(heuteTabellenBtn, 'click', () => this.handleHeuteViewSwitch('tabelle'), 'HeuteTabellen');
    const heuteKartenBtn = document.getElementById('heuteKartenAnsicht');
    this.bindEventListenerOnce(heuteKartenBtn, 'click', () => this.handleHeuteViewSwitch('karten'), 'HeuteKarten');

    const datumInput = document.getElementById('datum');
    this.bindEventListenerOnce(datumInput, 'change', () => {
      this.validateTerminEchtzeit();
      this.loadTerminAuslastungAnzeige();
    }, 'DatumEchtzeitChange');

    this.setupAuslastungKalender();
    this.setupEditAuslastungKalender();
    this.setupEditSuchKalender();

    const kmStandInput = document.getElementById('kilometerstand');
    this.bindEventListenerOnce(kmStandInput, 'input', () => {
      if (kmStandInput.value) {
        kmStandInput.classList.remove('has-previous-value');
        kmStandInput.placeholder = 'z.B. 128000';
      }
    }, 'KmStandInput');

    const createBackupBtn = document.getElementById('createBackupBtn');
    this.bindEventListenerOnce(createBackupBtn, 'click', () => this.handleCreateBackup(), 'CreateBackup');
    const refreshBackupsBtn = document.getElementById('refreshBackupsBtn');
    this.bindEventListenerOnce(refreshBackupsBtn, 'click', () => {
      this.loadBackupStatus();
      this.loadBackupList();
    }, 'RefreshBackups');
    const backupTable = document.getElementById('backupTable');
    this.bindEventListenerOnce(backupTable, 'click', (e) => {
      const restoreBtn = e.target.closest('[data-backup-restore]');
      if (restoreBtn) {
        this.handleRestoreBackup(restoreBtn.dataset.backupRestore);
      }
    }, 'BackupTableClick');

    const uploadInput = document.getElementById('backupUploadInput');
    const uploadName = document.getElementById('backupUploadName');
    this.bindEventListenerOnce(uploadInput, 'change', () => {
      const file = uploadInput.files && uploadInput.files[0];
      if (uploadName) {
        uploadName.textContent = file ? file.name : 'Keine Datei ausgewählt';
      }
    }, 'BackupUploadChange');
    const uploadRestoreBtn = document.getElementById('uploadRestoreBtn');
    this.bindEventListenerOnce(uploadRestoreBtn, 'click', () => this.handleUploadAndRestore(), 'UploadRestore');

    document.querySelectorAll('.close').forEach((btn) => {
      this.bindEventListenerOnce(btn, 'click', () => this.closeModal(), 'CloseModal');
    });
    this.bindEventListenerOnce(document.getElementById('closeDetails'), 'click', () => this.closeTerminDetails(), 'CloseDetails');
    this.bindEventListenerOnce(document.getElementById('closeArbeitszeitenModal'), 'click', () => this.closeArbeitszeitenModal(), 'CloseArbeitszeitenModal');
    this.bindEventListenerOnce(document.getElementById('closeTagesUebersicht'), 'click', () => this.closeTagesUebersichtModal(), 'CloseTagesUebersicht');
    this.bindEventListenerOnce(document.getElementById('saveArbeitszeitenBtn'), 'click', () => this.saveArbeitszeitenModal(), 'SaveArbeitszeiten');

    const closeSplitModal = document.getElementById('closeSplitModal');
    this.bindEventListenerOnce(closeSplitModal, 'click', () => this.closeSplitModal(), 'CloseSplitModal');

    const closeErweiterungModal = document.getElementById('closeErweiterungModal');
    this.bindEventListenerOnce(closeErweiterungModal, 'click', () => this.closeErweiterungModal(), 'CloseErweiterungModal');

    const neuEinplanenModal = document.getElementById('neuEinplanenModal');
    this.bindEventListenerOnce(neuEinplanenModal, 'click', (e) => {
      if (e.target === neuEinplanenModal) {
        this.closeNeuEinplanenModal();
      }
    }, 'NeuEinplanenModalClick');

    const erweiterungTypRadios = document.querySelectorAll('input[name="erweiterungTyp"]');
    erweiterungTypRadios.forEach((radio) => {
      this.bindEventListenerOnce(radio, 'change', () => this.updateErweiterungTyp(), 'ErweiterungTypChange');
    });

    const konfliktLoesungRadios = document.querySelectorAll('input[name="konfliktLoesung"]');
    konfliktLoesungRadios.forEach((radio) => {
      this.bindEventListenerOnce(radio, 'change', () => this.updateKonfliktLoesung(), 'KonfliktLoesungChange');
    });

    const erweiterungArbeitszeit = document.getElementById('erweiterungArbeitszeit');
    this.bindEventListenerOnce(erweiterungArbeitszeit, 'change', () => {
      this.updateErweiterungVorschau();
      if (document.querySelector('input[name="erweiterungTyp"]:checked')?.value === 'anschluss') {
        this.pruefeErweiterungsKonflikte();
      }
    }, 'ErweiterungArbeitszeit');

    const erweiterungDatum = document.getElementById('erweiterungDatum');
    this.bindEventListenerOnce(erweiterungDatum, 'change', () => this.updateErweiterungVorschau(), 'ErweiterungDatum');

    const erweiterungMitarbeiterSelect = document.getElementById('erweiterungMitarbeiterSelect');
    this.bindEventListenerOnce(erweiterungMitarbeiterSelect, 'change', () => this.updateErweiterungVorschau(), 'ErweiterungMitarbeiter');

    const terminErweiternBtn = document.getElementById('terminErweiternBtn');
    this.bindEventListenerOnce(terminErweiternBtn, 'click', () => this.openErweiterungModal(), 'TerminErweitern');

    const modalMehrtaegigCheckbox = document.getElementById('modalMehrtaegigCheckbox');
    this.bindEventListenerOnce(modalMehrtaegigCheckbox, 'change', () => this.toggleModalPhasenSection(), 'ModalMehrtaegig');
    const modalAddPhaseBtn = document.getElementById('modalAddPhaseBtn');
    this.bindEventListenerOnce(modalAddPhaseBtn, 'click', () => this.addModalPhase(), 'ModalAddPhase');
  }

  setupEventListeners() {
    // === Performance-Optimierung: Event-Delegation für Tab-Buttons ===
    // Statt einzelne Event-Listener für jeden Button, einen einzigen auf dem Container
    const tabsContainer = document.querySelector('.tabs');
    if (tabsContainer) {
      tabsContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.tab-button');
        if (button) {
          this.handleTabChange(e);
        }
      });
    }

    this.bindSubTabDelegation();
    console.log('[Event-Delegation] Tab-Events initialisiert');

    // Schnellzugriff: Klick auf Header-Banner öffnet "Neuer Termin"
    const headerBanner = document.querySelector('header.animated-header');
    if (headerBanner) {
      headerBanner.addEventListener('click', () => this.navigateToNeuerTermin());
      headerBanner.setAttribute('title', 'Klicken für neuen Termin');
    }

    this.bindLazyEventListeners();

    window.addEventListener('click', (event) => {
      const modal = document.getElementById('modal');
      const detailsModal = document.getElementById('terminDetailsModal');
      const arbeitszeitenModal = document.getElementById('arbeitszeitenModal');
      const tagesUebersichtModal = document.getElementById('tagesUebersichtModal');
      const splitModal = document.getElementById('terminSplitModal');
      const erweiterungModal = document.getElementById('erweiterungModal');
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
      if (event.target === splitModal) {
        this.closeSplitModal();
      }
      if (event.target === erweiterungModal) {
        this.closeErweiterungModal();
      }

      // Schließe Autocomplete wenn außerhalb geklickt wird
      if (autocomplete && !autocomplete.contains(event.target) && event.target !== arbeitEingabe) {
        this.closeAutocomplete();
      }
    });
  }

  toggleAbholungDetails() {
    const abholungTypRadio = document.querySelector('input[name="abholung_typ"]:checked');
    const abholungTyp = abholungTypRadio ? abholungTypRadio.value : 'bringen';
    const detailsGroup = document.getElementById('abholungDetailsGroup');
    const zeitRow = document.getElementById('abholungZeitRow');
    const bringzeitGroup = document.getElementById('bringzeitGroup');
    const abholzeitGroup = document.getElementById('abholzeitGroup');
    const kontaktOptionGroup = document.getElementById('kontaktOptionGroup');

    if (!detailsGroup || !zeitRow || !bringzeitGroup || !abholzeitGroup || !kontaktOptionGroup) {
      return;
    }

    // Details anzeigen bei hol_bring, bringen oder ruecksprache
    const showDetails = abholungTyp === 'hol_bring' || abholungTyp === 'ruecksprache' || abholungTyp === 'bringen';
    detailsGroup.style.display = showDetails ? 'block' : 'none';

    // Zeitfelder anzeigen bei abholung, hol_bring, bringen, warten oder ruecksprache
    const showZeitRow = abholungTyp === 'hol_bring' || abholungTyp === 'bringen' || abholungTyp === 'warten' || abholungTyp === 'ruecksprache';
    zeitRow.style.display = showZeitRow ? 'flex' : 'none';

    // Bringzeit bei hol_bring, bringen, warten oder ruecksprache
    const showBringzeit = abholungTyp === 'hol_bring' || abholungTyp === 'bringen' || abholungTyp === 'warten' || abholungTyp === 'ruecksprache';
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
      // Entferne Details-Container falls vorhanden
      const detailsEl = document.getElementById('ersatzautoDetails');
      if (detailsEl) detailsEl.remove();
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
        // Entferne alte Details
        const detailsEl = document.getElementById('ersatzautoDetails');
        if (detailsEl) detailsEl.remove();
      } else {
        statusEl.className = 'ersatzauto-status nicht-verfuegbar';
        text.textContent = `Alle ${verfuegbarkeit.gesamt} vergeben`;
        
        // Lade und zeige Details, welche Termine die Autos belegen
        this.showErsatzautoKonfliktDetails(datum, statusEl);
      }
    } catch (error) {
      console.error('Fehler beim Prüfen der Ersatzauto-Verfügbarkeit:', error);
      statusEl.style.display = 'none';
    }
  }

  // Zeige Details bei Ersatzauto-Konflikt
  async showErsatzautoKonfliktDetails(datum, statusEl) {
    try {
      const details = await ErsatzautosService.getVerfuegbarkeitDetails(datum);
      
      // Entferne alten Details-Container falls vorhanden
      let detailsEl = document.getElementById('ersatzautoDetails');
      if (detailsEl) detailsEl.remove();
      
      if (details.termine && details.termine.length > 0) {
        detailsEl = document.createElement('div');
        detailsEl.id = 'ersatzautoDetails';
        detailsEl.className = 'ersatzauto-konflikt-details';
        
        const terminListe = details.termine.slice(0, 3).map(t => 
          `<div class="konflikt-termin">
            <span class="konflikt-kunde">${t.kunde_name || 'Unbekannt'}</span>
            <span class="konflikt-kennzeichen">${t.kennzeichen || '-'}</span>
            <span class="konflikt-bis">bis ${t.ersatzauto_bis_datum || t.abholung_datum || t.datum}</span>
          </div>`
        ).join('');
        
        const mehrText = details.termine.length > 3 
          ? `<div class="konflikt-mehr">+${details.termine.length - 3} weitere</div>` 
          : '';
        
        detailsEl.innerHTML = `
          <div class="konflikt-header">⚠️ Diese Termine belegen Ersatzautos:</div>
          ${terminListe}
          ${mehrText}
        `;
        
        // Füge nach dem Status-Element ein
        statusEl.parentNode.insertBefore(detailsEl, statusEl.nextSibling);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Ersatzauto-Konflikt-Details:', error);
    }
  }

  // Validiere Ersatzauto-Eingaben
  validateErsatzautoEingaben() {
    const checkbox = document.getElementById('ersatzauto');
    if (!checkbox || !checkbox.checked) return true; // Kein Ersatzauto = OK
    
    const abholungTypRadio = document.querySelector('input[name="abholung_typ"]:checked');
    const abholungTyp = abholungTypRadio ? abholungTypRadio.value : 'bringen';
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

  // Bug 1 Fix: forceOverwrite Parameter hinzugefügt
  // Bei forceOverwrite=false wird das Termin-Datum nur gesetzt wenn es leer ist
  setTodayDate(forceOverwrite = true) {
    const today = this.formatDateLocal(new Date());
    
    // Termin-Datum nur setzen wenn leer oder explizit gewollt
    const datumInput = document.getElementById('datum');
    if (datumInput && (forceOverwrite || !datumInput.value)) {
      datumInput.value = today;
    }
    
    // Auslastung-Datum immer auf heute setzen (separate Ansicht)
    const auslastungDatum = document.getElementById('auslastungDatum');
    if (auslastungDatum) {
      auslastungDatum.value = today;
    }
    
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
      
      // Termine für diesen Tag laden
      await this.loadNewTermineAmTag(datum);

    } catch (error) {
      console.error('Fehler beim Laden der Auslastung:', error);
      anzeige.style.display = 'none';
    }
  }

  async loadNewTermineAmTag(datum) {
    const termineListe = document.getElementById('newTermineListe');
    const termineAnzahl = document.getElementById('newTermineAnzahl');
    
    if (!termineListe) return;
    
    try {
      const termine = await TermineService.getAll(datum);
      
      // Filtere gelöschte Termine aus
      const aktiveTermine = termine.filter(t => !t.ist_geloescht);
      
      termineAnzahl.textContent = `${aktiveTermine.length} Termin${aktiveTermine.length !== 1 ? 'e' : ''}`;
      
      if (aktiveTermine.length === 0) {
        termineListe.innerHTML = '<div style="color: #28a745; padding: 8px; text-align: center;">✅ Noch keine Termine an diesem Tag</div>';
        return;
      }
      
      // Sortiere nach Bringzeit/Startzeit
      aktiveTermine.sort((a, b) => {
        const zeitA = a.bring_zeit || a.startzeit || '99:99';
        const zeitB = b.bring_zeit || b.startzeit || '99:99';
        return zeitA.localeCompare(zeitB);
      });
      
      let html = '';
      aktiveTermine.forEach(termin => {
        const bringZeit = termin.bring_zeit || '--:--';
        const abholZeit = termin.abholung_zeit || '--:--';
        const dauer = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;
        const dauerText = dauer >= 60 ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim() : `${dauer} min`;
        
        const statusFarbe = {
          'offen': '#ffc107',
          'geplant': '#17a2b8', 
          'in_arbeit': '#007bff',
          'abgeschlossen': '#28a745',
          'storniert': '#dc3545'
        }[termin.status] || '#6c757d';
        
        html += `
          <div style="padding: 8px; margin-bottom: 6px; background: #fff; border-radius: 6px; border: 1px solid #dee2e6;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="font-weight: 600; color: #333;">
                ${termin.termin_nr || '-'}
              </div>
              <div style="display: flex; gap: 8px; font-size: 0.85em;">
                <span style="color: ${statusFarbe}; font-weight: 600;">${termin.status || '-'}</span>
              </div>
            </div>
            <div style="color: #555; font-size: 0.9em; margin-top: 4px;">
              🚗 ${termin.kennzeichen || '-'} • ${termin.kunde_name || 'Unbekannt'}
            </div>
            <div style="display: flex; gap: 12px; margin-top: 4px; color: #666; font-size: 0.85em;">
              <span>🚗↓ ${bringZeit}</span>
              <span>🚗↑ ${abholZeit}</span>
              <span>⏱️ ${dauerText}</span>
            </div>
            <div style="color: #888; font-size: 0.8em; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              📋 ${termin.arbeit || '-'}
            </div>
          </div>
        `;
      });
      
      termineListe.innerHTML = html;
      
    } catch (error) {
      console.error('Fehler beim Laden der Termine für den Tag:', error);
      termineListe.innerHTML = '<div style="color: #dc3545; padding: 8px;">❌ Fehler beim Laden</div>';
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

  // Bug 1 Fix: preserveDatum Parameter hinzugefügt
  // Bei preserveDatum=true bleibt das aktuelle Datum erhalten
  resetTerminForm(preserveDatum = false) {
    // Datum VOR dem Reset sichern wenn gewünscht
    const savedDatum = preserveDatum ? document.getElementById('datum')?.value : null;
    
    // Formular komplett zurücksetzen
    const form = document.getElementById('terminForm');
    if (form) {
      form.reset();
    }

    // Datum wiederherstellen oder auf heute setzen
    if (savedDatum) {
      document.getElementById('datum').value = savedDatum;
      // Auslastungsanzeige für das gespeicherte Datum laden
      this.loadTerminAuslastungAnzeige();
    } else {
      this.setTodayDate(true); // forceOverwrite=true für expliziten Reset
    }

    // KM-Stand Placeholder und Styling zurücksetzen
    const kmStandInput = document.getElementById('kilometerstand');
    if (kmStandInput) {
      kmStandInput.classList.remove('has-previous-value');
      kmStandInput.placeholder = 'z.B. 128000';
      kmStandInput.value = '';
    }

    // Neue Suchfelder leeren
    const terminNameSuche = document.getElementById('terminNameSuche');
    if (terminNameSuche) {
      terminNameSuche.value = '';
    }
    const kzSucheBezirk = document.getElementById('kzSucheBezirk');
    if (kzSucheBezirk) kzSucheBezirk.value = '';
    const kzSucheBuchstaben = document.getElementById('kzSucheBuchstaben');
    if (kzSucheBuchstaben) kzSucheBuchstaben.value = '';
    const kzSucheNummer = document.getElementById('kzSucheNummer');
    if (kzSucheNummer) kzSucheNummer.value = '';
    
    // Vorschläge ausblenden
    this.hideVorschlaege('name');
    this.hideVorschlaege('kennzeichen');

    // Schnellsuche leeren (falls noch vorhanden)
    const schnellsuche = document.getElementById('terminSchnellsuche');
    if (schnellsuche) {
      schnellsuche.value = '';
    }
    
    // Schnellsuche-Status ausblenden
    const schnellsucheStatus = document.getElementById('schnellsucheStatus');
    if (schnellsucheStatus) {
      schnellsucheStatus.style.display = 'none';
    }
    
    // Kunde-Status-Badge ausblenden
    const kundeStatusAnzeige = document.getElementById('kundeStatusAnzeige');
    if (kundeStatusAnzeige) {
      kundeStatusAnzeige.style.display = 'none';
    }
    
    // Kennzeichen-Pflichtmarkierung zurücksetzen
    const kennzeichenField = document.getElementById('kennzeichen');
    const kennzeichenLabel = kennzeichenField?.parentElement?.querySelector('label');
    this.setKennzeichenPflicht(false, kennzeichenField, kennzeichenLabel);

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
    
    // Teile-Bestellen Checkbox zurücksetzen
    const teileBestellenCheckbox = document.getElementById('teileBestellenCheckbox');
    if (teileBestellenCheckbox) {
      teileBestellenCheckbox.checked = false;
    }

    // Warnung verstecken
    this.hideTerminWarnung();

    // Abholung-Details korrekt anzeigen
    this.toggleAbholungDetails();
    
    // Phasen zurücksetzen
    this.resetPhasen();
    
    // Auslastungsanzeige verstecken
    const terminAuslastungAnzeige = document.getElementById('terminAuslastungAnzeige');
    if (terminAuslastungAnzeige) {
      terminAuslastungAnzeige.style.display = 'none';
    }
    
    // Kalender-Popup verstecken
    const auslastungKalenderPopup = document.getElementById('auslastungKalenderPopup');
    if (auslastungKalenderPopup) {
      auslastungKalenderPopup.style.display = 'none';
    }
    
    // Autocomplete-Dropdown für Arbeiten verstecken
    const arbeitAutocomplete = document.getElementById('arbeitAutocomplete');
    if (arbeitAutocomplete) {
      arbeitAutocomplete.style.display = 'none';
      arbeitAutocomplete.innerHTML = '';
    }
    
    // Fahrzeug-Auswahl Modal verstecken (falls offen)
    const fahrzeugAuswahlModal = document.getElementById('fahrzeugAuswahlModal');
    if (fahrzeugAuswahlModal) {
      fahrzeugAuswahlModal.style.display = 'none';
    }
    this.fahrzeugAuswahlData = null;
  }

  // Alle schwebenden/floating Elemente verstecken (bei Tab-Wechsel)
  hideAllFloatingElements() {
    // Auslastungsanzeige
    const terminAuslastungAnzeige = document.getElementById('terminAuslastungAnzeige');
    if (terminAuslastungAnzeige) {
      terminAuslastungAnzeige.style.display = 'none';
    }
    
    // Kalender-Popup
    const auslastungKalenderPopup = document.getElementById('auslastungKalenderPopup');
    if (auslastungKalenderPopup) {
      auslastungKalenderPopup.style.display = 'none';
    }
    
    // Autocomplete-Dropdowns
    const arbeitAutocomplete = document.getElementById('arbeitAutocomplete');
    if (arbeitAutocomplete) {
      arbeitAutocomplete.style.display = 'none';
    }
    
    // Namenssuche-Vorschläge
    const nameSucheVorschlaege = document.getElementById('nameSucheVorschlaege');
    if (nameSucheVorschlaege) {
      nameSucheVorschlaege.classList.remove('aktiv');
    }
    
    // Kennzeichen-Vorschläge
    const kennzeichenSucheVorschlaege = document.getElementById('kennzeichenSucheVorschlaege');
    if (kennzeichenSucheVorschlaege) {
      kennzeichenSucheVorschlaege.classList.remove('aktiv');
    }
    
    // Fahrzeug-Auswahl Modal
    const fahrzeugAuswahlModal = document.getElementById('fahrzeugAuswahlModal');
    if (fahrzeugAuswahlModal) {
      fahrzeugAuswahlModal.style.display = 'none';
    }
    
    // Gefundener Kunde Anzeige
    const gefundenerKundeAnzeige = document.getElementById('gefundenerKundeAnzeige');
    if (gefundenerKundeAnzeige) {
      gefundenerKundeAnzeige.style.display = 'none';
    }
    
    // Alle Modals verstecken
    document.querySelectorAll('.modal').forEach(modal => {
      modal.style.display = 'none';
    });
  }

  // Setzt die Sub-Tabs im "termine" Container auf den Standardzustand zurück
  resetTermineSubTabs() {
    const termineContainer = document.getElementById('termine');
    if (!termineContainer) return;
    
    // Alle Sub-Tab-Contents deaktivieren und verstecken
    termineContainer.querySelectorAll('.sub-tab-content').forEach(content => {
      content.classList.remove('active');
      content.style.display = 'none';
    });
    
    // Alle Sub-Tab-Buttons deaktivieren
    termineContainer.querySelectorAll('.sub-tab-button').forEach(btn => {
      btn.classList.remove('active');
    });
    
    // Ersten Sub-Tab (neuerTermin) aktivieren und anzeigen
    const neuerTerminContent = document.getElementById('neuerTermin');
    if (neuerTerminContent) {
      neuerTerminContent.classList.add('active');
      neuerTerminContent.style.display = 'block';
    }
    
    const neuerTerminButton = termineContainer.querySelector('.sub-tab-button[data-subtab="neuerTermin"]');
    if (neuerTerminButton) {
      neuerTerminButton.classList.add('active');
    }
    
    // Auch das Formular für internen Termin zurücksetzen
    const internerTerminForm = document.getElementById('internerTerminForm');
    if (internerTerminForm) {
      internerTerminForm.reset();
    }
    
    // Extra: Interner Termin explizit verstecken
    const internerTerminDiv = document.getElementById('internerTermin');
    if (internerTerminDiv) {
      internerTerminDiv.style.display = 'none';
    }
  }

  // === TERMIN BEARBEITEN METHODEN ===

  async loadEditTermine() {
    const datumInput = document.getElementById('editTerminDatum');
    const terminListe = document.getElementById('editTerminListe');
    
    if (!datumInput || !terminListe) return;
    
    // Setze heute als Standard wenn kein Datum
    if (!datumInput.value) {
      datumInput.value = this.formatDateLocal(new Date());
    }
    
    const datum = datumInput.value;
    
    try {
      const termine = await TermineService.getAll(datum);
      
      // Filter: Nur nicht-interne Termine (mit Kennzeichen) und nicht gelöschte
      const filteredTermine = termine.filter(t => 
        t.kennzeichen && 
        t.kennzeichen.trim() !== '' && 
        t.kennzeichen !== 'INTERN' &&
        !t.ist_geloescht
      );
      
      // Sortiere nach Bringzeit/Startzeit
      filteredTermine.sort((a, b) => {
        const zeitA = a.bring_zeit || a.startzeit || '99:99';
        const zeitB = b.bring_zeit || b.startzeit || '99:99';
        return zeitA.localeCompare(zeitB);
      });
      
      if (filteredTermine.length === 0) {
        terminListe.innerHTML = `
          <div style="padding: 20px; text-align: center; color: #28a745;">
            ✅ Keine Termine an diesem Tag
          </div>
        `;
      } else {
        let html = '';
        filteredTermine.forEach(termin => {
          const bringZeit = termin.bring_zeit || '--:--';
          const abholZeit = termin.abholung_zeit || '--:--';
          const dauer = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;
          const dauerText = dauer >= 60 ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim() : `${dauer} min`;
          
          const statusFarbe = {
            'offen': '#ffc107',
            'geplant': '#17a2b8', 
            'in_arbeit': '#007bff',
            'abgeschlossen': '#28a745',
            'storniert': '#dc3545'
          }[termin.status] || '#6c757d';
          
          html += `
            <div class="edit-termin-item" 
                 data-termin-id="${termin.id}" 
                 style="padding: 12px 15px; border-bottom: 1px solid #eee; cursor: pointer; transition: background 0.2s;"
                 onmouseover="this.style.background='#e3f2fd'"
                 onmouseout="this.style.background='#fff'">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight: 600; color: #1565c0; font-size: 1.05em;">
                  ${termin.termin_nr || '-'} • ${termin.kennzeichen || '-'}
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                  <span style="background: ${statusFarbe}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75em; font-weight: 600;">${termin.status || '-'}</span>
                  <span style="color: #1565c0; font-size: 1.2em;">✏️</span>
                </div>
              </div>
              <div style="color: #333; margin-top: 6px; font-size: 0.95em;">
                👤 ${termin.kunde_name || 'Unbekannt'}
              </div>
              <div style="display: flex; gap: 15px; margin-top: 6px; color: #666; font-size: 0.85em;">
                <span>🚗↓ ${bringZeit}</span>
                <span>🚗↑ ${abholZeit}</span>
                <span>⏱️ ${dauerText}</span>
              </div>
              <div style="color: #888; font-size: 0.8em; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                📋 ${termin.arbeit || '-'}
              </div>
            </div>
          `;
        });
        
        terminListe.innerHTML = html;
        
        // Click-Handler hinzufügen
        terminListe.querySelectorAll('.edit-termin-item').forEach(item => {
          item.addEventListener('click', () => {
            const terminId = item.dataset.terminId;
            this.loadTerminZumBearbeitenById(terminId);
            
            // Markiere ausgewählten Termin
            terminListe.querySelectorAll('.edit-termin-item').forEach(i => {
              i.style.background = '#fff';
              i.style.borderLeft = 'none';
            });
            item.style.background = '#e3f2fd';
            item.style.borderLeft = '4px solid #1565c0';
          });
        });
      }
      
      // Formular verstecken
      this.resetTerminEditForm();
    } catch (error) {
      console.error('Fehler beim Laden der Termine:', error);
      terminListe.innerHTML = '<div style="padding: 20px; text-align: center; color: #dc3545;">❌ Fehler beim Laden</div>';
    }
  }

  async loadTerminZumBearbeitenById(terminId) {
    if (!terminId) {
      this.resetTerminEditForm();
      return;
    }
    
    try {
      const termin = await TermineService.getById(terminId);
      
      if (!termin) {
        alert('Termin nicht gefunden.');
        return;
      }
      
      // Zeige das Formular
      document.getElementById('editTerminFormContainer').style.display = 'block';
      const keinAusgewaehlt = document.getElementById('editTerminKeinAusgewaehlt');
      if (keinAusgewaehlt) keinAusgewaehlt.style.display = 'none';
      
      // Fülle das Formular mit den Termin-Daten
      this.fillEditTerminForm(termin);
      
      // Scroll zum Formular
      document.getElementById('editTerminFormContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
      
    } catch (error) {
      console.error('Fehler beim Laden des Termins:', error);
      alert('Fehler beim Laden des Termins.');
    }
  }

  fillEditTerminForm(termin) {
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
    
    // Arbeiten als mehrzeiligen Text - unterstützt neues ' || ' und altes ', ' Format
    const arbeitRaw = termin.arbeit || '';
    const arbeitText = arbeitRaw.includes(' || ') 
      ? arbeitRaw.split(' || ').map(a => a.trim()).join('\n')
      : arbeitRaw.split(',').map(a => a.trim()).join('\n');
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
    
    // Auslastungsanzeige aktualisieren
    this.loadEditTerminAuslastungAnzeige();
    
    // Abholungs-Felder aktualisieren
    this.toggleEditAbholungDetails();
    
    // Edit-Kalender aktualisieren: Zeige den Monat des Termins
    if (termin.datum) {
      const terminDatum = new Date(termin.datum + 'T00:00:00');
      if (!this.editKalenderAktuellMonat) {
        this.editKalenderAktuellMonat = new Date();
      }
      this.editKalenderAktuellMonat = new Date(terminDatum.getFullYear(), terminDatum.getMonth(), 1);
      // Timeout damit das Formular erst sichtbar wird
      setTimeout(() => {
        this.renderEditAuslastungKalender();
        this.updateEditSelectedDatumDisplay();
      }, 50);
    }
  }

  async loadTerminZumBearbeiten() {
    // Diese Funktion wird nicht mehr benötigt - Termine werden jetzt per Klick auf Liste geladen
    console.log('loadTerminZumBearbeiten() ist deprecated - nutze loadTerminZumBearbeitenById() stattdessen');
  }

  async loadTerminZumBearbeitenAlt() {
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
      
      // Arbeiten als mehrzeiligen Text - unterstützt neues ' || ' und altes ', ' Format
      const arbeitRaw = termin.arbeit || '';
      const arbeitText = arbeitRaw.includes(' || ') 
        ? arbeitRaw.split(' || ').map(a => a.trim()).join('\n')
        : arbeitRaw.split(',').map(a => a.trim()).join('\n');
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
      
      // Edit-Kalender aktualisieren: Zeige den Monat des Termins
      if (termin.datum) {
        const terminDatum = new Date(termin.datum + 'T00:00:00');
        if (!this.editKalenderAktuellMonat) {
          this.editKalenderAktuellMonat = new Date();
        }
        this.editKalenderAktuellMonat = new Date(terminDatum.getFullYear(), terminDatum.getMonth(), 1);
        await this.renderEditAuslastungKalender();
        this.updateEditSelectedDatumDisplay();
      }
      
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
    
    // Entferne aktive Markierung von Termin-Liste
    const terminListe = document.getElementById('editTerminListe');
    if (terminListe) {
      const items = terminListe.querySelectorAll('.edit-termin-item');
      items.forEach(item => item.classList.remove('active'));
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
      
      // Termine für diesen Tag laden
      await this.loadEditTermineAmTag(datum);
      
    } catch (error) {
      console.error('Fehler beim Laden der Auslastung:', error);
      anzeige.style.display = 'none';
    }
  }

  async loadEditTermineAmTag(datum) {
    const termineListe = document.getElementById('editTermineListe');
    const termineAnzahl = document.getElementById('editTermineAnzahl');
    const aktuellBearbeiteterTerminId = parseInt(document.getElementById('edit_termin_id').value, 10);
    
    if (!termineListe) return;
    
    try {
      const termine = await TermineService.getAll(datum);
      
      // Filtere gelöschte Termine aus
      const aktiveTermine = termine.filter(t => !t.ist_geloescht);
      
      termineAnzahl.textContent = `${aktiveTermine.length} Termin${aktiveTermine.length !== 1 ? 'e' : ''}`;
      
      if (aktiveTermine.length === 0) {
        termineListe.innerHTML = '<div style="color: #28a745; padding: 8px; text-align: center;">✅ Keine anderen Termine an diesem Tag</div>';
        return;
      }
      
      // Sortiere nach Bringzeit/Startzeit
      aktiveTermine.sort((a, b) => {
        const zeitA = a.bring_zeit || a.startzeit || '99:99';
        const zeitB = b.bring_zeit || b.startzeit || '99:99';
        return zeitA.localeCompare(zeitB);
      });
      
      let html = '';
      aktiveTermine.forEach(termin => {
        const istAktueller = termin.id === aktuellBearbeiteterTerminId;
        const bringZeit = termin.bring_zeit || '--:--';
        const abholZeit = termin.abholung_zeit || '--:--';
        const dauer = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;
        const dauerText = dauer >= 60 ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim() : `${dauer} min`;
        
        const statusFarbe = {
          'offen': '#ffc107',
          'geplant': '#17a2b8', 
          'in_arbeit': '#007bff',
          'abgeschlossen': '#28a745',
          'storniert': '#dc3545'
        }[termin.status] || '#6c757d';
        
        html += `
          <div style="padding: 8px; margin-bottom: 6px; background: ${istAktueller ? '#e3f2fd' : '#fff'}; border-radius: 6px; border: 1px solid ${istAktueller ? '#2196f3' : '#dee2e6'}; ${istAktueller ? 'border-width: 2px;' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="font-weight: 600; color: #333;">
                ${termin.termin_nr || '-'} ${istAktueller ? '<span style="color: #1565c0; font-size: 0.8em;">(aktuell)</span>' : ''}
              </div>
              <div style="display: flex; gap: 8px; font-size: 0.85em;">
                <span style="color: ${statusFarbe}; font-weight: 600;">${termin.status || '-'}</span>
              </div>
            </div>
            <div style="color: #555; font-size: 0.9em; margin-top: 4px;">
              🚗 ${termin.kennzeichen || '-'} • ${termin.kunde_name || 'Unbekannt'}
            </div>
            <div style="display: flex; gap: 12px; margin-top: 4px; color: #666; font-size: 0.85em;">
              <span>🚗↓ ${bringZeit}</span>
              <span>🚗↑ ${abholZeit}</span>
              <span>⏱️ ${dauerText}</span>
            </div>
            <div style="color: #888; font-size: 0.8em; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              📋 ${termin.arbeit || '-'}
            </div>
          </div>
        `;
      });
      
      termineListe.innerHTML = html;
      
    } catch (error) {
      console.error('Fehler beim Laden der Termine für den Tag:', error);
      termineListe.innerHTML = '<div style="color: #dc3545; padding: 8px;">❌ Fehler beim Laden</div>';
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

  // === SCHNELLZUGRIFF: Navigiert direkt zum "Neuer Termin" Formular ===
  navigateToNeuerTermin() {
    this.switchToTab('termine');

    setTimeout(() => {
      this.ensureTabContent('termine');
      const termineTab = this.getCachedElement('termine');
      if (!termineTab) return;

      const subTabsContainer = termineTab.querySelector('.sub-tabs');
      if (subTabsContainer) {
        this.setActiveSubTabInContainer(subTabsContainer, 'neuerTermin');
      } else if (window.switchSubTab) {
        window.switchSubTab('neuerTermin');
      }

      const kundenSuche = document.getElementById('terminNameSuche');
      if (kundenSuche) {
        kundenSuche.focus();
      }
    }, 0);
  }

  handleTabChange(e) {
    // closest() verwenden, falls auf ein Kind-Element (z.B. <span>) geklickt wurde
    const button = e.target.closest('.tab-button');
    if (!button) return;

    const tabName = button.dataset.tab;
    if (!tabName) return;

    const previousTab = this.currentTab;
    const isSameTab = previousTab === tabName;
    if (previousTab && !isSameTab) {
      this.unloadTabContent(previousTab);
    }

    this.ensureTabContent(tabName);
    if (!isSameTab) {
      this.restoreTabSubTabs(tabName);
    }

    // === Performance-Optimierung: Display-Toggle mit Cache ===
    // Alle Tab-Inhalte verstecken (mit cached NodeList)
    const contents = this.tabCache.contents || document.querySelectorAll('.tab-content');
    for (let i = 0; i < contents.length; i++) {
      contents[i].style.display = 'none';
      contents[i].classList.remove('active');
    }

    // Alle Buttons deaktivieren (mit cached NodeList)
    const buttons = this.tabCache.buttons || document.querySelectorAll('.tab-button');
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].classList.remove('active');
    }

    // Gewählten Tab aktivieren (mit Cache)
    const targetContent = this.getCachedElement(tabName);
    if (targetContent) {
      targetContent.style.display = 'block';
      targetContent.classList.add('active');
    }
    button.classList.add('active');

    // Bei Tab-Wechsel: Alle schwebenden Elemente verstecken
    this.hideAllFloatingElements();
    
    // Stoppe Timeline "Jetzt"-Linie Interval wenn nicht auf Planungs-Tab oder Auslastungs-Tab
    if (tabName !== 'auslastung-dragdrop' && tabName !== 'auslastung' && this.nowLineInterval) {
      clearInterval(this.nowLineInterval);
      this.nowLineInterval = null;
    }

    if (tabName === 'termine') {
      const hasSavedState = this.tabStateStore.has(tabName);
      // Formular komplett zurücksetzen beim Öffnen des Termine-Tabs
      if (!hasSavedState) {
        this.resetTerminForm();
        this.resetTermineSubTabs();
      }
      this.loadTerminAuslastungAnzeige();
      this.loadArbeitszeiten();
    } else if (tabName === 'auslastung') {
      const auslastungDatum = document.getElementById('auslastungDatum');
      if (auslastungDatum && !auslastungDatum.value) {
        auslastungDatum.value = this.formatDateLocal(this.getToday());
      }
      // Immer neu laden um Synchronisation mit Planungs-Tab sicherzustellen
      this.loadAuslastung();
      this.auslastungNeedsRefresh = false;
    } else if (tabName === 'auslastung-dragdrop') {
      // Setze heutiges Datum wenn leer
      const datumInput = document.getElementById('auslastungDragDropDatum');
      if (datumInput && !datumInput.value) {
        datumInput.value = this.formatDateLocal(this.getToday());
      }
      this.updatePlanungWocheInfo();
      this.loadAuslastungDragDrop();
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
    } else if (tabName === 'zeitverwaltung') {
      this.loadArbeitszeiten();
      this.loadTermineZeiten();
    } else if (tabName === 'papierkorb') {
      this.loadPapierkorb();
    } else if (tabName === 'kunden') {
      this.loadKundenSearch();
    } else if (tabName === 'ersatzautos') {
      this.loadErsatzautos();
    } else if (tabName === 'teile-bestellen') {
      this.loadTeileBestellungen();
    } else if (tabName === 'intern') {
      this.initInternTab();
    }

    if (!isSameTab) {
      this.triggerActiveSubTabLoads(tabName);
      this.restoreTabFields(tabName);
    }
    this.currentTab = tabName;
  }

  handleSubTabActivation(subTabName) {
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
      // Kleiner Timeout damit der Tab erst sichtbar wird, dann Kalender rendern
      setTimeout(async () => {
        await this.renderEditSuchKalender();
        this.updateEditSuchDatumDisplay();
        await this.loadEditTermine();
      }, 50);
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

    if (subTabName === 'berufsschuleAbwesenheit') {
      this.loadBerufsschulLehrlinge();
    }

    if (subTabName === 'settingsBackup') {
      this.loadBackupStatus();
      this.loadBackupList();
    }

    if (subTabName === 'settingsKunden') {
      this.loadKunden();
    }

    if (subTabName === 'teileStatus') {
      this.loadTeileStatusUebersicht();
    }

    if (subTabName === 'wartendeAktionen') {
      this.loadWartendeAktionen();
    }

    if (subTabName === 'internerTermin') {
      this.setInternerTerminTodayDate();
      this.loadInternerTerminMitarbeiter();
      this.loadInterneTermineImSubTab(); // Lade Liste der internen Termine
    }
  }

  triggerActiveSubTabLoads(tabName) {
    const container = this.getCachedElement(tabName);
    if (!container) return;

    const activeButtons = container.querySelectorAll('.sub-tabs .sub-tab-button.active');
    const handled = new Set();
    activeButtons.forEach(button => {
      const name = button.dataset.subtab;
      if (!name || handled.has(name)) return;
      handled.add(name);
      this.handleSubTabActivation(name);
    });
  }

  async handleSubTabChange(e) {
    e.preventDefault();
    e.stopPropagation();

    // Finde den Button, auch wenn auf ein inneres Element geklickt wurde
    const button = e.target.closest('.sub-tab-button');
    if (!button) return;

    const subTabName = button.dataset.subtab;
    if (!subTabName) return;

    // Finde den direkten Parent-Container der sub-tabs
    const subTabsContainer = button.closest('.sub-tabs');
    if (!subTabsContainer) return;

    // === Performance-Optimierung: Display-Toggle mit Cache ===
    // Hole alle Subtab-Buttons aus dem Container (cached per Container)
    const subTabButtons = subTabsContainer.querySelectorAll('.sub-tab-button');

    // Verstecke alle zugehörigen Sub-Tab-Contents und deaktiviere Buttons
    for (let i = 0; i < subTabButtons.length; i++) {
      const btn = subTabButtons[i];
      const name = btn.dataset.subtab;
      btn.classList.remove('active');
      if (name) {
        const content = this.getCachedElement(name);
        if (content) {
          content.style.display = 'none';
          content.classList.remove('active');
        }
      }
    }

    // Aktiviere den ausgewählten Tab (mit Cache)
    const targetContent = this.getCachedElement(subTabName);
    if (targetContent) {
      targetContent.style.display = 'block';
      targetContent.classList.add('active');
    }
    button.classList.add('active');
    this.handleSubTabActivation(subTabName);
  }

  switchToTab(tabName) {
    const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (tabButton) {
      tabButton.click();
    }
  }

  loadInitialData() {
    // Lade Daten - Fehler werden in den einzelnen Funktionen behandelt
    this.loadKunden().catch(err => {
      console.error('loadKunden failed:', err);
    });
    this.loadTermineCache().catch(err => {
      console.error('loadTermineCache failed:', err);
    });
    this.loadDashboard().catch(err => {
      console.error('loadDashboard failed:', err);
    });
    this.loadWerkstattSettings().catch(err => {
      console.error('loadWerkstattSettings failed:', err);
    });
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
      this.buildFuzzySearchIndex();

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
      let errorMessage = 'Fehler beim Laden der Kunden.';
      if (error.isNetworkError) {
        errorMessage = `Verbindung zum Server fehlgeschlagen. Bitte prüfen Sie, ob das Backend läuft und erreichbar ist.\n\nFehler: ${error.message}`;
      } else if (error.message) {
        errorMessage = `Fehler beim Laden der Kunden: ${error.message}`;
      }
      alert(errorMessage);
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
    // Normalisiere Suchbegriff für Kennzeichen (entferne Leerzeichen und Bindestriche)
    const normalizedSearch = suchBegriff.replace(/[\s\-]/g, '').toLowerCase();
    
    const gefilterteKunden = kunden.filter(kunde => {
      // Normale Suche in allen Feldern
      const normalMatch = (kunde.name && kunde.name.toLowerCase().includes(lower)) ||
                          (kunde.telefon && kunde.telefon.toLowerCase().includes(lower)) ||
                          (kunde.email && kunde.email.toLowerCase().includes(lower)) ||
                          (kunde.fahrzeugtyp && kunde.fahrzeugtyp.toLowerCase().includes(lower)) ||
                          (kunde.locosoft_id && kunde.locosoft_id.toLowerCase().includes(lower));
      
      // Spezielle normalisierte Suche für Kennzeichen
      const kennzeichenMatch = kunde.kennzeichen && 
                               kunde.kennzeichen.replace(/[\s\-]/g, '').toLowerCase().includes(normalizedSearch);
      
      return normalMatch || kennzeichenMatch;
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
          <button class="btn btn-small btn-primary" onclick="app.openFahrzeugVerwaltung(${kunde.id}, '${(kunde.name || '').replace(/'/g, "\\'")}')" title="Fahrzeuge verwalten">🚗</button>
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

    // Bei leerem Suchbegriff: Alle anzeigen
    if (!suchBegriff) {
      this.renderKundenListe(this.kundenCache || [], '');
      return;
    }

    // Fuzzy-Search aktivieren ab 2 Zeichen
    if (suchBegriff.length >= 2) {
      this.filterKundenListeFuzzy();
    } else {
      this.renderKundenListe(this.kundenCache || [], suchBegriff);
    }
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

    // Zähle eindeutige Kunden und Fahrzeuge für die Vorschau
    const kundenNamen = new Set();
    const fahrzeugeSet = new Set();
    
    this.pendingImportData.forEach(row => {
      if (row.name) kundenNamen.add(row.name.toLowerCase());
      if (row.kennzeichen) fahrzeugeSet.add(row.kennzeichen.toUpperCase().replace(/[\s\-]/g, ''));
    });

    // Bestätigungsdialog
    const kundenCount = kundenNamen.size;
    const fahrzeugCount = fahrzeugeSet.size;
    
    if (!confirm(`Import starten?\n\n${kundenCount} eindeutige Kunden mit ${fahrzeugCount} Fahrzeugen.\n\nHinweis: Kunden mit mehreren Fahrzeugen werden automatisch erkannt und alle Kennzeichen zugeordnet.`)) {
      return;
    }

    try {
      // Sende alle Zeilen - das Backend gruppiert Kunden mit gleichem Namen
      // und erstellt automatisch Fahrzeug-Einträge für zusätzliche Kennzeichen
      const kundenZuImportieren = this.pendingImportData.map(row => ({
        name: row.name,
        telefon: row.telefon || '',
        email: row.email || '',
        adresse: row.adresse || '',
        kennzeichen: row.kennzeichen || '',
        fahrzeugtyp: row.fahrzeugtyp || '',
        vin: row.vin || ''
      }));

      const result = await KundenService.import(kundenZuImportieren);
      
      // Detaillierte Erfolgsmeldung
      let message = `✅ Import erfolgreich!\n\n`;
      message += `📋 ${result.imported} Kunden importiert\n`;
      if (result.fahrzeugeHinzugefuegt > 0) {
        message += `🚗 ${result.fahrzeugeHinzugefuegt} zusätzliche Fahrzeuge hinzugefügt\n`;
      }
      if (result.skipped > 0) {
        message += `⏭️ ${result.skipped} übersprungen\n`;
      }
      
      alert(message);
      
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

  // ================================================
  // FAHRZEUGVERWALTUNG
  // ================================================

  // Fahrzeugverwaltung Modal öffnen
  async openFahrzeugVerwaltung(kundeId, kundeName) {
    this.fahrzeugVerwaltungKundeId = kundeId;
    this.fahrzeugVerwaltungKundeName = kundeName;
    
    const modal = document.getElementById('fahrzeugVerwaltungModal');
    const kundeInfo = document.getElementById('fahrzeugVerwaltungKunde');
    
    kundeInfo.innerHTML = `<strong>${kundeName}</strong> (ID: ${kundeId})`;
    
    // Lade Fahrzeuge
    await this.loadFahrzeugVerwaltungListe();
    
    // Formular zurücksetzen
    document.getElementById('neuesFahrzeugKennzeichen').value = '';
    document.getElementById('neuesFahrzeugTyp').value = '';
    document.getElementById('neuesFahrzeugVin').value = '';
    
    modal.style.display = 'block';
  }

  // Fahrzeugliste im Modal laden
  async loadFahrzeugVerwaltungListe() {
    const liste = document.getElementById('fahrzeugVerwaltungListe');
    
    try {
      const fahrzeuge = await KundenService.getFahrzeuge(this.fahrzeugVerwaltungKundeId);
      
      if (fahrzeuge.length === 0) {
        liste.innerHTML = `
          <div style="text-align: center; padding: 30px; color: #666; background: #f8f9fa; border-radius: 8px;">
            <p style="font-size: 1.2em;">🚗 Keine Fahrzeuge vorhanden</p>
            <p style="font-size: 0.9em;">Fügen Sie unten ein neues Fahrzeug hinzu.</p>
          </div>
        `;
        return;
      }
      
      liste.innerHTML = fahrzeuge.map((fz, idx) => {
        const letzterTermin = fz.letzter_termin || fz.letzterTermin;
        const letzterKmStand = fz.letzter_km_stand || fz.letzterKmStand;
        
        return `
          <div class="fahrzeug-verwaltung-item" style="
            padding: 15px;
            margin-bottom: 10px;
            background: ${idx === 0 ? '#e8f5e9' : '#f8f9fa'};
            border-radius: 8px;
            border: 2px solid ${idx === 0 ? '#4caf50' : '#dee2e6'};
          ">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                  <span style="font-size: 1.1em; font-weight: bold;">🚗 ${fz.kennzeichen}</span>
                  ${idx === 0 ? '<span style="background: #4caf50; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75em;">Zuletzt</span>' : ''}
                  <span style="background: ${fz.quelle === 'kundenstamm' ? '#2196f3' : '#ff9800'}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7em;">${fz.quelle === 'kundenstamm' ? 'Hauptfahrzeug' : 'Aus Terminen'}</span>
                </div>
                ${fz.fahrzeugtyp ? `<div style="color: #666; font-size: 0.9em;">Typ: ${fz.fahrzeugtyp}</div>` : ''}
                ${fz.vin ? `<div style="color: #888; font-size: 0.85em;">VIN: ${fz.vin}</div>` : ''}
                <div style="color: #888; font-size: 0.85em; margin-top: 5px;">
                  ${letzterTermin ? `Letzter Termin: ${this.formatDatum(letzterTermin)}` : 'Keine Termine'}
                  ${letzterKmStand ? ` · ${Number(letzterKmStand).toLocaleString('de-DE')} km` : ''}
                </div>
              </div>
              <div style="display: flex; gap: 5px;">
                <button class="btn btn-small btn-danger" onclick="app.deleteFahrzeugFromModal('${fz.kennzeichen.replace(/'/g, "\\'")}')" title="Fahrzeug löschen">🗑️</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
      
    } catch (error) {
      console.error('Fehler beim Laden der Fahrzeuge:', error);
      liste.innerHTML = `<div style="color: red; padding: 15px;">Fehler beim Laden der Fahrzeuge</div>`;
    }
  }

  // Fahrzeug aus Modal hinzufügen
  async addFahrzeugFromModal() {
    const kennzeichen = document.getElementById('neuesFahrzeugKennzeichen').value.trim().toUpperCase();
    const fahrzeugtyp = document.getElementById('neuesFahrzeugTyp').value.trim();
    const vin = document.getElementById('neuesFahrzeugVin').value.trim().toUpperCase();
    
    if (!kennzeichen) {
      alert('Bitte geben Sie ein Kennzeichen ein.');
      document.getElementById('neuesFahrzeugKennzeichen').focus();
      return;
    }
    
    try {
      await KundenService.addFahrzeug(this.fahrzeugVerwaltungKundeId, {
        kennzeichen,
        fahrzeugtyp,
        vin
      });
      
      // Formular zurücksetzen
      document.getElementById('neuesFahrzeugKennzeichen').value = '';
      document.getElementById('neuesFahrzeugTyp').value = '';
      document.getElementById('neuesFahrzeugVin').value = '';
      
      // Liste neu laden
      await this.loadFahrzeugVerwaltungListe();
      
      // Auch Termin-Cache und Kundenliste aktualisieren
      this.loadTermineCache();
      this.loadKunden();
      
    } catch (error) {
      console.error('Fehler beim Hinzufügen des Fahrzeugs:', error);
      alert('Fehler: ' + (error.message || 'Fahrzeug konnte nicht hinzugefügt werden'));
    }
  }

  // Fahrzeug aus Modal löschen
  async deleteFahrzeugFromModal(kennzeichen) {
    if (!confirm(`Möchten Sie das Fahrzeug "${kennzeichen}" wirklich löschen?\n\nAchtung: Alle Termine mit diesem Kennzeichen werden ebenfalls gelöscht!`)) {
      return;
    }
    
    try {
      await KundenService.deleteFahrzeug(this.fahrzeugVerwaltungKundeId, kennzeichen);
      
      // Liste neu laden
      await this.loadFahrzeugVerwaltungListe();
      
      // Auch Termin-Cache und Kundenliste aktualisieren
      this.loadTermineCache();
      this.loadKunden();
      
    } catch (error) {
      console.error('Fehler beim Löschen des Fahrzeugs:', error);
      alert('Fehler: ' + (error.message || 'Fahrzeug konnte nicht gelöscht werden'));
    }
  }

  // Fahrzeugverwaltung Modal schließen
  closeFahrzeugVerwaltungModal() {
    const modal = document.getElementById('fahrzeugVerwaltungModal');
    modal.style.display = 'none';
    this.fahrzeugVerwaltungKundeId = null;
    this.fahrzeugVerwaltungKundeName = null;
  }

  async loadArbeitszeiten() {
    try {
      const arbeitszeiten = await ArbeitszeitenService.getAll();
      this.arbeitszeiten = arbeitszeiten;

      const arbeitListe = document.getElementById('arbeitListe');
      if (arbeitListe) {
        arbeitListe.innerHTML = '';
        arbeitszeiten.forEach(arbeit => {
          const option = document.createElement('option');
          option.value = arbeit.bezeichnung;
          arbeitListe.appendChild(option);
          
          // Auch Aliase als Optionen hinzufügen
          if (arbeit.aliase) {
            arbeit.aliase.split(',').forEach(alias => {
              const aliasOption = document.createElement('option');
              aliasOption.value = alias.trim();
              arbeitListe.appendChild(aliasOption);
            });
          }
        });
      }

      const arbeitszeitenTable = document.getElementById('arbeitszeitenTable');
      if (arbeitszeitenTable) {
        const tbody = arbeitszeitenTable.getElementsByTagName('tbody')[0];
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
              <input type="text"
                     id="aliase_${arbeit.id}"
                     data-id="${arbeit.id}"
                     value="${arbeit.aliase || ''}"
                     placeholder="z.B. Service, DS, Durchsicht"
                     title="Mehrere Suchbegriffe durch Komma getrennt"
                     style="width: 100%; min-width: 200px; padding: 8px;">
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
      }
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
      // Erst in Bezeichnung suchen, dann in Aliasen
      let gefunden = this.arbeitszeiten.find(
        az => az.bezeichnung.toLowerCase() === arbeit.toLowerCase()
      );
      
      // Falls nicht gefunden, in Aliasen suchen
      if (!gefunden) {
        const suchBegriff = arbeit.toLowerCase();
        gefunden = this.arbeitszeiten.find(az => {
          if (az.aliase) {
            const aliasListe = az.aliase.split(',').map(a => a.trim().toLowerCase());
            return aliasListe.includes(suchBegriff);
          }
          return false;
        });
      }
      
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
        
        // Zeige den erkannten Standardzeit-Namen wenn über Alias gefunden
        const hinweis = gefunden.bezeichnung.toLowerCase() !== arbeit.toLowerCase() 
          ? ` → ${gefunden.bezeichnung}` 
          : '';
        details.push(`✓ ${arbeit}${hinweis}: <strong>${zeitStr}</strong>`);
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
      const inputs = row.querySelectorAll('input[type="text"]');
      const bezeichnungInput = inputs[0]; // Erste Texteingabe = Bezeichnung
      const aliaseInput = inputs[1]; // Zweite Texteingabe = Aliase
      const zeitInput = row.querySelector('input[type="number"]');

      if (bezeichnungInput && zeitInput) {
        const id = bezeichnungInput.dataset.id;
        const bezeichnung = bezeichnungInput.value.trim();
        const aliase = aliaseInput ? aliaseInput.value.trim() : '';
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
          aliase: aliase,
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
          aliase: update.aliase,
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

    // Bug 1 Debug: Datum aus Formular lesen
    const datumValue = document.getElementById('datum').value;
    console.log('[DEBUG] handleTerminSubmit - Datum aus Formular:', datumValue);

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
  }

  // ===== TERMIN VORSCHAU MIT COUNTDOWN =====
  showTerminVorschau(termin, kundeName, telefon, arbeitenListe, abholungTyp, ersatzauto) {
    const modal = document.getElementById('terminVorschauModal');
    if (!modal) {
      console.error('Termin Vorschau Modal nicht gefunden!');
      // Fallback: Direkt speichern ohne Vorschau
      this.executeTerminSave();
      return;
    }

    // Fülle die Vorschau-Daten
    document.getElementById('vorschauKunde').textContent = kundeName || 'Unbekannt';
    document.getElementById('vorschauTelefon').textContent = telefon || '-';
    
    // Bug 1 Fix: Datum robuster formatieren
    console.log('[DEBUG] showTerminVorschau - termin.datum:', termin.datum);
    let formatiertesDatum = '-';
    if (termin.datum && termin.datum.trim() !== '') {
      // Datum mit Zeitzone-sicherem Parsing
      const datumObj = new Date(termin.datum + 'T12:00:00');
      if (!isNaN(datumObj.getTime())) {
        formatiertesDatum = datumObj.toLocaleDateString('de-DE', { 
          weekday: 'long', 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric' 
        });
      }
    }
    console.log('[DEBUG] formatiertesDatum:', formatiertesDatum);
    document.getElementById('vorschauDatum').textContent = formatiertesDatum;
    
    document.getElementById('vorschauKennzeichen').textContent = termin.kennzeichen || '-';
    
    // Zeit formatieren
    const stunden = Math.floor(termin.geschaetzte_zeit / 60);
    const minuten = termin.geschaetzte_zeit % 60;
    const zeitText = stunden > 0 
      ? `${stunden} h ${minuten > 0 ? minuten + ' min' : ''}` 
      : `${minuten} min`;
    document.getElementById('vorschauZeit').textContent = zeitText;
    
    // Arbeiten als Liste darstellen
    const arbeitenHtml = arbeitenListe.map(a => `• ${a}`).join('<br>');
    document.getElementById('vorschauArbeiten').innerHTML = arbeitenHtml;
    
    // Abholungs-Typ
    const abholungTexte = {
      'bringen': 'Kunde bringt/holt selbst',
      'hol_bring': 'Hol- und Bringservice',
      'ruecksprache': 'Telefonische Rücksprache',
      'warten': 'Kunde wartet'
    };
    document.getElementById('vorschauAbholung').textContent = abholungTexte[abholungTyp] || abholungTyp;
    
    // Ersatzauto
    const ersatzautoRow = document.getElementById('vorschauErsatzautoRow');
    if (ersatzauto) {
      ersatzautoRow.style.display = 'flex';
      const tage = termin.ersatzauto_tage;
      document.getElementById('vorschauErsatzauto').textContent = tage ? `Ja (${tage} Tage)` : 'Ja';
    } else {
      ersatzautoRow.style.display = 'none';
    }

    // Modal anzeigen - sowohl display als auch active Klasse setzen
    modal.style.display = 'flex';
    // Kurze Verzögerung für Animation
    setTimeout(() => {
      modal.classList.add('active');
    }, 10);

    // Countdown starten
    this.startTerminCountdown();
  }

  startTerminCountdown() {
    // Vorherigen Countdown abbrechen falls vorhanden
    if (this.terminCountdownInterval) {
      clearInterval(this.terminCountdownInterval);
    }

    let sekunden = 5;
    const countdownZahl = document.getElementById('countdownZahl');
    const countdownBar = document.getElementById('countdownBar');

    // Initial setzen
    countdownZahl.textContent = sekunden;
    countdownBar.style.width = '100%';

    this.terminCountdownInterval = setInterval(() => {
      sekunden--;
      countdownZahl.textContent = sekunden;
      countdownBar.style.width = `${(sekunden / 5) * 100}%`;

      if (sekunden <= 0) {
        clearInterval(this.terminCountdownInterval);
        this.terminCountdownInterval = null;
        // Auto-Speichern
        this.executeTerminSave();
      }
    }, 1000);

    // Event-Listener für Buttons
    const abbrechenBtn = document.getElementById('vorschauAbbrechenBtn');
    const sofortBtn = document.getElementById('vorschauSofortSpeichernBtn');

    // Alte Listener entfernen
    abbrechenBtn.replaceWith(abbrechenBtn.cloneNode(true));
    sofortBtn.replaceWith(sofortBtn.cloneNode(true));

    // Neue Listener hinzufügen
    document.getElementById('vorschauAbbrechenBtn').addEventListener('click', () => {
      this.cancelTerminVorschau();
    });

    document.getElementById('vorschauSofortSpeichernBtn').addEventListener('click', () => {
      if (this.terminCountdownInterval) {
        clearInterval(this.terminCountdownInterval);
        this.terminCountdownInterval = null;
      }
      this.executeTerminSave();
    });

    // ESC-Taste zum Abbrechen
    this.terminVorschauEscHandler = (e) => {
      if (e.key === 'Escape') {
        this.cancelTerminVorschau();
      }
    };
    document.addEventListener('keydown', this.terminVorschauEscHandler);

    // Klick auf Hintergrund zum Abbrechen
    const modal = document.getElementById('terminVorschauModal');
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.cancelTerminVorschau();
      }
    });
  }

  cancelTerminVorschau() {
    // Countdown stoppen
    if (this.terminCountdownInterval) {
      clearInterval(this.terminCountdownInterval);
      this.terminCountdownInterval = null;
    }

    // ESC-Handler entfernen
    if (this.terminVorschauEscHandler) {
      document.removeEventListener('keydown', this.terminVorschauEscHandler);
      this.terminVorschauEscHandler = null;
    }

    // Modal schließen mit Animation
    const modal = document.getElementById('terminVorschauModal');
    if (modal) {
      modal.classList.remove('active');
      // Warte auf Animation, dann verstecken
      setTimeout(() => {
        modal.style.display = 'none';
      }, 300);
    }

    // Pending-Daten löschen
    this.pendingTerminData = null;
  }

  async executeTerminSave() {
    // ESC-Handler entfernen falls vorhanden
    if (this.terminVorschauEscHandler) {
      document.removeEventListener('keydown', this.terminVorschauEscHandler);
      this.terminVorschauEscHandler = null;
    }

    // Modal schließen
    const modal = document.getElementById('terminVorschauModal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }

    const data = this.pendingTerminData;
    if (!data) {
      console.error('Keine Termin-Daten vorhanden');
      return;
    }

    let { termin, arbeitenListe, resolvedKundeId, resolvedKundeName, kundeTelefon } = data;

    // Falls neuer Kunde, jetzt anlegen
    if (!resolvedKundeId && resolvedKundeName) {
      try {
        const created = await KundenService.create({ name: resolvedKundeName, telefon: kundeTelefon || null });
        resolvedKundeId = created.id;
        this.loadKunden(); // Cache auffrischen
      } catch (err) {
        console.error('Fehler beim Anlegen des Kunden:', err);
      }
    }

    if (resolvedKundeId) {
      termin.kunde_id = resolvedKundeId;
    } else if (resolvedKundeName) {
      termin.kunde_name = resolvedKundeName;
    }
    if (kundeTelefon) {
      termin.kunde_telefon = kundeTelefon;
    }

    try {
      // Prüfe auf Duplikate (gleicher Kunde am gleichen Tag)
      const duplikatCheck = await TermineService.checkDuplikate(
        termin.datum,
        resolvedKundeId,
        resolvedKundeName
      );

      if (duplikatCheck.hatDuplikate) {
        // Formatiere die bestehenden Termine für die Anzeige
        const termineInfo = duplikatCheck.termine.map(t => {
          const zeitInfo = t.bring_zeit ? ` um ${t.bring_zeit} Uhr` : '';
          const arbeiten = t.arbeit.length > 50 ? t.arbeit.substring(0, 50) + '...' : t.arbeit;
          return `• ${t.termin_nr}${zeitInfo}: ${arbeiten} (${t.kennzeichen || 'ohne Kennzeichen'})`;
        }).join('\n');

        const bestaetigung = confirm(
          `⚠️ Achtung: Es gibt bereits ${duplikatCheck.anzahl} Termin(e) für diesen Kunden am ${new Date(termin.datum + 'T12:00:00').toLocaleDateString('de-DE')}:\n\n` +
          `${termineInfo}\n\n` +
          `Möchten Sie trotzdem einen weiteren Termin anlegen?`
        );
        
        if (!bestaetigung) {
          this.pendingTerminData = null;
          return;
        }
      }

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
          this.pendingTerminData = null;
          return;
        }
      } else if (validation.warnung) {
        const bestaetigung = confirm(
          `${validation.warnung}\n\n` +
          `Aktuelle Auslastung würde auf ${validation.neue_auslastung_prozent}% steigen.\n` +
          `Möchten Sie fortfahren?`
        );
        if (!bestaetigung) {
          this.pendingTerminData = null;
          return;
        }
      }

      await this.ensureArbeitenExistieren(arbeitenListe, termin.geschaetzte_zeit);
      
      // Prüfe ob Teile bestellt werden müssen
      const teileBestellenChecked = document.getElementById('teileBestellenCheckbox')?.checked;
      if (teileBestellenChecked && arbeitenListe.length > 0) {
        // Setze teile_status für alle Arbeiten auf "bestellen"
        const arbeitszeitenDetails = {};
        for (const arbeit of arbeitenListe) {
          arbeitszeitenDetails[arbeit] = {
            teile_status: 'bestellen'
          };
        }
        termin.arbeitszeiten_details = JSON.stringify(arbeitszeitenDetails);
      }
      
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
      this.loadTermineCache(); // Cache für Kennzeichen-Suche aktualisieren
      this.loadDashboard();
      this.loadArbeitszeiten();
      this.loadTermineZeiten();
      
      // Pending-Daten löschen
      this.pendingTerminData = null;
    } catch (error) {
      console.error('Fehler beim Erstellen des Termins:', error);
      alert('Fehler beim Erstellen des Termins: ' + (error.message || 'Unbekannter Fehler'));
      this.pendingTerminData = null;
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
      alert('Fehler beim Erstellen des internen Termins: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  // ========================================
  // WARTENDE AKTIONEN FUNKTIONEN
  // ========================================

  setupWartendeAktionenKundensuche() {
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

  // Namenssuche für Wartende Aktionen (nutzt Cache wie Hauptformular)
  handleWartendNameSuche() {
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

  // Status-Badge für Neuer Kunde bei Wartende Aktionen
  updateWartendKundeStatusBadge(eingabe, statusBadge) {
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

  // Markiert Kennzeichen-Feld bei Wartende Aktionen als Pflichtfeld
  setWartendKennzeichenPflicht(isPflicht) {
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

  // Kennzeichen-Suche für Wartende Aktionen (nutzt Cache wie Hauptformular)
  handleWartendKennzeichenSuche() {
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

  // Vorschlag auswählen (Name)
  async selectWartendeKundeVorschlag(kundeId) {
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

  // Fahrzeug-Auswahl Modal für Wartende Aktionen
  showWartendeFahrzeugAuswahlModal(kunde, fahrzeuge) {
    const modal = document.getElementById('fahrzeugAuswahlModal');
    const kundeInfo = document.getElementById('fahrzeugAuswahlKunde');
    const liste = document.getElementById('fahrzeugAuswahlListe');
    
    kundeInfo.innerHTML = `<strong>${kunde.name}</strong>${kunde.telefon ? ` · ${kunde.telefon}` : ''}<br>
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
            <span style="font-size: 1.2em; font-weight: bold;">🚗 ${fz.kennzeichen}</span>
            ${fz.fahrzeugtyp ? `<span style="color: #666; margin-left: 10px;">${fz.fahrzeugtyp}</span>` : ''}
          </div>
          ${idx === 0 ? '<span style="background: #4caf50; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;">Zuletzt</span>' : ''}
        </div>
        ${fz.vin ? `<div style="font-size: 0.85em; color: #888; margin-top: 5px;">VIN: ${fz.vin}</div>` : ''}
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

  // Fahrzeug aus Modal für Wartende Aktionen auswählen
  selectWartendeFahrzeugFromModal(kundeId, fahrzeugIndex) {
    if (!this.wartendeFahrzeugAuswahlData) return;
    
    const { kunde, fahrzeuge } = this.wartendeFahrzeugAuswahlData;
    const fahrzeug = fahrzeuge[fahrzeugIndex];
    
    this.selectWartendeKunde(kundeId, kunde.name, kunde.telefon, fahrzeug.kennzeichen, fahrzeug.fahrzeugtyp);
    
    // Modal schließen
    document.getElementById('fahrzeugAuswahlModal').style.display = 'none';
    this.wartendeFahrzeugAuswahlData = null;
  }

  // Vorschlag auswählen (Kennzeichen)
  selectWartendeKennzeichenVorschlag(kundeId, kennzeichen, kundeName, kundeTelefon, fahrzeugtyp) {
    this.selectWartendeKunde(kundeId, kundeName, kundeTelefon, kennzeichen, fahrzeugtyp);
    this.hideWartendVorschlaege('kennzeichen');
  }

  selectWartendeKunde(kundeId, name, telefon, kennzeichen, fahrzeugtyp) {
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
  }

  hideWartendVorschlaege(typ) {
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
  }

  handleWartendSucheKeydown(e, typ) {
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
  }

  updateWartendVorschlagHighlight(items, newIndex, typ) {
    items.forEach((item, i) => {
      item.classList.toggle('highlighted', i === newIndex);
    });
    if (typ === 'name') {
      this.wartendVorschlaegeIndex = newIndex;
    } else {
      this.wartendKzVorschlaegeIndex = newIndex;
    }
  }

  // Schnellauswahl für Wartende Aktionen Grund
  setWartendGrund(grund) {
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
  }

  async handleWartendeAktionSubmit(e) {
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
  }

  async loadWartendeAktionen() {
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
  }

  async wartendeAktionEinplanen(terminId) {
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
  }

  async wartendeAktionErledigt(terminId) {
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
  }

  async wartendeAktionLoeschen(terminId) {
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
  }

  async wartendeAktionTeileStatus(terminId) {
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
  }

  async saveTeileStatus(termin, selectedStatus) {
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
  }

  async loadTermine() {
    const filterDatumInput = document.getElementById('filterDatum');
    const termineTable = document.getElementById('termineTable');
    if (!filterDatumInput || !termineTable) {
      return;
    }
    const filterDatum = filterDatumInput.value;

    try {
      const termine = await TermineService.getAll(filterDatum || null);
      if (!filterDatum) {
        this.termineCache = termine;
        this.updateTerminSuchliste();
      }
      this.termineById = {};

      const tbody = termineTable.getElementsByTagName('tbody')[0];
      tbody.innerHTML = '';

      termine.forEach(termin => {
        this.termineById[termin.id] = termin;
        const row = tbody.insertRow();
        const statusClass = `status-${termin.status}`;
        const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;

        // Zeit-Status: rot = nur geschätzt ODER muss noch bearbeitet werden, grün = tatsächlich erfasst UND nicht zur Bearbeitung markiert
        const hatTatsaechlicheZeit = termin.tatsaechliche_zeit && termin.tatsaechliche_zeit > 0;
        const mussNochBearbeitet = termin.muss_bearbeitet_werden || false;
        const zeitStatusIcon = (hatTatsaechlicheZeit && !mussNochBearbeitet) ? '🟢' : '🔴';

        // Dringlichkeit-Badge
        const terminDringlichkeit = this.getDringlichkeitBadge(termin.dringlichkeit);
        
        // Folgetermin-Badge
        const terminFolgetermin = this.getFolgeterminBadge(termin.arbeit);
        
        // Schwebend-Badge
        const schwebendBadge = termin.ist_schwebend ? '<span class="schwebend-badge">⏸️ Schwebend</span>' : '';
        
        // Split-Badge
        const splitBadge = termin.split_teil ? `<span class="split-badge">Teil ${termin.split_teil}</span>` : '';
        
        // Teile-Status Badge (zeigt an wenn Teile bestellt werden müssen)
        const teileStatusBadge = this.getTerminTeileStatusBadge(termin);
        
        // Arbeit-Anzeige formatieren
        const arbeitAnzeige = this.formatArbeitAnzeige(termin.arbeit);

        // Schwebende Termine visuell kennzeichnen
        if (termin.ist_schwebend) {
          row.classList.add('schwebend');
        }

        row.innerHTML = `
          <td style="text-align: center; font-size: 20px;">${zeitStatusIcon}</td>
          <td><strong>${termin.termin_nr || '-'}</strong>${terminDringlichkeit}${terminFolgetermin}${schwebendBadge}${splitBadge}${teileStatusBadge}</td>
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

  goToMorgen() {
    const filterDatum = document.getElementById('filterDatum');
    let morgen = new Date();
    morgen.setDate(morgen.getDate() + 1);
    
    // Falls morgen Sonntag ist, überspringe zu Montag
    if (morgen.getDay() === 0) {
      morgen.setDate(morgen.getDate() + 1);
    }
    
    filterDatum.value = this.formatDateLocal(morgen);
    this.loadTermine();
    this.updateZeitverwaltungDatumAnzeige();
  }

  async showWocheTermine() {
    // Zeige alle Termine der aktuellen Woche (Mo-Sa, ohne Sonntag)
    document.getElementById('filterDatum').value = '';
    
    try {
      const termine = await TermineService.getAll(null);
      
      // Berechne Montag und Samstag der aktuellen Woche
      const heute = new Date();
      const tag = heute.getDay();
      const diffToMontag = tag === 0 ? -6 : 1 - tag; // Sonntag = -6, sonst 1 - aktueller Tag
      
      const montag = new Date(heute);
      montag.setDate(heute.getDate() + diffToMontag);
      montag.setHours(0, 0, 0, 0);
      
      const samstag = new Date(montag);
      samstag.setDate(montag.getDate() + 5);
      samstag.setHours(23, 59, 59, 999);
      
      // Filtere Termine der Woche (Mo-Sa)
      const wochenTermine = termine.filter(t => {
        if (!t.datum) return false;
        const terminDatum = new Date(t.datum);
        terminDatum.setHours(12, 0, 0, 0);
        return terminDatum >= montag && terminDatum <= samstag;
      });
      
      // Sortiere nach Datum
      wochenTermine.sort((a, b) => new Date(a.datum) - new Date(b.datum));
      
      this.termineCache = termine;
      this.updateTerminSuchliste();
      this.termineById = {};

      const tbody = document.getElementById('termineTable').getElementsByTagName('tbody')[0];
      tbody.innerHTML = '';

      if (wochenTermine.length === 0) {
        const row = tbody.insertRow();
        row.innerHTML = '<td colspan="13" style="text-align: center; padding: 30px; color: #666;">📭 Keine Termine in dieser Woche (Mo-Sa)</td>';
      } else {
        wochenTermine.forEach(termin => {
          this.termineById[termin.id] = termin;
          const row = tbody.insertRow();
          const statusClass = `status-${termin.status}`;
          const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;

          // Zeit-Status Icon
          let zeitStatusIcon = '⚪';
          if (termin.tatsaechliche_zeit && termin.tatsaechliche_zeit > 0) {
            zeitStatusIcon = '✅';
          } else if (termin.muss_bearbeitet_werden) {
            zeitStatusIcon = '🔴';
          }

          // Dringlichkeit-Badge
          const terminDringlichkeit = this.getDringlichkeitBadge(termin.dringlichkeit);
          
          // Folgetermin-Badge
          const terminFolgetermin = this.getFolgeterminBadge(termin.arbeit);
          
          // Arbeit-Anzeige formatieren
          const arbeitAnzeige = this.formatArbeitAnzeige(termin.arbeit);
          
          // Datum formatieren für Anzeige
          const datumObj = new Date(termin.datum);
          const wochentag = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][datumObj.getDay()];
          const datumAnzeige = `${wochentag}, ${termin.datum}`;

          row.innerHTML = `
            <td style="text-align: center; font-size: 20px;">${zeitStatusIcon}</td>
            <td><strong>${termin.termin_nr || '-'}</strong>${terminDringlichkeit}${terminFolgetermin}</td>
            <td><strong>${datumAnzeige}</strong></td>
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
        const montagStr = this.formatDateLocal(montag);
        const samstagStr = this.formatDateLocal(samstag);
        datumAnzeige.textContent = `🗓️ Woche: ${montagStr} - ${samstagStr} (${wochenTermine.length} Termine)`;
        datumAnzeige.parentElement.style.borderLeftColor = '#17a2b8';
      }
    } catch (error) {
      console.error('Fehler beim Laden der Wochentermine:', error);
    }
  }

  async showOffeneTermine() {
    // Zeige alle Termine ohne tatsächliche Zeit ODER mit "muss bearbeitet werden" Markierung
    document.getElementById('filterDatum').value = '';
    
    try {
      const termine = await TermineService.getAll(null);
      
      // Filtere Termine: ohne tatsächliche Zeit ODER mit "muss noch bearbeitet werden" Markierung
      const offeneTermine = termine.filter(t => 
        (!t.tatsaechliche_zeit || t.tatsaechliche_zeit <= 0) || t.muss_bearbeitet_werden
      );
      
      this.termineCache = termine;
      this.updateTerminSuchliste();
      this.termineById = {};

      const tbody = document.getElementById('termineTable').getElementsByTagName('tbody')[0];
      tbody.innerHTML = '';

      if (offeneTermine.length === 0) {
        const row = tbody.insertRow();
        row.innerHTML = '<td colspan="13" style="text-align: center; padding: 30px; color: #27ae60;">✅ Keine offenen Termine - alle Zeiten sind erfasst!</td>';
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

  async showSchwebendeTermine() {
    // Zeige alle schwebenden Termine (ist_schwebend = 1)
    
    // Wechsle zum Zeitverwaltung-Tab
    this.switchToTab('zeitverwaltung');
    
    document.getElementById('filterDatum').value = '';
    
    try {
      const termine = await TermineService.getAll(null);
      
      // Filtere nur schwebende Termine
      const schwebendeTermine = termine.filter(t => t.ist_schwebend);
      
      this.termineCache = termine;
      this.updateTerminSuchliste();
      this.termineById = {};

      const tbody = document.getElementById('termineTable').getElementsByTagName('tbody')[0];
      tbody.innerHTML = '';

      if (schwebendeTermine.length === 0) {
        const row = tbody.insertRow();
        row.innerHTML = '<td colspan="13" style="text-align: center; padding: 30px; color: #27ae60;">✅ Keine schwebenden Termine vorhanden</td>';
      } else {
        schwebendeTermine.forEach(termin => {
          this.termineById[termin.id] = termin;
          const row = tbody.insertRow();
          const statusClass = `status-${termin.status}`;
          const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;

          const zeitStatusIcon = '⏳';

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
        datumAnzeige.textContent = `⏳ Schwebende Termine (${schwebendeTermine.length})`;
        datumAnzeige.parentElement.style.borderLeftColor = '#ff9800';
      }
    } catch (error) {
      console.error('Fehler beim Laden der schwebenden Termine:', error);
    }
  }

  updateZeitverwaltungDatumAnzeige() {
    const filterDatum = document.getElementById('filterDatum');
    const datumAnzeige = document.getElementById('zeitverwaltungDatumText');
    
    if (!datumAnzeige || !filterDatum) return;
    
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
    let termin = this.termineById[terminId];
    
    // Falls Termin nicht im Cache ist, lade ihn vom Server
    if (!termin) {
      try {
        termin = await TermineService.getById(terminId);
        if (!termin) {
          alert('Termin nicht gefunden');
          return;
        }
        this.termineById[terminId] = termin;
      } catch (error) {
        console.error('Fehler beim Laden des Termins:', error);
        alert('Fehler beim Laden des Termins');
        return;
      }
    }

    // Speichere aktuelle Termin-ID für Split/Schwebend-Funktionen
    this.currentDetailTerminId = terminId;

    // Prüfe ob Mitarbeiter/Lehrling zugeordnet ist (aus arbeitszeiten_details)
    let zugeordneteLehrlingId = null;
    let zugeordneteMitarbeiterId = null;
    if (termin.arbeitszeiten_details) {
      try {
        const details = JSON.parse(termin.arbeitszeiten_details);
        if (details._gesamt_mitarbeiter_id && typeof details._gesamt_mitarbeiter_id === 'object') {
          if (details._gesamt_mitarbeiter_id.type === 'lehrling') {
            zugeordneteLehrlingId = details._gesamt_mitarbeiter_id.id;
          } else if (details._gesamt_mitarbeiter_id.type === 'mitarbeiter') {
            zugeordneteMitarbeiterId = details._gesamt_mitarbeiter_id.id;
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
      
      // Lade Abwesenheiten für das Datum des Termins
      let abwesendeMitarbeiterIds = new Set();
      let abwesendeLehrlingeIds = new Set();
      
      if (termin.datum && termin.datum !== '9999-12-31') {
        try {
          const abwesenheiten = await EinstellungenService.getAbwesenheitenByDateRange(termin.datum, termin.datum);
          if (abwesenheiten && Array.isArray(abwesenheiten)) {
            abwesenheiten.forEach(a => {
              // API gibt mitarbeiter_id oder lehrling_id zurück
              if (a.mitarbeiter_id) {
                abwesendeMitarbeiterIds.add(a.mitarbeiter_id);
              }
              if (a.lehrling_id) {
                abwesendeLehrlingeIds.add(a.lehrling_id);
              }
            });
          }
        } catch (e) {
          console.warn('Konnte Abwesenheiten nicht laden:', e);
        }
      }

      // Erstelle Optgroups für bessere Übersicht - nur verfügbare Personen
      const verfuegbareMitarbeiter = mitarbeiter.filter(m => !abwesendeMitarbeiterIds.has(m.id));
      const abwesendeMitarbeiter = mitarbeiter.filter(m => abwesendeMitarbeiterIds.has(m.id));
      
      if (verfuegbareMitarbeiter.length > 0) {
        mitarbeiterOptions += '<optgroup label="Mitarbeiter">';
        mitarbeiterOptions += verfuegbareMitarbeiter.map(m =>
          `<option value="ma_${m.id}" ${(zugeordneteMitarbeiterId === m.id || termin.mitarbeiter_id === m.id) ? 'selected' : ''}>${m.name}</option>`
        ).join('');
        mitarbeiterOptions += '</optgroup>';
      }
      
      // Abwesende Mitarbeiter separat anzeigen (ausgegraut)
      if (abwesendeMitarbeiter.length > 0) {
        mitarbeiterOptions += '<optgroup label="⛔ Abwesend">';
        mitarbeiterOptions += abwesendeMitarbeiter.map(m =>
          `<option value="ma_${m.id}" disabled style="color: #999;">${m.name} (abwesend)</option>`
        ).join('');
        mitarbeiterOptions += '</optgroup>';
      }

      // Trenne Lehrlinge: verfügbar, abwesend (Urlaub/Krank), Berufsschule
      const berufsschulLehrlinge = [];
      const verfuegbareLehrlinge = lehrlinge.filter(l => {
        if (abwesendeLehrlingeIds.has(l.id)) return false;
        // Prüfe Berufsschule
        const schule = this.isLehrlingInBerufsschule(l, termin.datum);
        if (schule.inSchule) {
          berufsschulLehrlinge.push({ ...l, kw: schule.kw });
          return false;
        }
        return true;
      });
      const abwesendeLehrlinge = lehrlinge.filter(l => abwesendeLehrlingeIds.has(l.id));
      
      if (verfuegbareLehrlinge.length > 0) {
        mitarbeiterOptions += '<optgroup label="Lehrlinge">';
        mitarbeiterOptions += verfuegbareLehrlinge.map(l =>
          `<option value="l_${l.id}" ${zugeordneteLehrlingId === l.id ? 'selected' : ''}>${l.name}</option>`
        ).join('');
        mitarbeiterOptions += '</optgroup>';
      }
      
      // Lehrlinge in Berufsschule separat anzeigen (ausgegraut)
      if (berufsschulLehrlinge.length > 0) {
        mitarbeiterOptions += '<optgroup label="📚 Berufsschule">';
        mitarbeiterOptions += berufsschulLehrlinge.map(l =>
          `<option value="l_${l.id}" disabled style="color: #666;">📚 ${l.name} (KW ${l.kw} - Berufsschule)</option>`
        ).join('');
        mitarbeiterOptions += '</optgroup>';
      }
      
      // Abwesende Lehrlinge separat anzeigen (ausgegraut)
      if (abwesendeLehrlinge.length > 0) {
        mitarbeiterOptions += '<optgroup label="⛔ Lehrlinge abwesend">';
        mitarbeiterOptions += abwesendeLehrlinge.map(l =>
          `<option value="l_${l.id}" disabled style="color: #999;">${l.name} (abwesend)</option>`
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

    // Schwebend-Status anzeigen
    const schwebendBadge = termin.ist_schwebend 
      ? '<span style="background: #ff9800; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; margin-left: 10px;">⏸️ Schwebend</span>'
      : '';
    
    // Verknüpfungs-Badge (Erweiterungen) anzeigen
    const erweiterungenCount = Object.values(this.termineById).filter(
      t => t.erweiterung_von_id === termin.id && !t.ist_geloescht
    ).length;
    const istErweiterung = termin.ist_erweiterung === 1 || termin.ist_erweiterung === true;
    
    let verknuepfungsBadge = '';
    if (erweiterungenCount > 0) {
      verknuepfungsBadge = `<span style="background: #1976d2; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; margin-left: 10px; cursor: pointer;" onclick="app.showVerknuepfteTermine(${termin.id})">🔗 ${erweiterungenCount} Erweiterung(en)</span>`;
    } else if (istErweiterung) {
      verknuepfungsBadge = `<span style="background: #0d47a1; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; margin-left: 10px; cursor: pointer;" onclick="app.showVerknuepfteTermine(${termin.id})">🔗 Erweiterung</span>`;
    }
    
    // Split-Info anzeigen wenn vorhanden
    const splitInfo = termin.split_teil 
      ? `<p><strong>Aufgeteilter Termin:</strong> Teil ${termin.split_teil} ${termin.parent_termin_id ? '(Fortsetzung)' : ''}</p>`
      : '';

    // Status-Badge formatieren
    const statusBadge = {
      'geplant': '<span class="detail-status-badge status-geplant">📅 Geplant</span>',
      'in_bearbeitung': '<span class="detail-status-badge status-bearbeitung">🔧 In Bearbeitung</span>',
      'erledigt': '<span class="detail-status-badge status-erledigt">✅ Erledigt</span>',
      'abgebrochen': '<span class="detail-status-badge status-abgebrochen">❌ Abgebrochen</span>'
    }[termin.status] || `<span class="detail-status-badge">${termin.status}</span>`;

    // Ersatzauto-Badge
    const ersatzautoBadge = termin.ersatzauto 
      ? '<span class="detail-badge badge-ja">✓ Ja</span>' 
      : '<span class="detail-badge badge-nein">✗ Nein</span>';

    // Datum formatieren (mit Wochentag)
    const datumObj = new Date(termin.datum + 'T00:00:00');
    const wochentage = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const datumFormatiert = `${wochentage[datumObj.getDay()]}, ${termin.datum.split('-').reverse().join('.')}`;

    // Berechne Gesamtzeit aus arbeitszeiten_details wenn vorhanden
    let gesamtzeitBerechnet = null;
    let gesamtzeitMinuten = 0;
    let fruehesteStartzeit = null;
    
    // Lade globale Werkstatt-Einstellungen (Nebenzeit %)
    let globaleNebenzeitProzent = 0;
    try {
      const werkstattEinstellungen = await EinstellungenService.getWerkstatt();
      globaleNebenzeitProzent = werkstattEinstellungen.nebenzeit_prozent || 0;
    } catch (e) {
      console.warn('Konnte Werkstatt-Einstellungen nicht laden:', e);
    }
    
    // Lade Mitarbeiter und Lehrlinge für individuelle Nebenzeit/Aufgabenbewältigung
    let mitarbeiterMap = {};
    let lehrlingeMap = {};
    try {
      const mitarbeiter = await MitarbeiterService.getAll();
      const lehrlinge = await LehrlingeService.getAll();
      mitarbeiter.forEach(m => mitarbeiterMap[m.id] = m);
      lehrlinge.forEach(l => lehrlingeMap[l.id] = l);
    } catch (e) {
      console.warn('Konnte Mitarbeiter/Lehrlinge nicht laden:', e);
    }
    
    if (termin.arbeitszeiten_details) {
      try {
        const arbeitszeitenDetails = JSON.parse(termin.arbeitszeiten_details);
        let summeMinuten = 0;
        
        // Iteriere über ALLE Einträge in arbeitszeiten_details (inkl. Erweiterungen)
        for (const [key, value] of Object.entries(arbeitszeitenDetails)) {
          // Überspringe Meta-Felder
          if (key.startsWith('_')) {
            if (key === '_startzeit' && value) {
              fruehesteStartzeit = value;
            }
            continue;
          }
          
          let zeitMinuten = typeof value === 'object' ? (value.zeit || 0) : value;
          
          // Wende Nebenzeit/Aufgabenbewältigung an
          if (typeof value === 'object' && zeitMinuten > 0) {
            // Globale Nebenzeit immer anwenden
            if (globaleNebenzeitProzent > 0) {
              zeitMinuten = zeitMinuten * (1 + globaleNebenzeitProzent / 100);
            }
            
            // Zusätzlich individuelle Faktoren
            if (value.type === 'mitarbeiter' && value.mitarbeiter_id) {
              const ma = mitarbeiterMap[value.mitarbeiter_id];
              if (ma && ma.nebenzeit_prozent > 0) {
                zeitMinuten = zeitMinuten * (1 + ma.nebenzeit_prozent / 100);
              }
            } else if (value.type === 'lehrling' && value.mitarbeiter_id) {
              const lehr = lehrlingeMap[value.mitarbeiter_id];
              if (lehr) {
                // Individuelle Nebenzeit hinzufügen
                if (lehr.nebenzeit_prozent > 0) {
                  zeitMinuten = zeitMinuten * (1 + lehr.nebenzeit_prozent / 100);
                }
                // Aufgabenbewältigung anwenden (z.B. 150% = braucht 1.5x so lange)
                if (lehr.aufgabenbewaeltigung_prozent && lehr.aufgabenbewaeltigung_prozent !== 100) {
                  zeitMinuten = zeitMinuten * (lehr.aufgabenbewaeltigung_prozent / 100);
                }
              }
            }
          }
          
          summeMinuten += zeitMinuten;
          
          // Früheste Startzeit finden
          if (typeof value === 'object' && value.startzeit && value.startzeit !== '') {
            if (!fruehesteStartzeit || value.startzeit < fruehesteStartzeit) {
              fruehesteStartzeit = value.startzeit;
            }
          }
        }
        
        if (summeMinuten > 0) {
          gesamtzeitBerechnet = this.formatMinutesToHours(Math.round(summeMinuten));
          gesamtzeitMinuten = Math.round(summeMinuten);
        }
      } catch (e) {
        console.error('Fehler beim Berechnen der Gesamtzeit:', e);
      }
    }
    
    // Fallback auf geschätzte Zeit wenn keine Details vorhanden
    if (gesamtzeitMinuten === 0 && termin.geschaetzte_zeit) {
      gesamtzeitMinuten = termin.geschaetzte_zeit;
      // Auch für Fallback globale Nebenzeit anwenden
      if (globaleNebenzeitProzent > 0) {
        gesamtzeitMinuten = Math.round(gesamtzeitMinuten * (1 + globaleNebenzeitProzent / 100));
      }
    }
    
    // Prüfe ob es separate Erweiterungs-Termine gibt
    let erweiterungen = [];
    let erweiterungenZeitMinuten = 0;
    try {
      const alleTermine = await TermineService.getAll();
      erweiterungen = alleTermine.filter(
        t => t.erweiterung_von_id === termin.id && !t.ist_geloescht
      );
      
      // Prüfe ob Haupttermin bereits [Erweiterung]-Einträge in arbeitszeiten_details hat
      const haupttermineArbeitenKeys = termin.arbeitszeiten_details 
        ? Object.keys(JSON.parse(termin.arbeitszeiten_details))
        : [];
      const hatErweiterungenInDetails = haupttermineArbeitenKeys.some(k => k.startsWith('[Erweiterung]'));
      
      // Nur zusätzliche Zeit berechnen, wenn KEINE Erweiterungen in arbeitszeiten_details sind
      // (sonst wurden sie dort bereits erfasst)
      if (!hatErweiterungenInDetails) {
        erweiterungen.forEach(erw => {
          let erwZeit = 0;
          
          if (erw.arbeitszeiten_details) {
            try {
              const details = JSON.parse(erw.arbeitszeiten_details);
              for (const [key, value] of Object.entries(details)) {
                if (!key.startsWith('_')) {
                  let zeit = typeof value === 'object' ? (value.zeit || 0) : value;
                  // Globale Nebenzeit anwenden
                  if (globaleNebenzeitProzent > 0) {
                    zeit = zeit * (1 + globaleNebenzeitProzent / 100);
                  }
                  // Individuelle Faktoren anwenden
                  if (typeof value === 'object') {
                    if (value.type === 'lehrling' && value.mitarbeiter_id) {
                      const lehr = lehrlingeMap[value.mitarbeiter_id];
                      if (lehr && lehr.aufgabenbewaeltigung_prozent && lehr.aufgabenbewaeltigung_prozent !== 100) {
                        zeit = zeit * (lehr.aufgabenbewaeltigung_prozent / 100);
                      }
                    }
                  }
                  erwZeit += zeit;
                }
              }
            } catch (e) {}
          } else if (erw.geschaetzte_zeit) {
            erwZeit = erw.geschaetzte_zeit;
            // Globale Nebenzeit auch auf geschätzte Zeit anwenden
            if (globaleNebenzeitProzent > 0) {
              erwZeit = erwZeit * (1 + globaleNebenzeitProzent / 100);
            }
          }
          
          erweiterungenZeitMinuten += erwZeit;
        });
      }
      
      erweiterungenZeitMinuten = Math.round(erweiterungenZeitMinuten);
    } catch (e) {
      console.error('Fehler beim Laden der Erweiterungen:', e);
    }
    
    // Endzeit: Verwende gespeicherte endzeit_berechnet wenn vorhanden
    let endzeitFormatiert = '-';
    
    // Für Erweiterungs-Termine: Hole endzeit_berechnet vom Haupttermin
    let effektiveEndzeit = termin.endzeit_berechnet;
    if (!effektiveEndzeit && termin.erweiterung_von_id) {
      // Dies ist eine Erweiterung - hole Endzeit vom Haupttermin
      try {
        const hauptTermin = await TermineService.getById(termin.erweiterung_von_id);
        if (hauptTermin && hauptTermin.endzeit_berechnet) {
          effektiveEndzeit = hauptTermin.endzeit_berechnet;
        }
      } catch (e) {
        console.error('Fehler beim Laden des Haupttermins:', e);
      }
    }
    
    if (effektiveEndzeit) {
      // Gespeicherte berechnete Endzeit verwenden
      endzeitFormatiert = effektiveEndzeit;
      if (erweiterungen.length > 0) {
        endzeitFormatiert += ` (inkl. ${erweiterungen.length} Erw.)`;
      }
    } else {
      // Fallback: Berechne lokal
      const startzeit = fruehesteStartzeit || termin.startzeit || termin.bring_zeit;
      const gesamtMinutenInklErw = gesamtzeitMinuten + erweiterungenZeitMinuten;
      
      if (startzeit && gesamtMinutenInklErw > 0) {
        const [startH, startM] = startzeit.split(':').map(Number);
        const startInMinuten = startH * 60 + startM;
        const endInMinuten = startInMinuten + gesamtMinutenInklErw;
        const endH = Math.floor(endInMinuten / 60);
        const endM = endInMinuten % 60;
        endzeitFormatiert = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        if (erweiterungen.length > 0) {
          endzeitFormatiert += ` (inkl. ${erweiterungen.length} Erw.)`;
        }
      }
    }

    body.innerHTML = `
      <!-- Header-Bereich mit Termin-Nr und Status -->
      <div class="detail-header">
        <div class="detail-header-left">
          <span class="detail-termin-nr">🎫 ${termin.termin_nr || '-'}</span>
          ${schwebendBadge}
          ${verknuepfungsBadge}
        </div>
        <div class="detail-header-right">
          ${statusBadge}
        </div>
      </div>
      ${splitInfo ? `<div class="detail-split-info">${splitInfo}</div>` : ''}

      <!-- Kunde & Fahrzeug -->
      <div class="detail-section">
        <div class="detail-section-title">👤 Kunde & Fahrzeug</div>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Kunde</span>
            <span class="detail-value">${termin.kunde_name || '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Telefon</span>
            <span class="detail-value">${termin.kunde_telefon || '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Kennzeichen</span>
            <span class="detail-value detail-value-highlight">${termin.kennzeichen || '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Kilometerstand</span>
            <span class="detail-value">${termin.kilometerstand ? termin.kilometerstand.toLocaleString('de-DE') + ' km' : '-'}</span>
          </div>
        </div>
      </div>

      <!-- Arbeitsdetails -->
      <div class="detail-section">
        <div class="detail-section-title">🔧 Arbeitsdetails</div>
        <div class="detail-grid">
          <div class="detail-item detail-item-full">
            <span class="detail-label">Arbeiten</span>
            <span class="detail-value">${termin.arbeit || '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Geschätzte Zeit</span>
            <span class="detail-value detail-value-highlight">${this.formatMinutesToHours(termin.geschaetzte_zeit || 0)}</span>
          </div>
          ${gesamtzeitBerechnet ? `
          <div class="detail-item">
            <span class="detail-label">Berechnete Arbeitszeit</span>
            <span class="detail-value detail-value-highlight">⏱️ ${gesamtzeitBerechnet}</span>
          </div>` : ''}
          <div class="detail-item">
            <span class="detail-label">Interne Auftragsnr.</span>
            <span class="detail-value detail-value-highlight">${termin.interne_auftragsnummer || '-'}</span>
          </div>
          ${termin.dringlichkeit ? `
          <div class="detail-item">
            <span class="detail-label">Dringlichkeit</span>
            <span class="detail-value">${dringlichkeitText}</span>
          </div>` : ''}
          <div class="detail-item detail-item-full">
            <span class="detail-label">Details/Wünsche</span>
            <span class="detail-value detail-value-notes">${termin.umfang || '-'}</span>
          </div>
        </div>
      </div>

      <!-- Termin & Abholung -->
      <div class="detail-section">
        <div class="detail-section-title">📆 Termin & Abholung</div>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Datum</span>
            <span class="detail-value detail-value-highlight">${datumFormatiert}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Abholung/Bringen</span>
            <span class="detail-value">${abholungText}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Bringzeit</span>
            <span class="detail-value">${termin.bring_zeit || '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Fertig ca.</span>
            <span class="detail-value detail-value-highlight">${endzeitFormatiert}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Abholzeit</span>
            <span class="detail-value">${termin.abholung_zeit || '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Kontakt</span>
            <span class="detail-value">${kontaktText}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Ersatzauto</span>
            ${ersatzautoBadge}
          </div>
          <div class="detail-item detail-item-full">
            <span class="detail-label">Abhol-Details</span>
            <span class="detail-value detail-value-notes">${termin.abholung_details || '-'}</span>
          </div>
        </div>
      </div>

      <!-- Mitarbeiter-Zuordnung -->
      <div class="detail-section detail-section-action">
        <div class="detail-section-title">👷 Mitarbeiter-Zuordnung</div>
        <select id="terminMitarbeiterSelect" class="detail-select">
          ${mitarbeiterOptions}
        </select>
        <button class="btn btn-primary detail-action-btn" onclick="app.updateTerminMitarbeiter(${termin.id})">
          💾 Zuordnung speichern
        </button>
      </div>

      <!-- Zeiten für einzelne Arbeiten -->
      <div class="detail-section detail-section-action">
        <button class="btn btn-secondary detail-action-btn" style="width: 100%;" onclick="app.closeTerminDetails(); app.openArbeitszeitenModal(${termin.id});">
          ⏱️ Zeiten für einzelne Arbeiten festlegen
        </button>
      </div>
    `;

    // Schwebend-Button aktualisieren
    this.updateSchwebendButton(termin.ist_schwebend);

    document.getElementById('terminDetailsModal').style.display = 'block';
  }

  async updateTerminMitarbeiter(terminId) {
    const selectedValue = document.getElementById('terminMitarbeiterSelect').value;
    
    // Hole den aktuellen Termin für vorhandene arbeitszeiten_details
    const termin = this.termineById[terminId];
    let existingDetails = {};
    
    if (termin && termin.arbeitszeiten_details) {
      try {
        existingDetails = JSON.parse(termin.arbeitszeiten_details);
      } catch (e) {
        // Ignoriere Parse-Fehler
      }
    }

    // Parse den Wert: "ma_1" oder "l_1" oder ""
    let mitarbeiterIdValue = null;
    let istSchwebend = termin ? termin.ist_schwebend : 0;

    if (selectedValue && selectedValue !== '') {
      const [type, id] = selectedValue.split('_');
      const numId = parseInt(id, 10);

      if (type === 'ma') {
        // Mitarbeiter: Speichere in mitarbeiter_id
        mitarbeiterIdValue = numId;
        // Aktualisiere _gesamt_mitarbeiter_id in bestehenden Details
        existingDetails._gesamt_mitarbeiter_id = { type: 'mitarbeiter', id: numId };
        // Wenn ein Mitarbeiter zugeordnet wird, ist der Termin nicht mehr schwebend
        istSchwebend = 0;
      } else if (type === 'l') {
        // Lehrling: Speichere nur in arbeitszeiten_details
        mitarbeiterIdValue = null; // Lehrlinge haben kein mitarbeiter_id
        existingDetails._gesamt_mitarbeiter_id = { type: 'lehrling', id: numId };
        // Wenn ein Lehrling zugeordnet wird, ist der Termin nicht mehr schwebend
        istSchwebend = 0;
      }
    } else {
      // Keine Zuordnung - entferne _gesamt_mitarbeiter_id
      delete existingDetails._gesamt_mitarbeiter_id;
    }

    // Wenn keine Startzeit vorhanden ist, aber eine Bringzeit existiert, diese als Startzeit verwenden
    let bringzeitAlsStartzeit = false;
    if (selectedValue && termin && !existingDetails._startzeit && termin.bring_zeit) {
      existingDetails._startzeit = termin.bring_zeit;
      bringzeitAlsStartzeit = true;
      console.log('Bringzeit als Startzeit übernommen:', termin.bring_zeit);
    }

    // Überschneidungsprüfung wenn Mitarbeiter/Lehrling zugeordnet wird und Termin eine Startzeit hat
    if (selectedValue && termin) {
      let terminStartzeit = null;
      if (existingDetails._startzeit) {
        terminStartzeit = existingDetails._startzeit;
      }
      
      // Nur prüfen wenn Startzeit vorhanden und kein schwebender/wartender Termin
      if (terminStartzeit && termin.datum && termin.datum !== '9999-12-31') {
        const [type, id] = selectedValue.split('_');
        const numId = parseInt(id, 10);
        const mitarbeiterId = type === 'ma' ? numId : null;
        const lehrlingId = type === 'l' ? numId : null;
        
        const ueberschneidungen = await this.checkTerminUeberschneidungen(
          termin.datum,
          terminStartzeit,
          termin.geschaetzte_zeit || 60,
          mitarbeiterId,
          lehrlingId,
          terminId
        );
        
        if (ueberschneidungen.length > 0) {
          const konfliktListe = ueberschneidungen.map(u => 
            `• ${u.termin.termin_nr}: ${u.startzeit} - ${u.endzeit} (${u.termin.kunde_name || 'Unbekannt'})`
          ).join('\n');
          
          const fortfahren = confirm(
            `⚠️ TERMINÜBERSCHNEIDUNG!\n\n` +
            `Der Termin überschneidet sich mit:\n${konfliktListe}\n\n` +
            `Trotzdem fortfahren?`
          );
          
          if (!fortfahren) return;
        }
      }
    }
    
    // Automatisch auf "geplant" setzen wenn Mitarbeiter zugeordnet wird und Startzeit vorhanden
    let neuerStatus = null;
    if (selectedValue && existingDetails._startzeit && termin.status === 'wartend') {
      neuerStatus = 'geplant';
    }
    
    try {
      const updateData = {
        mitarbeiter_id: mitarbeiterIdValue,
        arbeitszeiten_details: Object.keys(existingDetails).length > 0 ? JSON.stringify(existingDetails) : null,
        ist_schwebend: istSchwebend
      };
      
      if (neuerStatus) {
        updateData.status = neuerStatus;
      }
      
      // Wenn Bringzeit als Startzeit übernommen wurde, auch in der Datenbank speichern
      if (bringzeitAlsStartzeit && termin.bring_zeit) {
        updateData.startzeit = termin.bring_zeit;
        
        // Endzeit berechnen basierend auf geschätzter Zeit
        const geschaetzteZeit = termin.geschaetzte_zeit || 60;
        const [stunden, minuten] = termin.bring_zeit.split(':').map(Number);
        const startMinuten = stunden * 60 + minuten;
        const endMinuten = startMinuten + geschaetzteZeit;
        const endStunden = Math.floor(endMinuten / 60);
        const endMin = endMinuten % 60;
        updateData.endzeit_berechnet = `${String(endStunden).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
        console.log('Startzeit und Endzeit in Datenbank gespeichert:', updateData.startzeit, '-', updateData.endzeit_berechnet);
      }
      
      await TermineService.update(terminId, updateData);
      let hinweis = neuerStatus ? ' Status auf "Geplant" gesetzt.' : '';
      if (bringzeitAlsStartzeit) {
        hinweis += ' Bringzeit wurde als Startzeit übernommen.';
      }
      alert('Zuordnung gespeichert!' + hinweis);
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

  // Zurück zu Termin-Details vom Arbeitszeiten-Modal
  backToTerminDetails() {
    // Schließe Arbeitszeiten-Modal
    document.getElementById('arbeitszeitenModal').style.display = 'none';
    
    // Öffne Termin-Details wieder, falls eine Termin-ID gespeichert ist
    if (this.currentTerminId) {
      this.showTerminDetails(this.currentTerminId);
    }
  }

  // Navigation zu Standardzeiten-Einstellungen
  navigateToStandardzeiten() {
    // Wechsle zum Einstellungen-Tab (mit display toggle)
    const buttons = this.tabCache.buttons || document.querySelectorAll('.tab-button');
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].classList.remove('active');
      if (buttons[i].getAttribute('data-tab') === 'einstellungen') {
        buttons[i].classList.add('active');
      }
    }

    const contents = this.tabCache.contents || document.querySelectorAll('.tab-content');
    for (let i = 0; i < contents.length; i++) {
      contents[i].style.display = 'none';
      contents[i].classList.remove('active');
    }

    const einstellungenTab = this.getCachedElement('einstellungen');
    if (einstellungenTab) {
      einstellungenTab.style.display = 'block';
      einstellungenTab.classList.add('active');
    }

    // Wechsle zum Standardzeiten Sub-Tab
    document.querySelectorAll('.sub-tab-button').forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-sub-tab') === 'standardzeiten') {
        btn.classList.add('active');
      }
    });

    document.querySelectorAll('.sub-tab-content').forEach(content => {
      content.classList.remove('active');
      content.style.display = 'none';
    });
    const standardzeitenTab = this.getCachedElement('standardzeiten');
    if (standardzeitenTab) {
      standardzeitenTab.classList.add('active');
      standardzeitenTab.style.display = 'block';

      // Lade Arbeitszeiten neu
      this.loadArbeitszeiten();
    }
  }

  // ============================================
  // TERMIN-SPLIT & SCHWEBEND FUNKTIONEN
  // ============================================

  // Termin als schwebend markieren/aufheben
  async toggleTerminSchwebend() {
    if (!this.currentDetailTerminId) return;
    
    const termin = this.termineById[this.currentDetailTerminId];
    if (!termin) return;

    const neuerStatus = !termin.ist_schwebend;
    
    // Wenn Termin eingeplant wird (von schwebend auf fest), Datum abfragen
    if (!neuerStatus) {
      this.openEinplanenDatumModal(this.currentDetailTerminId, termin);
      return;
    }
    
    try {
      await TermineService.setSchwebend(this.currentDetailTerminId, neuerStatus);
      
      // Aktualisiere lokalen Cache
      termin.ist_schwebend = neuerStatus ? 1 : 0;
      
      // Button-Text aktualisieren
      this.updateSchwebendButton(neuerStatus);
      
      alert(neuerStatus 
        ? 'Termin als schwebend markiert (wird nicht in Auslastung gezählt)' 
        : 'Termin fest eingeplant');
      
      this.loadTermine();
      this.loadAuslastung();
    } catch (error) {
      console.error('Fehler beim Setzen des Schwebend-Status:', error);
      alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  updateSchwebendButton(istSchwebend) {
    const btn = document.getElementById('terminSchwebendBtn');
    if (btn) {
      if (istSchwebend) {
        btn.innerHTML = '▶️ Einplanen';
        btn.title = 'Termin fest einplanen (wird in Auslastung gezählt)';
      } else {
        btn.innerHTML = '⏸️ Schwebend';
        btn.title = 'Termin als schwebend markieren (wird nicht in Auslastung gezählt)';
      }
    }
  }

  // Termin aus Details-Modal löschen
  async deleteTerminFromDetails() {
    console.log('deleteTerminFromDetails aufgerufen');
    console.log('currentDetailTerminId:', this.currentDetailTerminId);
    
    if (!this.currentDetailTerminId) {
      console.log('Keine currentDetailTerminId vorhanden!');
      alert('Kein Termin ausgewählt');
      return;
    }
    
    // Schließe das Details-Modal
    const modal = document.getElementById('terminDetailsModal');
    if (modal) modal.style.display = 'none';
    
    // Rufe die bestehende deleteTermin-Funktion auf
    await this.deleteTermin(this.currentDetailTerminId);
  }

  /**
   * Zeigt alle verknüpften Termine (Original + Erweiterungen) in einem Modal
   */
  showVerknuepfteTermine(terminId) {
    const termin = this.termineById[terminId];
    if (!termin) return;

    // Sammle alle verknüpften Termine
    const verknuepfte = [];
    
    // Finde den Original-Termin (falls dieser eine Erweiterung ist)
    let originalId = terminId;
    if (termin.erweiterung_von_id) {
      originalId = termin.erweiterung_von_id;
    }
    
    // Hole den Original-Termin
    const originalTermin = this.termineById[originalId];
    if (originalTermin) {
      verknuepfte.push({
        ...originalTermin,
        istOriginal: true,
        istErweiterung: false
      });
    }
    
    // Hole alle Erweiterungen zum Original
    Object.values(this.termineById).forEach(t => {
      if (t.erweiterung_von_id === originalId && !t.ist_geloescht) {
        verknuepfte.push({
          ...t,
          istOriginal: false,
          istErweiterung: true
        });
      }
    });
    
    // Sortiere nach Datum und Zeit
    verknuepfte.sort((a, b) => {
      const datumA = a.datum || '';
      const datumB = b.datum || '';
      if (datumA !== datumB) return datumA.localeCompare(datumB);
      const zeitA = a.bring_zeit || '00:00';
      const zeitB = b.bring_zeit || '00:00';
      return zeitA.localeCompare(zeitB);
    });
    
    // Erstelle Modal falls nicht vorhanden
    let modal = document.getElementById('verknuepfteTermineModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'verknuepfteTermineModal';
      modal.className = 'modal';
      document.body.appendChild(modal);
    }
    
    // Baue Modal-Inhalt
    const terminListe = verknuepfte.map(t => {
      const icon = t.istOriginal ? '📋' : '🔗';
      const typClass = t.istOriginal ? 'original' : 'erweiterung';
      const typText = t.istOriginal ? 'Original' : 'Erweiterung';
      const datumFormatiert = this.formatDateGerman(t.datum);
      const endzeit = this.berechneEndzeit(t.bring_zeit, t.geschaetzte_zeit);
      const dauerText = this.formatMinutesToHours(t.geschaetzte_zeit || 0);
      const aktuellerTermin = t.id === terminId ? ' style="background: #e3f2fd; border-left: 3px solid #1976d2;"' : '';
      
      return `
        <div class="verkn-termin-item"${aktuellerTermin} onclick="app.showTerminDetails(${t.id}); document.getElementById('verknuepfteTermineModal').style.display='none';">
          <div class="verkn-termin-icon">${icon}</div>
          <div class="verkn-termin-info">
            <div class="verkn-termin-nr">${t.termin_nr || '#' + t.id}</div>
            <div class="verkn-termin-arbeit">${this.escapeHtml(t.arbeit || '-')}</div>
            <div class="verkn-termin-details">
              📅 ${datumFormatiert} | ⏰ ${t.bring_zeit || '08:00'} - ${endzeit} | ⏱️ ${dauerText}
            </div>
          </div>
          <div class="verkn-termin-typ ${typClass}">${typText}</div>
        </div>
      `;
    }).join('');
    
    const kundenInfo = originalTermin ? `${originalTermin.kunde_name || 'Kunde'} - ${originalTermin.kennzeichen || '-'}` : '-';
    
    modal.innerHTML = `
      <div class="modal-content verkn-modal-content">
        <span class="close" onclick="document.getElementById('verknuepfteTermineModal').style.display='none'">&times;</span>
        <h3>🔗 Verknüpfte Termine</h3>
        <p style="color: #666; margin-bottom: 15px;">${kundenInfo} • ${verknuepfte.length} verknüpfte(r) Termin(e)</p>
        <div class="verkn-termin-liste">
          ${terminListe}
        </div>
      </div>
    `;
    
    modal.style.display = 'block';
    
    // Schließen bei Klick außerhalb
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    };
  }

  // Einplanen-Datum Modal öffnen
  openEinplanenDatumModal(terminId, termin) {
    // Prüfe ob Modal existiert, sonst erstelle es
    let modal = document.getElementById('einplanenDatumModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'einplanenDatumModal';
      modal.className = 'modal';
      document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <span class="close-btn" onclick="app.closeEinplanenDatumModal()">&times;</span>
        <h3 style="margin-bottom: 20px;">📅 Termin einplanen</h3>
        <div id="einplanenTerminInfo" style="background: #f5f5f5; padding: 10px; border-radius: 8px; margin-bottom: 20px;"></div>
        
        <div class="form-group">
          <label for="einplanenDatum"><strong>Datum für den Termin wählen:</strong></label>
          <input type="date" id="einplanenDatum" class="form-control" style="font-size: 16px; padding: 10px;">
        </div>
        
        <div class="form-group" style="margin-top: 15px;">
          <label for="einplanenUhrzeit"><strong>Startzeit (optional):</strong></label>
          <input type="text" id="einplanenUhrzeit" class="form-control" style="font-size: 16px; padding: 10px; text-align: center;" placeholder="HH:MM" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" oninput="this.value = this.value.replace(/[^0-9:]/g, ''); if(this.value.length === 2 && !this.value.includes(':')) this.value += ':';">
          <small style="color: #666; display: block; margin-top: 5px;">24h-Format (z.B. 08:00, 14:30). Wenn leer, wird der Termin automatisch eingeplant.</small>
        </div>
        
        <div class="form-group" style="margin-top: 15px;">
          <label for="einplanenBringzeit"><strong>Bringzeit (optional):</strong></label>
          <input type="text" id="einplanenBringzeit" class="form-control" style="font-size: 16px; padding: 10px; text-align: center;" placeholder="HH:MM" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" oninput="this.value = this.value.replace(/[^0-9:]/g, ''); if(this.value.length === 2 && !this.value.includes(':')) this.value += ':';">
          <small style="color: #666; display: block; margin-top: 5px;">24h-Format (z.B. 08:00, 14:30)</small>
        </div>
        
        <div class="form-group" style="margin-top: 15px;">
          <label><strong>Arbeiten hinzufügen (optional):</strong></label>
          <div style="display: flex; gap: 10px; margin-top: 5px;">
            <input type="text" id="einplanenArbeitText" class="form-control" style="flex: 1;" placeholder="Arbeit eingeben...">
            <input type="number" id="einplanenArbeitZeit" class="form-control" style="width: 70px;" placeholder="h" min="0.1" step="0.1">
            <button type="button" class="btn btn-secondary" onclick="app.addArbeitToEinplanen()" style="white-space: nowrap;">
              ➕
            </button>
          </div>
          <div id="einplanenArbeitenListe" style="margin-top: 10px; max-height: 150px; overflow-y: auto;"></div>
          <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #666; font-size: 0.9em;">Geschätzte Zeit:</span>
            <strong id="einplanenGesamtzeit">0 h</strong>
          </div>
        </div>
        
        <div style="display: flex; gap: 10px; margin-top: 20px;">
          <button type="button" class="btn btn-primary" onclick="app.confirmEinplanenDatum()" style="flex: 1;">
            ✅ Einplanen
          </button>
          <button type="button" class="btn btn-secondary" onclick="app.closeEinplanenDatumModal()" style="flex: 1;">
            ❌ Abbrechen
          </button>
        </div>
      </div>
    `;
    
    // Termin-Info anzeigen (nur Kunde und Kennzeichen, nicht die Arbeiten)
    document.getElementById('einplanenTerminInfo').innerHTML = `
      <strong>${termin.termin_nr || '-'}</strong> - ${termin.kunde_name || '-'}<br>
      <span style="color: #666;">${termin.kennzeichen || '-'}</span><br>
      <span style="color: #999; font-size: 0.9em;">Aktuelles Datum: ${termin.datum === '9999-12-31' ? 'Nicht gesetzt' : (termin.datum || 'Nicht gesetzt')}</span>
    `;
    
    // Datum vorbelegen (heute oder bestehendes Datum)
    const datumInput = document.getElementById('einplanenDatum');
    if (termin.datum && termin.datum !== '9999-12-31') {
      datumInput.value = termin.datum;
    } else {
      datumInput.value = new Date().toISOString().split('T')[0];
    }
    
    // Bringzeit vorbelegen (falls vorhanden)
    const bringzeitInput = document.getElementById('einplanenBringzeit');
    if (bringzeitInput && termin.bring_zeit) {
      bringzeitInput.value = termin.bring_zeit;
    }
    
    // Speichere aktuelle Termin-ID
    this.einplanenTerminId = terminId;
    
    // Speichere die ursprüngliche geschätzte Zeit des Termins
    this.einplanenUrspruenglicheZeit = termin.geschaetzte_zeit || 60;
    
    // Lade bestehende Arbeiten aus dem Termin
    this.einplanenArbeiten = [];
    if (termin.arbeit) {
      // Parse arbeitszeiten_details für die Zeiten
      let details = {};
      if (termin.arbeitszeiten_details) {
        try {
          details = typeof termin.arbeitszeiten_details === 'string' 
            ? JSON.parse(termin.arbeitszeiten_details) 
            : termin.arbeitszeiten_details;
        } catch (e) {}
      }
      
      // Arbeiten aus dem Termin laden
      const arbeitenListe = termin.arbeit.split('\n').map(a => a.trim()).filter(a => a);
      
      // Berechne Standard-Zeit pro Arbeit aus geschätzter Gesamtzeit des Termins
      const gesamtZeitMinuten = termin.geschaetzte_zeit || 60;
      const standardZeitProArbeit = arbeitenListe.length > 0 ? Math.round(gesamtZeitMinuten / arbeitenListe.length) : 60;
      
      arbeitenListe.forEach(bezeichnung => {
        let zeitMinuten = standardZeitProArbeit; // Aus Termin-Gesamtzeit berechnet
        if (details[bezeichnung]) {
          if (typeof details[bezeichnung] === 'object' && details[bezeichnung].zeit) {
            zeitMinuten = details[bezeichnung].zeit;
          } else if (typeof details[bezeichnung] === 'number') {
            zeitMinuten = details[bezeichnung];
          }
        }
        this.einplanenArbeiten.push({ bezeichnung, zeit: zeitMinuten });
      });
    }
    
    // Arbeiten-Liste anzeigen
    this.renderEinplanenArbeiten();
    
    // Modal anzeigen
    modal.style.display = 'flex';
  }

  addArbeitToEinplanen() {
    const textInput = document.getElementById('einplanenArbeitText');
    const zeitInput = document.getElementById('einplanenArbeitZeit');
    
    const bezeichnung = textInput.value.trim();
    const zeitStunden = parseFloat(zeitInput.value) || 0.5;
    const zeitMinuten = Math.round(zeitStunden * 60);
    
    if (!bezeichnung) {
      alert('Bitte eine Arbeitsbeschreibung eingeben');
      return;
    }
    
    // Prüfe ob schon vorhanden
    if (this.einplanenArbeiten.find(a => a.bezeichnung === bezeichnung)) {
      alert('Diese Arbeit ist bereits hinzugefügt');
      return;
    }
    
    this.einplanenArbeiten.push({ bezeichnung, zeit: zeitMinuten, zeitStunden });
    this.renderEinplanenArbeiten();
    textInput.value = '';
    zeitInput.value = '';
  }

  removeArbeitFromEinplanen(index) {
    this.einplanenArbeiten.splice(index, 1);
    this.renderEinplanenArbeiten();
  }

  renderEinplanenArbeiten() {
    const liste = document.getElementById('einplanenArbeitenListe');
    if (!liste) return;
    
    if (this.einplanenArbeiten.length === 0) {
      liste.innerHTML = '<div style="color: #999; font-style: italic; padding: 5px;">Keine Arbeiten eingetragen</div>';
    } else {
      liste.innerHTML = this.einplanenArbeiten.map((a, i) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 10px; background: #e8f5e9; border-radius: 4px; margin-bottom: 5px;">
          <span>${a.bezeichnung} <small style="color: #666;">(${(a.zeit / 60).toFixed(1)} h)</small></span>
          <button type="button" onclick="app.removeArbeitFromEinplanen(${i})" style="background: none; border: none; color: #f44336; cursor: pointer; font-size: 16px;">✕</button>
        </div>
      `).join('');
    }
    
    this.updateEinplanenGesamtzeit();
  }

  updateEinplanenGesamtzeit() {
    // Verwende die ursprüngliche geschätzte Zeit des Termins
    // Wenn Arbeiten hinzugefügt wurden, deren Gesamtzeit größer ist, verwende diese
    const arbeitenZeit = this.einplanenArbeiten.reduce((sum, a) => sum + a.zeit, 0);
    this.einplanenGesamtzeit = Math.max(this.einplanenUrspruenglicheZeit || 0, arbeitenZeit);
    
    const gesamtzeitEl = document.getElementById('einplanenGesamtzeit');
    if (gesamtzeitEl) {
      gesamtzeitEl.textContent = `${(this.einplanenGesamtzeit / 60).toFixed(1)} h`;
    }
  }

  closeEinplanenDatumModal() {
    const modal = document.getElementById('einplanenDatumModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  // Prüft auf Terminüberschneidungen bei einem Mitarbeiter/Lehrling
  async checkTerminUeberschneidungen(datum, startzeit, dauerMinuten, mitarbeiterId, lehrlingId, ausschlussTerminId = null) {
    const ueberschneidungen = [];
    
    if (!datum || !startzeit || (!mitarbeiterId && !lehrlingId)) {
      return ueberschneidungen;
    }
    
    // Lade Einstellungen für Nebenzeit
    let nebenzeitProzent = 0;
    try {
      const einstellungen = await EinstellungenService.getWerkstatt();
      nebenzeitProzent = einstellungen?.nebenzeit_prozent || 0;
    } catch (e) {}
    
    // Berechne Start- und Endzeit des neuen Termins (inkl. Nebenzeit)
    const [startH, startM] = startzeit.split(':').map(Number);
    const neuerStartMin = startH * 60 + startM;
    const dauerMitNebenzeit = nebenzeitProzent > 0 
      ? Math.round((dauerMinuten || 60) * (1 + nebenzeitProzent / 100))
      : (dauerMinuten || 60);
    const neuerEndeMin = neuerStartMin + dauerMitNebenzeit;
    
    // Lade alle Termine für dieses Datum
    const termine = await TermineService.getAll();
    const tagesTermine = termine.filter(t => 
      t.datum === datum && 
      t.id !== ausschlussTerminId &&
      !t.ist_schwebend
    );
    
    for (const t of tagesTermine) {
      // Prüfe ob dieser Termin dem gleichen Mitarbeiter/Lehrling zugeordnet ist
      let istGleicherMitarbeiter = false;
      
      if (mitarbeiterId && t.mitarbeiter_id === mitarbeiterId) {
        istGleicherMitarbeiter = true;
      }
      
      // Prüfe auch arbeitszeiten_details für Lehrlinge
      if (t.arbeitszeiten_details) {
        try {
          const details = JSON.parse(t.arbeitszeiten_details);
          if (details._gesamt_mitarbeiter_id) {
            if (mitarbeiterId && details._gesamt_mitarbeiter_id.type === 'mitarbeiter' && details._gesamt_mitarbeiter_id.id === mitarbeiterId) {
              istGleicherMitarbeiter = true;
            }
            if (lehrlingId && details._gesamt_mitarbeiter_id.type === 'lehrling' && details._gesamt_mitarbeiter_id.id === lehrlingId) {
              istGleicherMitarbeiter = true;
            }
          }
        } catch (e) {}
      }
      
      if (!istGleicherMitarbeiter) continue;
      
      // Hole Startzeit des bestehenden Termins (Priorität: startzeit-Feld, dann details._startzeit)
      let terminStartzeit = t.startzeit || null;
      if (!terminStartzeit && t.arbeitszeiten_details) {
        try {
          const details = JSON.parse(t.arbeitszeiten_details);
          terminStartzeit = details._startzeit;
          
          // Falls keine _startzeit, suche in den einzelnen Arbeiten nach startzeit
          if (!terminStartzeit) {
            for (const [key, val] of Object.entries(details)) {
              if (key.startsWith('_')) continue;
              if (typeof val === 'object' && val.startzeit) {
                terminStartzeit = val.startzeit;
                break;
              }
            }
          }
        } catch (e) {}
      }
      
      if (!terminStartzeit) continue;
      
      const [tStartH, tStartM] = terminStartzeit.split(':').map(Number);
      const tStartMin = tStartH * 60 + tStartM;
      const tDauer = t.geschaetzte_zeit || 60;
      // Nebenzeit auch auf bestehende Termine anwenden
      const tDauerMitNebenzeit = nebenzeitProzent > 0 
        ? Math.round(tDauer * (1 + nebenzeitProzent / 100))
        : tDauer;
      const tEndeMin = tStartMin + tDauerMitNebenzeit;
      
      // Prüfe Überschneidung: Neuer Termin startet vor Ende des bestehenden UND endet nach Start des bestehenden
      if (neuerStartMin < tEndeMin && neuerEndeMin > tStartMin) {
        ueberschneidungen.push({
          termin: t,
          startzeit: terminStartzeit,
          endzeit: `${Math.floor(tEndeMin/60).toString().padStart(2,'0')}:${(tEndeMin%60).toString().padStart(2,'0')}`
        });
      }
    }
    
    return ueberschneidungen;
  }

  // Prüft alle Termine eines Tages auf Überschneidungen und zeigt Vorschläge
  async pruefeUeberschneidungen() {
    const datum = document.getElementById('auslastungDatum').value;
    if (!datum) {
      alert('Bitte zuerst ein Datum auswählen!');
      return;
    }

    const modal = document.getElementById('ueberschneidungenModal');
    const body = document.getElementById('ueberschneidungenBody');
    const alleAnwendenBtn = document.getElementById('ueberschneidungenAlleAnwenden');
    
    modal.style.display = 'block';
    body.innerHTML = '<div class="loading">⏳ Prüfe Termine auf Überschneidungen...</div>';
    alleAnwendenBtn.style.display = 'none';

    try {
      // Lade Einstellungen für Nebenzeit
      const einstellungen = await EinstellungenService.getWerkstatt();
      const nebenzeitProzent = einstellungen?.nebenzeit_prozent || 0;

      // Lade alle Termine und Mitarbeiter
      const [termine, mitarbeiter, lehrlinge] = await Promise.all([
        TermineService.getAll(),
        MitarbeiterService.getAktive(),
        LehrlingeService.getAktive()
      ]);

      const tagesTermine = termine.filter(t => 
        t.datum === datum && 
        !t.ist_schwebend &&
        !t.geloescht_am  // Gelöschte Termine ausschließen
      );

      // Sammle alle Termin-IDs des Tages für Erweiterungssuche
      const tagesTerminIds = new Set(tagesTermine.map(t => t.id));
      
      // Finde Erweiterungen die zu Terminen dieses Tages gehören (auch wenn an anderem Tag)
      const erweiterungenVonHeute = termine.filter(t => 
        t.erweiterung_von_id && 
        tagesTerminIds.has(t.erweiterung_von_id) &&
        !t.geloescht_am &&
        !t.ist_schwebend
      );
      
      // Kombiniere Tages-Termine mit relevanten Erweiterungen
      const relevanteTermine = [...tagesTermine];
      for (const erw of erweiterungenVonHeute) {
        if (!tagesTerminIds.has(erw.id)) {
          relevanteTermine.push(erw);
        }
      }

      // Gruppiere Termine nach Mitarbeiter/Lehrling
      const termineMitZeit = [];
      
      for (const t of relevanteTermine) {
        let startzeit = null;
        let endzeit = null;
        let mitarbeiterId = t.mitarbeiter_id;
        let lehrlingId = null;
        let personTyp = 'mitarbeiter';
        let personId = mitarbeiterId;
        
        // NEUE SPALTEN: Primär startzeit und endzeit_berechnet aus dem Termin verwenden
        if (t.startzeit) {
          startzeit = t.startzeit;
        }
        if (t.endzeit_berechnet) {
          endzeit = t.endzeit_berechnet;
        }
        
        // Priorität: startzeit-Feld des Termins
        if (!startzeit && t.startzeit) {
          startzeit = t.startzeit;
        }
        
        // Fallback: bring_zeit als Startzeit
        if (!startzeit && t.bring_zeit) {
          startzeit = t.bring_zeit;
        }
        
        // Fallback: arbeitszeiten_details für ältere Termine
        if (t.arbeitszeiten_details) {
          try {
            const details = JSON.parse(t.arbeitszeiten_details);
            
            // Versuche _startzeit zu finden (falls nicht schon gesetzt)
            if (!startzeit && details._startzeit) {
              startzeit = details._startzeit;
            }
            
            // Falls keine startzeit, suche in den einzelnen Arbeiten
            if (!startzeit) {
              for (const [key, val] of Object.entries(details)) {
                if (key.startsWith('_')) continue;
                if (typeof val === 'object' && val.startzeit) {
                  startzeit = val.startzeit;
                  break;
                }
              }
            }
            
            // Mitarbeiter/Lehrling aus details
            if (details._gesamt_mitarbeiter_id) {
              personTyp = details._gesamt_mitarbeiter_id.type;
              personId = details._gesamt_mitarbeiter_id.id;
              if (personTyp === 'lehrling') {
                lehrlingId = personId;
                mitarbeiterId = null;
              }
            }
          } catch (e) {}
        }
        
        if (!startzeit || !personId) continue;
        
        // Startzeit in Minuten umrechnen
        const [startH, startM] = startzeit.split(':').map(Number);
        const startMin = startH * 60 + startM;
        
        // Endzeit berechnen
        let endeMin;
        if (endzeit) {
          // NEUE SPALTE: endzeit_berechnet direkt verwenden
          const [endeH, endeM] = endzeit.split(':').map(Number);
          endeMin = endeH * 60 + endeM;
        } else {
          // Fallback: aus geschätzter Zeit berechnen
          const dauer = t.geschaetzte_zeit || 60;
          const dauerMitNebenzeit = nebenzeitProzent > 0 
            ? Math.round(dauer * (1 + nebenzeitProzent / 100))
            : dauer;
          endeMin = startMin + dauerMitNebenzeit;
        }
        
        const dauer = endeMin - startMin;
        
        // Prüfe ob es eine Erweiterung ist
        const istErweiterung = t.ist_erweiterung === 1 || t.ist_erweiterung === true || t.erweiterung_von_id;
        
        termineMitZeit.push({
          termin: t,
          startzeit,
          endzeit: endzeit || `${Math.floor(endeMin/60).toString().padStart(2,'0')}:${(endeMin%60).toString().padStart(2,'0')}`,
          startMin,
          endeMin,
          dauer,
          personTyp,
          personId,
          personKey: `${personTyp}_${personId}`,
          istErweiterung,
          erweiterungVonId: t.erweiterung_von_id
        });
      }

      // Finde Überschneidungen pro Person
      const konflikte = [];
      const personenMap = new Map();
      
      for (const t of termineMitZeit) {
        if (!personenMap.has(t.personKey)) {
          personenMap.set(t.personKey, []);
        }
        personenMap.get(t.personKey).push(t);
      }

      // Für jede Person: Sortiere nach Startzeit und finde Konflikte
      for (const [personKey, personTermine] of personenMap) {
        // Sortiere nach Startzeit
        personTermine.sort((a, b) => a.startMin - b.startMin);
        
        for (let i = 0; i < personTermine.length; i++) {
          const current = personTermine[i];
          
          for (let j = i + 1; j < personTermine.length; j++) {
            const next = personTermine[j];
            
            // Überspringe wenn next eine Erweiterung von current ist (das ist gewollt!)
            if (next.erweiterungVonId === current.termin.id) {
              continue;
            }
            // Überspringe auch wenn current eine Erweiterung von next ist
            if (current.erweiterungVonId === next.termin.id) {
              continue;
            }
            
            // Überschneidung wenn current endet nach next startet
            if (current.endeMin > next.startMin) {
              // Berechne Vorschlag: Verschiebe next nach Ende von current
              const vorschlagStartMin = current.endeMin;
              const vorschlagStart = `${Math.floor(vorschlagStartMin/60).toString().padStart(2,'0')}:${(vorschlagStartMin%60).toString().padStart(2,'0')}`;
              
              // Prüfe ob Vorschlag im Rahmen (vor 18 Uhr) ist
              const vorschlagEndeMin = vorschlagStartMin + next.dauer;
              const istMachbar = vorschlagEndeMin <= 18 * 60;
              
              konflikte.push({
                termin1: current,
                termin2: next,
                vorschlagStart,
                vorschlagEndeMin,
                istMachbar,
                personKey
              });
            }
          }
        }
      }

      // Speichere Konflikte für "Alle anwenden"
      this.aktuelleKonflikte = konflikte;
      
      // === NEU: Prüfe Abholzeit-Konflikte (Fertigstellung nach Abholzeit) ===
      const abholzeitKonflikte = [];
      
      for (const t of termineMitZeit) {
        const termin = t.termin;
        
        // Hole Abholzeit aus dem Termin (DB-Feld: abholung_zeit)
        const abholzeit = termin.abholung_zeit;
        if (!abholzeit) continue;
        
        // Abholzeit in Minuten
        const [abholH, abholM] = abholzeit.split(':').map(Number);
        const abholMin = abholH * 60 + abholM;
        
        // Vergleiche mit berechneter Endzeit
        if (t.endeMin > abholMin) {
          abholzeitKonflikte.push({
            termin: termin,
            endzeit: t.endzeit,
            endeMin: t.endeMin,
            abholzeit: abholzeit,
            abholMin: abholMin,
            differenzMin: t.endeMin - abholMin
          });
        }
      }

      // Formatiere Datum für Anzeige
      const datumFormatiert = new Date(datum + 'T00:00:00').toLocaleDateString('de-DE', { 
        weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' 
      });

      // Render Ergebnis
      const hatProbleme = konflikte.length > 0 || abholzeitKonflikte.length > 0;
      
      if (!hatProbleme) {
        body.innerHTML = `
          <div style="text-align: center; padding: 30px;">
            <span style="font-size: 48px;">✅</span>
            <h4 style="color: #2e7d32; margin-top: 15px;">Keine Probleme gefunden!</h4>
            <p style="color: #666;">Alle Termine am ${datumFormatiert} sind zeitlich korrekt geplant.</p>
            <p style="color: #888; font-size: 0.9em; margin-top: 10px;">✓ Keine Überschneidungen &nbsp;•&nbsp; ✓ Abholterminzeiten werden eingehalten</p>
          </div>
        `;
      } else {
        // Hole Namen für Anzeige
        const mitarbeiterMap = new Map(mitarbeiter.map(m => [`mitarbeiter_${m.id}`, m.name]));
        const lehrlingeMap = new Map(lehrlinge.map(l => [`lehrling_${l.id}`, l.name]));
        const personenNamen = new Map([...mitarbeiterMap, ...lehrlingeMap]);

        let html = '';
        
        // === Abholzeit-Konflikte anzeigen ===
        if (abholzeitKonflikte.length > 0) {
          html += `
            <div style="background: #ffebee; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #d32f2f;">
              <strong>🚗 ${abholzeitKonflikte.length} Abholzeit-Konflikt(e)!</strong>
              <p style="margin: 5px 0 0 0; color: #666;">Diese Termine werden erst nach der geplanten Abholzeit fertig.</p>
            </div>
          `;
          
          abholzeitKonflikte.forEach((konflikt, index) => {
            const t = konflikt.termin;
            const differenzText = konflikt.differenzMin >= 60 
              ? `${Math.floor(konflikt.differenzMin/60)}h ${konflikt.differenzMin%60}min`
              : `${konflikt.differenzMin} min`;
            
            html += `
              <div class="konflikt-item" style="background: #fff8f8; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #ffcdd2;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                  <div>
                    <strong style="color: #d32f2f;">🚗 Abholzeit-Problem</strong>
                  </div>
                  <span style="background: #d32f2f; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em;">
                    ${differenzText} zu spät
                  </span>
                </div>
                
                <div style="background: white; padding: 10px; border-radius: 5px; border-left: 3px solid #d32f2f;">
                  <div style="font-weight: 600;">${t.termin_nr}</div>
                  <div style="font-size: 0.9em; color: #666;">${t.kunde_name || 'Unbekannt'}</div>
                  <div style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                      <span style="color: #666; font-size: 0.85em;">Fertigstellung:</span><br>
                      <span style="background: #ffcdd2; padding: 2px 6px; border-radius: 4px; font-weight: 600;">
                        ${konflikt.endzeit}
                      </span>
                    </div>
                    <div>
                      <span style="color: #666; font-size: 0.85em;">Abholzeit:</span><br>
                      <span style="background: #e8f5e9; padding: 2px 6px; border-radius: 4px; font-weight: 600;">
                        ${konflikt.abholzeit}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            `;
          });
        }
        
        // === Überschneidungs-Konflikte anzeigen ===
        if (konflikte.length > 0) {
          html += `
          <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ff9800;">
            <strong>⚠️ ${konflikte.length} Überschneidung(en) gefunden!</strong>
            <p style="margin: 5px 0 0 0; color: #666;">Klicken Sie auf "Anwenden" um den Vorschlag zu übernehmen.</p>
          </div>
        `;

          konflikte.forEach((konflikt, index) => {
            const personName = personenNamen.get(konflikt.personKey) || 'Unbekannt';
            const t1 = konflikt.termin1.termin;
            const t2 = konflikt.termin2.termin;
            
            const konfliktEnde1 = `${Math.floor(konflikt.termin1.endeMin/60).toString().padStart(2,'0')}:${(konflikt.termin1.endeMin%60).toString().padStart(2,'0')}`;
            const konfliktEnde2 = `${Math.floor(konflikt.termin2.endeMin/60).toString().padStart(2,'0')}:${(konflikt.termin2.endeMin%60).toString().padStart(2,'0')}`;
            
            // Erweiterungs-Badge
            const erw1Badge = konflikt.termin1.istErweiterung ? '<span style="background: #9c27b0; color: white; padding: 1px 5px; border-radius: 3px; font-size: 0.75em; margin-left: 5px;">Erw.</span>' : '';
            const erw2Badge = konflikt.termin2.istErweiterung ? '<span style="background: #9c27b0; color: white; padding: 1px 5px; border-radius: 3px; font-size: 0.75em; margin-left: 5px;">Erw.</span>' : '';
            
            // Datum-Info falls anderer Tag
            const datum1 = t1.datum !== datum ? `<div style="font-size: 0.8em; color: #9c27b0;">📅 ${new Date(t1.datum + 'T00:00:00').toLocaleDateString('de-DE')}</div>` : '';
            const datum2 = t2.datum !== datum ? `<div style="font-size: 0.8em; color: #9c27b0;">📅 ${new Date(t2.datum + 'T00:00:00').toLocaleDateString('de-DE')}</div>` : '';
            
            html += `
              <div class="konflikt-item" style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #ddd;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                  <div>
                    <strong style="color: #1976d2;">👷 ${personName}</strong>
                  </div>
                  <span style="background: #ff5722; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em;">
                    Konflikt ${index + 1}
                  </span>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                  <div style="background: white; padding: 10px; border-radius: 5px; border-left: 3px solid #2196f3;">
                    <div style="font-weight: 600;">${t1.termin_nr}${erw1Badge}</div>
                    <div style="font-size: 0.9em; color: #666;">${t1.kunde_name || 'Unbekannt'}</div>
                    ${datum1}
                    <div style="margin-top: 5px;">
                      <span style="background: #e3f2fd; padding: 2px 6px; border-radius: 4px; font-size: 0.85em;">
                        ${konflikt.termin1.startzeit} - ${konfliktEnde1}
                      </span>
                    </div>
                  </div>
                  <div style="background: white; padding: 10px; border-radius: 5px; border-left: 3px solid #ff9800;">
                    <div style="font-weight: 600;">${t2.termin_nr}${erw2Badge}</div>
                    <div style="font-size: 0.9em; color: #666;">${t2.kunde_name || 'Unbekannt'}</div>
                    ${datum2}
                    <div style="margin-top: 5px;">
                      <span style="background: #fff3e0; padding: 2px 6px; border-radius: 4px; font-size: 0.85em;">
                        ${konflikt.termin2.startzeit} - ${konfliktEnde2}
                      </span>
                      <span style="color: #d32f2f; font-size: 0.85em; margin-left: 5px;">⚠️ Überschneidung</span>
                    </div>
                  </div>
                </div>
                
                <div style="background: ${konflikt.istMachbar ? '#e8f5e9' : '#ffebee'}; padding: 10px; border-radius: 5px; display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <strong>💡 Vorschlag:</strong> ${t2.termin_nr} verschieben auf 
                    <span style="font-weight: 600; color: ${konflikt.istMachbar ? '#2e7d32' : '#d32f2f'};">
                      ${konflikt.vorschlagStart}
                    </span>
                    ${!konflikt.istMachbar ? '<span style="color: #d32f2f; font-size: 0.85em;"> (endet nach 18:00!)</span>' : ''}
                  </div>
                  <button class="btn ${konflikt.istMachbar ? 'btn-primary' : 'btn-secondary'}" 
                          onclick="app.wendeVorschlagAn(${index})"
                          ${!konflikt.istMachbar ? 'title="Endet nach 18 Uhr - trotzdem anwendbar"' : ''}>
                    ${konflikt.istMachbar ? '✅ Anwenden' : '⚠️ Anwenden'}
                  </button>
                </div>
              </div>
            `;
          });
        }

        body.innerHTML = html;
        alleAnwendenBtn.style.display = konflikte.some(k => k.istMachbar) ? 'block' : 'none';
      }

    } catch (error) {
      console.error('Fehler bei Überschneidungsprüfung:', error);
      body.innerHTML = `
        <div style="text-align: center; padding: 30px; color: #d32f2f;">
          <span style="font-size: 48px;">❌</span>
          <h4>Fehler bei der Prüfung</h4>
          <p>${error.message || 'Unbekannter Fehler'}</p>
        </div>
      `;
    }
  }

  // Wendet einen einzelnen Verschiebungsvorschlag an
  async wendeVorschlagAn(index) {
    const konflikt = this.aktuelleKonflikte[index];
    if (!konflikt) return;

    const termin = konflikt.termin2.termin;
    
    try {
      // Lade aktuelle Details
      let details = {};
      if (termin.arbeitszeiten_details) {
        try {
          details = JSON.parse(termin.arbeitszeiten_details);
        } catch (e) {}
      }
      
      // Setze neue Startzeit (sowohl _startzeit als auch in allen Arbeiten)
      details._startzeit = konflikt.vorschlagStart;
      
      // Aktualisiere auch die Startzeit in den einzelnen Arbeiten
      for (const [key, val] of Object.entries(details)) {
        if (key.startsWith('_')) continue; // Überspringe Meta-Felder
        if (typeof val === 'object' && val.startzeit !== undefined) {
          val.startzeit = konflikt.vorschlagStart;
        }
      }
      
      // Speichern
      await TermineService.update(termin.id, {
        arbeitszeiten_details: JSON.stringify(details)
      });
      
      alert(`✅ ${termin.termin_nr} wurde auf ${konflikt.vorschlagStart} verschoben!`);
      
      // Modal schließen und neu laden
      document.getElementById('ueberschneidungenModal').style.display = 'none';
      this.loadAuslastung();
      this.loadZeitleiste(document.getElementById('auslastungDatum').value);
      
    } catch (error) {
      console.error('Fehler beim Anwenden des Vorschlags:', error);
      alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  // Wendet alle machbaren Vorschläge an
  async wendeAlleVorschlaegeAn() {
    if (!this.aktuelleKonflikte || this.aktuelleKonflikte.length === 0) return;
    
    const machbareKonflikte = this.aktuelleKonflikte.filter(k => k.istMachbar);
    if (machbareKonflikte.length === 0) {
      alert('Keine anwendbaren Vorschläge vorhanden.');
      return;
    }

    if (!confirm(`${machbareKonflikte.length} Verschiebung(en) anwenden?`)) return;

    try {
      let erfolge = 0;
      
      for (const konflikt of machbareKonflikte) {
        const termin = konflikt.termin2.termin;
        
        let details = {};
        if (termin.arbeitszeiten_details) {
          try {
            details = JSON.parse(termin.arbeitszeiten_details);
          } catch (e) {}
        }
        
        // Setze neue Startzeit (sowohl _startzeit als auch in allen Arbeiten)
        details._startzeit = konflikt.vorschlagStart;
        
        // Aktualisiere auch die Startzeit in den einzelnen Arbeiten
        for (const [key, val] of Object.entries(details)) {
          if (key.startsWith('_')) continue;
          if (typeof val === 'object' && val.startzeit !== undefined) {
            val.startzeit = konflikt.vorschlagStart;
          }
        }
        
        await TermineService.update(termin.id, {
          arbeitszeiten_details: JSON.stringify(details)
        });
        
        erfolge++;
      }
      
      alert(`✅ ${erfolge} Termin(e) erfolgreich verschoben!`);
      
      // Modal schließen und neu laden
      document.getElementById('ueberschneidungenModal').style.display = 'none';
      this.loadAuslastung();
      this.loadZeitleiste(document.getElementById('auslastungDatum').value);
      
    } catch (error) {
      console.error('Fehler beim Anwenden aller Vorschläge:', error);
      alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  async confirmEinplanenDatum() {
    const datumInput = document.getElementById('einplanenDatum');
    const uhrzeitInput = document.getElementById('einplanenUhrzeit');
    const bringzeitInput = document.getElementById('einplanenBringzeit');
    const neuesDatum = datumInput.value;
    const neueUhrzeit = uhrzeitInput ? uhrzeitInput.value : null;
    const neueBringzeit = bringzeitInput ? (bringzeitInput.value || null) : null;
    
    if (!neuesDatum) {
      alert('Bitte ein Datum wählen!');
      return;
    }
    
    if (!this.einplanenTerminId) {
      alert('Fehler: Kein Termin ausgewählt');
      return;
    }
    
    const termin = this.termineById[this.einplanenTerminId];
    if (!termin) {
      alert('Fehler: Termin nicht gefunden');
      return;
    }
    
    // Überschneidungsprüfung wenn Mitarbeiter zugeordnet und Uhrzeit angegeben
    if (neueUhrzeit && termin.mitarbeiter_id) {
      let mitarbeiterId = termin.mitarbeiter_id;
      let lehrlingId = null;
      
      // Prüfe auch ob Lehrling zugeordnet ist
      if (termin.arbeitszeiten_details) {
        try {
          const details = JSON.parse(termin.arbeitszeiten_details);
          if (details._gesamt_mitarbeiter_id?.type === 'lehrling') {
            lehrlingId = details._gesamt_mitarbeiter_id.id;
            mitarbeiterId = null;
          }
        } catch (e) {}
      }
      
      const ueberschneidungen = await this.checkTerminUeberschneidungen(
        neuesDatum, 
        neueUhrzeit, 
        this.einplanenGesamtzeit || termin.geschaetzte_zeit || 60,
        mitarbeiterId,
        lehrlingId,
        this.einplanenTerminId
      );
      
      if (ueberschneidungen.length > 0) {
        const konfliktListe = ueberschneidungen.map(u => 
          `• ${u.termin.termin_nr}: ${u.startzeit} - ${u.endzeit} (${u.termin.kunde_name || 'Unbekannt'})`
        ).join('\n');
        
        const fortfahren = confirm(
          `⚠️ TERMINÜBERSCHNEIDUNG!\n\n` +
          `Der Termin überschneidet sich mit:\n${konfliktListe}\n\n` +
          `Trotzdem fortfahren?`
        );
        
        if (!fortfahren) return;
      }
    }
    
    try {
      // Update-Daten vorbereiten
      const updateData = { datum: neuesDatum };
      
      // Bringzeit übernehmen (falls angegeben)
      if (neueBringzeit !== null) {
        updateData.bring_zeit = neueBringzeit;
      }
      
      // Arbeiten aus der Liste übernehmen (komplett ersetzen)
      let details = {};
      
      // Arbeiten-Text und Details aus der Liste erstellen
      if (this.einplanenArbeiten && this.einplanenArbeiten.length > 0) {
        const arbeitenBezeichnungen = this.einplanenArbeiten.map(a => a.bezeichnung);
        updateData.arbeit = arbeitenBezeichnungen.join('\n');
        
        // Arbeitszeit-Details für jede Arbeit speichern
        this.einplanenArbeiten.forEach(arbeit => {
          details[arbeit.bezeichnung] = { zeit: arbeit.zeit };
        });
        
        // Gesamtzeit aktualisieren
        updateData.geschaetzte_zeit = this.einplanenGesamtzeit;
      }
      // Wenn keine Arbeiten in der Liste, aber welche existierten, die bestehenden behalten
      // (Nur das Datum wird aktualisiert)
      
      // Wenn Uhrzeit angegeben, in arbeitszeiten_details speichern
      if (neueUhrzeit) {
        // Setze Startzeit für die erste Arbeit oder als Gesamt-Startzeit
        if (this.einplanenArbeiten && this.einplanenArbeiten.length > 0) {
          const ersteArbeit = this.einplanenArbeiten[0].bezeichnung;
          if (!details[ersteArbeit]) {
            details[ersteArbeit] = {};
          }
          details[ersteArbeit].startzeit = neueUhrzeit;
        }
        details._startzeit = neueUhrzeit;
      }
      
      // Automatisch Status auf "geplant" setzen wenn Datum und Zeit vergeben
      if (neueUhrzeit && termin.mitarbeiter_id) {
        updateData.status = 'geplant';
      }
      
      // Details speichern
      updateData.arbeitszeiten_details = JSON.stringify(details);
      
      // Datum und Arbeiten aktualisieren
      await TermineService.update(this.einplanenTerminId, updateData);
      
      // Dann Schwebend-Status aufheben
      await TermineService.setSchwebend(this.einplanenTerminId, false);
      
      // Lokalen Cache aktualisieren
      termin.datum = neuesDatum;
      termin.ist_schwebend = 0;
      termin.arbeit = updateData.arbeit;
      termin.geschaetzte_zeit = updateData.geschaetzte_zeit;
      termin.arbeitszeiten_details = updateData.arbeitszeiten_details;
      if (updateData.bring_zeit !== undefined) {
        termin.bring_zeit = updateData.bring_zeit;
      }
      
      // Button-Text aktualisieren
      this.updateSchwebendButton(false);
      
      // Modal schließen
      this.closeEinplanenDatumModal();
      
      const uhrzeitText = neueUhrzeit ? ` um ${neueUhrzeit} Uhr` : '';
      const arbeitenText = (this.einplanenArbeiten && this.einplanenArbeiten.length > 0) 
        ? `\n${this.einplanenArbeiten.length} Arbeit(en) hinzugefügt.` 
        : '';
      alert(`Termin wurde für ${neuesDatum}${uhrzeitText} eingeplant!${arbeitenText}`);
      
      // Daten neu laden
      this.loadTermine();
      this.loadAuslastung();
      
      // Wenn von Wartende Aktionen aufgerufen, auch diese Liste aktualisieren
      if (this.einplanenFromWartendeAktionen) {
        this.loadWartendeAktionen();
        this.einplanenFromWartendeAktionen = false;
      }
      
      // Details-Modal aktualisieren
      if (this.currentDetailTerminId === this.einplanenTerminId) {
        this.showTerminDetails(this.einplanenTerminId);
      }
    } catch (error) {
      console.error('Fehler beim Einplanen:', error);
      alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  // Split-Modal öffnen
  openSplitModal() {
    if (!this.currentDetailTerminId) return;
    
    const termin = this.termineById[this.currentDetailTerminId];
    if (!termin) return;

    const gesamtzeit = termin.geschaetzte_zeit || 60;
    
    // Info-Box befüllen
    document.getElementById('splitTerminInfo').innerHTML = `
      <strong>${termin.termin_nr || '-'}</strong> - ${termin.kunde_name || '-'}<br>
      <span style="color: #666;">${termin.arbeit || '-'}</span>
    `;
    document.getElementById('splitGesamtzeit').textContent = `${gesamtzeit} Min. (${this.formatMinutesToHours(gesamtzeit)})`;
    
    // Standard-Werte setzen (50/50 Split)
    const teil1Zeit = Math.round(gesamtzeit / 2);
    document.getElementById('splitTeil1Zeit').value = teil1Zeit;
    document.getElementById('splitTeil1Zeit').max = gesamtzeit - 1;
    document.getElementById('splitTeil1Range').max = gesamtzeit;
    document.getElementById('splitTeil1Range').value = teil1Zeit;
    
    // Teil 2 Zeit berechnen
    document.getElementById('splitTeil2Zeit').value = gesamtzeit - teil1Zeit;
    
    // Morgen als Standard-Datum für Teil 2
    const morgen = new Date();
    morgen.setDate(morgen.getDate() + 1);
    // Sonntag überspringen
    if (morgen.getDay() === 0) {
      morgen.setDate(morgen.getDate() + 1);
    }
    document.getElementById('splitTeil2Datum').value = this.formatDateLocal(morgen);
    document.getElementById('splitTeil2Datum').min = this.formatDateLocal(new Date());
    
    // Speichere Gesamtzeit für Range-Updates
    this.splitGesamtzeit = gesamtzeit;
    
    // Preview aktualisieren
    this.updateSplitPreview();
    
    // Split-Modal anzeigen
    document.getElementById('terminSplitModal').style.display = 'block';
    
    // Event-Listener für Teil1-Input
    document.getElementById('splitTeil1Zeit').oninput = () => this.updateSplitFromInput();
  }

  updateSplitPreview() {
    const gesamtzeit = this.splitGesamtzeit || 60;
    const range = document.getElementById('splitTeil1Range');
    const teil1Zeit = parseInt(range.value) || 0;
    const teil2Zeit = gesamtzeit - teil1Zeit;
    
    document.getElementById('splitTeil1Zeit').value = teil1Zeit;
    document.getElementById('splitTeil2Zeit').value = teil2Zeit;
    
    document.getElementById('splitPreviewTeil1').textContent = `${teil1Zeit} Min. (${this.formatMinutesToHours(teil1Zeit)})`;
    document.getElementById('splitPreviewTeil2').textContent = `${teil2Zeit} Min. (${this.formatMinutesToHours(teil2Zeit)})`;
  }

  updateSplitFromInput() {
    const gesamtzeit = this.splitGesamtzeit || 60;
    let teil1Zeit = parseInt(document.getElementById('splitTeil1Zeit').value) || 0;
    
    // Begrenzen auf gültigen Bereich
    if (teil1Zeit < 1) teil1Zeit = 1;
    if (teil1Zeit >= gesamtzeit) teil1Zeit = gesamtzeit - 1;
    
    const teil2Zeit = gesamtzeit - teil1Zeit;
    
    document.getElementById('splitTeil1Range').value = teil1Zeit;
    document.getElementById('splitTeil2Zeit').value = teil2Zeit;
    
    document.getElementById('splitPreviewTeil1').textContent = `${teil1Zeit} Min. (${this.formatMinutesToHours(teil1Zeit)})`;
    document.getElementById('splitPreviewTeil2').textContent = `${teil2Zeit} Min. (${this.formatMinutesToHours(teil2Zeit)})`;
  }

  closeSplitModal() {
    document.getElementById('terminSplitModal').style.display = 'none';
  }

  async executeSplit() {
    if (!this.currentDetailTerminId) return;
    
    const teil1Zeit = parseInt(document.getElementById('splitTeil1Zeit').value);
    const teil2Datum = document.getElementById('splitTeil2Datum').value;
    const teil2Zeit = parseInt(document.getElementById('splitTeil2Zeit').value);
    
    // Validierung
    if (!teil1Zeit || teil1Zeit <= 0) {
      alert('Bitte geben Sie eine gültige Zeit für Teil 1 an.');
      return;
    }
    if (!teil2Datum) {
      alert('Bitte wählen Sie ein Datum für Teil 2.');
      return;
    }
    if (!teil2Zeit || teil2Zeit <= 0) {
      alert('Teil 2 muss mindestens 1 Minute haben.');
      return;
    }
    
    if (!confirm(`Termin aufteilen?\n\nTeil 1: ${teil1Zeit} Min.\nTeil 2: ${teil2Zeit} Min. am ${teil2Datum}`)) {
      return;
    }
    
    try {
      const result = await TermineService.splitTermin(
        this.currentDetailTerminId, 
        teil1Zeit, 
        teil2Datum, 
        teil2Zeit
      );
      
      alert(`Termin erfolgreich aufgeteilt!\n\nTeil 1: ${result.teil1.zeit} Min.\nTeil 2: ${result.teil2.termin_nr} am ${result.teil2.datum} (${result.teil2.zeit} Min.)`);
      
      this.closeSplitModal();
      this.closeTerminDetails();
      this.loadTermine();
      this.loadAuslastung();
    } catch (error) {
      console.error('Fehler beim Aufteilen des Termins:', error);
      alert('Fehler beim Aufteilen: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  // ============================================
  // AUFTRAGSERWEITERUNG FUNKTIONEN
  // ============================================

  /**
   * Öffnet das Erweiterungs-Modal für einen bestimmten Termin (aus Schnell-Status-Dialog)
   */
  async openErweiterungModalForTermin(terminId) {
    // Setze currentDetailTerminId und rufe dann openErweiterungModal auf
    this.currentDetailTerminId = terminId;
    
    // Stelle sicher, dass der Termin im Cache ist
    if (!this.termineById[terminId]) {
      try {
        const termin = await TermineService.getById(terminId);
        if (termin) {
          this.termineById[terminId] = termin;
        }
      } catch (error) {
        console.error('Fehler beim Laden des Termins:', error);
        this.showToast('❌ Termin konnte nicht geladen werden', 'error');
        return;
      }
    }
    
    // Öffne das normale Erweiterungs-Modal
    await this.openErweiterungModal();
  }

  /**
   * Öffnet das Erweiterungs-Modal für den aktuellen Termin
   */
  async openErweiterungModal() {
    console.log('openErweiterungModal aufgerufen');
    console.log('currentDetailTerminId:', this.currentDetailTerminId);
    
    if (!this.currentDetailTerminId) {
      alert('Kein Termin ausgewählt.');
      return;
    }

    const termin = this.termineById[this.currentDetailTerminId];
    console.log('Termin gefunden:', termin);
    
    if (!termin) {
      alert('Termin nicht gefunden.');
      return;
    }

    // Speichere Termin-Daten für spätere Verwendung
    this.erweiterungTermin = termin;
    this.erweiterungKonflikte = null;

    // Fülle Original-Termin-Info
    const detailsEl = document.getElementById('erweiterungTerminDetails');
    const endzeitBerechnet = this.berechneEndzeit(termin.bring_zeit, termin.geschaetzte_zeit);
    
    detailsEl.innerHTML = `
      <span><strong>Nr:</strong> ${termin.termin_nr || '-'}</span>
      <span><strong>Kunde:</strong> ${termin.kunde_name || '-'}</span>
      <span><strong>Kennzeichen:</strong> ${termin.kennzeichen || '-'}</span>
      <span><strong>Datum:</strong> ${this.formatDateGerman(termin.datum)}</span>
      <span><strong>Zeit:</strong> ${termin.bring_zeit || '08:00'} - ${endzeitBerechnet}</span>
      <span><strong>Dauer:</strong> ${termin.geschaetzte_zeit || 0} Min</span>
    `;
    
    // Lade und zeige bestehende Erweiterungen
    await this.ladeBestehendeErweiterungen(termin.id);

    // Berechne "Morgen"-Datum (nächster Arbeitstag)
    const morgenDatum = this.naechsterArbeitstag(termin.datum);
    document.getElementById('morgenDatumAnzeige').textContent = this.formatDateGerman(morgenDatum);

    // Setze Mindestdatum für Datumswahl
    document.getElementById('erweiterungDatum').min = termin.datum;
    document.getElementById('erweiterungDatum').value = morgenDatum;

    // Reset Formular
    document.getElementById('erweiterungNeueArbeit').value = '';
    document.getElementById('erweiterungArbeitszeit').value = '0.5';
    document.getElementById('erweiterungTeileStatus').value = 'vorraetig';
    document.getElementById('typAnschluss').checked = true;
    document.getElementById('erweiterungDatumAuswahl').style.display = 'none';
    document.getElementById('erweiterungKonflikte').style.display = 'none';
    document.getElementById('erweiterungVorschlaege').style.display = 'none';

    // Initiale Vorschau aktualisieren
    this.updateErweiterungVorschau();

    // Modal anzeigen
    document.getElementById('erweiterungModal').style.display = 'block';

    // Prüfe Konflikte für "Im Anschluss"
    this.pruefeErweiterungsKonflikte();
  }

  /**
   * Schließt das Erweiterungs-Modal
   */
  closeErweiterungModal() {
    document.getElementById('erweiterungModal').style.display = 'none';
    this.erweiterungTermin = null;
    this.erweiterungKonflikte = null;
  }

  /**
   * Lädt und zeigt bestehende Erweiterungen für einen Termin
   */
  async ladeBestehendeErweiterungen(terminId) {
    const bestehendeBox = document.getElementById('erweiterungBestehendeBox');
    const bestehendeListe = document.getElementById('erweiterungBestehendeListe');
    
    if (!bestehendeBox || !bestehendeListe) return;
    
    // Sammle Erweiterungen aus dem Cache
    const erweiterungen = [];
    Object.values(this.termineById).forEach(t => {
      if (t.erweiterung_von_id === terminId && !t.ist_geloescht && t.geloescht_am === null) {
        erweiterungen.push(t);
      }
    });
    
    // Falls nicht im Cache, lade von der API
    if (erweiterungen.length === 0) {
      try {
        const apiErweiterungen = await TermineService.getErweiterungen(terminId);
        if (apiErweiterungen && apiErweiterungen.length > 0) {
          erweiterungen.push(...apiErweiterungen);
        }
      } catch (e) {
        console.warn('Fehler beim Laden der Erweiterungen:', e);
      }
    }
    
    if (erweiterungen.length === 0) {
      bestehendeBox.style.display = 'none';
      return;
    }
    
    // Sortiere nach Datum
    erweiterungen.sort((a, b) => {
      const datumA = a.datum || '';
      const datumB = b.datum || '';
      return datumA.localeCompare(datumB);
    });
    
    // Baue HTML für bestehende Erweiterungen
    let html = `<div class="erweiterung-bestehende-liste">`;
    
    erweiterungen.forEach(erw => {
      const dauerText = erw.geschaetzte_zeit ? `${erw.geschaetzte_zeit} Min` : '-';
      const zeitText = erw.bring_zeit ? erw.bring_zeit : '-';
      const statusClass = erw.status ? erw.status.toLowerCase().replace(' ', '-') : 'geplant';
      const statusIcon = this.getStatusIcon(erw.status);
      
      html += `
        <div class="erweiterung-bestehende-item" onclick="app.showTerminDetails(${erw.id}); app.closeErweiterungModal();">
          <div class="erweiterung-bestehende-header">
            <span class="erweiterung-bestehende-nr">${erw.termin_nr || '#' + erw.id}</span>
            <span class="erweiterung-bestehende-status status-badge-${statusClass}">${statusIcon} ${erw.status || 'geplant'}</span>
          </div>
          <div class="erweiterung-bestehende-details">
            <span>📅 ${this.formatDateGerman(erw.datum)}</span>
            <span>⏰ ${zeitText}</span>
            <span>⏱️ ${dauerText}</span>
          </div>
          <div class="erweiterung-bestehende-arbeit">${this.escapeHtml(erw.arbeit || '-')}</div>
        </div>
      `;
    });
    
    html += `</div>`;
    html += `<div class="erweiterung-bestehende-info">ℹ️ Klicken Sie auf eine Erweiterung, um Details anzuzeigen</div>`;
    
    bestehendeListe.innerHTML = html;
    bestehendeBox.style.display = 'block';
  }
  
  /**
   * Hilfsfunktion: Status-Icon zurückgeben
   */
  getStatusIcon(status) {
    const icons = {
      'geplant': '📋',
      'in_arbeit': '🔧',
      'in arbeit': '🔧',
      'wartend': '⏸️',
      'abgeschlossen': '✅',
      'storniert': '❌'
    };
    return icons[(status || '').toLowerCase()] || '📋';
  }

  /**
   * Zeitleisten-Kontextmenü: Auftrag erweitern
   */
  zeitleisteKontextErweitern() {
    this.closeZeitleisteKontextmenu();
    if (this.zeitleisteKontextTerminId) {
      this.currentDetailTerminId = this.zeitleisteKontextTerminId;
      // Stelle sicher dass der Termin im Cache ist
      if (!this.termineById[this.zeitleisteKontextTerminId]) {
        // Lade den Termin
        TermineService.getById(this.zeitleisteKontextTerminId).then(termin => {
          if (termin) {
            this.termineById[termin.id] = termin;
            this.openErweiterungModal();
          }
        });
      } else {
        this.openErweiterungModal();
      }
    }
  }

  /**
   * Wird aufgerufen wenn der Erweiterungstyp geändert wird
   */
  updateErweiterungTyp() {
    const typ = document.querySelector('input[name="erweiterungTyp"]:checked').value;
    const datumAuswahl = document.getElementById('erweiterungDatumAuswahl');
    const konflikteSection = document.getElementById('erweiterungKonflikte');
    
    if (typ === 'datum') {
      datumAuswahl.style.display = 'block';
      konflikteSection.style.display = 'none';
    } else {
      datumAuswahl.style.display = 'none';
      
      if (typ === 'anschluss') {
        this.pruefeErweiterungsKonflikte();
      } else {
        konflikteSection.style.display = 'none';
      }
    }
    
    this.updateErweiterungVorschau();
    this.ladeSmartVorschlaege();
  }

  /**
   * Prüft auf Konflikte bei "Im Anschluss" Option
   */
  async pruefeErweiterungsKonflikte() {
    if (!this.erweiterungTermin) return;
    
    const arbeitszeitStunden = parseFloat(document.getElementById('erweiterungArbeitszeit').value) || 0.5;
    const arbeitszeit = Math.round(arbeitszeitStunden * 60); // In Minuten umrechnen
    const konflikteSection = document.getElementById('erweiterungKonflikte');
    const konfliktDetails = document.getElementById('konfliktDetails');
    
    try {
      const konflikte = await TermineService.pruefeErweiterungsKonflikte(
        this.erweiterungTermin.id, 
        arbeitszeit
      );
      
      this.erweiterungKonflikte = konflikte;
      
      if (konflikte.hat_konflikte || konflikte.folgetermine_zum_verschieben.length > 0) {
        // Es gibt Konflikte oder zu verschiebende Termine
        let detailsHtml = `
          <p><strong>Neue Endzeit:</strong> ${konflikte.neue_endzeit} (aktuell: ${konflikte.aktuelle_endzeit})</p>
        `;
        
        if (konflikte.folgetermine_zum_verschieben.length > 0) {
          detailsHtml += `
            <p style="margin-top: 10px;"><strong>Folgende Termine werden verschoben:</strong></p>
            <ul style="margin: 5px 0; padding-left: 20px;">
          `;
          konflikte.folgetermine_zum_verschieben.forEach(t => {
            detailsHtml += `<li>${t.termin_nr || '#' + t.id} - ${t.kunde_name || 'Kunde'} (${t.bring_zeit})</li>`;
          });
          detailsHtml += '</ul>';
        }
        
        konfliktDetails.innerHTML = detailsHtml;
        konflikteSection.style.display = 'block';
        
        // Lade verfügbare Mitarbeiter
        this.ladeVerfuegbareMitarbeiter();
      } else {
        konflikteSection.style.display = 'none';
      }
    } catch (error) {
      console.error('Fehler beim Prüfen der Konflikte:', error);
      konflikteSection.style.display = 'none';
    }
  }

  /**
   * Wird aufgerufen wenn die Konfliktlösung geändert wird
   */
  updateKonfliktLoesung() {
    const loesung = document.querySelector('input[name="konfliktLoesung"]:checked').value;
    const verfuegbareSection = document.getElementById('verfuegbareMitarbeiter');
    
    if (loesung === 'anderer') {
      verfuegbareSection.style.display = 'block';
      this.ladeVerfuegbareMitarbeiter();
    } else {
      verfuegbareSection.style.display = 'none';
    }
    
    this.updateErweiterungVorschau();
  }

  /**
   * Lädt verfügbare Mitarbeiter für den Zeitraum
   */
  async ladeVerfuegbareMitarbeiter() {
    if (!this.erweiterungTermin) return;
    
    const arbeitszeitStunden = parseFloat(document.getElementById('erweiterungArbeitszeit').value) || 0.5;
    const arbeitszeit = Math.round(arbeitszeitStunden * 60); // In Minuten umrechnen
    const endzeit = this.berechneEndzeit(this.erweiterungTermin.bring_zeit, this.erweiterungTermin.geschaetzte_zeit);
    
    const select = document.getElementById('erweiterungMitarbeiterSelect');
    const infoEl = document.getElementById('verfuegbarkeitInfo');
    
    select.innerHTML = '<option value="">Wird geladen...</option>';
    
    try {
      const verfuegbare = await TermineService.findeVerfuegbareMitarbeiter(
        this.erweiterungTermin.datum,
        endzeit,
        arbeitszeit
      );
      
      if (verfuegbare.length === 0) {
        select.innerHTML = '<option value="">Keine Mitarbeiter verfügbar</option>';
        infoEl.innerHTML = '⚠️ Kein Mitarbeiter hat ausreichend freie Kapazität.';
        infoEl.className = 'verfuegbarkeit-info nicht-verfuegbar';
      } else {
        select.innerHTML = verfuegbare.map(ma => {
          const status = ma.ist_sofort_verfuegbar ? '✅' : '⏰';
          const zeitInfo = ma.ist_sofort_verfuegbar 
            ? 'sofort verfügbar' 
            : `ab ${ma.naechster_freier_slot}`;
          return `<option value="${ma.id}" data-sofort="${ma.ist_sofort_verfuegbar}" data-slot="${ma.naechster_freier_slot}">
            ${status} ${ma.name} (${zeitInfo}, ${ma.restkapazitaet_minuten} Min frei)
          </option>`;
        }).join('');
        
        const erster = verfuegbare[0];
        if (erster.ist_sofort_verfuegbar) {
          infoEl.innerHTML = `✅ ${erster.name} kann die Arbeit direkt im Anschluss übernehmen.`;
          infoEl.className = 'verfuegbarkeit-info';
        } else {
          infoEl.innerHTML = `⏰ ${erster.name} hat den nächsten freien Slot um ${erster.naechster_freier_slot}.`;
          infoEl.className = 'verfuegbarkeit-info nicht-verfuegbar';
        }
      }
    } catch (error) {
      console.error('Fehler beim Laden der verfügbaren Mitarbeiter:', error);
      select.innerHTML = '<option value="">Fehler beim Laden</option>';
    }
  }

  /**
   * Lädt Smart-Vorschläge für die Erweiterung
   */
  async ladeSmartVorschlaege() {
    if (!this.erweiterungTermin) return;
    
    const vorschlaegeSection = document.getElementById('erweiterungVorschlaege');
    const vorschlaegeContent = document.getElementById('vorschlaegeContent');
    const typ = document.querySelector('input[name="erweiterungTyp"]:checked').value;
    const arbeitszeitStunden = parseFloat(document.getElementById('erweiterungArbeitszeit').value) || 0.5;
    const arbeitszeit = Math.round(arbeitszeitStunden * 60); // In Minuten umrechnen
    
    try {
      // Lade verfügbare Mitarbeiter für verschiedene Szenarien
      const endzeit = this.berechneEndzeit(this.erweiterungTermin.bring_zeit, this.erweiterungTermin.geschaetzte_zeit);
      const morgenDatum = this.naechsterArbeitstag(this.erweiterungTermin.datum);
      
      const [verfuegbareHeute, verfuegbareMorgen] = await Promise.all([
        TermineService.findeVerfuegbareMitarbeiter(this.erweiterungTermin.datum, endzeit, arbeitszeit),
        TermineService.findeVerfuegbareMitarbeiter(morgenDatum, '08:00', arbeitszeit)
      ]);
      
      let vorschlaege = [];
      
      // Vorschlag 1: Sofort verfügbarer anderer MA heute
      const sofortVerfuegbar = verfuegbareHeute.find(ma => 
        ma.ist_sofort_verfuegbar && ma.id !== this.erweiterungTermin.mitarbeiter_id
      );
      if (sofortVerfuegbar && typ === 'anschluss') {
        vorschlaege.push({
          text: `${sofortVerfuegbar.name} kann heute ab ${endzeit} übernehmen`,
          action: 'Auswählen →',
          onClick: () => {
            document.getElementById('loesungAndererMA').checked = true;
            this.updateKonfliktLoesung();
            document.getElementById('erweiterungMitarbeiterSelect').value = sofortVerfuegbar.id;
          }
        });
      }
      
      // Vorschlag 2: Morgen früh beim gleichen MA
      const gleicheMaMorgen = verfuegbareMorgen.find(ma => ma.id === this.erweiterungTermin.mitarbeiter_id);
      if (gleicheMaMorgen && typ !== 'morgen') {
        vorschlaege.push({
          text: `Morgen früh bei ${gleicheMaMorgen.name} (${gleicheMaMorgen.restkapazitaet_minuten} Min frei)`,
          action: 'Morgen wählen →',
          onClick: () => {
            document.getElementById('typMorgen').checked = true;
            this.updateErweiterungTyp();
          }
        });
      }
      
      if (vorschlaege.length > 0) {
        vorschlaegeContent.innerHTML = vorschlaege.map((v, i) => `
          <div class="vorschlag-item" onclick="app.erweiterungVorschlagAusfuehren(${i})">
            <span class="vorschlag-text">${v.text}</span>
            <span class="vorschlag-action">${v.action}</span>
          </div>
        `).join('');
        
        // Speichere onClick-Handler
        this.erweiterungVorschlaege = vorschlaege;
        vorschlaegeSection.style.display = 'block';
      } else {
        vorschlaegeSection.style.display = 'none';
      }
    } catch (error) {
      console.error('Fehler beim Laden der Vorschläge:', error);
      vorschlaegeSection.style.display = 'none';
    }
  }

  erweiterungVorschlagAusfuehren(index) {
    if (this.erweiterungVorschlaege && this.erweiterungVorschlaege[index]) {
      this.erweiterungVorschlaege[index].onClick();
    }
  }

  /**
   * Aktualisiert die Vorschau
   */
  updateErweiterungVorschau() {
    const arbeitszeitStunden = parseFloat(document.getElementById('erweiterungArbeitszeit').value) || 0;
    const typ = document.querySelector('input[name="erweiterungTyp"]:checked')?.value || 'anschluss';
    
    // Bug 1 Fix: Eindeutige IDs für Erweiterungs-Vorschau verwenden
    document.getElementById('erweiterungVorschauArbeitszeit').textContent = `${arbeitszeitStunden} h`;
    
    let datumText = '--';
    let mitarbeiterText = '--';
    
    if (this.erweiterungTermin) {
      if (typ === 'anschluss') {
        datumText = this.formatDateGerman(this.erweiterungTermin.datum) + ' (Anschluss)';
        
        const konfliktLoesung = document.querySelector('input[name="konfliktLoesung"]:checked')?.value;
        if (konfliktLoesung === 'anderer') {
          const select = document.getElementById('erweiterungMitarbeiterSelect');
          const selectedOption = select.options[select.selectedIndex];
          mitarbeiterText = selectedOption?.text?.split('(')[0]?.trim() || 'Anderer MA';
        } else {
          mitarbeiterText = this.erweiterungTermin.mitarbeiter_name || 'Gleicher MA';
        }
      } else if (typ === 'morgen') {
        const morgenDatum = this.naechsterArbeitstag(this.erweiterungTermin.datum);
        datumText = this.formatDateGerman(morgenDatum);
        mitarbeiterText = this.erweiterungTermin.mitarbeiter_name || 'Gleicher MA';
      } else if (typ === 'datum') {
        const datum = document.getElementById('erweiterungDatum').value;
        datumText = datum ? this.formatDateGerman(datum) : '--';
        mitarbeiterText = this.erweiterungTermin.mitarbeiter_name || 'Gleicher MA';
      }
    }
    
    // Bug 1 Fix: Eindeutige IDs für Erweiterungs-Vorschau verwenden
    document.getElementById('erweiterungVorschauDatum').textContent = datumText;
    document.getElementById('erweiterungVorschauMitarbeiter').textContent = mitarbeiterText;
  }

  /**
   * Speichert die Erweiterung
   */
  async speichereErweiterung() {
    if (!this.erweiterungTermin) {
      alert('Kein Termin ausgewählt.');
      return;
    }

    const neueArbeit = document.getElementById('erweiterungNeueArbeit').value.trim();
    const arbeitszeitStunden = parseFloat(document.getElementById('erweiterungArbeitszeit').value) || 0;
    const arbeitszeit = Math.round(arbeitszeitStunden * 60); // In Minuten umrechnen
    const teileStatus = document.getElementById('erweiterungTeileStatus').value;
    const typ = document.querySelector('input[name="erweiterungTyp"]:checked').value;

    // Validierung
    if (!neueArbeit) {
      alert('Bitte geben Sie eine Arbeitsbeschreibung ein.');
      document.getElementById('erweiterungNeueArbeit').focus();
      return;
    }
    if (arbeitszeitStunden < 0.1) {
      alert('Die Arbeitszeit muss mindestens 0.1 Stunden (6 Min) betragen.');
      document.getElementById('erweiterungArbeitszeit').focus();
      return;
    }

    // Daten sammeln
    const erweiterungsDaten = {
      neue_arbeit: neueArbeit,
      arbeitszeit_minuten: arbeitszeit,
      teile_status: teileStatus,
      erweiterung_typ: typ
    };

    // Typ-spezifische Daten
    if (typ === 'anschluss') {
      const konfliktLoesung = document.querySelector('input[name="konfliktLoesung"]:checked')?.value || 'gleicher';
      erweiterungsDaten.ist_gleicher_mitarbeiter = konfliktLoesung === 'gleicher';
      
      if (konfliktLoesung === 'anderer') {
        const mitarbeiterId = document.getElementById('erweiterungMitarbeiterSelect').value;
        if (!mitarbeiterId) {
          alert('Bitte wählen Sie einen Mitarbeiter aus.');
          return;
        }
        erweiterungsDaten.mitarbeiter_id = parseInt(mitarbeiterId);
      }
      
      // Folgetermine verschieben wenn gleicher MA und Konflikte vorhanden
      if (konfliktLoesung === 'gleicher' && this.erweiterungKonflikte?.folgetermine_zum_verschieben?.length > 0) {
        const verschieben = confirm(
          `${this.erweiterungKonflikte.folgetermine_zum_verschieben.length} Folgetermin(e) werden um ${arbeitszeit} Minuten nach hinten verschoben.\n\nFortfahren?`
        );
        if (!verschieben) return;
        erweiterungsDaten.folgetermine_verschieben = true;
      }
    } else if (typ === 'morgen') {
      erweiterungsDaten.datum = this.naechsterArbeitstag(this.erweiterungTermin.datum);
      erweiterungsDaten.ist_gleicher_mitarbeiter = false;
    } else if (typ === 'datum') {
      const datum = document.getElementById('erweiterungDatum').value;
      const uhrzeit = document.getElementById('erweiterungUhrzeit').value;
      
      if (!datum) {
        alert('Bitte wählen Sie ein Datum aus.');
        return;
      }
      
      erweiterungsDaten.datum = datum;
      erweiterungsDaten.uhrzeit = uhrzeit || null;
      erweiterungsDaten.ist_gleicher_mitarbeiter = false;
    }

    // Speichern
    const speichernBtn = document.getElementById('erweiterungSpeichernBtn');
    speichernBtn.disabled = true;
    speichernBtn.innerHTML = '⏳ Wird gespeichert...';

    try {
      const result = await TermineService.erweiterungErstellen(this.erweiterungTermin.id, erweiterungsDaten);
      
      let meldung = '✅ Auftragserweiterung erfolgreich erstellt!';
      
      // Hilfsfunktion: Minuten in h:mm formatieren
      const formatZeit = (minuten) => {
        const h = Math.floor(minuten / 60);
        const m = minuten % 60;
        return h > 0 ? `${h}h ${m > 0 ? m + 'min' : ''}`.trim() : `${m}min`;
      };
      
      // Berechne effektive Arbeitszeit inkl. Nebenzeit für Anzeige
      const effektiveArbeitszeit = await this.berechneEffektiveArbeitszeit(arbeitszeit);
      
      // Immer neuer Termin
      meldung += `\n\n📋 Neuer Erweiterungs-Termin: ${result.ergebnis.termin_nr}`;
      meldung += `\n📅 Datum: ${this.formatDateGerman(result.ergebnis.datum)}`;
      meldung += `\n⏱️ Arbeitszeit: ${formatZeit(arbeitszeit)} (effektiv: ${formatZeit(effektiveArbeitszeit)})`;
      
      if (typ === 'anschluss') {
        // Berechne effektive Endzeit mit Nebenzeit
        const bringZeit = this.erweiterungTermin.bring_zeit || this.erweiterungTermin.startzeit || '08:00';
        const originalGeschaetzt = this.erweiterungTermin.geschaetzte_zeit || 0;
        const effektiveOriginal = await this.berechneEffektiveArbeitszeit(originalGeschaetzt);
        const originalEndzeit = this.berechneEndzeit(bringZeit, effektiveOriginal);
        const neueEndzeit = this.berechneEndzeit(originalEndzeit, effektiveArbeitszeit);
        meldung += `\n🏁 Erweiterung endet ca.: ${neueEndzeit} Uhr`;
      }
      
      if (result.verschobene_termine && result.verschobene_termine.length > 0) {
        meldung += `\n\n🔄 ${result.verschobene_termine.length} Folgetermin(e) wurden verschoben.`;
      }
      
      alert(meldung);
      
      this.closeErweiterungModal();
      this.closeTerminDetails();
      this.loadTermine();
      this.loadAuslastung();
      
    } catch (error) {
      console.error('Fehler beim Erstellen der Erweiterung:', error);
      alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
    } finally {
      speichernBtn.disabled = false;
      speichernBtn.innerHTML = `
        <svg class="sparkle-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" fill="currentColor"/>
        </svg>
        <span class="btn-text">Erweiterung erstellen</span>
        <div class="dots-border"></div>
      `;
    }
  }

  // Hilfsfunktion: Berechnet Endzeit aus Startzeit und Dauer
  berechneEndzeit(startzeit, dauerMinuten) {
    if (!startzeit) return '08:00';
    const [h, m] = startzeit.split(':').map(Number);
    const gesamtMinuten = h * 60 + m + (dauerMinuten || 0);
    const endH = Math.floor(gesamtMinuten / 60);
    const endM = gesamtMinuten % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  }

  // Hilfsfunktion: Berechnet effektive Arbeitszeit mit Nebenzeit
  async berechneEffektiveArbeitszeit(dauerMinuten) {
    if (!dauerMinuten) return 0;
    try {
      const werkstattEinstellungen = await EinstellungenService.getWerkstatt();
      const nebenzeitProzent = werkstattEinstellungen.nebenzeit_prozent || 0;
      if (nebenzeitProzent > 0) {
        return Math.round(dauerMinuten * (1 + nebenzeitProzent / 100));
      }
    } catch (e) {
      console.warn('Konnte Nebenzeit nicht laden:', e);
    }
    return dauerMinuten;
  }

  // Hilfsfunktion: Nächster Arbeitstag (überspringt Sonntage)
  naechsterArbeitstag(datum) {
    const d = new Date(datum + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    // Sonntag überspringen
    if (d.getDay() === 0) {
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().split('T')[0];
  }

  // Hilfsfunktion: Formatiert Datum auf Deutsch
  formatDateGerman(datum) {
    if (!datum) return '--';
    const d = new Date(datum + 'T12:00:00');
    const wochentage = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    return `${wochentage[d.getDay()]}, ${datum.split('-').reverse().join('.')}`;
  }

  // ============================================
  // ENDE AUFTRAGSERWEITERUNG FUNKTIONEN
  // ============================================

  // ============================================
  // ENDE TERMIN-SPLIT & SCHWEBEND FUNKTIONEN
  // ============================================

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

  // Auslastung Navigation
  navigateAuslastung(days, type) {
    const datumInput = document.getElementById('auslastungDatum');
    if (!datumInput.value) {
      datumInput.value = new Date().toISOString().split('T')[0];
    }
    const currentDate = new Date(datumInput.value);
    currentDate.setDate(currentDate.getDate() + days);
    datumInput.value = currentDate.toISOString().split('T')[0];
    this.loadAuslastung();
  }

  goToAuslastungHeute() {
    const datumInput = document.getElementById('auslastungDatum');
    datumInput.value = new Date().toISOString().split('T')[0];
    this.loadAuslastung();
  }

  updateAuslastungWocheInfo() {
    const datumInput = document.getElementById('auslastungDatum');
    const wocheInfoEl = document.getElementById('auslastungWocheInfo');
    const aktuellerTagEl = document.getElementById('auslastungAktuellerTag');
    if (!datumInput.value || !wocheInfoEl) return;

    const date = new Date(datumInput.value);
    // Berechne Montag der Woche
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date);
    monday.setDate(diff);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    const formatDate = (d) => {
      const wochentag = d.toLocaleDateString('de-DE', { weekday: 'short' });
      const datum = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      return `${wochentag} ${datum}`;
    };

    // Kalenderwoche berechnen
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);

    wocheInfoEl.textContent = `KW ${weekNumber}: ${formatDate(monday)} - ${formatDate(friday)}`;

    // Aktueller Tag Badge
    if (aktuellerTagEl) {
      const wochentagLang = date.toLocaleDateString('de-DE', { weekday: 'long' });
      const datumFormatiert = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      aktuellerTagEl.innerHTML = `📅 ${wochentagLang} <span class="tag-datum">${datumFormatiert}</span>`;
    }
  }

  // Planung Wocheninfo aktualisieren
  updatePlanungWocheInfo() {
    const datumInput = document.getElementById('auslastungDragDropDatum');
    const wocheInfoEl = document.getElementById('planungWocheInfo');
    const aktuellerTagEl = document.getElementById('planungAktuellerTag');
    if (!datumInput || !datumInput.value || !wocheInfoEl) return;

    const date = new Date(datumInput.value);
    // Berechne Montag der Woche
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date);
    monday.setDate(diff);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    const formatDate = (d) => {
      const wochentag = d.toLocaleDateString('de-DE', { weekday: 'short' });
      const datum = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      return `${wochentag} ${datum}`;
    };

    // Kalenderwoche berechnen
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);

    wocheInfoEl.textContent = `KW ${weekNumber}: ${formatDate(monday)} - ${formatDate(friday)}`;

    // Aktueller Tag Badge
    if (aktuellerTagEl) {
      const wochentagLang = date.toLocaleDateString('de-DE', { weekday: 'long' });
      const datumFormatiert = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      aktuellerTagEl.innerHTML = `📅 ${wochentagLang} <span class="tag-datum">${datumFormatiert}</span>`;
    }
  }

  // Planung Navigation
  navigatePlanung(amount, unit) {
    const datumInput = document.getElementById('auslastungDragDropDatum');
    if (!datumInput || !datumInput.value) return;
    
    const date = new Date(datumInput.value);
    date.setDate(date.getDate() + amount);
    datumInput.value = this.formatDateLocal(date);
    
    this.updatePlanungWocheInfo();
    this.loadAuslastungDragDrop();
  }

  goToPlanungHeute() {
    const datumInput = document.getElementById('auslastungDragDropDatum');
    if (!datumInput) return;
    
    datumInput.value = this.formatDateLocal(new Date());
    this.updatePlanungWocheInfo();
    this.loadAuslastungDragDrop();
  }

  async loadAuslastung() {
    const datumInput = document.getElementById('auslastungDatum');
    if (!datumInput) return;
    const datum = datumInput.value;

    if (!datum) return;

    // Aktualisiere Wocheninfo-Anzeige
    this.updateAuslastungWocheInfo();
    
    // Starte Zeitleisten-Jetzt-Marker Aktualisierung
    this.startZeitleisteNowLineUpdate();

    try {
      const data = await AuslastungService.getByDatum(datum);
      await this.loadAuslastungWoche();
      
      // Lade Zeitleiste
      await this.loadZeitleiste(datum);

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
        // NICHT mehr hier die Einstellungen überschreiben - das führt zu Race-Conditions
        // Die Einstellungen werden in loadWerkstattSettings() geladen
        // this.prefillWerkstattSettings(data.einstellungen);
      }
      if (data.abwesenheit) {
        this.prefillAbwesenheit(datum, data.abwesenheit);
      }

      // Berechne Prozentanteile für die Segmente
      // Verwende belegt_minuten (inkl. Nebenzeit) für die Balkenberechnung
      const belegtMinuten = data.belegt_minuten_mit_service || data.belegt_minuten || 0;
      const referenzMinuten = data.gesamt_minuten > 0 ? data.gesamt_minuten : (belegtMinuten > 0 ? belegtMinuten : 1);
      
      // Berechne die Anteile basierend auf der belegten Zeit (proportional)
      const geplantRoh = data.geplant_minuten || 0;
      const inArbeitRoh = data.in_arbeit_minuten || 0;
      const abgeschlossenRoh = data.abgeschlossen_minuten || 0;
      const belegteZeitRoh = geplantRoh + inArbeitRoh + abgeschlossenRoh;
      
      // Skaliere die Segmente auf die tatsächliche Auslastung
      const auslastungFaktor = belegteZeitRoh > 0 ? belegtMinuten / belegteZeitRoh : 1;
      const geplantProzent = ((geplantRoh * auslastungFaktor) / referenzMinuten) * 100;
      const inArbeitProzent = ((inArbeitRoh * auslastungFaktor) / referenzMinuten) * 100;
      const abgeschlossenProzent = ((abgeschlossenRoh * auslastungFaktor) / referenzMinuten) * 100;

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

      // Schwebende Termine anzeigen (GLOBAL - unabhängig vom Datum)
      const schwebendDisplay = document.getElementById('schwebendDisplay');
      const schwebendAnzahl = data.schwebend_anzahl || 0;
      const schwebendMinuten = data.schwebend_minuten || 0;
      
      if (schwebendDisplay) {
        if (schwebendAnzahl > 0) {
          schwebendDisplay.style.display = 'block';
          document.getElementById('schwebendAnzahl').textContent = schwebendAnzahl;
          document.getElementById('schwebendZeit').textContent = this.formatMinutesToHours(schwebendMinuten);
          
          // Der Balken ist immer voll (100%), da er nicht relativ zur Tageskapazität ist
          const progressSchwebend = document.getElementById('progressSchwebend');
          if (progressSchwebend) {
            progressSchwebend.style.width = '100%';
            progressSchwebend.textContent = this.formatMinutesToHours(schwebendMinuten);
          }
        } else {
          schwebendDisplay.style.display = 'none';
        }
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
            
            // Für "Nur Service" Mitarbeiter: Vereinfachte Anzeige mit Servicezeit + Arbeitszeit + Nebenzeit
            const detailsRow = ma.nur_service 
              ? `<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; font-size: 0.9em; color: #666; margin-bottom: 5px;">
                  <div>Arbeitszeit: ${this.formatMinutesToHours(ma.belegt_minuten_roh || 0)}</div>
                  <div>Servicezeit: ${this.formatMinutesToHours(ma.servicezeit_minuten || 0)}</div>
                  <div>Nebenzeit: ${ma.nebenzeit_prozent || 0}% (${this.formatMinutesToHours(ma.nebenzeit_minuten || 0)})</div>
                  <div>Termine: ${ma.termin_anzahl || 0}</div>
                </div>`
              : `<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; font-size: 0.9em; color: #666; margin-bottom: 5px;">
                  <div>Geplant: ${this.formatMinutesToHours(ma.geplant_minuten)}</div>
                  <div>In Arbeit: ${this.formatMinutesToHours(ma.in_arbeit_minuten)}</div>
                  <div>Abgeschlossen: ${this.formatMinutesToHours(ma.abgeschlossen_minuten)}</div>
                  <div>Servicezeit: ${this.formatMinutesToHours(ma.servicezeit_minuten || 0)}</div>
                </div>`;
            
            return `
              <div style="${cardStyle}">
                <h4 style="margin: 0 0 10px 0;">${ma.mitarbeiter_name}${abwesendBadge}${nurServiceBadge}</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 10px;">
                  <div><strong>Verfügbar:</strong> ${verfuegbarText}</div>
                  <div><strong>Belegt:</strong> ${this.formatMinutesToHours(ma.belegt_minuten)}</div>
                  <div><strong>Auslastung:</strong> <span style="color: ${prozentColor}; font-weight: bold;">${istAbwesend ? '-' : ma.auslastung_prozent + '%'}</span></div>
                </div>
                ${detailsRow}
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
          const istSchwebend = termin.ist_schwebend === 1 || termin.ist_schwebend === true;
          
          // Bring/Abholzeit für Anzeige
          const bringZeitText = termin.bring_zeit ? `🚗↓ ${termin.bring_zeit}` : '';
          const abholZeitText = termin.abholung_zeit ? `🚗↑ ${termin.abholung_zeit}` : '';
          const zeitenInfo = [bringZeitText, abholZeitText].filter(t => t).join(' • ') || '--:--';
          
          html += `
            <div class="nicht-zugeordnet-item${istSchwebend ? ' schwebend' : ''}" data-termin-id="${termin.id}" style="cursor: pointer;" title="Klicken zum Bearbeiten">
              <div class="nz-info">
                <span class="nz-zeit">${zeitenInfo}</span>
                <span class="nz-kunde">${this.escapeHtml(kundenName)}</span>
                <span class="nz-kennzeichen">${this.escapeHtml(termin.kennzeichen || '-')}</span>
              </div>
              <div class="nz-arbeit">${this.escapeHtml(termin.arbeit || '-')}${istSchwebend ? '<span class="schwebend-indicator">⏸️ Schwebend</span>' : ''}</div>
              <div class="nz-dauer">⏱️ ${this.formatMinutesToHours(zeit)}</div>
            </div>
          `;
        });
        
        html += `</div>`;
        html += `<div class="nz-gesamt">
          <strong>Gesamt nicht zugeordnet:</strong> ${this.formatMinutesToHours(gesamtNichtZugeordnetMinuten)} 
          (${nichtZugeordnet.length} ${nichtZugeordnet.length === 1 ? 'Termin' : 'Termine'})
        </div>`;
        
        container.innerHTML = html;
        
        // Click-Handler für nicht zugeordnete Termine hinzufügen
        container.querySelectorAll('.nicht-zugeordnet-item[data-termin-id]').forEach(item => {
          item.addEventListener('click', async () => {
            const terminId = parseInt(item.dataset.terminId, 10);
            // Speichere Termin im Cache, damit showTerminDetails ihn findet
            const termin = nichtZugeordnet.find(t => t.id === terminId);
            if (termin) {
              this.termineById[terminId] = termin;
              await this.showTerminDetails(terminId);
            }
          });
        });
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
    await this.loadErsatzautoRueckgaben();
  }

  async loadDashboardStats() {
    try {
      const today = this.formatDateLocal(this.getToday());

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

      // Lade Fahrzeuganzahl
      try {
        const fahrzeugeStats = await KundenService.countFahrzeuge();
        document.getElementById('fahrzeugeGesamt').textContent = fahrzeugeStats.anzahl || 0;
      } catch (e) {
        document.getElementById('fahrzeugeGesamt').textContent = '-';
      }

      document.getElementById('termineWoche').textContent = termineWoche.length;

      // Dashboard Auslastungsbalken aktualisieren
      this.updateDashboardAuslastung(auslastungHeute);

    } catch (error) {
      console.error('Fehler beim Laden der Dashboard-Statistiken:', error);
    }
  }

  async loadDashboardTermineHeute() {
    try {
      const today = this.formatDateLocal(this.getToday());
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
          
          // Teile-Status Badge
          const teileStatusBadge = this.getTerminTeileStatusBadge(termin);

          row.innerHTML = `
            <td><strong>${termin.termin_nr || '-'}</strong>${folgeterminBadge}${teileStatusBadge}</td>
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
    
    // Teile-Status Badge
    const teileStatusBadge = this.getTerminTeileStatusBadge(termin);

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
      <td>${termin.kunde_name || '-'}${dringlichkeitBadge}${folgeterminBadge}${teileStatusBadge}</td>
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
    
    // Auslastung für heute berechnen
    this.updateHeuteAuslastung(termine);
    
    // Uhrzeit jede Sekunde aktualisieren
    if (this.uhrzeitInterval) {
      clearInterval(this.uhrzeitInterval);
    }
    this.uhrzeitInterval = setInterval(() => {
      this.updateAktuelleUhrzeit();
      this.updateNaechsterKunde(termine);
    }, 1000);
  }

  async updateHeuteAuslastung(termine) {
    const wertEl = document.getElementById('heuteAuslastungWert');
    const detailEl = document.getElementById('heuteAuslastungDetail');
    
    if (!wertEl || !detailEl) return;
    
    try {
      // Lade Auslastungsdaten von der API (gleiche Berechnung wie im Dashboard)
      const today = this.formatDateLocal(new Date());
      const auslastungData = await AuslastungService.getByDatum(today);
      
      const auslastungProzent = auslastungData.auslastung_prozent || 0;
      const belegteMinuten = auslastungData.belegt_minuten || 0;
      const gesamtMinuten = auslastungData.gesamt_minuten || 0;
      
      // Werte anzeigen
      wertEl.textContent = `${auslastungProzent}%`;
      
      const belegteStunden = (belegteMinuten / 60).toFixed(1);
      const gesamtStunden = (gesamtMinuten / 60).toFixed(1);
      detailEl.textContent = `${belegteStunden} von ${gesamtStunden} Stunden`;
      
      // Farbe je nach Auslastung
      if (auslastungProzent >= 100) {
        wertEl.style.color = '#e53935';
      } else if (auslastungProzent >= 80) {
        wertEl.style.color = '#ff9800';
      } else {
        wertEl.style.color = '#4caf50';
      }
    } catch (error) {
      console.error('Fehler bei Auslastungsberechnung:', error);
      wertEl.textContent = '--%';
      detailEl.textContent = 'Fehler beim Laden';
    }
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
        
        const countdown = diffStunden > 0 
          ? `${String(diffStunden).padStart(2, '0')}:${String(diffMin).padStart(2, '0')}`
          : `00:${String(diffMin).padStart(2, '0')}`;
        
        zeitEl.textContent = `in: ${countdown} um: ${naechsterTermin.bring_zeit}`;
        zeitEl.style.color = diffMinuten <= 15 ? 'var(--accent)' : 'inherit';
        infoEl.textContent = `${naechsterTermin.kunde_name || 'Kunde'} - ${naechsterTermin.kennzeichen || ''}`;
      }
    } else {
      zeitEl.textContent = 'in: --:-- um: --:--';
      zeitEl.style.color = 'inherit';
      infoEl.textContent = 'Keine weiteren Termine heute';
    }
  }

  async updateTerminStatus(terminId, status) {
    try {
      const result = await TermineService.update(terminId, { status: status });

      // Aktualisiere den Termin im Cache
      if (this.termineById[terminId]) {
        this.termineById[terminId].status = status;
        // Feature 10: Aktualisiere auch die berechnete Zeit im Cache
        if (result && result.berechneteZeit) {
          this.termineById[terminId].tatsaechliche_zeit = result.berechneteZeit;
        }
      }

      // Feature 10: Zeige automatisch berechnete Zeit an
      if (status === 'abgeschlossen' && result && result.berechneteZeit) {
        this.showToast(`✅ Termin abgeschlossen - Arbeitszeit: ${result.berechneteZeit} Min`, 'success');
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
      const today = this.formatDateLocal(this.getToday());

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
    const today = new Date(this.getToday());
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
      const today = this.formatDateLocal(this.getToday());

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

  // Heute fällige Ersatzauto-Rückgaben laden
  async loadErsatzautoRueckgaben() {
    const section = document.getElementById('ersatzautoRueckgabenSection');
    const container = document.getElementById('ersatzautoRueckgabenListe');
    if (!section || !container) return;

    try {
      const rueckgaben = await ErsatzautosService.getHeuteRueckgaben();
      
      if (!rueckgaben || rueckgaben.length === 0) {
        section.style.display = 'none';
        return;
      }

      section.style.display = 'block';
      
      container.innerHTML = rueckgaben.map(r => {
        const rueckgabeZeit = r.rueckgabe_zeit || r.abholung_zeit || r.ersatzauto_bis_zeit || '18:00';
        const jetzt = new Date();
        const [h, m] = rueckgabeZeit.split(':').map(Number);
        const rueckgabeDate = new Date();
        rueckgabeDate.setHours(h, m, 0, 0);
        
        const istUeberfaellig = jetzt > rueckgabeDate;
        const statusClass = istUeberfaellig ? 'ueberfaellig' : 'erwartet';
        const statusIcon = istUeberfaellig ? '⚠️' : '🕐';
        const statusText = istUeberfaellig ? 'Überfällig!' : 'Erwartet';
        
        return `
          <div class="rueckgabe-karte ${statusClass}">
            <div class="rueckgabe-header">
              <span class="rueckgabe-zeit">${statusIcon} ${rueckgabeZeit} Uhr</span>
              <span class="rueckgabe-status">${statusText}</span>
            </div>
            <div class="rueckgabe-kunde">
              <strong>${r.kunde_name || 'Unbekannt'}</strong>
            </div>
            <div class="rueckgabe-details">
              <span class="rueckgabe-kennzeichen">🚗 ${r.kennzeichen || '-'}</span>
              ${r.kunde_telefon ? `<span class="rueckgabe-telefon">📞 ${r.kunde_telefon}</span>` : ''}
            </div>
            <div class="rueckgabe-termin">
              <small>Termin: ${r.termin_nr || '-'} | Seit: ${this.formatDate(r.datum)}</small>
            </div>
          </div>
        `;
      }).join('');
      
    } catch (error) {
      console.error('Fehler beim Laden der Ersatzauto-Rückgaben:', error);
      section.style.display = 'none';
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

  // ================================================
  // VERBESSERTE KUNDENSUCHE MIT GETRENNTEN FELDERN
  // ================================================

  // Namenssuche mit Live-Vorschlägen
  handleNameSuche() {
    const eingabe = document.getElementById('terminNameSuche')?.value.trim() || '';
    const vorschlaegeDiv = document.getElementById('nameSucheVorschlaege');
    const statusBadge = document.getElementById('kundeStatusAnzeige');
    
    if (!vorschlaegeDiv) return;
    
    // Status-Badge aktualisieren
    this.updateKundeStatusBadge(eingabe, statusBadge);
    
    if (eingabe.length < 2) {
      vorschlaegeDiv.classList.remove('aktiv');
      vorschlaegeDiv.innerHTML = '';
      return;
    }
    
    const lower = eingabe.toLowerCase();
    
    // Suche in Kunden nach Name
    const treffer = (this.kundenCache || []).filter(kunde => 
      kunde.name && kunde.name.toLowerCase().includes(lower)
    ).slice(0, 10); // Max 10 Ergebnisse
    
    if (treffer.length === 0) {
      vorschlaegeDiv.innerHTML = '<div class="keine-vorschlaege">Kein Kunde gefunden - wird als neuer Kunde angelegt</div>';
      vorschlaegeDiv.classList.add('aktiv');
      return;
    }
    
    vorschlaegeDiv.innerHTML = treffer.map((kunde, idx) => `
      <div class="vorschlag-item" data-index="${idx}" onmousedown="event.preventDefault(); app.selectKundeVorschlag(${kunde.id})">
        <div>
          <span class="vorschlag-name">${this.highlightMatch(kunde.name, eingabe)}</span>
          ${kunde.telefon ? `<span class="vorschlag-telefon"> · ${kunde.telefon}</span>` : ''}
        </div>
        <div class="vorschlag-details">
          ${kunde.kennzeichen ? `<span class="vorschlag-kennzeichen">${kunde.kennzeichen}</span>` : ''}
          ${kunde.fahrzeugtyp ? `<span class="vorschlag-fahrzeugtyp">🚗 ${kunde.fahrzeugtyp}</span>` : ''}
        </div>
      </div>
    `).join('');
    
    vorschlaegeDiv.classList.add('aktiv');
    this.aktuelleVorschlaegeIndex = -1;
    this.aktuelleVorschlaege = treffer;
  }

  // Status-Badge für Neuer Kunde / Gefunden aktualisieren
  updateKundeStatusBadge(eingabe, statusBadge) {
    const kennzeichenField = document.getElementById('kennzeichen');
    const kennzeichenLabel = kennzeichenField?.parentElement?.querySelector('label');
    
    if (!statusBadge) return;
    
    if (!eingabe || eingabe.length < 2) {
      statusBadge.style.display = 'none';
      // Kennzeichen-Pflichtmarkierung entfernen
      this.setKennzeichenPflicht(false, kennzeichenField, kennzeichenLabel);
      return;
    }
    
    const lower = eingabe.toLowerCase();
    const kundeId = document.getElementById('kunde_id')?.value;
    
    // Prüfe ob exakter Kunde ausgewählt wurde
    if (kundeId) {
      statusBadge.textContent = '✓ Kunde ausgewählt';
      statusBadge.className = 'kunde-status-badge gefunden';
      statusBadge.style.display = 'inline-block';
      // Kennzeichen ist nicht mehr Pflicht bei existierendem Kunden
      this.setKennzeichenPflicht(false, kennzeichenField, kennzeichenLabel);
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
      // Kennzeichen ist nicht mehr Pflicht bei existierendem Kunden
      this.setKennzeichenPflicht(false, kennzeichenField, kennzeichenLabel);
    } else {
      statusBadge.textContent = '+ Neuer Kunde';
      statusBadge.className = 'kunde-status-badge neuer-kunde';
      statusBadge.style.display = 'inline-block';
      // Kennzeichen ist Pflicht bei Neukunden!
      this.setKennzeichenPflicht(true, kennzeichenField, kennzeichenLabel);
    }
  }

  // Kennzeichen-Feld als Pflichtfeld markieren/entmarkieren
  setKennzeichenPflicht(isPflicht, kennzeichenField, kennzeichenLabel) {
    if (kennzeichenField) {
      if (isPflicht) {
        kennzeichenField.style.borderColor = '#ff9800';
        kennzeichenField.style.background = '#fff8e1';
        kennzeichenField.setAttribute('required', 'required');
      } else {
        kennzeichenField.style.borderColor = '';
        kennzeichenField.style.background = '';
        kennzeichenField.removeAttribute('required');
      }
    }
    
    if (kennzeichenLabel) {
      // Pflicht-Stern hinzufügen/entfernen
      const originalText = 'Kennzeichen:';
      if (isPflicht) {
        kennzeichenLabel.innerHTML = '🚗 Kennzeichen: <span style="color: #e65100; font-weight: bold;">* (Pflicht bei Neukunde)</span>';
      } else {
        kennzeichenLabel.textContent = originalText;
      }
    }
  }

  // Kennzeichen-Suche mit 3 Feldern
  handleKennzeichenSuche() {
    const bezirk = document.getElementById('kzSucheBezirk')?.value.trim().toUpperCase() || '';
    const buchstaben = document.getElementById('kzSucheBuchstaben')?.value.trim().toUpperCase() || '';
    const nummer = document.getElementById('kzSucheNummer')?.value.trim().toUpperCase() || '';
    const vorschlaegeDiv = document.getElementById('kennzeichenSucheVorschlaege');
    
    if (!vorschlaegeDiv) return;
    
    // Mindestens ein Feld muss ausgefüllt sein
    if (!bezirk && !buchstaben && !nummer) {
      vorschlaegeDiv.classList.remove('aktiv');
      vorschlaegeDiv.innerHTML = '';
      return;
    }
    
    // Sammle alle Kennzeichen aus Kunden und Terminen
    const alleKennzeichen = new Map(); // kennzeichen -> {kunde, terminCount}
    
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
    
    // Sortieren: exaktere Matches zuerst
    treffer.sort((a, b) => {
      const aKz = this.parseKennzeichen(a.kennzeichen);
      const bKz = this.parseKennzeichen(b.kennzeichen);
      
      // Exakte Bezirk-Matches bevorzugen
      if (bezirk) {
        const aExact = aKz.bezirk === bezirk;
        const bExact = bKz.bezirk === bezirk;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
      }
      
      return (a.kennzeichen || '').localeCompare(b.kennzeichen || '')
    });
    
    const maxTreffer = treffer.slice(0, 10);
    const weitereAnzahl = treffer.length - maxTreffer.length;
    
    if (maxTreffer.length === 0) {
      vorschlaegeDiv.innerHTML = '<div class="keine-vorschlaege">Kein Kennzeichen gefunden</div>';
      vorschlaegeDiv.classList.add('aktiv');
      return;
    }
    
    let html = maxTreffer.map((data, idx) => `
      <div class="vorschlag-item" data-index="${idx}" onmousedown="event.preventDefault(); app.selectKennzeichenVorschlag('${data.kennzeichen.replace(/'/g, "\\'").replace(/"/g, '&quot;')}', ${data.kundeId || 'null'})">
        <div>
          <span class="vorschlag-kennzeichen" style="margin-right: 10px;">${this.formatKennzeichenHighlight(data.kennzeichen, bezirk, buchstaben, nummer)}</span>
          <span class="vorschlag-name">${data.kundeName || 'Unbekannter Kunde'}</span>
        </div>
        ${data.kundeTelefon ? `<span class="vorschlag-telefon">${data.kundeTelefon}</span>` : ''}
      </div>
    `).join('');
    
    // Hinweis anzeigen wenn es mehr als 10 Treffer gibt
    if (weitereAnzahl > 0) {
      html += `<div class="weitere-treffer-hinweis">+ ${weitereAnzahl} weitere Treffer – bitte Suche eingrenzen</div>`;
    }
    
    vorschlaegeDiv.innerHTML = html;
    
    vorschlaegeDiv.classList.add('aktiv');
    this.aktuelleKzVorschlaegeIndex = -1;
    this.aktuelleKzVorschlaege = maxTreffer;
  }

  // Kennzeichen normalisieren (ohne Leerzeichen und Bindestriche)
  normalizeKennzeichen(kz) {
    return (kz || '').toUpperCase().replace(/[\s\-]/g, '');
  }

  // Kennzeichen in Teile zerlegen
  parseKennzeichen(kz) {
    const normalized = this.normalizeKennzeichen(kz);
    
    // Versuche verschiedene Formate zu parsen
    // Format: ABC-XY 123 oder ABCXY123 oder ABC XY 123
    
    // Versuche Bezirk (1-3 Buchstaben am Anfang)
    const bezirkMatch = normalized.match(/^([A-ZÄÖÜ]{1,3})/);
    const bezirk = bezirkMatch ? bezirkMatch[1] : '';
    
    // Rest nach Bezirk
    const rest = normalized.substring(bezirk.length);
    
    // Buchstaben (1-2 Buchstaben nach Bezirk)
    const buchstabenMatch = rest.match(/^([A-ZÄÖÜ]{1,2})/);
    const buchstaben = buchstabenMatch ? buchstabenMatch[1] : '';
    
    // Nummer (Rest: Zahlen + evtl. E/H)
    const nummer = rest.substring(buchstaben.length);
    
    return { bezirk, buchstaben, nummer };
  }

  // Kennzeichen mit Highlight formatieren
  formatKennzeichenHighlight(kz, bezirk, buchstaben, nummer) {
    // Zeige das Original-Kennzeichen mit Highlighting statt neu zusammenzubauen
    if (!bezirk && !buchstaben && !nummer) {
      return kz; // Keine Suche, zeige Original
    }
    
    // Baue Suchmuster und highlighte im Original
    const suchMuster = (bezirk || '') + (buchstaben || '') + (nummer || '');
    const normalized = this.normalizeKennzeichen(kz);
    
    // Finde Position des Suchmusters im normalisierten Kennzeichen
    const pos = normalized.indexOf(suchMuster.toUpperCase());
    
    if (pos === -1) {
      return kz; // Kein Match, zeige Original
    }
    
    // Highlighte den gefundenen Teil im Original-Kennzeichen
    // Zähle Zeichen im Original bis zur Match-Position (überspringe Leerzeichen/Bindestriche)
    let origPos = 0;
    let normPos = 0;
    
    // Finde Start-Position im Original
    while (normPos < pos && origPos < kz.length) {
      const char = kz[origPos];
      if (char !== ' ' && char !== '-') {
        normPos++;
      }
      origPos++;
    }
    
    const startPos = origPos;
    let matchLength = 0;
    let charsCounted = 0;
    
    // Finde End-Position im Original
    while (charsCounted < suchMuster.length && origPos < kz.length) {
      const char = kz[origPos];
      if (char !== ' ' && char !== '-') {
        charsCounted++;
      }
      matchLength++;
      origPos++;
    }
    
    // Baue Ergebnis mit Highlight
    const before = kz.substring(0, startPos);
    const match = kz.substring(startPos, startPos + matchLength);
    const after = kz.substring(startPos + matchLength);
    
    return `${before}<span class="vorschlag-match">${match}</span>${after}`;
  }

  // Text mit Highlight für Suchmatch
  highlightMatch(text, search) {
    if (!text || !search) return text || '';
    const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="vorschlag-match">$1</span>');
  }

  // Alle Fahrzeuge eines Kunden sammeln (aus Kunden-Daten und Terminen)
  getKundeFahrzeuge(kundeId, kundeName) {
    const fahrzeuge = new Map(); // kennzeichen -> fahrzeugInfo
    
    // 1. Aus dem Kunden-Datensatz
    const kunde = (this.kundenCache || []).find(k => k.id === kundeId);
    if (kunde && kunde.kennzeichen) {
      const kzNorm = this.normalizeKennzeichen(kunde.kennzeichen);
      fahrzeuge.set(kzNorm, {
        kennzeichen: kunde.kennzeichen,
        fahrzeugtyp: kunde.fahrzeugtyp || '',
        vin: kunde.vin || '',
        quelle: 'kunde',
        letzterTermin: null,
        letzterKmStand: null
      });
    }
    
    // 2. Aus den Terminen des Kunden
    const kundeTermine = (this.termineCache || []).filter(t => 
      t.kunde_id === kundeId || 
      (kundeName && t.kunde_name && t.kunde_name.toLowerCase() === kundeName.toLowerCase())
    );
    
    kundeTermine.forEach(termin => {
      if (termin.kennzeichen) {
        const kzNorm = this.normalizeKennzeichen(termin.kennzeichen);
        
        if (!fahrzeuge.has(kzNorm)) {
          // Neues Fahrzeug aus Termin
          fahrzeuge.set(kzNorm, {
            kennzeichen: termin.kennzeichen,
            fahrzeugtyp: termin.fahrzeugtyp || '',
            vin: termin.vin || '',
            quelle: 'termin',
            letzterTermin: termin.datum,
            letzterKmStand: termin.kilometerstand
          });
        } else {
          // Bestehendes Fahrzeug - ggf. aktualisieren
          const existing = fahrzeuge.get(kzNorm);
          if (!existing.letzterTermin || termin.datum > existing.letzterTermin) {
            existing.letzterTermin = termin.datum;
            if (termin.kilometerstand) {
              existing.letzterKmStand = termin.kilometerstand;
            }
          }
          // Fahrzeugtyp ergänzen wenn fehlend
          if (!existing.fahrzeugtyp && termin.fahrzeugtyp) {
            existing.fahrzeugtyp = termin.fahrzeugtyp;
          }
          if (!existing.vin && termin.vin) {
            existing.vin = termin.vin;
          }
        }
      }
    });
    
    return Array.from(fahrzeuge.values());
  }

  // Kunde aus Namenssuche auswählen
  async selectKundeVorschlag(kundeId) {
    const kunde = (this.kundenCache || []).find(k => k.id === kundeId);
    if (!kunde) return;
    
    // Fahrzeuge direkt vom Backend laden (inkl. aller Termine-Kennzeichen)
    try {
      const fahrzeuge = await KundenService.getFahrzeuge(kundeId);
      
      console.log(`Kunde ${kunde.name} ausgewählt:`, {
        kundeId,
        kundeKennzeichen: kunde.kennzeichen,
        gefundeneFahrzeuge: fahrzeuge.length,
        fahrzeuge: fahrzeuge.map(f => f.kennzeichen)
      });
      
      // Modal immer anzeigen (auch bei nur 1 Fahrzeug), damit neue angelegt werden können
      if (fahrzeuge.length >= 1) {
        console.log('Zeige Fahrzeugauswahl-Modal...');
        this.showFahrzeugAuswahlModal(kunde, fahrzeuge);
        this.hideVorschlaege('name');
        return;
      }
      
      // Kein Fahrzeug vorhanden - direkt Kunde auswählen (Kennzeichen muss manuell eingegeben werden)
      this.applyKundeAuswahl(kunde, null);
      this.hideVorschlaege('name');
    } catch (error) {
      console.error('Fehler beim Laden der Fahrzeuge:', error);
      // Fallback: Nur den Kunden ohne Fahrzeugauswahl übernehmen
      this.applyKundeAuswahl(kunde, null);
      this.hideVorschlaege('name');
    }
  }

  // Fahrzeug-Auswahl Modal anzeigen
  showFahrzeugAuswahlModal(kunde, fahrzeuge) {
    const modal = document.getElementById('fahrzeugAuswahlModal');
    const kundeInfo = document.getElementById('fahrzeugAuswahlKunde');
    const liste = document.getElementById('fahrzeugAuswahlListe');
    
    kundeInfo.innerHTML = `<strong>${kunde.name}</strong>${kunde.telefon ? ` · ${kunde.telefon}` : ''}<br>
      <span style="font-size: 0.9em;">Dieser Kunde hat ${fahrzeuge.length} Fahrzeuge:</span>`;
    
    liste.innerHTML = fahrzeuge.map((fz, idx) => {
      // Unterstütze beide Feldnamen (API: letzter_termin, Cache: letzterTermin)
      const letzterTermin = fz.letzter_termin || fz.letzterTermin;
      const letzterKmStand = fz.letzter_km_stand || fz.letzterKmStand;
      
      return `
      <div class="fahrzeug-auswahl-item" onclick="app.selectFahrzeugFromModal(${kunde.id}, ${idx})" style="
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
            <span style="font-size: 1.2em; font-weight: bold;">🚗 ${fz.kennzeichen}</span>
            ${fz.fahrzeugtyp ? `<span style="color: #666; margin-left: 10px;">${fz.fahrzeugtyp}</span>` : ''}
          </div>
          ${idx === 0 ? '<span style="background: #4caf50; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;">Zuletzt</span>' : ''}
        </div>
        ${fz.vin ? `<div style="font-size: 0.85em; color: #888; margin-top: 5px;">VIN: ${fz.vin}</div>` : ''}
        <div style="font-size: 0.85em; color: #666; margin-top: 5px;">
          ${letzterTermin ? `Letzter Termin: ${this.formatDatum(letzterTermin)}` : 'Aus Kundenstamm'}
          ${letzterKmStand ? ` · ${Number(letzterKmStand).toLocaleString('de-DE')} km` : ''}
        </div>
      </div>
    `}).join('') + `
      <div id="neuesFahrzeugSection" style="margin-top: 15px; padding-top: 15px; border-top: 2px dashed #dee2e6;">
        <button type="button" id="toggleNeuesFahrzeugBtn" class="btn btn-outline" onclick="app.toggleNeuesFahrzeugFormular()" style="width: 100%; padding: 12px; font-size: 1em;">
          ➕ Neues Fahrzeug anlegen
        </button>
        <div id="neuesFahrzeugFormular" style="display: none; margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
          <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="form-group" style="margin: 0;">
              <label style="font-size: 0.85em;">Kennzeichen: *</label>
              <input type="text" id="auswahlNeuesKennzeichen" placeholder="z.B. K-AB 1234" style="text-transform: uppercase;">
            </div>
            <div class="form-group" style="margin: 0;">
              <label style="font-size: 0.85em;">Fahrzeugtyp:</label>
              <input type="text" id="auswahlNeuesFahrzeugtyp" placeholder="z.B. VW Golf">
            </div>
          </div>
          <div class="form-group" style="margin: 10px 0;">
            <label style="font-size: 0.85em;">VIN (optional):</label>
            <input type="text" id="auswahlNeueVin" placeholder="z.B. WVWZZZ..." maxlength="17" style="text-transform: uppercase;">
          </div>
          <div style="display: flex; gap: 10px;">
            <button type="button" class="btn btn-success" onclick="app.addFahrzeugFromAuswahl()">✓ Anlegen & Auswählen</button>
            <button type="button" class="btn btn-secondary" onclick="app.toggleNeuesFahrzeugFormular()">Abbrechen</button>
          </div>
        </div>
      </div>
    `;
    
    // Speichere die Daten für späteren Zugriff
    this.fahrzeugAuswahlData = { kunde, fahrzeuge };
    
    modal.style.display = 'block';
  }

  // Fahrzeug aus Modal auswählen
  selectFahrzeugFromModal(kundeId, fahrzeugIndex) {
    if (!this.fahrzeugAuswahlData) return;
    
    const { kunde, fahrzeuge } = this.fahrzeugAuswahlData;
    const fahrzeug = fahrzeuge[fahrzeugIndex];
    
    this.applyKundeAuswahl(kunde, fahrzeug);
    this.closeFahrzeugAuswahlModal();
  }

  // Fahrzeug-Auswahl Modal schließen
  closeFahrzeugAuswahlModal() {
    const modal = document.getElementById('fahrzeugAuswahlModal');
    modal.style.display = 'none';
    this.fahrzeugAuswahlData = null;
  }

  // Feature 6: Toggle für Neues-Fahrzeug-Formular im Auswahl-Modal
  toggleNeuesFahrzeugFormular() {
    const formular = document.getElementById('neuesFahrzeugFormular');
    const btn = document.getElementById('toggleNeuesFahrzeugBtn');
    if (!formular || !btn) return;
    
    if (formular.style.display === 'none') {
      formular.style.display = 'block';
      btn.style.display = 'none';
      document.getElementById('auswahlNeuesKennzeichen')?.focus();
    } else {
      formular.style.display = 'none';
      btn.style.display = 'block';
      // Felder leeren
      const kennzeichenEl = document.getElementById('auswahlNeuesKennzeichen');
      const fahrzeugtypEl = document.getElementById('auswahlNeuesFahrzeugtyp');
      const vinEl = document.getElementById('auswahlNeueVin');
      if (kennzeichenEl) kennzeichenEl.value = '';
      if (fahrzeugtypEl) fahrzeugtypEl.value = '';
      if (vinEl) vinEl.value = '';
    }
  }

  // Feature 6: Neues Fahrzeug aus Auswahl-Modal anlegen und direkt auswählen
  async addFahrzeugFromAuswahl() {
    const kennzeichen = document.getElementById('auswahlNeuesKennzeichen')?.value.trim().toUpperCase();
    const fahrzeugtyp = document.getElementById('auswahlNeuesFahrzeugtyp')?.value.trim() || null;
    const vin = document.getElementById('auswahlNeueVin')?.value.trim().toUpperCase() || null;
    
    if (!kennzeichen) {
      alert('Bitte Kennzeichen eingeben');
      document.getElementById('auswahlNeuesKennzeichen')?.focus();
      return;
    }
    
    if (!this.fahrzeugAuswahlData) {
      alert('Fehler: Keine Kundendaten verfügbar');
      return;
    }
    
    const { kunde } = this.fahrzeugAuswahlData;
    
    try {
      // Fahrzeug zum Kunden hinzufügen
      await api.addFahrzeugToKunde(kunde.id, { kennzeichen, fahrzeugtyp, vin });
      
      // Neues Fahrzeug-Objekt erstellen
      const neuesFahrzeug = { kennzeichen, fahrzeugtyp, vin };
      
      // Direkt auswählen und Modal schließen
      this.applyKundeAuswahl(kunde, neuesFahrzeug);
      this.closeFahrzeugAuswahlModal();
      
      // Cache aktualisieren
      await this.loadKunden();
      
      this.showToast(`Fahrzeug ${kennzeichen} angelegt und ausgewählt`, 'success');
    } catch (error) {
      console.error('Fehler beim Anlegen des Fahrzeugs:', error);
      alert('Fehler beim Anlegen des Fahrzeugs: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  // Kunde und Fahrzeug auf das Formular anwenden
  applyKundeAuswahl(kunde, fahrzeug) {
    // Kunden-Daten füllen
    document.getElementById('kunde_id').value = kunde.id;
    document.getElementById('terminNameSuche').value = kunde.name;
    document.getElementById('neuer_kunde_telefon').value = kunde.telefon || '';
    
    // Fahrzeug-Daten füllen
    if (fahrzeug) {
      document.getElementById('kennzeichen').value = fahrzeug.kennzeichen || '';
      
      // Auch die Suchfelder füllen
      if (fahrzeug.kennzeichen) {
        const parts = this.parseKennzeichen(fahrzeug.kennzeichen);
        document.getElementById('kzSucheBezirk').value = parts.bezirk;
        document.getElementById('kzSucheBuchstaben').value = parts.buchstaben;
        document.getElementById('kzSucheNummer').value = parts.nummer;
      }
      
      if (fahrzeug.fahrzeugtyp) {
        document.getElementById('fahrzeugtyp').value = fahrzeug.fahrzeugtyp;
      }
      
      if (fahrzeug.vin) {
        document.getElementById('vin').value = fahrzeug.vin;
      }
      
      // KM-Stand als Placeholder setzen (unterstütze beide Feldnamen)
      const kmStandInput = document.getElementById('kilometerstand');
      const letzterKmStand = fahrzeug.letzter_km_stand || fahrzeug.letzterKmStand;
      if (letzterKmStand && kmStandInput) {
        kmStandInput.value = '';
        kmStandInput.placeholder = `Letzter KM-Stand: ${Number(letzterKmStand).toLocaleString('de-DE')} km`;
        kmStandInput.classList.add('has-previous-value');
      }
    } else if (kunde.kennzeichen) {
      // Fallback: Kennzeichen aus Kunden-Datensatz
      document.getElementById('kennzeichen').value = kunde.kennzeichen;
      const parts = this.parseKennzeichen(kunde.kennzeichen);
      document.getElementById('kzSucheBezirk').value = parts.bezirk;
      document.getElementById('kzSucheBuchstaben').value = parts.buchstaben;
      document.getElementById('kzSucheNummer').value = parts.nummer;
      
      if (kunde.fahrzeugtyp) {
        document.getElementById('fahrzeugtyp').value = kunde.fahrzeugtyp;
      }
      
      // Letzten KM-Stand suchen
      const letzterKmStand = this.findLetztenKmStand(kunde.id, kunde.name, kunde.kennzeichen);
      const kmStandInput = document.getElementById('kilometerstand');
      if (letzterKmStand && kmStandInput) {
        kmStandInput.value = '';
        kmStandInput.placeholder = `Letzter KM-Stand: ${letzterKmStand.toLocaleString('de-DE')} km`;
        kmStandInput.classList.add('has-previous-value');
      }
    }
    
    // Kunde gefunden anzeigen
    this.showGefundenerKunde(kunde.name, kunde.telefon);
    
    // Status-Badge aktualisieren (Kunde wurde ausgewählt)
    const statusBadge = document.getElementById('kundeStatusAnzeige');
    if (statusBadge) {
      statusBadge.textContent = '✓ Kunde ausgewählt';
      statusBadge.className = 'kunde-status-badge gefunden';
      statusBadge.style.display = 'inline-block';
    }
  }

  // Kennzeichen aus Kennzeichensuche auswählen
  selectKennzeichenVorschlag(kennzeichen, kundeId) {
    // Kennzeichen in das Hauptfeld setzen
    document.getElementById('kennzeichen').value = kennzeichen;
    
    // Auch die Suchfelder aktualisieren
    const parts = this.parseKennzeichen(kennzeichen);
    document.getElementById('kzSucheBezirk').value = parts.bezirk;
    document.getElementById('kzSucheBuchstaben').value = parts.buchstaben;
    document.getElementById('kzSucheNummer').value = parts.nummer;
    
    // Wenn Kunde vorhanden, auch Kundendaten füllen
    if (kundeId) {
      const kunde = (this.kundenCache || []).find(k => k.id === kundeId);
      if (kunde) {
        document.getElementById('kunde_id').value = kunde.id;
        document.getElementById('terminNameSuche').value = kunde.name;
        document.getElementById('neuer_kunde_telefon').value = kunde.telefon || '';
        
        if (kunde.fahrzeugtyp) {
          document.getElementById('fahrzeugtyp').value = kunde.fahrzeugtyp;
        }
        
        this.showGefundenerKunde(kunde.name, kunde.telefon);
        
        // Letzten KM-Stand suchen
        const letzterKmStand = this.findLetztenKmStand(kunde.id, kunde.name, kennzeichen);
        const kmStandInput = document.getElementById('kilometerstand');
        if (letzterKmStand && kmStandInput) {
          kmStandInput.value = '';
          kmStandInput.placeholder = `Letzter KM-Stand: ${letzterKmStand.toLocaleString('de-DE')} km`;
          kmStandInput.classList.add('has-previous-value');
        }
      }
    }
    
    // Vorschläge ausblenden
    this.hideVorschlaege('kennzeichen');
  }

  // Tastatur-Navigation in Vorschlägen
  handleSucheKeydown(e, type) {
    const vorschlaegeDiv = type === 'name' 
      ? document.getElementById('nameSucheVorschlaege')
      : document.getElementById('kennzeichenSucheVorschlaege');
    
    if (!vorschlaegeDiv || !vorschlaegeDiv.classList.contains('aktiv')) return;
    
    const items = vorschlaegeDiv.querySelectorAll('.vorschlag-item');
    if (items.length === 0) return;
    
    const indexKey = type === 'name' ? 'aktuelleVorschlaegeIndex' : 'aktuelleKzVorschlaegeIndex';
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this[indexKey] = Math.min(this[indexKey] + 1, items.length - 1);
      this.updateVorschlaegeHighlight(items, this[indexKey]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this[indexKey] = Math.max(this[indexKey] - 1, 0);
      this.updateVorschlaegeHighlight(items, this[indexKey]);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this[indexKey] >= 0 && items[this[indexKey]]) {
        items[this[indexKey]].click();
      }
    } else if (e.key === 'Escape') {
      this.hideVorschlaege(type);
    }
  }

  // Highlight in Vorschlägen aktualisieren
  updateVorschlaegeHighlight(items, index) {
    items.forEach((item, i) => {
      item.classList.toggle('ausgewaehlt', i === index);
    });
    if (items[index]) {
      items[index].scrollIntoView({ block: 'nearest' });
    }
  }

  // Vorschläge ausblenden
  hideVorschlaege(type) {
    const vorschlaegeDiv = type === 'name' 
      ? document.getElementById('nameSucheVorschlaege')
      : document.getElementById('kennzeichenSucheVorschlaege');
    
    if (vorschlaegeDiv) {
      vorschlaegeDiv.classList.remove('aktiv');
    }
  }

  // Legacy-Funktion für alte Datalist (wird nicht mehr verwendet, aber für Kompatibilität behalten)
  updateSuchListe() {
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
    const eingabe = document.getElementById('terminSchnellsuche')?.value.trim() || '';
    // Leite auf neue Suche um
    if (!eingabe) {
      this.hideGefundenerKunde();
      return;
    }
    
    // Prüfe ob es wie ein Kennzeichen aussieht
    const siehtAusWieKennzeichen = /^[A-ZÄÖÜ]{1,3}[\s\-]?[A-ZÄÖÜ]{1,2}[\s\-]?\d/.test(eingabe.toUpperCase());
    
    if (siehtAusWieKennzeichen) {
      // Setze in Kennzeichen-Felder
      const parts = this.parseKennzeichen(eingabe);
      document.getElementById('kzSucheBezirk').value = parts.bezirk;
      document.getElementById('kzSucheBuchstaben').value = parts.buchstaben;
      document.getElementById('kzSucheNummer').value = parts.nummer;
      this.handleKennzeichenSuche();
    } else {
      // Setze in Namenssuche
      document.getElementById('terminNameSuche').value = eingabe;
      this.handleNameSuche();
    }
  }

  // Original handleTerminSchnellsuche Logik (wird für Rückwärtskompatibilität behalten)
  handleTerminSchnellsucheOld() {
    const eingabe = document.getElementById('terminSchnellsuche')?.value.trim();
    if (!eingabe) {
      this.hideGefundenerKunde();
      return;
    }
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
    
    // Suche auch nach Kennzeichen in Kundendaten (normalisiert)
    if (!kundeMatch) {
      const normalizedInput = eingabe.replace(/[\s\-]/g, '').toLowerCase();
      kundeMatch = (this.kundenCache || []).find(kunde => 
        kunde.kennzeichen && kunde.kennzeichen.replace(/[\s\-]/g, '').toLowerCase() === normalizedInput
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

    // Suche Kennzeichen in Terminen (normalisiert: ohne Leerzeichen und Bindestriche)
    const normalizedLower = eingabe.replace(/[\s\-]/g, '').toLowerCase();
    const terminMatch = (this.termineCache || []).find(termin =>
      termin.kennzeichen && termin.kennzeichen.replace(/[\s\-]/g, '').toLowerCase() === normalizedLower
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
    // Normalisiert: ohne Leerzeichen und Bindestriche
    const kundeByKennzeichen = (this.kundenCache || []).find(kunde =>
      kunde.kennzeichen && kunde.kennzeichen.replace(/[\s\-]/g, '').toLowerCase() === normalizedLower
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
    // HINWEIS: Neue Arbeiten werden NICHT mehr automatisch als Standardzeiten angelegt
    // Sie müssen manuell über die Arbeitszeiten-Verwaltung hinzugefügt werden
    // Diese Funktion prüft nur, ob die Arbeiten existieren, legt sie aber nicht an
    
    // Nur Arbeitszeiten neu laden, falls nötig
    if (!this.arbeitszeiten || this.arbeitszeiten.length === 0) {
      await this.loadArbeitszeiten();
    }
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
  }

  async loadPapierkorb() {
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
      this.updateApiKeyStatus(einstellungen); // Setzt this._hasOpenAIKey
      this.updateRealtimeEnabledStatus(einstellungen?.realtime_enabled !== false);
      this.updateKIModeStatus(einstellungen?.ki_mode || 'local', !!einstellungen?.chatgpt_api_key_configured);
      this.updateSmartSchedulingStatus(einstellungen?.smart_scheduling_enabled !== false);
      this.updateAnomalyDetectionStatus(einstellungen?.anomaly_detection_enabled !== false);
      // KI-Trainingsdaten laden
      this.loadKITrainingData();
    } catch (error) {
      console.error('Fehler beim Laden der Werkstatt-Einstellungen:', error);
    }

    // Server-Konfiguration laden
    try {
      const serverConfig = CONFIG.getServerConfig();
      const serverIpField = document.getElementById('server_ip');
      const serverPortField = document.getElementById('server_port');
      const currentServerUrlField = document.getElementById('currentServerUrl');
      
      if (serverIpField) serverIpField.value = serverConfig.ip;
      if (serverPortField) serverPortField.value = serverConfig.port;
      if (currentServerUrlField) currentServerUrlField.textContent = serverConfig.url;
    } catch (error) {
      console.error('Fehler beim Laden der Server-Konfiguration:', error);
    }
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
    const mittagspauseField = document.getElementById('mittagspause_minuten');
    if (mittagspauseField) {
      mittagspauseField.value = einstellungen.mittagspause_minuten || 30;
    }
  }

  // ChatGPT API-Key Status anzeigen
  updateApiKeyStatus(einstellungen) {
    const statusContainer = document.getElementById('apiKeyStatus');
    if (!statusContainer) return;

    const isConfigured = einstellungen?.chatgpt_api_key_configured;
    const maskedKey = einstellungen?.chatgpt_api_key_masked;

    // API-Key Status für KI-Modus-Anzeige speichern
    this._hasOpenAIKey = !!isConfigured;

    if (isConfigured) {
      statusContainer.innerHTML = `
        <div class="status-indicator configured">
          <span class="status-icon">🟢</span>
          <span class="status-text">API-Key konfiguriert: ${maskedKey || '****'}</span>
        </div>
      `;
    } else {
      statusContainer.innerHTML = `
        <div class="status-indicator not-configured">
          <span class="status-icon">⚪</span>
          <span class="status-text">Kein API-Key konfiguriert</span>
        </div>
      `;
    }

    // KI-Enabled Status aktualisieren
    this.updateKIEnabledStatus(einstellungen?.ki_enabled !== false);
  }

  // KI-Funktionen Status aktualisieren (UI ein-/ausblenden)
  updateKIEnabledStatus(enabled) {
    const toggle = document.getElementById('kiEnabledToggle');
    if (toggle) {
      toggle.checked = enabled;
    }
    
    // Body-Klasse setzen für CSS-basiertes Ein-/Ausblenden
    if (enabled) {
      document.body.classList.remove('ki-disabled');
    } else {
      document.body.classList.add('ki-disabled');
    }
    
    // KI-Analyse Checkbox deaktivieren wenn KI aus
    const kiAnalyseCheckbox = document.getElementById('kiAnalyseAktiv');
    if (kiAnalyseCheckbox && !enabled) {
      kiAnalyseCheckbox.checked = false;
    }
    
    // Speichere den Status für spätere Verwendung
    this.kiEnabled = enabled;

    const modeSelect = document.getElementById('kiModeSelect');
    if (modeSelect) {
      modeSelect.disabled = !enabled;
    }

    // KI-Modus Status-Indikator aktualisieren
    this.updateKIModeStatus(this.kiMode);
  }

  // KI-Modus aktualisieren (local/openai)
  updateKIModeStatus(mode, hasApiKey = null) {
    const select = document.getElementById('kiModeSelect');
    if (select) {
      select.value = mode || 'local';
      select.disabled = !this.kiEnabled;
    }
    this.kiMode = mode || 'local';

    // Status-Indikator aktualisieren
    const statusContainer = document.getElementById('kiModeStatus');
    const statusIcon = document.getElementById('kiModeStatusIcon');
    const statusText = document.getElementById('kiModeStatusText');
    const statusHint = document.getElementById('kiModeStatusHint');

    if (statusContainer && statusIcon && statusText && statusHint) {
      if (!this.kiEnabled) {
        // KI deaktiviert
        statusContainer.style.background = '#f5f5f5';
        statusContainer.style.borderColor = '#e0e0e0';
        statusIcon.textContent = '⚪';
        statusText.textContent = 'KI deaktiviert';
        statusHint.textContent = 'Aktiviere KI-Funktionen oben, um den Modus zu nutzen';
      } else if (this.kiMode === 'openai') {
        // OpenAI Modus
        const apiKeyConfigured = hasApiKey !== null ? hasApiKey : this._hasOpenAIKey;
        if (apiKeyConfigured) {
          statusContainer.style.background = '#e3f2fd';
          statusContainer.style.borderColor = '#90caf9';
          statusIcon.textContent = '🔵';
          statusText.textContent = 'Aktiv: OpenAI (ChatGPT)';
          statusHint.textContent = 'Nutzt OpenAI API für intelligente Vorschläge (Internet erforderlich)';
        } else {
          statusContainer.style.background = '#fff3e0';
          statusContainer.style.borderColor = '#ffcc80';
          statusIcon.textContent = '🟠';
          statusText.textContent = 'OpenAI ausgewählt - API-Key fehlt!';
          statusHint.textContent = 'Bitte konfiguriere unten einen API-Key für OpenAI';
        }
      } else {
        // Lokal Modus
        statusContainer.style.background = '#e8f5e9';
        statusContainer.style.borderColor = '#a5d6a7';
        statusIcon.textContent = '🟢';
        statusText.textContent = 'Aktiv: Lokale KI';
        statusHint.textContent = 'Nutzt Heuristiken auf dem Server (kein Internet erforderlich)';
      }
    }

    // Body-Klasse für OpenAI-only Elemente setzen
    if (this.kiEnabled && this.kiMode === 'openai') {
      document.body.classList.remove('ki-mode-local');
      document.body.classList.add('ki-mode-openai');
    } else {
      document.body.classList.remove('ki-mode-openai');
      document.body.classList.add('ki-mode-local');
    }
  }

  // Echtzeit-Updates Status aktualisieren (WebSocket ein-/aus)
  updateRealtimeEnabledStatus(enabled) {
    const toggle = document.getElementById('realtimeEnabledToggle');
    if (toggle) {
      toggle.checked = enabled;
    }

    this.realtimeEnabled = enabled;

    if (enabled) {
      this.setupWebSocket();
    } else {
      this.stopWebSocket();
    }
  }

  // Smart Scheduling Status aktualisieren
  updateSmartSchedulingStatus(enabled) {
    const toggle = document.getElementById('smartSchedulingToggle');
    if (toggle) {
      toggle.checked = enabled;
    }
    this.smartSchedulingEnabled = enabled;
  }

  // Anomalie-Erkennung Status aktualisieren
  updateAnomalyDetectionStatus(enabled) {
    const toggle = document.getElementById('anomalyDetectionToggle');
    if (toggle) {
      toggle.checked = enabled;
    }
    this.anomalyDetectionEnabled = enabled;
  }

  // KI-Trainingsdaten laden und anzeigen
  async loadKITrainingData() {
    const statusText = document.getElementById('kiTrainingStatusText');
    const detailsButton = document.getElementById('btnShowTrainingDetails');
    const excludeButton = document.getElementById('btnExcludeOutliers');

    if (!statusText) return;

    try {
      const result = await ApiService.get('/ai/training-data');

      if (result.success) {
        const { stats, termine, outlierCount } = result.data;
        const activeOutliers = termine.filter(t => t.isOutlier && !t.ki_training_exclude).length;
        const excludedCount = stats.ausgeschlossen || 0;
        const usableCount = stats.abgeschlossen - excludedCount;

        statusText.innerHTML = `
          <strong>${usableCount} nutzbare Trainingseinträge</strong>
          <div style="font-size: 0.85em; color: #666; margin-top: 4px;">
            ${stats.total} Einträge gesamt •
            ${activeOutliers > 0 ? `<span style="color: #e65100;">${activeOutliers} Ausreißer erkannt</span>` : '<span style="color: #2e7d32;">Keine Ausreißer</span>'}
            ${excludedCount > 0 ? ` • ${excludedCount} ausgeschlossen` : ''}
          </div>
        `;

        // Ausreißer-Button aktivieren/deaktivieren
        if (excludeButton) {
          excludeButton.disabled = activeOutliers === 0;
          excludeButton.textContent = activeOutliers > 0
            ? `🚫 ${activeOutliers} Ausreißer ausschließen`
            : '🚫 Keine Ausreißer';
        }

        // Daten für Details-Anzeige speichern
        this._kiTrainingData = termine;
      } else {
        statusText.innerHTML = '<strong style="color: #c62828;">Fehler beim Laden</strong>';
      }
    } catch (error) {
      console.error('Fehler beim Laden der KI-Trainingsdaten:', error);
      statusText.innerHTML = '<strong style="color: #c62828;">Fehler beim Laden</strong>';
    }
  }

  // Alle Ausreißer automatisch ausschließen
  async handleExcludeOutliers() {
    if (!confirm('Alle erkannten Ausreißer vom Training ausschließen?')) return;

    try {
      const data = await ApiService.post('/ai/training-data/exclude-outliers', {});

      if (data.success) {
        this.showToast(`${data.excluded} Ausreißer ausgeschlossen`, 'success');
        this.loadKITrainingData();
        this.updateTrainingDetailsTable();
      } else {
        this.showToast('Fehler beim Ausschließen', 'error');
      }
    } catch (error) {
      console.error('Fehler beim Ausschließen der Ausreißer:', error);
      this.showToast('Fehler beim Ausschließen', 'error');
    }
  }

  // Modell neu trainieren
  async handleRetrainModel() {
    const btn = document.getElementById('btnRetrainModel');
    if (btn) btn.disabled = true;

    try {
      const data = await ApiService.post('/ai/retrain', {});

      if (data.success) {
        this.showToast(`Modell trainiert: ${data.model.sampleCount} Einträge`, 'success');
        this.loadKITrainingData();
      } else {
        this.showToast('Fehler beim Training', 'error');
      }
    } catch (error) {
      console.error('Fehler beim Neutraining:', error);
      this.showToast('Fehler beim Training', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // Details-Tabelle anzeigen/verstecken
  toggleTrainingDetails() {
    const details = document.getElementById('kiTrainingDetails');
    const btn = document.getElementById('btnShowTrainingDetails');

    if (details) {
      const isVisible = details.style.display !== 'none';
      details.style.display = isVisible ? 'none' : 'block';
      if (btn) btn.textContent = isVisible ? '📋 Details anzeigen' : '📋 Details ausblenden';

      if (!isVisible) {
        this.updateTrainingDetailsTable();
      }
    }
  }

  // Details-Tabelle aktualisieren
  updateTrainingDetailsTable() {
    const tbody = document.getElementById('kiTrainingTableBody');
    if (!tbody || !this._kiTrainingData) return;

    tbody.innerHTML = this._kiTrainingData.map(t => {
      const statusClass = t.ki_training_exclude ? 'excluded' : (t.isOutlier ? 'outlier' : 'normal');
      const statusLabel = t.ki_training_exclude ? '❌ Ausgeschlossen' : (t.isOutlier ? '⚠️ Ausreißer' : '✅ OK');
      const rowStyle = t.ki_training_exclude ? 'background: #ffebee; color: #999;' : (t.isOutlier ? 'background: #fff3e0;' : '');

      return `
        <tr style="${rowStyle}">
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${t.datum || '-'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${t.arbeit || '-'}</td>
          <td style="padding: 8px; text-align: right; border-bottom: 1px solid #eee;">${t.tatsaechliche_zeit || '-'}</td>
          <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee;">${statusLabel}</td>
          <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee;">
            <button onclick="window.app.toggleTrainingExclude(${t.id}, ${t.ki_training_exclude ? 0 : 1})"
                    style="padding: 4px 8px; font-size: 0.8em; cursor: pointer;">
              ${t.ki_training_exclude ? '✅ Einschließen' : '🚫 Ausschließen'}
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Einzelnen Eintrag vom Training ein-/ausschließen
  async toggleTrainingExclude(id, exclude) {
    try {
      const data = await ApiService.post(`/ai/training-data/${id}/exclude`, { exclude: !!exclude });

      if (data.success) {
        // Lokale Daten aktualisieren
        const item = this._kiTrainingData.find(t => t.id === id);
        if (item) item.ki_training_exclude = exclude;

        this.updateTrainingDetailsTable();
        this.loadKITrainingData();
      }
    } catch (error) {
      console.error('Fehler beim Aktualisieren:', error);
      this.showToast('Fehler beim Aktualisieren', 'error');
    }
  }

  // KI-Funktionen aktivieren/deaktivieren (Toggle-Handler)
  async handleKIEnabledToggle(e) {
    const enabled = e.target.checked;
    
    try {
      const result = await EinstellungenService.updateKIEnabled(enabled);
      
      if (result.success) {
        this.updateKIEnabledStatus(enabled);
        this.showToast(
          enabled ? '🤖 KI-Funktionen aktiviert' : '🔌 KI-Funktionen deaktiviert', 
          'success'
        );
      } else {
        // Fehler - Toggle zurücksetzen
        e.target.checked = !enabled;
        this.showToast('Fehler beim Speichern der Einstellung', 'error');
      }
    } catch (error) {
      console.error('Fehler beim Aktualisieren der KI-Einstellung:', error);
      e.target.checked = !enabled;
      this.showToast('Fehler beim Speichern der Einstellung', 'error');
    }
  }

  // KI-Modus ändern
  async handleKIModeChange(e) {
    const mode = e.target.value;
    const previous = this.kiMode;

    try {
      const result = await EinstellungenService.updateKIMode(mode);

      if (result.success) {
        this.updateKIModeStatus(mode);
        this.showToast(`🧠 KI-Modus: ${mode === 'local' ? 'Lokal' : 'OpenAI'}`, 'success');
      } else {
        e.target.value = previous;
        this.showToast('Fehler beim Speichern des KI-Modus', 'error');
      }
    } catch (error) {
      console.error('Fehler beim Aktualisieren des KI-Modus:', error);
      e.target.value = previous;
      this.showToast('Fehler beim Speichern des KI-Modus', 'error');
    }
  }

  // Echtzeit-Updates aktivieren/deaktivieren (Toggle-Handler)
  async handleRealtimeEnabledToggle(e) {
    const enabled = e.target.checked;

    try {
      const result = await EinstellungenService.updateRealtimeEnabled(enabled);

      if (result.success) {
        this.updateRealtimeEnabledStatus(enabled);
        this.showToast(
          enabled ? '⚡ Echtzeit-Updates aktiviert' : '⏸️ Echtzeit-Updates deaktiviert',
          'success'
        );
      } else {
        e.target.checked = !enabled;
        this.showToast('Fehler beim Speichern der Einstellung', 'error');
      }
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Echtzeit-Einstellung:', error);
      e.target.checked = !enabled;
      this.showToast('Fehler beim Speichern der Einstellung', 'error');
    }
  }

  // Smart Scheduling aktivieren/deaktivieren
  async handleSmartSchedulingToggle(e) {
    const enabled = e.target.checked;

    try {
      const result = await EinstellungenService.updateSmartSchedulingEnabled(enabled);

      if (result.success) {
        this.updateSmartSchedulingStatus(enabled);
        this.showToast(
          enabled ? '🧭 Smart Scheduling aktiviert' : '🧭 Smart Scheduling deaktiviert',
          'success'
        );
      } else {
        e.target.checked = !enabled;
        this.showToast('Fehler beim Speichern der Einstellung', 'error');
      }
    } catch (error) {
      console.error('Fehler beim Aktualisieren von Smart Scheduling:', error);
      e.target.checked = !enabled;
      this.showToast('Fehler beim Speichern der Einstellung', 'error');
    }
  }

  // Anomalie-Erkennung aktivieren/deaktivieren
  async handleAnomalyDetectionToggle(e) {
    const enabled = e.target.checked;

    try {
      const result = await EinstellungenService.updateAnomalyDetectionEnabled(enabled);

      if (result.success) {
        this.updateAnomalyDetectionStatus(enabled);
        this.showToast(
          enabled ? '🛡️ Anomalie-Erkennung aktiviert' : '🛡️ Anomalie-Erkennung deaktiviert',
          'success'
        );
      } else {
        e.target.checked = !enabled;
        this.showToast('Fehler beim Speichern der Einstellung', 'error');
      }
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Anomalie-Erkennung:', error);
      e.target.checked = !enabled;
      this.showToast('Fehler beim Speichern der Einstellung', 'error');
    }
  }

  // API-Key Sichtbarkeit umschalten
  toggleApiKeyVisibility() {
    const input = document.getElementById('chatgpt_api_key');
    const button = document.getElementById('toggleApiKeyVisibility');
    if (input && button) {
      if (input.type === 'password') {
        input.type = 'text';
        button.textContent = '🙈';
      } else {
        input.type = 'password';
        button.textContent = '👁️';
      }
    }
  }

  // ChatGPT API-Key speichern
  async handleChatGPTApiKeySubmit(e) {
    e.preventDefault();
    
    const apiKeyInput = document.getElementById('chatgpt_api_key');
    const apiKey = apiKeyInput?.value?.trim();
    
    if (!apiKey) {
      alert('Bitte geben Sie einen API-Key ein.');
      return;
    }
    
    if (!apiKey.startsWith('sk-')) {
      alert('Ungültiges Format. OpenAI API-Keys beginnen mit "sk-".');
      return;
    }
    
    try {
      const result = await EinstellungenService.updateChatGPTApiKey(apiKey);
      alert(result.message || 'API-Key wurde gespeichert.');
      apiKeyInput.value = ''; // Eingabefeld leeren
      await this.loadWerkstattSettings(); // Status aktualisieren
    } catch (error) {
      console.error('Fehler beim Speichern des API-Keys:', error);
      alert('Fehler: ' + (error.message || 'API-Key konnte nicht gespeichert werden.'));
    }
  }

  // ChatGPT API-Key testen
  async testChatGPTApiKey() {
    const resultDiv = document.getElementById('apiKeyTestResult');
    if (!resultDiv) return;
    
    resultDiv.style.display = 'block';
    resultDiv.className = 'api-test-result testing';
    resultDiv.innerHTML = '<span class="loading-spinner">⏳</span> Verbindung wird getestet...';
    
    try {
      const result = await EinstellungenService.testChatGPTApiKey();
      
      if (result.success) {
        resultDiv.className = 'api-test-result success';
        resultDiv.innerHTML = '✅ ' + result.message;
      } else {
        resultDiv.className = 'api-test-result error';
        resultDiv.innerHTML = '❌ ' + (result.error || 'Test fehlgeschlagen');
      }
    } catch (error) {
      resultDiv.className = 'api-test-result error';
      resultDiv.innerHTML = '❌ ' + (error.message || 'Verbindungsfehler');
    }
    
    // Ergebnis nach 10 Sekunden ausblenden
    setTimeout(() => {
      resultDiv.style.display = 'none';
    }, 10000);
  }

  // ChatGPT API-Key löschen
  async deleteChatGPTApiKey() {
    if (!confirm('Möchten Sie den API-Key wirklich löschen?')) {
      return;
    }
    
    try {
      const result = await EinstellungenService.deleteChatGPTApiKey();
      alert(result.message || 'API-Key wurde gelöscht.');
      await this.loadWerkstattSettings(); // Status aktualisieren
    } catch (error) {
      console.error('Fehler beim Löschen des API-Keys:', error);
      alert('Fehler: ' + (error.message || 'API-Key konnte nicht gelöscht werden.'));
    }
  }

  // Ersatzautos laden und anzeigen
  async loadErsatzautos() {
    try {
      const heute = this.formatDateLocal(new Date());
      const [autos, heuteVerfuegbarkeit, aktuelleBuchungen] = await Promise.all([
        ErsatzautosService.getAll(),
        ErsatzautosService.getVerfuegbarkeit(heute),
        ErsatzautosService.getAktuelleBuchungen()
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
      
      // Schnellzugriff-Kacheln rendern mit Buchungs-Info
      this.renderErsatzautoKacheln(autos.filter(a => a.aktiv), heuteVerfuegbarkeit.vergeben, aktuelleBuchungen);
      
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
  renderErsatzautoKacheln(autos, anzahlVergeben = 0, aktuelleBuchungen = []) {
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
    
    // Zähle nicht-gesperrte Autos
    const nichtGesperrteAutos = autos.filter(auto => {
      const gesperrtBis = auto.gesperrt_bis;
      const istAbgelaufen = gesperrtBis && gesperrtBis < heute;
      return !(auto.manuell_gesperrt === 1 && !istAbgelaufen);
    });
    
    // Markiere X Autos als "vergeben" (die nicht-gesperrten, von oben nach unten)
    let vergebeneCount = 0;
    
    container.innerHTML = autos.map(auto => {
      // Prüfen ob Sperrung abgelaufen ist
      const gesperrtBis = auto.gesperrt_bis;
      const istAbgelaufen = gesperrtBis && gesperrtBis < heute;
      const istGesperrt = auto.manuell_gesperrt === 1 && !istAbgelaufen;
      const sperrgrund = auto.sperrgrund || null;
      const gesperrtSeit = auto.gesperrt_seit || null;
      
      // Prüfe ob dieses Auto als "vergeben" markiert werden soll
      // (nicht manuell gesperrt, aber durch Termine belegt)
      let istVergeben = false;
      let vergebenBuchung = null;
      if (!istGesperrt && vergebeneCount < anzahlVergeben) {
        istVergeben = true;
        vergebeneCount++;
        // Finde passende Buchung zur Anzeige (erste verfügbare)
        if (aktuelleBuchungen && aktuelleBuchungen.length >= vergebeneCount) {
          vergebenBuchung = aktuelleBuchungen[vergebeneCount - 1];
        }
      }
      
      // Status-Klasse und Texte bestimmen
      let statusClass, statusText, icon, hinweisText;
      
      if (istGesperrt) {
        statusClass = 'gesperrt';
        statusText = gesperrtBis ? `Gesperrt bis ${new Date(gesperrtBis).toLocaleDateString('de-DE')}` : 'Gesperrt';
        icon = '🔴';
        hinweisText = '🔓 Klicken zum Freigeben';
      } else if (istVergeben) {
        statusClass = 'vergeben';
        statusText = 'Vergeben';
        icon = '🟠';
        hinweisText = '📋 Durch Termin belegt';
      } else {
        statusClass = 'verfuegbar';
        statusText = 'Verfügbar';
        icon = '🟢';
        hinweisText = '🔒 Klicken zum Sperren';
      }
      
      // Sperrgrund-Anzeige
      let sperrgrundHtml = '';
      if (istGesperrt && sperrgrund) {
        sperrgrundHtml = `<div class="kachel-sperrgrund">⛔ ${sperrgrund}</div>`;
      }
      
      // Gesperrt seit Anzeige
      let gesperrtSeitHtml = '';
      if (istGesperrt && gesperrtSeit) {
        gesperrtSeitHtml = `<div class="kachel-gesperrt-seit">📅 Seit: ${new Date(gesperrtSeit).toLocaleDateString('de-DE')}</div>`;
      }
      
      // Vergeben-Info anzeigen
      let vergebenInfoHtml = '';
      let vergebenKunde = '';
      let vergebenKennzeichen = '';
      let vergebenTerminId = null;
      if (istVergeben && vergebenBuchung) {
        vergebenKunde = vergebenBuchung.kunde_name || 'Kunde';
        vergebenKennzeichen = vergebenBuchung.kennzeichen || '';
        vergebenTerminId = vergebenBuchung.id;
        vergebenInfoHtml = `
          <div class="kachel-vergeben-info">
            <div>👤 ${vergebenKunde}</div>
            <div>🚗 ${vergebenKennzeichen}</div>
          </div>`;
      }
      
      // Klick-Handler - auch für vergebene Autos (zum Freigeben wenn Kunde früher zurückbringt)
      let onclickHandler;
      if (istVergeben && vergebenTerminId) {
        // Escape Sonderzeichen für onclick
        const safeAutoName = (auto.name || '').replace(/'/g, "\\'");
        const safeKunde = (vergebenKunde || '').replace(/'/g, "\\'");
        const safeKennzeichen = vergebenKennzeichen || '';
        onclickHandler = `onclick="app.handleVergebenesAutoKlick(${auto.id}, '${safeAutoName}', '${auto.kennzeichen}', '${safeKunde}', '${safeKennzeichen}', ${vergebenTerminId})"`;
      } else if (istVergeben) {
        // Vergeben aber keine Buchung gefunden - kein Klick-Handler
        onclickHandler = '';
      } else {
        const safeAutoName = (auto.name || '').replace(/'/g, "\\'");
        onclickHandler = `onclick="app.toggleErsatzautoVerfuegbarkeit(${auto.id}, '${safeAutoName}', '${auto.kennzeichen}', ${istGesperrt})"`;
      }
      
      // Hinweistext anpassen
      if (istVergeben) {
        hinweisText = vergebenTerminId ? '🔓 Klicken für frühere Rückgabe' : '📋 Durch Termin belegt';
      }
      
      return `
        <div class="ersatzauto-kachel ${statusClass}" 
             data-id="${auto.id}" 
             data-name="${auto.name}"
             data-kennzeichen="${auto.kennzeichen}"
             data-gesperrt="${istGesperrt ? '1' : '0'}"
             data-vergeben="${istVergeben ? '1' : '0'}"
             ${onclickHandler}>
          <div class="kachel-header">
            <span class="kachel-icon">${icon}</span>
            <span class="kachel-status">${statusText}</span>
          </div>
          <div class="kachel-name">${auto.name}</div>
          <div class="kachel-kennzeichen">${auto.kennzeichen}</div>
          ${auto.typ ? `<div class="kachel-typ">📋 ${auto.typ}</div>` : ''}
          ${sperrgrundHtml}
          ${gesperrtSeitHtml}
          ${vergebenInfoHtml}
          <div class="kachel-hinweis">
            <span>${hinweisText}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Handler für Klick auf vergebenes Ersatzauto
  async handleVergebenesAutoKlick(autoId, autoName, autoKennzeichen, kundeName, kundeKennzeichen, terminId) {
    const bestaetigung = confirm(
      `🚗 Ersatzauto früher zurückgegeben?\n\n` +
      `Das Fahrzeug "${autoName}" (${autoKennzeichen}) ist aktuell vergeben an:\n` +
      `👤 ${kundeName}\n` +
      `🚗 ${kundeKennzeichen}\n\n` +
      `Wenn der Kunde das Auto früher zurückgebracht hat, können Sie es hier als verfügbar markieren.\n\n` +
      `Möchten Sie das Auto als VERFÜGBAR markieren?`
    );
    
    if (!bestaetigung) return;
    
    try {
      // Buchung im Termin als zurückgegeben markieren (setzt ersatzauto_bis_datum auf gestern)
      await ErsatzautosService.markiereAlsZurueckgegeben(terminId);
      alert(`✅ ${autoName} (${autoKennzeichen}) ist jetzt wieder verfügbar.`);
      this.loadErsatzautos();
      this.loadDashboard();
    } catch (error) {
      console.error('Fehler beim Freigeben:', error);
      alert('❌ Fehler beim Freigeben. Bitte versuchen Sie es erneut.');
    }
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
          
          <div class="sperren-grund" style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Grund für die Sperrung (optional):</label>
            <input type="text" id="sperrenGrund" class="form-input" placeholder="z.B. TÜV, Reparatur, Unfall, Service..." style="width: 100%;">
          </div>
          
          <p style="margin-bottom: 15px; color: #64748b;">Wie lange soll das Fahrzeug gesperrt werden?</p>
          
          <div class="sperren-optionen">
            <button class="sperren-option-btn sperren-heute" onclick="app.sperrenFuerTage(${id}, 0)" title="Fahrzeug ist heute zurück und ab morgen wieder verfügbar">
              <span class="option-tage">☀️</span>
              <span class="option-label">Nur heute</span>
            </button>
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
    const grundInput = document.getElementById('sperrenGrund');
    const bisDatum = datumInput?.value;
    const sperrgrund = grundInput?.value?.trim() || null;
    
    if (!bisDatum) {
      alert('Bitte wählen Sie ein Datum aus.');
      return;
    }
    
    try {
      // Prüfen ob es Buchungen im Sperrzeitraum gibt
      const heute = this.formatDateLocal(new Date());
      const buchungen = await ErsatzautosService.getBuchungenImZeitraum(heute, bisDatum);
      
      if (buchungen && buchungen.length > 0) {
        // Warnung erstellen
        const buchungsListe = buchungen.map(b => {
          const datum = new Date(b.datum).toLocaleDateString('de-DE');
          return `• ${b.termin_nr || 'Termin'} - ${b.kunde_name || 'Unbekannt'} (${datum})`;
        }).join('\n');
        
        const warnung = `⚠️ ACHTUNG: Im Sperrzeitraum gibt es ${buchungen.length} Termin(e) mit Ersatzfahrzeug-Bedarf!\n\n${buchungsListe}\n\nMöchten Sie das Fahrzeug trotzdem sperren?`;
        
        if (!confirm(warnung)) {
          return; // Abbrechen
        }
      }
      
      await ErsatzautosService.sperrenBis(id, bisDatum, sperrgrund);
      this.closeSperrenModal();
      const grundText = sperrgrund ? ` (Grund: ${sperrgrund})` : '';
      alert(`✅ Fahrzeug gesperrt bis ${new Date(bisDatum).toLocaleDateString('de-DE')}${grundText}.`);
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

  // ========== SCHNELL-STATUS-WECHSEL (Shift+Click in Planung) ==========
  
  // Schnell-Status-Dialog für Timeline-Termin anzeigen
  showSchnellStatusDialog(termin, element, startzeit, dauer) {
    // Alten Dialog entfernen falls vorhanden
    const existingDialog = document.getElementById('schnellStatusDialog');
    if (existingDialog) existingDialog.remove();
    
    const currentStatus = termin.status || 'geplant';
    const terminId = termin.id;
    
    // Aktuelle Uhrzeit
    const jetzt = new Date();
    const aktuelleZeit = `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`;
    
    // Berechne wie lange der Termin schon läuft
    const [startH, startM] = startzeit.split(':').map(Number);
    const startMinuten = startH * 60 + startM;
    const jetztMinuten = jetzt.getHours() * 60 + jetzt.getMinutes();
    const verstricheneMinuten = Math.max(0, jetztMinuten - startMinuten);
    const verstricheneText = verstricheneMinuten >= 60 
      ? `${Math.floor(verstricheneMinuten/60)}h ${verstricheneMinuten%60}min` 
      : `${verstricheneMinuten} Min`;
    
    // Arbeiten aus Termin extrahieren
    const arbeitenText = this.getTerminArbeitenText(termin);
    
    // Abholzeit formatieren
    const abholzeitText = termin.abholung_zeit || termin.abhol_zeit || '—';
    const abholDatumText = termin.abhol_datum ? this.formatDatum(termin.abhol_datum) : (termin.datum ? this.formatDatum(termin.datum) : '—');
    
    // Dauer formatieren
    const dauerText = dauer >= 60 
      ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim()
      : `${dauer} min`;
    
    // Dialog erstellen
    const dialog = document.createElement('div');
    dialog.id = 'schnellStatusDialog';
    dialog.className = 'schnell-status-dialog';
    
    // Status-spezifischer Header und Aktionen
    let statusHeader = '';
    let statusAktionen = '';
    
    if (currentStatus === 'geplant') {
      statusHeader = `
        <div class="schnell-status-header">
          <span class="status-icon">🔵</span>
          <span>Status: <strong>Geplant</strong></span>
        </div>`;
      statusAktionen = `
        <div class="schnell-status-aktion">
          <button class="btn-schnell-status btn-in-arbeit" data-action="in_arbeit">
            🔧 In Arbeit setzen
          </button>
        </div>`;
    } else if (currentStatus === 'in_arbeit') {
      statusHeader = `
        <div class="schnell-status-header">
          <span class="status-icon">🔧</span>
          <span>Status: <strong>In Arbeit</strong></span>
        </div>`;
      statusAktionen = `
        <div class="schnell-status-frage">
          <p>⏱️ Läuft seit: <strong>${verstricheneText}</strong> (aktuell ${aktuelleZeit})</p>
        </div>
        <div class="schnell-status-zeit-eingabe">
          <label>🏁 Tatsächliche Arbeitszeit:</label>
          <div class="zeit-eingabe-row">
            <input type="number" id="schnellZeitStunden" min="0" max="23" value="${Math.floor(verstricheneMinuten/60)}" placeholder="Std"> h
            <input type="number" id="schnellZeitMinuten" min="0" max="59" value="${verstricheneMinuten%60}" placeholder="Min"> min
          </div>
        </div>
        <div class="schnell-status-aktionen">
          <button class="btn-schnell-status btn-abgeschlossen" data-action="abgeschlossen-custom">
            ✅ Abschließen
          </button>
          <button class="btn-schnell-status btn-weiter" data-action="close">
            ⏳ Läuft noch
          </button>
        </div>`;
    } else if (currentStatus === 'abgeschlossen') {
      statusHeader = `
        <div class="schnell-status-header">
          <span class="status-icon">✅</span>
          <span>Status: <strong>Abgeschlossen</strong></span>
        </div>`;
      statusAktionen = `
        <div class="schnell-status-aktion">
          <button class="btn-schnell-status btn-zurueck" data-action="in_arbeit">
            🔙 Zurück auf "In Arbeit"
          </button>
        </div>`;
    } else {
      statusHeader = `
        <div class="schnell-status-header">
          <span class="status-icon">❓</span>
          <span>Status: <strong>${currentStatus}</strong></span>
        </div>`;
      statusAktionen = `
        <div class="schnell-status-aktion">
          <button class="btn-schnell-status btn-in-arbeit" data-action="in_arbeit">
            🔧 In Arbeit setzen
          </button>
        </div>`;
    }
    
    dialog.innerHTML = `
      <div class="schnell-status-content erweitert">
        <button class="schnell-status-close" data-action="close">×</button>
        
        ${statusHeader}
        
        <div class="schnell-status-details">
          <div class="detail-row titel">
            <span class="detail-label">📋</span>
            <span class="detail-value"><strong>${termin.termin_nr}</strong> — ${termin.kunde_name || 'Unbekannt'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">🚗</span>
            <span class="detail-value">${termin.kennzeichen || '—'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">🔧</span>
            <span class="detail-value arbeit-text">${arbeitenText}</span>
          </div>
          <div class="detail-divider"></div>
          <div class="detail-row">
            <span class="detail-label">⏱️</span>
            <span class="detail-value">Geplant: <strong>${dauerText}</strong> ab ${startzeit}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">📅</span>
            <span class="detail-value">Abholung: <strong>${abholzeitText}</strong> (${abholDatumText})</span>
          </div>
        </div>
        
        ${statusAktionen}
        
        <div class="schnell-status-footer">
          <button class="btn-schnell-link" data-action="erweitern" title="Auftrag erweitern">
            ➕ Erweitern
          </button>
          <button class="btn-schnell-link" data-action="erweitert" title="Mehr bearbeiten">
            ✏️ Mehr...
          </button>
        </div>
      </div>
    `;
    
    // Position berechnen (nahe am Element)
    const rect = element.getBoundingClientRect();
    document.body.appendChild(dialog);
    
    // Event-Listener für Buttons hinzufügen (Arrow-Function behält this-Kontext)
    dialog.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        
        if (action === 'close') {
          this.closeSchnellStatusDialog();
        } else if (action === 'abgeschlossen') {
          const zeit = parseInt(btn.dataset.zeit) || null;
          this.setzeSchnellStatus(terminId, 'abgeschlossen', zeit);
        } else if (action === 'abgeschlossen-custom') {
          // Tatsächliche Zeit aus Eingabefeldern lesen
          const stunden = parseInt(document.getElementById('schnellZeitStunden')?.value) || 0;
          const minuten = parseInt(document.getElementById('schnellZeitMinuten')?.value) || 0;
          const gesamtMinuten = stunden * 60 + minuten;
          this.setzeSchnellStatus(terminId, 'abgeschlossen', gesamtMinuten > 0 ? gesamtMinuten : null);
        } else if (action === 'erweitern') {
          // Auftrag erweitern - Modal öffnen
          this.closeSchnellStatusDialog();
          this.openErweiterungModalForTermin(terminId);
        } else if (action === 'erweitert') {
          // Erweitertes Bearbeitungs-Popup öffnen
          this.closeSchnellStatusDialog();
          this.showSchnellBearbeitungDialog(termin);
        } else {
          this.setzeSchnellStatus(terminId, action);
        }
      });
    });
    
    // Dialog positionieren
    const dialogRect = dialog.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - dialogRect.width / 2;
    let top = rect.bottom + 10;
    
    // Bildschirmgrenzen prüfen
    if (left < 10) left = 10;
    if (left + dialogRect.width > window.innerWidth - 10) {
      left = window.innerWidth - dialogRect.width - 10;
    }
    if (top + dialogRect.height > window.innerHeight - 10) {
      top = rect.top - dialogRect.height - 10;
    }
    
    dialog.style.left = `${left}px`;
    dialog.style.top = `${top}px`;
    
    // Animation
    setTimeout(() => dialog.classList.add('active'), 10);
    
    // Click außerhalb schließt Dialog
    setTimeout(() => {
      document.addEventListener('click', this.handleSchnellStatusOutsideClick);
    }, 100);
  }
  
  // Click außerhalb des Dialogs
  handleSchnellStatusOutsideClick = (e) => {
    const dialog = document.getElementById('schnellStatusDialog');
    if (dialog && !dialog.contains(e.target)) {
      this.closeSchnellStatusDialog();
    }
  }
  
  // Dialog schließen
  closeSchnellStatusDialog() {
    const dialog = document.getElementById('schnellStatusDialog');
    if (dialog) {
      dialog.classList.remove('active');
      setTimeout(() => dialog.remove(), 200);
    }
    document.removeEventListener('click', this.handleSchnellStatusOutsideClick);
  }
  
  // Schnell-Bearbeitungs-Dialog (erweitertes Popup)
  showSchnellBearbeitungDialog(termin) {
    // Alten Dialog entfernen falls vorhanden
    const existingDialog = document.getElementById('schnellBearbeitungDialog');
    if (existingDialog) existingDialog.remove();
    
    const terminId = termin.id;
    
    // Aktuelle Werte
    const arbeitenText = this.getTerminArbeitenText(termin);
    const abholzeit = termin.abholung_zeit || termin.abhol_zeit || '';
    const abholDatum = termin.abhol_datum || termin.datum || '';
    
    // Fertigstellungszeit berechnen (Startzeit + Dauer)
    let fertigstellungszeit = termin.fertigstellung_zeit || termin.geplante_fertigstellung || '';
    if (!fertigstellungszeit) {
      // Berechne aus Startzeit + Dauer
      const startzeit = termin.startzeit || termin.bring_zeit || '08:00';
      const dauer = termin.geschaetzte_dauer || this.getTerminGesamtdauer(termin) || 60;
      fertigstellungszeit = this.berechneEndzeit(startzeit, dauer);
    }
    
    // Dialog erstellen
    const dialog = document.createElement('div');
    dialog.id = 'schnellBearbeitungDialog';
    dialog.className = 'schnell-bearbeitung-dialog';
    
    dialog.innerHTML = `
      <div class="schnell-bearbeitung-overlay"></div>
      <div class="schnell-bearbeitung-content">
        <div class="schnell-bearbeitung-header">
          <h3>✏️ ${termin.termin_nr} bearbeiten</h3>
          <button class="schnell-bearbeitung-close" data-action="close">×</button>
        </div>
        
        <div class="schnell-bearbeitung-info">
          <span>🚗 ${termin.kennzeichen || '—'}</span>
          <span>👤 ${termin.kunde_name || 'Unbekannt'}</span>
        </div>
        
        <div class="schnell-bearbeitung-form">
          <div class="form-group">
            <label>🔧 Arbeit / Beschreibung</label>
            <textarea id="schnellArbeit" rows="3" placeholder="Arbeiten beschreiben...">${termin.arbeit || arbeitenText || ''}</textarea>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>📅 Abholdatum</label>
              <input type="date" id="schnellAbholDatum" value="${abholDatum}">
            </div>
            <div class="form-group">
              <label>🕐 Abholzeit</label>
              <input type="time" id="schnellAbholZeit" value="${abholzeit}">
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>🕒 Startzeit</label>
              <input type="time" id="schnellStartzeit" value="${termin.startzeit || termin.bring_zeit || '08:00'}">
            </div>
            <div class="form-group">
              <label>🏁 Fertigstellungszeit</label>
              <input type="time" id="schnellFertigstellung" value="${fertigstellungszeit}">
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>⏱️ Geschätzte Dauer (Min)</label>
              <input type="number" id="schnellDauer" min="0" value="${termin.geschaetzte_zeit || this.getTerminGesamtdauer(termin) || 60}">
            </div>
            <div class="form-group">
              <label>📝 Notizen</label>
              <input type="text" id="schnellNotizen" value="${termin.notizen || ''}" placeholder="Kurze Notiz...">
            </div>
          </div>
        </div>
        
        <div class="schnell-bearbeitung-footer">
          <button class="btn-schnell-cancel" data-action="close">Abbrechen</button>
          <button class="btn-schnell-save" data-action="speichern">💾 Speichern</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Event-Listener
    dialog.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        
        if (action === 'close') {
          this.closeSchnellBearbeitungDialog();
        } else if (action === 'speichern') {
          await this.speichereSchnellBearbeitung(terminId);
        }
      });
    });
    
    // Overlay schließt Dialog
    dialog.querySelector('.schnell-bearbeitung-overlay').addEventListener('click', () => {
      this.closeSchnellBearbeitungDialog();
    });
    
    // Animation
    setTimeout(() => dialog.classList.add('active'), 10);
    
    // Focus auf erstes Feld
    setTimeout(() => {
      document.getElementById('schnellArbeit')?.focus();
    }, 100);
  }
  
  // Schnell-Bearbeitungs-Dialog schließen
  closeSchnellBearbeitungDialog() {
    const dialog = document.getElementById('schnellBearbeitungDialog');
    if (dialog) {
      dialog.classList.remove('active');
      setTimeout(() => dialog.remove(), 200);
    }
  }
  
  // Schnell-Bearbeitung speichern
  async speichereSchnellBearbeitung(terminId) {
    try {
      const updateData = {};
      const termin = this.termineById[terminId];
      
      // Werte aus Formular lesen
      const arbeit = document.getElementById('schnellArbeit')?.value?.trim();
      const abholDatum = document.getElementById('schnellAbholDatum')?.value;
      const abholZeit = document.getElementById('schnellAbholZeit')?.value;
      const startzeit = document.getElementById('schnellStartzeit')?.value;
      const fertigstellung = document.getElementById('schnellFertigstellung')?.value;
      let dauer = parseInt(document.getElementById('schnellDauer')?.value) || null;
      const notizen = document.getElementById('schnellNotizen')?.value?.trim();
      
      // Wenn Fertigstellungszeit geändert wurde, berechne neue Dauer
      if (fertigstellung && startzeit) {
        const [startH, startM] = startzeit.split(':').map(Number);
        const [endH, endM] = fertigstellung.split(':').map(Number);
        const startMinuten = startH * 60 + startM;
        const endMinuten = endH * 60 + endM;
        const berechnungsDauer = endMinuten - startMinuten;
        
        // Nur übernehmen wenn positiv
        if (berechnungsDauer > 0) {
          dauer = berechnungsDauer;
        }
      }
      
      // Nur geänderte Felder übernehmen
      if (arbeit !== undefined) updateData.arbeit = arbeit;
      if (abholDatum) updateData.abhol_datum = abholDatum;
      if (abholZeit) updateData.abholung_zeit = abholZeit;
      if (startzeit) updateData.startzeit = startzeit;
      if (fertigstellung) updateData.fertigstellung_zeit = fertigstellung;
      if (dauer) {
        // Bei "in_arbeit" oder "abgeschlossen" -> tatsaechliche_zeit für Balkenlänge
        // Sonst -> geschaetzte_zeit
        if (termin && (termin.status === 'in_arbeit' || termin.status === 'abgeschlossen')) {
          updateData.tatsaechliche_zeit = dauer;
        } else {
          updateData.geschaetzte_zeit = dauer;
        }
      }
      if (notizen !== undefined) updateData.notizen = notizen;
      
      // Speichern
      await TermineService.update(terminId, updateData);
      
      // Cache aktualisieren
      if (this.termineById[terminId]) {
        Object.assign(this.termineById[terminId], updateData);
      }
      
      // Dialog schließen
      this.closeSchnellBearbeitungDialog();
      
      // Feedback
      this.showToast('✅ Termin aktualisiert', 'success');
      
      // Auslastung neu laden falls aktiv
      if (document.getElementById('auslastung-dragdrop')?.classList.contains('active')) {
        this.loadAuslastungDragDrop();
      }
      
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      this.showToast('❌ Fehler beim Speichern', 'error');
    }
  }
  
  // Schnell-Status setzen
  async setzeSchnellStatus(terminId, neuerStatus, tatsaechlicheMinuten = null) {
    try {
      const updateData = { status: neuerStatus };
      
      // Bei Abschluss: tatsächliche Zeit setzen
      if (neuerStatus === 'abgeschlossen' && tatsaechlicheMinuten !== null) {
        updateData.tatsaechliche_zeit = tatsaechlicheMinuten;
      }
      
      await TermineService.update(terminId, updateData);
      
      // Cache aktualisieren
      if (this.termineById[terminId]) {
        this.termineById[terminId].status = neuerStatus;
        if (tatsaechlicheMinuten !== null) {
          this.termineById[terminId].tatsaechliche_zeit = tatsaechlicheMinuten;
        }
      }
      
      // Dialog schließen
      this.closeSchnellStatusDialog();
      
      // Feedback
      const statusEmoji = {
        'geplant': '🔵',
        'in_arbeit': '🔧',
        'abgeschlossen': '✅'
      };
      
      let message = `${statusEmoji[neuerStatus] || '✓'} Status geändert: ${neuerStatus.replace('_', ' ')}`;
      if (neuerStatus === 'abgeschlossen' && tatsaechlicheMinuten !== null) {
        const zeitText = tatsaechlicheMinuten >= 60 
          ? `${Math.floor(tatsaechlicheMinuten/60)}h ${tatsaechlicheMinuten%60}min`
          : `${tatsaechlicheMinuten} Min`;
        message += ` (Arbeitszeit: ${zeitText})`;
      }
      this.showToast(message, 'success');
      
      // Timeline aktualisieren (visuell den Balken kürzen bei Abschluss)
      if (neuerStatus === 'abgeschlossen' && tatsaechlicheMinuten !== null) {
        this.updateTimelineBlockVisual(terminId, tatsaechlicheMinuten);
      } else {
        // Nur Status-Klasse aktualisieren
        this.updateTimelineBlockStatus(terminId, neuerStatus);
      }
      
      // Dashboard und andere Views aktualisieren
      this.loadDashboard();
      await this.loadHeuteTermine();
      
    } catch (error) {
      console.error('Fehler beim Status-Wechsel:', error);
      this.showToast('❌ Fehler beim Status-Wechsel', 'error');
    }
  }
  
  // Timeline-Block Status visuell aktualisieren
  updateTimelineBlockStatus(terminId, neuerStatus) {
    // Status-Farben für border-left (überschreibt Inline-Styles)
    const statusFarben = {
      'geplant': '#1d4ed8',
      'in_arbeit': '#b45309',
      'in-arbeit': '#b45309',
      'abgeschlossen': '#047857'
    };
    
    // Status-Hintergründe
    const statusHintergrund = {
      'geplant': 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
      'in_arbeit': 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
      'in-arbeit': 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
      'abgeschlossen': 'linear-gradient(135deg, #10b981 0%, #34d399 100%)'
    };
    
    const statusKey = neuerStatus.toLowerCase().replace(' ', '-');
    
    const block = document.getElementById(`timeline-termin-${terminId}`);
    if (block) {
      // Alte Status-Klassen entfernen
      block.classList.remove('status-geplant', 'status-in_arbeit', 'status-in-arbeit', 'status-abgeschlossen');
      // Neue Status-Klasse hinzufügen
      block.classList.add(`status-${statusKey}`);
      // Inline-Styles direkt setzen um CSS zu überschreiben
      if (statusFarben[statusKey]) {
        block.style.borderLeft = `4px solid ${statusFarben[statusKey]}`;
      }
      if (statusHintergrund[statusKey]) {
        block.style.background = statusHintergrund[statusKey];
      }
    }
    
    // Auch Arbeit-Blöcke aktualisieren
    document.querySelectorAll(`[id^="timeline-arbeit-${terminId}-"]`).forEach(arbeitBlock => {
      arbeitBlock.classList.remove('status-geplant', 'status-in_arbeit', 'status-in-arbeit', 'status-abgeschlossen');
      arbeitBlock.classList.add(`status-${statusKey}`);
      // Inline-Styles direkt setzen um CSS zu überschreiben
      if (statusFarben[statusKey]) {
        arbeitBlock.style.borderLeft = `4px solid ${statusFarben[statusKey]}`;
      }
      if (statusHintergrund[statusKey]) {
        arbeitBlock.style.background = statusHintergrund[statusKey];
      }
    });
  }
  
  // Timeline-Block visuell kürzen (bei Abschluss mit tatsächlicher Zeit)
  // Nur kürzen, nicht verlängern!
  updateTimelineBlockVisual(terminId, tatsaechlicheMinuten) {
    const block = document.getElementById(`timeline-termin-${terminId}`);
    if (block) {
      // Status aktualisieren
      this.updateTimelineBlockStatus(terminId, 'abgeschlossen');
      
      // Ursprüngliche Dauer aus data-Attribut holen
      const originalDauer = parseInt(block.dataset.dauer) || 0;
      
      // Nur kürzen wenn tatsächliche Zeit kürzer als geplant, NICHT verlängern
      if (tatsaechlicheMinuten < originalDauer) {
        // Breite anpassen (100px pro Stunde = 1.67px pro Minute)
        const pixelPerMinute = 100 / 60;
        const neueBreite = Math.max(tatsaechlicheMinuten * pixelPerMinute, 40); // Mindestbreite 40px
        
        // Animation für den Balken
        block.style.transition = 'width 0.3s ease-out';
        block.style.width = `${neueBreite}px`;
      }
      
      // Termin-Info aktualisieren
      const infoElement = block.querySelector('.termin-info');
      if (infoElement) {
        const zeitText = tatsaechlicheMinuten >= 60 
          ? `${Math.floor(tatsaechlicheMinuten/60)}h ${tatsaechlicheMinuten%60 > 0 ? (tatsaechlicheMinuten%60) + 'min' : ''}`.trim()
          : `${tatsaechlicheMinuten} min`;
        const kundenName = infoElement.textContent.split('•')[0].trim();
        infoElement.innerHTML = `${kundenName} • ✅ ${zeitText}`;
      }
      
      // Fortsetzungs-Teil entfernen falls vorhanden (nur wenn gekürzt)
      if (tatsaechlicheMinuten < originalDauer) {
        const teil2 = document.getElementById(`timeline-termin-${terminId}-teil2`);
        if (teil2) {
          teil2.style.transition = 'opacity 0.3s ease-out';
          teil2.style.opacity = '0';
          setTimeout(() => teil2.remove(), 300);
        }
      }
    }
  }

  // Aktuelle Buchungen laden und anzeigen (inkl. manuell gesperrte Autos)
  async loadErsatzautoBuchungen() {
    const container = document.getElementById('ersatzautoBuchungen');
    if (!container) return;
    
    try {
      const heute = this.formatDateLocal(new Date());
      
      // Lade Buchungen UND alle Ersatzautos parallel
      const [buchungen, alleAutos] = await Promise.all([
        ErsatzautosService.getAktuelleBuchungen(),
        ErsatzautosService.getAll()
      ]);
      
      // Finde manuell gesperrte Autos (aktive Sperrung)
      const gesperrteAutos = alleAutos.filter(auto => {
        if (!auto.aktiv) return false;
        if (auto.manuell_gesperrt !== 1) return false;
        // Prüfe ob Sperrung abgelaufen
        if (auto.gesperrt_bis && auto.gesperrt_bis < heute) return false;
        return true;
      });
      
      const hatBuchungen = buchungen && buchungen.length > 0;
      const hatGesperrte = gesperrteAutos && gesperrteAutos.length > 0;
      
      if (!hatBuchungen && !hatGesperrte) {
        container.innerHTML = `
          <div class="ersatzauto-empty" style="padding: 20px; text-align: center; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
            <div style="font-size: 2rem; margin-bottom: 10px;">✅</div>
            <p style="margin: 0; color: #166534;">Aktuell sind keine Ersatzautos vergeben oder gesperrt.</p>
          </div>
        `;
        return;
      }
      
      let html = '';
      
      // Zuerst manuell gesperrte Autos anzeigen
      if (hatGesperrte) {
        html += gesperrteAutos.map(auto => {
          const gesperrtBis = auto.gesperrt_bis 
            ? new Date(auto.gesperrt_bis).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'Unbefristet';
          const gesperrtSeit = auto.gesperrt_seit
            ? new Date(auto.gesperrt_seit).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : heute;
          
          return `
            <div class="buchung-card gesperrt" style="display: flex; gap: 15px; padding: 15px; background: #fef2f2; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #ef4444;">
              <div class="buchung-icon" style="font-size: 2rem;">🔒</div>
              <div class="buchung-info" style="flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                  <div>
                    <strong style="font-size: 1.1rem; color: #b91c1c;">${auto.name}</strong>
                    <span style="margin-left: 10px; color: #6b7280; font-size: 0.85rem;">${auto.kennzeichen}</span>
                  </div>
                  <span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">GESPERRT</span>
                </div>
                ${auto.sperrgrund ? `
                <div style="font-size: 0.9rem; color: #b91c1c; margin-bottom: 8px;">
                  <span style="color: #9ca3af;">⛔ Grund:</span>
                  <strong>${auto.sperrgrund}</strong>
                </div>` : ''}
                <div style="display: flex; flex-wrap: wrap; gap: 15px; font-size: 0.85rem; color: #6b7280;">
                  <div>
                    <span style="color: #9ca3af;">📅 Seit:</span> ${gesperrtSeit}
                  </div>
                  <div>
                    <span style="color: #9ca3af;">📅 Bis:</span> ${gesperrtBis}
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
      
      // Dann Buchungen durch Termine anzeigen
      if (hatBuchungen) {
        html += buchungen.map(buchung => {
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
        
        // Hol- und Bringzeiten ermitteln
        const bringZeit = buchung.bring_zeit || null;
        const abholZeit = buchung.abholung_zeit || buchung.ersatzauto_bis_zeit || null;
        
        // Zeitanzeige-HTML erstellen
        let zeitenHtml = '';
        if (bringZeit || abholZeit) {
          zeitenHtml = `
              <div style="margin-top: 6px; font-size: 0.85rem; color: #6b7280; display: flex; flex-wrap: wrap; gap: 12px;">
                ${bringZeit ? `<span>🕐 <strong>Abholung:</strong> ${bringZeit} Uhr</span>` : ''}
                ${abholZeit ? `<span>🕐 <strong>Rückgabe:</strong> ${abholZeit} Uhr</span>` : ''}
              </div>`;
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
              ${zeitenHtml}
            </div>
          </div>
        `;
      }).join('');
      }
      
      container.innerHTML = html;
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

  // Ersatzauto-Übersicht laden (Wochen-Ansicht Mo-So)
  async loadErsatzautoUebersicht() {
    const container = document.getElementById('ersatzautoUebersicht');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Lade Übersicht...</div>';
    
    try {
      // Generiere 5 Wochen (Mo-So) ab dem aktuellen Montag
      const weeks = this.getWeeksForErsatzautoView();
      const today = this.formatDateLocal(new Date());
      
      // Lade Verfügbarkeit für alle Tage parallel
      const allDays = weeks.flat();
      const verfuegbarkeitPromises = allDays.map(day => 
        ErsatzautosService.getVerfuegbarkeit(day.datum)
          .catch(() => ({ gesamt: 0, vergeben: 0, verfuegbar: 0 }))
      );
      const verfuegbarkeiten = await Promise.all(verfuegbarkeitPromises);
      
      // Erstelle Map für schnellen Zugriff
      const verfMap = new Map();
      allDays.forEach((day, idx) => verfMap.set(day.datum, verfuegbarkeiten[idx]));
      
      // Header mit Wochentagen
      let html = `
        <div class="ea-wochen-container">
          <div class="ea-wochen-header">
            <div class="ea-kw-header">KW</div>
            <div class="ea-tag-header">Mo</div>
            <div class="ea-tag-header">Di</div>
            <div class="ea-tag-header">Mi</div>
            <div class="ea-tag-header">Do</div>
            <div class="ea-tag-header">Fr</div>
            <div class="ea-tag-header">Sa</div>
            <div class="ea-tag-header">So</div>
          </div>
      `;
      
      // Jede Woche als Zeile
      weeks.forEach(week => {
        const firstDay = new Date(week[0].datum);
        const kw = this.getWeekNumber(firstDay);
        
        html += `<div class="ea-wochen-zeile">`;
        html += `<div class="ea-kw">KW ${kw}</div>`;
        
        week.forEach(day => {
          const verf = verfMap.get(day.datum) || { gesamt: 0, vergeben: 0, verfuegbar: 0 };
          const isPast = day.datum < today;
          const isToday = day.datum === today;
          const isSunday = day.dayOfWeek === 0;
          const gesperrt = verf.gesperrt || 0;
          
          let statusClass = 'frei';
          let statusText = `${verf.verfuegbar}/${verf.gesamt}`;
          let tooltipText = '';
          
          if (verf.gesamt === 0) {
            statusClass = 'keine';
            statusText = '-';
            tooltipText = 'Keine Ersatzautos';
          } else if (verf.verfuegbar === 0) {
            statusClass = 'voll';
            let details = [];
            if (verf.vergeben > 0) details.push(`${verf.vergeben} vergeben`);
            if (gesperrt > 0) details.push(`${gesperrt} gesperrt`);
            tooltipText = details.join(', ');
          } else if (verf.vergeben > 0 || gesperrt > 0) {
            statusClass = 'teilweise';
            let details = [];
            if (verf.vergeben > 0) details.push(`${verf.vergeben} vergeben`);
            if (gesperrt > 0) details.push(`${gesperrt} gesperrt`);
            tooltipText = details.join(', ');
          } else {
            tooltipText = 'Alle verfügbar';
          }
          
          const todayClass = isToday ? ' ea-heute' : '';
          const pastClass = isPast ? ' ea-vergangen' : '';
          const sundayClass = isSunday ? ' ea-sonntag' : '';
          
          html += `
            <div class="ea-tag-zelle${todayClass}${pastClass}${sundayClass} ea-status-${statusClass}" 
                 title="${day.dayNum}. ${day.monthShort}&#10;${tooltipText}">
              <div class="ea-tag-datum">${day.dayNum}</div>
              <div class="ea-tag-verfuegbar">${statusText}</div>
            </div>
          `;
        });
        
        html += `</div>`;
      });
      
      html += `</div>`;
      
      // Legende hinzufügen
      html += `
        <div class="ea-legende">
          <div class="ea-legende-item"><span class="ea-legende-dot ea-frei"></span> Frei</div>
          <div class="ea-legende-item"><span class="ea-legende-dot ea-teilweise"></span> Teilweise belegt</div>
          <div class="ea-legende-item"><span class="ea-legende-dot ea-voll"></span> Ausgebucht</div>
        </div>
      `;
      
      container.innerHTML = html;
      
    } catch (error) {
      console.error('Fehler beim Laden der Ersatzauto-Übersicht:', error);
      container.innerHTML = '<div class="loading" style="color: #ef4444;">Fehler beim Laden</div>';
    }
  }

  // Gibt Wochen für Ersatzauto-Ansicht zurück (5 Wochen, Mo-So)
  getWeeksForErsatzautoView() {
    const weeks = [];
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    
    // Finde den Montag der aktuellen Woche
    const currentDay = today.getDay();
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
    const startMonday = new Date(today);
    startMonday.setDate(today.getDate() + mondayOffset);
    
    // 5 Wochen generieren (Mo-So = 7 Tage pro Woche)
    for (let weekNum = 0; weekNum < 5; weekNum++) {
      const week = [];
      for (let dayNum = 0; dayNum < 7; dayNum++) { // Mo=0 bis So=6
        const day = new Date(startMonday);
        day.setDate(startMonday.getDate() + (weekNum * 7) + dayNum);
        
        const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
        
        week.push({
          datum: this.formatDateLocal(day),
          dayNum: day.getDate(),
          monthShort: monthNames[day.getMonth()],
          dayOfWeek: day.getDay() // 0=So, 1=Mo, ..., 6=Sa
        });
      }
      weeks.push(week);
    }
    return weeks;
  }

  // Kalenderwoche berechnen
  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
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

  // Berufsschul-Turnus für Lehrlinge laden und anzeigen
  async loadBerufsschulLehrlinge() {
    try {
      const lehrlinge = await LehrlingeService.getAktive();
      const tbody = document.querySelector('#berufsschulTable tbody');
      
      if (!tbody) return;
      tbody.innerHTML = '';

      if (lehrlinge.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #666;">Keine Lehrlinge vorhanden</td></tr>';
        return;
      }

      // Aktuelle KW berechnen
      const aktuelleKW = this.getKalenderwoche(new Date());

      lehrlinge.forEach(lehrling => {
        const row = document.createElement('tr');
        const schulwochen = lehrling.berufsschul_wochen || '';
        
        // Prüfe ob Lehrling gerade in Berufsschule ist
        const schulwochenArray = schulwochen.split(',').map(w => parseInt(w.trim(), 10)).filter(w => !isNaN(w));
        const istInSchule = schulwochenArray.includes(aktuelleKW);
        const statusBadge = istInSchule 
          ? '<span style="background: #1565c0; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-left: 8px;">📚 Aktuell in Schule (KW ' + aktuelleKW + ')</span>'
          : '';

        row.innerHTML = `
          <td>
            <strong>${lehrling.name}</strong>${statusBadge}
          </td>
          <td>
            <input type="text" 
                   id="berufsschul_${lehrling.id}" 
                   value="${schulwochen}" 
                   placeholder="z.B. 2,4,6,8,10,12"
                   style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          </td>
          <td>
            <button class="btn btn-primary" onclick="app.saveBerufsschulWochen(${lehrling.id})">💾 Speichern</button>
          </td>
        `;
        tbody.appendChild(row);
      });
    } catch (error) {
      console.error('Fehler beim Laden der Lehrlinge für Berufsschule:', error);
    }
  }

  // Berufsschul-Wochen für einen Lehrling speichern
  async saveBerufsschulWochen(lehrlingId) {
    const input = document.getElementById(`berufsschul_${lehrlingId}`);
    if (!input) return;

    const wochen = input.value.trim();
    
    // Validierung: Nur Zahlen und Kommas erlaubt
    if (wochen && !/^(\d{1,2})(,\s*\d{1,2})*$/.test(wochen)) {
      alert('Ungültiges Format. Bitte nur Kalenderwochen komma-getrennt eingeben (z.B. 2,4,6,8,10)');
      return;
    }

    try {
      await LehrlingeService.update(lehrlingId, { berufsschul_wochen: wochen });
      this.showToast(`Berufsschul-Wochen für Lehrling gespeichert`, 'success');
      
      // Tabelle neu laden um Status-Badge zu aktualisieren
      this.loadBerufsschulLehrlinge();
      
      // Auch Lehrlinge-Tabelle aktualisieren falls geöffnet
      this.loadLehrlinge();
    } catch (error) {
      console.error('Fehler beim Speichern der Berufsschul-Wochen:', error);
      alert('Fehler beim Speichern. Bitte erneut versuchen.');
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

  /**
   * Prüft wie viele andere Termine ±15 Minuten um die eingegebene Bringzeit liegen
   * und zeigt einen Hinweis sowie Vorschläge für freie Zeiten an
   */
  async pruefeBringzeitUeberschneidung(bringzeitInputId, datumInputId, hinweisElementId, excludeTerminId = null) {
    const bringzeitInput = document.getElementById(bringzeitInputId);
    const datumInput = document.getElementById(datumInputId);
    const hinweisElement = document.getElementById(hinweisElementId);
    
    if (!bringzeitInput || !datumInput || !hinweisElement) return;
    
    const bringzeit = bringzeitInput.value;
    const datum = datumInput.value;
    
    // Validiere Eingaben
    if (!bringzeit || !bringzeit.match(/^\d{2}:\d{2}$/) || !datum) {
      hinweisElement.style.display = 'none';
      return;
    }
    
    try {
      // API-Anfrage um Termine mit ähnlicher Bringzeit zu finden
      const response = await TermineService.getBringzeitUeberschneidungen(datum, bringzeit, excludeTerminId);
      
      const anzahl = response.anzahl || 0;
      const termine = response.termine || [];
      const vorschlaege = response.vorschlaege || [];
      
      let hinweisHtml = '';
      
      if (anzahl === 0) {
        hinweisHtml = `<span class="hinweis-icon">✅</span> Keine anderen Kunden um ${bringzeit}`;
        hinweisElement.className = 'bringzeit-hinweis hinweis-ok';
      } else if (anzahl <= 2) {
        const kundenText = termine.map(t => t.kunde_name || t.kennzeichen).slice(0, 2).join(', ');
        hinweisHtml = `<span class="hinweis-icon">ℹ️</span> ${anzahl} Kunde(n) um diese Zeit: ${kundenText}`;
        hinweisElement.className = 'bringzeit-hinweis hinweis-ok';
      } else if (anzahl <= 4) {
        hinweisHtml = `<span class="hinweis-icon">⚠️</span> ${anzahl} Kunden kommen ±15 Min. um ${bringzeit}`;
        hinweisElement.className = 'bringzeit-hinweis hinweis-warnung';
      } else {
        hinweisHtml = `<span class="hinweis-icon">🚨</span> ${anzahl} Kunden kommen ±15 Min. um ${bringzeit} - Zeitfenster voll!`;
        hinweisElement.className = 'bringzeit-hinweis hinweis-kritisch';
      }
      
      // Vorschläge für freie Zeiten anzeigen (wenn es Überschneidungen gibt)
      if (anzahl > 0 && vorschlaege.length > 0) {
        const freieZeiten = vorschlaege.filter(v => v.frei).slice(0, 4);
        const wenigBelegteZeiten = vorschlaege.filter(v => !v.frei).slice(0, 2);
        
        if (freieZeiten.length > 0 || wenigBelegteZeiten.length > 0) {
          hinweisHtml += `<div class="bringzeit-vorschlaege">`;
          hinweisHtml += `<span class="vorschlaege-label">💡 Freie Zeiten:</span>`;
          
          freieZeiten.forEach(v => {
            hinweisHtml += `<button type="button" class="vorschlag-btn vorschlag-frei" data-zeit="${v.zeit}" data-input="${bringzeitInputId}" title="Komplett frei">${v.zeit}</button>`;
          });
          
          wenigBelegteZeiten.forEach(v => {
            hinweisHtml += `<button type="button" class="vorschlag-btn vorschlag-wenig" data-zeit="${v.zeit}" data-input="${bringzeitInputId}" title="1 Kunde um diese Zeit">${v.zeit}</button>`;
          });
          
          hinweisHtml += `</div>`;
        }
      }
      
      hinweisElement.innerHTML = hinweisHtml;
      hinweisElement.style.display = 'block';
      
      // Event-Listener für Vorschlag-Buttons hinzufügen
      hinweisElement.querySelectorAll('.vorschlag-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const zeit = btn.dataset.zeit;
          const inputId = btn.dataset.input;
          const input = document.getElementById(inputId);
          if (input) {
            input.value = zeit;
            // Trigger change event um die Prüfung neu auszuführen
            input.dispatchEvent(new Event('change'));
          }
        });
      });
      
    } catch (error) {
      console.error('Fehler bei Bringzeit-Prüfung:', error);
      hinweisElement.style.display = 'none';
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
    // Teile nach Zeilenumbruch, Komma ODER ||
    return text
      .split(/[\r\n,]+|\s*\|\|\s*/)
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
    const mittagspauseField = document.getElementById('mittagspause_minuten');
    
    if (!servicezeitField) {
      alert('Servicezeit-Feld nicht gefunden.');
      return;
    }

    const servicezeit = parseInt(servicezeitField.value, 10);
    const ersatzautoAnzahl = ersatzautoField ? parseInt(ersatzautoField.value, 10) : 2;
    const nebenzeit = nebenzeitField ? parseFloat(nebenzeitField.value) : 0;
    const mittagspause = mittagspauseField ? parseInt(mittagspauseField.value, 10) : 30;

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

    if (!Number.isFinite(mittagspause) || mittagspause < 0 || mittagspause > 120) {
      alert('Bitte eine gültige Mittagspause eingeben (0-120 Minuten).');
      return;
    }

    try {
      // Lade aktuelle Einstellungen, um Pufferzeit beizubehalten
      const aktuelleEinstellungen = await EinstellungenService.getWerkstatt();
      
      await EinstellungenService.updateWerkstatt({
        pufferzeit_minuten: aktuelleEinstellungen?.pufferzeit_minuten || 15,
        servicezeit_minuten: servicezeit,
        ersatzauto_anzahl: ersatzautoAnzahl,
        nebenzeit_prozent: nebenzeit,
        mittagspause_minuten: mittagspause
      });
      alert('Einstellungen gespeichert.');
      // WICHTIG: Erst Einstellungen laden, dann Auslastung (sonst überschreibt Auslastung mit alten Daten)
      await this.loadWerkstattSettings();
      this.loadAuslastung();
      this.loadDashboard();
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
          <td><input type="text" id="mitarbeiter_mittagspause_${ma.id}" value="${ma.mittagspause_start || '12:00'}" style="width: 100%; padding: 5px; text-align: center;" placeholder="HH:MM" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" title="24h-Format (z.B. 12:00)" oninput="this.value = this.value.replace(/[^0-9:]/g, ''); if(this.value.length === 2 && !this.value.includes(':')) this.value += ':';"></td>
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
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Keine Lehrlinge vorhanden</td></tr>';
        return;
      }

      // Aktuelle KW berechnen für Anzeige
      const aktuelleKW = this.getKalenderwoche(new Date());

      lehrlinge.forEach(l => {
        const row = tbody.insertRow();
        // Berufsschul-Anzeige: nur lesend mit Status
        const schulwochen = l.berufsschul_wochen || '';
        const schulwochenArray = schulwochen.split(',').map(w => parseInt(w.trim(), 10)).filter(w => !isNaN(w));
        const istInSchule = schulwochenArray.includes(aktuelleKW);
        let schulAnzeige = schulwochen ? schulwochen : '<span style="color: #999;">-</span>';
        if (istInSchule) {
          schulAnzeige = `<span style="color: #1565c0; font-weight: bold;">📚 ${schulwochen}</span>`;
        }
        
        row.innerHTML = `
          <td><input type="text" id="lehrling_name_${l.id}" value="${l.name || ''}" style="width: 100%; padding: 5px;"></td>
          <td><input type="number" id="lehrling_aufgabe_${l.id}" value="${l.aufgabenbewaeltigung_prozent || 100}" min="0" max="500" step="1" style="width: 100%; padding: 5px;"></td>
          <td><input type="text" id="lehrling_mittagspause_${l.id}" value="${l.mittagspause_start || '12:00'}" style="width: 100%; padding: 5px; text-align: center;" placeholder="HH:MM" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" title="24h-Format (z.B. 12:00)" oninput="this.value = this.value.replace(/[^0-9:]/g, ''); if(this.value.length === 2 && !this.value.includes(':')) this.value += ':';"></td>
          <td style="text-align: center; cursor: pointer;" onclick="app.showSubTab('berufsschuleAbwesenheit')" title="Zum Bearbeiten: Klicken Sie hier oder gehen Sie zu Abwesenheiten → Berufsschule">${schulAnzeige}</td>
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
      <td><input type="text" id="new_mitarbeiter_mittagspause" value="12:00" style="width: 100%; padding: 5px; text-align: center;" placeholder="HH:MM" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" title="24h-Format (z.B. 12:00)" oninput="this.value = this.value.replace(/[^0-9:]/g, ''); if(this.value.length === 2 && !this.value.includes(':')) this.value += ':';"></td>
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
    const mittagspause = document.getElementById('new_mitarbeiter_mittagspause').value || '12:00';
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
        mittagspause_start: mittagspause,
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
    const mittagspause = document.getElementById(`mitarbeiter_mittagspause_${id}`).value || '12:00';
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
        mittagspause_start: mittagspause,
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
      <td><input type="text" id="new_lehrling_mittagspause" value="12:00" style="width: 100%; padding: 5px; text-align: center;" placeholder="HH:MM" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" title="24h-Format (z.B. 12:00)" oninput="this.value = this.value.replace(/[^0-9:]/g, ''); if(this.value.length === 2 && !this.value.includes(':')) this.value += ':';"></td>
      <td style="text-align: center; color: #999;">-</td>
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
    const mittagspause = document.getElementById('new_lehrling_mittagspause').value || '12:00';
    // berufsschul_wochen wird später über den Abwesenheits-Tab gepflegt
    const aktiv = document.getElementById('new_lehrling_aktiv').checked;

    if (!name) {
      alert('Bitte einen Namen eingeben.');
      return;
    }

    try {
      await LehrlingeService.create({
        name,
        aufgabenbewaeltigung_prozent: aufgabe || 100,
        mittagspause_start: mittagspause,
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
    const mittagspause = document.getElementById(`lehrling_mittagspause_${id}`).value || '12:00';
    // berufsschul_wochen wird über den Abwesenheits-Tab gepflegt, nicht hier ändern
    const aktiv = document.getElementById(`lehrling_aktiv_${id}`).checked;

    if (!name) {
      alert('Bitte einen Namen eingeben.');
      return;
    }

    try {
      await LehrlingeService.update(id, {
        name,
        aufgabenbewaeltigung_prozent: aufgabe || 100,
        mittagspause_start: mittagspause,
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
    const today = this.getToday();
    const dayOfWeek = today.getDay();
    // Sonntag (0): Zeige nächste Woche (morgen ist Montag, also +1)
    // Montag-Samstag: Zeige aktuelle Woche (zurück zum Montag)
    const diff = dayOfWeek === 0 ? 1 : 1 - dayOfWeek;
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

  // Toggle für Bearbeitungs-Status direkt in der Tabelle
  async toggleBearbeitungStatus(terminId, mussBearbeitet) {
    try {
      const response = await TermineService.update(terminId, {
        muss_bearbeitet_werden: mussBearbeitet
      });
      
      // Cache aktualisieren
      if (this.termineById[terminId]) {
        this.termineById[terminId].muss_bearbeitet_werden = mussBearbeitet;
      }
      
      console.log(`Termin ${terminId}: Bearbeitungs-Status auf ${mussBearbeitet ? 'Offen' : 'Erledigt'} gesetzt`, response);
      
      // Visuelles Feedback - kurz grün/rot aufleuchten
      const checkbox = document.querySelector(`input[onchange*="toggleBearbeitungStatus(${terminId}"]`);
      if (checkbox) {
        const slider = checkbox.nextElementSibling;
        if (slider) {
          slider.style.boxShadow = mussBearbeitet 
            ? '0 0 10px 3px rgba(220, 53, 69, 0.6)' 
            : '0 0 10px 3px rgba(40, 167, 69, 0.6)';
          setTimeout(() => {
            slider.style.boxShadow = '';
          }, 500);
        }
      }
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Bearbeitungs-Status:', error);
      alert('Fehler beim Speichern des Status: ' + (error.message || 'Unbekannter Fehler'));
      // Toggle zurücksetzen bei Fehler
      this.loadTermine();
    }
  }

  async openArbeitszeitenModal(terminId) {
    let termin = this.termineById[terminId];
    
    // Bug 2 Fix: Fallback - Lade Termin direkt wenn nicht im Cache
    if (!termin) {
      try {
        console.log('[DEBUG] Termin nicht im Cache, lade nach:', terminId);
        termin = await TermineService.getById(terminId);
        if (termin) {
          this.termineById[terminId] = termin;
        }
      } catch (e) {
        console.error('Fehler beim Nachladen des Termins:', e);
      }
    }
    
    if (!termin) {
      alert('Termin nicht gefunden');
      return;
    }

    this.currentTerminId = terminId;
    const arbeitenListe = this.parseArbeiten(termin.arbeit || '');

    // Reset Teile-Status-Daten für separaten Bereich
    this.modalTeileStatusData = [];

    // Bringzeit und Datum formatieren
    const bringzeitText = termin.bring_zeit ? termin.bring_zeit.substring(0, 5) : '—';
    const datumFormatiert = new Date(termin.datum).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

    document.getElementById('modalTerminInfo').innerHTML =
      `<strong>${termin.termin_nr || '-'}</strong> - ${termin.kunde_name} - ${datumFormatiert}
       <span style="margin-left: 15px; padding: 4px 10px; background: #e3f2fd; border-radius: 4px; font-size: 0.9em;">
         🕐 Bringzeit: <strong>${bringzeitText}</strong>
       </span>`;

    // Status vorauswählen
    document.getElementById('modalTerminStatus').value = termin.status || 'geplant';

    // "Muss bearbeitet werden" Checkbox setzen
    const mussBearbeitetCheckbox = document.getElementById('modalMussBearbeitetCheckbox');
    if (mussBearbeitetCheckbox) {
      mussBearbeitetCheckbox.checked = termin.muss_bearbeitet_werden || false;
    }

    // Interne Auftragsnummer setzen
    const interneAuftragsnummerInput = document.getElementById('modalInterneAuftragsnummer');
    if (interneAuftragsnummerInput) {
      interneAuftragsnummerInput.value = termin.interne_auftragsnummer || '';
    }

    // Lade Mitarbeiter, Lehrlinge und Abwesenheiten für das Datum
    let mitarbeiter = [];
    let lehrlinge = [];
    let abwesenheiten = [];
    try {
      [mitarbeiter, lehrlinge, abwesenheiten] = await Promise.all([
        MitarbeiterService.getAktive(),
        LehrlingeService.getAktive(),
        EinstellungenService.getAbwesenheitenByDateRange(termin.datum, termin.datum)
      ]);
    } catch (error) {
      console.error('Fehler beim Laden der Mitarbeiter/Lehrlinge/Abwesenheiten:', error);
    }

    // Erstelle Set von abwesenden Personen für schnellen Lookup
    // API-Format: {mitarbeiter_id: 2, lehrling_id: null, ...} oder {mitarbeiter_id: null, lehrling_id: 1, ...}
    const abwesendeIds = new Set();
    if (Array.isArray(abwesenheiten)) {
      abwesenheiten.forEach(a => {
        if (a.mitarbeiter_id) {
          abwesendeIds.add(`ma_${a.mitarbeiter_id}`);
        }
        if (a.lehrling_id) {
          abwesendeIds.add(`l_${a.lehrling_id}`);
        }
      });
    }
    console.log('Abwesenheiten für', termin.datum, ':', abwesenheiten);
    console.log('Abwesende IDs:', [...abwesendeIds]);

    // Befülle Gesamt-Mitarbeiter-Dropdown (mit Mitarbeitern und Lehrlingen)
    const gesamtMitarbeiterSelect = document.getElementById('modalGesamtMitarbeiter');
    gesamtMitarbeiterSelect.innerHTML = '<option value="">-- Keine Zuordnung --</option>';
    
    // Optgroup für Mitarbeiter
    if (mitarbeiter.length > 0) {
      mitarbeiter.forEach(ma => {
        const option = document.createElement('option');
        option.value = `ma_${ma.id}`;
        const istAbwesend = abwesendeIds.has(`ma_${ma.id}`);
        option.textContent = istAbwesend ? `🚫 ${ma.name} (ABWESEND)` : `👤 ${ma.name}`;
        option.style.color = istAbwesend ? '#c62828' : '';
        if (istAbwesend) {
          option.disabled = true;
        }
        gesamtMitarbeiterSelect.appendChild(option);
      });
    }
    
    // Optgroup für Lehrlinge
    if (lehrlinge.length > 0) {
      lehrlinge.forEach(l => {
        const option = document.createElement('option');
        option.value = `l_${l.id}`;
        const istAbwesend = abwesendeIds.has(`l_${l.id}`);
        // Prüfe auch Berufsschule
        const schule = this.isLehrlingInBerufsschule(l, termin.datum);
        if (istAbwesend) {
          option.textContent = `🚫 ${l.name} (ABWESEND)`;
          option.style.color = '#c62828';
          option.disabled = true;
        } else if (schule.inSchule) {
          option.textContent = `📚 ${l.name} (KW ${schule.kw} - Berufsschule)`;
          option.style.color = '#1565c0';
          option.disabled = true;
        } else {
          option.textContent = `🎓 ${l.name} (Lehrling)`;
        }
        gesamtMitarbeiterSelect.appendChild(option);
      });
    }

    // Speichere abwesendeIds für die einzelnen Arbeits-Dropdowns
    this.modalAbwesendeIds = abwesendeIds;
    this.modalMitarbeiter = mitarbeiter;
    this.modalLehrlinge = lehrlinge;

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
      let teileStatus = ''; // Teile-Status

      // Prüfe zuerst ob individuelle Zeit für diese Arbeit gespeichert ist
      let startzeit = '';
      if (arbeitszeitenDetails[arbeit]) {
        // Neue Struktur: {zeit: 30, mitarbeiter_id: 1, type: 'mitarbeiter', teile_status: 'vorrätig', startzeit: '09:00'} oder alte Struktur: 30
        if (typeof arbeitszeitenDetails[arbeit] === 'object') {
          zeitMinuten = arbeitszeitenDetails[arbeit].zeit || arbeitszeitenDetails[arbeit];
          teileStatus = arbeitszeitenDetails[arbeit].teile_status || '';
          startzeit = arbeitszeitenDetails[arbeit].startzeit || '';
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
      // Verwende gespeicherte Abwesenheiten
      const abwesendeIds = this.modalAbwesendeIds || new Set();
      let mitarbeiterOptions = '<option value="">-- Keine Zuordnung --</option>';
      
      // Mitarbeiter
      if (mitarbeiter.length > 0) {
        mitarbeiter.forEach(ma => {
          const value = `ma_${ma.id}`;
          const selected = value === mitarbeiterId ? 'selected' : '';
          const istAbwesend = abwesendeIds.has(value);
          const disabled = istAbwesend ? 'disabled' : '';
          const label = istAbwesend ? `🚫 ${ma.name} (ABWESEND)` : `👤 ${ma.name}`;
          const style = istAbwesend ? 'style="color: #c62828;"' : '';
          mitarbeiterOptions += `<option value="${value}" ${selected} ${disabled} ${style}>${label}</option>`;
        });
      }
      
      // Lehrlinge
      if (lehrlinge.length > 0) {
        lehrlinge.forEach(l => {
          const value = `l_${l.id}`;
          const selected = value === mitarbeiterId ? 'selected' : '';
          const istAbwesend = abwesendeIds.has(value);
          // Prüfe auch Berufsschule - benötigt Zugriff auf termin.datum
          const schule = this.isLehrlingInBerufsschule(l, termin.datum);
          let disabled = '';
          let label = `🎓 ${l.name} (Lehrling)`;
          let style = '';
          
          if (istAbwesend) {
            disabled = 'disabled';
            label = `🚫 ${l.name} (ABWESEND)`;
            style = 'style="color: #c62828;"';
          } else if (schule.inSchule) {
            disabled = 'disabled';
            label = `📚 ${l.name} (KW ${schule.kw} - Berufsschule)`;
            style = 'style="color: #1565c0;"';
          }
          mitarbeiterOptions += `<option value="${value}" ${selected} ${disabled} ${style}>${label}</option>`;
        });
      }

      // Teile-Status Optionen - werden später separat angezeigt
      const teileStatusOptions = `
        <option value="" ${teileStatus === '' ? 'selected' : ''}>⚪ Keine Teile nötig</option>
        <option value="vorraetig" ${teileStatus === 'vorraetig' ? 'selected' : ''}>✅ Teile vorrätig</option>
        <option value="bestellt" ${teileStatus === 'bestellt' ? 'selected' : ''}>📦 Teile bestellt</option>
        <option value="bestellen" ${teileStatus === 'bestellen' ? 'selected' : ''}>⚠️ Muss bestellt werden</option>
        <option value="eingetroffen" ${teileStatus === 'eingetroffen' ? 'selected' : ''}>🚚 Teile eingetroffen</option>
      `;

      // Speichere Teile-Status für separaten Bereich
      this.modalTeileStatusData = this.modalTeileStatusData || [];
      this.modalTeileStatusData.push({
        index: index,
        arbeit: arbeit,
        teileStatus: teileStatus,
        teileStatusOptions: teileStatusOptions
      });

      const item = document.createElement('div');
      item.className = 'arbeitszeit-item';
      item.style.marginBottom = '15px';
      item.innerHTML = `
        <div style="margin-bottom: 5px;">
          <label style="font-weight: 600;">📋 ${arbeit}:</label>
        </div>
        <div style="display: grid; grid-template-columns: 80px 1fr 1fr; gap: 10px; margin-bottom: 5px;">
          <input type="text"
                 id="modal_startzeit_${index}"
                 value="${startzeit}"
                 placeholder="HH:MM"
                 pattern="[0-2][0-9]:[0-5][0-9]"
                 maxlength="5"
                 title="Startzeit im 24h-Format (z.B. 08:00, 14:30)"
                 oninput="this.value = this.value.replace(/[^0-9:]/g, ''); if(this.value.length === 2 && !this.value.includes(':')) this.value += ':';"
                 style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; text-align: center;">
          <input type="number"
                 id="modal_zeit_${index}"
                 value="${zeitStunden}"
                 min="0.25"
                 step="0.25"
                 placeholder="Std."
                 onchange="app.updateModalGesamtzeit()"
                 onfocus="this.select()"
                 title="Dauer in Stunden"
                 style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          <select id="modal_mitarbeiter_${index}"
                  title="Mitarbeiter zuordnen"
                  style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            ${mitarbeiterOptions}
          </select>
        </div>
      `;
      liste.appendChild(item);
    });

    // Erstelle separaten Teile-Status Bereich
    this.renderModalTeileStatusSection();

    this.updateModalGesamtzeit();
    
    // Lade Phasen für diesen Termin
    await this.loadModalPhasen(terminId, termin.datum);
    
    // Event-Handler: Wenn Gesamt-Mitarbeiter geändert wird, alle einzelnen Dropdowns synchronisieren
    const gesamtSelect = document.getElementById('modalGesamtMitarbeiter');
    gesamtSelect.onchange = () => this.syncGesamtMitarbeiterToEinzelne();
    
    document.getElementById('arbeitszeitenModal').style.display = 'block';
  }

  // Synchronisiert den Gesamt-Mitarbeiter auf alle einzelnen Arbeits-Dropdowns
  syncGesamtMitarbeiterToEinzelne(forceAll = false) {
    const gesamtValue = document.getElementById('modalGesamtMitarbeiter').value;
    
    // Finde alle einzelnen Mitarbeiter-Selects
    const liste = document.getElementById('modalArbeitszeitenListe');
    const selects = liste.querySelectorAll('select[id^="modal_mitarbeiter_"]');
    
    selects.forEach(select => {
      // Bei forceAll: Alle setzen, sonst nur wenn keine individuelle Zuordnung
      if (forceAll || !select.value || select.value === '') {
        select.value = gesamtValue;
      }
    });
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
    // Event-Handler entfernen
    const gesamtSelect = document.getElementById('modalGesamtMitarbeiter');
    if (gesamtSelect) gesamtSelect.onchange = null;
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

        // Berechne Dauer - verwende endzeit_berechnet wenn verfügbar (enthält Nebenzeit + Erweiterungen)
        let dauerText = '';
        let dauerMinuten = 0;
        
        if (termin.startzeit && termin.endzeit_berechnet) {
          // Berechne aus Start- und Endzeit (inkl. Nebenzeit und Erweiterungen)
          const [startH, startM] = termin.startzeit.split(':').map(Number);
          const [endH, endM] = termin.endzeit_berechnet.split(':').map(Number);
          dauerMinuten = (endH * 60 + endM) - (startH * 60 + startM);
        } else {
          // Fallback: tatsächliche oder geschätzte Zeit
          dauerMinuten = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;
        }
        
        if (dauerMinuten > 0) {
          const stunden = Math.floor(dauerMinuten / 60);
          const minuten = dauerMinuten % 60;
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
          <div class="tages-termin-card ${statusClass} ${internClass}" data-termin-id="${termin.id}" style="cursor: pointer;" title="Klicken für Details">
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

      // Click-Handler für Termin-Karten hinzufügen
      body.querySelectorAll('.tages-termin-card[data-termin-id]').forEach(card => {
        card.addEventListener('click', () => {
          const terminId = parseInt(card.dataset.terminId);
          if (terminId) {
            // Speichere Termin in termineById falls nicht vorhanden
            const termin = termineForDay.find(t => t.id === terminId);
            if (termin) {
              this.termineById[terminId] = termin;
            }
            // Schließe Tagesübersicht-Modal und öffne Termin-Details
            this.closeTagesUebersichtModal();
            this.showTerminDetails(terminId);
          }
        });
      });

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

  // Rendert den separaten Teile-Status-Bereich im Modal
  renderModalTeileStatusSection() {
    // Finde oder erstelle den Container
    let teileSection = document.getElementById('modalTeileStatusSection');
    
    if (!teileSection) {
      // Erstelle den Bereich nach der Arbeitszeiten-Liste
      const gesamtzeitDiv = document.getElementById('modalGesamtzeit').closest('div');
      teileSection = document.createElement('div');
      teileSection.id = 'modalTeileStatusSection';
      gesamtzeitDiv.insertAdjacentElement('afterend', teileSection);
    }

    // Prüfe ob überhaupt Teile-Status-Daten vorhanden sind
    if (!this.modalTeileStatusData || this.modalTeileStatusData.length === 0) {
      teileSection.innerHTML = '';
      return;
    }

    teileSection.innerHTML = `
      <div style="margin-top: 20px; padding: 15px; background: linear-gradient(135deg, #fff8e1 0%, #fffde7 100%); border-radius: 8px; border-left: 4px solid #ff9800;">
        <h4 style="margin: 0 0 15px 0; color: #e65100; display: flex; align-items: center; gap: 8px;">
          📦 Teile-Status
        </h4>
        <div class="teile-status-grid" style="display: grid; gap: 12px;">
          ${this.modalTeileStatusData.map(item => `
            <div class="teile-status-row" style="display: grid; grid-template-columns: 1fr 200px; gap: 10px; align-items: center; padding: 8px; background: white; border-radius: 6px; border: 1px solid #e0e0e0;">
              <span style="font-weight: 500; color: #333;">📋 ${item.arbeit}</span>
              <select id="modal_teile_${item.index}"
                      title="Teile-Status für ${item.arbeit}"
                      onchange="app.updateTeileStatusStyle(this)"
                      style="padding: 8px; border: 2px solid #ddd; border-radius: 4px; cursor: pointer;">
                ${item.teileStatusOptions}
              </select>
            </div>
          `).join('')}
        </div>
        <small style="display: block; margin-top: 12px; color: #666;">
          💡 Wählen Sie den Teile-Status für jede Arbeit aus. Bei "Muss bestellt werden" erscheint der Termin in der Teile-Übersicht.
        </small>
      </div>
    `;

    // Styles für alle Teile-Status-Selects anwenden
    this.modalTeileStatusData.forEach(item => {
      const select = document.getElementById(`modal_teile_${item.index}`);
      if (select) {
        this.updateTeileStatusStyle(select);
      }
    });
  }

  // Visuelles Styling für Teile-Status Dropdown
  updateTeileStatusStyle(selectElement) {
    if (!selectElement) return;
    
    const value = selectElement.value;
    const styles = {
      '': { bg: '#f8f9fa', border: '#ddd', color: '#666' },           // Keine Teile nötig
      'vorraetig': { bg: '#d4edda', border: '#28a745', color: '#155724' },  // Vorrätig - grün
      'bestellt': { bg: '#cce5ff', border: '#007bff', color: '#004085' },   // Bestellt - blau
      'bestellen': { bg: '#fff3cd', border: '#ffc107', color: '#856404' },  // Muss bestellt - gelb/orange
      'eingetroffen': { bg: '#d1ecf1', border: '#17a2b8', color: '#0c5460' } // Eingetroffen - türkis
    };
    
    const style = styles[value] || styles[''];
    selectElement.style.backgroundColor = style.bg;
    selectElement.style.borderColor = style.border;
    selectElement.style.color = style.color;
    selectElement.style.fontWeight = value ? '600' : 'normal';
  }

  // Teile-Status Badge für einzelne Arbeit
  getTeileStatusBadge(teileStatus) {
    const badges = {
      'vorraetig': '<span class="teile-badge teile-vorraetig">✅ Teile vorrätig</span>',
      'bestellt': '<span class="teile-badge teile-bestellt">📦 Teile bestellt</span>',
      'bestellen': '<span class="teile-badge teile-bestellen">⚠️ Teile bestellen!</span>',
      'eingetroffen': '<span class="teile-badge teile-eingetroffen">🚚 Teile da</span>'
    };
    return badges[teileStatus] || '';
  }

  // Teile-Status Badge für Termin-Übersicht (zeigt kritische Status an)
  getTerminTeileStatusBadge(termin) {
    if (!termin.arbeitszeiten_details) return '';
    
    try {
      const details = typeof termin.arbeitszeiten_details === 'string' 
        ? JSON.parse(termin.arbeitszeiten_details) 
        : termin.arbeitszeiten_details;
      
      // Sammle alle Teile-Status
      let hatBestellen = false;
      let hatBestellt = false;
      let bestellenArbeiten = [];
      
      for (const [key, data] of Object.entries(details)) {
        if (key.startsWith('_')) continue; // Überspringe Meta-Felder
        if (data && data.teile_status) {
          if (data.teile_status === 'bestellen') {
            hatBestellen = true;
            bestellenArbeiten.push(key);
          } else if (data.teile_status === 'bestellt') {
            hatBestellt = true;
          }
        }
      }
      
      // Priorität: "bestellen" ist am wichtigsten
      if (hatBestellen) {
        const anzahl = bestellenArbeiten.length;
        const tooltip = bestellenArbeiten.join(', ');
        return `<span class="teile-badge teile-bestellen" title="Teile bestellen für: ${tooltip}">⚠️ ${anzahl}x Teile fehlen</span>`;
      }
      
      // Optional: Zeige "bestellt" an, wenn Teile unterwegs sind
      if (hatBestellt) {
        return '<span class="teile-badge teile-bestellt" title="Teile sind bestellt">📦 Warten auf Teile</span>';
      }
      
      return '';
    } catch (e) {
      console.error('Fehler beim Parsen der arbeitszeiten_details:', e);
      return '';
    }
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
    
    // Lade aktuellen Termin frisch aus der Datenbank für korrekte arbeitszeiten_details
    const termin = await TermineService.getById(this.currentTerminId);
    
    // Bestehende arbeitszeiten_details beibehalten und nur überschreiben was geändert wird
    let arbeitszeitenDetails = {};
    if (termin.arbeitszeiten_details) {
      try {
        arbeitszeitenDetails = typeof termin.arbeitszeiten_details === 'string' 
          ? JSON.parse(termin.arbeitszeiten_details) 
          : termin.arbeitszeiten_details;
      } catch (e) {
        console.error('Fehler beim Parsen von arbeitszeiten_details:', e);
        arbeitszeitenDetails = {};
      }
    }

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
    } else {
      // Keine Gesamt-Zuordnung -> entfernen
      delete arbeitszeitenDetails._gesamt_mitarbeiter_id;
    }

    // Sammle individuelle Zeiten und Mitarbeiter-Zuordnungen pro Arbeit
    const arbeitenListe = this.parseArbeiten(termin.arbeit || '');

    // Iteriere direkt über die Arbeitenliste statt über inputs
    arbeitenListe.forEach((arbeitName, index) => {
      // Zeit-Input auslesen
      const zeitInput = document.getElementById(`modal_zeit_${index}`);
      const stunden = zeitInput ? (parseFloat(zeitInput.value) || 0) : 0;
      gesamtStunden += stunden;

      const zeitMinuten = Math.round(stunden * 60);
      
      // Mitarbeiter-Select auslesen
      const mitarbeiterSelect = document.getElementById(`modal_mitarbeiter_${index}`);
      const mitarbeiterValue = mitarbeiterSelect ? mitarbeiterSelect.value : '';
      
      // Teile-Status auslesen
      const teileSelect = document.getElementById(`modal_teile_${index}`);
      const teileStatus = teileSelect ? teileSelect.value : '';
      
      // Startzeit auslesen
      const startzeitInput = document.getElementById(`modal_startzeit_${index}`);
      const startzeit = startzeitInput ? startzeitInput.value.trim() : '';

      // Bestehende Arbeit-Details holen oder neues Objekt erstellen
      let existingDetails = arbeitszeitenDetails[arbeitName];
      
      // In Objekt-Format konvertieren wenn es nur eine Zahl ist
      if (typeof existingDetails === 'number') {
        existingDetails = { zeit: existingDetails };
      } else if (!existingDetails || typeof existingDetails !== 'object') {
        existingDetails = {};
      }
      
      // Aktualisiere die Werte
      existingDetails.zeit = zeitMinuten;
      
      if (teileStatus) {
        existingDetails.teile_status = teileStatus;
      }
      
      if (startzeit) {
        existingDetails.startzeit = startzeit;
      }
      
      // Mitarbeiter-Zuordnung aktualisieren
      if (mitarbeiterValue && mitarbeiterValue.startsWith('ma_')) {
        const id = parseInt(mitarbeiterValue.replace('ma_', ''), 10);
        existingDetails.mitarbeiter_id = id;
        existingDetails.type = 'mitarbeiter';
        delete existingDetails.lehrling_id;
      } else if (mitarbeiterValue && mitarbeiterValue.startsWith('l_')) {
        const id = parseInt(mitarbeiterValue.replace('l_', ''), 10);
        existingDetails.lehrling_id = id;
        existingDetails.mitarbeiter_id = id; // Für Kompatibilität
        existingDetails.type = 'lehrling';
      } else if (mitarbeiterValue === '') {
        // Explizit "Keine Zuordnung" gewählt -> Mitarbeiter entfernen
        delete existingDetails.mitarbeiter_id;
        delete existingDetails.lehrling_id;
        delete existingDetails.type;
      }
      // Wenn mitarbeiterValue undefined ist, bestehende Zuordnung beibehalten
      
      // Speichere das aktualisierte Objekt (oder nur die Zeit wenn keine anderen Daten)
      if (Object.keys(existingDetails).length === 1 && existingDetails.zeit) {
        // Nur Zeit vorhanden -> als einfache Zahl speichern (Rückwärtskompatibilität)
        arbeitszeitenDetails[arbeitName] = existingDetails.zeit;
      } else {
        arbeitszeitenDetails[arbeitName] = existingDetails;
      }
    });

    // Setze _startzeit automatisch auf die früheste Startzeit aller Arbeiten
    let fruehesteStartzeit = null;
    for (const [key, val] of Object.entries(arbeitszeitenDetails)) {
      if (key.startsWith('_')) continue;
      if (typeof val === 'object' && val.startzeit) {
        if (!fruehesteStartzeit || val.startzeit < fruehesteStartzeit) {
          fruehesteStartzeit = val.startzeit;
        }
      }
    }
    if (fruehesteStartzeit) {
      arbeitszeitenDetails._startzeit = fruehesteStartzeit;
    }

    // Umrechnung von Stunden in Minuten für die Datenbank
    const gesamtzeitMinuten = Math.round(gesamtStunden * 60);

    let status = document.getElementById('modalTerminStatus').value;

    // Bestimme Mitarbeiter für Termin (Gesamt-Zuordnung hat Vorrang, sonst Termin-Mitarbeiter)
    // Nur Mitarbeiter können dem Termin direkt zugeordnet werden, nicht Lehrlinge
    let terminMitarbeiterId = termin.mitarbeiter_id || null;
    if (gesamtMitarbeiterValue && gesamtMitarbeiterValue.startsWith('ma_')) {
      terminMitarbeiterId = parseInt(gesamtMitarbeiterValue.replace('ma_', ''), 10);
    }
    
    // Automatisch auf "geplant" setzen wenn Startzeit und Mitarbeiter vorhanden und Status "wartend"
    if (fruehesteStartzeit && (terminMitarbeiterId || gesamtMitarbeiterValue) && status === 'wartend') {
      status = 'geplant';
      // Aktualisiere auch das Dropdown zur Anzeige
      document.getElementById('modalTerminStatus').value = 'geplant';
    }

    // "Muss bearbeitet werden" Checkbox auslesen
    const mussBearbeitetCheckbox = document.getElementById('modalMussBearbeitetCheckbox');
    const mussBearbeitetWerden = mussBearbeitetCheckbox ? mussBearbeitetCheckbox.checked : false;

    // Interne Auftragsnummer auslesen
    const interneAuftragsnummerInput = document.getElementById('modalInterneAuftragsnummer');
    const interneAuftragsnummer = interneAuftragsnummerInput ? interneAuftragsnummerInput.value.trim() : '';

    try {
      await TermineService.update(this.currentTerminId, {
        tatsaechliche_zeit: gesamtzeitMinuten,
        arbeitszeiten_details: JSON.stringify(arbeitszeitenDetails),
        status: status,
        mitarbeiter_id: terminMitarbeiterId,
        muss_bearbeitet_werden: mussBearbeitetWerden,
        interne_auftragsnummer: interneAuftragsnummer
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
      
      // Aktualisiere Teile-Status-Übersicht wenn sichtbar
      const teileStatusTab = document.getElementById('teileStatus');
      if (teileStatusTab && teileStatusTab.classList.contains('active')) {
        this.loadTeileStatusUebersicht();
      }
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
    // Wenn keine Kapazität, nutze belegte Zeit als Referenz für den Balken
    const belegteZeit = (data.geplant_minuten || 0) + (data.in_arbeit_minuten || 0) + (data.abgeschlossen_minuten || 0);
    const referenzMinuten = data.gesamt_minuten > 0 ? data.gesamt_minuten : (belegteZeit > 0 ? belegteZeit : 1);
    const geplantProzent = ((data.geplant_minuten || 0) / referenzMinuten) * 100;
    const inArbeitProzent = ((data.in_arbeit_minuten || 0) / referenzMinuten) * 100;
    const abgeschlossenProzent = ((data.abgeschlossen_minuten || 0) / referenzMinuten) * 100;

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
  }

  showAutocomplete(matches, currentText) {
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
      dropdown.style.display = 'none';
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
    const kalenderTage = document.getElementById('kalenderTage');
    const kalenderMonatJahr = document.getElementById('kalenderMonatJahr');
    if (!kalenderTage || !kalenderMonatJahr || this.auslastungKalenderInitialized) {
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

  // Aktualisiert die Datum-Anzeige über dem Kalender
  updateSelectedDatumDisplay() {
    const datumInput = document.getElementById('datum');
    const display = document.getElementById('selectedDatumDisplay');
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
  }

  async openAuslastungKalender() {
    // Nicht mehr benötigt - Kalender ist immer sichtbar
    // Aber wir lassen die Funktion für Kompatibilität
    await this.renderAuslastungKalender();
  }

  closeAuslastungKalender() {
    // Nicht mehr benötigt - Kalender ist immer sichtbar
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
    // Aktualisiere Anzeige und navigiere zum aktuellen Monat
    this.updateSelectedDatumDisplay();
    this.kalenderAktuellMonat = new Date(heute.getFullYear(), heute.getMonth(), 1);
    await this.renderAuslastungKalender();
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
  }

  async selectKalenderDatum(datumStr) {
    const datumInput = document.getElementById('datum');
    if (datumInput) {
      datumInput.value = datumStr;
      datumInput.dispatchEvent(new Event('change'));
    }
    // Aktualisiere Anzeige und re-rendere Kalender für Markierung
    this.updateSelectedDatumDisplay();
    await this.renderAuslastungKalender();
  }

  // ==========================================
  // Edit-Kalender Funktionen (Termin bearbeiten)
  // ==========================================

  setupEditAuslastungKalender() {
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

  // Aktualisiert die Datum-Anzeige über dem Edit-Kalender
  updateEditSelectedDatumDisplay() {
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
  }

  async navigateEditKalenderMonat(offset) {
    if (!this.editKalenderAktuellMonat) {
      this.editKalenderAktuellMonat = new Date();
    }
    this.editKalenderAktuellMonat.setMonth(this.editKalenderAktuellMonat.getMonth() + offset);
    await this.renderEditAuslastungKalender();
  }

  async selectEditKalenderHeute() {
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
  }

  async selectEditKalenderDatum(datumStr) {
    const datumInput = document.getElementById('edit_datum');
    if (datumInput) {
      datumInput.value = datumStr;
      datumInput.dispatchEvent(new Event('change'));
    }
    // Aktualisiere Anzeige und re-rendere Kalender für Markierung
    this.updateEditSelectedDatumDisplay();
    await this.renderEditAuslastungKalender();
  }

  async renderEditAuslastungKalender() {
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
  }

  async loadEditKalenderAuslastung(jahr, monat) {
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
  // ==========================================

  setupEditSuchKalender() {
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

  // Aktualisiert die Datum-Anzeige über dem Such-Kalender
  updateEditSuchDatumDisplay() {
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
  }

  async navigateEditSuchKalenderMonat(offset) {
    if (!this.editSuchKalenderAktuellMonat) {
      this.editSuchKalenderAktuellMonat = new Date();
    }
    this.editSuchKalenderAktuellMonat.setMonth(this.editSuchKalenderAktuellMonat.getMonth() + offset);
    await this.renderEditSuchKalender();
  }

  async selectEditSuchKalenderHeute() {
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
  }

  async selectEditSuchKalenderDatum(datumStr) {
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
  }

  async renderEditSuchKalender() {
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
  }

  async loadEditSuchKalenderAuslastung(jahr, monat) {
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

  // Hilfsmethode zum Escapen von HTML
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==========================================
  // TEILE-STATUS ÜBERSICHT
  // ==========================================

  async loadTeileStatusUebersicht() {
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
  }

  renderTeileStatusTable(termine, aktiveFilter = null) {
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
  }

  filterTeileStatus(filter) {
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
  }

  async updateTeileStatusDirekt(terminId, arbeitName, neuerStatus) {
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
  }

  // ==========================================
  // ZEITLEISTEN-ANSICHT (8-18 Uhr)
  // ==========================================
  
  // Startet automatische Aktualisierung des "Jetzt"-Markers in der Zeitleiste
  startZeitleisteNowLineUpdate() {
    // Vorherigen Interval stoppen falls vorhanden
    if (this.nowLineInterval) {
      clearInterval(this.nowLineInterval);
      this.nowLineInterval = null;
    }
    
    const updateZeitleisteMarker = () => {
      const heute = this.formatDateLocal(new Date());
      const selectedDatum = document.getElementById('auslastungDatum')?.value;
      
      // Nur aktualisieren wenn heute ausgewählt ist
      if (selectedDatum !== heute) {
        // Alle Marker entfernen wenn nicht heute
        document.querySelectorAll('.zeitleiste-jetzt-marker').forEach(m => m.remove());
        return;
      }
      
      const START_HOUR = 8;
      const END_HOUR = 18;
      const TOTAL_HOURS = END_HOUR - START_HOUR;
      
      const now = new Date();
      const currentHour = now.getHours() + now.getMinutes() / 60;
      
      // Außerhalb der sichtbaren Stunden
      if (currentHour < START_HOUR || currentHour > END_HOUR) {
        document.querySelectorAll('.zeitleiste-jetzt-marker').forEach(m => m.remove());
        return;
      }
      
      const jetztPosition = ((currentHour - START_HOUR) / TOTAL_HOURS) * 100;
      
      // Aktualisiere alle existierenden Marker
      document.querySelectorAll('.zeitleiste-jetzt-marker').forEach(marker => {
        marker.style.left = `${jetztPosition}%`;
      });
      
      // Falls noch keine Marker existieren, aber Zeilen da sind, füge sie hinzu
      document.querySelectorAll('.zeitleiste-row').forEach(row => {
        const timeline = row.querySelector('.zeitleiste-timeline');
        if (timeline && !timeline.querySelector('.zeitleiste-jetzt-marker')) {
          const marker = document.createElement('div');
          marker.className = 'zeitleiste-jetzt-marker';
          marker.style.left = `${jetztPosition}%`;
          timeline.appendChild(marker);
        }
      });
    };
    
    // Initial aktualisieren
    updateZeitleisteMarker();
    
    // Alle 60 Sekunden aktualisieren
    this.nowLineInterval = setInterval(updateZeitleisteMarker, 60000);
  }

  async loadZeitleiste(datum) {
    const body = document.getElementById('zeitleisteBody');
    if (!body) return;

    body.innerHTML = '<div class="zeitleiste-loading"><span>⏳</span> Lade Zeitleiste...</div>';

    try {
      // Lade alle Termine für dieses Datum
      const termine = await TermineService.getAll(datum);
      
      // Befülle termineById-Cache für Details-Popup
      for (const termin of termine) {
        this.termineById[termin.id] = termin;
      }
      
      // Lade Mitarbeiter, Lehrlinge, Einstellungen und Auslastung (für Abwesenheits-Check)
      const [mitarbeiter, lehrlinge, einstellungen, auslastungData] = await Promise.all([
        MitarbeiterService.getAktive(),
        LehrlingeService.getAktive(),
        EinstellungenService.getWerkstatt(),
        AuslastungService.getByDatum(datum)
      ]);

      // Mittagspause-Dauer aus Einstellungen (Standard 30 Min)
      const mittagspauseDauer = einstellungen?.mittagspause_minuten || 30;
      // Nebenzeit-Prozent aus Einstellungen (Standard 0%)
      const nebenzeitProzent = einstellungen?.nebenzeit_prozent || 0;
      
      // Abwesenheits-Maps erstellen
      const abwesendeMitarbeiter = new Set();
      const abwesendeLehrlinge = new Set();
      if (auslastungData && auslastungData.mitarbeiter_auslastung) {
        auslastungData.mitarbeiter_auslastung.forEach(ma => {
          if (ma.ist_abwesend === true) abwesendeMitarbeiter.add(ma.mitarbeiter_id);
        });
      }
      if (auslastungData && auslastungData.lehrlinge_auslastung) {
        auslastungData.lehrlinge_auslastung.forEach(la => {
          if (la.ist_abwesend === true) abwesendeLehrlinge.add(la.lehrling_id);
        });
      }

      // Erstelle Arbeiten-Map nach Mitarbeiter/Lehrling
      // Gruppiere nach Termin, nicht nach einzelner Arbeit
      const arbeitenMap = new Map();
      const ohneZuordnung = [];

      // Verarbeite alle Termine
      for (const termin of termine) {
        let arbeitenListe = this.parseArbeiten(termin.arbeit || '');
        let details = {};
        
        if (termin.arbeitszeiten_details) {
          try {
            details = typeof termin.arbeitszeiten_details === 'string' 
              ? JSON.parse(termin.arbeitszeiten_details) 
              : termin.arbeitszeiten_details;
          } catch (e) {}
        }

        // Schwebende Termine immer in "Nicht zugeordnet" anzeigen
        const istSchwebend = termin.ist_schwebend === 1 || termin.ist_schwebend === true;

        // Wenn keine Arbeiten, aber Termin existiert, als Platzhalter hinzufügen
        if (arbeitenListe.length === 0) {
          arbeitenListe = [termin.kennzeichen || 'Ohne Beschreibung'];
        }

        // Bestimme Mitarbeiter/Lehrling Zuordnung (aus _gesamt_mitarbeiter_id) - als Fallback
        let defaultZuordnungsTyp = null;
        let defaultMitarbeiterId = termin.mitarbeiter_id;
        let defaultLehrlingId = null;
        
        if (details._gesamt_mitarbeiter_id) {
          defaultZuordnungsTyp = details._gesamt_mitarbeiter_id.type;
          if (defaultZuordnungsTyp === 'lehrling') {
            defaultLehrlingId = details._gesamt_mitarbeiter_id.id;
            defaultMitarbeiterId = null;
          } else {
            defaultMitarbeiterId = details._gesamt_mitarbeiter_id.id;
          }
        }
        
        // Bei schwebenden Terminen keine Zuordnung
        if (istSchwebend) {
          defaultZuordnungsTyp = null;
          defaultMitarbeiterId = null;
          defaultLehrlingId = null;
        }

        // Startzeit des Termins (Priorität: termin.startzeit, dann _startzeit aus details, dann erste Arbeit)
        let terminStartzeit = termin.startzeit || details._startzeit || null;
        if (!terminStartzeit) {
          for (const arbeit of arbeitenListe) {
            const arbeitDetails = typeof details[arbeit] === 'object' ? details[arbeit] : {};
            if (arbeitDetails.startzeit && arbeitDetails.startzeit.trim() !== '') {
              terminStartzeit = arbeitDetails.startzeit;
              break;
            }
          }
        }

        // Automatisch erkennen ob dieser Termin getrennt angezeigt werden muss
        // (unterschiedliche Mitarbeiter ODER unterschiedliche Startzeiten für verschiedene Arbeiten)
        let mussGetrenntAnzeigen = false;
        
        if (arbeitenListe.length > 1) {
          // Sammle alle Mitarbeiter-IDs und Startzeiten der Arbeiten
          const mitarbeiterSet = new Set();
          const startzeitenSet = new Set();
          
          for (const arbeit of arbeitenListe) {
            const arbeitDetails = typeof details[arbeit] === 'object' ? details[arbeit] : {};
            
            // Mitarbeiter dieser Arbeit bestimmen
            let arbeitMitarbeiterKey = 'default';
            if (arbeitDetails.type === 'lehrling' && (arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id)) {
              arbeitMitarbeiterKey = `l_${arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id}`;
            } else if (arbeitDetails.mitarbeiter_id) {
              arbeitMitarbeiterKey = `m_${arbeitDetails.mitarbeiter_id}`;
            } else if (defaultZuordnungsTyp === 'lehrling' && defaultLehrlingId) {
              arbeitMitarbeiterKey = `l_${defaultLehrlingId}`;
            } else if (defaultMitarbeiterId) {
              arbeitMitarbeiterKey = `m_${defaultMitarbeiterId}`;
            }
            mitarbeiterSet.add(arbeitMitarbeiterKey);
            
            // Startzeit dieser Arbeit
            if (arbeitDetails.startzeit) {
              startzeitenSet.add(arbeitDetails.startzeit);
            }
          }
          
          // Getrennt anzeigen wenn: unterschiedliche Mitarbeiter ODER mehr als eine verschiedene Startzeit
          mussGetrenntAnzeigen = mitarbeiterSet.size > 1 || startzeitenSet.size > 1;
        }
        
        if (mussGetrenntAnzeigen) {
          // === GETRENNTE ANSICHT: Separate Einträge für jede Arbeit ===
          let laufendeStartzeit = terminStartzeit;
          const arbeitEntries = [];
          
          for (let i = 0; i < arbeitenListe.length; i++) {
            const arbeit = arbeitenListe[i];
            const arbeitDetails = typeof details[arbeit] === 'object' ? details[arbeit] : { zeit: details[arbeit] || 0 };
            let zeitMinuten = arbeitDetails.zeit || (termin.geschaetzte_zeit / arbeitenListe.length) || 60;
            
            // Nebenzeit-Aufschlag hinzufügen
            if (nebenzeitProzent > 0) {
              zeitMinuten = Math.round(zeitMinuten * (1 + nebenzeitProzent / 100));
            }
            
            // Feature 10: Bei abgeschlossenen Terminen die ANGEZEIGTE Zeit auf tatsächliche Zeit kürzen
            let anzeigeZeitMinuten = zeitMinuten;
            if (termin.status === 'abgeschlossen' && termin.tatsaechliche_zeit && termin.tatsaechliche_zeit > 0) {
              if (arbeitenListe.length > 1) {
                const anteil = zeitMinuten / (termin.geschaetzte_zeit || zeitMinuten * arbeitenListe.length);
                anzeigeZeitMinuten = Math.round(termin.tatsaechliche_zeit * anteil);
              } else {
                anzeigeZeitMinuten = termin.tatsaechliche_zeit;
              }
            }
            
            // Mitarbeiter/Lehrling für DIESE Arbeit (individuelle Zuordnung hat Vorrang)
            let arbeitZuordnungsTyp = defaultZuordnungsTyp;
            let arbeitMitarbeiterId = defaultMitarbeiterId;
            let arbeitLehrlingId = defaultLehrlingId;
            
            if (!istSchwebend && typeof arbeitDetails === 'object') {
              if (arbeitDetails.type === 'lehrling' && (arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id)) {
                arbeitZuordnungsTyp = 'lehrling';
                arbeitLehrlingId = arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id;
                arbeitMitarbeiterId = null;
              } else if (arbeitDetails.mitarbeiter_id) {
                arbeitZuordnungsTyp = arbeitDetails.type || 'mitarbeiter';
                arbeitMitarbeiterId = arbeitDetails.mitarbeiter_id;
                arbeitLehrlingId = null;
              }
            }
            
            // Startzeit für diese Arbeit bestimmen
            let arbeitStartzeit = arbeitDetails.startzeit || laufendeStartzeit;
            
            // Falls keine Startzeit und vorherige Arbeit existiert, nach vorheriger Arbeit starten
            if (!arbeitStartzeit && i > 0 && arbeitEntries[i-1]) {
              const prev = arbeitEntries[i-1];
              if (prev.startzeit) {
                const [h, m] = prev.startzeit.split(':').map(Number);
                const prevEndMinuten = h * 60 + m + prev.zeitMinuten;
                const newH = Math.floor(prevEndMinuten / 60);
                const newM = prevEndMinuten % 60;
                arbeitStartzeit = `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
              }
            }

            // Zähle Erweiterungen zu diesem Termin
            const erweiterungen = termine.filter(t => t.erweiterung_von_id === termin.id && !t.ist_geloescht);
            const erweiterungAnzahl = erweiterungen.length;
            
            // Bestimme die endzeit_berechnet
            let endzeitFuerAnzeige = null;
            if (erweiterungAnzahl > 0) {
              endzeitFuerAnzeige = null;
            } else if (termin.erweiterung_von_id) {
              const hauptTermin = termine.find(t => t.id === termin.erweiterung_von_id);
              if (hauptTermin && hauptTermin.endzeit_berechnet) {
                endzeitFuerAnzeige = hauptTermin.endzeit_berechnet;
              }
            } else {
              endzeitFuerAnzeige = termin.endzeit_berechnet || null;
            }
            
            const terminEntry = {
              terminId: termin.id,
              terminNr: termin.termin_nr,
              kunde: termin.kunde_name,
              kennzeichen: termin.kennzeichen,
              arbeit: arbeit,
              arbeitenListe: arbeitenListe,
              arbeitIndex: i,
              arbeitenAnzahl: arbeitenListe.length,
              zeitMinuten: zeitMinuten,
              anzeigeZeitMinuten: anzeigeZeitMinuten,
              startzeit: arbeitStartzeit,
              endzeitBerechnet: endzeitFuerAnzeige,
              abholungZeit: termin.abholung_zeit || null,
              status: termin.status || 'geplant',
              istIntern: !termin.kennzeichen || termin.abholung_details === 'Interner Termin',
              interneAuftragsnummer: termin.interne_auftragsnummer || '',
              istSchwebend: istSchwebend,
              istErweiterung: termin.ist_erweiterung === 1 || termin.ist_erweiterung === true,
              erweiterungAnzahl: erweiterungAnzahl,
              erweiterungVonId: termin.erweiterung_von_id || null,
              zuordnungsTyp: arbeitZuordnungsTyp,
              mitarbeiterId: arbeitMitarbeiterId,
              lehrlingId: arbeitLehrlingId
            };
            
            arbeitEntries.push(terminEntry);
            
            // Update laufende Startzeit für nächste Arbeit
            if (arbeitStartzeit) {
              const [h, m] = arbeitStartzeit.split(':').map(Number);
              const endMinuten = h * 60 + m + zeitMinuten;
              const newH = Math.floor(endMinuten / 60);
              const newM = endMinuten % 60;
              laufendeStartzeit = `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
            }
          }

          // Zuordnung zu Mitarbeiter oder Lehrling - pro Arbeit individuell
          for (const entry of arbeitEntries) {
            if (entry.zuordnungsTyp === 'lehrling' && entry.lehrlingId) {
              const key = `l_${entry.lehrlingId}`;
              if (!arbeitenMap.has(key)) {
                arbeitenMap.set(key, { typ: 'lehrling', id: entry.lehrlingId, arbeiten: [] });
              }
              arbeitenMap.get(key).arbeiten.push(entry);
            } else if (entry.mitarbeiterId) {
              const key = `m_${entry.mitarbeiterId}`;
              if (!arbeitenMap.has(key)) {
                arbeitenMap.set(key, { typ: 'mitarbeiter', id: entry.mitarbeiterId, arbeiten: [] });
              }
              arbeitenMap.get(key).arbeiten.push(entry);
            } else {
              ohneZuordnung.push(entry);
            }
          }
          
        } else {
          // === ZUSAMMENGEFASSTE ANSICHT: Ein Eintrag pro Termin ===
          // Berechne Gesamtzeit und früheste Startzeit
          let gesamtZeitMinuten = 0;
          let gesamtAnzeigeZeitMinuten = 0;
          let fruehesteStartzeit = terminStartzeit;
          let arbeitenMitZeiten = [];
          
          // Bestimme Mitarbeiter/Lehrling Zuordnung für den gesamten Termin (wird im Loop ggf. aktualisiert)
          let terminZuordnungsTyp = defaultZuordnungsTyp;
          let terminMitarbeiterId = defaultMitarbeiterId;
          let terminLehrlingId = defaultLehrlingId;
          
          for (let i = 0; i < arbeitenListe.length; i++) {
            const arbeit = arbeitenListe[i];
            const arbeitDetails = typeof details[arbeit] === 'object' ? details[arbeit] : { zeit: details[arbeit] || 0 };
            let zeitMinuten = arbeitDetails.zeit || (termin.geschaetzte_zeit / arbeitenListe.length) || 60;
            
            // Nebenzeit-Aufschlag hinzufügen (z.B. 20% = zeitMinuten * 1.2)
            if (nebenzeitProzent > 0) {
              zeitMinuten = Math.round(zeitMinuten * (1 + nebenzeitProzent / 100));
            }
            
            gesamtZeitMinuten += zeitMinuten;
            
            // Feature 10: Bei abgeschlossenen Terminen die ANGEZEIGTE Zeit auf tatsächliche Zeit kürzen
            let anzeigeZeitMinuten = zeitMinuten;
            if (termin.status === 'abgeschlossen' && termin.tatsaechliche_zeit && termin.tatsaechliche_zeit > 0) {
              if (arbeitenListe.length > 1) {
                const anteil = zeitMinuten / (termin.geschaetzte_zeit || zeitMinuten * arbeitenListe.length);
                anzeigeZeitMinuten = Math.round(termin.tatsaechliche_zeit * anteil);
              } else {
                anzeigeZeitMinuten = termin.tatsaechliche_zeit;
              }
            }
            gesamtAnzeigeZeitMinuten += anzeigeZeitMinuten;
            
            // Startzeit für diese Arbeit bestimmen (für Anzeige im Tooltip)
            let arbeitStartzeit = arbeitDetails.startzeit || null;
            if (arbeitStartzeit && (!fruehesteStartzeit || arbeitStartzeit < fruehesteStartzeit)) {
              fruehesteStartzeit = arbeitStartzeit;
            }
            
            arbeitenMitZeiten.push({
              name: arbeit,
              zeit: zeitMinuten,
              startzeit: arbeitStartzeit
            });
            
            // Prüfe ob diese Arbeit eine Mitarbeiter-Zuordnung hat (erste gefundene gewinnt)
            if (!istSchwebend && typeof arbeitDetails === 'object') {
              if (arbeitDetails.type === 'lehrling' && (arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id)) {
                if (!terminZuordnungsTyp || terminZuordnungsTyp === defaultZuordnungsTyp) {
                  terminZuordnungsTyp = 'lehrling';
                  terminLehrlingId = arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id;
                  terminMitarbeiterId = null;
                }
              } else if (arbeitDetails.mitarbeiter_id) {
                if (!terminMitarbeiterId || terminMitarbeiterId === defaultMitarbeiterId) {
                  terminZuordnungsTyp = arbeitDetails.type || 'mitarbeiter';
                  terminMitarbeiterId = arbeitDetails.mitarbeiter_id;
                }
              }
            }
          }
          
          // Zähle Erweiterungen zu diesem Termin
          const erweiterungen = termine.filter(t => t.erweiterung_von_id === termin.id && !t.ist_geloescht);
          const erweiterungAnzahl = erweiterungen.length;
          
          // Bestimme die endzeit_berechnet
          let endzeitFuerAnzeige = null;
          if (erweiterungAnzahl > 0) {
            endzeitFuerAnzeige = null;
          } else if (termin.erweiterung_von_id) {
            const hauptTermin = termine.find(t => t.id === termin.erweiterung_von_id);
            if (hauptTermin && hauptTermin.endzeit_berechnet) {
              endzeitFuerAnzeige = hauptTermin.endzeit_berechnet;
            }
          } else {
            endzeitFuerAnzeige = termin.endzeit_berechnet || null;
          }
          
          // Erstelle einen zusammengefassten Termin-Entry
          const terminEntry = {
            terminId: termin.id,
            terminNr: termin.termin_nr,
            kunde: termin.kunde_name,
            kennzeichen: termin.kennzeichen,
            arbeit: arbeitenListe.join(' || '), // Alle Arbeiten mit || getrennt
            arbeitenListe: arbeitenListe,
            arbeitenMitZeiten: arbeitenMitZeiten, // Detaillierte Liste für Tooltip
            arbeitIndex: 0,
            arbeitenAnzahl: arbeitenListe.length,
            zeitMinuten: gesamtZeitMinuten,
            anzeigeZeitMinuten: gesamtAnzeigeZeitMinuten,
            startzeit: fruehesteStartzeit,
            endzeitBerechnet: endzeitFuerAnzeige,
            bringZeit: termin.bring_zeit || null,
            abholungZeit: termin.abholung_zeit || null,
            status: termin.status || 'geplant',
            istIntern: !termin.kennzeichen || termin.abholung_details === 'Interner Termin',
            interneAuftragsnummer: termin.interne_auftragsnummer || '',
            istSchwebend: istSchwebend,
            istErweiterung: termin.ist_erweiterung === 1 || termin.ist_erweiterung === true,
            erweiterungAnzahl: erweiterungAnzahl,
            erweiterungVonId: termin.erweiterung_von_id || null,
            zuordnungsTyp: terminZuordnungsTyp,
            mitarbeiterId: terminMitarbeiterId,
            lehrlingId: terminLehrlingId
          };

          // Zuordnung zu Mitarbeiter oder Lehrling
          if (terminEntry.zuordnungsTyp === 'lehrling' && terminEntry.lehrlingId) {
            const key = `l_${terminEntry.lehrlingId}`;
            if (!arbeitenMap.has(key)) {
              arbeitenMap.set(key, { typ: 'lehrling', id: terminEntry.lehrlingId, arbeiten: [] });
            }
            arbeitenMap.get(key).arbeiten.push(terminEntry);
          } else if (terminEntry.mitarbeiterId) {
            const key = `m_${terminEntry.mitarbeiterId}`;
            if (!arbeitenMap.has(key)) {
              arbeitenMap.set(key, { typ: 'mitarbeiter', id: terminEntry.mitarbeiterId, arbeiten: [] });
            }
            arbeitenMap.get(key).arbeiten.push(terminEntry);
          } else {
            ohneZuordnung.push(terminEntry);
          }
        }
      }

      // Rendere die Zeitleiste mit Abwesenheitsinformation
      this.renderZeitleiste(body, arbeitenMap, ohneZuordnung, mitarbeiter, lehrlinge, mittagspauseDauer, abwesendeMitarbeiter, abwesendeLehrlinge, datum);

    } catch (error) {
      console.error('Fehler beim Laden der Zeitleiste:', error);
      body.innerHTML = '<div class="zeitleiste-leer"><span class="zeitleiste-leer-icon">❌</span><p>Fehler beim Laden</p></div>';
    }
  }

  renderZeitleiste(container, arbeitenMap, ohneZuordnung, mitarbeiter, lehrlinge, mittagspauseDauer = 30, abwesendeMitarbeiter = new Set(), abwesendeLehrlinge = new Set(), datum = null) {
    // Prüfe ob es überhaupt Mitarbeiter oder Lehrlinge gibt
    const hatPersonal = mitarbeiter.length > 0 || lehrlinge.length > 0;
    
    // Keine Arbeiten und kein Personal?
    if (!hatPersonal) {
      container.innerHTML = `
        <div class="zeitleiste-leer">
          <span class="zeitleiste-leer-icon">📅</span>
          <p>Keine Mitarbeiter oder Lehrlinge vorhanden</p>
        </div>
      `;
      return;
    }

    const START_HOUR = 8;
    const END_HOUR = 18;
    const TOTAL_HOURS = END_HOUR - START_HOUR; // 10 Stunden

    let html = '';

    // Aktuelle Zeit Marker Position berechnen (falls heute)
    const heute = this.formatDateLocal(new Date());
    const selectedDatum = datum || document.getElementById('auslastungDatum')?.value || heute;
    let jetztMarkerHtml = '';
    
    if (selectedDatum === heute) {
      const now = new Date();
      const currentHour = now.getHours() + now.getMinutes() / 60;
      if (currentHour >= START_HOUR && currentHour <= END_HOUR) {
        const jetztPosition = ((currentHour - START_HOUR) / TOTAL_HOURS) * 100;
        jetztMarkerHtml = `<div class="zeitleiste-jetzt-marker" style="left: ${jetztPosition}%;"></div>`;
      }
    }

    // Mitarbeiter-Zeilen
    for (const ma of mitarbeiter) {
      const key = `m_${ma.id}`;
      const data = arbeitenMap.get(key);
      const arbeiten = data ? data.arbeiten : [];
      const mittagspauseStart = ma.mittagspause_start || '12:00';
      const istAbwesend = abwesendeMitarbeiter.has(ma.id);
      const abwesendStyle = istAbwesend ? 'abwesend' : false;
      const nameDisplay = istAbwesend ? `${ma.name} 🏥` : ma.name;
      
      html += this.renderZeitleisteRow(nameDisplay, 'Mitarbeiter', istAbwesend ? [] : arbeiten, START_HOUR, END_HOUR, TOTAL_HOURS, jetztMarkerHtml, abwesendStyle, mittagspauseStart, mittagspauseDauer);
    }

    // Lehrling-Zeilen
    for (const lehrling of lehrlinge) {
      const key = `l_${lehrling.id}`;
      const data = arbeitenMap.get(key);
      const arbeiten = data ? data.arbeiten : [];
      const mittagspauseStart = lehrling.mittagspause_start || '12:00';
      const istAbwesend = abwesendeLehrlinge.has(lehrling.id);
      
      // Prüfe ob Lehrling in Berufsschule ist
      const schule = this.isLehrlingInBerufsschule(lehrling, selectedDatum);
      const berufsschulBadge = schule.inSchule ? ` 📚 KW ${schule.kw}` : '';
      const abwesendBadge = istAbwesend ? ' 🏥' : '';
      
      // Rowstyle: abwesend hat Priorität, dann berufsschule
      let rowStyle = false;
      if (istAbwesend) {
        rowStyle = 'abwesend';
      } else if (schule.inSchule) {
        rowStyle = 'berufsschule';
      }
      
      html += this.renderZeitleisteRow(lehrling.name + berufsschulBadge + abwesendBadge, 'Lehrling', istAbwesend ? [] : arbeiten, START_HOUR, END_HOUR, TOTAL_HOURS, jetztMarkerHtml, rowStyle, mittagspauseStart, mittagspauseDauer);
    }

    // Nicht zugeordnete Arbeiten - ohne Zeiteinordnung, hintereinander
    if (ohneZuordnung.length > 0) {
      html += this.renderNichtZugeordnetRow(ohneZuordnung, TOTAL_HOURS);
    }

    container.innerHTML = html;
  }

  // Spezielle Render-Funktion für "Nicht zugeordnet" - Blöcke hintereinander ohne Zeiteinordnung
  renderNichtZugeordnetRow(arbeiten, totalHours) {
    // Berechne Gesamtzeit für proportionale Balken
    const gesamtMinuten = arbeiten.reduce((sum, a) => sum + (a.zeitMinuten || 60), 0);
    
    let bloeckeHtml = '';
    for (const arbeit of arbeiten) {
      const zeitMinuten = arbeit.zeitMinuten || 60;
      // Breite proportional zur Zeit (relativ zur Gesamtzeit, max 100%)
      const widthPercent = Math.max(5, (zeitMinuten / gesamtMinuten) * 100);
      
      // Status-Klasse
      let statusClass = 'status-geplant';
      if (arbeit.status === 'in_arbeit') statusClass = 'status-in-arbeit';
      else if (arbeit.status === 'abgeschlossen') statusClass = 'status-abgeschlossen';
      else if (arbeit.status === 'wartend') statusClass = 'status-wartend';
      
      // Schwebend-Klasse
      const schwebendClass = arbeit.istSchwebend ? 'schwebend' : '';
      
      // Schwebend-Badge
      const schwebendBadge = arbeit.istSchwebend ? ' ⏸️' : '';
      
      // Erweiterungs-Badge
      const erweiterungBadge = arbeit.erweiterungAnzahl > 0 
        ? ` <span class="zeitleiste-erweiterung-badge" onclick="event.stopPropagation(); app.showVerknuepfteTermine(${arbeit.terminId})" title="${arbeit.erweiterungAnzahl} Erweiterung(en)">🔗${arbeit.erweiterungAnzahl}</span>` 
        : '';
      
      // Erweiterungs-Block-Klasse
      const erweiterungClass = arbeit.istErweiterung ? 'erweiterung-block' : '';
      
      // Zeit-Info für Tooltip und Anzeige
      const bringZeitText = arbeit.bringZeit ? `🚗↓ ${arbeit.bringZeit}` : '';
      const abholZeitText = arbeit.abholungZeit ? `🚗↑ ${arbeit.abholungZeit}` : '';
      const zeitInfo = [bringZeitText, abholZeitText].filter(t => t).join(' • ');
      
      // Tooltip
      const tooltip = `${arbeit.terminNr || ''}${schwebendBadge}&#10;${arbeit.kunde || '-'}&#10;${arbeit.kennzeichen || '-'}&#10;${arbeit.arbeit}&#10;⏱️ Dauer: ${zeitMinuten} Min. (${(zeitMinuten/60).toFixed(1)} h)${arbeit.bringZeit ? '&#10;🚗↓ Bringzeit: ' + arbeit.bringZeit : ''}${arbeit.abholungZeit ? '&#10;🚗↑ Abholzeit: ' + arbeit.abholungZeit : ''}${arbeit.erweiterungAnzahl > 0 ? '&#10;🔗 ' + arbeit.erweiterungAnzahl + ' Erweiterung(en)' : ''}${arbeit.istErweiterung ? '&#10;🔗 ERWEITERUNG' : ''}`;
      
      // Inhalt mit Bring/Abholzeit und Arbeitszeit
      const content = `
        <div class="zeitleiste-block-nummer">${arbeit.terminNr || '-'}${schwebendBadge}${erweiterungBadge}</div>
        <div class="zeitleiste-block-text">${arbeit.arbeit}</div>
        <div class="zeitleiste-block-zeit">⏱️ ${(zeitMinuten/60).toFixed(1)}h</div>
        ${zeitInfo ? `<div class="zeitleiste-block-zeiten">${zeitInfo}</div>` : ''}
      `;
      
      bloeckeHtml += `
        <div class="zeitleiste-block-inline ${statusClass} ${schwebendClass} ${erweiterungClass}" 
             style="flex: 0 0 ${widthPercent}%; min-width: 80px;"
             title="${tooltip}"
             onclick="app.showTerminDetails(${arbeit.terminId})">
          ${content}
        </div>
      `;
    }
    
    // Gesamtzeit anzeigen
    const gesamtStunden = (gesamtMinuten / 60).toFixed(1);
    
    return `
      <div class="zeitleiste-row nicht-zugeordnet">
        <div class="zeitleiste-person">
          <span class="zeitleiste-person-name">⚠️ Nicht zugeordnet</span>
          <span class="zeitleiste-person-typ">${arbeiten.length} Termin(e) • ${gesamtStunden} h</span>
        </div>
        <div class="zeitleiste-timeline nicht-zugeordnet-timeline">
          <div class="zeitleiste-inline-container">
            ${bloeckeHtml}
          </div>
        </div>
      </div>
    `;
  }

  renderZeitleisteRow(name, typ, arbeiten, startHour, endHour, totalHours, jetztMarkerHtml, isSpecial = false, mittagspauseStart = null, mittagspauseDauer = 30) {
    // isSpecial kann 'berufsschule', 'abwesend' sein oder true/false für alte Kompatibilität
    let rowClass = 'zeitleiste-row';
    if (isSpecial === true) {
      rowClass = 'zeitleiste-row nicht-zugeordnet';
    } else if (isSpecial === 'berufsschule') {
      rowClass = 'zeitleiste-row berufsschule';
    } else if (isSpecial === 'abwesend') {
      rowClass = 'zeitleiste-row abwesend';
    }
    
    // Gitter erstellen
    let gitterHtml = '<div class="zeitleiste-gitter">';
    for (let h = startHour; h <= endHour; h++) {
      gitterHtml += '<div class="zeitleiste-gitter-stunde"></div>';
    }
    gitterHtml += '</div>';

    // Mittagspause-Block erstellen (falls vorhanden und Dauer > 0 und NICHT abwesend)
    let mittagspauseHtml = '';
    if (mittagspauseStart && mittagspauseDauer > 0 && isSpecial !== 'abwesend') {
      const [pauseH, pauseM] = mittagspauseStart.split(':').map(Number);
      const pauseStartMinuten = pauseH * 60 + pauseM;
      const pauseEndMinuten = pauseStartMinuten + mittagspauseDauer;
      
      // Nur anzeigen wenn im sichtbaren Bereich (8-18 Uhr)
      const displayStart = Math.max(pauseStartMinuten, startHour * 60);
      const displayEnd = Math.min(pauseEndMinuten, endHour * 60);
      
      if (displayEnd > displayStart) {
        const leftPercent = ((displayStart - startHour * 60) / (totalHours * 60)) * 100;
        const widthPercent = ((displayEnd - displayStart) / (totalHours * 60)) * 100;
        const pauseEndZeit = this.minutesToTime(pauseEndMinuten);
        
        // Bei breiteren Blöcken mehr Info anzeigen
        const showLabel = widthPercent > 6;
        const pauseContent = showLabel 
          ? `<span class="zeitleiste-mittagspause-text">Pause</span><span class="zeitleiste-mittagspause-label">${mittagspauseStart} - ${pauseEndZeit}</span>`
          : `<span class="zeitleiste-mittagspause-text"></span>`;
        
        mittagspauseHtml = `
          <div class="zeitleiste-mittagspause" 
               style="left: ${leftPercent}%; width: ${widthPercent}%;"
               title="🍽️ Mittagspause&#10;${mittagspauseStart} - ${pauseEndZeit}&#10;Dauer: ${mittagspauseDauer} Min.">
            ${pauseContent}
          </div>
        `;
      }
    }

    // Arbeitsblöcke erstellen
    let bloeckeHtml = '<div class="zeitleiste-arbeiten">';
    
    // Berechne Mittagspause-Zeiten (in Minuten)
    let pauseStartMinuten = null;
    let pauseEndMinuten = null;
    if (mittagspauseStart && mittagspauseDauer > 0) {
      const [pauseH, pauseM] = mittagspauseStart.split(':').map(Number);
      pauseStartMinuten = pauseH * 60 + pauseM;
      pauseEndMinuten = pauseStartMinuten + mittagspauseDauer;
    }
    
    // Sortiere Arbeiten nach Startzeit
    const sortedArbeiten = [...arbeiten].sort((a, b) => {
      const zeitA = a.startzeit || '';
      const zeitB = b.startzeit || '';
      if (!zeitA && !zeitB) return 0;
      if (!zeitA) return 1;
      if (!zeitB) return -1;
      return zeitA.localeCompare(zeitB);
    });

    // Berechne Positionen für überlappende Blöcke
    let currentEndMinutes = startHour * 60;
    
    // Hilfsfunktion zum Rendern eines einzelnen Blocks
    const renderBlock = (arbeit, blockStartMinutes, blockEndMinutes, istFortsetzung = false) => {
      // Begrenzen auf 8-18 Uhr
      const displayStart = Math.max(blockStartMinutes, startHour * 60);
      const displayEnd = Math.min(blockEndMinutes, endHour * 60);
      
      const leftPercent = ((displayStart - startHour * 60) / (totalHours * 60)) * 100;
      const widthPercent = ((displayEnd - displayStart) / (totalHours * 60)) * 100;
      
      if (widthPercent <= 0) return '';
      
      const statusClass = arbeit.startzeit ? `status-${arbeit.status}` : 'status-keine-zeit';
      const internClass = arbeit.istIntern ? 'intern-termin' : '';
      const startZeitText = this.minutesToTime(blockStartMinutes);
      const endZeitText = this.minutesToTime(blockEndMinutes);
      const dauerMinuten = blockEndMinutes - blockStartMinutes;
      const dauerText = this.formatMinutesToHours(dauerMinuten);
      const auftragsnrText = arbeit.interneAuftragsnummer ? `&#10;Auftrag: ${arbeit.interneAuftragsnummer}` : '';
      const fortsetzungText = istFortsetzung ? ' (Forts.)' : '';
      
      // Hauptanzeige: Kennzeichen bevorzugt, sonst Name (bei internen Terminen)
      const hauptAnzeige = arbeit.kennzeichen ? arbeit.kennzeichen : (arbeit.istIntern ? '🔧 ' + arbeit.kunde : arbeit.kunde);
      const auftragsnrEscaped = arbeit.interneAuftragsnummer ? this.escapeHtml(arbeit.interneAuftragsnummer) : '';
      const schwebendClass = arbeit.istSchwebend ? 'schwebend-block' : '';
      const schwebendBadge = arbeit.istSchwebend ? '<span class="zeitleiste-schwebend-badge">⏸️</span>' : '';
      const schwebendTitleText = arbeit.istSchwebend ? '&#10;⏸️ SCHWEBEND' : '';
      const erweiterungClass = arbeit.istErweiterung ? 'erweiterung-block' : '';
      const erweiterungTitleText = arbeit.istErweiterung ? '&#10;🔗 ERWEITERUNG' : '';
      
      // Verknüpfungs-Badge für Termine mit Erweiterungen (am Ende des Balkens)
      const hatErweiterungen = arbeit.erweiterungAnzahl > 0;
      const erweiterungBadge = hatErweiterungen 
        ? `<span class="zeitleiste-erweiterung-badge-end" onclick="event.stopPropagation(); app.showVerknuepfteTermine(${arbeit.terminId})" title="${arbeit.erweiterungAnzahl} Erweiterung(en) - Klicken zum Anzeigen">🔗</span>` 
        : '';
      const erweiterungBadgeTitleText = hatErweiterungen ? `&#10;🔗 ${arbeit.erweiterungAnzahl} Erweiterung(en)` : '';
      
      // Icon am Ende für Erweiterungs-Termine (die selbst Erweiterungen sind)
      const istErweiterungIcon = arbeit.istErweiterung 
        ? '<span class="zeitleiste-ist-erweiterung-icon" title="Dies ist eine Erweiterung">🔗</span>' 
        : '';
      
      // Mehrteiliger Termin
      const arbeitenAnzahl = arbeit.arbeitenAnzahl || 1;
      
      // Arbeiten-Liste für Tooltip - bei zusammengefassten Blöcken alle Arbeiten auflisten
      let arbeitenTooltip = arbeit.arbeit;
      if (arbeit.arbeitenMitZeiten && arbeit.arbeitenMitZeiten.length > 1) {
        arbeitenTooltip = arbeit.arbeitenMitZeiten.map(a => 
          `${a.name} (${a.zeit} Min.)`
        ).join('&#10;🔧 ');
      }
      
      // Abholzeit-Info für Tooltip
      const abholzeitTooltip = arbeit.abholungZeit ? `&#10;🚗 Abholung: ${arbeit.abholungZeit}` : '';
      
      // Kurzanzeige der Arbeiten im Block (bei mehreren: erste + Anzahl)
      let arbeitKurzText = arbeit.arbeit;
      if (arbeit.arbeitenListe && arbeit.arbeitenListe.length > 1) {
        arbeitKurzText = `${arbeit.arbeitenListe[0]} +${arbeit.arbeitenListe.length - 1}`;
      }
      
      // Kennzeichen oben, Arbeit darunter
      const blockHaupt = arbeit.kennzeichen || (arbeit.istIntern ? '🔧 ' + arbeit.kunde : arbeit.kunde);
      const blockArbeit = `<span class="zeitleiste-block-arbeit">${this.escapeHtml(arbeitKurzText)}</span>`;

      return `
        <div class="zeitleiste-block ${statusClass} ${internClass} ${schwebendClass} ${erweiterungClass}" 
             style="left: ${leftPercent}%; width: ${Math.max(widthPercent, 3)}%;"
             onclick="app.openZeitleisteKontextmenu(event, ${arbeit.terminId}, '${this.escapeHtml(arbeit.kunde)}', '${this.escapeHtml(arbeit.arbeit)}', '${arbeit.terminNr}', '${auftragsnrEscaped}')"
             title="${arbeit.kunde}${arbeit.kennzeichen ? ' - ' + arbeit.kennzeichen : ''}&#10;🔧 ${arbeitenTooltip}${fortsetzungText}&#10;${startZeitText} - ${endZeitText} (${dauerText})${abholzeitTooltip}${auftragsnrText}${schwebendTitleText}${erweiterungTitleText}${erweiterungBadgeTitleText}">
          ${schwebendBadge}<span class="zeitleiste-block-haupt">${this.escapeHtml(blockHaupt)}</span>${blockArbeit}
          <span class="zeitleiste-block-zeit">${startZeitText} - ${endZeitText}</span>
          ${erweiterungBadge}${istErweiterungIcon}
        </div>
      `;
    };
    
    // Tracke das Ende von Blöcken pro Termin, um Überlappungen zu vermeiden
    const terminEndzeiten = new Map(); // terminId -> letztes Ende in Minuten
    
    for (const arbeit of sortedArbeiten) {
      let startMinutes, endMinutes;
      
      // Feature 10: Für Anzeige die anzeigeZeitMinuten verwenden (bei abgeschlossenen Terminen = tatsächliche Zeit)
      const anzeigeZeit = arbeit.anzeigeZeitMinuten || arbeit.zeitMinuten;
      
      if (arbeit.startzeit) {
        // Mit Startzeit
        const [startH, startM] = arbeit.startzeit.split(':').map(Number);
        startMinutes = startH * 60 + startM;
        
        // BUG 8 FIX: Endzeit basierend auf individueller Arbeitszeit berechnen
        endMinutes = startMinutes + anzeigeZeit;
        
        // Kollisionsvermeidung: Wenn dieser Block mit einem vorherigen Block des gleichen Termins überlappt,
        // verschiebe ihn ans Ende des vorherigen Blocks
        const terminId = arbeit.terminId;
        if (terminEndzeiten.has(terminId)) {
          const vorherEnde = terminEndzeiten.get(terminId);
          if (startMinutes < vorherEnde) {
            // Überlappung! Verschiebe ans Ende des vorherigen Blocks
            startMinutes = vorherEnde;
            endMinutes = startMinutes + anzeigeZeit;
          }
        }
        
        // Wenn die Startzeit in der Pause liegt, nach der Pause verschieben
        if (pauseStartMinuten !== null && startMinutes >= pauseStartMinuten && startMinutes < pauseEndMinuten) {
          startMinutes = pauseEndMinuten;
          // Nach Verschiebung immer Endzeit neu berechnen (endzeitBerechnet basiert auf alter Startzeit)
          endMinutes = startMinutes + anzeigeZeit;
        }
        
        // Speichere das Ende dieses Blocks für Kollisionsvermeidung
        terminEndzeiten.set(terminId, Math.max(terminEndzeiten.get(terminId) || 0, endMinutes));
      } else {
        // Ohne Startzeit: Platziere nach letzter Arbeit (und nach Pause falls nötig)
        startMinutes = currentEndMinutes;
        // Wenn Start in der Pause liegt, nach der Pause beginnen
        if (pauseStartMinuten !== null && startMinutes >= pauseStartMinuten && startMinutes < pauseEndMinuten) {
          startMinutes = pauseEndMinuten;
        }
        
        // BUG 8 FIX: Immer individuelle Arbeitszeit verwenden
        endMinutes = startMinutes + anzeigeZeit;
      }
      
      // Prüfe ob der Termin über die Mittagspause geht
      if (pauseStartMinuten !== null && startMinutes < pauseStartMinuten && endMinutes > pauseStartMinuten) {
        // Termin überlappt mit der Pause - aufteilen
        
        // Teil 1: Vor der Pause
        const teil1End = pauseStartMinuten;
        bloeckeHtml += renderBlock(arbeit, startMinutes, teil1End, false);
        
        // Teil 2: Nach der Pause (mit der verbleibenden Zeit)
        const verbrauchteZeit = teil1End - startMinutes;
        const verbleibendeZeit = anzeigeZeit - verbrauchteZeit;
        if (verbleibendeZeit > 0) {
          const teil2Start = pauseEndMinuten;
          const teil2End = teil2Start + verbleibendeZeit;
          bloeckeHtml += renderBlock(arbeit, teil2Start, teil2End, true);
          currentEndMinutes = teil2End;
        } else {
          currentEndMinutes = teil1End;
        }
      } else {
        // Termin überlappt nicht mit der Pause - normal rendern
        bloeckeHtml += renderBlock(arbeit, startMinutes, endMinutes, false);
        
        // Wenn das Ende in der Pause liegt, nach der Pause fortsetzen
        if (pauseStartMinuten !== null && endMinutes > pauseStartMinuten && endMinutes <= pauseEndMinuten) {
          currentEndMinutes = pauseEndMinuten;
        } else {
          currentEndMinutes = endMinutes;
        }
      }
    }

    bloeckeHtml += '</div>';

    return `
      <div class="${rowClass}">
        <div class="zeitleiste-mitarbeiter">
          <span class="zeitleiste-mitarbeiter-name">${this.escapeHtml(name)}</span>
          ${typ ? `<span class="zeitleiste-mitarbeiter-typ">${typ}</span>` : ''}
        </div>
        <div class="zeitleiste-timeline">
          ${gitterHtml}
          ${mittagspauseHtml}
          ${jetztMarkerHtml}
          ${bloeckeHtml}
        </div>
      </div>
    `;
  }

  minutesToTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  // ==========================================
  // ZEITLEISTE KONTEXTMENÜ
  // ==========================================

  openZeitleisteKontextmenu(event, terminId, kunde, arbeit, terminNr, interneAuftragsnummer = '') {
    event.stopPropagation();
    
    const menu = document.getElementById('zeitleisteKontextmenu');
    const header = document.getElementById('zeitleisteKontextmenuHeader');
    
    // Speichere aktuelle Termin-Info
    this.zeitleisteKontextTerminId = terminId;
    
    // Header befüllen mit Auftragsnummer
    const auftragsnrHtml = interneAuftragsnummer ? `<small class="kontextmenu-auftragsnr">Interne Auftragsnr.: ${interneAuftragsnummer}</small>` : '';
    header.innerHTML = `
      <strong>${terminNr}</strong> - ${kunde}
      <small>${arbeit}</small>
      ${auftragsnrHtml}
    `;
    
    // Position berechnen
    let x = event.clientX;
    let y = event.clientY;
    
    // Menü anzeigen (temporär für Größenmessung)
    menu.style.display = 'block';
    menu.style.visibility = 'hidden';
    
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Sicherstellen, dass Menü im Viewport bleibt
    if (x + menuRect.width > viewportWidth) {
      x = viewportWidth - menuRect.width - 10;
    }
    if (y + menuRect.height > viewportHeight) {
      y = viewportHeight - menuRect.height - 10;
    }
    
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.visibility = 'visible';
    
    // Click außerhalb schließt Menü
    setTimeout(() => {
      document.addEventListener('click', this.closeZeitleisteKontextmenuHandler);
    }, 10);
  }

  closeZeitleisteKontextmenuHandler = (event) => {
    const menu = document.getElementById('zeitleisteKontextmenu');
    if (menu && !menu.contains(event.target)) {
      menu.style.display = 'none';
      document.removeEventListener('click', this.closeZeitleisteKontextmenuHandler);
    }
  }

  closeZeitleisteKontextmenu() {
    const menu = document.getElementById('zeitleisteKontextmenu');
    if (menu) {
      menu.style.display = 'none';
    }
    document.removeEventListener('click', this.closeZeitleisteKontextmenuHandler);
  }

  zeitleisteKontextZeiten() {
    this.closeZeitleisteKontextmenu();
    if (this.zeitleisteKontextTerminId) {
      this.openArbeitszeitenModal(this.zeitleisteKontextTerminId);
    }
  }

  zeitleisteKontextDetails() {
    this.closeZeitleisteKontextmenu();
    if (this.zeitleisteKontextTerminId) {
      this.showTerminDetails(this.zeitleisteKontextTerminId);
    }
  }

  zeitleisteKontextLoeschen() {
    this.closeZeitleisteKontextmenu();
    if (this.zeitleisteKontextTerminId) {
      this.deleteTermin(this.zeitleisteKontextTerminId);
    }
  }

  zeitleisteKontextSplit() {
    this.closeZeitleisteKontextmenu();
    if (!this.zeitleisteKontextTerminId) return;
    
    const termin = this.termineById[this.zeitleisteKontextTerminId];
    if (!termin) {
      alert('Termin nicht gefunden');
      return;
    }

    // Setze currentDetailTerminId für die Split-Funktion
    this.currentDetailTerminId = this.zeitleisteKontextTerminId;

    const gesamtzeit = termin.geschaetzte_zeit || 60;
    
    // Info-Box befüllen
    document.getElementById('splitTerminInfo').innerHTML = `
      <strong>${termin.termin_nr || '-'}</strong> - ${termin.kunde_name || '-'}<br>
      <span style="color: #666;">${termin.arbeit || '-'}</span>
    `;
    document.getElementById('splitGesamtzeit').textContent = `${gesamtzeit} Min. (${this.formatMinutesToHours(gesamtzeit)})`;
    
    // Standard-Werte setzen (50/50 Split)
    const teil1Zeit = Math.round(gesamtzeit / 2);
    document.getElementById('splitTeil1Zeit').value = teil1Zeit;
    document.getElementById('splitTeil1Zeit').max = gesamtzeit - 1;
    document.getElementById('splitTeil1Range').max = gesamtzeit;
    document.getElementById('splitTeil1Range').value = teil1Zeit;
    
    // Teil 2 Zeit berechnen
    document.getElementById('splitTeil2Zeit').value = gesamtzeit - teil1Zeit;
    
    // Morgen als Standard-Datum für Teil 2
    const morgen = new Date();
    morgen.setDate(morgen.getDate() + 1);
    // Sonntag überspringen
    if (morgen.getDay() === 0) {
      morgen.setDate(morgen.getDate() + 1);
    }
    document.getElementById('splitTeil2Datum').value = this.formatDateLocal(morgen);
    document.getElementById('splitTeil2Datum').min = this.formatDateLocal(new Date());
    
    // Speichere Gesamtzeit für Range-Updates
    this.splitGesamtzeit = gesamtzeit;
    
    // Preview aktualisieren
    this.updateSplitPreview();
    
    // Split-Modal anzeigen
    document.getElementById('terminSplitModal').style.display = 'block';
    
    // Event-Listener für Teil1-Input
    document.getElementById('splitTeil1Zeit').oninput = () => this.updateSplitFromInput();
  }

  // =================================================================================
  // FEATURE 9: DRAG & DROP AUSLASTUNG
  // =================================================================================

  async loadAuslastungDragDrop() {
    const datumInput = document.getElementById('auslastungDragDropDatum');
    if (!datumInput) return;
    
    const datum = datumInput.value;
    if (!datum) return;

    // Prüfe auf ungespeicherte Änderungen beim Datumswechsel
    if (this.planungAenderungen.size > 0 && this._lastPlanungDatum && this._lastPlanungDatum !== datum) {
      if (!confirm(`Es gibt ${this.planungAenderungen.size} ungespeicherte Änderung(en). Datum trotzdem wechseln?\n\nÄnderungen werden verworfen.`)) {
        datumInput.value = this._lastPlanungDatum;
        return;
      }
      this.planungAenderungen.clear();
    }
    this._lastPlanungDatum = datum;
    
    // UI für Änderungen aktualisieren
    this.updatePlanungAenderungenUI();

    try {
      // 1. Termine für das Datum laden
      const termine = await TermineService.getAll(datum);

      // 1b. Schwebende Termine laden (alle Termine, dann filtern)
      const alleTermine = await TermineService.getAll(null);
      // Robuste Filterung: ist_schwebend kann 1, "1", true sein
      const schwebendeTermine = alleTermine.filter(t => 
        t.ist_schwebend === 1 || t.ist_schwebend === '1' || t.ist_schwebend === true
      );
      
      // Schwebende Termine markieren und zu den Terminen hinzufügen (ohne Duplikate)
      schwebendeTermine.forEach(st => {
        st._istSchwebend = true; // Markierung für UI
        if (!termine.find(t => t.id === st.id)) {
          termine.push(st);
        }
      });

      // 2. Mitarbeiter UND Lehrlinge laden
      const mitarbeiterListe = await MitarbeiterService.getAll();
      const lehrlingeListe = await LehrlingeService.getAll();

      // 3. Echte Auslastung laden (für korrekte Kapazitäten)
      const auslastungData = await AuslastungService.getByDatum(datum);
      
      // 3b. Werkstatt-Einstellungen laden (für Nebenzeit)
      const einstellungen = await EinstellungenService.getWerkstatt();
      const nebenzeitProzent = einstellungen?.nebenzeit_prozent || 0;
      // Speichere für spätere Verwendung in getTerminGesamtdauer
      this._planungNebenzeitProzent = nebenzeitProzent;

      // 3c. Auslastungsbalken aktualisieren
      this.updatePlanungAuslastungsbalken(auslastungData, mitarbeiterListe, lehrlingeListe);

      // 4. Container leeren
      const sourceContainer = document.getElementById('dragDropNichtZugeordnet');
      const schwebendeContainer = document.getElementById('schwebendeTermineContainer');
      const timelineHeader = document.getElementById('timelineHours');
      const timelineBody = document.getElementById('timelineBody');
      
      if (sourceContainer) sourceContainer.innerHTML = ''; 
      if (schwebendeContainer) schwebendeContainer.innerHTML = '';
      if (timelineHeader) timelineHeader.innerHTML = '';
      if (timelineBody) timelineBody.innerHTML = '';

      // 5. Timeline Header erstellen (Stunden von 8:00 bis 18:00)
      const startHour = 8;
      const endHour = 18;
      const currentHour = new Date().getHours();
      const currentMinute = new Date().getMinutes();
      
      // Halbstündliche Anzeige
      for (let h = startHour; h <= endHour; h++) {
        // Volle Stunde
        const hourDiv = document.createElement('div');
        const isCurrentHour = (h === currentHour && currentMinute < 30);
        hourDiv.className = 'timeline-hour timeline-hour-full' + (isCurrentHour ? ' current-hour' : '');
        hourDiv.textContent = `${h}:00`;
        timelineHeader.appendChild(hourDiv);
        
        // Halbe Stunde (nicht nach der letzten Stunde)
        if (h < endHour) {
          const halfHourDiv = document.createElement('div');
          const isCurrentHalf = (h === currentHour && currentMinute >= 30);
          halfHourDiv.className = 'timeline-hour timeline-hour-half' + (isCurrentHalf ? ' current-hour' : '');
          halfHourDiv.textContent = `${h}:30`;
          timelineHeader.appendChild(halfHourDiv);
        }
      }

      // 6. Mitarbeiter Zeitbahnen erstellen
      const mitarbeiterMap = {}; // ID -> Track Element
      const lehrlingeMap = {}; // ID -> Track Element
      
      // === MITARBEITER ===
      mitarbeiterListe.forEach(ma => {
        const maxMinuten = (ma.arbeitsstunden_pro_tag || 8) * 60;
        
        // Aktuelle Auslastung aus API holen (belegt_minuten_roh = reine Arbeitszeit ohne Nebenzeit)
        let currentMinuten = 0;
        let istAbwesend = false;
        if (auslastungData && auslastungData.mitarbeiter_auslastung) {
          const maAuslastung = auslastungData.mitarbeiter_auslastung.find(m => m.mitarbeiter_id === ma.id);
          if (maAuslastung) {
            currentMinuten = maAuslastung.belegt_minuten_roh || maAuslastung.belegt_minuten || 0;
            istAbwesend = maAuslastung.ist_abwesend === true;
          }
        }

        const row = document.createElement('div');
        row.className = 'timeline-row' + (istAbwesend ? ' abwesend' : '');
        const abwesendBadge = istAbwesend ? '<span class="abwesend-badge">🏥 Abwesend</span>' : '';
        const kapazitaetText = istAbwesend ? '0/0 min (abwesend)' : `${currentMinuten}/${maxMinuten} min`;
        row.innerHTML = `
          <div class="timeline-mitarbeiter">
            <div class="timeline-mitarbeiter-name">👷 ${ma.name}${abwesendBadge}</div>
            <div class="timeline-mitarbeiter-kapazitaet" id="kapazitaet-ma-${ma.id}">${kapazitaetText}</div>
          </div>
          <div class="timeline-track ${istAbwesend ? 'abwesend-track' : 'drop-zone'}" data-mitarbeiter-id="${ma.id}" data-type="mitarbeiter" data-abwesend="${istAbwesend}"></div>
        `;
        timelineBody.appendChild(row);
        
        const track = row.querySelector('.timeline-track');
        mitarbeiterMap[ma.id] = track;
        
        // Mittagspause hinzufügen (nur wenn nicht abwesend)
        if (!istAbwesend) {
          this.addMittagspauseToTrack(track, ma.mittagspause_start, startHour);
          // Drop-Events nur für nicht-abwesende registrieren
          this.setupTimelineDropZone(track, startHour);
        }
      });

      // === LEHRLINGE ===
      lehrlingeListe.forEach(lehrling => {
        const maxMinuten = (lehrling.arbeitsstunden_pro_tag || 8) * 60;
        
        // Aktuelle Auslastung aus API holen (belegt_minuten_roh = reine Arbeitszeit ohne Nebenzeit)
        let currentMinuten = 0;
        let istAbwesend = false;
        if (auslastungData && auslastungData.lehrlinge_auslastung) {
          const lAuslastung = auslastungData.lehrlinge_auslastung.find(l => l.lehrling_id === lehrling.id);
          if (lAuslastung) {
            currentMinuten = lAuslastung.belegt_minuten_roh || lAuslastung.belegt_minuten || 0;
            istAbwesend = lAuslastung.ist_abwesend === true;
          }
        }

        const row = document.createElement('div');
        row.className = 'timeline-row timeline-row-lehrling' + (istAbwesend ? ' abwesend' : '');
        const abwesendBadge = istAbwesend ? '<span class="abwesend-badge">🏥 Abwesend</span>' : '';
        const kapazitaetText = istAbwesend ? '0/0 min (abwesend)' : `${currentMinuten}/${maxMinuten} min`;
        row.innerHTML = `
          <div class="timeline-mitarbeiter timeline-lehrling">
            <div class="timeline-mitarbeiter-name">🎓 ${lehrling.name}${abwesendBadge}</div>
            <div class="timeline-mitarbeiter-kapazitaet" id="kapazitaet-lehrling-${lehrling.id}">${kapazitaetText}</div>
          </div>
          <div class="timeline-track ${istAbwesend ? 'abwesend-track' : 'drop-zone'}" data-lehrling-id="${lehrling.id}" data-type="lehrling" data-abwesend="${istAbwesend}"></div>
        `;
        timelineBody.appendChild(row);
        
        const track = row.querySelector('.timeline-track');
        lehrlingeMap[lehrling.id] = track;
        
        // Mittagspause und Drop-Events nur wenn nicht abwesend
        if (!istAbwesend) {
          this.addMittagspauseToTrack(track, lehrling.mittagspause_start, startHour);
          this.setupTimelineDropZone(track, startHour, 'lehrling');
        }
      });

      // 7. Termine verteilen
      // Erstelle Maps mit Pause-Infos für die Termin-Erstellung
      const mitarbeiterPauseMap = {};
      mitarbeiterListe.forEach(ma => {
        mitarbeiterPauseMap[ma.id] = ma.mittagspause_start || null;
      });
      const lehrlingePauseMap = {};
      lehrlingeListe.forEach(l => {
        lehrlingePauseMap[l.id] = l.mittagspause_start || null;
      });

      termine.forEach(termin => {
        // Termin im Cache speichern für späteren Zugriff (z.B. Shift+Click)
        this.termineById[termin.id] = termin;
        
        // Schwebende Termine separat in eigenem Panel anzeigen (nicht hier)
        const istSchwebend = termin.ist_schwebend === 1 || termin.ist_schwebend === true;
        if (istSchwebend) {
          return; // Schwebende Termine später separat verarbeiten
        }
        
        // Parse arbeitszeiten_details
        let details = null;
        if (termin.arbeitszeiten_details) {
          try {
            details = typeof termin.arbeitszeiten_details === 'string' 
              ? JSON.parse(termin.arbeitszeiten_details) 
              : termin.arbeitszeiten_details;
          } catch (e) {
            console.warn('Fehler beim Parsen von arbeitszeiten_details:', e);
          }
        }
        
        // Zähle einzelne Arbeiten (nicht Meta-Felder)
        const arbeiten = [];
        if (details) {
          for (const key in details) {
            if (key.startsWith('_')) continue; // Meta-Felder überspringen
            const arbeitData = details[key];
            // Arbeit mit Details (Objekt) oder einfacher Wert (Zahl)
            if (typeof arbeitData === 'object' && arbeitData !== null) {
              arbeiten.push({ name: key, ...arbeitData });
            } else if (typeof arbeitData === 'number') {
              arbeiten.push({ name: key, zeit: arbeitData });
            }
          }
        }
        
        // Wenn Termin mehrere Arbeiten hat, jede als separaten Block darstellen
        if (arbeiten.length > 1) {
          // Mehrere Arbeiten - jede als separater Block
          arbeiten.forEach((arbeit, index) => {
            const arbeitZuordnung = this.getArbeitZuordnung(arbeit, details, termin);
            
            // Erstelle virtuellen Termin für diese Arbeit
            const arbeitTermin = {
              ...termin,
              _arbeitName: arbeit.name,
              _arbeitIndex: index,
              _istArbeitBlock: true,
              _arbeitDauer: arbeit.zeit || 30,
              startzeit: arbeit.startzeit || details._startzeit || termin.startzeit || termin.bring_zeit || '08:00'
            };
            
            // Platziere auf der richtigen Timeline
            if (arbeitZuordnung.type === 'lehrling' && arbeitZuordnung.id && lehrlingeMap[arbeitZuordnung.id]) {
              const pauseStart = lehrlingePauseMap[arbeitZuordnung.id];
              const timelineElement = this.createArbeitBlockElement(arbeitTermin, arbeit, startHour, endHour, pauseStart, 'lehrling');
              if (timelineElement) lehrlingeMap[arbeitZuordnung.id].appendChild(timelineElement);
            } else if (arbeitZuordnung.type === 'mitarbeiter' && arbeitZuordnung.id && mitarbeiterMap[arbeitZuordnung.id]) {
              const pauseStart = mitarbeiterPauseMap[arbeitZuordnung.id];
              const timelineElement = this.createArbeitBlockElement(arbeitTermin, arbeit, startHour, endHour, pauseStart, 'mitarbeiter');
              if (timelineElement) mitarbeiterMap[arbeitZuordnung.id].appendChild(timelineElement);
            } else {
              // Nicht zugeordnet - als Mini-Card anzeigen
              const card = this.createArbeitMiniCard(termin, arbeit, index);
              sourceContainer.appendChild(card);
            }
          });
        } else {
          // Einzelne Arbeit oder keine Details - normale Darstellung
          let zuordnungsTyp = null;
          let mitarbeiterId = null;
          let lehrlingId = null;
          let effektiveStartzeit = null;
          
          if (details) {
            // Priorität 1: _gesamt_mitarbeiter_id
            if (details._gesamt_mitarbeiter_id) {
              zuordnungsTyp = details._gesamt_mitarbeiter_id.type;
              if (zuordnungsTyp === 'lehrling') {
                lehrlingId = details._gesamt_mitarbeiter_id.id;
              } else if (zuordnungsTyp === 'mitarbeiter') {
                mitarbeiterId = details._gesamt_mitarbeiter_id.id;
              }
            }
            
            if (details._startzeit) {
              effektiveStartzeit = details._startzeit;
            }
            
            // Priorität 2: Erste Arbeit mit eigener Zuordnung
            if (!zuordnungsTyp && arbeiten.length === 1) {
              const arbeit = arbeiten[0];
              if (arbeit.type === 'lehrling' && (arbeit.lehrling_id || arbeit.mitarbeiter_id)) {
                zuordnungsTyp = 'lehrling';
                lehrlingId = arbeit.lehrling_id || arbeit.mitarbeiter_id;
                if (arbeit.startzeit) effektiveStartzeit = arbeit.startzeit;
              } else if (arbeit.mitarbeiter_id) {
                zuordnungsTyp = arbeit.type || 'mitarbeiter';
                mitarbeiterId = arbeit.mitarbeiter_id;
                if (arbeit.startzeit) effektiveStartzeit = arbeit.startzeit;
              }
            }
          }
          
          // Priorität 3: Fallback auf termin.mitarbeiter_id
          if (!zuordnungsTyp && termin.mitarbeiter_id) {
            mitarbeiterId = termin.mitarbeiter_id;
            zuordnungsTyp = 'mitarbeiter';
          }
          
          // Erstelle Kopie des Termins mit effektiver Startzeit
          const terminFuerTimeline = { ...termin };
          if (effektiveStartzeit) {
            terminFuerTimeline.startzeit = effektiveStartzeit;
          }
          
          // Termin auf Timeline platzieren
          if (zuordnungsTyp === 'lehrling' && lehrlingId && lehrlingeMap[lehrlingId]) {
            const pauseStart = lehrlingePauseMap[lehrlingId];
            const timelineElements = this.createTimelineTerminWithPause(terminFuerTimeline, startHour, endHour, pauseStart, 'lehrling');
            timelineElements.forEach(el => {
              if (el) lehrlingeMap[lehrlingId].appendChild(el);
            });
          } else if (mitarbeiterId && mitarbeiterMap[mitarbeiterId]) {
            const pauseStart = mitarbeiterPauseMap[mitarbeiterId];
            const timelineElements = this.createTimelineTerminWithPause(terminFuerTimeline, startHour, endHour, pauseStart);
            timelineElements.forEach(el => {
              if (el) mitarbeiterMap[mitarbeiterId].appendChild(el);
            });
          } else {
            // Nicht zugeordnet
            const card = this.createTerminMiniCard(termin);
            sourceContainer.appendChild(card);
          }
        }
      });
      
      // Drop-Zone für "Nicht zugeordnet"
      this.setupDropZone(sourceContainer);

      // 8. Schwebende Termine separat im eigenen Panel rendern
      this.renderSchwebendeTermine(schwebendeTermine, schwebendeContainer);

      // 9. Überfällige Termine laden und rendern
      this.loadUeberfaelligeTermine();

      // Kapazitäten einfärben - Mitarbeiter
      mitarbeiterListe.forEach(ma => {
        const maxMinuten = (ma.arbeitsstunden_pro_tag || 8) * 60;
        let currentMinuten = 0;
        if (auslastungData && auslastungData.mitarbeiter_auslastung) {
          const maAuslastung = auslastungData.mitarbeiter_auslastung.find(m => m.mitarbeiter_id === ma.id);
          if (maAuslastung) currentMinuten = maAuslastung.belegt_minuten_roh || maAuslastung.belegt_minuten || 0;
        }
        
        const kapSpan = document.getElementById(`kapazitaet-ma-${ma.id}`);
        if (kapSpan) {
          if (currentMinuten > maxMinuten) {
            kapSpan.style.color = 'var(--accent)';
            kapSpan.style.fontWeight = 'bold';
          } else {
            kapSpan.style.color = 'var(--muted)';
            kapSpan.style.fontWeight = 'normal';
          }
        }
      });

      // Kapazitäten einfärben - Lehrlinge
      lehrlingeListe.forEach(lehrling => {
        const maxMinuten = (lehrling.arbeitsstunden_pro_tag || 8) * 60;
        let currentMinuten = 0;
        if (auslastungData && auslastungData.lehrlinge_auslastung) {
          const lAuslastung = auslastungData.lehrlinge_auslastung.find(l => l.lehrling_id === lehrling.id);
          if (lAuslastung) currentMinuten = lAuslastung.belegt_minuten_roh || lAuslastung.belegt_minuten || 0;
        }
        
        const kapSpan = document.getElementById(`kapazitaet-lehrling-${lehrling.id}`);
        if (kapSpan) {
          if (currentMinuten > maxMinuten) {
            kapSpan.style.color = 'var(--accent)';
            kapSpan.style.fontWeight = 'bold';
          } else {
            kapSpan.style.color = 'var(--muted)';
            kapSpan.style.fontWeight = 'normal';
          }
        }
      });

      // "Jetzt"-Linie hinzufügen
      this.addTimelineNowLine(startHour, endHour);

    } catch (error) {
      console.error('Fehler beim Laden der Drag & Drop Auslastung:', error);
      alert('Fehler beim Laden der Daten: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  addMittagspauseToTrack(track, pauseStart, startHour) {
    if (!pauseStart) return;
    
    const [pauseH, pauseM] = pauseStart.split(':').map(Number);
    const pauseDauer = 30; // 30 Minuten Pause
    
    const pixelPerHour = 100;
    const pixelPerMinute = pixelPerHour / 60;
    
    const pauseStartMinutes = (pauseH - startHour) * 60 + pauseM;
    const leftPx = pauseStartMinutes * pixelPerMinute;
    const widthPx = pauseDauer * pixelPerMinute;
    
    const pauseBlock = document.createElement('div');
    pauseBlock.className = 'timeline-mittagspause';
    pauseBlock.style.left = `${leftPx}px`;
    pauseBlock.style.width = `${widthPx}px`;
    pauseBlock.title = `Mittagspause ${pauseStart} - ${pauseDauer} min`;
    pauseBlock.innerHTML = '🍽️';
    
    track.appendChild(pauseBlock);
  }

  /**
   * Rendert schwebende Termine als Balken im separaten Panel
   * @param {Array} schwebendeTermine - Array mit schwebenden Terminen
   * @param {HTMLElement} container - Container für die Balken
   */
  renderSchwebendeTermine(schwebendeTermine, container) {
    if (!container) return;
    
    // Sortierung anwenden (Standard: nach Datum)
    const sortSelect = document.getElementById('schwebendeSortierung');
    const sortierung = sortSelect ? sortSelect.value : 'datum';
    
    const sortierteTermine = this.sortSchwebendeTermineArray(schwebendeTermine, sortierung);
    
    // Counter aktualisieren
    const countElement = document.getElementById('schwebendeCount');
    if (countElement) {
      countElement.textContent = `${sortierteTermine.length} Termin${sortierteTermine.length !== 1 ? 'e' : ''}`;
    }
    
    // Alle schwebenden Termine im Cache speichern, damit sie bei allen Clients verfügbar sind
    sortierteTermine.forEach(termin => {
      this.termineById[termin.id] = termin;
    });
    
    // Balken erstellen
    sortierteTermine.forEach(termin => {
      const bar = this.createSchwebenderTerminBar(termin);
      container.appendChild(bar);
    });
    
    // Speichere Referenz für Sortierung
    this._schwebendeTermineCache = schwebendeTermine;
    
    // Drop-Zone für "Nicht zugeordnet" Container einrichten (um Termine hierher zu ziehen)
    this.setupSchwebendDropZone(container);
  }

  /**
   * Richtet Drop-Zone für schwebende Termine ein (zum Verschieben von Terminen in "Nicht zugeordnet")
   */
  setupSchwebendDropZone(container) {
    if (!container || container._dropZoneSetup) return;
    container._dropZoneSetup = true;
    
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      container.classList.add('drag-over-schwebend');
    });
    
    container.addEventListener('dragleave', (e) => {
      // Nur entfernen wenn wir wirklich den Container verlassen
      if (!container.contains(e.relatedTarget)) {
        container.classList.remove('drag-over-schwebend');
      }
    });
    
    container.addEventListener('drop', async (e) => {
      e.preventDefault();
      container.classList.remove('drag-over-schwebend');
      
      const terminId = e.dataTransfer.getData('text/plain');
      
      if (terminId) {
        try {
          // Termin als schwebend markieren und Mitarbeiter-Zuweisung entfernen
          await TermineService.update(terminId, { 
            ist_schwebend: 1, 
            mitarbeiter_id: null,
            startzeit: null
          });
          
          this.showToast('📋 Termin in "Nicht zugeordnet" verschoben', 'success');
          
          // Ansicht neu laden
          this.loadAuslastungDragDrop();
        } catch (error) {
          console.error('Fehler beim Verschieben:', error);
          this.showToast('Fehler beim Verschieben', 'error');
        }
      }
    });
  }

  /**
   * Sortiert das Array von schwebenden Terminen
   */
  sortSchwebendeTermineArray(termine, sortierung) {
    return [...termine].sort((a, b) => {
      switch (sortierung) {
        case 'datum':
          // Nach Abholzeit/Datum sortieren
          const datumA = a.abhol_datum || a.datum || '9999-12-31';
          const datumB = b.abhol_datum || b.datum || '9999-12-31';
          return datumA.localeCompare(datumB);
          
        case 'dauer':
          // Nach geschätzter Zeit (längste zuerst)
          const dauerA = this.getTerminGesamtdauer(a);
          const dauerB = this.getTerminGesamtdauer(b);
          return dauerB - dauerA;
          
        case 'kunde':
          // Alphabetisch nach Kundenname
          const kundeA = (a.kunde_name || '').toLowerCase();
          const kundeB = (b.kunde_name || '').toLowerCase();
          return kundeA.localeCompare(kundeB);
          
        case 'dringlichkeit':
          // Nach Dringlichkeit (hoch zuerst)
          const dringlichkeitOrder = { 'hoch': 1, 'mittel': 2, 'normal': 3, 'niedrig': 4 };
          const dringA = this.getTerminDringlichkeit(a);
          const dringB = this.getTerminDringlichkeit(b);
          return (dringlichkeitOrder[dringA] || 3) - (dringlichkeitOrder[dringB] || 3);
        
        case 'prioritaet':
          // Nach Priorität (hoch zuerst)
          const prioritaetOrder = { 'hoch': 1, 'mittel': 2, 'niedrig': 3 };
          const prioA = a.schwebend_prioritaet || 'mittel';
          const prioB = b.schwebend_prioritaet || 'mittel';
          return (prioritaetOrder[prioA] || 2) - (prioritaetOrder[prioB] || 2);
          
        default:
          return 0;
      }
    });
  }

  /**
   * Handler für Sortierungs-Änderung
   */
  sortSchwebendeTermine(sortierung) {
    const container = document.getElementById('schwebendeTermineContainer');
    if (!container || !this._schwebendeTermineCache) return;
    
    container.innerHTML = '';
    this.renderSchwebendeTermine(this._schwebendeTermineCache, container);
  }

  // =============================================================================
  // ÜBERFÄLLIGE TERMINE (aus Vortagen, nicht abgeschlossen)
  // =============================================================================

  /**
   * Lädt überfällige Termine (aus vergangenen Tagen, die noch nicht abgeschlossen sind)
   */
  async loadUeberfaelligeTermine() {
    const container = document.getElementById('ueberfaelligeTermineContainer');
    const countBadge = document.getElementById('ueberfaelligeCount');
    
    if (!container) return;
    
    try {
      // Aktuelles Datum (heute)
      const heute = this.formatDateLocal(this.getToday());
      
      // Alle Termine laden
      const termine = await ApiService.get('/termine');
      
      // Filtere überfällige Termine:
      // - Datum liegt vor heute
      // - Status ist NICHT abgeschlossen, abgeholt oder storniert
      // - Nicht gelöscht
      const ueberfaellig = termine.filter(t => {
        const terminDatum = t.datum;
        const istVergangen = terminDatum < heute;
        const nichtAbgeschlossen = !['abgeschlossen', 'abgeholt', 'storniert'].includes(t.status);
        const nichtGeloescht = !t.geloescht;
        
        return istVergangen && nichtAbgeschlossen && nichtGeloescht;
      });
      
      // Nach Datum sortieren (älteste zuerst)
      ueberfaellig.sort((a, b) => a.datum.localeCompare(b.datum));
      
      // Cache für spätere Verwendung
      this._ueberfaelligeTermineCache = ueberfaellig;
      
      // Counter aktualisieren
      if (countBadge) {
        countBadge.textContent = `${ueberfaellig.length} Termin${ueberfaellig.length !== 1 ? 'e' : ''}`;
      }
      
      // Rendern
      this.renderUeberfaelligeTermine(ueberfaellig, container);
      
    } catch (error) {
      console.error('Fehler beim Laden überfälliger Termine:', error);
      container.innerHTML = '<div class="empty-state">Fehler beim Laden</div>';
    }
  }

  /**
   * Rendert die überfälligen Termine
   */
  renderUeberfaelligeTermine(termine, container) {
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!termine || termine.length === 0) {
      container.innerHTML = '<div class="empty-state">✅ Keine überfälligen Termine</div>';
      return;
    }
    
    const heute = this.getToday();
    
    termine.forEach(termin => {
      const card = document.createElement('div');
      card.className = 'ueberfaelliger-termin';
      card.dataset.terminId = termin.id;
      
      // Tage überfällig berechnen
      const terminDatum = new Date(termin.datum + 'T12:00:00');
      const diffTime = heute - terminDatum;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      // Arbeiten kürzen
      const arbeiten = termin.arbeiten ? 
        (termin.arbeiten.length > 50 ? termin.arbeiten.substring(0, 50) + '...' : termin.arbeiten) : 
        'Keine Arbeiten';
      
      // Datum formatieren
      const datumFormatiert = new Date(termin.datum + 'T12:00:00').toLocaleDateString('de-DE', {
        weekday: 'short', day: '2-digit', month: '2-digit'
      });
      
      card.innerHTML = `
        <div class="ueberfaelliger-termin-info">
          <div class="ueberfaelliger-termin-header">
            <span class="ueberfaelliger-termin-kunde">${termin.kunde_name || 'Unbekannt'}</span>
            <span class="ueberfaelliger-termin-datum">📅 ${datumFormatiert} (${diffDays} Tag${diffDays !== 1 ? 'e' : ''} überfällig)</span>
          </div>
          <div class="ueberfaelliger-termin-details">
            <span class="ueberfaelliger-termin-kennzeichen">${termin.kennzeichen || ''}</span>
            <span class="ueberfaelliger-termin-arbeiten">${arbeiten}</span>
          </div>
        </div>
        <div class="ueberfaelliger-termin-actions">
          <button class="btn btn-abschliessen" onclick="app.abschliessenUeberfaelligenTermin(${termin.id})" title="Als abgeschlossen markieren">
            ✅ Abschließen
          </button>
          <button class="btn btn-einplanen" onclick="app.neuEinplanenUeberfaelligenTermin(${termin.id})" title="Auf heute oder anderes Datum neu einplanen">
            📅 Neu einplanen
          </button>
          <button class="btn btn-details" onclick="app.showTerminDetails(${termin.id})" title="Details anzeigen">
            🔍
          </button>
        </div>
      `;
      
      container.appendChild(card);
    });
  }

  /**
   * Markiert einen überfälligen Termin als abgeschlossen
   */
  async abschliessenUeberfaelligenTermin(terminId) {
    if (!confirm('Termin als abgeschlossen markieren?')) return;
    
    try {
      await ApiService.put(`/termine/${terminId}`, { status: 'abgeschlossen' });
      
      this.showToast('✅ Termin abgeschlossen', 'success');
      
      // Überfällige Termine neu laden
      this.loadUeberfaelligeTermine();
      
      // Auch andere Listen aktualisieren
      this.loadTermine();
      
    } catch (error) {
      console.error('Fehler beim Abschließen:', error);
      this.showToast('Fehler beim Abschließen: ' + (error.message || 'Unbekannt'), 'error');
    }
  }

  /**
   * Plant einen überfälligen Termin auf ein neues Datum - öffnet Modal
   */
  neuEinplanenUeberfaelligenTermin(terminId) {
    // Termin aus Cache holen
    const termin = this._ueberfaelligeTermineCache?.find(t => t.id === terminId);
    if (!termin) {
      this.showToast('Termin nicht gefunden', 'error');
      return;
    }
    
    // Termin-ID merken für späteren Zugriff
    this._neuEinplanenTerminId = terminId;
    
    // Modal-Felder füllen
    document.getElementById('neuEinplanenKunde').textContent = termin.kunde_name || 'Unbekannt';
    document.getElementById('neuEinplanenKennzeichen').textContent = termin.kennzeichen || '';
    document.getElementById('neuEinplanenArbeiten').textContent = termin.arbeiten ? 
      (termin.arbeiten.length > 40 ? termin.arbeiten.substring(0, 40) + '...' : termin.arbeiten) : 
      'Keine Arbeiten';
    document.getElementById('neuEinplanenAltDatum').textContent = 
      new Date(termin.datum + 'T12:00:00').toLocaleDateString('de-DE', {
        weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
      });
    
    // Datum auf heute setzen
    const heute = this.formatDateLocal(this.getToday());
    document.getElementById('neuEinplanenDatum').value = heute;
    document.getElementById('neuEinplanenDatum').min = heute;
    document.getElementById('neuEinplanenStatusReset').checked = true;
    
    // Modal anzeigen
    document.getElementById('neuEinplanenModal').style.display = 'flex';
  }

  /**
   * Schließt das Neu-Einplanen Modal
   */
  closeNeuEinplanenModal() {
    document.getElementById('neuEinplanenModal').style.display = 'none';
    this._neuEinplanenTerminId = null;
  }

  /**
   * Setzt das Datum im Neu-Einplanen Modal (Schnellauswahl)
   */
  setNeuEinplanenDatum(auswahl) {
    const datumInput = document.getElementById('neuEinplanenDatum');
    const heute = this.getToday();
    
    let neuesDatum;
    switch (auswahl) {
      case 'heute':
        neuesDatum = heute;
        break;
      case 'morgen':
        neuesDatum = new Date(heute);
        neuesDatum.setDate(neuesDatum.getDate() + 1);
        break;
      case 'naechsteWoche':
        neuesDatum = new Date(heute);
        // Zum nächsten Montag
        const tagBisMonatg = (8 - neuesDatum.getDay()) % 7 || 7;
        neuesDatum.setDate(neuesDatum.getDate() + tagBisMonatg);
        break;
      default:
        return;
    }
    
    datumInput.value = this.formatDateLocal(neuesDatum);
  }

  /**
   * Bestätigt das Neu-Einplanen und führt es aus
   */
  async confirmNeuEinplanen() {
    const terminId = this._neuEinplanenTerminId;
    if (!terminId) {
      this.showToast('Kein Termin ausgewählt', 'error');
      return;
    }
    
    const neuesDatum = document.getElementById('neuEinplanenDatum').value;
    const statusReset = document.getElementById('neuEinplanenStatusReset').checked;
    const alsSchwebend = document.getElementById('neuEinplanenAlsSchwebend')?.checked ?? true;
    
    if (!neuesDatum) {
      this.showToast('Bitte ein Datum auswählen', 'warning');
      return;
    }
    
    try {
      const updateData = { 
        datum: neuesDatum,
        ist_schwebend: alsSchwebend ? 1 : 0,  // Als "Nicht zugeordnet" markieren
        mitarbeiter_id: alsSchwebend ? null : undefined  // Mitarbeiter-Zuweisung entfernen wenn schwebend
      };
      if (statusReset) {
        updateData.status = 'offen';
      }
      
      await ApiService.put(`/termine/${terminId}`, updateData);
      
      const datumFormatiert = new Date(neuesDatum + 'T12:00:00').toLocaleDateString('de-DE', {
        weekday: 'short', day: '2-digit', month: '2-digit'
      });
      
      const zielText = alsSchwebend ? ' → Nicht zugeordnet' : '';
      this.showToast(`📅 Termin auf ${datumFormatiert} verschoben${zielText}`, 'success');
      
      // Modal schließen
      this.closeNeuEinplanenModal();
      
      // Listen aktualisieren
      this.loadUeberfaelligeTermine();
      this.loadTermine();
      
      // Falls Drag&Drop-Ansicht aktiv, auch dort aktualisieren
      const datumInput = document.getElementById('auslastungDragDropDatum');
      if (datumInput && datumInput.value === neuesDatum) {
        this.loadAuslastungDragDrop();
      }
      
    } catch (error) {
      console.error('Fehler beim Neu-Einplanen:', error);
      this.showToast('Fehler beim Neu-Einplanen: ' + (error.message || 'Unbekannt'), 'error');
    }
  }

  /**
   * Aktualisiert den Auslastungsbalken in Planung & Zuweisung
   */
  updatePlanungAuslastungsbalken(auslastungData, mitarbeiterListe, lehrlingeListe) {
    const prozentElement = document.getElementById('planungAuslastungProzent');
    const fillElement = document.getElementById('planungAuslastungFill');
    const minutenElement = document.getElementById('planungAuslastungMinuten');
    
    if (!prozentElement || !fillElement || !minutenElement) return;
    
    // Verwende dieselbe Berechnung wie in der Auslastungs-Ansicht
    // Die Werte kommen direkt vom Backend (inkl. Nebenzeit-Berechnung)
    let prozent = 0;
    let belegtMinuten = 0;
    let gesamtKapazitaet = 0;
    
    if (auslastungData) {
      // Verwende die vom Backend berechneten Werte (konsistent mit Auslastungs-Tab)
      prozent = auslastungData.auslastung_prozent || 0;
      belegtMinuten = auslastungData.belegt_minuten_mit_service || auslastungData.belegt_minuten || 0;
      gesamtKapazitaet = auslastungData.gesamt_minuten || 0;
    }
    
    // Falls keine Backend-Daten, berechne aus Mitarbeiter-Listen (Fallback)
    if (gesamtKapazitaet === 0) {
      if (mitarbeiterListe && mitarbeiterListe.length > 0) {
        mitarbeiterListe.forEach(ma => {
          gesamtKapazitaet += (ma.arbeitsstunden_pro_tag || 8) * 60;
        });
      }
      if (lehrlingeListe && lehrlingeListe.length > 0) {
        lehrlingeListe.forEach(lehrling => {
          gesamtKapazitaet += (lehrling.arbeitsstunden_pro_tag || 8) * 60;
        });
      }
    }
    
    const prozentCapped = Math.min(prozent, 100); // Maximal 100% für Balkenbreite
    
    // Auslastungs-Klasse bestimmen (gleiche Schwellwerte wie Auslastungs-Tab)
    let auslastungKlasse = 'auslastung-niedrig';
    if (prozent > 100) {
      auslastungKlasse = 'auslastung-hoch';
    } else if (prozent > 80) {
      auslastungKlasse = 'auslastung-mittel';
    }
    
    // UI aktualisieren
    prozentElement.textContent = `${Math.round(prozent)}%`;
    prozentElement.className = auslastungKlasse;
    
    fillElement.style.width = `${prozentCapped}%`;
    fillElement.className = `planung-auslastung-fill ${auslastungKlasse}`;
    
    // Stunden/Minuten formatieren
    const belegtStunden = Math.floor(belegtMinuten / 60);
    const belegtRestMinuten = Math.round(belegtMinuten % 60);
    const kapazitaetStunden = Math.floor(gesamtKapazitaet / 60);
    const kapazitaetRestMinuten = Math.round(gesamtKapazitaet % 60);
    
    const belegtText = belegtStunden > 0 
      ? `${belegtStunden}h ${belegtRestMinuten > 0 ? belegtRestMinuten + 'min' : ''}`.trim()
      : `${belegtRestMinuten}min`;
    const kapazitaetText = kapazitaetStunden > 0 
      ? `${kapazitaetStunden}h ${kapazitaetRestMinuten > 0 ? kapazitaetRestMinuten + 'min' : ''}`.trim()
      : `${gesamtKapazitaet}min`;
    
    minutenElement.textContent = `${belegtText} / ${kapazitaetText} belegt`;
  }

  /**
   * Ermittelt die Dringlichkeit eines Termins
   */
  getTerminDringlichkeit(termin) {
    // Prüfe ob explizite Dringlichkeit gesetzt ist
    if (termin.dringlichkeit) {
      return termin.dringlichkeit.toLowerCase();
    }
    
    // Berechne basierend auf Abholzeit
    if (termin.abhol_datum) {
      const heute = new Date();
      heute.setHours(0, 0, 0, 0);
      const abholDatum = new Date(termin.abhol_datum);
      abholDatum.setHours(0, 0, 0, 0);
      
      const tageUntilAbhol = Math.ceil((abholDatum - heute) / (1000 * 60 * 60 * 24));
      
      if (tageUntilAbhol <= 0) return 'hoch';      // Überfällig oder heute
      if (tageUntilAbhol <= 1) return 'mittel';    // Morgen
      if (tageUntilAbhol <= 3) return 'normal';    // 2-3 Tage
      return 'niedrig';                            // Mehr als 3 Tage
    }
    
    return 'normal';
  }

  /**
   * Erstellt einen Balken für einen schwebenden Termin
   */
  createSchwebenderTerminBar(termin) {
    const bar = document.createElement('div');
    
    // Dauer berechnen
    const dauer = this.getTerminGesamtdauer(termin);
    const dringlichkeit = this.getTerminDringlichkeit(termin);
    
    bar.className = `schwebender-termin-bar dringlichkeit-${dringlichkeit}`;
    bar.draggable = true;
    bar.id = `schwebend-bar-${termin.id}`;
    
    // CSS Custom Property für dynamische Breite
    bar.style.setProperty('--termin-dauer', dauer);
    
    // Tooltip-Daten erstellen
    const dauerText = dauer >= 60 
      ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim()
      : `${dauer} min`;
    
    const abholInfo = termin.abhol_datum 
      ? `Abholung: ${this.formatDatum(termin.abhol_datum)}` 
      : 'Keine Abholzeit';
    
    // Bring/Abholzeit für Anzeige
    const bringZeitText = termin.bring_zeit ? `🚗↓ ${termin.bring_zeit}` : '';
    const abholZeitText = termin.abholung_zeit ? `🚗↑ ${termin.abholung_zeit}` : '';
    const zeitenInfo = [bringZeitText, abholZeitText].filter(t => t).join(' • ');
    
    const tooltip = [
      `🚗 ${termin.kennzeichen || 'Kein KFZ'}`,
      `👤 ${termin.kunde_name || 'Unbekannt'}`,
      `⏱️ Dauer: ${dauerText}`,
      termin.bring_zeit ? `🚗↓ Bringzeit: ${termin.bring_zeit}` : '',
      termin.abholung_zeit ? `🚗↑ Abholzeit: ${termin.abholung_zeit}` : '',
      `📅 ${abholInfo}`,
      `📋 ${this.getTerminArbeitenText(termin)}`
    ].filter(t => t).join('\n');
    
    bar.setAttribute('data-tooltip', tooltip);
    bar.dataset.terminId = termin.id;
    bar.dataset.dauer = dauer;
    bar.dataset.dringlichkeit = dringlichkeit;
    
    // Priorität Badge erstellen
    const prioritaet = termin.schwebend_prioritaet || 'mittel';
    const prioritaetBadges = {
      'hoch': '<span class="prioritaet-badge prioritaet-badge-hoch" title="Hohe Priorität">🔴</span>',
      'mittel': '<span class="prioritaet-badge prioritaet-badge-mittel" title="Mittlere Priorität">🟡</span>',
      'niedrig': '<span class="prioritaet-badge prioritaet-badge-niedrig" title="Niedrige Priorität">🟢</span>'
    };
    const prioritaetBadge = prioritaetBadges[prioritaet] || prioritaetBadges['mittel'];
    
    // Inhalt des Balkens
    bar.innerHTML = `
      <div class="bar-header">${prioritaetBadge} ${termin.termin_nr || 'Neu'} • ${termin.kennzeichen || ''}</div>
      <div class="bar-details">${termin.kunde_name || 'Unbekannt'}</div>
      <div class="bar-zeit">⏱️ ${dauerText}</div>
      ${zeitenInfo ? `<div class="bar-zeiten">${zeitenInfo}</div>` : ''}
      <button class="btn-einplanen" onclick="event.stopPropagation(); app.einplanenSchwebenderTermin(${termin.id})" title="In aktuellen Tag einplanen">📅 Einplanen</button>
    `;
    
    // Drag Events
    bar.addEventListener('dragstart', (e) => {
      bar.classList.add('dragging');
      e.dataTransfer.setData('text/plain', termin.id);
      e.dataTransfer.setData('application/x-dauer', dauer.toString());
      e.dataTransfer.setData('application/x-schwebend', 'true');
      e.dataTransfer.effectAllowed = 'move';
      
      // Zeit-Indikator erstellen
      this.createDragTimeIndicator();
    });

    bar.addEventListener('dragend', () => {
      bar.classList.remove('dragging');
      document.querySelectorAll('.drop-zone').forEach(zone => zone.classList.remove('drag-over'));
      // Zeit-Indikator entfernen
      this.removeDragTimeIndicator();
    });
    
    // Doppelklick zum Bearbeiten
    bar.addEventListener('dblclick', () => {
      // Wechsle zum Termine-Tab und öffne das Formular (mit display toggle)
      const contents = this.tabCache.contents || document.querySelectorAll('.tab-content');
      for (let i = 0; i < contents.length; i++) {
        contents[i].style.display = 'none';
        contents[i].classList.remove('active');
      }
      const buttons = this.tabCache.buttons || document.querySelectorAll('.tab-button');
      for (let i = 0; i < buttons.length; i++) {
        buttons[i].classList.remove('active');
      }

      const termineTab = this.getCachedElement('termine');
      const termineTabButton = document.querySelector('.tab-button[data-tab="termine"]');

      if (termineTab && termineTabButton) {
        termineTab.style.display = 'block';
        termineTab.classList.add('active');
        termineTabButton.classList.add('active');

        // Zum "Neuer Termin" Sub-Tab wechseln
        termineTab.querySelectorAll('.sub-tab-content').forEach(content => {
          content.style.display = 'none';
          content.classList.remove('active');
        });
        termineTab.querySelectorAll('.sub-tab-button').forEach(btn => {
          btn.classList.remove('active');
        });

        const neuerTerminContent = this.getCachedElement('neuerTermin');
        const neuerTerminButton = termineTab.querySelector('.sub-tab-button[data-subtab="neuerTermin"]');

        if (neuerTerminContent && neuerTerminButton) {
          neuerTerminContent.style.display = 'block';
          neuerTerminContent.classList.add('active');
          neuerTerminButton.classList.add('active');
        }
      }

      this.loadTerminInForm(termin.id);
    });

    // Shift+Click für schnellen Status-Wechsel, normaler Click für Details
    bar.addEventListener('click', (e) => {
      // Ignoriere Klicks auf den Einplanen-Button
      if (e.target.closest('.btn-einplanen')) {
        return;
      }
      
      if (e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const aktuellerTermin = this.termineById[termin.id] || termin;
        const startzeit = termin.startzeit || termin.bring_zeit || '08:00';
        this.showSchnellStatusDialog(aktuellerTermin, bar, startzeit, dauer);
      } else {
        // Normaler Klick - Details anzeigen
        e.stopPropagation();
        this.showTerminDetails(termin.id);
      }
    });

    return bar;
  }

  /**
   * Schwebenden Termin in den aktuell gewählten Tag einplanen - Modal öffnen
   */
  async einplanenSchwebenderTermin(terminId) {
    // Termin-Daten laden - erst aus Cache, dann vom Server
    let termin = this.termineById[terminId];
    
    if (!termin) {
      // Termin nicht im Cache - direkt vom Server laden
      try {
        termin = await TermineService.getById(terminId);
        if (termin) {
          // In Cache speichern
          this.termineById[terminId] = termin;
        }
      } catch (error) {
        console.error('Fehler beim Laden des Termins:', error);
      }
    }
    
    if (!termin) {
      console.error('Termin nicht gefunden:', terminId);
      alert('Termin konnte nicht geladen werden. Bitte Seite neu laden.');
      return;
    }
    
    // Termin-ID speichern
    this.schwebendEinplanenTerminId = terminId;
    
    // Modal-Felder befüllen
    document.getElementById('schwebendEinplanenKunde').textContent = termin.kunde_name || 'Unbekannt';
    document.getElementById('schwebendEinplanenKennzeichen').textContent = termin.kennzeichen || '-';
    document.getElementById('schwebendEinplanenArbeiten').textContent = termin.arbeit || this.getTerminArbeitenText(termin) || '-';
    
    // Datum aus dem aktuellen Datumsfeld übernehmen
    const datumInput = document.getElementById('auslastungDragDropDatum');
    const datum = datumInput?.value || new Date().toISOString().split('T')[0];
    document.getElementById('schwebendEinplanenDatum').value = datum;
    
    // Checkbox standardmäßig aktiviert = Termin bleibt in "Nicht zugeordnet"
    document.getElementById('schwebendEinplanenAlsSchwebend').checked = true;
    
    // Modal anzeigen
    document.getElementById('schwebendEinplanenModal').style.display = 'flex';
  }
  
  /**
   * Modal für schwebende Termine schließen
   */
  closeSchwebendEinplanenModal() {
    document.getElementById('schwebendEinplanenModal').style.display = 'none';
    this.schwebendEinplanenTerminId = null;
  }
  
  /**
   * Schnellauswahl-Datum für schwebende Termine setzen
   */
  setSchwebendEinplanenDatum(option) {
    const heute = new Date();
    let datum;
    
    switch(option) {
      case 'heute':
        datum = heute;
        break;
      case 'morgen':
        datum = new Date(heute);
        datum.setDate(datum.getDate() + 1);
        break;
      case 'naechsteWoche':
        datum = new Date(heute);
        datum.setDate(datum.getDate() + 7);
        break;
      default:
        datum = heute;
    }
    
    document.getElementById('schwebendEinplanenDatum').value = datum.toISOString().split('T')[0];
  }
  
  /**
   * Schwebenden Termin einplanen bestätigen
   */
  async confirmSchwebendEinplanen() {
    const terminId = this.schwebendEinplanenTerminId;
    if (!terminId) return;
    
    const datum = document.getElementById('schwebendEinplanenDatum').value;
    if (!datum) {
      alert('Bitte wählen Sie ein Datum aus.');
      return;
    }
    
    const inNichtZugeordnet = document.getElementById('schwebendEinplanenAlsSchwebend').checked;
    
    try {
      const updateData = {
        datum: datum,
        ist_schwebend: 0  // Termin ist nicht mehr schwebend
      };
      
      if (inNichtZugeordnet) {
        // Checkbox aktiviert: Termin in "Nicht zugeordnet" (ohne Mitarbeiter)
        updateData.mitarbeiter_id = null;
      }
      // Wenn Checkbox nicht aktiviert, bleibt der vorhandene mitarbeiter_id
      
      await TermineService.update(terminId, updateData);
      
      if (inNichtZugeordnet) {
        this.showToast(`Termin für ${this.formatDatum(datum)} in "Nicht zugeordnet" eingeplant`, 'success');
      } else {
        this.showToast(`Termin wurde für ${this.formatDatum(datum)} eingeplant`, 'success');
      }
      
      // Modal schließen
      this.closeSchwebendEinplanenModal();
      
      // Ansicht neu laden
      this.loadAuslastungDragDrop();
    } catch (error) {
      console.error('Fehler beim Einplanen des Termins:', error);
      alert('Fehler beim Einplanen. Bitte erneut versuchen.');
    }
  }

  /**
   * Gibt einen kurzen Text zu den Arbeiten eines Termins zurück
   */
  getTerminArbeitenText(termin) {
    let details = null;
    if (termin.arbeitszeiten_details) {
      try {
        details = typeof termin.arbeitszeiten_details === 'string' 
          ? JSON.parse(termin.arbeitszeiten_details) 
          : termin.arbeitszeiten_details;
      } catch (e) {
        return termin.arbeit || 'Keine Arbeit';
      }
    }
    
    if (!details) {
      return termin.arbeit || 'Keine Arbeit';
    }
    
    const arbeiten = [];
    for (const key in details) {
      if (key.startsWith('_')) continue;
      arbeiten.push(key);
    }
    
    if (arbeiten.length === 0) {
      return termin.arbeit || 'Keine Arbeit';
    }
    
    if (arbeiten.length <= 2) {
      return arbeiten.join(', ');
    }
    
    return `${arbeiten.slice(0, 2).join(', ')} +${arbeiten.length - 2}`;
  }

  // Hilfsmethode: Ermittle Zuordnung einer einzelnen Arbeit
  getArbeitZuordnung(arbeit, details, termin) {
    // Zuerst: Eigene Zuordnung der Arbeit prüfen
    if (arbeit.type === 'lehrling' && (arbeit.lehrling_id || arbeit.mitarbeiter_id)) {
      return { type: 'lehrling', id: arbeit.lehrling_id || arbeit.mitarbeiter_id };
    }
    if (arbeit.mitarbeiter_id) {
      return { type: arbeit.type || 'mitarbeiter', id: arbeit.mitarbeiter_id };
    }
    
    // Fallback: _gesamt_mitarbeiter_id
    if (details && details._gesamt_mitarbeiter_id) {
      return { 
        type: details._gesamt_mitarbeiter_id.type, 
        id: details._gesamt_mitarbeiter_id.id 
      };
    }
    
    // Fallback: termin.mitarbeiter_id
    if (termin.mitarbeiter_id) {
      return { type: 'mitarbeiter', id: termin.mitarbeiter_id };
    }
    
    return { type: null, id: null };
  }

  // Erstellt ein Timeline-Element für einen Arbeitsblock
  createArbeitBlockElement(termin, arbeit, startHour, endHour, pauseStart, type = 'mitarbeiter') {
    const isSchwebend = termin.ist_schwebend === 1 || termin._istSchwebend;
    
    // Startzeit parsen
    let startzeit = termin.startzeit || '08:00';
    const [startH, startM] = startzeit.split(':').map(Number);
    
    // Dauer dieser Arbeit
    const dauer = arbeit.zeit || 30;
    
    // Nebenzeit-Aufschlag
    const nebenzeitProzent = this._planungNebenzeitProzent || 0;
    const dauerMitNebenzeit = nebenzeitProzent > 0 
      ? Math.round(dauer * (1 + nebenzeitProzent / 100)) 
      : dauer;
    
    // Position berechnen (100px pro Stunde)
    const pixelPerHour = 100;
    const pixelPerMinute = pixelPerHour / 60;
    
    const startMinutesFromDayStart = (startH - startHour) * 60 + startM;
    const leftPx = startMinutesFromDayStart * pixelPerMinute;
    const widthPx = Math.max(dauerMitNebenzeit * pixelPerMinute, 40);
    
    // Außerhalb des sichtbaren Bereichs?
    if (startH < startHour || startH > endHour) {
      return null;
    }
    
    // Dauer formatiert
    const dauerText = dauerMitNebenzeit >= 60 
      ? `${Math.floor(dauerMitNebenzeit/60)}h ${dauerMitNebenzeit%60 > 0 ? (dauerMitNebenzeit%60) + 'min' : ''}`.trim()
      : `${dauerMitNebenzeit} min`;

    const div = document.createElement('div');
    const statusClass = termin.status ? ` status-${termin.status.toLowerCase().replace(' ', '-')}` : '';
    div.className = 'timeline-termin arbeit-block' + statusClass + (isSchwebend ? ' schwebend' : '');
    div.id = `timeline-arbeit-${termin.id}-${termin._arbeitIndex}`;
    div.dataset.terminId = termin.id;
    div.dataset.arbeitName = arbeit.name;
    div.dataset.arbeitIndex = termin._arbeitIndex;
    div.dataset.dauer = dauerMitNebenzeit;
    div.dataset.originalDauer = dauer;
    div.draggable = true;
    div.style.left = `${leftPx}px`;
    div.style.width = `${widthPx}px`;
    
    // Farbe basierend auf Arbeit-Index für visuelle Unterscheidung
    const colors = ['#3498db', '#9b59b6', '#1abc9c', '#f39c12', '#e74c3c'];
    const colorIndex = termin._arbeitIndex % colors.length;
    div.style.borderLeft = `4px solid ${colors[colorIndex]}`;
    
    // Abholzeit-Info
    const abholzeitInfo = termin.abholung_zeit ? `\n🚗 Abholung: ${termin.abholung_zeit}` : '';
    
    div.innerHTML = `
      <div class="termin-title">${termin.termin_nr || 'Neu'}</div>
      <div class="termin-info arbeit-name">${arbeit.name}</div>
      <div class="termin-info">${dauerText}</div>
    `;
    div.title = `${termin.termin_nr}\n${termin.kunde_name}\n\n📋 Arbeit: ${arbeit.name}\n⏱️ Dauer: ${dauerText}\n🕐 Start: ${startzeit}${abholzeitInfo}`;

    // Drag Events
    div.addEventListener('dragstart', (e) => {
      div.classList.add('dragging');
      e.dataTransfer.setData('text/plain', termin.id);
      e.dataTransfer.setData('application/x-arbeit-name', arbeit.name);
      e.dataTransfer.setData('application/x-arbeit-index', termin._arbeitIndex);
      e.dataTransfer.setData('application/x-startzeit', startzeit);
      e.dataTransfer.setData('application/x-dauer', dauerMitNebenzeit);
      e.dataTransfer.setData('application/x-ist-arbeit-block', 'true');
      e.dataTransfer.effectAllowed = 'move';
      
      this.createDragTimeIndicator();
    });

    div.addEventListener('dragend', () => {
      div.classList.remove('dragging');
      document.querySelectorAll('.timeline-track').forEach(zone => zone.classList.remove('drag-over'));
      this.removeDragTimeIndicator();
    });

    // Shift+Click für schnellen Status-Wechsel
    div.addEventListener('click', (e) => {
      if (e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        // Aktuellen Termin aus Cache holen (für aktuellen Status)
        const aktuellerTermin = this.termineById[termin.id] || termin;
        this.showSchnellStatusDialog(aktuellerTermin, div, startzeit, dauer);
      }
    });

    return div;
  }

  // Erstellt eine Mini-Card für einen nicht zugeordneten Arbeitsblock
  createArbeitMiniCard(termin, arbeit, index) {
    const card = document.createElement('div');
    card.className = 'termin-mini-card arbeit-block';
    card.draggable = true;
    card.dataset.terminId = termin.id;
    card.dataset.arbeitName = arbeit.name;
    card.dataset.arbeitIndex = index;
    
    const dauer = arbeit.zeit || 30;
    
    // Farbe basierend auf Arbeit-Index
    const colors = ['#3498db', '#9b59b6', '#1abc9c', '#f39c12', '#e74c3c'];
    const colorIndex = index % colors.length;
    card.style.borderLeft = `4px solid ${colors[colorIndex]}`;
    
    // Bring/Abholzeit für Anzeige
    const bringZeitText = termin.bring_zeit ? `🚗↓ ${termin.bring_zeit}` : '';
    const abholZeitText = termin.abholung_zeit ? `🚗↑ ${termin.abholung_zeit}` : '';
    const zeitenInfo = [bringZeitText, abholZeitText].filter(t => t).join(' • ');
    
    card.innerHTML = `
      <div class="mini-card-header">
        <span class="mini-card-nr">${termin.termin_nr || 'Neu'}</span>
        <span class="mini-card-kennzeichen">${termin.kennzeichen || ''}</span>
      </div>
      <div class="mini-card-kunde">${termin.kunde_name || ''}</div>
      <div class="mini-card-arbeit">${arbeit.name}</div>
      <div class="mini-card-dauer">⏱️ ${dauer} min</div>
      ${zeitenInfo ? `<div class="mini-card-zeiten">${zeitenInfo}</div>` : ''}
    `;
    
    // Tooltip mit mehr Info
    const abholzeitInfo = termin.abholung_zeit ? `\n🚗↑ Abholung: ${termin.abholung_zeit}` : '';
    const bringzeitInfo = termin.bring_zeit ? `\n🚗↓ Bringzeit: ${termin.bring_zeit}` : '';
    card.title = `${termin.termin_nr}\n${termin.kunde_name}\n📋 ${arbeit.name}\n⏱️ ${dauer} min${bringzeitInfo}${abholzeitInfo}`;

    // Drag Events
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', termin.id);
      e.dataTransfer.setData('application/x-arbeit-name', arbeit.name);
      e.dataTransfer.setData('application/x-arbeit-index', index);
      e.dataTransfer.setData('application/x-dauer', dauer);
      e.dataTransfer.setData('application/x-ist-arbeit-block', 'true');
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.drop-zone').forEach(zone => zone.classList.remove('drag-over'));
    });

    return card;
  }

  // Berechne die tatsächliche Gesamtdauer aus arbeitszeiten_details
  getTerminGesamtdauer(termin) {
    // Nebenzeit-Prozent aus gespeichertem Wert (wird in loadAuslastungDragDrop gesetzt)
    const nebenzeitProzent = this._planungNebenzeitProzent || 0;
    
    // Versuche zuerst, die Dauer aus arbeitszeiten_details zu berechnen
    if (termin.arbeitszeiten_details) {
      try {
        const details = typeof termin.arbeitszeiten_details === 'string' 
          ? JSON.parse(termin.arbeitszeiten_details) 
          : termin.arbeitszeiten_details;
        
        let summe = 0;
        for (const [key, value] of Object.entries(details)) {
          // Ignoriere Meta-Felder
          if (key.startsWith('_')) continue;
          if (typeof value === 'number' && value > 0) {
            summe += value;
          }
        }
        if (summe > 0) {
          // Nebenzeit-Aufschlag anwenden
          if (nebenzeitProzent > 0) {
            summe = Math.round(summe * (1 + nebenzeitProzent / 100));
          }
          return summe;
        }
      } catch (e) {
        console.warn('Fehler beim Parsen von arbeitszeiten_details:', e);
      }
    }
    
    // Fallback: tatsaechliche_zeit oder geschaetzte_zeit
    let dauer = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 30;
    
    // Nebenzeit-Aufschlag auch auf Fallback anwenden
    if (nebenzeitProzent > 0) {
      dauer = Math.round(dauer * (1 + nebenzeitProzent / 100));
    }
    
    return dauer;
  }

  // Erstellt Timeline-Termine mit Berücksichtigung der Mittagspause
  // Gibt ein Array von Elementen zurück (1 Element normal, 2 Elemente wenn über Pause geteilt)
  createTimelineTerminWithPause(termin, startHour, endHour, mittagspauseStart, type = 'mitarbeiter') {
    const isSchwebend = termin.ist_schwebend === 1 || termin._istSchwebend;
    
    // Startzeit parsen
    let startzeit = termin.startzeit || termin.bring_zeit || '08:00';
    const [startH, startM] = startzeit.split(':').map(Number);
    
    // Dauer in Minuten
    const dauer = this.getTerminGesamtdauer(termin);
    
    // Berechne Start- und Endminuten
    const startMinutes = startH * 60 + startM;
    const endMinutes = startMinutes + dauer;
    
    // Mittagspause parsen (Standard: 30 Minuten Dauer)
    let pauseStartMinuten = null;
    let pauseEndMinuten = null;
    const pauseDauer = 30;
    
    if (mittagspauseStart) {
      const [pauseH, pauseM] = mittagspauseStart.split(':').map(Number);
      pauseStartMinuten = pauseH * 60 + pauseM;
      pauseEndMinuten = pauseStartMinuten + pauseDauer;
    }
    
    // Prüfe ob der Termin über die Mittagspause geht
    if (pauseStartMinuten !== null && startMinutes < pauseStartMinuten && endMinutes > pauseStartMinuten) {
      // Termin muss aufgeteilt werden!
      const elements = [];
      
      // Teil 1: Vor der Pause
      const teil1Dauer = pauseStartMinuten - startMinutes;
      const teil1 = this.createTimelineTerminElement(
        termin, startHour, endHour, type, isSchwebend,
        startzeit, teil1Dauer, dauer, false
      );
      if (teil1) elements.push(teil1);
      
      // Teil 2: Nach der Pause
      const teil2Dauer = endMinutes - pauseEndMinuten;
      if (teil2Dauer > 0) {
        const teil2StartH = Math.floor(pauseEndMinuten / 60);
        const teil2StartM = pauseEndMinuten % 60;
        const teil2Startzeit = `${String(teil2StartH).padStart(2, '0')}:${String(teil2StartM).padStart(2, '0')}`;
        
        const teil2 = this.createTimelineTerminElement(
          termin, startHour, endHour, type, isSchwebend,
          teil2Startzeit, teil2Dauer, dauer, true
        );
        if (teil2) elements.push(teil2);
      }
      
      return elements;
    }
    
    // Keine Aufteilung nötig - normaler Termin
    const element = this.createTimelineTerminElement(
      termin, startHour, endHour, type, isSchwebend,
      startzeit, dauer, dauer, false
    );
    return element ? [element] : [];
  }

  // Hilfsmethode: Erstellt ein einzelnes Timeline-Termin-Element
  createTimelineTerminElement(termin, startHour, endHour, type, isSchwebend, startzeit, displayDauer, gesamtDauer, istFortsetzung) {
    const [startH, startM] = startzeit.split(':').map(Number);
    
    // Position berechnen (100px pro Stunde)
    const pixelPerHour = 100;
    const pixelPerMinute = pixelPerHour / 60;
    
    const startMinutesFromDayStart = (startH - startHour) * 60 + startM;
    const leftPx = startMinutesFromDayStart * pixelPerMinute;
    const widthPx = Math.max(displayDauer * pixelPerMinute, 40); // Mindestbreite 40px
    
    // Außerhalb des sichtbaren Bereichs?
    if (startH < startHour || startH > endHour) {
      return null;
    }

    // Dauer formatiert anzeigen
    const dauerText = gesamtDauer >= 60 
      ? `${Math.floor(gesamtDauer/60)}h ${gesamtDauer%60 > 0 ? (gesamtDauer%60) + 'min' : ''}`.trim()
      : `${gesamtDauer} min`;

    // Abholzeit-Info
    const abholzeitInfo = termin.abholung_zeit ? `\n🚗 Abholung: ${termin.abholung_zeit}` : '';
    
    // Erweiterungs-Infos ermitteln
    const istErweiterung = termin.ist_erweiterung === 1 || termin.ist_erweiterung === true || termin.erweiterung_von_id;
    const erweiterungVonId = termin.erweiterung_von_id;
    
    // Zähle Erweiterungen zu diesem Termin (aus termineById Cache)
    let erweiterungAnzahl = 0;
    if (this.termineById) {
      Object.values(this.termineById).forEach(t => {
        if (t.erweiterung_von_id === termin.id && !t.ist_geloescht) {
          erweiterungAnzahl++;
        }
      });
    }

    const div = document.createElement('div');
    const statusClass = termin.status ? ` status-${termin.status.toLowerCase().replace(' ', '-')}` : '';
    const erweiterungClass = istErweiterung ? ' erweiterung-block' : '';
    div.className = 'timeline-termin' + statusClass + erweiterungClass + (isSchwebend ? ' schwebend' : '') + (istFortsetzung ? ' fortsetzung' : '');
    div.id = istFortsetzung ? `timeline-termin-${termin.id}-teil2` : `timeline-termin-${termin.id}`;
    div.dataset.terminId = termin.id;
    div.dataset.dauer = gesamtDauer;
    div.dataset.istFortsetzung = istFortsetzung ? '1' : '0';
    div.draggable = !istFortsetzung; // Nur Hauptteil ist draggable
    div.style.left = `${leftPx}px`;
    div.style.width = `${widthPx}px`;
    
    // Erweiterungs-Badge HTML
    const erweiterungBadgeHtml = erweiterungAnzahl > 0 
      ? `<span class="timeline-erweiterung-badge" title="${erweiterungAnzahl} Erweiterung(en) - Klicken zum Anzeigen">🔗${erweiterungAnzahl}</span>` 
      : '';
    
    // Ist-Erweiterung Badge (wenn dieser Termin selbst eine Erweiterung ist)
    const istErweiterungBadgeHtml = istErweiterung 
      ? `<span class="timeline-ist-erweiterung" title="Dies ist eine Erweiterung">🔗</span>` 
      : '';
    
    // Erweiterungs-Info für Tooltip
    const erweiterungInfo = istErweiterung ? '\n🔗 ERWEITERUNG' : '';
    const hatErweiterungenInfo = erweiterungAnzahl > 0 ? `\n🔗 ${erweiterungAnzahl} Erweiterung(en)` : '';
    
    if (istFortsetzung) {
      // Fortsetzung: Kompaktere Anzeige mit Verbindungsindikator
      div.innerHTML = `
        <div class="termin-title">↪ ${termin.termin_nr || 'Neu'}${istErweiterungBadgeHtml}</div>
        <div class="termin-info">${displayDauer} min (Forts.)</div>
      `;
      div.title = `${termin.termin_nr} (Fortsetzung nach Pause)\n${termin.kunde_name}\n${termin.arbeit}${abholzeitInfo}${erweiterungInfo}`;
    } else {
      div.innerHTML = `
        <div class="termin-title">${termin.termin_nr || 'Neu'} - ${termin.kennzeichen || ''}${istErweiterungBadgeHtml}${erweiterungBadgeHtml}</div>
        <div class="termin-info">${termin.kunde_name || ''} • ${dauerText}</div>
      `;
      div.title = `${termin.termin_nr}\n${termin.kunde_name}\n${termin.arbeit}\n${startzeit} - ${dauerText}${abholzeitInfo}${erweiterungInfo}${hatErweiterungenInfo}`;
    }
    
    // Klick-Handler für Erweiterungs-Badge (wenn vorhanden)
    if (erweiterungAnzahl > 0) {
      const badge = div.querySelector('.timeline-erweiterung-badge');
      if (badge) {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.showVerknuepfteTermine(termin.id);
        });
      }
    }
    
    // Klick-Handler für Ist-Erweiterung Badge (zeigt verknüpfte Termine)
    if (istErweiterung) {
      const istBadge = div.querySelector('.timeline-ist-erweiterung');
      if (istBadge) {
        istBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.showVerknuepfteTermine(termin.id);
        });
      }
    }

    // Klick: Normaler Klick = Schnell-Menü, Shift+Klick = Details
    // Gilt für ALLE Termine (auch Fortsetzungen und Erweiterungen)
    div.addEventListener('click', (e) => {
      // Ignoriere wenn auf Badge geklickt wurde (hat eigenen Handler)
      if (e.target.classList.contains('timeline-erweiterung-badge') || 
          e.target.classList.contains('timeline-ist-erweiterung')) {
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      const aktuellerTermin = this.termineById[termin.id] || termin;
      
      if (e.shiftKey) {
        // Shift+Klick - Termin-Details anzeigen
        this.showTerminDetails(termin.id);
      } else {
        // Normaler Klick - Schnell-Status-Menü
        this.showSchnellStatusDialog(aktuellerTermin, div, startzeit, gesamtDauer);
      }
    });

    // Drag Events nur für Hauptteil (nicht Fortsetzungen)
    if (!istFortsetzung) {
      div.addEventListener('dragstart', (e) => {
        div.classList.add('dragging');
        e.dataTransfer.setData('text/plain', termin.id);
        e.dataTransfer.setData('application/x-startzeit', startzeit);
        e.dataTransfer.setData('application/x-dauer', gesamtDauer);
        e.dataTransfer.effectAllowed = 'move';
        
        // Zeit-Indikator erstellen
        this.createDragTimeIndicator();
      });

      div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
        document.querySelectorAll('.timeline-track').forEach(zone => zone.classList.remove('drag-over'));
        // Zeit-Indikator entfernen
        this.removeDragTimeIndicator();
      });
    }

    return div;
  }

  // Alte Methode für Kompatibilität (ohne Pause-Berücksichtigung)
  createTimelineTermin(termin, startHour, endHour, type = 'mitarbeiter') {
    const isSchwebend = termin.ist_schwebend === 1 || termin._istSchwebend;
    
    // Startzeit parsen (Format: "HH:MM" oder aus bring_zeit)
    let startzeit = termin.startzeit || termin.bring_zeit || '08:00';
    const [startH, startM] = startzeit.split(':').map(Number);
    
    // Dauer in Minuten - berechnet aus arbeitszeiten_details
    const dauer = this.getTerminGesamtdauer(termin);
    
    // Position berechnen (100px pro Stunde)
    const pixelPerHour = 100;
    const pixelPerMinute = pixelPerHour / 60;
    
    const startMinutesFromDayStart = (startH - startHour) * 60 + startM;
    const leftPx = startMinutesFromDayStart * pixelPerMinute;
    const widthPx = Math.max(dauer * pixelPerMinute, 50); // Mindestbreite 50px
    
    // Außerhalb des sichtbaren Bereichs?
    if (startH < startHour || startH > endHour) {
      return null;
    }

    // Dauer formatiert anzeigen
    const dauerText = dauer >= 60 
      ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim()
      : `${dauer} min`;

    // Abholzeit-Info
    const abholzeitInfo = termin.abholung_zeit ? `\n🚗 Abholung: ${termin.abholung_zeit}` : '';

    const div = document.createElement('div');
    div.className = 'timeline-termin' + (isSchwebend ? ' schwebend' : '');
    div.id = `timeline-termin-${termin.id}`;
    div.dataset.terminId = termin.id;
    div.dataset.dauer = dauer;
    div.draggable = true;
    div.style.left = `${leftPx}px`;
    div.style.width = `${widthPx}px`;
    
    div.innerHTML = `
      <div class="termin-title">${termin.termin_nr || 'Neu'} - ${termin.kennzeichen || ''}</div>
      <div class="termin-info">${termin.kunde_name || ''} • ${dauerText}</div>
    `;
    
    div.title = `${termin.termin_nr}\n${termin.kunde_name}\n${termin.arbeit}\n${startzeit} - ${dauerText}${abholzeitInfo}`;

    // Drag Events
    div.addEventListener('dragstart', (e) => {
      div.classList.add('dragging');
      e.dataTransfer.setData('text/plain', termin.id);
      e.dataTransfer.setData('application/x-startzeit', startzeit);
      e.dataTransfer.setData('application/x-dauer', dauer);
      e.dataTransfer.effectAllowed = 'move';
      
      // Zeit-Indikator erstellen
      this.createDragTimeIndicator();
    });

    div.addEventListener('dragend', () => {
      div.classList.remove('dragging');
      document.querySelectorAll('.timeline-track').forEach(zone => zone.classList.remove('drag-over'));
      // Zeit-Indikator entfernen
      this.removeDragTimeIndicator();
    });

    // Klick für Termin-Details (normal) oder schnellen Status-Wechsel (Shift+Click)
    div.addEventListener('click', (e) => {
      if (e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        // Aktuellen Termin aus Cache holen (für aktuellen Status)
        const aktuellerTermin = this.termineById[termin.id] || termin;
        this.showSchnellStatusDialog(aktuellerTermin, div, startzeit, dauer);
      } else {
        // Normaler Klick - Termin-Details anzeigen
        e.preventDefault();
        e.stopPropagation();
        this.showTerminDetails(termin.id);
      }
    });

    return div;
  }

  // Zeit-Indikator erstellen
  createDragTimeIndicator() {
    if (document.getElementById('dragTimeIndicator')) return;
    
    const indicator = document.createElement('div');
    indicator.id = 'dragTimeIndicator';
    indicator.className = 'drag-time-indicator';
    indicator.innerHTML = `
      <div class="drag-time-label">🕐</div>
      <div class="drag-time-value">--:--</div>
      <div class="drag-time-end"></div>
    `;
    document.body.appendChild(indicator);
  }

  // Zeit-Indikator entfernen
  removeDragTimeIndicator() {
    const indicator = document.getElementById('dragTimeIndicator');
    if (indicator) indicator.remove();
    
    // Auch vertikale Linie entfernen
    document.querySelectorAll('.drag-position-line').forEach(el => el.remove());
  }

  // Zeit-Indikator aktualisieren
  updateDragTimeIndicator(x, y, zeit, endzeit) {
    const indicator = document.getElementById('dragTimeIndicator');
    if (!indicator) return;
    
    indicator.style.left = `${x + 15}px`;
    indicator.style.top = `${y - 50}px`;
    indicator.querySelector('.drag-time-value').textContent = zeit;
    indicator.querySelector('.drag-time-end').textContent = `bis ${endzeit}`;
    indicator.classList.add('visible');
  }

  setupTimelineDropZone(element, startHour, type = 'mitarbeiter') {
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      element.classList.add('drag-over');
      
      // Berechne Zeit für Indikator
      const rect = element.getBoundingClientRect();
      const dropX = e.clientX - rect.left;
      const pixelPerHour = 100;
      const hoursFromStart = dropX / pixelPerHour;
      const totalMinutes = Math.round((startHour + hoursFromStart) * 60);
      const raster = this.planungRaster || 5;
      const snappedMinutes = Math.round(totalMinutes / raster) * raster;
      let newHour = Math.floor(snappedMinutes / 60);
      let newMinute = snappedMinutes % 60;
      
      // Dauer für Endzeitberechnung (falls vorhanden)
      let dauer = 30; // Standard
      const draggingEl = document.querySelector('.dragging');
      if (draggingEl && draggingEl.dataset.dauer) {
        dauer = parseInt(draggingEl.dataset.dauer);
      }
      
      // Hole Termin-ID und Arbeit-Index für Kollisionsprüfung
      const draggingTerminId = draggingEl ? draggingEl.dataset.terminId : null;
      const draggingArbeitIndex = draggingEl ? draggingEl.dataset.arbeitIndex : null;
      const excludeArbeitIdx = draggingArbeitIndex !== undefined ? parseInt(draggingArbeitIndex) : null;
      
      // Berechne optimale Position (mit automatischem Anhängen bei nahen Terminen)
      const optimalePosition = this.berechneOptimaleStartzeit(element, snappedMinutes, dauer, draggingTerminId, excludeArbeitIdx);
      
      let anzeigeMinuten = snappedMinutes;
      let hatKollision = false;
      
      if (optimalePosition) {
        anzeigeMinuten = optimalePosition.startMinutes;
        newHour = Math.floor(anzeigeMinuten / 60);
        newMinute = anzeigeMinuten % 60;
      } else {
        hatKollision = true;
      }
      
      const zeit = `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
      const endMinutes = anzeigeMinuten + dauer;
      const endHour = Math.floor(endMinutes / 60);
      const endMinute = endMinutes % 60;
      const endzeit = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
      
      // Indikator aktualisieren (mit Anpassungshinweis)
      if (optimalePosition && optimalePosition.angepasst) {
        this.updateDragTimeIndicator(e.clientX, e.clientY, `→ ${zeit}`, endzeit);
      } else {
        this.updateDragTimeIndicator(e.clientX, e.clientY, zeit, endzeit);
      }
      
      // Positionslinie an der optimalen Position anzeigen
      const snappedLeftPx = ((newHour - startHour) * 60 + newMinute) * (pixelPerHour / 60);
      
      this.showDragPositionLine(element, snappedLeftPx, hatKollision ? { hatKollision: true } : null);
    });

    element.addEventListener('dragleave', () => {
      element.classList.remove('drag-over');
      // Positionslinie entfernen beim Verlassen
      document.querySelectorAll('.drag-position-line').forEach(el => el.remove());
    });

    element.addEventListener('drop', async (e) => {
      e.preventDefault();
      element.classList.remove('drag-over');
      // Zeit-Indikator und Positionslinie entfernen
      this.removeDragTimeIndicator();
      document.querySelectorAll('.drag-position-line').forEach(el => el.remove());
      
      const terminId = e.dataTransfer.getData('text/plain');
      const arbeitName = e.dataTransfer.getData('application/x-arbeit-name');
      const arbeitIndex = e.dataTransfer.getData('application/x-arbeit-index');
      const istArbeitBlock = e.dataTransfer.getData('application/x-ist-arbeit-block') === 'true';
      const mitarbeiterId = element.dataset.mitarbeiterId;
      const lehrlingId = element.dataset.lehrlingId;
      const targetType = element.dataset.type || 'mitarbeiter';
      
      // Berechne neue Startzeit basierend auf Drop-Position
      const rect = element.getBoundingClientRect();
      const dropX = e.clientX - rect.left;
      const pixelPerHour = 100;
      const hoursFromStart = dropX / pixelPerHour;
      const totalMinutes = Math.round((startHour + hoursFromStart) * 60);
      let newHour = Math.floor(totalMinutes / 60);
      // Raster aus Einstellung holen (Standard: 5 Minuten)
      const raster = this.planungRaster || 5;
      let newMinute = Math.round((totalMinutes % 60) / raster) * raster;
      let snappedMinutes = newHour * 60 + newMinute;
      
      // Hole Dauer des gezogenen Termins/Arbeit
      const draggingEl = document.querySelector('.dragging');
      let dauer = 30;
      if (draggingEl && draggingEl.dataset.dauer) {
        dauer = parseInt(draggingEl.dataset.dauer);
      }
      
      // Nutze die neue optimierte Kollisionsprüfung mit automatischem Anhängen
      const excludeArbeitIdx = istArbeitBlock ? parseInt(arbeitIndex) : null;
      const optimalePosition = this.berechneOptimaleStartzeit(element, snappedMinutes, dauer, terminId, excludeArbeitIdx);
      
      if (!optimalePosition) {
        // Kein freier Slot gefunden
        this.showToast(`❌ Kein freier Platz für diesen Termin gefunden`, 'error');
        return;
      }
      
      snappedMinutes = optimalePosition.startMinutes;
      newHour = Math.floor(snappedMinutes / 60);
      newMinute = snappedMinutes % 60;
      
      if (optimalePosition.angepasst) {
        this.showToast(`⏱️ ${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')} (${optimalePosition.grund})`, 'info');
      }
      
      const newStartzeit = `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
      
      if (terminId) {
        if (istArbeitBlock && arbeitName) {
          // Einzelnen Arbeitsblock verschieben
          await this.moveArbeitBlockToMitarbeiter(terminId, arbeitName, parseInt(arbeitIndex), mitarbeiterId, lehrlingId, targetType, newStartzeit);
        } else {
          // Ganzen Termin verschieben (alte Logik)
          await this.moveTerminToMitarbeiterWithTime(terminId, mitarbeiterId, lehrlingId, targetType, newStartzeit);
        }
      }
    });
  }

  // Prüft ob ein Drop an dieser Position eine Kollision verursacht
  // excludeElementId kann terminId oder arbeit-block-id sein
  checkDropKollision(track, startMinutes, dauer, excludeTerminId, excludeArbeitIndex = null) {
    const endMinutes = startMinutes + dauer;
    const result = { 
      hatKollision: false, 
      grund: '', 
      typ: null, 
      naheTermine: [] // Termine die nahe dran sind (< 45 min Abstand)
    };
    
    const NAHE_GRENZE = 45; // Minuten - wenn näher, wird automatisch angehängt
    
    // 1. Prüfe Mittagspause
    const pauseBlock = track.querySelector('.timeline-mittagspause');
    if (pauseBlock) {
      const pauseLeft = parseFloat(pauseBlock.style.left) || 0;
      const pauseWidth = parseFloat(pauseBlock.style.width) || 0;
      const pixelPerMinute = 100 / 60;
      const pauseStartMinutes = 8 * 60 + (pauseLeft / pixelPerMinute); // startHour = 8
      const pauseEndMinutes = pauseStartMinutes + (pauseWidth / pixelPerMinute);
      
      // Prüfe ob Termin in Pause startet
      if (startMinutes >= pauseStartMinutes && startMinutes < pauseEndMinutes) {
        result.hatKollision = true;
        result.grund = 'Termin kann nicht in der Mittagspause starten';
        result.typ = 'pause-start';
        result.pauseEndMinutes = pauseEndMinutes;
        result.pauseStartMinutes = pauseStartMinutes;
        return result;
      }
      
      // Prüfe ob Termin komplett in Pause liegt
      if (startMinutes >= pauseStartMinutes && endMinutes <= pauseEndMinutes) {
        result.hatKollision = true;
        result.grund = 'Termin liegt komplett in der Mittagspause';
        result.typ = 'pause-komplett';
        result.pauseEndMinutes = pauseEndMinutes;
        result.pauseStartMinutes = pauseStartMinutes;
        return result;
      }
    }
    
    // 2. Sammle alle Termine/Arbeitsblöcke auf diesem Track
    const alleBlocks = track.querySelectorAll('.timeline-termin:not(.fortsetzung)');
    const pixelPerMinute = 100 / 60;
    
    for (const blockEl of alleBlocks) {
      const tId = blockEl.dataset.terminId;
      const arbeitIdx = blockEl.dataset.arbeitIndex;
      
      // Eigenen Block ignorieren (bei Arbeitsblöcken: gleiche terminId UND gleicher arbeitIndex)
      if (tId === excludeTerminId) {
        // Bei Arbeitsblöcken: nur ignorieren wenn auch der Index übereinstimmt
        if (excludeArbeitIndex !== null) {
          if (arbeitIdx === String(excludeArbeitIndex)) continue;
          // Andere Arbeitsblöcke desselben Termins NICHT ignorieren!
        } else {
          // Normaler Termin (kein Arbeitsblock) - komplett ignorieren
          continue;
        }
      }
      
      const tLeft = parseFloat(blockEl.style.left) || 0;
      const tWidth = parseFloat(blockEl.style.width) || 0;
      const tStartMinutes = 8 * 60 + (tLeft / pixelPerMinute); // startHour = 8
      const tEndMinutes = tStartMinutes + (tWidth / pixelPerMinute);
      
      // Prüfe direkte Überlappung
      if (startMinutes < tEndMinutes && endMinutes > tStartMinutes) {
        result.hatKollision = true;
        result.grund = `Überlappung mit ${blockEl.dataset.arbeitName ? 'Arbeitsblock' : 'Termin'}`;
        result.typ = 'termin';
        result.konfliktTermin = { 
          start: tStartMinutes, 
          end: tEndMinutes, 
          terminId: tId,
          arbeitIndex: arbeitIdx
        };
        return result;
      }
      
      // Prüfe ob nahe dran (für automatisches Anhängen)
      const abstandVorher = startMinutes - tEndMinutes; // Positiv = Start ist nach Ende des anderen
      const abstandNachher = tStartMinutes - endMinutes; // Positiv = Start des anderen ist nach unserem Ende
      
      if (abstandVorher >= 0 && abstandVorher < NAHE_GRENZE) {
        // Dieser Block endet kurz vor unserer gewünschten Startzeit
        result.naheTermine.push({
          position: 'vorher',
          abstand: abstandVorher,
          terminStart: tStartMinutes,
          terminEnd: tEndMinutes,
          terminId: tId
        });
      }
      if (abstandNachher >= 0 && abstandNachher < NAHE_GRENZE) {
        // Dieser Block startet kurz nach unserem gewünschten Ende
        result.naheTermine.push({
          position: 'nachher',
          abstand: abstandNachher,
          terminStart: tStartMinutes,
          terminEnd: tEndMinutes,
          terminId: tId
        });
      }
    }
    
    return result;
  }

  // Versucht einen freien Slot zu finden und berücksichtigt nahe Termine
  findeFreienSlot(track, gewuenschteStart, dauer, excludeTerminId, kollision, excludeArbeitIndex = null) {
    const raster = this.planungRaster || 5;
    
    // Bei Pause-Kollision (Start in Pause oder komplett in Pause): Nach Pause verschieben
    if (kollision.typ === 'pause-start' || kollision.typ === 'pause-komplett') {
      const neueStart = Math.ceil(kollision.pauseEndMinutes / raster) * raster;
      // Prüfe ob nach der Pause frei ist
      const neueKollision = this.checkDropKollision(track, neueStart, dauer, excludeTerminId, excludeArbeitIndex);
      if (!neueKollision.hatKollision) {
        return { startMinutes: neueStart, grund: 'nach Mittagspause' };
      }
    }
    
    // Bei Termin-Kollision: Direkt nach dem Konflikt-Termin
    if (kollision.typ === 'termin') {
      // Direkt nach dem Konflikt-Termin anhängen
      const nachKonflikt = Math.ceil(kollision.konfliktTermin.end / raster) * raster;
      const kollisionNach = this.checkDropKollision(track, nachKonflikt, dauer, excludeTerminId, excludeArbeitIndex);
      if (!kollisionNach.hatKollision) {
        return { startMinutes: nachKonflikt, grund: 'direkt nach vorherigem Termin' };
      }
      
      // Wenn auch danach Kollision, rekursiv weitersuchen
      if (kollisionNach.hatKollision && kollisionNach.typ === 'termin') {
        return this.findeFreienSlot(track, nachKonflikt, dauer, excludeTerminId, kollisionNach, excludeArbeitIndex);
      }
    }
    
    // Keine automatische Korrektur möglich
    return null;
  }

  // Berechnet die optimale Startzeit wenn nahe an einem anderen Termin
  berechneOptimaleStartzeit(track, gewuenschteStart, dauer, excludeTerminId, excludeArbeitIndex = null) {
    const raster = this.planungRaster || 5;
    const NAHE_GRENZE = 45;
    
    // Hole Kollisionsergebnis mit nahen Terminen
    const kollision = this.checkDropKollision(track, gewuenschteStart, dauer, excludeTerminId, excludeArbeitIndex);
    
    // Bei direkter Kollision: freien Slot finden
    if (kollision.hatKollision) {
      const freierSlot = this.findeFreienSlot(track, gewuenschteStart, dauer, excludeTerminId, kollision, excludeArbeitIndex);
      if (freierSlot) {
        return { 
          startMinutes: freierSlot.startMinutes, 
          angepasst: true, 
          grund: freierSlot.grund 
        };
      }
      return null; // Kein freier Slot gefunden
    }
    
    // Keine direkte Kollision - prüfe ob nahe an anderem Termin
    if (kollision.naheTermine && kollision.naheTermine.length > 0) {
      // Finde den nächsten Termin der VOR unserer gewünschten Startzeit endet
      const termineVorher = kollision.naheTermine.filter(t => t.position === 'vorher');
      
      if (termineVorher.length > 0) {
        // Sortiere nach Abstand (kleinster zuerst)
        termineVorher.sort((a, b) => a.abstand - b.abstand);
        const naechsterVorher = termineVorher[0];
        
        // Wenn der Abstand klein ist, direkt anhängen
        if (naechsterVorher.abstand < NAHE_GRENZE && naechsterVorher.abstand > 0) {
          const angepassteStart = Math.ceil(naechsterVorher.terminEnd / raster) * raster;
          
          // Prüfe ob die angepasste Position frei ist
          const neueKollision = this.checkDropKollision(track, angepassteStart, dauer, excludeTerminId, excludeArbeitIndex);
          if (!neueKollision.hatKollision) {
            return {
              startMinutes: angepassteStart,
              angepasst: true,
              grund: `an vorherigen Termin angehängt`
            };
          }
        }
      }
    }
    
    // Keine Anpassung nötig - gewünschte Startzeit ist OK
    return {
      startMinutes: Math.round(gewuenschteStart / raster) * raster,
      angepasst: false,
      grund: null
    };
  }

  // Vertikale Positionslinie anzeigen (mit Kollisions-Feedback)
  showDragPositionLine(track, leftPx, kollision = null) {
    // Bestehende Linie entfernen
    document.querySelectorAll('.drag-position-line').forEach(el => el.remove());
    
    const line = document.createElement('div');
    line.className = 'drag-position-line';
    if (kollision && kollision.hatKollision) {
      line.classList.add('kollision');
    }
    line.style.left = `${leftPx}px`;
    track.appendChild(line);
  }

  // Verschiebt einen einzelnen Arbeitsblock (nicht den ganzen Termin)
  async moveArbeitBlockToMitarbeiter(terminId, arbeitName, arbeitIndex, mitarbeiterId, lehrlingId, type, startzeit) {
    try {
      const termin = await TermineService.getById(terminId);
      
      // Aktuelles Datum aus dem Planungs-Datumsfeld holen
      const zielDatum = document.getElementById('auslastungDragDropDatum')?.value;
      
      // Speichere Original-Daten wenn noch nicht vorhanden
      if (!this.planungAenderungen.has(terminId)) {
        this.planungAenderungen.set(terminId, {
          originalData: {
            startzeit: termin.startzeit,
            datum: termin.datum,
            mitarbeiter_id: termin.mitarbeiter_id,
            arbeitszeiten_details: termin.arbeitszeiten_details
          },
          arbeitAenderungen: {} // Für individuelle Arbeitsänderungen
        });
      }
      
      const aenderung = this.planungAenderungen.get(terminId);
      
      // Merke ob der Termin schwebend war
      const istSchwebend = termin.ist_schwebend === 1 || termin.ist_schwebend === true;
      if (istSchwebend) {
        aenderung.warSchwebend = true;
      }
      
      // Bug 1 Fix: Datum setzen - IMMER wenn schwebend, oder wenn Ziel-Datum anders ist
      if (zielDatum) {
        if (istSchwebend || zielDatum !== termin.datum) {
          aenderung.datum = zielDatum;
          console.log('[DEBUG] ArbeitBlock - Datum wird gesetzt:', zielDatum, '(Original:', termin.datum, ', istSchwebend:', istSchwebend, ')');
        }
      }
      
      // Initialisiere arbeitAenderungen falls nicht vorhanden
      if (!aenderung.arbeitAenderungen) {
        aenderung.arbeitAenderungen = {};
      }
      
      // Speichere Änderung für diese spezifische Arbeit
      aenderung.arbeitAenderungen[arbeitName] = {
        startzeit: startzeit,
        type: type,
        mitarbeiter_id: type === 'lehrling' ? null : (mitarbeiterId ? parseInt(mitarbeiterId) : null),
        lehrling_id: type === 'lehrling' && lehrlingId ? parseInt(lehrlingId) : null
      };
      
      // Setze Flag dass es Arbeits-spezifische Änderungen gibt
      aenderung.hatArbeitAenderungen = true;
      
      // UI aktualisieren
      await this.updateArbeitBlockUI(terminId, arbeitName, arbeitIndex, startzeit, mitarbeiterId, lehrlingId, type);
      
      // Änderungen-Zähler aktualisieren
      this.updatePlanungAenderungenUI();
      
    } catch (error) {
      console.error('Fehler beim Verschieben des Arbeitsblocks:', error);
      alert('Fehler beim Verschieben: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  // UI-Aktualisierung für verschobenen Arbeitsblock
  async updateArbeitBlockUI(terminId, arbeitName, arbeitIndex, startzeit, mitarbeiterId, lehrlingId, type) {
    const blockEl = document.getElementById(`timeline-arbeit-${terminId}-${arbeitIndex}`);
    const miniCard = document.querySelector(`.termin-mini-card[data-termin-id="${terminId}"][data-arbeit-index="${arbeitIndex}"]`);
    
    const startHour = 8;
    const pixelPerHour = 100;
    const pixelPerMinute = pixelPerHour / 60;
    
    const [startH, startM] = startzeit.split(':').map(Number);
    
    // Bestimme Ziel-Track
    let targetTrack = null;
    if (type === 'lehrling' && lehrlingId) {
      targetTrack = document.querySelector(`.timeline-track[data-lehrling-id="${lehrlingId}"]`);
    } else if (mitarbeiterId) {
      targetTrack = document.querySelector(`.timeline-track[data-mitarbeiter-id="${mitarbeiterId}"]`);
    }
    
    if (blockEl) {
      // Bestehendes Block-Element verschieben
      const dauer = parseInt(blockEl.dataset.dauer) || 30;
      const leftPx = (startH - startHour) * pixelPerHour + startM * pixelPerMinute;
      const widthPx = Math.max(dauer * pixelPerMinute, 40);
      
      blockEl.style.left = `${leftPx}px`;
      blockEl.style.width = `${widthPx}px`;
      blockEl.classList.add('geaendert');
      
      // Track wechseln wenn nötig
      const currentTrack = blockEl.closest('.timeline-track');
      if (targetTrack && targetTrack !== currentTrack) {
        targetTrack.appendChild(blockEl);
      }
    } else if (miniCard && targetTrack) {
      // Mini-Card in Timeline-Block umwandeln
      const termin = await TermineService.getById(terminId);
      const dauer = parseInt(miniCard.dataset.dauer) || 30;
      
      // Neues Timeline-Element erstellen
      const newBlock = document.createElement('div');
      newBlock.className = 'timeline-termin arbeit-block geaendert';
      newBlock.id = `timeline-arbeit-${terminId}-${arbeitIndex}`;
      newBlock.dataset.terminId = terminId;
      newBlock.dataset.arbeitName = arbeitName;
      newBlock.dataset.arbeitIndex = arbeitIndex;
      newBlock.dataset.dauer = dauer;
      newBlock.draggable = true;
      
      const leftPx = (startH - startHour) * pixelPerHour + startM * pixelPerMinute;
      const widthPx = Math.max(dauer * pixelPerMinute, 40);
      newBlock.style.left = `${leftPx}px`;
      newBlock.style.width = `${widthPx}px`;
      
      // Farbe
      const colors = ['#3498db', '#9b59b6', '#1abc9c', '#f39c12', '#e74c3c'];
      const colorIndex = arbeitIndex % colors.length;
      newBlock.style.borderLeft = `4px solid ${colors[colorIndex]}`;
      
      const dauerText = dauer >= 60 
        ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim()
        : `${dauer} min`;
      
      newBlock.innerHTML = `
        <div class="termin-title">${termin.termin_nr || 'Neu'}</div>
        <div class="termin-info arbeit-name">${arbeitName}</div>
        <div class="termin-info">${dauerText}</div>
      `;
      
      // Drag Events
      newBlock.addEventListener('dragstart', (e) => {
        newBlock.classList.add('dragging');
        e.dataTransfer.setData('text/plain', terminId);
        e.dataTransfer.setData('application/x-arbeit-name', arbeitName);
        e.dataTransfer.setData('application/x-arbeit-index', arbeitIndex);
        e.dataTransfer.setData('application/x-dauer', dauer);
        e.dataTransfer.setData('application/x-ist-arbeit-block', 'true');
        e.dataTransfer.effectAllowed = 'move';
        this.createDragTimeIndicator();
      });
      
      newBlock.addEventListener('dragend', () => {
        newBlock.classList.remove('dragging');
        document.querySelectorAll('.timeline-track').forEach(zone => zone.classList.remove('drag-over'));
        this.removeDragTimeIndicator();
      });
      
      targetTrack.appendChild(newBlock);
      miniCard.remove();
    }
  }

  async moveTerminToMitarbeiterWithTime(terminId, mitarbeiterId, lehrlingId, type, startzeit) {
    try {
      // Lade aktuellen Termin für Original-Daten (falls noch nicht im Puffer)
      const termin = await TermineService.getById(terminId);
      
      // Aktuelles Datum aus dem Planungs-Datumsfeld holen
      const zielDatum = document.getElementById('auslastungDragDropDatum')?.value;
      
      // Speichere Original-Daten wenn noch nicht vorhanden
      if (!this.planungAenderungen.has(terminId)) {
        this.planungAenderungen.set(terminId, {
          originalData: {
            startzeit: termin.startzeit,
            datum: termin.datum,
            mitarbeiter_id: termin.mitarbeiter_id,
            arbeitszeiten_details: termin.arbeitszeiten_details
          }
        });
      }
      
      // Aktualisiere Änderungspuffer
      const aenderung = this.planungAenderungen.get(terminId);
      aenderung.startzeit = startzeit;
      aenderung.type = type;
      
      // Merke ob der Termin schwebend war (für Speichern)
      const istSchwebend = termin.ist_schwebend === 1 || termin.ist_schwebend === true;
      if (istSchwebend) {
        aenderung.warSchwebend = true;
      }
      
      // Bug 1 Fix: Datum setzen - IMMER wenn schwebend, oder wenn Ziel-Datum anders ist
      if (zielDatum) {
        if (istSchwebend || zielDatum !== termin.datum) {
          aenderung.datum = zielDatum;
          console.log('[DEBUG] Datum wird gesetzt:', zielDatum, '(Original:', termin.datum, ', istSchwebend:', istSchwebend, ')');
        }
      }
      
      if (type === 'lehrling' && lehrlingId) {
        aenderung.mitarbeiter_id = null;
        aenderung.lehrling_id = parseInt(lehrlingId);
      } else if (mitarbeiterId && mitarbeiterId !== 'null') {
        aenderung.mitarbeiter_id = parseInt(mitarbeiterId);
        aenderung.lehrling_id = null;
      } else {
        aenderung.mitarbeiter_id = null;
        aenderung.lehrling_id = null;
      }
      
      // UI aktualisieren (lokale Vorschau) - await da jetzt async
      await this.updatePlanungTerminUI(terminId, startzeit, aenderung.mitarbeiter_id, aenderung.lehrling_id, type);
      
      // Änderungen-Zähler aktualisieren
      this.updatePlanungAenderungenUI();

    } catch (error) {
      console.error('Fehler beim Verschieben:', error);
      alert('Fehler beim Verschieben des Termins: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  // UI-Aktualisierung für verschobenen Termin (ohne Datenbank-Zugriff)
  async updatePlanungTerminUI(terminId, startzeit, mitarbeiterId, lehrlingId, type) {
    let terminEl = document.getElementById(`timeline-termin-${terminId}`);
    const fortsetzungEl = document.getElementById(`timeline-termin-${terminId}-teil2`);
    const miniCard = document.getElementById(`termin-card-${terminId}`);
    const schwebendeBar = document.getElementById(`schwebend-bar-${terminId}`);
    
    // Entferne evtl. vorhandene Fortsetzung (wird ggf. neu erstellt)
    if (fortsetzungEl) {
      fortsetzungEl.remove();
    }
    
    // Entferne schwebende Bar wenn vorhanden (beim Drag aus dem Schwebende-Panel)
    if (schwebendeBar) {
      schwebendeBar.remove();
      // Counter aktualisieren
      const container = document.getElementById('schwebendeTermineContainer');
      const countElement = document.getElementById('schwebendeCount');
      if (container && countElement) {
        const verbleibendeTermine = container.querySelectorAll('.schwebender-termin-bar').length;
        countElement.textContent = `${verbleibendeTermine} Termin${verbleibendeTermine !== 1 ? 'e' : ''}`;
      }
    }
    
    // Wenn kein Timeline-Element existiert, aber eine Mini-Card oder Schwebende-Bar -> Termin kommt von außerhalb
    if (!terminEl && (miniCard || schwebendeBar)) {
      // Lade Termin-Daten und erstelle Timeline-Element
      try {
        const termin = await TermineService.getById(terminId);
        const dauer = this.getTerminGesamtdauer(termin);
        const isSchwebend = termin.ist_schwebend === 1 || termin._istSchwebend;
        const statusClass = termin.status ? ` status-${termin.status.toLowerCase().replace(' ', '-')}` : '';
        
        // Erweiterungs-Infos ermitteln
        const istErweiterung = termin.ist_erweiterung === 1 || termin.ist_erweiterung === true || termin.erweiterung_von_id;
        const erweiterungClass = istErweiterung ? ' erweiterung-block' : '';
        
        // Zähle Erweiterungen zu diesem Termin (aus termineById Cache)
        let erweiterungAnzahl = 0;
        if (this.termineById) {
          Object.values(this.termineById).forEach(t => {
            if (t.erweiterung_von_id === termin.id && !t.ist_geloescht) {
              erweiterungAnzahl++;
            }
          });
        }
        
        // Neues Timeline-Element erstellen
        terminEl = document.createElement('div');
        terminEl.className = 'timeline-termin' + statusClass + erweiterungClass + (isSchwebend ? ' schwebend' : '');
        terminEl.id = `timeline-termin-${terminId}`;
        terminEl.dataset.terminId = terminId;
        terminEl.dataset.dauer = dauer;
        terminEl.dataset.istFortsetzung = '0';
        terminEl.draggable = true;
        
        const dauerText = dauer >= 60 
          ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim()
          : `${dauer} min`;
        
        // Erweiterungs-Badge HTML
        const erweiterungBadgeHtml = erweiterungAnzahl > 0 
          ? `<span class="timeline-erweiterung-badge" title="${erweiterungAnzahl} Erweiterung(en) - Klicken zum Anzeigen">🔗${erweiterungAnzahl}</span>` 
          : '';
        
        // Ist-Erweiterung Badge (wenn dieser Termin selbst eine Erweiterung ist)
        const istErweiterungBadgeHtml = istErweiterung 
          ? `<span class="timeline-ist-erweiterung" title="Dies ist eine Erweiterung">🔗</span>` 
          : '';
        
        terminEl.innerHTML = `
          <div class="termin-title">${termin.termin_nr || 'Neu'} - ${termin.kennzeichen || ''}${istErweiterungBadgeHtml}${erweiterungBadgeHtml}</div>
          <div class="termin-info">${termin.kunde_name || ''} • ${dauerText}</div>
        `;
        
        // Erweiterungs-Info für Tooltip
        const erweiterungInfo = istErweiterung ? '\n🔗 ERWEITERUNG' : '';
        const hatErweiterungenInfo = erweiterungAnzahl > 0 ? `\n🔗 ${erweiterungAnzahl} Erweiterung(en)` : '';
        terminEl.title = `${termin.termin_nr}\n${termin.kunde_name}\n${termin.arbeit}\n${startzeit} - ${dauerText}${erweiterungInfo}${hatErweiterungenInfo}`;
        
        // Klick-Handler für Erweiterungs-Badge (wenn vorhanden)
        if (erweiterungAnzahl > 0) {
          const badge = terminEl.querySelector('.timeline-erweiterung-badge');
          if (badge) {
            badge.addEventListener('click', (e) => {
              e.stopPropagation();
              e.preventDefault();
              this.showVerknuepfteTermine(termin.id);
            });
          }
        }
        
        // Klick-Handler für Ist-Erweiterung Badge
        if (istErweiterung) {
          const istBadge = terminEl.querySelector('.timeline-ist-erweiterung');
          if (istBadge) {
            istBadge.addEventListener('click', (e) => {
              e.stopPropagation();
              e.preventDefault();
              this.showVerknuepfteTermine(termin.id);
            });
          }
        }
        
        // Klick: Normaler Klick = Schnell-Menü, Shift+Klick = Details
        terminEl.addEventListener('click', (e) => {
          // Ignoriere wenn auf Badge geklickt wurde (hat eigenen Handler)
          if (e.target.classList.contains('timeline-erweiterung-badge') || 
              e.target.classList.contains('timeline-ist-erweiterung')) {
            return;
          }
          
          e.preventDefault();
          e.stopPropagation();
          const aktuellerTermin = this.termineById[termin.id] || termin;
          
          if (e.shiftKey) {
            // Shift+Klick - Termin-Details anzeigen
            this.showTerminDetails(termin.id);
          } else {
            // Normaler Klick - Schnell-Status-Menü
            this.showSchnellStatusDialog(aktuellerTermin, terminEl, startzeit, dauer);
          }
        });
        
        // Drag Events hinzufügen
        terminEl.addEventListener('dragstart', (e) => {
          terminEl.classList.add('dragging');
          e.dataTransfer.setData('text/plain', terminId);
          e.dataTransfer.setData('application/x-startzeit', startzeit);
          e.dataTransfer.setData('application/x-dauer', dauer.toString());
          e.dataTransfer.effectAllowed = 'move';
          this.createDragTimeIndicator();
        });
        
        terminEl.addEventListener('dragend', () => {
          terminEl.classList.remove('dragging');
          document.querySelectorAll('.timeline-track').forEach(zone => zone.classList.remove('drag-over'));
          this.removeDragTimeIndicator();
        });
        
        // Mini-Card aus "Nicht zugeordnet" entfernen (falls vorhanden)
        if (miniCard) {
          miniCard.remove();
        }
        
      } catch (error) {
        console.error('Fehler beim Erstellen des Timeline-Elements:', error);
        return;
      }
    }
    
    if (!terminEl) {
      // Weder Timeline-Element noch Mini-Card gefunden - Neuladung als Fallback
      this.loadAuslastungDragDrop();
      return;
    }
    
    const [startH, startM] = startzeit.split(':').map(Number);
    const startHour = 8;
    const endHour = 18;
    const pixelPerHour = 100;
    const pixelPerMinute = pixelPerHour / 60;
    
    // Hole Dauer aus dem Element
    const dauer = parseInt(terminEl.dataset.dauer) || 30;
    const startMinutes = startH * 60 + startM;
    const endMinutes = startMinutes + dauer;
    
    // Bestimme Ziel-Track und dessen Mittagspause
    let newTrack = null;
    let pauseStart = null;
    
    if (type === 'lehrling' && lehrlingId) {
      newTrack = document.querySelector(`.timeline-track[data-lehrling-id="${lehrlingId}"]`);
    } else if (mitarbeiterId) {
      newTrack = document.querySelector(`.timeline-track[data-mitarbeiter-id="${mitarbeiterId}"]`);
    }
    
    const targetTrack = newTrack || terminEl.closest('.timeline-track');
    
    // Mittagspause des Tracks ermitteln
    const pauseBlock = targetTrack?.querySelector('.timeline-mittagspause');
    let pauseStartMinutes = null;
    let pauseEndMinutes = null;
    const pauseDauer = 30;
    
    if (pauseBlock) {
      const pauseLeft = parseFloat(pauseBlock.style.left) || 0;
      pauseStartMinutes = startHour * 60 + (pauseLeft / pixelPerMinute);
      pauseEndMinutes = pauseStartMinutes + pauseDauer;
    }
    
    // Prüfe ob Termin über die Mittagspause geht und gesplittet werden muss
    if (pauseStartMinutes !== null && startMinutes < pauseStartMinutes && endMinutes > pauseStartMinutes) {
      // Teil 1: Vor der Pause
      const teil1Dauer = pauseStartMinutes - startMinutes;
      const teil1LeftPx = (startH - startHour) * pixelPerHour + startM * pixelPerMinute;
      const teil1WidthPx = Math.max(teil1Dauer * pixelPerMinute, 40);
      
      terminEl.style.left = `${teil1LeftPx}px`;
      terminEl.style.width = `${teil1WidthPx}px`;
      terminEl.classList.add('geaendert');
      
      // Teil 2: Nach der Pause (Fortsetzung erstellen)
      const teil2Dauer = endMinutes - pauseEndMinutes;
      if (teil2Dauer > 0) {
        const teil2StartH = Math.floor(pauseEndMinutes / 60);
        const teil2StartM = pauseEndMinutes % 60;
        const teil2LeftPx = (teil2StartH - startHour) * pixelPerHour + teil2StartM * pixelPerMinute;
        const teil2WidthPx = Math.max(teil2Dauer * pixelPerMinute, 40);
        
        // Hole Termin-Infos aus dem Hauptelement
        const terminNr = terminEl.querySelector('.termin-title')?.textContent.split(' - ')[0] || '';
        
        const teil2Div = document.createElement('div');
        teil2Div.className = 'timeline-termin fortsetzung geaendert';
        teil2Div.id = `timeline-termin-${terminId}-teil2`;
        teil2Div.dataset.terminId = terminId;
        teil2Div.dataset.istFortsetzung = '1';
        teil2Div.draggable = false;
        teil2Div.style.left = `${teil2LeftPx}px`;
        teil2Div.style.width = `${teil2WidthPx}px`;
        teil2Div.innerHTML = `
          <div class="termin-title">↪ ${terminNr}</div>
          <div class="termin-info">${teil2Dauer} min (Forts.)</div>
        `;
        teil2Div.title = `${terminNr} (Fortsetzung nach Pause)`;
        
        targetTrack.appendChild(teil2Div);
      }
    } else {
      // Keine Aufteilung nötig - normaler Termin
      const leftPx = (startH - startHour) * pixelPerHour + startM * pixelPerMinute;
      const widthPx = Math.max(dauer * pixelPerMinute, 40);
      
      terminEl.style.left = `${leftPx}px`;
      terminEl.style.width = `${widthPx}px`;
      terminEl.classList.add('geaendert');
    }
    
    // Track wechseln wenn nötig
    const currentTrack = terminEl.closest('.timeline-track');
    if (targetTrack && targetTrack !== currentTrack) {
      targetTrack.appendChild(terminEl);
    }
  }

  // Aktualisiere UI-Elemente für Änderungszähler
  updatePlanungAenderungenUI() {
    const count = this.planungAenderungen.size;
    const countBadge = document.getElementById('planungAenderungenCount');
    const speichernBtn = document.getElementById('planungSpeichernBtn');
    const verwerfenBtn = document.getElementById('planungVerwerfenBtn');
    
    if (countBadge) {
      countBadge.textContent = `${count} Änderung${count !== 1 ? 'en' : ''}`;
      countBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }
    
    if (speichernBtn) {
      speichernBtn.disabled = count === 0;
    }
    
    if (verwerfenBtn) {
      verwerfenBtn.style.display = count > 0 ? 'inline-block' : 'none';
    }
  }

  // Raster für Snap-Grid ändern
  setPlanungRaster(value) {
    this.planungRaster = parseInt(value) || 5;
  }

  // Alle Änderungen speichern
  async savePlanungAenderungen() {
    if (this.planungAenderungen.size === 0) {
      this.showToast('Keine Änderungen zum Speichern', 'info');
      return;
    }
    
    // === Abholzeit-Prüfung vor dem Speichern ===
    const abholzeitKonflikte = [];
    
    for (const [terminId, aenderung] of this.planungAenderungen) {
      try {
        const termin = await TermineService.getById(terminId);
        // DB-Feld: abholung_zeit
        const abholzeit = termin.abholung_zeit;
        if (!abholzeit) continue;
        
        // Berechne Endzeit basierend auf den Änderungen
        let startzeit = aenderung.startzeit;
        let gesamtDauer = 0;
        
        // Parse arbeitszeiten_details für Dauer
        let details = {};
        try {
          details = termin.arbeitszeiten_details ? 
            (typeof termin.arbeitszeiten_details === 'string' ? JSON.parse(termin.arbeitszeiten_details) : termin.arbeitszeiten_details) 
            : {};
        } catch (e) {}
        
        // Berechne Gesamtdauer aus arbeitszeiten_details
        for (const key in details) {
          if (key.startsWith('_')) continue;
          const arbeit = details[key];
          if (typeof arbeit === 'object' && arbeit.zeit) {
            gesamtDauer += parseInt(arbeit.zeit) || 0;
          } else if (typeof arbeit === 'number') {
            gesamtDauer += parseInt(arbeit) || 0;
          }
        }
        
        // Fallback auf geschaetzte_zeit falls keine Details
        if (gesamtDauer === 0) {
          gesamtDauer = parseInt(termin.geschaetzte_zeit) || 0;
        }
        
        // Wenn Arbeits-spezifische Änderungen, finde die späteste Endzeit
        if (aenderung.hatArbeitAenderungen && aenderung.arbeitAenderungen) {
          let spaetesteEndzeit = 0;
          for (const [arbeitName, arbeitAenderung] of Object.entries(aenderung.arbeitAenderungen)) {
            const arbeitStartzeit = arbeitAenderung.startzeit;
            if (!arbeitStartzeit) continue;
            
            const [h, m] = arbeitStartzeit.split(':').map(Number);
            const startMin = h * 60 + m;
            
            // Hole Dauer für diese Arbeit
            let arbeitDauer = 30; // Default
            if (details[arbeitName]) {
              if (typeof details[arbeitName] === 'object' && details[arbeitName].zeit) {
                arbeitDauer = parseInt(details[arbeitName].zeit) || 30;
              } else if (typeof details[arbeitName] === 'number') {
                arbeitDauer = parseInt(details[arbeitName]) || 30;
              }
            }
            
            const endeMin = startMin + arbeitDauer;
            if (endeMin > spaetesteEndzeit) {
              spaetesteEndzeit = endeMin;
            }
          }
          
          if (spaetesteEndzeit > 0) {
            // Vergleiche mit Abholzeit
            const [abholH, abholM] = abholzeit.split(':').map(Number);
            const abholMin = abholH * 60 + abholM;
            
            if (spaetesteEndzeit > abholMin) {
              const endzeitStr = `${Math.floor(spaetesteEndzeit/60).toString().padStart(2,'0')}:${(spaetesteEndzeit%60).toString().padStart(2,'0')}`;
              abholzeitKonflikte.push({
                termin: termin,
                endzeit: endzeitStr,
                abholzeit: abholzeit
              });
            }
          }
        } else if (startzeit && gesamtDauer > 0) {
          // Normale Termin-Änderung
          const [h, m] = startzeit.split(':').map(Number);
          const startMin = h * 60 + m;
          const endeMin = startMin + gesamtDauer;
          
          const [abholH, abholM] = abholzeit.split(':').map(Number);
          const abholMin = abholH * 60 + abholM;
          
          if (endeMin > abholMin) {
            const endzeitStr = `${Math.floor(endeMin/60).toString().padStart(2,'0')}:${(endeMin%60).toString().padStart(2,'0')}`;
            abholzeitKonflikte.push({
              termin: termin,
              endzeit: endzeitStr,
              abholzeit: abholzeit
            });
          }
        }
      } catch (e) {
        console.error('Fehler bei Abholzeit-Prüfung:', e);
      }
    }
    
    // Warnung anzeigen falls Abholzeit-Konflikte
    if (abholzeitKonflikte.length > 0) {
      let warnText = `⚠️ Warnung: ${abholzeitKonflikte.length} Termin(e) werden erst nach der Abholzeit fertig:\n\n`;
      abholzeitKonflikte.forEach(k => {
        warnText += `• ${k.termin.termin_nr} - Fertig: ${k.endzeit}, Abholung: ${k.abholzeit}\n`;
      });
      warnText += '\nTrotzdem speichern?';
      
      if (!confirm(warnText)) {
        return;
      }
    }
    
    const speichernBtn = document.getElementById('planungSpeichernBtn');
    if (speichernBtn) {
      speichernBtn.disabled = true;
      speichernBtn.innerHTML = '⏳ Speichern...';
    }
    
    let erfolge = 0;
    let fehler = 0;
    
    for (const [terminId, aenderung] of this.planungAenderungen) {
      try {
        // Lade aktuellen Termin für arbeitszeiten_details
        const termin = await TermineService.getById(terminId);
        let details = {};
        try {
          details = termin.arbeitszeiten_details ? 
            (typeof termin.arbeitszeiten_details === 'string' ? JSON.parse(termin.arbeitszeiten_details) : termin.arbeitszeiten_details) 
            : {};
        } catch (e) {}
        
        let updateData = {};
        
        // Prüfe ob es arbeits-spezifische Änderungen gibt
        if (aenderung.hatArbeitAenderungen && aenderung.arbeitAenderungen) {
          // Arbeits-spezifische Änderungen verarbeiten
          for (const [arbeitName, arbeitAenderung] of Object.entries(aenderung.arbeitAenderungen)) {
            if (details[arbeitName] && typeof details[arbeitName] === 'object') {
              // Existierende Arbeit aktualisieren
              details[arbeitName].startzeit = arbeitAenderung.startzeit;
              details[arbeitName].type = arbeitAenderung.type;
              
              if (arbeitAenderung.type === 'lehrling' && arbeitAenderung.lehrling_id) {
                details[arbeitName].lehrling_id = arbeitAenderung.lehrling_id;
                details[arbeitName].mitarbeiter_id = arbeitAenderung.lehrling_id; // Für Kompatibilität
                delete details[arbeitName].mitarbeiter_id_orig;
              } else if (arbeitAenderung.mitarbeiter_id) {
                details[arbeitName].mitarbeiter_id = arbeitAenderung.mitarbeiter_id;
                delete details[arbeitName].lehrling_id;
              }
            } else if (typeof details[arbeitName] === 'number') {
              // Einfacher Wert -> in Objekt umwandeln
              const zeit = details[arbeitName];
              details[arbeitName] = {
                zeit: zeit,
                startzeit: arbeitAenderung.startzeit,
                type: arbeitAenderung.type
              };
              if (arbeitAenderung.type === 'lehrling' && arbeitAenderung.lehrling_id) {
                details[arbeitName].lehrling_id = arbeitAenderung.lehrling_id;
                details[arbeitName].mitarbeiter_id = arbeitAenderung.lehrling_id;
              } else if (arbeitAenderung.mitarbeiter_id) {
                details[arbeitName].mitarbeiter_id = arbeitAenderung.mitarbeiter_id;
              }
            } else {
              // Arbeit existiert noch nicht in details -> neu erstellen
              details[arbeitName] = {
                zeit: 30, // Standard-Zeit
                startzeit: arbeitAenderung.startzeit,
                type: arbeitAenderung.type
              };
              if (arbeitAenderung.type === 'lehrling' && arbeitAenderung.lehrling_id) {
                details[arbeitName].lehrling_id = arbeitAenderung.lehrling_id;
                details[arbeitName].mitarbeiter_id = arbeitAenderung.lehrling_id;
              } else if (arbeitAenderung.mitarbeiter_id) {
                details[arbeitName].mitarbeiter_id = arbeitAenderung.mitarbeiter_id;
              }
            }
          }
          
          // Ermittle die früheste Startzeit für den Termin
          let fruehsteStartzeit = null;
          for (const key in details) {
            if (key.startsWith('_')) continue;
            const arbeit = details[key];
            if (typeof arbeit === 'object' && arbeit.startzeit) {
              if (!fruehsteStartzeit || arbeit.startzeit < fruehsteStartzeit) {
                fruehsteStartzeit = arbeit.startzeit;
              }
            }
          }
          
          if (fruehsteStartzeit) {
            details._startzeit = fruehsteStartzeit;
            updateData.startzeit = fruehsteStartzeit;
          }
          
          // Bug 1 Fix: Datum aktualisieren wenn gesetzt (auch bei Arbeits-spezifischen Änderungen)
          if (aenderung.datum) {
            updateData.datum = aenderung.datum;
          }
          
          // _gesamt_mitarbeiter_id NICHT ändern, da Arbeiten unterschiedliche Zuordnungen haben können
          // Stattdessen entfernen, damit die individuelle Zuordnung gilt
          delete details._gesamt_mitarbeiter_id;
          
          updateData.arbeitszeiten_details = JSON.stringify(details);
          updateData.mitarbeiter_id = null; // Keine Termin-weite Zuordnung mehr
          
        } else {
          // Normale Termin-weite Änderung (alte Logik)
          updateData.startzeit = aenderung.startzeit;
          
          // Bug 1 Fix: Datum aktualisieren wenn gesetzt
          if (aenderung.datum) {
            updateData.datum = aenderung.datum;
          }
          
          const wirdZugeordnet = aenderung.type !== 'none' && (aenderung.mitarbeiter_id || aenderung.lehrling_id);
          
          if (aenderung.type === 'none') {
            // Zuweisung entfernen
            updateData.mitarbeiter_id = null;
            updateData.startzeit = null;
            delete details._gesamt_mitarbeiter_id;
            delete details._startzeit;
            // Auch individuelle Zuordnungen der Arbeiten entfernen
            for (const key in details) {
              if (!key.startsWith('_') && typeof details[key] === 'object') {
                delete details[key].mitarbeiter_id;
                delete details[key].lehrling_id;
                delete details[key].type;
                delete details[key].startzeit;
              }
            }
            updateData.arbeitszeiten_details = JSON.stringify(details);
          } else if (aenderung.type === 'lehrling' && aenderung.lehrling_id) {
            updateData.mitarbeiter_id = null;
            details._gesamt_mitarbeiter_id = { type: 'lehrling', id: aenderung.lehrling_id };
            details._startzeit = aenderung.startzeit;
            // Alle Arbeiten dem Lehrling zuordnen
            for (const key in details) {
              if (!key.startsWith('_') && typeof details[key] === 'object') {
                details[key].type = 'lehrling';
                details[key].lehrling_id = aenderung.lehrling_id;
                delete details[key].mitarbeiter_id;
                details[key].startzeit = aenderung.startzeit;
              }
            }
            updateData.arbeitszeiten_details = JSON.stringify(details);
          } else if (aenderung.mitarbeiter_id) {
            updateData.mitarbeiter_id = aenderung.mitarbeiter_id;
            details._gesamt_mitarbeiter_id = { type: 'mitarbeiter', id: aenderung.mitarbeiter_id };
            details._startzeit = aenderung.startzeit;
            // Alle Arbeiten dem Mitarbeiter zuordnen
            for (const key in details) {
              if (!key.startsWith('_') && typeof details[key] === 'object') {
                details[key].type = 'mitarbeiter';
                details[key].mitarbeiter_id = aenderung.mitarbeiter_id;
                delete details[key].lehrling_id;
                details[key].startzeit = aenderung.startzeit;
              }
            }
            updateData.arbeitszeiten_details = JSON.stringify(details);
          } else {
            updateData.mitarbeiter_id = null;
          }
        }
        
        // Prüfe ob Termin schwebend war und jetzt zugeordnet wird
        const wirdZugeordnet = aenderung.type !== 'none' && (aenderung.mitarbeiter_id || aenderung.lehrling_id || aenderung.hatArbeitAenderungen);
        const warSchwebend = aenderung.warSchwebend || termin.ist_schwebend === 1 || termin.ist_schwebend === true;
        
        // Wenn schwebender Termin eingeplant wird, ist_schwebend auf 0 setzen
        if (wirdZugeordnet && warSchwebend) {
          updateData.ist_schwebend = 0;
        }
        
        await TermineService.update(terminId, updateData);
        
        erfolge++;
      } catch (error) {
        console.error(`Fehler beim Speichern von Termin ${terminId}:`, error);
        fehler++;
      }
    }
    
    // Änderungspuffer leeren
    this.planungAenderungen.clear();
    
    // Markierung "geaendert" von allen Elementen entfernen
    document.querySelectorAll('.timeline-termin.geaendert').forEach(el => {
      el.classList.remove('geaendert');
    });
    
    if (speichernBtn) {
      speichernBtn.innerHTML = '💾 Speichern';
    }
    
    // UI aktualisieren
    this.updatePlanungAenderungenUI();
    
    // Feedback
    if (fehler === 0) {
      this.showToast(`${erfolge} Startzeit${erfolge !== 1 ? 'en' : ''} erfolgreich gespeichert!`, 'success');
    } else {
      this.showToast(`${erfolge} gespeichert, ${fehler} fehlgeschlagen`, fehler > 0 ? 'warning' : 'success');
    }
    
    // Markiere dass Auslastungsanzeige neu geladen werden muss
    this.auslastungNeedsRefresh = true;
    
    // Vollständig neu laden um Konsistenz sicherzustellen
    this.loadAuslastungDragDrop();
  }

  // Alle Änderungen verwerfen
  verwerfePlanungAenderungen() {
    if (this.planungAenderungen.size === 0) return;
    
    if (!confirm(`${this.planungAenderungen.size} Änderung(en) verwerfen?`)) return;
    
    this.planungAenderungen.clear();
    this.updatePlanungAenderungenUI();
    this.showToast('Änderungen verworfen', 'info');
    
    // Neu laden um Originalzustand wiederherzustellen
    this.loadAuslastungDragDrop();
  }

  addTimelineNowLine(startHour, endHour) {
    // Alte Linien entfernen
    document.querySelectorAll('.timeline-now-line').forEach(line => line.remove());
    
    // Vorherigen Interval stoppen falls vorhanden
    if (this.nowLineInterval) {
      clearInterval(this.nowLineInterval);
      this.nowLineInterval = null;
    }
    
    const updateNowLine = () => {
      // Alte Linien entfernen
      document.querySelectorAll('.timeline-now-line').forEach(line => line.remove());
      
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      
      // Nur anzeigen wenn innerhalb der sichtbaren Stunden
      if (currentHour < startHour || currentHour > endHour) return;
      
      const pixelPerHour = 100; // Muss mit anderen Timeline-Elementen übereinstimmen
      const pixelPerMinute = pixelPerHour / 60;
      const leftPx = ((currentHour - startHour) * 60 + currentMinute) * pixelPerMinute;
      
      // Füge Linie zu jeder Timeline-Track hinzu
      document.querySelectorAll('.timeline-track').forEach(track => {
        const line = document.createElement('div');
        line.className = 'timeline-now-line';
        line.style.left = `${leftPx}px`;
        track.appendChild(line);
      });
    };
    
    // Initial zeichnen
    updateNowLine();
    
    // Alle 60 Sekunden aktualisieren
    this.nowLineInterval = setInterval(updateNowLine, 60000);
  }

  createTerminMiniCard(termin) {
    const card = document.createElement('div');
    const isSchwebend = termin.ist_schwebend === 1 || termin._istSchwebend;
    const istErweiterung = termin.ist_erweiterung === 1 || termin.ist_erweiterung === true || termin.erweiterung_von_id;
    
    card.className = `termin-mini-card status-${termin.status.toLowerCase().replace(' ', '-')}${isSchwebend ? ' schwebend' : ''}${istErweiterung ? ' erweiterung-block' : ''}`;
    card.draggable = true;
    card.id = `termin-card-${termin.id}`;
    
    // Echte Dauer aus arbeitszeiten_details berechnen
    const dauer = this.getTerminGesamtdauer(termin);
    card.dataset.dauer = dauer;
    card.dataset.schwebend = isSchwebend ? '1' : '0';

    const schwebendBadge = isSchwebend ? '<span class="schwebend-badge" title="Schwebender Termin">⏸</span>' : '';
    
    // Zähle Erweiterungen zu diesem Termin
    let erweiterungAnzahl = 0;
    if (this.termineById) {
      Object.values(this.termineById).forEach(t => {
        if (t.erweiterung_von_id === termin.id && !t.ist_geloescht) {
          erweiterungAnzahl++;
        }
      });
    }
    
    // Erweiterungs-Badge (für Termine mit Erweiterungen)
    const erweiterungBadge = erweiterungAnzahl > 0 
      ? `<span class="mini-card-erweiterung-badge" title="${erweiterungAnzahl} Erweiterung(en)">🔗${erweiterungAnzahl}</span>` 
      : '';
    
    // Ist-Erweiterung Badge
    const istErweiterungBadge = istErweiterung 
      ? '<span class="mini-card-ist-erweiterung" title="Dies ist eine Erweiterung">🔗</span>' 
      : '';
    
    // Dauer formatiert anzeigen
    const dauerText = dauer >= 60 
      ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim()
      : `${dauer} min`;
    
    // Bring/Abholzeit für Anzeige
    const bringZeitText = termin.bring_zeit ? `🚗↓ ${termin.bring_zeit}` : '';
    const abholZeitText = termin.abholung_zeit ? `🚗↑ ${termin.abholung_zeit}` : '';
    const zeitenInfo = [bringZeitText, abholZeitText].filter(t => t).join(' • ');
    
    card.innerHTML = `
      <div class="header">
        <span>${schwebendBadge}${istErweiterungBadge}${termin.termin_nr || 'Neu'}${erweiterungBadge}</span>
        <span>${termin.kennzeichen || ''}</span>
      </div>
      <div class="details">
        ${termin.kunde_name || 'Unbekannt'}
      </div>
      <div class="zeit">
        ⏱️ ${dauerText}${isSchwebend ? ' • schwebend' : ''}
      </div>
      ${zeitenInfo ? `<div class="zeiten">${zeitenInfo}</div>` : ''}
    `;
    
    // Klick-Handler für Erweiterungs-Badge
    if (erweiterungAnzahl > 0) {
      const badge = card.querySelector('.mini-card-erweiterung-badge');
      if (badge) {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.showVerknuepfteTermine(termin.id);
        });
      }
    }
    
    // Klick-Handler für Ist-Erweiterung Badge
    if (istErweiterung) {
      const badge = card.querySelector('.mini-card-ist-erweiterung');
      if (badge) {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.showVerknuepfteTermine(termin.id);
        });
      }
    }

    // Drag Events
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', termin.id);
      e.dataTransfer.setData('application/x-dauer', dauer.toString());
      e.dataTransfer.effectAllowed = 'move';
      
      // Zeit-Indikator erstellen (auch für Mini-Cards)
      this.createDragTimeIndicator();
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.drop-zone').forEach(zone => zone.classList.remove('drag-over'));
      // Zeit-Indikator entfernen
      this.removeDragTimeIndicator();
    });

    // Klick: Normaler Klick = Schnell-Menü, Shift+Klick = Details
    card.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const aktuellerTermin = this.termineById[termin.id] || termin;
      const startzeit = termin.startzeit || termin.bring_zeit || '08:00';
      
      if (e.shiftKey) {
        // Shift+Klick - Details anzeigen
        this.showTerminDetails(termin.id);
      } else {
        // Normaler Klick - Schnell-Status-Dialog
        this.showSchnellStatusDialog(aktuellerTermin, card, startzeit, dauer);
      }
    });

    return card;
  }

  setupDropZone(element) {
    element.addEventListener('dragover', (e) => {
      e.preventDefault(); // Erlaubt Drop
      e.dataTransfer.dropEffect = 'move';
      element.classList.add('drag-over');
    });

    element.addEventListener('dragleave', () => {
      element.classList.remove('drag-over');
    });

    element.addEventListener('drop', async (e) => {
      e.preventDefault();
      element.classList.remove('drag-over');
      // Zeit-Indikator entfernen
      this.removeDragTimeIndicator();
      
      const terminId = e.dataTransfer.getData('text/plain');
      
      if (terminId) {
        // Entferne Zuweisung (mitarbeiter_id = null, arbeitszeiten_details bereinigen)
        await this.removeTerminZuweisung(terminId);
      }
    });
  }

  async removeTerminZuweisung(terminId) {
    try {
      // Lade aktuellen Termin für Original-Daten
      const termin = await TermineService.getById(terminId);
      
      // Speichere Original-Daten wenn noch nicht vorhanden
      if (!this.planungAenderungen.has(terminId)) {
        this.planungAenderungen.set(terminId, {
          originalData: {
            startzeit: termin.startzeit,
            mitarbeiter_id: termin.mitarbeiter_id,
            arbeitszeiten_details: termin.arbeitszeiten_details
          }
        });
      }
      
      // Aktualisiere Änderungspuffer - Zuweisung entfernen
      const aenderung = this.planungAenderungen.get(terminId);
      aenderung.mitarbeiter_id = null;
      aenderung.lehrling_id = null;
      aenderung.startzeit = null;
      aenderung.type = 'none';
      
      // Änderungen-Zähler aktualisieren
      this.updatePlanungAenderungenUI();
      
      // Vollständige Neuladung, da Termin in "Nicht zugeordnet" verschoben wird
      this.loadAuslastungDragDrop();

    } catch (error) {
      console.error('Fehler beim Entfernen der Zuweisung:', error);
      alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  async moveTerminToMitarbeiter(terminId, mitarbeiterId) {
    try {
      const targetMitarbeiterId = mitarbeiterId === 'null' ? null : parseInt(mitarbeiterId);
      
      // API Update
      await TermineService.update(terminId, { mitarbeiter_id: targetMitarbeiterId });

      // Reload um Konsistenz zu sichern und Kapazitäten zu aktualisieren
      this.loadAuslastungDragDrop();

    } catch (error) {
      console.error('Fehler beim Verschieben:', error);
      alert('Fehler beim Verschieben des Termins: ' + (error.message || 'Unbekannter Fehler'));
      // Rollback durch Reload
      this.loadAuslastungDragDrop();
    }
  }

  updateMitarbeiterKapazitaeten(mitarbeiterListe, termine) {
    // Berechne Summen pro Mitarbeiter
    const summen = {};
    mitarbeiterListe.forEach(ma => summen[ma.id] = 0);
    
    termine.forEach(t => {
      if (t.mitarbeiter_id && summen[t.mitarbeiter_id] !== undefined) {
        summen[t.mitarbeiter_id] += (t.geschaetzte_zeit || 0);
      }
    });

    // Update UI
    mitarbeiterListe.forEach(ma => {
      // Finde den Header für diesen Mitarbeiter
      const slots = document.querySelectorAll('.mitarbeiter-slot');
      slots.forEach(slot => {
        const zone = slot.querySelector('.drop-zone');
        if (zone && parseInt(zone.dataset.mitarbeiterId) === ma.id) {
          const kapazitaetSpan = slot.querySelector('.mitarbeiter-kapazitaet');
          if (kapazitaetSpan) {
            const max = ma.verfuegbare_minuten || 480;
            const current = summen[ma.id];
            kapazitaetSpan.textContent = `${current}/${max} min`;
            
            if (current > max) {
              kapazitaetSpan.style.color = 'var(--accent)';
              kapazitaetSpan.style.fontWeight = 'bold';
            } else {
              kapazitaetSpan.style.color = 'var(--muted)';
              kapazitaetSpan.style.fontWeight = 'normal';
            }
          }
        }
      });
    });
  }

  // =============================================================================
  // KI-ASSISTENT FUNKTIONEN (Version 1.2.0)
  // =============================================================================

  /**
   * Initialisiert alle Event-Listener für den KI-Assistenten
   */
  setupKIAssistentEventListeners() {
    if (this.kiAssistentListenersBound) {
      return;
    }

    // KI-Analyse Checkbox
    const kiCheckbox = document.getElementById('kiAnalyseAktiv');
    if (kiCheckbox) {
      // Gespeicherte Einstellung laden
      const savedState = localStorage.getItem('kiAnalyseAktiv');
      if (savedState !== null) {
        kiCheckbox.checked = savedState === 'true';
      }
      
      // Änderungen speichern
      this.bindEventListenerOnce(kiCheckbox, 'change', (e) => {
        localStorage.setItem('kiAnalyseAktiv', e.target.checked);
        if (!e.target.checked) {
          this.hideKIVorschlaege();
        }
      }, 'KiAnalyseAktivChange');
    }

    // VIN-Decoder Button
    const vinDecodeBtn = document.getElementById('vinDecodeBtn');
    this.bindEventListenerOnce(vinDecodeBtn, 'click', () => this.decodeVIN(), 'VinDecodeClick');
    
    // VIN-Eingabefeld: Auto-Decode bei 17 Zeichen
    const vinInput = document.getElementById('vin');
    if (vinInput) {
      this.bindEventListenerOnce(vinInput, 'input', (e) => {
        const vin = e.target.value.replace(/[^A-HJ-NPR-Z0-9]/gi, '');
        e.target.value = vin.toUpperCase();
        
        // Auto-Decode wenn 17 Zeichen erreicht
        if (vin.length === 17) {
          this.decodeVIN();
        } else {
          // Info ausblenden wenn weniger als 17 Zeichen
          const vinInfo = document.getElementById('vinInfoBereich');
          if (vinInfo) vinInfo.style.display = 'none';
        }
      }, 'VinInput');
    }

    // KI-Assistent Banner/Button
    const kiAssistentBtn = document.getElementById('kiAssistentBtn');
    this.bindEventListenerOnce(kiAssistentBtn, 'click', () => this.openKIAssistent(), 'KiAssistentOpen');

    // Modal schließen
    const closeKiAssistent = document.getElementById('closeKiAssistent');
    this.bindEventListenerOnce(closeKiAssistent, 'click', () => this.closeKIAssistent(), 'KiAssistentClose');

    // Abbrechen Button
    const kiAbbrechen = document.getElementById('kiAbbrechen');
    this.bindEventListenerOnce(kiAbbrechen, 'click', () => this.closeKIAssistent(), 'KiAbbrechen');

    // Analysieren Button
    const kiAnalysierenBtn = document.getElementById('kiAnalysierenBtn');
    this.bindEventListenerOnce(kiAnalysierenBtn, 'click', () => this.analyzeWithKI(), 'KiAnalysieren');

    // Übernehmen Button
    const kiUebernehmen = document.getElementById('kiUebernehmen');
    this.bindEventListenerOnce(kiUebernehmen, 'click', () => this.applyKIResults(), 'KiUebernehmen');

    // Beispiel-Buttons
    document.querySelectorAll('.ki-beispiel-btn').forEach(btn => {
      this.bindEventListenerOnce(btn, 'click', (e) => {
        const text = e.target.dataset.text;
        const textarea = document.getElementById('kiFreitextInput');
        if (textarea && text) {
          textarea.value = text;
          textarea.focus();
        }
      }, 'KiBeispielClick');
    });

    // Modal schließen bei Klick außerhalb
    const kiModal = document.getElementById('kiAssistentModal');
    this.bindEventListenerOnce(kiModal, 'click', (e) => {
      if (e.target === kiModal) {
        this.closeKIAssistent();
      }
    }, 'KiModalClick');

    // KI-Status beim Start prüfen
    this.checkKIStatus();
    this.kiAssistentListenersBound = true;
  }

  /**
   * Event-Listener für Teile-Bestellen Tab
   */
  setupTeileBestellenEventListeners() {
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
  }

  /**
   * Prüft den Status der KI-Integration und passt UI an
   */
  async checkKIStatus() {
    try {
      const response = await AIService.getStatus();
      const banner = document.getElementById('kiAssistentBanner');
      
      if (!response.enabled || !response.configured) {
        // KI nicht konfiguriert - Banner verstecken oder anpassen
        if (banner) {
          banner.style.opacity = '0.5';
          banner.title = 'KI-Assistent nicht konfiguriert. Bitte API-Key in Einstellungen hinterlegen.';
        }
      }
    } catch (error) {
      console.log('KI-Status konnte nicht geprüft werden:', error.message);
      // Bei Fehler Banner ausblenden
      const banner = document.getElementById('kiAssistentBanner');
      if (banner) {
        banner.style.display = 'none';
      }
    }
  }

  /**
   * Öffnet das KI-Assistent Modal
   */
  openKIAssistent() {
    const modal = document.getElementById('kiAssistentModal');
    if (modal) {
      modal.style.display = 'block';
      // Reset
      document.getElementById('kiFreitextInput').value = '';
      document.getElementById('kiErgebnisBereich').style.display = 'none';
      document.getElementById('kiUebernehmen').style.display = 'none';
      document.getElementById('kiFremdmarkenWarnung').style.display = 'none';
      document.getElementById('kiLoading').style.display = 'none';
      document.getElementById('kiAnalysierenBtn').disabled = false;
      
      // Fokus auf Eingabefeld
      setTimeout(() => {
        document.getElementById('kiFreitextInput').focus();
      }, 100);
    }
  }

  /**
   * Schließt das KI-Assistent Modal
   */
  closeKIAssistent() {
    const modal = document.getElementById('kiAssistentModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Führt die KI-Analyse durch
   */
  async analyzeWithKI() {
    const textarea = document.getElementById('kiFreitextInput');
    const text = textarea.value.trim();
    
    if (text.length < 5) {
      this.showToast('Bitte mindestens 5 Zeichen eingeben.', 'warning');
      return;
    }

    // UI: Loading anzeigen
    const btn = document.getElementById('kiAnalysierenBtn');
    const loading = document.getElementById('kiLoading');
    btn.disabled = true;
    loading.style.display = 'flex';

    try {
      // KI-Analyse durchführen
      const response = await AIService.fullAnalysis(text, true);
      
      if (response.success && response.data) {
        this.displayKIResults(response.data);
      } else {
        throw new Error('Keine Daten von KI erhalten');
      }
    } catch (error) {
      console.error('KI-Analyse Fehler:', error);
      this.showToast('KI-Analyse fehlgeschlagen: ' + error.message, 'error');
    } finally {
      btn.disabled = false;
      loading.style.display = 'none';
    }
  }

  /**
   * Zeigt die KI-Ergebnisse im Modal an
   */
  displayKIResults(data) {
    const ergebnisBereich = document.getElementById('kiErgebnisBereich');
    const uebernehmenBtn = document.getElementById('kiUebernehmen');
    
    // Speichere Ergebnisse für spätere Übernahme
    this.kiErgebnisse = data;
    
    const termin = data.termin || {};
    
    // Kunde
    const kundeEl = document.getElementById('kiErgebnisKunde');
    kundeEl.textContent = termin.kunde?.name || '-';
    
    // Fahrzeug
    const fahrzeugEl = document.getElementById('kiErgebnisFahrzeug');
    const fahrzeugText = [];
    if (termin.fahrzeug?.marke) fahrzeugText.push(termin.fahrzeug.marke);
    if (termin.fahrzeug?.modell) fahrzeugText.push(termin.fahrzeug.modell);
    if (termin.fahrzeug?.kennzeichen) fahrzeugText.push(`(${termin.fahrzeug.kennzeichen})`);
    fahrzeugEl.textContent = fahrzeugText.length > 0 ? fahrzeugText.join(' ') : '-';
    
    // Datum
    const datumEl = document.getElementById('kiErgebnisDatum');
    if (termin.termin?.datum) {
      const d = new Date(termin.termin.datum);
      datumEl.textContent = d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    } else {
      datumEl.textContent = 'Nicht erkannt';
    }
    
    // Uhrzeit
    const uhrzeitEl = document.getElementById('kiErgebnisUhrzeit');
    uhrzeitEl.textContent = termin.termin?.uhrzeit || 'Nicht erkannt';
    
    // Arbeiten
    const arbeitenEl = document.getElementById('kiErgebnisArbeiten');
    arbeitenEl.innerHTML = '';
    if (termin.arbeiten && termin.arbeiten.length > 0) {
      termin.arbeiten.forEach(arbeit => {
        const tag = document.createElement('span');
        tag.className = 'arbeit-tag';
        tag.textContent = arbeit;
        arbeitenEl.appendChild(tag);
      });
    } else {
      arbeitenEl.textContent = 'Keine erkannt';
    }
    
    // Dauer
    const dauerEl = document.getElementById('kiErgebnisDauer');
    if (data.zeitschaetzung?.gesamtdauer) {
      const stunden = data.zeitschaetzung.gesamtdauer;
      const h = Math.floor(stunden);
      const m = Math.round((stunden - h) * 60);
      dauerEl.textContent = h > 0 ? `${h}h ${m}min` : `${m}min`;
    } else if (termin.termin?.dauer_stunden) {
      const stunden = termin.termin.dauer_stunden;
      const h = Math.floor(stunden);
      const m = Math.round((stunden - h) * 60);
      dauerEl.textContent = h > 0 ? `${h}h ${m}min` : `${m}min`;
    } else {
      dauerEl.textContent = '-';
    }
    
    // Teile
    const teileBereich = document.getElementById('kiTeileBereich');
    const teileEl = document.getElementById('kiErgebnisTeile');
    teileEl.innerHTML = '';
    if (data.teile?.teile && data.teile.teile.length > 0) {
      teileBereich.style.display = 'block';
      data.teile.teile.forEach(teil => {
        const tag = document.createElement('span');
        tag.className = 'teil-tag';
        tag.textContent = teil.name;
        teileEl.appendChild(tag);
      });
    } else {
      teileBereich.style.display = 'none';
    }
    
    // Fremdmarken-Warnung
    const fremdmarkenWarnung = document.getElementById('kiFremdmarkenWarnung');
    const fremdmarkenText = document.getElementById('kiFremdmarkenText');
    if (termin.fremdmarke) {
      fremdmarkenWarnung.style.display = 'flex';
      fremdmarkenText.textContent = termin.fremdmarke_warnung || 'Achtung: Fremdmarke erkannt!';
      document.getElementById('kiBestandskundeCheck').checked = false;
    } else {
      fremdmarkenWarnung.style.display = 'none';
    }
    
    // Confidence
    const confidence = termin.confidence || 0.5;
    const confidenceFill = document.getElementById('kiConfidenceFill');
    const confidenceValue = document.getElementById('kiConfidenceValue');
    confidenceFill.style.width = `${confidence * 100}%`;
    confidenceValue.textContent = `${Math.round(confidence * 100)}%`;
    
    // Anzeigen
    ergebnisBereich.style.display = 'block';
    uebernehmenBtn.style.display = 'inline-flex';
  }

  /**
   * Übernimmt die KI-Ergebnisse in das Termin-Formular
   */
  applyKIResults() {
    if (!this.kiErgebnisse) {
      this.showToast('Keine KI-Ergebnisse vorhanden.', 'warning');
      return;
    }

    const termin = this.kiErgebnisse.termin || {};
    
    // Fremdmarken-Prüfung
    if (termin.fremdmarke) {
      const bestandskundeCheck = document.getElementById('kiBestandskundeCheck');
      if (!bestandskundeCheck.checked) {
        this.showToast('Bitte bestätigen Sie, dass es sich um einen Bestandskunden handelt.', 'warning');
        return;
      }
    }

    // Kunde - versuche zu finden oder Name setzen
    if (termin.kunde?.name) {
      const nameInput = document.getElementById('terminNameSuche');
      if (nameInput) {
        nameInput.value = termin.kunde.name;
        // Trigger Suche
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    // Datum
    if (termin.termin?.datum) {
      const datumInput = document.getElementById('datum');
      if (datumInput) {
        datumInput.value = termin.termin.datum;
        datumInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Update Kalender-Display
        const displayEl = document.getElementById('selectedDatumDisplay');
        if (displayEl) {
          const d = new Date(termin.termin.datum);
          displayEl.textContent = d.toLocaleDateString('de-DE', { 
            weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' 
          });
        }
      }
    }

    // Uhrzeit
    if (termin.termin?.uhrzeit) {
      const uhrzeitInput = document.getElementById('startzeit');
      if (uhrzeitInput) {
        uhrzeitInput.value = termin.termin.uhrzeit;
      }
    }

    // Arbeiten
    if (termin.arbeiten && termin.arbeiten.length > 0) {
      const arbeitInput = document.getElementById('arbeitEingabe');
      if (arbeitInput) {
        arbeitInput.value = termin.arbeiten.join(', ');
        // Zeitschätzung aktualisieren
        this.updateZeitschaetzung();
      }
    }

    // Beschreibung
    if (termin.beschreibung) {
      const beschreibungInput = document.getElementById('beschreibung');
      if (beschreibungInput) {
        beschreibungInput.value = termin.beschreibung;
      }
    }

    // Modal schließen
    this.closeKIAssistent();
    
    // Erfolg anzeigen
    this.showToast('KI-Daten in Formular übernommen!', 'success');
    
    // Scroll zum Formular
    document.getElementById('terminForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // =============================================================================
  // KI AUTO-SUGGEST (Automatische Vorschläge beim Tippen)
  // =============================================================================

  /**
   * Debounce Timer für KI-Vorschläge
   */
  kiSuggestTimeout = null;
  kiSuggestLastText = '';
  kiSuggestEnabled = true;

  /**
   * Wird bei jeder Eingabe im Arbeiten-Feld aufgerufen
   */
  handleKIAutoSuggest(e) {
    // Prüfe ob KI global aktiviert ist
    if (this.kiEnabled === false) {
      this.hideKIVorschlaege();
      return;
    }
    
    // Prüfe ob KI-Analyse per Checkbox aktiviert ist
    const kiCheckbox = document.getElementById('kiAnalyseAktiv');
    if (!kiCheckbox || !kiCheckbox.checked) {
      this.hideKIVorschlaege();
      return;
    }
    
    const text = e.target.value.trim();
    
    // Nur wenn sich der Text geändert hat und lang genug ist
    if (text === this.kiSuggestLastText || text.length < 10) {
      return;
    }
    
    // Prüfe zuerst ob es eine Wartungsanfrage mit km-Stand ist
    const wartungInfo = this.detectWartungMitKm(text);
    
    // Prüfe ob es wie eine Problembeschreibung aussieht (nicht nur Stichworte)
    const istProblemBeschreibung = this.lookLikeProblemDescription(text);
    if (!istProblemBeschreibung && !wartungInfo) {
      this.hideKIVorschlaege();
      return;
    }
    
    this.kiSuggestLastText = text;
    
    // Debounce: Warte 1.5 Sekunden nach dem letzten Tastendruck
    if (this.kiSuggestTimeout) {
      clearTimeout(this.kiSuggestTimeout);
    }
    
    this.kiSuggestTimeout = setTimeout(() => {
      if (wartungInfo) {
        // Wartungsplan abrufen
        this.fetchWartungsplan(wartungInfo.kmStand);
      } else {
        // Normale KI-Vorschläge
        this.fetchKIVorschlaege(text);
      }
    }, 1500);
  }

  /**
   * Prüft ob der Text wie eine Problembeschreibung aussieht
   */
  lookLikeProblemDescription(text) {
    // Schlüsselwörter die auf Problembeschreibungen hindeuten
    const problemKeywords = [
      // Geräusche
      'quietscht', 'quietschen', 'macht geräusch', 'geräusche',
      'klappert', 'klapper', 'vibriert', 'vibration', 'ruckelt', 'ruckeln',
      'schleift', 'kratzt', 'pfeift', 'brummt', 'summt', 'knackt', 'knacken',
      // Fahrverhalten
      'zieht', 'bremst schlecht', 'bremse', 'bremsen',
      'springt nicht an', 'startet nicht', 'läuft nicht', 'funktioniert nicht',
      'geht nicht', 'macht nicht', 'tut nicht',
      // Anzeigen/Warnungen
      'leuchtet', 'lampe', 'licht', 'warnung', 'warnleuchte', 'anzeige', 'fehler',
      'kontrollleuchte', 'display', 'bordcomputer',
      // Flüssigkeiten
      'undicht', 'tropft', 'verliert', 'öl', 'wasser', 'kühlmittel',
      // Klima/Heizung
      'kühlt nicht', 'heizt nicht', 'klima', 'klimaanlage', 'heizung', 'lüftung',
      // Allgemein
      'problem', 'defekt', 'kaputt', 'prüfen', 'checken', 'schauen',
      'vorderachse', 'hinterachse', 'achse', 'fahrwerk', 'stoßdämpfer',
      'motor', 'getriebe', 'kupplung', 'auspuff',
      // Wartung/Service
      'wartung', 'inspektion', 'service', 'durchsicht'
    ];
    
    const lowerText = text.toLowerCase();
    return problemKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Prüft ob der Text eine Wartungsanfrage mit km-Stand enthält
   * @returns {Object|null} { kmStand: number } oder null
   */
  detectWartungMitKm(text) {
    const lowerText = text.toLowerCase();
    
    // Prüfe auf Wartungs-Keywords
    const wartungsKeywords = ['wartung', 'inspektion', 'service', 'durchsicht', 'check'];
    const hatWartung = wartungsKeywords.some(kw => lowerText.includes(kw));
    
    if (!hatWartung) return null;
    
    // Suche nach km-Stand (verschiedene Formate)
    // z.B. "45000km", "45.000 km", "45000 kilometer", "km-stand 45000", "bei 45000"
    const kmPatterns = [
      /(\d{1,3}(?:[.,]\d{3})*)\s*(?:km|kilometer)/i,
      /(?:km[\-\s]?stand|kilometerstand)[:\s]*(\d{1,3}(?:[.,]\d{3})*)/i,
      /(?:bei|aktuell|stand)[:\s]*(\d{4,6})(?:\s|$)/i
    ];
    
    for (const pattern of kmPatterns) {
      const match = text.match(pattern);
      if (match) {
        // Extrahiere und normalisiere km-Zahl
        let kmStr = match[1];
        // Entferne Tausendertrennzeichen
        kmStr = kmStr.replace(/[.,]/g, '');
        const km = parseInt(kmStr, 10);
        
        // Validiere: km sollte realistisch sein (1000-500000)
        if (km >= 1000 && km <= 500000) {
          return { kmStand: km };
        }
      }
    }
    
    return null;
  }

  /**
   * Holt Wartungsplan vom Backend basierend auf km-Stand
   */
  async fetchWartungsplan(kmStand) {
    const bereich = document.getElementById('kiVorschlaegeBereich');
    const liste = document.getElementById('kiVorschlaegeListe');
    
    if (!bereich || !liste) return;
    
    // Zeige Loading
    bereich.style.display = 'block';
    liste.innerHTML = `
      <div class="ki-vorschlaege-loading">
        <div class="ki-spinner"></div>
        <span>Wartungsplan wird erstellt...</span>
      </div>
    `;
    
    try {
      // Fahrzeuginfo aus Formular holen
      const fahrzeugtyp = document.getElementById('fahrzeugtyp')?.value || 'Citroën';
      
      const response = await AIService.getWartungsplan(fahrzeugtyp, kmStand);
      
      if (response.success && response.data) {
        this.displayWartungsplan(response.data);
      } else {
        this.hideKIVorschlaege();
        this.showToast('Wartungsplan konnte nicht erstellt werden', 'error');
      }
    } catch (error) {
      console.error('Wartungsplan Fehler:', error);
      this.hideKIVorschlaege();
      this.showToast('Fehler beim Abrufen des Wartungsplans', 'error');
    }
  }

  /**
   * Zeigt den Wartungsplan an
   */
  displayWartungsplan(data) {
    const bereich = document.getElementById('kiVorschlaegeBereich');
    const liste = document.getElementById('kiVorschlaegeListe');
    
    if (!data) {
      this.hideKIVorschlaege();
      return;
    }
    
    liste.innerHTML = '';
    
    // Header mit km-Stand
    const header = document.createElement('div');
    header.className = 'ki-wartungsplan-header';
    header.innerHTML = `
      <span class="ki-wartungsplan-icon">🔧</span>
      <div>
        <strong>Wartungsplan</strong>
        <span class="ki-wartungsplan-info">${data.fahrzeug || 'Citroën'} • ${(data.kmStand || 0).toLocaleString('de-DE')} km</span>
      </div>
      ${data.service_empfehlung ? `<span class="ki-service-badge">${data.service_empfehlung}</span>` : ''}
    `;
    liste.appendChild(header);
    
    // Jetzt fällige Arbeiten
    if (data.jetzt_faellig && data.jetzt_faellig.length > 0) {
      const nowSection = document.createElement('div');
      nowSection.className = 'ki-wartung-section ki-wartung-jetzt';
      nowSection.innerHTML = '<div class="ki-wartung-section-title">⚠️ Jetzt fällig:</div>';
      
      data.jetzt_faellig.forEach(item => {
        const arbeitDiv = document.createElement('div');
        arbeitDiv.className = 'ki-wartung-item ki-wartung-item-jetzt';
        arbeitDiv.innerHTML = `
          <span class="ki-wartung-name">${item.arbeit}</span>
          <span class="ki-wartung-details">${item.dauer_stunden}h ${item.grund ? '• ' + item.grund : ''}</span>
          <span class="ki-wartung-add" title="Zur Arbeitsliste hinzufügen">+</span>
        `;
        
        arbeitDiv.querySelector('.ki-wartung-add').addEventListener('click', () => {
          this.addKIVorschlagToArbeiten(item.arbeit);
        });
        
        nowSection.appendChild(arbeitDiv);
      });
      
      liste.appendChild(nowSection);
    }
    
    // Bald fällige Arbeiten
    if (data.bald_faellig && data.bald_faellig.length > 0) {
      const soonSection = document.createElement('div');
      soonSection.className = 'ki-wartung-section ki-wartung-bald';
      soonSection.innerHTML = '<div class="ki-wartung-section-title">📅 Bald fällig:</div>';
      
      data.bald_faellig.forEach(item => {
        const arbeitDiv = document.createElement('div');
        arbeitDiv.className = 'ki-wartung-item ki-wartung-item-bald';
        arbeitDiv.innerHTML = `
          <span class="ki-wartung-name">${item.arbeit}</span>
          <span class="ki-wartung-details">bei ${(item.faellig_bei_km || 0).toLocaleString('de-DE')} km</span>
        `;
        soonSection.appendChild(arbeitDiv);
      });
      
      liste.appendChild(soonSection);
    }
    
    // Citroën-Hinweise
    if (data.citroen_hinweise && data.citroen_hinweise.length > 0) {
      const hinweisDiv = document.createElement('div');
      hinweisDiv.className = 'ki-wartung-hinweise';
      hinweisDiv.innerHTML = `
        <div class="ki-wartung-hinweise-title">💡 Citroën-Hinweise:</div>
        <ul>${data.citroen_hinweise.map(h => `<li>${h}</li>`).join('')}</ul>
      `;
      liste.appendChild(hinweisDiv);
    }
    
    // Footer mit Gesamtzeit
    if (data.geschaetzte_gesamtzeit) {
      const footer = document.createElement('div');
      footer.className = 'ki-wartung-footer';
      footer.innerHTML = `
        <span>⏱️ Geschätzte Gesamtzeit: <strong>${data.geschaetzte_gesamtzeit}h</strong></span>
        ${data.naechste_inspektion_km ? `<span>📍 Nächste Inspektion: ${data.naechste_inspektion_km.toLocaleString('de-DE')} km</span>` : ''}
      `;
      liste.appendChild(footer);
    }
    
    bereich.style.display = 'block';
  }

  /**
   * Holt KI-Vorschläge vom Backend
   */
  async fetchKIVorschlaege(beschreibung) {
    const bereich = document.getElementById('kiVorschlaegeBereich');
    const liste = document.getElementById('kiVorschlaegeListe');
    
    if (!bereich || !liste) return;
    
    // Zeige Loading
    bereich.style.display = 'block';
    liste.innerHTML = `
      <div class="ki-vorschlaege-loading">
        <div class="ki-spinner"></div>
        <span>KI analysiert...</span>
      </div>
    `;
    
    try {
      // Fahrzeuginfo aus Formular holen
      const fahrzeugtyp = document.getElementById('fahrzeugtyp')?.value || '';
      
      const response = await AIService.suggestArbeiten(beschreibung, fahrzeugtyp);
      
      if (response.success && response.data?.arbeiten) {
        this.displayKIVorschlaege(response.data);
      } else {
        this.hideKIVorschlaege();
      }
    } catch (error) {
      console.error('KI-Vorschläge Fehler:', error);
      this.hideKIVorschlaege();
    }
  }

  /**
   * Zeigt die KI-Vorschläge an
   */
  displayKIVorschlaege(data) {
    const bereich = document.getElementById('kiVorschlaegeBereich');
    const liste = document.getElementById('kiVorschlaegeListe');
    
    if (!data.arbeiten || data.arbeiten.length === 0) {
      this.hideKIVorschlaege();
      return;
    }
    
    liste.innerHTML = '';
    
    data.arbeiten.forEach(arbeit => {
      const item = document.createElement('div');
      item.className = 'ki-vorschlag-item';
      item.innerHTML = `
        <span class="ki-vorschlag-icon">🔧</span>
        <div class="ki-vorschlag-text">
          <span class="ki-vorschlag-name">${arbeit.name}</span>
          <span class="ki-vorschlag-zeit">${arbeit.dauer_stunden}h - ${arbeit.kategorie || ''}</span>
        </div>
        <span class="ki-vorschlag-add">+</span>
      `;
      
      item.addEventListener('click', () => {
        this.addKIVorschlagToArbeiten(arbeit.name);
      });
      
      liste.appendChild(item);
    });
    
    // Empfehlung anzeigen
    if (data.empfehlung) {
      const empfehlung = document.createElement('div');
      empfehlung.style.cssText = 'padding: 10px; background: #e8f5e9; border-radius: 6px; margin-top: 8px; font-size: 0.85em; color: #2e7d32;';
      empfehlung.innerHTML = `💡 ${data.empfehlung}`;
      liste.appendChild(empfehlung);
    }
    
    bereich.style.display = 'block';
  }

  /**
   * Fügt einen KI-Vorschlag zum Arbeiten-Feld hinzu
   */
  addKIVorschlagToArbeiten(arbeitName) {
    const textarea = document.getElementById('arbeitEingabe');
    if (!textarea) return;
    
    const currentValue = textarea.value.trim();
    const lines = currentValue.split('\n').map(l => l.trim()).filter(l => l);
    
    // Prüfe ob schon vorhanden
    if (!lines.includes(arbeitName)) {
      lines.push(arbeitName);
      textarea.value = lines.join('\n');
      
      // Zeitschätzung aktualisieren
      this.updateZeitschaetzung();
      
      this.showToast(`"${arbeitName}" hinzugefügt`, 'success');
    } else {
      this.showToast('Arbeit bereits vorhanden', 'info');
    }
  }

  /**
   * Versteckt die KI-Vorschläge
   */
  hideKIVorschlaege() {
    const bereich = document.getElementById('kiVorschlaegeBereich');
    if (bereich) {
      bereich.style.display = 'none';
    }
  }

  // =============================================================================
  // VIN-DECODER FUNKTIONEN
  // =============================================================================

  /**
   * Dekodiert die eingegebene VIN und zeigt Fahrzeuginfos an
   */
  async decodeVIN() {
    const vinInput = document.getElementById('vin');
    const vinInfoBereich = document.getElementById('vinInfoBereich');
    const vinDecodeBtn = document.getElementById('vinDecodeBtn');
    
    if (!vinInput || !vinInfoBereich) return;
    
    const vin = vinInput.value.trim().toUpperCase();
    
    // Validierung
    if (vin.length !== 17) {
      this.showToast('VIN muss 17 Zeichen haben', 'warning');
      return;
    }
    
    // Button deaktivieren während Laden
    if (vinDecodeBtn) {
      vinDecodeBtn.disabled = true;
      vinDecodeBtn.textContent = '⏳';
    }
    
    try {
      const response = await AIService.decodeVIN(vin);
      
      if (response.success) {
        this.displayVINInfo(response, vinInfoBereich);
      } else {
        vinInfoBereich.innerHTML = `
          <div style="color: #c62828; padding: 10px;">
            ❌ ${response.error || 'VIN konnte nicht dekodiert werden'}
          </div>
        `;
        vinInfoBereich.style.display = 'block';
      }
      
    } catch (error) {
      console.error('VIN-Decode Fehler:', error);
      vinInfoBereich.innerHTML = `
        <div style="color: #c62828; padding: 10px;">
          ❌ Fehler beim Dekodieren: ${error.message}
        </div>
      `;
      vinInfoBereich.style.display = 'block';
    } finally {
      if (vinDecodeBtn) {
        vinDecodeBtn.disabled = false;
        vinDecodeBtn.textContent = '🔍';
      }
    }
  }

  /**
   * Zeigt die dekodierten VIN-Informationen an
   */
  displayVINInfo(data, container) {
    const istCitroen = data.istCitroen;
    const markenBadge = istCitroen 
      ? '<span class="vin-citroen-badge">✓ Citroën</span>'
      : '<span class="vin-fremdmarke-badge">⚠ Fremdmarke</span>';
    
    let html = `
      <div class="vin-info-header">
        <span class="vin-marke">${istCitroen ? '🚗' : '🚙'}</span>
        <div>
          <span class="vin-fahrzeug">${data.hersteller} ${data.modell}</span>
          ${markenBadge}
          <span class="vin-baujahr">${data.generation || ''} ${data.baujahr ? '• ' + data.baujahr : ''}</span>
        </div>
      </div>
      
      <div class="vin-info-grid">
        <div class="vin-info-item">
          <span class="label">Motor</span>
          <span class="value">${data.motor?.typ || 'Unbekannt'} ${data.motor?.ps ? '(' + data.motor.ps + ' PS)' : ''}</span>
        </div>
        <div class="vin-info-item">
          <span class="label">Motorcode</span>
          <span class="value">${data.motor?.code || 'n/a'}</span>
        </div>
        <div class="vin-info-item">
          <span class="label">Getriebe</span>
          <span class="value">${data.getriebe || 'n/a'}</span>
        </div>
        <div class="vin-info-item">
          <span class="label">Werk</span>
          <span class="value">${data.werk || 'n/a'}</span>
        </div>
      </div>
    `;
    
    // Teile-Hinweise (Öl, Filter)
    if (data.teile && data.teile.hinweise && data.teile.hinweise.length > 0) {
      html += `
        <div class="vin-teile-hinweise">
          <div class="vin-teile-hinweise-title">📋 Teile-Info für dieses Fahrzeug:</div>
          <ul>
            ${data.teile.hinweise.map(h => `<li>${h}</li>`).join('')}
          </ul>
        </div>
      `;
    }
    
    // Warnungen (Stabi, Bremsen, etc.)
    if (data.teile && data.teile.warnungen && data.teile.warnungen.length > 0) {
      html += `
        <div class="vin-warnungen">
          <div class="vin-warnungen-title">⚠️ Beachten bei Teilebestellung:</div>
          ${data.teile.warnungen.map(w => `
            <div class="vin-warnung-item">
              <span class="vin-warnung-teil">${w.teil}:</span>
              <span class="vin-warnung-text">${w.warnung}</span>
            </div>
          `).join('')}
        </div>
      `;
    }
    
    // Motor-Hinweise
    if (data.motor && data.motor.hinweise && data.motor.hinweise.length > 0) {
      html += `
        <div style="margin-top: 10px; padding: 10px; background: #e3f2fd; border-radius: 6px; font-size: 0.85em;">
          <strong>💡 Motor-Hinweise:</strong>
          <ul style="margin: 5px 0 0 20px; padding: 0;">
            ${data.motor.hinweise.map(h => `<li>${h}</li>`).join('')}
          </ul>
        </div>
      `;
    }
    
    // Auto-Fill Button
    html += `
      <button type="button" class="vin-auto-fill-btn" onclick="app.autoFillFromVIN('${data.hersteller}', '${data.modell}', '${data.motor?.typ || ''}', ${data.baujahr || 0})">
        ✨ Fahrzeugtyp automatisch eintragen
      </button>
    `;
    
    // Fremdmarken-Warnung
    if (!istCitroen) {
      html += `
        <div style="margin-top: 10px; padding: 10px; background: #fff3e0; border-radius: 6px; border-left: 3px solid #ff9800; font-size: 0.85em;">
          <strong>⚠️ Fremdmarke erkannt!</strong><br>
          Als Citroën-Markenwerkstatt nehmen wir Fremdmarken nur von <strong>Bestandskunden</strong> an.
        </div>
      `;
    }
    
    container.innerHTML = html;
    container.style.display = 'block';
  }

  /**
   * Füllt den Fahrzeugtyp automatisch aus den VIN-Daten
   */
  autoFillFromVIN(hersteller, modell, motor, baujahr) {
    const fahrzeugtypInput = document.getElementById('fahrzeugtyp');
    if (!fahrzeugtypInput) return;
    
    let fahrzeugtyp = `${hersteller} ${modell}`;
    if (motor && motor !== 'Unbekannt') {
      fahrzeugtyp += ` ${motor}`;
    }
    if (baujahr && baujahr > 0) {
      fahrzeugtyp += ` (${baujahr})`;
    }
    
    fahrzeugtypInput.value = fahrzeugtyp;
    this.showToast('Fahrzeugtyp eingetragen', 'success');
  }

  // =============================================================================
  // TEILE-BESTELLEN FUNKTIONEN
  // =============================================================================

  /**
   * Lädt die Teile-Bestellungen und zeigt sie gruppiert an
   */
  async loadTeileBestellungen() {
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
   */
  renderTeileBestellungen(gruppiert, container) {
    const filterOffen = document.getElementById('teileFilterOffen')?.checked !== false;
    const filterBestellt = document.getElementById('teileFilterBestellt')?.checked !== false;
    const filterGeliefert = document.getElementById('teileFilterGeliefert')?.checked === true;
    
    let html = '';
    
    // Funktion zum Filtern
    const filterBestellung = (b) => {
      if (b.status === 'offen' && !filterOffen) return false;
      if (b.status === 'bestellt' && !filterBestellt) return false;
      if (b.status === 'geliefert' && !filterGeliefert) return false;
      return true;
    };
    
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
      html = `
        <div class="teile-leer">
          <span class="teile-leer-icon">📦</span>
          <p>Keine Teile-Bestellungen für den ausgewählten Zeitraum</p>
        </div>
      `;
    }
    
    container.innerHTML = html;
  }

  /**
   * Rendert eine Gruppe von Bestellungen
   * @param {string} titel - Gruppentitel
   * @param {string} klasse - CSS-Klasse
   * @param {Array} bestellungen - Bestellungen in der Gruppe
   * @param {boolean} istSchwebend - Ob es schwebende Termine sind
   * @param {boolean} istKundenDirekt - Ob es Kunden-direkt Bestellungen sind (ohne Termin)
   */
  renderTeileGruppe(titel, klasse, bestellungen, istSchwebend = false, istKundenDirekt = false) {
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
                <button class="btn-mini btn-success" onclick="app.arbeitenTeileStatusAufLoesen(${teil.termin_id}, '${(teil.fuer_arbeit || '').replace(/'/g, "\\'")}')" title="Als erledigt markieren">✅ Erledigt</button>
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
   */
  async loadTermineFuerTeileDropdownLazy() {
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
  async loadKundenFuerTeileDropdownLazy() {
    const select = document.getElementById('teileNeuKunde');
    if (!select) return;
    
    // Nur laden wenn noch nicht geladen
    if (this._kundenDropdownGeladen) return;
    this._kundenDropdownGeladen = true;
    
    select.innerHTML = '<option value="">⏳ Lade Kunden...</option>';
    await this.loadKundenFuerTeileDropdown();
  }

  /**
   * Lädt Termine für das Dropdown bei neuer Bestellung
   */
  async loadTermineFuerTeileDropdown() {
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
  async loadKundenFuerTeileDropdown() {
    const select = document.getElementById('teileNeuKunde');
    if (!select) return;
    
    try {
      // OPTIMIERT: Nutze kompakten Dropdown-Endpoint (nur ID, Name, Kennzeichen)
      const kunden = await ApiService.get('/kunden/dropdown');
      
      select.innerHTML = '<option value="">-- Kunde auswählen --</option>';
      
      (kunden || []).forEach(k => {
        const name = k.name || 'Unbekannt';
        const kennzeichen = k.kennzeichen ? ` (${k.kennzeichen})` : '';
        select.innerHTML += `<option value="${k.id}">👤 ${name}${kennzeichen}</option>`;
      });
    } catch (error) {
      console.error('Fehler beim Laden der Kunden:', error);
    }
  }

  /**
   * Wechselt zwischen Termin- und Kunden-Zuordnung
   */
  teileZuordnungGeaendert() {
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
   */
  teileAlleAuswaehlen() {
    const checkboxen = document.querySelectorAll('.teil-select:not(:disabled)');
    const alleAusgewaehlt = Array.from(checkboxen).every(cb => cb.checked);
    
    checkboxen.forEach(cb => {
      cb.checked = !alleAusgewaehlt;
    });
    
    this.showToast(alleAusgewaehlt ? 'Auswahl aufgehoben' : 'Alle ausgewählt', 'info');
  }

  /**
   * Ausgewählte Teile als bestellt markieren
   */
  async teileAlsBestellt() {
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
   * Status einer einzelnen Bestellung ändern
   */
  async teileStatusAendern(id, status) {
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
   */
  async teileLoeschen(id) {
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
   */
  async teileNeuHinzufuegen() {
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
   */
  teileDrucken() {
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
   */
  async terminBearbeitenAusTeile(terminId) {
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
   */
  async teileStatusAufLoesen(terminId) {
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
  async arbeitenTeileStatusAufLoesen(terminId, arbeitName) {
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
   * KI-Tagesplanungsvorschlag anfordern
   */
  async requestKITagesplanung() {
    // Prüfe ob KI global aktiviert ist
    if (this.kiEnabled === false) {
      this.showToast('🔌 KI-Funktionen sind deaktiviert. Aktivieren Sie diese unter Einstellungen → KI / API', 'warning');
      return;
    }
    if (!this.smartSchedulingEnabled) {
      this.showToast('🧭 Smart Scheduling ist deaktiviert. Bitte in den Einstellungen aktivieren.', 'warning');
      return;
    }
    
    const datumInput = document.getElementById('auslastungDragDropDatum');
    if (!datumInput || !datumInput.value) {
      alert('Bitte wählen Sie zuerst ein Datum aus.');
      return;
    }
    
    const datum = datumInput.value;
    this.showKIPlanungModal('tages', datum);
    
    try {
      const result = await KIPlanungService.getTagesvorschlag(datum);
      
      if (result.success && result.vorschlag) {
        this.displayKITagesvorschlag(result.vorschlag, datum);
      } else {
        this.showKIPlanungError(result.error || 'Unbekannter Fehler');
      }
    } catch (error) {
      console.error('KI-Tagesplanung Fehler:', error);
      this.showKIPlanungError(error.message || 'Verbindungsfehler zum Server');
    }
  }

  /**
   * KI-Wochenplanungsvorschlag anfordern (schwebende Termine verteilen)
   */
  async requestKIWochenplanung() {
    // Prüfe ob KI global aktiviert ist
    if (this.kiEnabled === false) {
      this.showToast('🔌 KI-Funktionen sind deaktiviert. Aktivieren Sie diese unter Einstellungen → KI / API', 'warning');
      return;
    }
    if (!this.smartSchedulingEnabled) {
      this.showToast('🧭 Smart Scheduling ist deaktiviert. Bitte in den Einstellungen aktivieren.', 'warning');
      return;
    }
    
    const datumInput = document.getElementById('auslastungDragDropDatum');
    if (!datumInput || !datumInput.value) {
      alert('Bitte wählen Sie zuerst ein Datum aus.');
      return;
    }
    
    const datum = datumInput.value;
    this.showKIPlanungModal('wochen', datum);
    
    try {
      const result = await KIPlanungService.getWochenvorschlag(datum);
      
      if (result.success && result.vorschlag) {
        this.displayKIWochenvorschlag(result.vorschlag, result.wochentage);
      } else {
        this.showKIPlanungError(result.error || 'Unbekannter Fehler');
      }
    } catch (error) {
      console.error('KI-Wochenplanung Fehler:', error);
      this.showKIPlanungError(error.message || 'Verbindungsfehler zum Server');
    }
  }

  /**
   * KI-Modal anzeigen mit Ladeindikator
   */
  showKIPlanungModal(type, datum) {
    const modal = document.getElementById('kiPlanungModal');
    const title = document.getElementById('kiModalTitle');
    const loading = document.getElementById('kiPlanungLoading');
    const error = document.getElementById('kiPlanungError');
    const content = document.getElementById('kiPlanungContent');
    const footer = document.getElementById('kiModalFooter');
    
    // Titel setzen
    if (type === 'wochen') {
      title.textContent = '🤖 KI-Wochenverteilung';
    } else {
      const datumFormatiert = new Date(datum).toLocaleDateString('de-DE', {
        weekday: 'long', day: '2-digit', month: '2-digit'
      });
      title.textContent = `🤖 KI-Tagesplanung für ${datumFormatiert}`;
    }
    
    // Reset
    loading.style.display = 'flex';
    error.style.display = 'none';
    content.style.display = 'none';
    footer.style.display = 'none';
    
    // Speichere aktuellen Typ und Datum
    this._kiPlanungType = type;
    this._kiPlanungDatum = datum;
    this._kiVorschlaege = null;
    
    modal.style.display = 'flex';
  }

  /**
   * KI-Modal schließen
   */
  closeKIPlanungModal() {
    const modal = document.getElementById('kiPlanungModal');
    modal.style.display = 'none';
    this._kiVorschlaege = null;
  }

  /**
   * Fehler im KI-Modal anzeigen
   */
  showKIPlanungError(message) {
    const loading = document.getElementById('kiPlanungLoading');
    const error = document.getElementById('kiPlanungError');
    const errorText = document.getElementById('kiPlanungErrorText');
    
    loading.style.display = 'none';
    error.style.display = 'flex';
    errorText.textContent = message;
  }

  /**
   * KI-Tagesvorschlag anzeigen
   */
  displayKITagesvorschlag(vorschlag, datum) {
    const loading = document.getElementById('kiPlanungLoading');
    const content = document.getElementById('kiPlanungContent');
    const footer = document.getElementById('kiModalFooter');
    
    loading.style.display = 'none';
    content.style.display = 'block';
    
    // Speichere Vorschläge für spätere Übernahme
    this._kiVorschlaege = vorschlag;
    
    // Zusammenfassung
    document.getElementById('kiZusammenfassung').textContent = 
      vorschlag.zusammenfassung || 'Keine Zusammenfassung verfügbar.';
    
    // Kapazitätsanalyse
    const kapazitaetDiv = document.getElementById('kiKapazitaet');
    if (vorschlag.kapazitaetsAnalyse) {
      const ka = vorschlag.kapazitaetsAnalyse;
      kapazitaetDiv.innerHTML = `
        <div class="ki-capacity-item">
          <span class="label">Gesamt:</span>
          <span class="value">${ka.gesamtKapazitaet || '-'}</span>
        </div>
        <div class="ki-capacity-item">
          <span class="label">Belegt:</span>
          <span class="value">${ka.genutzt || '-'}</span>
        </div>
        <div class="ki-capacity-item highlight">
          <span class="label">Frei:</span>
          <span class="value">${ka.frei || '-'}</span>
        </div>
      `;
    } else {
      kapazitaetDiv.innerHTML = '<p class="muted">Keine Kapazitätsdaten</p>';
    }
    
    // Warnungen
    const warnungenSection = document.getElementById('kiWarnungenSection');
    const warnungenList = document.getElementById('kiWarnungen');
    if (vorschlag.warnungen && vorschlag.warnungen.length > 0) {
      warnungenSection.style.display = 'block';
      warnungenList.innerHTML = vorschlag.warnungen.map(w => `<li>${w}</li>`).join('');
    } else {
      warnungenSection.style.display = 'none';
    }
    
    // Tages-Zuordnungen
    const tagesSection = document.getElementById('kiTagesSection');
    const tagesDiv = document.getElementById('kiTagesZuordnungen');
    if (vorschlag.tagesZuordnungen && vorschlag.tagesZuordnungen.length > 0) {
      tagesSection.style.display = 'block';
      tagesDiv.innerHTML = vorschlag.tagesZuordnungen.map(z => this.renderKIZuordnung(z, 'tages')).join('');
      footer.style.display = 'flex';
    } else {
      tagesSection.style.display = 'none';
    }
    
    // Schwebende Termine Vorschläge
    const schwebendeSection = document.getElementById('kiSchwebendeSection');
    const schwebendeDiv = document.getElementById('kiSchwebendeVorschlaege');
    if (vorschlag.schwebendeVorschlaege && vorschlag.schwebendeVorschlaege.length > 0) {
      schwebendeSection.style.display = 'block';
      schwebendeDiv.innerHTML = vorschlag.schwebendeVorschlaege.map(v => this.renderKISchwebendVorschlag(v)).join('');
      footer.style.display = 'flex';
    } else {
      schwebendeSection.style.display = 'none';
    }
    
    // Wochen-Section verstecken
    document.getElementById('kiWochenSection').style.display = 'none';
    
    // Footer nur zeigen wenn es Vorschläge gibt
    const hatVorschlaege = (vorschlag.tagesZuordnungen?.length > 0) || 
                          (vorschlag.schwebendeVorschlaege?.length > 0);
    footer.style.display = hatVorschlaege ? 'flex' : 'none';
  }

  /**
   * KI-Wochenvorschlag anzeigen
   */
  displayKIWochenvorschlag(vorschlag, wochentage) {
    const loading = document.getElementById('kiPlanungLoading');
    const content = document.getElementById('kiPlanungContent');
    const footer = document.getElementById('kiModalFooter');
    
    loading.style.display = 'none';
    content.style.display = 'block';
    
    this._kiVorschlaege = vorschlag;
    this._kiWochentage = wochentage;
    
    // Zusammenfassung
    document.getElementById('kiZusammenfassung').textContent = 
      vorschlag.zusammenfassung || 'Keine Zusammenfassung verfügbar.';
    
    // Kapazität verstecken für Wochenansicht
    document.getElementById('kiKapazitaet').innerHTML = '';
    
    // Warnungen
    const warnungenSection = document.getElementById('kiWarnungenSection');
    const warnungenList = document.getElementById('kiWarnungen');
    if (vorschlag.warnungen && vorschlag.warnungen.length > 0) {
      warnungenSection.style.display = 'block';
      warnungenList.innerHTML = vorschlag.warnungen.map(w => `<li>${w}</li>`).join('');
    } else {
      warnungenSection.style.display = 'none';
    }
    
    // Tages- und Schwebend-Sections verstecken
    document.getElementById('kiTagesSection').style.display = 'none';
    document.getElementById('kiSchwebendeSection').style.display = 'none';
    
    // Wochen-Section anzeigen
    const wochenSection = document.getElementById('kiWochenSection');
    const wochenAuslastung = document.getElementById('kiWochenAuslastung');
    const wochenVerteilung = document.getElementById('kiWochenVerteilung');
    
    wochenSection.style.display = 'block';
    
    // Wochenauslastung als Balken
    if (vorschlag.wochenAuslastung) {
      const tage = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag'];
      const tageLabel = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
      
      wochenAuslastung.innerHTML = tage.map((tag, i) => {
        const prozent = parseInt(vorschlag.wochenAuslastung[tag]) || 0;
        const farbe = prozent > 90 ? '#e74c3c' : prozent > 70 ? '#f39c12' : '#27ae60';
        return `
          <div class="ki-week-day">
            <span class="day-label">${tageLabel[i]}</span>
            <div class="day-bar">
              <div class="day-fill" style="width: ${Math.min(prozent, 100)}%; background: ${farbe};"></div>
            </div>
            <span class="day-percent">${prozent}%</span>
          </div>
        `;
      }).join('');
    }
    
    // Verteilungsvorschläge
    if (vorschlag.verteilung && vorschlag.verteilung.length > 0) {
      wochenVerteilung.innerHTML = vorschlag.verteilung.map(v => this.renderKIWochenVerteilung(v)).join('');
      footer.style.display = 'flex';
    } else {
      wochenVerteilung.innerHTML = '<p class="muted">Keine Verteilungsvorschläge</p>';
      footer.style.display = 'none';
    }
  }

  /**
   * Einzelne KI-Zuordnung rendern
   */
  renderKIZuordnung(zuordnung, type) {
    const statusClass = zuordnung.gueltig ? 'valid' : 'invalid';
    const personIcon = zuordnung.mitarbeiterTyp === 'lehrling' ? '🎓' : '👷';
    
    return `
      <div class="ki-suggestion-item ${statusClass}" data-termin-id="${zuordnung.terminId}" id="ki-item-${type}-${zuordnung.terminId}">
        <div class="ki-suggestion-header">
          <label class="ki-suggestion-checkbox">
            <input type="checkbox" checked data-type="${type}" data-termin-id="${zuordnung.terminId}">
          </label>
          <span class="ki-suggestion-termin">#${zuordnung.terminId}: ${zuordnung.terminInfo || 'Termin'}</span>
          <div class="ki-suggestion-actions">
            <button class="btn btn-xs btn-success" onclick="app.uebernehmeEinzelnenVorschlag('${type}', ${zuordnung.terminId})" title="Diesen Vorschlag sofort übernehmen">
              ✓
            </button>
            <button class="btn btn-xs btn-danger" onclick="app.verwerfenEinzelnenVorschlag('${type}', ${zuordnung.terminId})" title="Diesen Vorschlag verwerfen">
              ✗
            </button>
          </div>
        </div>
        <div class="ki-suggestion-details">
          <span class="ki-suggestion-person">${personIcon} ${zuordnung.personName || 'Unbekannt'}</span>
          <span class="ki-suggestion-time">⏰ ${zuordnung.startzeit || '-'}</span>
        </div>
        <div class="ki-suggestion-reason">
          💡 ${zuordnung.begruendung || 'Keine Begründung'}
        </div>
      </div>
    `;
  }

  /**
   * Schwebender Termin Vorschlag rendern
   */
  renderKISchwebendVorschlag(vorschlag) {
    const statusClass = vorschlag.gueltig ? 'valid' : 'invalid';
    const personIcon = vorschlag.mitarbeiterTyp === 'lehrling' ? '🎓' : '👷';
    const empfehlungBadge = vorschlag.empfehlung === 'heute_einplanen' 
      ? '<span class="badge badge-success">Heute einplanen</span>'
      : '<span class="badge badge-info">Später</span>';
    
    return `
      <div class="ki-suggestion-item schwebend ${statusClass}" data-termin-id="${vorschlag.terminId}" id="ki-item-schwebend-${vorschlag.terminId}">
        <div class="ki-suggestion-header">
          <label class="ki-suggestion-checkbox">
            <input type="checkbox" ${vorschlag.empfehlung === 'heute_einplanen' ? 'checked' : ''} 
                   data-type="schwebend" data-termin-id="${vorschlag.terminId}">
          </label>
          <span class="ki-suggestion-termin">⏸️ #${vorschlag.terminId}: ${vorschlag.terminInfo || 'Termin'}</span>
          ${empfehlungBadge}
          <div class="ki-suggestion-actions">
            <button class="btn btn-xs btn-success" onclick="app.uebernehmeEinzelnenVorschlag('schwebend', ${vorschlag.terminId})" title="Diesen Vorschlag sofort übernehmen">
              ✓
            </button>
            <button class="btn btn-xs btn-danger" onclick="app.verwerfenEinzelnenVorschlag('schwebend', ${vorschlag.terminId})" title="Diesen Vorschlag verwerfen">
              ✗
            </button>
          </div>
        </div>
        <div class="ki-suggestion-details">
          <span class="ki-suggestion-person">${personIcon} ${vorschlag.personName || 'Unbekannt'}</span>
          <span class="ki-suggestion-time">⏰ ${vorschlag.startzeit || '-'}</span>
        </div>
        <div class="ki-suggestion-reason">
          💡 ${vorschlag.begruendung || 'Keine Begründung'}
        </div>
      </div>
    `;
  }

  /**
   * Wochen-Verteilungsvorschlag rendern
   */
  renderKIWochenVerteilung(verteilung) {
    const statusClass = verteilung.gueltig ? 'valid' : 'invalid';
    const datumFormatiert = verteilung.empfohlenesDatum 
      ? new Date(verteilung.empfohlenesDatum).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
      : '-';
    
    return `
      <div class="ki-suggestion-item wochen ${statusClass}" data-termin-id="${verteilung.terminId}" id="ki-item-wochen-${verteilung.terminId}">
        <div class="ki-suggestion-header">
          <label class="ki-suggestion-checkbox">
            <input type="checkbox" checked data-type="wochen" data-termin-id="${verteilung.terminId}" 
                   data-datum="${verteilung.empfohlenesDatum}">
          </label>
          <span class="ki-suggestion-termin">⏸️ #${verteilung.terminId}: ${verteilung.terminInfo || 'Termin'}</span>
          <span class="badge badge-primary">📅 ${datumFormatiert}</span>
          <div class="ki-suggestion-actions">
            <button class="btn btn-xs btn-success" onclick="app.uebernehmeEinzelnenVorschlag('wochen', ${verteilung.terminId}, '${verteilung.empfohlenesDatum}')" title="Diesen Vorschlag sofort übernehmen">
              ✓
            </button>
            <button class="btn btn-xs btn-danger" onclick="app.verwerfenEinzelnenVorschlag('wochen', ${verteilung.terminId})" title="Diesen Vorschlag verwerfen">
              ✗
            </button>
          </div>
        </div>
        <div class="ki-suggestion-reason">
          💡 ${verteilung.begruendung || 'Keine Begründung'}
        </div>
      </div>
    `;
  }

  /**
   * Alle/Keine Checkboxen auswählen
   */
  kiSelectAll(select) {
    const checkboxes = document.querySelectorAll('#kiPlanungContent input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = select);
    this.updateKIUebernehmenButton();
  }

  /**
   * Übernehmen-Button Text aktualisieren
   */
  updateKIUebernehmenButton() {
    const checkboxes = document.querySelectorAll('#kiPlanungContent input[type="checkbox"]:checked');
    const btn = document.getElementById('kiAlleUebernehmenBtn');
    if (btn) {
      const count = checkboxes.length;
      btn.textContent = count > 0 ? `✅ ${count} Vorschlag${count > 1 ? 'e' : ''} übernehmen` : '✅ Keine ausgewählt';
      btn.disabled = count === 0;
    }
  }

  /**
   * Einzelnen Vorschlag sofort übernehmen
   */
  async uebernehmeEinzelnenVorschlag(type, terminId, datum = null) {
    const item = document.getElementById(`ki-item-${type}-${terminId}`);
    if (item) {
      item.classList.add('ki-processing');
    }
    
    try {
      if (type === 'tages') {
        const zuordnung = this._kiVorschlaege.tagesZuordnungen?.find(z => z.terminId === terminId);
        if (zuordnung) {
          await this.uebernehmeKIZuordnung(zuordnung);
        }
      } else if (type === 'schwebend') {
        const vorschlag = this._kiVorschlaege.schwebendeVorschlaege?.find(v => v.terminId === terminId);
        if (vorschlag) {
          await this.uebernehmeSchwebendVorschlag(vorschlag, this._kiPlanungDatum);
        }
      } else if (type === 'wochen') {
        const verteilung = this._kiVorschlaege.verteilung?.find(v => v.terminId === terminId);
        if (verteilung && datum) {
          await this.uebernehmeWochenVerteilung(verteilung, datum);
        }
      }
      
      // Erfolgreich - Item als übernommen markieren
      if (item) {
        item.classList.remove('ki-processing');
        item.classList.add('ki-accepted');
        item.innerHTML = `
          <div class="ki-suggestion-accepted">
            ✅ Vorschlag #${terminId} übernommen
          </div>
        `;
      }
      
      this.showToast(`Vorschlag #${terminId} übernommen`, 'success');
      
      // Planungsansicht im Hintergrund aktualisieren
      this.loadAuslastungDragDrop();
      
    } catch (error) {
      console.error('Fehler beim Übernehmen:', error);
      if (item) {
        item.classList.remove('ki-processing');
        item.classList.add('ki-error');
      }
      this.showToast(`Fehler: ${error.message}`, 'error');
    }
  }

  /**
   * Einzelnen Vorschlag verwerfen (aus Liste entfernen)
   */
  verwerfenEinzelnenVorschlag(type, terminId) {
    const item = document.getElementById(`ki-item-${type}-${terminId}`);
    if (item) {
      item.classList.add('ki-rejected');
      setTimeout(() => {
        item.remove();
        this.updateKIUebernehmenButton();
        
        // Prüfen ob noch Vorschläge übrig sind
        const verbleibend = document.querySelectorAll('.ki-suggestion-item:not(.ki-accepted):not(.ki-rejected)');
        if (verbleibend.length === 0) {
          document.getElementById('kiModalFooter').style.display = 'none';
        }
      }, 300);
    }
  }

  /**
   * Alle ausgewählten KI-Vorschläge übernehmen
   */
  async uebernehmeAlleKIVorschlaege() {
    if (!this._kiVorschlaege) {
      this.showToast('Keine Vorschläge zum Übernehmen', 'warning');
      return;
    }
    
    const checkboxes = document.querySelectorAll('#kiPlanungContent input[type="checkbox"]:checked');
    
    if (checkboxes.length === 0) {
      this.showToast('Keine Vorschläge ausgewählt', 'warning');
      return;
    }
    
    const btn = document.getElementById('kiAlleUebernehmenBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Wird übernommen...';
    
    let erfolg = 0;
    let fehler = 0;
    
    for (const checkbox of checkboxes) {
      const type = checkbox.dataset.type;
      const terminId = parseInt(checkbox.dataset.terminId);
      
      try {
        if (type === 'tages') {
          // Tages-Zuordnung übernehmen
          const zuordnung = this._kiVorschlaege.tagesZuordnungen?.find(z => z.terminId === terminId);
          if (zuordnung) {
            await this.uebernehmeKIZuordnung(zuordnung);
            erfolg++;
          }
        } else if (type === 'schwebend') {
          // Schwebenden Termin für heute einplanen
          const vorschlag = this._kiVorschlaege.schwebendeVorschlaege?.find(v => v.terminId === terminId);
          if (vorschlag && vorschlag.empfehlung === 'heute_einplanen') {
            await this.uebernehmeSchwebendVorschlag(vorschlag, this._kiPlanungDatum);
            erfolg++;
          }
        } else if (type === 'wochen') {
          // Wochen-Verteilung übernehmen
          const datum = checkbox.dataset.datum;
          const verteilung = this._kiVorschlaege.verteilung?.find(v => v.terminId === terminId);
          if (verteilung && datum) {
            await this.uebernehmeWochenVerteilung(verteilung, datum);
            erfolg++;
          }
        }
      } catch (error) {
        console.error(`Fehler bei Termin ${terminId}:`, error);
        fehler++;
      }
    }
    
    btn.disabled = false;
    btn.textContent = '✅ Alle Vorschläge übernehmen';
    
    this.closeKIPlanungModal();
    
    // Planungsansicht neu laden
    this.loadAuslastungDragDrop();
    
    // Feedback
    if (fehler === 0) {
      this.showToast(`✅ ${erfolg} Vorschläge erfolgreich übernommen`, 'success');
    } else {
      this.showToast(`${erfolg} übernommen, ${fehler} Fehler`, 'warning');
    }
  }

  /**
   * Einzelne KI-Zuordnung übernehmen (Tagesplanung)
   */
  async uebernehmeKIZuordnung(zuordnung) {
    const termin = this.termineById[zuordnung.terminId];
    if (!termin) {
      throw new Error('Termin nicht gefunden');
    }
    
    // arbeitszeiten_details aktualisieren
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
    
    // Gesamt-Zuordnung setzen
    details._gesamt_mitarbeiter_id = {
      id: zuordnung.mitarbeiterId,
      type: zuordnung.mitarbeiterTyp || 'mitarbeiter'
    };
    
    if (zuordnung.startzeit) {
      details._startzeit = zuordnung.startzeit;
    }
    
    // Update-Payload
    const updateData = {
      arbeitszeiten_details: JSON.stringify(details)
    };
    
    // Mitarbeiter-ID auch auf Termin-Ebene setzen (für Kompatibilität)
    if (zuordnung.mitarbeiterTyp === 'mitarbeiter') {
      updateData.mitarbeiter_id = zuordnung.mitarbeiterId;
    }
    
    await TermineService.update(zuordnung.terminId, updateData);
  }

  /**
   * Schwebenden Termin für ein Datum einplanen
   */
  async uebernehmeSchwebendVorschlag(vorschlag, datum) {
    let details = {};
    
    const termin = await TermineService.getById(vorschlag.terminId);
    if (termin && termin.arbeitszeiten_details) {
      try {
        details = typeof termin.arbeitszeiten_details === 'string'
          ? JSON.parse(termin.arbeitszeiten_details)
          : termin.arbeitszeiten_details;
      } catch (e) {
        details = {};
      }
    }
    
    // Zuordnung setzen
    details._gesamt_mitarbeiter_id = {
      id: vorschlag.mitarbeiterId,
      type: vorschlag.mitarbeiterTyp || 'mitarbeiter'
    };
    
    if (vorschlag.startzeit) {
      details._startzeit = vorschlag.startzeit;
    }
    
    const updateData = {
      datum: datum,
      ist_schwebend: 0, // Nicht mehr schwebend
      arbeitszeiten_details: JSON.stringify(details)
    };
    
    if (vorschlag.mitarbeiterTyp === 'mitarbeiter') {
      updateData.mitarbeiter_id = vorschlag.mitarbeiterId;
    }
    
    await TermineService.update(vorschlag.terminId, updateData);
  }

  /**
   * Wochen-Verteilung übernehmen (Datum für schwebenden Termin setzen)
   */
  async uebernehmeWochenVerteilung(verteilung, datum) {
    await TermineService.update(verteilung.terminId, {
      datum: datum,
      ist_schwebend: 0
    });
  }

  // ================================================
  // INTERN TAB - Team Arbeitsübersicht
  // ================================================

  /**
   * Initialisiert den Intern-Tab
   */
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
  }

  /**
   * Schaltet den Tablet-Modus ein/aus
   */
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
  }

  /**
   * Lädt die komplette Team-Übersicht (alle Mitarbeiter + Lehrlinge)
   */
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
      // Hole alle Daten parallel
      const heute = this.formatDateLocal(this.getToday());
      const [mitarbeiter, lehrlinge, termineHeute] = await Promise.all([
        ApiService.get('/mitarbeiter'),
        ApiService.get('/lehrlinge'),
        ApiService.get(`/termine?datum=${heute}`)
      ]);

      // Filtere aktive Mitarbeiter und Lehrlinge
      const aktiveMitarbeiter = mitarbeiter.filter(m => m.aktiv === 1);
      const aktiveLehrlinge = lehrlinge.filter(l => l.aktiv === 1);

      // Filtere relevante Termine
      const relevanteTermine = termineHeute.filter(t => 
        t.arbeit !== 'Fahrzeug aus Import' && 
        t.arbeit !== 'Fahrzeug hinzugefügt'
      );

      // Render Mitarbeiter-Kacheln
      if (mitarbeiterContainer) {
        mitarbeiterContainer.innerHTML = aktiveMitarbeiter.map(m => 
          this.renderInternPersonKachel(m, relevanteTermine, 'mitarbeiter')
        ).join('');
      }

      // Render Lehrlinge-Kacheln
      if (lehrlingeContainer) {
        if (aktiveLehrlinge.length > 0) {
          if (keineLehrlingeEl) keineLehrlingeEl.style.display = 'none';
          lehrlingeContainer.innerHTML = aktiveLehrlinge.map(l => 
            this.renderInternPersonKachel(l, relevanteTermine, 'lehrling')
          ).join('');
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
  }

  /**
   * Prüft ob ein Termin einer Person zugeordnet ist
   * Berücksichtigt sowohl direkte ID als auch arbeitszeiten_details
   */
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
            } else {
              if (entry.mitarbeiter_id == personId) return true;
            }
          }
        }
      } catch (e) {
        // JSON Parse Fehler ignorieren
      }
    }

    return false;
  }

  /**
   * Rendert eine Kachel für einen Mitarbeiter oder Lehrling
   */
  renderInternPersonKachel(person, alleTermine, typ = 'mitarbeiter') {
    const personId = person.id;
    const personName = person.name;
    const isLehrling = typ === 'lehrling';

    // Finde Termine für diese Person (inkl. arbeitszeiten_details)
    const personTermine = alleTermine.filter(t =>
      this.isTerminFuerPerson(t, personId, isLehrling)
    );

    // Sortiere nach Zeit
    personTermine.sort((a, b) => {
      const zeitA = a.startzeit || a.bring_zeit || '23:59';
      const zeitB = b.startzeit || b.bring_zeit || '23:59';
      return zeitA.localeCompare(zeitB);
    });

    // Aktuelle Uhrzeit für Zeitvergleiche
    const jetzt = new Date();
    const jetztZeit = `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`;

    // Finde aktuellen Auftrag:
    // 1. Explizit "in_arbeit" Status ODER
    // 2. Termin der gerade laufen sollte (startzeit <= jetzt < endzeit)
    let aktuellerAuftrag = personTermine.find(t => t.status === 'in_arbeit');

    if (!aktuellerAuftrag) {
      // Prüfe ob ein Termin gerade laufen sollte (basierend auf Zeit)
      aktuellerAuftrag = personTermine.find(t => {
        if (t.status === 'abgeschlossen' || t.status === 'storniert') return false;

        const startzeit = t.startzeit || t.bring_zeit;
        if (!startzeit) return false;

        // Berechne Endzeit
        const dauer = t.tatsaechliche_zeit || t.geschaetzte_zeit || 60;
        const [h, m] = startzeit.split(':').map(Number);
        const endMinuten = h * 60 + m + dauer;
        const endzeit = `${String(Math.floor(endMinuten / 60)).padStart(2, '0')}:${String(endMinuten % 60).padStart(2, '0')}`;

        // Prüfe ob jetzt zwischen Start und Ende liegt
        return startzeit <= jetztZeit && jetztZeit < endzeit;
      });
    }

    // Finde nächsten Auftrag (noch nicht gestartet)
    const naechsterAuftrag = personTermine.find(t => {
      if (t === aktuellerAuftrag) return false;
      if (t.status === 'abgeschlossen' || t.status === 'storniert') return false;

      const startzeit = t.startzeit || t.bring_zeit;
      // Nächster Auftrag: entweder keine Startzeit oder Startzeit in der Zukunft
      return !startzeit || startzeit > jetztZeit;
    });

    // Prüfe ob Lehrling in Berufsschule ist
    let inBerufsschule = false;
    if (isLehrling && person.berufsschul_wochen) {
      const schulCheck = this.isLehrlingInBerufsschule(person, this.getToday());
      inBerufsschule = schulCheck.inSchule;
    }

    // Status Badge bestimmen
    let badgeClass = 'frei';
    let badgeText = 'Frei';
    if (inBerufsschule) {
      badgeClass = 'pause';
      badgeText = 'Berufsschule';
    } else if (aktuellerAuftrag) {
      badgeClass = 'in-arbeit';
      badgeText = 'In Arbeit';
    }

    // Body Content
    let bodyContent = '';
    
    if (inBerufsschule) {
      bodyContent = `
        <div class="intern-person-schule">
          <div class="schule-icon">📚</div>
          <div class="schule-text">Heute in der Berufsschule</div>
        </div>
      `;
    } else if (aktuellerAuftrag) {
      // Berechne Fortschritt
      const fortschritt = this.berechneAuftragFortschritt(aktuellerAuftrag);
      const restzeit = this.berechneRestzeit(aktuellerAuftrag);
      const isUeberzogen = fortschritt > 100;

      bodyContent = `
        <div class="intern-person-auftrag">
          <div class="auftrag-label">🔧 Aktueller Auftrag</div>
          <div class="auftrag-nr">${aktuellerAuftrag.termin_nr || '-'}</div>
          <div class="auftrag-kunde">${this.escapeHtml(aktuellerAuftrag.kunde_name || '-')}</div>
          <div class="auftrag-kennzeichen">${this.escapeHtml(aktuellerAuftrag.kennzeichen || '-')}</div>
          <div class="auftrag-arbeit">${this.escapeHtml(aktuellerAuftrag.arbeit || '-')}</div>
        </div>
        
        <div class="intern-person-zeit">
          <div class="intern-person-zeit-item">
            <div class="zeit-label">Beginn</div>
            <div class="zeit-value">${aktuellerAuftrag.startzeit || aktuellerAuftrag.bring_zeit || '--:--'}</div>
          </div>
          <div class="intern-person-zeit-item">
            <div class="zeit-label">Fertig ca.</div>
            <div class="zeit-value">${this.berechneEndzeit(aktuellerAuftrag)}</div>
          </div>
          <div class="intern-person-zeit-item">
            <div class="zeit-label">Rest</div>
            <div class="zeit-value" style="color: ${isUeberzogen ? '#dc3545' : 'var(--accent)'}">${restzeit}</div>
          </div>
        </div>
        
        <div class="intern-person-fortschritt">
          <div class="intern-person-fortschritt-bar">
            <div class="intern-person-fortschritt-fill ${isUeberzogen ? 'ueberzogen' : ''}" 
                 style="width: ${Math.min(fortschritt, 100)}%"></div>
          </div>
          <div class="intern-person-fortschritt-text">
            <span>Fortschritt</span>
            <span>${Math.min(fortschritt, 150)}%</span>
          </div>
        </div>
        
        ${naechsterAuftrag ? `
          <div class="intern-person-naechster">
            <div class="naechster-label">📋 Danach:</div>
            <div class="naechster-info">
              <span class="naechster-kunde">${this.escapeHtml(naechsterAuftrag.kunde_name || '-')} • ${this.escapeHtml(naechsterAuftrag.kennzeichen || '-')}</span>
              <span class="naechster-zeit">${naechsterAuftrag.startzeit || naechsterAuftrag.bring_zeit || '--:--'}</span>
            </div>
          </div>
        ` : ''}
      `;
    } else if (naechsterAuftrag) {
      // Kein aktueller Auftrag, aber nächster geplant
      bodyContent = `
        <div class="intern-person-leer">
          <div class="leer-icon">☕</div>
          <div class="leer-text">Aktuell kein Auftrag</div>
        </div>
        
        <div class="intern-person-naechster">
          <div class="naechster-label">⏰ Nächster Auftrag:</div>
          <div class="intern-person-auftrag" style="border-left-color: #28a745;">
            <div class="auftrag-nr">${naechsterAuftrag.termin_nr || '-'}</div>
            <div class="auftrag-kunde">${this.escapeHtml(naechsterAuftrag.kunde_name || '-')}</div>
            <div class="auftrag-kennzeichen">${this.escapeHtml(naechsterAuftrag.kennzeichen || '-')}</div>
            <div class="auftrag-arbeit">${this.escapeHtml(naechsterAuftrag.arbeit || '-')}</div>
          </div>
          <div class="intern-person-zeit" style="margin-top: 10px;">
            <div class="intern-person-zeit-item">
              <div class="zeit-label">Start</div>
              <div class="zeit-value">${naechsterAuftrag.startzeit || naechsterAuftrag.bring_zeit || '--:--'}</div>
            </div>
            <div class="intern-person-zeit-item">
              <div class="zeit-label">Dauer</div>
              <div class="zeit-value">${this.formatMinutesToHours(naechsterAuftrag.geschaetzte_zeit || 0)}</div>
            </div>
            <div class="intern-person-zeit-item">
              <div class="zeit-label">Wartezeit</div>
              <div class="zeit-value">${this.berechneWartezeitBis(naechsterAuftrag)}</div>
            </div>
          </div>
        </div>
      `;
    } else {
      // Keine Aufträge heute
      bodyContent = `
        <div class="intern-person-leer">
          <div class="leer-icon">🎉</div>
          <div class="leer-text">Keine Aufträge für heute</div>
        </div>
      `;
    }

    return `
      <div class="intern-person-kachel ${isLehrling ? 'lehrling' : ''}">
        <div class="intern-person-header">
          <div class="intern-person-name">
            <span class="person-icon">${isLehrling ? '🎓' : '👷'}</span>
            <span>${this.escapeHtml(personName)}</span>
          </div>
          <div class="intern-person-badge ${badgeClass}">${badgeText}</div>
        </div>
        <div class="intern-person-body">
          ${bodyContent}
        </div>
      </div>
    `;
  }

  /**
   * Berechnet den Fortschritt basierend auf der verstrichenen Zeit
   */
  berechneAuftragFortschritt(termin) {
    if (!termin.startzeit && !termin.bring_zeit) return 0;
    
    const startzeit = termin.startzeit || termin.bring_zeit;
    const geschaetzteZeit = termin.geschaetzte_zeit || 60; // Default 60 Min
    
    const jetzt = this.getToday();
    const [stunden, minuten] = startzeit.split(':').map(Number);
    const startDate = new Date(jetzt);
    startDate.setHours(stunden, minuten, 0, 0);
    
    const verstricheneMinuten = (jetzt - startDate) / 1000 / 60;
    const fortschritt = (verstricheneMinuten / geschaetzteZeit) * 100;
    
    return Math.round(Math.max(0, fortschritt));
  }

  /**
   * Berechnet die verbleibende Zeit
   */
  berechneRestzeit(termin) {
    const startzeit = termin.startzeit || termin.bring_zeit;
    if (!startzeit) return '--:--';
    
    const geschaetzteZeit = termin.geschaetzte_zeit || 60;
    
    const jetzt = this.getToday();
    const [stunden, minuten] = startzeit.split(':').map(Number);
    const startDate = new Date(jetzt);
    startDate.setHours(stunden, minuten, 0, 0);
    
    const verstricheneMinuten = (jetzt - startDate) / 1000 / 60;
    const restMinuten = geschaetzteZeit - verstricheneMinuten;
    
    if (restMinuten <= 0) {
      const ueberzogen = Math.abs(Math.round(restMinuten));
      return `+${this.formatMinutesToHours(ueberzogen)}`;
    }
    
    return `~${this.formatMinutesToHours(Math.round(restMinuten))}`;
  }

  /**
   * Berechnet die geplante Endzeit
   */
  berechneEndzeit(termin) {
    const startzeit = termin.startzeit || termin.bring_zeit;
    if (!startzeit) return '--:--';
    
    const geschaetzteZeit = termin.geschaetzte_zeit || 60;
    const [stunden, minuten] = startzeit.split(':').map(Number);
    
    const endMinuten = stunden * 60 + minuten + geschaetzteZeit;
    const endStunden = Math.floor(endMinuten / 60);
    const endMin = endMinuten % 60;
    
    return `${String(endStunden).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
  }

  /**
   * Berechnet die Wartezeit bis zu einem Termin
   */
  berechneWartezeitBis(termin) {
    const zeit = termin.startzeit || termin.bring_zeit;
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
  }

  /**
   * Öffnet Termin-Details vom Intern-Tab aus
   */
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
  }

  /**
   * Lädt alle internen Termine und zeigt sie in einer Liste
   */
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
  }

  /**
   * Rendert eine Kachel für einen internen Termin
   */
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
  }

  /**
   * Öffnet den Bearbeitungsdialog für einen internen Termin (im Modal)
   */
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
  }

  /**
   * Lädt Mitarbeiter/Lehrlinge für das Edit-Select
   */
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
  }

  /**
   * Schließt das Bearbeiten-Modal
   */
  closeInternTerminBearbeitenModal() {
    const modal = document.getElementById('internTerminBearbeitenModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Speichert die Änderungen am internen Termin
   */
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
      this.loadInternTab();
      this.loadDashboard();
    } catch (error) {
      console.error('Fehler beim Aktualisieren:', error);
      alert('Fehler beim Aktualisieren: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  /**
   * Löscht den internen Termin aus dem Modal
   */
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
      this.loadInternTab();
      this.loadDashboard();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen: ' + (error.message || 'Unbekannter Fehler'));
    }
  }

  /**
   * Lädt interne Termine für die Liste im Sub-Tab
   */
  async loadInterneTermineImSubTab() {
    const container = document.getElementById('interneTermineSubTabListe');
    const keineEl = document.getElementById('interneTermineSubTabKeine');
    
    if (!container) return;

    try {
      const alleTermine = await ApiService.get('/termine');
      
      // Filtere nur interne Termine
      const interneTermine = alleTermine.filter(t => 
        t.kunde_name === 'Intern' || 
        t.abholung_details === 'Interner Termin' ||
        t.kennzeichen === 'INTERN'
      );

      // Sortiere: Offene zuerst, dann nach Datum
      interneTermine.sort((a, b) => {
        if (a.status === 'abgeschlossen' && b.status !== 'abgeschlossen') return 1;
        if (a.status !== 'abgeschlossen' && b.status === 'abgeschlossen') return -1;
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
  }

  // === ENDE INTERN TAB METHODEN ===

  // ============================================================
  // === FUZZY SEARCH FUNKTIONEN (Performance-Optimierung) ===
  // ============================================================

  /**
   * Levenshtein-Distanz Algorithmus
   * Berechnet die minimale Anzahl von Änderungen (Einfügen, Löschen, Ersetzen),
   * um String a in String b umzuwandeln.
   * @param {string} a - Erster String
   * @param {string} b - Zweiter String
   * @returns {number} Levenshtein-Distanz
   */
  levenshteinDistance(a, b) {
    if (!a || !b) return Math.max((a || '').length, (b || '').length);

    const aLen = a.length;
    const bLen = b.length;

    // Schnelle Rückgabe bei leeren Strings
    if (aLen === 0) return bLen;
    if (bLen === 0) return aLen;

    // Optimierung: Nur zwei Zeilen der Matrix speichern
    let prevRow = new Array(bLen + 1);
    let currRow = new Array(bLen + 1);

    // Erste Zeile initialisieren
    for (let j = 0; j <= bLen; j++) {
      prevRow[j] = j;
    }

    for (let i = 1; i <= aLen; i++) {
      currRow[0] = i;

      for (let j = 1; j <= bLen; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        currRow[j] = Math.min(
          prevRow[j] + 1,      // Löschen
          currRow[j - 1] + 1,  // Einfügen
          prevRow[j - 1] + cost // Ersetzen
        );
      }

      // Zeilen tauschen
      [prevRow, currRow] = [currRow, prevRow];
    }

    return prevRow[bLen];
  }

  /**
   * Normalisiert einen String für Fuzzy-Suche
   * - Konvertiert zu Kleinbuchstaben
   * - Ersetzt Umlaute (ä→ae, ö→oe, ü→ue, ß→ss)
   * - Entfernt Sonderzeichen
   * - Entfernt mehrfache Leerzeichen
   * @param {string} str - Zu normalisierender String
   * @returns {string} Normalisierter String
   */
  normalizeForSearch(str) {
    if (!str) return '';

    return str
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Berechnet einen Ähnlichkeits-Score (0-100) zwischen Suchbegriff und Zieltext
   * @param {string} search - Suchbegriff
   * @param {string} target - Zieltext
   * @returns {number} Score zwischen 0 (keine Übereinstimmung) und 100 (exakt)
   */
  calculateFuzzyScore(search, target) {
    if (!search || !target) return 0;

    const normalizedSearch = this.normalizeForSearch(search);
    const normalizedTarget = this.normalizeForSearch(target);

    return this.calculateFuzzyScoreNormalized(normalizedSearch, normalizedTarget);
  }

  calculateFuzzyScoreNormalized(normalizedSearch, normalizedTarget) {
    if (!normalizedSearch || !normalizedTarget) return 0;

    // Exakte Übereinstimmung
    if (normalizedSearch === normalizedTarget) return 100;

    // Enthält den Suchbegriff
    if (normalizedTarget.includes(normalizedSearch)) {
      // Höherer Score wenn am Anfang
      if (normalizedTarget.startsWith(normalizedSearch)) return 95;
      return 85;
    }

    // Wort-Anfangs-Match (z.B. "mei" findet "Meier")
    const words = normalizedTarget.split(' ');
    for (const word of words) {
      if (word.startsWith(normalizedSearch)) return 90;
    }

    // Levenshtein-basierter Score
    const distance = this.levenshteinDistance(normalizedSearch, normalizedTarget);
    const maxLen = Math.max(normalizedSearch.length, normalizedTarget.length);

    // Score berechnen: Je geringer die Distanz, desto höher der Score
    const similarity = 1 - (distance / maxLen);
    const score = Math.round(similarity * 70); // Max 70 für Levenshtein-Match

    // Mindest-Score-Schwelle
    return score > 20 ? score : 0;
  }

  /**
   * Fuzzy-Suche über mehrere Felder eines Kunden
   * @param {string} searchTerm - Suchbegriff
   * @param {Object} kunde - Kundenobjekt
   * @returns {Object} { match: boolean, score: number, matchedField: string }
   */
  fuzzySearchKunde(searchTerm, kunde) {
    if (!searchTerm || !kunde) return { match: false, score: 0, matchedField: null };

    const fields = [
      { name: 'name', value: kunde.name, weight: 1.0 },
      { name: 'telefon', value: kunde.telefon, weight: 0.9 },
      { name: 'kennzeichen', value: kunde.kennzeichen, weight: 0.9 },
      { name: 'email', value: kunde.email, weight: 0.7 },
      { name: 'fahrzeug', value: kunde.fahrzeug, weight: 0.6 }
    ];

    let bestScore = 0;
    let matchedField = null;

    for (const field of fields) {
      if (!field.value) continue;

      const score = this.calculateFuzzyScore(searchTerm, field.value) * field.weight;
      if (score > bestScore) {
        bestScore = score;
        matchedField = field.name;
      }
    }

    return {
      match: bestScore >= 30, // Mindest-Score für Treffer
      score: Math.round(bestScore),
      matchedField
    };
  }

  fuzzySearchKundeFromIndex(normalizedSearch, kundeIndex) {
    if (!normalizedSearch || !kundeIndex) {
      return { match: false, score: 0, matchedField: null };
    }

    const fields = [
      { name: 'name', value: kundeIndex.normalizedName, weight: 1.0 },
      { name: 'telefon', value: kundeIndex.normalizedTelefon, weight: 0.9 },
      { name: 'kennzeichen', value: kundeIndex.normalizedKennzeichen, weight: 0.9 },
      { name: 'email', value: kundeIndex.normalizedEmail, weight: 0.7 },
      { name: 'fahrzeug', value: kundeIndex.normalizedFahrzeug, weight: 0.6 }
    ];

    let bestScore = 0;
    let matchedField = null;

    for (const field of fields) {
      if (!field.value) continue;

      const score = this.calculateFuzzyScoreNormalized(normalizedSearch, field.value) * field.weight;
      if (score > bestScore) {
        bestScore = score;
        matchedField = field.name;
      }
    }

    return {
      match: bestScore >= 30,
      score: Math.round(bestScore),
      matchedField
    };
  }

  /**
   * Führt eine Fuzzy-Suche über alle Kunden durch
   * @param {string} searchTerm - Suchbegriff
   * @param {number} limit - Maximale Anzahl der Ergebnisse (Standard: 10)
   * @returns {Array} Sortierte Liste von { kunde, score, matchedField }
   */
  fuzzySearchKunden(searchTerm, limit = 10) {
    if (!searchTerm || searchTerm.length < 2) return [];

    const normalizedSearch = this.normalizeForSearch(searchTerm);
    if (!normalizedSearch) return [];

    const results = [];
    const kunden = this.kundenCache || [];

    if (!this.fuzzySearchIndex || this.fuzzySearchIndex.length !== kunden.length) {
      this.buildFuzzySearchIndex();
    }

    if (this.fuzzySearchIndex && this.fuzzySearchIndex.length === kunden.length) {
      for (const kundeIndex of this.fuzzySearchIndex) {
        const result = this.fuzzySearchKundeFromIndex(normalizedSearch, kundeIndex);
        if (result.match) {
          results.push({
            kunde: kundeIndex.original,
            score: result.score,
            matchedField: result.matchedField
          });
        }
      }
    } else {
      for (const kunde of kunden) {
        const result = this.fuzzySearchKunde(searchTerm, kunde);
        if (result.match) {
          results.push({
            kunde,
            score: result.score,
            matchedField: result.matchedField
          });
        }
      }
    }

    // Nach Score absteigend sortieren
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * Rendert Fuzzy-Search-Ergebnisse mit Score-Anzeige
   * @param {Array} results - Ergebnisse von fuzzySearchKunden
   * @param {HTMLElement} container - Container für die Ergebnisse
   */
  renderFuzzySearchResults(results, container) {
    if (!container) return;

    if (!results || results.length === 0) {
      container.innerHTML = '<div class="fuzzy-no-results">Keine passenden Kunden gefunden</div>';
      container.style.display = 'block';
      return;
    }

    container.innerHTML = results.map(result => {
      const kunde = result.kunde;
      const scoreClass = result.score >= 80 ? 'high' : result.score >= 50 ? 'medium' : 'low';
      const fieldLabel = {
        name: 'Name',
        telefon: 'Telefon',
        kennzeichen: 'Kennzeichen',
        email: 'E-Mail',
        fahrzeug: 'Fahrzeug'
      }[result.matchedField] || result.matchedField;

      return `
        <div class="fuzzy-result-item" data-kunde-id="${kunde.id}">
          <div class="fuzzy-result-main">
            <span class="fuzzy-kunde-name">${this.escapeHtml(kunde.name || 'Unbekannt')}</span>
            ${kunde.kennzeichen ? `<span class="fuzzy-kunde-kz">${this.escapeHtml(kunde.kennzeichen)}</span>` : ''}
          </div>
          <div class="fuzzy-result-details">
            ${kunde.telefon ? `<span class="fuzzy-detail">📞 ${this.escapeHtml(kunde.telefon)}</span>` : ''}
            ${kunde.fahrzeug ? `<span class="fuzzy-detail">🚗 ${this.escapeHtml(kunde.fahrzeug)}</span>` : ''}
          </div>
          <div class="fuzzy-result-score">
            <span class="fuzzy-score-badge ${scoreClass}">${result.score}%</span>
            <span class="fuzzy-match-field">${fieldLabel}</span>
          </div>
        </div>
      `;
    }).join('');

    container.style.display = 'block';
  }

  /**
   * Filtert die Kundenliste mit Fuzzy-Search
   * Wird von filterKundenListe aufgerufen
   */
  filterKundenListeFuzzy() {
    const sucheInput = document.getElementById('kundenListeSuche');
    const suchBegriff = sucheInput ? sucheInput.value.trim() : '';

    if (suchBegriff.length < 2) {
      // Bei zu kurzem Suchbegriff: Alle anzeigen
      this.renderKundenListe(this.kundenCache, '');
      return;
    }

    // Fuzzy-Suche durchführen
    const results = this.fuzzySearchKunden(suchBegriff, 100);

    // Gefundene Kunden extrahieren
    const gefundeneKunden = results.map(r => r.kunde);

    // Liste rendern mit Score-Info
    this.renderKundenListeMitScore(results);
  }

  /**
   * Rendert die Kundenliste mit Fuzzy-Score-Anzeige
   * @param {Array} results - Ergebnisse von fuzzySearchKunden
   */
  renderKundenListeMitScore(results) {
    const tbody = document.getElementById('kundenTable')?.getElementsByTagName('tbody')[0];
    if (!tbody) return;

    // Update Badge
    const badge = document.getElementById('kundenAnzahlBadge');
    if (badge) {
      badge.textContent = results.length;
    }

    // Clear-Button anzeigen
    const clearBtn = document.getElementById('kundenSucheClearBtn');
    if (clearBtn) {
      clearBtn.style.display = results.length > 0 ? 'block' : 'none';
    }

    tbody.innerHTML = '';

    if (results.length === 0) {
      const row = tbody.insertRow();
      const cell = row.insertCell(0);
      cell.colSpan = 6;
      cell.style.textAlign = 'center';
      cell.style.padding = '20px';
      cell.innerHTML = '<span style="color: #666;">Keine Kunden gefunden</span>';
      return;
    }

    results.forEach(result => {
      const kunde = result.kunde;
      const row = tbody.insertRow();
      row.dataset.kundeId = kunde.id;

      // Score-Badge für die erste Spalte
      const scoreClass = result.score >= 80 ? 'high' : result.score >= 50 ? 'medium' : 'low';

      row.insertCell(0).innerHTML = `
        <span class="fuzzy-inline-score ${scoreClass}" title="Übereinstimmung: ${result.score}%">
          ${this.escapeHtml(kunde.name || '-')}
        </span>
      `;
      row.insertCell(1).textContent = kunde.telefon || '-';
      row.insertCell(2).textContent = kunde.email || '-';
      row.insertCell(3).textContent = kunde.kennzeichen || '-';
      row.insertCell(4).textContent = kunde.fahrzeug || '-';

      // Aktionen
      const actionsCell = row.insertCell(5);
      actionsCell.innerHTML = `
        <button onclick="app.openKundeDetails(${kunde.id})" class="action-btn">Details</button>
        <button onclick="app.navigateToNeuerTerminMitKunde(${kunde.id})" class="action-btn">Neuer Termin</button>
      `;
    });
  }

  /**
   * Baut den Fuzzy-Search-Index für schnellere Suche auf
   * Wird einmal nach dem Laden der Kunden aufgerufen
   */
  buildFuzzySearchIndex() {
    if (!this.kundenCache || this.kundenCache.length === 0) {
      this.fuzzySearchIndex = null;
      return;
    }

    // Index mit normalisierten Werten erstellen
    this.fuzzySearchIndex = this.kundenCache.map(kunde => ({
      id: kunde.id,
      normalizedName: this.normalizeForSearch(kunde.name),
      normalizedTelefon: this.normalizeForSearch(kunde.telefon),
      normalizedKennzeichen: this.normalizeForSearch(kunde.kennzeichen),
      normalizedEmail: this.normalizeForSearch(kunde.email),
      normalizedFahrzeug: this.normalizeForSearch(kunde.fahrzeug),
      original: kunde
    }));

    console.log(`[Fuzzy-Index] ${this.fuzzySearchIndex.length} Kunden indexiert`);
  }

  // === ENDE FUZZY SEARCH FUNKTIONEN ===
}


const app = new App();
// App global verfügbar machen für onclick-Handler und Vite-Kompatibilität
window.App = App;
window.app = app;

// Globale Funktion für Sub-Tab-Wechsel (Fallback für onclick)
window.switchSubTab = function(tabName) {
  const allTabs = ['neuerTermin', 'terminBearbeiten', 'internerTermin', 'wartendeAktionen'];
  
  // Alle Sub-Tabs verstecken
  allTabs.forEach(name => {
    const el = document.getElementById(name);
    if (el) {
      el.classList.remove('active');
      el.style.display = 'none';
    }
  });
  
  // Alle Buttons deaktivieren
  document.querySelectorAll('#termine .sub-tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Gewählten Tab anzeigen
  const targetTab = document.getElementById(tabName);
  if (targetTab) {
    targetTab.classList.add('active');
    targetTab.style.display = 'block';
    targetTab.style.visibility = 'visible';
    targetTab.style.opacity = '1';
  }
  
  // Button aktivieren
  const btn = document.querySelector(`#termine .sub-tab-button[data-subtab="${tabName}"]`);
  if (btn) {
    btn.classList.add('active');
  }
  
  // Spezifische Aktionen je nach Tab
  if (tabName === 'terminBearbeiten' && window.app) {
    const datumInput = document.getElementById('editTerminDatum');
    if (datumInput && !datumInput.value) {
      datumInput.value = window.app.formatDateLocal(new Date());
    }
    setTimeout(() => {
      window.app.renderEditSuchKalender();
      window.app.updateEditSuchDatumDisplay();
      window.app.loadEditTermine();
    }, 50);
  }
  
  if (tabName === 'internerTermin' && window.app) {
    window.app.setInternerTerminTodayDate();
    window.app.loadInternerTerminMitarbeiter();
    window.app.loadInterneTermineImSubTab(); // Lade Liste der internen Termine
  }
  
  if (tabName === 'wartendeAktionen' && window.app) {
    window.app.loadWartendeAktionen();
  }
};
