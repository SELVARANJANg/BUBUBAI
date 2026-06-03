import fs from 'fs';

let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

// Replace body: JSON.stringify({ message: promptText, history: [] }) 
// to include usageCount and username
content = content.replace(/body: JSON\.stringify\(\{\s+message: promptText,\s+history: \[\],\s+\}\),/g, 
  `body: JSON.stringify({\n          message: promptText,\n          history: [],\n          usageCount: dailyUsage.count + 1,\n          username: displayName || 'Developer',\n        }),`);

content = content.replace(/body: JSON\.stringify\(\{\s+message: userPrompt,\s+history: historyPayload,\s+\}\),/g, 
  `body: JSON.stringify({\n          message: userPrompt,\n          history: historyPayload,\n          usageCount: dailyUsage.count + 1,\n          username: displayName || 'Developer',\n        }),`);

content = content.replace(/body: JSON\.stringify\(\{\s+message: promptText,\s+history: historyPayload,\s+\}\),/g, 
  `body: JSON.stringify({\n          message: promptText,\n          history: historyPayload,\n          usageCount: dailyUsage.count + 1,\n          username: displayName || 'Developer',\n        }),`);

content = content.replace(/body: JSON\.stringify\(\{\s+message: newContent,\s+history: contextHistory,\s+\}\),/g, 
  `body: JSON.stringify({\n          message: newContent,\n          history: contextHistory,\n          usageCount: dailyUsage.count + 1,\n          username: displayName || 'Developer',\n        }),`);

fs.writeFileSync('src/components/ChatView.tsx', content);
