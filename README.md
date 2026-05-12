# 🚀 DevMatch — Find Your Dev Partner

DevMatch é uma plataforma fullstack onde programadores podem encontrar outros devs para colaborar em projetos, fazer match e conversar em tempo real — incluindo chamadas de voz diretas entre os matches.

---

## ✨ Funcionalidades

* 🔐 Autenticação (Register/Login com JWT)
* 👤 Perfil de desenvolvedor (bio, stack, GitHub, avatar)
* 🔍 Discover de devs (like / skip)
* ❤️ Sistema de match automático
* 💬 Chat em tempo real (Socket.io)
* 🟢 Status online
* 📞 Chamadas de voz entre matches (WebRTC peer-to-peer)

---

## 📞 Chamadas de Voz (WebRTC)

As chamadas de voz são feitas diretamente entre os dois usuários (peer-to-peer) sem servidores de mídia externos. O sinalização é feita via Socket.io, aproveitando a infraestrutura de tempo real já existente.

### Como funciona

1. O usuário clica no botão de chamada no chat de um match
2. O servidor verifica se ambos são participantes do match (autorização)
3. A oferta WebRTC é enviada via `call:offer` e encaminhada ao destinatário
4. O destinatário aceita ou rejeita — se aceitar, troca de `call:answer` e candidatos ICE
5. Conexão P2P estabelecida diretamente entre os navegadores via STUN

### Eventos Socket.io de sinalização

| Evento | Direção | Descrição |
|---|---|---|
| `call:offer` | cliente → servidor → cliente | Iniciar chamada com SDP offer |
| `call:answer` | cliente → servidor → cliente | Aceitar chamada com SDP answer |
| `call:ice-candidate` | cliente → servidor → cliente | Troca de candidatos ICE |
| `call:end` | cliente → servidor → cliente | Encerrar chamada |
| `call:reject` | cliente → servidor → cliente | Rejeitar chamada recebida |

### Funcionalidades da chamada

* Botão de mute (desativa as faixas de áudio locais)
* Cronômetro de duração da chamada
* Overlay animado de "chamando..." e "recebendo chamada..."
* Fila de candidatos ICE antes de definir a remote description
* Limpeza automática de streams e conexão ao desligar ou desmontar o componente

### Infraestrutura

* WebRTC nativo (sem bibliotecas externas — sem simple-peer, mediasoup ou Agora)
* STUN servers públicos do Google (`stun.l.google.com:19302`)
* Nenhum pacote npm novo adicionado

---

## 🔒 Segurança

Implementada após auditoria interna (2026-05-04). Cobre as principais vulnerabilidades de aplicações web.

### Autenticação & Tokens
* JWT reduzido de 7 dias → **15 minutos** (access token)
* Refresh token de 7 dias armazenado server-side, rotacionado a cada uso
* JWT movido de **localStorage → cookie httpOnly** — inacessível ao JavaScript
* Logout invalida o access token via blacklist até sua expiração natural
* Socket.io re-autentica via cookie em cada nova conexão

### Proteção de Rotas & Autorização (Socket.io)
* `chat:join` — verificação no banco: usuário deve ser participante do match
* `chat:message` — verificação por mensagem + rate limit + limite de 1000 caracteres
* `call:offer/answer/ice/end/reject` — ambos os usuários precisam compartilhar um match; campo `from` sempre vem do `socket.userId` (não do cliente)

### Rate Limiting
| Endpoint / Evento | Limite |
|---|---|
| `POST /auth/login` | 5 tentativas / 15 min por IP |
| `POST /auth/register` | 3 tentativas / hora por IP |
| Todas as rotas (global) | 100 req / 15 min por IP |
| `POST /matches/like/:id` | 100 likes / hora por usuário |
| `POST /messages/:matchId` | 30 mensagens / min por usuário |
| `chat:message` (socket) | 30 eventos / min por conexão |

### Validação & Sanitização
* `express-mongo-sanitize` globalmente — bloqueia operadores `$` e `.` do MongoDB
* `express-validator` em todas as rotas de escrita (register, login, profile, messages)
* Body limit reduzido de 4 MB → **10 KB**
* GitHub e avatar aceitos apenas com protocolo `https://`; avatar/github rejeitam `javascript:` e `data:` via `safeUrl()` no frontend

### Headers de Segurança (Helmet)
`Content-Security-Policy`, `X-Frame-Options: DENY`, `HSTS` (1 ano), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`

### CORS
Origem restrita à variável `CLIENT_URL`; `credentials: true` para cookies httpOnly.

### Proteção de Dados
* Campo `password` com `select: false` — nunca retornado em queries
* Perfis públicos excluem os arrays `liked[]` e `skipped[]`
* Erros 500 em produção retornam mensagem genérica (sem stack trace)

> Para mais detalhes técnicos, consulte o arquivo [SECURITY.md](SECURITY.md).

---

## 🛠️ Tech Stack

### Frontend

* React 18 (Vite)
* Tailwind CSS
* Zustand
* Axios
* Socket.io-client
* WebRTC (API nativa do browser)

### Backend

* Node.js + Express
* MongoDB (Atlas) + Mongoose
* Socket.io
* JWT Authentication

---

## 📸 Preview

*(adiciona aqui depois prints do projeto)*

---

## 🚀 Como rodar o projeto

### 1. Clonar o repositório

```bash
git clone https://github.com/SEU_USERNAME/devmatch.git
cd devmatch
```

### 2. Backend

```bash
cd server
npm install
npm run dev
```

Cria um arquivo `.env` em `server/`:

```env
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_secret
PORT=5000
CLIENT_URL=http://localhost:5173
```

### 3. Frontend

```bash
cd client
npm install
npm run dev
```

Acesse em `http://localhost:5173`. O Vite faz proxy de `/api/*` para `http://localhost:5000` automaticamente.

---

## 🌐 Estrutura do Projeto

```
devmatch/
├── client/src/
│   ├── pages/        # Login, Register, Discover, Matches, Chat, Profile
│   ├── components/   # Navbar, DevCard, ChatWindow, VoiceCall, ProtectedRoute
│   ├── store/        # Zustand auth store
│   └── lib/          # Axios com Bearer interceptor
└── server/
    ├── routes/       # auth, users, matches, messages
    ├── models/       # User, Match, Message
    ├── middleware/   # JWT protect
    └── socket/       # Chat + sinalização de chamadas de voz
```

---

## 💡 Próximas melhorias

* Swipe estilo Tinder 🔥
* Videochamada (adicionar faixa de vídeo ao peer connection)
* Notificações push para chamadas recebidas
* Deploy (Vercel + Render)

---

## 👨‍💻 Autor

Feito por **Bonifácio** 🚀
Futuro Desenvolvedor Full Stack

---

## ⭐ Se gostaste do projeto

Deixa uma estrela no repo ⭐