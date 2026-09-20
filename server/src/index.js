import connectPgSimple from 'connect-pg-simple';
import express from 'express';
import session from 'express-session';
import pool from './db/pool.js';
import { attachUser, authorize, requireLogin } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import evaluationsRouter from './routes/evaluations.js';
import parametersRouter from './routes/parameters.js';
import periodsRouter from './routes/periods.js';
import studentsRouter from './routes/students.js';

const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) {
  console.error(
    'SESSION_SECRET is missing or too short. Add a line like ' +
      'SESSION_SECRET=<64 random characters> to server/.env, then restart.'
  );
  process.exit(1);
}

const PgSession = connectPgSimple(session);
const app = express();
app.disable('x-powered-by');
app.use(express.json());

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
      secure: 'auto',
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);
app.use('/api', attachUser);

app.use('/api/auth', authRouter);
app.use('/api', requireLogin);

app.use(
  '/api/students',
  authorize({ GET: 'viewer', POST: 'staff', PATCH: 'staff', DELETE: 'admin' }),
  studentsRouter
);
app.use('/api/parameters', authorize({ GET: 'viewer', POST: 'admin', PATCH: 'admin' }));
app.use(
  '/api/parameter-changes',
  authorize({ GET: 'viewer', POST: 'admin', DELETE: 'admin' })
);
app.use('/api/periods', authorize({ GET: 'viewer' }));
app.use('/api/settings', authorize({ GET: 'viewer', PUT: 'admin' }));
app.use('/api/evaluations', authorize({ GET: 'viewer', PUT: 'staff' }));

app.use('/api', periodsRouter);
app.use('/api', parametersRouter);
app.use('/api', evaluationsRouter);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong on the server.' : err.message,
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});