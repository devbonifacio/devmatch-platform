/**
 * middleware/rateLimit.js
 *
 * Rate limiting por utilizador autenticado. Usa Map em memória — sem dependências externas.
 * Para produção com múltiplas instâncias usa Redis (ex: ioredis + sliding window).
 *
 * Uso:
 *   import { rateLimitLikes, rateLimitMessages } from "../middleware/rateLimit.js";
 *   router.post("/like/:id", protect, rateLimitLikes, handler);
 */

const likesStore    = new Map();
const messagesStore = new Map();

/**
 * Cria um middleware de rate limit genérico.
 * @param {Map}    store     - Map de estado partilhado
 * @param {number} max       - Máximo de requests permitidos
 * @param {number} windowMs  - Janela de tempo em milissegundos
 * @param {string} label     - Nome para a mensagem de erro
 */
function createRateLimit(store, max, windowMs, label) {
  return function rateLimit(req, res, next) {
    const userId = req.user?._id?.toString();
    if (!userId) return next();

    const now   = Date.now();
    const entry = store.get(userId);

    if (!entry || now >= entry.resetAt) {
      store.set(userId, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfterSec);
      return res.status(429).json({
        error: `Demasiados ${label}. Aguarda ${retryAfterSec}s e tenta novamente.`,
        retryAfter: retryAfterSec,
      });
    }

    entry.count += 1;
    return next();
  };
}

// 100 likes por hora
export const rateLimitLikes = createRateLimit(likesStore, 100, 60 * 60 * 1000, "likes");

// 60 mensagens por minuto
export const rateLimitMessages = createRateLimit(messagesStore, 60, 60 * 1000, "mensagens");
