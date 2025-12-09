const logger = require("../config/logger");

/**
 * Utility to forward logs to Winston
 * @param {Object} param0
 * @param {string} param0.level - Log level (info, warn, error)
 * @param {string} param0.message - Log message
 * @param {string} param0.request_id - Request ID
 * @param {Object} param0.metadata - Metadata object
 */
const logEvent = ({ level, message, request_id, metadata }) => {
  logger.log({
    level,
    message,
    request_id,
    ...metadata,
  });
};

module.exports = logEvent;
