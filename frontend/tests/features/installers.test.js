import { describe, expect, it } from 'vitest';
import { installBackupFeature } from '../../src/features/backup/backupFeature.js';
import { installCustomersFeature } from '../../src/features/customers/customersFeature.js';
import { installAbsenceFeature } from '../../src/features/absence/absenceFeature.js';
import { installDashboardFeature } from '../../src/features/dashboard/dashboardFeature.js';
import { installReplacementCarsFeature } from '../../src/features/replacementCars/replacementCarsFeature.js';
import { installSearchFeature } from '../../src/features/search/searchFeature.js';
import { installSettingsKiFeature } from '../../src/features/settings/settingsKiFeature.js';
import { installTabletFeature } from '../../src/features/tablet/tabletFeature.js';
import { installTimeTrackingFeature } from '../../src/features/timeTracking/timeTrackingFeature.js';
import { installTodayFeature } from '../../src/features/today/todayFeature.js';

describe('feature installers', () => {
  it('registers extracted feature methods', () => {
    class TestApp {}

    installAbsenceFeature(TestApp);
    installBackupFeature(TestApp);
    installCustomersFeature(TestApp);
    installDashboardFeature(TestApp);
    installReplacementCarsFeature(TestApp);
    installSearchFeature(TestApp);
    installSettingsKiFeature(TestApp);
    installTabletFeature(TestApp);
    installTimeTrackingFeature(TestApp);
    installTodayFeature(TestApp);

    expect(TestApp.prototype.loadAbwesenheit).toBeTypeOf('function');
    expect(TestApp.prototype.handleAbwesenheitSubmit).toBeTypeOf('function');
    expect(TestApp.prototype.loadBackupStatus).toBeTypeOf('function');
    expect(TestApp.prototype.handleCreateBackup).toBeTypeOf('function');
    expect(TestApp.prototype.loadKunden).toBeTypeOf('function');
    expect(TestApp.prototype.openFahrzeugVerwaltung).toBeTypeOf('function');
    expect(TestApp.prototype.loadDashboard).toBeTypeOf('function');
    expect(TestApp.prototype.loadDashboardKPIs).toBeTypeOf('function');
    expect(TestApp.prototype.loadErsatzautos).toBeTypeOf('function');
    expect(TestApp.prototype.renderErsatzautoListe).toBeTypeOf('function');
    expect(TestApp.prototype.handleNameSuche).toBeTypeOf('function');
    expect(TestApp.prototype.setupGlobaleSuche).toBeTypeOf('function');
    expect(TestApp.prototype.loadWerkstattSettings).toBeTypeOf('function');
    expect(TestApp.prototype.checkKIStatus).toBeTypeOf('function');
    expect(TestApp.prototype.loadTabletEinstellungen).toBeTypeOf('function');
    expect(TestApp.prototype.loadZeitstempelung).toBeTypeOf('function');
    expect(TestApp.prototype.navigateZeitverwaltung).toBeTypeOf('function');
    expect(TestApp.prototype.loadHeuteTermine).toBeTypeOf('function');
    expect(TestApp.prototype.renderHeuteTabelle).toBeTypeOf('function');
  });
});
