const app = require("./app");
const logger = require("./config/logger");
const connectDB = require("./config/db");

/* -------------------------------------------------------
 * Database Connection
 * ----------------------------------------------------- */
connectDB();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info("Service started", {
    metadata: { path: "/", ip: "server" },
  });

  logger.info(`GitHub Auth Service running on port ${PORT}`);
  logger.info("Service Ready for Integration");
});
