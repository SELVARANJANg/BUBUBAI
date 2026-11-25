import puter from '@heyputer/puter.js';

export interface PuterUserInfo {
  username: string;
  uuid?: string;
  email?: string;
}

export interface BBBPassPayload {
  bbbId: string;
  uid: string;
  username: string;
  name: string;
  syncedAt: string;
}

const PUTER_FALLBACK_PREF_KEY = 'bububai_puter_ai_fallback';

export function isPuterAIFallbackEnabled(): boolean {
  try {
    const val = localStorage.getItem(PUTER_FALLBACK_PREF_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

export function setPuterAIFallbackEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(PUTER_FALLBACK_PREF_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage errors
  }
}

export function isPuterSignedIn(): boolean {
  try {
    return Boolean(puter?.auth?.isSignedIn?.());
  } catch {
    return false;
  }
}

export async function getPuterUser(): Promise<PuterUserInfo | null> {
  try {
    if (!isPuterSignedIn()) return null;
    const user: any = await puter.auth.getUser();
    if (!user) return null;
    return {
      username: user.username || 'puter-user',
      uuid: user.uuid,
      email: user.email,
    };
  } catch {
    return null;
  }
}

export async function signInPuter(): Promise<PuterUserInfo> {
  await puter.auth.signIn();
  const user: any = await puter.auth.getUser();
  return {
    username: user?.username || 'puter-user',
    uuid: user?.uuid,
    email: user?.email,
  };
}

export async function signOutPuter(): Promise<void> {
  try {
    await puter.auth.signOut();
  } catch {
    // ignore signout errors
  }
}

/**
 * Saves the user's BBB Digital Pass to Puter KV and Puter Cloud Drive (/BUBUBAI/bbb-pass.json).
 */
export async function syncBBBPassToPuter(pass: BBBPassPayload): Promise<void> {
  if (!isPuterSignedIn()) {
    throw new Error('Please connect your Puter account first.');
  }

  const serialized = JSON.stringify(pass, null, 2);
  await puter.kv.set(`bububai_bbb_${pass.bbbId}`, serialized);

  try {
    await puter.fs.mkdir('BUBUBAI', { createMissingParents: true });
  } catch {
    // Directory may already exist
  }

  await puter.fs.write('BUBUBAI/bbb-pass.json', serialized, { overwrite: true });
}

/**
 * Backs up a chat session JSON file into the user's Puter Drive (/BUBUBAI/chats/).
 */
export async function backupChatToPuter(
  chatId: string,
  title: string,
  messages: any[]
): Promise<string> {
  if (!isPuterSignedIn()) {
    throw new Error('Please connect your Puter account first.');
  }

  const safeId = (chatId || `chat-${Date.now()}`).replace(/[^a-zA-Z0-9_\-]/g, '_');
  const filePath = `BUBUBAI/chats/${safeId}.json`;

  try {
    await puter.fs.mkdir('BUBUBAI/chats', { createMissingParents: true });
  } catch {
    // Directory may already exist
  }

  await puter.fs.write(
    filePath,
    JSON.stringify(
      {
        id: safeId,
        title,
        backedUpAt: new Date().toISOString(),
        messages,
      },
      null,
      2
    ),
    { overwrite: true }
  );

  return filePath;
}

/**
 * Uses Puter Cloud AI (puter.ai.chat) as an optional zero-key user-authenticated AI channel.
 */
export async function chatWithPuterAI(params: {
  message: string;
  history?: Array<{ role: string; content: string }>;
  username?: string;
  model?: string;
}): Promise<string> {
  const name = params.username || 'Developer';
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `You are BUBUBAI — an elite AI coding assistant built by Selvaranjan G (Founder of GAMURA). Address the user as ${name}. Keep answers sharp, concise, accurate, and always end every response on a new line with:\n**bububai**`,
    },
  ];

  if (params.history && Array.isArray(params.history)) {
    for (const item of params.history.slice(-10)) {
      if (!item.content?.trim()) continue;
      messages.push({
        role: item.role === 'user' ? 'user' : 'assistant',
        content: item.content,
      });
    }
  }

  messages.push({
    role: 'user',
    content: params.message,
  });

  const response: any = await puter.ai.chat(messages as any, {
    model: params.model || 'gpt-4o-mini',
  });

  let text = '';
  if (typeof response === 'string') {
    text = response;
  } else if (response?.message?.content) {
    if (typeof response.message.content === 'string') {
      text = response.message.content;
    } else if (Array.isArray(response.message.content)) {
      text = response.message.content.map((c: any) => c?.text || '').join('');
    }
  } else if (response?.text) {
    text = response.text;
  }

  text = (text || '').trim();
  if (!text) {
    throw new Error('Empty response from Puter AI');
  }
  if (!text.includes('**bububai**')) {
    text = `${text}\n\n**bububai**`;
  }
  return text;
}

export { puter };
