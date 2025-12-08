const logger = require("../config/logger");

exports.home = (req, res) => {
  // Log the request in production structure
  logger.info({
    timestamp: new Date().toISOString(),
    service_name: process.env.SERVICE_NAME || "auth-service",
    level: "info",
    message: "Home route accessed",
    request_id: req.request_id,
    user_id: req.user?.id || null,
    metadata: {
      ip: req.ip,
      path: req.originalUrl,
    },
  });

  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.send(`
      <h2>Welcome, ${req.user.username}!</h2>
      <a href="/logout">Logout</a>
    `);
  }

  return res.send(`<a href="/auth/github">Login with GitHub</a>`);
};

exports.profile = (req, res) => {
  logger.info({
    timestamp: new Date().toISOString(),
    service_name: process.env.SERVICE_NAME || "auth-service",
    level: "info",
    message: "Profile route accessed",
    request_id: req.request_id,
    user_id: req.user?.id || null,
    metadata: {
      ip: req.ip,
      path: req.originalUrl,
    },
  });

  return res.json({
    username: req.user.username,
    id: req.user.id,
  });
};

exports.logout = (req, res, next) => {
  logger.info({
    timestamp: new Date().toISOString(),
    service_name: process.env.SERVICE_NAME || "auth-service",
    level: "info",
    message: "User logout",
    request_id: req.request_id,
    user_id: req.user?.id || null,
    metadata: {
      ip: req.ip,
      path: req.originalUrl,
    },
  });

  req.logout(function (err) {
    if (err) {
      logger.error({
        timestamp: new Date().toISOString(),
        service_name: process.env.SERVICE_NAME || "auth-service",
        level: "error",
        message: "Logout error",
        request_id: req.request_id,
        user_id: req.user?.id || null,
        metadata: {
          ip: req.ip,
          path: req.originalUrl,
        },
        error: err,
      });
      return next(err);
    }

    res.redirect("/");
  });
};
