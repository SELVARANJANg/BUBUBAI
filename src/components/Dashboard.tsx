import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Camera,
  Image,
  FileText,
  ChevronRight,
  ListCollapse,
  Clock,
  Trash2,
  Code,
  User,
  Lock,
  Sparkles,
  RefreshCw,
  BadgeCheck,
  Smartphone,
  Save,
  LogOut,
  Sliders,
  Copy,
  Check,
  Globe,
  Mail,
  Smile,
  NotebookPen,
  LayoutGrid,
  ToggleRight,
  ArrowLeft,
  Edit2,
} from "lucide-react";
import { ChatView, ChatAttachment } from "./ChatView";
import { db, runWithRetry } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  deleteDoc,
  limit,
  updateDoc,
  serverTimestamp,
  getDoc,
  setDoc,
} from "firebase/firestore";

interface DashboardProps {
  userProfile: {
    uid?: string;
    name?: string;
    nickname?: string;
    username?: string;
    phoneNumber?: string;
    email?: string;
    avatar?: string;
    createdAt?: any;
    hasGeneratedAvatar?: boolean;
  } | null;
  onSignOut: () => Promise<void>;
  onUpdateProfile?: (updatedProfile: any) => void;
}

export function Dashboard({
  userProfile,
  onSignOut,
  onUpdateProfile,
}: DashboardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSearchActive, setDrawerSearchActive] = useState(false);
  const [drawerSearchQuery, setDrawerSearchQuery] = useState("");
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [gbSheetOpen, setGbSheetOpen] = useState(false);
  const [onAddAttachment, setOnAddAttachment] = useState<((attachments: ChatAttachment[]) => void) | null>(null);
  const [textValue, setTextValue] = useState("");

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatPrompt, setActiveChatPrompt] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileInputAccept, setFileInputAccept] = useState<string>("*/*");
  const [fileInputCapture, setFileInputCapture] = useState<string | undefined>(undefined);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (!files.length) return;
    
    // The user can add 6 files per chat, wait actually just limit to 6
    if (files.length > 6) {
      alert("You can only add up to 6 files per message.");
      return;
    }

    const readAsBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    };

    try {
      const attachments: ChatAttachment[] = await Promise.all(
        files.map(async (f) => ({
          type: f.type || "application/octet-stream",
          name: f.name,
          data: await readAsBase64(f)
        }))
      );

      if (onAddAttachment) {
        onAddAttachment(attachments);
      }
    } catch (error) {
      console.error("Error reading files", error);
    }
    
    setBottomSheetOpen(false);
  };


  const [historyChats, setHistoryChats] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [limitAmount, setLimitAmount] = useState(15);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copiedMatchId, setCopiedMatchId] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSuccessMsg, setSettingsSuccessMsg] = useState("");
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [testerOpen, setTesterOpen] = useState(false);
  const [cameraAccess, setCameraAccess] = useState(
    () => localStorage.getItem("bububai_camera_access") === "true",
  );

  const [settingsView, setSettingsView] = useState<
    "main" | "access" | "language" | "personalization" | "memories" | "apps"
  >("main");
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (cameraAccess && settingsOpen && settingsView === "main") {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ video: true })
          .then((stream) => {
            setVideoStream(stream);
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
            }
          })
          .catch((err) => {
            console.warn("Camera access denied:", err);
            setCameraAccess(false);
            localStorage.setItem("bububai_camera_access", "false");
          });
      } else {
        setCameraAccess(false);
        localStorage.setItem("bububai_camera_access", "false");
      }
    } else {
      if (videoStream) {
        videoStream.getTracks().forEach((track) => track.stop());
        setVideoStream(null);
      }
    }
    return () => {
      if (videoStream) {
        videoStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraAccess, settingsOpen, settingsView]);

  const [settingsLanguage, setSettingsLanguage] = useState(
    () => localStorage.getItem("bububai_language") || "English",
  );
  const [settingsTheme, setSettingsTheme] = useState(
    () => localStorage.getItem("bububai_theme") || "Light",
  );
  const [settingsAccent, setSettingsAccent] = useState(
    () => localStorage.getItem("bububai_accent") || "#0ea872",
  );
  const [settingsFontSize, setSettingsFontSize] = useState(
    () => localStorage.getItem("bububai_font_size") || "Medium",
  );

  const [settingsMemories, setSettingsMemories] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("bububai_memories") || "[]");
    } catch {
      return [];
    }
  });
  const [newMemory, setNewMemory] = useState("");

  const [settingsApps, setSettingsApps] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("bububai_apps") ||
          '{"core":true,"gamura":true,"galaxy":true}',
      );
    } catch {
      return { core: true, gamura: true, galaxy: true };
    }
  });

  const [pswCurrent, setPswCurrent] = useState("");
  const [pswNew, setPswNew] = useState("");
  const [pswConfirm, setPswConfirm] = useState("");

  const showToast = (msg: string) => {
    setSettingsSuccessMsg(msg);
    setTimeout(() => setSettingsSuccessMsg(""), 3000);
  };

  useEffect(() => {
    if (settingsTheme === "Dark" || settingsTheme === "Amoled") {
      document.documentElement.classList.add("dark");
      if (settingsTheme === "Amoled") {
        document.documentElement.classList.add("bg-black");
      } else {
        document.documentElement.classList.remove("bg-black");
      }
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.remove("bg-black");
    }

    if (settingsFontSize === "Small") {
      document.documentElement.style.fontSize = "14px";
    } else if (settingsFontSize === "Large") {
      document.documentElement.style.fontSize = "18px";
    } else {
      document.documentElement.style.fontSize = "16px";
    }
  }, [settingsTheme, settingsFontSize]);

  // Settings configurations
  const [chatTemp, setChatTemp] = useState(() =>
    parseFloat(localStorage.getItem("chat_temp") || "0.7"),
  );
  const [defaultModel, setDefaultModel] = useState(
    () => localStorage.getItem("chat_default_model") || "gemini-1.5-pro",
  );
  const [biometricBypass, setBiometricBypass] = useState(
    () => localStorage.getItem("chat_biometric_bypass") === "true",
  );

  const [profileName, setProfileName] = useState("");
  const [profileNickname, setProfileNickname] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renameChatId, setRenameChatId] = useState<string | null>(null);
  const [renameChatTitle, setRenameChatTitle] = useState<string>("");

  // Synchronize edit states when profile opens or userProfile updates
  useEffect(() => {
    if (userProfile) {
      setProfileName(userProfile.name || "");
      setProfileNickname(userProfile.nickname || "");
      setProfilePhone(userProfile.phoneNumber || "");
      setProfileEmail(userProfile.email || "");
      setProfileAvatar(userProfile.avatar || "");
      setAvatarNameInput(userProfile.nickname || userProfile.name || "Selva");
    }
  }, [userProfile?.uid, userProfile?.name, userProfile?.nickname, userProfile?.phoneNumber, userProfile?.email, userProfile?.avatar, profileOpen]);

  const [dailyUsage, setDailyUsage] = useState<{ date: string; count: number }>({
    date: new Date().toDateString(),
    count: 0,
  });

  const fetchDailyUsage = async () => {
    if (!userProfile?.uid) return;
    try {
      const docRef = doc(db, "user_limits", userProfile.uid);
      const docSnap = await runWithRetry(() => getDoc(docRef));
      const todayStr = new Date().toDateString();

      if (docSnap && docSnap.exists()) {
        const data = docSnap.data();
        if (data.date === todayStr) {
          setDailyUsage({
            date: data.date,
            count: typeof data.count === "number" ? data.count : 0,
          });
        } else {
          setDailyUsage({
            date: todayStr,
            count: 0,
          });
          await runWithRetry(() =>
            setDoc(docRef, {
              date: todayStr,
              count: 0,
              userId: userProfile.uid,
              updatedAt: serverTimestamp(),
            })
          );
        }
      } else {
        setDailyUsage({
          date: todayStr,
          count: 0,
        });
        await runWithRetry(() =>
          setDoc(docRef, {
            date: todayStr,
            count: 0,
            userId: userProfile.uid,
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (e) {
      console.warn("Could not read daily chat limit in Dashboard:", e);
    }
  };

  useEffect(() => {
    fetchDailyUsage();
  }, [userProfile?.uid, activeChatId, activeChatPrompt, settingsOpen, drawerOpen]);

  // AI Avatar generation handler
  const handleGenerateAiAvatar = async () => {
    setProfileErrorMsg("SERVER BUSY PLEASE TRY AGAIN LATER.");
  };

  // Custom Name Avatar generation handler
  const handleGenerateNameAvatar = async () => {
    if (userProfile?.hasGeneratedAvatar) {
      setProfileErrorMsg(
        "You have already used your 1 slot for generating a banner. Only one is allowed per user.",
      );
      return;
    }

    if (!avatarNameInput.trim()) {
      setProfileErrorMsg(
        "Please enter a name or nickname to create your custom name avatar.",
      );
      return;
    }

    setProfileErrorMsg("");
    setProfileStatusMsg("");
    setNameGenerating(true);

    try {
      const response = await fetch("/api/bububai/generate-avatar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isNameAvatar: true,
          name: avatarNameInput.trim(),
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(
          errData.error || "Failed to generate custom name avatar.",
        );
      }

      const data = await response.json();
      if (data.image) {
        setAiPreviewUrl(data.image);
        setProfileAvatar(data.image); // Auto-fill the slot

        // Save immediately to Firestore
        if (userProfile?.uid) {
          const docRef = doc(db, "users", userProfile.uid);
          const updatedData = {
            ...userProfile,
            avatar: data.image,
            hasGeneratedAvatar: true,
            updatedAt: serverTimestamp(),
          };
          await runWithRetry(() =>
            updateDoc(docRef, {
              avatar: data.image,
              hasGeneratedAvatar: true,
              updatedAt: serverTimestamp(),
            }),
          );
          onUpdateProfile(updatedData as any);
        }

        setProfileStatusMsg(
          "Banner successfully created and permanently saved to your 1 slot.",
        );
      } else {
        throw new Error("Empty payload received.");
      }
    } catch (err: any) {
      console.error(err);
      setProfileErrorMsg(
        err.message || "Could not forge name badge avatar, please try again.",
      );
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
    if (
      userProfile?.hasGeneratedAvatar &&
      profileAvatar !== userProfile.avatar
    ) {
      setProfileErrorMsg(
        "You have already used your single custom avatar slot. Please contact support to upgrade.",
      );
      return;
    }

    setProfileErrorMsg("");
    setProfileStatusMsg("");
    setProfileSaving(true);

    try {
      if (!userProfile?.uid) return;
      const docRef = doc(db, "users", userProfile.uid);

      // If profileAvatar has changed and starts with 'data:', we set the generated flag to true
      const hasAppliedNewGenerated =
        profileAvatar !== (userProfile.avatar || "") &&
        profileAvatar.startsWith("data:");
      const nowGeneratedStatus =
        userProfile.hasGeneratedAvatar || hasAppliedNewGenerated;

      const updatedData = {
        name: profileName.trim(),
        nickname: profileNickname.trim(),
        phoneNumber: profilePhone.trim(),
        email: profileEmail.trim(),
        avatar: profileAvatar || "",
        hasGeneratedAvatar: !!nowGeneratedStatus,
      };

      await runWithRetry(() => updateDoc(docRef, updatedData));

      if (onUpdateProfile) {
        onUpdateProfile({
          ...userProfile,
          ...updatedData,
        });
      }

      setProfileStatusMsg(
        "Profile successfully updated. Security protocols synchronized.",
      );
      setTimeout(() => {
        setProfileStatusMsg("");
      }, 3500);
    } catch (err: any) {
      console.error("Failed to update profile document:", err);
      setProfileErrorMsg(
        err.message ||
          "Failed to save profile. Ensure database permissions are correct.",
      );
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
        limit(activeLimit),
      );
      const querySnapshot = await runWithRetry(() => getDocs(q));
      const chatsList: any[] = [];
      const now = Date.now();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      const deletePromises: Promise<any>[] = [];

      if (querySnapshot) {
        querySnapshot.forEach((docSnap) => {
          const docId = docSnap.id;
          const data = docSnap.data();
          let updatedAtTime = now;

          if (data.updatedAt) {
            updatedAtTime = data.updatedAt.toDate
              ? data.updatedAt.toDate().getTime()
              : new Date(data.updatedAt).getTime();
          }

          const diffTime = now - updatedAtTime;
          if (diffTime >= twentyFourHoursMs) {
            // Delete stales automatically for peak performance
            deletePromises.push(
              runWithRetry(() => deleteDoc(doc(db, "chats", docId))),
            );
          } else {
            chatsList.push({
              id: docId,
              title: data.title || "Conversation",
              updatedAt: updatedAtTime,
              messages: data.messages || [],
            });
          }
        });
      }

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
    if (userProfile?.uid) {
      loadChatHistory();
    }
  }, [userProfile?.uid]);

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

  // Allow clicking a quick-select chip prompt to enter App Chat immediately
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

  // Triggers the beautiful full App Chat Page with the prompt
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
    return h < 5
      ? "night"
      : h < 12
        ? "morning"
        : h < 17
          ? "afternoon"
          : "evening";
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
          <img
            src="https://lh3.googleusercontent.com/d/1YQ_yqbUkfjuIDrM6rH1IYThahwYLReZw"
            alt="BUBUBAI Logo"
            referrerPolicy="no-referrer"
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "6px",
              flexShrink: 0,
              objectFit: "cover",
            }}
          />
          <span className="dr-logo">BUBUBAI</span>
        </div>

        <div className="dr-body">
          <div className="dr-label">Main</div>
          <a
            className="dr-row act"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setDrawerOpen(false);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            Home
          </a>
          <a
            className="dr-row"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handleChipClick("");
              setDrawerOpen(false);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            New Chat
          </a>
          {drawerSearchActive ? (
            <div className="dr-row flex items-center gap-2 px-3 py-2">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 w-4 h-4 text-neutral-400"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                autoFocus
                placeholder="Search history..."
                value={drawerSearchQuery}
                onChange={(e) => setDrawerSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-[13px] text-neutral-800 placeholder:text-neutral-400 font-sans p-0 m-0"
                onBlur={() => {
                  if (!drawerSearchQuery) setDrawerSearchActive(false);
                }}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDrawerSearchQuery("");
                  setDrawerSearchActive(false);
                }}
                className="p-1 hover:bg-neutral-200 rounded-lg text-neutral-400 transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <a
              className="dr-row"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setDrawerSearchActive(true);
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Search
            </a>
          )}

          <div className="dr-sep"></div>
          <div className="dr-label flex items-center justify-between px-2">
            <span>Chat History</span>
            <span className="font-mono text-[8px] text-neutral-400 capitalize bg-neutral-100 px-1.5 py-0.5 rounded">
              Auto 24h
            </span>
          </div>

          <div className="space-y-1 my-2 max-h-[220px] overflow-y-auto px-2">
            {loadingHistory && historyChats.length === 0 ? (
              <div className="text-center py-2 text-[10px] font-mono text-neutral-400">
                Loading history...
              </div>
            ) : historyChats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-5 px-3.5 text-center bg-emerald-50/20 border border-dashed border-emerald-200/50 rounded-2xl my-2">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mb-2.5">
                  <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse" />
                </div>
                <h4 className="text-[12px] font-sans font-semibold text-neutral-800 tracking-tight">No Recent Conversations</h4>
                <p className="text-[10px] font-sans text-neutral-500 max-w-[160px] mt-1 leading-normal">
                  Ask code, design, or layout questions to begin your creative coding journey!
                </p>
                <button
                  type="button"
                  onClick={() => {
                    handleChipClick("");
                    setDrawerOpen(false);
                  }}
                  className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-sans text-[11px] font-medium py-1.5 px-2.5 rounded-xl shadow-sm transition-all flex items-center justify-center gap-1"
                >
                  Start New Session
                </button>
              </div>
            ) : (
              (() => {
                const filteredHistoryChats = historyChats.filter((ch) =>
                  ch.title
                    ?.toLowerCase()
                    .includes(drawerSearchQuery.toLowerCase()),
                );
                const displayedHistoryChats =
                  showAllHistory || drawerSearchQuery
                    ? filteredHistoryChats
                    : filteredHistoryChats.slice(0, 6);

                if (filteredHistoryChats.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-5 px-3.5 text-center bg-neutral-50/60 border border-dashed border-neutral-200/50 rounded-2xl my-2">
                      <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center mb-2">
                        <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                      </div>
                      <h4 className="text-[11px] font-sans font-semibold text-neutral-600">No matches found</h4>
                      <p className="text-[9px] font-sans text-neutral-400 mt-0.5 max-w-[140px] leading-normal">
                        Try searching with another keyword or start fresh.
                      </p>
                    </div>
                  );
                }

                return (
                  <>
                    {displayedHistoryChats.map((ch) => (
                      <div
                        key={ch.id}
                        className="flex items-center justify-between group rounded-lg hover:bg-neutral-100/50 transition-all"
                      >
                        {renameChatId === ch.id ? (
                          <div className="flex-1 flex gap-1.5 items-center px-1.5 py-1">
                            <input
                              type="text"
                              value={renameChatTitle}
                              onChange={(e) => setRenameChatTitle(e.target.value)}
                              autoFocus
                              onKeyDown={async (e) => {
                                if (e.key === "Enter" && renameChatTitle.trim()) {
                                  try {
                                    await runWithRetry(() =>
                                      updateDoc(doc(db, "chats", ch.id), { title: renameChatTitle.trim() })
                                    );
                                    setRenameChatId(null);
                                    loadChatHistory();
                                  } catch (err) {
                                    console.error("Failed to rename:", err);
                                    setRenameChatId(null);
                                  }
                                } else if (e.key === "Escape") {
                                  setRenameChatId(null);
                                }
                              }}
                              className="flex-1 text-xs text-neutral-900 bg-white border border-neutral-300 rounded px-1.5 py-1 focus:outline-none focus:border-neutral-500 font-sans"
                            />
                            <div className="flex items-center">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (renameChatTitle.trim()) {
                                    try {
                                      await runWithRetry(() =>
                                        updateDoc(doc(db, "chats", ch.id), { title: renameChatTitle.trim() })
                                      );
                                      setRenameChatId(null);
                                      loadChatHistory();
                                    } catch (err) {
                                      console.error("Failed to rename:", err);
                                      setRenameChatId(null);
                                    }
                                  } else {
                                    setRenameChatId(null);
                                  }
                                }}
                                className="text-neutral-400 hover:text-emerald-500 p-0.5 transition-colors"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setRenameChatId(null)}
                                className="text-neutral-400 hover:text-red-500 p-0.5 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
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
                            {confirmDeleteId === ch.id ? (
                              <div className="flex gap-2 relative z-10 px-1 items-center">
                                <span className="text-[10px] text-red-500 uppercase tracking-widest font-mono font-medium">Delete?</span>
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      await runWithRetry(() =>
                                        deleteDoc(doc(db, "chats", ch.id)),
                                      );
                                      setConfirmDeleteId(null);
                                      loadChatHistory();
                                    } catch (err) {
                                      console.error("Failed to manual delete:", err);
                                      setConfirmDeleteId(null);
                                    }
                                  }}
                                  className="text-[10px] text-red-650 hover:text-red-700 uppercase tracking-wider font-mono font-bold"
                                >
                                  Yes
                                </button>
                                <span className="text-neutral-300 text-[10px]">/</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteId(null);
                                  }}
                                  className="text-[10px] text-neutral-400 hover:text-neutral-600 uppercase tracking-wider font-mono"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <div className="opacity-0 group-hover:opacity-100 flex items-center transition-opacity">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRenameChatId(ch.id);
                                    setRenameChatTitle(ch.title);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="p-1 hover:text-neutral-700 text-neutral-400 cursor-pointer"
                                  title="Rename session"
                                  style={{ background: "none", border: "none" }}
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteId(ch.id);
                                    setRenameChatId(null);
                                  }}
                                  className="p-1 hover:text-red-500 text-neutral-400 cursor-pointer"
                                  title="Delete session"
                                  style={{ background: "none", border: "none" }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}

                    {!showAllHistory &&
                      !drawerSearchQuery &&
                      filteredHistoryChats.length > 6 && (
                        <button
                          type="button"
                          onClick={() => setShowAllHistory(true)}
                          className="w-full mt-2 py-1 text-center text-[10px] uppercase tracking-wide font-mono text-neutral-400 hover:text-neutral-700 transition cursor-pointer"
                          style={{ background: "none", border: "none" }}
                        >
                          + View All History
                        </button>
                      )}

                    {(showAllHistory || drawerSearchQuery) &&
                      filteredHistoryChats.length >= limitAmount && (
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
                );
              })()
            )}
          </div>

          <div className="dr-sep"></div>
          <div className="dr-label">Gamura</div>
          <a
            className="dr-row"
            href="https://gamura.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Gamura Platform
          </a>
          <a
            className="dr-row"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setDrawerOpen(false);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            BUBUBAI
            <span className="badge">New</span>
          </a>
          <a
            className="dr-row"
            href="https://gamuragalaxy.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Gamura Galaxy
          </a>

          <div className="dr-sep"></div>
          <div className="dr-label">Account</div>
          <a
            className="dr-row"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setDrawerOpen(false);
              setProfileOpen(true);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            Profile
          </a>
          <a
            className="dr-row"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setDrawerOpen(false);
              setSettingsOpen(true);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c94c2e"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
        </div>

        <div className="dr-bottom border-t border-neutral-100/50 pt-2.5">
          <div
            className="dr-user cursor-pointer hover:bg-neutral-100/50 transition-colors -mx-1 p-1 rounded-xl"
            onClick={() => {
              setDrawerOpen(false);
              setProfileOpen(true);
            }}
          >
            <div className="av overflow-hidden flex items-center justify-center">
              {userProfile?.avatar ? (
                <img
                  src={userProfile.avatar}
                  alt="User Avatar"
                  className="w-full h-full object-cover rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                initials
              )}
            </div>
            <div className="dr-user-info av-info">
              <div className="av-name">
                {userProfile?.name || "Selvaranjan G"}
              </div>
              <div className="av-sub">
                {userProfile?.nickname || "User"}{" "}
                {userProfile?.username ? `· @${userProfile.username}` : ""}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="w-full mt-2 py-1.5 px-3 bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 text-[10px] font-mono tracking-wider rounded-xl transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer uppercase font-extrabold"
            onClick={async (e) => {
              e.stopPropagation();
              setDrawerOpen(false);
              await onSignOut();
            }}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out From Card</span>
          </button>
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
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div className="hd-title flex justify-center items-center">
          <div className="bg-white/10 rounded-lg p-1 flex items-center justify-center">
            <img
              src="https://lh3.googleusercontent.com/d/1ntyJZciZOZhsJz0q4kqlRv4-xpRd57ED"
              alt="BUBUBAI Logo"
              className="h-8 w-auto object-contain rounded-sm"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        <div className="hd-right relative">
          <button
            className="hd-btn"
            title="Options"
            onClick={() => setPlusMenuOpen(!plusMenuOpen)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <line x1="12" y1="9" x2="12" y2="15" />
              <line x1="9" y1="12" x2="15" y2="12" />
            </svg>
          </button>
          {plusMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setPlusMenuOpen(false)}
              />
              <div className="absolute right-0 top-[calc(100%+8px)] w-40 z-50 bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-neutral-100 py-1 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                <button
                  onClick={() => {
                    handleChipClick("");
                    setPlusMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 transition-colors flex items-center gap-2.5"
                >
                  <svg
                    className="w-4 h-4 text-neutral-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    <line x1="12" y1="9" x2="12" y2="15" />
                    <line x1="9" y1="12" x2="15" y2="12" />
                  </svg>
                  New Chat
                </button>
                <div className="h-px w-full bg-neutral-100 my-0"></div>
                <button
                  onClick={() => {
                    setTesterOpen(true);
                    setPlusMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 transition-colors flex items-center gap-2.5"
                >
                  <svg
                    className="w-4 h-4 text-neutral-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                    <path d="M12 18v-6" />
                    <path d="m9 15 3 3 3-3" />
                  </svg>
                  Tester
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="dsb-main">
        <div className="hero">
          <div className="ghost-icon overflow-hidden bg-white">
            <img
              src="https://lh3.googleusercontent.com/d/1YQ_yqbUkfjuIDrM6rH1IYThahwYLReZw"
              alt="BUBUBAI Companion"
              className="w-full h-full object-cover rounded-[14px]"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.dataset.retry) {
                  img.dataset.retry = "1";
                  img.src =
                    "https://drive.google.com/thumbnail?id=1YQ_yqbUkfjuIDrM6rH1IYThahwYLReZw&sz=w256";
                }
              }}
            />
          </div>
          <h1 id="greet">
            Good {getGreeting()}, <em>{displayName}.</em>
            <br />
            What shall we create?
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
              placeholder="Chat with BUBUBAI..."
              value={textValue}
              disabled={false}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
            />
            <div className="box-foot" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="flex items-center text-[11px] font-mono select-none font-bold tracking-tight">
                <button onClick={() => setGbSheetOpen(true)} className="font-sans font-bold text-[13px] text-neutral-600 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg px-3 py-1 cursor-pointer transition-colors shadow-sm">GB</button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="plus-btn"
                  title="Attach"
                  disabled={false}
                  onClick={() => setBottomSheetOpen(true)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <button
                  className="send-btn"
                  id="sb"
                  disabled={!textValue.trim()}
                  onClick={handleSend}
                  title="Send"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="chips">
            <button
              className="chip"
              onClick={() => handleChipClick("Design a feature")}
            >
              Design a feature
            </button>
            <button
              className="chip"
              onClick={() => handleChipClick("Build a component")}
            >
              Build a component
            </button>
            <button
              className="chip"
              onClick={() => handleChipClick("What is BUBUBAI?")}
            >
              What is BUBUBAI?
            </button>
            <button
              className="chip"
              onClick={() => handleChipClick("Debug my code")}
            >
              Debug my code
            </button>
            <button
              className="chip"
              onClick={() => handleChipClick("Generate ideas")}
            >
              Generate ideas
            </button>
          </div>
        </div>

        <p className="note">
          Powered by Gamura ·{" "}
          <a
            href="https://gamura.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Platform
          </a>
        </p>
      </main>

      
      {/* ── GB SHEET BACKDROP ── */}
      {gbSheetOpen && (
        <div
          className="fixed inset-0 bg-[#111110]/15 backdrop-blur-[6px] z-[1000] transition-all duration-300"
          onClick={() => setGbSheetOpen(false)}
        />
      )}

      {/* ── GB SHEET (SLIDE BAR DOWN TO UP) ── */}
      <div
        className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-[28px] z-[1010] border-t border-[#e2e2de] shadow-[0_-12px_44px_rgba(17,17,16,0.1)] transition-transform duration-300 ease-in-out transform ${
          gbSheetOpen ? "translate-y-0" : "translate-y-full"
        } h-[50vh] max-w-2xl mx-auto flex flex-col overflow-hidden`}
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
      
      <input type="file" ref={fileInputRef} accept={fileInputAccept} capture={fileInputCapture as any} multiple onChange={handleFileSelect} className="hidden" />
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
    setFileInputAccept("image/*");
    setFileInputCapture("environment");
    setTimeout(() => fileInputRef.current?.click(), 0);
  }}
              className="flex flex-col items-center justify-center border-[1.5px] border-[#e2e2de] rounded-[20px] p-5 py-6 bg-white hover:bg-[#f4f4f2]/60 active:bg-[#f4f4f2] cursor-pointer transition-all duration-200 group"
            >
              <div className="w-12 h-12 rounded-full bg-[#f4f4f2] text-[#111110] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform duration-200">
                <Camera className="w-[23px] h-[23px] stroke-[1.5]" />
              </div>
              <span className="font-sans font-medium text-sm text-[#111110]">
                Camera
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
    setFileInputAccept("image/*");
    setFileInputCapture(undefined);
    setTimeout(() => fileInputRef.current?.click(), 0);
  }}
              className="flex flex-col items-center justify-center border-[1.5px] border-[#e2e2de] rounded-[20px] p-5 py-6 bg-white hover:bg-[#f4f4f2]/60 active:bg-[#f4f4f2] cursor-pointer transition-all duration-200 group"
            >
              <div className="w-12 h-12 rounded-full bg-[#f4f4f2] text-[#111110] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform duration-200">
                <Image className="w-[23px] h-[23px] stroke-[1.5]" />
              </div>
              <span className="font-sans font-medium text-sm text-[#111110]">
                Photos
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
    setFileInputAccept("*/*");
    setFileInputCapture(undefined);
    setTimeout(() => fileInputRef.current?.click(), 0);
  }}
              className="flex flex-col items-center justify-center border-[1.5px] border-[#e2e2de] rounded-[20px] p-5 py-6 bg-white hover:bg-[#f4f4f2]/60 active:bg-[#f4f4f2] cursor-pointer transition-all duration-200 group"
            >
              <div className="w-12 h-12 rounded-full bg-[#f4f4f2] text-[#111110] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform duration-200">
                <FileText className="w-[23px] h-[23px] stroke-[1.5]" />
              </div>
              <span className="font-sans font-medium text-sm text-[#111110]">
                Files
              </span>
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
              {
                lang: "HTML Structure",
                prompt:
                  "Help me write clean and responsive semantic HTML structure.",
                desc: "Templates, layouts & accessibility",
                code: "HTML",
              },
              {
                lang: "CSS Design",
                prompt:
                  "Help me design stunning, futuristic layouts using Tailwind CSS and raw CSS.",
                desc: "Variables, modern grids & animations",
                code: "CSS",
              },
              {
                lang: "JavaScript Runtime",
                prompt:
                  "Help me implement robust, high-performance interactive JavaScript functions.",
                desc: "ES6+, DOM events & serverless",
                code: "JS",
              },
              {
                lang: "Python Engine",
                prompt:
                  "Help me build clean, highly efficient Python scripts, algorithms, or API routes with Flask/FastAPI.",
                desc: "AI integrations, scripts & analytics",
                code: "Python",
              },
              {
                lang: "C++ Optimization",
                prompt: "Help me write memory-safe, optimized modern C++ code.",
                desc: "Low-level, pointers & templates",
                code: "C++",
              },
              {
                lang: "TypeScript Scalability",
                prompt:
                  "Help me draft typed, scalable React & Vite TSX components.",
                desc: "Interfaces, generics & hooks",
                code: "TS",
              },
              {
                lang: "SQL Database System",
                prompt:
                  "Help me design optimized SQL databases, tables, and secure querying scripts.",
                desc: "Relational queries, indexes & transactions",
                code: "SQL",
              },
              {
                lang: "Rust Safety Engine",
                prompt:
                  "Help me write secure, high-concurrency Rust services and systems with lifetime management.",
                desc: "Ownership, concurrency & robust modules",
                code: "Rust",
              },
              {
                lang: "Go Microservices",
                prompt:
                  "Help me design high-throughput Go APIs, CLI tools, and lightweight concurrent services.",
                desc: "Goroutines, channels & structural design",
                code: "GO",
              },
              {
                lang: "Swift iOS Application",
                prompt:
                  "Help me design elegant, responsive SwiftUI and native swift interfaces.",
                desc: "iOS features, app state & views",
                code: "Swift",
              },
              {
                lang: "Java Secure Enterprise",
                prompt:
                  "Help me draft enterprise-grade Java code, Spring Boot configurations, and design systems.",
                desc: "Object-oriented, microservices & dependency injection",
                code: "Java",
              },
              {
                lang: "PHP Legacy & Laravel",
                prompt:
                  "Help me build or build on modern Laravel PHP routes, MVC schemas, or native web layers.",
                desc: "Eloquent ORM, robust controllers & views",
                code: "PHP",
              },
              {
                lang: "C# .NET Architecture",
                prompt:
                  "Help me build scalable ASP.NET Core structures or clean C# scripts.",
                desc: "LINQ, asynchronous operations & controllers",
                code: "C#",
              },
              {
                lang: "Ruby on Rails",
                prompt:
                  "Help me write ruby scripts or elegant Ruby on Rails controllers and database migrations.",
                desc: "Active Record, active jobs & beautiful routing",
                code: "Ruby",
              },
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
                  <div className="font-sans font-medium text-sm text-[#111110] mb-0.5">
                    {item.lang}
                  </div>
                  <div className="font-sans text-xs text-neutral-400 truncate">
                    {item.desc}
                  </div>
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
        <div
          id="profile-modal-root"
          className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-neutral-950/40 backdrop-blur-[8px] transition-all duration-300"
            onClick={() => setProfileOpen(false)}
          />

          <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#f07050]/5 rounded-full filter blur-[120px] pointer-events-none" />

          <div className="bg-[#ffffff] border border-[#e2e2de] rounded-[32px] w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl relative z-10 p-6 sm:p-8 flex flex-col space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-[#f4f4f2] pb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <img
                  src="https://lh3.googleusercontent.com/d/1YQ_yqbUkfjuIDrM6rH1IYThahwYLReZw"
                  alt="BUBUBAI Logo"
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-lg object-cover"
                />
                <div>
                  <h2 className="font-sans font-bold text-base text-[#111110] leading-none">
                    BUBUBAI PROFILE
                  </h2>
                  <p className="text-[9px] font-mono tracking-widest text-neutral-400 uppercase mt-1">
                    Manage your account
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
                      <span className="text-xl font-bold font-sans text-white">
                        {initials}
                      </span>
                    )}
                  </div>
                </div>

                <div className="w-full pt-2 flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono tracking-widest text-[#f07050] font-bold uppercase flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> AVATAR
                    </span>
                    <span className="text-[8px] font-mono font-bold bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
                      {userProfile?.hasGeneratedAvatar
                        ? "1/1 LOCKED"
                        : "0/1 SLOTS"}
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
                        Your custom profile identity has been committed to the
                        security database. Under security registry policies,
                        custom signatures can only be forged once.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Segment Selector */}
                      <div className="grid grid-cols-2 gap-1 bg-neutral-100 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => {
                            setAvatarMode("prompt");
                            setAiPreviewUrl("");
                          }}
                          className={`py-1.5 text-[9px] font-mono tracking-wider rounded-lg transition-all cursor-pointer ${
                            avatarMode === "prompt"
                              ? "bg-white text-neutral-900 shadow-sm font-bold"
                              : "text-neutral-500 hover:text-neutral-900"
                          }`}
                        >
                          AI IMAGE (Disabled)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAvatarMode("name");
                            setAiPreviewUrl("");
                          }}
                          className={`py-1.5 text-[9px] font-mono tracking-wider rounded-lg transition-all cursor-pointer ${
                            avatarMode === "name"
                              ? "bg-white text-neutral-900 shadow-sm font-bold"
                              : "text-neutral-500 hover:text-neutral-900"
                          }`}
                        >
                          BANNER
                        </button>
                      </div>

                      {avatarMode === "prompt" ? (
                        <div className="space-y-2.5 animate-fadeIn">
                          <p className="text-[10px] text-neutral-400 font-sans leading-relaxed">
                            Describe your vision below to forge a custom
                            circular vector icon avatar using the BUBUBAI model.
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
                            className="w-full py-2 bg-[#c94c2e] text-white rounded-xl text-[10px] font-mono tracking-wider hover:bg-[#a03115] disabled:bg-neutral-400 disabled:opacity-100 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5 select-none cursor-pointer"
                          >
                            {aiGenerating ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin text-white" />
                                <span>GENERATING...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                <span>CREATE AVATAR</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2.5 animate-fadeIn">
                          <p className="text-[10px] text-neutral-400 font-sans leading-relaxed">
                            Type your name to procedurally compile a
                            breathtaking circular geometric vector badge.
                          </p>

                          <div>
                            <input
                              type="text"
                              value={avatarNameInput}
                              onChange={(e) =>
                                setAvatarNameInput(e.target.value)
                              }
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
                            className="w-full py-2 bg-[#c94c2e] text-white rounded-xl text-[10px] font-mono tracking-wider hover:bg-[#a03115] disabled:bg-neutral-400 disabled:opacity-100 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5 select-none cursor-pointer"
                          >
                            {nameGenerating ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin text-white" />
                                <span>FORGING BANNER...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                <span>CREATE BANNER</span>
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
                          <p className="text-[8px] font-mono text-center text-neutral-400">
                            {aiProgressText}
                          </p>
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
                              <p className="text-[8px] font-mono text-neutral-400">
                                PREVIEW MATCH
                              </p>
                              <p className="text-[11px] text-neutral-800 font-extrabold leading-none mt-0.5">
                                {avatarMode === "name"
                                  ? "Typographic Badge"
                                  : "Custom Art"}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setProfileAvatar(aiPreviewUrl);
                              setProfileStatusMsg(
                                "Avatar applied locally! Ensure to click 'Save Profile' below to lock & persist.",
                              );
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

              <form
                onSubmit={handleSaveProfile}
                className="md:col-span-12 lg:col-span-7 flex flex-col space-y-4"
              >
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
                    <div
                      className="p-2 bg-neutral-100 rounded-xl"
                      title="Username is a permanent security signifier."
                    >
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

                  <div>
                    <label className="text-[9px] font-mono tracking-widest text-[#111110] block mb-1 font-bold uppercase">
                      EMAIL ADDRESS
                    </label>
                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={profileEmail}
                        onChange={(e) => setProfileEmail(e.target.value)}
                        placeholder="Not registered"
                        className="w-full bg-white border border-[#e2e2de] rounded-xl pl-9 pr-3 py-2 text-xs text-neutral-805 font-sans focus:outline-none focus:border-neutral-800 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="bg-[#f8f8f6] rounded-xl p-2.5 border border-[#ebebe8] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                      <span className="text-[9px] text-neutral-500 font-mono truncate">
                        SECURE MATCH ID: REG-
                        {userProfile?.uid?.slice(0, 10).toUpperCase() ||
                          "GATEWAY"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (userProfile?.uid) {
                          navigator.clipboard.writeText(userProfile.uid);
                          setCopiedMatchId(true);
                          setTimeout(() => setCopiedMatchId(false), 2000);
                        }
                      }}
                      className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/50 rounded transition cursor-pointer flex items-center justify-center shrink-0"
                      title="Copy System User ID"
                      id="copy-match-id-btn"
                    >
                      {copiedMatchId ? (
                        <span className="text-[7.5px] text-emerald-600 font-mono font-bold px-1 uppercase animate-pulse">
                          Copied!
                        </span>
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-3 border-t border-[#f4f4f2] mt-4 font-sans">
                  {/* Logout button in Member Pass profile card section per instructions */}
                  <button
                    type="button"
                    onClick={async () => {
                      setProfileOpen(false);
                      await onSignOut();
                    }}
                    className="mr-auto py-2 px-3 border border-red-200 hover:bg-neutral-50 text-[10px] font-mono tracking-wider rounded-xl uppercase transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer text-[#c94c2e] font-extrabold"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    <span>Card Sign Out</span>
                  </button>

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

      {settingsOpen && (
        <div
          id="settings-modal-root"
          className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-neutral-950/40 backdrop-blur-[8px] transition-all duration-300"
            onClick={() => setSettingsOpen(false)}
          />

          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#c94c2e]/5 rounded-full filter blur-[120px] pointer-events-none" />

          <div className="bg-[#ffffff] border border-[#e2e2de] rounded-[32px] w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl relative z-10 p-6 sm:p-8 flex flex-col space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-[#f4f4f2] pb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                {settingsView === "main" ? (
                  <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center text-white">
                    <Sliders className="w-4 h-4" />
                  </div>
                ) : (
                  <button
                    onClick={() => setSettingsView("main")}
                    className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-800 hover:bg-neutral-200 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div>
                  <h2 className="font-sans font-bold text-base text-[#111110] leading-none">
                    {settingsView === "main" && "BUBUBAI Settings"}
                    {settingsView === "access" && "Access"}
                    {settingsView === "language" && "Language"}
                    {settingsView === "personalization" && "Personalization"}
                    {settingsView === "memories" && "Memories"}
                    {settingsView === "apps" && "Apps"}
                  </h2>
                  {settingsView === "main" && (
                    <p className="text-[9px] font-mono tracking-widest text-neutral-400 uppercase mt-1">
                      Manage your preferences
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="p-1.5 text-neutral-400 hover:text-[#111110] hover:bg-[#f4f4f2] rounded-lg transition-colors cursor-pointer"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close"
              >
                <X className="w-[19px] h-[19px]" />
              </button>
            </div>

            {settingsSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-855 text-xs rounded-xl flex items-center gap-2 animate-fadeIn">
                <BadgeCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium mr-auto text-emerald-800">
                  {settingsSuccessMsg}
                </span>
              </div>
            )}

            <div className="space-y-3">
              {settingsView === "main" && (
                <>
                  {/* BUBUBAI Account */}
                  <div className="bg-neutral-50 rounded-[20px] overflow-hidden border border-neutral-100">
                    <div className="flex items-center gap-4 p-4 bg-white">
                      <Mail className="w-[22px] h-[22px] text-neutral-800" />
                      <div>
                        <div className="text-[15px] font-medium text-neutral-800 leading-tight">
                          Email
                        </div>
                        <div className="text-[13px] text-neutral-500 mt-0.5">
                          {userProfile?.email || ""}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Group 1 */}
                  <div className="bg-neutral-50 rounded-[24px] overflow-hidden border border-neutral-100">
                    <button
                      className="w-full flex items-center gap-4 p-4 border-b border-neutral-100 bg-white hover:bg-neutral-50 transition-colors"
                      onClick={() => setSettingsView("access")}
                    >
                      <Lock className="w-[22px] h-[22px] text-neutral-800" />
                      <div className="text-[15px] font-medium text-neutral-800 text-left flex-1">
                        Access
                      </div>
                      <ChevronRight className="w-[18px] h-[18px] text-neutral-400" />
                    </button>

                    <button
                      className="w-full flex items-center justify-between p-4 border-b border-neutral-100 bg-white hover:bg-neutral-50 transition-colors"
                      onClick={() => {
                        const newAccess = !cameraAccess;
                        setCameraAccess(newAccess);
                        localStorage.setItem(
                          "bububai_camera_access",
                          newAccess ? "true" : "false",
                        );
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <Camera className="w-[22px] h-[22px] text-neutral-800" />
                        <div className="text-[15px] font-medium text-neutral-800 text-left">
                          Camera Access
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 pointer-events-none">
                        <input
                          type="checkbox"
                          checked={cameraAccess}
                          readOnly
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0ea872]"></div>
                      </label>
                    </button>

                    {cameraAccess && (
                      <div className="bg-neutral-900 border-b border-neutral-100 relative aspect-video flex-col flex justify-center items-center overflow-hidden h-40">
                        {videoStream ? (
                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="absolute inset-0 w-full h-full object-cover"
                          ></video>
                        ) : (
                          <div className="text-neutral-500 font-mono text-[10px] uppercase text-center px-4">
                            {!navigator.mediaDevices?.getUserMedia
                              ? "Camera not supported in this browser"
                              : "Initializing camera..."}
                          </div>
                        )}
                        {!videoStream &&
                          navigator.mediaDevices?.getUserMedia && (
                            <div className="absolute inset-0 w-full h-full animate-pulse bg-neutral-800" />
                          )}
                      </div>
                    )}

                    <button
                      className="w-full flex items-center gap-4 p-4 bg-white hover:bg-neutral-50 transition-colors"
                      onClick={() => setSettingsView("language")}
                    >
                      <Globe className="w-[22px] h-[22px] text-neutral-800" />
                      <div className="text-left flex-1">
                        <div className="text-[15px] font-medium text-neutral-800">
                          Language
                        </div>
                        <div className="text-[13px] text-neutral-500 mt-0.5">
                          {settingsLanguage}
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Group 2 */}
                  <div className="bg-neutral-50 rounded-[24px] overflow-hidden border border-neutral-100">
                    <button
                      className="w-full flex items-center gap-4 p-4 border-b border-neutral-100 bg-white hover:bg-neutral-50 transition-colors"
                      onClick={() => setSettingsView("personalization")}
                    >
                      <Smile className="w-[22px] h-[22px] text-neutral-800" />
                      <div className="text-[15px] font-medium text-neutral-800 text-left flex-1">
                        Personalization
                      </div>
                      <ChevronRight className="w-[18px] h-[18px] text-neutral-400" />
                    </button>

                    <button
                      className="w-full flex items-center gap-4 p-4 border-b border-neutral-100 bg-white hover:bg-neutral-50 transition-colors"
                      onClick={() => setSettingsView("memories")}
                    >
                      <NotebookPen className="w-[22px] h-[22px] text-neutral-800" />
                      <div className="text-[15px] font-medium text-neutral-800 text-left flex-1">
                        Memories
                      </div>
                      <ChevronRight className="w-[18px] h-[18px] text-neutral-400" />
                    </button>

                    <button
                      className="w-full flex items-center gap-4 p-4 bg-white hover:bg-neutral-50 transition-colors"
                      onClick={() => setSettingsView("apps")}
                    >
                      <LayoutGrid className="w-[22px] h-[22px] text-neutral-800" />
                      <div className="text-[15px] font-medium text-neutral-800 text-left flex-1">
                        Apps
                      </div>
                      <ChevronRight className="w-[18px] h-[18px] text-neutral-400" />
                    </button>
                  </div>
                </>
              )}

              {settingsView === "language" && (
                <div className="bg-neutral-50 rounded-[24px] overflow-hidden border border-neutral-100 py-1">
                  {[
                    "English",
                    "Tamil",
                    "Hindi",
                    "Japanese",
                    "Korean",
                    "French",
                    "German",
                    "Spanish",
                  ].map((lang) => (
                    <button
                      key={lang}
                      onClick={() => {
                        setSettingsLanguage(lang);
                        localStorage.setItem("bububai_language", lang);
                        showToast(`Language set to ${lang} ✓`);
                        setSettingsView("main");
                      }}
                      className="w-full flex items-center justify-between p-4 border-b border-neutral-50 last:border-0 bg-white hover:bg-neutral-50 transition-colors"
                    >
                      <span className="text-[15px] font-medium text-neutral-800">
                        {lang}
                      </span>
                      {settingsLanguage === lang && (
                        <Check className="w-[18px] h-[18px] text-[#0ea872]" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {settingsView === "access" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (pswNew !== pswConfirm) {
                      alert("Passwords do not match");
                      return;
                    }
                    showToast("Password updated ✓");
                    setPswCurrent("");
                    setPswNew("");
                    setPswConfirm("");
                    setSettingsView("main");
                  }}
                  className="bg-neutral-50 rounded-[24px] overflow-hidden border border-neutral-100 p-4 space-y-4"
                >
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-500 ml-1">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={pswCurrent}
                      onChange={(e) => setPswCurrent(e.target.value)}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-800 focus:outline-none focus:border-[#0ea872]"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-500 ml-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={pswNew}
                      onChange={(e) => setPswNew(e.target.value)}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-800 focus:outline-none focus:border-[#0ea872]"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-500 ml-1">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={pswConfirm}
                      onChange={(e) => setPswConfirm(e.target.value)}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-800 focus:outline-none focus:border-[#0ea872]"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-neutral-900 text-white rounded-xl py-3 font-medium text-sm hover:bg-black transition-colors mt-2"
                  >
                    Save Password
                  </button>
                </form>
              )}

              {settingsView === "personalization" && (
                <div className="space-y-3">
                  <div className="bg-neutral-50 rounded-[24px] overflow-hidden border border-neutral-100 p-4">
                    <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3 ml-1">
                      Theme
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      {["Light", "Dark", "Amoled"].map((thm) => (
                        <button
                          key={thm}
                          onClick={() => {
                            setSettingsTheme(thm);
                            localStorage.setItem("bububai_theme", thm);
                            showToast(`Theme updated ✓`);
                          }}
                          className={`py-2 rounded-xl text-sm font-medium border ${settingsTheme === thm ? "border-[#0ea872] bg-[#0ea872]/10 text-[#0ea872]" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"}`}
                        >
                          {thm}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-neutral-50 rounded-[24px] overflow-hidden border border-neutral-100 p-4">
                    <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3 ml-1">
                      Accent
                    </h3>
                    <div className="flex gap-3 flex-wrap">
                      {[
                        "#0ea872",
                        "#c94c2e",
                        "#3b82f6",
                        "#8b5cf6",
                        "#ec4899",
                        "#f59e0b",
                      ].map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            setSettingsAccent(color);
                            localStorage.setItem("bububai_accent", color);
                            showToast(`Accent updated ✓`);
                          }}
                          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2"
                          style={{
                            backgroundColor: color,
                            borderColor:
                              settingsAccent === color
                                ? "#111110"
                                : "transparent",
                          }}
                        >
                          {settingsAccent === color && (
                            <Check className="w-5 h-5 text-white" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-neutral-50 rounded-[24px] overflow-hidden border border-neutral-100 p-4">
                    <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3 ml-1">
                      Font Size
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      {["Small", "Medium", "Large"].map((size) => (
                        <button
                          key={size}
                          onClick={() => {
                            setSettingsFontSize(size);
                            localStorage.setItem("bububai_font_size", size);
                            showToast(`Font updated ✓`);
                          }}
                          className={`py-2 rounded-xl text-sm font-medium border ${settingsFontSize === size ? "border-[#0ea872] bg-[#0ea872]/10 text-[#0ea872]" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"}`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {settingsView === "memories" && (
                <div className="space-y-3">
                  <div className="bg-neutral-50 rounded-[24px] overflow-hidden border border-neutral-100 p-4 space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add a new memory..."
                        value={newMemory}
                        onChange={(e) => setNewMemory(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newMemory.trim()) {
                            const updated = [
                              ...settingsMemories,
                              newMemory.trim(),
                            ];
                            setSettingsMemories(updated);
                            localStorage.setItem(
                              "bububai_memories",
                              JSON.stringify(updated),
                            );
                            setNewMemory("");
                            showToast("Memory added ✓");
                          }
                        }}
                        className="flex-1 bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm text-neutral-800 focus:outline-none focus:border-[#0ea872]"
                      />
                      <button
                        onClick={() => {
                          if (newMemory.trim()) {
                            const updated = [
                              ...settingsMemories,
                              newMemory.trim(),
                            ];
                            setSettingsMemories(updated);
                            localStorage.setItem(
                              "bububai_memories",
                              JSON.stringify(updated),
                            );
                            setNewMemory("");
                            showToast("Memory added ✓");
                          }
                        }}
                        className="bg-neutral-900 text-white rounded-xl px-4 py-2 text-sm hover:bg-black font-medium"
                      >
                        Add
                      </button>
                    </div>
                    {settingsMemories.length === 0 ? (
                      <p className="text-sm text-neutral-400 text-center py-6">
                        No memories yet. Add one above.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {settingsMemories.map((mem, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between bg-white border border-neutral-200 rounded-xl p-3 pr-2"
                          >
                            <span className="text-sm text-neutral-700 pr-2 leading-tight">
                              {mem}
                            </span>
                            <button
                              onClick={() => {
                                const updated = settingsMemories.filter(
                                  (_, i) => i !== idx,
                                );
                                setSettingsMemories(updated);
                                localStorage.setItem(
                                  "bububai_memories",
                                  JSON.stringify(updated),
                                );
                              }}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {settingsMemories.length > 0 && (
                    <button
                      onClick={() => {
                        if (window.confirm("Clear all memories?")) {
                          setSettingsMemories([]);
                          localStorage.setItem("bububai_memories", "[]");
                          showToast("Memories cleared ✓");
                        }
                      }}
                      className="w-full py-3 text-red-500 text-sm font-medium hover:bg-red-50 border border-red-100 rounded-xl transition-colors"
                    >
                      Clear All Memories
                    </button>
                  )}
                </div>
              )}

              {settingsView === "apps" && (
                <div className="bg-neutral-50 rounded-[24px] overflow-hidden border border-neutral-100 py-1">
                  {[
                    { id: "core", name: "BUBUBAI Core" },
                    { id: "gamura", name: "Gamura" },
                    { id: "galaxy", name: "Gamura Galaxy" },
                  ].map((app) => (
                    <div
                      key={app.id}
                      className="w-full flex items-center justify-between p-4 border-b border-neutral-50 last:border-0 bg-white"
                    >
                      <span className="text-[15px] font-medium text-neutral-800">
                        {app.name}
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingsApps[app.id]}
                          onChange={(e) => {
                            const updated = {
                              ...settingsApps,
                              [app.id]: e.target.checked,
                            };
                            setSettingsApps(updated);
                            localStorage.setItem(
                              "bububai_apps",
                              JSON.stringify(updated),
                            );
                            showToast("Apps updated ✓");
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0ea872]"></div>
                      </label>
                    </div>
                  ))}
                  <div className="p-4 bg-neutral-50 text-xs text-neutral-500 leading-relaxed">
                    BUBUBAI can access information from connected apps, based on
                    what you're authorized to view.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TESTER MODE OVERLAY ── */}
      <AnimatePresence>
        {testerOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[999] bg-white flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 h-[52px] bg-white border-b border-neutral-100 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTesterOpen(false)}
                  className="p-2 -ml-2 rounded-full hover:bg-neutral-100 active:bg-neutral-200 transition-colors text-neutral-600 cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <span className="font-semibold text-neutral-900 text-[15px]">
                  BUBUBAI TESTER
                </span>
              </div>
            </div>
            <div className="flex-1 bg-[#0d0f17] relative">
              <iframe
                src="/tester.html"
                className="w-full h-full border-none absolute inset-0 text-white"
                title="GAMURA Compiler"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {(activeChatId !== null || activeChatPrompt !== null) && (
        <ChatView
          initialPrompt={activeChatPrompt}
          activeChatId={activeChatId}
          onChangeChatId={(newId) => {
            setActiveChatId(newId);
            setActiveChatPrompt(null);
          }}
          userProfile={userProfile}
          onBack={() => {
            setActiveChatId(null);
            setActiveChatPrompt(null);
            setOnAddAttachment(null);
            loadChatHistory();
          }}
          onOpenBottomSheet={(appendFn) => {
            setOnAddAttachment(() => appendFn);
            setBottomSheetOpen(true);
          }}
        />
      )}
    </div>
  );
}
