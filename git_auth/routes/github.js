const express = require('express');
const router = express.Router();
const githubController = require('../controllers/githubController');
const ensureAuthenticated = require('../middleware/auth');
const attachUserHeader = require('../middleware/attachUserHeader');

// Middleware removed to allow direct Token usage
// router.use(ensureAuthenticated);
// router.use(attachUserHeader);

// Search repositories
router.get('/search', githubController.searchRepositories);

// Get authenticated user's repositories
router.get('/search/user-repos', githubController.getUserRepos);

// Get repository file tree
router.get('/repo', githubController.getRepositoryFiles);

// Get specific file content
router.get('/file', githubController.getFileContent);

module.exports = router;
