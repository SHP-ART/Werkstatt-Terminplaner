import logging
import os
import socket
import threading
import time
from typing import List, Optional

import numpy as np
import requests
from fastapi import FastAPI
from pydantic import BaseModel
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import Ridge
from sklearn.metrics.pairwise import cosine_similarity
import joblib
from zeroconf import ServiceBrowser, ServiceInfo, Zeroconf

APP_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.abspath(os.path.join(APP_DIR, '..'))
DATA_DIR = os.path.join(BASE_DIR, 'data')
MODEL_PATH = os.path.join(DATA_DIR, 'model.joblib')

BACKEND_URL = os.environ.get('BACKEND_URL', '').rstrip('/')
SERVICE_PORT = int(os.environ.get('SERVICE_PORT', '5000'))
TRAINING_INTERVAL_MINUTES = int(os.environ.get('TRAINING_INTERVAL_MINUTES', '1440'))
TRAINING_LIMIT = int(os.environ.get('TRAINING_LIMIT', '0'))
TRAINING_LOOKBACK_DAYS = int(os.environ.get('TRAINING_LOOKBACK_DAYS', '14'))
TRAINING_MAX_RETRIES = int(os.environ.get('TRAINING_MAX_RETRIES', '5'))
TRAINING_BACKOFF_INITIAL_SECONDS = float(os.environ.get('TRAINING_BACKOFF_INITIAL_SECONDS', '5'))
TRAINING_BACKOFF_MAX_SECONDS = float(os.environ.get('TRAINING_BACKOFF_MAX_SECONDS', '300'))
BACKEND_TIMEOUT_SECONDS = float(os.environ.get('BACKEND_TIMEOUT_SECONDS', '5'))
DISCOVERY_ENABLED = os.environ.get('DISCOVERY_ENABLED', '1') != '0'
BACKEND_DISCOVERY_ENABLED = os.environ.get('BACKEND_DISCOVERY_ENABLED', '1') != '0'

DEFAULT_MINUTES = 60
MIN_MINUTES = 5
MAX_MINUTES = 480
SUGGESTION_LIMIT = 5

logging.basicConfig(level=logging.INFO, format='[KI] %(message)s')

app = FastAPI(title='Werkstatt KI Service', version='1.0')

_model_lock = threading.Lock()
_train_lock = threading.Lock()
_model_state = {
    'vectorizer': None,
    'regressor': None,
    'task_texts': [],
    'task_matrix': None,
    'trained_at': 0,
    'samples': 0,
    'training_in_progress': False,
    'last_train_request_at': 0
}

_zeroconf = None
_service_info = None
_backend_zeroconf = None
_backend_browser = None
_backend_lock = threading.Lock()

KATEGORIEN = [
    ('Inspektion', ['inspektion', 'service', 'wartung', 'durchsicht']),
    ('Bremsen', ['bremse', 'brems']),
    ('Motor', ['motor', 'zahnriemen', 'kupplung', 'getriebe']),
    ('Elektrik', ['licht', 'elektrik', 'batterie', 'sensor']),
    ('Klima', ['klima', 'kuehl', 'kalt', 'heizung']),
    ('Reifen', ['reifen', 'rad', 'felge']),
    ('Karosserie', ['karosserie', 'tuer', 'stoss', 'stoß', 'lack'])
]

TEILE_HINTS = [
    (['brems', 'bremse'], ['Bremsbelaege', 'Bremsscheiben']),
    (['oel', 'ol', 'oil'], ['Motoroel', 'Oelfilter']),
    (['klima', 'kuehl', 'klimaanlage'], ['Kaeltemittel', 'Innenraumfilter']),
    (['batterie'], ['Batterie']),
    (['reifen'], ['Reifen', 'Ventile']),
    (['zahnriemen'], ['Zahnriemen-Kit', 'Wasserpumpe']),
    (['kerze', 'zuendkerze'], ['Zuendkerzen']),
    (['luftfilter'], ['Luftfilter'])
]


class ArbeitenRequest(BaseModel):
    beschreibung: str
    fahrzeug: Optional[str] = None


class ZeitRequest(BaseModel):
    arbeiten: List[str]
    fahrzeug: Optional[str] = None


def normalize_text(text: str) -> str:
    return (
        str(text or '')
        .lower()
        .replace('ä', 'ae')
        .replace('ö', 'oe')
        .replace('ü', 'ue')
        .replace('ß', 'ss')
        .replace('-', ' ')
        .replace('_', ' ')
        .strip()
    )


def minutes_to_hours(minutes: float) -> float:
    return round(float(minutes) / 60.0, 2)


def prioritaet_aus_text(text: str) -> str:
    norm = normalize_text(text)
    if not norm:
        return 'mittel'
    if 'dringend' in norm or 'sofort' in norm or 'notfall' in norm:
        return 'hoch'
    if 'brem' in norm or 'lenk' in norm or 'unfall' in norm:
        return 'hoch'
    if 'bald' in norm or 'zeitnah' in norm or 'demnaechst' in norm:
        return 'mittel'
    return 'niedrig'


def kategorisiere_arbeit(text: str) -> str:
    norm = normalize_text(text)
    for name, keys in KATEGORIEN:
        if any(key in norm for key in keys):
            return name
    return 'Sonstiges'


def ensure_data_dir() -> None:
    if not os.path.isdir(DATA_DIR):
        os.makedirs(DATA_DIR, exist_ok=True)


def set_backend_url(url: str) -> None:
    global BACKEND_URL
    if not url:
        return
    normalized = url.rstrip('/')
    with _backend_lock:
        BACKEND_URL = normalized


def get_backend_url() -> str:
    with _backend_lock:
        return BACKEND_URL


def load_model_from_disk() -> None:
    if not os.path.isfile(MODEL_PATH):
        return
    try:
        state = joblib.load(MODEL_PATH)
        if not isinstance(state, dict):
            return
        with _model_lock:
            _model_state.update(state)
        logging.info('Modell geladen (%s Samples)', _model_state.get('samples', 0))
    except Exception as err:
        logging.warning('Modell konnte nicht geladen werden: %s', err)


def save_model_to_disk(state: dict) -> None:
    ensure_data_dir()
    try:
        joblib.dump(state, MODEL_PATH)
    except Exception as err:
        logging.warning('Modell konnte nicht gespeichert werden: %s', err)


def fetch_training_data_with_retry(since_id: int) -> Optional[tuple]:
    delay = TRAINING_BACKOFF_INITIAL_SECONDS
    for attempt in range(1, TRAINING_MAX_RETRIES + 1):
        try:
            backend_url = get_backend_url()
            if not backend_url:
                logging.info('BACKEND_URL nicht gesetzt - warte auf Auto-Discovery.')
                return None
            params = {}
            if TRAINING_LIMIT <= 0:
                params['limit'] = 'all'
            else:
                params['limit'] = TRAINING_LIMIT
            if TRAINING_LOOKBACK_DAYS > 0:
                params['lookback_days'] = TRAINING_LOOKBACK_DAYS
            if since_id > 0:
                params['since_id'] = since_id

            url = f'{backend_url}/api/ai/training-data'
            response = requests.get(url, params=params, timeout=BACKEND_TIMEOUT_SECONDS)
            response.raise_for_status()
            payload = response.json()
            data = payload.get('data', {})
            return data.get('termine', []), data.get('meta', {})
        except Exception as err:
            if attempt >= TRAINING_MAX_RETRIES:
                logging.warning('Training fetch fehlgeschlagen (%s Versuche): %s', attempt, err)
                return None
            logging.info('Backend nicht erreichbar (%s/%s). Retry in %.0fs', attempt, TRAINING_MAX_RETRIES, delay)
            time.sleep(min(delay, TRAINING_BACKOFF_MAX_SECONDS))
            delay = min(delay * 2, TRAINING_BACKOFF_MAX_SECONDS)


def _train_model_internal() -> None:
    if not get_backend_url():
        if BACKEND_DISCOVERY_ENABLED:
            start_backend_discovery()
        logging.info('BACKEND_URL nicht gesetzt - Training uebersprungen.')
        return

    with _model_lock:
        cache = _model_state.get('training_cache')
        if cache is None or not isinstance(cache, dict):
            cache = {}
        last_id = int(_model_state.get('last_id', 0) or 0)

    result = fetch_training_data_with_retry(last_id)
    if result is None:
        return

    termine, meta = result
    updated = False

    for termin in termine:
        try:
            tid = int(termin.get('id'))
        except (TypeError, ValueError):
            continue

        if termin.get('ki_training_exclude') or termin.get('status') != 'abgeschlossen':
            if tid in cache:
                del cache[tid]
                updated = True
            continue

        arbeit = termin.get('arbeit')
        zeit = termin.get('tatsaechliche_zeit')
        if not arbeit or zeit is None:
            if tid in cache:
                del cache[tid]
                updated = True
            continue

        try:
            minutes = float(zeit)
        except (TypeError, ValueError):
            if tid in cache:
                del cache[tid]
                updated = True
            continue

        if minutes <= 0:
            if tid in cache:
                del cache[tid]
                updated = True
            continue

        cache[tid] = {
            'id': tid,
            'datum': termin.get('datum'),
            'text': normalize_text(arbeit),
            'minutes': minutes
        }
        updated = True

    max_id = meta.get('max_id') if isinstance(meta, dict) else None
    if max_id:
        last_id = int(max_id)

    if not cache:
        logging.info('Keine Trainingsdaten vorhanden.')
        with _model_lock:
            _model_state['training_cache'] = cache
            _model_state['last_id'] = last_id
        return

    if not updated:
        with _model_lock:
            _model_state['last_id'] = last_id
        logging.info('Keine neuen Trainingsdaten.')
        return

    texts = [entry['text'] for entry in cache.values()]
    targets = [entry['minutes'] for entry in cache.values()]

    if len(texts) < 3:
        logging.info('Zu wenig Trainingsdaten (%s).', len(texts))
        with _model_lock:
            _model_state['training_cache'] = cache
            _model_state['last_id'] = last_id
        return

    vectorizer = TfidfVectorizer(ngram_range=(1, 2))
    X = vectorizer.fit_transform(texts)
    regressor = Ridge(alpha=1.0)
    regressor.fit(X, np.array(targets))

    task_texts = []
    seen = set()
    for text in texts:
        if text in seen:
            continue
        seen.add(text)
        task_texts.append(text)
    task_matrix = vectorizer.transform(task_texts)

    state = {
        'vectorizer': vectorizer,
        'regressor': regressor,
        'task_texts': task_texts,
        'task_matrix': task_matrix,
        'trained_at': int(time.time()),
        'samples': len(texts),
        'training_cache': cache,
        'last_id': last_id
    }

    with _model_lock:
        _model_state.update(state)

    save_model_to_disk(state)
    logging.info('Modell trainiert (%s Samples, %s Tasks).', len(texts), len(task_texts))


def train_model() -> bool:
    if not _train_lock.acquire(blocking=False):
        logging.info('Training laeuft bereits.')
        return False

    try:
        with _model_lock:
            _model_state['training_in_progress'] = True
            _model_state['last_train_request_at'] = int(time.time())
        _train_model_internal()
        return True
    finally:
        with _model_lock:
            _model_state['training_in_progress'] = False
        _train_lock.release()


def training_loop() -> None:
    while True:
        train_model()
        if not get_backend_url():
            time.sleep(60)
            continue
        time.sleep(TRAINING_INTERVAL_MINUTES * 60)


def predict_minutes(text: str) -> Optional[int]:
    with _model_lock:
        vectorizer = _model_state.get('vectorizer')
        regressor = _model_state.get('regressor')
    if not vectorizer or not regressor:
        return None
    X = vectorizer.transform([normalize_text(text)])
    minutes = float(regressor.predict(X)[0])
    minutes = int(round(minutes))
    minutes = max(MIN_MINUTES, min(MAX_MINUTES, minutes))
    return minutes


def suggest_tasks(text: str) -> list:
    with _model_lock:
        vectorizer = _model_state.get('vectorizer')
        task_texts = _model_state.get('task_texts', [])
        task_matrix = _model_state.get('task_matrix')

    if not vectorizer or task_matrix is None or not task_texts:
        return []

    query = vectorizer.transform([normalize_text(text)])
    scores = cosine_similarity(task_matrix, query).ravel()
    top_idx = scores.argsort()[::-1][:SUGGESTION_LIMIT]
    return [task_texts[i] for i in top_idx if scores[i] > 0]


def teile_bedarf(text: str) -> list:
    norm = normalize_text(text)
    teile = []
    seen = set()
    for keys, items in TEILE_HINTS:
        if any(key in norm for key in keys):
            for teil in items:
                if teil in seen:
                    continue
                seen.add(teil)
                teile.append({
                    'name': teil,
                    'grund': 'Schluesselwort erkannt',
                    'sicherheit': 'mittel'
                })
    return teile


def get_local_ip() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(('8.8.8.8', 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except Exception:
        return socket.gethostbyname(socket.gethostname())


def register_mdns() -> None:
    global _zeroconf, _service_info
    if not DISCOVERY_ENABLED:
        return
    try:
        hostname = socket.gethostname()
        ip = get_local_ip()
        service_type = '_werkstatt-ki._tcp.local.'
        service_name = f'Werkstatt-KI-{hostname}.{service_type}'
        properties = {
            'version': '1.0',
            'device': hostname,
            'capabilities': 'estimate-zeit,suggest-arbeiten,teile-bedarf'
        }
        _service_info = ServiceInfo(
            service_type,
            service_name,
            addresses=[socket.inet_aton(ip)],
            port=SERVICE_PORT,
            properties=properties
        )
        _zeroconf = Zeroconf()
        _zeroconf.register_service(_service_info)
        logging.info('mDNS Service registriert (%s:%s)', ip, SERVICE_PORT)
    except Exception as err:
        logging.warning('mDNS Registrierung fehlgeschlagen: %s', err)


class BackendDiscoveryListener:
    def add_service(self, zeroconf, service_type, name):
        info = zeroconf.get_service_info(service_type, name, timeout=2000)
        if not info:
            return
        ip = None
        for addr in info.addresses:
            if len(addr) == 4:
                ip = socket.inet_ntoa(addr)
                break
        if not ip:
            return
        url = f'http://{ip}:{info.port}'
        set_backend_url(url)
        logging.info('Backend via mDNS gefunden: %s', url)


def start_backend_discovery() -> None:
    global _backend_zeroconf, _backend_browser
    if not BACKEND_DISCOVERY_ENABLED or get_backend_url():
        return
    if _backend_browser:
        return
    try:
        _backend_zeroconf = Zeroconf()
        _backend_browser = ServiceBrowser(
            _backend_zeroconf,
            '_werkstatt-backend._tcp.local.',
            BackendDiscoveryListener()
        )
        logging.info('Suche Backend via mDNS...')
    except Exception as err:
        logging.warning('Backend mDNS Discovery fehlgeschlagen: %s', err)


def unregister_mdns() -> None:
    global _zeroconf, _service_info
    if _zeroconf and _service_info:
        try:
            _zeroconf.unregister_service(_service_info)
            _zeroconf.close()
        except Exception:
            pass


@app.on_event('startup')
def on_startup() -> None:
    load_model_from_disk()
    register_mdns()
    start_backend_discovery()
    thread = threading.Thread(target=training_loop, daemon=True)
    thread.start()


@app.on_event('shutdown')
def on_shutdown() -> None:
    unregister_mdns()


@app.get('/health')
def health() -> dict:
    return {
        'status': 'ok',
        'device': socket.gethostname(),
        'backend_url': get_backend_url() or None,
        'backend_discovery': BACKEND_DISCOVERY_ENABLED,
        'model_samples': _model_state.get('samples', 0),
        'trained_at': _model_state.get('trained_at', 0),
        'last_id': _model_state.get('last_id', 0),
        'lookback_days': TRAINING_LOOKBACK_DAYS,
        'training_in_progress': _model_state.get('training_in_progress', False),
        'last_train_request_at': _model_state.get('last_train_request_at', 0),
        'service_port': SERVICE_PORT
    }


@app.post('/api/suggest-arbeiten')
def suggest_arbeiten(request: ArbeitenRequest) -> dict:
    beschreibung = request.beschreibung or ''
    fahrzeug = request.fahrzeug or ''

    suggestions = suggest_tasks(beschreibung)
    arbeiten = []
    for task in suggestions:
        minutes = predict_minutes(task) or DEFAULT_MINUTES
        arbeiten.append({
            'name': task,
            'beschreibung': task,
            'dauer_stunden': minutes_to_hours(minutes),
            'prioritaet': prioritaet_aus_text(beschreibung),
            'kategorie': kategorisiere_arbeit(task)
        })

    gesamt = sum(item['dauer_stunden'] for item in arbeiten)
    teile = teile_bedarf(beschreibung)

    return {
        'success': True,
        'data': {
            'arbeiten': arbeiten,
            'gesamtdauer_stunden': round(gesamt, 2),
            'empfehlung': 'Externe KI: Vorschlaege aus Trainingsdaten.',
            'hinweise': [f'Fahrzeug: {fahrzeug}'] if fahrzeug else [],
            'teile_vermutung': [t['name'] for t in teile]
        }
    }


@app.post('/api/estimate-zeit')
def estimate_zeit(request: ZeitRequest) -> dict:
    arbeiten = request.arbeiten or []
    zeiten = []

    for arbeit in arbeiten:
        minutes = predict_minutes(arbeit)
        if minutes is None:
            minutes = DEFAULT_MINUTES
            quelle = 'fallback'
        else:
            quelle = 'modell'
        zeiten.append({
            'arbeit': arbeit,
            'dauer_stunden': minutes_to_hours(minutes),
            'quelle': quelle
        })

    gesamtdauer = round(sum(item['dauer_stunden'] for item in zeiten), 2)
    return {
        'success': True,
        'data': {
            'zeiten': zeiten,
            'gesamtdauer': gesamtdauer,
            'quelle': 'externes Modell',
            'modell_samples': _model_state.get('samples', 0)
        }
    }


@app.post('/api/teile-bedarf')
def teile_bedarf_endpoint(request: ArbeitenRequest) -> dict:
    beschreibung = request.beschreibung or ''
    fahrzeug = request.fahrzeug or ''
    teile = teile_bedarf(beschreibung)
    return {
        'success': True,
        'data': {
            'teile': teile,
            'hinweise': [f'Fahrzeug: {fahrzeug}'] if fahrzeug else []
        }
    }


@app.post('/api/retrain')
def retrain_endpoint() -> dict:
    started = train_model()
    return {
        'success': True,
        'started': started,
        'message': 'Training gestartet' if started else 'Training läuft bereits',
        'trained_at': _model_state.get('trained_at', 0),
        'samples': _model_state.get('samples', 0)
    }
