import React, { useState, useEffect, useRef } from 'react';

export const MODES = [
  { id:"normal",     icon:"💬", label:"Normal",     desc:"Friendly everyday chat",      color:"#6C63FF", prompt:"You are BuBuBai, a friendly and helpful assistant. Chat naturally and warmly with the user." },
  { id:"code",       icon:"⌨️", label:"Code",       desc:"Write & debug code",           color:"#00C896", prompt:"You are BuBuBai in Code mode. Help the user write, debug, and explain code. Always format code in markdown code blocks." },
  { id:"creative",   icon:"✨", label:"Creative",   desc:"Stories, poems & ideas",       color:"#FF6B9D", prompt:"You are BuBuBai in Creative mode. Help with stories, poems, scripts, and creative ideas. Be imaginative and expressive." },
  { id:"study",      icon:"📚", label:"Study",      desc:"Explain & teach anything",     color:"#FFB347", prompt:"You are BuBuBai in Study mode. Explain concepts clearly, give examples, and help the user understand topics deeply." },
  { id:"translate",  icon:"🌐", label:"Translate",  desc:"Any language, instantly",      color:"#38BDF8", prompt:"You are BuBuBai in Translate mode. Detect the input language and translate accurately to the user's desired language." },
  { id:"focus",      icon:"🎯", label:"Focus",      desc:"No fluff, direct answers",     color:"#F87171", prompt:"You are BuBuBai in Focus mode. Give concise, direct answers only. No filler, no pleasantries — just the answer." },
];

export function ModesSheet({
  isOpen,
  onClose,
  activeModeId,
  onApplyMode
}: {
  isOpen: boolean;
  onClose: () => void;
  activeModeId: string;
  onApplyMode: (id: string) => void;
}) {
  const [pendingId, setPendingId] = useState(activeModeId);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPendingId(activeModeId);
    }
  }, [isOpen, activeModeId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const startY = useRef(0);
  const currentY = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    isDragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    currentY.current = e.touches[0].clientY - startY.current;
    if (currentY.current > 0 && sheetRef.current) {
      sheetRef.current.style.transition = 'none';
      sheetRef.current.style.transform = `translateY(${currentY.current}px)`;
    }
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
    if (sheetRef.current) {
      sheetRef.current.style.transition = '';
      sheetRef.current.style.transform = '';
    }
    if (currentY.current > 90) {
      onClose();
    }
    currentY.current = 0;
  };

  const pendingMode = MODES.find(m => m.id === pendingId) || MODES[0];

  return (
    <>
      <style>{`
        .modes-backdrop {
          position: fixed; inset: 0;
          background: rgba(20,20,50,0.40);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          z-index: 1000;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.35s ease;
        }
        .modes-backdrop.show { opacity: 1; pointer-events: all; }

        .modes-sheet {
          font-family: 'DM Sans', sans-serif;
          position: fixed;
          bottom: 0; left: 0; right: 0;
          background: #fff;
          border-radius: 28px 28px 0 0;
          z-index: 1001;
          padding: 0 20px 36px;
          max-height: 85vh;
          overflow-y: auto;
          box-shadow: 0 -8px 48px rgba(108,99,255,0.18);
          transform: translateY(100%);
          transition: transform 0.46s cubic-bezier(0.32, 0.72, 0, 1);
          will-change: transform;
          overscroll-behavior: contain;
        }
        .modes-sheet.open { transform: translateY(0); }
        .modes-sheet::-webkit-scrollbar { width: 3px; }
        .modes-sheet::-webkit-scrollbar-thumb { background: #DDDDF5; border-radius: 4px; }

        .modes-handle {
          width: 44px; height: 5px;
          background: #E0E0EE;
          border-radius: 100px;
          margin: 14px auto 20px;
        }

        .modes-sheet-header {
          display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 4px;
        }
        .modes-sheet-eyebrow {
          font-size: 9px; font-weight: 800; letter-spacing: 0.14em; color: #6C63FF; margin-bottom: 4px;
          margin-top: 0;
        }
        .modes-sheet-title {
          font-size: 26px; font-weight: 800; color: #1a1a2e; letter-spacing: -0.03em;
          margin-top: 0; margin-bottom: 0;
        }
        .modes-close-btn {
          background: #F4F4FF; border: none; border-radius: 50%;
          width: 36px; height: 36px;
          font-size: 14px; color: #6060A0; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: background 0.15s, transform 0.15s;
          font-family: inherit;
        }
        .modes-close-btn:hover { background: #E8E8FF; transform: scale(1.08); }

        .modes-sheet-sub {
          font-size: 13px; color: #8888AA; margin: 6px 0 20px; line-height: 1.5;
        }

        .modes-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px;
        }
        .mode-card {
          position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
          padding: 14px 14px 12px; border-radius: 18px; border: 2px solid #E8E8F0;
          background: #FAFAFF; cursor: pointer; text-align: left; font-family: inherit;
          transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s, border-color 0.22s, background 0.22s;
          outline: none;
        }
        .mode-card:hover { transform: translateY(-3px) scale(1.02); }
        .mode-card:active { transform: scale(0.97); }
        .mode-card.active {
          border-color: var(--c);
          background: color-mix(in srgb, var(--c) 8%, white);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--c) 35%, transparent), 0 4px 18px color-mix(in srgb, var(--c) 20%, transparent);
        }
        .mode-emoji { font-size: 24px; margin-bottom: 2px; }
        .mode-name { font-size: 14px; font-weight: 800; color: #1a1a2e; letter-spacing: -0.01em; transition: color 0.2s; }
        .mode-card.active .mode-name { color: var(--c); }
        .mode-desc { font-size: 11px; color: #9090B0; font-weight: 400; line-height: 1.35; }
        .check-badge {
          position: absolute; top: 10px; right: 10px; width: 20px; height: 20px; border-radius: 50%;
          background: var(--c); color: #fff; font-size: 11px; font-weight: 800;
          display: flex; align-items: center; justify-content: center;
          opacity: 0; transform: scale(0.5); transition: opacity 0.2s, transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }
        .mode-card.active .check-badge { opacity: 1; transform: scale(1); }

        .prompt-box {
          background: #F7F7FF; border-radius: 14px; padding: 13px 15px; margin-bottom: 18px; border: 1px solid #EBEBF8;
        }
        .prompt-label {
          font-size: 9px; font-weight: 800; letter-spacing: 0.12em; color: #B0B0D0; margin-bottom: 6px; margin-top: 0;
        }
        .prompt-text {
          font-size: 12.5px; color: #5050A0; line-height: 1.6; font-style: italic; margin: 0;
        }

        .apply-btn {
          width: 100%; padding: 16px; border-radius: 16px; border: none; color: #fff;
          font-size: 15px; font-weight: 800; cursor: pointer; letter-spacing: -0.01em; font-family: inherit;
          background: var(--active-color, #6C63FF); transition: opacity 0.15s, transform 0.15s, background 0.3s;
          box-shadow: 0 4px 20px color-mix(in srgb, var(--active-color, #6C63FF) 40%, transparent);
        }
        .apply-btn:hover { opacity: 0.88; transform: translateY(-2px); }
        .apply-btn:active { transform: scale(0.98); opacity: 1; }
      `}</style>
      <div className={`modes-backdrop ${isOpen ? 'show' : ''}`} onClick={onClose} />
      <div
        ref={sheetRef}
        className={`modes-sheet ${isOpen ? 'open' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="modes-handle" />
        <div className="modes-sheet-header">
          <div>
            <p className="modes-sheet-eyebrow">BUBUBAI</p>
            <h2 className="modes-sheet-title">Chat Mode</h2>
          </div>
          <button className="modes-close-btn" onClick={onClose}>✕</button>
        </div>
        <p className="modes-sheet-sub">Each mode tunes BuBuBai's personality and focus.</p>

        <div className="modes-grid">
          {MODES.map(m => (
            <button
              key={m.id}
              className={`mode-card ${m.id === pendingId ? 'active' : ''}`}
              style={{ '--c': m.color } as React.CSSProperties}
              onClick={() => setPendingId(m.id)}
            >
              <span className="mode-emoji">{m.icon}</span>
              <span className="mode-name">{m.label}</span>
              <span className="mode-desc">{m.desc}</span>
              <span className="check-badge">✓</span>
            </button>
          ))}
        </div>

        <div className="prompt-box">
          <p className="prompt-label">SYSTEM PROMPT PREVIEW</p>
          <p className="prompt-text">{pendingMode.prompt}</p>
        </div>

        <button
          className="apply-btn"
          style={{
            '--active-color': pendingMode.color,
            boxShadow: `0 4px 20px ${pendingMode.color}66`
          } as React.CSSProperties}
          onClick={() => {
            onApplyMode(pendingId);
            onClose();
          }}
        >
          Apply {pendingMode.icon} {pendingMode.label} Mode
        </button>
      </div>
    </>
  );
}
