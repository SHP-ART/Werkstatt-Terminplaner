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
import { installTerminDetailsActionsFeature } from '../features/termine/terminDetailsActionsFeature.js';
import { installTerminFormFeature } from '../features/termine/terminFormFeature.js';
import { installTerminFormActionsFeature } from '../features/termine/terminFormActionsFeature.js';
import { installPlanungFeature } from '../features/planung/planungFeature.js';
import { installDragDropFeature } from '../features/planung/dragDropFeature.js';
import { installShiftTemplatesFeature } from '../features/shiftTemplates/shiftTemplatesFeature.js';
import { installStaffFeature } from '../features/staff/staffFeature.js';
import { installStandardTimesFeature } from '../features/standardTimes/standardTimesFeature.js';
import { installWorkSchedulesFeature } from '../features/workSchedules/workSchedulesFeature.js';
import { installAbsenceFeature } from '../features/absence/absenceFeature.js';
import { installReplacementCarsFeature } from '../features/replacementCars/replacementCarsFeature.js';
import { installTodayFeature } from '../features/today/todayFeature.js';
import { installTerminTrashFeature } from '../features/trash/terminTrashFeature.js';
import { installWaitingActionsFeature } from '../features/waitingActions/waitingActionsFeature.js';
import { installWorkTimeModalFeature } from '../features/workTimeModal/workTimeModalFeature.js';
import { installDashboardFeature } from '../features/dashboard/dashboardFeature.js';
import { installFormHelpersFeature } from '../features/formHelpers/formHelpersFeature.js';
import { installKiPlanningFeature } from '../features/kiPlanning/kiPlanningFeature.js';
import { installTabletFeature } from '../features/tablet/tabletFeature.js';
import { installTimelineFeature } from '../features/timeline/timelineFeature.js';
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
    this.phasenCounter = 0;
    this.phasenData = [];

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

    if (subTabName === 'auftrageingang') {
      this.loadAuftragsimporte();
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

  escapeHtml(text) {
    return escapeHtml(text);
  }

  // ==========================================
  // TEILE-STATUS ÜBERSICHT
  // ==========================================

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
installTerminDetailsActionsFeature(App);
installTerminFormFeature(App);
installTerminFormActionsFeature(App);
installPlanungFeature(App);
installDragDropFeature(App);
installShiftTemplatesFeature(App);
installStaffFeature(App);
installStandardTimesFeature(App);
installWorkSchedulesFeature(App);
installAbsenceFeature(App);
installReplacementCarsFeature(App);
installTodayFeature(App);
installTerminTrashFeature(App);
installWaitingActionsFeature(App);
installWorkTimeModalFeature(App);
installDashboardFeature(App);
installFormHelpersFeature(App);
installKiPlanningFeature(App);
installTabletFeature(App);
installTimelineFeature(App);
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

App.prototype.loadAuftragsimporte = async function() {
  const list = document.getElementById('auftragsimportListe');
  const status = document.getElementById('auftragsimportStatus');
  const pathInfo = document.getElementById('auftragsimportPfad');
  if (!list) return;

  list.innerHTML = '<div class="loading">Wird geladen...</div>';
  try {
    const data = await AuftragsimportService.getAll({ offen: 1 });
    this.auftragsimporte = data.imports || [];
    if (pathInfo) pathInfo.textContent = data.importDir ? `Ordner: ${data.importDir}` : '';
    if (status) {
      const offen = this.auftragsimporte.filter(i => ['neu', 'erkannt', 'fehler'].includes(i.status)).length;
      status.textContent = `${offen} offene PDF-Importe`;
    }
    this.renderAuftragsimporte();
  } catch (error) {
    console.error('Fehler beim Laden der Auftragsimporte:', error);
    list.innerHTML = '<div class="empty-state">Fehler beim Laden</div>';
  }
};

App.prototype.renderAuftragsimporte = function() {
  const list = document.getElementById('auftragsimportListe');
  if (!list) return;

  const imports = this.auftragsimporte || [];
  if (imports.length === 0) {
    list.innerHTML = '<div class="empty-state">Keine offenen PDF-Importe</div>';
    const details = document.getElementById('auftragsimportDetails');
    if (details) details.innerHTML = '';
    return;
  }

  const rows = imports.map(item => {
    const daten = item.erkannte_daten || {};
    const arbeit = daten.arbeit?.summary || '-';
    const kunde = daten.kunde?.name || '-';
    const kennzeichen = daten.fahrzeug?.kennzeichen || '-';
    const zeit = daten.geschaetzte_zeit ? `${daten.geschaetzte_zeit} min` : '-';
    const treffer = (item.zuordnungs_treffer || [])[0];
    const trefferText = treffer ? `${treffer.termin_nr || treffer.id} (${treffer.sicherheit})` : '-';

    return `
      <tr onclick="app.showAuftragsimportDetails(${item.id})" style="cursor:pointer;">
        <td>${this.escapeHtml(item.status || '-')}</td>
        <td>${this.escapeHtml(item.original_dateiname || '-')}</td>
        <td>${this.escapeHtml(kunde)}</td>
        <td>${this.escapeHtml(kennzeichen)}</td>
        <td>${this.escapeHtml(arbeit)}</td>
        <td>${zeit}</td>
        <td>${this.escapeHtml(trefferText)}</td>
      </tr>
    `;
  }).join('');

  list.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Datei</th>
          <th>Kunde</th>
          <th>Kennzeichen</th>
          <th>Arbeit</th>
          <th>Zeit</th>
          <th>Treffer</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  this.showAuftragsimportDetails(imports[0].id);
};

App.prototype.showAuftragsimportDetails = function(id) {
  const details = document.getElementById('auftragsimportDetails');
  if (!details) return;

  const item = (this.auftragsimporte || []).find(i => Number(i.id) === Number(id));
  if (!item) {
    details.innerHTML = '';
    return;
  }

  const daten = item.erkannte_daten || {};
  const arbeiten = daten.arbeit?.items || [];
  const treffer = item.zuordnungs_treffer || [];
  const arbeitsHtml = arbeiten.length
    ? arbeiten.map(a => `<li>${this.escapeHtml(a.text)}${a.dauer_minuten ? ` (${a.dauer_minuten} min)` : ''}</li>`).join('')
    : '<li>-</li>';
  const trefferHtml = treffer.length
    ? treffer.slice(0, 3).map(t => `
        <div style="padding:8px 0; border-bottom:1px solid #eee;">
          <strong>${this.escapeHtml(t.termin_nr || String(t.id))}</strong>
          ${this.escapeHtml(t.datum || '')} ${this.escapeHtml(t.kunde_name || '')}
          <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); app.zuordnenAuftragsimport(${item.id}, ${t.id})">Zuordnen</button>
        </div>
      `).join('')
    : '<div class="hint">Kein passender Termin gefunden</div>';

  details.innerHTML = `
    <div class="form-section" style="margin-top:0;">
      <h4>${this.escapeHtml(item.original_dateiname || 'PDF')}</h4>
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px;">
        <div><strong>Kunde</strong><br>${this.escapeHtml(daten.kunde?.name || '-')}</div>
        <div><strong>Kennzeichen</strong><br>${this.escapeHtml(daten.fahrzeug?.kennzeichen || '-')}</div>
        <div><strong>Auftrag</strong><br>${this.escapeHtml(daten.auftragsnummer || '-')}</div>
        <div><strong>Datum</strong><br>${this.escapeHtml(daten.datum || '-')}</div>
        <div><strong>Abholung</strong><br>${this.escapeHtml(daten.abholung?.zeit || '-')}</div>
        <div><strong>Zeit</strong><br>${this.escapeHtml(String(daten.geschaetzte_zeit || '-'))} min</div>
      </div>
      <h4>Arbeiten</h4>
      <ul>${arbeitsHtml}</ul>
      <h4>Moegliche Termine</h4>
      ${trefferHtml}
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:16px;">
        <button class="btn btn-primary" onclick="app.schnellterminAusAuftragsimport(${item.id})">Als Schnelltermin speichern</button>
        <button class="btn btn-secondary" onclick="app.locosoftPruefenAuftragsimport(${item.id})">Zu Locosoft-Pruefung</button>
        <button class="btn btn-danger" onclick="app.verwerfenAuftragsimport(${item.id})">Verwerfen</button>
      </div>
    </div>
  `;
};

App.prototype.scanAuftragsimporte = async function() {
  try {
    await AuftragsimportService.scan();
    this.showToast('PDF-Ordner gescannt', 'success');
    await this.loadAuftragsimporte();
  } catch (error) {
    console.error('Fehler beim Scannen:', error);
    this.showToast('Fehler beim Scannen', 'error');
  }
};

App.prototype.schnellterminAusAuftragsimport = async function(id) {
  try {
    await AuftragsimportService.createSchnelltermin(id);
    this.showToast('Schnelltermin erstellt', 'success');
    await this.loadAuftragsimporte();
    this.loadTermine();
  } catch (error) {
    console.error('Fehler beim Erstellen:', error);
    this.showToast('Fehler beim Erstellen', 'error');
  }
};

App.prototype.zuordnenAuftragsimport = async function(id, terminId) {
  try {
    await AuftragsimportService.zuordnen(id, terminId);
    this.showToast('Auftrag zugeordnet', 'success');
    await this.loadAuftragsimporte();
  } catch (error) {
    console.error('Fehler beim Zuordnen:', error);
    this.showToast('Fehler beim Zuordnen', 'error');
  }
};

App.prototype.locosoftPruefenAuftragsimport = async function(id) {
  try {
    await AuftragsimportService.locosoftPruefen(id);
    this.showToast('In Locosoft-Pruefung verschoben', 'success');
    await this.loadAuftragsimporte();
  } catch (error) {
    console.error('Fehler beim Verschieben:', error);
    this.showToast('Fehler beim Verschieben', 'error');
  }
};

App.prototype.verwerfenAuftragsimport = async function(id) {
  if (!confirm('Diesen PDF-Import verwerfen?')) return;
  try {
    await AuftragsimportService.verwerfen(id);
    this.showToast('Import verworfen', 'success');
    await this.loadAuftragsimporte();
  } catch (error) {
    console.error('Fehler beim Verwerfen:', error);
    this.showToast('Fehler beim Verwerfen', 'error');
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
