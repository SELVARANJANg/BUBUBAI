/**
 * Automated test suite for the 10-pillar production architecture:
 * Circuit Breaker, LRU/TTL Cache, Load Balancer, Service Discovery,
 * Token-Bucket Rate Limiter, and API Gateway Middleware.
 */

import { CircuitBreaker } from '../src/server/resilience/circuitBreaker';
import { ResponseCache } from '../src/server/cache/responseCache';
import { LoadBalancer } from '../src/server/providers/loadBalancer';
import { ServiceRegistry } from '../src/server/discovery/serviceRegistry';
import { RateLimiter } from '../src/server/middleware/security';
import { apiGatewayMiddleware, defaultGatewayState } from '../src/server/gateway/apiGateway';

let passedCount = 0;
let failedCount = 0;

function assert(name: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${name} - ${details || 'Assertion failed'}`);
    failedCount++;
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('🏗️  Starting 10-Pillar Infrastructure Tests');
  console.log('========================================\n');

  // 1. Circuit Breaker Tests
  console.log('1. Circuit Breaker (CLOSED -> OPEN -> HALF_OPEN -> CLOSED)');
  const cb = new CircuitBreaker({
    failureThreshold: 2,
    resetTimeoutMs: 40,
    halfOpenSuccessThreshold: 1,
  });
  assert('Starts in CLOSED state', cb.getState('gemini').state === 'CLOSED');
  assert('Allows execution initially', cb.canExecute('gemini') === true);

  cb.recordFailure('gemini', 'Timeout 1');
  assert('Remains CLOSED after 1 failure (threshold 2)', cb.getState('gemini').state === 'CLOSED');

  cb.recordFailure('gemini', 'Timeout 2');
  assert('Trips to OPEN after 2 consecutive failures', cb.getState('gemini').state === 'OPEN');
  assert('Blocks execution while OPEN', cb.canExecute('gemini') === false);

  await new Promise((r) => setTimeout(r, 55));
  assert('Transitions OPEN -> HALF_OPEN after reset timeout', cb.canExecute('gemini') === true);
  assert('Reports HALF_OPEN state', cb.getState('gemini').state === 'HALF_OPEN');

  cb.recordSuccess('gemini');
  assert('Closes circuit after successful HALF_OPEN probe', cb.getState('gemini').state === 'CLOSED');

  // 2. Response Cache Tests (LRU + TTL)
  console.log('\n2. Response Cache (LRU Eviction + TTL Expiry)');
  const cache = new ResponseCache<string>({ maxSize: 2, ttlMs: 50, enabled: true });
  cache.set('k1', 'v1');
  cache.set('k2', 'v2');
  assert('Cache HIT on k1', cache.get('k1') === 'v1');
  // k2 is now LRU because k1 was just accessed
  cache.set('k3', 'v3');
  assert('Evicted LRU entry k2 when capacity exceeded', cache.get('k2') === null);
  assert('Retained recently used k1', cache.get('k1') === 'v1');
  assert('Retained newly inserted k3', cache.get('k3') === 'v3');

  await new Promise((r) => setTimeout(r, 65));
  assert('Expired TTL entry returns null', cache.get('k1') === null);
  assert('Cache stats track hits/misses/evictions', cache.getStats().evictions === 1);

  // 3. Load Balancer Tests
  console.log('\n3. Load Balancer (Priority, Round-Robin, Least-Latency, Paid Protection)');
  const rrLb = new LoadBalancer({ strategy: 'round-robin' });
  const firstOrder = rrLb.orderCandidates(['gemini', 'nvidia', 'openai'], ['openai']);
  const secondOrder = rrLb.orderCandidates(['gemini', 'nvidia', 'openai'], ['openai']);
  assert('Round-robin rotates primary free providers', firstOrder[0] === 'gemini' && secondOrder[0] === 'nvidia');
  assert('Round-robin keeps paid reserve OpenAI at tail', firstOrder[2] === 'openai' && secondOrder[2] === 'openai');

  const latencyLb = new LoadBalancer({ strategy: 'least-latency' });
  latencyLb.recordSuccess('gemini', 420);
  latencyLb.recordSuccess('nvidia', 110);
  const latencyOrder = latencyLb.orderCandidates(['gemini', 'nvidia', 'openai'], ['openai']);
  assert('Least-latency orders faster provider first', latencyOrder[0] === 'nvidia' && latencyOrder[1] === 'gemini');

  // 4. Service Discovery Tests
  console.log('\n4. Service Discovery (Register, Heartbeat, Discover, Prune)');
  const registry = new ServiceRegistry({ defaultTtlMs: 50, seedDefaults: false });
  registry.register({
    id: 'node-1',
    serviceName: 'bububai-api',
    endpoint: 'http://10.0.0.1:3000',
    status: 'UP',
  });
  registry.register({
    id: 'node-2',
    serviceName: 'bububai-api',
    endpoint: 'http://10.0.0.2:3000',
    status: 'DOWN',
  });
  const healthyNodes = registry.discover('bububai-api', true);
  assert('Discovers only healthy UP nodes by default', healthyNodes.length === 1 && healthyNodes[0].id === 'node-1');

  registry.heartbeat('node-1', { latencyMs: 42 });
  assert('Heartbeat updates service latency', registry.discover('bububai-api', true)[0].latencyMs === 42);

  await new Promise((r) => setTimeout(r, 65));
  const pruned = registry.pruneStale();
  assert('Prunes stale nodes past TTL', pruned === 2 && registry.discover('bububai-api', false).length === 0);

  // 5. Token-Bucket + Sliding Window Rate Limiter Tests
  console.log('\n5. Rate Limiter (Token Bucket + Sliding Window)');
  const limiter = new RateLimiter({ maxRequests: 2, windowMs: 100 });
  const r1 = limiter.consume('1.2.3.4:user1');
  const r2 = limiter.consume('1.2.3.4:user1');
  const r3 = limiter.consume('1.2.3.4:user1');
  assert('Allows first request', r1.allowed === true && r1.remaining === 1);
  assert('Allows second request', r2.allowed === true && r2.remaining === 0);
  assert('Blocks third request with retryAfterSec', r3.allowed === false && r3.retryAfterSec >= 1);

  await new Promise((r) => setTimeout(r, 115));
  const r4 = limiter.consume('1.2.3.4:user1');
  assert('Resets quota after window expires', r4.allowed === true);

  // 6. API Gateway Middleware Tests
  console.log('\n6. API Gateway Middleware (Correlation ID, Security Headers, Proxy Detection)');
  const headersSet: Record<string, string> = {};
  const mockReq: any = {
    headers: { 'x-forwarded-for': '203.0.113.10' },
  };
  const mockRes: any = {
    statusCode: 200,
    headersSent: false,
    setHeader(k: string, v: string) {
      headersSet[k] = String(v);
    },
    on() {},
    end() {},
  };

  let nextCalled = false;
  apiGatewayMiddleware(mockReq, mockRes, () => {
    nextCalled = true;
  });
  mockRes.end();

  assert('API Gateway calls next()', nextCalled);
  assert('API Gateway sets X-Request-ID', Boolean(headersSet['X-Request-ID']));
  assert('API Gateway sets X-Gateway header', headersSet['X-Gateway'] === 'BUBUBAI-Gateway/1.0');
  assert('API Gateway sets X-Content-Type-Options', headersSet['X-Content-Type-Options'] === 'nosniff');
  assert('API Gateway sets X-Response-Time', Boolean(headersSet['X-Response-Time']));
  assert('API Gateway detects Reverse Proxy headers', defaultGatewayState.proxyDetected === true);

  console.log('\n========================================');
  console.log(`📊 Infrastructure Test Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('========================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal infra test error:', err);
  process.exit(1);
});
