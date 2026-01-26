const { fetchFileContent } = require('../utils/githubClient');
const { produceMessage } = require('../config/kafka');
const logEvent = require('../utils/logEvent');
const generateRequestId = require('../utils/idGenerator');
const dbPool = require('../config/mysqlRepo');

/**
 * Process individual file message from Kafka
 * Message Structure: { path, sha, size, type, repo, owner }
 */
const processFile = async (fileData) => {
    // Generate a tracing ID for this specific file processing job
    const jobId = generateRequestId();
    const commonMeta = {
        path: fileData.path,
        service: 'repo_parser',
        operation: 'processFile'
    };

    try {
        const { owner, repo, path, sha, size, type, userId } = fileData;

        if (!owner) {
            logEvent({
                level: 'warn',
                message: `[Skipping] Missing owner for ${repo}/${path}`,
                request_id: jobId,
                metadata: commonMeta
            });
            return;
        }

        logEvent({
            level: 'info',
            message: `[Processing] Fetching content: ${owner}/${repo}/${path}`,
            request_id: jobId,
            metadata: commonMeta
        });

        // 1. Fetch Raw Content (passing userId for token lookup)
        const rawContent = await fetchFileContent(owner, repo, path, userId);

        if (rawContent) {
            logEvent({
                level: 'info',
                message: `[Content] fetched for ${path} (Length: ${rawContent.length})`,
                request_id: jobId,
                metadata: { ...commonMeta, content_length: rawContent.length }
            });

            // 2. Store in MySQL
            try {
                // Sanitize table name (same logic as git_auth)
                const tableName = repo.replace(/[^a-zA-Z0-9_]/g, '_');

                console.log(`[MySQL] Updating table '${tableName}' for path: ${path}`);

                await dbPool.query(
                    `UPDATE \`${tableName}\` SET raw_content = ?, status = 'processing', retries = retries + 1 WHERE path = ?`,
                    [rawContent, path]
                );

                console.log(`[MySQL] Successfully updated raw_content for ${path}`);

                logEvent({
                    level: 'info',
                    message: `[MySQL] Updated raw_content for ${path}`,
                    request_id: jobId,
                    metadata: commonMeta
                });
            } catch (dbErr) {
                console.error(`[MySQL] Error updating content: ${dbErr.message}`);
                logEvent({
                    level: 'error',
                    message: `[MySQL] Error updating content: ${dbErr.message}`,
                    request_id: jobId,
                    metadata: commonMeta
                });
                // We continue to Kafka even if DB fails? Or stop? 
                // User said "first stored that content into mysql... and passed the encoder and path forwared"
                // Assuming we proceed, but logging error is critical.
            }

            // 3. Push to New Kafka Topic
            const enrichedMessage = {
                ...fileData,
                content: rawContent,
                encoding: 'base64' // Changed to base64 per user request
            };

            await produceMessage('repo-files-with-content', enrichedMessage);

            logEvent({
                level: 'info',
                message: `[Success] Pushed to 'repo-files-with-content' for ${path}`,
                request_id: jobId,
                metadata: commonMeta
            });
        } else {
            logEvent({
                level: 'warn',
                message: `[Warning] No content found for ${path}`,
                request_id: jobId,
                metadata: commonMeta
            });
        }

    } catch (error) {
        console.error(`[Processing] Error for ${fileData.path}: ${error.message}`);

        // Handle GitHub Rate Limit (403 or 429)
        if (error.message.includes('403') || error.message.includes('429')) {
            try {
                const tableName = fileData.repo.replace(/[^a-zA-Z0-9_]/g, '_');
                // Update sync status to notify frontend
                await dbPool.query(
                    `UPDATE repository_sync_status SET status = 'rate_limited' WHERE repo_full_name LIKE ?`,
                    [`%${fileData.repo}`]
                );
                console.warn(`[Limit] Marked ${fileData.repo} as rate_limited due to 403/429.`);
            } catch (updateErr) {
                console.error(`[Limit] Failed to update status: ${updateErr.message}`);
            }
        }

        logEvent({
            level: 'error',
            message: `Error processing file: ${error.message}`,
            request_id: jobId,
            metadata: {
                ...commonMeta,
                fileData: fileData // Include full data for recovery
            }
        });
    }
};

module.exports = { processFile };
