const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger'); // Structured Logger

const NEO4J_BASE_URL = 'http://localhost:7474/db';
const NEO4J_AUTH = 'Basic ' + Buffer.from('neo4j:password').toString('base64');
const IMPORT_DB_TARGET = 'neo4j'; // Always use default neo4j DB to avoid Community Edition limits

// ... (resolveImportPath remains same)

// Create database if it doesn't exist (Deprecated for now/unused but keeping safe)
const createDatabase = async (dbName) => {
    try {
        await axios.post(
            `${NEO4J_BASE_URL}/system/tx/commit`,
            { statements: [{ statement: `CREATE DATABASE ${dbName} IF NOT EXISTS` }] },
            { headers: { Authorization: NEO4J_AUTH, 'Content-Type': 'application/json' } }
        );
        logger.info(`[IMPORT] Database '${dbName}' ensured.`);
    } catch (error) {
        const msg = error.response?.data?.errors?.[0]?.message || error.message;
        logger.warn(`[IMPORT] Warning creating database '${dbName}': ${msg}`);
    }
};

// Batch POST to Neo4j
const postToNeo4j = async (dbName, statements) => {
    if (!statements.length) return;
    try {
        await axios.post(
            `${NEO4J_BASE_URL}/${dbName}/tx/commit`,
            { statements },
            { headers: { Authorization: NEO4J_AUTH, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        logger.error(`[NEO4J ERROR on ${dbName}]`, { error: error.response?.data?.errors || error.message });
    }
};

// ... (importCodebaseGraph remains same, just ensure it uses postToNeo4j implicitly)

// Entry point
const importRepoGraphToNeo4j = async (repoName) => {
    if (!repoName) {
        logger.error('[IMPORT] Repo name required.');
        return;
    }

    const dbName = IMPORT_DB_TARGET;
    logger.info(`[IMPORT] Starting import for repo: ${repoName} into DB: ${dbName}`);

    const dataPath = path.join(__dirname, `../public/${repoName}.json`);
    if (!fs.existsSync(dataPath)) {
        logger.error(`[IMPORT] No data file found at ${dataPath}`);
        return;
    }

    try {
        const codebase = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        await importCodebaseGraph(codebase, dbName, repoName);
        logger.info(`[IMPORT] Successfully imported ${repoName} to Neo4j.`);
    } catch (err) {
        logger.error(`[IMPORT] Failed to parse or import data for ${repoName}: ${err.message}`);
    }
};

// ... CLI block ...

// Delete repository graph from Neo4j
const deleteRepoGraphFromNeo4j = async (repoName) => {
    if (!repoName) return;
    const dbName = IMPORT_DB_TARGET;
    logger.info(`[DELETE] Deleting graph for ${repoName} from Neo4j...`);

    // DEBUG: Check what Repositories exist
    try {
        const checkResp = await axios.post(
            `${NEO4J_BASE_URL}/${dbName}/tx/commit`,
            { statements: [{ statement: 'MATCH (r:Repository) RETURN r.name as name' }] },
            { headers: { Authorization: NEO4J_AUTH, 'Content-Type': 'application/json' } }
        );
        const existingRepos = checkResp.data.results[0].data.map(row => row.row[0]);
        // logger.debug(`[DELETE] Existing Repositories: ${JSON.stringify(existingRepos)}`); // Optional

        if (!existingRepos.includes(repoName)) {
            logger.warn(`[DELETE] WARNING: "${repoName}" not found in existing repositories! (Case sensitivity?)`);
        }
    } catch (e) {
        logger.warn(`[DELETE] Failed to list existing repos: ${e.message}`);
    }

    const queries = [
        // 1. Delete Dependencies (Methods, Exports, Variables declared by Files of this Repo)
        {
            statement: `
                MATCH (r:Repository {name: $repoName})-[:CONTAINS]->(f:File)
                OPTIONAL MATCH (f)-[:DECLARES]->(d)
                OPTIONAL MATCH (d)-[:HAS_METHOD]->(m)
                OPTIONAL MATCH (f)-[:EXPORTS]->(e)
                DETACH DELETE d, m, e
            `,
            parameters: { repoName }
        },
        // 2. Delete Files
        {
            statement: `
                MATCH (r:Repository {name: $repoName})-[:CONTAINS]->(f:File)
                DETACH DELETE f
            `,
            parameters: { repoName }
        },
        // 3. Delete Repository
        {
            statement: `
                MATCH (r:Repository {name: $repoName})
                DETACH DELETE r
            `,
            parameters: { repoName }
        }
    ];

    try {
        const response = await axios.post(
            `${NEO4J_BASE_URL}/${dbName}/tx/commit`,
            {
                statements: queries.map(q => ({ ...q, resultDataContents: ["row", "graph", "stats"] }))
            },
            { headers: { Authorization: NEO4J_AUTH, 'Content-Type': 'application/json' } }
        );

        const results = response.data.results || [];
        results.forEach((res, idx) => {
            const deleted = res.stats?.nodes_deleted || 0;
            const relsDeleted = res.stats?.relationships_deleted || 0;
            if (deleted > 0 || relsDeleted > 0) {
                logger.info(`[DELETE] Step ${idx + 1}: Deleted ${deleted} nodes, ${relsDeleted} relationships.`);
            }
        });

        logger.info(`[DELETE] Finished deletion sequence for ${repoName}.`);

    } catch (error) {
        logger.error(`[DELETE] Error: ${error.message}`);
        if (error.response) {
            logger.error('[DELETE] Neo4j Response:', { details: error.response.data });
        }
    }
};

// Import codebase graph
const importCodebaseGraph = async (codebase, dbName, repoName) => {
    if (!codebase || !codebase.length) return;

    // 1️⃣ Create repository node
    await postToNeo4j(dbName, [{
        statement: 'MERGE (r:Repository {name: $repoName})',
        parameters: { repoName }
    }]);

    // First pass: create all nodes
    for (const json of codebase) {
        const { file = {}, imports = [], exports = [], entities = {} } = json;
        const { functions = [], classes = [], variables = [] } = entities;
        const filePath = file.path || json.filePath;
        if (!filePath) continue;

        const statements = [];

        // File node
        statements.push({
            statement: 'MERGE (f:File {path: $filePath})',
            parameters: { filePath }
        });

        // Variables
        for (const v of variables) {
            statements.push({
                statement: 'MERGE (var:Variable {name: $name})',
                parameters: { name: v.name }
            });
        }

        // Classes
        for (const cls of classes) {
            statements.push({
                statement: 'MERGE (c:Class {name: $name})',
                parameters: { name: cls.name }
            });
        }

        // Functions
        for (const fn of functions) {
            if (!fn.name) continue;
            const fnId = fn.id || `${filePath}::${fn.name}`;
            statements.push({
                statement: 'MERGE (fn:Function {id: $id}) SET fn.name = $name',
                parameters: { id: fnId, name: fn.name }
            });
        }

        // Exports
        for (const exp of exports) {
            statements.push({
                statement: 'MERGE (e:Export {name: $name, kind: $kind})',
                parameters: { name: exp.name, kind: exp.kind || 'unknown' }
            });
        }

        // Imports (create module/file nodes)
        for (const imp of imports) {
            const moduleName = imp.source;
            if (!moduleName) continue;
            const resolved = resolveImportPath(filePath, moduleName);
            const isLocal = resolved.startsWith('.') || resolved.includes('/');
            statements.push({
                statement: isLocal
                    ? 'MERGE (imp:File {path: $module})'
                    : 'MERGE (m:Module {name: $module})',
                parameters: { module: resolved }
            });
        }

        await postToNeo4j(dbName, statements);
    }

    // Second pass: create relationships
    for (const json of codebase) {
        const { file = {}, imports = [], exports = [], entities = {} } = json;
        const { functions = [], classes = [], variables = [] } = entities;
        const filePath = file.path || json.filePath;
        if (!filePath) continue;

        const statements = [];

        // Repository -> File
        statements.push({
            statement: `
                MATCH (r:Repository {name: $repoName})
                MATCH (f:File {path: $filePath})
                MERGE (r)-[:CONTAINS]->(f)
            `,
            parameters: { repoName, filePath }
        });

        // File -> Variables
        for (const v of variables) {
            statements.push({
                statement: `
                    MATCH (f:File {path: $filePath})
                    MATCH (var:Variable {name: $varName})
                    MERGE (f)-[:DECLARES]->(var)
                `,
                parameters: { filePath, varName: v.name }
            });
        }

        // File -> Classes
        for (const cls of classes) {
            statements.push({
                statement: `
                    MATCH (f:File {path: $filePath})
                    MATCH (c:Class {name: $className})
                    MERGE (f)-[:DECLARES]->(c)
                `,
                parameters: { filePath, className: cls.name }
            });

            // Class methods as functions
            if (cls.methods) {
                for (const method of cls.methods) {
                    const methodId = `${filePath}::${cls.name}.${method.name}`;
                    statements.push({
                        statement: `
                            MATCH (c:Class {name: $className})
                            MATCH (m:Function {id: $methodId})
                            MERGE (c)-[:HAS_METHOD]->(m)
                        `,
                        parameters: { className: cls.name, methodId }
                    });

                    // Method calls
                    for (const called of method.calls || []) {
                        statements.push({
                            statement: `
                                MERGE (callee:Function {name: $calleeName})
                                WITH callee
                                MATCH (caller:Function {id: $callerId})
                                MERGE (caller)-[:CALLS]->(callee)
                            `,
                            parameters: { callerId: methodId, calleeName: called }
                        });
                    }
                }
            }
        }

        // File -> Functions
        for (const fn of functions) {
            if (!fn.name) continue;
            const fnId = fn.id || `${filePath}::${fn.name}`;
            statements.push({
                statement: `
                    MATCH (f:File {path: $filePath})
                    MATCH (fn:Function {id: $fnId})
                    MERGE (f)-[:DECLARES]->(fn)
                `,
                parameters: { filePath, fnId }
            });

            // Function calls
            for (const called of fn.calls || []) {
                statements.push({
                    statement: `
                        MERGE (callee:Function {name: $calleeName})
                        WITH callee
                        MATCH (caller:Function {id: $callerId})
                        MERGE (caller)-[:CALLS]->(callee)
                    `,
                    parameters: { callerId: fnId, calleeName: called }
                });
            }
        }

        // File -> Exports
        for (const exp of exports) {
            statements.push({
                statement: `
                    MATCH (f:File {path: $filePath})
                    MATCH (e:Export {name: $name})
                    MERGE (f)-[:EXPORTS]->(e)
                `,
                parameters: { filePath, name: exp.name }
            });
        }

        // File -> Imports
        for (const imp of imports) {
            const moduleName = imp.source;
            if (!moduleName) continue;
            const resolved = resolveImportPath(filePath, moduleName);
            const isLocal = resolved.startsWith('.') || resolved.includes('/');
            statements.push({
                statement: isLocal
                    ? `
                        MATCH (f:File {path: $filePath})
                        MATCH (imp:File {path: $module})
                        MERGE (f)-[:IMPORTS]->(imp)
                      `
                    : `
                        MATCH (f:File {path: $filePath})
                        MATCH (m:Module {name: $module})
                        MERGE (f)-[:IMPORTS]->(m)
                      `,
                parameters: { filePath, module: resolved }
            });
        }

        await postToNeo4j(dbName, statements);
    }

    console.log('✅ All files and relationships imported to Neo4j knowledge graph!');
};

// Entry point
// End of file
module.exports = { importRepoGraphToNeo4j, deleteRepoGraphFromNeo4j, importCodebaseGraph };
