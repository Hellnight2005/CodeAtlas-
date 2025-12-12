const logEvent = require("../utils/logEvent");
const generateRequestId = require("../utils/idGenerator");

module.exports = (req, res, next) => {
    // 1. Generate unique Request ID
    req.request_id = generateRequestId();

    // 2. Generate Metadata (Middleware only)
    req.metadata = {
        ip:
            req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
            req.socket?.remoteAddress ||
            req.ip ||
            null, // Ensure null if undefined/missing
        path: req.originalUrl || null,
        userAgent: req.headers["user-agent"] || null,
    };

    // 3. Attach Helper
    req.log = (level, message) => {
        logEvent({
            level,
            message,
            request_id: req.request_id,
            metadata: req.metadata,
        });
    };

    // 4. Auto-log incoming request
    req.log("info", "Incoming request");

    next();
};
