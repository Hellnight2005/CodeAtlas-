const logger = require("../config/logger");
const generateRequestId = require("../utils/idGenerator");

module.exports = (req, res, next) => {
  req.request_id = generateRequestId();
  req.user_id = req.user?.id || null;

  logger.info({
    timestamp: new Date().toISOString(),
    service_name: process.env.SERVICE_NAME || "auth-service",
    level: "info",
    message: "Incoming request",
    request_id: req.request_id,
    user_id: req.user_id,
    metadata: {
      ip: req.ip,
      path: req.originalUrl,
    },
  });

  next();
};
