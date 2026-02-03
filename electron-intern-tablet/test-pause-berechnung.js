/**
 * Test für Pausenberechnung in der Tablet-App
 * 
 * Testet die berechneEndzeit() Funktion mit verschiedenen Szenarien
 */

// Simulierte Personen-Daten
const personMitPause = {
  id: 1,
  name: 'Max Mustermann',
  wochenarbeitszeit_stunden: 40,
  arbeitstage_pro_woche: 5,
  mittagspause_start: '12:00',
  pausenzeit_minuten: 30
};

const personOhnePause = {
  id: 2,
  name: 'Lisa Beispiel',
  wochenarbeitszeit_stunden: 25,
  arbeitstage_pro_woche: 5,
  mittagspause_start: '12:00',
  pausenzeit_minuten: 30
};

const lehrling = {
  id: 3,
  name: 'Jonas Lehrling',
  wochenarbeitszeit_stunden: 40,
  arbeitstage_pro_woche: 5,
  mittagspause_start: '12:00',
  pausenzeit_minuten: 30,
  aufgabenbewaeltigung_prozent: 150
};

// Testfälle
const testfaelle = [
  {
    name: 'Fall 1: Arbeit vor Pause (kein Überlapp)',
    termin: {
      startzeit: '08:00',
      geschaetzte_zeit: 120 // 2h
    },
    person: personMitPause,
    erwartet: '10:00',
    beschreibung: '08:00 + 2h = 10:00 (keine Pause)'
  },
  {
    name: 'Fall 2: Arbeit über Pause (mit Überlapp)',
    termin: {
      startzeit: '11:00',
      geschaetzte_zeit: 180 // 3h
    },
    person: personMitPause,
    erwartet: '14:30',
    beschreibung: '11:00 + 3h geht über 12:00 Pause → +30min Pause → 14:30'
  },
  {
    name: 'Fall 3: Arbeit startet während Pause',
    termin: {
      startzeit: '12:15',
      geschaetzte_zeit: 120 // 2h
    },
    person: personMitPause,
    erwartet: '14:30',
    beschreibung: 'Start in Pause → verschiebt zu 12:30 + 2h = 14:30'
  },
  {
    name: 'Fall 4: Arbeit nach Pause',
    termin: {
      startzeit: '13:00',
      geschaetzte_zeit: 120 // 2h
    },
    person: personMitPause,
    erwartet: '15:00',
    beschreibung: '13:00 + 2h = 15:00 (nach Pause, keine Überschneidung)'
  },
  {
    name: 'Fall 5: Person unter 6h (keine Pausenpflicht)',
    termin: {
      startzeit: '11:00',
      geschaetzte_zeit: 180 // 3h
    },
    person: personOhnePause,
    erwartet: '14:00',
    beschreibung: '11:00 + 3h = 14:00 (keine Pause wegen 6h-Regel)'
  },
  {
    name: 'Fall 6: Lehrling mit Aufgabenbewältigung über Pause',
    termin: {
      startzeit: '11:00',
      geschaetzte_zeit: 120 // 2h Basis
    },
    person: lehrling,
    erwartet: '14:30',
    beschreibung: '2h * 150% = 3h, geht über Pause → +30min → 14:30'
  },
  {
    name: 'Fall 7: Kurzer Auftrag vor Pause',
    termin: {
      startzeit: '11:30',
      geschaetzte_zeit: 60 // 1h
    },
    person: personMitPause,
    erwartet: '13:00',
    beschreibung: '11:30 + 1h = 12:30, geht über 12:00 → +30min Pause → 13:00'
  },
  {
    name: 'Fall 8: Langer Auftrag über Pause',
    termin: {
      startzeit: '10:00',
      geschaetzte_zeit: 300 // 5h
    },
    person: personMitPause,
    erwartet: '15:30',
    beschreibung: '10:00 + 5h = 15:00, geht über 12:00 → +30min → 15:30'
  }
];

// Berechne Endzeit (kopiert aus index.html)
function berechneEndzeit(termin, person, isLehrling, globaleNebenzeit = 0) {
  const startzeit = termin.startzeit || termin.bring_zeit;
  if (!startzeit) return '--:--';

  // Dauer berechnen (mit Faktoren)
  let dauer = termin.geschaetzte_zeit || 60;
  
  // Globale Nebenzeit
  if (globaleNebenzeit > 0) {
    dauer = dauer * (1 + globaleNebenzeit / 100);
  }

  // Aufgabenbewältigung für Lehrlinge
  if (isLehrling && person && person.aufgabenbewaeltigung_prozent &&
      person.aufgabenbewaeltigung_prozent !== 100) {
    dauer = dauer * (person.aufgabenbewaeltigung_prozent / 100);
  }

  const [h, m] = startzeit.split(':').map(Number);
  const startMinuten = h * 60 + m;
  let gesamtMinuten = startMinuten + Math.round(dauer);

  // Pausenberücksichtigung (6h-Regel beachten)
  if (person) {
    const wochenStunden = person.wochenarbeitszeit_stunden || person.arbeitsstunden_pro_tag * (person.arbeitstage_pro_woche || 5);
    const arbeitstage = person.arbeitstage_pro_woche || 5;
    const taeglicheStunden = wochenStunden / arbeitstage;

    // Nur bei >= 6h Arbeitszeit pro Tag Pause berücksichtigen
    if (taeglicheStunden >= 6) {
      const pauseStart = person.mittagspause_start;
      const pauseDauer = person.pausenzeit_minuten || 30;

      if (pauseStart && pauseDauer > 0) {
        const [pauseH, pauseM] = pauseStart.split(':').map(Number);
        const pausenStart = pauseH * 60 + pauseM;
        const pausenEnde = pausenStart + pauseDauer;
        const endMinutenOhnePause = startMinuten + Math.round(dauer);

        // Fall 1: Arbeit beginnt vor Pause und endet nach Pause-Start
        if (startMinuten < pausenStart && endMinutenOhnePause > pausenStart) {
          gesamtMinuten += pauseDauer;
          console.log(`  → Pause addiert: +${pauseDauer}min`);
        }
        // Fall 2: Arbeit beginnt während der Pause
        else if (startMinuten >= pausenStart && startMinuten < pausenEnde) {
          const verschiebung = pausenEnde - startMinuten;
          gesamtMinuten += verschiebung;
          console.log(`  → Start in Pause, verschoben: +${verschiebung}min`);
        }
      }
    } else {
      console.log(`  → Keine Pause (6h-Regel: ${taeglicheStunden.toFixed(1)}h/Tag)`);
    }
  }

  const endH = Math.floor(gesamtMinuten / 60);
  const endM = gesamtMinuten % 60;

  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

// Tests ausführen
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  TEST: Pausenberechnung in Tablet-App');
console.log('═══════════════════════════════════════════════════════════\n');

let erfolge = 0;
let fehler = 0;

testfaelle.forEach((test, index) => {
  console.log(`\nTest ${index + 1}: ${test.name}`);
  console.log(`─────────────────────────────────────────────────────────`);
  console.log(`Person: ${test.person.name}`);
  console.log(`Start: ${test.termin.startzeit}, Dauer: ${test.termin.geschaetzte_zeit}min`);
  console.log(`Beschreibung: ${test.beschreibung}`);
  
  const isLehrling = test.person.aufgabenbewaeltigung_prozent !== undefined;
  const ergebnis = berechneEndzeit(test.termin, test.person, isLehrling);
  
  const istKorrekt = ergebnis === test.erwartet;
  console.log(`\nErwartet: ${test.erwartet}`);
  console.log(`Ergebnis: ${ergebnis}`);
  console.log(`Status:   ${istKorrekt ? '✅ BESTANDEN' : '❌ FEHLER'}`);
  
  if (istKorrekt) {
    erfolge++;
  } else {
    fehler++;
  }
});

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  ZUSAMMENFASSUNG`);
console.log(`═══════════════════════════════════════════════════════════`);
console.log(`Gesamt:     ${testfaelle.length} Tests`);
console.log(`Erfolgreich: ${erfolge} ✅`);
console.log(`Fehlgeschlagen: ${fehler} ❌`);
console.log(`Erfolgsrate: ${(erfolge / testfaelle.length * 100).toFixed(1)}%`);
console.log('═══════════════════════════════════════════════════════════\n');

if (fehler > 0) {
  process.exit(1);
}
