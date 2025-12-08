const logger = require("../config/logger");
const redisClient = require("../config/redisClient");
const generateRequestId = require("../utils/idGenerator");

/* -------------------------------------------------------
 * Redirect user to GitHub OAuth
 * ----------------------------------------------------- */
exports.login = (req, res) => {
  res.redirect("/auth/github");
};

/* -------------------------------------------------------
 * GitHub OAuth callback
 * ----------------------------------------------------- */
exports.githubCallback = async (req, res) => {
  try {
    // Use existing request_id or generate a new one
    const requestId = req.request_id || generateRequestId();
    const ip = req.ip;
    const path = req.originalUrl;

    // Save login info to Redis
    await redisClient.set(
      requestId,
      JSON.stringify({
        ip,
        path,
        timestamp: new Date().toISOString(),
        user_id: null, // will update if user exists in MongoDB later
      })
    );

    // Optional: store request_id in session for later linking
    if (req.session) {
      req.session.oauth_request_id = requestId;
    }

    logger.info({
      message: "GitHub OAuth successful, data saved to Redis",
      request_id: requestId,
      metadata: { ip, path },
    });

    // Redirect to home/dashboard
    res.redirect("/");
  } catch (err) {
    const fallbackRequestId = req.request_id || generateRequestId();
    logger.error({
      message: "Error saving OAuth data to Redis",
      request_id: fallbackRequestId,
      metadata: { ip: req.ip, path: req.originalUrl },
      error: err,
    });

    res.status(500).send("Internal Server Error");
  }
};

/* -------------------------------------------------------
 * Logout user
 * ----------------------------------------------------- */
exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) {
      logger.error({
        message: "Logout error",
        request_id: req.request_id || generateRequestId(),
        user_id: req?.user?.id || null,
        metadata: { ip: req.ip, path: req.originalUrl },
        error: err,
      });
      return next(err);
    }

    logger.info({
      message: "User logged out successfully",
      request_id: req.request_id || generateRequestId(),
      user_id: req?.user?.id || null,
      metadata: { ip: req.ip, path: req.originalUrl },
    });

    res.redirect("/");
  });
};
