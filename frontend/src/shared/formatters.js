export function getToday(now = new Date()) {
  return now;
}

export function formatDateLocal(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatMinutesToHours(minutes) {
  const value = Number(minutes) || 0;
  if (value < 60) return `${value}min`;
  const hours = value / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

export function getKalenderwoche(date) {
  if (!date) return null;
  const parsed = date instanceof Date
    ? date
    : new Date(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date);
  if (Number.isNaN(parsed.getTime())) return null;

  const d = new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export function berechneEndzeit(startzeit, dauerMinuten) {
  if (!startzeit) return '08:00';
  const [h, m] = startzeit.split(':').map(Number);
  const gesamtMinuten = h * 60 + m + (dauerMinuten || 0);
  const endH = Math.floor(gesamtMinuten / 60);
  const endM = gesamtMinuten % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

export function naechsterArbeitstag(datum) {
  const d = new Date(datum + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split('T')[0];
}

export function formatDateGerman(datum) {
  if (!datum) return '--';
  const d = new Date(datum + 'T12:00:00');
  const wochentage = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  return `${wochentage[d.getDay()]}, ${datum.split('-').reverse().join('.')}`;
}
