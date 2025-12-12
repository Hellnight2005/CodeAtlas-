const mongoose = require("mongoose");

const RepoSchema = new mongoose.Schema({
  repo_id: { type: Number },
  repo_name: { type: String },
  repo_url: { type: String },
  isPrivate: { type: Boolean },
  description: { type: String },
  language: { type: String }, // primary language
  languages: [String], // multiple languages
  forks_count: { type: Number },
  stargazers_count: { type: Number },
  contributions: { type: Number, default: 0 },
  isUpdated: { type: Boolean, default: true }, // whether repo data is up-to-date
  lastCommit: { type: Date }, // last commit date
});

const UserSchema = new mongoose.Schema(
  {
    githubId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    displayName: { type: String },
    profileUrl: { type: String },
    avatarUrl: { type: String },
    githubAccessToken: { type: String }, // Stored for API access
    repos: [RepoSchema],
    meta: {
      public_repos: Number,
      followers: Number,
      following: Number,
      created_at: Date,
      updated_at: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
