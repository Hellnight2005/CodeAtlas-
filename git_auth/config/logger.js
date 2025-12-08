const fs = require("fs");
const path = require("path");
const winston = require("winston");

const SERVICE_NAME = process.env.SERVICE_NAME || "GitHub_Service";

const logDir = path.join(__dirname, "..", "public", "log", SERVICE_NAME);

// Ensure log folder exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for JSON logs
const customFormat = winston.format.printf(
  ({ level, message, timestamp, metadata }) => {
    const logEntry = {
      timestamp,
      service_name: SERVICE_NAME,
      level,
      message,
      request_id: metadata?.request_id || null,
      user_id: metadata?.user_id || null,
    };

    // Only include metadata if IP or path exists
    if (metadata?.ip || metadata?.path) {
      logEntry.metadata = {
        ip: metadata?.ip || null,
        path: metadata?.path || null,
      };
    }

    return JSON.stringify(logEntry);
  }
);

const logger = winston.createLogger({
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
  ],
});

// Console output for development
if (process.env.NODE_ENV !== "production") {
  logger.add(new winston.transports.Console());
}

module.exports = logger;
