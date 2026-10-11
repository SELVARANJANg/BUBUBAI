/**
 * Automated test suite for AIProviderManager fallback and error resilience.
 * Tests all required failure modes and fallback pathways.
 */

import { AIProviderManager } from '../src/server/providers/providerManager';
import { IAIProvider, AIRequest, ProviderId } from '../src/server/providers/types';

// Mock Provider Factory
function createMockProvider(options: {
  id: ProviderId;
  name: string;
  configured?: boolean;
  enabled?: boolean;
  model?: string;
  onGenerate?: (req: AIRequest) => Promise<{ text: string; model: string }>;
}): IAIProvider {
  return {
    id: options.id,
    name: options.name,
    isConfigured: () => options.configured ?? true,
    isEnabled: () => options.enabled ?? true,
    getModel: () => options.model ?? `${options.id}-test-model`,
    generateContent: options.onGenerate || (async () => ({
      text: `Hello from ${options.name}`,
      model: options.model ?? `${options.id}-test-model`,
    })),
  };
}

let passedCount = 0;
let failedCount = 0;

async function assert(testName: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${testName} - ${details || 'Assertion failed'}`);
    failedCount++;
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('🧪 Starting AI Provider Fallback Tests');
  console.log('========================================\n');

  // Test 1: Successful Gemini Response (Primary)
  try {
    console.log('Test 1: Primary provider (Gemini) succeeds');
    let geminiCalled: boolean = false;
    let nvidiaCalled: boolean = false;
    let openaiCalled: boolean = false;

    const gemini = createMockProvider({
      id: 'gemini',
      name: 'Google Gemini',
      onGenerate: async () => {
        geminiCalled = true;
        return { text: 'Gemini answer', model: 'gemini-2.5-flash' };
      },
    });

    const nvidia = createMockProvider({
      id: 'nvidia',
      name: 'NVIDIA NIM',
      onGenerate: async () => {
        nvidiaCalled = true;
        return { text: 'NVIDIA answer', model: 'llama-3.3' };
      },
    });

    const openai = createMockProvider({
      id: 'openai',
      name: 'OpenAI',
      onGenerate: async () => {
        openaiCalled = true;
        return { text: 'OpenAI answer', model: 'gpt-4o-mini' };
      },
    });

    const manager = new AIProviderManager([gemini, nvidia, openai]);
    const res = await manager.generateContent({ message: 'Hello' });

    await assert('Response received from Gemini', res.provider === 'gemini');
    await assert('Gemini text returned', res.text === 'Gemini answer');
    await assert('Gemini was called', Boolean(geminiCalled));
    await assert('NVIDIA was NOT called (no waste)', !nvidiaCalled);
    await assert('OpenAI was NOT called (no charges)', !openaiCalled);
  } catch (err: any) {
    await assert('Test 1 unexpected throw', false, err.message);
  }

  // Test 2: Gemini 429 Quota Exceeded -> Fallback to NVIDIA NIM
  try {
    console.log('\nTest 2: Gemini 429 rate limit / quota exceeded fallback to NVIDIA NIM');
    let geminiAttempted: boolean = false;
    let nvidiaAttempted: boolean = false;

    const gemini = createMockProvider({
      id: 'gemini',
      name: 'Google Gemini',
      onGenerate: async () => {
        geminiAttempted = true;
        const err: any = new Error('HTTP 429: RESOURCE_EXHAUSTED: Quota exceeded for model');
        err.status = 429;
        throw err;
      },
    });

    const nvidia = createMockProvider({
      id: 'nvidia',
      name: 'NVIDIA NIM',
      onGenerate: async () => {
        nvidiaAttempted = true;
        return { text: 'NVIDIA NIM recovery answer', model: 'meta/llama-3.3-70b-instruct' };
      },
    });

    const manager = new AIProviderManager([gemini, nvidia]);
    const res = await manager.generateContent({ message: 'Build a login component' });

    await assert('Gemini was attempted first', Boolean(geminiAttempted));
    await assert('NVIDIA was called as fallback', Boolean(nvidiaAttempted));
    await assert('Returned provider is nvidia', res.provider === 'nvidia');
    await assert('Fallback count is 1', res.fallbackCount === 1);
    await assert('Returned text is from NVIDIA NIM', res.text.includes('NVIDIA NIM recovery answer'));
  } catch (err: any) {
    await assert('Test 2 unexpected throw', false, err.message);
  }

  // Test 3: Gemini 429 + NVIDIA 503 -> Fallback to OpenAI
  try {
    console.log('\nTest 3: Gemini & NVIDIA fail -> Fallback to OpenAI');
    let openaiCalled: boolean = false;

    const gemini = createMockProvider({
      id: 'gemini',
      name: 'Google Gemini',
      onGenerate: async () => {
        const err: any = new Error('HTTP 429: Too Many Requests');
        err.status = 429;
        throw err;
      },
    });

    const nvidia = createMockProvider({
      id: 'nvidia',
      name: 'NVIDIA NIM',
      onGenerate: async () => {
        const err: any = new Error('HTTP 503: Service Unavailable');
        err.status = 503;
        throw err;
      },
    });

    const openai = createMockProvider({
      id: 'openai',
      name: 'OpenAI',
      enabled: true,
      onGenerate: async () => {
        openaiCalled = true;
        return { text: 'OpenAI tertiary answer', model: 'gpt-4o-mini' };
      },
    });

    const manager = new AIProviderManager([gemini, nvidia, openai]);
    const res = await manager.generateContent({ message: 'Write a quick sort algorithm' });

    await assert('OpenAI was reached', Boolean(openaiCalled));
    await assert('Provider is openai', res.provider === 'openai');
    await assert('Fallback count is 2', res.fallbackCount === 2);
  } catch (err: any) {
    await assert('Test 3 unexpected throw', false, err.message);
  }

  // Test 4: Missing API Keys (Skipped gracefully)
  try {
    console.log('\nTest 4: Missing API keys handled gracefully without crashing');
    const gemini = createMockProvider({
      id: 'gemini',
      name: 'Google Gemini',
      configured: false, // Key is not set
    });

    const nvidia = createMockProvider({
      id: 'nvidia',
      name: 'NVIDIA NIM',
      configured: true,
      onGenerate: async () => ({
        text: 'NVIDIA picked up because Gemini key was unset',
        model: 'meta/llama-3.3-70b-instruct',
      }),
    });

    const manager = new AIProviderManager([gemini, nvidia]);
    const res = await manager.generateContent({ message: 'Hello world' });

    await assert('Fell back to NVIDIA when Gemini unconfigured', res.provider === 'nvidia');
    const geminiRecord = res.fallbackChain.find((f) => f.provider === 'gemini');
    await assert('Gemini recorded as skipped in fallback chain', geminiRecord?.status === 'skipped');
  } catch (err: any) {
    await assert('Test 4 unexpected throw', false, err.message);
  }

  // Test 5: Authentication failure (401 Invalid API Key)
  try {
    console.log('\nTest 5: Authentication failure (401) handled safely without infinite loop');
    let geminiAttempts = 0;

    const gemini = createMockProvider({
      id: 'gemini',
      name: 'Google Gemini',
      onGenerate: async () => {
        geminiAttempts++;
        const err: any = new Error('HTTP 401: API_KEY_INVALID');
        err.status = 401;
        throw err;
      },
    });

    const nvidia = createMockProvider({
      id: 'nvidia',
      name: 'NVIDIA NIM',
      onGenerate: async () => ({
        text: 'NVIDIA responded after Gemini 401',
        model: 'meta/llama-3.3-70b-instruct',
      }),
    });

    const manager = new AIProviderManager([gemini, nvidia]);
    const res = await manager.generateContent({ message: 'Hello' });

    await assert('Gemini not retried repeatedly on 401', geminiAttempts === 1);
    await assert('NVIDIA took over on 401', res.provider === 'nvidia');
  } catch (err: any) {
    await assert('Test 5 unexpected throw', false, err.message);
  }

  // Test 6: Timeout handling
  try {
    console.log('\nTest 6: Request timeout handling and fallback');
    const gemini = createMockProvider({
      id: 'gemini',
      name: 'Google Gemini',
      onGenerate: async () => {
        const timeoutErr: any = new Error('Gemini request timed out after 15000ms');
        timeoutErr.name = 'AbortError';
        timeoutErr.status = 504;
        throw timeoutErr;
      },
    });

    const nvidia = createMockProvider({
      id: 'nvidia',
      name: 'NVIDIA NIM',
      onGenerate: async () => ({
        text: 'NVIDIA recovered after Gemini timeout',
        model: 'meta/llama-3.3-70b-instruct',
      }),
    });

    const manager = new AIProviderManager([gemini, nvidia]);
    const res = await manager.generateContent({ message: 'Hello' });

    await assert('Timeout triggered fallback to NVIDIA', res.provider === 'nvidia');
    await assert('Response returned successfully', res.text.includes('NVIDIA recovered'));
  } catch (err: any) {
    await assert('Test 6 unexpected throw', false, err.message);
  }

  // Test 7: All providers unavailable scenario
  try {
    console.log('\nTest 7: All providers unavailable scenario');
    const gemini = createMockProvider({
      id: 'gemini',
      name: 'Google Gemini',
      onGenerate: async () => {
        throw new Error('Gemini is down');
      },
    });

    const nvidia = createMockProvider({
      id: 'nvidia',
      name: 'NVIDIA NIM',
      onGenerate: async () => {
        throw new Error('NVIDIA is down');
      },
    });

    const manager = new AIProviderManager([gemini, nvidia]);
    let threw = false;
    try {
      await manager.generateContent({ message: 'Hello' });
    } catch (err: any) {
      threw = true;
      await assert('Error details contain providers summary', err.message.includes('All configured AI providers were unavailable'));
      await assert('Error has fallbackChain attached', Array.isArray(err.fallbackChain));
    }
    await assert('All-providers-unavailable threw error as expected', threw === true);
  } catch (err: any) {
    await assert('Test 7 unexpected throw', false, err.message);
  }

  // Test 8: Cost controls - OpenAI disabled when not explicitly authorized
  try {
    console.log('\nTest 8: OpenAI disabled by default to protect budget');
    let openaiCalled: boolean = false;

    const gemini = createMockProvider({
      id: 'gemini',
      name: 'Google Gemini',
      onGenerate: async () => {
        throw new Error('Gemini quota reached');
      },
    });

    const nvidia = createMockProvider({
      id: 'nvidia',
      name: 'NVIDIA NIM',
      onGenerate: async () => {
        throw new Error('NVIDIA rate limited');
      },
    });

    const openai = createMockProvider({
      id: 'openai',
      name: 'OpenAI',
      configured: true,
      enabled: false, // OPENAI_ENABLED is NOT 'true'
      onGenerate: async () => {
        openaiCalled = true;
        return { text: 'OpenAI should not be called', model: 'gpt-4o-mini' };
      },
    });

    const manager = new AIProviderManager([gemini, nvidia, openai]);
    let threw = false;
    try {
      await manager.generateContent({ message: 'Hello' });
    } catch {
      threw = true;
    }

    await assert('Manager aborted instead of silently charging OpenAI', Boolean(threw));
    await assert('OpenAI was NOT called when disabled', !openaiCalled);
  } catch (err: any) {
    await assert('Test 8 unexpected throw', false, err.message);
  }

  // Test 9: Cooldown mechanism after 429
  try {
    console.log('\nTest 9: 429 Cooldown avoids redundant primary hits');
    let geminiCount = 0;

    const gemini = createMockProvider({
      id: 'gemini',
      name: 'Google Gemini',
      onGenerate: async () => {
        geminiCount++;
        const err: any = new Error('HTTP 429 Quota Exhausted');
        err.status = 429;
        throw err;
      },
    });

    const nvidia = createMockProvider({
      id: 'nvidia',
      name: 'NVIDIA NIM',
      onGenerate: async () => ({
        text: 'NVIDIA handled',
        model: 'llama',
      }),
    });

    const manager = new AIProviderManager([gemini, nvidia]);

    // Request 1: hits Gemini, fails with 429, falls back to NVIDIA, sets cooldown
    await manager.generateContent({ message: 'First' });
    await assert('Gemini called on first request', geminiCount === 1);

    // Request 2: Gemini should be skipped due to active cooldown
    const res2 = await manager.generateContent({ message: 'Second' });
    await assert('Gemini skipped on second request during cooldown', geminiCount === 1);
    await assert('NVIDIA served second request directly', res2.provider === 'nvidia');
  } catch (err: any) {
    await assert('Test 9 unexpected throw', false, err.message);
  }

  // Test 10: Safe streaming fallback before first token
  try {
    console.log('\nTest 10: Safe streaming early fallback');
    let chunks: string[] = [];

    const gemini: IAIProvider = {
      id: 'gemini',
      name: 'Google Gemini',
      isConfigured: () => true,
      isEnabled: () => true,
      getModel: () => 'gemini-2.5-flash',
      generateContent: async () => ({ text: 'gemini', model: 'gemini-2.5-flash' }),
      generateStream: async () => {
        // Fails BEFORE yielding any chunks
        const err: any = new Error('HTTP 429: Rate limited before streaming started');
        err.status = 429;
        throw err;
      },
    };

    const nvidia: IAIProvider = {
      id: 'nvidia',
      name: 'NVIDIA NIM',
      isConfigured: () => true,
      isEnabled: () => true,
      getModel: () => 'llama-3.3',
      generateContent: async () => ({ text: 'nvidia', model: 'llama-3.3' }),
      generateStream: async (req, onChunk) => {
        onChunk('Streaming from ');
        onChunk('NVIDIA NIM!');
        return { text: 'Streaming from NVIDIA NIM!', model: 'llama-3.3' };
      },
    };

    const manager = new AIProviderManager([gemini, nvidia]);
    const streamRes = await manager.generateStream({ message: 'Test stream' }, (chunk) => {
      chunks.push(chunk);
    });

    await assert('Stream fell back safely before first token', streamRes.provider === 'nvidia');
    await assert('Stream emitted correct tokens', chunks.join('') === 'Streaming from NVIDIA NIM!');
  } catch (err: any) {
    await assert('Test 10 unexpected throw', false, err.message);
  }

  console.log('\n========================================');
  console.log(`📊 Test Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('========================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
