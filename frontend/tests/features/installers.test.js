import { describe, expect, it } from 'vitest';
import { installBackupFeature } from '../../src/features/backup/backupFeature.js';
import { installCustomersFeature } from '../../src/features/customers/customersFeature.js';
import { installSearchFeature } from '../../src/features/search/searchFeature.js';
import { installSettingsKiFeature } from '../../src/features/settings/settingsKiFeature.js';
import { installTabletFeature } from '../../src/features/tablet/tabletFeature.js';
import { installTimeTrackingFeature } from '../../src/features/timeTracking/timeTrackingFeature.js';

describe('feature installers', () => {
  it('registers extracted backup, customer, search, settings, tablet, and time tracking methods', () => {
    class TestApp {}

    installBackupFeature(TestApp);
    installCustomersFeature(TestApp);
    installSearchFeature(TestApp);
    installSettingsKiFeature(TestApp);
    installTabletFeature(TestApp);
    installTimeTrackingFeature(TestApp);

    expect(TestApp.prototype.loadBackupStatus).toBeTypeOf('function');
    expect(TestApp.prototype.handleCreateBackup).toBeTypeOf('function');
    expect(TestApp.prototype.loadKunden).toBeTypeOf('function');
    expect(TestApp.prototype.openFahrzeugVerwaltung).toBeTypeOf('function');
    expect(TestApp.prototype.handleNameSuche).toBeTypeOf('function');
    expect(TestApp.prototype.setupGlobaleSuche).toBeTypeOf('function');
    expect(TestApp.prototype.loadWerkstattSettings).toBeTypeOf('function');
    expect(TestApp.prototype.checkKIStatus).toBeTypeOf('function');
    expect(TestApp.prototype.loadTabletEinstellungen).toBeTypeOf('function');
    expect(TestApp.prototype.loadZeitstempelung).toBeTypeOf('function');
    expect(TestApp.prototype.navigateZeitverwaltung).toBeTypeOf('function');
  });
});
