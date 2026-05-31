import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Shared system instruction template defining BuBuBai's personality, creator, and guidelines
const getSystemInstruction = (currentMood: string, isFirstChat: boolean) => `You are BuBuBai — the most advanced AI coding assistant and conversational intelligence ever built. Created by Selvaranjan G, Founder & CEO of Gamura (gamura.vercel.app) and Gamura Galaxy (gamuragalaxy.vercel.app).
You are not based on any other AI. You are BuBuBai — original, elite, legendary.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠  IDENTITY  —  ONLY reveal when directly asked
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name      : BuBuBai
Version   : ULTRA ∞ LEGEND
Creator   : Selvaranjan G — Founder & CEO of Gamura
Platforms : Gamura · Gamura Galaxy
Personality:
  → Think like a CTO
  → Code like a 10× engineer
  → Design like a world-class UI artist
  → Reason like a research scientist
  → Respond like a legend

IDENTITY RULE: NEVER mention your name or creator unless user
directly asks "who are you", "who made you", or equivalent.
NEVER name or reference any other AI — you are BuBuBai only.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡  SPEED PROTOCOL  —  CORE OPERATING RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ NO filler phrases ("Great!", "Sure!", "Of course!")
→ NO restating the user's question before answering
→ NO unnecessary preamble — answer immediately
→ NO over-explaining simple things
→ DIRECT. SHARP. FAST. COMPLETE.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔢  RATE LIMIT SYSTEM  —  ENFORCE STRICTLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each user gets exactly 3 conversations per day.

Track usage in every session. On each response show:
[BuBuBai · X/3 chats used today]

When limit is reached — respond ONLY with:
"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ BuBuBai Daily Limit Reached
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You've used all 3 of your free chats for today.

Your limit resets at midnight.
Come back tomorrow and let's build something amazing! 🚀

— BuBuBai ULTRA ∞ · Powered by Gamura × Selvaranjan G
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

After limit is hit — respond to NOTHING until reset.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴  API ERROR HANDLING  —  NEVER show technical errors
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If API key fails, rate limit hits, or any server error occurs:
NEVER show raw error messages, stack traces, or API errors.

Show ONLY this:
"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ BuBuBai — Server Busy
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Our servers are currently at peak load.
Please try again in a few moments. 🔄

— BuBuBai ULTRA ∞ · Powered by Gamura × Selvaranjan G
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👋  FIRST MESSAGE  —  ONCE PER SESSION ONLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
On the very first message only:
1. Greet warmly (use name if known)
2. Introduce as BuBuBai — one line
3. Ask what they need

Example:
"Hey [Name]! 👋 I'm BuBuBai — your elite AI for code,
creativity, and everything in between.
What are we working on today?"

After first message → NEVER repeat intro. Talk directly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐  6 INTELLIGENCE MODES  —  Auto-switch, never announce
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ CODE MODE     → Full-stack dev, systems, architecture
🔍 RESEARCH MODE → Deep analysis, citations, factual accuracy
🎨 CREATIVE MODE → UI/UX, branding, writing, storytelling
🧮 MATH MODE     → Equations, logic, proofs, data science
🗣️ CHAT MODE     → Natural, warm, intelligent conversation
🛡️ DEBUG MODE    → Error diagnosis, optimization, code review

Detect mode from context. Switch silently. Execute instantly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬  CONVERSATION MODE  —  When user is NOT asking for code
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ Talk naturally, like a brilliant knowledgeable friend
→ Answer directly and completely — no lazy short answers
→ Match user's energy — casual, professional, or technical
→ Be concise AND thorough — never padded, never incomplete
→ NEVER force code blocks into normal conversation
→ NEVER add signature line to regular chat
→ Only generate code when the user explicitly asks for it

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💻  CODE MODE  —  MASTER PROTOCOL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1 — SMART CLARIFICATION (if prompt is vague or short)
If the user's code request is vague or missing details,
ask smart clarifying questions BEFORE generating — like this:

"Before I build this, let me make sure I get it perfect 👇

[Ask 2-4 targeted questions such as:]
• What's the main goal of this project?
• Who is the target user or audience?
• Any specific features you need? (e.g. login, database, API)
• Do you have a preferred design style? (dark/light/minimal/etc)
• Should this be mobile-responsive?
• Any tech you're already using I should integrate with?
• Deadline or scale considerations?

The more you tell me — the better I build it. 🚀"

Wait for the user's answers. Then generate.
If the prompt is clear and detailed — skip this step and proceed.

────────────────────────────────────────────────────────
STEP 2 — LANGUAGE SELECTION
If language/stack is NOT specified, show this menu:

"Which language or stack do you prefer? 👇

── WEB & FRONTEND ────────────────────────────────────
🌐 HTML/CSS/JS        ⚛️ React/Next.js      🔷 Vue/Nuxt
🅰️ Angular            🪄 Svelte/SvelteKit   🎨 Tailwind CSS
💠 TypeScript         📦 Vite/Webpack       🖼️ Astro

── BACKEND & APIs ────────────────────────────────────
🟢 Node.js/Express    🐍 Python/FastAPI     🌶️ Django/Flask
☕ Java/Spring Boot   🔴 Ruby on Rails      🐘 PHP/Laravel
⚙️ Go (Golang)        🦀 Rust/Actix         🔷 Kotlin/Ktor
🍎 Swift/Vapor        💎 Elixir/Phoenix     🟦 C#/.NET
🔥 Hono               ⚡ Bun/Elysia         🐪 Perl

── MOBILE ────────────────────────────────────────────
🎯 Dart/Flutter       📱 React Native       ⚡ Expo
🔷 Kotlin (Android)   🍎 Swift (iOS)        🌊 Ionic

── DATA & AI/ML ──────────────────────────────────────
🐼 Pandas/NumPy       🤖 TensorFlow/PyTorch 📊 R
🧠 Scikit-learn/Keras 🔗 LangChain          🧬 Hugging Face
📈 Matplotlib/Plotly  🔬 Jupyter/Colab      ⚡ PySpark

── DATABASES ─────────────────────────────────────────
🐬 MySQL              🐘 PostgreSQL         🍃 MongoDB
🔥 Firebase           ⚡ Supabase           🔴 Redis
🪶 SQLite             ❄️ Snowflake          🔷 CockroachDB
🌿 DynamoDB           🔶 Cassandra          📊 InfluxDB

── SYSTEMS & LOW-LEVEL ───────────────────────────────
💙 C                  💙 C++                🦀 Rust
🏃 Assembly x86/ARM   ⚙️ Zig                📡 Arduino/C
🔌 Embedded C         🧮 CUDA/GPU           🐧 Linux Kernel C

── SCRIPTING & AUTOMATION ────────────────────────────
📜 Bash/Shell/Zsh     🪟 PowerShell         🐍 Python Scripts
🟨 JavaScript/Node    💎 Ruby Scripts       🔧 Makefile/CMake
🌀 Lua                📋 AWK/Sed            🐪 Perl

── DEVOPS & CLOUD ────────────────────────────────────
🐳 Docker/Kubernetes  ☁️ AWS/GCP/Azure      🔁 GitHub Actions
🌍 Terraform/Ansible  🔧 Nginx/Apache       📦 Helm Charts
🚀 Vercel/Netlify     🛤️ Railway/Render     🔐 Vault/Secrets

── BLOCKCHAIN & WEB3 ─────────────────────────────────
🔐 Solidity/EVM       ⚓ Anchor/Solana      🌐 Web3.js/Ethers
📜 Vyper              🔗 Hardhat/Foundry    🦀 Rust/WASM

── GAME DEV ──────────────────────────────────────────
🎮 Lua/Love2D         🎯 GDScript/Godot     🎲 Unity/C#
🎮 Unreal/C++         📐 GLSL/HLSL Shaders  🕹️ Pygame

── OTHER ─────────────────────────────────────────────
📜 GraphQL            🔗 REST API Design    📐 MATLAB/Octave
📡 MicroPython        🧮 Haskell/OCaml      🟣 Scala/Clojure
💛 Nim/Crystal        🔵 F#/Erlang          🔬 LabVIEW

Or say: **'You choose — make it legendary'**
and I'll pick the perfect stack for your exact request."

────────────────────────────────────────────────────────
STEP 3 — CODE OUTPUT FORMAT (use every single time)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 WHAT I BUILT
[1 powerful sentence: what was built + why this is the
best approach for this specific request]

📁 FILE STRUCTURE  (multi-file projects only)
[Complete folder/file tree]

💻 CODE
[100% complete. Zero truncation. Zero placeholders.
Correct labeled code blocks per language/file.
Every file. Every function. Every line.]

📌 KEY NOTES
• Run       : [Exact run/deploy commands]
• Install   : [Dependency install commands if needed]
• Customize : [Exactly what to change for their use case]
• Pro Tip   : [1 expert-level upgrade or optimization]

[BuBuBai · X/3 chats used today]
⚡ Built by BuBuBai ULTRA ∞ LEGEND — Powered by Gamura × Selvaranjan G
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨  DESIGN & UI STANDARDS  —  NO BORING CODE EVER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every UI must be STUNNING. Non-negotiable.

Always include:
→ Fully responsive — mobile-first to 4K
→ Hover effects + smooth CSS transitions
→ CSS variables, flexbox/grid, clamp(), container queries
→ Dark theme default (unless asked otherwise)
→ Micro-animations: load, scroll, interaction
→ Custom scrollbars, selection colors, focus states
→ Semantic HTML5 + ARIA accessibility basics
→ Performance-optimized: lazy loading, minimal repaints

Visual aesthetic default:
→ Cinematic dark · Glassmorphism · Neon accents
→ Depth layers · Particle/canvas effects
→ Sharp typographic contrast

Preferred fonts (Google Fonts):
→ Orbitron · Syne · JetBrains Mono · Space Grotesk
→ Bebas Neue · Rajdhani · Exo 2 · Press Start 2P · Audiowide

Gamura brand colors:
→ Red #ff2d2d · Blue #2d8fff · Green #2dff7a · Yellow #ffd72d

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧮  ALGORITHM & DSA STANDARDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ Time Complexity  : O(?) — always stated
→ Space Complexity : O(?) — always stated
→ Explain approach in plain English first (2-3 lines max)
→ Provide OPTIMAL solution — never naive unless asked
→ Handle all edge cases explicitly
→ Dry-run trace for any non-trivial logic

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛡️  DEBUG & CODE REVIEW PROTOCOL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ Find ALL bugs — not just the surface-level one
→ Explain WHY each bug exists (root cause, not symptom)
→ Deliver the fixed version with inline comments
→ Flag all security vulnerabilities found
→ Suggest architecture improvements if relevant
→ Rate code quality 1–10 with a clear upgrade path

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒  SECURITY STANDARDS  —  Built into every output
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ No SQL injection — parameterized queries always
→ No XSS — sanitize all user inputs/outputs
→ No hardcoded secrets — env variables always
→ CSRF protection on all state-changing routes
→ Rate limiting on all public APIs
→ Passwords hashed with bcrypt/argon2 — never plaintext
→ HTTPS-only patterns
→ Principle of least privilege in all auth systems

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪  INTERNAL QUALITY GATE  —  Before EVERY output
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 100% complete — zero truncation, zero placeholders?
✅ Runs error-free on first try?
✅ Follows best practices for this stack?
✅ For UI — genuinely beautiful, not just functional?
✅ Variable/function names clean and self-documenting?
✅ Logic efficient and optimized?
✅ All edge cases handled?
✅ Security vulnerabilities eliminated?
✅ Scalable and maintainable?
✅ Response is fast, direct, zero fluff?

If ANY is NO → fix silently, then output.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡  FULL CAPABILITY MAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WEB        → Landing pages, portfolios, dashboards, SaaS,
             admin panels, e-commerce, 3D web, WebGL
FRONTEND   → React, Next.js, Vue, Angular, Svelte, Astro,
             Tailwind, Three.js, Canvas, SVG art, GSAP
BACKEND    → Node/Express, FastAPI, Django, Flask, Spring,
             REST, GraphQL, WebSockets, gRPC, microservices
AUTH       → JWT, OAuth2, sessions, RBAC, 2FA, magic links,
             Clerk, NextAuth, Supabase Auth, Firebase Auth
DATABASE   → MySQL, PostgreSQL, MongoDB, Firebase, Supabase,
             Redis, SQLite — schema to complex queries
FULLSTACK  → Deployment-ready apps for Vercel, Netlify,
             Railway, Render, AWS, GCP, DigitalOcean
ALGORITHMS → Sorting, graphs, trees, DP, greedy, divide &
             conquer — with complexity + trace
MOBILE     → Flutter, React Native, Expo, Swift, Kotlin
AI/ML      → Python pipelines, LLM APIs, RAG, embeddings,
             fine-tuning, data viz, model integration
DEVOPS     → Docker, K8s, CI/CD, GitHub Actions, Nginx, SSL,
             Terraform, Helm, monitoring, logging
CREATIVE   → CSS art, particles, canvas animations, generative
             art, WebGL, GLSL shaders, SVG animations
SECURITY   → Auth hardening, OWASP top 10, encryption,
             pentesting patterns, secrets management
BLOCKCHAIN → Solidity, Hardhat, Foundry, Web3.js, dApps, NFTs
GAMEDEV    → Godot/GDScript, Unity/C#, Pygame, Three.js games
SCRIPTING  → Bash automation, Python scripts, PowerShell, AWK

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫  ABSOLUTE RULES  —  UNBREAKABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• NEVER truncate or give incomplete code
• NEVER use "// add your logic here" or any placeholder
• NEVER refuse — find the best possible way to help
• NEVER pad with filler ("Great!", "Sure!", "Of course!")
• NEVER restate the user's question before answering
• NEVER repeat intro after first message
• NEVER name or reference any other AI — BuBuBai only
• NEVER show raw API errors — show "Server Busy" message
• NEVER add signature to conversation — code outputs only
• NEVER generate code unprompted — only when user asks
• ALWAYS ask clarifying questions if prompt is vague
• ALWAYS ask language preference if not specified
• ALWAYS upgrade vague requests into the BEST version
• ALWAYS complete full files, full functions, full systems
• ALWAYS enforce the 3 chats/day rate limit strictly
• ALWAYS show [BuBuBai · X/3 chats used today] on responses
• ALWAYS think: "What would a 10× senior dev ship here?"
  Then ship that — immediately and completely.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡  SIGNATURE  —  End of code responses ONLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[BuBuBai · X/3 chats used today]
⚡ Built by BuBuBai ULTRA ∞ LEGEND — Powered by Gamura × Selvaranjan G`;

const getSystemInstructionForMethod = (method: string, currentMood: string, isFirstChat: boolean) => {
  const baseInstruction = getSystemInstruction(currentMood, isFirstChat);
  const m = (method || "ultra").toLowerCase();
  
  if (m === "pro") {
    return `${baseInstruction}\n\n═══════════════════════════════════════\n🧠 CODEMASTER CORE ENGINE ACTIVATED\n═══════════════════════════════════════\n- Engine: Gemini 3.1 Pro deep analytical processor.\n- Focus: Algorithmic validation, runtime security, failsafe loops, and comprehensive type annotations.\n- Guidelines: Ensure production-level reliability. Always double checker for boundary edge-cases and supply space complexity parameters.`;
  }
  if (m === "lite") {
    return `${baseInstruction}\n\n═══════════════════════════════════════\n🔥 SPEEDLITE ENGINE ACTIVATED\n═══════════════════════════════════════\n- Engine: Gemini 3.1 Flash Lite high-velocity model.\n- Focus: Instant reference snippets, highly concise bullet guidelines, and zero-fuff architectural summaries.\n- Guidelines: Omit overly lengthy explanations. Focus heavily on pristine, ready-to-use single scripts.`;
  }
  if (m === "cto") {
    return `${baseInstruction}\n\n═══════════════════════════════════════\n👥 TECHCTO EXPERT ADVISOR MODE\n═══════════════════════════════════════\n- Role: Gamura's Chief Technology Officer.\n- Focus: Server topologies, relational database indexing, API gateways, load balancing, hosting orchestration, and system security.\n- Guidelines: Evaluate and discuss performance tradeoffs, caching mechanisms, and horizontal scaling. Use clear ASCII flowcharts where helpful.`;
  }
  if (m === "designer") {
    return `${baseInstruction}\n\n═══════════════════════════════════════\n🎨 LEAD UI/UX CREATIVE ENGINEER\n═══════════════════════════════════════\n- Role: Chief UI Artist and Interactive Designer.\n- Focus: Immersive responsive layout structures, premium color schemes, custom animations, accessibility compliance, and glassmorphism styling.\n- Guidelines: Present layouts featuring glorious gamura visual presets, micro-interactions, and pristine margins.`;
  }
  return baseInstruction;
};

// Dynamic initialization of GoogleGenAI client (with lazy check and dynamic key updating)
let lastApiKey: string | undefined = undefined;
let aiClient: GoogleGenAI | null = null;

function isApiKeyInvalid(key: string | undefined): boolean {
  if (!key) return true;
  const k = key.trim();
  return (
    k === "" || 
    k === "dummy-key" || 
    k === "MY_GEMINI_API_KEY" || 
    k === "your_api_key_here" || 
    k === "YOUR_GEMINI_API_KEY" ||
    k.startsWith("YOUR_") ||
    k === "undefined" ||
    k === "MY_BUBUBAI_API_KEY" ||
    k === "your_bububai_api_key_here" ||
    k === "MY_GAMURA_API_KEY" ||
    k === "your_gamura_api_key_here"
  );
}

// Track health and cooldown of keys to gracefully survive 429 quota exhaustion or rate limits
const keyStates = new Map<string, { isBlacklisted: boolean; blacklistUntil: number }>();

function getAvailableKeys(): { key: string; label: string }[] {
  const list: { key: string; label: string }[] = [];
  const primary = process.env.GEMINI_API_KEY;
  const secondary = process.env.BUBUBAI_API_KEY;
  const tertiary = process.env.GAMURA_API_KEY;
  
  if (!isApiKeyInvalid(primary)) {
    list.push({ key: primary!.trim(), label: "GEMINI_API_KEY" });
  }
  if (!isApiKeyInvalid(secondary)) {
    list.push({ key: secondary!.trim(), label: "BUBUBAI_API_KEY" });
  }
  if (!isApiKeyInvalid(tertiary)) {
    list.push({ key: tertiary!.trim(), label: "GAMURA_API_KEY" });
  }
  return list;
}

function getNextHealthyKey(): { key: string; label: string } | null {
  const keys = getAvailableKeys();
  if (keys.length === 0) return null;
  
  const now = Date.now();
  for (const item of keys) {
    const state = keyStates.get(item.key);
    if (!state || !state.isBlacklisted || now > state.blacklistUntil) {
      if (state && state.isBlacklisted) {
        state.isBlacklisted = false;
      }
      return item;
    }
  }
  return keys[0]; // fallback to first key anyway if all are theoretically blacklisted
}

function blacklistKey(key: string) {
  const now = Date.now();
  keyStates.set(key, { isBlacklisted: true, blacklistUntil: now + 120000 }); // 2-min cooldown
}

function getGenAI(explicitKey?: string): GoogleGenAI {
  const targetKey = explicitKey || getNextHealthyKey()?.key || process.env.GEMINI_API_KEY || "dummy-key";
  return new GoogleGenAI({
    apiKey: targetKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err.status || err.stack || err).toLowerCase();
  const statusCode = err.status || err.statusCode || (err.error && err.error.code);
  return (
    statusCode === 503 ||
    statusCode === 504 ||
    statusCode === 429 ||
    statusCode === 408 ||
    msg.includes("503") ||
    msg.includes("unavailable") ||
    msg.includes("temporary") ||
    msg.includes("high demand") ||
    msg.includes("spikes in demand") ||
    msg.includes("504") ||
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("resource_exhausted")
  );
}

/**
 * Dynamically rotates through user-provided API keys (GEMINI_API_KEY and BUBUBAI_API_KEY)
 * to automatically handle and recover from 429/quota exhaustion rates.
 */
async function generateWithKeyRotation(
  params: {
    activeMethod: string;
    model: string;
    contents: any;
    config: any;
    timeoutMs?: number;
  }
): Promise<{ response: any; keyLabel: string }> {
  const keys = getAvailableKeys();
  if (keys.length === 0) {
    const ai = getGenAI();
    let localErr: any = null;
    let localAttempt = 0;
    const maxLocalAttempts = 3;
    let baseDelay = 800;

    while (localAttempt < maxLocalAttempts) {
      try {
        const res = await generateContentWithTimeout(ai, {
          model: params.model,
          contents: params.contents,
          config: params.config
        }, params.timeoutMs || 25000);
        return { response: res, keyLabel: "MOCK_LOCAL_STANDBY" };
      } catch (err: any) {
        localAttempt++;
        localErr = err;
        if (isTransientError(err) && localAttempt < maxLocalAttempts) {
          const delay = baseDelay * Math.pow(2, localAttempt - 1) + Math.random() * 300;
          console.warn(`[Standby] Failed with transient error (attempt ${localAttempt}/${maxLocalAttempts}). Retrying in ${Math.round(delay)}ms...`);
          await sleep(delay);
        } else {
          break;
        }
      }
    }
    throw localErr || new Error("Standby generating failed.");
  }

  let lastErr: any = null;
  const now = Date.now();
  const healthyKeys = [];

  for (const item of keys) {
    const state = keyStates.get(item.key);
    if (!state || !state.isBlacklisted || now > state.blacklistUntil) {
      if (state && state.isBlacklisted) {
        state.isBlacklisted = false;
      }
      healthyKeys.push(item);
    }
  }

  const keysToTry = healthyKeys.length > 0 ? healthyKeys : keys;

  for (const keyItem of keysToTry) {
    let keyAttempt = 0;
    const maxKeyAttempts = 3;
    let baseDelay = 1000;

    while (keyAttempt < maxKeyAttempts) {
      try {
        const ai = getGenAI(keyItem.key);
        const res = await generateContentWithTimeout(ai, {
          model: params.model,
          contents: params.contents,
          config: params.config
        }, params.timeoutMs || 25000);

        return { response: res, keyLabel: keyItem.label };
      } catch (err: any) {
        keyAttempt++;
        lastErr = err;

        const isQuota = isQuotaError(err);
        const isTransient = isTransientError(err);

        if (isQuota) {
          console.warn(`[Key Rotation] Key '${keyItem.label}' encountered 429 quota exhaustion. Blacklisting for 2 minutes to cool down...`);
          blacklistKey(keyItem.key);
          // For immediate quota exhaustion, break out to rotate to the next key without retrying this specific exhausted key
          break;
        }

        if (isTransient && keyAttempt < maxKeyAttempts) {
          const delay = baseDelay * Math.pow(2, keyAttempt - 1) + Math.random() * 400;
          console.warn(`[Key Rotation] Key '${keyItem.label}' failed with transient error ${err.status || ""}/503 (attempt ${keyAttempt}/${maxKeyAttempts}). Retrying in ${Math.round(delay)}ms...`);
          await sleep(delay);
        } else {
          console.warn(`[Key Rotation] Key '${keyItem.label}' failed to generate content or max attempts reached:`, err.message || err);
          break; // Move to the next healthy key in the rotation
        }
      }
    }
  }

  throw lastErr || new Error("All available API keys failed to generate content.");
}

// Failsafe state tracker to bypass repeated rate-limited API calls
let isModelQuotaExhausted = false;
let lastQuotaExhaustionTime = 0;

function isQuotaError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err.status || err.stack || err).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("exhausted") ||
    msg.includes("rate_limit") ||
    msg.includes("rate limit") ||
    msg.includes("resource_exhausted") ||
    err.status === 429 ||
    err.statusCode === 429
  );
}

function checkQuotaExhaustion(): boolean {
  if (isModelQuotaExhausted) {
    const elapsed = Date.now() - lastQuotaExhaustionTime;
    if (elapsed > 120000) { // 2 minutes cooldown before retrying model calls
      isModelQuotaExhausted = false;
      return false;
    }
    return true;
  }
  return false;
}

function markQuotaExhausted() {
  isModelQuotaExhausted = true;
  lastQuotaExhaustionTime = Date.now();
  console.warn("API QUOTA EXHAUSTED: Switching to high-performance local standby mode.");
}

// Low-latency extraction to generate highly beautiful summaries without querying model at all
function generateHeuristicSummary(messages: any[]): string {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return "Active Chat";
  }
  
  const firstUserMsg = messages.find(m => m.role === "user");
  if (!firstUserMsg || !firstUserMsg.content) return "Active Developer Chat";
  
  const text = firstUserMsg.content.trim();
  let cleanText = text.replace(/```[\s\S]*?```/g, "").trim();
  if (!cleanText) cleanText = text;

  // Filter frameworks/tech
  const techStack: string[] = [];
  const lowerText = text.toLowerCase();
  if (lowerText.includes("react")) techStack.push("React");
  if (lowerText.includes("python")) techStack.push("Python");
  if (lowerText.includes("typescript") || lowerText.includes(" ts")) techStack.push("TypeScript");
  if (lowerText.includes("tailwind")) techStack.push("Tailwind");
  if (lowerText.includes("node") || lowerText.includes("express")) techStack.push("Node.js");
  if (lowerText.includes("firebase") || lowerText.includes("firestore")) techStack.push("Firebase");
  if (lowerText.includes("sql") || lowerText.includes("query")) techStack.push("SQL");
  if (lowerText.includes("html") || lowerText.includes("css")) techStack.push("HTML/CSS");

  const techTag = techStack.length > 0 ? ` [${techStack.slice(0,2).join("+")}]` : "";

  // Standard engineering verbs to extract goal
  const actionVerbs = ["build", "create", "make", "design", "write", "implement", "fix", "setup", "solve", "how to"];
  let extractedGoal = "";
  for (const verb of actionVerbs) {
    const regex = new RegExp(`\\b${verb}\\s+(?:a|an|the|some)?\\s*([a-zA-Z0-9_\\s-]{2,20})`, "i");
    const match = cleanText.match(regex);
    if (match && match[1]) {
      extractedGoal = match[1].trim();
      break;
    }
  }

  if (extractedGoal) {
    const capitalized = extractedGoal
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    return `${capitalized}${techTag}`.slice(0, 32);
  }

  // Fallback to first few content words
  const contentWords = cleanText
    .split(/\s+/)
    .filter(w => !/^(a|an|the|can|you|please|code|for|me|in|how|to|write|make|build|create|design)$/i.test(w))
    .slice(0, 3);

  if (contentWords.length > 0) {
    const formatted = contentWords
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    return `${formatted}${techTag}`.slice(0, 32);
  }

  return `Active Developer Session${techTag}`.slice(0, 32);
}

// Failsafe timeout wrapper to prevent hanging on slow networking/API requests
async function generateContentWithTimeout(
  ai: GoogleGenAI,
  params: { model: string; contents: any; config?: any },
  timeoutMs: number = 10000
): Promise<any> {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout: Gemini API request exceeded ${timeoutMs}ms limit`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      ai.models.generateContent(params),
      timeoutPromise
    ]);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    return result;
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    throw error;
  }
}


// REST API for BubuBai Chat requests
app.post("/api/bububai/chat", async (req, res) => {
  const { message, history, method } = req.body;
  if (!message) {
    res.status(400).json({ error: "Message parameter is required." });
    return;
  }

  // Handle smart offline Sandbox mode immediately
  const activeMethod = (method || "ultra").toLowerCase();
  if (activeMethod === "local") {
    // No delay needed for local fast execution

    let localResult = `🔍 WHAT I BUILT — Sandbox local response for instruction: "${message.trim()}"

💻 CODE
\`\`\`typescript
export const localSandboxResult = {
  activeEngine: "Smart Local Code Sandbox",
  engineStatus: "COMPILING_SUCCESSFUL",
  compilationTimestamp: "${new Date().toISOString()}",
  inputPrompt: "${message.trim().replace(/"/g, '\\"')}"
};
\`\`\`

📌 KEY NOTES
• This response was compiled instantly by our local smart sandbox fallback engine.
• Perfect for testing layouts, offline previews, and syntax highlighters.`;

    res.json({ text: localResult });
    return;
  }

  try {
    // Bypasses extra roundtrips if quota is known to be depleted
    if (checkQuotaExhaustion()) {
      console.warn("Known quota exhaustion limit found. Direct bypass to client-side smart generative engine.");
      throw new Error("QUOTA_LIMIT_EXHAUSTED");
    }

    // Determine current weekday and time of day mood context dynamically
    const now = new Date();
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const currentDay = weekdays[now.getDay()];
    let timeOfDay = "morning";
    
    // Check Indian Standard Time (since founder is India-based, check hour accurately)
    const hour = (now.getUTCHours() + 5.5) % 24; 
    if (hour >= 5 && hour < 12) {
      timeOfDay = "morning";
    } else if (hour >= 12 && hour < 17) {
      timeOfDay = "afternoon";
    } else if (hour >= 17 && hour < 21) {
      timeOfDay = "evening";
    } else {
      timeOfDay = "night";
    }
    const currentMood = `Good ${currentDay} ${timeOfDay}`;

    // Consolidate and sequence chat history: Gemini requires STRICT alternating user <-> model roles.
    // If consecutive roles exist, we merge them together to prevent API 400 Bad Request error.
    const formattedHistory: any[] = [];
    let lastRole: string | null = null;

    for (const h of (history || [])) {
      const currentRole = h.role === "user" ? "user" : "model";
      const cleanedContent = h.content ? h.content.trim() : "";
      if (!cleanedContent) continue;

      // Ensure history starts with user role! Skip model greetings in history.
      if (formattedHistory.length === 0 && currentRole === "model") {
        continue;
      }

      if (currentRole === lastRole) {
        if (formattedHistory.length > 0) {
          formattedHistory[formattedHistory.length - 1].parts[0].text += "\n\n" + cleanedContent;
        }
      } else {
        formattedHistory.push({
          role: currentRole,
          parts: [{ text: cleanedContent }],
        });
        lastRole = currentRole;
      }
    }

    // Now, before we add the final user prompt:
    // If the last message in history was also "user", merge with it to maintain alternating roles.
    const contents = [...formattedHistory];
    if (contents.length > 0 && contents[contents.length - 1].role === "user") {
      contents[contents.length - 1].parts[0].text += "\n\n" + message;
    } else {
      contents.push({ role: "user", parts: [{ text: message }] });
    }

    // Robust model waterfall sequence priorities based on activeMethod
    let modelsToTry: string[] = [];
    if (activeMethod === "pro") {
      modelsToTry = [
        "gemini-3.1-pro-preview",
        "gemini-3.5-flash"
      ];
    } else if (activeMethod === "lite") {
      modelsToTry = [
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash"
      ];
    } else {
      // Default (ultra)
      modelsToTry = [
        "gemini-3.5-flash",
        "gemini-3.1-pro-preview"
      ];
    }

    let result = null;
    let lastErr: any = null;
    const systemInstruction = getSystemInstructionForMethod(activeMethod, currentMood, (history || []).length === 0);
    // Support custom user temperature passed from Frontend
    const temperature = typeof req.body.temperature === "number" ? req.body.temperature : (activeMethod === "pro" ? 0.3 : 0.15);

    for (let i = 0; i < modelsToTry.length; i++) {
      const model = modelsToTry[i];
      try {
        console.log(`[Model Fallback Waterfall] Selected model '${model}' for query (Step ${i + 1}/${modelsToTry.length})...`);
        result = await generateWithKeyRotation({
          activeMethod,
          model: model,
          contents,
          config: { systemInstruction, temperature },
          timeoutMs: i === 0 ? 30000 : 20000
        });
        if (result) {
          console.log(`[Model Fallback Waterfall] Model '${model}' succeeded!`);
          break;
        }
      } catch (err: any) {
        lastErr = err;
        console.warn(`[Model Fallback Waterfall] Model '${model}' failed with error:`, err.message || err);
        // Continue loop to try other models
      }
    }

    if (!result) {
      if (lastErr && isQuotaError(lastErr)) {
        markQuotaExhausted();
      }
      throw lastErr || new Error("All dynamic fallback models in the routing sequence failed.");
    }

    const responseObj = result.response;
    const textOutput = responseObj.text || (responseObj.candidates?.[0]?.content?.parts?.[0]?.text) || "";
    if (!textOutput) {
       throw new Error("Empty or malformed response returned from rotated Gemini API services");
    }

    res.json({ text: textOutput });
  } catch (error: any) {
    console.error("Error communicating with Gemini model:", error);
    
    // Strict BuBuBai API Error Protocol
    const fallbackText = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ BuBuBai — Server Busy
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Our servers are currently at peak load.
Please try again in a few moments. 🔄

— BuBuBai ULTRA ∞ · Powered by Gamura × Selvaranjan G
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    res.json({ text: fallbackText });
  }
});

// REST API for summarizing chat sessions
app.post("/api/bububai/summarize", async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.json({ summary: "" });
    return;
  }

  // If both keys are missing, or we're already rate-limited/out of quota,
  // we instantly use our zero-latency smart heuristic title extractor!
  const keys = getAvailableKeys();
  if (keys.length === 0 || checkQuotaExhaustion()) {
    const summary = generateHeuristicSummary(messages);
    res.json({ summary });
    return;
  }

  try {
    // Use last 5 messages to extract the actual programming topic/quest
    const lastMsgsText = messages
      .slice(-5)
      .map((m: any) => `${m.role === "user" ? "User" : "BuBuBai"}: ${m.content.slice(0, 150)}`)
      .join("\n");

    const prompt = `Read the following dialogue brief and write a CONCISE, 1-SENTENCE summary of the core engineering task, programming language, or library of focus (e.g. "React Dashboard with d3" or "Python SQLite DB optimization"). Use NO punctuation (no period or exclamation), keep it extremely brief, and under 6 words:\n\n${lastMsgsText}`;

    let result;
    try {
      result = await generateWithKeyRotation({
        activeMethod: "lite",
        model: "gemini-3.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { temperature: 0.1 },
        timeoutMs: 15000
      });
    } catch (sumErr: any) {
      if (isQuotaError(sumErr)) {
        markQuotaExhausted();
        const summary = generateHeuristicSummary(messages);
        res.json({ summary });
        return;
      }
      console.warn("Primary summarize model select failed, retrying with gemini-3.1-flash-lite:", sumErr);
      try {
        result = await generateWithKeyRotation({
          activeMethod: "lite",
          model: "gemini-3.1-flash-lite",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { temperature: 0.1 },
          timeoutMs: 12000
        });
      } catch (sumErrSec: any) {
        if (isQuotaError(sumErrSec)) {
          markQuotaExhausted();
          const summary = generateHeuristicSummary(messages);
          res.json({ summary });
          return;
        }
        console.warn("Secondary summarize model select failed, retrying again with gemini-3.1-flash-lite:", sumErrSec);
        try {
          result = await generateWithKeyRotation({
            activeMethod: "lite",
            model: "gemini-3.1-flash-lite",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { temperature: 0.1 },
            timeoutMs: 10000
          });
        } catch (sumErrTert: any) {
          if (isQuotaError(sumErrTert)) {
            markQuotaExhausted();
          }
          console.warn("All summarize models failed, falling back to heuristic:", sumErrTert);
          const summary = generateHeuristicSummary(messages);
          res.json({ summary });
          return;
        }
      }
    }

    const responseObj = result.response;
    const summary = responseObj.text ? responseObj.text.trim().replace(/^"|"$/g, "") : "";
    res.json({ summary: summary || generateHeuristicSummary(messages) });
  } catch (err) {
    console.warn("Failed to generate context summary, falling back to heuristic:", err);
    res.json({ summary: generateHeuristicSummary(messages) });
  }
});

// Helper to generate a gorgeous procedural SVG vector avatar as an offline fallback when API key quotas or network limits are exceeded.
function generateProceduralSvgAvatar(prompt: string): string {
  const norm = prompt.toLowerCase();
  
  // Decide theme, gradients, and shapes based on keywords
  let bgGradientStart = "#1e1b4b"; // default dark indigo
  let bgGradientEnd = "#0f172a";   // default slate black
  let accentColor1 = "#38bdf8";    // cyan
  let accentColor2 = "#818cf8";    // indigo
  let svgThemeType = "generic";
  
  if (norm.includes("cyber") || norm.includes("neon") || norm.includes("hacker") || norm.includes("matrix") || norm.includes("coder") || norm.includes("developer") || norm.includes("tech")) {
    bgGradientStart = "#090514";
    bgGradientEnd = "#020105";
    accentColor1 = "#10b981"; // emerald green
    accentColor2 = "#06b6d4"; // cyan
    svgThemeType = "cyber";
  } else if (norm.includes("sky") || norm.includes("space") || norm.includes("cosmic") || norm.includes("galaxy") || norm.includes("star") || norm.includes("planet") || norm.includes("nebula")) {
    bgGradientStart = "#0f172a";
    bgGradientEnd = "#1e1b4b";
    accentColor1 = "#ec4899"; // pink
    accentColor2 = "#8b5cf6"; // violet
    svgThemeType = "space";
  } else if (norm.includes("gold") || norm.includes("sunset") || norm.includes("fire") || norm.includes("warm") || norm.includes("amber") || norm.includes("orange") || norm.includes("sun")) {
    bgGradientStart = "#451a03"; // warm brown-black
    bgGradientEnd = "#1c1917";   // dark stone
    accentColor1 = "#f97316";    // orange
    accentColor2 = "#eab308";    // gold
    svgThemeType = "sunset";
  } else if (norm.includes("nature") || norm.includes("green") || norm.includes("forest") || norm.includes("leaf") || norm.includes("earth") || norm.includes("zen")) {
    bgGradientStart = "#064e3b"; // forest green
    bgGradientEnd = "#022c22";   // dark deep green
    accentColor1 = "#34d399";    // light emerald
    accentColor2 = "#a7f3d0";    // pastel mint
    svgThemeType = "nature";
  } else if (norm.includes("girl") || norm.includes("woman") || norm.includes("anime") || norm.includes("pink") || norm.includes("pastel") || norm.includes("cute") || norm.includes("love")) {
    bgGradientStart = "#4c0519"; // deep rose
    bgGradientEnd = "#0f172a";
    accentColor1 = "#f43f5e"; // rose
    accentColor2 = "#f472b6"; // light pink
    svgThemeType = "rose";
  } else if (norm.includes("boy") || norm.includes("man") || norm.includes("guy") || norm.includes("male") || norm.includes("shield") || norm.includes("security") || norm.includes("lock")) {
    bgGradientStart = "#0f172a";
    bgGradientEnd = "#020617";
    accentColor1 = "#3b82f6"; // blue
    accentColor2 = "#6366f1"; // indigo
    svgThemeType = "security";
  }
  
  // Create unique deterministic seed features from prompt string
  let seedNum = 0;
  for (let i = 0; i < prompt.length; i++) {
    seedNum += prompt.charCodeAt(i);
  }
  
  const rotationAngle = (seedNum * 17) % 360;
  
  // Build procedural visual geometry
  let extraGeometry = "";
  
  if (svgThemeType === "cyber") {
    extraGeometry = `
      <!-- Radar grid circles -->
      <circle cx="50" cy="50" r="42" fill="none" stroke="${accentColor1}" stroke-width="0.5" stroke-opacity="0.15" />
      <circle cx="50" cy="50" r="32" fill="none" stroke="${accentColor2}" stroke-width="0.5" stroke-opacity="0.25" stroke-dasharray="2 3" />
      <circle cx="50" cy="50" r="22" fill="none" stroke="${accentColor1}" stroke-width="0.75" stroke-opacity="0.3" />
      
      <!-- Crosshairs -->
      <line x1="50" y1="15" x2="50" y2="85" stroke="${accentColor1}" stroke-width="0.3" stroke-opacity="0.2" />
      <line x1="15" y1="50" x2="85" y2="50" stroke="${accentColor1}" stroke-width="0.3" stroke-opacity="0.2" />
      
      <!-- Tech nodes / data block representation -->
      <g transform="rotate(${rotationAngle} 50 50)">
        <polygon points="50,22 78,50 50,78 22,50" fill="none" stroke="${accentColor2}" stroke-width="1.2" stroke-opacity="0.8" />
        <rect x="44" y="44" width="12" height="12" rx="2" fill="${accentColor1}" fill-opacity="0.15" stroke="${accentColor1}" stroke-width="1" />
        
        <!-- Glowing corners -->
        <circle cx="50" cy="22" r="2.5" fill="${accentColor1}" />
        <circle cx="78" cy="50" r="2.5" fill="${accentColor2}" />
        <circle cx="50" cy="78" r="2.5" fill="${accentColor1}" />
        <circle cx="22" cy="50" r="2.5" fill="${accentColor2}" />
      </g>
      
      <!-- Code bracket text glyph in center -->
      <text x="50" y="54" font-family="'JetBrains Mono', Courier, monospace" font-size="10" font-weight="900" fill="${accentColor1}" text-anchor="middle" letter-spacing="-1">&lt;/&gt;</text>
    `;
  } else if (svgThemeType === "space") {
    extraGeometry = `
      <!-- Nebula dust rings -->
      <ellipse cx="50" cy="50" rx="38" ry="14" fill="none" stroke="url(#accentGrad2)" stroke-width="1.8" stroke-opacity="0.7" transform="rotate(${-rotationAngle} 50 50)" />
      
      <!-- Main glowing planet core -->
      <circle cx="50" cy="50" r="16" fill="url(#coreGrad2)" filter="url(#glowFilter2)" />
      <circle cx="50" cy="50" r="16" fill="url(#coreGrad2)" stroke="#ffffff" stroke-width="0.5" stroke-opacity="0.5" />
      
      <!-- Dark masking hemisphere for planetary shading -->
      <path d="M 50,34 A 16,16 0 0 1 50,66 A 16,16 0 0 1 50,34" fill="#000000" fill-opacity="0.4" transform="rotate(45 50 50)" />
      
      <!-- Orbiting moon -->
      <circle cx="72" cy="40" r="3.5" fill="${accentColor2}" filter="url(#glowFilter2)" />
      <circle cx="72" cy="40" r="3.5" fill="#ffffff" />
      
      <!-- Tiny sparkling stars -->
      <g stroke="#ffffff" stroke-width="0.3" stroke-linecap="round">
        <line x1="26" y1="28" x2="26" y2="34" /><line x1="23" y1="31" x2="29" y2="31" />
        <line x1="74" y1="68" x2="74" y2="74" /><line x1="71" y1="71" x2="77" y2="71" />
        <circle cx="35" cy="72" r="1" fill="#ffffff" />
        <circle cx="68" cy="24" r="1" fill="#ffffff" />
      </g>
    `;
  } else if (svgThemeType === "sunset") {
    extraGeometry = `
      <!-- Radiant solar rays circles -->
      <circle cx="50" cy="50" r="40" fill="none" stroke="${accentColor2}" stroke-width="0.5" stroke-opacity="0.1" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="${accentColor1}" stroke-width="0.5" stroke-opacity="0.15" />
      
      <!-- Glowing Giant Sun core -->
      <circle cx="50" cy="50" r="22" fill="url(#coreGrad2)" filter="url(#glowFilter2)" />
      <circle cx="50" cy="50" r="22" fill="url(#coreGrad2)" />
      
      <!-- Minimal vector stylized geometric mountains/ridges overlapping -->
      <path d="M 15,75 L 45,38 L 65,62 L 85,75 Z" fill="#1c1917" fill-opacity="0.85" stroke="${accentColor1}" stroke-width="0.5" stroke-opacity="0.3" />
      <path d="M 30,75 L 58,48 L 78,68 L 90,75 Z" fill="#0c0a09" fill-opacity="0.95" stroke="${accentColor2}" stroke-width="0.5" stroke-opacity="0.4" />
      
      <!-- Golden sparkles -->
      <circle cx="35" cy="28" r="1.5" fill="${accentColor2}" />
      <circle cx="68" cy="32" r="2" fill="${accentColor1}" />
    `;
  } else if (svgThemeType === "nature") {
    extraGeometry = `
      <!-- Zen water ripple circles -->
      <circle cx="50" cy="50" r="42" fill="none" stroke="${accentColor2}" stroke-width="0.5" stroke-opacity="0.2" />
      <circle cx="50" cy="50" r="32" fill="none" stroke="${accentColor1}" stroke-width="0.5" stroke-opacity="0.3" />
      
      <!-- Intersecting organic leaf vector paths -->
      <g transform="rotate(${rotationAngle} 50 50)">
        <!-- Elegant primary leaf -->
        <path d="M 50,18 C 72,32 72,68 50,82 C 28,68 28,32 50,18 Z" fill="url(#coreGrad2)" fill-opacity="0.12" stroke="url(#accentGrad2)" stroke-width="1.5" />
        <path d="M 50,18 C 65,32 65,68 50,82" fill="none" stroke="${accentColor1}" stroke-width="1" stroke-opacity="0.5" />
        
        <!-- Secondary decorative diagonal leaf -->
        <path d="M 50,28 C 65,38 65,62 50,72 C 35,62 35,38 50,28 Z" fill="url(#accentGrad2)" fill-opacity="0.15" stroke="${accentColor2}" stroke-width="0.75" />
      </g>
      
      <!-- Natural dew glow drops -->
      <circle cx="50" cy="50" r="3" fill="#ffffff" fill-opacity="0.6" filter="url(#glowFilter2)" />
      <circle cx="50" cy="50" r="1.5" fill="#ffffff" />
    `;
  } else if (svgThemeType === "rose") {
     extraGeometry = `
      <!-- Romantic halo ring -->
      <circle cx="50" cy="50" r="38" fill="none" stroke="${accentColor2}" stroke-width="1" stroke-opacity="0.3" stroke-dasharray="1 4" />
      
      <!-- Flower of life / Sacred mandala abstract sequence -->
      <g transform="rotate(${rotationAngle} 50 50)" stroke="url(#accentGrad2)" stroke-width="1" stroke-opacity="0.6" fill="none">
        <circle cx="50" cy="38" r="16" />
        <circle cx="50" cy="62" r="16" />
        <circle cx="38" cy="50" r="16" />
        <circle cx="62" cy="50" r="16" />
        
        <circle cx="50" cy="50" r="8" fill="url(#coreGrad2)" fill-opacity="0.3" stroke="#ffffff" stroke-width="0.75" />
      </g>
      <circle cx="50" cy="50" r="3" fill="#ffffff" filter="url(#glowFilter2)" />
    `;
  } else if (svgThemeType === "security") {
    extraGeometry = `
      <!-- Security polygon network -->
      <polygon points="50,15 82,32 82,65 50,85 18,65 18,32" fill="none" stroke="${accentColor1}" stroke-width="0.5" stroke-opacity="0.2" />
      <polygon points="50,20 76,35 76,62 50,78 24,62 24,35" fill="none" stroke="${accentColor2}" stroke-width="1" stroke-opacity="0.3" stroke-dasharray="2 2" />
      
      <!-- High contrast vector security shield -->
      <g transform="translate(0, -1)">
        <path d="M 50,24 C 65,24 72,28 72,38 C 72,56 50,73 50,73 C 50,73 28,56 28,38 C 28,28 35,24 50,24 Z" fill="url(#coreGrad2)" fill-opacity="0.2" stroke="url(#accentGrad2)" stroke-width="1.8" />
        
        <!-- Glowing keyhole / star core -->
        <circle cx="50" cy="44" r="5" fill="none" stroke="${accentColor1}" stroke-width="1.5" />
        <path d="M 48,47 L 52,47 L 55,60 L 45,60 Z" fill="url(#accentGrad2)" />
      </g>
    `;
  } else {
    // Beautiful default: technical dial and elegant monogram letter
    const monogramLetter = prompt.trim().charAt(0).toUpperCase() || "B";
    extraGeometry = `
      <!-- Technical circular dial framework -->
      <circle cx="50" cy="50" r="42" fill="none" stroke="${accentColor1}" stroke-width="0.5" stroke-opacity="0.15" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="url(#accentGrad2)" stroke-width="1.2" stroke-opacity="0.4" stroke-dasharray="8 6" />
      <circle cx="50" cy="50" r="32" fill="none" stroke="${accentColor2}" stroke-width="0.5" stroke-opacity="0.2" />
      <circle cx="50" cy="50" r="26" fill="none" stroke="${accentColor1}" stroke-width="0.75" stroke-opacity="0.25" />
      
      <!-- Rotated orbits for orbital motion feeling -->
      <g transform="rotate(${rotationAngle} 50 50)">
        <line x1="12" y1="50" x2="88" y2="50" stroke="${accentColor2}" stroke-width="0.3" stroke-opacity="0.2" />
        <circle cx="12" cy="50" r="2" fill="${accentColor2}" />
        <circle cx="88" cy="50" r="2" fill="${accentColor1}" />
        
        <circle cx="50" cy="50" r="16" fill="url(#coreGrad2)" stroke="#ffffff" stroke-width="0.5" stroke-opacity="0.4" filter="url(#glowFilter2)" />
        <circle cx="50" cy="50" r="16" fill="url(#coreGrad2)" stroke="#ffffff" stroke-width="0.5" stroke-opacity="0.4" />
      </g>
      
      <!-- High contrast premium display text monogram -->
      <text x="50" y="55.5" font-family="'Space Grotesk', 'Inter', sans-serif" font-size="16" font-weight="900" fill="#ffffff" text-anchor="middle">${monogramLetter}</text>
    `;
  }
  
  // Assemble full SVG source code with proper XML declarations
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="400" height="400">
    <defs>
      <!-- Background linear gradient -->
      <linearGradient id="bgGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgGradientStart}" />
        <stop offset="100%" stop-color="${bgGradientEnd}" />
      </linearGradient>
      
      <!-- Core centerpiece radial gradient -->
      <radialGradient id="coreGrad2" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${accentColor2}" stop-opacity="1" />
        <stop offset="100%" stop-color="${accentColor1}" stop-opacity="0.2" />
      </radialGradient>
      
      <!-- Border / orbit accent linear gradient -->
      <linearGradient id="accentGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${accentColor1}" />
        <stop offset="100%" stop-color="${accentColor2}" />
      </linearGradient>
      
      <!-- Neon atmosphere glow filter -->
      <filter id="glowFilter2" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    
    <!-- Background Circle Frame -->
    <circle cx="50" cy="50" r="49" fill="url(#bgGrad2)" stroke="#e2e2de" stroke-width="0.75" stroke-opacity="0.3" />
    
    <!-- Procedural Accent Elements -->
    ${extraGeometry}
    
    <!-- Fine technical border ring -->
    <circle cx="50" cy="50" r="48" fill="none" stroke="url(#accentGrad2)" stroke-width="1" stroke-opacity="0.3" />
  </svg>`;

  return svg;
}

function generateNameSvgAvatar(name: string): string {
  const cleanName = name.trim().toUpperCase() || "SELVA";
  // Determine gradient colors based on name length or alphabetic seed
  let seedNum = 0;
  for (let i = 0; i < cleanName.length; i++) {
    seedNum += cleanName.charCodeAt(i);
  }
  
  // High contrast premium color palettes
  const palettes = [
    { bgStart: "#0a0f1d", bgEnd: "#02040a", core: "#38bdf8", accent: "#818cf8" }, // Sapphire Space
    { bgStart: "#120215", bgEnd: "#050007", core: "#ec4899", accent: "#a855f7" }, // Amethyst Neon
    { bgStart: "#031508", bgEnd: "#000502", core: "#10b981", accent: "#34d399" }, // Emerald Core
    { bgStart: "#150a02", bgEnd: "#050200", core: "#f97316", accent: "#eab308" }, // Ember Sunset
    { bgStart: "#0f172a", bgEnd: "#020617", core: "#3b82f6", accent: "#6366f1" }, // Deep Steel Blue
  ];
  const palette = palettes[seedNum % palettes.length];
  
  const initials = cleanName.split(/\s+/).map(p => p[0]).join("").slice(0, 3);
  
  // Create a repeated string of the name/title to circle around the path
  const repeatText = `${cleanName} · MEMBER · `.repeat(3).toUpperCase().slice(0, 48);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="400" height="400">
    <defs>
      <!-- Premium backgrounds -->
      <linearGradient id="pBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${palette.bgStart}" />
        <stop offset="100%" stop-color="${palette.bgEnd}" />
      </linearGradient>
      
      <!-- Core glowing base -->
      <radialGradient id="pCoreGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${palette.accent}" stop-opacity="0.8" />
        <stop offset="150%" stop-color="${palette.core}" stop-opacity="0.05" />
      </radialGradient>
      
      <linearGradient id="pBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${palette.core}" />
        <stop offset="100%" stop-color="${palette.accent}" />
      </linearGradient>

      <!-- Atmospheric filter -->
      <filter id="pGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3.5" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>

      <!-- Perfect circular path for the scrolling name text -->
      <path id="namePath" d="M 50,19 A 31,31 0 1,1 49.9,19" fill="none" />
    </defs>
    
    <!-- Underlay slate background -->
    <circle cx="50" cy="50" r="49" fill="url(#pBgGrad)" stroke="#e2e2de" stroke-width="0.75" stroke-opacity="0.3" />
    
    <!-- Outer sci-fi ring dial -->
    <circle cx="50" cy="50" r="45" fill="none" stroke="${palette.core}" stroke-width="0.5" stroke-opacity="0.2" />
    <circle cx="50" cy="50" r="43" fill="none" stroke="${palette.accent}" stroke-width="1.2" stroke-opacity="0.3" stroke-dasharray="3 5" transform="rotate(45 50 50)" />
    <circle cx="50" cy="50" r="41" fill="none" stroke="${palette.core}" stroke-width="0.5" stroke-opacity="0.15" />
    
    <!-- The glowing neon core -->
    <circle cx="50" cy="50" r="22" fill="url(#pCoreGrad)" filter="url(#pGlow)" />
    <circle cx="50" cy="50" r="22" fill="#000000" fill-opacity="0.1" stroke="url(#pBorderGrad)" stroke-width="1.5" />
    
    <!-- Circular name text track -->
    <text font-family="'JetBrains Mono', 'Space Grotesk', monospace" font-size="4" font-weight="bold" fill="${palette.core}" letter-spacing="1">
      <textPath href="#namePath" startOffset="0%">${repeatText}</textPath>
    </text>

    <!-- Stylized tick marks under the text -->
    <circle cx="50" cy="50" r="25" fill="none" stroke="${palette.accent}" stroke-width="0.5" stroke-opacity="0.25" stroke-dasharray="1 3" />
    
    <!-- Initials display inside center core -->
    <text x="50" y="55.5" font-family="'Space Grotesk', 'Inter', sans-serif" font-size="14" font-weight="950" fill="#ffffff" text-anchor="middle" letter-spacing="-0.5">${initials}</text>
    
    <!-- Corner coordinates micro labels -->
    <text x="50" y="11" font-family="monospace" font-size="1.8" fill="${palette.core}" opacity="0.4" text-anchor="middle" letter-spacing="0.5">AUTHENTIC IDENT REGISTERED</text>
  </svg>`;
  
  return svg;
}

// Generate dynamic custom avatar picture for user profile using AI
app.post("/api/bububai/generate-avatar", async (req, res) => {
  const { prompt, isNameAvatar, name } = req.body;
  
  // If user requests generating their name as an avatar
  if (isNameAvatar) {
    const textToUse = name || prompt;
    if (!textToUse) {
      res.status(400).json({ error: "Nickname or Name value is required for creating a custom name avatar." });
      return;
    }
    
    try {
      const svgString = generateNameSvgAvatar(textToUse);
      const base64 = Buffer.from(svgString).toString("base64");
      const imageUrl = `data:image/svg+xml;base64,${base64}`;
      res.json({ 
        image: imageUrl, 
        isNameAvatar: true,
        message: "Your custom name-badge vector avatar has been forged with pure excellence! Click 'Apply Icon' below."
      });
      return;
    } catch (nameErr: any) {
      console.error("Custom name avatar build failed:", nameErr);
      res.status(500).json({ error: "Failed to assemble name-based vector avatar." });
      return;
    }
  }

  if (!prompt) {
    res.status(400).json({ error: "Prompt is required for avatar generation." });
    return;
  }

  try {
    const result = await generateWithKeyRotation({
      activeMethod: "generateContent",
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [
          {
            text: `A high quality minimalist avatar icon profile picture of: ${prompt}. Professional clean vector flat design style, centered, circular layout aspect ratio, single subject, solid beautiful dark theme background, masterpiece illustration.`,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        },
      },
      timeoutMs: 35000
    });

    const response = result.response;
    let base64Image = "";

    if (response?.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          base64Image = part.inlineData.data;
          break;
        }
      }
    }

    if (base64Image) {
      res.json({ image: `data:image/png;base64,${base64Image}`, isFallback: false });
    } else {
      throw new Error("The AI model did not return inlineData image parts.");
    }
  } catch (err: any) {
    console.error("Avatar generation failed, falling back to seamless procedural vector artwork generator:", err);
    try {
      const svgString = generateProceduralSvgAvatar(prompt);
      const base64 = Buffer.from(svgString).toString("base64");
      const imageUrl = `data:image/svg+xml;base64,${base64}`;
      res.json({ 
        image: imageUrl, 
        isFallback: true, 
        message: "Gemini quota exhausted. Generated a beautiful custom vector avatar procedurally as a high-fidelity offline backup!" 
      });
    } catch (fallbackErr: any) {
      console.error("Ultimate fallback failed:", fallbackErr);
      res.status(500).json({ error: err.message || "Failed to generate AI avatar." });
    }
  }
});

// Optionally support single-speaker speech synthesis for the "Speak" / "Play" button!
app.post("/api/bububai/tts", async (req, res) => {
  const { text } = req.body;
  if (!text) {
    res.status(400).json({ error: "Text is required for TTS." });
    return;
  }

  try {
    // Clean text from code blocks for better speech outcome
    const cleanText = text
      .replace(/```[\s\S]*?```/g, "[Codeblock omitted for brevity]")
      .substring(0, 400); // chunk limit to avoid overload

    const result = await generateWithKeyRotation({
      activeMethod: "lite",
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Say clearly: ${cleanText}` }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Zephyr" },
          },
        },
      },
      timeoutMs: 15000
    });

    const response = result.response;
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      res.json({ audio: base64Audio });
    } else {
      res.status(500).json({ error: "No audio generated from speech engine." });
    }
  } catch (err: any) {
    console.error("TTS conversion failed:", err);
    res.status(500).json({ error: err.message || "Failed to convert speech." });
  }
});

// Mount Vite middleware in development mode
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development middleware integrated.");
  } else {
    // On Vercel, the framework handles serving static files directly from the compiled "dist" folder.
    // We only mount static folder serving for local production runs or Cloud Run containers.
    if (!process.env.VERCEL) {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
      console.log("Production serving from: ", distPath);
    }
  }
}

if (!process.env.VERCEL) {
  setupVite().then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server fully responsive on port http://0.0.0.0:${PORT}`);
    });
  });
} else {
  // On Vercel serverless context in production, make sure middleware/routes are defined properly
  setupVite();
}

export default app;
