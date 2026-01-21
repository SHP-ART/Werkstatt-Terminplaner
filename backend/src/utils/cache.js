class SimpleCache {
  constructor(options = {}) {
    this.ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : 60000;
    this.maxEntries = Number.isFinite(options.maxEntries) ? options.maxEntries : 200;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() - entry.timestamp > entry.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    const ttl = Number.isFinite(ttlMs) ? ttlMs : this.ttlMs;
    this.store.set(key, { value, timestamp: Date.now(), ttlMs: ttl });
    this.evictIfNeeded();
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  evictIfNeeded() {
    if (this.store.size <= this.maxEntries) {
      return;
    }
    const excess = this.store.size - this.maxEntries;
    const keys = this.store.keys();
    for (let i = 0; i < excess; i++) {
      const next = keys.next();
      if (next.done) {
        break;
      }
      this.store.delete(next.value);
    }
  }
}

module.exports = {
  SimpleCache
};
