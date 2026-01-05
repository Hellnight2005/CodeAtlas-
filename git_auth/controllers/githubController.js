const axios = require('axios');
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
        headers['Authorization'] = `Bearer ${token}`;
    }
    return axios.create({
        baseURL: GITHUB_API_URL,
        headers
    });
};

// ... (existing code)
// ... (isInterestingFile functions if needed, but I think I deleted them too? Step 596 shows only getClient then getRepositoryFiles)
// Yup, I deleted isInterestingFile too. I need to put them back or the file filter will break (it is used in getRepositoryFiles line 116).
// Step 596 shows isInterestingFile is NOT defined before getRepositoryFiles.
// But getRepositoryFiles uses it at line 116: files.filter(f => isInterestingFile(f.path)).
// So getRepositoryFiles will crash too.

// Restoring Missing Functions: isInterestingFile and searchRepositories.

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

const IGNORED_DIRS = new Set([
    'node_modules', 'bower_components', 'jspm_packages',
    'venv', '.venv', 'env',
    'dist', 'build', 'out', 'target', 'bin', 'obj',
    '.git', '.svn', '.hg', '.idea', '.vscode', '.settings', '.next', '.nuxt',
    'coverage', '__tests__', 'test', 'tests',
    'public', 'assets', 'static', 'resources', 'images', 'img', 'media', 'videos'
]);

const isInterestingFile = (path) => {
    if (!path) return false;
    const parts = path.split('/');
    const filename = parts[parts.length - 1];
    for (const part of parts) { if (IGNORED_DIRS.has(part)) return false; }
    if (IGNORED_FILES.has(filename)) return false;
    if (filename.startsWith('.')) return false;
    if (filename.includes('config') || filename.includes('rc.')) return false;
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex !== -1) {
        const ext = filename.substring(dotIndex).toLowerCase();
        if (IGNORED_EXTENSIONS.has(ext)) return false;
    }
    return true;
};

/**
 * Search Repositories
 * GET /search?q=<query>
 */
const taskQueue = require('../utils/concurrencyQueue');

// ... (imports remain) ...

// ... (getClient, isInterestingFile remain) ...

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

        const user = await User.findOne({ githubId: userId });

        if (!user) {
            req.log('warn', `User not found in DB: ${userId}`);
            return res.status(404).json({ error: 'User not found' });
        }

        const token = user.githubAccessToken;
        const username = user.username;
        const scopedQuery = `${q} user:${username}`;

        req.log('info', `Searching repositories with scoped query: ${scopedQuery}`);

        // QUEUE EXECUTION
        const response = await taskQueue.add(async () => {
            const client = getClient(token);
            return await client.get(`/search/repositories`, {
                params: { q: scopedQuery, per_page: 10 }
            });
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
            details: error.response?.data?.message || 'Request failed due to rate limits or connectivity'
        });
    }
};


/**
 * Helper: Sleep function for throttling
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper: Fetch URL with Retry Logic for 403 (Rate Limit) / 429
 */
const axiosRetry = async (client, url, config = {}, retries = 3) => {
    try {
        return await client.get(url, config);
    } catch (error) {
        if (retries > 0 && (error.response?.status === 429 || error.response?.status === 403)) {
            // Check for Rate Limit headers
            const retryAfter = error.response.headers['retry-after'];
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000 * (4 - retries); // Fallback exponential backoff

            console.log(`Rate limit hit. Waiting ${waitTime}ms before retry. (${retries} retries left)`);
            await sleep(waitTime);
            return axiosRetry(client, url, config, retries - 1);
        }
        throw error;
    }
};

exports.getRepositoryFiles = async (req, res) => {
    try {
        const { owner, repo } = req.query;
        let token = req.headers['x-github-token'] || process.env.GITHUB_TOKEN;

        // PRIORITIZE USER TOKEN to avoid shared rate limits
        if (req.user && req.user.id) {
            const userId = req.user.id;
            const user = await User.findOne({ githubId: userId });
            if (user && user.githubAccessToken) {
                token = user.githubAccessToken;
            }
        }

        req.log('info', `Fetching file tree for repo: ${owner}/${repo}`);

        if (!owner || !repo) {
            req.log('warn', 'Owner or repo parameter missing');
            return res.status(400).json({ error: 'Owner and repo parameters are required' });
        }

        const client = getClient(token);

        // 1. Get Repo Info (Default Branch & Latest Commit SHA)
        // Wrappped in taskQueue for concurrency control on the initial fetch
        const repoInitData = await taskQueue.add(async () => {
            const repoInfo = await client.get(`/repos/${owner}/${repo}`);
            const defaultBranch = repoInfo.data.default_branch;

            // Get latest commit SHA of default branch
            const branchInfo = await client.get(`/repos/${owner}/${repo}/branches/${defaultBranch}`);
            const latestSha = branchInfo.data.commit.sha;
            // Get last commit date
            const lastCommitDate = branchInfo.data.commit.commit.author.date;

            return {
                defaultBranch,
                latestSha,
                repoDetails: repoInfo.data,
                lastCommitDate
            };
        });

        const { defaultBranch, latestSha, repoDetails, lastCommitDate } = repoInitData;
        req.log('info', `Repo ${owner}/${repo} default branch: ${defaultBranch}, SHA: ${latestSha}`);

        // --- UPDATE USER MODEL IN MONGODB ---
        if (req.user && req.user.id) {
            try {
                const user = await User.findOne({ githubId: req.user.id });
                if (user) {
                    const repoIndex = user.repos.findIndex(r => r.repo_id === repoDetails.id);

                    const newRepoData = {
                        repo_id: repoDetails.id,
                        repo_name: repoDetails.name,
                        repo_url: repoDetails.html_url,
                        isPrivate: repoDetails.private,
                        description: repoDetails.description,
                        language: repoDetails.language,
                        forks_count: repoDetails.forks_count,
                        stargazers_count: repoDetails.stargazers_count,
                        isUpdated: true,
                        lastCommit: new Date(lastCommitDate),
                    };

                    if (repoIndex > -1) {
                        const existing = user.repos[repoIndex];
                        user.repos[repoIndex] = { ...existing.toObject(), ...newRepoData };
                    } else {
                        user.repos.push({
                            ...newRepoData,
                            isAst: false,
                            astGeneratedAt: null,
                            isexport_graph: false,
                            isexport_graph_created_at: null
                        });
                    }

                    await user.save();
                    req.log('info', `Updated MongoDB User for repo: ${repoDetails.name}`);
                }
            } catch (mongoErr) {
                req.log('error', `Failed to update Mongo User: ${mongoErr.message}`);
            }
        }

        // 2. Database Connection & Caching Check
        const dbPool = await getMainDBConnection();
        const tableName = repo.replace(/[^a-zA-Z0-9_]/g, '_');

        // Ensure Cache Table Exists
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS repository_sync_status (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                repo_full_name VARCHAR(255) NOT NULL UNIQUE,
                owner VARCHAR(255) NOT NULL,
                latest_commit_sha VARCHAR(255) NOT NULL,
                last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
                INDEX idx_repo_name (repo_full_name)
            )
        `);

        // Check verification for Cache
        const [rows] = await dbPool.query(
            `SELECT latest_commit_sha, status FROM repository_sync_status WHERE repo_full_name = ?`,
            [`${owner}/${repo}`]
        );

        if (rows.length > 0) {
            const cache = rows[0];
            if (cache.latest_commit_sha === latestSha && (cache.status === 'completed' || cache.status === 'processing')) {
                req.log('info', `Repo ${owner}/${repo} is already up to date (SHA: ${latestSha}). Status: ${cache.status}`);
                dbPool.release(); // Important: release if using pool directly, or if using wrapper ensure it handles it. 
                // Note: getMainDBConnection returns a pool, not a connection usually, so explicit release might not be needed unless using getConnection().
                // Assuming dbPool is a pool:

                return res.status(200).json({
                    message: 'Repository already up to date',
                    repo: repo,
                    sha: latestSha,
                    status: cache.status
                });
            }
        }

        // 3. Start Processing
        // Update Status to Processing
        await dbPool.query(
            `INSERT INTO repository_sync_status (repo_full_name, owner, latest_commit_sha, status, last_synced_at)
             VALUES (?, ?, ?, 'processing', NOW())
             ON DUPLICATE KEY UPDATE latest_commit_sha = VALUES(latest_commit_sha), status = 'processing', last_synced_at = NOW()`,
            [`${owner}/${repo}`, owner, latestSha]
        );

        res.status(202).json({
            message: 'Repository processing started',
            repo: repo,
            sha: latestSha,
            status: 'Processing in background'
        });

        // 4. Background Lazy Traversal
        (async () => {
            // Create main repo table if not exists
            const createTableSQL = `
                CREATE TABLE IF NOT EXISTS \`${tableName}\` (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    path TEXT NOT NULL,
                    sha VARCHAR(100) NOT NULL,
                    type VARCHAR(20),
                    owner VARCHAR(255),
                    userId VARCHAR(255),
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

            // Queue for directories to traverse: starts with root path ''
            const dirQueue = [''];
            let processedCount = 0;

            try {
                req.log('info', `Starting lazy traversal for ${owner}/${repo}`);

                while (dirQueue.length > 0) {
                    const currentPath = dirQueue.shift(); // BFS

                    req.log('debug', `Fetching contents of: ${currentPath || 'ROOT'}`);

                    // Throttle: 300-600ms Delay
                    await sleep(350);

                    // Fetch Contents (Retries handles 403/429)
                    // Note: We intentionally DO NOT use taskQueue here to avoid blocking the single execution slot for too long if the repo is huge.
                    // However, we MUST be careful not to spam. The sleep() above is our rate limiter.
                    // We call axios directly (via wrapper).

                    try {
                        let contentsUrl = `/repos/${owner}/${repo}/contents/${currentPath}`;
                        // If path is empty, it needs to be NO leading slash after contents? actually contents/ works for root? 
                        // GitHub API: GET /repos/{owner}/{repo}/contents/{path}
                        // For root: GET /repos/{owner}/{repo}/contents/ or just /repos/{owner}/{repo}/contents
                        if (!currentPath) contentsUrl = `/repos/${owner}/${repo}/contents`;

                        const contentRes = await axiosRetry(client, contentsUrl);
                        const items = Array.isArray(contentRes.data) ? contentRes.data : [contentRes.data];

                        // Process Items
                        for (const item of items) {
                            if (item.type === 'dir') {
                                dirQueue.push(item.path);
                            } else if (item.type === 'file') {
                                if (isInterestingFile(item.path)) {
                                    // Insert into DB
                                    await dbPool.query(
                                        `INSERT IGNORE INTO \`${tableName}\` (path, sha, type, owner, userId, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
                                        [item.path, item.sha, item.type, owner, req.user?.id]
                                    );

                                    // Kafka Produce
                                    await produceMessage('repo-files-processing', {
                                        path: item.path,
                                        sha: item.sha,
                                        size: item.size,
                                        type: item.type,
                                        repo: repo,
                                        owner: owner,
                                        userId: req.user?.id
                                    });
                                    processedCount++;
                                }
                            }
                        }

                    } catch (dirError) {
                        // If a directory fails, log it but continue? 
                        // If 403 blocks us completely, axiosRetry should have handled it or thrown after retries.
                        req.log('error', `Failed to fetch/process directory ${currentPath}: ${dirError.message}`);
                    }
                }

                // Success
                await dbPool.query(
                    `UPDATE repository_sync_status SET status = 'completed' WHERE repo_full_name = ?`,
                    [`${owner}/${repo}`]
                );
                req.log('info', `Traversal complete for ${owner}/${repo}. processed ${processedCount} files.`);

            } catch (fatalError) {
                req.log('error', `Fatal error processing ${owner}/${repo}: ${fatalError.message}`);
                await dbPool.query(
                    `UPDATE repository_sync_status SET status = 'failed' WHERE repo_full_name = ?`,
                    [`${owner}/${repo}`]
                );
            } finally {
                if (dbPool) await dbPool.end();
            }

        })(); // End Background

    } catch (error) {
        req.log('error', `GitHub Repo Error: ${error.message}`);
        res.status(error.response?.status || 500).json({
            error: 'Failed to fetch repository files',
            details: error.response?.data?.message || 'Request failed due to rate limits or connectivity'
        });
    }
};

exports.getFileContent = async (req, res) => {
    try {
        const { owner, repo, path } = req.query;
        const token = req.headers['x-github-token'] || process.env.GITHUB_TOKEN;

        req.log('info', `Fetching file content: ${owner}/${repo}/${path}`);

        if (!owner || !repo || !path) {
            req.log('warn', 'Owner, repo, or path parameter missing');
            return res.status(400).json({ error: 'Owner, repo, and path parameters are required' });
        }

        const responseData = await taskQueue.add(async () => {
            await sleep(350); // Throttle content fetching
            const client = getClient(token);
            const response = await axiosRetry(client, `/repos/${owner}/${repo}/contents/${path}`); // Use retry logic
            return response.data;
        });

        const content = responseData.content
            ? Buffer.from(responseData.content, responseData.encoding).toString('utf-8')
            : '';

        req.log('info', `Successfully fetched content for ${path} (${responseData.size} bytes)`);

        res.json({
            name: responseData.name,
            path: responseData.path,
            size: responseData.size,
            sha: responseData.sha,
            type: responseData.type,
            encoding: responseData.encoding,
            content: content,
            download_url: responseData.download_url
        });
    } catch (error) {
        req.log('error', `GitHub File Error: ${error.message}`);
        res.status(error.response?.status || 500).json({
            error: 'Failed to fetch file content',
            details: error.response?.data?.message || 'Request failed'
        });
    }
};

exports.getUserRepos = async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        let token = req.headers['x-github-token'];

        if (authHeader && authHeader.startsWith('token ')) token = authHeader.split(' ')[1];
        else if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.split(' ')[1];

        if (!token) {
            req.log('warn', 'Missing GitHub token in headers');
            return res.status(401).json({ error: 'GitHub token required' });
        }

        const { q } = req.query;
        req.log('info', `Fetching user repos with token. Filter: ${q || 'None'}`);

        const reposData = await taskQueue.add(async () => {
            const client = getClient(token);
            const response = await client.get('/user/repos', {
                params: { per_page: 100, type: 'all', sort: 'updated' }
            });
            return response.data;
        });

        let results = reposData;
        if (q) {
            const query = q.toLowerCase();
            results = results.filter(repo => repo.name.toLowerCase().includes(query));
        }

        const repos = results.map(repo => ({
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
            details: error.response?.data?.message || 'Request failed'
        });
    }
};
