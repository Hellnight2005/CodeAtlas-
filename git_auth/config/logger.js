const fs = require("fs");
const path = require("path");
const winston = require("winston");

const SERVICE_NAME = process.env.SERVICE_NAME || "GitHub_Service";

// Log directory: /public/log/{SERVICE_NAME}/
const logDir = path.join(__dirname, "..", "public", "log", SERVICE_NAME);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Format logs as strict JSON
const customFormat = winston.format.printf(
  ({ level, message, timestamp, metadata: meta }) => {
    // Ensure metadata is an object or empty
    const m = meta || {};

    const logEntry = {
      timestamp,
      service_name: SERVICE_NAME,
      level,
      message,
      request_id: m.request_id || null, // Extract request_id from metadata if passed there, or root
      metadata: {
        ip: m.ip || null,
        path: m.path || null,
        userAgent: m.userAgent || null,
      },
    };

    return JSON.stringify(logEntry);
  }
);

const MySQLTransport = require("../utils/mysqlTransport");

module.exports = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.metadata({ fillExcept: ["timestamp", "level", "message"] }),
    customFormat
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: path.join(logDir, "warn.log"),
      level: "warn",
    }),
    new winston.transports.File({
      filename: path.join(logDir, "info.log"),
      level: "info",
    }),
    new MySQLTransport({
      level: "info",
    }),
  ],
});
