# Guia de configuração — 3 lâmpadas no local definitivo

Este guia assume que o projeto já está clonado/criado e que você já tem conta em [iot.tuya.com](https://iot.tuya.com) com um **Cloud Project** criado (Access ID + Access Secret em mãos).

Se a lâmpada de teste antiga ainda está no `devices.json`, ela está **obsoleta** — o localKey só vale enquanto a lâmpada estiver pareada na mesma conta e rede. Vamos regenerar tudo.

---

## 1. Parear as 3 lâmpadas no Smart Life

No local definitivo, com o Wi-Fi da casa ligado (precisa ser **2.4 GHz** — Tuya não funciona em 5 GHz):

1. Abre o app **Smart Life** (mesmo que você usou antes).
2. Se as lâmpadas novas ainda não apareceram na lista, apaga qualquer lâmpada antiga que sobrou: segura o dedo sobre ela → **Remove Device**.
3. Pra cada lâmpada nova:
   - Rosqueia na tomada/soquete e liga a energia.
   - A lâmpada deve começar a **piscar rápido** automaticamente (modo pareamento). Se não piscar: liga/desliga 3x com intervalo de 2s até ela piscar.
   - No Smart Life: toca o **+** no canto superior direito → **Add Device** → ela deve ser detectada automaticamente, ou escolhe **Lighting → Light Source (Wi-Fi)** e segue o fluxo.
   - Escolhe a rede Wi-Fi 2.4 GHz e coloca a senha.
   - Dá um **nome único** pra cada uma (ex: `Sala`, `Quarto`, `Cozinha`). Isso ajuda a identificar no JSON depois.

Ao final, você deve ter **3 lâmpadas listadas** no Smart Life, todas online.

---

## 2. Sincronizar as lâmpadas com o projeto Tuya

As lâmpadas novas **não vão aparecer automaticamente** no projeto Tuya — precisa forçar a sincronização.

1. Entra em [iot.tuya.com](https://iot.tuya.com) → teu **Cloud Project**.
2. Aba **Devices → Link Tuya App Account**.
3. Vai aparecer tua conta Smart Life já listada. Clica no botão **Unlink** do lado, confirma.
4. Clica em **Add App Account** → aparece um QR code novo.
5. No Smart Life: aba **Me** (canto inferior direito) → ícone de **scan** no topo → escaneia o QR → escolhe **Automatic Link**.
6. Volta em **Devices → All Devices** no painel Tuya. As 3 lâmpadas devem aparecer agora.

> Se aparecer só 1 ou 2, espera uns 2 minutos e aperta **F5**. Se continuar faltando, repete o passo 3-5.

---

## 3. Extrair os localKeys das 3 lâmpadas

Num terminal na pasta do projeto:

```bash
npx @tuyapi/cli wizard
```

Ele vai perguntar:

| Pergunta | Resposta |
|---|---|
| API key | cola o **Access ID** |
| API secret | cola o **Access Secret** |
| Virtual ID of device | o `deviceId` de **qualquer uma** das 3 lâmpadas (pega na aba Devices → coluna ID do painel Tuya) |
| Schema/App | `smartlife` |
| Region | `us` (Western America) |

A saída é um **JSON com as 3 lâmpadas de uma vez**:

```json
[
  { "name": "Sala",    "id": "bf...", "key": "..." },
  { "name": "Quarto",  "id": "bf...", "key": "..." },
  { "name": "Cozinha", "id": "bf...", "key": "..." }
]
```

Salva esse output — é o que vai pro `devices.json`.

---

## 4. Descobrir os IPs locais (opcional mas recomendado)

O backend auto-descobre as lâmpadas por broadcast, mas setar IP fixo é mais estável.

**Método rápido** (PowerShell):
```powershell
arp -a | findstr /i "dynamic"
```

Ou entra no admin do roteador (geralmente `192.168.1.1` ou `192.168.0.1`) e olha a **lista de clientes DHCP**. Procura por nomes como `ESP_XXXXXX` ou MAC começando com o OUI da Espressif.

**Dica:** reserva IP fixo pra cada lâmpada no roteador (DHCP reservation) — elas nunca mais mudam de IP.

Se não conseguir descobrir agora, **tudo bem**: omite o campo `ip` no JSON e o tuyapi acha sozinho.

---

## 5. Preencher `devices.json`

Na raiz do projeto, sobrescreve o arquivo `devices.json`:

```json
{
  "devices": [
    {
      "id": "COLE_O_ID_DA_LAMPADA_1",
      "key": "COLE_O_KEY_DA_LAMPADA_1",
      "ip": "192.168.1.101",
      "version": "3.3",
      "name": "Sala",
      "switchDp": 20,
      "brightnessDp": 22
    },
    {
      "id": "COLE_O_ID_DA_LAMPADA_2",
      "key": "COLE_O_KEY_DA_LAMPADA_2",
      "ip": "192.168.1.102",
      "version": "3.3",
      "name": "Quarto",
      "switchDp": 20,
      "brightnessDp": 22
    },
    {
      "id": "COLE_O_ID_DA_LAMPADA_3",
      "key": "COLE_O_KEY_DA_LAMPADA_3",
      "ip": "192.168.1.103",
      "version": "3.3",
      "name": "Cozinha",
      "switchDp": 20,
      "brightnessDp": 22
    }
  ]
}
```

**Observações:**
- Se não souber o IP, deleta a linha `"ip": "..."` inteira (inclusive a vírgula do fim).
- Lâmpadas mais novas (2022+) podem usar `"version": "3.4"` ou `"3.5"`. Se conectar errar com as chaves certas, tenta trocar.
- `switchDp: 20` e `brightnessDp: 22` são o padrão Tuya para lâmpadas brancas com dimmer. Se comando não funcionar, veja a seção de troubleshooting.

---

## 6. Rodar o projeto

```bash
npm install   # só na primeira vez, se ainda não rodou
npm run dev
```

Espera ver no terminal:

```
[api] [Sala] conectada
[api] [Quarto] conectada
[api] [Cozinha] conectada
[api] API escutando em http://localhost:3030
[web]   ➜  Local:   http://localhost:5173/
```

Abre [http://localhost:5173](http://localhost:5173). Deve aparecer 3 cards, cada um com controles de liga/desliga, brilho, piscar e flicker.

---

## 7. Troubleshooting

### Alguma lâmpada aparece como "desconectada"

1. Confere que ela está ligada na tomada e pareada no Smart Life (abre o app, ela deve estar controlável por lá).
2. Tenta setar o IP manual no `devices.json` (descobre via `arp -a`).
3. Confere que sua máquina e a lâmpada estão na **mesma sub-rede** (mesmo roteador, sem VLAN separada).
4. Firewall do Windows pode bloquear UDP broadcast — libera o Node quando perguntar.

### Conecta mas "Ligar" não faz nada

O DP pode ser diferente de 20. Pra descobrir os DPs reais da lâmpada:

```bash
curl http://localhost:3030/api/lamps/<id-da-lampada>/state
```

Vai voltar algo como `{"dps":{"20":true,"22":500,"21":"white","23":1000}}`. Identifica qual é o boolean on/off e qual é o número grande de brilho, ajusta `switchDp` e `brightnessDp` no JSON.

### Porta 3030 ocupada

Roda com outra porta:
```bash
PORT=3040 npm run dev:api
```
(e ajusta a porta no `vite.config.js` também, no campo `proxy`).

### "Erro: Not Found" no browser

Limpa service workers antigos: F12 → **Application** → **Service Workers** → **Unregister**. Ou testa em janela anônima.

### Lâmpada desconecta depois de alguns minutos

Firmware Tuya às vezes enjoa de conexões persistentes. O `server.js` já faz auto-reconnect, mas se ficar instável:
- Diminui o intervalo de flicker (aumenta `sleep` mínimo em `server.js` — procura por `sleep(30 + ...)` e troca para `sleep(80 + ...)`).
- Usa IP fixo no `devices.json` em vez de auto-descoberta.

---

## 8. Checklist final

- [ ] 3 lâmpadas pareadas e online no Smart Life
- [ ] 3 lâmpadas visíveis na aba Devices do Tuya Cloud
- [ ] `npx @tuyapi/cli wizard` retornou JSON com 3 entradas
- [ ] `devices.json` tem as 3 lâmpadas com `id`, `key` e `name` corretos
- [ ] `npm run dev` loga `conectada` pras 3
- [ ] Os 3 cards aparecem no browser em localhost:5173
- [ ] Liga/desliga funciona nos 3
- [ ] Flicker funciona em pelo menos 1 (sem travar o Wi-Fi)
