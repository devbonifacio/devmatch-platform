# 🚀 DevMatch — Find Your Dev Partner

DevMatch é uma plataforma fullstack onde programadores podem encontrar outros devs para colaborar em projetos, fazer match e conversar em tempo real.

---

## ✨ Funcionalidades

* 🔐 Autenticação (Register/Login com JWT)
* 👤 Perfil de desenvolvedor (bio, stack, GitHub, avatar)
* 🔍 Discover de devs (like / skip)
* ❤️ Sistema de match automático
* 💬 Chat em tempo real (Socket.io)
* 🟢 Status online

---

## 🛠️ Tech Stack

### Frontend

* React (Vite)
* Tailwind CSS
* Zustand
* Axios

### Backend

* Node.js
* Express
* MongoDB (Atlas)
* Mongoose
* Socket.io
* JWT Authentication

---

## 🚀 Como rodar o projeto

### 1. Clonar o repositório

```bash
git clone https://github.com/SEU_USERNAME/devmatch.git
cd devmatch
```

---

### 2. Backend

```bash
cd server
npm install
npm start
```

Cria um arquivo `.env` em `/server`:

```env
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_secret
PORT=5000
CLIENT_URL=http://localhost:5173
```

---

### 3. Frontend

```bash
cd client
npm install
npm run dev
```

---

## 🌐 Estrutura do Projeto

```
devmatch/
├── client/   # Frontend (React)
└── server/   # Backend (Node.js + Express)
```

---

## 💡 Próximas melhorias

* Swipe estilo Tinder 🔥
* Melhor UI/UX
* Notificações em tempo real
* Deploy (Vercel + Render)

---

## 👨‍💻 Autor

Feito por **Bonifácio** 🚀
Futuro Desenvolvedor Full Stack

---

## ⭐ Se gostaste do projeto

Deixa uma estrela no repo ⭐
