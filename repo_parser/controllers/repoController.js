const dbPool = require('../config/mysqlRepo');
const logger = require('../config/logger');

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

        const query = `SELECT path, type FROM \`${tableName}\``;

        try {
            const [rows] = await dbPool.query(query);
            logger.info(`[RepoController] Found ${rows.length} files for '${repo}'`);

            if (rows.length === 0) {
                // Check if table exists or just empty
                // For now, return empty object
                return res.json({});
            }

            const tree = buildTree(rows);
            logger.info(`[RepoController] Tree built successfully for '${repo}', sending response.`);
            res.json(tree);

        } catch (dbError) {
            if (dbError.code === 'ER_NO_SUCH_TABLE') {
                return res.status(404).json({ error: 'Repository not found (Table does not exist)' });
            }
            throw dbError;
        }

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
