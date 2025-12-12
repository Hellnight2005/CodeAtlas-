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

    req.log("info", "OAuth metadata and access token stored in Redis");

    return res.redirect("/");
  } catch (err) {
    req.log("error", `OAuth callback error: ${err.message}`);
    return res.status(500).send("Internal Server Error");
  }
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
