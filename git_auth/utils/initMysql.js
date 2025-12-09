const mysql = require('mysql2/promise');

async function initMysql() {
    try {
        // Connect without database selected first
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: 'root'
        });

        console.log("Connected to MySQL server");

        // Create Database
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`Log\``);
        console.log("Database 'Log' checked/created");

        // Use Database
        await connection.query(`USE \`Log\``);

        // Drop Table to apply new schema
        await connection.query(`DROP TABLE IF EXISTS log`);
        console.log("Old table dropped (if existed)");

        // Create Table
        const createTableQuery = `
      CREATE TABLE IF NOT EXISTS log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        timestamp VARCHAR(50),
        service_name VARCHAR(100),
        level VARCHAR(20),
        message TEXT,
        request_id VARCHAR(100),
        ip VARCHAR(45),
        path TEXT,
        userAgent TEXT
      )
    `;

        await connection.query(createTableQuery);
        console.log("Table 'log' checked/created");

        await connection.end();
        console.log("Initialization complete");
        process.exit(0);

    } catch (err) {
        console.error("MySQL Initialization Error:", err);
        process.exit(1);
    }
}

initMysql();
