const axios = require('axios');

async function testTrigger() {
    const repoName = process.argv[2] || 'test_repo';
    try {
        console.log(`Triggering AST generation for ${repoName}...`);
        const res = await axios.post('http://localhost:5001/generate-ast', {
            repoName: repoName
        });
        console.log('Response:', res.data);
    } catch (err) {
        console.error('Error:', err.response ? err.response.data : err.message);
    }
}

testTrigger();
