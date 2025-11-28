const pino = require("pino");

const transport = pino.transport({
  target: "pino-loki",
  options: {
    batching: true,
    interval: 5,
    host: process.env.LOKI_URL || "http://localhost:3100",
    labels: { service: "github-auth-service" },
  },
});

const logger = pino(transport);

module.exports = logger;
