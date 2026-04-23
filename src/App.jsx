import { useEffect, useState } from 'react';
import { api } from './api.js';

export default function App() {
  const [lamps, setLamps] = useState([]);
  const [error, setError] = useState(null);

  const refresh = async () => {
    try {
      const data = await api.list();
      setLamps(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="app">
      <h1>Minhas lâmpadas</h1>
      {error && <div className="error">Erro: {error}</div>}
      <div className="grid">
        {lamps.map(lamp => (
          <LampCard key={lamp.id} lamp={lamp} onChange={refresh} />
        ))}
      </div>
      {lamps.length === 0 && !error && <p>Carregando...</p>}
    </div>
  );
}

function LampCard({ lamp, onChange }) {
  const [busy, setBusy] = useState(false);
  const [brightness, setBrightness] = useState(500);
  const [blinkMs, setBlinkMs] = useState(500);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (err) { alert(err.message); }
    setBusy(false);
    onChange();
  };

  return (
    <div className={`card ${lamp.connected ? 'online' : 'offline'}`}>
      <div className="card-header">
        <h2>{lamp.name}</h2>
        <span className={`status ${lamp.connected ? 'ok' : 'bad'}`}>
          {lamp.connected ? 'conectada' : 'desconectada'}
        </span>
      </div>

      {lamp.effect && <div className="effect-badge">efeito ativo: {lamp.effect}</div>}

      <div className="row">
        <button disabled={busy} onClick={() => run(() => api.switch(lamp.id, true))}>
          Ligar
        </button>
        <button disabled={busy} onClick={() => run(() => api.switch(lamp.id, false))}>
          Desligar
        </button>
      </div>

      <div className="slider-row">
        <label>Brilho: <strong>{brightness}</strong></label>
        <input
          type="range" min="10" max="1000" value={brightness}
          onChange={e => setBrightness(Number(e.target.value))}
          onMouseUp={() => run(() => api.brightness(lamp.id, brightness))}
          onTouchEnd={() => run(() => api.brightness(lamp.id, brightness))}
        />
      </div>

      <div className="slider-row">
        <label>Intervalo do blink (ms):</label>
        <input
          type="number" min="100" max="5000" step="50"
          value={blinkMs}
          onChange={e => setBlinkMs(Number(e.target.value))}
        />
      </div>

      <div className="row">
        <button disabled={busy} onClick={() => run(() => api.blink(lamp.id, blinkMs))}>
          Piscar
        </button>
        <button disabled={busy} onClick={() => run(() => api.flicker(lamp.id))}>
          Falhando (flicker)
        </button>
        <button disabled={busy} onClick={() => run(() => api.stop(lamp.id))}>
          Parar efeito
        </button>
      </div>
    </div>
  );
}
