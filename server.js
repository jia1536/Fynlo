'use strict';

const { initDatabase } = require('./src/db');
const { createApp } = require('./src/app');

const PORT = process.env.PORT || 3000;
const db = initDatabase();
const server = createApp(db).listen(PORT, () => console.log(`✅ Fynlo running at http://localhost:${PORT}`));

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
