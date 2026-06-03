import fs from 'fs';

let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

// 1. Remove the chat summary and limit indicator header
content = content.replace(/<div className="flex flex-wrap items-center justify-center gap-1\.5 mt-1">[\s\S]*?<\/div>/, '');

// 2. Remove the limits in handleNewConversation
content = content.replace(/if \(dailyUsage\.count >= 3\) \{[\s\S]*?return;\n\s*\}/g, '');

// 3. Remove dailyUsage references from fetch requests
content = content.replace(/usageCount: dailyUsage\.count \+ 1,/g, '');

// 4. Update the text area to be fully enabled
content = content.replace(/className=\{`flex-1 max-h-\[120px\] bg-transparent text-\[#111110\] font-sans text-\[15px\] focus:outline-none resize-none pt-2\.5 pb-1 px-1 leading-normal select-text relative z-10 placeholder:text-neutral-400 \$\{dailyUsage\.count >= 3 \? "opacity-50 cursor-not-allowed" : ""\}`\}/, 'className="flex-1 max-h-[120px] bg-transparent text-[#111110] font-sans text-[15px] focus:outline-none resize-none pt-2.5 pb-1 px-1 leading-normal select-text relative z-10 placeholder:text-neutral-400"');
content = content.replace(/placeholder=\{dailyUsage\.count >= 3 \? "Daily limit of 3 chats reached\." : "Type a message\.\.\."\}/, 'placeholder="Type a message..."');
content = content.replace(/disabled=\{dailyUsage\.count >= 3\}/, 'disabled={false}');

// 5. Update the Send button to not check for limits
content = content.replace(/disabled=\{\!inputValue\.trim\(\) \|\| isLoading \|\| dailyUsage\.count >= 3\}/, 'disabled={!inputValue.trim() || isLoading}');
content = content.replace(/\(inputValue\.trim\(\) \|\| isLoading\) && dailyUsage\.count < 3/, '(inputValue.trim() || isLoading)');

// Also remove the "AI" reference from the Chat App itself where possible. There might be some remaining.
// The user says "REMOVE THE AI", there's probably a badge in the middle. Let's check what's there.

fs.writeFileSync('src/components/ChatView.tsx', content);
