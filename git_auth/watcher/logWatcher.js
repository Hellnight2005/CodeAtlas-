const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

// CONFIG
const SERVICE_NAME = process.env.SERVICE_NAME || "GitHub_Service";
const LOG_DIR = path.join(__dirname, '..', 'public', 'log', SERVICE_NAME);
const POINTER_FILE = path.join(__dirname, 'pointers.json');
const THRESHOLD = parseInt(process.env.LOG_THRESHOLD) || 10; // Default 10 for testing
const BATCH_SIZE = 1000;
const CHECK_INTERVAL = 5000; // 5 seconds

const DB_CONFIG = {
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'Log'
};

const FILES = {
    'info.log': 'INFO',
    'warn.log': 'WARN',
    'error.log': 'ERROR'
};

let pointers = {};

// Load pointers
if (fs.existsSync(POINTER_FILE)) {
    try {
        pointers = JSON.parse(fs.readFileSync(POINTER_FILE, 'utf8'));
    } catch (e) { console.error("Error reading pointers:", e); }
}

async function startWatcher() {
    console.log(`[Watcher] Started for ${SERVICE_NAME}. Threshold: ${THRESHOLD} lines.`);

    // Create DB Connection/Table
    const connection = await mysql.createConnection(DB_CONFIG);
    await initDB(connection);

    setInterval(async () => {
        for (const [file, level] of Object.entries(FILES)) {
            await processFile(file, level, connection);
        }
    }, CHECK_INTERVAL);
}

async function initDB(connection) {
    const tableName = `${SERVICE_NAME}_logs`;
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
}

async function processFile(filename, level, connection) {
    const filePath = path.join(LOG_DIR, filename);
    if (!fs.existsSync(filePath)) return;

    // Get current file size
    const stats = fs.statSync(filePath);
    const currentSize = stats.size;
    const lastPointer = pointers[filename] || 0;

    // If file shrunk (truncated externally), reset pointer
    if (currentSize < lastPointer) {
        pointers[filename] = 0;
        savePointers();
        return;
    }

    // Determine new data
    if (currentSize > lastPointer) {
        const stream = fs.createReadStream(filePath, {
            start: lastPointer,
            end: currentSize
        });

        let data = '';
        stream.on('data', chunk => data += chunk);
        stream.on('end', async () => {
            if (!data.trim()) return;

            const lines = data.split('\n').filter(line => line.trim());

            // Check Threshold
            if (lines.length >= THRESHOLD) {
                console.log(`[${filename}] Reached threshold (${lines.length} >= ${THRESHOLD}). Processing...`);
                await processLines(lines, level, connection, filename);
            } else {
                // Update pointer only if we are tracking continuous position without truncate
                // But specifically for this request: "Only insert if threshold reached"
                // So we just update internal pointer to avoid re-reading same data next cycle
                // BUT requirements say: "Truncate if processed".
                // If we don't process (below threshold), we maintain the pointer to read NEW data next time + OLD data
                // To do this effectively: WE DON'T update pointer here. We read from lastPointer next time.
                // Wait... if we don't update pointer, next read will act from lastPointer again.
                // Yes, that creates a growing buffer. Correct.
            }
        });
    }
}

async function processLines(lines, level, connection, filename) {
    const tableName = `${SERVICE_NAME}_logs`;
    let batch = [];

    for (const line of lines) {
        try {
            const log = JSON.parse(line);

            // Handle separated columns or fallback
            const ip = log.ip || (log.metadata?.ip) || null;
            const logPath = log.path || (log.metadata?.path) || null;
            const userAgent = log.userAgent || (log.metadata?.userAgent) || null;

            batch.push([
                new Date(log.timestamp),
                log.service_name || SERVICE_NAME,
                level,
                log.message,
                log.request_id || null,
                ip, logPath, userAgent
            ]);

        } catch (e) { }
    }

    if (batch.length > 0) {
        try {
            // Insert
            const query = `INSERT INTO \`${tableName}\` (timestamp, service_name, level, message, request_id, ip, path, useragent) VALUES ?`;
            await connection.query(query, [batch]);
            console.log(`[${filename}] Inserted ${batch.length} rows.`);

            // Truncate File
            const filePath = path.join(LOG_DIR, filename);

            // "Safely manage... pointers"
            // If we truncate, pointer goes to 0.
            fs.truncateSync(filePath, 0);
            pointers[filename] = 0;
            savePointers();
            console.log(`[${filename}] File truncated.`);

        } catch (err) {
            console.error(`[${filename}] Insert/Truncate Error:`, err);
        }
    }
}

function savePointers() {
    fs.writeFileSync(POINTER_FILE, JSON.stringify(pointers, null, 2));
}

startWatcher();
