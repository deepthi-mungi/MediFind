/**
 * Lightweight sliding-window rate limiter middleware
 */

function createRateLimiter({ windowMs = 60 * 1000, max = 120, message = "Too many requests, please try again shortly." } = {}) {
  const hits = new Map();

  // Periodic cleanup to avoid memory growth
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits.entries()) {
      if (now > entry.resetAt) {
        hits.delete(key);
      }
    }
  }, windowMs);

  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return function rateLimiter(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || "local";
    const now = Date.now();
    let entry = hits.get(ip);

    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      hits.set(ip, entry);
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      return res.status(429).json({ message });
    }

    return next();
  };
}

module.exports = { createRateLimiter };
