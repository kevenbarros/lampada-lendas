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
      <QuartoAutomation />
      <div className="grid">
        {lamps.map(lamp => (
          <LampCard key={lamp.id} lamp={lamp} onChange={refresh} />
        ))}
      </div>
      {lamps.length === 0 && !error && <p>Carregando...</p>}
    </div>
  );
}

function QuartoAutomation() {
  const [running, setRunning] = useState(false);

  const start = async () => {
    setRunning(true);
    try {
      await api.quartoPiscar();
      setTimeout(() => setRunning(false), 5200);
    } catch (err) {
      alert(err.message);
      setRunning(false);
    }
  };

  return (
    <div className="card automation">
      <div className="card-header">
        <h2>Automação Quarto (entrada + saída)</h2>
      </div>
      <p>Pisca por 5s (entrada 100ms / saída 200ms), depois liga em branco com brilho mínimo.</p>
      <div className="row">
        <button disabled={running} onClick={start}>
          {running ? 'Executando...' : 'Iniciar piscar 5s'}
        </button>
      </div>
    </div>
  );
}

function LampCard({ lamp, onChange }) {
  const [busy, setBusy] = useState(false);
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
        {lamp.connected && (
          <span className={`status ${lamp.on ? 'ok' : 'bad'}`}>
            {lamp.on === null ? '...' : lamp.on ? 'ligada' : 'desligada'}
          </span>
        )}
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
