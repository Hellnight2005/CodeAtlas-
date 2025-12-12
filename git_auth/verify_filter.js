
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
    'Makefile', 'CMakeLists.txt'
]);

// Directories to skip entirely
const IGNORED_DIRS = new Set([
    'node_modules', 'bower_components', 'jspm_packages',
    'venv', '.venv', 'env',
    'dist', 'build', 'out', 'target', 'bin', 'obj',
    '.git', '.svn', '.hg', '.idea', '.vscode', '.settings', '.next', '.nuxt',
    'coverage', '__tests__', 'test', 'tests',
    'public', 'assets', 'static', 'resources', 'images', 'img', 'media', 'videos'
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

    return true;
};

// Test Cases provided by User (and some extras)
const testPaths = [
    'next.config.js',
    'postcss.config.js',
    'tailwind.config.ts',
    '.eslintrc.js',
    'package.json', // This one might be kept unless blocked by config rule? It doesn't have "config" in name
    'public/ASSET_REPLACEMENT_GUIDE.md',
    'public/cert/index.html',
    'public/images/belt.HEIC',
    'src/app/page.tsx', // Should KEEP
    'src/components/Header.jsx', // Should KEEP
    'styles/global.css', // Should DROP
    'README.md' // Should DROP
];

console.log('--- Verification Results (Should mostly be DROP except code) ---');
testPaths.forEach(path => {
    const keep = isInterestingFile(path);
    console.log(`${keep ? '[KEEP]' : '[DROP]'} ${path}`);
});
