const axios = require('axios');

const NEO4J_BASE_URL = 'http://localhost:7474/db/neo4j/tx/commit';
const NEO4J_AUTH = 'Basic ' + Buffer.from('neo4j:password').toString('base64');

async function run() {
    console.log('🔒 Applying Neo4j Constraints...');

    const queries = [
        'CREATE CONSTRAINT IF NOT EXISTS FOR (r:Repository) REQUIRE r.name IS UNIQUE',
        'CREATE CONSTRAINT IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE'
    ];

    for (const statement of queries) {
        try {
            await axios.post(
                NEO4J_BASE_URL,
                { statements: [{ statement }] },
                { headers: { Authorization: NEO4J_AUTH, 'Content-Type': 'application/json' } }
            );
            console.log(`✅ Applied: ${statement}`);
        } catch (error) {
            const msg = error.response?.data?.errors?.[0]?.message || error.message;
            console.error(`❌ Failed: ${statement}`, msg);
        }
    }
}

run();
