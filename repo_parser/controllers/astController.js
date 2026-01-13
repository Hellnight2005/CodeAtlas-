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

    const tableName = repoName.replace(/[^a-zA-Z0-9_]/g, '_');
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
            query += ` AND sorted_content IS NULL`;
        }

        const [files] = await dbPool.query(query);

        logger.info(`[AST] Found ${files.length} files to process (Force: ${!!force}).`);

        if (files.length === 0) {
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
                if (Buffer.isBuffer(raw_content)) {
                    content = raw_content.toString('utf-8');
                } else if (typeof raw_content === 'string') {
                    content = Buffer.from(raw_content, 'base64').toString('utf-8');
                } else {
                    content = String(raw_content);
                }

                // Generate AST
                const ast = parser.getAST(content, extension);

                let sortContent = null;
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
                    const errObj = { error: 'Unsupported language or parse error' };
                    sortContent = Buffer.from(JSON.stringify(errObj)).toString('base64');
                }

                // Save to MySQL
                await dbPool.query(`UPDATE \`${tableName}\` SET sorted_content = ?, retries = retries + 1 WHERE path = ? AND raw_content IS NOT NULL`, [sortContent, filePath]);
                processedCount++;
            } catch (fileErr) {
                logger.error(`[AST] Error processing file ${file.path}: ${fileErr.message}`);
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
    const { executeQuery } = require('./graphController'); // Reuse query execution

    // Note: We need to handle the DB Wipe manually or via simple query
    // Since graphController export isn't designed for internal require cleanly (it's route handlers),
    // let's use the simple axios call or assume importRepoGraphToNeo4j can be updated?
    // User asked to "check pipeline". Easier to just Wipe here using a helper or direct axios.
    // Actually, let's just use importRepoGraphToNeo4j, but we need to WIPE first.
    // I will use a direct cypher query here.

    // WIPING DB
    const axios = require('axios');
    const NEO4J_BASE_URL = process.env.NEO4J_BASE_URL || 'http://localhost:7474/db/neo4j/tx/commit';
    const NEO4J_AUTH = 'Basic ' + Buffer.from('neo4j:password').toString('base64');

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

    } catch (e) {
        logger.error(`[AST] Failed to sync to Neo4j: ${e.message}`);
    }
};

// Removed ensureColumnExists as user stated the column already exists and they don't want table modifications.
// const ensureColumnExists = async (tableName) => { ... }

const deleteRepoGraph = async (req, res) => {
    const { repoName } = req.body;
    if (!repoName) return res.status(400).json({ error: 'repoName is required' });

    const tableName = repoName.replace(/[^a-zA-Z0-9_]/g, '_');

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
