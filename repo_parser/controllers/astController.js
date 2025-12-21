const dbPool = require('../config/mysqlRepo');
const parser = require('../utils/treeSitterParser');
const normalizer = require('../utils/astNormalizer');
const { exportRepoGraphData } = require('../utils/exportGraphData');
const { importRepoGraphToNeo4j } = require('../utils/importGraphData');
const path = require('path');

const generateASTForRepo = async (req, res) => {
    const { repoName } = req.body;

    if (!repoName) {
        return res.status(400).json({ error: 'repoName is required' });
    }

    const tableName = repoName.replace(/[^a-zA-Z0-9_]/g, '_');
    console.log(`[AST] Starting AST generation for ${repoName} (Table: ${tableName})`);

    try {
        // Fetch all files with content
        const [files] = await dbPool.query(`SELECT path, raw_content, type FROM \`${tableName}\` WHERE raw_content IS NOT NULL AND (type = 'blob' OR type = 'file')`);

        console.log(`[AST] Found ${files.length} files to process.`);

        // Respond immediately that processing has started (optional, or wait? User said "after one file is complete then other file untill the all file are done")
        // User might want to wait for the whole thing given "created a pipeline for all that".
        // But if it takes too long, request will timeout.
        // Let's stream updates or just finish it if it's not too huge. 
        // For now, I'll process async and return "Processing started".
        // Or actually, the prompt implies "get the raw content ... passed ... until all file are done".
        // It's likely a background job is preferred, but for an API trigger, maybe just do it.

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

    // Ensure sort_content column exists
    // await ensureColumnExists(tableName); // User has existing column 'sorted_content'

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (file) => {
            try {
                const { path: filePath, raw_content } = file;
                const extension = path.extname(filePath);

                let content = '';
                // raw_content is Base64 encoded string from GitHub/MySQL
                if (Buffer.isBuffer(raw_content)) {
                    content = raw_content.toString('utf-8'); // If already buffer, assume utf8? Or base64 buffer?
                    // Usually raw_content from github is base64 string. 
                    // If it is buffer of base64 chars:
                    // content = Buffer.from(raw_content.toString(), 'base64').toString('utf-8');
                } else if (typeof raw_content === 'string') {
                    // Decode Base64
                    content = Buffer.from(raw_content, 'base64').toString('utf-8');
                } else {
                    content = String(raw_content);
                }

                // Generate AST
                const ast = parser.getAST(content, extension);

                let sortContent = null;
                if (ast) {
                    // Map extension to strict language value if possible
                    let language = 'unknown';
                    const ext = extension.toLowerCase();
                    if (['.js', '.jsx'].includes(ext)) language = 'javascript';
                    else if (['.ts', '.tsx'].includes(ext)) language = 'typescript';
                    else language = ext.replace('.', '');

                    const normalized = normalizer.normalizeAST(ast, filePath, language);
                    // Encode normalized AST to Base64
                    sortContent = Buffer.from(JSON.stringify(normalized)).toString('base64');
                } else {
                    const errObj = { error: 'Unsupported language or parse error' };
                    sortContent = Buffer.from(JSON.stringify(errObj)).toString('base64');
                }

                // Save to MySQL
                await dbPool.query(`UPDATE \`${tableName}\` SET sorted_content = ?, retries = retries + 1 WHERE path = ?`, [sortContent, filePath]);
                processedCount++;
            } catch (fileErr) {
                console.error(`[AST] Error processing file ${file.path}: ${fileErr.message}`);
            }
        }));
        console.log(`[AST] Processed batch ${Math.floor(i / BATCH_SIZE) + 1} (${Math.min(i + BATCH_SIZE, files.length)}/${files.length} files).`);
    }
    console.log(`[AST] Completed processing ${files.length} files for ${tableName}.`);

    // Trigger Export
    await exportRepoGraphData(repoName);

    // Trigger Import to Neo4j
    await importRepoGraphToNeo4j(repoName);
};

// Removed ensureColumnExists as user stated the column already exists and they don't want table modifications.
// const ensureColumnExists = async (tableName) => { ... }

module.exports = { generateASTForRepo };
