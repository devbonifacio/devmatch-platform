<div align="center">

# 🚀 DevMatch

### Plataforma de matching para desenvolvedores — encontre seu dev parceiro

![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![WebRTC](https://img.shields.io/badge/WebRTC-333333?style=for-the-badge&logo=webrtc&logoColor=white)

**DevMatch** é uma aplicação fullstack onde programadores se encontram pelo tech stack, fazem match, conversam em tempo real, gravam histórias, criam grupos e se ligam por voz — direto no browser, sem infraestrutura de mídia externa.

### 🌐 [devmatch-two.vercel.app](https://devmatch-two.vercel.app)

</div>

---

## ✨ Funcionalidades

### 👤 Autenticação & Perfil
- Registo e login com JWT (access token httpOnly + refresh token rotacionado)
- Perfil completo: bio, tech stack, GitHub, foto de avatar
- Suporte a GIFs animados como avatar — GIFs preservam animação, imagens estáticas passam pelo crop editor

### 🔍 Descoberta de Devs
- Interface swipe-style: curtir ou pular developers
- Filtro por género
- Algoritmo de recomendação inteligente (prioriza devs com stack em comum)

### ❤️ Matches
- Match automático quando dois devs se curtem mutuamente
- Lista de matches com preview da última mensagem

### 💬 Chat em Tempo Real
- Mensagens via Socket.io com entrega instantânea
- Indicador de digitação em tempo real
- Status online/offline por utilizador
- Histórico de mensagens persistido no MongoDB
- Agrupamento visual por data e remetente

### 📞 Chamadas de Voz (WebRTC P2P)
- Chamadas de voz peer-to-peer diretamente entre os matches
- Sinalização via Socket.io — sem servidores de mídia externos
- Fila de candidatos ICE para evitar race conditions no handshake
- Overlay animado de "A ligar..." e "Chamada recebida"
- Barra verde ativa com cronômetro durante a chamada
- Botão de mute e cleanup automático ao desligar
- **Efeitos sonoros Web Audio API**: toque de chamada, conexão e desligar

### 📰 Feed & Stories
- Feed de posts dos matches (estilo rede social)
- Stories no topo do feed (estilo Instagram) com imagem e vídeo
- Contador de visualizações e curtidas por story
- Stories expiram automaticamente após 24 horas
- Mensagem direta a partir de um story

### 👥 Grupos (estilo Discord)
- Criar e entrar em grupos de devs
- Chat de grupo em tempo real via Socket.io
- Canal de voz: entrar/sair com efeitos sonoros (Web Audio API)
- Gestão de membros e administração do grupo
- Badge de mensagens não lidas

### 🤝 Sistema de Amizades
- Enviar, aceitar e recusar pedidos de amizade
- Lista de amigos com status online
- Bloquear utilizadores

### 🔔 Notificações
- Notificações em tempo real para matches, mensagens e pedidos de amizade
- Badge de não lidas na navbar
- Socket global — funciona em qualquer página da aplicação

---

## 🛠️ Tech Stack

### Frontend
| Tecnologia | Uso |
|---|---|
| React 18 + Vite | Framework e bundler |
| Tailwind CSS | Estilização com tema dark custom |
| Zustand | Estado global (auth + unread counts) |
| Axios | HTTP client com interceptor Bearer |
| Socket.io-client | WebSockets para chat, chamadas e notificações |
| WebRTC (API nativa) | Chamadas de voz P2P sem dependências externas |
| Web Audio API (nativa) | Efeitos sonoros gerados programaticamente |
| React Router v6 | Roteamento com ProtectedRoute |
| Framer Motion | Animações e transições de página |

### Backend
| Tecnologia | Uso |
|---|---|
| Node.js + Express | Servidor HTTP |
| MongoDB Atlas + Mongoose | Base de dados |
| Socket.io 4.7 | Tempo real: chat, chamadas, notificações, presença |
| JWT (access + refresh token) | Autenticação stateless com rotação |
| bcryptjs | Hash de passwords |
| Helmet + express-rate-limit | Segurança HTTP |
| express-mongo-sanitize | Proteção contra NoSQL injection |
| express-validator | Validação de inputs nas rotas de escrita |

---

## 📁 Estrutura do Projeto

```
devmatch/
├── client/
│   └── src/
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   ├── Discover.jsx       # Swipe de devs com filtros e recomendações
│       │   ├── Matches.jsx        # Lista de matches
│       │   ├── Chat.jsx           # Chat 1-a-1 com chamada de voz integrada
│       │   ├── Feed.jsx           # Feed de posts + stories
│       │   ├── Groups.jsx         # Lista e criação de grupos
│       │   ├── GroupChat.jsx      # Chat e canal de voz do grupo
│       │   └── Profile.jsx        # Edição de perfil e avatar
│       ├── components/
│       │   ├── VoiceCall.jsx      # WebRTC P2P + efeitos sonoros Web Audio API
│       │   ├── ChatWindow.jsx     # UI do chat com typing indicator
│       │   ├── DevCard.jsx        # Card de developer no discover
│       │   ├── GlobalSocket.jsx   # Socket global para notificações em qualquer página
│       │   ├── Navbar.jsx         # Navegação com badges de não lidos
│       │   ├── PageTransition.jsx # Animações Framer Motion entre páginas
│       │   ├── AuroraBg.jsx       # Background aurora animado
│       │   └── ParticlesBg.jsx    # Partículas de fundo
│       ├── store/
│       │   ├── authStore.js       # Zustand: user, login, logout, fetchMe
│       │   └── unreadStore.js     # Zustand: contagem de mensagens não lidas
│       └── lib/
│           ├── api.js             # Axios com interceptor Bearer
│           └── sanitize.js        # safeUrl() para validar links externos
│
└── server/
    ├── index.js                   # Entry: Express + Socket.io + middlewares de segurança
    ├── routes/
    │   ├── auth.js                # register, login, logout, refresh, me
    │   ├── users.js               # profile, discover, public profile
    │   ├── matches.js             # like, skip, listar matches
    │   ├── messages.js            # histórico + envio (fallback REST)
    │   ├── posts.js               # feed, stories (criar/ver/curtir/apagar)
    │   ├── groups.js              # CRUD grupos, membros, canal de voz
    │   ├── friends.js             # pedidos, aceitar, recusar, bloquear
    │   └── notifications.js       # listar, marcar como lidas
    ├── models/
    │   ├── User.js                # perfil, liked[], skipped[], isOnline, lastSeen
    │   ├── Match.js               # par de users com match mútuo
    │   ├── Message.js             # matchId, sender, text, read
    │   ├── Post.js                # posts e stories do feed
    │   ├── Group.js               # grupos com lista de membros e canal de voz
    │   └── Notification.js        # notificações persistidas por utilizador
    ├── middleware/
    │   ├── auth.js                # JWT protect middleware (REST)
    │   └── security.js            # Helmet, rate limits, sanitize, error handler
    └── socket/
        └── index.js               # Chat, sinalização WebRTC, notificações, presença
```

---

## 📞 Chamadas de Voz WebRTC

As chamadas são feitas diretamente entre browsers (P2P) — sem MediaSoup, Agora ou qualquer servidor de mídia pago.

### Fluxo de sinalização

```
Utilizador A (chamador)        Servidor              Utilizador B (receptor)
       │                          │                          │
       │── call:offer ───────────►│── call:offer ───────────►│
       │                          │  (verifica match no DB)  │
       │                          │◄── call:answer ──────────│
       │◄── call:answer ──────────│                          │
       │◄──── call:ice-candidate ─── call:ice-candidate ─────│
       │                          │                          │
       │◄══════════ Conexão P2P estabelecida via STUN ══════►│
```

### Eventos Socket.io de sinalização

| Evento | Direção | Descrição |
|---|---|---|
| `call:offer` | A → servidor → B | SDP offer para iniciar chamada |
| `call:answer` | B → servidor → A | SDP answer ao aceitar |
| `call:ice-candidate` | bidirecional | Troca de candidatos ICE |
| `call:end` | bidirecional | Encerrar chamada |
| `call:reject` | B → servidor → A | Rejeitar chamada recebida |

### Efeitos sonoros (Web Audio API — sem ficheiros externos)

| Estado | Som |
|---|---|
| `calling` / `receiving` | Toque dual-tone clássico 440 Hz + 480 Hz, dois pulsos, repete a cada 3s |
| `active` (chamada conectada) | Chime ascendente dois tons: 880 Hz → 1108 Hz |
| `ended` / `rejected` | Três tons descendentes: 600 Hz → 480 Hz → 360 Hz |

---

## 🔒 Segurança

### Autenticação & Tokens
- JWT de **15 minutos** em cookie **httpOnly** — inacessível ao JavaScript
- Refresh token de 7 dias rotacionado a cada uso
- Logout invalida o access token via blacklist em memória
- Socket.io re-autentica via cookie a cada nova conexão

### Autorização Socket.io
- `chat:join` — verifica no DB se o utilizador é participante do match
- `chat:message` — verificação por mensagem + rate limit de 30 eventos/min + limite de 1000 caracteres
- `call:offer/answer/ice/end/reject` — ambos devem partilhar um match; campo `from` sempre vem do `socket.userId` (não pode ser falsificado pelo cliente)

### Rate Limiting

| Endpoint / Evento | Limite |
|---|---|
| `POST /auth/login` | 20 tentativas / 15 min por IP |
| `POST /auth/register` | 3 tentativas / hora por IP |
| Global (todas as rotas) | 500 req / 15 min por IP |
| `POST /matches/like/:id` | 100 likes / hora por utilizador |
| `POST /messages/:matchId` | 30 mensagens / min por utilizador |
| `chat:message` (socket) | 30 eventos / min por conexão |

### Validação & Sanitização
- `express-mongo-sanitize` globalmente — bloqueia operadores `$` e `.` do MongoDB
- `express-validator` em todas as rotas de escrita
- Body limit: **10 KB**
- GitHub e avatar aceitam apenas `https://`; `safeUrl()` no frontend rejeita `javascript:` e `data:`

### Headers HTTP (Helmet)
`Content-Security-Policy` · `X-Frame-Options: DENY` · `HSTS` (1 ano) · `X-Content-Type-Options: nosniff` · `Referrer-Policy: no-referrer`

---

## 🌐 API Endpoints

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/auth/register` | — | Criar conta |
| POST | `/auth/login` | — | Login → access token + refresh token |
| POST | `/auth/logout` | ✓ | Invalidar tokens |
| POST | `/auth/refresh` | — | Renovar access token |
| GET | `/auth/me` | ✓ | Utilizador autenticado |
| PUT | `/users/profile` | ✓ | Atualizar perfil |
| GET | `/users/discover` | ✓ | Devs a descobrir (com filtros e recomendações) |
| GET | `/users/:id` | ✓ | Perfil público |
| POST | `/matches/like/:id` | ✓ | Curtir — cria match se mútuo |
| POST | `/matches/skip/:id` | ✓ | Pular dev |
| GET | `/matches` | ✓ | Todos os matches |
| GET | `/messages/:matchId` | ✓ | Histórico + marcar como lido |
| POST | `/messages/:matchId` | ✓ | Enviar mensagem (fallback REST) |
| GET | `/posts/feed` | ✓ | Feed dos matches |
| GET | `/posts/stories` | ✓ | Stories agrupados por autor |
| POST | `/posts` | ✓ | Criar post ou story |
| DELETE | `/posts/:id` | ✓ | Apagar post/story próprio |
| GET | `/groups` | ✓ | Listar grupos |
| POST | `/groups` | ✓ | Criar grupo |
| GET | `/groups/:id` | ✓ | Detalhe do grupo |
| POST | `/groups/:id/join` | ✓ | Entrar no grupo |
| GET | `/friends` | ✓ | Lista de amigos |
| POST | `/friends/request/:id` | ✓ | Enviar pedido de amizade |
| POST | `/friends/accept/:id` | ✓ | Aceitar pedido |
| POST | `/friends/block/:id` | ✓ | Bloquear utilizador |
| GET | `/notifications` | ✓ | Listar notificações |
| PUT | `/notifications/read` | ✓ | Marcar todas como lidas |

---

## 🚀 Como Rodar o Projeto

### Pré-requisitos
- Node.js 18+
- Conta no [MongoDB Atlas](https://cloud.mongodb.com) — tier gratuito M0 é suficiente

### 1. Clonar o repositório

```bash
git clone https://github.com/SEU_USERNAME/devmatch.git
cd devmatch
```

### 2. Configurar o backend

```bash
cd server
npm install
```

Criar o ficheiro `server/.env`:

```env
MONGODB_URI=mongodb+srv://...
JWT_SECRET=string_aleatoria_com_minimo_64_caracteres
REFRESH_TOKEN_SECRET=outra_string_diferente_da_anterior
PORT=5000
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

```bash
npm run dev   # inicia com nodemon na porta 5000
```

### 3. Configurar o frontend

```bash
cd client
npm install
npm run dev   # Vite na porta 5173
```

Acessa em **http://localhost:5173** — o Vite faz proxy de `/api/*` para `http://localhost:5000` automaticamente em desenvolvimento.

---

## 🌍 Deploy Gratuito

| Serviço | Para quê | Observação |
|---|---|---|
| [Vercel](https://vercel.com) | Frontend React/Vite | Deploy automático via GitHub |
| [Render](https://render.com) | Backend Node.js + Socket.io | Free tier adormece após 15 min sem tráfego |
| [MongoDB Atlas](https://cloud.mongodb.com) | Base de dados | M0 free sempre ativo |

**Variáveis no Vercel:**
```
VITE_SOCKET_URL=https://seu-backend.onrender.com
VITE_API_URL=https://seu-backend.onrender.com/api
```

**Variáveis no Render:** as mesmas do `.env`, com `CLIENT_URL` apontando para o domínio do Vercel.

---

## 💡 Próximas Melhorias

- [ ] Videochamada (adicionar faixa de vídeo ao peer connection existente)
- [ ] TURN server para chamadas em redes corporativas/NAT restrito
- [ ] Notificações push via PWA (Service Worker)
- [ ] Upload de imagens para CDN (Cloudinary ou S3)
- [ ] Animação drag estilo Tinder no Discover
- [ ] Sistema de reviews entre devs pós-colaboração
- [ ] Editor de código partilhado em tempo real (Monaco Editor)

---

## 👨‍💻 Autor

Feito por **Bonifácio Jr.** 🚀

> Dev full-stack em construção — projetos reais para um portfólio de verdade.

---

<div align="center">

Se gostaste do projeto, deixa uma ⭐ no repositório — significa muito!

</div>
