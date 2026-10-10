// Single-operator auth. There are no users, roles or permissions in this build:
// a session is either signed in or not. `attachUser` reflects the session's
// `authed` flag onto the request; `requireLogin` gates the API behind it.

export function attachUser(req, res, next) {
  req.authed = Boolean(req.session?.authed);
  next();
}

export function requireLogin(req, res, next) {
  if (!req.authed) {
    return res.status(401).json({ error: 'Please sign in.' });
  }
  next();
}
