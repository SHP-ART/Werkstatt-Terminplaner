const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database/werkstatt.db');

db.get('SELECT nebenzeit_prozent FROM werkstatt_einstellungen', [], (err, einst) => {
  const nebenzeitProzent = einst ? einst.nebenzeit_prozent : 0;
  console.log('Nebenzeit:', nebenzeitProzent, '%');
  
  db.all('SELECT id, bring_zeit, arbeitszeiten_details, geschaetzte_zeit FROM termine WHERE arbeitszeiten_details IS NOT NULL', [], (err, termine) => {
    if (err) { console.error(err); return; }
    
    let updated = 0;
    termine.forEach(t => {
      try {
        const details = JSON.parse(t.arbeitszeiten_details);
        let gesamtMinuten = 0;
        let fruehesteStartzeit = null;
        
        for (const [key, value] of Object.entries(details)) {
          if (key.startsWith('_')) {
            if (key === '_startzeit' && value) fruehesteStartzeit = value;
            continue;
          }
          
          let zeit = typeof value === 'object' ? (value.zeit || 0) : value;
          if (nebenzeitProzent > 0 && zeit > 0) {
            zeit = zeit * (1 + nebenzeitProzent / 100);
          }
          gesamtMinuten += zeit;
          
          if (typeof value === 'object' && value.startzeit && value.startzeit !== '') {
            if (!fruehesteStartzeit || value.startzeit < fruehesteStartzeit) {
              fruehesteStartzeit = value.startzeit;
            }
          }
        }
        
        const startzeit = fruehesteStartzeit || t.bring_zeit;
        if (startzeit && gesamtMinuten > 0) {
          const [h, m] = startzeit.split(':').map(Number);
          const endMinuten = h * 60 + m + Math.round(gesamtMinuten);
          const endH = Math.floor(endMinuten / 60);
          const endM = endMinuten % 60;
          const endzeit = String(endH).padStart(2,'0') + ':' + String(endM).padStart(2,'0');
          
          db.run('UPDATE termine SET startzeit = ?, endzeit_berechnet = ? WHERE id = ?', [startzeit, endzeit, t.id]);
          console.log('Termin', t.id, ': Start', startzeit, '-> Ende', endzeit);
          updated++;
        }
      } catch (e) {
        console.error('Fehler bei Termin', t.id, e.message);
      }
    });
    
    setTimeout(() => {
      console.log('\n' + updated + ' Termine aktualisiert');
      db.close();
    }, 1000);
  });
});
