export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeSelector(value) {
  if (window.CSS && CSS.escape) {
    return CSS.escape(value);
  }
  return String(value).replace(/["\\]/g, '\\$&');
}

export function setTextIfExists(id, text) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.textContent = text;
  return true;
}

export function bindEventListenerOnce(element, event, handler, key) {
  if (!element) return false;
  const datasetKey = `bound${key || event}`;
  if (element.dataset[datasetKey]) return false;
  element.addEventListener(event, handler);
  element.dataset[datasetKey] = 'true';
  return true;
}
