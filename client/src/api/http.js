export async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new Error('Cannot reach the server. Is it running?');
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // the answer had no JSON body
  }

  if (!response.ok) {
    throw new Error(
      data?.error ??
        `Request failed (status ${response.status}). If this keeps happening, check that the server is running.`
    );
  }
  return data;
}