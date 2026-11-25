import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export interface GatewayMetrics {
  gatewayVersion: string;
  uptimeSeconds: number;
  totalRequests: number;
  activeRequests: number;
  avgLatencyMs: number;
  statusCodes: Record<string, number>;
  proxyDetected: boolean;
}

class APIGatewayState {
  private readonly startedAt = Date.now();
  public totalRequests = 0;
  public activeRequests = 0;
  public avgLatencyMs = 0;
  public statusCodes: Record<string, number> = {};
  public proxyDetected = false;

  public recordCompletion(statusCode: number, durationMs: number) {
    const group = `${Math.floor(statusCode / 100)}xx`;
    this.statusCodes[group] = (this.statusCodes[group] || 0) + 1;
    this.avgLatencyMs =
      this.avgLatencyMs === 0
        ? Math.round(durationMs)
        : Math.round(this.avgLatencyMs * 0.8 + durationMs * 0.2);
  }

  public getMetrics(): GatewayMetrics {
    return {
      gatewayVersion: 'BUBUBAI-Gateway/1.0',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      totalRequests: this.totalRequests,
      activeRequests: this.activeRequests,
      avgLatencyMs: this.avgLatencyMs,
      statusCodes: { ...this.statusCodes },
      proxyDetected: this.proxyDetected,
    };
  }
}

export const defaultGatewayState = new APIGatewayState();

/**
 * Centralized API Gateway middleware:
 * - Assigns/propagates X-Request-ID correlation headers
 * - Detects and normalizes Reverse Proxy headers (X-Forwarded-For, X-Real-IP, X-Forwarded-Proto)
 * - Injects hardened HTTP security headers
 * - Tracks gateway latency and status code telemetry
 */
export function apiGatewayMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const start = Date.now();
  defaultGatewayState.totalRequests += 1;
  defaultGatewayState.activeRequests += 1;

  // Correlation ID
  const incomingId = req.headers['x-request-id'];
  const requestId =
    typeof incomingId === 'string' && incomingId.trim().length > 0
      ? incomingId.trim().slice(0, 64)
      : crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Reverse proxy detection
  if (
    req.headers['x-forwarded-for'] ||
    req.headers['x-real-ip'] ||
    req.headers['x-vercel-forwarded-for']
  ) {
    defaultGatewayState.proxyDetected = true;
  }

  // Gateway & Security Headers
  res.setHeader('X-Gateway', 'BUBUBAI-Gateway/1.0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Measure response latency safely before headers flush if possible
  const originalEnd = res.end.bind(res);
  let finished = false;

  const finalize = () => {
    if (finished) return;
    finished = true;
    defaultGatewayState.activeRequests = Math.max(
      0,
      defaultGatewayState.activeRequests - 1
    );
    const durationMs = Date.now() - start;
    defaultGatewayState.recordCompletion(res.statusCode, durationMs);
  };

  (res as any).end = function (...args: any[]) {
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${Date.now() - start}ms`);
    }
    finalize();
    return originalEnd(...args);
  };

  res.on('close', finalize);

  next();
}
