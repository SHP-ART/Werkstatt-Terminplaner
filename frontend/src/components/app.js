import {
  berechneEndzeit,
  formatDateLocal,
  formatDateGerman,
  formatMinutesToHours,
  getKalenderwoche,
  getToday,
  naechsterArbeitstag
} from '../shared/formatters.js';
import {
  bindEventListenerOnce,
  escapeHtml,
  escapeSelector,
  setTextIfExists
} from '../shared/dom.js';
import { showToast } from '../shared/notifications.js';
import { normalizeKennzeichen, parseKennzeichen } from '../shared/licensePlate.js';
import { installServerInfoFeature } from '../features/serverInfo/serverInfoFeature.js';
import { installRealtimeFeature } from '../features/realtime/realtimeFeature.js';
import { installAuslastungFeature } from '../features/auslastung/auslastungFeature.js';
import { installTerminDetailsFeature } from '../features/termine/terminDetailsFeature.js';
import { installTerminFormFeature } from '../features/termine/terminFormFeature.js';
import { installPlanungFeature } from '../features/planung/planungFeature.js';
import { installDragDropFeature } from '../features/planung/dragDropFeature.js';
import { installShiftTemplatesFeature } from '../features/shiftTemplates/shiftTemplatesFeature.js';
import { installStaffFeature } from '../features/staff/staffFeature.js';
import { installWorkSchedulesFeature } from '../features/workSchedules/workSchedulesFeature.js';
import { installAbsenceFeature } from '../features/absence/absenceFeature.js';
import { installReplacementCarsFeature } from '../features/replacementCars/replacementCarsFeature.js';
import { installTodayFeature } from '../features/today/todayFeature.js';
import { installDashboardFeature } from '../features/dashboard/dashboardFeature.js';
import { installTabletFeature } from '../features/tablet/tabletFeature.js';
import { installSettingsKiFeature } from '../features/settings/settingsKiFeature.js';
import { installTimeTrackingFeature } from '../features/timeTracking/timeTrackingFeature.js';
import { installSearchFeature } from '../features/search/searchFeature.js';
import { installCustomersFeature } from '../features/customers/customersFeature.js';
import { installBackupFeature } from '../features/backup/backupFeature.js';
import { installCalendarFeature } from '../features/calendar/calendarFeature.js';
import { installPartsFeature } from '../features/parts/partsFeature.js';

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
    this.schnellKalenderInitialized = false;
    
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
    this._zeitState = null;
    this._editZeitState = null;
    
    // Test-Datum Override: Setze auf null für echtes Datum, oder z.B. '2026-01-04' für Tests
    // Kann auch über Browser-Konsole gesetzt werden: app.testDatum = '2026-01-05'
    this.testDatum = null; // null = echtes Systemdatum verwenden
    
    // Planungs-Drag&Drop: Lokaler Änderungspuffer
    this.planungAenderungen = new Map(); // terminId -> { startzeit, mitarbeiter_id, lehrling_id, type, originalData }
    this.planungRaster = 15; // Standard-Raster: 15 Minuten (muss mit HTML-Select übereinstimmen)
    this.weitereTermineFilter = 7; // Filter für "Weitere" Termine (1, 2, 3 oder 7 Tage)

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
    this.kiSuggestTimeout = null;
    this.kiSuggestLastText = '';
    this.kiSuggestEnabled = true;

    this.init();
  }

  // Gibt das aktuelle "Heute"-Datum zurück (für Tests überschreibbar)
  getToday() {
    if (this.testDatum) {
      return new Date(this.testDatum + 'T12:00:00');
    }
    return getToday();
  }

  // Hilfsfunktion: Datum lokal formatieren (YYYY-MM-DD) ohne Zeitzonenkonvertierung
  formatDateLocal(date) {
    return formatDateLocal(date);
  }

  // Hilfsfunktion: Kalenderwoche berechnen (ISO 8601)
  getKalenderwoche(date) {
    return getKalenderwoche(date);
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
    return showToast(message, type);
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
    this.setupKeyboardShortcuts();
    this.setupGlobaleSuche();
    setTimeout(() => this.setupBatchDelegation(), 500);
    
    // Sicherstellen, dass Abholdetails beim initialen Laden angezeigt werden
    // Timeout, um sicherzustellen, dass DOM vollständig geladen ist
    setTimeout(() => {
      this.toggleAbholungDetails();
    }, 100);
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
    return escapeSelector(value);
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
    return bindEventListenerOnce(element, event, handler, key);
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

  // Lädt und zeigt die Server-Version und den Server-Typ im Header an

  // Server-Auslastung Widget anzeigen und Polling starten

  // === Server/Info Tab in Einstellungen ===




  _setTextIfExists(id, text) {
    return setTextIfExists(id, text);
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
    this.bindEventListenerOnce(document.getElementById('schnellerTerminForm'), 'submit', (e) => this.handleSchnellerTerminSubmit(e), 'SchnellerTerminFormSubmit');
    this.bindEventListenerOnce(document.getElementById('kundenForm'), 'submit', (e) => this.handleKundenSubmit(e), 'KundenFormSubmit');
    this.bindEventListenerOnce(document.getElementById('zeitAnpassungForm'), 'submit', (e) => this.handleZeitAnpassungSubmit(e), 'ZeitAnpassungFormSubmit');
    this.bindEventListenerOnce(document.getElementById('serverConfigForm'), 'submit', (e) => this.handleServerConfigSubmit(e), 'ServerConfigFormSubmit');
    this.bindEventListenerOnce(document.getElementById('werkstattSettingsForm'), 'submit', (e) => this.handleWerkstattSettingsSubmit(e), 'WerkstattSettingsFormSubmit');
    this.bindEventListenerOnce(document.getElementById('schichtTemplateForm'), 'submit', (e) => this.handleSchichtTemplateSubmit(e), 'SchichtTemplateFormSubmit');
    this.bindEventListenerOnce(document.getElementById('schichtFormCancel'), 'click', () => this.cancelSchichtTemplateEdit(), 'SchichtFormCancel');

    // Tablet-Steuerung Event-Listener
    this.bindEventListenerOnce(document.getElementById('tabletDisplayForm'), 'submit', (e) => this.handleTabletDisplaySubmit(e), 'TabletDisplayFormSubmit');
    this.bindEventListenerOnce(document.getElementById('tabletDisplayAutoBtn'), 'click', () => this.setTabletDisplayStatus('auto'), 'TabletDisplayAuto');
    this.bindEventListenerOnce(document.getElementById('tabletDisplayOnBtn'), 'click', () => this.setTabletDisplayStatus('an'), 'TabletDisplayOn');
    this.bindEventListenerOnce(document.getElementById('tabletDisplayOffBtn'), 'click', () => this.setTabletDisplayStatus('aus'), 'TabletDisplayOff');

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

    const externalKiForm = document.getElementById('externalKiForm');
    this.bindEventListenerOnce(externalKiForm, 'submit', (e) => this.handleExternalKiSubmit(e), 'ExternalKiSubmit');
    const testExternalKiBtn = document.getElementById('testExternalKiBtn');
    this.bindEventListenerOnce(testExternalKiBtn, 'click', () => this.checkKIStatus(true), 'TestExternalKi');

    const testOllamaBtn = document.getElementById('testOllamaBtn');
    this.bindEventListenerOnce(testOllamaBtn, 'click', () => this.checkOllamaStatus(true), 'TestOllama');

    const testOllamaPromptBtn = document.getElementById('testOllamaPromptBtn');
    this.bindEventListenerOnce(testOllamaPromptBtn, 'click', () => {
      const box = document.getElementById('ollamaPromptBox');
      if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
    }, 'ToggleOllamaPromptBox');

    const ollamaPromptSendBtn = document.getElementById('ollamaPromptSendBtn');
    this.bindEventListenerOnce(ollamaPromptSendBtn, 'click', () => this.sendOllamaTestPrompt(), 'OllamaPromptSend');

    const ollamaBenchmarkBtn = document.getElementById('ollamaBenchmarkBtn');
    this.bindEventListenerOnce(ollamaBenchmarkBtn, 'click', () => this.runOllamaBenchmark(), 'OllamaBenchmark');

    const saveOllamaModelBtn = document.getElementById('saveOllamaModelBtn');
    this.bindEventListenerOnce(saveOllamaModelBtn, 'click', () => this.saveOllamaModel(), 'SaveOllamaModel');

    // KI-Trainingsdaten Buttons
    const btnExcludeOutliers = document.getElementById('btnExcludeOutliers');
    this.bindEventListenerOnce(btnExcludeOutliers, 'click', () => this.handleExcludeOutliers(), 'ExcludeOutliers');
    const btnRetrainModel = document.getElementById('btnRetrainModel');
    this.bindEventListenerOnce(btnRetrainModel, 'click', () => this.handleRetrainModel(), 'RetrainModel');
    const btnRetrainExternalModel = document.getElementById('btnRetrainExternalModel');
    this.bindEventListenerOnce(btnRetrainExternalModel, 'click', () => this.handleRetrainExternalModel(), 'RetrainExternalModel');
    const btnShowTrainingDetails = document.getElementById('btnShowTrainingDetails');
    this.bindEventListenerOnce(btnShowTrainingDetails, 'click', () => this.toggleTrainingDetails(), 'ShowTrainingDetails');

    const wartendeAktionForm = document.getElementById('wartendeAktionForm');
    this.bindEventListenerOnce(wartendeAktionForm, 'submit', (e) => this.handleWartendeAktionSubmit(e), 'WartendeAktionSubmit');

    this.setupWartendeAktionenKundensuche();

    const ersatzautoForm = document.getElementById('ersatzautoForm');
    this.bindEventListenerOnce(ersatzautoForm, 'submit', (e) => this.handleErsatzautoSubmit(e), 'ErsatzautoSubmit');

    this.bindEventListenerOnce(document.getElementById('urlaubForm'), 'submit', (e) => this.handleUrlaubSubmit(e), 'UrlaubFormSubmit');
    this.bindEventListenerOnce(document.getElementById('krankForm'), 'submit', (e) => this.handleKrankSubmit(e), 'KrankFormSubmit');
    this.bindEventListenerOnce(document.getElementById('lehrgangForm'), 'submit', (e) => this.handleLehrgangSubmit(e), 'LehrgangFormSubmit');
    // berufsschuleForm wurde entfernt - jetzt nur noch Kalenderwoche-Verwaltung

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

    const closeNeuerKundeModal = document.getElementById('closeNeuerKundeModal');
    this.bindEventListenerOnce(closeNeuerKundeModal, 'click', () => this.closeNeuerKundeModal(), 'CloseNeuerKundeModal');
    const nkAbbrechenBtn = document.getElementById('nkAbbrechenBtn');
    this.bindEventListenerOnce(nkAbbrechenBtn, 'click', () => this.closeNeuerKundeModal(), 'NkAbbrechen');
    const nkSpeichernBtn = document.getElementById('nkSpeichernBtn');
    this.bindEventListenerOnce(nkSpeichernBtn, 'click', () => this.saveNeuerKunde(), 'NkSpeichern');

    const neuerKundeModal = document.getElementById('neuerKundeModal');
    this.bindEventListenerOnce(neuerKundeModal, 'click', (e) => {
      if (e.target === neuerKundeModal) this.closeNeuerKundeModal();
    }, 'NeuerKundeModalBackdrop');

    // Kennzeichen-Auto-Advance im Neuer-Kunde-Modal
    const nkKzBezirk = document.getElementById('nkKzBezirk');
    this.bindEventListenerOnce(nkKzBezirk, 'input', (e) => {
      e.target.value = e.target.value.toUpperCase();
      if (e.target.value.length >= 3) document.getElementById('nkKzBuchstaben')?.focus();
    }, 'NkKzBezirkInput');
    const nkKzBuchstaben = document.getElementById('nkKzBuchstaben');
    this.bindEventListenerOnce(nkKzBuchstaben, 'input', (e) => {
      e.target.value = e.target.value.toUpperCase();
      if (e.target.value.length >= 2) document.getElementById('nkKzNummer')?.focus();
    }, 'NkKzBuchstabenInput');
    const nkKzNummer = document.getElementById('nkKzNummer');
    this.bindEventListenerOnce(nkKzNummer, 'input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    }, 'NkKzNummerInput');

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
    this.bindEventListenerOnce(terminNameSuche, 'blur', () => setTimeout(() => this.hideVorschlaege('name'), 500), 'TerminNameSucheBlur');

    // Event-Delegation: Klicks auf Namens-Vorschläge zentral abfangen
    const nameSucheVorschlaege = document.getElementById('nameSucheVorschlaege');
    if (nameSucheVorschlaege) {
      this.bindEventListenerOnce(nameSucheVorschlaege, 'mousedown', (e) => {
        e.preventDefault(); // verhindert Blur auf terminNameSuche
        const item = e.target.closest('[data-kunde-id]');
        if (item) {
          const kundeId = parseInt(item.dataset.kundeId, 10);
          if (!isNaN(kundeId)) this.selectKundeVorschlag(kundeId);
        }
      }, 'NameVorschlaegeDelegate');
    }

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
    // Schnell-Datum + Termin-Datum beim Seitenaufruf immer leeren (Browser-Formularwiederherstellung verhindern)
    const schnellDatumInit = document.getElementById('schnell_datum');
    if (schnellDatumInit) schnellDatumInit.value = '';
    const terminDatumInit = document.getElementById('datum');
    if (terminDatumInit) terminDatumInit.value = '';
    // Anzeige und Kalender nach dem Leeren aktualisieren
    this.updateSelectedDatumDisplay();
    this.updateSchnellDatumDisplay();
    this.renderAuslastungKalender();

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
    
    // Termin-Datum bewusst NICHT vorauswählen – Benutzer muss aktiv wählen
    // (nur Auslastungs- und Abwesenheitsdatum auf heute setzen)

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
          'storniert': '#dc3545',
          'unterbrochen': '#e65100'
        }[termin.status] || '#6c757d';

        // Split-Termine: Zeitkorrektur-Button
        const splitZeitBtn = termin.split_teil === 1 && termin.status === 'unterbrochen'
          ? `<button onclick="app.showTerminDetails(${termin.id})" title="Tats\u00e4chliche Zeit korrigieren" style="border:none;background:#fff3e0;color:#e65100;border-radius:4px;padding:1px 6px;font-size:11px;cursor:pointer;margin-left:6px;">✏️ Zeit</button>`
          : '';
        
        html += `
          <div style="padding: 8px; margin-bottom: 6px; background: #fff; border-radius: 6px; border: 1px solid #dee2e6;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="font-weight: 600; color: #333;">
                ${termin.termin_nr || '-'}
              </div>
              <div style="display: flex; gap: 8px; font-size: 0.85em;">
                <span style="color: ${statusFarbe}; font-weight: 600;">${termin.status || '-'}</span>${splitZeitBtn}
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

    // Datum wiederherstellen (wenn preserveDatum) – sonst leer lassen
    if (savedDatum) {
      document.getElementById('datum').value = savedDatum;
      this.loadTerminAuslastungAnzeige();
    } else {
      // Datum leeren – Benutzer muss bewusst wählen
      const datumInput = document.getElementById('datum');
      if (datumInput) datumInput.value = '';
    }
    this.updateSelectedDatumDisplay();
    const datumFehler = document.getElementById('terminDatumFehler');
    if (datumFehler) datumFehler.style.display = 'none';
    this.setTodayDate(false); // Nur Auslastungs-/Abwesenheitsdatum auf heute

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
      
      // Filter: Keine internen Termine und nicht gelöschte (Schnell-Termine ohne Kennzeichen werden eingeschlossen)
      const filteredTermine = termine.filter(t => 
        t.kennzeichen !== 'INTERN' &&
        t.abholung_details !== 'Interner Termin' &&
        t.kunde_name !== 'Intern' &&
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
                  ${termin.termin_nr || '-'}${termin.kennzeichen ? ' • ' + termin.kennzeichen : ' ⚡ Schnell-Termin'}
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
    const editKennzeichen = document.getElementById('edit_kennzeichen');
    const editKennzeichenPflicht = document.getElementById('edit_kennzeichen_pflicht');
    editKennzeichen.value = termin.kennzeichen || '';
    // Kennzeichen ist nur Pflicht wenn es kein Schnell-Termin (ohne Kennzeichen) ist
    if (termin.kennzeichen) {
      editKennzeichen.setAttribute('required', 'required');
      if (editKennzeichenPflicht) editKennzeichenPflicht.textContent = '*';
    } else {
      editKennzeichen.removeAttribute('required');
      if (editKennzeichenPflicht) editKennzeichenPflicht.textContent = '(optional)';
    }
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
    
    // Manuelles Zeitkorrektur-Feld zurücksetzen und Zeitschätzung neu berechnen
    const editZeitManual = document.getElementById('edit_geschaetzte_zeit');
    if (editZeitManual) editZeitManual.value = '';
    this.updateEditZeitschaetzung();
    
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

    // Delta-Badge zurücksetzen
    const delta = document.getElementById('editZeitschaetzungDelta');
    if (delta) delta.style.display = 'none';
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

  async updateEditZeitschaetzung() {
    const arbeitText = document.getElementById('edit_arbeitEingabe').value.trim();
    const anzeige = document.getElementById('editZeitschaetzungAnzeige');
    const wertEl = document.getElementById('editZeitschaetzungWert');
    const detailsEl = document.getElementById('editZeitschaetzungDetails');
    
    if (!arbeitText || !anzeige || !wertEl) {
      const editAutoInput = document.getElementById('edit_geschaetzte_zeit_auto');
      if (editAutoInput) editAutoInput.value = '0';
      return;
    }
    
    const arbeiten = this.parseArbeiten(arbeitText);
    if (arbeiten.length === 0) {
      anzeige.style.display = 'none';
      const editAutoInput = document.getElementById('edit_geschaetzte_zeit_auto');
      if (editAutoInput) editAutoInput.value = '0';
      return;
    }
    
    // Berechne die Zeiten für jede Arbeit
    let gesamtMinuten = 0;
    const items = [];
    const nichtGefundenEdit = [];
    const gefundenArbeiten = []; // für KI-Vergleich

    arbeiten.forEach(arbeit => {
      // Suche mit Fuzzy-Matching (exakt → Alias → Teilwort/Wort-Überlappung)
      const gefunden = this.findArbeitszeitMitDetails(arbeit);
      if (gefunden) {
        const minuten = gefunden.standard_minuten || 0;
        gesamtMinuten += minuten;
        let hinweis = '';
        if (gefunden.matchTyp === 'alias') hinweis = ` → ${gefunden.bezeichnung}`;
        else if (gefunden.matchTyp === 'fuzzy') hinweis = ` ≈ ${gefunden.bezeichnung}`;
        items.push({ arbeit, minuten, labelHtml: `✓ ${arbeit}${hinweis}: `, manualOverride: false });
        gefundenArbeiten.push({ arbeit, itemIdx: items.length - 1, zeitverwaltungMinuten: minuten, hinweis });
      } else {
        nichtGefundenEdit.push(arbeit);
        items.push({ arbeit, minuten: 0, labelHtml: `⚠️ ${arbeit}: `, noTime: true, manualOverride: false });
      }
    });

    // Speichere Richtzeit-Basis (Zeitverwaltungs-Summe) vor KI-Override
    let richtzeitBasis = gesamtMinuten;

    // 📊 KI-Zeitvorschlag für ALLE Arbeiten (KI = primäre Basis):
    const alleArbeiten = [...gefundenArbeiten.map(g => g.arbeit), ...nichtGefundenEdit];
    if (alleArbeiten.length > 0) {
      try {
        const kiErgebnisse = await Promise.allSettled(
          alleArbeiten.map(a => window.AIService.getZeitVorschlag(a))
        );
        kiErgebnisse.forEach((result, i) => {
          const arbeit = alleArbeiten[i];
          if (result.status !== 'fulfilled' || !result.value?.minuten) return;
          const { minuten, basis, n } = result.value;
          const std = Math.floor(minuten / 60);
          const min = minuten % 60;
          const zeitStr = std > 0 ? `${std} h${min > 0 ? ` ${min} min` : ''}` : `${min} min`;
          const quellLabel = basis === 'historisch' ? `aus ${n} Terminen`
            : basis === 'historisch_ähnlich' ? `ähnl. Arbeit`
            : `Kategorie-Schätzung`;

          const gefundenEintrag = gefundenArbeiten.find(g => g.arbeit === arbeit);
          if (gefundenEintrag) {
            gesamtMinuten -= gefundenEintrag.zeitverwaltungMinuten;
            gesamtMinuten += minuten;
            items[gefundenEintrag.itemIdx].minuten = minuten;
            items[gefundenEintrag.itemIdx].labelHtml = `📊 ${arbeit}${gefundenEintrag.hinweis} <small style="color:#888">(${quellLabel})</small>: `;
          } else {
            gesamtMinuten += minuten;
            richtzeitBasis += minuten;
            const idx = items.findIndex(it => it.noTime && it.arbeit === arbeit);
            if (idx !== -1) {
              items[idx].minuten = minuten;
              items[idx].labelHtml = `📊 ${arbeit} <small style="color:#888">(${quellLabel})</small>: `;
              delete items[idx].noTime;
            }
          }
        });
      } catch (e) { /* KI-Zeitvorschlag nicht kritisch */ }
    }

    // 🧠 Puffer-ML: KI-basierten Puffer abfragen wenn aktiviert
    const pufferMLAktiv = document.getElementById('pufferMLEnabled')?.checked;
    let mlPufferMinuten = 0;
    let pufferHtml = '';
    if (pufferMLAktiv && gesamtMinuten > 0 && arbeitText.length > 2) {
      try {
        const empfehlung = await window.AIService.getPufferEmpfehlung(arbeitText);
        if (empfehlung && empfehlung.puffer_minuten > 0) {
          mlPufferMinuten = empfehlung.puffer_minuten;
          const basis = empfehlung.basis === 'ML' ? '🧠 ML' : '📊 Standard';
          pufferHtml = `<div style="font-size:0.82em;color:#aaa;margin-top:2px;">+ Puffer (${basis}): +${mlPufferMinuten} min</div>`;
        }
      } catch (e) { /* Puffer-Abfrage nicht kritisch */ }
    }

    // Anzeige + State speichern + rendern
    anzeige.style.display = 'block';
    this._editZeitState = { items, mlPufferMinuten, richtzeitBasis, pufferHtml };
    this._renderZeitItems('edit');
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
      // Datum immer leeren – auch wenn gespeicherter State vorhanden
      const terminDatum = document.getElementById('datum');
      if (terminDatum) terminDatum.value = '';
      const schnellDatum = document.getElementById('schnell_datum');
      if (schnellDatum) schnellDatum.value = '';
      this.updateSelectedDatumDisplay();
      this.updateSchnellDatumDisplay();
      this.renderAuslastungKalender();
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
    } else if (tabName === 'zeitstempelung') {
      const datumInput = document.getElementById('zeitstempelungDatum');
      if (datumInput && !datumInput.value) {
        datumInput.value = this.formatDateLocal(this.getToday());
      }
      this.loadZeitstempelung();
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
      this.goToToday(); // Setze automatisch auf "Heute"
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
    } else if (tabName === 'kalender') {
      this.loadKalender();
    }

    if (!isSameTab) {
      this.triggerActiveSubTabLoads(tabName);
      this.restoreTabFields(tabName);
    }
    this.currentTab = tabName;
  }

  handleSubTabActivation(subTabName) {
    if (subTabName === 'kalenderTag') {
      this.loadKalenderTag();
    } else if (subTabName === 'kalenderWoche') {
      this.loadKalenderWoche();
    } else if (subTabName === 'kalenderMonat') {
      this.loadKalenderMonat();
    } else if (subTabName === 'kalenderJahr') {
      this.loadKalenderJahr();
    }

    if (subTabName === 'mitarbeiter') {
      this.loadWerkstattSettings();
      this.loadMitarbeiter();
      this.loadLehrlinge();
      this.loadAbwesenheitenPersonen();
      this.loadUrlaubListe();
      this.loadArbeitszeitenPersonSelect();
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
    }

    if (subTabName === 'lehrgangAbwesenheit') {
      this.loadAbwesenheitenPersonen();
      this.loadLehrgangListe();
    }

    if (subTabName === 'berufsschuleAbwesenheit') {
      console.log('🔄 Sub-Tab berufsschuleAbwesenheit aktiviert');
      this.loadBerufsschulLehrlinge(); // Nur Kalenderwochen-Verwaltung
    }

    if (subTabName === 'settingsBackup') {
      this.loadBackupStatus();
      this.loadBackupList();
    }

    if (subTabName === 'settingsKunden') {
      this.loadKunden();
    }

    if (subTabName === 'settingsSchichten') {
      this.loadSchichtTemplatesAdmin();
    }

    if (subTabName === 'settingsTablet') {
      this.loadTabletEinstellungen();
    }

    if (subTabName === 'settingsServerInfo') {
      this.loadServerInfoTab();
    }

    if (subTabName === 'settingsAutomatisierung') {
      this.loadAutomationSettings();
      this.loadKiLernStatistiken();
    }

    if (subTabName === 'teileStatus') {
      this.loadTeileStatusUebersicht();
    }

    if (subTabName === 'wartendeAktionen') {
      this.loadWartendeAktionen();
    }

    if (subTabName === 'wiederkehrendeTermine') {
      this.loadWiederkehrendeTermine();
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
    // Datum beim Wechsel zu Neuer/Schneller Termin immer leeren
    if (subTabName === 'neuerTermin') {
      const d = document.getElementById('datum');
      if (d) d.value = '';
      this.updateSelectedDatumDisplay();
      this.renderAuslastungKalender();
    }
    if (subTabName === 'schnellerTermin') {
      const sd = document.getElementById('schnell_datum');
      if (sd) sd.value = '';
      this.updateSchnellDatumDisplay();
    }
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





  // Excel Import Handler





  // Kunde bearbeiten

  // Kunde löschen

  // ================================================
  // FAHRZEUGVERWALTUNG
  // ================================================

  // Fahrzeugverwaltung Modal öffnen

  // Fahrzeugliste im Modal laden

  // Fahrzeug aus Modal hinzufügen

  // Fahrzeug aus Modal löschen

  // Fahrzeugverwaltung Modal schließen

  // ================================================
  // NEUER KUNDE MODAL
  // ================================================




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

  async updateZeitschaetzung() {
    const arbeitEingabe = document.getElementById('arbeitEingabe');
    const zeitschaetzungAnzeige = document.getElementById('zeitschaetzungAnzeige');
    const zeitschaetzungWert = document.getElementById('zeitschaetzungWert');
    const zeitschaetzungDetails = document.getElementById('zeitschaetzungDetails');
    
    if (!arbeitEingabe || !zeitschaetzungAnzeige) return;
    
    const eingabe = arbeitEingabe.value.trim();
    
    // Wenn keine Eingabe, verstecke die Anzeige
    if (!eingabe) {
      zeitschaetzungAnzeige.style.display = 'none';
      const autoInput = document.getElementById('geschaetzte_zeit_auto');
      if (autoInput) autoInput.value = '0';
      return;
    }
    
    // Teile die Eingabe in einzelne Arbeiten auf (nach Zeilenumbruch oder Komma)
    const arbeiten = eingabe
      .split(/[\r\n,]+/)
      .map(a => a.trim())
      .filter(a => a.length > 0);
    
    if (arbeiten.length === 0) {
      zeitschaetzungAnzeige.style.display = 'none';
      const autoInput = document.getElementById('geschaetzte_zeit_auto');
      if (autoInput) autoInput.value = '0';
      return;
    }
    
    // Berechne die Zeiten für jede Arbeit
    let gesamtMinuten = 0;
    const items = [];
    const nichtGefunden = [];
    const gefundenArbeiten = []; // für KI-Vergleich

    arbeiten.forEach(arbeit => {
      // Suche mit Fuzzy-Matching (exakt → Alias → Teilwort/Wort-Überlappung)
      const gefunden = this.findArbeitszeitMitDetails(arbeit);

      if (gefunden) {
        const minuten = gefunden.standard_minuten || 0;
        gesamtMinuten += minuten;
        let hinweis = '';
        if (gefunden.matchTyp === 'alias') hinweis = ` → ${gefunden.bezeichnung}`;
        else if (gefunden.matchTyp === 'fuzzy') hinweis = ` ≈ ${gefunden.bezeichnung}`;
        items.push({ arbeit, minuten, labelHtml: `✓ ${arbeit}${hinweis}: `, manualOverride: false });
        gefundenArbeiten.push({ arbeit, itemIdx: items.length - 1, zeitverwaltungMinuten: minuten, hinweis });
      } else {
        nichtGefunden.push(arbeit);
        items.push({ arbeit, minuten: 0, labelHtml: `⚠️ ${arbeit}: `, noTime: true, manualOverride: false });
      }
    });

    // Speichere Richtzeit-Basis (Zeitverwaltungs-Summe) vor KI-Override
    let richtzeitBasis = gesamtMinuten;

    // 📊 KI-Zeitvorschlag für ALLE Arbeiten (KI = primäre Basis):
    const alleArbeiten = [...gefundenArbeiten.map(g => g.arbeit), ...nichtGefunden];
    if (alleArbeiten.length > 0) {
      try {
        const kiErgebnisse = await Promise.allSettled(
          alleArbeiten.map(a => window.AIService.getZeitVorschlag(a))
        );
        kiErgebnisse.forEach((result, i) => {
          const arbeit = alleArbeiten[i];
          if (result.status !== 'fulfilled' || !result.value?.minuten) return;
          const { minuten, basis, n } = result.value;
          const std = Math.floor(minuten / 60);
          const min = minuten % 60;
          const zeitStr = std > 0 ? `${std} h${min > 0 ? ` ${min} min` : ''}` : `${min} min`;
          const quellLabel = basis === 'historisch' ? `aus ${n} Terminen`
            : basis === 'historisch_ähnlich' ? `ähnl. Arbeit`
            : `Kategorie-Schätzung`;

          const gefundenEintrag = gefundenArbeiten.find(g => g.arbeit === arbeit);
          if (gefundenEintrag) {
            gesamtMinuten -= gefundenEintrag.zeitverwaltungMinuten;
            gesamtMinuten += minuten;
            items[gefundenEintrag.itemIdx].minuten = minuten;
            items[gefundenEintrag.itemIdx].labelHtml = `📊 ${arbeit}${gefundenEintrag.hinweis} <small style="color:#888">(${quellLabel})</small>: `;
          } else {
            gesamtMinuten += minuten;
            richtzeitBasis += minuten;
            const idx = items.findIndex(it => it.noTime && it.arbeit === arbeit);
            if (idx !== -1) {
              items[idx].minuten = minuten;
              items[idx].labelHtml = `📊 ${arbeit} <small style="color:#888">(${quellLabel})</small>: `;
              delete items[idx].noTime;
            }
          }
        });
      } catch (e) { /* KI-Zeitvorschlag nicht kritisch */ }
    }

    // 🧠 Puffer-ML: KI-basierten Puffer abfragen wenn aktiviert
    const pufferMLAktiv = document.getElementById('pufferMLEnabled')?.checked;
    let mlPufferMinuten = 0;
    let pufferHtml = '';
    if (pufferMLAktiv && gesamtMinuten > 0 && eingabe.length > 2) {
      try {
        const empfehlung = await window.AIService.getPufferEmpfehlung(eingabe);
        if (empfehlung && empfehlung.puffer_minuten > 0) {
          mlPufferMinuten = empfehlung.puffer_minuten;
          const basis = empfehlung.basis === 'ML' ? '🧠 ML' : '📊 Standard';
          pufferHtml = `<div style="font-size:0.82em;color:#aaa;margin-top:2px;">+ Puffer (${basis}, ${empfehlung.kategorie}): +${mlPufferMinuten} min</div>`;
        }
      } catch (e) { /* Puffer-Abfrage nicht kritisch */ }
    }

    // Anzeige + State speichern + rendern
    zeitschaetzungAnzeige.style.display = 'block';
    this._zeitState = { items, mlPufferMinuten, richtzeitBasis, pufferHtml };
    this._renderZeitItems('neu');
  }

  _buildZeitItemSpan(item, idx, ctx) {
    if (item.noTime && item.minuten === 0) {
      return `<span style="color:#bbb;cursor:pointer;border-bottom:1px dotted #ccc;" title="Klicken zum manuellen Eingeben" onclick="app.editArbeitZeit(this,${idx},'${ctx}')">⚠️ ${item.arbeit}: keine Standardzeit ✎</span>`;
    }
    const std = Math.floor(item.minuten / 60);
    const min = item.minuten % 60;
    const zeitStr = std > 0 ? `${std} h${min > 0 ? ` ${min} min` : ''}` : `${min} min`;
    const editHint = item.manualOverride
      ? ' <span style="color:#f59e0b;font-size:0.85em;" title="Manuell angepasst">✎</span>'
      : ' <span style="color:#ccc;font-size:0.8em;">✎</span>';
    return `<span style="cursor:pointer;border-bottom:1px dotted #bbb;padding-bottom:1px;white-space:nowrap;" title="Klicken zum Anpassen" onclick="app.editArbeitZeit(this,${idx},'${ctx}')">${item.labelHtml}<strong>${zeitStr}</strong>${editHint}</span>`;
  }

  _renderZeitItems(ctx) {
    const state = ctx === 'neu' ? this._zeitState : this._editZeitState;
    if (!state) return;
    const czId = ctx === 'neu' ? 'geschaetzte_zeit' : 'edit_geschaetzte_zeit';
    const autoId = ctx === 'neu' ? 'geschaetzte_zeit_auto' : 'edit_geschaetzte_zeit_auto';
    const deltaId = ctx === 'neu' ? 'zeitschaetzungDelta' : 'editZeitschaetzungDelta';
    const detailsElId = ctx === 'neu' ? 'zeitschaetzungDetails' : 'editZeitschaetzungDetails';
    const detailsEl = document.getElementById(detailsElId);
    if (!detailsEl) return;

    const totalMin = state.items.reduce((sum, it) => sum + (it.noTime ? 0 : it.minuten), 0) + state.mlPufferMinuten;

    // Per-Work klickbare Spans
    const spans = state.items.map((item, idx) => this._buildZeitItemSpan(item, idx, ctx));
    const perWorkHtml = spans.length > 0
      ? `<div style="font-size:0.82em;color:#aaa;margin-bottom:8px;">${spans.join(' | ')}</div>`
      : '';

    // KI-Chip (aktueller Gesamtwert)
    const std = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    const kiZeitStr = totalMin === 0 ? '0 min'
      : std === 0 ? `${min} min`
      : min === 0 ? `${std} h`
      : `${std} h ${min} min`;
    const kiChip = totalMin > 0
      ? `<button type="button" onclick="app.setZeitkorrektur('${czId}','${autoId}','${deltaId}',${totalMin})" style="font-size:0.88em;padding:5px 14px;border:2px solid #4a90e2;border-radius:20px;background:#4a90e2;color:#fff;cursor:pointer;font-weight:700;">📊 KI: ${kiZeitStr}</button>`
      : '';

    // Richtzeit-Chip (unveränderter Basiswert)
    let richtzeitChip = '';
    const rzBase = state.richtzeitBasis;
    if (rzBase > 0 && rzBase !== totalMin) {
      const rzStd = Math.floor(rzBase / 60);
      const rzRest = rzBase % 60;
      const rzStr = rzStd > 0 ? `${rzStd} h${rzRest > 0 ? ` ${rzRest} min` : ''}` : `${rzRest} min`;
      richtzeitChip = `<button type="button" onclick="app.setZeitkorrektur('${czId}','${autoId}','${deltaId}',${rzBase})" style="font-size:0.88em;padding:5px 14px;border:2px solid #b0c8e8;border-radius:20px;background:#f0f7ff;color:#2c6fad;cursor:pointer;">✓ Richtzeit: ${rzStr}</button>`;
    }

    detailsEl.innerHTML = perWorkHtml + (state.pufferHtml || '') +
      `<div style="display:flex;gap:8px;flex-wrap:wrap;">${kiChip}${richtzeitChip}</div>`;

    // Stepper + Header aktualisieren
    const autoInput = document.getElementById(autoId);
    if (autoInput) autoInput.value = String(totalMin);
    const manualInput = document.getElementById(czId);
    if (manualInput && totalMin > 0) manualInput.value = String(Math.round(totalMin / 15) * 0.25);
    this.updateZeitKorrekturDelta(czId, autoId, deltaId);
  }

  editArbeitZeit(spanEl, idx, ctx) {
    const state = ctx === 'neu' ? this._zeitState : this._editZeitState;
    if (!state) return;
    const item = state.items[idx];
    const currentH = (item.noTime && item.minuten === 0) ? 0.5 : Math.round(item.minuten / 15) * 0.25;
    const labelPart = (item.noTime && item.minuten === 0) ? `⚠️ ${item.arbeit}: ` : item.labelHtml;
    spanEl.innerHTML = `${labelPart}<input type="number" value="${currentH}" step="0.25" min="0.25" style="width:48px;border:1px solid #4a90e2;border-radius:4px;padding:1px 4px;font-size:1em;font-weight:600;color:#333;" onblur="app._saveArbeitZeit(this,${idx},'${ctx}')" onkeydown="if(event.key==='Enter'){this.blur();}if(event.key==='Escape'){app._renderZeitItems('${ctx}');}"> h`;
    const input = spanEl.querySelector('input');
    if (input) { input.focus(); input.select(); }
  }

  _saveArbeitZeit(inputEl, idx, ctx) {
    const state = ctx === 'neu' ? this._zeitState : this._editZeitState;
    if (!state) return;
    const valH = parseFloat(inputEl.value);
    if (Number.isFinite(valH) && valH > 0) {
      state.items[idx].minuten = Math.round(valH * 60);
      state.items[idx].manualOverride = true;
      delete state.items[idx].noTime;
    }
    this._renderZeitItems(ctx);
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

  async _zeigeWiederholungsDialog(aehnlicheTermine, neuesTerminData) {
    return new Promise((resolve) => {
      // Alten Dialog entfernen
      const existing = document.getElementById('wiederholung-dialog');
      if (existing) existing.remove();

      const termineHtml = aehnlicheTermine.map(t => {
        const datumFormatiert = new Date(t.datum + 'T12:00:00').toLocaleDateString('de-DE');
        const arbeiten = t.arbeit && t.arbeit.length > 60 ? t.arbeit.substring(0, 60) + '…' : (t.arbeit || '—');
        return `<div style="padding:6px 8px;background:#f9fafb;border-radius:6px;margin-bottom:4px;font-size:12px;">
          <strong>${t.termin_nr || '?'}</strong> — ${datumFormatiert}<br>
          <span style="color:#6b7280;">${arbeiten}</span>
        </div>`;
      }).join('');

      const overlay = document.createElement('div');
      overlay.id = 'wiederholung-dialog';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';

      // XSS-Escaping für Kennzeichen
      const kennzeichenEscaped = (neuesTerminData.kennzeichen || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

      overlay.innerHTML = `
        <div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
          <h3 style="margin:0 0 8px;font-size:16px;color:#1f2937;">🔍 Ähnlicher Termin gefunden</h3>
          <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">
            Für <strong>${kennzeichenEscaped}</strong> gibt es ${aehnlicheTermine.length} Termin(e) in den nächsten/letzten 7 Tagen:
          </p>
          <div style="margin-bottom:16px;">${termineHtml}</div>
          <p style="margin:0 0 16px;font-size:13px;color:#374151;font-weight:500;">Was ist dieser neue Termin?</p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <button id="wdh-gleich" style="padding:10px;border-radius:8px;border:1px solid #93b4f5;background:#e8f0fe;color:#1a4a9b;font-weight:600;cursor:pointer;text-align:left;">
              ✏️ Gleicher Termin — bestehenden Termin bearbeiten
            </button>
            <button id="wdh-wiederholung" style="padding:10px;border-radius:8px;border:1px solid #f0a0a0;background:#fce8e8;color:#8a2020;font-weight:600;cursor:pointer;text-align:left;">
              🔁 Wiederholungstermin — neu anlegen (rot markiert)
            </button>
            <button id="wdh-kein" style="padding:10px;border-radius:8px;border:1px solid #d0d5dd;background:#f9fafb;color:#374151;cursor:pointer;text-align:left;">
              ➡️ Kein Zusammenhang — normal speichern
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      overlay.querySelector('#wdh-gleich').addEventListener('click', () => {
        overlay.remove();
        const ersterTreffer = aehnlicheTermine[0];
        resolve({ aktion: 'gleich', terminId: ersterTreffer.id });
      });

      overlay.querySelector('#wdh-wiederholung').addEventListener('click', () => {
        overlay.remove();
        resolve({ aktion: 'wiederholung' });
      });

      overlay.querySelector('#wdh-kein').addEventListener('click', () => {
        overlay.remove();
        resolve({ aktion: 'kein' });
      });
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
      // Prüfe auf Duplikate (gleicher Kunde am gleichen Tag) – nur wenn Duplikat-Erkennung aktiviert
      if (document.getElementById('duplikatErkennungEnabled')?.checked !== false) {
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
      } // Ende Duplikat-Erkennung Guard

      // Wiederholungstermin-Erkennung (gleiches Kennzeichen, ±7 Tage)
      if (termin.kennzeichen) {
        try {
          const aehnlichCheck = await TermineService.getAehnliche(termin.kennzeichen, termin.datum);
          if (aehnlichCheck.hatAehnliche) {
            const dialogResult = await this._zeigeWiederholungsDialog(aehnlichCheck.termine, termin);
            if (dialogResult.aktion === 'gleich') {
              // Bestehenden Termin zur Bearbeitung öffnen
              this.showTerminDetails(dialogResult.terminId);
              this.pendingTerminData = null;
              return;
            } else if (dialogResult.aktion === 'wiederholung') {
              termin.ist_wiederholung = 1;
            }
            // Bei 'kein': termin.ist_wiederholung bleibt undefined/0 → normaler Termin
          }
        } catch (aehnlichErr) {
          console.warn('[Wiederholungs-Check] Fehler (ignoriert):', aehnlichErr);
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
      const kundeInfo = resolvedKundeName ? ` (Kunde: ${resolvedKundeName})` : '';
      alert(`Fehler beim Erstellen des Kundentermins${kundeInfo}:\n${error.message || 'Unbekannter Fehler'}`);
      this.pendingTerminData = null;
    }
  }


  // ========================================
  // SCHNELLER TERMIN (ohne Kennzeichen)
  // ========================================


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
    
    kundeInfo.innerHTML = `<strong>${this._escapeHtml(kunde.name)}</strong>${kunde.telefon ? ` · ${this._escapeHtml(kunde.telefon)}` : ''}<br>
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
            <span style="font-size: 1.2em; font-weight: bold;">🚗 ${this._escapeHtml(fz.kennzeichen)}</span>
            ${fz.fahrzeugtyp ? `<span style="color: #666; margin-left: 10px;">${this._escapeHtml(fz.fahrzeugtyp)}</span>` : ''}
          </div>
          ${idx === 0 ? '<span style="background: #4caf50; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;">Zuletzt</span>' : ''}
        </div>
        ${fz.vin ? `<div style="font-size: 0.85em; color: #888; margin-top: 5px;">VIN: ${this._escapeHtml(fz.vin)}</div>` : ''}
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

        // Wiederholungs-Badge
        const wiederholungBadge = termin.ist_wiederholung ? '<span class="wiederholung-badge">🔁 Wiederholung</span>' : '';

        // Arbeit-Anzeige formatieren
        const arbeitAnzeige = this.formatArbeitAnzeige(termin.arbeit);

        // Schwebende Termine visuell kennzeichnen
        if (termin.ist_schwebend) {
          row.classList.add('schwebend');
        }

        row.innerHTML = `
          <td style="text-align: center; font-size: 20px;">${zeitStatusIcon}</td>
          <td><strong>${termin.termin_nr || '-'}</strong>${terminDringlichkeit}${terminFolgetermin}${schwebendBadge}${splitBadge}${teileStatusBadge}${wiederholungBadge}</td>
          <td>${termin.datum}</td>
          <td>${termin.kunde_name}</td>
          <td>${termin.kennzeichen}</td>
          <td>${termin.kilometerstand || '-'}</td>
          <td>${termin.ersatzauto ? 'Ja' : 'Nein'}</td>
          <td title="${termin.arbeit || ''}">${arbeitAnzeige}</td>
          <td>${this.formatZeit(zeitAnzeige)}</td>
          <td>${termin.mitarbeiter_name || '-'}</td>
          <td><span class="status-badge ${statusClass}" style="cursor:pointer;" onclick="event.stopPropagation(); app.openStatusPopup(${termin.id}, this)">${termin.status}</span></td>
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
        if (termin.ist_wiederholung) {
          row.classList.add('wiederholung-row');
        }

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







  openZeitModal(terminId, aktuelleZeit, status) {
    document.getElementById('termin_id').value = terminId;
    document.getElementById('tatsaechliche_zeit').value = aktuelleZeit;
    document.getElementById('status').value = status;
    document.getElementById('modal').style.display = 'block';
  }

  closeModal() {
    document.getElementById('modal').style.display = 'none';
  }


  async updateTerminZeiten(terminId) {
    const bringzeit = document.getElementById('detailBringzeit')?.value || null;
    const abholzeit = document.getElementById('detailAbholzeit')?.value || null;
    try {
      await TermineService.update(terminId, {
        bring_zeit: bringzeit || null,
        abholung_zeit: abholzeit || null
      });
      // Termin im Cache aktualisieren
      if (this.termineById[terminId]) {
        this.termineById[terminId].bring_zeit = bringzeit;
        this.termineById[terminId].abholung_zeit = abholzeit;
      }
      // Kurzes visuelles Feedback
      document.querySelectorAll('.btn-detail-zeit-save').forEach(btn => {
        const orig = btn.textContent;
        btn.textContent = '✅';
        btn.style.color = '#28a745';
        setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1500);
      });
      await this.loadTermine();
    } catch (err) {
      console.error('Fehler beim Speichern der Zeiten:', err);
      alert('Fehler beim Speichern der Zeiten.');
    }
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
      
      // 🔍 DEBUG: Ausführliches Logging für Produktivsystem
      console.log('[DEBUG] updateTerminMitarbeiter - Start');
      console.log('[DEBUG] Termin-ID:', terminId);
      console.log('[DEBUG] Selected Value:', selectedValue);
      console.log('[DEBUG] Mitarbeiter ID (wird gespeichert):', mitarbeiterIdValue);
      console.log('[DEBUG] Schwebend-Status:', istSchwebend);
      console.log('[DEBUG] Existing Details:', existingDetails);
      console.log('[DEBUG] Update Data:', updateData);
      
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
      
      // Interne Auftragsnummer speichern (falls geändert)
      const interneAuftragsnummerInput = document.getElementById('terminInterneAuftragsnummer');
      if (interneAuftragsnummerInput) {
        const neueAuftragsnummer = interneAuftragsnummerInput.value.trim();
        if (neueAuftragsnummer !== (termin.interne_auftragsnummer || '')) {
          updateData.interne_auftragsnummer = neueAuftragsnummer;
        }
      }
      
      console.log('[DEBUG] Sende API-Request: PUT /termine/' + terminId);
      console.log('[DEBUG] Request Body:', JSON.stringify(updateData, null, 2));
      
      const response = await TermineService.update(terminId, updateData);
      
      console.log('[DEBUG] API Response:', response);
      
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
      console.error('[ERROR] Fehler beim Speichern der Zuordnung:', error);
      console.error('[ERROR] Stack:', error.stack);
      alert('Fehler beim Speichern der Zuordnung: ' + error.message);
    }
  }


  async detailKmVinSpeichern(terminId) {
    const kmInput = document.getElementById('detailKilometerstand');
    const vinInput = document.getElementById('detailVin');
    if (!kmInput || !vinInput) return;

    const km = kmInput.value !== '' ? parseInt(kmInput.value, 10) : null;
    const vin = vinInput.value.trim().toUpperCase() || null;

    try {
      await TermineService.update(terminId, { kilometerstand: km, vin });
      // Cache aktualisieren
      if (this.termineById[terminId]) {
        this.termineById[terminId].kilometerstand = km;
        this.termineById[terminId].vin = vin;
      }
      const btn = document.querySelector('[onclick*="detailKmVinSpeichern"]');
      if (btn) {
        btn.textContent = '✅ Gespeichert';
        btn.style.background = '#16a34a';
        setTimeout(() => { btn.textContent = '💾 KM / VIN speichern'; btn.style.background = '#2563eb'; }, 2000);
      }
    } catch (e) {
      alert('Fehler beim Speichern: ' + e.message);
    }
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

  // Termin auf nächsten Arbeitstag verschieben
  async weiterfuehrenTermin() {
    if (!this.currentDetailTerminId) return;

    const termin = this.termineById[this.currentDetailTerminId];
    if (!termin) return;

    // Nächsten Werktag ab aktuellem Datum ermitteln
    const d = new Date(termin.datum + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    const neuesDatum = d.toISOString().slice(0, 10);
    const neuesDatumLabel = d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

    if (!confirm(`Termin auf ${neuesDatumLabel} weiterführen?\n\nDer Termin bleibt dem gleichen Mitarbeiter zugeordnet und erscheint in der Planung für diesen Tag.`)) return;

    try {
      const terminId = this.currentDetailTerminId;
      this.closeTerminDetails();
      await TermineService.weiterfuehren(terminId, neuesDatum);
      this.showToast(`📅 Termin auf ${neuesDatumLabel} weitergeführt`, 'success');
      delete this.termineById[terminId];
      await Promise.all([this.loadTermine(), this.loadAuslastung()]);
      // DragDrop-Ansicht auf neues Datum setzen und neu laden
      const dragDropDatum = document.getElementById('auslastungDragDropDatum');
      if (dragDropDatum && document.getElementById('auslastung-dragdrop')?.classList.contains('active')) {
        dragDropDatum.value = neuesDatum;
        this.loadAuslastungDragDrop();
      }
    } catch (error) {
      console.error('Fehler beim Weiterführen:', error);
      this.showToast('Fehler beim Weiterführen: ' + (error.message || 'Unbekannter Fehler'), 'error');
    }
  }

  /**
   * Öffnet einen Dialog: Termin heute ab einer Startzeit einplanen und morgen fortführen.
   * Optionale Verschiebung überlappender Termine nach hinten.
   */
  showEinplanenDialog(terminId, termin) {
    const existingDialog = document.getElementById('einplanenDialog');
    if (existingDialog) existingDialog.remove();

    const now = new Date();
    const defaultStart = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const gesamtMin = termin.geschaetzte_zeit || 60;
    const gesamtText = gesamtMin >= 60
      ? `${Math.floor(gesamtMin/60)}h ${gesamtMin%60 > 0 ? gesamtMin%60+'min' : ''}`.trim()
      : `${gesamtMin} min`;

    const overlay = document.createElement('div');
    overlay.id = 'einplanenDialog';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:11000;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:24px;max-width:420px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
        <h3 style="margin:0 0 6px 0;font-size:1.1rem;">⚡ Heute einplanen + morgen fortführen</h3>
        <p style="margin:0 0 16px 0;font-size:0.9rem;color:#555;">
          <strong>${termin.termin_nr}</strong> – ${termin.kunde_name || ''}<br>
          Gesamtzeit: <strong>${gesamtText}</strong>
        </p>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <label style="font-size:0.9rem;font-weight:600;">Startzeit heute:
            <input type="time" id="einplanenStart" value="${defaultStart}"
              style="display:block;margin-top:4px;padding:6px 10px;border:1px solid #ccc;border-radius:7px;font-size:1rem;width:100%;">
          </label>
          <label style="font-size:0.9rem;font-weight:600;">Feierabend (heute bis):
            <input type="time" id="einplanenFeierabend" value="17:00"
              style="display:block;margin-top:4px;padding:6px 10px;border:1px solid #ccc;border-radius:7px;font-size:1rem;width:100%;">
          </label>
          <div id="einplanenVorschau" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;font-size:0.88rem;"></div>
          <label style="display:flex;align-items:center;gap:8px;font-size:0.88rem;cursor:pointer;">
            <input type="checkbox" id="einplanenVerschieben" style="width:16px;height:16px;">
            Überlappende Termine nach hinten verschieben
          </label>
        </div>
        <div style="display:flex;gap:10px;margin-top:18px;">
          <button id="einplanenBestaetigen" style="flex:1;background:#2e7d32;color:#fff;border:none;padding:10px;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;">✅ Einplanen</button>
          <button id="einplanenAbbrechen" style="flex:1;background:#f3f4f6;color:#333;border:1px solid #ddd;padding:10px;border-radius:8px;font-size:0.95rem;cursor:pointer;">❌ Abbrechen</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const updateVorschau = () => {
      const start = document.getElementById('einplanenStart')?.value || defaultStart;
      const feier = document.getElementById('einplanenFeierabend')?.value || '17:00';
      const [sh,sm] = start.split(':').map(Number);
      const [fh,fm] = feier.split(':').map(Number);
      const heuteMin = Math.max(0, (fh*60+fm) - (sh*60+sm));
      const restMin = Math.max(0, gesamtMin - heuteMin);
      const prev = document.getElementById('einplanenVorschau');
      if (!prev) return;
      if (heuteMin <= 0) {
        prev.innerHTML = '<span style="color:#d32f2f;">⚠️ Feierabend liegt vor oder auf der Startzeit.</span>';
        return;
      }
      const morgenStr = (() => { const d=new Date(); d.setDate(d.getDate()+1); while(d.getDay()===0||d.getDay()===6) d.setDate(d.getDate()+1); return d.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'}); })();
      if (restMin <= 0) {
        prev.innerHTML = `<span style="color:#2e7d32;">✅ Termin passt vollständig bis ${feier} Uhr (${heuteMin} Min.).</span>`;
      } else {
        prev.innerHTML = `<strong>Heute:</strong> ${heuteMin} Min. (${start}–${feier})<br><strong>Morgen (${morgenStr}):</strong> ${restMin} Min. ab 08:00`;
      }
    };
    updateVorschau();
    document.getElementById('einplanenStart').addEventListener('input', updateVorschau);
    document.getElementById('einplanenFeierabend').addEventListener('input', updateVorschau);

    document.getElementById('einplanenAbbrechen').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('einplanenBestaetigen').addEventListener('click', async () => {
      const startzeit = document.getElementById('einplanenStart')?.value || defaultStart;
      const feierabend = document.getElementById('einplanenFeierabend')?.value || '17:00';
      const verschieben = document.getElementById('einplanenVerschieben')?.checked || false;
      const [sh,sm] = startzeit.split(':').map(Number);
      const [fh,fm] = feierabend.split(':').map(Number);
      const heuteMin = (fh*60+fm) - (sh*60+sm);
      if (heuteMin <= 0) {
        this.showToast('⚠️ Feierabend liegt vor der Startzeit!', 'error');
        return;
      }
      overlay.remove();
      try {
        const result = await TermineService.folgearbeitErstellen(terminId, feierabend, startzeit, verschieben);
        const morgenLabel = (() => { const d=new Date(); d.setDate(d.getDate()+1); while(d.getDay()===0||d.getDay()===6) d.setDate(d.getDate()+1); return d.toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit'}); })();
        let msg = `✅ Heute ${result.heute_minuten} Min. ab ${startzeit}, morgen (${morgenLabel}) ${result.rest_minuten} Min.`;
        if (result.verschobene_termine?.length > 0) {
          msg += ` | ${result.verschobene_termine.length} Termin(e) verschoben`;
        }
        this.showToast(msg, 'success');
        await Promise.all([this.loadTermine(), this.loadAuslastung()]);
        if (document.getElementById('auslastung-dragdrop')?.classList.contains('active')) {
          this.loadAuslastungDragDrop();
        }
      } catch (err) {
        this.showToast('❌ Fehler: ' + (err.message || 'Unbekannter Fehler'), 'error');
      }
    });
  }

  // Termin als schwebend markieren/aufheben
  async toggleTerminSchwebend() {
    if (!this.currentDetailTerminId) return;
    
    const termin = this.termineById[this.currentDetailTerminId];
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
          <div id="einplanenBestehendeArbeitenBox" style="display:none; margin-bottom: 12px; padding: 8px 12px; background: #f0f4ff; border-radius: 6px; border-left: 3px solid #5c6bc0;">
            <div id="einplanenBestehendeArbeitenTitel" style="font-size: 0.8em; font-weight: 600; color: #3949ab; margin-bottom: 6px;">📋 Arbeiten:</div>
            <div id="einplanenBestehendeArbeitenListe" style="font-size: 0.88em; color: #333; display:flex; flex-direction:column; gap:4px;"></div>
            <div id="einplanenSplitHinweis" style="display:none;margin-top:6px;padding:5px 8px;background:#fff3cd;border-radius:4px;font-size:0.8em;color:#856404;">
              ℹ️ Nicht ausgewählte Arbeiten werden als neuer schwebender Termin gespeichert.
            </div>
          </div>
          <label><strong>➕ Neue Arbeit hinzufügen (optional):</strong></label>
          <div style="display: flex; gap: 10px; margin-top: 5px;">
            <input type="text" id="einplanenArbeitText" class="form-control" style="flex: 1;" placeholder="Arbeit eingeben...">
            <input type="number" id="einplanenArbeitZeit" class="form-control" style="width: 70px;" placeholder="h" min="0.1" step="0.1">
            <button type="button" class="btn btn-secondary" onclick="app.addArbeitToEinplanen()" style="white-space: nowrap;">
              ➕
            </button>
          </div>
          <div id="einplanenArbeitenListe" style="margin-top: 10px; max-height: 150px; overflow-y: auto;"></div>
          <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #666; font-size: 0.9em;">Zusätzliche Zeit neuer Arbeiten:</span>
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
    
    // Bestehende Arbeiten aus dem Termin als read-only Referenz speichern (NICHT in die editable Liste laden)
    this.einplanenBestehendeArbeiten = [];
    this.einplanenArbeiten = []; // Neue Arbeiten starten immer leer
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
      
      // Bestehende Arbeiten nur als Referenz speichern
      const arbeitenListe = termin.arbeit.split(/\n|\s*\|\|\s*/).map(a => a.trim()).filter(a => a);
      const gesamtZeitMinuten = termin.geschaetzte_zeit || 60;
      const standardZeitProArbeit = arbeitenListe.length > 0 ? Math.round(gesamtZeitMinuten / arbeitenListe.length) : 60;
      
      // Prüfen ob explizite Einzelzeiten gesetzt → Split-Modus
      let hatEinzelzeiten = false;
      arbeitenListe.forEach(bezeichnung => {
        let zeitMinuten = standardZeitProArbeit;
        let einzelzeitExplizit = false;
        if (details[bezeichnung]) {
          if (typeof details[bezeichnung] === 'object' && details[bezeichnung].zeit > 0) {
            zeitMinuten = details[bezeichnung].zeit;
            einzelzeitExplizit = true;
          } else if (typeof details[bezeichnung] === 'number' && details[bezeichnung] > 0) {
            zeitMinuten = details[bezeichnung];
            einzelzeitExplizit = true;
          }
        }
        if (einzelzeitExplizit) hatEinzelzeiten = true;
        this.einplanenBestehendeArbeiten.push({ bezeichnung, zeit: zeitMinuten, einzelzeitExplizit });
      });
      // Split-Modus nur wenn Termin mehrere Arbeiten UND Einzelzeiten hat
      this.einplanenSplitModus = hatEinzelzeiten && arbeitenListe.length > 1;
    }
    
    // Bestehende Arbeiten anzeigen – Modus abhängig von Einzelzeiten
    const bestehendeBox = document.getElementById('einplanenBestehendeArbeitenBox');
    const bestehendeListe = document.getElementById('einplanenBestehendeArbeitenListe');
    const splitHinweis = document.getElementById('einplanenSplitHinweis');
    const bestehendeTitle = document.getElementById('einplanenBestehendeArbeitenTitel');
    if (bestehendeBox && bestehendeListe) {
      if (this.einplanenBestehendeArbeiten.length > 0) {
        bestehendeBox.style.display = 'block';
        if (this.einplanenSplitModus) {
          // Split-Modus: Checkboxen + Hinweis
          if (bestehendeTitle) bestehendeTitle.textContent = '📋 Arbeiten auswählen (Haken = wird jetzt eingeplant):';
          bestehendeBox.style.background = '#f0f4ff';
          bestehendeBox.style.borderLeftColor = '#5c6bc0';
          bestehendeListe.innerHTML = this.einplanenBestehendeArbeiten
            .map((a, i) => {
              const zeitText = a.zeit >= 60
                ? `${Math.floor(a.zeit/60)}h${a.zeit%60>0?' '+(a.zeit%60)+'min':''}` : `${a.zeit}min`;
              return `<label style="display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer;">
                <input type="checkbox" class="einplanen-arbeit-check" data-index="${i}" checked
                  style="width:16px;height:16px;cursor:pointer;">
                <span>${this.escapeHtml(a.bezeichnung)} <span style="color:#555;font-size:0.9em;">(${zeitText})</span></span>
              </label>`;
            })
            .join('');
          // Split-Hinweis dynamisch ein-/ausblenden
          bestehendeListe.addEventListener('change', () => {
            const checks = bestehendeListe.querySelectorAll('.einplanen-arbeit-check');
            const alleGesetzt = Array.from(checks).every(cb => cb.checked);
            if (splitHinweis) splitHinweis.style.display = alleGesetzt ? 'none' : 'block';
          });
        } else {
          // Komplett-Modus: Read-only, keine Checkboxen
          if (bestehendeTitle) bestehendeTitle.textContent = '📋 Alle Arbeiten werden komplett übernommen:';
          bestehendeBox.style.background = '#f0fdf4';
          bestehendeBox.style.borderLeftColor = '#16a34a';
          const gesamtZeit = this.einplanenBestehendeArbeiten.reduce((s, a) => s + a.zeit, 0);
          const gesamtText = gesamtZeit >= 60
            ? `${Math.floor(gesamtZeit/60)}h${gesamtZeit%60>0?' '+gesamtZeit%60+'min':''}` : `${gesamtZeit}min`;
          bestehendeListe.innerHTML = this.einplanenBestehendeArbeiten
            .map(a => `<div style="padding:2px 0;">✅ ${this.escapeHtml(a.bezeichnung)}</div>`)
            .join('')
            + `<div style="margin-top:6px;font-size:0.85em;color:#16a34a;">⏱️ Gesamtzeit: <strong>${gesamtText}</strong></div>`;
          if (splitHinweis) splitHinweis.style.display = 'none';
        }
      } else {
        bestehendeBox.style.display = 'none';
      }
    }
    
    // Arbeiten-Liste anzeigen (startet leer)
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
          // Fallback: aus tatsächlicher (abgeschlossen) oder geschätzter Zeit berechnen
          const dauer = (['abgeschlossen', 'in_arbeit'].includes(t.status) && t.tatsaechliche_zeit > 0)
            ? t.tatsaechliche_zeit
            : (t.geschaetzte_zeit || 60);
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
            
            // Korrekte Überschneidungsprüfung: Zwei Zeiträume überschneiden sich, wenn
            // der erste vor Ende des zweiten startet UND nach Beginn des zweiten endet
            // current: [startMin, endeMin), next: [startMin, endeMin)
            // Überschneidung wenn: current.startMin < next.endeMin && current.endeMin > next.startMin
            if (current.startMin < next.endeMin && current.endeMin > next.startMin) {
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

        // Wenn Abholdatum gesetzt ist und nach dem Termindatum liegt → kein Konflikt möglich
        if (termin.abholung_datum && termin.abholung_datum > datum) continue;
        
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
      
      // Bestehende arbeitszeiten_details als Basis laden
      let details = {};
      if (termin.arbeitszeiten_details) {
        try {
          details = typeof termin.arbeitszeiten_details === 'string'
            ? JSON.parse(termin.arbeitszeiten_details)
            : { ...termin.arbeitszeiten_details };
        } catch (e) {}
      }
      
      // Ausgewählte bestehende Arbeiten ermitteln
      // Direkt DOM-Checkboxen prüfen – unabhängig von einplanenSplitModus
      let ausgewaehlteBestehendeArbeiten = [...(this.einplanenBestehendeArbeiten || [])];
      let nichtAusgewaehlteArbeiten = [];
      const checkboxen = document.querySelectorAll('#einplanenDatumModal .einplanen-arbeit-check');
      if (checkboxen.length > 0 && (this.einplanenBestehendeArbeiten || []).length > 0) {
        ausgewaehlteBestehendeArbeiten = [];
        checkboxen.forEach(cb => {
          const idx = parseInt(cb.dataset.index, 10);
          const arbeit = this.einplanenBestehendeArbeiten[idx];
          if (!arbeit) return;
          if (cb.checked) ausgewaehlteBestehendeArbeiten.push(arbeit);
          else nichtAusgewaehlteArbeiten.push(arbeit);
        });
      }
      // Wenn keine Checkboxen (Komplett-Modus): alle bestehenden Arbeiten übernehmen, kein Split

      // Neue Arbeiten (aus dem ➕-Bereich) zu den ausgewählten HINZUFÜGEN, keine Duplikate
      const neueArbeiten = (this.einplanenArbeiten || []).filter(
        a => !ausgewaehlteBestehendeArbeiten.some(b => b.bezeichnung === a.bezeichnung)
      );
      const alleEinzuplanendeArbeiten = [...ausgewaehlteBestehendeArbeiten, ...neueArbeiten];

      if (alleEinzuplanendeArbeiten.length > 0) {
        updateData.arbeit = alleEinzuplanendeArbeiten.map(a => a.bezeichnung).join(' || ');
        updateData.geschaetzte_zeit = alleEinzuplanendeArbeiten.reduce((s, a) => s + a.zeit, 0);
        neueArbeiten.forEach(a => { details[a.bezeichnung] = { zeit: a.zeit }; });
        // Details von abgewählten Arbeiten entfernen
        nichtAusgewaehlteArbeiten.forEach(a => { delete details[a.bezeichnung]; });
      }
      // Wenn keine Auswahl geändert, bleiben bestehende unverändert
      
      // Wenn Uhrzeit angegeben, in arbeitszeiten_details speichern
      if (neueUhrzeit) {
        // Setze Startzeit als Gesamt-Startzeit; erste Arbeit bekommt auch Startzeit
        const ersteArbeitName = ausgewaehlteBestehendeArbeiten.length > 0
          ? ausgewaehlteBestehendeArbeiten[0].bezeichnung
          : (neueArbeiten.length > 0 ? neueArbeiten[0].bezeichnung : null);
        if (ersteArbeitName) {
          if (!details[ersteArbeitName]) details[ersteArbeitName] = {};
          details[ersteArbeitName].startzeit = neueUhrzeit;
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

      // Wenn nicht alle bestehenden Arbeiten ausgewählt → Rest als neuen schwebenden Termin anlegen
      if (nichtAusgewaehlteArbeiten.length > 0) {
        const restDetails = {};
        nichtAusgewaehlteArbeiten.forEach(a => {
          restDetails[a.bezeichnung] = { zeit: a.zeit };
        });
        const restTermin = {
          kunde_name: termin.kunde_name || null,
          kennzeichen: termin.kennzeichen || null,
          telefon: termin.telefon || null,
          arbeit: nichtAusgewaehlteArbeiten.map(a => a.bezeichnung).join(' || '),
          geschaetzte_zeit: nichtAusgewaehlteArbeiten.reduce((s, a) => s + a.zeit, 0),
          datum: '9999-12-31',
          ist_schwebend: 1,
          status: 'neu',
          bring_zeit: null,
          abholung_typ: termin.abholung_typ || null,
          abholung_details: termin.abholung_details || null,
          vin: termin.vin || null,
          fahrzeugtyp: termin.fahrzeugtyp || null,
          dringlichkeit: termin.dringlichkeit || null,
          kilometerstand: termin.kilometerstand || null,
          ersatzauto: termin.ersatzauto || false,
          arbeitszeiten_details: JSON.stringify(restDetails)
        };
        await TermineService.create(restTermin);
      }
      
      // Lokalen Cache aktualisieren
      termin.datum = neuesDatum;
      termin.ist_schwebend = 0;
      if (updateData.arbeit !== undefined) termin.arbeit = updateData.arbeit;
      if (updateData.geschaetzte_zeit !== undefined) termin.geschaetzte_zeit = updateData.geschaetzte_zeit;
      termin.arbeitszeiten_details = updateData.arbeitszeiten_details;
      if (updateData.bring_zeit !== undefined) {
        termin.bring_zeit = updateData.bring_zeit;
      }
      
      // Button-Text aktualisieren
      this.updateSchwebendButton(false);
      
      // Modal schließen
      this.closeEinplanenDatumModal();
      
      const uhrzeitText = neueUhrzeit ? ` um ${neueUhrzeit} Uhr` : '';
      const neueArbTxt = neueArbeiten.length > 0 ? `\n${neueArbeiten.length} neue Arbeit(en) hinzugefügt.` : '';
      const splitTxt = nichtAusgewaehlteArbeiten.length > 0
        ? `\n${nichtAusgewaehlteArbeiten.length} Arbeit(en) als neuen schwebenden Termin gespeichert.` : '';
      alert(`Termin wurde für ${neuesDatum}${uhrzeitText} eingeplant!${neueArbTxt}${splitTxt}`);
      
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
    console.log('=== openErweiterungModalForTermin aufgerufen ===');
    console.log('Termin-ID:', terminId);
    
    // Setze currentDetailTerminId und rufe dann openErweiterungModal auf
    this.currentDetailTerminId = terminId;
    
    // Stelle sicher, dass der Termin im Cache ist
    if (!this.termineById[terminId]) {
      console.log('Termin nicht im Cache, lade von API...');
      try {
        const termin = await TermineService.getById(terminId);
        console.log('Termin geladen:', termin);
        if (termin) {
          this.termineById[terminId] = termin;
        } else {
          console.error('Termin nicht gefunden (API returned null/undefined)');
          this.showToast('❌ Termin nicht gefunden', 'error');
          return;
        }
      } catch (error) {
        console.error('Fehler beim Laden des Termins:', error);
        this.showToast('❌ Termin konnte nicht geladen werden', 'error');
        return;
      }
    } else {
      console.log('Termin bereits im Cache:', this.termineById[terminId]);
    }
    
    // Öffne das normale Erweiterungs-Modal
    console.log('Öffne Erweiterungs-Modal...');
    await this.openErweiterungModal();
  }

  /**
   * Öffnet das Erweiterungs-Modal für den aktuellen Termin
   */
  async openErweiterungModal() {
    console.log('=== openErweiterungModal aufgerufen ===');
    console.log('currentDetailTerminId:', this.currentDetailTerminId);
    
    if (!this.currentDetailTerminId) {
      console.error('Fehler: Kein Termin ausgewählt (currentDetailTerminId ist null/undefined)');
      alert('Kein Termin ausgewählt.');
      return;
    }

    const termin = this.termineById[this.currentDetailTerminId];
    console.log('Termin aus Cache:', termin);
    
    if (!termin) {
      console.error('Fehler: Termin nicht im Cache gefunden für ID:', this.currentDetailTerminId);
      alert('Termin nicht gefunden.');
      return;
    }

    console.log('Termin gefunden, initialisiere Modal...');

    // Speichere Termin-Daten für spätere Verwendung
    this.erweiterungTermin = termin;
    this.erweiterungKonflikte = null;

    // Fülle Original-Termin-Info
    const detailsEl = document.getElementById('erweiterungTerminDetails');
    const endzeitBerechnet = this.berechneEndzeit(termin);
    
    detailsEl.innerHTML = `
      <span><strong>Nr:</strong> ${termin.termin_nr || '-'}</span>
      <span><strong>Kunde:</strong> ${termin.kunde_name || '-'}</span>
      <span><strong>Kennzeichen:</strong> ${termin.kennzeichen || '-'}</span>
      <span><strong>Datum:</strong> ${this.formatDateGerman(termin.datum)}</span>
      <span><strong>Zeit:</strong> ${termin.bring_zeit || termin.startzeit || '08:00'} - ${endzeitBerechnet}</span>
      <span><strong>Dauer:</strong> ${termin.geschaetzte_zeit || 0} Min</span>
    `;
    
    console.log('Lade bestehende Erweiterungen...');
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

    console.log('Zeige Modal an...');
    // Modal anzeigen
    const modal = document.getElementById('erweiterungModal');
    modal.style.display = 'block';
    console.log('Modal display style gesetzt auf: block');

    // Prüfe Konflikte für "Im Anschluss"
    this.pruefeErweiterungsKonflikte();
    
    console.log('=== openErweiterungModal abgeschlossen ===');
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
   * Öffnet den Dialog "Bis Feierabend – Folgearbeit morgen"
   */
  async zeitleisteFolgearbeitErstellen() {
    this.closeZeitleisteKontextmenu();
    if (!this.zeitleisteKontextTerminId) return;

    let termin = this.termineById[this.zeitleisteKontextTerminId];
    if (!termin) {
      try {
        termin = await TermineService.getById(this.zeitleisteKontextTerminId);
        if (!termin) {
          this.showToast('❌ Termin nicht gefunden', 'error');
          return;
        }
        this.termineById[termin.id] = termin;
      } catch (e) {
        this.showToast('❌ Termin konnte nicht geladen werden', 'error');
        return;
      }
    }

    this.folgearbeitTermin = termin;

    const bringZeit = termin.bring_zeit || '08:00';
    const std = Math.round(termin.geschaetzte_zeit / 60 * 10) / 10;
    document.getElementById('folgearbeitTerminInfo').innerHTML = `
      <strong>${termin.termin_nr || '#' + termin.id}</strong> – ${termin.kunde_name || 'Unbekannt'}<br>
      <small>${termin.arbeit || ''}</small><br>
      <small>Bring-Zeit: <strong>${bringZeit}</strong> &nbsp;|&nbsp; Geschätzte Gesamtzeit: <strong>${std} Std. (${termin.geschaetzte_zeit} Min.)</strong></small>
    `;

    document.getElementById('folgearbeitVorschau').style.display = 'none';
    document.getElementById('folgearbeitModal').style.display = 'block';
    this.updateFolgearbeitVorschau();
  }

  updateFolgearbeitVorschau() {
    if (!this.folgearbeitTermin) return;
    const feierabend = document.getElementById('folgearbeitFeierabend')?.value || '17:00';
    const bringZeit = this.folgearbeitTermin.bring_zeit || '08:00';
    const [bh, bm] = bringZeit.split(':').map(Number);
    const [fh, fm] = feierabend.split(':').map(Number);
    const heuteMinuten = (fh * 60 + fm) - (bh * 60 + bm);
    const restMinuten = this.folgearbeitTermin.geschaetzte_zeit - heuteMinuten;
    const vorschau = document.getElementById('folgearbeitVorschau');
    if (!vorschau) return;

    if (heuteMinuten <= 0) {
      vorschau.innerHTML = `<div style="padding:10px;background:#fff3e0;border-radius:6px;border-left:4px solid #ff9800;">⚠️ Feierabend-Zeit liegt vor der Bring-Zeit des Termins.</div>`;
      vorschau.style.display = 'block';
      return;
    }
    if (restMinuten <= 0) {
      vorschau.innerHTML = `<div style="padding:10px;background:#e3f2fd;border-radius:6px;border-left:4px solid #2196f3;">ℹ️ Der Termin kann bis ${feierabend} Uhr vollständig abgeschlossen werden – keine Folgearbeit nötig.</div>`;
      vorschau.style.display = 'block';
      return;
    }
    const heuteStd = Math.round(heuteMinuten / 60 * 10) / 10;
    const restStd = Math.round(restMinuten / 60 * 10) / 10;
    vorschau.innerHTML = `
      <div style="padding:12px;background:#e8f5e9;border-radius:8px;border-left:4px solid #4caf50;">
        <strong>📊 Vorschau:</strong>
        <ul style="margin:8px 0;padding-left:20px;">
          <li>Heute (${bringZeit} – ${feierabend} Uhr): <strong>${heuteMinuten} Min. (${heuteStd} Std.)</strong></li>
          <li>Morgen – Folgearbeit: <strong>${restMinuten} Min. (${restStd} Std.)</strong></li>
        </ul>
      </div>
    `;
    vorschau.style.display = 'block';
  }

  closeFolgearbeitModal() {
    const modal = document.getElementById('folgearbeitModal');
    if (modal) modal.style.display = 'none';
    this.folgearbeitTermin = null;
  }

  async folgearbeitBestaetigen() {
    if (!this.folgearbeitTermin) return;
    const feierabend = document.getElementById('folgearbeitFeierabend')?.value || '17:00';
    const btn = document.getElementById('btnFolgearbeitBestaetigen');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Wird erstellt…'; }
    try {
      const result = await TermineService.folgearbeitErstellen(this.folgearbeitTermin.id, feierabend);
      this.closeFolgearbeitModal();
      this.showToast(
        `✅ Folgearbeit erstellt: ${result.heute_minuten} Min. heute, ${result.rest_minuten} Min. am ${result.folge_datum}`,
        'success'
      );
      if (typeof this.loadZeitleiste === 'function') this.loadZeitleiste();
      if (typeof this.loadAuslastung === 'function') this.loadAuslastung();
      if (typeof this.loadTermine === 'function') this.loadTermine();
    } catch (err) {
      this.showToast('❌ Fehler: ' + (err.message || 'Unbekannter Fehler'), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✅ Folgearbeit erstellen'; }
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
          infoEl.innerHTML = `✅ ${this._escapeHtml(erster.name)} kann die Arbeit direkt im Anschluss übernehmen.`;
          infoEl.className = 'verfuegbarkeit-info';
        } else {
          infoEl.innerHTML = `⏰ ${this._escapeHtml(erster.name)} hat den nächsten freien Slot um ${this._escapeHtml(erster.naechster_freier_slot)}.`;
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
    return berechneEndzeit(startzeit, dauerMinuten);
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

  // Hilfsfunktion: Nächster Arbeitstag (überspringt Samstag und Sonntag)
  naechsterArbeitstag(datum) {
    return naechsterArbeitstag(datum);
  }

  // Hilfsfunktion: Formatiert Datum auf Deutsch
  formatDateGerman(datum) {
    return formatDateGerman(datum);
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

  // Planung Navigation



  async loadNichtZugeordneteTermine(datum, auslastungData) {
    const section = document.getElementById('nichtZugeordnetSection');
    const container = document.getElementById('nichtZugeordnetContainer');
    const restkapazitaetDetails = document.getElementById('restkapazitaetDetails');
    
    if (!section || !container) return;

    try {
      // Hole alle Termine für den Tag
      const allTermine = await TermineService.getAll();
      const termineAmTag = allTermine.filter(t => t.datum === datum);

      // Vor-/Folgetag berechnen (lokal, kein UTC-Drift)
      const [vy, vm, vd] = datum.split('-').map(Number);
      const vortagDate = new Date(vy, vm - 1, vd - 1);
      const folgetagDate = new Date(vy, vm - 1, vd + 1);
      const vortagDatum = `${vortagDate.getFullYear()}-${String(vortagDate.getMonth()+1).padStart(2,'0')}-${String(vortagDate.getDate()).padStart(2,'0')}`;
      const folgetagDatum = `${folgetagDate.getFullYear()}-${String(folgetagDate.getMonth()+1).padStart(2,'0')}-${String(folgetagDate.getDate()).padStart(2,'0')}`;
      const vortagLabel = vortagDate.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
      const folgetagLabel = folgetagDate.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
      const datumDate = new Date(vy, vm - 1, vd);
      const heuteLabel = datumDate.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
      const termineAmVortag = allTermine.filter(t => t.datum === vortagDatum);
      const termineAmFolgetag = allTermine.filter(t => t.datum === folgetagDatum);

      const filterNichtZugeordnet = (liste) => liste.filter(termin => {
        // Abgeschlossene Termine nicht mehr anzeigen
        if (termin.status === 'abgeschlossen') return false;
        // Schwebende Termine gelten immer als "nicht zugeordnet" (konsistent mit Zeitleiste)
        const istSchwebend = termin.ist_schwebend === 1 || termin.ist_schwebend === true;
        if (istSchwebend) return true;
        // Prüfe ob mitarbeiter_id gesetzt ist
        if (termin.mitarbeiter_id) return false;
        // Prüfe auch arbeitszeiten_details auf Zuordnungen
        if (termin.arbeitszeiten_details) {
          try {
            const details = JSON.parse(termin.arbeitszeiten_details);
            if (details._gesamt_mitarbeiter_id) return false;
            for (const key in details) {
              if (!key.startsWith('_') && typeof details[key] === 'object' && details[key].mitarbeiter_id) {
                return false;
              }
            }
          } catch (e) { /* Ignoriere Parse-Fehler */ }
        }
        return true;
      });

      const nichtZugeordnet = filterNichtZugeordnet(termineAmTag);
      const nichtZugeordnetVortag = filterNichtZugeordnet(termineAmVortag);
      const nichtZugeordnetFolgetag = filterNichtZugeordnet(termineAmFolgetag);

      const renderNzItem = (termin, istUebertrag) => {
        const zeit = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;
        const kundenName = termin.kunde_name || 'Unbekannt';
        const istSchwebend = termin.ist_schwebend === 1 || termin.ist_schwebend === true;
        const bringZeitText = termin.bring_zeit ? `🚗↓ ${termin.bring_zeit}` : '';
        const abholZeitText = termin.abholung_zeit ? `🚗↑ ${termin.abholung_zeit}` : '';
        const zeitenInfo = [bringZeitText, abholZeitText].filter(t => t).join(' • ') || '--:--';

        // Einzelne Arbeiten ermitteln
        let arbeitenListe = [];
        if (termin.arbeit) {
          const namen = termin.arbeit.split(/\n|\s*\|\|\s*/).map(a => a.trim()).filter(a => a);
          if (namen.length > 1) {
            let details = {};
            if (termin.arbeitszeiten_details) {
              try { details = typeof termin.arbeitszeiten_details === 'string' ? JSON.parse(termin.arbeitszeiten_details) : termin.arbeitszeiten_details; } catch(e) {}
            }
            const gesamtZeit = termin.geschaetzte_zeit || 60;
            const standardZeit = Math.round(gesamtZeit / namen.length);
            arbeitenListe = namen.map(name => {
              let az = standardZeit;
              let hatEinzelzeit = false;
              if (details[name]) {
                if (typeof details[name] === 'object' && details[name].zeit > 0) { az = details[name].zeit; hatEinzelzeit = true; }
                else if (typeof details[name] === 'number' && details[name] > 0) { az = details[name]; hatEinzelzeit = true; }
              }
              return { name, zeit: az, hatEinzelzeit };
            });
          }
        }

        const hatMehrereArbeiten = arbeitenListe.length > 1;
        const arbeitAnzeige = hatMehrereArbeiten
          ? `<span style="color:#5c6bc0;font-size:0.82em;font-weight:600;">🔧 ${arbeitenListe.length} Arbeiten</span>`
          : `${this.escapeHtml(termin.arbeit || '-')}`;

        const arbeitenSubzeilen = hatMehrereArbeiten ? `
          <div class="nz-arbeiten-detail" style="margin-top:5px;padding:4px 8px;background:rgba(92,107,192,0.07);border-radius:5px;display:flex;flex-direction:column;gap:2px;">
            ${arbeitenListe.map(a => {
              const azText = a.zeit >= 60 ? `${Math.floor(a.zeit/60)}h${a.zeit%60>0?' '+a.zeit%60+'min':''}` : `${a.zeit}min`;
              return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:0.82em;color:#333;">
                <span>🔧 ${this.escapeHtml(a.name)}</span>
                <span style="color:${a.hatEinzelzeit?'#5c6bc0':'#888'};font-weight:${a.hatEinzelzeit?'600':'normal'}">⏱️ ${azText}</span>
              </div>`;
            }).join('')}
          </div>` : '';

        return `
          <div class="nicht-zugeordnet-item${istSchwebend ? ' schwebend' : ''}${istUebertrag ? ' nz-uebertrag' : ''}" data-termin-id="${termin.id}" style="cursor: pointer;" title="${istUebertrag ? 'Übertrag vom Vortag – Klicken zum Bearbeiten' : 'Klicken zum Bearbeiten'}">
            <div class="nz-info">
              <span class="nz-zeit">${zeitenInfo}</span>
              <span class="nz-kunde">${this.escapeHtml(kundenName)}</span>
              <span class="nz-kennzeichen">${this.escapeHtml(termin.kennzeichen || '-')}</span>
            </div>
            <div class="nz-arbeit">${arbeitAnzeige}${istSchwebend ? '<span class="schwebend-indicator">⏸️ Schwebend</span>' : ''}${istUebertrag ? `<span class="uebertrag-indicator">📅 ${vortagLabel}</span>` : ''}</div>
            ${arbeitenSubzeilen}
            <div class="nz-dauer">⏱️ ${this.formatMinutesToHours(zeit)}</div>
          </div>
        `;
      };

      // Zeige nicht zugeordnete Termine
      if (nichtZugeordnet.length > 0 || nichtZugeordnetVortag.length > 0 || nichtZugeordnetFolgetag.length > 0) {
        section.style.display = 'block';

        const gruppenMin = (liste) => liste.reduce((s, t) => s + (t.tatsaechliche_zeit || t.geschaetzte_zeit || 0), 0);
        const nzCount = (n) => `${n} ${n === 1 ? 'Termin' : 'Termine'}`;

        let html = `<div class="nicht-zugeordnet-liste">`;
        let gesamtNichtZugeordnetMinuten = 0;

        // --- Gestern ---
        if (nichtZugeordnetVortag.length > 0) {
          const min = gruppenMin(nichtZugeordnetVortag);
          gesamtNichtZugeordnetMinuten += min;
          html += `<div class="nz-section-header nz-section-header--gestern"><span>⬅️ Gestern (${vortagLabel})</span><span class="nz-section-count">${nzCount(nichtZugeordnetVortag.length)} · ${this.formatMinutesToHours(min)}</span></div>`;
          nichtZugeordnetVortag.forEach(termin => {
            html += renderNzItem(termin, true);
          });
        }

        // --- Heute ---
        if (nichtZugeordnet.length > 0) {
          const min = gruppenMin(nichtZugeordnet);
          gesamtNichtZugeordnetMinuten += min;
          html += `<div class="nz-section-header nz-section-header--heute"><span>📌 Heute (${heuteLabel})</span><span class="nz-section-count">${nzCount(nichtZugeordnet.length)} · ${this.formatMinutesToHours(min)}</span></div>`;
          nichtZugeordnet.forEach(termin => {
            html += renderNzItem(termin, false);
          });
        }

        // --- Morgen ---
        if (nichtZugeordnetFolgetag.length > 0) {
          const min = gruppenMin(nichtZugeordnetFolgetag);
          gesamtNichtZugeordnetMinuten += min;
          html += `<div class="nz-section-header nz-section-header--morgen"><span>➡️ Morgen (${folgetagLabel})</span><span class="nz-section-count">${nzCount(nichtZugeordnetFolgetag.length)} · ${this.formatMinutesToHours(min)}</span></div>`;
          nichtZugeordnetFolgetag.forEach(termin => {
            html += renderNzItem(termin, false);
          });
        }

        const alleTermine = [...nichtZugeordnetVortag, ...nichtZugeordnet, ...nichtZugeordnetFolgetag];
        html += `</div>`;
        html += `<div class="nz-gesamt">
          <strong>Gesamt nicht zugeordnet:</strong> ${this.formatMinutesToHours(gesamtNichtZugeordnetMinuten)} 
          (${alleTermine.length} ${alleTermine.length === 1 ? 'Termin' : 'Termine'})
        </div>`;
        
        container.innerHTML = html;
        
        // Click-Handler für nicht zugeordnete Termine hinzufügen
        container.querySelectorAll('.nicht-zugeordnet-item[data-termin-id]').forEach(item => {
          item.addEventListener('click', async (e) => {
            e.stopPropagation();
            const terminId = parseInt(item.dataset.terminId, 10);
            // Fallback: auch Cache und alle geladenen Termine prüfen
            let termin = alleTermine.find(t => Number(t.id) === terminId)
              || this.termineById[terminId];
            if (termin) {
              this.termineById[terminId] = termin;
            }
            await this.showTerminDetails(terminId);
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



















  // Gibt Wochen für die Monatsübersicht zurück (5 Wochen, Mo-Sa)


  // Heute fällige Ersatzauto-Rückgaben laden


  // ================================================
  // VERBESSERTE KUNDENSUCHE MIT GETRENNTEN FELDERN
  // ================================================

  // Namenssuche mit Live-Vorschlägen

  // Status-Badge für Neuer Kunde / Gefunden aktualisieren

  // Kennzeichen-Feld als Pflichtfeld markieren/entmarkieren

  // Kennzeichen-Suche mit 3 Feldern

  // Kennzeichen normalisieren (ohne Leerzeichen und Bindestriche)
  normalizeKennzeichen(kz) {
    return normalizeKennzeichen(kz);
  }

  // Kennzeichen in Teile zerlegen
  parseKennzeichen(kz) {
    return parseKennzeichen(kz);
  }

  // Kennzeichen mit Highlight formatieren

  // Text mit Highlight für Suchmatch
  highlightMatch(text, search) {
    if (!text || !search) return this._escapeHtml(text || '');
    const escaped = this._escapeHtml(text);
    const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, '<span class="vorschlag-match">$1</span>');
  }

  // Alle Fahrzeuge eines Kunden sammeln (aus Kunden-Daten und Terminen)

  // Kunde aus Namenssuche auswählen
  async selectKundeVorschlag(kundeId) {
    const kunde = (this.kundenCache || []).find(k => k.id === kundeId);
    if (!kunde) return;

    // Dropdown sofort schließen
    this.hideVorschlaege('name');

    // Fahrzeuge vom Backend laden
    let fahrzeuge = [];
    try {
      fahrzeuge = await KundenService.getFahrzeuge(kundeId);
    } catch (error) {
      console.warn('API-Fehler bei getFahrzeuge, nutze lokalen Fallback:', error);
    }

    // Lokaler Fallback: Fahrzeuge aus termineCache sammeln, falls API leer/fehlerhaft
    if (fahrzeuge.length === 0) {
      const kzMap = new Map();

      // 1. Kennzeichen aus termineCache (== für Typsicherheit: id kann String oder Number sein)
      (this.termineCache || [])
        // eslint-disable-next-line eqeqeq
        .filter(t => t.kunde_id == kundeId && t.kennzeichen)
        .forEach(t => {
          const kzNorm = t.kennzeichen.toUpperCase().replace(/[\s\-]/g, '');
          if (!kzMap.has(kzNorm)) {
            kzMap.set(kzNorm, {
              kennzeichen: t.kennzeichen,
              fahrzeugtyp: t.fahrzeugtyp || '',
              vin: t.vin || '',
              letzter_termin: t.datum,
              letzter_km_stand: t.kilometerstand || null
            });
          }
        });

      // 2. Kennzeichen aus Kundenstamm
      if (kunde.kennzeichen) {
        const kzNorm = kunde.kennzeichen.toUpperCase().replace(/[\s\-]/g, '');
        if (!kzMap.has(kzNorm)) {
          kzMap.set(kzNorm, {
            kennzeichen: kunde.kennzeichen,
            fahrzeugtyp: kunde.fahrzeugtyp || '',
            vin: '',
            letzter_termin: null,
            letzter_km_stand: null
          });
        }
      }

      fahrzeuge = Array.from(kzMap.values());
      if (fahrzeuge.length > 0) {
        console.log(`Lokaler Fallback: ${fahrzeuge.length} Fahrzeug(e) für Kunde ${kunde.name}`);
      }
    }

    console.log(`Kunde ${kunde.name} ausgewählt:`, {
      kundeId,
      gefundeneFahrzeuge: fahrzeuge.length,
      fahrzeuge: fahrzeuge.map(f => f.kennzeichen)
    });

    if (fahrzeuge.length === 1) {
      // Genau 1 Fahrzeug → direkt übernehmen
      this.applyKundeAuswahl(kunde, fahrzeuge[0]);
      this.showToast(`🚗 ${fahrzeuge[0].kennzeichen} übernommen`, 'success');
      return;
    }

    if (fahrzeuge.length > 1) {
      // Mehrere Fahrzeuge → Auswahl-Modal
      this.showFahrzeugAuswahlModal(kunde, fahrzeuge);
      return;
    }

    // Kein Fahrzeug gefunden – Kunde übernehmen, Kennzeichen manuell eintragen
    this.applyKundeAuswahl(kunde, null);
  }

  // Fahrzeug-Auswahl Modal anzeigen

  // Fahrzeug aus Modal auswählen

  // Fahrzeug-Auswahl Modal schließen

  // Feature 6: Toggle für Neues-Fahrzeug-Formular im Auswahl-Modal

  // Feature 6: Neues Fahrzeug aus Auswahl-Modal anlegen und direkt auswählen

  // Fahrzeug wechseln: Auswahl-Modal für bereits ausgewählten Kunden nochmals laden

  // Kunde und Fahrzeug auf das Formular anwenden

  // Kennzeichen-Vorschlag auswählen: Felder befüllen und Kunde übernehmen

  // Tastatur-Navigation in Vorschlägen

  // Highlight in Vorschlägen aktualisieren

  // Vorschläge ausblenden

  // Legacy-Funktion für alte Datalist (wird nicht mehr verwendet, aber für Kompatibilität behalten)


  // Original handleTerminSchnellsuche Logik (wird für Rückwärtskompatibilität behalten)






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
  // Rendert Arbeitspausen-Sektion für den SchnellStatusDialog
  _renderSchnellStatusPausen(pausen, terminId) {
    const id = terminId ? `id="schnell-arbeitspausen-${terminId}"` : '';
    if (!pausen || pausen.length === 0) {
      return `<div ${id}></div>`;
    }
    const grundLabels = { teil_fehlt: 'Teil fehlt', rueckfrage_kunde: 'Rückfrage Kunde', vorrang: 'Vorrang' };
    const isoToHHMM = (iso) => {
      if (!iso) return '—';
      const d = new Date(iso);
      return isNaN(d) ? '—' : `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    };
    const gesamtMinutenAbzug = pausen.reduce((sum, p) => {
      if (!p.gestartet_am) return sum;
      const start = new Date(p.gestartet_am);
      const end = p.beendet_am ? new Date(p.beendet_am) : new Date();
      const diff = Math.round((end - start) / 60000);
      return sum + (diff > 0 ? diff : 0);
    }, 0);
    const pausenRows = pausen.map(p => {
      const start = isoToHHMM(p.gestartet_am);
      const ende = p.beendet_am ? isoToHHMM(p.beendet_am) : '<span style="color:#fd7e14;">läuft…</span>';
      const dauerMin = p.gestartet_am ? Math.round(((p.beendet_am ? new Date(p.beendet_am) : new Date()) - new Date(p.gestartet_am)) / 60000) : 0;
      const grundTxt = grundLabels[p.grund] || p.grund || '';
      return `<div style="font-size:0.82em;color:#666;padding:1px 0;">🔧 ${start}–${ende} (${dauerMin} min)${grundTxt ? ' · ' + grundTxt : ''}</div>`;
    }).join('');
    const abzugText = gesamtMinutenAbzug > 0 ? ` <span style="color:#fd7e14;font-size:0.85em;">(−${gesamtMinutenAbzug} min)</span>` : '';
    return `<div ${id}>
      <div class="detail-row">
        <span class="detail-label">🔧</span>
        <span class="detail-value"><strong>Auftragsunterbrechungen</strong>${abzugText}
          ${pausenRows}
        </span>
      </div>
    </div>`;
  }

  showSchnellStatusDialog(termin, element, startzeit, dauer, arbeitName = null) {
    // Arbeitspausen async nachladen und Dialog aktualisieren
    const terminId = termin.id;
    if (!termin.arbeitspausen) {
      ApiService.get(`/arbeitspausen/termin/${terminId}`)
        .then(pausen => {
          termin.arbeitspausen = pausen || [];
          if (this.termineById[terminId]) this.termineById[terminId].arbeitspausen = termin.arbeitspausen;
          const container = document.getElementById(`schnell-arbeitspausen-${terminId}`);
          if (container) container.outerHTML = this._renderSchnellStatusPausen(termin.arbeitspausen);
        })
        .catch(() => {});
    }

    // Alten Dialog entfernen falls vorhanden
    const existingDialog = document.getElementById('schnellStatusDialog');
    if (existingDialog) existingDialog.remove();
    
    const currentStatus = termin.status || 'geplant';
    const heuteDatumStr = new Date().toISOString().slice(0, 10);
    const zeigeWeiterfuehren = termin.datum && termin.datum < heuteDatumStr && termin.datum !== '9999-12-31' && !['abgeschlossen', 'storniert'].includes(currentStatus);
    
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
    const abholDatumText = (termin.abholung_datum || termin.abhol_datum)
      ? this.formatDatum(termin.abholung_datum || termin.abhol_datum)
      : (termin.datum ? this.formatDatum(termin.datum) : '—');
    
    // Geplante Dauer: immer die originale geschaetzte_zeit (ohne Lehrling-Faktor / tatsächliche Zeit)
    // dauer (Parameter) enthält die Timeline-Dauer (kann tatsächliche Zeit × Lehrling-Faktor sein)
    let geplanteDauer = dauer;
    {
      // Bevorzuge Summe der geplanten Einzelzeiten aus arbeitszeiten_details
      let summe = 0;
      try {
        const det = termin.arbeitszeiten_details
          ? (typeof termin.arbeitszeiten_details === 'string'
              ? JSON.parse(termin.arbeitszeiten_details)
              : termin.arbeitszeiten_details)
          : null;
        if (det) {
          for (const [k, v] of Object.entries(det)) {
            if (k.startsWith('_')) continue;
            if (typeof v === 'number' && v > 0) summe += v;
            else if (typeof v === 'object' && parseInt(v.zeit) > 0) summe += parseInt(v.zeit);
          }
        }
      } catch (e) {}
      if (summe > 0) {
        geplanteDauer = summe;
      } else if (parseInt(termin.geschaetzte_zeit) > 0) {
        geplanteDauer = parseInt(termin.geschaetzte_zeit);
      }
    }
    // Dauer formatieren
    const dauerText = geplanteDauer >= 60 
      ? `${Math.floor(geplanteDauer/60)}h ${geplanteDauer%60 > 0 ? (geplanteDauer%60) + 'min' : ''}`.trim()
      : `${geplanteDauer} min`;
    
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
          <p>🏁 Fertigstellung ca.: <strong>${(() => { const endMin = startMinuten + geplanteDauer; return String(Math.floor(endMin/60)%24).padStart(2,'0') + ':' + String(endMin%60).padStart(2,'0'); })()}</strong> (${geplanteDauer >= 60 ? Math.floor(geplanteDauer/60) + 'h ' + (geplanteDauer%60 > 0 ? geplanteDauer%60 + 'min' : '') : geplanteDauer + ' min'} geplant)</p>
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
    
    // Einzelne Arbeit abschließen: Nur anzeigen wenn Multi-Arbeit-Termin und eine bestimmte Arbeit angeklickt wurde
    let einzelArbeitSektion = '';
    if (arbeitName && currentStatus !== 'abgeschlossen') {
      let arbeitDetails = null;
      let arbeitenCount = 0;
      try {
        const det = termin.arbeitszeiten_details
          ? (typeof termin.arbeitszeiten_details === 'string'
              ? JSON.parse(termin.arbeitszeiten_details)
              : termin.arbeitszeiten_details)
          : null;
        if (det) {
          for (const k of Object.keys(det)) {
            if (!k.startsWith('_')) arbeitenCount++;
          }
          arbeitDetails = det[arbeitName];
        }
      } catch (e) {}
      
      const istBereitsAbgeschlossen = arbeitDetails && arbeitDetails.abgeschlossen === true;
      
      if (arbeitenCount > 1 && !istBereitsAbgeschlossen) {
        einzelArbeitSektion = `
          <div class="detail-divider"></div>
          <div style="padding: 4px 0;">
            <p style="font-size:0.85em; color:#555; margin:0 0 6px;">📌 Angeklickte Arbeit: <strong>${arbeitName}</strong></p>
            <button class="btn-schnell-status" data-action="einzelarbeit-abschliessen"
              style="width:100%; background:linear-gradient(135deg, #10b981 0%, #34d399 100%); color:white; border:none; border-radius:8px; padding:10px; font-weight:600; cursor:pointer;">
              ✅ Nur "${arbeitName}" abschließen
            </button>
            <small style="color:#888; display:block; margin-top:4px;">Die anderen Arbeiten bleiben offen und können separat eingeplant werden.</small>
          </div>`;
      } else if (istBereitsAbgeschlossen) {
        einzelArbeitSektion = `
          <div class="detail-divider"></div>
          <div style="padding: 4px 0;">
            <p style="font-size:0.85em; color:#16a34a; margin:0;">✅ "${arbeitName}" ist bereits abgeschlossen</p>
          </div>`;
      }
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
            <span class="detail-label">🏁</span>
            <span class="detail-value">Fertigstellung ca.: <strong>${(() => { const endMin = startMinuten + geplanteDauer; return String(Math.floor(endMin/60)%24).padStart(2,'0') + ':' + String(endMin%60).padStart(2,'0'); })()}</strong></span>
          </div>
          ${(() => {
            // Tatsächliche gestempelte Startzeit aus arbeitszeiten_details._startzeit
            let tatsStart = null;
            try {
              const det = typeof termin.arbeitszeiten_details === 'string'
                ? JSON.parse(termin.arbeitszeiten_details)
                : termin.arbeitszeiten_details;
              if (det && det._startzeit) tatsStart = det._startzeit;
            } catch(e) {}
            if (!tatsStart && termin.startzeit) tatsStart = termin.startzeit;
            const startRow = tatsStart ? `<div class="detail-row"><span class="detail-label">🕐</span><span class="detail-value">Gestartet: <strong style="color:#2563eb;">${tatsStart}</strong></span></div>` : '';
            // Tatsächliche Fertigstellungszeit
            let fertigRow = '';
            let fertigDate = null;
            if (termin.fertigstellung_zeit) {
              fertigDate = new Date(termin.fertigstellung_zeit);
              const fStr = String(fertigDate.getHours()).padStart(2,'0') + ':' + String(fertigDate.getMinutes()).padStart(2,'0');
              fertigRow = `<div class="detail-row"><span class="detail-label" style="color:#16a34a;">✅</span><span class="detail-value">Fertiggestellt: <strong style="color:#16a34a;">${fStr}</strong></span></div>`;
            }
            // Tatsächliche Arbeitszeit: DB-Wert bevorzugen (korrekt beim Abschluss gesetzt)
            // Nur Fallback auf Differenzberechnung wenn tatsaechliche_zeit fehlt
            let tatsZeitRow = '';
            let tatsZeit = (termin.tatsaechliche_zeit && parseInt(termin.tatsaechliche_zeit) > 0)
              ? parseInt(termin.tatsaechliche_zeit)
              : null;
            // Fallback: Differenz aus gestempelter Startzeit → Fertigstellung (nur wenn kein DB-Wert)
            if (!tatsZeit && fertigDate && !isNaN(fertigDate)) {
              let startStr = tatsStart;
              if (startStr) {
                const [sh, sm] = startStr.split(':').map(Number);
                const sd = new Date(fertigDate);
                sd.setHours(sh, sm, 0, 0);
                const diffMs = fertigDate - sd;
                if (diffMs > 0) tatsZeit = Math.round(diffMs / 60000);
              }
            }
            if (tatsZeit && tatsZeit > 0) {
              const tatsH = Math.floor(tatsZeit / 60);
              const tatsM = tatsZeit % 60;
              const tatsStr = tatsH > 0 ? `${tatsH}h${tatsM > 0 ? ' ' + tatsM + 'min' : ''}` : `${tatsM}min`;
              const diff = tatsZeit - geplanteDauer;
              const diffStr = diff !== 0 ? ` <span style="color:${diff > 0 ? '#dc3545' : '#16a34a'};font-size:0.85em;">(${diff > 0 ? '+' : ''}${diff}min)</span>` : '';
              tatsZeitRow = `<div class="detail-row"><span class="detail-label">⏱️</span><span class="detail-value">Tatsächlich: <strong style="color:#16a34a;">${tatsStr}</strong>${diffStr}</span></div>`;
            }
            return startRow + fertigRow + tatsZeitRow;
          })()}
          <div class="detail-row">
            <span class="detail-label">📅</span>
            <span class="detail-value">Abholung: <strong>${abholzeitText}</strong> (${abholDatumText})</span>
          </div>
          ${this._renderSchnellStatusPausen(termin.arbeitspausen, termin.id)}
          <div class="detail-divider"></div>
          <div class="detail-row" style="align-items: center; gap: 6px; flex-wrap: wrap;">
            <span class="detail-label">🕐</span>
            <span style="font-size: 0.85em; color: #555;">Startzeit:</span>
            <input type="time" id="schnellStatusStartzeit" value="${startzeit}"
              style="border: 1px solid #ccc; border-radius: 6px; padding: 3px 7px; font-size: 0.9em; width: 90px;">
            <button data-action="startzeit-setzen" class="btn-schnell-startzeit"
              style="padding: 3px 10px; font-size: 0.82em; border-radius: 6px; border: none; background: #2563eb; color: #fff; cursor: pointer; white-space: nowrap;">
              ✓ Übernehmen
            </button>
            <span id="schnellStartzeitHinweis" style="font-size: 0.78em; color: #16a34a; display: none;">✅ Geändert – Speichern nicht vergessen!</span>
          </div>
          <div class="detail-row" style="align-items: center; gap: 6px; flex-wrap: wrap;">
            <span class="detail-label">🏷️</span>
            <span style="font-size: 0.85em; color: #555;">Interne Nr.:</span>
            <input type="text" id="schnellStatusInterneNr" value="${(termin.interne_auftragsnummer || '').replace(/"/g, '&quot;')}" placeholder="optional"
              style="border: 1px solid #ccc; border-radius: 6px; padding: 3px 7px; font-size: 0.9em; flex: 1; min-width: 120px;">
            <button data-action="interne-nr-setzen" class="btn-schnell-startzeit"
              style="padding: 3px 10px; font-size: 0.82em; border-radius: 6px; border: none; background: #2563eb; color: #fff; cursor: pointer; white-space: nowrap;">
              ✓ Übernehmen
            </button>
            <span id="schnellInterneNrHinweis" style="font-size: 0.78em; color: #16a34a; display: none;">✅ Gespeichert</span>
          </div>
        </div>
        
        ${statusAktionen}
        
        ${einzelArbeitSektion}
        
        <div class="schnell-status-footer">
          <button class="btn-schnell-link" data-action="erweitern" title="Auftrag erweitern">
            ➕ Erweitern
          </button>
          <button class="btn-schnell-link" data-action="verknuepfen" title="Termin mit einem anderen Termin als Erweiterung verknüpfen">
            🔗 Verknüpfen
          </button>
          <button class="btn-schnell-link" data-action="erweitert" title="Mehr bearbeiten">
            ✏️ Mehr...
          </button>
        </div>
        ${zeigeWeiterfuehren ? `
        <div style="padding: 8px 12px 4px;">
          <button class="btn-schnell-link" data-action="weiterfuehren" style="width:100%;text-align:center;background:#fff3e0;color:#e65100;border:1px solid #ffcc80;border-radius:6px;padding:7px;font-weight:600;">
            📅 Am nächsten Arbeitstag weiterführen
          </button>
        </div>` : ''}
        ${!['abgeschlossen', 'storniert'].includes(currentStatus) ? `
        <div style="padding: 4px 12px 8px;">
          <button class="btn-schnell-link" data-action="einplanen" style="width:100%;text-align:center;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:6px;padding:7px;font-weight:600;">
            ⚡ Heute einplanen + morgen fortführen
          </button>
        </div>` : ''}
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Event-Listener für Buttons hinzufügen (Arrow-Function behält this-Kontext)
    dialog.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        
        if (action === 'close') {
          this.closeSchnellStatusDialog();
        } else if (action === 'startzeit-setzen') {
          const neueStartzeit = document.getElementById('schnellStatusStartzeit')?.value;
          if (!neueStartzeit) return;
          // Mitarbeiter-Zuweisung aus Termin-Daten lesen
          let type = 'mitarbeiter';
          let mitarbeiterId = termin.mitarbeiter_id || null;
          let lehrlingId = null;
          try {
            const details = termin.arbeitszeiten_details
              ? (typeof termin.arbeitszeiten_details === 'string'
                  ? JSON.parse(termin.arbeitszeiten_details)
                  : termin.arbeitszeiten_details)
              : {};
            const zuweisung = details._gesamt_mitarbeiter_id;
            if (zuweisung) {
              type = zuweisung.type || 'mitarbeiter';
              if (type === 'lehrling') {
                lehrlingId = zuweisung.id;
                mitarbeiterId = null;
              } else {
                mitarbeiterId = zuweisung.id;
              }
            }
          } catch (e) { /* ignorieren */ }
          await this.moveTerminToMitarbeiterWithTime(terminId, mitarbeiterId, lehrlingId, type, neueStartzeit);
          const hinweis = document.getElementById('schnellStartzeitHinweis');
          if (hinweis) hinweis.style.display = 'inline';
        } else if (action === 'interne-nr-setzen') {
          const neueInterneNr = (document.getElementById('schnellStatusInterneNr')?.value || '').trim();
          try {
            await TermineService.update(terminId, { interne_auftragsnummer: neueInterneNr || null });
            if (this.termineById[terminId]) {
              this.termineById[terminId].interne_auftragsnummer = neueInterneNr || null;
            }
            if (termin) termin.interne_auftragsnummer = neueInterneNr || null;
            const hinweisInt = document.getElementById('schnellInterneNrHinweis');
            if (hinweisInt) {
              hinweisInt.style.display = 'inline';
              setTimeout(() => { if (hinweisInt) hinweisInt.style.display = 'none'; }, 2000);
            }
            this.showToast('🏷️ Interne Auftragsnummer gespeichert', 'success');
          } catch (err) {
            console.error('Fehler beim Speichern der internen Auftragsnummer:', err);
            this.showToast('❌ Speichern fehlgeschlagen', 'error');
          }
        } else if (action === 'abgeschlossen') {
          const zeit = parseInt(btn.dataset.zeit) || null;
          this.setzeSchnellStatus(terminId, 'abgeschlossen', zeit);
        } else if (action === 'abgeschlossen-custom') {
          // Tatsächliche Zeit aus Eingabefeldern lesen
          const stunden = parseInt(document.getElementById('schnellZeitStunden')?.value) || 0;
          const minuten = parseInt(document.getElementById('schnellZeitMinuten')?.value) || 0;
          const gesamtMinuten = stunden * 60 + minuten;
          this.setzeSchnellStatus(terminId, 'abgeschlossen', gesamtMinuten > 0 ? gesamtMinuten : null);
        } else if (action === 'einzelarbeit-abschliessen') {
          this.closeSchnellStatusDialog();
          await this.abschliessenEinzelArbeit(terminId, arbeitName);
        } else if (action === 'erweitern') {
          // Auftrag erweitern - Modal öffnen
          this.closeSchnellStatusDialog();
          this.openErweiterungModalForTermin(terminId);
        } else if (action === 'verknuepfen') {
          this.closeSchnellStatusDialog();
          this.showVerknuepfenDialog(terminId);
        } else if (action === 'erweitert') {
          // Erweitertes Bearbeitungs-Popup öffnen
          this.closeSchnellStatusDialog();
          this.showSchnellBearbeitungDialog(termin);
        } else if (action === 'weiterfuehren') {
          this.closeSchnellStatusDialog();
          this.currentDetailTerminId = terminId;
          await this.weiterfuehrenTermin();
        } else if (action === 'einplanen') {
          this.closeSchnellStatusDialog();
          this.showEinplanenDialog(terminId, termin);
        } else {
          this.setzeSchnellStatus(terminId, action);
        }
      });
    });
    
    // Dialog zentriert im Viewport positionieren
    const dialogRect = dialog.getBoundingClientRect();
    const left = Math.max(10, (window.innerWidth - dialogRect.width) / 2);
    const top = Math.max(10, (window.innerHeight - dialogRect.height) / 2);
    
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

  // Einzelne Arbeit eines Multi-Arbeit-Termins abschließen
  async abschliessenEinzelArbeit(terminId, arbeitName) {
    try {
      const termin = this.termineById[terminId];
      if (!termin) {
        this.showToast('❌ Termin nicht gefunden', 'error');
        return;
      }

      // arbeitszeiten_details parsen
      let details = termin.arbeitszeiten_details
        ? (typeof termin.arbeitszeiten_details === 'string'
            ? JSON.parse(termin.arbeitszeiten_details)
            : { ...termin.arbeitszeiten_details })
        : {};

      // Arbeit in Details finden und als abgeschlossen markieren
      if (!details[arbeitName]) {
        this.showToast(`❌ Arbeit "${arbeitName}" nicht in Details gefunden`, 'error');
        return;
      }

      if (typeof details[arbeitName] !== 'object') {
        details[arbeitName] = { zeit: details[arbeitName] };
      }
      details[arbeitName].abgeschlossen = true;

      // Tatsächliche Zeit: die geplante Zeit der Arbeit als Fallback
      if (!details[arbeitName].tatsaechliche_zeit) {
        details[arbeitName].tatsaechliche_zeit = details[arbeitName].zeit || 30;
      }

      // Prüfe ob ALLE Arbeiten nun abgeschlossen sind
      let alleAbgeschlossen = true;
      let arbeitenGesamt = 0;
      let arbeitenFertig = 0;
      for (const key of Object.keys(details)) {
        if (key.startsWith('_')) continue;
        arbeitenGesamt++;
        if (details[key] && details[key].abgeschlossen === true) {
          arbeitenFertig++;
        } else {
          alleAbgeschlossen = false;
        }
      }

      // Update-Payload
      const updateData = {
        arbeitszeiten_details: JSON.stringify(details)
      };

      // Termin-Status: in_arbeit setzen wenn noch nicht alle fertig, sonst abgeschlossen
      if (alleAbgeschlossen) {
        updateData.status = 'abgeschlossen';
        // Tatsächliche Gesamtzeit berechnen
        let gesamtTatsaechlich = 0;
        for (const key of Object.keys(details)) {
          if (key.startsWith('_')) continue;
          gesamtTatsaechlich += parseInt(details[key].tatsaechliche_zeit) || parseInt(details[key].zeit) || 0;
        }
        updateData.tatsaechliche_zeit = gesamtTatsaechlich;
      } else if (termin.status === 'geplant') {
        updateData.status = 'in_arbeit';
      }

      await TermineService.update(terminId, updateData);

      // Cache aktualisieren
      if (this.termineById[terminId]) {
        this.termineById[terminId].arbeitszeiten_details = JSON.stringify(details);
        if (updateData.status) {
          this.termineById[terminId].status = updateData.status;
        }
        if (updateData.tatsaechliche_zeit) {
          this.termineById[terminId].tatsaechliche_zeit = updateData.tatsaechliche_zeit;
        }
      }

      // Feedback
      if (alleAbgeschlossen) {
        this.showToast(`✅ Alle ${arbeitenGesamt} Arbeiten abgeschlossen — Termin fertig!`, 'success');
      } else {
        this.showToast(`✅ "${arbeitName}" abgeschlossen (${arbeitenFertig}/${arbeitenGesamt} fertig)`, 'success');
      }

      // Visuell aktualisieren
      const arbeitBlock = document.querySelector(`[id^="timeline-arbeit-${terminId}-"][data-arbeit-name="${arbeitName}"]`);
      if (arbeitBlock) {
        arbeitBlock.classList.add('arbeit-abgeschlossen');
        const titleEl = arbeitBlock.querySelector('.termin-title');
        if (titleEl && !titleEl.innerHTML.includes('arbeit-done-badge')) {
          titleEl.innerHTML += ' <span class="arbeit-done-badge">✓</span>';
        }
      }

      // Timeline-Status aktualisieren
      if (updateData.status) {
        this.updateTimelineBlockStatus(terminId, updateData.status);
      }

      // Views neu laden
      this.loadDashboard();
      await this.loadHeuteTermine();
      const planungTab = document.getElementById('auslastung-dragdrop');
      if (planungTab && planungTab.classList.contains('active')) {
        setTimeout(() => this.loadAuslastungDragDrop(), 300);
      }

    } catch (error) {
      console.error('Fehler beim Abschließen der Einzelarbeit:', error);
      this.showToast('❌ Fehler beim Abschließen', 'error');
    }
  }

  // Verknüpfen-Dialog: Termin mit einem anderen als Erweiterung verknüpfen
  showVerknuepfenDialog(terminId) {
    const existing = document.getElementById('verknuepfenDialog');
    if (existing) existing.remove();

    const termin = this.termineById[terminId];
    const terminNr = termin?.termin_nr || `#${terminId}`;

    const dialog = document.createElement('div');
    dialog.id = 'verknuepfenDialog';
    dialog.className = 'schnell-bearbeitung-dialog';
    dialog.innerHTML = `
      <div class="schnell-bearbeitung-overlay"></div>
      <div class="schnell-bearbeitung-content" style="max-width: 420px;">
        <div class="schnell-bearbeitung-header">
          <h3>🔗 Termin verknüpfen</h3>
          <button class="schnell-bearbeitung-close" data-action="close">×</button>
        </div>
        <div class="schnell-bearbeitung-info">
          <span>📋 <strong>${terminNr}</strong> als Erweiterung eines anderen Termins festlegen</span>
        </div>
        <div class="schnell-bearbeitung-form">
          <div class="form-group">
            <label>🔍 Haupt-Termin-Nr. eingeben (z.B. T-2026-045):</label>
            <input type="text" id="verknuepfenTerminNr" placeholder="T-2026-..." autocomplete="off"
              style="text-transform: uppercase;">
            <small style="color: #666; display:block; margin-top:4px;">
              Dieser Termin wird als Erweiterung des eingegebenen Termins markiert.
            </small>
          </div>
          <div id="verknuepfenFundAnzeige" style="display:none; padding:8px 12px; background:#e8f5e9; border-radius:6px; border-left:3px solid #4caf50; font-size:0.9em;"></div>
          <div id="verknuepfenFehler" style="display:none; padding:8px 12px; background:#ffebee; border-radius:6px; border-left:3px solid #f44336; font-size:0.9em; color:#c62828;"></div>
        </div>
        <div class="schnell-bearbeitung-footer">
          <button class="btn-schnell-cancel" data-action="close">Abbrechen</button>
          <button class="btn-schnell-save" data-action="suchen">🔍 Suchen</button>
          <button class="btn-schnell-save" data-action="verknuepfen" style="display:none; background:#7c3aed;">🔗 Verknüpfen</button>
          <button class="btn-schnell-save" data-action="trennen" style="display:none; background:#dc2626;">✂️ Trennen</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Aktuell verknüpft? Zeige "Trennen"-Button
    if (termin?.erweiterung_von_id) {
      const trennBtn = dialog.querySelector('[data-action="trennen"]');
      if (trennBtn) trennBtn.style.display = '';
    }

    let gefundenerElternId = null;

    dialog.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;

        if (action === 'close') {
          dialog.classList.remove('active');
          setTimeout(() => dialog.remove(), 200);

        } else if (action === 'suchen') {
          const eingabe = document.getElementById('verknuepfenTerminNr')?.value?.trim().toUpperCase();
          const fehlerEl = document.getElementById('verknuepfenFehler');
          const fundEl = document.getElementById('verknuepfenFundAnzeige');
          const verknuepfenBtn = dialog.querySelector('[data-action="verknuepfen"]');
          fehlerEl.style.display = 'none';
          fundEl.style.display = 'none';
          gefundenerElternId = null;
          verknuepfenBtn.style.display = 'none';

          if (!eingabe) { fehlerEl.textContent = 'Bitte Termin-Nr. eingeben.'; fehlerEl.style.display = ''; return; }

          try {
            // Suche in Cache zuerst
            const treffer = Object.values(this.termineById).find(t =>
              t.termin_nr && t.termin_nr.toUpperCase() === eingabe && t.id !== terminId
            );
            if (treffer) {
              gefundenerElternId = treffer.id;
              fundEl.innerHTML = `✅ Gefunden: <strong>${this._escapeHtml(treffer.termin_nr)}</strong> — ${this._escapeHtml(treffer.kunde_name || '?')} • ${this._escapeHtml(treffer.kennzeichen || '—')} • ${this._escapeHtml(treffer.datum || '')}`;
              fundEl.style.display = '';
              verknuepfenBtn.style.display = '';
            } else {
              fehlerEl.textContent = `Termin "${eingabe}" nicht im heutigen Cache gefunden. Bitte Datum laden.`;
              fehlerEl.style.display = '';
            }
          } catch (err) {
            fehlerEl.textContent = 'Fehler bei der Suche: ' + err.message;
            fehlerEl.style.display = '';
          }

        } else if (action === 'verknuepfen' && gefundenerElternId) {
          try {
            await TermineService.update(terminId, {
              erweiterung_von_id: gefundenerElternId,
              ist_erweiterung: 1
            });
            if (this.termineById[terminId]) {
              this.termineById[terminId].erweiterung_von_id = gefundenerElternId;
              this.termineById[terminId].ist_erweiterung = 1;
            }
            this.showToast('✅ Termin erfolgreich verknüpft', 'success');
            dialog.classList.remove('active');
            setTimeout(() => dialog.remove(), 200);
            this.loadAuslastungDragDrop?.();
          } catch (err) {
            document.getElementById('verknuepfenFehler').textContent = 'Fehler: ' + err.message;
            document.getElementById('verknuepfenFehler').style.display = '';
          }

        } else if (action === 'trennen') {
          try {
            await TermineService.update(terminId, {
              erweiterung_von_id: null,
              ist_erweiterung: 0
            });
            if (this.termineById[terminId]) {
              this.termineById[terminId].erweiterung_von_id = null;
              this.termineById[terminId].ist_erweiterung = 0;
            }
            this.showToast('✅ Verknüpfung aufgehoben', 'success');
            dialog.classList.remove('active');
            setTimeout(() => dialog.remove(), 200);
            this.loadAuslastungDragDrop?.();
          } catch (err) {
            document.getElementById('verknuepfenFehler').textContent = 'Fehler: ' + err.message;
            document.getElementById('verknuepfenFehler').style.display = '';
          }
        }
      });
    });

    dialog.querySelector('.schnell-bearbeitung-overlay').addEventListener('click', () => {
      dialog.classList.remove('active');
      setTimeout(() => dialog.remove(), 200);
    });

    // Enter-Taste im Suchfeld = Suchen
    document.getElementById('verknuepfenTerminNr')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') dialog.querySelector('[data-action="suchen"]').click();
    });

    setTimeout(() => dialog.classList.add('active'), 10);
    setTimeout(() => document.getElementById('verknuepfenTerminNr')?.focus(), 100);
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
    let fertigstellungszeit = '';
    const _fzRaw = termin.fertigstellung_zeit || termin.geplante_fertigstellung;
    if (_fzRaw) {
      // ISO-Datetime → HH:MM konvertieren (für <input type="time">)
      if (_fzRaw.includes('T') || _fzRaw.includes('Z') || _fzRaw.length > 5) {
        try {
          const _d = new Date(_fzRaw);
          if (!isNaN(_d)) fertigstellungszeit = String(_d.getHours()).padStart(2,'0') + ':' + String(_d.getMinutes()).padStart(2,'0');
          else fertigstellungszeit = _fzRaw;
        } catch(e) { fertigstellungszeit = _fzRaw; }
      } else {
        fertigstellungszeit = _fzRaw; // bereits HH:MM
      }
    }
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
          
          <div class="form-row">
            <div class="form-group">
              <label>🏷️ Interne Auftragsnummer</label>
              <input type="text" id="schnellInterneAuftragsnummer" value="${termin.interne_auftragsnummer || ''}" placeholder="Optionale interne Nummer...">
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
      const interneAuftragsnummer = document.getElementById('schnellInterneAuftragsnummer')?.value?.trim();
      
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
      if (fertigstellung) {
        // HH:MM → ISO-Datetime rekonstruieren für DB-Konsistenz
        const _datumStr = abholDatum || termin.abhol_datum || termin.datum;
        if (_datumStr) {
          try {
            const _iso = new Date(`${_datumStr}T${fertigstellung}:00`);
            updateData.fertigstellung_zeit = isNaN(_iso) ? fertigstellung : _iso.toISOString();
          } catch(e) { updateData.fertigstellung_zeit = fertigstellung; }
        } else {
          updateData.fertigstellung_zeit = fertigstellung;
        }
      }
      if (dauer) {
        // Bei "in_arbeit" oder "abgeschlossen" -> tatsaechliche_zeit für Balkenlänge
        // Sonst -> geschaetzte_zeit
        if (termin && (termin.status === 'in_arbeit' || termin.status === 'abgeschlossen')) {
          updateData.tatsaechliche_zeit = dauer;
        } else {
          updateData.geschaetzte_zeit = dauer;
        }
        // _dauer_override in arbeitszeiten_details speichern, damit getTerminGesamtdauer
        // den explizit gesetzten Wert gegenüber dem Einzel-Arbeiten-Summe bevorzugt.
        try {
          const existingDet = termin?.arbeitszeiten_details
            ? (typeof termin.arbeitszeiten_details === 'string'
                ? JSON.parse(termin.arbeitszeiten_details)
                : { ...termin.arbeitszeiten_details })
            : {};
          existingDet._dauer_override = dauer;
          updateData.arbeitszeiten_details = JSON.stringify(existingDet);
        } catch (e) {
          updateData.arbeitszeiten_details = JSON.stringify({ _dauer_override: dauer });
        }
      }
      if (notizen !== undefined) updateData.notizen = notizen;
      if (interneAuftragsnummer !== undefined) updateData.interne_auftragsnummer = interneAuftragsnummer;
      
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

      // Bei "in_arbeit": Wenn früher gestartet als geplant → tatsächliche Startzeit speichern
      if (neuerStatus === 'in_arbeit') {
        const termin = this.termineById[terminId];
        if (termin) {
          const jetzt = new Date();
          const jetztZeit = String(jetzt.getHours()).padStart(2, '0') + ':' + String(jetzt.getMinutes()).padStart(2, '0');
          const geplanteStartzeit = termin.startzeit || termin.bring_zeit;
          if (geplanteStartzeit && jetztZeit < geplanteStartzeit) {
            updateData.startzeit = jetztZeit;
            updateData.bring_zeit = jetztZeit;
            console.log(`[Vorrücken] Termin ${terminId}: früher gestartet (${geplanteStartzeit} → ${jetztZeit})`);
          }
        }
      }
      
      await TermineService.update(terminId, updateData);
      
      // Cache aktualisieren
      if (this.termineById[terminId]) {
        this.termineById[terminId].status = neuerStatus;
        if (tatsaechlicheMinuten !== null) {
          this.termineById[terminId].tatsaechliche_zeit = tatsaechlicheMinuten;
        }
        if (updateData.startzeit) {
          this.termineById[terminId].startzeit = updateData.startzeit;
          this.termineById[terminId].bring_zeit = updateData.bring_zeit;
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
      
      // Nachrücken: Folge-Termine der selben Person verschieben
      if (neuerStatus === 'in_arbeit' || neuerStatus === 'abgeschlossen') {
        const termin = this.termineById[terminId];
        if (termin) {
          this._nachrueckenFuerTermin(termin).catch(e => console.warn('Nachrücken fehlgeschlagen:', e));
        }
      }

      // Dashboard und andere Views aktualisieren
      this.loadDashboard();
      await this.loadHeuteTermine();

      // Planungsansicht komplett neu laden falls aktiv (Fallback für korrekte Balkendarstellung)
      const planungTab = document.getElementById('auslastung-dragdrop');
      if (planungTab && planungTab.classList.contains('active')) {
        setTimeout(() => this.loadAuslastungDragDrop(), 500);
      }
      
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
      block.classList.remove('status-geplant', 'status-in_arbeit', 'status-in-arbeit', 'status-abgeschlossen', 'status-unterbrochen');
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
      arbeitBlock.classList.remove('status-geplant', 'status-in_arbeit', 'status-in-arbeit', 'status-abgeschlossen', 'status-unterbrochen');
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
  
  // Nachrücken: Folge-Termine einer Person neu berechnen und nach vorne verschieben
  async _nachrueckenFuerTermin(termin) {
    if (!termin || !termin.datum) return;

    let personId = null;
    let personTyp = null;

    // Person aus arbeitszeiten_details._gesamt_mitarbeiter_id ermitteln
    if (termin.arbeitszeiten_details) {
      try {
        const details = typeof termin.arbeitszeiten_details === 'string'
          ? JSON.parse(termin.arbeitszeiten_details)
          : termin.arbeitszeiten_details;
        if (details._gesamt_mitarbeiter_id && details._gesamt_mitarbeiter_id.id) {
          personId = details._gesamt_mitarbeiter_id.id;
          personTyp = details._gesamt_mitarbeiter_id.type || 'mitarbeiter';
        }
      } catch (e) { /* ignorieren */ }
    }

    // Fallback: direkte mitarbeiter_id-Spalte
    if (!personId && termin.mitarbeiter_id) {
      personId = termin.mitarbeiter_id;
      personTyp = 'mitarbeiter';
    }

    if (!personId) return;

    try {
      await ApiService.post('/termine/berechne-zeiten-neu', {
        personId,
        personTyp,
        datum: termin.datum
      });
    } catch (e) {
      console.warn('Nachrücken-API Fehler:', e);
    }
  }

  // Timeline-Block visuell kürzen (bei Abschluss mit tatsächlicher Zeit)
  updateTimelineBlockVisual(terminId, tatsaechlicheMinuten) {
    // Status immer aktualisieren – auch für Multi-Arbeit-Blöcke (timeline-arbeit-{id}-*),
    // die kein korrespondierendes timeline-termin-{id} Element besitzen.
    this.updateTimelineBlockStatus(terminId, 'abgeschlossen');

    const pixelPerMinute = 100 / 60;

    const block = document.getElementById(`timeline-termin-${terminId}`);
    if (block) {
      
      // Ursprüngliche Dauer aus data-Attribut holen
      const originalDauer = parseInt(block.dataset.dauer) || 0;
      
      // Balken auf tatsächliche Dauer anpassen (kürzen oder verlängern)
      if (tatsaechlicheMinuten !== originalDauer && tatsaechlicheMinuten > 0) {
        const neueBreite = Math.max(tatsaechlicheMinuten * pixelPerMinute, 40); // Mindestbreite 40px
        
        // Animation für den Balken
        block.style.transition = 'width 0.3s ease-out';
        block.style.width = `${neueBreite}px`;
        block.dataset.dauer = tatsaechlicheMinuten;
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

    // Multi-Arbeit-Blöcke aktualisieren (timeline-arbeit-{id}-*)
    const arbeitBloecke = document.querySelectorAll(`[id^="timeline-arbeit-${terminId}-"]`);
    if (arbeitBloecke.length > 0) {
      // Per-Arbeit tatsächliche Zeiten aus Cache holen (falls verfügbar)
      let perArbeitZeiten = null;
      const termin = this.termineById ? this.termineById[terminId] : null;
      if (termin && termin.arbeitszeiten_details) {
        try {
          const details = typeof termin.arbeitszeiten_details === 'string'
            ? JSON.parse(termin.arbeitszeiten_details) : termin.arbeitszeiten_details;
          if (Array.isArray(details)) {
            perArbeitZeiten = {};
            details.forEach((a, idx) => {
              if (parseInt(a.tatsaechliche_zeit) > 0) {
                perArbeitZeiten[idx] = parseInt(a.tatsaechliche_zeit);
              }
            });
            if (Object.keys(perArbeitZeiten).length === 0) perArbeitZeiten = null;
          }
        } catch (e) { /* ignorieren */ }
      }

      // Gesamte geplante Dauer aller Haupt-Arbeit-Blöcke berechnen (für proportionale Verteilung)
      let gesamtGeplanteZeit = 0;
      const hauptBloecke = [];
      arbeitBloecke.forEach(ab => {
        if (!ab.id.endsWith('-teil2')) {
          gesamtGeplanteZeit += parseInt(ab.dataset.originalDauer) || parseInt(ab.dataset.dauer) || 0;
          hauptBloecke.push(ab);
        }
      });

      if (gesamtGeplanteZeit > 0 || hauptBloecke.length > 0) {
        // Erst alle teil2-Fortsetzungsblöcke entfernen (Pausen-Splits)
        arbeitBloecke.forEach(ab => {
          if (ab.id.endsWith('-teil2')) {
            ab.style.transition = 'opacity 0.3s ease-out';
            ab.style.opacity = '0';
            setTimeout(() => ab.remove(), 300);
          }
        });

        // Jeden Hauptblock einzeln aktualisieren
        hauptBloecke.forEach(ab => {
          const arbeitIndex = parseInt(ab.dataset.arbeitIndex);
          const blockOriginalDauer = parseInt(ab.dataset.originalDauer) || parseInt(ab.dataset.dauer) || 0;

          // Dauer bestimmen: per-Arbeit tatsächliche Zeit > proportional aus Gesamt
          let neueDauer;
          if (perArbeitZeiten && perArbeitZeiten[arbeitIndex] !== undefined) {
            neueDauer = perArbeitZeiten[arbeitIndex];
          } else if (gesamtGeplanteZeit > 0) {
            neueDauer = Math.max(1, Math.round(tatsaechlicheMinuten * (blockOriginalDauer / gesamtGeplanteZeit)));
          } else {
            neueDauer = Math.round(tatsaechlicheMinuten / hauptBloecke.length);
          }

          const neueBreite = Math.max(neueDauer * pixelPerMinute, 40);

          ab.style.transition = 'width 0.3s ease-out';
          ab.style.width = `${neueBreite}px`;
          ab.dataset.dauer = neueDauer;

          // Abgeschlossen-Klasse hinzufügen
          ab.classList.add('arbeit-abgeschlossen');

          // Dauer-Text aktualisieren
          const dauerInfo = ab.querySelector('.termin-info:not(.arbeit-name)');
          if (dauerInfo) {
            const dauerText = neueDauer >= 60
              ? `${Math.floor(neueDauer/60)}h ${neueDauer%60 > 0 ? (neueDauer%60) + 'min' : ''}`.trim()
              : `${neueDauer} min`;
            dauerInfo.textContent = `✅ ${dauerText}`;
          }
        });
      }
    }
  }

  // Aktuelle Buchungen laden und anzeigen (inkl. manuell gesperrte Autos)






  // Ersatzauto-Übersicht laden (Wochen-Ansicht Mo-So)

  // Gibt Wochen für Ersatzauto-Ansicht zurück (5 Wochen, Mo-So)

  // Kalenderwoche berechnen




  // Neue Funktionen für individuelle Abwesenheiten











  // Berufsschul-Turnus für Lehrlinge laden und anzeigen

  // Berufsschul-Wochen für einen Lehrling speichern


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

  stepZeitKorrektur(inputId, autoId, deltaId, step) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const current = parseFloat(input.value);
    const baseMin = parseInt(document.getElementById(autoId)?.value || '0', 10);
    const baseH = Number.isFinite(baseMin) ? Math.round(baseMin / 15) * 0.25 : 0.5;
    const cur = Number.isFinite(current) && current > 0 ? current : baseH;
    const next = Math.max(0.25, Math.round((cur + step) * 4) / 4);
    input.value = String(next);
    this.updateZeitKorrekturDelta(inputId, autoId, deltaId);
  }

  setZeitkorrektur(inputId, autoId, deltaId, minuten) {
    const input = document.getElementById(inputId);
    if (!input) return;
    // Minuten → Stunden, auf 0.25 gerundet
    input.value = String(Math.round(minuten / 15) * 0.25);
    this.updateZeitKorrekturDelta(inputId, autoId, deltaId);
  }

  updateZeitKorrekturDelta(inputId, autoId, deltaId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const valH = parseFloat(input.value);
    if (!Number.isFinite(valH) || valH <= 0) return;
    const valMin = Math.round(valH * 60);

    // Header immer auf Stepper-Wert setzen
    const wertId = deltaId.replace('Delta', 'Wert');
    const wertEl = document.getElementById(wertId);
    if (wertEl) {
      const std = Math.floor(valMin / 60);
      const min = valMin % 60;
      let zeitStr = std > 0 ? `${std} h${min > 0 ? ` ${min} min` : ''}` : `${min} min`;
      wertEl.textContent = zeitStr;
      if (valMin <= 60) wertEl.style.color = '#27ae60';
      else if (valMin <= 180) wertEl.style.color = '#4a90e2';
      else wertEl.style.color = '#e67e22';
    }
  }

  getGeschaetzteZeit(arbeitenListe) {
    // Sichtbares Feld speichert STUNDEN (z.B. 1.5) → in Minuten umrechnen
    const zeitFeld = document.getElementById('geschaetzte_zeit');
    const input = zeitFeld ? parseFloat(zeitFeld.value) : null;
    if (Number.isFinite(input) && input > 0) {
      return Math.round(input * 60);
    }

    // Edit-Modal manuelles Override-Feld (ebenfalls Stunden)
    const editZeitFeld = document.getElementById('edit_geschaetzte_zeit');
    const editInput = editZeitFeld ? parseFloat(editZeitFeld.value) : null;
    if (Number.isFinite(editInput) && editInput > 0) {
      return Math.round(editInput * 60);
    }

    // KI-Vorschlag aus Zeitschätzungs-Anzeige (Neu-Formular)
    const autoFeld = document.getElementById('geschaetzte_zeit_auto');
    if (autoFeld) {
      const autoMinuten = parseInt(autoFeld.value, 10);
      if (Number.isFinite(autoMinuten) && autoMinuten > 0) {
        return autoMinuten;
      }
    }

    // KI-Vorschlag aus Zeitschätzungs-Anzeige (Edit-Modal)
    const editAutoFeld = document.getElementById('edit_geschaetzte_zeit_auto');
    if (editAutoFeld) {
      const editAutoMinuten = parseInt(editAutoFeld.value, 10);
      if (Number.isFinite(editAutoMinuten) && editAutoMinuten > 0) {
        return editAutoMinuten;
      }
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

  // Normalisiert Text für Fuzzy-Vergleich (So/Wi → so wi, Brems-Service → brems service)
  _normalizeForMatch(text) {
    return text.toLowerCase()
      .replace(/[\/\-_\.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  findArbeitszeit(arbeitName) {
    if (!this.arbeitszeiten || !arbeitName) return null;
    const suche = arbeitName.toLowerCase();
    const normSuche = this._normalizeForMatch(arbeitName);

    // 1. Exakte Bezeichnung
    let match = this.arbeitszeiten.find(a => a.bezeichnung.toLowerCase() === suche);
    if (match) return match.standard_minuten;

    // 2. Exakter Alias
    match = this.arbeitszeiten.find(a => {
      if (!a.aliase) return false;
      return a.aliase.split(',').map(al => al.trim().toLowerCase()).includes(suche);
    });
    if (match) return match.standard_minuten;

    // 3. Fuzzy: normalisierter Vergleich, Teilwort, Wort-Überlappung
    const suchWorte = normSuche.split(' ').filter(w => w.length >= 3);
    match = this.arbeitszeiten.find(a => {
      const normBez = this._normalizeForMatch(a.bezeichnung);
      // Normalisiert exakt
      if (normSuche === normBez) return true;
      // Teilwort (Suche in Bezeichnung oder umgekehrt)
      if (normBez.includes(normSuche) || normSuche.includes(normBez)) return true;
      // Wort-Überlappung
      const bezWorte = normBez.split(' ').filter(w => w.length >= 3);
      if (suchWorte.length > 0 && bezWorte.length > 0) {
        const ueberlappung = suchWorte.filter(sw => bezWorte.some(bw => bw.includes(sw) || sw.includes(bw)));
        if (ueberlappung.length > 0) return true;
      }
      // Alias fuzzy
      if (a.aliase) {
        const aliasListe = a.aliase.split(',').map(al => this._normalizeForMatch(al));
        for (const alias of aliasListe) {
          if (!alias) continue;
          if (alias === normSuche) return true;
          if (alias.includes(normSuche) || normSuche.includes(alias)) return true;
          const aliasWorte = alias.split(' ').filter(w => w.length >= 3);
          if (suchWorte.length > 0 && aliasWorte.length > 0) {
            const ueberlappung = suchWorte.filter(sw => aliasWorte.some(aw => aw.includes(sw) || sw.includes(aw)));
            if (ueberlappung.length > 0) return true;
          }
        }
      }
      return false;
    });
    if (match) return match.standard_minuten;

    return null;
  }

  // Fuzzy-Suche: Findet die passende Standardzeit inkl. des gefundenen Eintrags (für Anzeige)
  findArbeitszeitMitDetails(arbeitName) {
    if (!this.arbeitszeiten || !arbeitName) return null;
    const suche = arbeitName.toLowerCase();
    const normSuche = this._normalizeForMatch(arbeitName);

    // 1. Exakte Bezeichnung
    let match = this.arbeitszeiten.find(a => a.bezeichnung.toLowerCase() === suche);
    if (match) return { ...match, matchTyp: 'exakt' };

    // 2. Exakter Alias
    match = this.arbeitszeiten.find(a => {
      if (!a.aliase) return false;
      return a.aliase.split(',').map(al => al.trim().toLowerCase()).includes(suche);
    });
    if (match) return { ...match, matchTyp: 'alias' };

    // 3. Fuzzy
    const suchWorte = normSuche.split(' ').filter(w => w.length >= 3);
    match = this.arbeitszeiten.find(a => {
      const normBez = this._normalizeForMatch(a.bezeichnung);
      if (normSuche === normBez) return true;
      if (normBez.includes(normSuche) || normSuche.includes(normBez)) return true;
      const bezWorte = normBez.split(' ').filter(w => w.length >= 3);
      if (suchWorte.length > 0 && bezWorte.length > 0) {
        const ueberlappung = suchWorte.filter(sw => bezWorte.some(bw => bw.includes(sw) || sw.includes(bw)));
        if (ueberlappung.length > 0) return true;
      }
      if (a.aliase) {
        const aliasListe = a.aliase.split(',').map(al => this._normalizeForMatch(al));
        for (const alias of aliasListe) {
          if (!alias) continue;
          if (alias === normSuche || alias.includes(normSuche) || normSuche.includes(alias)) return true;
          const aliasWorte = alias.split(' ').filter(w => w.length >= 3);
          if (suchWorte.length > 0 && aliasWorte.length > 0) {
            const ueberlappung = suchWorte.filter(sw => aliasWorte.some(aw => aw.includes(sw) || sw.includes(aw)));
            if (ueberlappung.length > 0) return true;
          }
        }
      }
      return false;
    });
    if (match) return { ...match, matchTyp: 'fuzzy' };

    return null;
  }

  parseArbeiten(text) {
    // Teile nach Zeilenumbruch, Komma ODER ||
    return text
      .split(/[\r\n,]+|\s*\|\|\s*/)
      .map(t => t.trim())
      .filter(Boolean);
  }

  formatMinutesToHours(minuten) {
    return formatMinutesToHours(minuten);
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
    // IMMER frisch aus der DB laden, damit aktuelle Werte angezeigt werden
    let termin = null;
    try {
      termin = await TermineService.getById(terminId);
      if (termin) {
        // Cache aktualisieren
        this.termineById[terminId] = termin;
      }
    } catch (e) {
      console.error('Fehler beim Laden des Termins:', e);
    }
    
    // Fallback auf Cache falls DB-Laden fehlschlägt
    if (!termin) {
      termin = this.termineById[terminId];
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
    
    // Prüfe aktuelle Zeit für Pause (nur wenn Termin vormittags ist)
    const terminStartzeit = termin.startzeit || '08:00';
    const sollPausePruefen = terminStartzeit < '13:00'; // Nur vormittags prüfen
    
    // Optgroup für Mitarbeiter
    if (mitarbeiter.length > 0) {
      mitarbeiter.forEach(ma => {
        const option = document.createElement('option');
        option.value = `ma_${ma.id}`;
        const istAbwesend = abwesendeIds.has(`ma_${ma.id}`);
        const inPause = sollPausePruefen && this.istPersonAktuellInPause(ma);
        
        if (istAbwesend) {
          option.textContent = `🚫 ${ma.name} (ABWESEND)`;
          option.style.color = '#c62828';
          option.disabled = true;
        } else if (inPause) {
          option.textContent = `🍽️ ${ma.name} (in Pause)`;
          option.style.color = '#f57c00';
          // NICHT disabled - Zuordnung erlauben
        } else {
          option.textContent = `👤 ${ma.name}`;
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
        const schule = this.isLehrlingInBerufsschule(l, termin.datum);
        const inPause = sollPausePruefen && this.istPersonAktuellInPause(l);
        
        if (istAbwesend) {
          option.textContent = `🚫 ${l.name} (ABWESEND)`;
          option.style.color = '#c62828';
          option.disabled = true;
        } else if (schule.inSchule) {
          option.textContent = `📚 ${l.name} (KW ${schule.kw} - Berufsschule)`;
          option.style.color = '#1565c0';
          option.disabled = true;
        } else if (inPause) {
          option.textContent = `🍽️ ${l.name} (in Pause)`;
          option.style.color = '#f57c00';
          // NICHT disabled - Zuordnung erlauben
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
    console.log('[DEBUG openModal] Termin:', terminId, 'tatsaechliche_zeit:', termin.tatsaechliche_zeit, 'geschaetzte_zeit:', termin.geschaetzte_zeit, 'gesamtzeit:', gesamtzeit);
    const zeitProArbeit = arbeitenListe.length > 0 ? Math.round(gesamtzeit / arbeitenListe.length) : 30;

    // Füge Gesamtzeit-Eingabefeld VOR den einzelnen Arbeiten ein
    const gesamtzeitHeader = document.createElement('div');
    gesamtzeitHeader.style.cssText = 'margin-bottom: 20px; padding: 15px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #1976d2;';
    gesamtzeitHeader.innerHTML = `
      <div style="display: flex; align-items: center; gap: 15px;">
        <label style="font-weight: 600; font-size: 1.05em;">⏱️ Gesamtzeit:</label>
        <input type="number"
               id="modalGesamtzeitInput"
               value="${(gesamtzeit / 60).toFixed(2)}"
               min="0.25"
               step="0.25"
               placeholder="Std."
               title="Gesamtzeit in Stunden - wird gleichmäßig auf Arbeiten verteilt"
               style="padding: 8px 12px; border: 2px solid #1976d2; border-radius: 4px; width: 100px; font-size: 1.1em; font-weight: 600;"
               oninput="app.updateEinzelzeitenFromGesamtzeit()">
        <span style="color: #1565c0; font-size: 0.9em;">Std. (wird auf Arbeiten verteilt)</span>
      </div>
      <div style="margin-top: 8px; font-size: 0.85em; color: #666;">
        💡 Einzelzeiten unten auf 0 lassen = Gesamtzeit nutzen | Einzelzeiten > 0 = Termin wird geteilt
      </div>
    `;
    liste.appendChild(gesamtzeitHeader);
    console.log('[DEBUG openModal] Gesamtzeit-Input value gesetzt auf:', (gesamtzeit / 60).toFixed(2));

    arbeitenListe.forEach((arbeit, index) => {
      let zeitMinuten;
      let mitarbeiterId = '';
      let teileStatus = ''; // Teile-Status

      // Prüfe zuerst ob individuelle Zeit für diese Arbeit gespeichert ist
      let startzeit = '';
      if (arbeitszeitenDetails[arbeit]) {
        // Neue Struktur: {zeit: 30, mitarbeiter_id: 1, type: 'mitarbeiter', teile_status: 'vorrätig', startzeit: '09:00'} oder alte Struktur: 30
        if (typeof arbeitszeitenDetails[arbeit] === 'object') {
          // Wenn zeit-Feld existiert und > 0, verwende es, sonst 0 (= nutze Gesamtzeit)
          zeitMinuten = (arbeitszeitenDetails[arbeit].zeit && arbeitszeitenDetails[arbeit].zeit > 0) 
            ? arbeitszeitenDetails[arbeit].zeit 
            : 0;
          teileStatus = arbeitszeitenDetails[arbeit].teile_status || '';
          startzeit = arbeitszeitenDetails[arbeit].startzeit || '';
          // Ungültige Startzeiten normalisieren (z.B. "09:60" → "10:00")
          if (startzeit && startzeit.includes(':')) {
            const [_szH, _szM] = startzeit.split(':').map(Number);
            if (!isNaN(_szH) && !isNaN(_szM) && (_szM < 0 || _szM > 59)) {
              const _total = _szH * 60 + _szM;
              startzeit = `${String(Math.floor(_total / 60)).padStart(2, '0')}:${String(_total % 60).padStart(2, '0')}`;
            }
          }
          if (arbeitszeitenDetails[arbeit].type === 'lehrling') {
            mitarbeiterId = `l_${arbeitszeitenDetails[arbeit].mitarbeiter_id || arbeitszeitenDetails[arbeit].lehrling_id}`;
          } else if (arbeitszeitenDetails[arbeit].mitarbeiter_id) {
            mitarbeiterId = `ma_${arbeitszeitenDetails[arbeit].mitarbeiter_id}`;
          } else {
            mitarbeiterId = '';
          }
        } else {
          // Alte Struktur: nur Zahl
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
      const terminStartzeit = termin.startzeit || '08:00';
      const sollPausePruefen = terminStartzeit < '13:00';
      let mitarbeiterOptions = '<option value="">-- Keine Zuordnung --</option>';
      
      // Mitarbeiter
      if (mitarbeiter.length > 0) {
        mitarbeiter.forEach(ma => {
          const value = `ma_${ma.id}`;
          const selected = value === mitarbeiterId ? 'selected' : '';
          const istAbwesend = abwesendeIds.has(value);
          const inPause = sollPausePruefen && this.istPersonAktuellInPause(ma);
          let disabled = '';
          let label = `👤 ${ma.name}`;
          let style = '';
          
          if (istAbwesend) {
            disabled = 'disabled';
            label = `🚫 ${ma.name} (ABWESEND)`;
            style = 'style="color: #c62828;"';
          } else if (inPause) {
            // NICHT disabled - nur kennzeichnen
            label = `🍽️ ${ma.name} (in Pause)`;
            style = 'style="color: #f57c00;"';
          }
          mitarbeiterOptions += `<option value="${value}" ${selected} ${disabled} ${style}>${label}</option>`;
        });
      }
      
      // Lehrlinge
      if (lehrlinge.length > 0) {
        lehrlinge.forEach(l => {
          const value = `l_${l.id}`;
          const selected = value === mitarbeiterId ? 'selected' : '';
          const istAbwesend = abwesendeIds.has(value);
          const schule = this.isLehrlingInBerufsschule(l, termin.datum);
          const inPause = sollPausePruefen && this.istPersonAktuellInPause(l);
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
          } else if (inPause) {
            // NICHT disabled - nur kennzeichnen
            label = `🍽️ ${l.name} (in Pause)`;
            style = 'style="color: #f57c00;"';
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
    const inputs = liste.querySelectorAll('input[id^="modal_zeit_"]');
    let gesamtStunden = 0;

    inputs.forEach(input => {
      gesamtStunden += parseFloat(input.value) || 0;
    });

    document.getElementById('modalGesamtzeit').textContent = gesamtStunden.toFixed(2) + ' h';
    
    // Update das Gesamtzeit-Input NUR wenn Einzelzeiten vorhanden sind (> 0)
    // Wenn alle Einzelzeiten 0 sind, behalte den aktuellen Wert (nutzt Gesamtzeit)
    const gesamtzeitInput = document.getElementById('modalGesamtzeitInput');
    if (gesamtzeitInput && gesamtStunden > 0) {
      gesamtzeitInput.value = gesamtStunden.toFixed(2);
    }
  }

  // Setzt alle Einzelzeiten auf 0 wenn Gesamtzeit geändert wird
  updateEinzelzeitenFromGesamtzeit() {
    const gesamtzeitInput = document.getElementById('modalGesamtzeitInput');
    if (!gesamtzeitInput) return;
    
    const liste = document.getElementById('modalArbeitszeitenListe');
    const zeitInputs = liste.querySelectorAll('input[id^="modal_zeit_"]');
    
    if (zeitInputs.length === 0) return;
    
    // Setze ALLE Einzelzeiten auf 0 = Termin bleibt EINS
    zeitInputs.forEach(input => {
      input.value = '0.00';
    });
    
    // Update Anzeige
    const gesamtStunden = parseFloat(gesamtzeitInput.value) || 0;
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
    console.log(`[ARBEITSZEITEN-SAVE] Start für Termin ${this.currentTerminId}`);

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
    
    // Prüfe ob Gesamtzeit-Input einen Wert hat (für Fall: Gesamtzeit eingegeben, Einzelzeiten alle 0)
    const gesamtzeitInput = document.getElementById('modalGesamtzeitInput');
    const gesamtzeitInputWert = gesamtzeitInput ? (parseFloat(gesamtzeitInput.value) || 0) : 0;

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
      
      // Startzeit auslesen und normalisieren (z.B. "09:60" → "10:00")
      const startzeitInput = document.getElementById(`modal_startzeit_${index}`);
      let startzeit = startzeitInput ? startzeitInput.value.trim() : '';
      if (startzeit && startzeit.includes(':')) {
        const [szH, szM] = startzeit.split(':').map(Number);
        if (!isNaN(szH) && !isNaN(szM) && (szM < 0 || szM > 59)) {
          const totalMin = szH * 60 + szM;
          startzeit = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
        }
      }

      // Prüfe welche Daten vorhanden sind
      const hatTeileStatus = !!teileStatus;
      const hatStartzeit = !!startzeit;
      const hatMitarbeiter = !!(mitarbeiterValue && mitarbeiterValue !== '');
      const hatZeit = zeitMinuten > 0;
      
      // Wenn KEINE Daten vorhanden sind: Diese Arbeit komplett überspringen
      if (!hatTeileStatus && !hatStartzeit && !hatMitarbeiter && !hatZeit) {
        // Entferne die Arbeit aus arbeitszeiten_details wenn vorhanden
        delete arbeitszeitenDetails[arbeitName];
        return; // Überspringe diese Arbeit
      }
      
      // Bestehende Arbeit-Details holen oder neues Objekt erstellen
      let existingDetails = arbeitszeitenDetails[arbeitName];
      
      // In Objekt-Format konvertieren wenn es nur eine Zahl ist
      if (typeof existingDetails === 'number') {
        existingDetails = { zeit: existingDetails };
      } else if (!existingDetails || typeof existingDetails !== 'object') {
        existingDetails = {};
      }
      
      // Aktualisiere die Werte
      // WICHTIG: zeit NUR speichern wenn > 0, sonst fällt getTerminGesamtdauer auf tatsaechliche_zeit zurück
      if (zeitMinuten > 0) {
        existingDetails.zeit = zeitMinuten;
      } else {
        // Zeit ist 0 -> NICHT speichern (damit Termin als GANZES bleibt)
        delete existingDetails.zeit;
      }
      
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
      
      // Speichere das aktualisierte Objekt nur wenn Daten vorhanden sind
      if (Object.keys(existingDetails).length === 0) {
        // Keine Daten mehr -> Arbeit nicht speichern
        delete arbeitszeitenDetails[arbeitName];
      } else if (Object.keys(existingDetails).length === 1 && existingDetails.zeit) {
        // Nur Zeit vorhanden -> als einfache Zahl speichern (Rückwärtskompatibilität)
        arbeitszeitenDetails[arbeitName] = existingDetails.zeit;
      } else {
        // Objekt mit mehreren Feldern oder nur andere Daten (ohne Zeit)
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
    // WICHTIG: Wenn alle Einzelzeiten 0 sind, aber Gesamtzeit-Input ausgefüllt ist, nutze diesen Wert
    let gesamtzeitMinuten;
    if (gesamtStunden === 0 && gesamtzeitInputWert > 0) {
      // Nutze eingegebene Gesamtzeit (alle Einzelzeiten sind 0)
      gesamtzeitMinuten = Math.round(gesamtzeitInputWert * 60);
    } else {
      // Nutze Summe der Einzelzeiten
      gesamtzeitMinuten = Math.round(gesamtStunden * 60);
    }

    let status = document.getElementById('modalTerminStatus').value;

    // Bestimme Mitarbeiter für Termin (Gesamt-Zuordnung hat Vorrang, sonst Termin-Mitarbeiter)
    // Nur Mitarbeiter können dem Termin direkt zugeordnet werden, nicht Lehrlinge
    let terminMitarbeiterId = termin.mitarbeiter_id || null;
    if (gesamtMitarbeiterValue && gesamtMitarbeiterValue.startsWith('ma_')) {
      terminMitarbeiterId = parseInt(gesamtMitarbeiterValue.replace('ma_', ''), 10);
    }
    
    // WICHTIG: Wenn Gesamtzeit-Modus (keine individuellen Zeiten),
    // müssen wir die Zuordnung anpassen
    const hatIndividuelleZeiten = Object.keys(arbeitszeitenDetails).some(key => {
      if (key.startsWith('_')) return false;
      const val = arbeitszeitenDetails[key];
      if (typeof val === 'number' && val > 0) return true;
      if (typeof val === 'object' && val.zeit && val.zeit > 0) return true;
      return false;
    });
    
    if (!hatIndividuelleZeiten) {
      // Gesamtzeit-Modus: Entferne alle individuellen Zuordnungen aus Arbeiten
      Object.keys(arbeitszeitenDetails).forEach(key => {
        if (key.startsWith('_')) return; // Meta-Felder behalten
        const val = arbeitszeitenDetails[key];
        if (typeof val === 'object') {
          // Entferne Zuordnungen, behalte nur Startzeit und Teile-Status
          delete val.mitarbeiter_id;
          delete val.lehrling_id;
          delete val.type;
          
          // Wenn nur noch startzeit oder teile_status übrig ist (aber kein zeit), 
          // ist das auch OK - wird dann beim Laden als Gesamttermin behandelt
          // Aber wenn GAR NICHTS mehr übrig ist, entferne die Arbeit komplett
          const nurMetaDaten = !val.zeit && !val.startzeit && !val.teile_status;
          if (nurMetaDaten || Object.keys(val).length === 0) {
            delete arbeitszeitenDetails[key];
          }
        }
      });
      
      // Wenn Gesamt-Zuordnung ein LEHRLING ist, setze mitarbeiter_id auf NULL
      // (Lehrlinge können nicht auf Top-Level zugeordnet werden)
      if (gesamtMitarbeiterValue && gesamtMitarbeiterValue.startsWith('l_')) {
        terminMitarbeiterId = null;
      }
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

    // _dauer_override synchronisieren: Immer auf den gespeicherten Gesamtwert setzen,
    // damit getTerminGesamtdauer den richtigen Wert liefert (verhindert Stale-Override-Bug).
    if (gesamtzeitMinuten > 0) {
      arbeitszeitenDetails._dauer_override = gesamtzeitMinuten;
    } else {
      delete arbeitszeitenDetails._dauer_override;
    }

    // DEBUG: Zeige was gespeichert wird
    console.log(`[DEBUG SAVE] Termin ${termin.termin_nr}:`, {
      terminId: this.currentTerminId,
      tatsaechliche_zeit: gesamtzeitMinuten,
      mitarbeiter_id: terminMitarbeiterId,
      hatIndividuelleZeiten,
      gesamtMitarbeiterValue,
      arbeitszeitenDetails: JSON.parse(JSON.stringify(arbeitszeitenDetails)), // Deep copy für Log
      status
    });

    try {
      await TermineService.update(this.currentTerminId, {
        tatsaechliche_zeit: gesamtzeitMinuten,
        geschaetzte_zeit: gesamtzeitMinuten,
        arbeitszeiten_details: JSON.stringify(arbeitszeitenDetails),
        status: status,
        mitarbeiter_id: terminMitarbeiterId,
        muss_bearbeitet_werden: mussBearbeitetWerden,
        interne_auftragsnummer: interneAuftragsnummer
      });
      console.log(`[ARBEITSZEITEN-SAVE] Termin ${this.currentTerminId} gespeichert: status=${status}, tatsaechliche_zeit=${gesamtzeitMinuten}min, mitarbeiter_id=${terminMitarbeiterId}`);

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

      // Lösche den Termin aus dem Cache, damit er beim nächsten Mal frisch geladen wird
      delete this.termineById[this.currentTerminId];

      this.closeArbeitszeitenModal();
      this.loadTermine();
      this.loadDashboard();
      this.loadAuslastung();
      
      // Aktualisiere Planung & Zuweisung wenn sichtbar
      const planungTab = document.getElementById('auslastung-dragdrop');
      if (planungTab && planungTab.classList.contains('active')) {
        this.loadAuslastungDragDrop();
      }
      
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

  // Aktualisiert die Datum-Anzeige über dem Kalender
  updateSelectedDatumDisplay() {
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
    const fehler = document.getElementById('terminDatumFehler');
    if (fehler) fehler.style.display = 'none';
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

  // ==========================================
  // SCHNELL-TERMIN KALENDER
  // ==========================================

  setupSchnellKalender() {
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
  }

  updateSchnellDatumDisplay() {
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
  }

  toggleSchnellKalenderPopup() {
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
  }

  closeSchnellKalenderPopup() {
    const popup = document.getElementById('schnellKalenderPopup');
    const arrow = document.getElementById('schnellDatumArrow');
    if (popup) popup.style.display = 'none';
    if (arrow) arrow.style.transform = 'rotate(0deg)';
  }

  async navigateSchnellKalenderMonat(offset) {
    if (!this.schnellKalenderAktuellMonat) this.schnellKalenderAktuellMonat = new Date();
    this.schnellKalenderAktuellMonat.setMonth(this.schnellKalenderAktuellMonat.getMonth() + offset);
    await this.renderSchnellKalender();
  }

  async selectSchnellKalenderHeute() {
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
  }

  async selectSchnellKalenderDatum(datumStr) {
    const datumInput = document.getElementById('schnell_datum');
    if (datumInput) {
      datumInput.value = datumStr;
      datumInput.dispatchEvent(new Event('change'));
    }
    this.updateSchnellDatumDisplay();
    await this.renderSchnellKalender();
    this.closeSchnellKalenderPopup();
  }

  async renderSchnellKalender() {
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
  }

  async loadSchnellKalenderAuslastung(jahr, monat) {
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

  // Hilfsmethode zum Escapen von HTML
  escapeHtml(text) {
    return escapeHtml(text);
  }

  // ==========================================
  // TEILE-STATUS ÜBERSICHT
  // ==========================================

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
      
      html += this.renderZeitleisteRow(nameDisplay, 'Mitarbeiter', istAbwesend ? [] : arbeiten, START_HOUR, END_HOUR, TOTAL_HOURS, jetztMarkerHtml, abwesendStyle, mittagspauseStart, ma.pausenzeit_minuten || mittagspauseDauer);
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
      
      html += this.renderZeitleisteRow(lehrling.name + berufsschulBadge + abwesendBadge, 'Lehrling', istAbwesend ? [] : arbeiten, START_HOUR, END_HOUR, TOTAL_HOURS, jetztMarkerHtml, rowStyle, mittagspauseStart, lehrling.pausenzeit_minuten || mittagspauseDauer);
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
      else if (arbeit.status === 'unterbrochen') statusClass = 'status-unterbrochen';
      
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
      const internInlineClass = arbeit.istIntern ? 'intern-termin' : '';
      const content = `
        <div class="zeitleiste-block-nummer">${arbeit.terminNr || '-'}${schwebendBadge}${erweiterungBadge}</div>
        <div class="zeitleiste-block-text">${arbeit.arbeit}</div>
        <div class="zeitleiste-block-zeit">⏱️ ${(zeitMinuten/60).toFixed(1)}h</div>
        ${zeitInfo ? `<div class="zeitleiste-block-zeiten">${zeitInfo}</div>` : ''}
      `;

      bloeckeHtml += `
        <div class="zeitleiste-block-inline ${statusClass} ${schwebendClass} ${erweiterungClass} ${internInlineClass}"
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
      
      // Kennzeichen oben, Arbeit darunter; bei internen Terminen: Arbeit als primäres Anzeigefeld
      const blockHaupt = arbeit.istIntern
        ? arbeitKurzText
        : (arbeit.kennzeichen || arbeit.kunde);
      const blockArbeit = arbeit.istIntern
        ? (arbeit.kennzeichen && arbeit.kennzeichen !== 'INTERN'
            ? `<span class="zeitleiste-block-arbeit">🔧 ${this.escapeHtml(arbeit.kennzeichen)}</span>`
            : '')
        : `<span class="zeitleiste-block-arbeit">${this.escapeHtml(arbeitKurzText)}</span>`;

      // Nacharbeit-Badge und Style
      const nacharbeitClass = arbeit.istNacharbeit ? 'nacharbeit-block' : '';
      const nacharbeitBadge = arbeit.istNacharbeit
        ? `<span class="zeitleiste-nacharbeit-badge" title="Nacharbeit ab ${arbeit.nacharbeitStartZeit || '?'}">🔧</span>`
        : '';
      const nacharbeitTitleText = arbeit.istNacharbeit
        ? `&#10;🔧 NACHARBEIT (ab ${arbeit.nacharbeitStartZeit || '?'})`
        : '';

      return `
        <div class="zeitleiste-block ${statusClass} ${internClass} ${schwebendClass} ${erweiterungClass} ${nacharbeitClass}" 
             style="left: ${leftPercent}%; width: ${Math.max(widthPercent, 3)}%;"
             onclick="app.openZeitleisteKontextmenu(event, ${arbeit.terminId}, '${this.escapeHtml(arbeit.kunde)}', '${this.escapeHtml(arbeit.arbeit)}', '${arbeit.terminNr}', '${auftragsnrEscaped}')"
             title="${arbeit.kunde}${arbeit.kennzeichen ? ' - ' + arbeit.kennzeichen : ''}&#10;🔧 ${arbeitenTooltip}${fortsetzungText}&#10;${startZeitText} - ${endZeitText} (${dauerText})${abholzeitTooltip}${auftragsnrText}${schwebendTitleText}${erweiterungTitleText}${erweiterungBadgeTitleText}${nacharbeitTitleText}">
          ${nacharbeitBadge}${schwebendBadge}<span class="zeitleiste-block-haupt">${this.escapeHtml(blockHaupt)}</span>${blockArbeit}
          <span class="zeitleiste-block-zeit">${startZeitText} - ${endZeitText}</span>
          ${erweiterungBadge}${istErweiterungIcon}
        </div>
      `;
    };
    
    // Tracke das Ende von Blöcken pro Termin UND global, um Überlappungen zu vermeiden
    const terminEndzeiten = new Map(); // terminId -> letztes Ende in Minuten
    let globalLastEnd = startHour * 60; // Tracke das Ende des letzten Blocks dieser Person
    
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
        
        // Kollisionsvermeidung: Arbeiten desselben Termins nahtlos aneinanderreihen
        // (Abstandspausen / Lücken UND Überlappungen zwischen den Arbeiten automatisch entfernen)
        const terminId = arbeit.terminId;
        if (terminEndzeiten.has(terminId)) {
          const vorherEnde = terminEndzeiten.get(terminId);
          // Immer direkt nach vorheriger Arbeit des gleichen Termins starten (keine Lücken)
          startMinutes = vorherEnde;
          endMinutes = startMinutes + anzeigeZeit;
        }
        
        // NEU: Prüfe auch auf Überlappung mit ALLEN vorherigen Blöcken (andere Termine)
        // Dies verhindert, dass verschiedene Termine sich überlagern
        if (startMinutes < globalLastEnd) {
          // Überlappung mit einem vorherigen Termin! Verschiebe ans Ende
          startMinutes = globalLastEnd;
          endMinutes = startMinutes + anzeigeZeit;
        }
        
        // Wenn die Startzeit in der Pause liegt, nach der Pause verschieben
        if (pauseStartMinuten !== null && startMinutes >= pauseStartMinuten && startMinutes < pauseEndMinuten) {
          startMinutes = pauseEndMinuten;
          // Nach Verschiebung immer Endzeit neu berechnen (endzeitBerechnet basiert auf alter Startzeit)
          endMinutes = startMinutes + anzeigeZeit;
        }
        
        // Speichere das Ende dieses Blocks für Kollisionsvermeidung
        terminEndzeiten.set(terminId, Math.max(terminEndzeiten.get(terminId) || 0, endMinutes));
        globalLastEnd = Math.max(globalLastEnd, endMinutes);
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
      
      // BUG 3 FIX: Prüfe ob der Termin über die Mittagspause geht - aufteilen!
      if (pauseStartMinuten !== null && pauseEndMinuten !== null) {
        // Fall 1: Termin beginnt VOR Pause und endet IN oder NACH der Pause
        if (startMinutes < pauseStartMinuten && endMinutes > pauseStartMinuten) {
          // Teil 1: Vor der Pause (bis Pause-Start)
          const teil1End = pauseStartMinuten;
          bloeckeHtml += renderBlock(arbeit, startMinutes, teil1End, false);
          
          // Teil 2: Nach der Pause (mit verbleibender Zeit)
          const verbrauchteZeit = teil1End - startMinutes;
          const verbleibendeZeit = anzeigeZeit - verbrauchteZeit;
          if (verbleibendeZeit > 0) {
            const teil2Start = pauseEndMinuten;
            const teil2End = teil2Start + verbleibendeZeit;
            bloeckeHtml += renderBlock(arbeit, teil2Start, teil2End, true);
            currentEndMinutes = teil2End;
            globalLastEnd = Math.max(globalLastEnd, teil2End);
            // Tatsächliches Ende nach Pause merken (für lückenlose Anreihung der nächsten Arbeit)
            terminEndzeiten.set(arbeit.terminId, Math.max(terminEndzeiten.get(arbeit.terminId) || 0, teil2End));
          } else {
            currentEndMinutes = pauseEndMinuten;
            globalLastEnd = Math.max(globalLastEnd, pauseEndMinuten);
            terminEndzeiten.set(arbeit.terminId, Math.max(terminEndzeiten.get(arbeit.terminId) || 0, pauseEndMinuten));
          }
          continue; // Springe zum nächsten Termin
        }
        
        // Fall 2: Termin beginnt WÄHREND der Pause - wurde oben bereits verschoben
        // Fall 3: Termin endet WÄHREND der Pause - Pause überspringen für nächsten Block
        if (endMinutes > pauseStartMinuten && endMinutes <= pauseEndMinuten) {
          bloeckeHtml += renderBlock(arbeit, startMinutes, endMinutes, false);
          currentEndMinutes = pauseEndMinuten; // Nächster Block beginnt NACH der Pause
          globalLastEnd = Math.max(globalLastEnd, pauseEndMinuten);
          terminEndzeiten.set(arbeit.terminId, Math.max(terminEndzeiten.get(arbeit.terminId) || 0, pauseEndMinuten));
          continue;
        }
      }
      
      // Kein Pausenkonflikt - normal rendern
      bloeckeHtml += renderBlock(arbeit, startMinutes, endMinutes, false);
      currentEndMinutes = endMinutes;
      globalLastEnd = Math.max(globalLastEnd, endMinutes);
    }

    bloeckeHtml += '</div>';

    // Arbeitspausen-Overlays: orange schraffierte Blöcke für Termin-Unterbrechungen
    let arbeitspausenHtml = '';
    const isoToMin = (iso) => {
      if (!iso) return null;
      const d = new Date(iso);
      return isNaN(d) ? null : d.getHours() * 60 + d.getMinutes();
    };
    const grundLabels = { teil_fehlt: 'Teil fehlt', rueckfrage_kunde: 'Rückfrage Kunde', vorrang: 'Vorrang' };
    const jetztMin = new Date().getHours() * 60 + new Date().getMinutes();
    for (const arbeit of sortedArbeiten) {
      if (!arbeit.arbeitspausen || arbeit.arbeitspausen.length === 0) continue;
      if (arbeit.status !== 'in_arbeit' && arbeit.status !== 'abgeschlossen' && arbeit.status !== 'wartend') continue;
      for (const p of arbeit.arbeitspausen) {
        const pStartMin = isoToMin(p.gestartet_am);
        if (pStartMin === null) continue;
        const pEndeMin = p.beendet_am ? isoToMin(p.beendet_am) : jetztMin;
        if (pEndeMin === null || pEndeMin <= pStartMin) continue;
        const displayStart = Math.max(pStartMin, startHour * 60);
        const displayEnd = Math.min(pEndeMin, endHour * 60);
        if (displayEnd <= displayStart) continue;
        const leftPct = ((displayStart - startHour * 60) / (totalHours * 60)) * 100;
        const widthPct = ((displayEnd - displayStart) / (totalHours * 60)) * 100;
        if (widthPct <= 0) continue;
        const istAktiv = !p.beendet_am;
        const grundTxt = grundLabels[p.grund] || p.grund || '';
        const dauerMin = Math.round(pEndeMin - pStartMin);
        const startHHMM = `${Math.floor(pStartMin/60).toString().padStart(2,'0')}:${(pStartMin%60).toString().padStart(2,'0')}`;
        const endeHHMM = `${Math.floor(pEndeMin/60).toString().padStart(2,'0')}:${(pEndeMin%60).toString().padStart(2,'0')}`;
        const tipText = `🔧 Auftragsunterbrechung&#10;${startHHMM}–${endeHHMM} (${dauerMin} min)${grundTxt ? '&#10;Grund: ' + grundTxt : ''}${istAktiv ? '&#10;(läuft…)' : ''}`;
        const label = widthPct > 3 ? `🔧 ${dauerMin}′` : '';
        arbeitspausenHtml += `<div class="zeitleiste-arbeitspause${istAktiv ? ' aktiv' : ''}" style="left:${leftPct.toFixed(2)}%;width:${widthPct.toFixed(2)}%;position:absolute;top:4px;bottom:4px;background:repeating-linear-gradient(45deg,#fd7e14,#fd7e14 3px,rgba(253,126,20,0.2) 3px,rgba(253,126,20,0.2) 7px);border-left:2px solid #fd7e14;border-right:2px solid #fd7e14;border-radius:3px;z-index:12;pointer-events:all;cursor:help;display:flex;align-items:center;justify-content:center;" title="${tipText}"><span style="font-size:10px;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.6);white-space:nowrap;pointer-events:none;">${label}</span></div>`;
      }
    }

    return `
      <div class="${rowClass}">
        <div class="zeitleiste-mitarbeiter">
          <span class="zeitleiste-mitarbeiter-name">${this.escapeHtml(name)}</span>
          ${typ ? `<span class="zeitleiste-mitarbeiter-typ">${typ}</span>` : ''}
        </div>
        <div class="zeitleiste-timeline" style="position:relative;">
          ${gitterHtml}
          ${mittagspauseHtml}
          ${jetztMarkerHtml}
          ${bloeckeHtml}
          ${arbeitspausenHtml}
        </div>
      </div>
    `;
  }

  minutesToTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  timeToMinutes(timeString) {
    if (!timeString || typeof timeString !== 'string') return 0;
    // Normalisiere HHMM (4-stellig ohne Doppelpunkt, z.B. "0501" → "05:01")
    let t = timeString.trim();
    if (/^\d{3,4}$/.test(t)) {
      t = t.padStart(4, '0');
      t = `${t.slice(0, 2)}:${t.slice(2)}`;
    }
    const [hours, minutes] = t.split(':').map(Number);
    return (hours * 60) + (minutes || 0);
  }

  // Normalisiert eine Zeitangabe auf das Format "HH:MM"
  // z.B. "0501" → "05:01", "08:00" bleibt unverändert
  normalizeZeit(zeitStr) {
    if (!zeitStr || typeof zeitStr !== 'string') return zeitStr;
    const t = zeitStr.trim();
    if (/^\d{3,4}$/.test(t)) {
      const padded = t.padStart(4, '0');
      return `${padded.slice(0, 2)}:${padded.slice(2)}`;
    }
    return zeitStr;
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

    // Schnell-Zeitfelder mit aktuellen Werten vorbefüllen
    const termin = this.termineById[terminId];
    const startzeitInput = document.getElementById('kontextmenuStartzeit');
    const fertigInput = document.getElementById('kontextmenuFertigstellung');
    if (startzeitInput) {
      startzeitInput.value = (termin && termin.startzeit) ? String(termin.startzeit).substring(0, 5) : '';
      startzeitInput.style.borderColor = '';
    }
    if (fertigInput) {
      let fertig = '';
      if (termin && termin.fertigstellung_zeit) {
        const fz = termin.fertigstellung_zeit;
        if (fz.includes('T') || fz.includes('Z')) {
          const d = new Date(fz);
          if (!isNaN(d)) fertig = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        } else {
          fertig = String(fz).substring(0, 5);
        }
      }
      fertigInput.value = fertig;
      fertigInput.style.borderColor = '';
    }
    
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

  async saveZeitleisteKontextZeitenSchnell() {
    const terminId = this.zeitleisteKontextTerminId;
    if (!terminId) return;

    const startzeitInput = document.getElementById('kontextmenuStartzeit');
    const fertigInput = document.getElementById('kontextmenuFertigstellung');
    const zeitRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

    const startzeitVal = startzeitInput ? startzeitInput.value.trim() : '';
    const fertigVal = fertigInput ? fertigInput.value.trim() : '';

    // Validierung
    if (startzeitVal && !zeitRegex.test(startzeitVal)) {
      if (startzeitInput) startzeitInput.style.borderColor = '#cc4444';
      this.showToast('Startzeit-Stempelung: Bitte HH:MM eingeben', 'error');
      return;
    }
    if (fertigVal && !zeitRegex.test(fertigVal)) {
      if (fertigInput) fertigInput.style.borderColor = '#cc4444';
      this.showToast('Fertigstellungszeit: Bitte HH:MM eingeben', 'error');
      return;
    }
    if (!startzeitVal && !fertigVal) {
      this.showToast('Keine Zeiten eingegeben', 'warning');
      return;
    }

    const termin = this.termineById[terminId];
    const datum = termin ? termin.datum : new Date().toISOString().slice(0, 10);
    const updatePayload = {};

    if (startzeitVal) {
      updatePayload.startzeit = startzeitVal;
    }
    if (fertigVal) {
      const iso = new Date(`${datum}T${fertigVal}:00`);
      updatePayload.fertigstellung_zeit = isNaN(iso.getTime()) ? fertigVal : iso.toISOString();
    }

    try {
      await TermineService.update(terminId, updatePayload);
      // Cache aktualisieren
      if (this.termineById[terminId]) {
        if (updatePayload.startzeit) this.termineById[terminId].startzeit = updatePayload.startzeit;
        if (updatePayload.fertigstellung_zeit) this.termineById[terminId].fertigstellung_zeit = updatePayload.fertigstellung_zeit;
      }
      this.showToast('✅ Zeiten gespeichert', 'success');
      this.closeZeitleisteKontextmenu();
      this.updateTimelineBlockStatus(terminId, termin ? termin.status : null);
    } catch (e) {
      console.error('[saveZeitleisteKontextZeitenSchnell] Fehler:', e);
      this.showToast('Fehler beim Speichern der Zeiten', 'error');
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




  /**
   * Fügt eine aktive Pause zur Timeline hinzu (30 min Block)
   * HINWEIS: Pausenblöcke sind nicht verschiebbar (locked), aber Termine können
   * darüber hinweg gezogen und in der Pausenzeit platziert werden (pointerEvents: none)
   * @param {HTMLElement} track - Timeline Track Element
   * @param {object} pauseInfo - Pause-Info Objekt mit pause_start_zeit und verbleibende_minuten
   * @param {number} startHour - Start der Timeline (z.B. 8)
   */

  /**
   * Fügt gesperrte Zeitbereiche zur Timeline hinzu (vor Arbeitsbeginn und nach Arbeitsende)
   * @param {HTMLElement} track - Timeline Track Element
   * @param {string} arbeitsbeginn - Arbeitsbeginn im Format "HH:MM"
   * @param {string} arbeitsende - Arbeitsende im Format "HH:MM"
   * @param {number} startHour - Start der Timeline (z.B. 8)
   * @param {number} endHour - Ende der Timeline (z.B. 18)
   */

  /**
   * Prüft ob eine Position (in Pixel) in einem gesperrten Bereich liegt
   * @param {HTMLElement} track - Timeline Track Element
   * @param {number} posX - X-Position in Pixel relativ zum Track
   * @returns {boolean} true wenn Position gesperrt ist
   */

  /**
   * Rendert schwebende Termine als Balken im separaten Panel
   * @param {Array} schwebendeTermine - Array mit schwebenden Terminen
   * @param {HTMLElement} container - Container für die Balken
   */

  /**
   * Richtet Drop-Zone für schwebende Termine ein (zum Verschieben von Terminen in "Nicht zugeordnet")
   */

  /**
   * Sortiert das Array von schwebenden Terminen
   */

  /**
   * Handler für Sortierungs-Änderung
   */

  // =============================================================================
  // ÜBERFÄLLIGE TERMINE (aus Vortagen, nicht abgeschlossen)
  // =============================================================================

  /**
   * Lädt unterbrochene Aufträge (Teil-2-Termine ohne Datum, warten auf Einplanung)
   */



  /**
   * Lädt überfällige Termine (aus vergangenen Tagen, die noch nicht abgeschlossen sind)
   */

  /**
   * Rendert die überfälligen Termine
   */

  /**
   * Markiert einen überfälligen Termin als abgeschlossen
   */

  /**
   * Plant einen überfälligen Termin auf ein neues Datum - öffnet Modal
   */

  /**
   * Schließt das Neu-Einplanen Modal
   */

  /**
   * Setzt das Datum im Neu-Einplanen Modal (Schnellauswahl)
   */

  /**
   * Bestätigt das Neu-Einplanen und führt es aus
   */

  /**
   * Aktualisiert den Auslastungsbalken in Planung & Zuweisung
   */

  /**
   * Ermittelt die Dringlichkeit eines Termins
   */

  /**
   * Erstellt einen Balken für einen schwebenden Termin
   */

  /**
   * Schwebenden Termin in den aktuell gewählten Tag einplanen - Modal öffnen
   */
  
  /**
   * Modal für schwebende Termine schließen
   */
  
  /**
   * Schnellauswahl-Datum für schwebende Termine setzen
   */
  
  /**
   * Schwebenden Termin einplanen bestätigen
   */

  /**
   * Gibt einen kurzen Text zu den Arbeiten eines Termins zurück
   */

  // Hilfsmethode: Ermittle Zuordnung einer einzelnen Arbeit

  // Erstellt ein Timeline-Element für einen Arbeitsblock

  
  // Hilfsfunktion: Drag Events für Arbeitsblöcke

  // Erstellt eine Mini-Card für einen nicht zugeordneten Arbeitsblock

  // Berechne die tatsächliche Gesamtdauer aus arbeitszeiten_details

  // Erstellt Timeline-Termine mit Berücksichtigung der Mittagspause
  // Gibt ein Array von Elementen zurück (1 Element normal, 2 Elemente wenn über Pause geteilt)

  // Hilfsmethode: Erstellt ein einzelnes Timeline-Termin-Element

  // Alte Methode für Kompatibilität (ohne Pause-Berücksichtigung)

  // Zeit-Indikator erstellen

  // Zeit-Indikator entfernen

  // Zeit-Indikator aktualisieren


  // Berechnet die Überlappungsdauer zwischen zwei Zeiträumen in Minuten

  // Prüft nach Drop auf Überlappungen und zeigt detaillierte Warnung

  // Prüft ob ein Drop an dieser Position eine Kollision verursacht
  // excludeElementId kann terminId oder arbeit-block-id sein

  // Versucht einen freien Slot zu finden und berücksichtigt nahe Termine

  // Berechnet die optimale Startzeit wenn nahe an einem anderen Termin

  // Vertikale Positionslinie anzeigen (mit Kollisions-Feedback)

  // Verschiebt einen einzelnen Arbeitsblock (nicht den ganzen Termin)

  // UI-Aktualisierung für verschobenen Arbeitsblock


  // UI-Aktualisierung für verschobenen Termin (ohne Datenbank-Zugriff)

  // Aktualisiere UI-Elemente für Änderungszähler

  // Raster für Snap-Grid ändern

  // Alle Änderungen speichern

  // Alle Änderungen verwerfen

  // Aktualisiert Balkenbreiten für alle laufenden (in_arbeit) Termine in der DragDrop-Timeline.
  // Wird jede Minute aufgerufen damit der Balken "mitwächst" wenn der Termin länger dauert als geplant.

  /**
   * Zeichnet Arbeitspausen-Overlays auf die Timeline-Tracks.
   * Für Termine mit echten Stempel-Zeiten (in_arbeit/wartend/abgeschlossen) wird jede
   * abgeschlossene Arbeitspause als orange schraffierter Block auf dem Track dargestellt.
   */






  // =============================================================================
  // KI-ASSISTENT FUNKTIONEN (Version 1.2.0)
  // =============================================================================

  /**
   * Initialisiert alle Event-Listener für den KI-Assistenten
   */

  /**
   * Event-Listener für Teile-Bestellen Tab
   */
  async _checkUpdateStatus() {
    const icon = document.getElementById('updateCheckIcon');
    const text = document.getElementById('updateCheckText');
    const box = document.getElementById('updateCheckInfo');
    const commitsList = document.getElementById('updateCommitsList');
    const updateBtn = document.getElementById('triggerUpdateBtn');
    if (!icon || !text) return;

    icon.textContent = '⏳';
    text.textContent = 'Prüfe auf Updates...';
    if (box) box.style.background = '#f5f5f5';

    try {
      const res = await SystemService.checkForUpdates();
      if (!res?.success) throw new Error(res?.message || 'Fehler');

      if (res.upToDate) {
        icon.textContent = '✅';
        text.textContent = `Aktuell (${res.version || ''} · ${res.currentHash})`;
        if (box) box.style.background = '#e8f5e9';
        if (commitsList) commitsList.style.display = 'none';
        if (updateBtn) { updateBtn.disabled = true; updateBtn.textContent = '✅ Aktuell'; }
      } else {
        icon.textContent = '🟡';
        text.textContent = `${res.commits.length} neues Update verfügbar (${res.version || ''} · ${res.currentHash} → ${res.remoteHash})`;
        if (box) box.style.background = '#fff8e1';
        if (commitsList) {
          commitsList.innerHTML = res.commits.map(c => `• ${c}`).join('<br>');
          commitsList.style.display = 'block';
        }
        if (updateBtn) { updateBtn.disabled = false; updateBtn.textContent = `🔄 Update starten (${res.commits.length} Commit${res.commits.length > 1 ? 's' : ''})`; }
      }
    } catch (err) {
      icon.textContent = '⚠️';
      text.textContent = 'Versionscheck nicht verfügbar (nur Linux)';
      if (box) box.style.background = '#f5f5f5';
      if (updateBtn) { updateBtn.disabled = false; updateBtn.textContent = '🔄 Update starten'; }
    }
  }

  async _triggerServerUpdate() {
    const btn = document.getElementById('triggerUpdateBtn');
    const statusBox = document.getElementById('updateStatusInfo');
    const logBox = document.getElementById('updateLogBox');
    const logContent = document.getElementById('updateLogContent');
    if (!confirm('Update jetzt starten?\n\ngit pull + npm install + Server-Neustart.\nDie Verbindung wird kurz unterbrochen.')) return;

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Starte Update...'; }
    if (statusBox) { statusBox.style.display = 'none'; }

    try {
      const res = await SystemService.triggerUpdate();
      if (res?.success) {
        if (statusBox) {
          statusBox.style.cssText = 'display:block; background:#e8f5e9; border:1px solid #a5d6a7; color:#1b5e20; margin-top:12px; padding:10px 14px; border-radius:6px; font-size:0.9em;';
          statusBox.textContent = '✅ Update gestartet – lese Log...';
        }
        // Log anzeigen und live pollen
        if (logBox) logBox.style.display = 'block';
        let logAttempts = 0;
        const pollLog = setInterval(async () => {
          try {
            const logRes = await SystemService.getUpdateLog(80);
            if (logRes?.log && logContent) {
              logContent.textContent = logRes.log;
              logContent.scrollTop = logContent.scrollHeight;
            }
          } catch (_) {}
          logAttempts++;
          if (logAttempts > 72) clearInterval(pollLog); // max 6min
        }, 5000);

        // Auf Server-Neustart warten
        let attempts = 0;
        const tryReload = setInterval(async () => {
          attempts++;
          try {
            const baseUrl = CONFIG.API_URL.replace(/\/$/, '');
            await fetch(`${baseUrl}/api/health`);
            clearInterval(tryReload);
            clearInterval(pollLog);
            if (statusBox) statusBox.textContent = '✅ Update abgeschlossen – Seite wird neu geladen...';
            setTimeout(() => location.reload(), 1500);
          } catch (_) {
            if (statusBox) statusBox.textContent = `🔄 Warte auf Server-Neustart... (${attempts * 5}s)`;
            if (attempts >= 60) { clearInterval(tryReload); clearInterval(pollLog); location.reload(); }
          }
        }, 5000);
      } else {
        if (statusBox) {
          statusBox.style.cssText = 'display:block; background:#fff3e0; border:1px solid #ffcc80; color:#e65100; margin-top:12px; padding:10px 14px; border-radius:6px; font-size:0.9em;';
          statusBox.textContent = '⚠️ ' + (res?.message || 'Update nicht möglich');
        }
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Update starten'; }
      }
    } catch (err) {
      if (statusBox) {
        statusBox.style.cssText = 'display:block; background:#ffebee; border:1px solid #ef9a9a; color:#b71c1c; margin-top:12px; padding:10px 14px; border-radius:6px; font-size:0.9em;';
        statusBox.textContent = '❌ Fehler: ' + err.message;
      }
      if (btn) { btn.disabled = false; btn.textContent = '🔄 Update starten'; }
    }
  }

  /**
   * Nur Frontend neu kompilieren (npm run build) ohne git pull oder Neustart.
   * Nützt den neuen /api/system/build-frontend Endpoint mit process.execPath.
   */
  async _buildFrontend() {
    const btn = document.getElementById('triggerBuildFrontendBtn');
    const statusBox = document.getElementById('updateStatusInfo');
    const logBox = document.getElementById('updateLogBox');
    const logContent = document.getElementById('updateLogContent');

    if (!confirm('Frontend jetzt neu kompilieren?\n\nnpm install + npm run build (ca. 30–60 Sek.)\nKein Server-Neustart – Änderungen sind sofort verfügbar.')) return;

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Build läuft...'; }
    if (statusBox) { statusBox.style.display = 'none'; }

    try {
      const res = await SystemService.buildFrontend();
      if (res?.success) {
        if (statusBox) {
          statusBox.style.cssText = 'display:block; background:#e8f5e9; border:1px solid #a5d6a7; color:#1b5e20; margin-top:12px; padding:10px 14px; border-radius:6px; font-size:0.9em;';
          statusBox.textContent = '✅ Build gestartet – Log wird aktualisiert...';
        }
        if (logBox) logBox.style.display = 'block';

        // Log live pollen
        let attempts = 0;
        const pollLog = setInterval(async () => {
          try {
            const logRes = await SystemService.getUpdateLog(60);
            if (logRes?.log && logContent) {
              logContent.textContent = logRes.log;
              logContent.scrollTop = logContent.scrollHeight;
              // Bei "BUILD OK" aufhören
              if (logRes.log.includes('BUILD OK') || logRes.log.includes('FRONTEND-BUILD ABGESCHLOSSEN')) {
                clearInterval(pollLog);
                if (statusBox) statusBox.textContent = '✅ Build abgeschlossen! Seite wird neu geladen...';
                setTimeout(() => location.reload(), 2000);
              } else if (logRes.log.includes('BUILD FEHLGESCHLAGEN')) {
                clearInterval(pollLog);
                if (statusBox) {
                  statusBox.style.background = '#fff3e0';
                  statusBox.style.color = '#e65100';
                  statusBox.textContent = '❌ Build fehlgeschlagen – siehe Log oben';
                }
              }
            }
          } catch (_) {}
          attempts++;
          if (attempts > 24) clearInterval(pollLog); // max 2min
        }, 5000);

      } else {
        if (statusBox) {
          statusBox.style.cssText = 'display:block; background:#fff3e0; border:1px solid #ffcc80; color:#e65100; margin-top:12px; padding:10px 14px; border-radius:6px; font-size:0.9em;';
          statusBox.textContent = '⚠️ ' + (res?.message || 'Build nicht möglich (nur Linux)');
        }
      }
    } catch (err) {
      if (statusBox) {
        statusBox.style.cssText = 'display:block; background:#ffebee; border:1px solid #ef9a9a; color:#b71c1c; margin-top:12px; padding:10px 14px; border-radius:6px; font-size:0.9em;';
        statusBox.textContent = '❌ Fehler: ' + err.message;
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔨 Frontend neu bauen'; }
    }
  }

  async _triggerServerShutdown() {
    const btn = document.getElementById('triggerShutdownBtn');
    const statusBox = document.getElementById('updateStatusInfo');
    if (!confirm('⚠️ Server wirklich herunterfahren?\n\nDer Server wird NICHT automatisch neu starten!\nEin manueller Start am Server ist nötig.')) return;

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Herunterfahren...'; }
    try {
      await SystemService.shutdownServer();
      if (statusBox) {
        statusBox.style.cssText = 'display:block; background:#ffebee; border:1px solid #ef9a9a; color:#b71c1c; margin-top:12px; padding:10px 14px; border-radius:6px; font-size:0.9em;';
        statusBox.textContent = '🔴 Server wird heruntergefahren – diese Seite ist in Kürze nicht mehr erreichbar.';
      }
    } catch (err) {
      if (statusBox) {
        statusBox.style.cssText = 'display:block; background:#ffebee; border:1px solid #ef9a9a; color:#b71c1c; margin-top:12px; padding:10px 14px; border-radius:6px; font-size:0.9em;';
        statusBox.textContent = '❌ ' + err.message;
      }
      if (btn) { btn.disabled = false; btn.textContent = '🔴 Server herunterfahren'; }
    }
  }

  async _triggerServerRestart() {
    const btn = document.getElementById('triggerRestartBtn');
    const statusBox = document.getElementById('updateStatusInfo');
    if (!confirm('Server jetzt neu starten?\n\nKein git pull – nur Dienst-Neustart.')) return;

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Neustart...'; }
    try {
      await SystemService.restartService();
      if (statusBox) {
        statusBox.style.cssText = 'display:block; background:#e3f2fd; border:1px solid #90caf9; color:#0d47a1; margin-top:12px; padding:10px 14px; border-radius:6px; font-size:0.9em;';
        statusBox.textContent = '⚡ Neustart gestartet – warte auf Server...';
      }
      let attempts = 0;
      const wait = setInterval(async () => {
        attempts++;
        try {
          const baseUrl = CONFIG.API_URL.replace(/\/$/, '');
          await fetch(`${baseUrl}/api/health`);
          clearInterval(wait);
          if (statusBox) statusBox.textContent = '✅ Server wieder erreichbar – Seite wird neu geladen...';
          setTimeout(() => location.reload(), 1000);
        } catch (_) {
          if (statusBox) statusBox.textContent = `⚡ Warte auf Neustart... (${attempts * 3}s)`;
          if (attempts >= 40) { clearInterval(wait); location.reload(); }
        }
      }, 3000);
    } catch (err) {
      if (statusBox) {
        statusBox.style.cssText = 'display:block; background:#ffebee; border:1px solid #ef9a9a; color:#b71c1c; margin-top:12px; padding:10px 14px; border-radius:6px; font-size:0.9em;';
        statusBox.textContent = '❌ ' + err.message;
      }
      if (btn) { btn.disabled = false; btn.textContent = '⚡ Nur neu starten'; }
    }
  }

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
      if (result.async && result.jobId) {
        this._pollKIPlanungJob(result.jobId, 'tages', datum);
      } else if (result.success && result.vorschlag) {
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
      if (result.async && result.jobId) {
        this._pollKIPlanungJob(result.jobId, 'wochen', datum);
      } else if (result.success && result.vorschlag) {
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
   * Ollama-Job pollen bis fertig (alle 3 Sekunden)
   */
  async _pollKIPlanungJob(jobId, type, datum, attempt = 0) {
    if (attempt > 40) { // max ~2 Minuten
      this.showKIPlanungError('Timeout: Ollama hat zu lange gebraucht. Bitte erneut versuchen.');
      return;
    }
    // Fortschrittstext aktualisieren
    const loading = document.getElementById('kiPlanungLoading');
    if (loading) {
      const sek = attempt * 3;
      const dots = '.'.repeat((attempt % 3) + 1);
      const span = loading.querySelector('span') || loading;
      span.textContent = `🦙 Ollama denkt${dots} (${sek}s) – läuft im Hintergrund`;
    }
    await new Promise(r => setTimeout(r, 3000));
    try {
      const res = await KIPlanungService.getJobStatus(jobId);
      if (res.status === 'pending') {
        this._pollKIPlanungJob(jobId, type, datum, attempt + 1);
      } else if (res.status === 'done' && res.vorschlag) {
        if (type === 'tages') this.displayKITagesvorschlag(res.vorschlag, datum);
        else this.displayKIWochenvorschlag(res.vorschlag, res.wochentage);
      } else {
        this.showKIPlanungError(res.error || 'Fehler bei der KI-Verarbeitung');
      }
    } catch (err) {
      this.showKIPlanungError(err.message || 'Verbindungsfehler beim Abrufen des Ergebnisses');
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

  /**
   * Schaltet den Tablet-Modus ein/aus
   */

  /**
   * Lädt die komplette Team-Übersicht (alle Mitarbeiter + Lehrlinge)
   */

  /**
   * Prüft ob ein Termin einer Person zugeordnet ist
   * Berücksichtigt sowohl direkte ID als auch arbeitszeiten_details
   */

















  /**
   * Rendert eine Kachel für einen Mitarbeiter oder Lehrling
   * @param {Object} person - Mitarbeiter oder Lehrling
   * @param {Array} alleTermine - Alle Termine für heute
   * @param {string} typ - 'mitarbeiter' oder 'lehrling'
   * @param {Object} kontext - Berechnungskontext mit globaleNebenzeitProzent, mitarbeiter, lehrlinge
   */

  /**
   * Öffnet Pause-Modal und startet Arbeitspause nach Grundauswahl
   */

  /**
   * Beendet aktive Arbeitspause für einen Termin
   */






  /**
   * Berechnet den Fortschritt basierend auf der verstrichenen Zeit
   */

  /**
   * Berechnet die verbleibende Zeit
   */

  /**
   * Ermittelt die effektive Arbeitszeit eines Termins
   * Priorität: arbeitszeiten_details > geschaetzte_zeit > 60 Min (Fallback)
   */

  /**
   * Ermittelt die effektive Arbeitszeit eines Termins MIT Nebenzeit und Aufgabenbewältigung
   * Wird für die Intern-Ansicht verwendet, wo die Person bekannt ist
   * @param {Object} termin - Der Termin
   * @param {Object} person - Mitarbeiter oder Lehrling
   * @param {boolean} isLehrling - Ob es ein Lehrling ist
   * @param {Object} kontext - Berechnungskontext mit globaleNebenzeitProzent
   */

  /**
   * Liest die effektive Startzeit eines Termins:
   * Bevorzugt arbeitszeiten_details._startzeit (geplante Einsatzzeit),
   * fällt auf termin.startzeit bzw. bring_zeit zurück.
   */

  /**
   * Berechnet die geplante Endzeit MIT Nebenzeit/Aufgabenbewältigung
   */

  /**
   * Berechnet den Fortschritt basierend auf der verstrichenen Zeit MIT Faktoren.
   * Verwendet die berechnete Endzeit (inkl. Pause) als Basis, damit Fortschritt
   * und "Fertig ca."-Anzeige konsistent bleiben.
   */

  /**
   * Berechnet die verbleibende Zeit MIT Faktoren.
   * Basiert auf der berechneten Endzeit (inkl. Pause), damit "Rest" und
   * "Fertig ca." konsistent sind.
   */

  /**
   * Extrahiert Arbeiten aus arbeitszeiten_details für die Anzeige
   * @param {Object} termin - Der Termin
   * @returns {Array} Array mit {name, zeit}
   */

  /**
   * Berechnet die geplante Endzeit
   */
  berechneEndzeit(termin) {
    // Für abgeschlossene Termine: Verwende fertigstellung_zeit falls vorhanden
    if (termin.status === 'abgeschlossen' && termin.fertigstellung_zeit) {
      return termin.fertigstellung_zeit;
    }
    
    // Verwende endzeit_berechnet falls vorhanden (vom Server vorberechnet)
    if (termin.endzeit_berechnet) {
      return termin.endzeit_berechnet;
    }
    
    // Fallback: Berechne lokal aus Startzeit und Dauer
    const startzeit = termin.startzeit || termin.bring_zeit;
    if (!startzeit) return '--:--';
    
    // Hole effektive Arbeitszeit
    const dauer = this.getEffektiveArbeitszeit(termin);
    
    const [stunden, minuten] = startzeit.split(':').map(Number);
    
    const endMinuten = stunden * 60 + minuten + dauer;
    const endStunden = Math.floor(endMinuten / 60);
    const endMin = endMinuten % 60;
    
    return `${String(endStunden).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
  }

  /**
   * Prüft ob eine Person aktuell in der Mittagspause ist
   * Berücksichtigt die 6h-Regel: Pause nur bei >= 6h Arbeitszeit pro Tag
   * @param {Object} person - Mitarbeiter oder Lehrling Objekt mit wochenarbeitszeit_stunden, arbeitstage_pro_woche, mittagspause_start, pausenzeit_minuten
   * @param {string|null} aktuelleZeit - Aktuelle Zeit im Format HH:MM (optional, default: jetzt)
   * @returns {boolean} - true wenn Person gerade in Pause ist
   */

  /**
   * Gibt für einen 'geplant'-Termin die dynamisch aufgerundete Startzeit zurück.
   * Liegt die gespeicherte Startzeit in der Vergangenheit (oder fehlt), wird die
   * aktuelle Uhrzeit auf die nächste volle halbe Stunde aufgerundet.
   * Liegt die gespeicherte Startzeit noch in der Zukunft, wird sie unverändert zurückgegeben.
   * Für 'in_arbeit'/'abgeschlossen'-Termine wird immer die gespeicherte Zeit zurückgegeben.
   *
   * @param {Object} termin
   * @returns {string} Uhrzeit im Format "HH:MM"
   */

  /**
   * Berechnet die Wartezeit bis zu einem Termin
   */

  /**
   * Öffnet Termin-Details vom Intern-Tab aus
   */

  /**
   * Lädt alle internen Termine und zeigt sie in einer Liste
   */

  /**
   * Rendert eine Kachel für einen internen Termin
   */

  /**
   * Öffnet den Bearbeitungsdialog für einen internen Termin (im Modal)
   */

  /**
   * Lädt Mitarbeiter/Lehrlinge für das Edit-Select
   */

  /**
   * Schließt das Bearbeiten-Modal
   */

  /**
   * Speichert die Änderungen am internen Termin
   */

  /**
   * Löscht den internen Termin aus dem Modal
   */

  /**
   * Lädt interne Termine für die Liste im Sub-Tab
   */

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

  /**
   * Normalisiert einen String für Fuzzy-Suche
   * - Konvertiert zu Kleinbuchstaben
   * - Ersetzt Umlaute (ä→ae, ö→oe, ü→ue, ß→ss)
   * - Entfernt Sonderzeichen
   * - Entfernt mehrfache Leerzeichen
   * @param {string} str - Zu normalisierender String
   * @returns {string} Normalisierter String
   */

  /**
   * Berechnet einen Ähnlichkeits-Score (0-100) zwischen Suchbegriff und Zieltext
   * @param {string} search - Suchbegriff
   * @param {string} target - Zieltext
   * @returns {number} Score zwischen 0 (keine Übereinstimmung) und 100 (exakt)
   */


  /**
   * Fuzzy-Suche über mehrere Felder eines Kunden
   * @param {string} searchTerm - Suchbegriff
   * @param {Object} kunde - Kundenobjekt
   * @returns {Object} { match: boolean, score: number, matchedField: string }
   */


  /**
   * Führt eine Fuzzy-Suche über alle Kunden durch
   * @param {string} searchTerm - Suchbegriff
   * @param {number} limit - Maximale Anzahl der Ergebnisse (Standard: 10)
   * @returns {Array} Sortierte Liste von { kunde, score, matchedField }
   */

  /**
   * Rendert Fuzzy-Search-Ergebnisse mit Score-Anzeige
   * @param {Array} results - Ergebnisse von fuzzySearchKunden
   * @param {HTMLElement} container - Container für die Ergebnisse
   */

  /**
   * Filtert die Kundenliste mit Fuzzy-Search
   * Wird von filterKundenListe aufgerufen
   */

  /**
   * Rendert die Kundenliste mit Fuzzy-Score-Anzeige
   * @param {Array} results - Ergebnisse von fuzzySearchKunden
   */

  /**
   * Baut den Fuzzy-Search-Index für schnellere Suche auf
   * Wird einmal nach dem Laden der Kunden aufgerufen
   */

  // === ENDE FUZZY SEARCH FUNKTIONEN ===

  // === WOCHENARBEITSZEITVERWALTUNG ===

  /**
   * Berechnet die verfügbare Tageskapazität eines Mitarbeiters/Lehrlings in Minuten
   * Berücksichtigt: Wochenarbeitszeit, Arbeitstage, Pausenzeiten, Samstag-Regelung, Sonntage und Abwesenheiten
   * Neu: Nutzt flexible Arbeitszeiten-API mit Priorität: Spezifisches Datum > Wochentag-Muster > Standard-Wochenarbeitszeit
   * 
   * @param {Object} person - Mitarbeiter- oder Lehrlinge-Objekt
   * @param {String} datum - Datum im Format YYYY-MM-DD
   * @param {Array} abwesenheiten - Optional: Liste aller Abwesenheiten (wird geladen falls nicht übergeben)
   * @returns {Promise<Number>} Verfügbare Minuten (0 bei Abwesenheit/Sonntag)
   */
  async calculateTageskapazitaetMinuten(person, datum, abwesenheiten = null) {
    if (!person || !datum) {
      return 0;
    }

    // 1. Abwesenheiten prüfen
    if (!abwesenheiten) {
      try {
        abwesenheiten = await fetch(`${CONFIG.API_URL}/abwesenheiten/datum/${datum}`)
          .then(res => res.json());
      } catch (error) {
        console.error('Fehler beim Laden von Abwesenheiten:', error);
        abwesenheiten = [];
      }
    }

    // Prüfe ob person an diesem Datum abwesend ist
    const istAbwesend = abwesenheiten.some(ab => {
      if (person.id) {
        // person.id könnte mitarbeiter_id oder lehrling_id sein - prüfe beide
        return (ab.mitarbeiter_id === person.id || ab.lehrling_id === person.id);
      }
      return false;
    });

    if (istAbwesend) {
      return 0; // Bei Abwesenheit keine Kapazität
    }

    // 2. Versuche flexible Arbeitszeiten-API (neue Funktion seit v1.6.0)
    try {
      const mitarbeiterId = person.mitarbeiter_id || (person.id && !person.aufgabenbewaeltigung_prozent ? person.id : null);
      const lehrlingId = person.lehrling_id || (person.id && person.aufgabenbewaeltigung_prozent !== undefined ? person.id : null);

      if (mitarbeiterId || lehrlingId) {
        const queryParam = mitarbeiterId ? `mitarbeiter_id=${mitarbeiterId}` : `lehrling_id=${lehrlingId}`;
        const arbeitszeitenEintrag = await fetch(
          `${CONFIG.API_URL}/arbeitszeiten-plan/for-date?${queryParam}&datum=${datum}`
        ).then(res => res.ok ? res.json() : null);

        // Wenn spezifischer Eintrag oder Wochentag-Muster gefunden
        if (arbeitszeitenEintrag && arbeitszeitenEintrag.arbeitsstunden !== undefined) {
          const istFrei = arbeitszeitenEintrag.ist_frei === 1;
          if (istFrei) {
            return 0; // Freier Tag
          }

          // HINWEIS: Pausenzeit wird NICHT abgezogen - 8h Arbeitszeit = 8h verfügbar
          const arbeitsMinuten = (arbeitszeitenEintrag.arbeitsstunden * 60);
          
          // Nebenzeit berücksichtigen
          const nebenzeit = person.nebenzeit_prozent || 0;
          const mitNebenzeit = arbeitsMinuten * (1 + nebenzeit / 100);
          
          return Math.max(0, mitNebenzeit);
        }
      }
    } catch (error) {
      console.warn('Flexible Arbeitszeiten-API nicht verfügbar, nutze Fallback:', error.message);
    }

    // 3. Fallback: Alte Logik mit Standard-Wochenarbeitszeit
    const date = new Date(datum + 'T12:00:00');
    const wochentag = date.getDay();

    // Sonntag = immer 0 Minuten
    if (wochentag === 0) {
      return 0;
    }

    // 3. Samstag - prüfe ob aktiv
    if (wochentag === 6) {
      const samstagAktiv = person.samstag_aktiv === 1 || person.samstag_aktiv === true;
      if (!samstagAktiv) {
        return 0; // Samstag nicht aktiv
      }

      // Berechne Samstags-Kapazität aus Zeitfenster
      const start = person.samstag_start || '09:00';
      const ende = person.samstag_ende || '12:00';
      // HINWEIS: Pausenzeit wird NICHT abgezogen
      const pause = person.samstag_pausenzeit_minuten || 0;

      const [startH, startM] = start.split(':').map(Number);
      const [endeH, endeM] = ende.split(':').map(Number);
      const startMinuten = startH * 60 + startM;
      const endeMinuten = endeH * 60 + endeM;
      const arbeitszeit = endeMinuten - startMinuten; // Pause NICHT abziehen

      // Nebenzeit berücksichtigen (nur bei Mitarbeitern relevant)
      const nebenzeit = person.nebenzeit_prozent || 0;
      const mitNebenzeit = arbeitszeit * (1 + nebenzeit / 100);

      return Math.max(0, mitNebenzeit);
    }

    // 4. Mo-Fr: Berechne aus Wochenarbeitszeit
    const wochenarbeitszeit = person.wochenarbeitszeit_stunden || 40;
    const arbeitstage = person.arbeitstage_pro_woche || 5;
    const pausenzeit = person.pausenzeit_minuten || 30;

    // Tageskapazität = (Wochenarbeitszeit / Arbeitstage × 60)
    // HINWEIS: Pausenzeit wird NICHT abgezogen - 8h Arbeitszeit = 8h verfügbar
    const tagesStunden = wochenarbeitszeit / arbeitstage;
    const tagesMinuten = (tagesStunden * 60);

    // Nebenzeit berücksichtigen
    const nebenzeit = person.nebenzeit_prozent || 0;
    const mitNebenzeit = tagesMinuten * (1 + nebenzeit / 100);

    // Fallback: Wenn Wochenarbeitszeit nicht gesetzt, nutze alte arbeitsstunden_pro_tag
    if (!person.wochenarbeitszeit_stunden && person.arbeitsstunden_pro_tag) {
      const altesSystem = (person.arbeitsstunden_pro_tag * 60);
      const mitNebenzeit = altesSystem * (1 + nebenzeit / 100);
      return Math.max(0, mitNebenzeit);
    }

    return Math.max(0, mitNebenzeit);
  }

  /**
   * Synchrone Version: Berechnet Tageskapazität ohne API-Aufruf
   * Verwendet bereits geladene Abwesenheiten
   * 
   * @param {Object} person - Mitarbeiter- oder Lehrling-Objekt
   * @param {String} datum - Datum im Format YYYY-MM-DD
   * @param {Array} abwesenheiten - Liste aller Abwesenheiten
   * @returns {Number} Verfügbare Minuten (0 bei Abwesenheit/Sonntag)
   */
  calculateTageskapazitaetMinutenSync(person, datum, abwesenheiten = []) {
    if (!person || !datum) {
      return 0;
    }

    // 1. Prüfe ob person an diesem Datum abwesend ist
    const istAbwesend = abwesenheiten.some(ab => {
      if (person.id) {
        return (ab.mitarbeiter_id === person.id || ab.lehrling_id === person.id);
      }
      return false;
    });

    if (istAbwesend) {
      return 0; // Bei Abwesenheit keine Kapazität
    }

    // 2. Wochentag ermitteln (0 = Sonntag, 6 = Samstag)
    const date = new Date(datum + 'T12:00:00');
    const wochentag = date.getDay();

    // Sonntag = immer 0 Minuten
    if (wochentag === 0) {
      return 0;
    }

    // 3. Samstag - prüfe ob aktiv
    if (wochentag === 6) {
      const samstagAktiv = person.samstag_aktiv === 1 || person.samstag_aktiv === true;
      if (!samstagAktiv) {
        return 0; // Samstag nicht aktiv
      }

      // Berechne Samstags-Kapazität aus Zeitfenster
      const start = person.samstag_start || '09:00';
      const ende = person.samstag_ende || '12:00';
      // HINWEIS: Pausenzeit wird NICHT abgezogen
      const pause = person.samstag_pausenzeit_minuten || 0;

      const [startH, startM] = start.split(':').map(Number);
      const [endeH, endeM] = ende.split(':').map(Number);
      const startMinuten = startH * 60 + startM;
      const endeMinuten = endeH * 60 + endeM;
      const arbeitszeit = endeMinuten - startMinuten; // Pause NICHT abziehen

      // Nebenzeit berücksichtigen (nur bei Mitarbeitern relevant)
      const nebenzeit = person.nebenzeit_prozent || 0;
      const mitNebenzeit = arbeitszeit * (1 + nebenzeit / 100);

      return Math.max(0, mitNebenzeit);
    }

    // 4. Mo-Fr: Berechne aus Wochenarbeitszeit
    const wochenarbeitszeit = person.wochenarbeitszeit_stunden || 40;
    const arbeitstage = person.arbeitstage_pro_woche || 5;
    const pausenzeit = person.pausenzeit_minuten || 30;

    // Tageskapazität = (Wochenarbeitszeit / Arbeitstage × 60)
    // HINWEIS: Pausenzeit wird NICHT abgezogen - 8h Arbeitszeit = 8h verfügbar
    const tagesStunden = wochenarbeitszeit / arbeitstage;
    const tagesMinuten = (tagesStunden * 60);

    // Nebenzeit berücksichtigen
    const nebenzeit = person.nebenzeit_prozent || 0;
    const mitNebenzeit = tagesMinuten * (1 + nebenzeit / 100);

    // Fallback: Wenn Wochenarbeitszeit nicht gesetzt, nutze alte arbeitsstunden_pro_tag
    if (!person.wochenarbeitszeit_stunden && person.arbeitsstunden_pro_tag) {
      const altesSystem = (person.arbeitsstunden_pro_tag * 60);
      const mitNebenzeit = altesSystem * (1 + nebenzeit / 100);
      return Math.max(0, mitNebenzeit);
    }

    return Math.max(0, mitNebenzeit);
  }

  /**
   * Findet den nächsten verfügbaren Arbeitstag mit ausreichender Kapazität
   * 
   * @param {Object} person - Mitarbeiter oder Lehrling
   * @param {String} startDatum - Start-Datum für Suche (YYYY-MM-DD)
   * @param {Number} benoetigteMinuten - Benötigte Kapazität in Minuten
   * @param {Number} maxTage - Maximale Anzahl Tage vorausschauend (Standard: 14)
   * @returns {Promise<Object>} { datum, verfuegbareMinuten } oder null
   */
  async findeNaechstenVerfuegbarenTag(person, startDatum, benoetigteMinuten, maxTage = 14) {
    const startDate = new Date(startDatum + 'T12:00:00');
    
    // Abwesenheiten für Zeitraum laden
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + maxTage);
    const endDatumStr = this.formatDateLocal(endDate);
    
    let abwesenheiten = [];
    try {
      abwesenheiten = await fetch(`${CONFIG.API_URL}/abwesenheiten/range?datum_von=${startDatum}&datum_bis=${endDatumStr}`)
        .then(res => res.json());
    } catch (error) {
      console.error('Fehler beim Laden von Abwesenheiten:', error);
    }

    // Iteriere durch die nächsten Tage
    for (let i = 1; i <= maxTage; i++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(checkDate.getDate() + i);
      const checkDatumStr = this.formatDateLocal(checkDate);

      const kapazitaet = await this.calculateTageskapazitaetMinuten(person, checkDatumStr, abwesenheiten);

      if (kapazitaet >= benoetigteMinuten) {
        return {
          datum: checkDatumStr,
          verfuegbareMinuten: kapazitaet
        };
      }
    }

    return null; // Kein passender Tag gefunden
  }

  // ======== FLEXIBLE ARBEITSZEITEN FUNKTIONEN ========

  /**
   * Lädt alle Mitarbeiter und Lehrlinge in das Dropdown zur Personenauswahl
   */

  /**
   * Lädt Arbeitszeiten für die ausgewählte Person
   */

  /**
   * Lädt Datum-spezifische Arbeitszeiten-Einträge
   */

  /**
   * Speichert Wochenmuster für die ausgewählte Person
   */

  /**
   * Speichert Datum-spezifischen Zeitraum
   */

  /**
   * Löscht einen Arbeitszeiten-Eintrag
   */

  /**
   * Setzt Arbeitszeiten auf Standard (Wochenarbeitszeit) zurück
   */

  /**
   * Aktualisiert Stunden-Felder wenn "Frei" gecheckt wird
   */

  /**
   * Berechnet Endzeit basierend auf Start + Stunden + Pause
   */

  /**
   * Berechnet Arbeitsstunden basierend auf Start/Ende - Pause
   */

  /**
   * Uncheckt "Frei" wenn Stunden > 0 eingegeben werden
   */

  /**
   * Lädt Schicht-Templates und zeigt Buttons an
   */

  /**
   * Wendet Schicht-Template auf Mo-Fr an
   */

  // ==================== SCHICHT-VORLAGEN VERWALTUNG ====================
  
  currentEditSchichtId = null;

  /**
   * Lädt Schicht-Templates in die Verwaltungstabelle
   */

  /**
   * Formular-Submit für Schicht-Template
   */

  /**
   * Schicht-Template bearbeiten
   */

  /**
   * Schicht-Template löschen
   */

  /**
   * Bearbeitung abbrechen
   */

  /**
   * Formular zurücksetzen
   */

  /**
   * =================================================================
   * TABLET-STEUERUNG
   * =================================================================
   */

  /**
   * Tablet-Einstellungen laden und UI aktualisieren
   */

  /**
   * Display-Zeiten speichern
   */

  /**
   * Manuellen Display-Status setzen
   */

  /**
   * Status-UI aktualisieren
   */

  /**
   * Aktiviert/Deaktiviert Stunden-Felder im Datumsbereichs-Formular
   */


  // === ENDE WOCHENARBEITSZEITVERWALTUNG ===

  // =====================================================
  // ========== KALENDER TAB =============================
  // =====================================================

  // --- Kalender State ---
  kalenderState = {
    datum: null,        // aktuell gewähltes Datum (Date-Objekt)
    ansicht: 'zeitleiste', // 'zeitleiste' oder 'liste'
    activeSubTab: 'kalenderWoche',
    termineCache: {},   // datum-string -> [termine]
    abwesenheitenCache: null,
    initialized: false
  };

  /**
   * Kalender initialisieren beim Tab-Wechsel
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Nicht wenn in Input/Textarea/Select
      const tag = document.activeElement?.tagName;
      if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;

      if (e.altKey) {
        switch (e.key) {
          case '1': e.preventDefault(); this.switchToTab('dashboard'); break;
          case '2': e.preventDefault(); this.switchToTab('termine'); break;
          case '3': e.preventDefault(); this.switchToTab('auslastung'); break;
          case '4': e.preventDefault(); this.switchToTab('kunden'); break;
          case '5': e.preventDefault(); this.switchToTab('einstellungen'); break;
          case 'n': e.preventDefault(); this.switchToTab('termine'); window.switchSubTab && window.switchSubTab('neuerTermin'); break;
          case 'f': e.preventDefault(); document.getElementById('globalesSuchfeld')?.focus(); break;
          case '?': e.preventDefault(); this.showShortcutHelp(); break;
        }
      }
    });
  }

  showShortcutHelp() {
    const shortcuts = [
      ['Alt+1', 'Dashboard öffnen'],
      ['Alt+2', 'Termine öffnen'],
      ['Alt+3', 'Auslastung öffnen'],
      ['Alt+4', 'Kunden öffnen'],
      ['Alt+5', 'Einstellungen öffnen'],
      ['Alt+N', 'Neuer Termin'],
      ['Alt+F', 'Globale Suche fokussieren'],
      ['Alt+?', 'Diese Hilfe anzeigen'],
    ];
    const html = `<div style="font-family:monospace;">
      <table style="border-collapse:collapse;width:100%;">
        ${shortcuts.map(([k, b]) => `<tr><td style="padding:4px 16px 4px 0;font-weight:bold;color:#1565c0;">${k}</td><td style="padding:4px 0;">${b}</td></tr>`).join('')}
      </table>
    </div>`;
    // Einfaches Alert-Overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `<div style="background:#fff;border-radius:12px;padding:30px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
      <h3 style="margin-top:0;">⌨️ Tastenkürzel</h3>
      ${html}
      <button onclick="this.closest('.shortcut-overlay').remove()" style="margin-top:16px;padding:8px 20px;background:#1565c0;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:1em;">Schließen</button>
    </div>`;
    overlay.classList.add('shortcut-overlay');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // =========================================================================
  // C1 – QUICK-ACTION-BUTTONS (Schnell-Status auf Termin-Karten)
  // =========================================================================

  // =========================================================================
  // C2 – BATCH-OPERATIONEN (Mehrfach-Auswahl & Massenaktionen)
  // =========================================================================
  setupBatchDelegation() {
    const container = document.getElementById('heuteTabellenContainer');
    if (!container) return;
    container.addEventListener('change', (e) => {
      if (e.target.classList.contains('termin-batch-check')) {
        this.updateBatchLeiste();
      }
    });
  }

  toggleSelectAll(checkbox) {
    document.querySelectorAll('.termin-batch-check').forEach(c => {
      c.checked = checkbox.checked;
    });
    this.updateBatchLeiste();
  }

  updateBatchLeiste() {
    const checked = document.querySelectorAll('.termin-batch-check:checked');
    const leiste = document.getElementById('batchAktionsleiste');
    const anzahlEl = document.getElementById('batchAnzahl');
    if (!leiste) return;
    if (checked.length > 0) {
      leiste.style.display = 'flex';
      if (anzahlEl) anzahlEl.textContent = `${checked.length} ausgewählt`;
    } else {
      leiste.style.display = 'none';
      const selectAll = document.getElementById('selectAllTermine');
      if (selectAll) selectAll.checked = false;
    }
  }

  clearBatchSelection() {
    document.querySelectorAll('.termin-batch-check').forEach(c => c.checked = false);
    const selectAll = document.getElementById('selectAllTermine');
    if (selectAll) selectAll.checked = false;
    this.updateBatchLeiste();
  }

  async executeBatchAction(aktion) {
    const checked = document.querySelectorAll('.termin-batch-check:checked');
    if (checked.length === 0) return;
    const ids = Array.from(checked).map(c => parseInt(c.dataset.terminId));
    if (aktion === 'abgesagt') {
      if (!confirm(`${ids.length} Termine wirklich absagen?`)) return;
    }
    try {
      await window.TermineService.batchUpdate(ids, { status: aktion });
      this.showToast(`${ids.length} Termine aktualisiert`, 'success');
      this.clearBatchSelection();
      await this.loadHeuteTermine();
    } catch (e) {
      this.showToast('Fehler beim Batch-Update', 'error');
    }
  }

  // =========================================================================
  // C6a – SMART DEFAULTS (Letzten Arbeit vorausfüllen)
  // =========================================================================
  uebernimmLetzteArbeit(enkodierteArbeit) {
    const arbeit = decodeURIComponent(enkodierteArbeit);
    const arbeitEl = document.getElementById('arbeitEingabe');
    if (arbeitEl) {
      arbeitEl.value = arbeit;
      arbeitEl.dispatchEvent(new Event('input'));
    }
    const hinweis = document.getElementById('smartDefaultHinweis');
    if (hinweis) hinweis.style.display = 'none';
  }

  // =========================================================================
  // C6e – DRUCK-TAGESÜBERSICHT
  // =========================================================================
  druckTagesuebersicht() {
    const titel = document.getElementById('heuteDatum')?.textContent || 'Heute';
    const rows = document.querySelectorAll('#heuteTermineTable tbody tr');
    let tabelleHtml = '';
    rows.forEach(row => {
      // Checkbox-Zelle überspringen, nur Datenzellen
      const cells = Array.from(row.querySelectorAll('td')).slice(1);
      if (cells.length === 0) return;
      tabelleHtml += '<tr>' + cells.map(c => `<td>${c.textContent.trim()}</td>`).join('') + '</tr>';
    });

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Tagesübersicht ${titel}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:20px;font-size:12px;}
        h1{font-size:16px;margin-bottom:8px;}
        table{border-collapse:collapse;width:100%;}
        th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;}
        th{background:#f5f5f5;font-weight:bold;}
        tr:nth-child(even){background:#fafafa;}
      </style></head><body>
      <h1>📋 Tagesübersicht — ${titel}</h1>
      <table><thead><tr>
        <th>Bringzeit</th><th>Kunde</th><th>Telefon</th><th>Kennzeichen</th>
        <th>Wartet</th><th>Arbeit</th><th>Zeit</th><th>Status</th><th>Aktionen</th>
      </tr></thead><tbody>${tabelleHtml}</tbody></table>
      <script>window.print();<\/script></body></html>`);
    win.document.close();
  }

  // =========================================================================
  // A4 – SLOT-NACHFÜLLUNG nach Drag&Drop
  // =========================================================================


  // =========================================================================
  // A6c – ÜBERLAUF-BANNER (>90% Auslastung)
  // =========================================================================
  pruefeUeberlaufBanner(termine) {
    const banner = document.getElementById('ueberlaufBanner');
    const details = document.getElementById('ueberlaufDetails');
    if (!banner) return;

    const offene = termine.filter(t => t.status !== 'abgeschlossen' && t.status !== 'abgesagt');
    const gesamtMinuten = offene.reduce((s, t) => s + (parseInt(t.geschaetzte_zeit) || 0), 0);
    // Standard: 8h = 480 Min. pro Tag (Fallback)
    const kapazitaetMinuten = 480;
    const auslastungProzent = Math.round(gesamtMinuten / kapazitaetMinuten * 100);

    if (auslastungProzent > 90) {
      if (details) details.textContent = `${auslastungProzent}% (${Math.round(gesamtMinuten / 60 * 10) / 10}h von ${kapazitaetMinuten / 60}h)`;
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  }

  zeigeVerschiebbareTermine() {
    const offene = (this.heuteTermine || []).filter(t =>
      t.status === 'geplant' && parseInt(t.geschaetzte_zeit) >= 60
    ).sort((a, b) => (parseInt(b.geschaetzte_zeit) || 0) - (parseInt(a.geschaetzte_zeit) || 0));

    if (offene.length === 0) {
      this.showToast('Keine verschiebbaren Termine gefunden', 'info');
      return;
    }

    const liste = offene.slice(0, 5).map(t =>
      `<li><strong>${this._escapeHtml(t.kunde_name || '')}:</strong> ${this._escapeHtml(t.arbeit?.split('\n')[0] || '')} · ${t.geschaetzte_zeit} Min.</li>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `<div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
      <h3 style="margin-top:0;">📅 Verschiebbare Termine</h3>
      <p style="color:#666;">Folgende geplante Termine mit ≥60 Min. könnten auf morgen verschoben werden:</p>
      <ul>${liste}</ul>
      <button onclick="this.closest('div').parentElement.remove()" style="padding:8px 20px;background:#1565c0;color:#fff;border:none;border-radius:6px;cursor:pointer;">Schließen</button>
    </div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // =========================================================================
  // A6d – WIEDERKEHRENDE TERMINE (Frontend-Verwaltung)
  // =========================================================================
  async loadWiederkehrendeTermine() {
    const tbody = document.getElementById('wiederkehrendeTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="loading">Wird geladen…</td></tr>';
    try {
      const data = await window.WiederkehrendeTermineService.getAll();
      const liste = data.termine || data || [];
      if (liste.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999;">Keine wiederkehrenden Termine vorhanden</td></tr>';
        return;
      }
      const rhythmusLabel = { monatlich: 'Monatlich', quartal: 'Quartalsweise', halbjahr: 'Halbjährlich', jaehrlich: 'Jährlich' };
      tbody.innerHTML = liste.map(w => `
        <tr>
          <td>${this._escapeHtml(w.kunde_name || '')}</td>
          <td>${this._escapeHtml(w.kennzeichen || '')}</td>
          <td>${this._escapeHtml(w.arbeit || '')}</td>
          <td>${w.geschaetzte_zeit || '?'}</td>
          <td>${rhythmusLabel[w.wiederholung] || w.wiederholung}</td>
          <td>${w.naechste_erstellung || '–'}</td>
          <td><span class="${w.aktiv ? 'log-badge log-ok' : 'log-badge log-error'}">${w.aktiv ? 'Aktiv' : 'Inaktiv'}</span></td>
          <td style="white-space:nowrap;">
            <button class="btn btn-sm" onclick="app.toggleWiederkehrend(${w.id}, ${w.aktiv ? 0 : 1})">${w.aktiv ? 'Deaktivieren' : 'Aktivieren'}</button>
            <button class="btn btn-sm btn-danger" onclick="app.deleteWiederkehrend(${w.id})">🗑</button>
          </td>
        </tr>`).join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="8" style="color:red;">Fehler beim Laden</td></tr>';
    }
  }

  showWiederkehrendModal() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `<div style="background:#fff;border-radius:12px;padding:24px;max-width:480px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
      <h3 style="margin-top:0;">🔁 Neuer wiederkehrender Termin</h3>
      <form id="wiederkehrendForm" style="display:grid;gap:12px;">
        <div><label>Kundenname *</label><input type="text" id="wrKundeName" class="form-control" placeholder="Max Mustermann" required></div>
        <div><label>Kennzeichen</label><input type="text" id="wrKennzeichen" class="form-control" placeholder="OSL-KI 123"></div>
        <div><label>Arbeit(en) *</label><textarea id="wrArbeit" class="form-control" rows="2" placeholder="Ölwechsel" required></textarea></div>
        <div><label>Geschätzte Zeit (Min.) *</label><input type="number" id="wrZeit" class="form-control" value="60" min="15" required></div>
        <div><label>Wiederholung</label>
          <select id="wrRhythmus" class="form-control">
            <option value="monatlich">Monatlich</option>
            <option value="quartal">Quartalsweise</option>
            <option value="halbjahr" selected>Halbjährlich</option>
            <option value="jaehrlich">Jährlich</option>
          </select>
        </div>
        <div><label>Nächste Erstellung</label><input type="date" id="wrNaechste" class="form-control"></div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button type="submit" class="btn btn-primary">Speichern</button>
          <button type="button" class="btn btn-secondary" onclick="this.closest('.wr-overlay').remove()">Abbrechen</button>
        </div>
      </form>
    </div>`;
    overlay.classList.add('wr-overlay');

    // Default: nächste Erstellung = in 6 Monaten
    overlay.querySelector('#wrNaechste').value = new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0];

    overlay.querySelector('#wiederkehrendForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        kunde_name: overlay.querySelector('#wrKundeName').value.trim(),
        kennzeichen: overlay.querySelector('#wrKennzeichen').value.trim(),
        arbeit: overlay.querySelector('#wrArbeit').value.trim(),
        geschaetzte_zeit: parseInt(overlay.querySelector('#wrZeit').value),
        wiederholung: overlay.querySelector('#wrRhythmus').value,
        naechste_erstellung: overlay.querySelector('#wrNaechste').value,
      };
      try {
        await window.WiederkehrendeTermineService.create(payload);
        this.showToast('Wiederkehrender Termin gespeichert', 'success');
        overlay.remove();
        this.loadWiederkehrendeTermine();
      } catch (err) {
        this.showToast('Fehler beim Speichern', 'error');
      }
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  async toggleWiederkehrend(id, aktiv) {
    try {
      await window.WiederkehrendeTermineService.update(id, { aktiv });
      this.loadWiederkehrendeTermine();
    } catch (e) {
      this.showToast('Fehler beim Aktualisieren', 'error');
    }
  }

  async deleteWiederkehrend(id) {
    if (!confirm('Wiederkehrenden Termin wirklich löschen?')) return;
    try {
      await window.WiederkehrendeTermineService.delete(id);
      this.showToast('Gelöscht', 'success');
      this.loadWiederkehrendeTermine();
    } catch (e) {
      this.showToast('Fehler beim Löschen', 'error');
    }
  }








  /**
   * Bottom-Sheet 'Beenden' für Intern-Tab – fasst Arbeitsunterbrechung
   * und Arbeitsende in einer großen Touch-Auswahl zusammen.
   */



}


installServerInfoFeature(App);
installRealtimeFeature(App);
installAuslastungFeature(App);
installTerminDetailsFeature(App);
installTerminFormFeature(App);
installPlanungFeature(App);
installDragDropFeature(App);
installShiftTemplatesFeature(App);
installStaffFeature(App);
installWorkSchedulesFeature(App);
installAbsenceFeature(App);
installReplacementCarsFeature(App);
installTodayFeature(App);
installDashboardFeature(App);
installTabletFeature(App);
installSettingsKiFeature(App);
installTimeTrackingFeature(App);
installSearchFeature(App);
installCustomersFeature(App);
installBackupFeature(App);
installCalendarFeature(App);
installPartsFeature(App);

ApiService.loadClientConfig();
const app = new App();
window.App = App;
window.app = app;

// Globale Funktion für Sub-Tab-Wechsel (Fallback für onclick)
window.switchSubTab = function(tabName) {
  const allTabs = ['neuerTermin', 'schnellerTermin', 'terminBearbeiten', 'internerTermin', 'wartendeAktionen', 'wiederkehrendeTermine'];
  
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
  if (tabName === 'neuerTermin' && window.app) {
    // Datum leeren beim Tab-Wechsel
    const d = document.getElementById('datum');
    if (d) d.value = '';
    window.app.updateSelectedDatumDisplay();
    setTimeout(() => {
      window.app.setupAuslastungKalender();
      window.app.renderAuslastungKalender();
      window.app.toggleAbholungDetails();
    }, 50);
  }

  if (tabName === 'schnellerTermin' && window.app) {
    // Datum leeren beim Tab-Wechsel
    const sd = document.getElementById('schnell_datum');
    if (sd) sd.value = '';
    window.app.updateSchnellDatumDisplay();
    setTimeout(() => {
      window.app.setupSchnellKalender();
      window.app.renderSchnellKalender();
      window.app.closeSchnellKalenderPopup();
    }, 50);
  }
  
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

  if (tabName === 'wiederkehrendeTermine' && window.app) {
    window.app.loadWiederkehrendeTermine();
  }
};
// Export für globale Verwendung
window.App = App;

// ============================================================================
// KAPAZITÄTSPRÜFUNG UND VERSCHIEBE-WARNUNG
// ============================================================================

/**
 * Prüft ob die Zuweisung eines Termins die Tageskapazität überschreitet
 * @param {Object} person - Mitarbeiter oder Lehrling
 * @param {String} datum - Datum (YYYY-MM-DD)
 * @param {Number} terminDauer - Dauer in Minuten
 * @param {String} targetType - 'mitarbeiter' oder 'lehrling'
 * @param {Number} personId - ID der Person
 * @returns {Promise<Object>} { ueberlastet, maxKapazitaet, aktuelleAuslastung, neueAuslastung, prozent }
 */
App.prototype.checkKapazitaetVorZuweisung = async function(person, datum, terminDauer, targetType, personId) {
  try {
    // 1. Tageskapazität berechnen
    const maxKapazitaet = await this.calculateTageskapazitaetMinuten(person, datum);
    
    // 2. Aktuelle Auslastung laden
    const auslastungData = await AuslastungService.getByDatum(datum);
    let aktuelleAuslastung = 0;
    
    if (targetType === 'mitarbeiter' && auslastungData.mitarbeiter_auslastung) {
      const maAuslastung = auslastungData.mitarbeiter_auslastung.find(m => m.mitarbeiter_id === personId);
      if (maAuslastung) {
        aktuelleAuslastung = maAuslastung.belegt_minuten_roh || maAuslastung.belegt_minuten || 0;
      }
    } else if (targetType === 'lehrling' && auslastungData.lehrlinge_auslastung) {
      const lAuslastung = auslastungData.lehrlinge_auslastung.find(l => l.lehrling_id === personId);
      if (lAuslastung) {
        aktuelleAuslastung = lAuslastung.belegt_minuten_roh || lAuslastung.belegt_minuten || 0;
      }
    }
    
    // 3. Neue Auslastung berechnen
    const neueAuslastung = aktuelleAuslastung + terminDauer;
    const prozent = maxKapazitaet > 0 ? Math.round((neueAuslastung / maxKapazitaet) * 100) : 0;
    // Toleranzpuffer: Kleine Überschreitungen (<= 15 Min) nicht als Überlastung werten
    const TOLERANZ_MINUTEN = 15;
    const ueberlastet = neueAuslastung > maxKapazitaet + TOLERANZ_MINUTEN && maxKapazitaet > 0;
    console.log(`[KAPAZITAET] ${person?.name || personId} (${targetType}) am ${datum}: aktuell=${aktuelleAuslastung}min + neu=${terminDauer}min = ${neueAuslastung}min / max=${maxKapazitaet}min (${prozent}%) | Toleranz=${TOLERANZ_MINUTEN}min | überlastet=${ueberlastet}`);
    
    return {
      ueberlastet,
      maxKapazitaet,
      aktuelleAuslastung,
      neueAuslastung,
      prozent,
      ueberlauf: Math.max(0, neueAuslastung - maxKapazitaet)
    };
  } catch (error) {
    console.error('Fehler bei Kapazitätsprüfung:', error);
    return {
      ueberlastet: false,
      maxKapazitaet: 0,
      aktuelleAuslastung: 0,
      neueAuslastung: terminDauer,
      prozent: 0,
      ueberlauf: 0
    };
  }
};

/**
 * Weist einen Termin direkt in der DB einer Person zu (mit korrekten arbeitszeiten_details).
 * Wird von showVerschiebeWarnung-Buttons genutzt (sofortige DB-Speicherung ohne lokalen Puffer).
 */
App.prototype._assignTerminDirectToPersonInDB = async function(terminId, targetType, mitarbeiterId, lehrlingId, startzeit, datumOverride) {
  console.log(`[ASSIGN] Termin ${terminId} → ${targetType} ${mitarbeiterId || lehrlingId} | startzeit=${startzeit} | datum=${datumOverride || '(unveraendert)'}`);
  const aktuellerTermin = await TermineService.getById(terminId);
  let details = {};
  try {
    details = aktuellerTermin.arbeitszeiten_details
      ? (typeof aktuellerTermin.arbeitszeiten_details === 'string'
          ? JSON.parse(aktuellerTermin.arbeitszeiten_details)
          : aktuellerTermin.arbeitszeiten_details)
      : {};
  } catch (e) {}

  const updateData = { startzeit };
  if (datumOverride) updateData.datum = datumOverride;
  // Schwebend-Status aufheben wenn eine Person zugeordnet wird
  if (mitarbeiterId || lehrlingId) {
    updateData.ist_schwebend = 0;
  }

  if (targetType === 'lehrling' && lehrlingId) {
    updateData.mitarbeiter_id = null;
    updateData.lehrling_id = parseInt(lehrlingId);
    details._gesamt_mitarbeiter_id = { type: 'lehrling', id: parseInt(lehrlingId) };
    details._startzeit = startzeit;
    // Alle vorhandenen Arbeiten dem Lehrling zuordnen
    for (const key in details) {
      if (!key.startsWith('_') && typeof details[key] === 'object') {
        details[key].type = 'lehrling';
        details[key].lehrling_id = parseInt(lehrlingId);
        delete details[key].mitarbeiter_id;
        details[key].startzeit = startzeit;
      }
    }
  } else if (targetType === 'mitarbeiter' && mitarbeiterId) {
    updateData.mitarbeiter_id = parseInt(mitarbeiterId);
    details._gesamt_mitarbeiter_id = { type: 'mitarbeiter', id: parseInt(mitarbeiterId) };
    details._startzeit = startzeit;
    for (const key in details) {
      if (!key.startsWith('_') && typeof details[key] === 'object') {
        details[key].type = 'mitarbeiter';
        details[key].mitarbeiter_id = parseInt(mitarbeiterId);
        delete details[key].lehrling_id;
        details[key].startzeit = startzeit;
      }
    }
  }

  updateData.arbeitszeiten_details = JSON.stringify(details);
  console.log(`[ASSIGN] updateData für Termin ${terminId}:`, { mitarbeiter_id: updateData.mitarbeiter_id, lehrling_id: updateData.lehrling_id, startzeit: updateData.startzeit, datum: updateData.datum, ist_schwebend: updateData.ist_schwebend });
  await TermineService.update(terminId, updateData);
  console.log(`[ASSIGN] Termin ${terminId} erfolgreich gespeichert`);
};

/**
 * Zeigt eine modale Warnung mit Optionen bei Überlastung
 * @param {Object} person - Mitarbeiter oder Lehrling
 * @param {Object} termin - Termin-Objekt
 * @param {Object} kapazitaetWarnung - Ergebnis von checkKapazitaetVorZuweisung
 * @param {String} datum - Datum (YYYY-MM-DD)
 * @param {Number} mitarbeiterId - ID wenn Mitarbeiter
 * @param {Number} lehrlingId - ID wenn Lehrling
 * @param {String} targetType - 'mitarbeiter' oder 'lehrling'
 * @param {String} startzeit - Startzeit (HH:MM)
 */
App.prototype.showVerschiebeWarnung = async function(person, termin, kapazitaetWarnung, datum, mitarbeiterId, lehrlingId, targetType, startzeit) {
  // Aufteilen-Berechnung: wie viel passt heute noch?
  const terminDauer = kapazitaetWarnung.neueAuslastung - kapazitaetWarnung.aktuelleAuslastung;
  const verfuegbarHeute = Math.max(0, kapazitaetWarnung.maxKapazitaet - kapazitaetWarnung.aktuelleAuslastung);
  // Feierabend-basierte Berechnung: wie viel passt von startzeit bis 17:00?
  const feierabendDefault = '17:00';
  const [fh, fm] = feierabendDefault.split(':').map(Number);
  const feierabendMin = fh * 60 + fm;
  const [sh2, sm2] = startzeit.split(':').map(Number);
  const bisFeierabendMin = Math.max(0, feierabendMin - (sh2 * 60 + sm2));
  // Aufteilen: nimm das Minimum aus verfügbarer Kapazität und Zeit bis Feierabend
  const teil1Zeit = bisFeierabendMin > 0 ? Math.min(bisFeierabendMin, terminDauer) : verfuegbarHeute;
  const teil2Zeit = terminDauer - teil1Zeit;
  // Nächsten Werktag berechnen (Sa/So überspringen) – lokal, kein UTC-Drift
  const [_dy, _dm, _dd] = datum.split('-').map(Number);
  const naechsterWerktag = new Date(_dy, _dm - 1, _dd + 1);
  while (naechsterWerktag.getDay() === 0 || naechsterWerktag.getDay() === 6) {
    naechsterWerktag.setDate(naechsterWerktag.getDate() + 1);
  }
  const morgenDatum = `${naechsterWerktag.getFullYear()}-${String(naechsterWerktag.getMonth()+1).padStart(2,'0')}-${String(naechsterWerktag.getDate()).padStart(2,'0')}`;
  const kannAufteilen = teil1Zeit > 0 && teil2Zeit > 0;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    opacity: 1;
  `;

  const aufteilenHtml = kannAufteilen
    ? `<button class="btn btn-info" id="verschiebeOptionAufteilen" style="width: 100%; background: #1565c0; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer;">
        ✂️ Aufteilen: ${teil1Zeit} Min. heute + ${teil2Zeit} Min. am ${this.formatDatum(morgenDatum)}<br>
        <small style="opacity: 0.85;">Heute ${startzeit}–${feierabendDefault} Uhr, Rest morgen ab 08:00</small>
      </button>`
    : `<button class="btn btn-info" id="verschiebeOptionAufteilen" style="width: 100%; background: #1565c0; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer;">
        ✂️ Heute einplanen + morgen fortführen
        <br><small style="opacity: 0.85;">Startzeit anpassen und Feierabend wählen</small>
      </button>`;

  modal.innerHTML = `
    <div style="background: white; padding: 25px; border-radius: 12px; max-width: 550px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
      <h3 style="margin-top: 0; color: #d32f2f; display: flex; align-items: center; gap: 8px;">
        ⚠️ Überlastungswarnung
      </h3>

      <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ff9800;">
        <p style="margin: 0 0 10px 0;"><strong>${person.name}</strong> am ${this.formatDatum(datum)}:</p>
        <p style="margin: 5px 0; font-size: 0.95em;">
          📊 Aktuelle Auslastung: <strong>${(kapazitaetWarnung.aktuelleAuslastung / 60).toFixed(1)}h</strong> / ${(kapazitaetWarnung.maxKapazitaet / 60).toFixed(1)}h
        </p>
        <p style="margin: 5px 0; font-size: 0.95em;">
          ➕ Neuer Termin: <strong>+${(terminDauer / 60).toFixed(1)}h</strong>
        </p>
        <p style="margin: 5px 0; font-size: 0.95em; color: #d32f2f;">
          🔴 Neue Auslastung: <strong>${(kapazitaetWarnung.neueAuslastung / 60).toFixed(1)}h (${kapazitaetWarnung.prozent}%)</strong>
        </p>
        <p style="margin: 10px 0 0 0; font-size: 0.9em; color: #e65100;">
          ⚡ <strong>Überlauf: ${(kapazitaetWarnung.ueberlauf / 60).toFixed(1)}h</strong>
        </p>
      </div>

      <p style="margin: 15px 0 20px 0; font-size: 0.95em; color: #555;">
        <strong>Kunde:</strong> ${termin.kunde_name || 'Unbekannt'}<br>
        <strong>Fahrzeug:</strong> ${termin.kennzeichen || '-'} ${termin.fahrzeug || ''}
      </p>

      <div style="display: flex; gap: 10px; flex-direction: column;">
        ${aufteilenHtml}
        <div style="display: flex; gap: 10px;">
          <div id="verschiebeTagContainer" style="flex: 1;">
            <button disabled style="width: 100%; opacity: 0.6; cursor: not-allowed; background: #e8f5e9; border: 1px solid #a5d6a7; padding: 10px; border-radius: 6px; font-size: 0.9em;">
              ⏳ Suche nächsten freien Tag...
            </button>
          </div>
          <button class="btn btn-warning" id="verschiebeOptionTrotzdem" style="flex: 1;">
            ⚠️ Trotzdem zuweisen<br>
            <small style="opacity: 0.8;">(Überlastung ignorieren)</small>
          </button>
        </div>
        <button class="btn btn-secondary" id="verschiebeOptionAbbrechen" style="width: 100%;">
          ❌ Abbrechen
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Event Listener – Promise steuert Lebenszeit des Dialogs
  return new Promise((resolve) => {
    const cleanup = () => {
      if (document.body.contains(modal)) document.body.removeChild(modal);
    };

    // Nächsten verfügbaren Tag asynchron im Hintergrund laden → Dialog erscheint sofort
    this.findeNaechstenVerfuegbarenTag(person, datum, termin?.geschaetzte_zeit || 30, 14)
      .then(naechsterTag => {
        const container = document.getElementById('verschiebeTagContainer');
        if (!container || !document.body.contains(modal)) return; // Dialog bereits geschlossen
        if (naechsterTag) {
          container.innerHTML = `<button class="btn btn-success" id="verschiebeOptionVerschieben" style="width: 100%;">
            📅 Auf ${this.formatDatum(naechsterTag.datum)} verschieben<br>
            <small style="opacity: 0.8;">✓ ${(naechsterTag.verfuegbareMinuten / 60).toFixed(1)}h verfügbar</small>
          </button>`;
          document.getElementById('verschiebeOptionVerschieben')?.addEventListener('click', async () => {
            cleanup();
            try {
              await this._assignTerminDirectToPersonInDB(termin.id, targetType, mitarbeiterId, lehrlingId, startzeit, naechsterTag.datum);
              this.showToast(`📅 Termin auf ${this.formatDatum(naechsterTag.datum)} verschoben!`, 'success');
              this.loadAuslastungDragDrop();
            } catch (err) {
              this.showToast('❌ Fehler beim Verschieben: ' + (err.message || 'Unbekannt'), 'error');
            }
            resolve('verschoben');
          });
        } else {
          container.innerHTML = `<p style="color: #d32f2f; margin: 10px 0; flex: 1; font-size: 0.9em;"><strong>⚠️ Kein freier Tag in 14 Tagen!</strong></p>`;
        }
      })
      .catch(e => {
        console.warn('[showVerschiebeWarnung] findeNaechstenVerfuegbarenTag fehlgeschlagen:', e);
        const container = document.getElementById('verschiebeTagContainer');
        if (container && document.body.contains(modal)) {
          container.innerHTML = `<p style="color: #999; margin: 0; flex: 1; font-size: 0.85em;">⚠️ Verfügbarkeit nicht prüfbar</p>`;
        }
      });

    document.getElementById('verschiebeOptionAbbrechen')?.addEventListener('click', () => {
      cleanup();
      resolve('abbrechen');
    });

    document.getElementById('verschiebeOptionTrotzdem')?.addEventListener('click', async () => {
      cleanup();
      try {
        // datum (selectedDatum) als datumOverride übergeben damit schwebende/verschobene
        // Termine auch auf das korrekte Ziel-Datum gesetzt werden.
        await this._assignTerminDirectToPersonInDB(termin.id, targetType, mitarbeiterId, lehrlingId, startzeit, datum);
        this.showToast('⚠️ Termin trotz Überlastung zugewiesen!', 'warning');
        this.loadAuslastungDragDrop();
      } catch (err) {
        const terminInfo = termin ? ` [${termin.kunde_name || 'Intern'} – ${termin.kennzeichen || ''}]` : '';
        this.showToast(`❌ Fehler beim Zuweisen${terminInfo}: ${err.message || 'Unbekannt'}`, 'error');
      }
      resolve('trotzdem');
    });

    document.getElementById('verschiebeOptionAufteilen')?.addEventListener('click', async () => {
      cleanup();
      if (kannAufteilen) {
        // Direkt aufteilen
        try {
          // Alles in einem einzigen Backend-Call: Split + Mitarbeiter-Zuordnung atomar
          await TermineService.splitTermin(termin.id, teil1Zeit, morgenDatum, teil2Zeit, {
            mitarbeiter_typ: targetType,
            mitarbeiter_id: targetType === 'mitarbeiter' ? mitarbeiterId : null,
            lehrling_id: targetType === 'lehrling' ? lehrlingId : null,
            startzeit_teil1: startzeit,
            datum_teil1: datum
          });
          this.showToast(`✂️ Termin aufgeteilt: ${teil1Zeit} Min. heute für ${person.name}, ${teil2Zeit} Min. am ${this.formatDatum(morgenDatum)} → ${person.name}`, 'success');
          this.loadAuslastungDragDrop();
        } catch (error) {
          console.error('Fehler beim Aufteilen:', error);
          this.showToast('❌ Fehler beim Aufteilen: ' + (error.message || 'Unbekannter Fehler'), 'error');
        }
      } else {
        // Einplanen-Dialog öffnen (benutzerdefinierte Zeiten)
        this.showEinplanenDialog(termin.id, termin);
      }
      resolve('aufteilen');
    });

    // Schließen bei Klick außerhalb
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cleanup();
        resolve('abbrechen');
      }
    });
  });
};

// ===============================
// Tablet-Steuerung
// ===============================

/**
 * Prüft nach einem Drop ob der Termin über den Feierabend (17:00) hinausläuft.
 * Wenn ja, fragt der Nutzer ob er ihn aufteilen möchte.
 */
App.prototype._checkFeierabendUeberlauf = async function(terminId, terminDaten, startzeit, datum) {
  const feierabend = '17:00';
  const [fh, fm] = feierabend.split(':').map(Number);
  const feierabendMin = fh * 60 + fm;
  const [sh, sm] = startzeit.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const dauer = parseInt(terminDaten?.geschaetzte_zeit) || 0;
  if (dauer <= 0) return;
  const endeMin = startMin + dauer;
  if (endeMin <= feierabendMin) return; // Passt, kein Problem

  const ueberMin = endeMin - feierabendMin;
  const heuteMin = dauer - ueberMin;
  if (heuteMin <= 0) return; // Startet nach Feierabend - anderes Problem

  // Kurze Toast-Meldung + Angebot zum Aufteilen
  const endzeit = `${String(Math.floor(endeMin/60)).padStart(2,'0')}:${String(endeMin%60).padStart(2,'0')}`;
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a237e;color:#fff;border-radius:12px;padding:14px 20px;z-index:10000;max-width:420px;width:90%;display:flex;flex-direction:column;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);';
  toast.innerHTML = `
    <div style="font-weight:600;">⏰ Termin endet um ${endzeit} Uhr (über Feierabend ${feierabend})</div>
    <div style="font-size:0.88rem;opacity:0.9;">Heute: ${heuteMin} Min. &nbsp;|&nbsp; Rest morgen: ${ueberMin} Min.</div>
    <div style="display:flex;gap:8px;margin-top:4px;">
      <button id="feierabendAufteilen" style="flex:1;background:#e8f5e9;color:#1b5e20;border:none;border-radius:7px;padding:8px;font-weight:600;cursor:pointer;">✂️ Aufteilen</button>
      <button id="feierabendIgnorieren" style="flex:1;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:7px;padding:8px;cursor:pointer;">Ignorieren</button>
    </div>
  `;
  document.body.appendChild(toast);
  const removeToast = () => { if (document.body.contains(toast)) document.body.removeChild(toast); };
  setTimeout(removeToast, 12000);

  document.getElementById('feierabendIgnorieren')?.addEventListener('click', removeToast);
  document.getElementById('feierabendAufteilen')?.addEventListener('click', async () => {
    removeToast();
    // Direkt aufteilen via folgearbeit-Endpoint
    // Wichtig: datum mitgeben, damit Teil 1 garantiert auf das Drag&Drop-Datum gesetzt wird
    // (DB-Stand kann veraltet sein, weil die Drag&Drop-Änderung erst im lokalen Puffer liegt)
    try {
      const result = await TermineService.folgearbeitErstellen(terminId, feierabend, startzeit, false, datum);
      const morgenLabel = (() => { const d = new Date(datum+'T12:00:00'); d.setDate(d.getDate()+1); while(d.getDay()===0||d.getDay()===6) d.setDate(d.getDate()+1); return d.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'}); })();
      this.showToast(`✅ Aufgeteilt: ${result.heute_minuten} Min. heute, ${result.rest_minuten} Min. am ${morgenLabel}`, 'success');
      // Gepufferte Änderung verwerfen – sonst würde 'Speichern' den PATCH erneut anwenden
      // und Teil 1 ein zweites Mal verschieben/zurücksetzen
      if (this.planungAenderungen?.has(terminId)) {
        this.planungAenderungen.delete(terminId);
        if (typeof this.updatePlanungAenderungenUI === 'function') {
          this.updatePlanungAenderungenUI();
        }
      }
      this.loadAuslastungDragDrop();
    } catch (err) {
      this.showToast('❌ ' + (err.message || 'Fehler beim Aufteilen'), 'error');
    }
  });
};

// ===============================
// Tablet-Steuerung
// ===============================

App.prototype.loadTabletVersionInfo = async function() {
  const container = document.getElementById('tabletVersionInfo');
  if (!container) return;
  try {
    const [checkData, tablets] = await Promise.all([
      ApiService.get('/tablet-update/check?version=0.0.0').catch(() => null),
      ApiService.get('/tablet-update/status').catch(() => [])
    ]);
    const verfuegbar = checkData?.latestVersion || '—';
    const liste = Array.isArray(tablets) ? tablets : [];

    const _zeitVor = (iso) => {
      if (!iso) return 'unbekannt';
      const diff = Math.floor((Date.now() - new Date(iso + 'Z').getTime()) / 60000);
      if (diff < 2)  return 'gerade eben';
      if (diff < 60) return `vor ${diff} Min.`;
      const h = Math.floor(diff / 60);
      if (h < 24)   return `vor ${h} Std.`;
      return `vor ${Math.floor(h / 24)} Tag(en)`;
    };

    let rows = `<tr>
      <td style="padding:7px 0;color:#666;width:170px;vertical-align:top;">📦 Verfügbar (Server):</td>
      <td style="font-weight:600;color:#1976d2;">v${verfuegbar}</td>
    </tr>`;

    if (liste.length === 0) {
      rows += `<tr><td style="padding:7px 0;color:#666;">📱 Installiert:</td><td style="color:#999;font-size:13px;">Noch kein Tablet verbunden</td></tr>`;
    } else {
      liste.forEach(t => {
        const aktuell = t.version === verfuegbar;
        const name = t.hostname || t.ip || 'Tablet';
        rows += `<tr>
          <td style="padding:7px 0;color:#666;vertical-align:top;">📱 ${this.escapeHtml(name)}:</td>
          <td>
            <span style="font-weight:600;color:${aktuell ? '#28a745' : '#dc3545'};">v${t.version}</span>
            ${aktuell ? ' <span style="color:#28a745;font-size:12px;">✅ aktuell</span>' : ' <span style="color:#dc3545;font-size:12px;">⬆️ Update verfügbar</span>'}
            <span style="color:#aaa;font-size:12px;margin-left:8px;">${_zeitVor(t.last_seen)}</span>
          </td>
        </tr>`;
      });
    }

    container.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:14px;"><tbody>${rows}</tbody></table>`;
  } catch (e) {
    container.innerHTML = '<p style="color:#999;font-size:13px;">Versionsinformation nicht verfügbar</p>';
  }
};

App.prototype.loadTabletEinstellungen = async function() {
  try {
    const einstellungen = await TabletService.getEinstellungen();
    
    // Formularfelder befüllen
    const einschaltzeitInput = document.getElementById('display_einschaltzeit');
    const ausschaltzeitInput = document.getElementById('display_ausschaltzeit');
    
    if (einschaltzeitInput) einschaltzeitInput.value = einstellungen.display_einschaltzeit || '07:30';
    if (ausschaltzeitInput) ausschaltzeitInput.value = einstellungen.display_ausschaltzeit || '18:10';
    
    // Status anzeigen
    this.updateTabletDisplayStatus(einstellungen.manueller_display_status || 'auto');

    // Versionsinfo laden
    this.loadTabletVersionInfo();
    
    // Event Listener für Formular
    const form = document.getElementById('tabletDisplayForm');
    if (form && !form.dataset.listenerAdded) {
      form.dataset.listenerAdded = 'true';
      form.addEventListener('submit', (e) => this.saveTabletEinstellungen(e));
    }
    
    // Event Listener für manuelle Steuerung
    const autoBtn = document.getElementById('tabletDisplayAutoBtn');
    const onBtn = document.getElementById('tabletDisplayOnBtn');
    const offBtn = document.getElementById('tabletDisplayOffBtn');
    
    if (autoBtn && !autoBtn.dataset.listenerAdded) {
      autoBtn.dataset.listenerAdded = 'true';
      autoBtn.addEventListener('click', () => this.setTabletDisplayManuell('auto'));
    }
    if (onBtn && !onBtn.dataset.listenerAdded) {
      onBtn.dataset.listenerAdded = 'true';
      onBtn.addEventListener('click', () => this.setTabletDisplayManuell('an'));
    }
    if (offBtn && !offBtn.dataset.listenerAdded) {
      offBtn.dataset.listenerAdded = 'true';
      offBtn.addEventListener('click', () => this.setTabletDisplayManuell('aus'));
    }
    
  } catch (error) {
    console.error('Fehler beim Laden der Tablet-Einstellungen:', error);
    this.showToast('Fehler beim Laden der Tablet-Einstellungen', 'error');
  }
};

App.prototype.saveTabletEinstellungen = async function(e) {
  e.preventDefault();
  
  const einschaltzeit = document.getElementById('display_einschaltzeit').value;
  const ausschaltzeit = document.getElementById('display_ausschaltzeit').value;
  
  try {
    await TabletService.updateEinstellungen({
      display_einschaltzeit: einschaltzeit,
      display_ausschaltzeit: ausschaltzeit
    });
    
    this.showToast('✅ Einschaltzeiten gespeichert!', 'success');
  } catch (error) {
    console.error('Fehler beim Speichern der Tablet-Einstellungen:', error);
    this.showToast('Fehler beim Speichern der Einstellungen', 'error');
  }
};

App.prototype.setTabletDisplayManuell = async function(status) {
  try {
    await TabletService.setDisplayManuell(status);
    
    this.updateTabletDisplayStatus(status);
    
    const statusText = {
      'auto': '🔄 Automatik aktiviert',
      'an': '💡 Alle Displays eingeschaltet',
      'aus': '🌙 Alle Displays ausgeschaltet'
    };
    
    this.showToast(statusText[status] || 'Status aktualisiert', 'success');
  } catch (error) {
    console.error('Fehler beim Setzen des Display-Status:', error);
    this.showToast('Fehler beim Setzen des Status', 'error');
  }
};

App.prototype.updateTabletDisplayStatus = function(status) {
  const statusDiv = document.getElementById('tabletDisplayStatus');
  const icon = document.getElementById('tabletDisplayStatusIcon');
  const text = document.getElementById('tabletDisplayStatusText');
  const hint = document.getElementById('tabletDisplayStatusHint');
  
  if (!statusDiv || !icon || !text || !hint) return;
  
  const statusConfig = {
    'auto': {
      icon: '🔄',
      text: 'Modus: Automatik',
      hint: 'Tablets schalten sich nach den definierten Zeiten ein/aus',
      color: '#e3f2fd',
      borderColor: '#90caf9'
    },
    'an': {
      icon: '💡',
      text: 'Modus: Manuell EIN',
      hint: 'Alle Displays sind manuell eingeschaltet',
      color: '#e8f5e9',
      borderColor: '#a5d6a7'
    },
    'aus': {
      icon: '🌙',
      text: 'Modus: Manuell AUS',
      hint: 'Alle Displays sind manuell ausgeschaltet',
      color: '#fff3e0',
      borderColor: '#ffb74d'
    }
  };
  
  const config = statusConfig[status] || statusConfig['auto'];
  
  icon.textContent = config.icon;
  text.textContent = config.text;
  hint.textContent = config.hint;
  statusDiv.style.background = config.color;
  statusDiv.style.borderColor = config.borderColor;
};
