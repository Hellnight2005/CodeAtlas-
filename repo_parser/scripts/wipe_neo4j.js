const axios = require('axios');

const params = {
    method: 'post',
    url: 'http://localhost:7474/db/neo4j/tx/commit',
    headers: {
        'Authorization': 'Basic ' + Buffer.from('neo4j:password').toString('base64'),
        'Content-Type': 'application/json'
    },
    data: {
        statements: [{ statement: 'MATCH (n) DETACH DELETE n' }]
    }
};

axios(params)
    .then(response => {
        console.log('✅ Neo4j Database Wiped Successfully.');
    })
    .catch(error => {
        console.error('❌ Failed to wipe Neo4j:', error.message);
    });
