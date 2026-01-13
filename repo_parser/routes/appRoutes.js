const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'repo_parser' });
});

const { generateASTForRepo, deleteRepoGraph } = require('../controllers/astController');
const graphController = require('../controllers/graphController');

router.post('/generate-ast', generateASTForRepo);
router.delete('/delete-graph', deleteRepoGraph);

// --- Graph Explorer APIs ---
// User requested /api/graph/..., and these routes are likely mounted at /
router.get('/api/graph/start', graphController.getInitialGraph);
router.get('/api/graph/expand', graphController.expandNode);
router.get('/api/graph/node', graphController.getNodeDetails);
router.get('/api/graph/filter', graphController.filterGraph);
router.get('/api/graph/search', graphController.searchFiles);

module.exports = router;
