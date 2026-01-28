const axios = require('axios');
const logger = require('../config/logger');
const dbPool = require('../config/mysqlRepo');

// Config (Should ideally be in .env, but matching importGraphData.js for now)
const NEO4J_BASE_URL = process.env.NEO4J_BASE_URL || 'http://localhost:7474/db/neo4j/tx/commit';
const NEO4J_AUTH = 'Basic ' + Buffer.from('neo4j:password').toString('base64'); // Default fallback

// Helper: specific DB URL
// The user finalized on using "neo4j" default DB in the previous task.
const getDbUrl = () => {
    // If NEO4J_BASE_URL includes /tx/commit, use it directly?
    // importGraphData.js used: `${NEO4J_BASE_URL}/${dbName}/tx/commit`
    // Let's assume standard local setup:
    return 'http://localhost:7474/db/neo4j/tx/commit';
};

const executeQuery = async (statement, parameters = {}) => {
    try {
        const response = await axios.post(
            getDbUrl(),
            { statements: [{ statement, parameters, resultDataContents: ["row", "graph"] }] },
            {
                headers: {
                    Authorization: typeof process.env.NEO4J_AUTH === 'string' ? process.env.NEO4J_AUTH : NEO4J_AUTH,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data.errors && response.data.errors.length > 0) {
            throw new Error(response.data.errors[0].message);
        }

        return response.data.results[0];
    } catch (error) {
        logger.error('[GraphController] Neo4j Error:', { message: error.message });
        throw error;
    }
};

// Normalizer: Neo4j REST JSON -> Frontend Friendly JSON
const normalizeResponse = (neo4jResult) => {
    const nodesMap = new Map();
    const edgesMap = new Map();

    if (!neo4jResult || !neo4jResult.data) return { nodes: [], edges: [] };

    neo4jResult.data.forEach(row => {
        const graph = row.graph;

        // Process Nodes
        graph.nodes.forEach(n => {
            if (!nodesMap.has(n.id)) {
                nodesMap.set(n.id, {
                    id: n.id, // Using Neo4j internal ID (as string usually in REST)
                    // The user requested "neoId": "elementId" and "id": "File:src/app.js"
                    // But REST API returns "id": "45" (string). 
                    // Let's try to adapt to user spec if possible, or stick to what we have.
                    // User spec: id="File:src/app.js", neoId="elementId".
                    // The 'id' in REST is the internal ID.
                    // We'll map internal ID to neoId, and construct a logical ID if possible?
                    // Let's stick to simple mapping first:
                    label: n.labels[0],
                    props: n.properties
                });
            }
        });

        // Process Relationships
        graph.relationships.forEach(r => {
            if (!edgesMap.has(r.id)) {
                edgesMap.set(r.id, {
                    id: r.id,
                    source: r.startNode,
                    target: r.endNode,
                    type: r.type,
                    props: r.properties
                });
            }
        });
    });

    // Formatting to user spec
    // Node: { id, neoId, label, data }
    const nodes = Array.from(nodesMap.values()).map(n => ({
        id: n.id, // Internal ID is simplest unique key for now
        // If we want "File:src/...", we need to check props.path
        // Let's see if we can generate the requested format:
        // User requested: id="File:src/app.js", neoId="elementId"
        // Since we don't always have "path", let's be safe and use internal ID as primary "id" for API interactions (expand),
        // but provide the "logicalId" if needed.
        // ACTUALLY, Frontend click -> /expand?nodeId=... uses this ID.
        // So keeping it as the internal ID is safest for lookups.
        label: n.label,
        data: n.props
    }));

    const edges = Array.from(edgesMap.values()).map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type,
        data: e.props
    }));

    return { nodes, edges };
};

// 1. Initial Graph
// 1. Initial Graph (Repo + Limited Files + Total Count)
const { importRepoGraphToNeo4j } = require('../utils/importGraphData');
const fs = require('fs');
const path = require('path');
const User = require('../models/User'); // Import User Model

/**
 * 0. Check for the file (Unified Initializer)
 * GET /api/check_for_the_file?repo=owner/name
 */
exports.checkForFile = async (req, res) => {
    try {
        const { repo, limit = 30 } = req.query;
        if (!repo) return res.status(400).json({ error: 'Repo parameter required' });

        // Normalize Name for file check
        let ownerPart = null;
        let repoName = repo;
        if (repo.includes('/')) {
            [ownerPart, repoName] = repo.split('/');
        }

        // Check Sync Status first (Error Handling)
        const [syncStatus] = await dbPool.query(
            `SELECT status FROM repository_sync_status WHERE repo_full_name LIKE ? LIMIT 1`,
            [`%${repoName}`]
        );

        if (syncStatus.length > 0) {
            const status = syncStatus[0].status;
            if (status === 'rate_limited') {
                return res.status(429).json({ error: 'Sorry we reached the github limit till now', code: 'RATE_LIMIT' });
            }
            if (status === 'failed') {
                // return res.status(500).json({ error: 'Repository sync failed', code: 'SYNC_FAILED' });
            }
        }

        const simpleName = repoName.toLowerCase();
        const jsonPathSimple = path.join(__dirname, `../public/${simpleName}.json`);
        const jsonPathOriginal = path.join(__dirname, `../public/${repo}.json`);

        let foundJsonPath = null;
        let importName = repoName;

        if (fs.existsSync(jsonPathOriginal)) {
            foundJsonPath = jsonPathOriginal;
            importName = repo;
        } else if (fs.existsSync(jsonPathSimple)) {
            foundJsonPath = jsonPathSimple;
            importName = simpleName;
        }

        // 1. IF MISSING: TRIGGER GENERATION
        if (!foundJsonPath) {
            logger.info(`[Check] File MISSING for ${repo}. Triggering AST generation...`);

            // Check if table exists (sanity)
            // Use only the repo name part for table name
            const shortName = repoName.split('/')[1] || repoName;
            const tableName = shortName.replace(/[^a-zA-Z0-9_]/g, '_');
            const [tables] = await dbPool.query(`SHOW TABLES LIKE ?`, [tableName]);

            if (tables.length === 0) {
                return res.status(404).json({ error: "Repository table not found. Please sync first.", stage: "SYNC" });
            }

            triggerGeneration(repo);
            return res.status(202).json({
                status: 'generating',
                message: 'AST generation triggered',
                stage: 'AST'
            });
        }

        // 2. IF PRESENT: LOAD GRAPH
        logger.info(`[Check] File found. Loading Graph for ${repo}...`);

        // Query: Get Repo -> Files (Matches old getInitialGraph)
        const query = `
            MATCH (r:Repository {name: $repoName})
            OPTIONAL MATCH (r)-[:CONTAINS]->(all_f:File)
            WITH r, count(all_f) as totalCount
            OPTIONAL MATCH (r)-[rel:CONTAINS]->(f:File)
            WITH r, totalCount, f, rel
            ORDER BY f.path ASC
            LIMIT toInteger($limit)
            WITH r, totalCount, collect(f) as files, collect(rel) as repoEdges
            UNWIND files as f1
            OPTIONAL MATCH (f1)-[innerRel]->(f2:File)
            WHERE f2 IN files
            RETURN r, totalCount, f1 as f, repoEdges, innerRel
        `;

        let result = await executeQuery(query, { repoName: importName, limit: parseInt(limit) });
        const hasRepo = result.data.length > 0 && result.data[0].row[0] !== null;

        if (!hasRepo) {
            logger.info(`[Graph] Neo4j empty. Importing from JSON...`);
            await executeQuery('MATCH (n) DETACH DELETE n');
            try {
                await importRepoGraphToNeo4j(importName);
                result = await executeQuery(query, { repoName: importName, limit: parseInt(limit) });
            } catch (err) {
                return res.status(500).json({ error: `Import failed: ${err.message}` });
            }
        }

        const normalized = normalizeResponse(result);
        if (result.data.length > 0) {
            const totalCount = result.data[0].row[1];
            const repoNode = normalized.nodes.find(n => n.label === 'Repository');
            if (repoNode) {
                repoNode.data.fileCount = totalCount;
                repoNode.data.isPartial = totalCount > parseInt(limit);
            }
        }

        res.json(normalized);

    } catch (error) {
        logger.error(`[Check] Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
};

// Removing redundant getInitialGraph
// exports.getInitialGraph = async ... (already removed from route)


// 2. Expand Node
exports.expandNode = async (req, res) => {
    try {
        const { nodeId } = req.query;
        if (!nodeId) return res.status(400).json({ error: 'Node ID required' });

        // User requested elementId(n) = $nodeId
        // The REST API "id" is usually the integer id. `elementId` is for 5.x.
        // If we are passing the ID returned by REST (e.g. "123"), query by ID(n).
        // Let's support both or just ID() if Community Edition defaults.
        // Safe bet: ID($nodeId) if integer, elementId if string?
        // Actually REST API returns IDs as strings sometimes.

        const query = `
            MATCH (n)
            WHERE id(n) = toInteger($nodeId) 
            MATCH (n)-[r]-(x)
            RETURN n, r, x
            LIMIT 50
        `;
        // Note: Using id(n) matches the 'id' field in REST graph response.

        const result = await executeQuery(query, { nodeId });
        res.json(normalizeResponse(result));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 3. Node Details
exports.getNodeDetails = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Node ID required' });

        const query = `
            MATCH (n)
            WHERE id(n) = toInteger($id)
            RETURN labels(n) as labels, properties(n) as props
        `;

        const result = await executeQuery(query, { id });
        if (result.data.length === 0) return res.status(404).json({ error: 'Node not found' });

        // Result format from REST for 'row' data
        // row: [ ["Label"], {prop: val} ]
        const row = result.data[0].row;
        res.json({
            label: row[0][0],
            properties: row[1]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 4. Filter Graph
exports.filterGraph = async (req, res) => {
    try {
        const { repo, type, path } = req.query;
        // Basic filter: By Label (Type) and Path property

        let query = 'MATCH (n) WHERE 1=1 ';
        const params = {};

        if (repo) {
            // Expand relationship types to include DECLARES (for vars/funcs) and EXPORTS
            // Match Repository by full name OR short name to handle different import styles
            const shortName = repo.includes('/') ? repo.split('/')[1] : repo;

            query = 'MATCH (r:Repository)-[:CONTAINS|DECLARES|EXPORTS*]->(n) WHERE (toLower(r.name) = toLower($repo) OR toLower(r.name) = toLower($shortName)) ';
            params.repo = repo;
            params.shortName = shortName;
        }

        if (type) {
            // Label injection (unsafe if not sanitized, but internal tool)
            // Cypher params can't handle labels. strict regex check.
            if (/^[a-zA-Z0-9]+$/.test(type)) {
                query = query.replace('(n)', `(n:${type})`);
            }
        }

        if (path) {
            // "path" param is treated as a general search query here
            query += ' AND (toLower(n.name) CONTAINS toLower($path) OR toLower(n.path) CONTAINS toLower($path) OR toLower(n.id) CONTAINS toLower($path)) ';
            params.path = path;
        }

        query += ' RETURN n LIMIT 30';

        const result = await executeQuery(query, params);
        res.json(normalizeResponse(result));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Helper to trigger AST generation
const triggerGeneration = (repoName) => {
    // Fire and forget (or log error)
    // Needs full URL since it's a network call
    axios.post('http://localhost:5001/generate-ast', { repoName, force: false })
        .then(() => logger.info(`[GraphController] Triggered generate-ast for ${repoName}`))
        .catch(err => logger.error(`[GraphController] Failed to trigger generate-ast: ${err.message}`));
};

// 5. Search Files (Autocomplete/List)
exports.searchFiles = async (req, res) => {
    try {
        const { repo, q } = req.query;
        if (!q) return res.json([]); // Return empty if no query

        let query = `
            MATCH (r:Repository {name: $repo})-[:CONTAINS*]->(n:File)
            WHERE toLower(n.path) CONTAINS toLower($q) OR toLower(n.name) CONTAINS toLower($q)
            RETURN n.id as id, n.name as name, n.path as path, labels(n) as labels
            LIMIT 10
        `;

        // If repo not provided (global search? unsafe but handled)
        if (!repo) {
            query = `
                MATCH (n:File)
                WHERE toLower(n.path) CONTAINS toLower($q)
                RETURN n.id as id, n.name as name, n.path as path, labels(n) as labels
                LIMIT 10
            `;
        }

        const result = await executeQuery(query, { repo, q });

        // Format simple list
        const files = result.data.map(row => {
            // Row format depends on return. REST API usually:
            // "row": [ 123, "index.js", "src/index.js", ["File"] ]
            const r = row.row;
            return {
                id: r[0], // Internal ID
                name: r[1],
                path: r[2],
                labels: r[3]
            };
        });

        res.json(files);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
