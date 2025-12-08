const express = require("express");
const session = require("express-session");
require("dotenv").config();

const logger = require("./config/logger");
const setupPassport = require("./config/passport");

// Middleware
const requestLogger = require("./middleware/requestLogger");
const ensureAuthenticated = require("./middleware/auth");

// Routes
const authRoutes = require("./routes/auth");
const indexRoutes = require("./routes/index");

const app = express();

/* -------------------------------------------------------
 * Logging Middleware (request logger)
 * ----------------------------------------------------- */
app.use(requestLogger);

/* -------------------------------------------------------
 * Session Setup
 * ----------------------------------------------------- */
app.use(
  session({
    secret: process.env.SESSION_SECRET || "default_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

/* -------------------------------------------------------
 * Passport Setup
 * ----------------------------------------------------- */
const passport = setupPassport();
app.use(passport.initialize());
app.use(passport.session());

/* -------------------------------------------------------
 * Authentication Middleware
 * ----------------------------------------------------- */
// Example usage: protect profile route
// app.use("/profile", ensureAuthenticated);

/* -------------------------------------------------------
 * Routes
 * ----------------------------------------------------- */
app.use("/", indexRoutes); // Home and profile routes
app.use("/auth", authRoutes); // GitHub OAuth routes

/* -------------------------------------------------------
 * Error handling (optional)
 * ----------------------------------------------------- */
app.use((err, req, res, next) => {
  logger.error({
    message: "Unhandled error",
    request_id: req.request_id,
    metadata: { ip: req.ip, path: req.originalUrl },
    error: err,
  });
  res.status(500).send("Internal Server Error");
});

/* -------------------------------------------------------
 * Export App
 * ----------------------------------------------------- */
module.exports = app;
