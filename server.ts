import express from "express";
import path from "path";

const app = express();
const PORT = 3000;

app.use(express.json());

// API route
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Mock/Dummy endpoint for any residual chat requests so it doesn't crash
app.post("/api/bububai/chat", (req, res) => {
  res.json({ text: "AI has been successfully removed." });
});

app.post("/api/bububai/summarize", (req, res) => {
  res.json({ summary: "Chat Note" });
});

app.post("/api/bububai/tts", (req, res) => {
  res.json({ error: "TTS removed" });
});

app.post("/api/bububai/generate-avatar", (req, res) => {
  res.json({ image: "", error: "Avatar generation removed" });
});

// Mount Vite middleware in development mode
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development middleware integrated.");
  } else {
    // Production
    if (!process.env.VERCEL) {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
      console.log("Production serving from: ", distPath);
    }
  }
}

if (!process.env.VERCEL) {
  setupVite().then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server fully responsive on port http://0.0.0.0:${PORT}`);
    });
  });
} else {
  // On Vercel serverless context in production, make sure middleware/routes are defined properly
  setupVite();
}

export default app;
