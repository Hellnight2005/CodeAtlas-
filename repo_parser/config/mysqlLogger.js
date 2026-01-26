const mysql = require('mysql2');

// Create a connection pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'Log',
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0
});

module.exports = pool.promise();
