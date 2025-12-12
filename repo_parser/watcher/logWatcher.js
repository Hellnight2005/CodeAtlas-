const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const redis = require('redis');
require('dotenv').config();

// CONFIG
const SERVICE_NAME = "Repo_Parser"; // Matches config/logger.js
const LOG_DIR = path.join(__dirname, '..', 'public', 'log', SERVICE_NAME);
const POINTER_FILE = path.join(__dirname, 'pointers.json');
const THRESHOLD = parseInt(process.env.LOG_THRESHOLD) || 10;
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

// Redis Setup
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});
redisClient.on('error', (err) => console.error('Redis Client Error', err));


// Load pointers
if (fs.existsSync(POINTER_FILE)) {
    try {
        pointers = JSON.parse(fs.readFileSync(POINTER_FILE, 'utf8'));
    } catch (e) {
        console.error("Error reading pointers:", e);
        pointers = {};
    }
}

async function startWatcher() {
    console.log(`[Watcher] Started for ${SERVICE_NAME}. Threshold: ${THRESHOLD} lines.`);

    // Connect Redis
    try {
        await redisClient.connect();
        console.log('[Watcher] Redis Connected.');
    } catch (err) {
        console.error('[Watcher] Redis Connection Failed:', err);
    }

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

            // AUTO-RETRY LOGIC
            // If error and message indicates processing failure, push back to queue
            if (level === 'ERROR' && log.message && log.message.includes('Error processing file')) {
                if (log.metadata && log.metadata.fileData) {
                    const fileData = log.metadata.fileData;
                    console.log(`[Watcher] Detected failure for ${fileData.path}. Pushing to retry queue...`);

                    // Push to Redis Queue
                    try {
                        await redisClient.rPush('repo:files:queue', JSON.stringify(fileData));
                        console.log(`[Watcher] Pushed ${fileData.path} to repo:files:queue`);
                    } catch (redisErr) {
                        console.error(`[Watcher] Failed to push to Redis: ${redisErr.message}`);
                    }
                }
            }

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

            // Reset File and Pointer
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

startWatcher().catch(err => console.error("Watcher Start Error:", err));
