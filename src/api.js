const base = '/api';

async function json(path, init) {
  const res = await fetch(base + path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

const postJson = (path, body) => json(path, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body || {})
});

export const api = {
  list: () => json('/lamps'),
  state: (id) => json(`/lamps/${id}/state`),
  switch: (id, on) => postJson(`/lamps/${id}/switch`, { on }),
  brightness: (id, value) => postJson(`/lamps/${id}/brightness`, { value }),
  blink: (id, intervalMs) => postJson(`/lamps/${id}/blink`, { intervalMs }),
  flicker: (id) => postJson(`/lamps/${id}/flicker`),
  stop: (id) => postJson(`/lamps/${id}/stop`)
};
