import express from 'express';
import pool from './db/pool.js';
import studentsRouter from './routes/students.js';
import periodsRouter from './routes/periods.js';
import parametersRouter from './routes/parameters.js';
import evaluationsRouter from './routes/evaluations.js';

const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/db-check', async (req, res) => {
  const result = await pool.query('SELECT now() AS server_time');
  res.json(result.rows[0]);
});

app.use('/api/students', studentsRouter);
app.use('/api', periodsRouter);
app.use('/api', parametersRouter);
app.use('/api', evaluationsRouter);

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