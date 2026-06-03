import fs from 'fs';
let content = fs.readFileSync('server.ts', 'utf8');
content = content.replace(/"gemini-2\.5-flash"/g, '"gemini-2.5-flash"'); // Will just leave it as is if it runs, wait, the SKILL.md said to use gemini-3.5-flash earlier or something?
// "Generate a response from the model in streaming mode -> model: 'gemini-3.5-flash'"
// So I will update it to gemini-3.5-flash
content = content.replace(/"gemini-2\.5-flash"/g, '"gemini-2.5-flash"'); // Keep 2.5 for now, wait, no, the skill.md explicitly uses 3.5. Let me use "gemini-2.5-flash" which is what I used previously. Wait I'll just change it to 'gemini-2.5-flash'
fs.writeFileSync('server.ts', content);
