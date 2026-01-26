const mongoose = require("mongoose");

// Simplified Repo Schema for embedding
const RepoSchema = new mongoose.Schema({
    repo_id: { type: Number },
    repo_name: { type: String },
    repo_url: { type: String },
    isPrivate: { type: Boolean },
    description: { type: String },
    language: { type: String },
    languages: [String],
    forks_count: { type: Number },
    stargazers_count: { type: Number },
    contributions: { type: Number, default: 0 },
    isUpdated: { type: Boolean, default: true },
    lastCommit: { type: Date },
    isAst: { type: Boolean, default: false }, // whether AST is generated
    astGeneratedAt: { type: Date }, // AST generation date
    isexport_graph: { type: Boolean, default: false },
    isexport_graph_created_at: { type: Date }
});

const UserSchema = new mongoose.Schema(
    {
        githubId: { type: String, required: true, unique: true },
        username: { type: String, required: true },
        displayName: { type: String },
        profileUrl: { type: String },
        avatarUrl: { type: String },
        githubAccessToken: { type: String }, // Target field
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
