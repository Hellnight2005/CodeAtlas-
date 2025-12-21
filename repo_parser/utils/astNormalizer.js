const AST_NORMALIZER_PROMPT = `You are a language-agnostic static code analyzer...`;

/**
 * Extract function/method calls from a node
 */
const extractCalls = (node, calls = new Set()) => {
    if (!node) return calls;

    if (Array.isArray(node)) {
        node.forEach(child => extractCalls(child, calls));
        return calls;
    }

    if (node.type === 'CallExpression') {
        if (node.callee.type === 'Identifier') {
            calls.add(node.callee.name);
        } else if (node.callee.type === 'MemberExpression') {
            const object =
                node.callee.object?.name ||
                (node.callee.object?.type === 'ThisExpression' ? 'this' : 'unknown');

            let property = 'unknown';
            if (node.callee.property?.type === 'Identifier') {
                property = node.callee.property.name;
            } else if (node.callee.property?.type === 'StringLiteral') {
                property = node.callee.property.value;
            }

            calls.add(`${object}.${property}`);
        }
    }

    // Traverse children safely
    extractCalls(node.body, calls);
    extractCalls(node.expression, calls);
    extractCalls(node.arguments, calls);
    extractCalls(node.callee, calls);

    return calls;
};

const normalizeAST = (ast, filePath, language) => {
    if (!ast || !ast.body) {
        return {
            file: { path: filePath, language, moduleType: "unknown", entryPoint: false },
            imports: [],
            entities: { modules: [], classes: [], functions: [], variables: [] },
            exports: []
        };
    }

    const imports = [];
    const exports = [];
    const classes = [];
    const functions = [];
    const variables = [];

    const traverse = (node, scope = 'global') => {
        if (!node) return;

        if (Array.isArray(node)) {
            node.forEach(child => traverse(child, scope));
            return;
        }

        /* ---------------- IMPORTS ---------------- */
        if (node.type === 'ImportDeclaration') {
            const source = node.source.value;
            const symbols = node.specifiers.map(spec => spec.imported?.name || spec.local.name);
            let kind = source.startsWith('.') ? 'local' : source.startsWith('@/') ? 'alias' : 'external';
            imports.push({ source, kind, symbols });
        }

        /* ---------------- EXPORTS ---------------- */
        if (node.type === 'ExportNamedDeclaration') {
            if (node.declaration) {
                traverse(node.declaration, scope);

                if (node.declaration.type === 'VariableDeclaration') {
                    node.declaration.declarations.forEach(decl => {
                        if (decl.id.type === 'Identifier') exports.push({ name: decl.id.name, kind: 'variable' });
                    });
                }
                if (node.declaration.type === 'FunctionDeclaration') {
                    exports.push({ name: node.declaration.id?.name, kind: 'function' });
                }
                if (node.declaration.type === 'ClassDeclaration') {
                    exports.push({ name: node.declaration.id?.name, kind: 'class' });
                }
            } else {
                node.specifiers.forEach(spec => exports.push({ name: spec.exported.name, kind: 'unknown' }));
            }
        }

        if (node.type === 'ExportDefaultDeclaration') {
            let kind = 'variable';
            if (node.declaration.type === 'FunctionDeclaration') kind = 'function';
            if (node.declaration.type === 'ClassDeclaration') kind = 'class';

            const name = node.declaration.id?.name || '__default__';
            exports.push({ name, kind, default: true });
            traverse(node.declaration, scope);
        }

        /* ---------------- CLASSES ---------------- */
        if (node.type === 'ClassDeclaration') {
            const className = node.id?.name || 'anonymous';
            const methods = [];
            const properties = [];

            node.body.body.forEach(member => {
                // Class methods
                if (member.type === 'ClassMethod') {
                    const methodName = member.key.name || 'computed';
                    const calls = [...extractCalls(member.body)];

                    methods.push({ name: methodName, params: member.params.map(p => p.name || 'pattern'), calls });

                    functions.push({
                        id: `${filePath}::${className}.${methodName}`,
                        name: `${className}.${methodName}`,
                        scope: 'class',
                        params: member.params.map(p => p.name || 'pattern'),
                        calls
                    });
                }

                // Class property (arrow function)
                if (member.type === 'ClassProperty' && member.value?.type === 'ArrowFunctionExpression') {
                    const methodName = member.key.name || 'computed';
                    const calls = [...extractCalls(member.value.body)];

                    functions.push({
                        id: `${filePath}::${className}.${methodName}`,
                        name: `${className}.${methodName}`,
                        scope: 'class',
                        params: member.value.params.map(p => p.name || 'pattern'),
                        calls
                    });

                    properties.push({ name: methodName, type: 'function' });
                }

                // Regular class property
                if (member.type === 'ClassProperty') {
                    properties.push({
                        name: member.key.name || 'computed',
                        type: member.typeAnnotation?.typeAnnotation?.typeName?.name || 'unknown'
                    });
                }
            });

            classes.push({ name: className, methods, properties });

            // Recurse with class scope
            traverse(node.body, className);
            return;
        }

        /* ---------------- FUNCTIONS ---------------- */
        if (node.type === 'FunctionDeclaration') {
            const fnName = node.id?.name || 'anonymous';
            const calls = [...extractCalls(node.body)];

            functions.push({
                id: `${filePath}::${fnName}`,
                name: fnName,
                scope,
                params: node.params.map(p => p.name || 'pattern'),
                calls
            });

            // Recurse with function scope
            traverse(node.body, fnName);
            return;
        }

        /* ---------------- VARIABLES ---------------- */
        if (node.type === 'VariableDeclaration') {
            node.declarations.forEach(decl => {
                if (decl.id.type !== 'Identifier') return;
                const varName = decl.id.name;

                // Detect require() (CommonJS)
                if (decl.init?.type === 'CallExpression' && decl.init.callee.name === 'require') {
                    const source = decl.init.arguments[0].value;
                    imports.push({
                        source,
                        kind: source.startsWith('.') ? 'local' : 'external',
                        symbols: [varName]
                    });
                }

                // Detect normal variable type
                let valueType = 'unknown';
                if (decl.init) {
                    if (decl.init.type === 'NumericLiteral') valueType = 'number';
                    else if (decl.init.type === 'StringLiteral') valueType = 'string';
                    else if (decl.init.type === 'BooleanLiteral') valueType = 'boolean';
                }
                variables.push({ name: varName, kind: node.kind, valueType });

                // Arrow / function expressions
                if (decl.init && ['ArrowFunctionExpression', 'FunctionExpression'].includes(decl.init.type)) {
                    const calls = [...extractCalls(decl.init.body)];
                    functions.push({
                        id: `${filePath}::${varName}`,
                        name: varName,
                        scope,
                        params: decl.init.params.map(p => p.name || 'pattern'),
                        calls
                    });
                }
            });
        }

        // Recursively traverse nested nodes
        traverse(node.body, scope);
        traverse(node.declarations, scope);
        traverse(node.expression, scope);
        traverse(node.arguments, scope);
        traverse(node.callee, scope);
    };

    traverse(ast.body);

    return {
        file: { path: filePath, language, moduleType: "module", entryPoint: false },
        imports,
        entities: { variables, classes, functions, modules: [] },
        exports
    };
};

module.exports = { AST_NORMALIZER_PROMPT, normalizeAST };
