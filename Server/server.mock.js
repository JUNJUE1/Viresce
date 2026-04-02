/* ----------------------------------------
   server.mock.js
   Use this for local testing — no MongoDB needed.
   Run with: node server.mock.js
   Switch to server.js when ready for real DB.
---------------------------------------- */
console.log("FILE STARTED");
import dotenv from "dotenv";
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Mock models (in-memory, no DB)
import { User } from "./models/MockUser.js";
import { Portfolio } from "./models/MockPortfolio.js";
import { Watchlist } from "./models/MockWatchlist.js";

import { authMiddleware } from "./utils/authMiddleware.js";
import candleRouter from "./routes/candle.js";
import {
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateSMA
} from "./services/indicators.js";
import { validateSymbol, validateRange } from "./utils/validators.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Fallback JWT secret for testing if .env not set
const JWT_SECRET = process.env.JWT_SECRET || "test_secret_change_in_production";

const app = express();
app.use(express.json());

const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use(limiter);

app.use((req, _res, next) => {
  console.log("→", req.method, req.url);
  next();
});

/* -------------------------
   AUTH ROUTES (inline, no mongoose)
--------------------------*/
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: "All fields are required" });
    if (password.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters" });

    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      const field = existing.email === email ? "Email" : "Username";
      return res.status(409).json({ error: `${field} already in use` });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, email, passwordHash });

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token,
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer "))
      return res.status(401).json({ error: "No token provided" });

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByIdSafe(decoded.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ user });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

/* -------------------------
   PORTFOLIO ROUTES
--------------------------*/
app.get("/api/portfolios", authMiddleware, async (req, res) => {
  try {
    const portfolios = await Portfolio.find({ userId: req.user.userId });
    res.json(portfolios);
  } catch { res.status(500).json({ error: "Failed to fetch portfolios" }); }
});

app.post("/api/portfolios", authMiddleware, async (req, res) => {
  try {
    const { name, stocks } = req.body;
    if (!name || !stocks?.length)
      return res.status(400).json({ error: "Name and stocks are required" });
    const portfolio = await Portfolio.create({ userId: req.user.userId, name, stocks });
    res.status(201).json(portfolio);
  } catch { res.status(500).json({ error: "Failed to save portfolio" }); }
});

app.delete("/api/portfolios/:id", authMiddleware, async (req, res) => {
  try {
    const portfolio = await Portfolio.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId
    });
    if (!portfolio) return res.status(404).json({ error: "Portfolio not found" });
    res.json({ message: "Portfolio deleted" });
  } catch { res.status(500).json({ error: "Failed to delete portfolio" }); }
});

/* -------------------------
   WATCHLIST ROUTES
--------------------------*/
app.get("/api/watchlists", authMiddleware, async (req, res) => {
  try {
    const watchlists = await Watchlist.find({ userId: req.user.userId });
    res.json(watchlists);
  } catch { res.status(500).json({ error: "Failed to fetch watchlists" }); }
});

app.post("/api/watchlists", authMiddleware, async (req, res) => {
  try {
    const { name, symbols } = req.body;
    if (!name || !symbols?.length)
      return res.status(400).json({ error: "Name and symbols are required" });
    const watchlist = await Watchlist.create({ userId: req.user.userId, name, symbols });
    res.status(201).json(watchlist);
  } catch { res.status(500).json({ error: "Failed to save watchlist" }); }
});

app.delete("/api/watchlists/:id", authMiddleware, async (req, res) => {
  try {
    const watchlist = await Watchlist.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId
    });
    if (!watchlist) return res.status(404).json({ error: "Watchlist not found" });
    res.json({ message: "Watchlist deleted" });
  } catch { res.status(500).json({ error: "Failed to delete watchlist" }); }
});

/* -------------------------
   CANDLE + SEARCH + INDEXES + FUND
--------------------------*/
app.use("/api/candle", candleRouter);

app.get("/api/search", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json([]);
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(
      (data.quotes || [])
        .filter(s => s.symbol && s.shortname)
        .map(s => ({ symbol: s.symbol, name: s.shortname }))
    );
  } catch { res.json([]); }
});

app.get("/api/indexes", async (req, res) => {
  try {
    const symbols = [
      { name: "S&P 500", symbol: "^GSPC" },
      { name: "NASDAQ", symbol: "^IXIC" },
      { name: "Dow Jones", symbol: "^DJI" },
      { name: "VIX", symbol: "^VIX" },
      { name: "Bitcoin", symbol: "BTC-USD" },
      { name: "Ethereum", symbol: "ETH-USD" }
    ];
    const results = [];
    for (const item of symbols) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${item.symbol}?range=7d&interval=1d`;
        const r = await fetch(url);
        const data = await r.json();
        const result = data.chart?.result?.[0];
        if (!result) continue;
        const closes = result.indicators.quote[0].close.filter(Boolean);
        if (closes.length < 2) continue;
        const last = closes[closes.length - 1];
        const prev = closes[closes.length - 2];
        results.push({
          name: item.name,
          price: last,
          change: ((last - prev) / prev) * 100,
          sparkline: closes
        });
      } catch { continue; }
    }
    res.json(results);
  } catch { res.status(500).json([]); }
});

app.get("/api/fund", async (req, res) => {
  try {
    const symbols = req.query.symbols?.split(",");
    const weights = req.query.weights?.split(",").map(Number);
    if (!symbols?.length) return res.status(400).json({ error: "No symbols provided" });
    const range = req.query.range || "1y";
    const startDate = req.query.startDate;
    if (!weights || symbols.length !== weights.length)
      return res.status(400).json({ error: "Invalid input" });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const normalizedWeights = weights.map(w => w / totalWeight);
    let portfolio = [];
    let labels = [];

    for (let s = 0; s < symbols.length; s++) {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbols[s]}?range=${range}&interval=1d`;
      const r = await fetch(url);
      const data = await r.json();
      const result = data.chart?.result?.[0];
      if (!result) continue;
      const rawCloses = result.indicators.quote[0].close;
      const rawTimestamps = result.timestamp;
      const closes = [], validLabels = [];
      for (let i = 0; i < rawCloses.length; i++) {
        if (rawCloses[i] != null) {
          closes.push(rawCloses[i]);
          validLabels.push(new Date(rawTimestamps[i] * 1000).toISOString().split("T")[0]);
        }
      }
      if (s === 0) {
        labels = validLabels;
        portfolio = new Array(closes.length).fill(0);
        if (startDate) {
          const index = labels.findIndex(date => date >= startDate);
          if (index > 0) { labels = labels.slice(index); portfolio = portfolio.slice(index); }
        }
      }
      const base = closes[0];
      const normalized = closes.map(p => (p / base) * 100);
      for (let i = 0; i < portfolio.length; i++) {
        portfolio[i] += (normalized[i] ?? 0) * normalizedWeights[s];
      }
    }

    const spRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/^GSPC?range=${range}&interval=1d`);
    const spData = await spRes.json();
    const spResult = spData.chart?.result?.[0];
    let sp500 = [];
    if (spResult) {
      const spCloses = spResult.indicators.quote[0].close.filter(Boolean);
      sp500 = spCloses.map(p => (p / spCloses[0]) * 100);
    }

    const totalReturn = portfolio[portfolio.length - 1] - 100;
    const dailyReturns = portfolio.slice(1).map((p, i) => (p - portfolio[i]) / portfolio[i]);
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const volatility = Math.sqrt(dailyReturns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / dailyReturns.length);
    const sharpe = volatility ? (avgReturn / volatility) * Math.sqrt(252) : 0;

    res.json({
      labels, portfolio, sp500,
      metrics: {
        totalReturn: totalReturn.toFixed(2),
        volatility: (volatility * 100).toFixed(2),
        sharpe: sharpe.toFixed(2)
      }
    });
  } catch (err) {
    console.error("FUND ERROR:", err);
    res.status(500).json({ error: "Fund calculation failed" });
  }
});

/* -------------------------
   Static Files (AFTER all API routes)
--------------------------*/
app.use(express.static(path.resolve(__dirname, "../public")));

app.get("{*path}", (_req, res) => {
  res.sendFile(path.resolve(__dirname, "../public/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 [MOCK MODE] Server running at http://localhost:${PORT}`);
  console.log(`⚠️  Data is in-memory only — resets on restart`);
  console.log(`📦 Switch to server.js + MongoDB when ready`);
});