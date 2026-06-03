import fs from 'fs';

let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

if (!content.includes('function getTimeGreeting()')) {
  const greetingFunc = `
function getTimeGreeting() {
  const currentHour = new Date().getHours();
  if (currentHour >= 5 && currentHour < 12) return "Good Morning";
  if (currentHour >= 12 && currentHour < 17) return "Good Afternoon";
  if (currentHour >= 17 && currentHour < 21) return "Good Evening";
  return "Good Night";
}
`;
  content = content.replace('export default function ChatView({', greetingFunc + '\\nexport default function ChatView({');
}

fs.writeFileSync('src/components/ChatView.tsx', content);
