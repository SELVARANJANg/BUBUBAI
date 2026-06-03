import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

/* Replace chat logic */
const newChatLogic = `
app.post("/api/bububai/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    
    let contents = [];
    if (history && history.length > 0) {
      contents = history.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));
    }
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
      }
    });

    res.json({ text: response.text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.json({ text: "⚡ BUBUBAI servers are a little busy right now. Please try again in a moment!\\n\\n**bububai**" });
  }
});
`;

content = content.replace(/app\.post\("\/api\/bububai\/chat", async \(req, res\) => \{[\s\S]*?\}\);/, newChatLogic.trim());

fs.writeFileSync('server.ts', content);
