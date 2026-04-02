import dotenv from "dotenv";
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import {
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateSMA
} from "./services/indicators.js";
import { validateSymbol, validateRange } from "./utils/validators.js";
import candleRouter from "./routes/candle.js";
import authRouter from "./routes/auth.js";
import portfoliosRouter from "./routes/portfolios.js";
import watchlistsRouter from "./routes/watchlists.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

/* -------------------------
   Database Connection
--------------------------*/
mongoose
  .connect(process.env.MONGODB_URI, { family: 4 })
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB connection failed:", err));

const app = express();

app.use(express.json());

const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use(limiter);

app.use((req, _res, next) => {
  console.log("→", req.method, req.url);
  next();
});

/* -------------------------
   API Routes (BEFORE static)
--------------------------*/
app.use("/api/auth", authRouter);
app.use("/api/candle", candleRouter);
app.use("/api/portfolios", portfoliosRouter);
app.use("/api/watchlists", watchlistsRouter);

/* -------------------------
   Search Endpoint
--------------------------*/
app.get("/api/search", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json([]);
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
    const r = await fetch(url);
    const data = await r.json();
    const results = data.quotes || [];
    res.json(
      results
        .filter(s => s.symbol && s.shortname)
        .map(s => ({ symbol: s.symbol, name: s.shortname }))
    );
  } catch (err) {
    console.error("YAHOO SEARCH ERROR:", err);
    res.json([]);
  }
});

/* -------------------------
   Fundamentals Endpoint
   Returns: P/E, Market Cap, Revenue,
   Net Income, Dividend Yield, 52wk High/Low
--------------------------*/
app.get("/api/fundamentals", async (req, res) => {
  try {
    const { symbol } = req.query;
    if (!validateSymbol(symbol))
      return res.status(400).json({ error: "Invalid symbol" });

    // Yahoo Finance v10 quoteSummary — gets fundamental data
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,financialData,defaultKeyStatistics,incomeStatementHistory`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    if (!r.ok) return res.status(502).json({ error: "Upstream API failed" });

    const data = await r.json();
    const result = data.quoteSummary?.result?.[0];

    if (!result) return res.status(404).json({ error: "No data found" });

    const summary = result.summaryDetail || {};
    const financial = result.financialData || {};
    const keyStats = result.defaultKeyStatistics || {};
    const income = result.incomeStatementHistory?.incomeStatementHistory?.[0] || {};

    // Helper to safely extract Yahoo's formatted values
    const val = (obj, key) => obj?.[key]?.raw ?? null;
    const fmt = (num, type = "number") => {
      if (num === null || num === undefined) return "N/A";
      if (type === "percent") return (num * 100).toFixed(2) + "%";
      if (type === "currency") {
        if (Math.abs(num) >= 1e12) return "$" + (num / 1e12).toFixed(2) + "T";
        if (Math.abs(num) >= 1e9) return "$" + (num / 1e9).toFixed(2) + "B";
        if (Math.abs(num) >= 1e6) return "$" + (num / 1e6).toFixed(2) + "M";
        return "$" + num.toLocaleString();
      }
      return num.toFixed(2);
    };

    const marketCap = val(summary, "marketCap");
    const peRatio = val(summary, "trailingPE");
    const forwardPE = val(summary, "forwardPE");
    const dividendYield = val(summary, "dividendYield");
    const week52High = val(summary, "fiftyTwoWeekHigh");
    const week52Low = val(summary, "fiftyTwoWeekLow");
    const revenue = val(financial, "totalRevenue");
    const netIncome = val(income, "netIncome");
    const profitMargin = val(financial, "profitMargins");
    const revenueGrowth = val(financial, "revenueGrowth");
    const currentPrice = val(financial, "currentPrice");

    res.json({
      symbol,
      metrics: {
        marketCap: { raw: marketCap, formatted: fmt(marketCap, "currency"), label: "Market Cap" },
        peRatio: { raw: peRatio, formatted: fmt(peRatio), label: "P/E Ratio" },
        forwardPE: { raw: forwardPE, formatted: fmt(forwardPE), label: "Forward P/E" },
        dividendYield: { raw: dividendYield, formatted: fmt(dividendYield, "percent"), label: "Dividend Yield" },
        week52High: { raw: week52High, formatted: fmt(week52High), label: "52W High" },
        week52Low: { raw: week52Low, formatted: fmt(week52Low), label: "52W Low" },
        revenue: { raw: revenue, formatted: fmt(revenue, "currency"), label: "Revenue (TTM)" },
        netIncome: { raw: netIncome, formatted: fmt(netIncome, "currency"), label: "Net Income" },
        profitMargin: { raw: profitMargin, formatted: fmt(profitMargin, "percent"), label: "Profit Margin" },
        revenueGrowth: { raw: revenueGrowth, formatted: fmt(revenueGrowth, "percent"), label: "Revenue Growth" },
        currentPrice: { raw: currentPrice, formatted: fmt(currentPrice), label: "Current Price" }
      }
    });
  } catch (err) {
    console.error("FUNDAMENTALS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch fundamentals" });
  }
});

/* -------------------------
   Indexes Endpoint
--------------------------*/
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
  } catch (err) {
    console.error("INDEX ERROR:", err);
    res.status(500).json([]);
  }
});

/* -------------------------
   Fund Endpoint — with IPO date guard
--------------------------*/
app.get("/api/fund", async (req, res) => {
  try {
    const symbols = req.query.symbols?.split(",");
    const weights = req.query.weights?.split(",").map(Number);

    if (!symbols?.length)
      return res.status(400).json({ error: "No symbols provided" });

    const range = req.query.range || "1y";
    const startDate = req.query.startDate;

    if (!weights || symbols.length !== weights.length)
      return res.status(400).json({ error: "Invalid input" });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const normalizedWeights = weights.map(w => w / totalWeight);

    let portfolio = [];
    let labels = [];

    // Track the earliest available date across all stocks (IPO guard)
    let latestEarliestDate = null;
    const stockData = [];

    // First pass — fetch all stocks and find constraining earliest date
    for (let s = 0; s < symbols.length; s++) {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbols[s]}?range=max&interval=1d`;
      const r = await fetch(url);
      const data = await r.json();
      const result = data.chart?.result?.[0];
      if (!result) {
        stockData.push(null);
        continue;
      }

      const rawCloses = result.indicators.quote[0].close;
      const rawTimestamps = result.timestamp;
      const closes = [];
      const validLabels = [];

      for (let i = 0; i < rawCloses.length; i++) {
        if (rawCloses[i] != null) {
          closes.push(rawCloses[i]);
          validLabels.push(
            new Date(rawTimestamps[i] * 1000).toISOString().split("T")[0]
          );
        }
      }

      const earliestDate = validLabels[0];

      // Track the latest "earliest date" — this is the real floor
      if (!latestEarliestDate || earliestDate > latestEarliestDate) {
        latestEarliestDate = earliestDate;
      }

      stockData.push({ closes, validLabels, earliestDate });
    }

    // Determine effective start date with IPO guard
    let effectiveStartDate = startDate || null;
    let ipoWarning = null;

    if (startDate && latestEarliestDate && startDate < latestEarliestDate) {
      ipoWarning = {
        message: `Start date was clamped from ${startDate} to ${latestEarliestDate} — one or more stocks were not yet public.`,
        originalDate: startDate,
        clampedDate: latestEarliestDate
      };
      effectiveStartDate = latestEarliestDate;
    }

    // Second pass — build portfolio using effective date range
    for (let s = 0; s < symbols.length; s++) {
      const stock = stockData[s];
      if (!stock) continue;

      let { closes, validLabels } = stock;

      // Filter to range
      const rangeMap = { "1m": 30, "3m": 90, "6m": 180, "1y": 365, "5y": 1825, "max": 99999 };
      const days = rangeMap[range] || 365;
      const rangeStart = new Date();
      rangeStart.setDate(rangeStart.getDate() - days);
      const rangeStartStr = rangeStart.toISOString().split("T")[0];

      // Apply both range and effective start date
      const filterDate = effectiveStartDate
        ? (effectiveStartDate > rangeStartStr ? effectiveStartDate : rangeStartStr)
        : rangeStartStr;

      const startIdx = validLabels.findIndex(d => d >= filterDate);
      if (startIdx > 0) {
        closes = closes.slice(startIdx);
        validLabels = validLabels.slice(startIdx);
      }

      if (s === 0) {
        labels = validLabels;
        portfolio = new Array(closes.length).fill(0);
      }

      const base = closes[0];
      const normalized = closes.map(p => (p / base) * 100);

      for (let i = 0; i < portfolio.length; i++) {
        portfolio[i] += (normalized[i] ?? 0) * normalizedWeights[s];
      }
    }

    // Fetch S&P 500
    const spUrl = `https://query1.finance.yahoo.com/v8/finance/chart/^GSPC?range=${range}&interval=1d`;
    const spRes = await fetch(spUrl);
    const spData = await spRes.json();
    const spResult = spData.chart?.result?.[0];
    let sp500 = [];
    if (spResult) {
      const spCloses = spResult.indicators.quote[0].close.filter(Boolean);
      sp500 = spCloses.map(p => (p / spCloses[0]) * 100);
    }

    if (!portfolio.length) {
      return res.status(400).json({ error: "No data available for selected date range" });
    }

    const totalReturn = portfolio[portfolio.length - 1] - 100;
    const dailyReturns = portfolio.slice(1).map((p, i) => (p - portfolio[i]) / portfolio[i]);
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const volatility = Math.sqrt(
      dailyReturns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / dailyReturns.length
    );
    const sharpe = volatility ? (avgReturn / volatility) * Math.sqrt(252) : 0;

    // Max drawdown
    let peak = portfolio[0];
    let maxDrawdown = 0;
    for (const p of portfolio) {
      if (p > peak) peak = p;
      const drawdown = (peak - p) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    res.json({
      labels,
      portfolio,
      sp500,
      ipoWarning,
      effectiveStartDate,
      metrics: {
        totalReturn: totalReturn.toFixed(2),
        volatility: (volatility * 100).toFixed(2),
        sharpe: sharpe.toFixed(2),
        maxDrawdown: (maxDrawdown * 100).toFixed(2)
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

app.get("/{*path}", (_req, res) => {
  res.sendFile(path.resolve(__dirname, "../public/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});