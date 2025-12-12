const axios = require('axios');
const User = require('../models/User');
require('dotenv').config();

const GITHUB_API_URL = 'https://api.github.com';
const logEvent = require('./logEvent');

/**
 * Helper to get axios instance with Auth
 */
const getClient = (token) => {
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Repo-Parser-Service'
    };
    // Prioritize passed token, fallback to Env
    const fToken = token || process.env.GITHUB_TOKEN;

    if (fToken) {
        headers['Authorization'] = `Bearer ${fToken}`;
    }
    return axios.create({
        baseURL: GITHUB_API_URL,
        headers
    });
};

/**
 * Fetch raw file content from GitHub
 * @param {string} owner 
 * @param {string} repo 
 * @param {string} path 
 * @param {string} [userId] - Optional User ID (githubId) to fetch token from MongoDB
 */
const fetchFileContent = async (owner, repo, path, userId) => {
    try {
        let token = null;

        // 1. Fetch Token from MongoDB if userId is provided
        if (userId) {
            try {
                // Using githubId as per your JSON schema
                const user = await User.findOne({ githubId: userId });

                if (user && user.githubAccessToken) {
                    token = user.githubAccessToken;
                    logEvent({
                        level: 'info',
                        message: `[MongoDB] Token found for user ${userId}`,
                        request_id: 'github-client'
                    });
                } else {
                    logEvent({
                        level: 'warn',
                        message: `[MongoDB] No token/user found for ID ${userId}`,
                        request_id: 'github-client'
                    });
                }
            } catch (dbError) {
                logEvent({
                    level: 'error',
                    message: `[MongoDB] Error looking up user: ${dbError.message}`,
                    request_id: 'github-client'
                });
            }
        }

        const client = getClient(token);

        // 2. Use the contents API to get base64 encoded content
        // GET /repos/{owner}/{repo}/contents/{path}
        const response = await client.get(`/repos/${owner}/${repo}/contents/${path}`);

        if (response.data.content) {
            // Return raw Base64 string as requested
            return response.data.content;
        }
        return null;

    } catch (error) {
        // Enhance error logging to see if it was a 404 or Auth error
        logEvent({
            level: 'error',
            message: `Error fetching ${owner}/${repo}/${path}: ${error.message}`,
            request_id: 'github-client'
        });
        throw error;
    }
};

module.exports = { fetchFileContent };