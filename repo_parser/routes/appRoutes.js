const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'repo_parser' });
});

const { generateASTForRepo, deleteRepoGraph } = require('../controllers/astController');
router.post('/generate-ast', generateASTForRepo);
router.delete('/delete-graph', deleteRepoGraph);

module.exports = router;
