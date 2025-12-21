const dbPool = require('../config/mysqlRepo');

async function listTables() {
    try {
        const [rows] = await dbPool.query('SHOW TABLES');
        console.log('Tables:', rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listTables();
