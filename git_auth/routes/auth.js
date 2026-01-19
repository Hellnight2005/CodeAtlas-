const express = require("express");
const passport = require("passport");
const router = express.Router();
const authController = require("../controllers/authController");

// Route → Redirects to GitHub
router.get(
  "/github",
  passport.authenticate("github", { scope: ["user:email"] })
);

// GitHub OAuth callback → calls controller AFTER passport success
router.get(
  "/github/callback",
  passport.authenticate("github", { failureRedirect: "/" }),
  authController.githubCallback
);

// Get Current User
router.get("/me", authController.getCurrentUser);

// Logout
router.get("/logout", authController.logout);

module.exports = router;
