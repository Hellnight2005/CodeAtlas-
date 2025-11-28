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
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
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
    keys: [process.env.SESSION_SECRET],
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

// ------------------- Routes -------------------
app.get("/", (req, res) => {
  res.send('<a href="/auth/github">Login with GitHub</a>');
});

app.use("/auth", authRoutes);

// ------------------- Start Server -------------------
app.listen(process.env.PORT, () => {
  logger.info(`GitHub Auth Service running on port ${process.env.PORT}`);
  console.log(`GitHub Auth Service running on port ${process.env.PORT}`);
});
