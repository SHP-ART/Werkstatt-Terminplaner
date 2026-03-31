import json
from collections import Counter

d = json.load(open('/tmp/t.json'))
alle = d['alle']

# Zeige alle geliefert-Eintraege
geliefert = [x for x in alle if x['status'] == 'geliefert']
print(f'Geliefert total: {len(geliefert)}')
print('---')
for g in geliefert:
    tid = g.get('termin_id', 'N/A')
    kid = g.get('kunde_id', 'N/A')
    teil = g.get('teil_name', '')[:50]
    quelle = g.get('quelle', 'teile_bestellungen')
    ist_mark = g.get('ist_teile_status_markierung', False)
    ist_arb = g.get('ist_arbeiten_teile_status', False)
    eid = g.get('id', '')
    print(f'  id={eid} termin={tid} teil="{teil}" mark={ist_mark} arb={ist_arb}')

# Check fuer Duplikate nach termin_id
print('---')
termin_ids = [x.get('termin_id') for x in geliefert if x.get('termin_id')]
c = Counter(termin_ids)
for tid, count in c.most_common():
    if count > 1:
        print(f'  DUPLIKAT termin_id={tid} count={count}')
        dupes = [x for x in geliefert if x.get('termin_id') == tid]
        for dd in dupes:
            print(f'    id={dd["id"]} teil="{dd.get("teil_name","")[:40]}" mark={dd.get("ist_teile_status_markierung",False)} arb={dd.get("ist_arbeiten_teile_status",False)}')
