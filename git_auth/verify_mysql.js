const app = require('./app');
const db = require('./config/mysqlLogger');

const PORT = 3003;

const server = app.listen(PORT, async () => {
    console.log(`Test server running on ${PORT}`);
    try {
        // Clear table first for clean test
        await db.query("TRUNCATE TABLE log");

        // Make a request
        await fetch(`http://localhost:${PORT}/?test_mysql=1`);

        // Wait for async log
        setTimeout(async () => {
            await checkMysqlLogs();
            server.close();
            await db.end(); // close pool
        }, 1500);

    } catch (err) {
        console.error(err);
        server.close();
        await db.end();
    }
});

async function checkMysqlLogs() {
    console.log("Checking MySQL logs...");
    try {
        const [rows] = await db.query("SELECT * FROM log");
        console.log(`Found ${rows.length} log entries`);

        if (rows.length === 0) {
            console.error("FAIL: No logs found in MySQL");
            process.exit(1);
        }

        const log = rows[0];
        console.log("Log Row:", log);

        // Check separated columns
        if (log.path === "/?test_mysql=1" || log.path === "/") {
            console.log("SUCCESS: Path found in MySQL column");
        } else {
            console.error("FAIL: Incorrect path", log.path);
            process.exit(1);
        }

        if (!log.ip || !log.userAgent) {
            console.error("FAIL: Missing IP or UserAgent");
            process.exit(1);
        }

        console.log("SUCCESS: MySQL Logging Verified");

    } catch (err) {
        console.error("FAIL: MySQL Query Error", err);
        process.exit(1);
    }
}
