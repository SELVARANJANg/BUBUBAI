import { Request, Response, NextFunction } from 'express';

interface TokenBucketRecord {
  tokens: number;
  lastRefill: number;
  windowStart: number;
  windowCount: number;
}

export interface RateLimiterStats {
  activeBuckets: number;
  totalAllowed: number;
  totalBlocked: number;
  maxRequestsPerWindow: number;
  windowMs: number;
}

export class RateLimiter {
  private buckets = new Map<string, TokenBucketRecord>();
  private totalAllowed = 0;
  private totalBlocked = 0;
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(options?: { maxRequests?: number; windowMs?: number }) {
    this.maxRequests =
      options?.maxRequests ??
      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '30', 10);
    this.windowMs =
      options?.windowMs ??
      parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  }

  public consume(key: string): {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAtSec: number;
    retryAfterSec: number;
  } {
    const now = Date.now();
    let record = this.buckets.get(key);

    if (!record || now - record.windowStart >= this.windowMs) {
      record = {
        tokens: this.maxRequests - 1,
        lastRefill: now,
        windowStart: now,
        windowCount: 1,
      };
      this.buckets.set(key, record);
      this.totalAllowed++;
      return {
        allowed: true,
        limit: this.maxRequests,
        remaining: record.tokens,
        resetAtSec: Math.ceil((now + this.windowMs) / 1000),
        retryAfterSec: 0,
      };
    }

    // Refill proportional tokens smoothly within window (token bucket + sliding window cap)
    const elapsed = now - record.lastRefill;
    const refillRatePerMs = this.maxRequests / this.windowMs;
    const refilled = Math.floor(elapsed * refillRatePerMs);
    if (refilled > 0) {
      record.tokens = Math.min(this.maxRequests, record.tokens + refilled);
      record.lastRefill = now;
    }

    if (record.windowCount >= this.maxRequests || record.tokens <= 0) {
      this.totalBlocked++;
      const retryAfterSec = Math.max(
        1,
        Math.ceil((record.windowStart + this.windowMs - now) / 1000)
      );
      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: 0,
        resetAtSec: Math.ceil((record.windowStart + this.windowMs) / 1000),
        retryAfterSec,
      };
    }

    record.tokens -= 1;
    record.windowCount += 1;
    this.totalAllowed++;

    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: Math.max(0, Math.min(record.tokens, this.maxRequests - record.windowCount)),
      resetAtSec: Math.ceil((record.windowStart + this.windowMs) / 1000),
      retryAfterSec: 0,
    };
  }

  public prune(): void {
    const now = Date.now();
    for (const [key, val] of this.buckets.entries()) {
      if (now - val.windowStart > this.windowMs * 2) {
        this.buckets.delete(key);
      }
    }
  }

  public getStats(): RateLimiterStats {
    this.prune();
    return {
      activeBuckets: this.buckets.size,
      totalAllowed: this.totalAllowed,
      totalBlocked: this.totalBlocked,
      maxRequestsPerWindow: this.maxRequests,
      windowMs: this.windowMs,
    };
  }
}

export const defaultRateLimiter = new RateLimiter();

// Periodic cleanup in non-serverless environments
const cleanupTimer = setInterval(() => {
  defaultRateLimiter.prune();
}, 60000);
if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Server-side token-bucket + sliding-window rate limiter to prevent abuse and quota exhaustion.
 */
export function rateLimitMiddleware(options?: {
  maxRequests?: number;
  windowMs?: number;
  limiter?: RateLimiter;
}) {
  const limiter =
    options?.limiter ||
    (options?.maxRequests || options?.windowMs
      ? new RateLimiter(options)
      : defaultRateLimiter);

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const username =
      typeof req.body?.username === 'string' && req.body.username.trim()
        ? req.body.username.trim().slice(0, 64)
        : 'anon';
    const key = `${ip}:${username}`;

    const result = limiter.consume(key);

    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetAtSec);

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfterSec);
      return res.status(429).json({
        error: 'Too many requests. Please slow down.',
        text: '⚡ You have sent too many requests in a short period. Please wait a moment before trying again.\n\n**bububai**',
        retryAfter: result.retryAfterSec,
      });
    }

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
