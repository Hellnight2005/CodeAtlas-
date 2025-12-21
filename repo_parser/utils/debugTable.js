const dbPool = require('../config/mysqlRepo');

async function debugTable() {
    const tableName = process.argv[2] || 'restoree';
    try {
        console.log(`Inspecting table: ${tableName}`);
        const [rows] = await dbPool.query(`SELECT * FROM \`${tableName}\` LIMIT 5`);
        console.log('Row count:', rows.length);
        if (rows.length > 0) {
            console.log('Sample Row values:');
            rows.forEach(row => {
                console.log({
                    path: row.path,
                    type: row.type, // Check this value
                    raw_content_exists: !!row.raw_content,
                    raw_content_length: row.raw_content ? row.raw_content.length : 0
                });
            });
        } else {
            console.log('No rows found.');
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugTable();
