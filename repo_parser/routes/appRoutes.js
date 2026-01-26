const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'repo_parser' });
});

const { generateASTForRepo, deleteRepoGraph } = require('../controllers/astController');
const graphController = require('../controllers/graphController');
const repoController = require('../controllers/repoController');

router.post('/generate-ast', generateASTForRepo);
router.delete('/delete-graph', deleteRepoGraph);

// --- Graph Explorer APIs ---
router.get('/api/check_for_the_file', graphController.checkForFile);
router.get('/api/graph/expand', graphController.expandNode);
router.get('/api/graph/node', graphController.getNodeDetails);
router.get('/api/graph/filter', graphController.filterGraph);
router.get('/api/graph/search', graphController.searchFiles);

// --- Repo File Structure// File Tree
router.get('/api/repo/tree', repoController.getRepoFileTree);
// AI Summary
// AI Summary
router.get('/api/repo/summary', repoController.getAiFileSummary);

// Cleanup Route
router.delete('/api/repo/cleanup', repoController.deleteFullRepository);

module.exports = router;
