/**
 * Middleware to attach User ID to keys/headers from Session
 * satisfying "intern it add the header part"
 */
module.exports = (req, res, next) => {
    if (req.user && req.user.id) {
        // req.user.id in Passport is usually the unique ID (githubId in our strategy/serialization)
        // Let's ensure we map it to x-user-id string
        req.headers['x-user-id'] = String(req.user.id);

        // Also log it for debugging
        if (req.log) {
            req.log('info', `Automatically attached x-user-id: ${req.user.id} from session`);
        }
    }
    next();
};
