const dbPool = require('../config/mysqlRepo');
const parser = require('../utils/treeSitterParser');
const normalizer = require('../utils/astNormalizer');
const { exportRepoGraphData } = require('../utils/exportGraphData');
const { importRepoGraphToNeo4j } = require('../utils/importGraphData');
const path = require('path');

const generateASTForRepo = async (req, res) => {
    const { repoName, force } = req.body;

    if (!repoName) {
        return res.status(400).json({ error: 'repoName is required' });
    }

    const tableName = repoName.replace(/[^a-zA-Z0-9_]/g, '_');
    console.log(`[AST] Starting AST generation for ${repoName} (Table: ${tableName})`);

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

        console.log(`[AST] Found ${files.length} files to process (Force: ${!!force}).`);

        if (files.length === 0) {
            return res.json({ message: 'No new files to process.', status: 'up-to-date' });
        }

        processRepoFiles(tableName, files, repoName).catch(err => console.error(`[AST] Background processing failed: ${err.message}`));

        res.json({ message: `Started processing ${files.length} files for AST generation.`, status: 'processing' });

    } catch (error) {
        console.error(`[AST] Error fetching files: ${error.message}`);
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
                console.error(`[AST] Error processing file ${file.path}: ${fileErr.message}`);
            }
        }));
        console.log(`[AST] Processed batch ${Math.floor(i / BATCH_SIZE) + 1} (${Math.min(i + BATCH_SIZE, files.length)}/${files.length} files).`);
    }
    console.log(`[AST] Completed processing ${files.length} files for ${tableName}.`);

    // Incremental Neo4j Import
    if (deltaGraph.length > 0) {
        console.log(`[AST] Syncing ${deltaGraph.length} new nodes to Neo4j (Incremental)...`);
        await importCodebaseGraph(deltaGraph, 'neo4j', repoName);
    }

    // Trigger Full Export (Backup)
    await exportRepoGraphData(repoName);
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

        console.log(`[DELETE] Reset MySQL status for ${repoName} to 'pending'.`);

        res.json({ message: `Graph for ${repoName} deleted from Neo4j and MySQL status reset.` });
    } catch (error) {
        console.error(`[DELETE] Error: ${error.message}`);
        res.status(500).json({ error: 'Failed to delete graph or reset DB status' });
    }
};

module.exports = { generateASTForRepo, deleteRepoGraph };
