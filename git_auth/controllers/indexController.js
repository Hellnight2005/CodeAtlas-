exports.home = (req, res) => {
  req.log("info", "Home route accessed");

  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.send(`
      <h2>Welcome, ${req.user.username}!</h2>
      <a href="/logout">Logout</a>
    `);
  }

  return res.send(`<a href="/auth/github">Login with GitHub</a>`);
};

exports.profile = (req, res) => {
  req.log("info", "Profile route accessed");

  return res.json({
    username: req.user.username,
    id: req.user.id,
  });
};

exports.logout = (req, res, next) => {
  req.log("info", "User logout called");

  req.logout((err) => {
    if (err) {
      req.log("error", "Logout error");
      return next(err);
    }

    req.log("info", "User logged out successfully");

    res.redirect("/");
  });
};
