const mysql = require('mysql2/promise');
const logger = require('./logger');

// Base Config (minus database)
const baseConfig = {
    host: 'localhost',
    user: 'root',
    password: 'root',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Main Database Name
const MAIN_DB_NAME = 'repo';

/**
 * Connect to MySQL, ensure 'repo' DB exists, and return connection pool to it.
 */
const getMainDBConnection = async () => {
    try {
        // 1. Connect to MySQL Root (to check/create DB)
        const rootConnection = await mysql.createConnection({
            host: baseConfig.host,
            user: baseConfig.user,
            password: baseConfig.password
        });

        // 2. Create 'repo' Database if Not Exists
        await rootConnection.query(`CREATE DATABASE IF NOT EXISTS \`${MAIN_DB_NAME}\``);
        await rootConnection.end();

        // 3. Return Pool connected to 'repo' DB
        return mysql.createPool({
            ...baseConfig,
            database: MAIN_DB_NAME
        });
    } catch (error) {
        logger.error(`MySQL Main DB Connection Error: ${error.message}`);
        throw error;
    }
};

module.exports = { getMainDBConnection };
