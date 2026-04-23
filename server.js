import express from 'express';
import TuyAPI from 'tuyapi';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3030;

const configPath = join(__dirname, 'devices.json');
if (!existsSync(configPath)) {
  console.error('\nArquivo devices.json não encontrado.');
  console.error('Copie devices.example.json para devices.json e preencha com os dados das lâmpadas.\n');
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, 'utf-8'));

const devices = {};

async function connect(meta) {
  const device = new TuyAPI({
    id: meta.id,
    key: meta.key,
    ip: meta.ip,
    version: meta.version || '3.3',
    issueRefreshOnConnect: true
  });

  device.on('disconnected', () => {
    console.log(`[${meta.name}] desconectada, tentando reconectar...`);
    setTimeout(() => {
      device.find().then(() => device.connect()).catch(() => {});
    }, 2000);
  });

  device.on('error', (err) => {
    console.error(`[${meta.name}] erro:`, err.message);
  });

  await device.find();
  await device.connect();
  console.log(`[${meta.name}] conectada`);
  return device;
}

for (const meta of config.devices) {
  try {
    const device = await connect(meta);
    devices[meta.id] = { device, meta, effect: null };
  } catch (err) {
    console.error(`Falha ao conectar ${meta.name}:`, err.message);
    devices[meta.id] = { device: null, meta, effect: null };
  }
}

function stopEffect(entry) {
  if (!entry.effect) return;
  if (entry.effect.handle) clearInterval(entry.effect.handle);
  if (entry.effect.stop) entry.effect.stop();
  entry.effect = null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const app = express();
app.use(express.json());

app.get('/api/lamps', (req, res) => {
  res.json(Object.values(devices).map(({ meta, device, effect }) => ({
    id: meta.id,
    name: meta.name,
    connected: device?.isConnected?.() || false,
    effect: effect?.type || null
  })));
});

app.get('/api/lamps/:id/state', async (req, res) => {
  const entry = devices[req.params.id];
  if (!entry?.device) return res.status(404).json({ error: 'lâmpada não conectada' });
  try {
    const dps = await entry.device.get({ schema: true });
    res.json(dps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/lamps/:id/switch', async (req, res) => {
  const entry = devices[req.params.id];
  if (!entry?.device) return res.status(404).json({ error: 'lâmpada não conectada' });
  stopEffect(entry);
  try {
    await entry.device.set({ dps: entry.meta.switchDp || 20, set: !!req.body.on });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/lamps/:id/brightness', async (req, res) => {
  const entry = devices[req.params.id];
  if (!entry?.device) return res.status(404).json({ error: 'lâmpada não conectada' });
  stopEffect(entry);
  try {
    const value = Math.max(10, Math.min(1000, Number(req.body.value)));
    await entry.device.set({ dps: entry.meta.brightnessDp || 22, set: value });
    res.json({ ok: true, value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/lamps/:id/blink', (req, res) => {
  const entry = devices[req.params.id];
  if (!entry?.device) return res.status(404).json({ error: 'lâmpada não conectada' });
  stopEffect(entry);
  const intervalMs = Math.max(100, Math.min(5000, Number(req.body.intervalMs) || 500));
  const dp = entry.meta.switchDp || 20;
  let state = false;
  const handle = setInterval(() => {
    state = !state;
    entry.device.set({ dps: dp, set: state }).catch(() => {});
  }, intervalMs);
  entry.effect = { type: 'blink', handle };
  res.json({ ok: true, intervalMs });
});

app.post('/api/lamps/:id/flicker', (req, res) => {
  const entry = devices[req.params.id];
  if (!entry?.device) return res.status(404).json({ error: 'lâmpada não conectada' });
  stopEffect(entry);
  const dp = entry.meta.switchDp || 20;
  const brightDp = entry.meta.brightnessDp || 22;
  let alive = true;

  const loop = async () => {
    while (alive) {
      const burst = 3 + Math.floor(Math.random() * 6);
      for (let i = 0; i < burst && alive; i++) {
        const on = Math.random() > 0.3;
        const brightness = 10 + Math.floor(Math.random() * 990);
        try {
          await entry.device.set({ multiple: true, data: { [dp]: on, [brightDp]: brightness } });
        } catch {}
        await sleep(30 + Math.floor(Math.random() * 180));
      }
      if (alive) {
        try {
          await entry.device.set({ multiple: true, data: { [dp]: true, [brightDp]: 1000 } });
        } catch {}
        await sleep(1500 + Math.floor(Math.random() * 3500));
      }
    }
  };

  entry.effect = { type: 'flicker', stop: () => { alive = false; } };
  loop();
  res.json({ ok: true });
});

app.post('/api/lamps/:id/stop', (req, res) => {
  const entry = devices[req.params.id];
  if (!entry) return res.status(404).json({ error: 'lâmpada desconhecida' });
  stopEffect(entry);
  res.json({ ok: true });
});

const server = app.listen(PORT, () => {
  console.log(`API escutando em http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPorta ${PORT} já está em uso por outro processo.`);
    console.error(`Rode com outra porta: PORT=3040 npm run dev:api\n`);
  } else {
    console.error('Erro no servidor:', err);
  }
  process.exit(1);
});
