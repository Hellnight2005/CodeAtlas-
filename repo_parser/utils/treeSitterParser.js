const babelParser = require('@babel/parser');

const initParsers = () => {
    console.log('[Parser] Babel initialized for JS/TS/JSX.');
};

initParsers();

const getAST = (content, extension) => {
    const ext = extension.startsWith('.') ? extension.slice(1).toLowerCase() : extension.toLowerCase();

    if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
        try {
            const ast = babelParser.parse(content, {
                sourceType: 'module',
                plugins: [
                    'jsx',
                    'typescript',
                    'classProperties',
                    'dynamicImport',
                    'exportDefaultFrom',
                    'exportNamespaceFrom',
                    'modules',
                    'objectRestSpread'
                ],
                tokens: false // we don't need token list
            });
            // Babel returns a File node with a program property. 
            // Return program to match ESTree expectation of Normalizer
            return ast.program;
        } catch (error) {
            console.error(`[Parser] Error parsing ${ext}: ${error.message}`);
            return null;
        }
    }

    console.warn(`[Parser] No parser supported for extension: ${ext}`);
    return null;
};

module.exports = { getAST };
