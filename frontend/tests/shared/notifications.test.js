import { describe, expect, it, vi } from 'vitest';
import { showToast } from '../../src/shared/notifications.js';

describe('notifications', () => {
  it('creates a toast container and toast element', () => {
    vi.useFakeTimers();
    showToast('Gespeichert', 'success');
    expect(document.querySelector('.toast-container')).toBeTruthy();
    expect(document.querySelector('.toast').textContent).toContain('Gespeichert');
    vi.useRealTimers();
  });
});
