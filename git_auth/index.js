const express = require("express");
const passport = require("passport");
const GitHubStrategy = require("passport-github2").Strategy;
const cookieSession = require("cookie-session");
const client = require("prom-client");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const logger = require("./logger");

const app = express();

// ------------------- Prometheus Setup -------------------
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Metrics endpoint
app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    logger.error({ err }, "Failed to get metrics");
    res.status(500).end();
  }
});

// ------------------- Logging Middleware -------------------
app.use((req, res, next) => {
  logger.info({ method: req.method, url: req.url }, "Incoming request");
  next();
});

// ------------------- Session Setup -------------------
app.use(
  cookieSession({
    name: "github-auth-session",
    keys: [process.env.SESSION_SECRET || "default_secret"],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  })
);

// ------------------- Passport Setup -------------------
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.CALLBACK_URL,
    },
    function (accessToken, refreshToken, profile, done) {
      logger.info({ username: profile.username }, "GitHub OAuth successful");
      return done(null, profile);
    }
  )
);

// ------------------- Authentication Middleware -------------------
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.redirect("/auth/github");
};

// ------------------- Routes -------------------
app.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    res.send(
      `<h2>Welcome, ${req.user.username}!</h2><a href="/logout">Logout</a>`
    );
  } else {
    res.send('<a href="/auth/github">Login with GitHub</a>');
  }
});

app.get("/profile", ensureAuthenticated, (req, res) => {
  res.json({ username: req.user.username, id: req.user.id });
});

// Logout route
app.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/");
  });
});

app.use("/auth", authRoutes);

// ------------------- Start Server -------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`GitHub Auth Service running on port ${PORT}`);
  console.log(`GitHub Auth Service running on port ${PORT}`);
});
