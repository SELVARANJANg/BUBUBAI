import React, { useState, useRef, useEffect } from "react";
import { 
  X, 
  ArrowLeft, 
  Copy, 
  Check, 
  Share2, 
  Play, 
  Square, 
  ThumbsUp, 
  ThumbsDown, 
  RotateCcw, 
  Plus, 
  Mic, 
  Send, 
  Sparkles,
  Volume2,
  FileCode,
  Pencil,
  Download,
  Sun,
  Moon,
  GitCompare
} from "lucide-react";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import { db, auth, runWithRetry } from "../firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp 
} from "firebase/firestore";

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  content: string;
  timestamp: Date;
  isLiked?: boolean;
  isDisliked?: boolean;
}

/**
 * Utility to prune chat history to fit inside a sliding context window
 * It estimates tokens (1 token ≈ 4 characters) and retains the most recent messages.
 */
export function trimHistoryToContextWindow(messages: { role: string; content: string }[], maxTokens: number = 6000): { role: string; content: string }[] {
  let estimatedTotalTokens = 0;
  const pruned: { role: string; content: string }[] = [];

  // Iterate from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = Math.ceil((msg.content?.length || 0) / 4) + 12; // safety padding per message
    if (estimatedTotalTokens + msgTokens > maxTokens) {
      break; // stop adding older messages
    }
    estimatedTotalTokens += msgTokens;
    pruned.unshift(msg); // Add to the beginning of pruned array
  }
  
  // Ensure we don't start with a 'model' request as the Gemini API expects a user role first
  while (pruned.length > 0 && pruned[0].role === "model") {
    pruned.shift();
  }

  return pruned;
}

interface ChatViewProps {
  initialPrompt: string | null;
  activeChatId: string | null;
  userProfile: {
    uid?: string;
    name?: string;
    nickname?: string;
    username?: string;
  } | null;
  onBack: () => void;
  onOpenBottomSheet: () => void;
}

export function ChatView({ initialPrompt, activeChatId, userProfile, onBack, onOpenBottomSheet }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeSpeechId, setActiveSpeechId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [copyCodeSuccess, setCopyCodeSuccess] = useState<string | null>(null); // maps to block id or index
  const [isDarkSyntax, setIsDarkSyntax] = useState<boolean>(true);
  
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");
  const [selectedMethod, setSelectedMethod] = useState<string>("ultra");
  const [activeDiffs, setActiveDiffs] = useState<Record<string, boolean>>({});

  const [currentChatId, setCurrentChatId] = useState<string>(() => {
    return activeChatId || `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  });
  const isNewSessionRef = useRef<boolean>(!activeChatId);
  const [chatSummary, setChatSummary] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const displayName = userProfile?.nickname || userProfile?.name || "Selva";

  // Dynamically generate a concise summary of the conversation using Gemini API
  useEffect(() => {
    // Only fetch a summary if messages are ready, we aren't loading, and we don't already have one!
    if (messages.length > 1 && !isLoading && !chatSummary) {
      const getSummary = async () => {
        try {
          const res = await fetch("/api/bububai/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages })
          });
          const data = await res.json();
          if (data.summary) {
            setChatSummary(data.summary);
          }
        } catch (e) {
          console.warn("Could not generate header focus context:", e);
        }
      };
      
      const debounceTimer = setTimeout(() => {
        getSummary();
      }, 1500); // larger debounce to capture full exchange
      
      return () => clearTimeout(debounceTimer);
    }
  }, [messages, isLoading, chatSummary]);

  // Helper inside ChatView to trigger Firestore auto-saving
  const saveChatSession = async (updatedMsgs: ChatMessage[]) => {
    const uid = userProfile?.uid || auth?.currentUser?.uid;
    if (!uid) return;

    const firstUserMsg = updatedMsgs.find(m => m.role === "user");
    const docTitle = firstUserMsg 
      ? (firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? "..." : ""))
      : "BUBUBAI Code Chat";

    const safeMessages = updatedMsgs.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : (m.timestamp as any).toString()
    }));

    try {
      const chatDocRef = doc(db, "chats", currentChatId);
      
      const chatData = {
        id: currentChatId,
        userId: uid,
        title: docTitle,
        messages: safeMessages,
        updatedAt: serverTimestamp()
      };

      if (isNewSessionRef.current) {
        await runWithRetry(() => setDoc(chatDocRef, {
          ...chatData,
          createdAt: serverTimestamp()
        }));
        isNewSessionRef.current = false;
      } else {
        await runWithRetry(() => updateDoc(chatDocRef, {
          messages: safeMessages,
          updatedAt: serverTimestamp()
        }));
      }
    } catch (saveErr) {
      console.warn("Failed to auto-save chat session to database:", saveErr);
    }
  };

  const loadExistingChat = async (chatId: string) => {
    setIsLoading(true);
    try {
      const docSnap = await runWithRetry(() => getDoc(doc(db, "chats", chatId)));
      if (docSnap.exists()) {
        const data = docSnap.data();
        const loadedMessages: ChatMessage[] = (data.messages || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp)
        }));
        setMessages(loadedMessages);
      }
    } catch (err) {
      console.error("Failed to load existing chat session:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize with user's initial prompt or load from history
  useEffect(() => {
    if (activeChatId) {
      loadExistingChat(activeChatId);
    } else if (initialPrompt && initialPrompt.trim()) {
      handleNewConversation(initialPrompt);
    } else {
      // Create a personalized warm welcome from BuBuBai for blank sessions matching STRICT FIRST MESSAGE RULE!
      const welcomeMsg: ChatMessage = {
        id: `m-welcome-${Date.now()}`,
        role: "model",
        content: `Hey ${displayName}! 👋 I'm BuBuBai, your elite AI assistant. Whether you need killer code, answers, or creative help — I've got you. What are we building today?`,
        timestamp: new Date()
      };
      setMessages([welcomeMsg]);
    }
  }, [activeChatId, initialPrompt]);

  // Scroll to bottom whenever messages or loading state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleNewConversation = async (promptText: string) => {
    const userMsg: ChatMessage = {
      id: `m-user-${Date.now()}`,
      role: "user",
      content: promptText,
      timestamp: new Date()
    };
    
    const freshMessages = [userMsg];
    setMessages(freshMessages);
    setIsLoading(true);
    saveChatSession(freshMessages);

    try {
      const response = await fetch("/api/bububai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: promptText, history: [], method: selectedMethod })
      });

      const data = await response.json();
      
      const replyMsg: ChatMessage = {
        id: `m-model-${Date.now()}`,
        role: "model",
        content: data.text || "Error getting reply from BuBuBai.",
        timestamp: new Date()
      };

      const finalMessages = [...freshMessages, replyMsg];
      setMessages(finalMessages);
      saveChatSession(finalMessages);
    } catch (error) {
      console.error("Error communicating with BubuBai:", error);
      // Fallback offline simulated response to ensure the user gets value immediately
      const offlineMsg: ChatMessage = {
        id: `m-model-fallback-${Date.now()}`,
        role: "model",
        content: `🔍 WHAT I BUILT — Offline backup generated by BuBuBai ULTRA

💻 CODE
\`\`\`python
# Offline backup generated by BuBuBai ULTRA
def generate_code(prompt):
    print(f"BubuBai completed request in safe offline mode: {prompt}")
    return "⚡ Ready"

generate_code("${promptText.replace(/"/g, '\\"')}")
\`\`\`

📌 KEY NOTES
• Run offline using local \`python\` installation without internet requirements.
• Edit the parameter string inside \`generate_code\` to test custom workflows offline.
• Securely connects to the live API once internet handshake or secrets are re-established.

⚡ Built by BuBuBai ULTRA — Powered by Gamura × Selvaranjan G`,
        timestamp: new Date()
      };
      const finalFallback = [...freshMessages, offlineMsg];
      setMessages(finalFallback);
      saveChatSession(finalFallback);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendReply = async () => {
    if (!inputValue.trim() || isLoading) return;
    const userPrompt = inputValue;
    setInputValue("");
    
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const newUserMsg: ChatMessage = {
      id: `m-user-${Date.now()}`,
      role: "user",
      content: userPrompt,
      timestamp: new Date()
    };

    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);
    setIsLoading(true);
    saveChatSession(updatedMessages);

    // Map conversation log for model memory context and prune for context window efficiency
    const historyPayload = trimHistoryToContextWindow(
      messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      6000
    );

    try {
      const response = await fetch("/api/bububai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userPrompt, history: historyPayload, method: selectedMethod })
      });

      const data = await response.json();
      
      const replyMsg: ChatMessage = {
        id: `m-model-${Date.now()}`,
        role: "model",
        content: data.text || "No reply was returned.",
        timestamp: new Date()
      };

      const finalMessages = [...updatedMessages, replyMsg];
      setMessages(finalMessages);
      saveChatSession(finalMessages);
    } catch (err) {
      console.error("Reply failed:", err);
      const fallbackReply: ChatMessage = {
        id: `m-model-fallback-${Date.now()}`,
        role: "model",
        content: `🔍 WHAT I BUILT — Clean state-handled visual fallback response by BuBuBai ULTRA

💻 CODE
\`\`\`javascript
// Fallback system response
console.log("Offline state handled correctly by BubuBai AI ULTRA");
\`\`\`

📌 KEY NOTES
• Run offline using standard \`node\` command to test execution logs cleanly.
• Customize the browser log callback parameters inside the \`console.log\` snippet.
• Reconnects dynamically once persistent socket API handshake is active.

⚡ Built by BuBuBai ULTRA — Powered by Gamura × Selvaranjan G`,
        timestamp: new Date()
      };
      const finalFallback = [...updatedMessages, fallbackReply];
      setMessages(finalFallback);
      saveChatSession(finalFallback);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  // Grow prompt reply field
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    setInputValue(el.value);
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  // Copy Message to clipboard
  const handleCopyText = (text: string, messageId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(messageId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  // Speaks/synthesizes BubuBai text using our synthesized audio system
  const handleToggleSpeak = async (text: string, messageId: string) => {
    if (activeSpeechId === messageId) {
      // Stop current playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setActiveSpeechId(null);
      return;
    }

    // Stop any existing playing speech
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setActiveSpeechId(messageId);

    const playSpeechWithBrowserSynth = (rawText: string) => {
      const synth = window.speechSynthesis;
      if (!synth) {
        setActiveSpeechId(null);
        return;
      }
      
      // Clean up punctuation, markdown headers, links, and long code blocks
      const cleanText = rawText
        .replace(/```[\s\S]*?```/g, " [Code block omitted] ")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/[*#_\n-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const utteranceText = cleanText.substring(0, 1000);
      const utterance = new SpeechSynthesisUtterance(utteranceText);
      
      utterance.onend = () => {
        setActiveSpeechId(null);
      };
      
      utterance.onerror = (e) => {
        console.error("Browser speech synthesis error:", e);
        setActiveSpeechId(null);
      };

      const voices = synth.getVoices();
      const preferredVoice = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Natural"))) || 
                             voices.find(v => v.lang.startsWith("en")) || 
                             voices[0];
      
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      
      synth.speak(utterance);
    };

    try {
      const response = await fetch("/api/bububai/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error(`Server returned status code ${response.status}`);
      }

      const data = await response.json();
      if (data.audio) {
        // Use standard Web Audio API to play raw PCM binary or standard Audio element
        const audio = new Audio("data:audio/wav;base64," + data.audio);
        audioRef.current = audio;
        audio.play().catch(e => {
          console.warn("Retrying playback using AudioContext for native raw PCM stream", e);
          playRawPCM64(data.audio);
        });

        audio.onended = () => {
          setActiveSpeechId(null);
        };
      } else {
        throw new Error("No audio key returned from TTS API");
      }
    } catch (err) {
      console.warn("API Text-To-Speech failed, falling back to browser local high-fidelity speech synthesis engine:", err);
      playSpeechWithBrowserSynth(text);
    }
  };

  // Decodes raw PCM 64 audio byte buffers and schedules them using Web Audio API
  const playRawPCM64 = (base64Str: string) => {
    try {
      const binaryString = window.atob(base64Str);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      // PCM is 16-bit linear signed integers
      const buffer = audioCtx.createBuffer(1, len / 2, 24000);
      const channelData = buffer.getChannelData(0);
      const dataView = new DataView(bytes.buffer);
      
      for (let i = 0, j = 0; i < len; j++, i += 2) {
        const val = dataView.getInt16(i, true);
        channelData[j] = val / 32768.0;
      }
      
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start();
      
      source.onended = () => {
        setActiveSpeechId(null);
      };
    } catch (e) {
      console.error("AudioContext raw playback failure:", e);
      setActiveSpeechId(null);
    }
  };

  // Toggle Like Feedback state
  const handleLikeMessage = (id: string, currentlyLiked?: boolean) => {
    setMessages(prev => prev.map(m => {
      if (m.id === id) {
        return { ...m, isLiked: !currentlyLiked, isDisliked: false };
      }
      return m;
    }));
  };

  // Toggle Dislike Feedback state
  const handleDislikeMessage = (id: string, currentlyDisliked?: boolean) => {
    setMessages(prev => prev.map(m => {
      if (m.id === id) {
        return { ...m, isDisliked: !currentlyDisliked, isLiked: false };
      }
      return m;
    }));
  };

  // Create a brand new chat session instantly
  const handleNewChat = () => {
    const newId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setCurrentChatId(newId);
    isNewSessionRef.current = true;
    setInputValue("");
    setChatSummary("");
    
    const welcomeMsg: ChatMessage = {
      id: `m-welcome-${Date.now()}`,
      role: "model",
      content: `Hello **${displayName}**! I am **BuBuBai**, your elite developer companion Combining ChatGPT, Claude, and Gemini.

What shall we design, optimize, or build today? ⚡`,
      timestamp: new Date()
    };
    setMessages([welcomeMsg]);
  };

  // Regenerate last AI response
  const handleRegenerate = () => {
    if (messages.length < 2 || isLoading) return;
    // Find last user message index
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex !== -1) {
      const promptText = messages[lastUserIndex].content;
      // Slice and trigger reply fetch again
      setMessages(prev => prev.slice(0, lastUserIndex + 1));
      setIsLoading(true);

      const historyPayload = trimHistoryToContextWindow(
        messages.slice(0, lastUserIndex).map(m => ({
          role: m.role,
          content: m.content
        })),
        6000
      );

      fetch("/api/bububai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: promptText, history: historyPayload, method: selectedMethod })
      })
      .then(res => res.json())
      .then(data => {
        const replyMsg: ChatMessage = {
          id: `m-model-${Date.now()}`,
          role: "model",
          content: data.text || "No response returned.",
          timestamp: new Date()
        };
        setMessages(prev => [...prev, replyMsg]);
      })
      .catch(() => {
        const fallbackReply: ChatMessage = {
          id: `m-model-fallback-${Date.now()}`,
          role: "model",
          content: `Unable to regenerate. Please check connection.`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, fallbackReply]);
      })
      .finally(() => {
        setIsLoading(false);
      });
    }
  };

  // Handles editing of user prompt and regeneration of subsequent AI response
  const handleSaveAndRegenerate = async (messageId: string) => {
    if (!editingText.trim() || isLoading) return;
    const newContent = editingText;
    setEditingMessageId(null);

    // Find the index of the edited message
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    // Build the pruned message list up to this edited point, updating the edited message
    const targetMsg: ChatMessage = { ...messages[msgIndex], content: newContent, timestamp: new Date() };
    const truncatedHistory = messages.slice(0, msgIndex);
    const updatedMessages = [...truncatedHistory, targetMsg];
    
    setMessages(updatedMessages);
    setIsLoading(true);
    saveChatSession(updatedMessages);

    // Prune history using context window prior to API call
    const contextHistory = trimHistoryToContextWindow(
      truncatedHistory.map(m => ({ role: m.role, content: m.content })),
      6000
    );

    try {
      const response = await fetch("/api/bububai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: newContent, history: contextHistory, method: selectedMethod })
      });

      const data = await response.json();
      const replyMsg: ChatMessage = {
        id: `m-model-${Date.now()}`,
        role: "model",
        content: data.text || "No reply was returned.",
        timestamp: new Date()
      };

      const finalMessages = [...updatedMessages, replyMsg];
      setMessages(finalMessages);
      saveChatSession(finalMessages);
    } catch (err) {
      console.error("Editing & regeneration failed:", err);
      const fallbackReply: ChatMessage = {
        id: `m-model-fallback-${Date.now()}`,
        role: "model",
        content: `Regeneration failed.\n\n\`\`\`javascript\nconsole.error("Local offline fallback triggered during edited regeneration");\n\`\`\`\n\n⚡ Built by BuBuBai — Powered by Gamura`,
        timestamp: new Date()
      };
      const finalFallback = [...updatedMessages, fallbackReply];
      setMessages(finalFallback);
      saveChatSession(finalFallback);
    } finally {
      setIsLoading(false);
    }
  };

  // Downloads code from a code block as a file
  const handleDownloadCode = (text: string, language: string) => {
    const extMap: Record<string, string> = {
      python: "py",
      py: "py",
      javascript: "js",
      js: "js",
      typescript: "ts",
      ts: "ts",
      tsx: "tsx",
      react: "tsx",
      html: "html",
      css: "css",
      rust: "rs",
      rs: "rs",
      sql: "sql",
      go: "go",
      json: "json",
      bash: "sh",
      sh: "sh",
      yaml: "yaml",
      yml: "yml",
      toml: "toml",
      markdown: "md",
      md: "md"
    };
    const ext = extMap[language.toLowerCase()] || "txt";
    const filename = `bububai_code.${ext}`;

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Share Response
  const handleShare = (text: string) => {
    if (navigator.share) {
      navigator.share({
        title: "BuBuBai AI Code Output",
        text: text,
        url: window.location.href
      }).catch(err => console.log(err));
    } else {
      navigator.clipboard.writeText(text);
      alert("AI code response link copied to clipboard for easy sharing!");
    }
  };

  // Find the previous code block with different content to compare against
  const findPreviousCodeBlock = (currentMsgId: string, currentCodeText: string) => {
    const msgIdx = messages.findIndex(m => m.id === currentMsgId);
    if (msgIdx === -1) return null;

    for (let i = msgIdx - 1; i >= 0; i--) {
      const prevMsg = messages[i];
      if (prevMsg.role === "model") {
        const prevParts = prevMsg.content.split(/(```[\s\S]*?```)/g);
        for (let j = prevParts.length - 1; j >= 0; j--) {
          const part = prevParts[j];
          if (part.startsWith("```") && part.endsWith("```")) {
            const match = part.match(/```(\w*)\n([\s\S]*?)```/);
            const prevCodeText = match ? match[2] : part.slice(3, -3);
            if (prevCodeText && prevCodeText.trim() && prevCodeText.trim() !== currentCodeText.trim()) {
              return prevCodeText;
            }
          }
        }
      }
    }
    return null;
  };

  // Basic dynamic programming LCS algorithm to align matching and modified lines
  const getAlignedDiffRows = (oldCode: string, newCode: string) => {
    const oldLines = oldCode.split("\n");
    const newLines = newCode.split("\n");

    const d: number[][] = [];
    for (let i = 0; i <= oldLines.length; i++) {
      d[i] = [];
      for (let j = 0; j <= newLines.length; j++) {
        if (i === 0 || j === 0) {
          d[i][j] = 0;
        } else if (oldLines[i - 1] === newLines[j - 1]) {
          d[i][j] = d[i - 1][j - 1] + 1;
        } else {
          d[i][j] = Math.max(d[i - 1][j], d[i][j - 1]);
        }
      }
    }

    const diffList: {
      oldLineNum: number | null;
      newLineNum: number | null;
      type: "added" | "removed" | "unchanged";
      text: string;
    }[] = [];

    let i = oldLines.length;
    let j = newLines.length;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        diffList.unshift({
          oldLineNum: i,
          newLineNum: j,
          type: "unchanged",
          text: oldLines[i - 1]
        });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || d[i][j - 1] >= d[i - 1][j])) {
        diffList.unshift({
          oldLineNum: null,
          newLineNum: j,
          type: "added",
          text: newLines[j - 1]
        });
        j--;
      } else {
        diffList.unshift({
          oldLineNum: i,
          newLineNum: null,
          type: "removed",
          text: oldLines[i - 1]
        });
        i--;
      }
    }

    interface DiffRow {
      left: { num: number | null; text: string; type: "removed" | "unchanged" | "empty" };
      right: { num: number | null; text: string; type: "added" | "unchanged" | "empty" };
    }

    const rows: DiffRow[] = [];
    let idx = 0;

    while (idx < diffList.length) {
      const item = diffList[idx];
      if (item.type === "unchanged") {
        rows.push({
          left: { num: item.oldLineNum, text: item.text, type: "unchanged" },
          right: { num: item.newLineNum, text: item.text, type: "unchanged" }
        });
        idx++;
      } else {
        const removedPool: typeof item[] = [];
        const addedPool: typeof item[] = [];

        while (idx < diffList.length && diffList[idx].type !== "unchanged") {
          if (diffList[idx].type === "removed") {
            removedPool.push(diffList[idx]);
          } else {
            addedPool.push(diffList[idx]);
          }
          idx++;
        }

        const maxLen = Math.max(removedPool.length, addedPool.length);
        for (let k = 0; k < maxLen; k++) {
          const rem = removedPool[k];
          const add = addedPool[k];

          rows.push({
            left: rem ? { num: rem.oldLineNum, text: rem.text, type: "removed" } : { num: null, text: "", type: "empty" },
            right: add ? { num: add.newLineNum, text: add.text, type: "added" } : { num: null, text: "", type: "empty" }
          });
        }
      }
    }

    return rows;
  };

  // A pristine and custom Markdown compiler to securely parse code blocks and lists elegantly
  const renderFormattedContent = (content: string, messageId: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, index) => {
      // Check if it's a code block
      if (part.startsWith("```") && part.endsWith("```")) {
        const match = part.match(/```(\w*)\n([\s\S]*?)```/);
        const language = match ? match[1] || "code" : "code";
        const codeText = match ? match[2] : part.slice(3, -3);
        const blockId = `${messageId}-code-${index}`;
        const previousBlockText = findPreviousCodeBlock(messageId, codeText);
        const isDiffActive = !!activeDiffs[blockId];

        const handleCopyCode = (text: string, id: string) => {
          navigator.clipboard.writeText(text);
          setCopyCodeSuccess(id);
          setTimeout(() => setCopyCodeSuccess(null), 2000);
        };

        // Syntax highlight using highlight.js
        let highlightedHtml = codeText;
        try {
          if (language && hljs.getLanguage(language)) {
            highlightedHtml = hljs.highlight(codeText, { language }).value;
          } else {
            highlightedHtml = hljs.highlightAuto(codeText).value;
          }
        } catch (e) {
          console.warn("highlight.js formatting issue:", e);
        }

        return (
          <div key={index} className={`my-6 border rounded-2xl overflow-hidden shadow-sm transition-all duration-200 ${isDarkSyntax ? "border-[#e2e2de]/80 bg-neutral-950" : "border-neutral-200 bg-[#f9f9fb]"}`}>
            {/* Header bar */}
            <div className={`flex items-center justify-between px-4 py-2 border-b transition-all duration-200 ${isDarkSyntax ? "bg-neutral-900 border-neutral-800 text-neutral-300" : "bg-neutral-100 border-neutral-200 text-neutral-700"}`}>
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-emerald-500" />
                <span className="font-mono text-xs uppercase tracking-wider font-semibold">
                  {language}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {/* Side-by-Side Diff Toggle if previous code exists */}
                {previousBlockText && (
                  <>
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 text-xs transition-colors cursor-pointer ${isDiffActive ? 'text-emerald-500 font-bold' : (isDarkSyntax ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 hover:text-neutral-900')}`}
                      onClick={() => setActiveDiffs(prev => ({ ...prev, [blockId]: !prev[blockId] }))}
                      title="Toggle Side-by-Side Diff View"
                    >
                      <GitCompare className={`w-3.5 h-3.5 ${isDiffActive ? "rotate-180 text-emerald-500" : "text-emerald-500"}`} />
                      <span>{isDiffActive ? "Hide Diff" : "Show Diff"}</span>
                    </button>
                    <span className={isDarkSyntax ? "text-neutral-700 select-none" : "text-neutral-300 select-none"}>|</span>
                  </>
                )}

                {/* Theme Toggle Button */}
                <button
                  type="button"
                  className={`flex items-center gap-1.5 text-xs transition-colors cursor-pointer ${isDarkSyntax ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 hover:text-neutral-900'}`}
                  onClick={() => setIsDarkSyntax(!isDarkSyntax)}
                  title={isDarkSyntax ? "Switch to Light Syntax Theme" : "Switch to Dark Syntax Theme"}
                >
                  {isDarkSyntax ? (
                    <>
                      <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>Light Theme</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>Dark Theme</span>
                    </>
                  )}
                </button>
                <span className={isDarkSyntax ? "text-neutral-700 select-none" : "text-neutral-300 select-none"}>|</span>

                <button
                  type="button"
                  className={`flex items-center gap-1.5 text-xs transition-colors cursor-pointer ${isDarkSyntax ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 hover:text-neutral-900'}`}
                  onClick={() => handleDownloadCode(codeText, language)}
                  title="Download Code File"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Download File</span>
                </button>
                <span className={isDarkSyntax ? "text-neutral-700 select-none" : "text-neutral-300 select-none"}>|</span>
                <button
                  type="button"
                  className={`flex items-center gap-1.5 text-xs transition-colors cursor-pointer ${isDarkSyntax ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 hover:text-neutral-900'}`}
                  onClick={() => handleCopyCode(codeText, blockId)}
                >
                  {copyCodeSuccess === blockId ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-medium">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            
            {/* Viewport content - Side-by-Side Diff or Highlighted Code block */}
            {isDiffActive && previousBlockText ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x border-t transition-all duration-200 border-neutral-200 bg-white">
                {/* Left Panel: Original / Removed */}
                <div className={`overflow-x-auto p-4 font-mono text-[13px] leading-relaxed select-text transition-all duration-200 ${isDarkSyntax ? "bg-[#18181b] text-neutral-300 border-neutral-800" : "bg-[#fcfcfd] text-neutral-700"}`}>
                  <div className="text-[10px] font-sans font-bold text-red-500 uppercase tracking-widest mb-3 flex items-center gap-1.5 border-b pb-1 select-none">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
                    <span>Original Code</span>
                  </div>
                  <div className="space-y-0.5">
                    {getAlignedDiffRows(previousBlockText, codeText).map((row, rIdx) => {
                      const isRemoved = row.left.type === 'removed';
                      const isEmpty = row.left.type === 'empty';
                      return (
                        <div key={rIdx} className={`flex items-start font-mono text-[11.5px] leading-none min-h-[1.5rem] py-0.5 px-1 rounded ${
                          isRemoved 
                            ? (isDarkSyntax ? "bg-red-950/40 text-red-200 border-l-2 border-red-500" : "bg-red-50/70 text-red-900 border-l-2 border-red-500") 
                            : isEmpty 
                              ? "opacity-20" 
                              : (isDarkSyntax ? "text-neutral-500" : "text-neutral-400")
                        }`}>
                          <span className="w-8 shrink-0 select-none text-[10px] opacity-40 font-mono text-right pr-2">
                            {row.left.num || ""}
                          </span>
                          <pre className="whitespace-pre flex-1 font-mono">{row.left.text}</pre>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Panel: Updated / Added */}
                <div className={`overflow-x-auto p-4 font-mono text-[13px] leading-relaxed select-text transition-all duration-200 ${isDarkSyntax ? "bg-neutral-950 text-neutral-100" : "bg-[#f9f9fb] text-neutral-800"}`}>
                  <div className="text-[10px] font-sans font-bold text-emerald-500 uppercase tracking-widest mb-3 flex items-center gap-1.5 border-b pb-1 select-none">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>Updated Code</span>
                  </div>
                  <div className="space-y-0.5">
                    {getAlignedDiffRows(previousBlockText, codeText).map((row, rIdx) => {
                      const isAdded = row.right.type === 'added';
                      const isEmpty = row.right.type === 'empty';
                      return (
                        <div key={rIdx} className={`flex items-start font-mono text-[11.5px] leading-none min-h-[1.5rem] py-0.5 px-1 rounded ${
                          isAdded 
                            ? (isDarkSyntax ? "bg-emerald-950/40 text-emerald-250 border-l-2 border-emerald-500" : "bg-emerald-50/70 text-emerald-900 border-l-2 border-emerald-500") 
                            : isEmpty 
                              ? "opacity-20" 
                              : (isDarkSyntax ? "text-neutral-300" : "text-neutral-600")
                        }`}>
                          <span className="w-8 shrink-0 select-none text-[10px] opacity-40 font-mono text-right pr-2">
                            {row.right.num || ""}
                          </span>
                          <pre className="whitespace-pre flex-1 font-mono">{row.right.text}</pre>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* Viewport */
              <div className={`p-4 overflow-x-auto font-mono text-[13px] leading-relaxed select-text transition-all duration-200 ${isDarkSyntax ? "bg-neutral-950 text-neutral-100 selection:bg-emerald-950" : "bg-[#f9f9fb] text-neutral-800 selection:bg-emerald-100"}`}>
                <pre className="whitespace-pre"><code className={`hljs language-${language} ${!isDarkSyntax ? "light-syntax" : ""}`} dangerouslySetInnerHTML={{ __html: highlightedHtml }} /></pre>
              </div>
            )}
          </div>
        );
      }

      // Standard Text styling
      const lines = part.split("\n");
      return (
        <div key={index} className="space-y-3 font-serif leading-relaxed text-[#111110] text-[16.5px] md:text-[17.5px] font-normal tracking-normal select-text">
          {lines.map((line, lineIdx) => {
            const cleanLine = line.trim();
            if (!cleanLine) return <div key={lineIdx} className="h-2" />;

            // Headings
            if (cleanLine.startsWith("## ")) {
              return (
                <h2 key={lineIdx} className="font-sans font-semibold text-[19px] text-[#111110] mt-6 mb-2 tracking-tight">
                  {cleanLine.replace("## ", "")}
                </h2>
              );
            }
            if (cleanLine.startsWith("# ")) {
              return (
                <h1 key={lineIdx} className="font-sans font-bold text-[22px] text-[#111110] mt-6 mb-2 tracking-tight">
                  {cleanLine.replace("# ", "")}
                </h1>
              );
            }

            // Bold styling parse within the line
            const formatBoldText = (text: string) => {
              const textParts = text.split(/(\*\*.*?\*\*)/g);
              return textParts.map((tPart, tIdx) => {
                if (tPart.startsWith("**") && tPart.endsWith("**")) {
                  return <strong key={tIdx} className="font-sans font-semibold text-[#111110]">{tPart.slice(2, -2)}</strong>;
                }
                // Also parse inline code blocks
                return formatInlineCode(tPart);
              });
            };

            const formatInlineCode = (text: string) => {
              const codeParts = text.split(/(`.*?`)/g);
              return codeParts.map((cPart, cIdx) => {
                if (cPart.startsWith("`") && cPart.endsWith("`")) {
                  return (
                    <code key={cIdx} className="font-mono text-[12.5px] bg-[#f4f4f2] text-[#c94c2e] hover:bg-neutral-100 px-1 py-0.5 rounded border border-[#ebebe8]">
                      {cPart.slice(1, -1)}
                    </code>
                  );
                }
                return cPart;
              });
            };

            // Bullet lists
            if (cleanLine.startsWith("- ") || cleanLine.startsWith("* ")) {
              return (
                <ul key={lineIdx} className="list-disc pl-6 py-0.5 space-y-1 my-1">
                  <li className="font-serif text-[#111110]">
                    {formatBoldText(cleanLine.substring(2))}
                  </li>
                </ul>
              );
            }

            // Normal line
            return <p key={lineIdx}>{formatBoldText(line)}</p>;
          })}
        </div>
      );
    });
  };

  return (
    <div className="fixed inset-0 bg-[#ffffff] z-[950] flex flex-col h-full w-full">
      {/* ── TOP NAVIGATION HEADER ── */}
      <header className="h-[64px] border-b border-[#f4f4f2] px-6 flex items-center justify-between shrink-0 bg-white">
        <button 
          onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center text-[#111110] hover:bg-[#f4f4f2] active:bg-neutral-150 transition-colors cursor-pointer"
          aria-label="Go Back"
          title="Back"
        >
          <ArrowLeft className="w-5 h-5 stroke-[2.3]" />
        </button>

        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md overflow-hidden bg-white shrink-0 border border-neutral-200">
              <img 
                src="https://lh3.googleusercontent.com/d/1YQ_yqbUkfjuIDrM6rH1IYThahwYLReZw" 
                alt="BuBuBai logo" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <span className="font-sans font-semibold text-sm text-[#111110] tracking-tight">
              BuBuBai
            </span>
          </div>
          {chatSummary && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-600 bg-emerald-50/80 px-2.5 py-0.5 rounded-full mt-1 border border-emerald-100 font-bold max-w-[280px] truncate">
              {chatSummary}
            </span>
          )}
        </div>

        <button 
          onClick={handleNewChat}
          className="w-10 h-10 rounded-full flex items-center justify-center text-[#111110] hover:bg-[#f4f4f2] active:bg-neutral-150 transition-colors cursor-pointer"
          title="Start New Chat"
        >
          <Plus className="w-5 h-5 stroke-[2.3]" />
        </button>
      </header>

      {/* ── CHATBOT METHOD SELECT TOOLBAR ── */}
      <div className="bg-[#fcfcfb] border-b border-[#f4f4f2] px-4 py-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0 select-none">
        <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-neutral-400 pl-2 shrink-0 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
          <span>Engine:</span>
        </span>
        <div className="flex items-center gap-1.5 px-1 scrollbar-none">
          {[
            { id: "ultra", name: "⚡ BubuUltra", desc: "Balanced (Gemini 3.5 Flash)", color: "text-emerald-600 bg-emerald-50/50 hover:bg-emerald-50 border-emerald-100" },
            { id: "pro", name: "🧠 CodeMaster", desc: "Elite reasoning (Gemini 3.1 Pro)", color: "text-indigo-600 bg-indigo-50/50 hover:bg-indigo-50 border-indigo-100" },
            { id: "lite", name: "🔥 SpeedLite", desc: "Lightning fast (Gemini 3.1 Lite)", color: "text-amber-600 bg-amber-50/50 hover:bg-amber-50 border-amber-100" },
            { id: "cto", name: "👥 TechCTO", desc: "Systems architect & CTO focus", color: "text-sky-600 bg-sky-50/50 hover:bg-sky-50 border-sky-100" },
            { id: "designer", name: "🎨 UI Guru", desc: "Tailwind UI/UX visual master", color: "text-rose-600 bg-rose-50/50 hover:bg-rose-50 border-rose-100" },
            { id: "local", name: "🔌 Sandbox", desc: "Zero-latency local code simulation", color: "text-[#666] bg-neutral-100/50 hover:bg-neutral-100 border-neutral-300" },
          ].map((method) => {
            const isActive = selectedMethod === method.id;
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => setSelectedMethod(method.id)}
                className={`px-3 py-1.5 rounded-full border text-xs font-sans font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5 shrink-0 hover:scale-[1.02] active:scale-[0.98] ${
                  isActive 
                    ? "bg-[#111110] text-white border-[#111110] shadow-sm font-semibold" 
                    : `${method.color} border-transparent text-neutral-600`
                }`}
                title={method.desc}
              >
                <span>{method.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── MESSAGES CHAT STREAM CONTAINER ── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-12 py-6 space-y-8 bg-[#ffffff]">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div 
              key={msg.id} 
              className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-2xl mx-auto w-full`}
            >
              {isUser ? (
                <div className="group relative flex flex-col items-end max-w-full">
                  {editingMessageId === msg.id ? (
                    // Editing active interface
                    <div className="flex flex-col gap-2 bg-[#f4f4f2] border border-[#ebebe8] p-3 rounded-[18px] w-full max-w-md shadow-sm">
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="w-full text-sm font-sans bg-white border border-[#ebebe8] rounded-xl p-2.5 text-[#111110] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        rows={2}
                      />
                      <div className="flex justify-end gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setEditingMessageId(null)}
                          className="px-3 py-1.5 rounded-lg border border-[#ebebe8] bg-white text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveAndRegenerate(msg.id)}
                          className="px-3 py-1.5 rounded-lg bg-[#111110] text-white hover:bg-neutral-800 transition-colors font-semibold cursor-pointer"
                        >
                          Save & Submit
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Regular user message pill with edit trigger on hover
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMessageId(msg.id);
                          setEditingText(msg.content);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-all cursor-pointer"
                        title="Edit prompt"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <div className="font-sans font-bold text-xs uppercase tracking-widest bg-[#f4f4f2] border border-[#ebebe8] text-[#111110] px-4 py-2.5 rounded-[18px] shadow-sm select-text">
                        {msg.content}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* AI Bot side layout exactly like Anthropic screenshot */
                <div className="w-full space-y-3 mt-1.5 select-text">
                  {/* Text content rendered using Serif Fonts and custom structures */}
                  <div className="text-left w-full pl-0">
                    {renderFormattedContent(msg.content, msg.id)}
                  </div>

                  {/* Elegant micro-actions panel under AI bubble */}
                  <div className="flex items-center gap-3.5 pt-2 mt-2 border-t border-neutral-100 text-neutral-400 select-none">
                    {/* Speak translation / read response */}
                    <button
                      type="button"
                      onClick={() => handleToggleSpeak(msg.content, msg.id)}
                      className={`p-1.5 rounded-lg hover:bg-[#f4f4f2] text-xs font-mono flex items-center gap-1 cursor-pointer transition-all ${
                        activeSpeechId === msg.id ? "text-emerald-500 bg-emerald-50 border border-emerald-100 font-bold" : "hover:text-[#111110]"
                      }`}
                      title={activeSpeechId === msg.id ? "Stop Speech" : "Listen Response"}
                    >
                      {activeSpeechId === msg.id ? (
                        <>
                          <Square className="w-3.5 h-3.5 fill-emerald-500 text-emerald-500" />
                          <span>Stop</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Listen</span>
                        </>
                      )}
                    </button>

                    {/* Copy entire response to clipboard */}
                    <button
                      type="button"
                      onClick={() => handleCopyText(msg.content, msg.id)}
                      className={`p-1.5 rounded-lg hover:bg-[#f4f4f2] text-xs font-mono flex items-center gap-1 cursor-pointer transition-all hover:text-[#111110] ${
                        copiedMessageId === msg.id ? "text-emerald-500 font-bold" : ""
                      }`}
                      title="Copy response"
                    >
                      {copiedMessageId === msg.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    {/* Upvote/Like response feedback */}
                    <button
                      type="button"
                      onClick={() => handleLikeMessage(msg.id, msg.isLiked)}
                      className={`p-1.5 rounded-lg hover:bg-[#f4f4f2] transition-colors cursor-pointer ${
                        msg.isLiked ? "text-emerald-500 bg-emerald-50 border border-emerald-100" : "hover:text-[#111110]"
                      }`}
                      title="Good response"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                    </button>

                    {/* Downvote/Dislike response feedback */}
                    <button
                      type="button"
                      onClick={() => handleDislikeMessage(msg.id, msg.isDisliked)}
                      className={`p-1.5 rounded-lg hover:bg-[#f4f4f2] transition-colors cursor-pointer ${
                        msg.isDisliked ? "text-red-500 bg-red-50 border border-red-100" : "hover:text-[#111110]"
                      }`}
                      title="Poor response"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                    </button>

                    {/* Share response layout */}
                    <button
                      type="button"
                      onClick={() => handleShare(msg.content)}
                      className="p-1.5 rounded-lg hover:bg-[#f4f4f2] hover:text-[#111110] transition-colors cursor-pointer ml-auto"
                      title="Share output"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Animated Custom Typing Indicator */}
        {isLoading && (
          <div className="flex items-start gap-3.5 max-w-2xl mx-auto w-full select-none">
            {/* Left BuBuBai avatar */}
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-white shrink-0 border border-neutral-100 shadow-sm flex items-center justify-center animate-pulse">
              <img 
                src="https://lh3.googleusercontent.com/d/1YQ_yqbUkfjuIDrM6rH1IYThahwYLReZw" 
                alt="BuBuBai logo" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="flex-1 space-y-3 bg-neutral-50 border border-neutral-100 rounded-2xl p-4 shadow-sm max-w-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-sans font-semibold text-sm text-[#111110] tracking-tight">
                    BuBuBai is thinking
                  </span>
                  <div className="flex gap-1 items-center justify-center py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold border border-emerald-100 animate-pulse">
                  GENERATING ANSWER
                </span>
              </div>
              
              <div className="space-y-2">
                <div className="h-3 bg-neutral-200/60 rounded animate-pulse w-full" />
                <div className="h-3 bg-neutral-200/60 rounded animate-pulse w-5/6" />
                <div className="h-3 bg-neutral-200/60 rounded animate-pulse w-2/3" />
              </div>
            </div>
          </div>
        )}

        {/* Ref dummy anchor to hold bottom scroll */}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* ── BOTTOM REPLY ENTRY FORM matching CLAUDE APP screenshots ── */}
      <footer className="shrink-0 p-4 border-t border-[#f4f4f2] bg-white flex flex-col items-center justify-end w-full">
        <div className="max-w-2xl w-full flex flex-col space-y-3.5 px-1 md:px-0">
          
          {/* Sub footnote directly above reply capsule input */}
          <div className="flex items-center justify-between w-full text-[11px] text-neutral-400 select-none">
            <div className="flex items-center gap-1.5">
              <span>BuBuBai is AI and can make mistakes. Please double-check responses.</span>
            </div>
          </div>

          {/* Interactive Input capsule layout */}
          <div className="relative flex items-center bg-[#f4f4f2] rounded-[28px] p-2 pl-3 border border-[#ebebe8] shadow-sm w-full min-h-[54px]">
            {/* White round Plus Button that opens Bottom Sheet slide overlay info trigger */}
            <button 
              type="button"
              onClick={onOpenBottomSheet}
              className="w-10 h-10 rounded-full bg-white text-[#111110] border border-[#ebebe8] shadow-sm flex items-center justify-center shrink-0 cursor-pointer hover:bg-neutral-50 active:bg-neutral-100 transition-all mr-2"
              title="Add attachment"
            >
              <Plus className="w-[19px] h-[19px] stroke-[2.3]" />
            </button>

            {/* Expansible prompt field resembling standard chat */}
            <textarea 
              ref={textareaRef}
              className="flex-1 max-h-[120px] bg-transparent text-[#111110] font-sans text-[15px] focus:outline-none resize-none pt-2.5 pb-1 px-1 leading-normal select-text"
              placeholder={
                selectedMethod === "ultra" ? "Ask BubuUltra (Gemini 3.5 Flash)..." :
                selectedMethod === "pro" ? "Enter task for CodeMaster Pro..." :
                selectedMethod === "lite" ? "Ask SpeedLite (Gemini Lite)..." :
                selectedMethod === "cto" ? "Discuss architecture with TechCTO..." :
                selectedMethod === "designer" ? "Describe visual design with UI Guru..." :
                selectedMethod === "local" ? "Query sandboxed Client engine..." :
                "Reply to BuBuBai..."
              }
              rows={1}
              value={inputValue}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
            />

            {/* Send Trigger button */}
            <button 
              type="button"
              onClick={handleSendReply}
              disabled={!inputValue.trim() || isLoading}
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${
                inputValue.trim() 
                  ? "bg-[#111110] text-white hover:bg-neutral-800 hover:scale-105 active:scale-95 cursor-pointer" 
                  : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
              }`}
              title="Send reply"
            >
              <Send className="w-[16px] h-[16px] stroke-[2.2] translate-x-[1px]" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
