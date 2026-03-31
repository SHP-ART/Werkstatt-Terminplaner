import json, sys
from collections import Counter

d = json.load(open('/tmp/t.json'))
alle = d['alle']
c = Counter(x['status'] for x in alle)
for k, v in c.items():
    print(f'status {k} = {v}')
print('---')
for g in ['dringend', 'dieseWoche', 'naechsteWoche', 'schwebend', 'kundenDirekt']:
    items = d['gruppiert'].get(g, [])
    c2 = Counter(x['status'] for x in items)
    print(f'{g} total={len(items)} statuses={dict(c2)}')
print('---')
print(f'statistik: {d.get("statistik", {})}')
