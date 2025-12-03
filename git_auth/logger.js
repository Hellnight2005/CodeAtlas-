const pino = require("pino");

const transport = pino.transport({
  target: "pino-loki",
  options: {
    batching: true,
    interval: 5000, // interval in milliseconds
    host: process.env.LOKI_URL || "http://localhost:3100",
    labels: { service: "github-auth-service" },
    level: process.env.LOG_LEVEL || "info", // default log level
  },
});

const logger = pino(transport);

module.exports = logger;
