const redisClient = require("../config/redisClient");
const generateRequestId = require("../utils/idGenerator");
const User = require("../models/User");

/* ----------------------------------------
 * Redirect to GitHub OAuth
 * -------------------------------------- */
exports.login = (req, res) => {
  req.log("info", "Redirecting user to GitHub OAuth");
  return res.redirect("/auth/github");
};

/* ----------------------------------------
 * GitHub OAuth Callback
 * -------------------------------------- */
exports.githubCallback = async (req, res) => {
  try {
    const requestId = req.request_id;
    const githubUser = req.user;

    if (!githubUser) {
      req.log("error", "GitHub user missing in OAuth callback");
      return res.status(400).send("No GitHub user data received");
    }

    const userData = {
      githubId: githubUser.id,
      username: githubUser.username,
      displayName: githubUser.displayName,
      profileUrl: githubUser.profileUrl,
      avatarUrl: githubUser.photos?.[0]?.value || null,
      githubAccessToken: githubUser.accessToken, // Store in DB
      repos: [],

      meta: {
        public_repos: githubUser._json.public_repos,
        followers: githubUser._json.followers,
        following: githubUser._json.following,
        created_at: githubUser._json.created_at,
        updated_at: githubUser._json.updated_at,
      },
    };

    const savedUser = await User.findOneAndUpdate(
      { githubId: githubUser.id },
      userData,
      { upsert: true, new: true }
    );

    req.log("info", `User saved/updated: ${savedUser.username}`);

    // Store OAuth metadata (request_id)
    await redisClient.set(requestId, JSON.stringify(req.metadata));

    // Store GitHub Access Token in Redis: user:github:token:<userId>
    // Setting expiry to matches cookie maxAge (24h)
    await redisClient.set(`user:github:token:${savedUser.githubId}`, githubUser.accessToken, {
      EX: 24 * 60 * 60
    });

    const { encrypt } = require('../utils/crypto');
    const encryptedToken = encrypt(githubUser.accessToken);

    // Set cookie: gh_token (encrypted)
    res.cookie('gh_token', encryptedToken, {
      httpOnly: true, // Secure: Frontend can't read directly? User said "so I can use"
      // If users wants to use it directly, maybe httpOnly: false?
      // "so ican use directly from there but in encrypt formated"
      // If they want to use it, they can read it. 
      // But usually cookies are for transport.
      // Let's assume httpOnly: false if they specifically want to "use" it (e.g. read it in JS to send elsewhere?)
      // Or if they mean the backend uses it. 
      // Safer default is true. If they complain, I'll switch. 
      // Wait, "use directly from there" suggests client access.
      httpOnly: false,
      secure: false, // localhost
      maxAge: 24 * 60 * 60 * 1000
    });

    req.log("info", "OAuth metadata and access token stored in Redis");

    return res.redirect("http://localhost:3001/dashboard");
  } catch (err) {
    req.log("error", `OAuth callback error: ${err.message}`);
    return res.status(500).send("Internal Server Error");
  }
};

/* ----------------------------------------
 * Get Current User (Session)
 * -------------------------------------- */
exports.getCurrentUser = (req, res) => {
  if (req.isAuthenticated() && req.user) {
    // Return sanitized user object
    return res.json({
      authenticated: true,
      user: {
        githubId: req.user.githubId,
        username: req.user.username,
        displayName: req.user.displayName || req.user.username,
        avatarUrl: req.user.avatarUrl,
        repos: req.user.repos || [],
        meta: req.user.meta,
        githubAccessToken: req.user.githubAccessToken // Expose token for frontend API calls
      }
    });
  }

  return res.json({ authenticated: false, user: null });
};

/* ----------------------------------------
 * Logout
 * -------------------------------------- */
exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) {
      req.log("error", `Logout error: ${err.message}`);
      return next(err);
    }

    req.log("info", "User logged out successfully");
    return res.redirect("/");
  });
};
