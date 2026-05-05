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
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
