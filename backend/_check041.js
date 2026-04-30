require('./src/config/database');
const { allAsync } = require('./src/utils/dbHelper');
setTimeout(async () => {
  try {
    const before = await allAsync("SELECT name FROM sqlite_master WHERE sql LIKE '%termine_old_040%'", []);
    console.log('CHECK_RESULT:', JSON.stringify(before));
    process.exit(0);
  } catch(e) { console.error(e); process.exit(1); }
}, 1000);
