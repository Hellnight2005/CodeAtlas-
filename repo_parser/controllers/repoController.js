const dbPool = require('../config/mysqlRepo');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');

/**
 * Helper to build nested tree from paths
 * Input: [{ path: "A/B/C.js", type: "file" }]
 * Output: { "A": { "B": { "C.js": { type: "file" } } } }
 */
const buildTree = (files) => {
    const tree = {};

    files.forEach(file => {
        const parts = file.path.split('/');
        let currentLevel = tree;

        parts.forEach((part, index) => {
            const isLast = index === parts.length - 1;

            if (isLast) {
                // Leaf node (file or empty folder marker)
                currentLevel[part] = {
                    type: file.type,
                    size: file.size, // in case we add size later
                    path: file.path
                };
            } else {
                // Directory
                if (!currentLevel[part]) {
                    currentLevel[part] = {};
                }
                currentLevel = currentLevel[part];
            }
        });
    });

    return tree;
};

exports.getRepoFileTree = async (req, res) => {
    try {
        const { repo } = req.query;
        if (!repo) {
            return res.status(400).json({ error: 'Repo name required' });
        }

        // Sanitize table name: replace non-alphanumeric chars with underscore
        // Same logic as in processingController.js
        const tableName = repo.replace(/[^a-zA-Z0-9_]/g, '_');
        logger.info(`[RepoController] Fetching file tree for repo: '${repo}' from table: '${tableName}'`);

        const query = (tbl) => `SELECT path, type FROM \`${tbl}\``;

        // Strategy: Try full name table first (Owner_Repo), then short name table (Repo)
        let rows = [];
        try {
            [rows] = await dbPool.query(query(tableName));
        } catch (err) {
            // If table missing AND input has owner prefix, try match simple repo name
            if (err.code === 'ER_NO_SUCH_TABLE' && repo.includes('/')) {
                const shortName = repo.split('/')[1];
                const shortTableName = shortName.replace(/[^a-zA-Z0-9_]/g, '_');
                logger.info(`[RepoController] Table '${tableName}' not found. Retrying with short name: '${shortTableName}'`);

                try {
                    [rows] = await dbPool.query(query(shortTableName));
                } catch (retryErr) {
                    // If simple name also fails, return 404
                    if (retryErr.code === 'ER_NO_SUCH_TABLE') {
                        return res.status(404).json({ error: 'Repository not found (Table does not exist)' });
                    }
                    throw retryErr;
                }
            } else if (err.code === 'ER_NO_SUCH_TABLE') {
                return res.status(404).json({ error: 'Repository not found (Table does not exist)' });
            } else {
                throw err;
            }
        }

        logger.info(`[RepoController] Found ${rows.length} files for '${repo}'`);

        if (rows.length === 0) {
            return res.json({});
        }

        const tree = buildTree(rows);
        logger.info(`[RepoController] Tree built successfully for '${repo}', sending response.`);
        res.json(tree);

    } catch (error) {
        logger.error(`[RepoController] Error fetching tree for ${req.query.repo}: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
};

/**
 * Get AI Summary for a file
 * Checks DB for cached summary, otherwise calls Gemini and saves it.
 */
const { generateCodeSummary } = require('../utils/geminiService');

exports.getAiFileSummary = async (req, res) => {
    try {
        // We need 'repo' (for table name) and 'path' (to identify file)
        const { repo, path, owner, metadataOnly } = req.query;

        if (!repo || !path) {
            return res.status(400).json({ error: 'Repo and Path are required' });
        }

        const tableName = repo.replace(/[^a-zA-Z0-9_]/g, '_');
        let resolvedOwner = owner;

        // RESOLVE OWNER: If missing or undefined, try to find in repository_sync_status
        if (!resolvedOwner || resolvedOwner === 'undefined' || resolvedOwner === 'local') {
            try {
                // Search for repo mapping in sync status
                // Matches either full name ends with /repo or just matching the repo part if unique?
                // Safest is LIKE %/repoName
                const [syncRows] = await dbPool.query(
                    `SELECT owner FROM repository_sync_status WHERE repo_full_name LIKE ? LIMIT 1`,
                    [`%/${repo}`]
                );
                if (syncRows.length > 0) {
                    resolvedOwner = syncRows[0].owner;
                }
            } catch (err) {
                logger.warn(`[RepoController] Failed to resolve owner from sync status: ${err.message}`);
            }
        }

        // 3. Construct GitHub Link
        const githubLink = resolvedOwner && resolvedOwner !== 'undefined'
            ? `https://github.com/${resolvedOwner}/${repo}/blob/main/${path}`
            : `https://github.com/${repo}/blob/main/${path}`; // Fallback

        // METADATA ONLY MODE (Fast return for links)
        if (metadataOnly === 'true') {
            return res.json({
                github_url: githubLink,
                owner: resolvedOwner
            });
        }

        // 1. Ensure 'ai_summary' column exists
        try {
            await dbPool.query(`SELECT ai_summary FROM \`${tableName}\` LIMIT 1`);
        } catch (err) {
            if (err.code === 'ER_BAD_FIELD_ERROR') {
                logger.info(`[RepoController] Adding missing column 'ai_summary' to table '${tableName}'`);
                await dbPool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ai_summary JSON`);
            } else if (err.code === 'ER_NO_SUCH_TABLE') {
                return res.status(404).json({ error: 'Repository not found' });
            } else {
                throw err;
            }
        }

        // 2. Fetch current data
        const [rows] = await dbPool.query(
            `SELECT raw_content, ai_summary FROM \`${tableName}\` WHERE path = ?`,
            [path]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }

        const fileRow = rows[0];

        // 4. Return Cached Summary if exists
        if (fileRow.ai_summary) {
            return res.json({
                ...fileRow.ai_summary,
                github_url: githubLink,
                source: 'cache'
            });
        }

        // CHECK: If generate=false, do not generate, return 404 or empty
        if (req.query.generate === 'false') {
            return res.status(404).json({ error: 'No summary found', exists: false });
        }

        // 5. Generate New Summary
        if (!fileRow.raw_content) {
            return res.status(400).json({ error: 'No content available for this file to summarize' });
        }

        // Decode contents (Base64 -> String)
        const fileContent = Buffer.from(fileRow.raw_content, 'base64').toString('utf-8');
        const fileName = path.split('/').pop();

        logger.info(`[RepoController] Generating AI summary for ${path}...`);
        const summaryParams = await generateCodeSummary(fileContent, fileName);

        // 6. Save to DB
        await dbPool.query(
            `UPDATE \`${tableName}\` SET ai_summary = ? WHERE path = ?`,
            [JSON.stringify(summaryParams), path]
        );

        return res.json({
            ...summaryParams,
            github_url: githubLink,
            source: 'generated'
        });

    } catch (error) {
        logger.error(`[RepoController] Error generating summary: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
};

/**
 * Full Repository Deletion (Cleanup)
 * 1. Delete public JSON file
 * 2. Drop MySQL Table
 * 3. Delete from repository_sync_status
 * 4. Remove from MongoDB User.repos
 */
exports.deleteFullRepository = async (req, res) => {
    const { repoName } = req.body; // Expect "owner/repo" or just "repo"
    if (!repoName) {
        return res.status(400).json({ error: 'repoName is required' });
    }

    logger.info(`[Cleanup] Starting full deletion for: ${repoName}`);
    const results = {};

    let resolvedFullName = repoName;
    const shortName = repoName.split('/').pop();

    // 0. Resolve Full Name from DB if possible
    try {
        // Try to find the canonical full name in sync status
        const [rows] = await dbPool.query(
            `SELECT repo_full_name FROM repository_sync_status WHERE repo_full_name = ? OR repo_full_name LIKE ? LIMIT 1`,
            [repoName, `%/${shortName}`]
        );
        if (rows.length > 0) {
            resolvedFullName = rows[0].repo_full_name;
            logger.info(`[Cleanup] Resolved full name: ${resolvedFullName}`);
        }
    } catch (err) {
        logger.warn(`[Cleanup] Failed to resolve full name: ${err.message}`);
    }

    // 1. Delete Public JSON
    try {
        const jsonPath = path.join(__dirname, '../public', `${shortName}.json`);

        if (fs.existsSync(jsonPath)) {
            fs.unlinkSync(jsonPath);
            results.json = 'Deleted';
            logger.info(`[Cleanup] Deleted JSON: ${jsonPath}`);
        } else {
            // Try explicit full name format if needed (Owner_Repo.json)
            const underscoreName = resolvedFullName.replace('/', '_');
            const fullPath = path.join(__dirname, '../public', `${underscoreName}.json`);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
                results.json = 'Deleted (Full Name)';
            } else {
                results.json = 'Not Found';
            }
        }
    } catch (err) {
        logger.error(`[Cleanup] JSON Delete Error: ${err.message}`);
        results.json = `Error: ${err.message}`;
    }

    // 2. Drop MySQL Table
    try {
        // Always use short name for table as per established pattern
        const tableName = shortName.replace(/[^a-zA-Z0-9_]/g, '_');

        await dbPool.query(`DROP TABLE IF EXISTS \`${tableName}\``);
        results.mysqlTable = 'Dropped (if existed)';
        logger.info(`[Cleanup] Dropped MySQL Table: ${tableName}`);
    } catch (err) {
        logger.error(`[Cleanup] MySQL Table Drop Error: ${err.message}`);
        results.mysqlTable = `Error: ${err.message}`;
    }

    // 3. Delete from repository_sync_status
    try {
        // Use resolved full name for deletion
        await dbPool.query(`DELETE FROM repository_sync_status WHERE repo_full_name = ?`, [resolvedFullName]);
        // Double check deleting by short name if it was inserted merely as short name?
        if (resolvedFullName !== repoName) {
            await dbPool.query(`DELETE FROM repository_sync_status WHERE repo_full_name = ?`, [repoName]);
        }

        results.syncStatus = 'Deleted';
        logger.info(`[Cleanup] Removed from repository_sync_status for: ${resolvedFullName}`);
    } catch (err) {
        logger.error(`[Cleanup] Sync Status Delete Error: ${err.message}`);
        results.syncStatus = `Error: ${err.message}`;
    }

    // 4. Remove from MongoDB
    try {
        // Try deleting by both explicit provided name and resolved full name
        const namesToDelete = [repoName, resolvedFullName];
        if (repoName.includes('/')) {
            namesToDelete.push(repoName.split('/').pop());
        }

        const updateResult = await User.updateMany(
            { "repos.repo_name": { $in: namesToDelete } },
            { $pull: { repos: { repo_name: { $in: namesToDelete } } } }
        );

        results.mongodb = `Removed from ${updateResult.modifiedCount} users`;
        logger.info(`[Cleanup] Removed from MongoDB users: ${updateResult.modifiedCount} (Criteria: ${namesToDelete.join(', ')})`);

    } catch (err) {
        logger.error(`[Cleanup] MongoDB Error: ${err.message}`);
        results.mongodb = `Error: ${err.message}`;
    }

    res.json({
        message: 'Cleanup sequence completed',
        details: results,
        resolvedName: resolvedFullName
    });
};
