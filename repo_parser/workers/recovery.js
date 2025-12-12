const redisClient = require('../config/redisClient');
const dbPool = require('../config/mysqlRepo');
const { processFile } = require('../controllers/processingController');
const logEvent = require('../utils/logEvent');

const REDIS_QUEUE_KEY = 'repo:files:queue';

/**
 * Scan a repository table for pending files and push to Redis Queue
 */
const scanPending = async (repoName) => {
    try {
        const tableName = repoName.replace(/[^a-zA-Z0-9_]/g, '_');

        logEvent({ level: 'info', message: `[Recovery] Scanning table ${tableName} for pending files...`, request_id: 'system-recovery' });

        const [rows] = await dbPool.query(`SELECT path, sha, type, owner, userId, size FROM \`${tableName}\` WHERE status = 'pending'`);

        if (rows.length === 0) {
            logEvent({ level: 'info', message: `[Recovery] No pending files found in ${tableName}.`, request_id: 'system-recovery' });
            return;
        }

        logEvent({ level: 'info', message: `[Recovery] Found ${rows.length} pending files. Pushing to Redis...`, request_id: 'system-recovery' });

        let pushedCount = 0;
        for (const row of rows) {
            const message = {
                path: row.path,
                sha: row.sha,
                size: row.size, // Size needed? schema says INT/BigInt usually. Check if available.
                type: row.type,
                repo: repoName, // Original repo name needs to be passed, but here we only have tableName inferred? 
                // Wait, request said "load all the pending file from the sql db...". 
                // If I only have the table content, I might lose the original "repo" name casing if the sanitization was lossy.
                // However, the prompt implies "passed to github api".
                // row has owner!
                // row has userId!
                // row doesn't strictly have 'repo' name unless I parse tableName or pass it in.
                // Function signature is scanPending(repoName), so I have it.
                owner: row.owner,
                userId: row.userId
            };

            // Push to Redis List (Right Push)
            await redisClient.rPush(REDIS_QUEUE_KEY, JSON.stringify(message));
            pushedCount++;
        }

        logEvent({ level: 'info', message: `[Recovery] Pushed ${pushedCount} files to ${REDIS_QUEUE_KEY}.`, request_id: 'system-recovery' });

    } catch (error) {
        logEvent({ level: 'error', message: `[Recovery] Error scanning ${repoName}: ${error.message}`, request_id: 'system-recovery' });
    }
};

/**
 * Continuous Worker to consume from Redis Queue
 * Uses blocking pop (BRPOP) for efficiency
 */
const startQueueWorker = async () => {
    logEvent({ level: 'info', message: `[Worker] Starting Redis Queue Worker for ${REDIS_QUEUE_KEY}`, request_id: 'worker-startup' });

    while (true) {
        try {
            // brPop returns key and value. Timeout 0 blocks indefinitely.
            // Using a small timeout to allow loop to check for close signals if needed, or just block.
            // redis v4: commandOptions might be needed or client.commandOptions({ isolated: true }).brPop
            // Simplest for v4:
            const result = await redisClient.brPop(REDIS_QUEUE_KEY, 0);
            // result is { key: '...', element: '...' } in v4? Or [key, value]?
            // redis v4.6+ returns { key, element }. 

            if (result) {
                const messageData = JSON.parse(result.element);
                logEvent({ level: 'info', message: `[Worker] Dequeued file: ${messageData.path}`, request_id: 'worker-job' });

                // Process the file using existing controller
                await processFile(messageData);
            }

        } catch (error) {
            logEvent({ level: 'error', message: `[Worker] Error in queue loop: ${error.message}`, request_id: 'worker-error' });
            // Prevent tight loop crash
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};

module.exports = { scanPending, startQueueWorker };
