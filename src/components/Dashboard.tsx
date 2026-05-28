import React, { useState, useRef, useEffect } from "react";
import { 
  X, Camera, Image, FileText, ChevronRight, ListCollapse, Clock, Trash2, Code, 
  User, Lock, Sparkles, RefreshCw, BadgeCheck, Smartphone, Save
} from "lucide-react";
import { ChatView } from "./ChatView";
import { db, runWithRetry } from "../firebase";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  deleteDoc,
  limit,
  updateDoc
} from "firebase/firestore";

interface DashboardProps {
  userProfile: {
    uid?: string;
    name?: string;
    nickname?: string;
    username?: string;
    phoneNumber?: string;
    avatar?: string;
    createdAt?: any;
    hasGeneratedAvatar?: boolean;
  } | null;
  onSignOut: () => Promise<void>;
  onUpdateProfile?: (updatedProfile: any) => void;
}

export function Dashboard({ userProfile, onSignOut, onUpdateProfile }: DashboardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [textValue, setTextValue] = useState("");
  
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatPrompt, setActiveChatPrompt] = useState<string | null>(null);
  
  const [historyChats, setHistoryChats] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [limitAmount, setLimitAmount] = useState(15);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileNickname, setProfileNickname] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileAvatar, setProfileAvatar] = useState("");
  
  // States for AI Avatar creation
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiProgressText, setAiProgressText] = useState("");
  const [aiPreviewUrl, setAiPreviewUrl] = useState("");
  
  // Toggle between prompt and name-based custom avatar
  const [avatarMode, setAvatarMode] = useState<"prompt" | "name">("prompt");
  const [avatarNameInput, setAvatarNameInput] = useState("");
  const [nameGenerating, setNameGenerating] = useState(false);
  
  // Status message in Profile Page
  const [profileStatusMsg, setProfileStatusMsg] = useState("");
  const [profileErrorMsg, setProfileErrorMsg] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  // Synchronize edit states when profile opens or userProfile updates
  useEffect(() => {
    if (userProfile) {
      setProfileName(userProfile.name || "");
      setProfileNickname(userProfile.nickname || "");
      setProfilePhone(userProfile.phoneNumber || "");
      setProfileAvatar(userProfile.avatar || "");
      setAvatarNameInput(userProfile.nickname || userProfile.name || "Selva");
    }
  }, [userProfile, profileOpen]);

  // AI Avatar generation handler
  const handleGenerateAiAvatar = async () => {
    if (!aiPrompt.trim()) {
      setProfileErrorMsg("Please enter a creative description for your AI avatar first.");
      return;
    }
    
    setProfileErrorMsg("");
    setProfileStatusMsg("");
    setAiGenerating(true);
    setAiProgressText("Contacting Gemini 2.5 Image Engine...");
    
    const steps = [
      "Contacting Gemini 2.5 Image Engine...",
      "Analyzing creative instructions...",
      "Synthesizing high fidelity vector shapes...",
      "Rendering crisp lighting coordinates...",
      "Assembling circular layout frames...",
      "Finalizing masterpiece metadata..."
    ];
    
    let currentStepIndex = 0;
    const interval = setInterval(() => {
      if (currentStepIndex < steps.length - 1) {
        currentStepIndex++;
        setAiProgressText(steps[currentStepIndex]);
      }
    }, 3200);

    try {
      const response = await fetch("/api/bububai/generate-avatar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt: aiPrompt })
      });
      
      clearInterval(interval);
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to generate dynamic AI image.");
      }
      
      const data = await response.json();
      if (data.image) {
        setAiPreviewUrl(data.image);
        setAiProgressText("Masterpiece generated successfully!");
        if (data.isFallback) {
          setProfileStatusMsg("Gemini API quota depleted. Procedural vector avatar generated beautifully as a high-fidelity backup! Click 'Apply Icon' below.");
        } else {
          setProfileStatusMsg("Your custom AI avatar is ready! Click 'Apply Icon' below to preview or 'Save Profile' to finalize.");
        }
      } else {
        throw new Error("Empty image payload received from AI model.");
      }
    } catch (err: any) {
      clearInterval(interval);
      console.error(err);
       setProfileErrorMsg(err.message || "Dynamic avatar build timed out or failed. Please check your network or key.");
    } finally {
      setAiGenerating(false);
    }
  };

  // Custom Name Avatar generation handler
  const handleGenerateNameAvatar = async () => {
    if (!avatarNameInput.trim()) {
      setProfileErrorMsg("Please enter a name or nickname to create your custom name avatar.");
      return;
    }
    
    setProfileErrorMsg("");
    setProfileStatusMsg("");
    setNameGenerating(true);
    
    try {
      const response = await fetch("/api/bububai/generate-avatar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ 
          isNameAvatar: true, 
          name: avatarNameInput.trim() 
        })
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to generate custom name avatar.");
      }
      
      const data = await response.json();
      if (data.image) {
        setAiPreviewUrl(data.image);
        setProfileStatusMsg("Your custom typographic Name Badge avatar has been forged with pure excellence! Click 'Apply Icon' below.");
      } else {
        throw new Error("Empty payload received.");
      }
    } catch (err: any) {
      console.error(err);
      setProfileErrorMsg(err.message || "Could not forge name badge avatar, please try again.");
    } finally {
      setNameGenerating(false);
    }
  };

  // Profile update handler
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim() || !profileNickname.trim()) {
      setProfileErrorMsg("Name and Nickname are required details.");
      return;
    }
    
    // Check if they are trying to bypass the 1-avatar rule illegally (defense)
    if (userProfile?.hasGeneratedAvatar && profileAvatar !== userProfile.avatar) {
      setProfileErrorMsg("You have already used your single custom avatar slot. Please contact support to upgrade.");
      return;
    }
    
    setProfileErrorMsg("");
    setProfileStatusMsg("");
    setProfileSaving(true);
    
    try {
      if (!userProfile?.uid) return;
      const docRef = doc(db, "users", userProfile.uid);
      
      // If profileAvatar has changed and starts with 'data:', we set the generated flag to true
      const hasAppliedNewGenerated = profileAvatar !== (userProfile.avatar || "") && profileAvatar.startsWith("data:");
      const nowGeneratedStatus = userProfile.hasGeneratedAvatar || hasAppliedNewGenerated;
      
      const updatedData = {
        name: profileName.trim(),
        nickname: profileNickname.trim(),
        phoneNumber: profilePhone.trim(),
        avatar: profileAvatar || "",
        hasGeneratedAvatar: !!nowGeneratedStatus
      };
      
      await runWithRetry(() => updateDoc(docRef, updatedData));
      
      if (onUpdateProfile) {
        onUpdateProfile({
          ...userProfile,
          ...updatedData
        });
      }
      
      setProfileStatusMsg("Profile successfully updated. Security protocols synchronized.");
      setTimeout(() => {
        setProfileStatusMsg("");
      }, 3500);
    } catch (err: any) {
      console.error("Failed to update profile document:", err);
      setProfileErrorMsg(err.message || "Failed to save profile. Ensure database permissions are correct.");
    } finally {
      setProfileSaving(false);
    }
  };

  const loadChatHistory = async (customLimit?: number) => {
    if (!userProfile || !userProfile.uid) return;
    setLoadingHistory(true);
    try {
      const activeLimit = customLimit || limitAmount;
      const q = query(
        collection(db, "chats"),
        where("userId", "==", userProfile.uid),
        limit(activeLimit)
      );
      const querySnapshot = await runWithRetry(() => getDocs(q));
      const chatsList: any[] = [];
      const now = Date.now();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      const deletePromises: Promise<any>[] = [];

      querySnapshot.forEach((docSnap) => {
        const docId = docSnap.id;
        const data = docSnap.data();
        let updatedAtTime = now;
        
        if (data.updatedAt) {
          updatedAtTime = data.updatedAt.toDate ? data.updatedAt.toDate().getTime() : new Date(data.updatedAt).getTime();
        }

        const diffTime = now - updatedAtTime;
        if (diffTime >= twentyFourHoursMs) {
          // Delete stales automatically for peak performance
          deletePromises.push(runWithRetry(() => deleteDoc(doc(db, "chats", docId))));
        } else {
          chatsList.push({
            id: docId,
            title: data.title || "BUBUBAI Conversation",
            updatedAt: updatedAtTime,
            messages: data.messages || []
          });
        }
      });

      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }

      // Sort remaining chats by updatedAt descending (newest first)
      chatsList.sort((a, b) => b.updatedAt - a.updatedAt);
      setHistoryChats(chatsList);
    } catch (err) {
      console.error("Failed to load chat history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleLoadMore = () => {
    const nextLimit = limitAmount + 15;
    setLimitAmount(nextLimit);
    loadChatHistory(nextLimit);
  };

  useEffect(() => {
    loadChatHistory();
  }, [userProfile]);

  useEffect(() => {
    if (drawerOpen) {
      loadChatHistory();
    }
  }, [drawerOpen]);

  // Auto-grow function for textarea based on scroll height
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    setTextValue(el.value);
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  };

  // Allow clicking a quick-select chip prompt to enter BubuBai Chat immediately
  const handleChipClick = (promptText: string) => {
    if (!promptText.trim()) {
      setTextValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.focus();
      }
      return;
    }
    setActiveChatId(null);
    setActiveChatPrompt(promptText);
  };

  // Triggers the beautiful full BubuBai Chat Page with the prompt
  const handleSend = () => {
    if (!textValue.trim()) return;
    const promptToSend = textValue;
    setTextValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setActiveChatId(null);
    setActiveChatPrompt(promptToSend);
  };

  // Handle enter key form submission (excluding Shift + Enter for multiline)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Calculate greeting dynamically based on user's exact hour formula:
  // const h = new Date().getHours();
  // const g = h<5?'night':h<12?'morning':h<17?'afternoon':'evening';
  const getGreeting = () => {
    const h = new Date().getHours();
    return h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  };

  // Generate responsive display label initials for the avatar (fallback to SG)
  const getInitials = () => {
    const fullName = userProfile?.name || "Selvaranjan G";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return fullName.slice(0, 2).toUpperCase() || "SG";
  };

  const displayName = userProfile?.nickname || userProfile?.name || "Selva";
  const initials = getInitials();

  return (
    <div className="dashboard-root min-h-screen relative overflow-x-hidden selection:bg-[#ffeedb] select-none">
      
      {/* ── OVERLAY ── */}
      <div 
        id="overlay" 
        className={`dsb-overlay ${drawerOpen ? "on" : ""}`} 
        onClick={() => setDrawerOpen(false)}
      />

      {/* ── DRAWER ── */}
      <aside id="drawer" className={`dsb-drawer ${drawerOpen ? "on" : ""}`}>
        <div className="dr-top">
          <div className="av" style={{ width: "26px", height: "26px", fontSize: "10px", borderRadius: "7px", flexShrink: 0 }}>
            G
          </div>
          <span className="dr-logo">Gamura <b>AI</b></span>
        </div>

        <div className="dr-body">
          <div className="dr-label">Main</div>
          <a className="dr-row act" href="#" onClick={(e) => { e.preventDefault(); setDrawerOpen(false); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            Home
          </a>
          <a className="dr-row" href="#" onClick={(e) => { e.preventDefault(); handleChipClick(""); setDrawerOpen(false); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            New Chat
          </a>
          <a className="dr-row" href="#" onClick={(e) => { e.preventDefault(); setDrawerOpen(false); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Search
          </a>

          <div className="dr-sep"></div>
          <div className="dr-label flex items-center justify-between px-2">
            <span>Chat History</span>
            <span className="font-mono text-[8px] text-neutral-400 capitalize bg-neutral-100 px-1.5 py-0.5 rounded">Auto 24h</span>
          </div>

          <div className="space-y-1 my-2 max-h-[220px] overflow-y-auto px-2">
            {loadingHistory && historyChats.length === 0 ? (
              <div className="text-center py-2 text-[10px] font-mono text-neutral-400">Loading history...</div>
            ) : historyChats.length === 0 ? (
              <div className="text-center py-3 text-[11px] font-serif italic text-neutral-400">No recent chats</div>
            ) : (
              <>
                {historyChats.map((ch) => (
                  <div 
                    key={ch.id} 
                    className="flex items-center justify-between group rounded-lg hover:bg-neutral-100/50 transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveChatId(ch.id);
                        setActiveChatPrompt(null);
                        setDrawerOpen(false);
                      }}
                      className="flex-1 text-left px-2 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 font-sans truncate cursor-pointer uppercase tracking-wide flex items-center gap-1.5"
                      style={{ background: "none", border: "none" }}
                    >
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-300 group-hover:bg-emerald-500 shrink-0"></span>
                      <span className="truncate">{ch.title}</span>
                    </button>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await runWithRetry(() => deleteDoc(doc(db, "chats", ch.id)));
                          loadChatHistory();
                        } catch (err) {
                          console.error("Failed to manual delete:", err);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-650 transition-opacity cursor-pointer text-neutral-400"
                      title="Delete session"
                      style={{ background: "none", border: "none" }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {historyChats.length >= limitAmount && (
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    className="w-full mt-2 py-1 text-center text-[10px] uppercase tracking-wide font-mono text-neutral-400 hover:text-neutral-700 transition cursor-pointer"
                    style={{ background: "none", border: "none" }}
                  >
                    + Load More Chats
                  </button>
                )}
              </>
            )}
          </div>

          <div className="dr-sep"></div>
          <div className="dr-label">Gamura</div>
          <a className="dr-row" href="https://gamura.vercel.app/" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Gamura Platform
          </a>
          <a className="dr-row" href="#" onClick={(e) => { e.preventDefault(); setDrawerOpen(false); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            BuBuBai
            <span className="badge">New</span>
          </a>
          <a className="dr-row" href="https://gamuragalaxy.vercel.app/" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Gamura Galaxy
          </a>

          <div className="dr-sep"></div>
          <div className="dr-label">Account</div>
          <a className="dr-row" href="#" onClick={(e) => { e.preventDefault(); setDrawerOpen(false); setProfileOpen(true); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            Profile
          </a>
          <a className="dr-row" href="#" onClick={(e) => { e.preventDefault(); setDrawerOpen(false); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </a>
          <button 
            type="button"
            className="dr-row w-full text-left" 
            style={{ color: "#c94c2e" }} 
            onClick={async (e) => { 
              e.preventDefault(); 
              setDrawerOpen(false);
              await onSignOut(); 
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#c94c2e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
        </div>

        <div className="dr-bottom">
          <div className="dr-user cursor-pointer hover:bg-neutral-100/50 transition-colors -mx-1 p-1" onClick={() => { setDrawerOpen(false); setProfileOpen(true); }}>
            <div className="av overflow-hidden flex items-center justify-center">
              {userProfile?.avatar ? (
                <img src={userProfile.avatar} alt="User Avatar" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
              ) : (
                initials
              )}
            </div>
            <div className="dr-user-info av-info">
              <div className="av-name">{userProfile?.name || "Selvaranjan G"}</div>
              <div className="av-sub">Founder &amp; CEO · Gamura</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── HEADER ── */}
      <header className="dsb-header">
        <button 
          className={`menu-btn ${drawerOpen ? "on" : ""}`} 
          id="mb" 
          onClick={() => setDrawerOpen(!drawerOpen)} 
          aria-label="Menu"
        >
          <span></span><span></span><span></span>
        </button>

        <div className="hd-title">BuBu<em>Bai</em></div>

        <div className="hd-right">
          <button className="hd-btn" title="New chat" onClick={() => handleChipClick("")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              <line x1="12" y1="9" x2="12" y2="15"/>
              <line x1="9" y1="12" x2="15" y2="12"/>
            </svg>
          </button>
          <div className="hd-av overflow-hidden flex items-center justify-center shadow-sm" onClick={() => setDrawerOpen(true)}>
            {userProfile?.avatar ? (
              <img src={userProfile.avatar} alt="User Avatar" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
            ) : (
              initials
            )}
          </div>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="dsb-main">
        <div className="hero">
          <div className="ghost-icon overflow-hidden bg-white">
            <img 
              src="https://lh3.googleusercontent.com/d/1YQ_yqbUkfjuIDrM6rH1IYThahwYLReZw" 
              alt="BuBuBai Companion" 
              className="w-full h-full object-cover rounded-[14px]"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.dataset.retry) {
                  img.dataset.retry = "1";
                  img.src = "https://drive.google.com/thumbnail?id=1YQ_yqbUkfjuIDrM6rH1IYThahwYLReZw&sz=w256";
                }
              }}
            />
          </div>
          <h1 id="greet">
            Good {getGreeting()}, <em>{displayName}.</em><br />What shall we create?
          </h1>
          <p>Your Gamura AI companion — always ready</p>
        </div>

        <div className="wrap">
          <div className="box">
            <textarea 
              ref={textareaRef}
              id="ti" 
              className="dsb-textarea"
              rows={1} 
              placeholder="Chat with BuBuBai..."
              value={textValue}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
            />
            <div className="box-foot">
              <button 
                className="plus-btn" 
                title="Attach"
                onClick={() => setBottomSheetOpen(true)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              <button 
                className="send-btn" 
                id="sb" 
                disabled={!textValue.trim()} 
                onClick={handleSend} 
                title="Send"
              >
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>

          <div className="chips">
            <button className="chip" onClick={() => handleChipClick("Design a feature")}>Design a feature</button>
            <button className="chip" onClick={() => handleChipClick("Build a component")}>Build a component</button>
            <button className="chip" onClick={() => handleChipClick("What is BuBuBai?")}>What is BuBuBai?</button>
            <button className="chip" onClick={() => handleChipClick("Debug my code")}>Debug my code</button>
            <button className="chip" onClick={() => handleChipClick("Generate ideas")}>Generate ideas</button>
          </div>
        </div>

        <p className="note">Powered by Gamura · <a href="https://gamura.vercel.app/" target="_blank" rel="noopener noreferrer">Open Platform</a></p>
      </main>

      {/* ── BOTTOM SHEET BACKDROP ── */}
      {bottomSheetOpen && (
        <div 
          className="fixed inset-0 bg-[#111110]/15 backdrop-blur-[6px] z-[990] transition-all duration-300"
          onClick={() => setBottomSheetOpen(false)}
        />
      )}

      {/* ── BOTTOM SHEET (SLIDE BAR DOWN TO UP) ── */}
      <div 
        className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-[28px] z-[1000] border-t border-[#e2e2de] shadow-[0_-12px_44px_rgba(17,17,16,0.1)] transition-transform duration-300 ease-in-out transform ${
          bottomSheetOpen ? "translate-y-0" : "translate-y-full"
        } h-[50vh] max-w-2xl mx-auto flex flex-col overflow-hidden`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f4f4f2] h-[64px] shrink-0">
          <button 
            type="button"
            className="p-1 px-2 text-[#111110] hover:bg-[#f4f4f2] rounded-lg transition-colors cursor-pointer"
            onClick={() => setBottomSheetOpen(false)}
            aria-label="Close"
          >
            <X className="w-6 h-6 stroke-[1.8]" />
          </button>
          
          <span className="font-sans font-medium text-[17px] text-[#111110] translate-x-[-8px]">
            Add to chat
          </span>
          
          <div className="w-8 h-8" /> {/* Symmetry spacer */}
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto overflow-x-hidden">
          {/* Top 3 Buttons Grid */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <button 
              type="button" 
              onClick={() => {
                setTextValue(prev => prev + (prev ? " " : "") + "[Camera Photo] ");
                setBottomSheetOpen(false);
              }}
              className="flex flex-col items-center justify-center border-[1.5px] border-[#e2e2de] rounded-[20px] p-5 py-6 bg-white hover:bg-[#f4f4f2]/60 active:bg-[#f4f4f2] cursor-pointer transition-all duration-200 group"
            >
              <div className="w-12 h-12 rounded-full bg-[#f4f4f2] text-[#111110] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform duration-200">
                <Camera className="w-[23px] h-[23px] stroke-[1.5]" />
              </div>
              <span className="font-sans font-medium text-sm text-[#111110]">Camera</span>
            </button>

            <button 
              type="button" 
              onClick={() => {
                setTextValue(prev => prev + (prev ? " " : "") + "[Recent Photo] ");
                setBottomSheetOpen(false);
              }}
              className="flex flex-col items-center justify-center border-[1.5px] border-[#e2e2de] rounded-[20px] p-5 py-6 bg-white hover:bg-[#f4f4f2]/60 active:bg-[#f4f4f2] cursor-pointer transition-all duration-200 group"
            >
              <div className="w-12 h-12 rounded-full bg-[#f4f4f2] text-[#111110] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform duration-200">
                <Image className="w-[23px] h-[23px] stroke-[1.5]" />
              </div>
              <span className="font-sans font-medium text-sm text-[#111110]">Photos</span>
            </button>

            <button 
              type="button" 
              onClick={() => {
                setTextValue(prev => prev + (prev ? " " : "") + "[Document File] ");
                setBottomSheetOpen(false);
              }}
              className="flex flex-col items-center justify-center border-[1.5px] border-[#e2e2de] rounded-[20px] p-5 py-6 bg-white hover:bg-[#f4f4f2]/60 active:bg-[#f4f4f2] cursor-pointer transition-all duration-200 group"
            >
              <div className="w-12 h-12 rounded-full bg-[#f4f4f2] text-[#111110] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform duration-200">
                <FileText className="w-[23px] h-[23px] stroke-[1.5]" />
              </div>
              <span className="font-sans font-medium text-sm text-[#111110]">Files</span>
            </button>
          </div>

          {/* Divider */}
          <div className="w-full h-[1px] bg-[#ebebe8] my-6" />

          {/* Simulated List/Placeholders Matching Image's aesthetic block columns */}
          <div className="space-y-3">
            <h3 className="font-sans font-medium text-xs text-neutral-400 uppercase tracking-wider mb-2">
              Recent Activity &amp; Assets (Active Coding Language Helpers)
            </h3>
            
            {[
              { lang: "HTML Structure", prompt: "Help me write clean and responsive semantic HTML structure.", desc: "Templates, layouts & accessibility", code: "HTML" },
              { lang: "CSS Design", prompt: "Help me design stunning, futuristic layouts using Tailwind CSS and raw CSS.", desc: "Variables, modern grids & animations", code: "CSS" },
              { lang: "JavaScript Runtime", prompt: "Help me implement robust, high-performance interactive JavaScript functions.", desc: "ES6+, DOM events & serverless", code: "JS" },
              { lang: "Python Engine", prompt: "Help me build clean, highly efficient Python scripts, algorithms, or API routes with Flask/FastAPI.", desc: "AI integrations, scripts & analytics", code: "Python" },
              { lang: "C++ Optimization", prompt: "Help me write memory-safe, optimized modern C++ code.", desc: "Low-level, pointers & templates", code: "C++" },
              { lang: "TypeScript Scalability", prompt: "Help me draft typed, scalable React & Vite TSX components.", desc: "Interfaces, generics & hooks", code: "TS" },
              { lang: "SQL Database System", prompt: "Help me design optimized SQL databases, tables, and secure querying scripts.", desc: "Relational queries, indexes & transactions", code: "SQL" },
              { lang: "Rust Safety Engine", prompt: "Help me write secure, high-concurrency Rust services and systems with lifetime management.", desc: "Ownership, concurrency & robust modules", code: "Rust" },
              { lang: "Go Microservices", prompt: "Help me design high-throughput Go APIs, CLI tools, and lightweight concurrent services.", desc: "Goroutines, channels & structural design", code: "GO" },
              { lang: "Swift iOS Application", prompt: "Help me design elegant, responsive SwiftUI and native swift interfaces.", desc: "iOS features, app state & views", code: "Swift" },
              { lang: "Java Secure Enterprise", prompt: "Help me draft enterprise-grade Java code, Spring Boot configurations, and design systems.", desc: "Object-oriented, microservices & dependency injection", code: "Java" },
              { lang: "PHP Legacy & Laravel", prompt: "Help me build or build on modern Laravel PHP routes, MVC schemas, or native web layers.", desc: "Eloquent ORM, robust controllers & views", code: "PHP" },
              { lang: "C# .NET Architecture", prompt: "Help me build scalable ASP.NET Core structures or clean C# scripts.", desc: "LINQ, asynchronous operations & controllers", code: "C#" },
              { lang: "Ruby on Rails", prompt: "Help me write ruby scripts or elegant Ruby on Rails controllers and database migrations.", desc: "Active Record, active jobs & beautiful routing", code: "Ruby" }
            ].map((item, idx) => (
              <div 
                key={idx}
                onClick={() => {
                  setBottomSheetOpen(false);
                  setActiveChatId(null);
                  setActiveChatPrompt(item.prompt);
                }}
                className="flex items-center gap-3 p-3 rounded-xl border border-transparent hover:border-[#e2e2de] hover:bg-[#f8f8f6] transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-lg bg-[#111110] flex items-center justify-center shrink-0 group-hover:bg-[#10b981] transition-colors">
                  <Code className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-sans font-medium text-sm text-[#111110] mb-0.5">{item.lang}</div>
                  <div className="font-sans text-xs text-neutral-400 truncate">{item.desc}</div>
                </div>
                <div className="font-mono text-[10px] text-emerald-600 bg-emerald-50 px-2 py-1 rounded font-semibold">
                  {item.code}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {profileOpen && (
        <div id="profile-modal-root" className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-neutral-950/40 backdrop-blur-[8px] transition-all duration-300"
            onClick={() => setProfileOpen(false)}
          />
          
          <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#f07050]/5 rounded-full filter blur-[120px] pointer-events-none" />

          <div className="bg-[#ffffff] border border-[#e2e2de] rounded-[32px] w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl relative z-10 p-6 sm:p-8 flex flex-col space-y-6 animate-fadeIn">
            
            <div className="flex items-center justify-between border-b border-[#f4f4f2] pb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#b93a1c] flex items-center justify-center text-white font-mono text-xs">
                  ★
                </div>
                <div>
                  <h2 className="font-sans font-bold text-base text-[#111110] leading-none">
                    Security Profile Panel
                  </h2>
                  <p className="text-[9px] font-mono tracking-widest text-neutral-400 uppercase mt-1">
                    Identity & Security Registry
                  </p>
                </div>
              </div>
              
              <button
                type="button"
                className="p-1.5 text-neutral-400 hover:text-[#111110] hover:bg-[#f4f4f2] rounded-lg transition-colors cursor-pointer"
                onClick={() => setProfileOpen(false)}
                aria-label="Close"
              >
                <X className="w-[19px] h-[19px]" />
              </button>
            </div>

            {profileStatusMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-xl flex items-center gap-2 animate-fadeIn">
                <BadgeCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">{profileStatusMsg}</span>
              </div>
            )}

            {profileErrorMsg && (
              <div className="p-3 bg-red-50 border border-red-155 text-red-800 text-xs rounded-xl flex items-center gap-2 animate-fadeIn">
                <Lock className="w-4 h-4 text-red-550 shrink-0" />
                <span className="font-medium">{profileErrorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              
              <div className="md:col-span-12 lg:col-span-5 flex flex-col items-center space-y-4 bg-[#fbfbf9]/60 border border-[#f4f4f2] rounded-[20px] p-5">
                
                <div className="relative">
                  <div className="w-20 h-20 rounded-full border-2 border-neutral-200 bg-neutral-900 p-0.5 shadow-inner flex items-center justify-center overflow-hidden">
                    {profileAvatar ? (
                      <img 
                        src={profileAvatar} 
                        alt="Current Profile Picture" 
                        className="w-full h-full object-cover rounded-full"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-xl font-bold font-sans text-white">{initials}</span>
                    )}
                  </div>
                  
                  <div className="absolute bottom-0 right-0 p-1.5 bg-[#111110] border border-white text-white rounded-full shadow-lg">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                  </div>
                </div>

                <div className="text-center">
                  <h3 className="font-sans font-bold text-[10px] text-neutral-400 uppercase tracking-widest leading-none">
                    MEMBER PASS
                  </h3>
                  <p className="text-[10px] text-neutral-700 font-bold font-mono mt-1">
                    CLASS: PLATINUM GATE
                  </p>
                </div>

                <div className="w-full border-t border-[#ebebe8] pt-4 flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono tracking-widest text-[#f07050] font-bold uppercase flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> AVATAR FORGE PANEL
                    </span>
                    <span className="text-[8px] font-mono font-bold bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
                      {userProfile?.hasGeneratedAvatar ? "1/1 LOCKED" : "0/1 SLOTS"}
                    </span>
                  </div>

                  {userProfile?.hasGeneratedAvatar ? (
                    <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3.5 flex flex-col space-y-2 text-center animate-fadeIn">
                      <div className="mx-auto w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-800">
                        <Lock className="w-4 h-4" />
                      </div>
                      <h4 className="font-sans font-extrabold text-[10px] text-amber-900 uppercase tracking-wider">
                        Avatar Config Locked
                      </h4>
                      <p className="text-[10px] text-amber-700 leading-normal">
                        Your custom profile identity has been committed to the security database. Under security registry policies, custom signatures can only be forged once.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Segment Selector */}
                      <div className="grid grid-cols-2 gap-1 bg-neutral-100 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => { setAvatarMode("prompt"); setAiPreviewUrl(""); }}
                          className={`py-1.5 text-[9px] font-mono tracking-wider rounded-lg transition-all cursor-pointer ${
                            avatarMode === "prompt" 
                              ? "bg-white text-neutral-900 shadow-sm font-bold" 
                              : "text-neutral-500 hover:text-neutral-900"
                          }`}
                        >
                          Gemini AI Image
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAvatarMode("name"); setAiPreviewUrl(""); }}
                          className={`py-1.5 text-[9px] font-mono tracking-wider rounded-lg transition-all cursor-pointer ${
                            avatarMode === "name" 
                              ? "bg-white text-neutral-900 shadow-sm font-bold" 
                              : "text-neutral-500 hover:text-neutral-900"
                          }`}
                        >
                          Forge Typename
                        </button>
                      </div>

                      {avatarMode === "prompt" ? (
                        <div className="space-y-2.5 animate-fadeIn">
                          <p className="text-[10px] text-neutral-400 font-sans leading-relaxed">
                            Describe your vision below to forge a custom circular vector icon avatar using the Gemini model.
                          </p>

                          <div className="relative">
                            <textarea
                              placeholder="E.g., minimalist vector coder girl icon, beautiful pastel orange background..."
                              value={aiPrompt}
                              onChange={(e) => setAiPrompt(e.target.value)}
                              className="w-full text-xs font-sans placeholder-neutral-400 bg-white border border-[#e2e2de] rounded-xl p-2 h-[56px] resize-none focus:outline-none focus:border-neutral-800 transition"
                              disabled={aiGenerating}
                            />
                          </div>

                          <button
                            type="button"
                            disabled={aiGenerating || !aiPrompt.trim()}
                            onClick={handleGenerateAiAvatar}
                            className="w-full py-2 bg-neutral-950 text-white rounded-xl text-[10px] font-mono tracking-wider hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5 select-none cursor-pointer"
                          >
                            {aiGenerating ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin text-[#c94c2e]" />
                                <span>Generating...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                <span>Generate with Gemini</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2.5 animate-fadeIn">
                          <p className="text-[10px] text-neutral-400 font-sans leading-relaxed">
                            Type your name to procedurally compile a breathtaking circular geometric vector badge.
                          </p>

                          <div>
                            <input
                              type="text"
                              value={avatarNameInput}
                              onChange={(e) => setAvatarNameInput(e.target.value)}
                              placeholder="Type name here..."
                              className="w-full text-xs font-mono bg-white border border-[#e2e2de] rounded-xl px-3 py-2 focus:outline-none focus:border-neutral-800 transition"
                              maxLength={15}
                              disabled={nameGenerating}
                            />
                          </div>

                          <button
                            type="button"
                            disabled={nameGenerating || !avatarNameInput.trim()}
                            onClick={handleGenerateNameAvatar}
                            className="w-full py-2 bg-[#b93a1c] text-white rounded-xl text-[10px] font-mono tracking-wider hover:bg-[#a03115] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5 select-none cursor-pointer"
                          >
                            {nameGenerating ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin text-white" />
                                <span>Forging Vector badge...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                <span>Forge Name Badge</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {aiGenerating && (
                        <div className="w-full space-y-1">
                          <div className="w-full bg-neutral-100 rounded-full h-1 relative overflow-hidden">
                            <div className="bg-[#f07050] h-1 rounded-full animate-pulse w-[80%]" />
                          </div>
                          <p className="text-[8px] font-mono text-center text-neutral-400">{aiProgressText}</p>
                        </div>
                      )}

                      {aiPreviewUrl && (
                        <div className="border border-neutral-100 bg-[#fbfbf9] rounded-xl p-2.5 flex items-center justify-between gap-2.5 animate-fadeIn w-full">
                          <div className="flex items-center gap-2">
                            <img 
                              src={aiPreviewUrl} 
                              alt="AI Preview result" 
                              className="w-10 h-10 object-cover rounded-full border border-neutral-200 shadow-sm"
                              referrerPolicy="no-referrer"
                            />
                            <div>
                              <p className="text-[8px] font-mono text-neutral-400">PREVIEW MATCH</p>
                              <p className="text-[11px] text-neutral-800 font-extrabold leading-none mt-0.5">
                                {avatarMode === "name" ? "Typographic Badge" : "Custom Art"}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setProfileAvatar(aiPreviewUrl);
                              setProfileStatusMsg("Avatar applied locally! Ensure to click 'Save Profile' below to lock & persist.");
                            }}
                            className="py-1 px-3 bg-neutral-950 text-white hover:bg-neutral-800 rounded-lg text-[9px] font-bold tracking-wide transition cursor-pointer"
                          >
                            Apply Icon
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

              </div>

              <form onSubmit={handleSaveProfile} className="md:col-span-12 lg:col-span-7 flex flex-col space-y-4">
                
                <div className="space-y-4">
                  
                  <div className="bg-[#fcfcfb] border border-[#f4f4f2] rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <label className="text-[9px] font-mono tracking-widest text-[#111110] font-bold block mb-0.5 uppercase">
                        UNIQUE USERNAME (IMMUTABLE FOR SECURITY)
                      </label>
                      <span className="text-xs font-sans font-extrabold text-neutral-800 truncate block">
                        @{userProfile?.username || "selvaranjan"}
                      </span>
                    </div>
                    <div className="p-2 bg-neutral-100 rounded-xl" title="Username is a permanent security signifier.">
                      <Lock className="w-3.5 h-3.5 text-neutral-400" />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-mono tracking-widest text-[#111110] block mb-1 font-bold uppercase">
                      LITERAL FULL NAME
                    </label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        className="w-full bg-white border border-[#e2e2de] rounded-xl pl-9 pr-3 py-2 text-xs text-neutral-800 font-sans focus:outline-none focus:border-neutral-800 transition-colors font-medium"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-mono tracking-widest text-[#111110] block mb-1 font-bold uppercase">
                      DISPLAY NICKNAME
                    </label>
                    <div className="relative">
                      <Sparkles className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={profileNickname}
                        onChange={(e) => setProfileNickname(e.target.value)}
                        className="w-full bg-white border border-[#e2e2de] rounded-xl pl-9 pr-3 py-2 text-xs text-neutral-800 font-sans focus:outline-none focus:border-neutral-800 transition-colors font-medium"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-mono tracking-widest text-[#111110] block mb-1 font-bold uppercase">
                      CONTACT SECURE PHONE
                    </label>
                    <div className="relative">
                      <Smartphone className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        placeholder="Not registered"
                        className="w-full bg-white border border-[#e2e2de] rounded-xl pl-9 pr-3 py-2 text-xs text-neutral-805 font-mono focus:outline-none focus:border-neutral-800 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="bg-[#f8f8f6] rounded-xl p-2.5 border border-[#ebebe8] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span className="text-[9px] text-neutral-500 font-mono">
                      SECURE MATCH ID: REG-{userProfile?.uid?.slice(0, 10).toUpperCase() || "GATEWAY"}
                    </span>
                  </div>

                </div>

                <div className="flex gap-2 justify-end pt-3 border-t border-[#f4f4f2] mt-4">
                  <button
                    type="button"
                    onClick={() => setProfileOpen(false)}
                    className="py-2 px-4 border border-[#e2e2de] text-[10px] font-mono tracking-wider rounded-xl uppercase hover:bg-[#f4f4f2] transition cursor-pointer"
                  >
                    Close
                  </button>
                  
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="py-2 px-5 bg-[#111110] text-white text-[10px] font-mono tracking-wider rounded-xl uppercase hover:bg-neutral-800 disabled:opacity-50 transition flex items-center gap-1 cursor-pointer"
                  >
                    {profileSaving ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3 h-3" />
                        <span>Save Profile</span>
                      </>
                    )}
                  </button>
                </div>

              </form>

            </div>

          </div>
        </div>
      )}

      {(activeChatId !== null || activeChatPrompt !== null) && (
        <ChatView 
          initialPrompt={activeChatPrompt} 
          activeChatId={activeChatId}
          userProfile={userProfile} 
          onBack={() => {
            setActiveChatId(null);
            setActiveChatPrompt(null);
            loadChatHistory();
          }} 
          onOpenBottomSheet={() => setBottomSheetOpen(true)}
        />
      )}
    </div>
  );
}
