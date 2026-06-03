import fs from 'fs';
let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

// Replace standard strings
content = content.replace(/Chat App — your elite AI for code,\\ncreativity, and everything in between./g, 'Chat App — ready to help.\\nWhat are we working on today?');
content = content.replace(/Chat App — elite AI for code, design & everything./g, 'Chat App — ready to help.');
content = content.replace(/AI code response link copied/g, 'Code response link copied');
content = content.replace(/Chat App is returning/g, 'Chat App is typing');
content = content.replace(/Failed to parse AI response/g, 'Failed to parse response');

// Also, the user previously requested "REMOVE THIS IN THE CHATTING PAGE TO MIDDLE REMOVE THAT TWO OPTIONS CHAT NODE WHICH IS IN GREEN COLOUR AND REMOVE THE CHAT LIMIT AND REMOVE THE AI".
// Let's remove any standalone "AI" references.
fs.writeFileSync('src/components/ChatView.tsx', content);

let modesContent = fs.readFileSync('src/components/ModesSheet.tsx', 'utf8');
modesContent = modesContent.replace(/friendly and helpful AI assistant/g, 'friendly and helpful assistant');
fs.writeFileSync('src/components/ModesSheet.tsx', modesContent);
