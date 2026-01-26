const mysql = require('mysql2/promise');
require('dotenv').config();

const baseConfig = {
    host: 'localhost',
    user: 'root',
    password: 'root',
    waitForConnections: true,
    connectionLimit: 40,
    queueLimit: 0,
    database: 'repo' // Main Database Name
};

const pool = mysql.createPool(baseConfig);

module.exports = pool;
