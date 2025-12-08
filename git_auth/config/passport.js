const passport = require("passport");
const GitHubStrategy = require("passport-github2").Strategy;
const logger = require("./logger");

module.exports = function setupPassport() {
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user));

  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.CALLBACK_URL,
      },
      (accessToken, refreshToken, profile, done) => {
        logger.info("GitHub OAuth successful", {
          user_id: profile.id,
          metadata: {},
        });
        return done(null, profile);
      }
    )
  );

  return passport;
};
