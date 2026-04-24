import express from 'express';
import TuyAPI from 'tuyapi';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5858;

const configPath = join(__dirname, 'devices.json');
if (!existsSync(configPath)) {
  console.error('\nArquivo devices.json não encontrado.');
  console.error('Copie devices.example.json para devices.json e preencha com os dados das lâmpadas.\n');
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, 'utf-8'));

const devices = {};

function setupDevice(meta) {
  const entry = { device: null, meta, effect: null, reconnecting: false, backoff: 2000, on: null };
  devices[meta.id] = entry;

  const device = new TuyAPI({
    id: meta.id,
    key: meta.key,
    ip: meta.ip,
    version: meta.version || '3.3',
    issueRefreshOnConnect: true
  });
  entry.device = device;

  const switchDp = meta.switchDp || 20;
  const updateOn = (dps) => {
    if (dps && Object.prototype.hasOwnProperty.call(dps, switchDp)) {
      entry.on = !!dps[switchDp];
    }
  };
  device.on('data', (data) => updateOn(data?.dps));
  device.on('dp-refresh', (data) => updateOn(data?.dps));

  const tryConnect = async () => {
    if (entry.reconnecting) return;
    entry.reconnecting = true;
    try {
      await device.find({ timeout: 5 });
      await device.connect();
      entry.backoff = 2000;
      console.log(`[${meta.name}] conectada`);
    } catch (err) {
      console.error(`[${meta.name}] falha ao conectar (${err.message}), retry em ${entry.backoff}ms`);
      setTimeout(() => { entry.reconnecting = false; tryConnect(); }, entry.backoff);
      entry.backoff = Math.min(entry.backoff * 2, 60000);
      return;
    } finally {
      entry.reconnecting = false;
    }
  };

  device.on('disconnected', () => {
    console.log(`[${meta.name}] desconectada, reconectando...`);
    setTimeout(tryConnect, 1000);
  });

  device.on('error', (err) => {
    console.error(`[${meta.name}] erro:`, err.message);
  });

  tryConnect();
}

for (const meta of config.devices) {
  setupDevice(meta);
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
  res.json(Object.values(devices).map(({ meta, device, effect, on }) => ({
    id: meta.id,
    name: meta.name,
    connected: device?.isConnected?.() || false,
    on,
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
  const switchDp = entry.meta.switchDp || 20;
  const modeDp = entry.meta.modeDp || 21;
  const brightDp = entry.meta.brightnessDp || 22;
  const tempDp = entry.meta.tempDp || 23;
  try {
    if (req.body.on) {
      await entry.device.set({
        multiple: true,
        data: {
          [switchDp]: true,
          [modeDp]: 'white',
          [tempDp]: 0,
          [brightDp]: 1
        }
      });
    } else {
      await entry.device.set({ dps: switchDp, set: false });
    }
    res.json({ ok: true });
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

function hexToTuyaColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  const H = Math.round(h);
  const S = Math.round(s * 1000);
  const V = Math.round(v * 1000);
  return H.toString(16).padStart(4, '0') + S.toString(16).padStart(4, '0') + V.toString(16).padStart(4, '0');
}

const findByName = (name) => Object.values(devices).find(e => e.meta.name === name);

app.post('/api/automation/quarto-piscar', async (req, res) => {
  const entrada = findByName('Quarto entrada');
  const saida = findByName('Quarto saida');
  if (!entrada?.device || !saida?.device) {
    return res.status(400).json({ error: 'Quarto entrada ou Quarto saida não conectada' });
  }

  stopEffect(entrada);
  stopEffect(saida);

  const startBlink = (entry, intervalMs) => {
    const dp = entry.meta.switchDp || 20;
    let state = false;
    let alive = true;
    const loop = async () => {
      while (alive) {
        state = !state;
        try {
          await entry.device.set({ dps: dp, set: state });
        } catch {}
        if (!alive) return;
        await sleep(intervalMs);
      }
    };
    entry.effect = { type: 'blink', stop: () => { alive = false; } };
    loop();
  };

  startBlink(entrada, 100);
  startBlink(saida, 200);

  setTimeout(async () => {
    stopEffect(entrada);
    stopEffect(saida);
    await sleep(600);

    const applyWhite = async (entry) => {
      const switchDp = entry.meta.switchDp || 20;
      const modeDp = entry.meta.modeDp || 21;
      const brightDp = entry.meta.brightnessDp || 22;
      const tempDp = entry.meta.tempDp || 23;
      try {
        await entry.device.set({
          multiple: true,
          data: {
            [switchDp]: true,
            [modeDp]: 'white',
            [tempDp]: 0,
            [brightDp]: 1
          }
        });
      } catch (err) {
        console.error(`[${entry.meta.name}] erro ao aplicar branco:`, err.message);
      }
    };

    const ensureOnConfirmed = async (entry, attempts = 6) => {
      const switchDp = entry.meta.switchDp || 20;
      for (let i = 0; i < attempts; i++) {
        if (entry.on === true) return true;
        try { await entry.device.set({ dps: switchDp, set: true }); } catch {}
        const start = Date.now();
        while (Date.now() - start < 700) {
          if (entry.on === true) return true;
          await sleep(80);
        }
      }
      console.error(`[${entry.meta.name}] não confirmou ON após ${attempts} tentativas`);
      return false;
    };

    await Promise.all([applyWhite(entrada), applyWhite(saida)]);
    await sleep(300);
    await Promise.all([ensureOnConfirmed(entrada), ensureOnConfirmed(saida)]);
  }, 5000);

  res.json({ ok: true, durationMs: 5000 });
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
