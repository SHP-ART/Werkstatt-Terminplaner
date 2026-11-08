describe('KI-Planungs-Jobbereinigung', () => {
  afterAll(async () => {
    const { dbWrapper } = require('../src/config/database');
    await dbWrapper.readyPromise;
    if (dbWrapper.connection) {
      await new Promise((resolve, reject) => {
        dbWrapper.connection.close(error => error ? reject(error) : resolve());
      });
      dbWrapper.connection = null;
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Der regelmäßige Aufräum-Timer hält den Prozess nicht allein offen', () => {
    const unref = jest.fn();
    jest.spyOn(global, 'setInterval').mockReturnValue({ unref });

    jest.isolateModules(() => {
      require('../src/controllers/kiPlanungController');
    });

    expect(unref).toHaveBeenCalledTimes(1);
  });
});
