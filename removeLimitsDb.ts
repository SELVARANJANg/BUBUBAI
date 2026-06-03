import fs from 'fs';

let content = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

// 1. Remove textarea limit logic
content = content.replace(/className=\{`dsb-textarea \$\{dailyUsage\.count >= 3 \? "opacity-50 cursor-not-allowed" : ""\}`\}/, 'className="dsb-textarea"');
content = content.replace(/placeholder=\{dailyUsage\.count >= 3 \? "Daily limit of 3 chats reached\." : "Chat with Chat App\.\.\."\}/, 'placeholder="Chat with Chat App..."');
content = content.replace(/disabled=\{dailyUsage\.count >= 3\}/, 'disabled={false}'); // This changes textarea disabled
content = content.replace(/disabled=\{dailyUsage\.count >= 3\}/, 'disabled={false}'); // This changes plus-btn disabled

// 2. Remove submit button disabled
content = content.replace(/disabled=\{\!textValue\.trim\(\) \|\| dailyUsage\.count >= 3\}/, 'disabled={!textValue.trim()}');

fs.writeFileSync('src/components/Dashboard.tsx', content);
