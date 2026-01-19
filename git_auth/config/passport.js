const passport = require("passport");
const GitHubStrategy = require("passport-github2").Strategy;
const logger = require("./logger");

const User = require("../models/User");

module.exports = function setupPassport() {
  passport.serializeUser((user, done) => {
    // user is either the GitHub profile (from Strategy) or a Mongoose User
    // Both should have 'id' (GitHub profile.id or User.githubId if we normalize)
    // Profile.id is the GitHub ID. User.githubId is the GitHub ID.
    // Let's use logic to safely extract the GitHub ID.
    const githubId = user.githubId || user.id;
    done(null, githubId);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findOne({ githubId: id });
      done(null, user);
    } catch (err) {
      console.error("Passport Deserialize Error:", err);
      done(err, null);
    }
  });

  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.CALLBACK_URL,
      },
      (accessToken, refreshToken, profile, done) => {
        // console.log("🔥 Passport GitHub Profile:", profile);
        logger.info("GitHub OAuth successful", {
          user_id: profile.id,
          metadata: {},
        });
        // Attach accessToken to profile for controller usage
        profile.accessToken = accessToken;
        return done(null, profile);
      }
    )
  );

  return passport;
};
