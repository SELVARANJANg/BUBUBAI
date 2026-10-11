import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// In-memory sliding rate limit store
const ipStore = new Map<string, RateLimitRecord>();

// Clean up stale rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of ipStore.entries()) {
    if (now > value.resetAt) {
      ipStore.delete(key);
    }
  }
}, 60000);

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Server-side rate limiter to prevent abuse and quota exhaustion.
 */
export function rateLimitMiddleware(options?: {
  maxRequests?: number;
  windowMs?: number;
}) {
  const max = options?.maxRequests ?? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '30', 10);
  const windowMs = options?.windowMs ?? parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const now = Date.now();

    const record = ipStore.get(ip);
    if (!record || now > record.resetAt) {
      ipStore.set(ip, {
        count: 1,
        resetAt: now + windowMs,
      });
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', max - 1);
      return next();
    }

    if (record.count >= max) {
      const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', 0);
      return res.status(429).json({
        error: 'Too many requests. Please slow down.',
        text: '⚡ You have sent too many requests in a short period. Please wait a moment before trying again.\n\n**bububai**',
        retryAfter: retryAfterSec,
      });
    }

    record.count++;
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    next();
  };
}

/**
 * Validates request payload, enforces maximum length, attachment caps, and cost controls.
 */
export function validateChatPayload(req: Request, res: Response, next: NextFunction) {
  const body = req.body || {};
  const { message, history, attachments } = body;

  if (typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({
      error: 'Message is required and must be non-empty',
      text: '⚡ BUBUBAI received an empty message request. Please provide a message!\n\n**bububai**',
    });
  }

  const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH || '4000', 10);
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: `Message exceeds maximum allowed length of ${MAX_MESSAGE_LENGTH} characters`,
      text: `⚡ Message is too long (maximum ${MAX_MESSAGE_LENGTH} characters). Please shorten your prompt.\n\n**bububai**`,
    });
  }

  if (history !== undefined && !Array.isArray(history)) {
    return res.status(400).json({
      error: 'History must be an array',
    });
  }

  if (Array.isArray(history) && history.length > 50) {
    // Truncate to most recent 50 messages safely
    req.body.history = history.slice(-50);
  }

  if (attachments !== undefined && !Array.isArray(attachments)) {
    return res.status(400).json({
      error: 'Attachments must be an array',
    });
  }

  if (Array.isArray(attachments) && attachments.length > 5) {
    return res.status(400).json({
      error: 'Maximum 5 attachments allowed per message',
      text: '⚡ Too many attachments. Maximum 5 attachments allowed per message.\n\n**bububai**',
    });
  }

  next();
}
