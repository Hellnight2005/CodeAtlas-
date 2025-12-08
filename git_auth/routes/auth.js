const express = require("express");
const passport = require("passport");
const router = express.Router();
const logger = require("../config/logger");

// Login route
router.get(
  "/github",
  passport.authenticate("github", { scope: ["user:email"] })
);

// Callback route
router.get(
  "/github/callback",
  passport.authenticate("github", { failureRedirect: "/" }),
  (req, res) => {
    logger.info({ user: req.user.username }, "GitHub login successful");
    res.send(`Hello ${req.user.username}! <a href="/auth/logout">Logout</a>`);
  }
);

// Logout route
router.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      logger.error({ err }, "Error logging out user");
      return next(err);
    }
    res.redirect("/");
  });
});

module.exports = router;
