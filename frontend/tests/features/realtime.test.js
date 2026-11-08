import { describe, expect, it, vi } from 'vitest';
import { installRealtimeFeature } from '../../src/features/realtime/realtimeFeature.js';

function createBoardApp() {
  class TestApp {}
  installRealtimeFeature(TestApp);
  const app = new TestApp();
  app.currentTab = 'warteschlange';
  app.loadTermineCache = vi.fn();
  app.loadWarteschlange = vi.fn();
  return app;
}

describe('Zettel-Board-Realtime', () => {
  it.each([
    'termin.created',
    'termin.updated',
    'termin.deleted',
    'termin.restored',
    'termin.queue_updated'
  ])('lädt das sichtbare Board bei %s neu', eventName => {
    const app = createBoardApp();

    app.handleRealtimeTerminEvent(eventName, { id: 1, datum: '2026-11-07' });

    expect(app.loadTermineCache).toHaveBeenCalledOnce();
    expect(app.loadWarteschlange).toHaveBeenCalledOnce();
  });
});
