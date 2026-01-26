const redisClient = require('../config/redisClient');
const dbPool = require('../config/mysqlRepo');
const { processFile } = require('../controllers/processingController');
const logEvent = require('../utils/logEvent');

const REDIS_QUEUE_KEY = 'repo:files:queue';

/**
 * Scan a repository table for pending or stuck files and push to Redis Queue
 */
const recoverRepo = async (repoFullName) => {
    try {
        // repoFullName is like "Owner/Repo"
        const repoName = repoFullName.split('/')[1] || repoFullName;
        const tableName = repoName.replace(/[^a-zA-Z0-9_]/g, '_');

        console.log(`[Recovery] Scanning table ${tableName} (from ${repoFullName}) for stuck files...`);
        // Recover both 'pending' files AND files stuck in 'processing' (e.g. > 5 mins old)
        // Adjust timeout as needed. 5 minutes is safe for a file process.
        const [rows] = await dbPool.query(`
            SELECT path, sha, type, owner, userId 
            FROM \`${tableName}\` 
            WHERE status = 'pending' 
               OR (status = 'processing' AND updated_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE))
        `);

        if (rows.length === 0) {
            console.log(`[Recovery] No stuck files found in ${tableName}.`);
            logEvent({ level: 'info', message: `[Recovery] No stuck files found in ${tableName}.`, request_id: 'system-recovery' });
            return;
        }

        console.log(`[Recovery] Found ${rows.length} stuck/pending files in ${tableName}. Pushing to Redis...`);
        logEvent({ level: 'info', message: `[Recovery] Found ${rows.length} stuck/pending files in ${tableName}. Pushing to Redis...`, request_id: 'system-recovery' });

        let pushedCount = 0;
        for (const row of rows) {
            const message = {
                path: row.path,
                sha: row.sha,
                size: row.size,
                type: row.type,
                repo: repoName,
                owner: row.owner,
                userId: row.userId
            };

            // Push to Redis List (Right Push)
            await redisClient.rPush(REDIS_QUEUE_KEY, JSON.stringify(message));

            // Optionally update status to 'queued' or leave as is?
            // processFile will set it to 'processing' again.
            // Leaving it effectively "processing" in DB until potentially picked up is okay, 
            // but updating updated_at might be good to prevent immediate re-pickup if script runs again?
            // But processFile starts fast.
            pushedCount++;
        }

        logEvent({ level: 'info', message: `[Recovery] Pushed ${pushedCount} files from ${repoName} to queue.`, request_id: 'system-recovery' });

    } catch (error) {
        // Table might not exist or other error
        console.error(`[Recovery] Error scanning ${repoFullName}: ${error.message}`);
        logEvent({ level: 'error', message: `[Recovery] Error scanning ${repoFullName}: ${error.message}`, request_id: 'system-recovery' });
    }
};

/**
 * Scan ALL repositories that are marked as 'processing' in the main status table
 */
const recoverAllStuckRepos = async () => {
    try {
        logEvent({ level: 'info', message: `[Recovery] Checking for stuck repositories...`, request_id: 'system-recovery' });

        const [repos] = await dbPool.query(`
            SELECT repo_full_name, status 
            FROM repository_sync_status 
            WHERE status = 'processing'
        `);

        if (repos.length === 0) {
            logEvent({ level: 'info', message: `[Recovery] No repositories in 'processing' state.`, request_id: 'system-recovery' });
            return;
        }

        logEvent({ level: 'info', message: `[Recovery] Found ${repos.length} repos in 'processing' state. Initiating file recovery...`, request_id: 'system-recovery' });

        for (const repo of repos) {
            await recoverRepo(repo.repo_full_name);
        }

    } catch (error) {
        logEvent({ level: 'error', message: `[Recovery] Failed to scan repository status: ${error.message}`, request_id: 'system-recovery' });
    }
};

/**
 * Continuous Worker to consume from Redis Queue
 */
const startQueueWorker = async () => {
    // 1. Run Recovery on Startup
    await recoverAllStuckRepos();

    logEvent({ level: 'info', message: `[Worker] Starting Redis Queue Worker for ${REDIS_QUEUE_KEY}`, request_id: 'worker-startup' });

    while (true) {
        try {
            const result = await redisClient.brPop(REDIS_QUEUE_KEY, 0);

            if (result) {
                // Compatible with standard node-redis v4 return { key, element }
                const messageStr = typeof result === 'object' && result.element ? result.element : result[1];
                if (!messageStr) continue;

                const messageData = JSON.parse(messageStr);
                logEvent({ level: 'info', message: `[Worker] Dequeued file: ${messageData.path}`, request_id: 'worker-job' });

                await processFile(messageData);
            }

        } catch (error) {
            logEvent({ level: 'error', message: `[Worker] Error in queue loop: ${error.message}`, request_id: 'worker-error' });
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};

module.exports = { startQueueWorker, recoverRepo, recoverAllStuckRepos };
