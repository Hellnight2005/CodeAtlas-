const dbPool = require('../config/mysqlRepo');

async function checkSortContent() {
    const tableName = process.argv[2] || 'restoree';
    try {
        console.log(`Checking sort_content in ${tableName}...`);
        const [rows] = await dbPool.query(`SELECT path, length(sort_content) as len, sort_content FROM \`${tableName}\` WHERE sort_content IS NOT NULL LIMIT 3`);

        if (rows.length === 0) {
            console.log('No rows have sort_content set.');
            // Check if column even exists
            const [cols] = await dbPool.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE 'sort_content'`);
            console.log('Column check:', cols);
        } else {
            console.log('Found updated rows:', rows.length);
            rows.forEach(r => {
                console.log(`Path: ${r.path}, Length: ${r.len}`);
                console.log(`Content Sample: ${r.sort_content ? r.sort_content.substring(0, 50) : 'NULL'}...`);
            });
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSortContent();
