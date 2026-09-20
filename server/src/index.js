import express from 'express';
import pool from './db/pool.js';

const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => {
   res.json({ ok: true });
});

app.get('/api/db-check', async (req, res) => {
   const result = await pool.query('SELECT now() AS server_time');
   res.json(result.rows[0]);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
   console.log(`Server running at http://localhost:${port}`);
});