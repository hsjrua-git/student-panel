import { useEffect, useState } from 'react';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed with status ${res.status}`);
  return res.json();
}

function App() {
  const [health, setHealth] = useState(null);
  const [dbTime, setDbTime] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        setHealth(await getJson('/api/health'));
        setDbTime(await getJson('/api/db-check'));
      } catch (err) {
        setError(`${err.message}. Is the server running?`);
      }
    }
    load();
  }, []);

  if (error) return <p>{error}</p>;
  if (!health || !dbTime) return <p>Loading...</p>;

  return (
    <div>
      <h1>Student panel</h1>
      <p>Server says: {JSON.stringify(health)}</p>
      <p>Database time: {dbTime.server_time}</p>
    </div>
  );
}

export default App;