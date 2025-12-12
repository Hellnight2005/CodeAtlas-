const axios = require('axios');
const redisClient = require('../config/redisClient');
const User = require('../models/User');
const { getMainDBConnection } = require('../config/mysqlClient');
const { produceMessage } = require('../config/kafkaClient');

// GitHub API Base URL
const GITHUB_API_URL = 'https://api.github.com';

/**
 * Helper to get axios instance with optional auth header
 * @param {string} token - Optional GitHub Personal Access Token
 */
const getClient = (token) => {
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Node-GitHub-Service'
    };
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }
    return axios.create({
        baseURL: GITHUB_API_URL,
        headers
    });
};

// --- File Filtering Logic ---
const IGNORED_EXTENSIONS = new Set([
    // Media (Images, Video, Audio)
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg', '.tiff', '.webp',
    '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm',
    '.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a',
    // Documents & Archives
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.iso',
    '.md', '.markdown', '.txt', '.rst', // Docs
    // Binaries & Bytecode
    '.exe', '.dll', '.so', '.dylib', '.bin', '.obj', '.o', '.a', '.lib',
    '.pyc', '.class', '.jar', '.war',
    // Logs & DB
    '.log', '.sqlite', '.db',
    // Font files
    '.ttf', '.otf', '.woff', '.woff2', '.eot',
    // Web Assets (often noise for code analysis)
    '.css', '.scss', '.less', '.html', '.htm', '.map'
]);

const IGNORED_FILES = new Set([
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
    'Cargo.lock', 'Gemfile.lock', 'composer.lock',
    '.DS_Store', 'Thumbs.db', '.env', '.env.local',
    'Dockerfile', 'docker-compose.yml', 'LICENSE', 'README.md',
    'Makefile', 'CMakeLists.txt' // Build files
]);

// Directories to skip entirely
const IGNORED_DIRS = new Set([
    'node_modules', 'bower_components', 'jspm_packages',
    'venv', '.venv', 'env',
    'dist', 'build', 'out', 'target', 'bin', 'obj',
    '.git', '.svn', '.hg', '.idea', '.vscode', '.settings', '.next', '.nuxt',
    'coverage', '__tests__', 'test', 'tests',
    'public', 'assets', 'static', 'resources', 'images', 'img', 'media', 'videos' // Asset folders
]);

/**
 * Checks if a file path is "interesting" for code analysis.
 * Filters out media, binaries, lockfiles, hidden files, etc.
 * @param {string} path 
 * @returns {boolean}
 */
const isInterestingFile = (path) => {
    if (!path) return false;

    const parts = path.split('/');
    const filename = parts[parts.length - 1];

    // 1. Check Ignore Directories
    // If any part of the path is in the ignored dirs list
    for (const part of parts) {
        if (IGNORED_DIRS.has(part)) return false;
    }

    // 2. Check Exact Filenames
    if (IGNORED_FILES.has(filename)) return false;

    // 3. Check Dotfiles (Hidden files)
    // We assume anything starting with '.' is a config/system file unless explicitly handled
    if (filename.startsWith('.')) return false;

    // 4. Check Config Patterns (e.g., something.config.js, .rc.js)
    if (filename.includes('config') || filename.includes('rc.')) {
        return false;
    }

    // 5. Check Extensions
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex !== -1) {
        const ext = filename.substring(dotIndex).toLowerCase();
        if (IGNORED_EXTENSIONS.has(ext)) return false;
    }

    // 5. Special keyword filtering (Optional based on "cofig")
    // If filename explicitly contains "config" and is NOT valid code? 
    // Usually code configs are useful. Let's stick to extension/name blocking for now.

    return true;
};


/**
 * Search Repositories
 * GET /search?q=<query>
 */
exports.searchRepositories = async (req, res) => {
    try {
        const { q } = req.query;
        // User ID from Session (secure)
        const userId = req.user?.id;

        if (!q) {
            req.log('warn', 'Search query missing');
            return res.status(400).json({ error: 'Query parameter "q" is required' });
        }

        if (!userId) {
            req.log('warn', 'Missing user session for scoped search');
            return res.status(401).json({ error: 'Authentication required to search your repositories' });
        }

        // Retrieve token from Redis (for auth)
        const token = await redisClient.get(`user:github:token:${userId}`);

        // Retrieve Username from DB (for search scope)
        // We could store username in Redis too, but DB is reliable source
        const user = await User.findOne({ githubId: userId });

        if (!user) {
            req.log('warn', `User not found in DB: ${userId}`);
            return res.status(404).json({ error: 'User not found' });
        }

        const username = user.username;
        const scopedQuery = `${q} user:${username}`;

        req.log('info', `Searching repositories with scoped query: ${scopedQuery}`);

        const client = getClient(token); // Use token if available, though public search might work too, scoped search often needs auth for private repos
        const response = await client.get(`/search/repositories`, {
            params: { q: scopedQuery, per_page: 10 }
        });

        req.log('info', `Found ${response.data.total_count} repositories for query: ${scopedQuery}`);

        const repos = response.data.items.map(repo => ({
            name: repo.name,
            owner: repo.owner.login,
            description: repo.description,
            stars: repo.stargazers_count,
            clone_url: repo.clone_url,
            html_url: repo.html_url,
            private: repo.private
        }));

        res.json({ results: repos });
    } catch (error) {
        req.log('error', `GitHub Search Error: ${error.message}`);
        res.status(error.response?.status || 500).json({
            error: 'Failed to search repositories',
            details: error.response?.data?.message || error.message
        });
    }
};

/**
 * Get Repository File Tree (Recursive)
 * GET /repo?owner=<owner>&repo=<repo>
 */
exports.getRepositoryFiles = async (req, res) => {
    try {
        const { owner, repo } = req.query;
        const token = req.headers['x-github-token'] || process.env.GITHUB_TOKEN;

        req.log('info', `Fetching file tree for repo: ${owner}/${repo}`);

        if (!owner || !repo) {
            req.log('warn', 'Owner or repo parameter missing');
            return res.status(400).json({ error: 'Owner and repo parameters are required' });
        }

        const client = getClient(token);

        // First get the default branch sha
        const repoInfo = await client.get(`/repos/${owner}/${repo}`);
        const defaultBranch = repoInfo.data.default_branch;

        // Get the tree recursively
        const treeResponse = await client.get(`/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`);

        if (treeResponse.data.truncated) {
            req.log('warn', `Repository tree truncated for ${owner}/${repo}`);
        }

        const files = treeResponse.data.tree.map(item => ({
            path: item.path,
            type: item.type === 'blob' ? 'file' : 'dir',
            size: item.size,
            sha: item.sha
        }));

        req.log('info', `Retrieved ${files.length} items for ${owner}/${repo}. Starting processing...`);

        // Send response immediately
        res.status(202).json({
            message: 'Repository processing started',
            repo: repo,
            file_count: files.length,
            status: 'Processing in background'
        });

        // BACKGROUND PROCESSING
        (async () => {
            try {
                // 1. MySQL Setup (Connect to 'repo' DB)
                const dbPool = await getMainDBConnection();

                // Sanitize repo name for Table Name
                const tableName = repo.replace(/[^a-zA-Z0-9_]/g, '_');

                req.log('info', `Connected to 'repo' DB. Using table: ${tableName}`);

                // Create Dynamic Table
                const createTableSQL = `
                    CREATE TABLE IF NOT EXISTS \`${tableName}\` (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        path TEXT NOT NULL,
                        sha VARCHAR(100) NOT NULL,
                        type VARCHAR(20),
                        raw_content LONGTEXT,
                        sorted_content LONGTEXT,
                        status ENUM('pending', 'processing', 'done', 'failed') DEFAULT 'pending',
                        retries INT DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY unique_file (path(255), sha)
                    )
                `;
                await dbPool.query(createTableSQL);

                // 2. Filter Files
                const interestingFiles = files.filter(f => isInterestingFile(f.path));
                const ignoredCount = files.length - interestingFiles.length;
                if (ignoredCount > 0) {
                    req.log('info', `Filtered out ${ignoredCount} irrelevant files (media, config, locks, etc.)`);
                }

                // 3. Insert Files & Push to Kafka
                for (const file of interestingFiles) {
                    // Skip directories, only process actual files
                    if (file.type !== 'file') continue;


                    // Only process files, not directories (unless user wants directories too? schema says type VARCHAR, usually we process files)
                    // But user instruction said "Take the full files[] result", so we store everything.

                    // Insert into MySQL (Dynamic Table)
                    try {
                        await dbPool.query(
                            `INSERT IGNORE INTO \`${tableName}\` (path, sha, type, status) VALUES (?, ?, ?, 'pending')`,
                            [file.path, file.sha, file.type]
                        );

                        // Push to Kafka
                        // Message format as requested: { path, sha, size, type }
                        // Using 'repo-files-processing' topic
                        await produceMessage('repo-files-processing', {
                            path: file.path,
                            sha: file.sha,
                            size: file.size,
                            type: file.type,
                            repo: repo // Adding repo name to message is helpful for consumer to know which table to use
                        });

                    } catch (err) {
                        req.log('error', `Failed to process file ${file.path}: ${err.message}`);
                    }
                }

                req.log('info', `Backend processing for ${repo} completed. Files queued.`);
                await dbPool.end();

            } catch (bgError) {
                req.log('error', `Background processing failed for ${repo}: ${bgError.message}`);
            }
        })();

    } catch (error) {
        req.log('error', `GitHub Repo Error: ${error.message}`);
        // If initial fetch fails, we return error as usual
        res.status(error.response?.status || 500).json({
            error: 'Failed to fetch repository files',
            details: error.response?.data?.message || error.message
        });
    }
};

/**
 * Get File Content
 * GET /file?owner=<owner>&repo=<repo>&path=<path>
 */
exports.getFileContent = async (req, res) => {
    try {
        const { owner, repo, path } = req.query;
        const token = req.headers['x-github-token'] || process.env.GITHUB_TOKEN;

        req.log('info', `Fetching file content: ${owner}/${repo}/${path}`);

        if (!owner || !repo || !path) {
            req.log('warn', 'Owner, repo, or path parameter missing');
            return res.status(400).json({ error: 'Owner, repo, and path parameters are required' });
        }

        const client = getClient(token);
        const response = await client.get(`/repos/${owner}/${repo}/contents/${path}`);

        // Content is usually base64 encoded
        const content = response.data.content
            ? Buffer.from(response.data.content, response.data.encoding).toString('utf-8')
            : '';

        req.log('info', `Successfully fetched content for ${path} (${response.data.size} bytes)`);

        res.json({
            name: response.data.name,
            path: response.data.path,
            size: response.data.size,
            sha: response.data.sha,
            type: response.data.type,
            encoding: response.data.encoding, // usually 'base64'
            content: content,
            download_url: response.data.download_url
        });
    } catch (error) {
        req.log('error', `GitHub File Error: ${error.message}`);
        res.status(error.response?.status || 500).json({
            error: 'Failed to fetch file content',
            details: error.response?.data?.message || error.message
        });
    }
};

/**
 * Get All User Repositories (Authenticated)
 * GET /search/user-repos
 * Headers: x-user-id
 */
exports.getUserRepos = async (req, res) => {
    try {
        // 1. Get Token from Headers (Direct approach)
        // Check "Authorization: prefix <token>" or "x-github-token"
        const authHeader = req.headers['authorization'];
        let token = req.headers['x-github-token'];

        if (authHeader && authHeader.startsWith('token ')) {
            token = authHeader.split(' ')[1];
        } else if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }

        if (!token) {
            req.log('warn', 'Missing GitHub token in headers');
            return res.status(401).json({ error: 'GitHub token required in Authorization or x-github-token header' });
        }

        const { q } = req.query;

        req.log('info', `Fetching user repos with token. Filter: ${q || 'None'}`);

        const client = getClient(token);

        // Fetch all repos
        const response = await client.get('/user/repos', {
            params: {
                per_page: 100,
                type: 'all',
                sort: 'updated'
            }
        });

        // 2. Filter Results locally if 'q' is provided
        let reposData = response.data;
        if (q) {
            const query = q.toLowerCase();
            reposData = reposData.filter(repo => repo.name.toLowerCase().includes(query));
        }

        const repos = reposData.map(repo => ({
            name: repo.name,
            owner: repo.owner.login,
            description: repo.description,
            visibility: repo.visibility || (repo.private ? 'private' : 'public'),
            private: repo.private,
            fork: repo.fork,
            size: repo.size,
            stars: repo.stargazers_count,
            html_url: repo.html_url,
            clone_url: repo.clone_url
        }));

        req.log('info', `Found ${repos.length} repositories.`);

        res.json({ count: repos.length, results: repos });
    } catch (error) {
        req.log('error', `Get User Repos Error: ${error.message}`);
        res.status(error.response?.status || 500).json({
            error: 'Failed to fetch user repositories',
            details: error.response?.data?.message || error.message
        });
    }
};
