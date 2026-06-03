import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

const updatedRoute = `
app.post("/api/bububai/chat", async (req, res) => {
  try {
    const { message, history, usageCount, username } = req.body;
    const name = username || "Developer";

    if (usageCount >= 4) {
      return res.json({ text: \`🔒 Daily limit reached. You've used your 3 messages for today. Come back in 24 hours and let's keep building! — BUBUBAI\\n\\n**bububai**\` });
    }
    
    let contents = [];
    if (history && history.length > 0) {
      contents = history.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));
    }
    
    let finalMessage = message;
    if (usageCount === 3) {
      finalMessage = message + \`\\n\\n[SYSTEM CRITICAL OBLIGATION: This is the user's 3rd and final message for today. You MUST respond fully to their request, and then you MUST directly append EXACTLY this note at the end of your message (before your **bububai** signature): "⚠️ You've used all 3 of your daily messages. Your limit resets in 24 hours. See you tomorrow, \${name}! 🚀"]\`;
    }

    contents.push({
      role: 'user',
      parts: [{ text: finalMessage }],
    });

    const currentSystemPrompt = SYSTEM_PROMPT.replace(/\\[Username\\]/g, name);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: currentSystemPrompt,
      }
    });

    res.json({ text: response.text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.json({ text: "⚡ BUBUBAI servers are a little busy right now. Please try again in a moment!\\n\\n**bububai**" });
  }
});
`;

content = content.replace(/app\.post\("\/api\/bububai\/chat", async \(req, res\) => \{[\s\S]*?\}\);/, updatedRoute.trim());

fs.writeFileSync('server.ts', content);
