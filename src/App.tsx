/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ArrowLeft, 
  RotateCcw, 
  User, 
  Lock, 
  Smartphone, 
  UserCheck, 
  Sparkles, 
  CheckCircle, 
  ArrowRight, 
  Edit3, 
  LogOut, 
  Award,
  Calendar
} from "lucide-react";
import { Dashboard } from "./components/Dashboard";
import { auth, db, handleFirestoreError, OperationType, runWithRetry } from "./firebase";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  User as FirebaseUser
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  getDocs, 
  query, 
  collection, 
  where, 
  limit, 
  serverTimestamp 
} from "firebase/firestore";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [slideOpen, setSlideOpen] = useState(false);

  // Core Authentication States
  const [isSignUp, setIsSignUp] = useState(false);
  const [currentAuthUser, setCurrentAuthUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Form Field States
  const [formData, setFormData] = useState({
    name: "",
    nickname: "",
    username: "",
    phoneNumber: "",
    password: "",
    loginIdentifier: "", // Holds username or phone number
    loginPassword: ""
  });

  // Action status indicators
  const [errorMessage, setErrorMessage] = useState("");
  const [domainError, setDomainError] = useState(false);
  const [authSuccessMessage, setAuthSuccessMessage] = useState("");
  const [loadingAction, setLoadingAction] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Profile Modification Settings
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editNickname, setEditNickname] = useState("");

  // Google Drive Image Source IDs and reliable instant paths
  const loadingImageId = "1jI-uAhpcBgPa7Bz2dN08ey9ocj-DESIv";
  const mainImageId = "1YQ_yqbUkfjuIDrM6rH1IYThahwYLReZw";

  // Using Google's highly reliable thumbnail cache path which loads instantly and avoids CORS or access blocks
  const getImageUrl = (id: string) => `https://drive.google.com/thumbnail?id=${id}&sz=800`;

  // Skip loading instantly
  const handleSkipLoading = () => {
    setLoadingProgress(100);
    setLoading(false);
  };

  // Pre-load images & execute timed transition over exactly 1.5 seconds for instant feel
  useEffect(() => {
    const img1 = new Image();
    img1.src = getImageUrl(loadingImageId);
    
    const img2 = new Image();
    img2.src = getImageUrl(mainImageId);

    const duration = 800; // Snappy 800ms for instant loading feel
    const intervalTime = 20; // Silky smooth update speed
    const totalSteps = duration / intervalTime;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      const currentPercent = Math.min((currentStep / totalSteps) * 100, 100);
      setLoadingProgress(Math.floor(currentPercent));

      if (currentStep >= totalSteps) {
        clearInterval(timer);
        setLoading(false);
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, []);

  // Monitor Auth Changes and sync with state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentAuthUser(user);
      if (user) {
        setProfileLoading(true);

        // Pre-populate immediately with cached profile to avoid offline/slow-network blank screens
        try {
          const cachedProfile = localStorage.getItem(`bububai_profile_${user.uid}`);
          if (cachedProfile) {
            setUserProfile(JSON.parse(cachedProfile));
          }
        } catch (cacheErr) {
          console.warn("Failed to retrieve profile from localStorage caching:", cacheErr);
        }

        try {
          const userDoc = await runWithRetry(() => getDoc(doc(db, "users", user.uid)));
          if (userDoc.exists()) {
            setUserProfile(userDoc.data());
          } else {
            // Document doesn't exist, build fallback from email/display name
            const fallbackName = user.displayName || user.email?.split("@")[0] || "User";
            setUserProfile({
              uid: user.uid,
              name: fallbackName,
              nickname: fallbackName.split(" ")[0] || fallbackName,
              username: user.email?.split("@")[0] || "user",
              phoneNumber: user.phoneNumber || "Google Connected"
            });
          }
        } catch (err: any) {
          console.warn("Offline or unreachable network: loading cache/fallback profile instead of server profile.", err?.message || err);
          
          let hasOfflineCache = false;
          try {
            const cachedProfile = localStorage.getItem(`bububai_profile_${user.uid}`);
            if (cachedProfile) {
              setUserProfile(JSON.parse(cachedProfile));
              hasOfflineCache = true;
            }
          } catch (cacheErr) {
            // silent ignore info
          }

          if (!hasOfflineCache) {
            // Construct dynamic fallback if no cache exists so user is never stuck
            const fallbackName = user.displayName || user.email?.split("@")[0] || "User";
            setUserProfile({
              uid: user.uid,
              name: fallbackName,
              nickname: fallbackName.split(" ")[0] || fallbackName,
              username: user.email?.split("@")[0] || "user",
              phoneNumber: user.phoneNumber || "Offline Profile"
            });
          }
        } finally {
          setProfileLoading(false);
        }
      } else {
        setUserProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Pre-fill fields for profile updates and save cache locally
  useEffect(() => {
    if (userProfile) {
      setEditName(userProfile.name || "");
      setEditNickname(userProfile.nickname || "");
      if (userProfile.uid) {
        try {
          localStorage.setItem(`bububai_profile_${userProfile.uid}`, JSON.stringify(userProfile));
        } catch (cacheErr) {
          console.warn("Could not save user profile to localStorage:", cacheErr);
        }
      }
    }
  }, [userProfile]);

  // Handle Sign-Up with strict validations
  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage("");
    setAuthSuccessMessage("");
    setLoadingAction(true);

    const { name, nickname, username, phoneNumber, password } = formData;

    if (!name.trim() || !nickname.trim() || !username.trim() || !phoneNumber.trim() || !password) {
      setErrorMessage("All fields are strictly required.");
      setLoadingAction(false);
      return;
    }

    // Strip leading @ symbol if user entered one
    let formattedUsername = username.trim().toLowerCase();
    if (formattedUsername.startsWith("@")) {
      formattedUsername = formattedUsername.slice(1);
    }

    // Clean phone number: remove brackets, hyphens, spaces, and periods
    const cleanPhone = phoneNumber.trim().replace(/[\s\-\(\)\.]/g, "");

    if (formattedUsername.length < 3 || formattedUsername.length > 30) {
      setErrorMessage("Username must be between 3 and 30 characters.");
      setLoadingAction(false);
      return;
    }

    if (!/^[a-zA-Z0-9_\-]+$/.test(formattedUsername)) {
      setErrorMessage("Username can only contain alphanumeric characters, underscores, and hyphens.");
      setLoadingAction(false);
      return;
    }

    try {
      // Check database schema constraints for uniqueness upfront to give clear errors
      const usernameQuery = query(collection(db, "users"), where("username", "==", formattedUsername), limit(1));
      const usernameSnap = await runWithRetry(() => getDocs(usernameQuery));
      if (!usernameSnap.empty) {
        setErrorMessage("Username already taken. Please choose another username.");
        setLoadingAction(false);
        return;
      }

      const phoneQuery = query(collection(db, "users"), where("phoneNumber", "==", cleanPhone), limit(1));
      const phoneSnap = await runWithRetry(() => getDocs(phoneQuery));
      if (!phoneSnap.empty) {
        setErrorMessage("Phone number already associated with another account.");
        setLoadingAction(false);
        return;
      }

      // Proceed with credential-based signup
      const email = `${formattedUsername}@bububai.com`;
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userProfileData = {
        uid: user.uid,
        name: name.trim(),
        nickname: nickname.trim(),
        username: formattedUsername,
        phoneNumber: cleanPhone,
        createdAt: serverTimestamp()
      };

      try {
        await runWithRetry(() => setDoc(doc(db, "users", user.uid), userProfileData));
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
      }

      // Re-read profile
      try {
        const userDoc = await runWithRetry(() => getDoc(doc(db, "users", user.uid)));
        if (userDoc.exists()) {
          setUserProfile(userDoc.data());
        } else {
          setUserProfile(userProfileData);
        }
      } catch (err) {
        console.warn("Offline error during custom user lookup post signUp: ", err);
        setUserProfile(userProfileData);
      }

      setAuthSuccessMessage("Your BUBUBAI ID registration is complete!");
      // Reset input data
      setFormData(prev => ({
        ...prev,
        name: "",
        nickname: "",
        username: "",
        phoneNumber: "",
        password: ""
      }));
    } catch (err: any) {
      console.error("SignUp error:", err);
      setErrorMessage(err.message || "An error occurred during registration.");
    } finally {
      setLoadingAction(false);
    }
  };

  // Handle Sign-In via Username or Phone Number
  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage("");
    setAuthSuccessMessage("");
    setLoadingAction(true);

    const { loginIdentifier, loginPassword } = formData;

    if (!loginIdentifier.trim() || !loginPassword) {
      setErrorMessage("Identifier and Password are required.");
      setLoadingAction(false);
      return;
    }

    // Clean @ prefix from username check
    let inputVal = loginIdentifier.trim().toLowerCase();
    if (inputVal.startsWith("@")) {
      inputVal = inputVal.slice(1);
    }

    // Clean phone input
    const cleanPhoneInput = loginIdentifier.trim().replace(/[\s\-\(\)\.]/g, "");

    try {
      let targetUsername = "";

      // Parallelize all lookup variants to minimize round-trip times and make login faster
      const [usernameSnap, phoneSnap, rawPhoneSnap] = await Promise.all([
        runWithRetry(() => getDocs(query(collection(db, "users"), where("username", "==", inputVal), limit(1)))),
        runWithRetry(() => getDocs(query(collection(db, "users"), where("phoneNumber", "==", cleanPhoneInput), limit(1)))),
        runWithRetry(() => getDocs(query(collection(db, "users"), where("phoneNumber", "==", loginIdentifier.trim()), limit(1))))
      ]);

      if (!usernameSnap.empty) {
        targetUsername = usernameSnap.docs[0].data().username;
      } else if (!phoneSnap.empty) {
        targetUsername = phoneSnap.docs[0].data().username;
      } else if (!rawPhoneSnap.empty) {
        targetUsername = rawPhoneSnap.docs[0].data().username;
      } else {
        setErrorMessage("No account exists with this Username or Phone number.");
        setLoadingAction(false);
        return;
      }

      const email = `${targetUsername}@bububai.com`;
      await signInWithEmailAndPassword(auth, email, loginPassword);
      setAuthSuccessMessage("Successfully Authenticated!");
    } catch (err: any) {
      console.error("SignIn error: ", err);
      setErrorMessage("Invalid credentials. Please verify your details.");
    } finally {
      setLoadingAction(false);
    }
  };

  // Google Login popup integration with local profile bootstrap
  const handleGoogleSignIn = async () => {
    setErrorMessage("");
    setAuthSuccessMessage("");
    setLoadingAction(true);

    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userDocRef = doc(db, "users", user.uid);
      let userProfileData: any = null;

      try {
        const userDoc = await runWithRetry(() => getDoc(userDocRef));

        if (!userDoc.exists()) {
          // Construct fallback user profile keys safely
          const completeName = user.displayName || "Google User";
          const nickname = completeName.split(" ")[0] || "User";
          const cleanEmailPrefix = (user.email?.split("@")[0] || "user").replace(/[^a-zA-Z0-9_\-]/g, "");
          let finalUsername = cleanEmailPrefix.toLowerCase();

          try {
            // Enforce Unique Username schema on Google Auth too
            const usernameQuery = query(collection(db, "users"), where("username", "==", finalUsername), limit(1));
            const usernameSnap = await runWithRetry(() => getDocs(usernameQuery));
            if (!usernameSnap.empty) {
              finalUsername = `${finalUsername}_${Date.now().toString().slice(-4)}`;
            }
          } catch (e) {
            console.warn("Could not query unique username constraints due to offline state", e);
          }

          userProfileData = {
            uid: user.uid,
            name: completeName,
            nickname: nickname,
            username: finalUsername,
            phoneNumber: user.phoneNumber || "Google Connected",
            createdAt: serverTimestamp()
          };

          try {
            await runWithRetry(() => setDoc(userDocRef, userProfileData));
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
          }
        } else {
          userProfileData = userDoc.data();
        }
      } catch (getErr) {
        console.warn("Offline error reading userDoc in Google login", getErr);
        // Build fallback profile because we are offline
        const completeName = user.displayName || "Google User";
        const nickname = completeName.split(" ")[0] || "User";
        const cleanEmailPrefix = (user.email?.split("@")[0] || "user").replace(/[^a-zA-Z0-9_\-]/g, "");
        userProfileData = {
          uid: user.uid,
          name: completeName,
          nickname: nickname,
          username: cleanEmailPrefix.toLowerCase(),
          phoneNumber: user.phoneNumber || "Offline Profile",
          createdAt: new Date()
        };
      }

      // Synchronize latest profile state safely
      if (userProfileData) {
        setUserProfile(userProfileData);
      } else {
        try {
          const updatedUserDoc = await runWithRetry(() => getDoc(userDocRef));
          if (updatedUserDoc.exists()) {
            setUserProfile(updatedUserDoc.data());
          }
        } catch (syncErr) {
          console.warn("Unable to sync updated profiles offline", syncErr);
        }
      }
      
      setAuthSuccessMessage("Google Connection Success!");
    } catch (err: any) {
      console.error("Google login failure: ", err);
      if (err?.code === "auth/unauthorized-domain" || (err?.message && err.message.includes("unauthorized-domain"))) {
        setDomainError(true);
        setErrorMessage("Google Login Error: This domain is not authorized in your Firebase Console.");
      } else {
        setErrorMessage(err?.message || "Failed to authenticate via Google Auth.");
      }
    } finally {
      setLoadingAction(false);
    }
  };

  // Profile data update logic
  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editName.trim() || !editNickname.trim()) {
      setErrorMessage("Profile values are required.");
      return;
    }
    setErrorMessage("");
    setAuthSuccessMessage("");
    setLoadingAction(true);

    if (!currentAuthUser) return;

    try {
      const userDocRef = doc(db, "users", currentAuthUser.uid);
      await runWithRetry(() => updateDoc(userDocRef, {
        name: editName.trim(),
        nickname: editNickname.trim()
      }));

      // Synchronize offline update state
      setUserProfile((prev: any) => ({
        ...prev,
        name: editName.trim(),
        nickname: editNickname.trim()
      }));

      setIsEditingProfile(false);
      setAuthSuccessMessage("Your profile information has been securely updated.");
    } catch (err: any) {
      console.error("Error setting custom state:", err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentAuthUser.uid}`);
    } finally {
      setLoadingAction(false);
    }
  };

  // Sign out user session
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setErrorMessage("");
      setAuthSuccessMessage("Signed out successfully.");
      setFormData(prev => ({
        ...prev,
        loginIdentifier: "",
        loginPassword: ""
      }));
    } catch (err: any) {
      console.error("Logout issue: ", err);
    }
  };

  if (!loading && currentAuthUser && userProfile) {
    return (
      <Dashboard 
        userProfile={userProfile} 
        onSignOut={handleSignOut} 
        onUpdateProfile={(updated) => setUserProfile(updated)} 
      />
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full bg-white select-none font-sans overflow-hidden">
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading-screen"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            onClick={handleSkipLoading}
            className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50 p-6 cursor-pointer"
            title="Click to skip loading"
          >
            <div className="flex flex-col items-center justify-center w-full max-w-xl text-center">
              {/* Perfectly Centered BIG Loading Image (ONLY SHOW THE BUBUBAI LOGO) */}
              <div className="flex items-center justify-center max-w-[95vw] max-h-[80vh]">
                <img
                  src={getImageUrl(loadingImageId)}
                  alt="BUBUBAI Loading Logo"
                  referrerPolicy="no-referrer"
                  className="w-full max-w-[360px] sm:max-w-[480px] object-contain select-none animate-[pulse_3s_infinite_ease-in-out]"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (target.src !== `https://docs.google.com/uc?export=download&id=${loadingImageId}`) {
                      target.src = `https://docs.google.com/uc?export=download&id=${loadingImageId}`;
                    }
                  }}
                />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="main-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="fixed inset-0 bg-white flex flex-col items-center justify-center p-6 z-10"
          >
            {/* Image in the middle of page - Completely Static, no animation */}
            <div className="flex flex-col items-center justify-center max-w-md w-full scale-95 sm:scale-100">
              <div className="mb-8 flex items-center justify-center">
                <img
                  src={getImageUrl(mainImageId)}
                  alt="BUBUBAI Core Logo"
                  referrerPolicy="no-referrer"
                  className="max-w-[260px] sm:max-w-[360px] max-h-[260px] sm:max-h-[360px] object-contain select-none"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (target.src !== `https://docs.google.com/uc?export=download&id=${mainImageId}`) {
                      target.src = `https://docs.google.com/uc?export=download&id=${mainImageId}`;
                    }
                  }}
                />
              </div>

              {/* Bold Titanic Style Typography */}
              <h1 className="text-4xl sm:text-6xl font-black text-center tracking-[0.2em] text-neutral-950 font-sans leading-none uppercase select-none mb-10 translate-x-[0.1em]">
                BUBUBAI ID
              </h1>

              {/* High-end design interactive premium OPEN button */}
              <button
                id="btn-open-bububai"
                onClick={() => setSlideOpen(true)}
                className="group relative px-12 py-3.5 bg-neutral-900 text-white font-bold text-sm tracking-[0.18em] uppercase rounded-full overflow-hidden transition-all duration-300 hover:bg-neutral-800 hover:scale-105 active:scale-95 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-neutral-800 cursor-pointer"
              >
                <span className="relative z-10">OPEN</span>
                <span className="absolute inset-0 bg-gradient-radial from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide bar sliding from bottom space up (with top rounded corners) */}
      <AnimatePresence>
        {slideOpen && (
          <>
            {/* Smooth Backdrop overlay that blurs the background */}
            <motion.div
              key="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: "easeInOut" }}
              onClick={() => setSlideOpen(false)}
              className="fixed inset-0 bg-neutral-950/70 backdrop-blur-md z-40 cursor-pointer"
            />

            <motion.div
              key="drawer-overlay"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              // Ultra-smooth spring physics for natural weightless feel
              transition={{ type: "spring", damping: 32, stiffness: 180, mass: 0.95 }}
              className="fixed inset-0 bg-[#2A2B2D] z-50 flex flex-col shadow-[0_-15px_50px_rgba(0,0,0,0.5)] rounded-t-[2.5rem] md:rounded-t-[3rem] overflow-hidden border-t border-neutral-700/40 transform-gpu"
            >
            {/* Top Bar containing custom luxury back symbol */}
            <div className="absolute top-6 left-6 z-50">
              <button
                id="btn-back-bububai"
                onClick={() => setSlideOpen(false)}
                className="p-3 bg-neutral-800/60 backdrop-blur-md rounded-full text-neutral-300 hover:text-white hover:bg-neutral-800 hover:scale-105 active:scale-95 transition-all duration-200 border border-neutral-700/40 shadow-md group cursor-pointer"
                aria-label="Go Back"
              >
                <ArrowLeft className="w-5 h-5 transition-transform duration-200 group-hover:-translate-x-0.5" />
              </button>
            </div>

            {/* Premium full-screen slide interior */}
            <div className="flex-1 flex flex-col items-center justify-start pt-20 px-4 sm:px-8 pb-8 text-neutral-100 relative overflow-y-auto">
              {/* Decorative premium lead-pencil texture or structural grid lines inside drawer applet */}
              <div className="pointer-events-none absolute inset-0 opacity-[0.03] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px]" />
              
              <div className="w-full max-w-md flex flex-col items-center z-10 space-y-8">
                {/* Pure White Background Outer Frame to make image background 100% suitable and beautiful on the dark pencil slide bar */}
                <div className="bg-white p-4 sm:p-5 rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.25)] flex items-center justify-center w-28 h-28 sm:w-32 sm:h-32 shrink-0">
                  <img
                    src={getImageUrl(loadingImageId)}
                    alt="BUBUBAI Slide Top Logo"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (target.src !== `https://docs.google.com/uc?export=download&id=${loadingImageId}`) {
                        target.src = `https://docs.google.com/uc?export=download&id=${loadingImageId}`;
                      }
                    }}
                  />
                </div>

                {/* State-driven Screen Panel: Sign In, Sign Up, or Logged In profile */}
                <div className="w-full">
                  {profileLoading ? (
                    <div className="flex flex-col items-center justify-center space-y-3 py-10">
                      <div className="w-8 h-8 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-neutral-400 font-mono tracking-widest">VERIFYING BUBUBAI ID...</p>
                    </div>
                  ) : currentAuthUser && userProfile ? (
                    /* SCREEN: Logged In / Authenticated Card Page */
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      <div className="text-center space-y-1">
                        <span className="text-[10px] sm:text-xs font-mono tracking-[0.3em] text-emerald-400 font-bold bg-emerald-950/40 px-3.5 py-1.5 rounded-full border border-emerald-800/20 uppercase select-none inline-flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5" /> SECURE MATCH LEVEL
                        </span>
                        <h2 className="text-2xl sm:text-3.5xl font-black text-center tracking-[0.12em] text-white pt-3 uppercase">
                          BUBUBAI AUTHENTICATED
                        </h2>
                      </div>

                      {/* Display of messages */}
                      {authSuccessMessage && (
                        <div className="p-3.5 bg-emerald-550/25 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm rounded-xl text-center select-text">
                          {authSuccessMessage}
                        </div>
                      )}

                      {/* Premium, High-fidelity Decentrlized Identity Card representation */}
                      <div className="relative overflow-hidden bg-gradient-to-br from-neutral-800 via-[#1E1F20] to-neutral-900 border border-neutral-700/30 rounded-3xl p-6 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col justify-between h-56 sm:h-60 relative group">
                        
                        {/* Shimmer overlay effect */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                        
                        {/* Lead pattern lines across card background */}
                        <div className="absolute inset-0 opacity-[0.05] bg-[linear-gradient(45deg,#fff_10%,transparent_10%,transparent_50%,#fff_50%,#fff_60%,transparent_60%)] bg-[size:10px_10px]" />

                        <div className="flex justify-between items-start relative z-10">
                          <div>
                            <p className="text-[10px] font-mono tracking-[0.2em] text-neutral-400 uppercase">DECENTRALIZED PASS</p>
                            <h3 className="text-xl sm:text-2xl font-black tracking-wider text-white mt-1 uppercase select-all">
                              {userProfile.nickname}
                            </h3>
                          </div>
                          <div className="p-2.5 bg-white/5 border border-white/10 rounded-2xl">
                            <Sparkles className="w-5 h-5 text-amber-400" />
                          </div>
                        </div>

                        {isEditingProfile ? (
                          /* Mode editing form inside Card */
                          <form onSubmit={handleUpdateProfile} className="space-y-4 pt-2 relative z-10 bg-neutral-900/90 p-4 rounded-2xl border border-neutral-700">
                            <div className="space-y-3">
                              <div>
                                <label className="text-[9px] font-mono tracking-widest text-neutral-400 block mb-1">EDIT NAME</label>
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="w-full bg-neutral-800/80 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white uppercase font-sans tracking-wide focus:outline-none focus:border-neutral-500"
                                  required
                                />
                              </div>
                              <div>
                                <label className="text-[9px] font-mono tracking-widest text-neutral-400 block mb-1">EDIT NICKNAME</label>
                                <input
                                  type="text"
                                  value={editNickname}
                                  onChange={(e) => setEditNickname(e.target.value)}
                                  className="w-full bg-neutral-800/80 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white uppercase font-sans tracking-wide focus:outline-none focus:border-neutral-500"
                                  required
                                />
                              </div>
                            </div>
                            <div className="flex gap-2 justify-end pt-1">
                              <button
                                type="button"
                                onClick={() => setIsEditingProfile(false)}
                                className="px-3 py-1 bg-neutral-800 text-neutral-300 text-[10px] font-mono tracking-wider rounded border border-neutral-700 uppercase"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={loadingAction}
                                className="px-3 py-1 bg-emerald-600 text-white text-[10px] font-mono tracking-wider rounded hover:bg-emerald-500 uppercase"
                              >
                                {loadingAction ? "saving..." : "Save"}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="space-y-3 pt-6 relative z-10">
                            {/* Standard read view profile keys */}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                              <div>
                                <p className="text-[9px] font-mono text-neutral-400 tracking-wider">BUBUBAI ID</p>
                                <p className="text-xs sm:text-sm font-sans font-bold text-neutral-100 truncate select-all">{userProfile.name}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-mono text-neutral-400 tracking-wider">USERNAME</p>
                                <p className="text-xs sm:text-sm font-sans font-bold text-neutral-200 truncate select-all">@{userProfile.username}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-mono text-neutral-400 tracking-wider font-medium">PHONE NUMBER</p>
                                <p className="text-xs sm:text-sm font-mono font-bold text-neutral-200 select-all">{userProfile.phoneNumber}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-mono text-neutral-400 tracking-wider">SECURE CODE</p>
                                <p className="text-xs sm:text-sm font-mono text-emerald-400 font-black tracking-widest">BBB-{currentAuthUser.uid.slice(0, 6).toUpperCase()}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Metallic Badge details */}
                        <div className="flex justify-between items-center text-[9px] font-mono text-neutral-500 mt-2 border-t border-neutral-800 pt-2 relative z-10">
                          <div className="flex items-center gap-1">
                            <Award className="w-3.5 h-3.5 text-amber-500" />
                            <span>LEVEL: PLATINUM</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>BUBUBAI WORLD</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions underneath card */}
                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        {!isEditingProfile && (
                          <button
                            onClick={() => {
                              setAuthSuccessMessage("");
                              setIsEditingProfile(true);
                            }}
                            className="flex-1 py-3 bg-neutral-800/80 hover:bg-neutral-800 text-neutral-200 text-xs sm:text-sm font-bold tracking-[0.12em] rounded-2xl border border-neutral-700/60 transition-all duration-200 uppercase flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                          >
                            <Edit3 className="w-4 h-4 text-neutral-400" /> Update Profile
                          </button>
                        )}

                        <button
                          onClick={handleSignOut}
                          className="flex-1 py-3 bg-red-955/20 hover:bg-red-900/20 text-red-400 text-xs sm:text-sm font-bold tracking-[0.12em] rounded-2xl border border-red-900/30 transition-all duration-200 uppercase flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                        >
                          <LogOut className="w-4 h-4" /> Sign Out Session
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    /* SCREEN: Sign In & Sign Up Auth Panels */
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-6"
                    >
                      {/* Interactive Header Slide tabs */}
                      <div className="grid grid-cols-2 bg-neutral-900/50 p-1.5 rounded-2xl border border-neutral-800/80">
                        <button
                          type="button"
                          onClick={() => {
                            setIsSignUp(false);
                            setErrorMessage("");
                            setDomainError(false);
                            setAuthSuccessMessage("");
                          }}
                          className={`py-2.5 rounded-xl text-xs sm:text-sm font-black tracking-[0.18em] uppercase transition-all select-none cursor-pointer ${
                            !isSignUp 
                              ? "bg-white text-neutral-900 shadow-md font-extrabold" 
                              : "text-neutral-400 hover:text-white"
                          }`}
                        >
                          SIGN IN
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsSignUp(true);
                            setErrorMessage("");
                            setDomainError(false);
                            setAuthSuccessMessage("");
                          }}
                          className={`py-2.5 rounded-xl text-xs sm:text-sm font-black tracking-[0.18em] uppercase transition-all select-none cursor-pointer ${
                            isSignUp 
                              ? "bg-white text-neutral-900 shadow-md font-extrabold" 
                              : "text-neutral-400 hover:text-white"
                          }`}
                        >
                          SIGN UP
                        </button>
                      </div>

                      <div className="text-center font-black tracking-[0.16em] text-white uppercase select-none text-xl">
                        BUBUBAI {isSignUp ? "SIGN UP REGISTRY" : "LOGIN PORTAL"}
                      </div>

                      {/* Display Alert Messages */}
                      {errorMessage && (
                        <div className="space-y-3">
                          <div className="p-3.5 bg-red-950/20 border border-red-900/30 text-red-300 text-xs sm:text-sm rounded-xl text-center select-text">
                            {errorMessage}
                          </div>
                          
                          {domainError && (
                            <div className="p-4 bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs rounded-xl space-y-3 select-text">
                              <div className="font-extrabold text-amber-300 tracking-wider uppercase flex items-center gap-1.5">
                                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                🔑 Firebase Setup Required (One-Time)
                              </div>
                              <p className="text-neutral-300 leading-relaxed text-[11px]">
                                Firebase Authentication requires this specific domain to be added to your Authorized Domains list in the Firebase Console.
                              </p>
                              <div className="space-y-1.5">
                                <p className="text-neutral-400 font-bold uppercase text-[9px]">Your Current Domain:</p>
                                <div className="flex gap-2">
                                  <div className="flex-1 bg-neutral-950/60 p-2.5 rounded-lg border border-neutral-800 font-mono text-[10px] text-center select-all flex items-center justify-center break-all">
                                    {window.location.hostname}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(window.location.hostname);
                                      alert("Copied to clipboard: " + window.location.hostname);
                                    }}
                                    className="px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg border border-neutral-700/50 text-[10px] font-bold uppercase cursor-pointer select-none transition-all active:scale-95"
                                  >
                                    Copy
                                  </button>
                                </div>
                              </div>
                              <div className="pt-2 text-center space-y-2">
                                <a
                                  href="https://console.firebase.google.com/project/bububaii/authentication/settings"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black tracking-widest rounded-lg text-[10px] uppercase transition-colors text-center"
                                >
                                  Open Firebase Settings ↗
                                </a>
                                <p className="text-[9px] text-neutral-400 leading-normal">
                                  Go to <strong className="text-neutral-300">Authentication</strong> &gt; <strong className="text-neutral-300">Settings</strong> &gt; <strong className="text-neutral-300">Authorized domains</strong> &gt; click <strong className="text-neutral-300">Add domain</strong> and paste the copied domain.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {authSuccessMessage && (
                        <div className="p-3.5 bg-emerald-950/20 border border-emerald-900/30 text-emerald-300 text-xs sm:text-sm rounded-xl text-center select-text">
                          {authSuccessMessage}
                        </div>
                      )}

                      {/* FORM VIEW: Silky sliding transition between Sign In & Sign Up tabs */}
                      <AnimatePresence mode="wait">
                        {isSignUp ? (
                          <motion.form
                            key="signup-form"
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -12 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            onSubmit={handleSignUp}
                            className="space-y-4"
                          >
                            <div className="space-y-3.5">
                              <div>
                                <label className="text-[10px] font-mono tracking-widest text-neutral-400 block mb-1">YOUR NAME</label>
                                <div className="relative">
                                  <User className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                  <input
                                    type="text"
                                    placeholder="E.G. SELVARANJAN"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    className="w-full bg-neutral-900/60 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-xs sm:text-sm text-white font-sans placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors uppercase"
                                    required
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="text-[10px] font-mono tracking-widest text-neutral-400 block mb-1">NICKNAME</label>
                                <div className="relative">
                                  <Sparkles className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                  <input
                                    type="text"
                                    placeholder="E.G. SELVA"
                                    value={formData.nickname}
                                    onChange={(e) => setFormData({...formData, nickname: e.target.value})}
                                    className="w-full bg-neutral-900/60 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-xs sm:text-sm text-white font-sans placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors uppercase"
                                    required
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="text-[10px] font-mono tracking-widest text-neutral-400 block mb-1">UNIQUE USERNAME</label>
                                <div className="relative">
                                  <span className="text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm font-mono font-bold select-none">@</span>
                                  <input
                                    type="text"
                                    placeholder="selvaranjan"
                                    value={formData.username}
                                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                                    className="w-full bg-neutral-900/60 border border-neutral-800 rounded-xl pl-9 pr-4 py-3 text-xs sm:text-sm text-white font-sans placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors lowercase"
                                    required
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="text-[10px] font-mono tracking-widest text-neutral-400 block mb-1">PHONE NUMBER</label>
                                <div className="relative">
                                  <Smartphone className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                  <input
                                    type="tel"
                                    placeholder="E.G. +1234567890"
                                    value={formData.phoneNumber}
                                    onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})}
                                    className="w-full bg-neutral-900/60 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-xs sm:text-sm text-white font-sans placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
                                    required
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="text-[10px] font-mono tracking-widest text-neutral-400 block mb-1">PASSWORD (SECRET ID)</label>
                                <div className="relative">
                                  <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                  <input
                                    type="password"
                                    placeholder="••••••••••••"
                                    value={formData.password}
                                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                                    className="w-full bg-neutral-900/60 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-xs sm:text-sm text-white font-sans placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
                                    required
                                  />
                                </div>
                              </div>
                            </div>

                            <button
                              type="submit"
                              disabled={loadingAction}
                              className="w-full py-3.5 mt-4 bg-white text-neutral-950 text-xs sm:text-sm font-extrabold tracking-[0.18em] rounded-2xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer uppercase border border-neutral-100"
                            >
                              {loadingAction ? "AUTHENTICATING SECURITY..." : "Complete Registry"}
                            </button>
                          </motion.form>
                        ) : (
                          <motion.form
                            key="signin-form"
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 12 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            onSubmit={handleSignIn}
                            className="space-y-4"
                          >
                            <div className="space-y-3.5">
                              <div>
                                <label className="text-[10px] font-mono tracking-widest text-neutral-400 block mb-1">USERNAME OR PHONE NUMBER</label>
                                <div className="relative">
                                  <User className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                  <input
                                    type="text"
                                    placeholder="E.G. @selvaranjan OR +123456..."
                                    value={formData.loginIdentifier}
                                    onChange={(e) => setFormData({...formData, loginIdentifier: e.target.value})}
                                    className="w-full bg-neutral-900/60 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-xs sm:text-sm text-white font-sans placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
                                    required
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="text-[10px] font-mono tracking-widest text-neutral-400 block mb-1">PASSWORD</label>
                                <div className="relative">
                                  <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                  <input
                                    type="password"
                                    placeholder="••••••••••••"
                                    value={formData.loginPassword}
                                    onChange={(e) => setFormData({...formData, loginPassword: e.target.value})}
                                    className="w-full bg-neutral-900/60 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-xs sm:text-sm text-white font-sans placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
                                    required
                                  />
                                </div>
                              </div>
                            </div>

                            <button
                              type="submit"
                              disabled={loadingAction}
                              className="w-full py-3.5 mt-4 bg-white text-neutral-950 text-xs sm:text-sm font-extrabold tracking-[0.18em] rounded-2xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer uppercase border border-neutral-100 font-sans"
                            >
                              {loadingAction ? "VERIFYING PROFILE SECTOR..." : "Open Identity Gateway"}
                            </button>
                          </motion.form>
                        )}
                      </AnimatePresence>

                      {/* Divider for Federated Google Signup */}
                      <div className="relative flex py-2 items-center">
                        <div className="flex-grow border-t border-neutral-800/80"></div>
                        <span className="flex-shrink mx-4 text-[9px] font-mono text-neutral-500 tracking-widest uppercase">Federated Sync</span>
                        <div className="flex-grow border-t border-neutral-800/80"></div>
                      </div>

                      {/* Google Authentication popup wrapper */}
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={loadingAction}
                        className="w-full h-11 bg-white hover:bg-neutral-50 active:bg-neutral-100/50 text-[#1f1f1f] border border-[#dadce0] rounded-xl flex items-center justify-center gap-3 text-xs sm:text-sm font-semibold cursor-pointer select-none transition-all duration-200 shadow-sm active:scale-[0.98]"
                      >
                        {loadingAction ? (
                          <>
                            <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin shrink-0" />
                            <span className="font-sans text-neutral-600">Connecting Google Account...</span>
                          </>
                        ) : (
                          <>
                            {/* High fidelity Google logo replica and style integration */}
                            <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31l3.4 2.64c2-1.84 3.15-4.54 3.15-7.7c0-.2-.02-.4-.05-.56z"
                                fill="#4285F4"
                              />
                              <path
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.4-2.64c-.95.63-2.16 1-3.88 1a6.6 6.6 0 0 1-6.22-4.58l-3.52 2.71C3.73 19.84 7.8 23 12 23z"
                                fill="#34A853"
                              />
                              <path
                                d="M5.78 14.12A6.61 6.61 0 0 1 5.4 12c0-.74.13-1.46.38-2.12L2.26 7.16A10.1 10.1 0 0 0 2 12c0 1.74.44 3.39 1.22 4.84l3.52-2.72z"
                                fill="#FBBC05"
                              />
                              <path
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.8 1 3.73 3.53 1.74 7.5l4.04 3.14c.95-3.12 3.88-5.38 6.22-5.38z"
                                fill="#EA4335"
                              />
                            </svg>
                            <span className="font-sans font-medium text-neutral-800">Continue with Google</span>
                          </>
                        )}
                      </button>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
