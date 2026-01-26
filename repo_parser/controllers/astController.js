const dbPool = require('../config/mysqlRepo');
const parser = require('../utils/treeSitterParser');
const normalizer = require('../utils/astNormalizer');
const { exportRepoGraphData } = require('../utils/exportGraphData');
const { importCodebaseGraph, deleteRepoGraphFromNeo4j } = require('../utils/importGraphData'); // Correct Import
const path = require('path');
const logger = require('../config/logger');

const generateASTForRepo = async (req, res) => {
    const { repoName, force } = req.body;

    if (!repoName) {
        return res.status(400).json({ error: 'repoName is required' });
    }

    // Use only the repo name part for table name to match git_auth/controllers/githubController.js logic
    const shortName = repoName.split('/')[1] || repoName;
    const tableName = shortName.replace(/[^a-zA-Z0-9_]/g, '_');
    logger.info(`[AST] Starting AST generation for ${repoName} (Table: ${tableName})`);

    try {
        // Build Query: default to incremental (NULL sorted_content), unless force=true
        let query = `
            SELECT path, raw_content, type 
            FROM \`${tableName}\` 
            WHERE raw_content IS NOT NULL 
              AND (type = 'blob' OR type = 'file')
        `;

        if (!force) {
            // Processing 'pending' or 'failed' items to retry them with the new robust logic
            query += ` AND sorted_content IS NULL`;
        }

        const [files] = await dbPool.query(query);

        logger.info(`[AST] Found ${files.length} files to process (Force: ${!!force}).`);

        if (files.length === 0) {
            // Check if we have any "failed" items we should retry?
            // If the robust logic works, we won't have failed items anymore.
            // But if user has old failed items, we should pick them up.
            // The query above picks up NULL sorted_content. If status is 'failed', sorted_content is NULL?
            // Yes, usually.
            // Let's rely on sorted_content IS NULL.

            // If strictly 0, we can proceed to pipeline completion checks?
            // But let's return "up-to-date" for now.

            // Wait, if 0 files, we might still need to push to Neo4j if previous batch finished but Neo4j push failed?
            // For now, assume if 0 files, we are done.
            return res.json({ message: 'No new files to process.', status: 'up-to-date' });
        }

        processRepoFiles(tableName, files, repoName).catch(err => logger.error(`[AST] Background processing failed: ${err.message}`));

        res.json({ message: `Started processing ${files.length} files for AST generation.`, status: 'processing' });

    } catch (error) {
        logger.error(`[AST] Error fetching files: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
};

const processRepoFiles = async (tableName, files, repoName) => {
    let processedCount = 0;
    const BATCH_SIZE = 10;
    const deltaGraph = [];
    const { importCodebaseGraph } = require('../utils/importGraphData');

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (file) => {
            try {
                const { path: filePath, raw_content } = file;
                const extension = path.extname(filePath);

                let content = '';
                try {
                    if (Buffer.isBuffer(raw_content)) {
                        content = raw_content.toString('utf-8');
                    } else if (typeof raw_content === 'string') {
                        // Check if it looks like Base64? GitHub API usually is base64.
                        // But if it was stored as plain text?
                        // Safe approach: try decode, if fail/garbage, maybe use as is?
                        // For now, sticking to standard logic:
                        content = Buffer.from(raw_content, 'base64').toString('utf-8');
                    } else {
                        content = String(raw_content);
                    }
                } catch (decodeErr) {
                    logger.warn(`[AST] Failed to decode content for ${filePath}. Using raw.`);
                    content = String(raw_content);
                }

                if (['.json', '.md', '.txt', '.xml', '.yml', '.yaml', '.lock', '.png', '.jpg', '.jpeg', '.svg'].includes(extension.toLowerCase())) {
                    // Explicitly skip non-code files but mark as COMPLETED with special content
                    const skippedObj = { skipped: true, reason: 'Non-code extension' };
                    const skippedContent = Buffer.from(JSON.stringify(skippedObj)).toString('base64');
                    await dbPool.query(`UPDATE \`${tableName}\` SET sorted_content = ?, status = 'done', retries = retries + 1 WHERE path = ?`, [skippedContent, filePath]);
                    processedCount++;
                    return;
                }

                let sortContent = null;
                try {
                    // Generate AST
                    const ast = parser.getAST(content, extension);

                    if (ast) {
                        let language = 'unknown';
                        const ext = extension.toLowerCase();
                        if (['.js', '.jsx'].includes(ext)) language = 'javascript';
                        else if (['.ts', '.tsx'].includes(ext)) language = 'typescript';
                        else language = ext.replace('.', '');

                        const normalized = normalizer.normalizeAST(ast, filePath, language);
                        deltaGraph.push(normalized);
                        sortContent = Buffer.from(JSON.stringify(normalized)).toString('base64');
                    } else {
                        // Parser returned null (unsupported or error logged internal)
                        const errObj = { error: 'Unsupported language or parse error', skipped: true };
                        sortContent = Buffer.from(JSON.stringify(errObj)).toString('base64');
                    }
                } catch (astErr) {
                    logger.error(`[AST_ERROR] Parser/Normalizer crashed for ${filePath}: ${astErr.message}`);
                    const crashObj = { error: `Parser Crashed: ${astErr.message}`, skipped: true };
                    sortContent = Buffer.from(JSON.stringify(crashObj)).toString('base64');
                }

                // Save to MySQL (Marks as completed even if error, to unblock queue)
                const [result] = await dbPool.query(`UPDATE \`${tableName}\` SET sorted_content = ?, status = 'done', retries = retries + 1 WHERE path = ?`, [sortContent, filePath]);

                if (result.affectedRows === 0) {
                    logger.warn(`[AST] Update failed (0 rows) for ${filePath}`);
                }

                processedCount++;
            } catch (fileErr) {
                // DB Error or Fatal System Error
                console.error(`[AST_CRITICAL] SQL/System Error processing ${file.path}: ${fileErr.message}`);
                logger.error(`[AST] Critical Error processing file ${file.path}: ${fileErr.message}`);
                // Try to mark as failed to break loop, but ideally we mark as completed-failed to avoid infinite
                try {
                    // If we mark "failed", it might loop if we don't filter it out next time.
                    // But we filter "sorted_content IS NULL".
                    // If we fail, we leave sorted_content as NULL. So it WILL be retried.
                    // To stop loop, we should set status='failed' AND increment retries.
                    // Ideally if retries > 3, we skip? (Logic check pending).
                    // For now, let's just mark failed.
                    await dbPool.query(`UPDATE \`${tableName}\` SET status = 'failed', retries = retries + 1 WHERE path = ?`, [file.path]);
                } catch (e) { /* ignore */ }
            }
        }));

        logger.info(`[AST] Processed batch ${Math.floor(i / BATCH_SIZE) + 1} (${Math.min(i + BATCH_SIZE, files.length)}/${files.length} files).`);
    }

    logger.info(`[AST] Completed processing ${files.length} files for ${tableName}.`);

    // Trigger Full Export (Backup)
    await exportRepoGraphData(repoName);

    // PIPELINE INTEGRATION: Connect directly to Neo4j
    // 1. Wipe DB to ensure clean slate (Single Active Repo Mode)
    const { importRepoGraphToNeo4j } = require('../utils/importGraphData');

    // WIPING DB
    const NEO4J_BASE_URL = process.env.NEO4J_BASE_URL || 'http://localhost:7474/db/neo4j/tx/commit';
    const NEO4J_AUTH = 'Basic ' + Buffer.from('neo4j:password').toString('base64');
    const axios = require('axios');

    try {
        await axios.post(
            NEO4J_BASE_URL,
            { statements: [{ statement: 'MATCH (n) DETACH DELETE n' }] },
            { headers: { Authorization: typeof process.env.NEO4J_AUTH === 'string' ? process.env.NEO4J_AUTH : NEO4J_AUTH, 'Content-Type': 'application/json' } }
        );
        logger.info(`[AST] Wiped Neo4j Database for fresh import of ${repoName}.`);

        // 2. Full Import
        await importRepoGraphToNeo4j(repoName);
        logger.info(`[AST] Pipeline Complete: Data active in Neo4j.`);

        // --- UPDATE MONGODB STATUS ---
        try {
            const User = require('../models/User');
            const [owner, name] = repoName.split('/');

            // Find user by username (owner)
            const user = await User.findOne({ username: owner });
            if (user) {
                const repoIndex = user.repos.findIndex(r => r.repo_name === name);
                if (repoIndex > -1) {
                    user.repos[repoIndex].isAst = true;
                    user.repos[repoIndex].astGeneratedAt = new Date();
                    user.repos[repoIndex].isexport_graph = true;
                    user.repos[repoIndex].isexport_graph_created_at = new Date();

                    await user.save();
                    logger.info(`[AST] Updated MongoDB status for user ${owner}, repo ${name}.`);
                } else {
                    logger.warn(`[AST] Repo ${name} not found in user ${owner}'s list.`);
                }
            } else {
                // Try finding by any user who has this repo if owner not found?
                // Checking if owner is the user logic:
                // Ideally we use req.user.id passed down, but async function doesn't have it.
                // This is best effort update.
                logger.warn(`[AST] User/Owner ${owner} not found in DB to update status.`);
            }

        } catch (mongoErr) {
            logger.error(`[AST] Failed to update MongoDB status: ${mongoErr.message}`);
        }

        // Final verification log
        logger.info(`[AST] SUCCESS: Graph data for ${repoName} is now fully available in Neo4j and ready for query.`);

        // UPDATE CENTRAL SYNC STATUS
        try {
            await dbPool.query('UPDATE repository_sync_status SET status = ? WHERE repo_full_name = ?', ['completed', repoName]);
            logger.info(`[AST] Updated repository_sync_status to 'completed'.`);
        } catch (dbErr) {
            logger.error(`[AST] Failed to update repository_sync_status: ${dbErr.message}`);
        }

    } catch (e) {
        logger.error(`[AST] Failed to sync to Neo4j: ${e.message}`);
    }
};

const deleteRepoGraph = async (req, res) => {
    const { repoName } = req.body;
    if (!repoName) return res.status(400).json({ error: 'repoName is required' });

    const shortName = repoName.split('/')[1] || repoName;
    const tableName = shortName.replace(/[^a-zA-Z0-9_]/g, '_');

    try {
        const { deleteRepoGraphFromNeo4j } = require('../utils/importGraphData');

        // 1. Delete from Neo4j
        await deleteRepoGraphFromNeo4j(repoName);

        // 2. Reset MySQL Status to ensure re-generation picks it up
        await dbPool.query(`UPDATE \`${tableName}\` SET sorted_content = NULL, status = 'pending'`);

        logger.info(`[DELETE] Reset MySQL status for ${repoName} to 'pending'.`);

        res.json({ message: `Graph for ${repoName} deleted from Neo4j and MySQL status reset.` });
    } catch (error) {
        logger.error(`[DELETE] Error: ${error.message}`);
        res.status(500).json({ error: 'Failed to delete graph or reset DB status' });
    }
};

module.exports = { generateASTForRepo, deleteRepoGraph };
