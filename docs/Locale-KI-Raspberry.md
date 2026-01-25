# Lokale KI mit Hardware-Beschleuniger

## Übersicht

Dieses Dokument beschreibt, wie die lokale KI des Werkstatt-Terminplaners mit dedizierter Hardware beschleunigt werden kann - von der günstigen Mini-PC-Lösung bis zum leistungsstarken System mit AI-Beschleuniger.

---

## Hardware-Optionen im Vergleich

| Option | Leistung | Preis | Installation | Empfehlung |
|--------|----------|-------|--------------|------------|
| 🥇 **Intel N100 Mini-PC** | CPU (AVX2) | ~130€ | Fertig | **Beste Wahl** |
| 🥈 **Google Coral USB** | 4 TOPS | ~60€ | USB einstecken | Budget |
| 🥉 **BeagleBone AI-64** | 8 TOPS | ~185€ | Standalone | Industrie |
| **RPi 5 + Hailo-8** | 26 TOPS | ~240€ | Standalone | Overkill |

---

## Option 1: Intel N100/N95 Mini-PC (EMPFOHLEN)

### Warum Intel N100?

Für die Text-basierten KI-Modelle (Zeitschätzung, Arbeiten-Vorschläge) ist **kein NPU/TPU nötig**. Ein moderner x86-Prozessor mit AVX2-Instruktionen ist schneller und einfacher als ARM + Beschleuniger.

### Vergleich Intel vs Raspberry Pi

| Eigenschaft | Intel N100 | Intel N95 | Raspberry Pi 5 |
|-------------|------------|-----------|----------------|
| **Kerne** | 4 (E-Cores) | 4 (E-Cores) | 4 (Cortex-A76) |
| **Takt** | bis 3.4 GHz | bis 3.4 GHz | 2.4 GHz |
| **RAM** | bis 16 GB DDR5 | bis 16 GB DDR4 | 4/8 GB |
| **AVX2** | Ja | Ja | Nein |
| **TDP** | 6W | 6W | 5W |

### Performance für KI-Modelle

| Aufgabe | RPi 5 | Intel N95 | Intel N100 |
|---------|-------|-----------|------------|
| **Text-Embedding (MiniLM)** | ~100 ms | ~45 ms | ~40 ms |
| **Zeitschätzung** | ~2 ms | <1 ms | <1 ms |
| **Gesamt pro Anfrage** | ~110 ms | ~50 ms | ~45 ms |

**Intel ist ~2x schneller** dank AVX2-SIMD-Instruktionen!

### Vorteile

- **Schneller** - 2x schneller als RPi 5 ohne Zusatzhardware
- **Einfacher** - x86 = alle Python-Pakete laufen direkt
- **Mehr RAM** - bis 16 GB möglich
- **Leise** - viele Mini-PCs sind passiv gekühlt
- **SSD-Support** - SATA/NVMe für schnellen Speicher

### Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                        Lokales Netzwerk                         │
│                                                                 │
│  ┌──────────────────────┐         ┌──────────────────────────┐ │
│  │   Werkstatt-Server   │         │    Intel N100 Mini-PC    │ │
│  │   (Backend + DB)     │  HTTP   │    (passiv gekühlt)      │ │
│  │                      │◄───────►│                          │ │
│  │  - Node.js Backend   │  REST   │  - KI-Service (Python)   │ │
│  │  - SQLite DB         │   API   │  - AVX2 Beschleunigung   │ │
│  │  - Frontend          │         │  - mDNS Discovery        │ │
│  └──────────────────────┘         └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Empfohlene Geräte

| Gerät | Preis | Besonderheiten |
|-------|-------|----------------|
| **Trigkey G4** | ~120€ | N95, 8GB, 256GB SSD |
| **Beelink Mini S12** | ~130€ | N95, 8GB, 256GB SSD |
| **Minisforum UN100C** | ~150€ | N100, 8GB, 256GB SSD |
| **GMKtec G3** | ~140€ | N100, 8GB, 512GB SSD |

### Installation

```bash
# 1. Ubuntu Server 22.04/24.04 oder Debian 12 installieren

# 2. Python-Umgebung einrichten
sudo apt update
sudo apt install python3-pip python3-venv
python3 -m venv ~/werkstatt-ki
source ~/werkstatt-ki/bin/activate

# 3. KI-Pakete installieren (AVX2 wird automatisch genutzt)
pip install fastapi uvicorn numpy
pip install sentence-transformers  # MiniLM für Text-Embeddings
pip install scikit-learn           # Für Regression/Klassifikation
pip install onnxruntime            # Optimierte Inferenz

# 4. mDNS für automatische Erkennung
sudo apt install avahi-daemon
pip install zeroconf

# 5. KI-Service starten
python app/main.py
```

### Warum kein NPU/TPU nötig?

Die KI-Modelle für den Werkstatt-Terminplaner sind klein:

| Modell | Größe | Operationen/Anfrage |
|--------|-------|---------------------|
| MiniLM (Embeddings) | ~30 MB | ~20 Mio |
| Regression (Zeit) | ~2 MB | ~10.000 |
| Klassifikation | ~5 MB | ~50.000 |

Diese Modelle laufen auf CPUs mit AVX2 sehr schnell. Ein NPU/TPU lohnt sich erst bei:
- Großen Sprachmodellen (LLMs, >1 GB)
- Bildverarbeitung (CNNs)
- Echtzeit-Video-Analyse

**Fazit:** Für Text-KI ist Intel N100 die beste Wahl!

---

## Option 2: Google Coral USB (Budget-Option)

### Vorteile
- **Günstigste Lösung** (~60€)
- **Einfachste Installation** - USB 3.0 einstecken, fertig
- **Kein extra Gerät** - läuft direkt am Werkstatt-Server
- **Kein Netzwerk-Setup** - keine mDNS-Discovery nötig

### Architektur

```
┌─────────────────────────────────────────────────┐
│         Bestehender Werkstatt-Server            │
│                                                 │
│  ┌─────────────┐    ┌─────────────────────────┐│
│  │ Node.js     │    │ Google Coral USB        ││
│  │ Backend     │◄──►│ (4 TOPS Edge TPU)       ││
│  │             │USB │                         ││
│  └─────────────┘    └─────────────────────────┘│
│                                                 │
│  Alles auf einem Gerät - kein Netzwerk nötig!  │
└─────────────────────────────────────────────────┘
```

### Einkaufsliste

| Komponente | Preis |
|------------|-------|
| Google Coral USB Accelerator | ~60€ |
| **Gesamt** | **~60€** |

### Installation

```bash
# 1. Edge TPU Runtime installieren
echo "deb https://packages.cloud.google.com/apt coral-edgetpu-stable main" | \
  sudo tee /etc/apt/sources.list.d/coral-edgetpu.list
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add -
sudo apt-get update
sudo apt-get install libedgetpu1-std

# 2. Python-Bibliothek
pip install pycoral

# 3. Coral USB einstecken (USB 3.0 Port!)
```

### Integration ins Backend

```python
# backend/src/services/coralAiService.py
from pycoral.utils.edgetpu import make_interpreter
from pycoral.adapters import common
import numpy as np

class CoralAiService:
    def __init__(self):
        self.zeit_model = None
        self.arbeiten_model = None

    def load_models(self):
        """Lädt TFLite-Modelle auf den Coral Edge TPU"""
        self.zeit_model = make_interpreter('models/zeit_schaetzung_edgetpu.tflite')
        self.zeit_model.allocate_tensors()

        self.arbeiten_model = make_interpreter('models/arbeiten_edgetpu.tflite')
        self.arbeiten_model.allocate_tensors()

        print("✅ Coral Edge TPU Modelle geladen")

    def predict_zeit(self, arbeiten, fahrzeug=None):
        """Zeitschätzung mit Edge TPU"""
        zeiten = []

        for arbeit in arbeiten:
            # Input vorbereiten
            input_data = self._text_to_input(arbeit)
            common.set_input(self.zeit_model, input_data)

            # Inferenz
            self.zeit_model.invoke()

            # Output lesen
            output = common.output_tensor(self.zeit_model, 0)
            minuten = float(output[0])

            zeiten.append({
                "arbeit": arbeit,
                "dauer_stunden": round(minuten / 60, 2)
            })

        return {
            "zeiten": zeiten,
            "gesamtdauer_stunden": sum(z["dauer_stunden"] for z in zeiten),
            "quelle": "coral-edge-tpu"
        }

    def _text_to_input(self, text):
        """Konvertiert Text zu Model-Input"""
        # Tokenisierung / Embedding
        pass
```

### Node.js Wrapper

```javascript
// backend/src/services/coralAiService.js
const { spawn } = require('child_process');
const path = require('path');

class CoralAiService {
  constructor() {
    this.pythonPath = process.env.PYTHON_PATH || 'python3';
    this.scriptPath = path.join(__dirname, 'coral_inference.py');
  }

  async estimateZeit(arbeiten, fahrzeug = '') {
    return new Promise((resolve, reject) => {
      const process = spawn(this.pythonPath, [
        this.scriptPath,
        'estimate_zeit',
        JSON.stringify({ arbeiten, fahrzeug })
      ]);

      let result = '';
      process.stdout.on('data', (data) => result += data);
      process.on('close', (code) => {
        if (code === 0) {
          resolve(JSON.parse(result));
        } else {
          reject(new Error('Coral inference failed'));
        }
      });
    });
  }
}

module.exports = new CoralAiService();
```

---

## Option 3: BeagleBone AI-64 (Industrie)

### Vorteile
- **Integrierter AI-Chip** (TI TDA4VM) - kein extra Modul
- **Industriequalität** - robuster als Raspberry Pi
- **16GB eMMC** eingebaut - keine SD-Karte nötig
- **Gutes Preis-Leistungs-Verhältnis**

### Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                        Lokales Netzwerk                         │
│                                                                 │
│  ┌──────────────────────┐         ┌──────────────────────────┐ │
│  │   Werkstatt-Server   │         │    BeagleBone AI-64      │ │
│  │   (Backend + DB)     │  HTTP   │    (8 TOPS integriert)   │ │
│  │                      │◄───────►│                          │ │
│  │  - Node.js Backend   │  REST   │  - KI-Service (Python)   │ │
│  │  - SQLite DB         │   API   │  - TI Vision SDK         │ │
│  │  - Frontend          │         │  - mDNS Discovery        │ │
│  └──────────────────────┘         └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Einkaufsliste

| Komponente | Preis |
|------------|-------|
| BeagleBone AI-64 (4GB, 16GB eMMC) | ~150€ |
| Netzteil 5V/3A USB-C | ~15€ |
| Gehäuse | ~20€ |
| **Gesamt** | **~185€** |

### Installation

```bash
# 1. Debian Image für BeagleBone AI-64 flashen
# Download: https://www.beagleboard.org/distros

# 2. TI Edge AI SDK installieren
sudo apt-get install ti-tidl-libs ti-vision-apps

# 3. Python-Umgebung
python3 -m venv ~/werkstatt-ki
source ~/werkstatt-ki/bin/activate
pip install fastapi uvicorn numpy onnxruntime-tidl
```

---

## Option 4: Raspberry Pi 5 + Hailo-8 (Overkill)

### Vorteile
- **Höchste Leistung** (26 TOPS)
- **Große Community** - viel Support/Tutorials
- **Zukunftssicher** - auch für anspruchsvollere Modelle
- **Flexibel** - viele Erweiterungen möglich

### Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                        Lokales Netzwerk                         │
│                                                                 │
│  ┌──────────────────────┐         ┌──────────────────────────┐ │
│  │   Werkstatt-Server   │         │    Raspberry Pi 5        │ │
│  │   (Backend + DB)     │  HTTP   │    + Hailo-8 (26 TOPS)   │ │
│  │                      │◄───────►│                          │ │
│  │  - Node.js Backend   │  REST   │  - KI-Service (Python)   │ │
│  │  - SQLite DB         │   API   │  - Hailo Runtime         │ │
│  │  - Frontend          │         │  - mDNS Discovery        │ │
│  └──────────────────────┘         └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Einkaufsliste

| Komponente | Preis |
|------------|-------|
| Raspberry Pi 5 B 8GB | ~90€ |
| Hailo-8 M.2 Modul | ~70€ |
| M.2 HAT für Pi 5 | ~15€ |
| NVMe SSD 256GB | ~30€ |
| Netzteil 27W USB-C | ~15€ |
| Gehäuse mit Kühlung | ~20€ |
| **Gesamt** | **~240€** |

### Installation

```bash
# 1. Raspberry Pi OS Lite (64-bit) flashen

# 2. Hailo Software Suite installieren
wget https://hailo.ai/downloads/hailo-8-software-suite.deb
sudo dpkg -i hailo-8-software-suite.deb
sudo apt-get install -f

# 3. Prüfen ob Hailo erkannt wird
hailortcli fw-control identify

# 4. Python-Umgebung
python3 -m venv ~/werkstatt-ki
source ~/werkstatt-ki/bin/activate
pip install fastapi uvicorn hailo-platform numpy
```

---

## Vergleich: Aktuelle KI vs. Hardware-KI

| Feature | Jetzt (Heuristik) | Mit AI-Hardware |
|---------|-------------------|-----------------|
| **Zeitschätzung** | Keyword + Durchschnitte | ML mit Mustererkennung |
| **Arbeiten-Vorschläge** | Wortlisten-Abgleich | NLP mit Kontext |
| **Teile-Erkennung** | Regelbasiert | ML-Klassifikation |
| **Genauigkeit** | ~70% | ~90%+ möglich |
| **Lernfähigkeit** | Nur Durchschnitte | Echtes Training |

### Konkretes Beispiel

```
Kunde sagt: "Bremsen quietschen beim Fahren, besonders bei Kälte"

Jetzt (Heuristik):
  → Findet "Bremsen" als Keyword
  → Vorschlag: "Bremsen" (generisch)

Mit AI-Hardware:
  → Versteht Kontext und Zusammenhänge
  → Vorschlag: Bremsbeläge + Bremsscheiben prüfen
  → Hinweis: Bei Kälte oft Rostbildung über Nacht
  → Zeitschätzung angepasst auf Fahrzeugtyp + km-Stand
```

---

## Erweiterungsmöglichkeiten

### 1. Intelligente Zeitschätzung
- Berücksichtigt Fahrzeugtyp, km-Stand, Saison
- Lernt aus historischen Daten der Werkstatt
- Erkennt Muster (z.B. "C3 + Bremsen = meist schneller")

### 2. Kontextbewusste Arbeiten-Vorschläge
- Versteht natürliche Sprache besser
- Erkennt zusammenhängende Probleme
- Schlägt oft vergessene Zusatzarbeiten vor

### 3. Predictive Maintenance
- Analysiert Kundenhistorie
- Sagt anstehende Wartungen voraus
- "Zahnriemen bei km 120.000 fällig" automatisch

### 4. Intelligente Tagesplanung
- Optimiert Terminverteilung
- Berücksichtigt Mitarbeiter-Skills
- Minimiert Leerlauf und Wartezeiten

---

## Netzwerk-Discovery (für Standalone-Optionen)

Für BeagleBone und Raspberry Pi: Automatische Erkennung via mDNS/Bonjour.

### KI-Device: Service ankündigen

```python
# discovery.py
from zeroconf import ServiceInfo, Zeroconf
import socket

def register_mdns_service(port=5000, device_type="coral"):
    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname + ".local")

    service_info = ServiceInfo(
        "_werkstatt-ki._tcp.local.",
        f"Werkstatt-KI-{hostname}._werkstatt-ki._tcp.local.",
        addresses=[socket.inet_aton(local_ip)],
        port=port,
        properties={
            'version': '1.0',
            'device': device_type,
            'capabilities': 'zeit-schaetzung,arbeiten-vorschlag,teile-erkennung'
        }
    )

    zeroconf = Zeroconf()
    zeroconf.register_service(service_info)
    print(f"✅ KI-Service registriert: {local_ip}:{port}")
    return zeroconf
```

### Backend: Service finden

```javascript
// backend/src/services/kiDiscovery.js
const mdns = require('mdns-js');

class KIDiscoveryService {
  constructor() {
    this.discoveredServices = new Map();
  }

  startDiscovery() {
    const browser = mdns.createBrowser(mdns.tcp('werkstatt-ki'));

    browser.on('ready', () => {
      console.log('🔍 Suche nach KI-Services...');
      browser.discover();
    });

    browser.on('update', (data) => {
      this.discoveredServices.set(data.fullname, {
        host: data.host,
        port: data.port,
        addresses: data.addresses,
        properties: data.txt || {}
      });
      console.log(`✅ KI-Service gefunden: ${data.host}:${data.port}`);
    });
  }

  getServiceUrl() {
    const service = [...this.discoveredServices.values()][0];
    if (service) {
      const ip = service.addresses?.[0] || service.host;
      return `http://${ip}:${service.port}`;
    }
    return null;
  }
}

module.exports = new KIDiscoveryService();
```

---

## KI-Service (FastAPI)

Gemeinsamer Service für alle Standalone-Optionen:

```python
# app/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

app = FastAPI(title="Werkstatt KI Service", version="1.0")

class ArbeitenRequest(BaseModel):
    beschreibung: str
    fahrzeug: Optional[str] = None

class ZeitRequest(BaseModel):
    arbeiten: List[str]
    fahrzeug: Optional[str] = None

# AI-Backend je nach Hardware
# from .coral_inference import CoralInference as AIBackend
# from .hailo_inference import HailoInference as AIBackend
# from .tidl_inference import TIDLInference as AIBackend

ai = AIBackend()

@app.get("/health")
async def health():
    return {"status": "ok", "device": ai.device_name}

@app.post("/api/suggest-arbeiten")
async def suggest_arbeiten(request: ArbeitenRequest):
    result = ai.predict_arbeiten(request.beschreibung, request.fahrzeug)
    return {"success": True, "data": result}

@app.post("/api/estimate-zeit")
async def estimate_zeit(request: ZeitRequest):
    result = ai.predict_zeit(request.arbeiten, request.fahrzeug)
    return {"success": True, "data": result}

@app.post("/api/teile-bedarf")
async def teile_bedarf(request: ArbeitenRequest):
    result = ai.predict_teile(request.beschreibung, request.fahrzeug)
    return {"success": True, "data": result}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000)
```

---

## Modell-Training

### Daten exportieren

```sql
-- Trainingsdaten aus Werkstatt-DB
SELECT
  arbeit,
  geschaetzte_zeit,
  tatsaechliche_zeit,
  fahrzeugtyp,
  kilometerstand
FROM termine
WHERE status = 'abgeschlossen'
  AND tatsaechliche_zeit > 0
  AND ki_training_exclude = 0;
```

### Modell trainieren

```python
# train_model.py
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sentence_transformers import SentenceTransformer
import tensorflow as tf

# Text-Embeddings erstellen
encoder = SentenceTransformer('paraphrase-MiniLM-L6-v2')

# Daten laden
df = pd.read_csv('trainingsdaten.csv')
X = encoder.encode(df['arbeit'].tolist())
y = df['tatsaechliche_zeit'].values

# Modell trainieren
model = RandomForestRegressor(n_estimators=100)
model.fit(X, y)

# Zu TFLite konvertieren (für Coral)
# oder zu ONNX (für Hailo/BeagleBone)
```

### Modell konvertieren

```bash
# Für Coral USB (TFLite + Edge TPU)
edgetpu_compiler zeit_model.tflite

# Für Hailo-8 (ONNX → HEF)
hailo_compiler --model zeit_model.onnx \
               --output zeit_model.hef \
               --hw-arch hailo8

# Für BeagleBone (ONNX → TIDL)
tidl_import_tool --model zeit_model.onnx
```

---

## Fallback-Strategie

```
┌─────────────────────────────────────────────────────────┐
│                    KI-Anfrage                           │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
              ┌───────────────┐
              │ Hardware-KI   │ ◄── Coral / BeagleBone / Hailo
              │ verfügbar?    │
              └───────┬───────┘
                      │
           Ja ────────┼──────── Nein
           │                     │
           ▼                     ▼
    ┌─────────────┐       ┌─────────────┐
    │ ML-Modell   │       │ Lokale KI   │ ◄── Heuristiken
    │ (schnell)   │       │ (Fallback)  │
    └─────────────┘       └─────────────┘
```

---

## Kostenvergleich

| Option | Einmalig | Strom/Jahr | Amortisation vs. ChatGPT |
|--------|----------|------------|--------------------------|
| **Intel N100 Mini-PC** | 130€ | ~5€ | ~1-2 Jahre |
| Coral USB | 60€ | ~1€ | < 1 Jahr |
| BeagleBone AI-64 | 185€ | ~5€ | ~2 Jahre |
| RPi 5 + Hailo-8 | 240€ | ~3€ | ~2-3 Jahre |
| ChatGPT API | 0€ | 50-100€ | - |

---

## Empfehlung

| Situation | Empfehlung |
|-----------|------------|
| **Beste Wahl** | 🥇 Intel N100 Mini-PC (~130€) |
| **Nur USB-Erweiterung** | 🥈 Google Coral USB (~60€) |
| **Industrie/Robust** | 🥉 BeagleBone AI-64 (~185€) |

**Für die Werkstatt-KI empfohlen: Intel N100 Mini-PC**
- Beste Preis-Leistung für Text-KI
- 2x schneller als Raspberry Pi
- Einfache x86-Software-Installation
- Passiv gekühlt, leise
- Keine Extra-Hardware (NPU/TPU) nötig

---

## Implementierungsplan

| Phase | Aufgabe |
|-------|---------|
| 1 | Hardware beschaffen |
| 2 | Treiber/SDK installieren |
| 3 | Modelle trainieren (mit Werkstatt-Daten) |
| 4 | KI-Service implementieren |
| 5 | Backend-Integration |
| 6 | UI: KI-Modus "Hardware" in Einstellungen |
| 7 | Test & Optimierung |

---

## Nächste Schritte

- [ ] Hardware wählen und beschaffen
- [ ] Treiber installieren
- [ ] Trainingsdaten aus DB exportieren
- [ ] Modelle trainieren und konvertieren
- [ ] KI-Service implementieren
- [ ] Backend-Integration
- [ ] Testen und optimieren

---

## Ressourcen

### Intel N100 Mini-PCs
- [Intel N100 Specs](https://ark.intel.com/content/www/us/en/ark/products/231803/intel-processor-n100.html)
- [ONNX Runtime](https://onnxruntime.ai/) - Optimierte CPU-Inferenz
- [Sentence Transformers](https://www.sbert.net/) - MiniLM Text-Embeddings

### Google Coral
- [Coral Dokumentation](https://coral.ai/docs/)
- [Edge TPU Compiler](https://coral.ai/docs/edgetpu/compiler/)

### BeagleBone AI-64
- [BeagleBoard.org](https://www.beagleboard.org/boards/beaglebone-ai-64)
- [TI Edge AI SDK](https://www.ti.com/tool/PROCESSOR-SDK-LINUX-SK-TDA4VM)

### Raspberry Pi + Hailo
- [Hailo Developer Zone](https://hailo.ai/developer-zone/)
- [Hailo Model Zoo](https://github.com/hailo-ai/hailo_model_zoo)
- [Raspberry Pi 5 Docs](https://www.raspberrypi.com/documentation/)

### Allgemein
- [mDNS/Zeroconf Python](https://python-zeroconf.readthedocs.io/)
- [FastAPI](https://fastapi.tiangolo.com/)
