
const dbPool = require('../config/mysqlRepo');
const fs = require('fs');
const path = require('path');

const exportRepoGraphData = async (repoName) => {
    if (!repoName) {
        console.error('[EXPORT] Repo name is required');
        return;
    }

    // Use only the repo name part for table name
    const shortName = repoName.split('/')[1] || repoName;
    const tableName = shortName.replace(/[^a-zA-Z0-9_]/g, '_');
    console.log(`[EXPORT] Exporting graph data for ${repoName}(Table: ${tableName})...`);

    try {
        // Query sorted_content from the table
        const [rows] = await dbPool.query(`SELECT path, sorted_content FROM \`${tableName}\` WHERE sorted_content IS NOT NULL`);

        if (rows.length === 0) {
            console.log('[EXPORT] No sorted_content found.');
            return;
        }

        console.log(`[EXPORT] Found ${rows.length} records.`);

        const astData = rows.map(row => {
            try {
                // Decode Base64 sorted_content
                const jsonStr = Buffer.from(row.sorted_content, 'base64').toString('utf-8');
                const parsed = JSON.parse(jsonStr);

                // Ensure filePath is present in the object if not already (graphLinker expects it)
                // calculated from row.path or inside the object
                // The NORMALIZER output schema has "file": { "path": "..." }
                // The GRAPH LINKER input expects "filePath": "..."
                // We can add it here to be helpful, or trust the user's normalizer output.
                // Let's stick to the raw data but maybe inject 'path' if missing?
                // Actually the User said "get all the sorted_content ... in json formatted". 
                // So I'll just dump the content.
                return parsed;
            } catch (e) {
                console.error(`[EXPORT] Failed to parse content for ${row.path}: ${e.message}`);
                return null;
            }
        }).filter(item => item !== null);

        // Ensure public directory exists
        const publicDir = path.join(__dirname, '../public');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }

        const outputPath = path.join(publicDir, `${repoName}.json`);

        // Ensure parent directory exists (for repoNames like "owner/repo")
        const parentDir = path.dirname(outputPath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }

        fs.writeFileSync(outputPath, JSON.stringify(astData, null, 2));

        console.log(`[EXPORT] Successfully exported ${astData.length} items to ${outputPath}`);

    } catch (err) {
        console.error(`[EXPORT] Error: ${err.message}`);
    }
};

// Check if run directly
if (require.main === module) {
    const repoName = process.argv[2];
    if (!repoName) {
        console.error('Usage: node utils/exportGraphData.js <repo_name>');
        process.exit(1);
    }
    exportRepoGraphData(repoName).then(() => process.exit(0));
}

module.exports = { exportRepoGraphData };

