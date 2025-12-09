const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mysql = require('mysql2/promise');
require('dotenv').config();

const SERVICE_NAME = process.env.SERVICE_NAME || "GitHub_Service";
const LOG_DIR = path.join(__dirname, '..', 'public', 'log', SERVICE_NAME);
const BATCH_SIZE = 500;

// Config
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'Log'
};

async function processLogFile(filename, level, connection, tableName) {
    const filePath = path.join(LOG_DIR, filename);

    if (!fs.existsSync(filePath)) return;

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let batch = [];
    let linesProcessed = 0;

    for await (const line of rl) {
        if (!line.trim()) continue;

        try {
            const log = JSON.parse(line);

            // Map to schema
            // If log has separated columns (new format) use them
            // If log is old format (nested metadata), extract

            const meta = log.metadata || {}; // Handle old format if mixed
            const ip = log.ip || meta.ip || null;
            const logPath = log.path || meta.path || null;
            const userAgent = log.userAgent || meta.userAgent || null;
            const request_id = log.request_id || null;

            batch.push([
                new Date(log.timestamp), // Ensure JS Date for MySQL DATETIME
                log.service_name || SERVICE_NAME,
                level.toUpperCase(),
                log.message,
                request_id,
                ip,
                logPath,
                userAgent
            ]);

            linesProcessed++;

            if (batch.length >= BATCH_SIZE) {
                await insertBatch(connection, tableName, batch);
                batch = [];
            }
        } catch (e) {
            console.error(`Error parsing line in ${filename}:`, e.message);
        }
    }

    if (batch.length > 0) {
        await insertBatch(connection, tableName, batch);
    }

    // Close stream before truncation
    rl.close();
    fileStream.destroy();

    // Clear file if processing happened (even if 0 lines, just to be safe or keep file empty)
    // Only truncate if we successfully passed the reading loop without crashing
    if (linesProcessed >= 0) {
        fs.truncateSync(filePath, 0);
        console.log(`Processed and cleared ${filename}: ${linesProcessed} lines`);
    }
}

async function insertBatch(connection, tableName, batch) {
    const query = `
        INSERT INTO \`${tableName}\` 
        (timestamp, service_name, level, message, request_id, ip, path, useragent)
        VALUES ?
    `;
    await connection.query(query, [batch]);
}

async function runBackup() {
    console.log(`[${new Date().toISOString()}] Starting Log Backup for ${SERVICE_NAME}...`);
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        const tableName = `${SERVICE_NAME}_logs`;

        // Create Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS \`${tableName}\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                timestamp DATETIME,
                service_name VARCHAR(100),
                level VARCHAR(20),
                message TEXT,
                request_id VARCHAR(50),
                ip VARCHAR(50),
                path VARCHAR(255),
                useragent VARCHAR(255)
            )
        `);

        await processLogFile('info.log', 'INFO', connection, tableName);
        await processLogFile('warn.log', 'WARN', connection, tableName);
        await processLogFile('error.log', 'ERROR', connection, tableName);

        console.log("Backup complete.");

    } catch (err) {
        console.error("Backup Job Failed:", err);
    } finally {
        if (connection) await connection.end();
    }
}

// Schedule: Every minute
cron.schedule('* * * * *', () => {
    runBackup();
});

console.log("Log Backup Cron Job Scheduled (Every Minute). To run immediately, press Ctrl+C and run 'node cron/logBackup.js --run-now'");

// Allow manual run
if (process.argv.includes('--run-now')) {
    runBackup().then(() => process.exit(0));
}
