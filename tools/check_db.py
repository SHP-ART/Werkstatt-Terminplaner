import sqlite3
conn = sqlite3.connect('/var/lib/werkstatt-terminplaner/database/werkstatt.db')
c = conn.cursor()
c.execute("""
SELECT teile_status, COUNT(*) FROM termine 
WHERE teile_status IS NOT NULL AND teile_status != '' 
AND (geloescht_am IS NULL OR geloescht_am = '') 
AND status != 'abgeschlossen' 
GROUP BY teile_status
""")
for row in c.fetchall():
    print(f'{row[0]} = {row[1]}')
print('---')
c.execute("""
SELECT COUNT(*) FROM teile_bestellungen WHERE status = 'geliefert'
""")
print(f'teile_bestellungen mit status=geliefert: {c.fetchone()[0]}')
c.execute("""
SELECT COUNT(*) FROM teile_bestellungen WHERE status = 'bestellt'
""")
print(f'teile_bestellungen mit status=bestellt: {c.fetchone()[0]}')
c.execute("""
SELECT COUNT(*) FROM teile_bestellungen WHERE status = 'offen'
""")
print(f'teile_bestellungen mit status=offen: {c.fetchone()[0]}')
conn.close()
