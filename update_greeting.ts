import fs from 'fs';

let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

// Replace the greeting function / logic
content = content.replace(
  /content: \`Hey \$\{displayName\}\! 👋 I'm BUBUBAI — ready to help\.\\nWhat are we working on today\?\`,/g,
  `content: \`\$\{getTimeGreeting()\}, \$\{displayName || 'Developer'\}\! 👾 Welcome back to BUBUBAI — your AI coding companion. What are we building today?\\n\\n**bububai**\`,\n`
);

content = content.replace(
  /content: \`Hey \$\{displayName\}\! 👋 I'm BUBUBAI — ready to help\.\\nWhat are we building today\?\`,/g,
  `content: \`\$\{getTimeGreeting()\}, \$\{displayName || 'Developer'\}\! 👾 Welcome back to BUBUBAI — your AI coding companion. What are we building today?\\n\\n**bububai**\`,\n`
);

// We need to implement getTimeGreeting() if it doesn't exist
if (!content.includes('getTimeGreeting()')) {
  // Add it near the top of the component or outside
  const greetingFunc = `
function getTimeGreeting() {
  const currentHour = new Date().getHours();
  if (currentHour >= 5 && currentHour < 12) return "Good Morning";
  if (currentHour >= 12 && currentHour < 17) return "Good Afternoon";
  if (currentHour >= 17 && currentHour < 21) return "Good Evening";
  return "Good Night";
}
`;
  content = content.replace('export default function ChatView({', greetingFunc + '\nexport default function ChatView({');
}

fs.writeFileSync('src/components/ChatView.tsx', content);
