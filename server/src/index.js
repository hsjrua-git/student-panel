import connectPgSimple from 'connect-pg-simple';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pool, { ready } from './db/pool.js';
import { attachUser, requireLogin } from './middleware/auth.js';
import { auditRequests } from './middleware/audit.js';
import { createCsrf } from './middleware/csrf.js';
import auditRouter from './routes/audit.js';
import authRouter from './routes/auth.js';
import dashboardRouter from './routes/dashboard.js';
import evaluationsRouter from './routes/evaluations.js';
import exportRouter from './routes/export.js';
import fieldDefinitionsRouter from './routes/fieldDefinitions.js';
import groupsRouter from './routes/groups.js';
import parametersRouter from './routes/parameters.js';
import periodsRouter from './routes/periods.js';
import preferencesRouter from './routes/preferences.js';
import resultsRouter from './routes/results.js';
import savedViewsRouter from './routes/savedViews.js';
import settingsRouter from './routes/settings.js';
import studentsRouter from './routes/students.js';
import tasksRouter from './routes/tasks.js';

const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) {
  console.error(
    'SESSION_SECRET is missing or too short. Add a line like ' +
      'SESSION_SECRET=<64 random characters> to server/.env, then restart.'
  );
  process.exit(1);
}

// Whether the session cookie carries the Secure flag. 'auto' (default) is right
// behind a TLS-terminating proxy; force true once always on HTTPS, or false for
// a deliberately HTTP-only box.
function readCookieSecure() {
  const raw = (process.env.SESSION_COOKIE_SECURE ?? 'auto').trim().toLowerCase();
  if (raw === 'auto' || raw === '') return 'auto';
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  console.error(`SESSION_COOKIE_SECURE must be 'auto', 'true' or 'false' (got "${raw}").`);
  process.exit(1);
}
const cookieSecure = readCookieSecure();

// CSRF Origin check: OFF in development (the Vite dev server is a different
// origin and proxies /api here). Default 'auto' = on only in production.
function readCheckOrigin() {
  const raw = (process.env.CSRF_CHECK_ORIGIN ?? 'auto').trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return process.env.NODE_ENV === 'production';
}
const enforceCsrfOrigin = readCheckOrigin();

function readTrustProxy() {
  const raw = (process.env.TRUST_PROXY ?? '').trim();
  const lower = raw.toLowerCase();
  if (lower === '' || lower === 'false' || lower === '0') return false;
  if (lower === 'true') return true;
  const hops = Number(raw);
  if (Number.isInteger(hops) && hops >= 0) return hops;
  return raw;
}

const PgSession = connectPgSimple(session);
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', readTrustProxy());

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// In production the built client (client/dist) is served by this same process.
const clientDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../client/dist'
);
const serveClient = fs.existsSync(path.join(clientDist, 'index.html'));
if (serveClient) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use(
  session({
    store: new PgSession({ pool, tableName: 'user_sessions' }),
    name: 'sid',
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure,
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);
app.use('/api', attachUser);

const csrf = createCsrf({ secure: cookieSecure, enforceOrigin: enforceCsrfOrigin });
app.use('/api', csrf.issue);
app.use('/api', csrf.checkOrigin);
app.use('/api', auditRequests);

// Auth (login/logout/setup/me/change-password) is reachable without a session.
app.use('/api/auth', authRouter);

// Everything else requires a signed-in session and a valid CSRF token on writes.
// There are no roles or permissions in this single-operator build.
app.use('/api', requireLogin);
app.use('/api', csrf.verifyToken);

app.use('/api/students', studentsRouter);
app.use('/api/field-definitions', fieldDefinitionsRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/parameters', parametersRouter);
app.use('/api/periods', periodsRouter);
app.use('/api/evaluations', evaluationsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/results', resultsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/export', exportRouter);
app.use('/api/preferences', preferencesRouter);
app.use('/api/saved-views', savedViewsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/audit', auditRouter);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Non-API GETs are client-side routes: hand back the SPA shell.
if (serveClient) {
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong on the server.' : err.message,
  });
});

const port = process.env.PORT || 3000;
// Single-user on-device build: bind to localhost by default. Set HOST=0.0.0.0 to
// expose it on the LAN.
const host = process.env.HOST || '127.0.0.1';

// Make sure the embedded database is initialised before we accept requests.
await ready();
app.listen(port, host, () => {
  const shown = host === '0.0.0.0' ? 'this machine on your network' : host;
  console.log(`Server running on port ${port} (${shown})`);
});
