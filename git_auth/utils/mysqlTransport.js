const Transport = require("winston-transport");
const db = require("../config/mysqlLogger");

class MySQLTransport extends Transport {
    constructor(opts) {
        super(opts);
    }

    log(info, callback) {
        setImmediate(() => {
            this.emit("logged", info);
        });

        const { timestamp, service_name, level, message, request_id, metadata } = info;

        // Ensure metadata is object
        const meta = metadata || {};

        const query = `
      INSERT INTO log (timestamp, service_name, level, message, request_id, ip, path, userAgent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

        const values = [
            timestamp,
            service_name,
            level,
            message,
            request_id || null,
            meta.ip || null,
            meta.path || null,
            meta.userAgent || null
        ];

        db.query(query, values)
            .then(() => callback())
            .catch((err) => {
                console.error("MySQL Log Error:", err);
                callback();
            });
    }
}

module.exports = MySQLTransport;
