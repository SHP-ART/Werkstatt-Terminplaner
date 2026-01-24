# Lokale KI mit Hardware-Beschleuniger

## Übersicht

Dieses Dokument beschreibt, wie die lokale KI des Werkstatt-Terminplaners mit dedizierter AI-Hardware beschleunigt werden kann - von der günstigen USB-Lösung bis zum leistungsstarken Standalone-System.

---

## Hardware-Optionen im Vergleich

| Option | TOPS | Preis | Installation | Empfehlung |
|--------|------|-------|--------------|------------|
| 🥇 **Google Coral USB** | 4 | ~60€ | USB einstecken | **Einstieg** |
| 🥈 **BeagleBone AI-64** | 8 | ~185€ | Standalone | Industrie/Robust |
| 🥉 **RPi 5 + Hailo-8** | 26 | ~240€ | Standalone | Maximum |

---

## Option 1: Google Coral USB (Empfohlen für Einstieg)

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

## Option 2: BeagleBone AI-64 (Standalone, Robust)

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

## Option 3: Raspberry Pi 5 + Hailo-8 (Maximum)

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
| **Coral USB** | 60€ | ~1€ | < 1 Jahr |
| BeagleBone AI-64 | 185€ | ~5€ | ~2 Jahre |
| RPi 5 + Hailo-8 | 240€ | ~3€ | ~2-3 Jahre |
| ChatGPT API | 0€ | 50-100€ | - |

---

## Empfehlung

| Situation | Empfehlung |
|-----------|------------|
| **Einstieg / Budget** | 🥇 Google Coral USB (60€) |
| **Robuster Dauerbetrieb** | 🥈 BeagleBone AI-64 (185€) |
| **Maximale Leistung** | 🥉 RPi 5 + Hailo-8 (240€) |

**Für die Werkstatt-KI empfohlen: Google Coral USB**
- Günstigste Option
- Einfachste Installation (USB einstecken)
- 4 TOPS reichen für Text-basierte KI
- Kann später upgraden wenn nötig

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
- [Sentence Transformers](https://www.sbert.net/)
