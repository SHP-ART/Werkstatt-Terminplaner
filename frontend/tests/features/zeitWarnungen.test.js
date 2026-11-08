import { describe, expect, it } from 'vitest';
import { installPlanungFeature } from '../../src/features/planung/planungFeature.js';

function createPlanungApp() {
  class TestApp {}
  installPlanungFeature(TestApp);
  return new TestApp();
}

describe('Planung-Zeitwarnungen', () => {
  it('zeigt zentrale Warnungen als escaped Karten- und Bannertext', () => {
    const app = createPlanungApp();
    const warnungen = [{
      code: 'abholzeit_verpasst',
      message: 'Abholzeit 16:00 nicht erreichbar – fertig ca. 16:30 <Fahrzeug>'
    }];

    expect(app.renderTerminWarnungen({ warnungen })).toContain('Abholzeit 16:00 nicht erreichbar');
    expect(app.renderTerminWarnungen({ warnungen })).toContain('&lt;Fahrzeug&gt;');
    expect(app.renderPlanungWarnungsBanner([{ warnungen }])).toContain('Abholzeit 16:00 nicht erreichbar');
  });

  it('zeigt bei fehlenden Warnungen kein Banner', () => {
    const app = createPlanungApp();
    expect(app.renderTerminWarnungen({ warnungen: [] })).toBe('');
    expect(app.renderPlanungWarnungsBanner([{ warnungen: [] }])).toBe('');
  });
});
