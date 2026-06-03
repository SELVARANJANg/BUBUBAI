import fs from 'fs';

let content = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

content = content.replace(
  'const [bottomSheetOpen, setBottomSheetOpen] = useState(false);',
  'const [bottomSheetOpen, setBottomSheetOpen] = useState(false);\n  const [gbSheetOpen, setGbSheetOpen] = useState(false);'
);

const limitRegex = /\{dailyUsage\.count >= 3 \? \(\s*<span className="text-red-600 bg-red-50 border border-red-100 rounded-lg px-2\.5 py-1">\s*0\/3 CHATS REMAINING\s*<\/span>\s*\) : \(\s*<span className="text-neutral-500 bg-neutral-50 border border-neutral-200\/50 rounded-lg px-2\.5 py-1">\s*\{3 - dailyUsage\.count\} OF 3 CHATS LEFT TODAY\s*<\/span>\s*\)\}/;

content = content.replace(
  limitRegex,
  `<button onClick={() => setGbSheetOpen(true)} className="font-sans font-bold text-[13px] text-neutral-600 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg px-3 py-1 cursor-pointer transition-colors shadow-sm">GB</button>`
);

// We also need to add the slide bar (bottom sheet) for GAMURA BUBUBAI
// Let's add it near the bottom sheet backdrop. We can add it just before `{/* ── BOTTOM SHEET BACKDROP ── */}`
const gbSheetHTML = `
      {/* ── GB SHEET BACKDROP ── */}
      {gbSheetOpen && (
        <div
          className="fixed inset-0 bg-[#111110]/15 backdrop-blur-[6px] z-[1000] transition-all duration-300"
          onClick={() => setGbSheetOpen(false)}
        />
      )}

      {/* ── GB SHEET (SLIDE BAR DOWN TO UP) ── */}
      <div
        className={\`fixed bottom-0 left-0 right-0 bg-white rounded-t-[28px] z-[1010] border-t border-[#e2e2de] shadow-[0_-12px_44px_rgba(17,17,16,0.1)] transition-transform duration-300 ease-in-out transform \${
          gbSheetOpen ? "translate-y-0" : "translate-y-full"
        } h-[50vh] max-w-2xl mx-auto flex flex-col overflow-hidden\`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f4f4f2] h-[64px] shrink-0">
          <div className="w-8 h-8" /> {/* Spacer */}
          <span className="font-sans font-bold text-[18px] text-[#111110]">
            GAMURA BUBUBAI
          </span>
          <button
            type="button"
            className="p-1 px-2 text-[#111110] hover:bg-[#f4f4f2] rounded-lg transition-colors cursor-pointer"
            onClick={() => setGbSheetOpen(false)}
            aria-label="Close"
          >
            <X className="w-6 h-6 stroke-[1.8]" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-6 pb-safe flex flex-col gap-3">
          <a
            href="https://gamura.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setGbSheetOpen(false)}
            className="w-full text-center py-4 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-2xl transition-colors font-sans font-bold text-[16px] text-[#111110] cursor-pointer"
          >
            GAMURA
          </a>
          <a
            href="https://gamuragalaxy.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setGbSheetOpen(false)}
            className="w-full text-center py-4 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-2xl transition-colors font-sans font-bold text-[16px] text-[#111110] cursor-pointer"
          >
            GAMURA GALAXY
          </a>
        </div>
      </div>
      
      {/* ── BOTTOM SHEET BACKDROP ── */}
`;

content = content.replace('{/* ── BOTTOM SHEET BACKDROP ── */}', gbSheetHTML);

fs.writeFileSync('src/components/Dashboard.tsx', content);
