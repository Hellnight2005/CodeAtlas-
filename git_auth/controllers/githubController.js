const axios = require('axios');
const User = require('../models/User');
const { getMainDBConnection } = require('../config/mysqlClient');
const { produceMessage } = require('../config/kafkaClient');
const logger = require('../config/logger'); // Structured Logger

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
        const userId = req.user?.githubId;

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
        // Immediate Fail on Rate Limit to prevent request timeouts
        if (error.response?.status === 403 || error.response?.status === 429) {
            const reset = error.response.headers['x-ratelimit-reset'];
            const usage = error.response.headers['x-ratelimit-remaining'];

            if (usage === '0') {
                logger.warn(`[GitHub] Rate Limit Exceeded for ${url}. Aborting immediately.`);
                throw error; // Let the controller handle 429/500
            }
        }

        if (retries > 0 && error.response?.status >= 500) {
            const waitTime = 1000 * (4 - retries);
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
        if (req.user && req.user.githubId) {
            const userId = req.user.githubId;
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
            req.log('info', `[Sync Debug] Attempting to update Mongo for user ${req.user.id} and repo ${repoDetails.name} (ID: ${repoDetails.id})`);
            try {
                const user = await User.findOne({ githubId: req.user.id });
                if (user) {
                    req.log('info', `[Sync Debug] User found: ${user.username}. Current repos count: ${user.repos.length}`);

                    const repoIndex = user.repos.findIndex(r => r.repo_id === repoDetails.id);
                    req.log('info', `[Sync Debug] Repo found at index: ${repoIndex}`);

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
                        req.log('info', `[Sync Debug] Updated existing repo entry.`);
                    } else {
                        user.repos.push({
                            ...newRepoData,
                            isAst: false,
                            astGeneratedAt: null,
                            isexport_graph: false,
                            isexport_graph_created_at: null
                        });
                        req.log('info', `[Sync Debug] Pushed new repo entry.`);
                    }

                    // Explicitly mark modified if needed (though array push usually handles it)
                    // user.markModified('repos'); 

                    const saveResult = await user.save();
                    req.log('info', `[Sync Debug] Updated MongoDB User. New repos count: ${saveResult.repos.length}`);
                } else {
                    req.log('error', `[Sync Debug] User with githubId ${req.user.id} NOT found in MongoDB.`);
                }
            } catch (mongoErr) {
                req.log('error', `[Sync Debug] Failed to update Mongo User: ${mongoErr.message}`);
                console.error(mongoErr);
            }
        } else {
            req.log('warn', `[Sync Debug] req.user or req.user.id missing. Req User: ${JSON.stringify(req.user)}`);
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

        let previousSha = null;
        if (rows.length > 0) {
            const cache = rows[0];
            previousSha = cache.latest_commit_sha;

            if (cache.latest_commit_sha === latestSha && (cache.status === 'completed' || cache.status === 'processing')) {
                req.log('info', `Repo ${owner}/${repo} is already up to date (SHA: ${latestSha}). Status: ${cache.status}`);
                return res.status(200).json({
                    message: 'Repository already up to date',
                    repo: repo,
                    sha: latestSha,
                    status: cache.status
                });
            }
        }

        // 3. Start Processing (Update DB immediately to lock status)
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

        // 4. Background Processing (Incremental vs Full)
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

            let processedCount = 0;
            let useFullTraversal = true;

            // TRY INCREMENTAL SYNC
            if (previousSha && previousSha !== latestSha) {
                try {
                    req.log('info', `[Incremental] Attempting diff from ${previousSha.substring(0, 7)} to ${latestSha.substring(0, 7)}`);

                    const diffRes = await taskQueue.add(async () => {
                        return await client.get(`/repos/${owner}/${repo}/compare/${previousSha}...${latestSha}`);
                    });

                    // Check if comparison is valid
                    if (diffRes.data.status === 'ahead' || diffRes.data.status === 'diverged') {
                        const files = diffRes.data.files || [];
                        req.log('info', `[Incremental] Found ${files.length} changed files.`);

                        // Limit incremental sync to reasonable size (e.g., < 500 files). If huge re-write, do full traversal.
                        if (files.length < 500) {
                            useFullTraversal = false; // We will use incremental

                            for (const file of files) {
                                const { status, filename: path, sha } = file;

                                // Handle Deletions
                                if (status === 'removed') {
                                    await dbPool.query(`DELETE FROM \`${tableName}\` WHERE path = ?`, [path]);
                                    req.log('debug', `[Incremental] Deleted: ${path}`);
                                }
                                // Handle Additions/Modifications/Renames
                                else if (status === 'added' || status === 'modified' || status === 'renamed') {
                                    if (isInterestingFile(path)) {
                                        // Fetch content for this specific file
                                        // We can use the existing 'contents' API or raw URL. The file object might have raw_url.
                                        // Let's reuse existing flow to be consistent (store content in DB).

                                        // We need to fetch content. 
                                        // Using the existing loop logic style:
                                        await sleep(350); // Throttle

                                        try {
                                            const contentRes = await axiosRetry(client, `/repos/${owner}/${repo}/contents/${path}`);
                                            const item = contentRes.data;

                                            // Upsert into MySQL
                                            await dbPool.query(
                                                `INSERT INTO \`${tableName}\` (path, sha, type, owner, userId, status, raw_content) 
                                                 VALUES (?, ?, ?, ?, ?, 'pending', NULL)
                                                 ON DUPLICATE KEY UPDATE sha = VALUES(sha), status = 'pending', retries = 0`,
                                                [item.path, item.sha, item.type, owner, req.user?.id]
                                            );
                                            // Note: We insert NULL raw_content to indicate it needs fetching? 
                                            // Wait, the FULL traversal sets status='pending' and DOES NOT fetch raw_content immediately?
                                            // Looking at previous code: 
                                            // `INSERT IGNORE INTO ... VALUES (..., 'pending')`
                                            // And then `produceMessage('repo-files-processing')`
                                            // Ah! The `repo_parser` (Step 229) fetches the content!
                                            // "const rawContent = await fetchFileContent(owner, repo, path, userId);"
                                            // So git_auth ONLY stores metadata and pushes to Kafka. CORRECT.

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
                                            req.log('debug', `[Incremental] Enqueued: ${path}`);

                                        } catch (fileErr) {
                                            req.log('error', `[Incremental] Failed to process ${path}: ${fileErr.message}`);
                                        }
                                    } else {
                                        req.log('debug', `[Incremental] Skipped ignored file: ${path}`);
                                    }
                                }
                            }
                            req.log('info', `[Incremental] Sync complete. Processed ${processedCount} changes.`);
                        } else {
                            req.log('info', `[Incremental] Too many changes (${files.length}). Falling back to full traversal.`);
                        }
                    } else {
                        req.log('warn', `[Incremental] Diff status '${diffRes.data.status}' not supported. Fallback.`);
                    }

                } catch (diffErr) {
                    req.log('error', `[Incremental] Diff failed: ${diffErr.message}. Falling back to full traversal.`);
                    useFullTraversal = true;
                }
            } else {
                req.log('info', `[Sync] No previous SHA or forced full sync. Starting full traversal.`);
            }

            // FALLBACK / FULL TRAVERSAL
            if (useFullTraversal) {
                const dirQueue = [''];
                try {
                    req.log('info', `Starting full traversal for ${owner}/${repo}`);
                    while (dirQueue.length > 0) {
                        const currentPath = dirQueue.shift(); // BFS
                        await sleep(350);
                        try {
                            let contentsUrl = `/repos/${owner}/${repo}/contents/${currentPath}`;
                            if (!currentPath) contentsUrl = `/repos/${owner}/${repo}/contents`;

                            const contentRes = await axiosRetry(client, contentsUrl);
                            const items = Array.isArray(contentRes.data) ? contentRes.data : [contentRes.data];

                            for (const item of items) {
                                if (item.type === 'dir') {
                                    dirQueue.push(item.path);
                                } else if (item.type === 'file') {
                                    if (isInterestingFile(item.path)) {
                                        // Insert: On Duplicate Ignore (Metadata only)
                                        // If file has changed SHA, we should probably update it? 
                                        // The original code was INSERT IGNORE. This means if path exists, it acts as "up to date".
                                        // But if SHA changed, we need to process it!
                                        // Modified logic: ON DUPLICATE KEY UPDATE if SHA differs?
                                        // Let's improve the full traversal too: check SHA.

                                        // "INSERT INTO ... ON DUPLICATE KEY UPDATE sha = VALUES(sha)" -> check if affectedRow > 0?
                                        // Actually checking sha match in SQL is better.

                                        // For now, sticking to logic that works:
                                        // The user wants efficient updates. INSERT IGNORE assumes file didn't change.
                                        // If we want to catch changes in full traversal, we must compare SHAs.
                                        // We will enable upsert.

                                        await dbPool.query(
                                            `INSERT INTO \`${tableName}\` (path, sha, type, owner, userId, status) 
                                             VALUES (?, ?, ?, ?, ?, 'pending')
                                             ON DUPLICATE KEY UPDATE sha = VALUES(sha), status = IF(sha <> VALUES(sha), 'pending', status)`,
                                            [item.path, item.sha, item.type, owner, req.user?.id]
                                        );
                                        // Check if we need to emit event. 
                                        // We blindly emit for now, consumer checks duplication or we can optimize?
                                        // Ideally we only emit if 'pending'.
                                        // Let's emit everything for full safety in "Full" mode.

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
                            req.log('error', `Failed to fetch/process directory ${currentPath}: ${dirError.message}`);
                        }
                    }
                    req.log('info', `Full traversal complete. Processed ${processedCount} files.`);
                } catch (fatalError) {
                    req.log('error', `Fatal error in full traversal: ${fatalError.message}`);
                    throw fatalError;
                }
            }

            // Success Update
            await dbPool.query(
                `UPDATE repository_sync_status SET status = 'completed' WHERE repo_full_name = ?`,
                [`${owner}/${repo}`]
            );

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
        req.log('debug', `getUserRepos called. User: ${req.user ? req.user.username : 'None'}`);
        let token = req.headers['x-github-token'];
        const authHeader = req.headers['authorization'];

        if (authHeader && authHeader.startsWith('token ')) token = authHeader.split(' ')[1];
        else if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.split(' ')[1];

        if (!token && req.user && req.user.githubAccessToken) {
            token = req.user.githubAccessToken;
        }

        if (!token) {
            return res.status(401).json({ error: 'GitHub token required' });
        }

        const dbPool = await getMainDBConnection();

        // Fetch User DB Record for Metadata
        let dbReposMap = new Map();
        if (req.user && req.user.githubId) {
            const user = await User.findOne({ githubId: req.user.githubId });
            if (user && user.repos) {
                user.repos.forEach(r => {
                    dbReposMap.set(r.repo_id, r);
                });
            }
        }

        // Fetch MySQL Sync Status
        const mysqlStatusMap = new Map();
        try {
            // Assuming owner is the user. For orgs, this might miss, but good for user repos.
            if (req.user && req.user.username) {
                const [rows] = await dbPool.query(`SELECT * FROM repository_sync_status WHERE owner = ?`, [req.user.username]);
                rows.forEach(row => {
                    // Key by repo name (without owner prefix since we are filtering by owner)
                    // OR full name.
                    // DB stores 'owner/repo'.
                    mysqlStatusMap.set(row.repo_full_name, row);
                });
            }
        } catch (dbErr) {
            req.log('error', `MySQL Fetch Error: ${dbErr.message}`);
        }

        const { q } = req.query;
        // Use generic client (with timeout fix)
        const client = getClient(token);

        let reposData = [];
        try {
            const response = await client.get('/user/repos', {
                params: { per_page: 100, type: 'all', sort: 'updated' }
            });
            reposData = response.data;
        } catch (ghErr) {
            // Handle Rate Limit gracefully here too
            if (ghErr.response?.status === 403 || ghErr.response?.status === 429) {
                return res.status(429).json({ error: 'GitHub Rate Limit Exceeded. Please wait.' });
            }
            throw ghErr;
        }

        let results = reposData;
        if (q) {
            const query = q.toLowerCase();
            results = results.filter(repo => repo.name.toLowerCase().includes(query));
        }

        const repos = results.map(repo => {
            const dbRepo = dbReposMap.get(repo.id);
            const fullName = `${repo.owner.login}/${repo.name}`;
            const mysqlStatus = mysqlStatusMap.get(fullName);

            return {
                id: repo.id,
                name: repo.name,
                owner: repo.owner.login,
                description: repo.description,
                visibility: repo.visibility || (repo.private ? 'private' : 'public'),
                private: repo.private,
                fork: repo.fork,
                size: repo.size,
                stars: repo.stargazers_count,
                html_url: repo.html_url,
                clone_url: repo.clone_url,
                // mongo flags
                isSync: dbRepo?.isUpdated || false,
                isAst: dbRepo?.isAst || false,
                isGraph: dbRepo?.isexport_graph || false,
                // MySQL Details
                sync_status: mysqlStatus ? mysqlStatus.status : 'not_synced',
                last_synced: mysqlStatus ? mysqlStatus.last_synced_at : null,
                latest_commit: mysqlStatus ? mysqlStatus.latest_commit_sha : null
            };
        });

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

/**
 * Repair Sync: Manually trigger synchronization between MySQL and MongoDB
 * GET /repair-sync
 */
exports.repairSync = async (req, res) => {
    try {
        const userId = req.user?.githubId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized: GitHub ID missing from session.' });
        }

        const user = await User.findOne({ githubId: userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (req.log) req.log('info', `[Repair Sync] Starting sync for user: ${user.username}`);

        const dbPool = await getMainDBConnection();

        // Find all completed repos for this user (where user is owner)
        // Ensure we handle potential connection errors or empty results
        const [rows] = await dbPool.query(
            `SELECT * FROM repository_sync_status WHERE owner = ? AND status = 'completed'`,
            [user.username]
        );

        if (req.log) req.log('info', `[Repair Sync] Found ${rows.length} completed repos in MySQL for owner ${user.username}`);

        let updatedCount = 0;
        let addedCount = 0;

        for (const row of rows) {
            const repoName = row.repo_full_name.split('/')[1];
            const repoIndex = user.repos.findIndex(r => r.repo_name === repoName);

            if (repoIndex === -1) {
                if (req.log) req.log('info', `[Repair Sync] Fetching details for missing repo: ${row.repo_full_name}`);
                try {
                    const repoDetails = await taskQueue.add(async () => {
                        const client = getClient(user.githubAccessToken);
                        const res = await client.get(`/repos/${row.repo_full_name}`);
                        return res.data;
                    });

                    user.repos.push({
                        repo_id: repoDetails.id,
                        repo_name: repoDetails.name,
                        repo_url: repoDetails.html_url,
                        isPrivate: repoDetails.private,
                        description: repoDetails.description,
                        language: repoDetails.language,
                        forks_count: repoDetails.forks_count,
                        stargazers_count: repoDetails.stargazers_count,
                        isUpdated: true,
                        lastCommit: new Date(row.last_synced_at || new Date()),
                        isAst: false,
                        astGeneratedAt: null,
                        isexport_graph: false,
                        isexport_graph_created_at: null
                    });
                    addedCount++;
                } catch (fetchErr) {
                    if (req.log) req.log('error', `[Repair Sync] Failed to fetch details for ${row.repo_full_name}: ${fetchErr.message}`);
                }
            } else {
                if (!user.repos[repoIndex].isUpdated) {
                    user.repos[repoIndex].isUpdated = true;
                    updatedCount++;
                }
            }
        }

        if (addedCount > 0 || updatedCount > 0) {
            await user.save();
            if (req.log) req.log('info', `[Repair Sync] Changes saved. Added: ${addedCount}, Updated: ${updatedCount}`);
        }

        res.json({
            message: 'Sync repair complete',
            mysql_count: rows.length,
            added: addedCount,
            updated: updatedCount
        });

    } catch (error) {
        console.error(error);
        if (req.log) req.log('error', `[Repair Sync] Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
};
/**
 * Delete Repository from User's Dashboard
 * DELETE /repo?repo_id=...
 */
exports.deleteRepo = async (req, res) => {
    try {
        const userId = req.user?.githubId;
        const { repo_id } = req.query;

        console.log(`[Delete Repo] User: ${userId}, RepoID: ${repo_id}`);

        if (!userId || !repo_id) {
            return res.status(400).json({ error: 'User ID and Repo ID are required' });
        }

        const user = await User.findOne({ githubId: userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const initialCount = user.repos.length;
        user.repos = user.repos.filter(r => r.repo_id.toString() !== repo_id.toString());

        if (user.repos.length === initialCount) {
            console.log(`[Delete Repo] Repo ${repo_id} not found in user list.`);
            // Return 200 anyway to ensure UI is in sync
        }

        await user.save();
        console.log(`[Delete Repo] Deleted repo ${repo_id}. New count: ${user.repos.length}`);

        res.json({ message: 'Repository removed', repo_id });
    } catch (error) {
        console.error("Delete Repo Error:", error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * Check Sync Status for All User Repos
 * GET /syn_check
 */
exports.checkSyncStatus = async (req, res) => {
    try {
        const userId = req.user?.githubId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const user = await User.findOne({ githubId: userId });
        if (!user || !user.repos || user.repos.length === 0) {
            return res.json({ outOfSync: [] });
        }

        const dbPool = await getMainDBConnection();
        const client = getClient(user.githubAccessToken);
        const outOfSync = [];

        // We only check repos that user is monitoring/tracking
        const checkPromises = user.repos.map(async (userRepo) => {
            try {
                // 1. Get MySQL Status
                let fullRepoName = userRepo.repo_name;
                if (!fullRepoName.includes('/')) {
                    const match = userRepo.repo_url.match(/github\.com\/([^\/]+\/[^\/]+)/);
                    if (match) fullRepoName = match[1];
                    else fullRepoName = `${user.username}/${userRepo.repo_name}`;
                }

                const [rows] = await dbPool.query(
                    `SELECT latest_commit_sha FROM repository_sync_status WHERE repo_full_name = ?`,
                    [fullRepoName]
                );

                const storedSha = rows.length > 0 ? rows[0].latest_commit_sha : null;

                // 2. Fetch GitHub SHA (Head of default branch)
                const githubSha = await taskQueue.add(async () => {
                    const r = await client.get(`/repos/${fullRepoName}`);
                    const defaultBranch = r.data.default_branch;
                    const branchRef = await client.get(`/repos/${fullRepoName}/branches/${defaultBranch}`);
                    return branchRef.data.commit.sha;
                });

                if (storedSha && githubSha !== storedSha) {
                    outOfSync.push(userRepo.repo_name);
                } else if (!storedSha) {
                    outOfSync.push(userRepo.repo_name);
                }

            } catch (err) {
                console.error(`Failed to check sync for ${userRepo.repo_name}:`, err.message);
            }
        });

        await Promise.all(checkPromises);

        console.log(`[Sync Check] User ${user.username}: ${outOfSync.length} repos out of sync.`);

        // Set Cookie
        res.cookie('syn_repo', JSON.stringify(outOfSync), {
            maxAge: 24 * 60 * 60 * 1000,
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production'
        });

        res.json({ outOfSync });

    } catch (error) {
        console.error("Sync Check Error:", error);
        res.status(500).json({ error: error.message });
    }
};
