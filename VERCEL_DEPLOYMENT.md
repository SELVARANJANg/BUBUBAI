# BUBUBAI Multi-Provider AI Fallback & Vercel Deployment Guide

This document describes the multi-provider architecture, configuration parameters, Vercel deployment steps, supported models, and verification checklist for BUBUBAI.

---

## 1. Architecture & Fallback Workflow

BUBUBAI is architected with a resilient server-side provider orchestrator (`src/server/providers/providerManager.ts`):

```
                   User Chat Request
                           │
                           ▼
          Server Validation & Rate Limiting
            (IP Token Bucket & Max Length)
                           │
                           ▼
            ┌─────────────────────────────┐
            │   Google Gemini (Primary)   │
            └──────────────┬──────────────┘
                           │ ❌ 429 Rate Limit / Outage / 5xx
                           ▼
            ┌─────────────────────────────┐
            │   NVIDIA NIM (1st Fallback) │
            │ (meta/llama-3.3-70b-instruct)│
            └──────────────┬──────────────┘
                           │ ❌ Outage / Timeout / 5xx
                           ▼
            ┌─────────────────────────────┐
            │   OpenAI (2nd Fallback)     │
            │ (Optional: OPENAI_ENABLED=true)
            └──────────────┬──────────────┘
                           │ ❌ All Exhausted
                           ▼
            Friendly User-Safe Fallback
      "⚡ BUBUBAI servers are a little busy right now..."
```

### Key Protections
- **Zero API Key Leaks**: All API keys exist strictly server-side in Node/Vercel serverless functions. They are never exported into frontend bundles, HTML, or logs.
- **Circuit Breaker / Cooldown**: When a provider returns a 429 (quota exhausted), it is placed on a 60-second cooldown so subsequent user messages immediately failover without waiting on a known rate-limited provider.
- **Streaming Safety**: Provider fallback occurs safely before the first streaming token is transmitted. Once streaming starts, the connection is locked to prevent corrupted or duplicate responses.
- **Budget Protection**: OpenAI is a paid service; it is strictly gated behind `OPENAI_ENABLED=true` so you never incur unexpected charges.

---

## 2. Supported Models & Provider Configuration

| Provider | Environment Variable | Default Model | Supported Alternate Models |
| :--- | :--- | :--- | :--- |
| **Google Gemini** | `GEMINI_API_KEY` | `gemini-2.5-flash` | `gemini-3.8-flash`, `gemini-flash-latest` |
| **NVIDIA NIM** | `NVIDIA_API_KEY` | `meta/llama-3.3-70b-instruct` | `nvidia/llama-3.1-nemotron-70b-instruct`, `mistralai/mistral-large-2-instruct`, `deepseek-ai/deepseek-r1` |
| **OpenAI** (Optional) | `OPENAI_API_KEY` | `gpt-4o-mini` | `gpt-4o`, `o3-mini` |

---

## 3. Environment Variables Reference

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `GEMINI_API_KEY` | Yes | - | API Key from Google AI Studio. |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Selected Gemini model. |
| `NVIDIA_API_KEY` | Yes | - | API Key from NVIDIA build.nvidia.com. |
| `NVIDIA_MODEL` | No | `meta/llama-3.3-70b-instruct` | NVIDIA NIM model. |
| `OPENAI_API_KEY` | No | - | API Key from platform.openai.com. |
| `OPENAI_ENABLED` | No | `false` | Set to `"true"` to authorize OpenAI fallback usage. |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model ID. |
| `PROVIDER_PRIORITY`| No | `gemini,nvidia,openai` | Comma-separated order of providers. |
| `PROVIDER_TIMEOUT_MS` | No | `15000` | Timeout in ms before failing over (15s). |
| `MAX_MESSAGE_LENGTH` | No | `4000` | Max character length for user prompts. |
| `RATE_LIMIT_MAX_REQUESTS` | No | `30` | Max requests per minute per IP. |

---

## 4. Vercel Deployment Instructions

### Method A: Via Vercel Web Dashboard (Recommended)

1. **Log in to Vercel**:
   Go to [https://vercel.com](https://vercel.com) and navigate to your project (`bububai`).

2. **Go to Project Settings**:
   Click on the **Settings** tab in the top navigation bar.

3. **Navigate to Environment Variables**:
   In the left sidebar, click **Environment Variables**.

4. **Add the Secrets**:
   - Add `GEMINI_API_KEY`:
     - **Key**: `GEMINI_API_KEY`
     - **Value**: Your Gemini API key from Google AI Studio
     - **Environment**: Select `Production`, `Preview`, and `Development`
     - Click **Save**.
   - Add `NVIDIA_API_KEY`:
     - **Key**: `NVIDIA_API_KEY`
     - **Value**: Your NVIDIA NIM key (`nvapi-...`)
     - **Environment**: Select `Production`, `Preview`, and `Development`
     - Click **Save**.
   - (Optional) Add `OPENAI_API_KEY`:
     - **Key**: `OPENAI_API_KEY`
     - **Value**: Your OpenAI API key (`sk-...`)
     - Click **Save**.
   - (Optional) Add `OPENAI_ENABLED`:
     - **Key**: `OPENAI_ENABLED`
     - **Value**: `true`
     - Click **Save**.

5. **Redeploy Application**:
   - Go to the **Deployments** tab.
   - Click on the three dots `...` next to your latest deployment.
   - Select **Redeploy**.
   - Ensure the "Use existing Build Cache" toggle is unchecked if you want a clean rebuild.
   - Click **Redeploy**.

---

### Method B: Via Vercel CLI

If deploying via terminal or CI/CD:

```bash
# 1. Install or update Vercel CLI
npm install -g vercel

# 2. Link your project
vercel link

# 3. Add environment variables
vercel env add GEMINI_API_KEY production
vercel env add NVIDIA_API_KEY production
vercel env add OPENAI_API_KEY production
vercel env add OPENAI_ENABLED production

# 4. Deploy to production
vercel --prod
```

---

## 5. Verification & Test Checklist

- [x] **Primary Provider (Gemini)**: Validated to receive first priority on normal calls.
- [x] **Gemini 429 Quota Fallback**: When Gemini responds with 429 Rate Limit / Resource Exhausted, system immediately switches to NVIDIA NIM with zero user disruption.
- [x] **NVIDIA Failure Fallback**: When Gemini fails and NVIDIA encounters a 503/timeout, system falls back to OpenAI (if enabled).
- [x] **Missing API Keys**: Gracefully skips unconfigured providers without server crashes.
- [x] **Authentication Failures (401/403)**: Handled without retry storms or infinite loops.
- [x] **Timeout Handling**: Requests abort cleanly after 15 seconds and trigger automatic fallback.
- [x] **All Providers Unavailable**: Returns the friendly BUBUBAI signature message without leaking stack traces or credentials.
- [x] **Streaming Safety**: Preserves clean streaming without mixing tokens across providers.
- [x] **Cost Protection**: OpenAI remains disabled unless `OPENAI_ENABLED="true"`.
- [x] **Server Rate Limiter**: Enforces sliding window rate limits and length validation.
- [x] **UI Health Modal**: Accessible from the chat menu via `AI Fallbacks` to view live provider status.

---

## 6. Limitations & Notes

- **Network Egress**: Ensure your Vercel plan or server allows outgoing HTTPS traffic to `generativelanguage.googleapis.com`, `integrate.api.nvidia.com`, and `api.openai.com`.
- **NVIDIA NIM Credits**: NVIDIA Developer accounts receive 1,000 free inference credits upon signup at build.nvidia.com, providing generous free fallback quota.
