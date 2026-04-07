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

/* ========================
   FETCH HELPERS
======================== */

const FMP_KEY = process.env.FMP_KEY;

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com",
  "Origin": "https://finance.yahoo.com"
};

// Returns parsed JSON or null if Yahoo blocks/fails
async function fetchYahoo(url) {
  try {
    const r = await fetch(url, { headers: YAHOO_HEADERS });
    if (r.status === 429 || r.status === 403) {
      console.log(`⚠️ Yahoo blocked (${r.status})`);
      return null;
    }
    const text = await r.text();
    if (text.startsWith("<") || text.includes("Too Many Requests")) {
      console.log("⚠️ Yahoo returned non-JSON");
      return null;
    }
    return JSON.parse(text);
  } catch (err) {
    console.log("⚠️ Yahoo fetch failed:", err.message);
    return null;
  }
}

// Returns parsed JSON or null if FMP fails
async function fetchFMP(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch (err) {
    console.log("⚠️ FMP fetch failed:", err.message);
    return null;
  }
}

// Format numbers for display
function fmt(num, type = "number") {
  if (num === null || num === undefined) return "N/A";
  if (type === "percent") return (num * 100).toFixed(2) + "%";
  if (type === "currency") {
    if (Math.abs(num) >= 1e12) return "$" + (num / 1e12).toFixed(2) + "T";
    if (Math.abs(num) >= 1e9)  return "$" + (num / 1e9).toFixed(2) + "B";
    if (Math.abs(num) >= 1e6)  return "$" + (num / 1e6).toFixed(2) + "M";
    return "$" + num.toLocaleString();
  }
  return Number(num).toFixed(2);
}

/* -------------------------
   API Routes (BEFORE static)
--------------------------*/
app.use("/api/auth", authRouter);
app.use("/api/candle", candleRouter);
app.use("/api/portfolios", portfoliosRouter);
app.use("/api/watchlists", watchlistsRouter);

/* -------------------------
   Search
   FMP primary (reliable on cloud), Yahoo fallback
--------------------------*/
app.get("/api/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);

  // FMP first — most reliable on cloud servers
  const fmpData = await fetchFMP(
    `https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(q)}&limit=8&apikey=${FMP_KEY}`
  );
  if (fmpData?.length) {
    return res.json(
      fmpData
        .filter(s => s.symbol && s.name)
        .map(s => ({ symbol: s.symbol, name: s.name }))
    );
  }

  // Yahoo fallback
  const yahooData = await fetchYahoo(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`
  );
  if (yahooData?.quotes?.length) {
    return res.json(
      yahooData.quotes
        .filter(s => s.symbol && s.shortname)
        .map(s => ({ symbol: s.symbol, name: s.shortname }))
    );
  }

  res.json([]);
});

/* -------------------------
   Fundamentals
   FMP primary, Yahoo fallback
--------------------------*/
app.get("/api/fundamentals", async (req, res) => {
  try {
    const { symbol } = req.query;
    if (!validateSymbol(symbol))
      return res.status(400).json({ error: "Invalid symbol" });

    let metrics = null;

    // Try FMP first
    const [profileRes, ratiosRes, incomeRes] = await Promise.all([
      fetchFMP(`https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${FMP_KEY}`),
      fetchFMP(`https://financialmodelingprep.com/api/v3/ratios-ttm/${symbol}?apikey=${FMP_KEY}`),
      fetchFMP(`https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=1&apikey=${FMP_KEY}`)
    ]);

    const profile = profileRes?.[0];
    const ratios  = ratiosRes?.[0];
    const income  = incomeRes?.[0];

    if (profile) {
      metrics = {
        currentPrice:  { raw: profile.price,                formatted: fmt(profile.price),                        label: "Current Price"  },
        marketCap:     { raw: profile.mktCap,               formatted: fmt(profile.mktCap, "currency"),           label: "Market Cap"     },
        peRatio:       { raw: ratios?.peRatioTTM,           formatted: fmt(ratios?.peRatioTTM),                   label: "P/E Ratio"      },
        forwardPE:     { raw: null,                         formatted: "N/A",                                     label: "Forward P/E"    },
        dividendYield: { raw: profile.lastDiv,              formatted: profile.lastDiv ? fmt(profile.lastDiv) : "N/A", label: "Dividend Yield" },
        week52High:    { raw: profile["52WeekHigh"],        formatted: fmt(profile["52WeekHigh"]),                label: "52W High"       },
        week52Low:     { raw: profile["52WeekLow"],         formatted: fmt(profile["52WeekLow"]),                 label: "52W Low"        },
        revenue:       { raw: income?.revenue,              formatted: fmt(income?.revenue, "currency"),          label: "Revenue (TTM)"  },
        netIncome:     { raw: income?.netIncome,            formatted: fmt(income?.netIncome, "currency"),        label: "Net Income"     },
        profitMargin:  { raw: ratios?.netProfitMarginTTM,  formatted: ratios?.netProfitMarginTTM != null ? (ratios.netProfitMarginTTM * 100).toFixed(2) + "%" : "N/A", label: "Profit Margin" },
        revenueGrowth: { raw: null,                         formatted: "N/A",                                     label: "Revenue Growth" }
      };
      console.log(`✅ Fundamentals via FMP: ${symbol}`);
    }

    // Yahoo fallback
    if (!metrics) {
      const data = await fetchYahoo(
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,financialData,defaultKeyStatistics,incomeStatementHistory`
      );
      const result = data?.quoteSummary?.result?.[0];

      if (result) {
        const summary   = result.summaryDetail || {};
        const financial = result.financialData || {};
        const inc       = result.incomeStatementHistory?.incomeStatementHistory?.[0] || {};
        const v = (obj, key) => obj?.[key]?.raw ?? null;

        metrics = {
          currentPrice:  { raw: v(financial, "currentPrice"),   formatted: fmt(v(financial, "currentPrice")),              label: "Current Price"  },
          marketCap:     { raw: v(summary, "marketCap"),        formatted: fmt(v(summary, "marketCap"), "currency"),       label: "Market Cap"     },
          peRatio:       { raw: v(summary, "trailingPE"),       formatted: fmt(v(summary, "trailingPE")),                  label: "P/E Ratio"      },
          forwardPE:     { raw: v(summary, "forwardPE"),        formatted: fmt(v(summary, "forwardPE")),                   label: "Forward P/E"    },
          dividendYield: { raw: v(summary, "dividendYield"),    formatted: fmt(v(summary, "dividendYield"), "percent"),    label: "Dividend Yield" },
          week52High:    { raw: v(summary, "fiftyTwoWeekHigh"), formatted: fmt(v(summary, "fiftyTwoWeekHigh")),            label: "52W High"       },
          week52Low:     { raw: v(summary, "fiftyTwoWeekLow"),  formatted: fmt(v(summary, "fiftyTwoWeekLow")),             label: "52W Low"        },
          revenue:       { raw: v(financial, "totalRevenue"),   formatted: fmt(v(financial, "totalRevenue"), "currency"),  label: "Revenue (TTM)"  },
          netIncome:     { raw: v(inc, "netIncome"),            formatted: fmt(v(inc, "netIncome"), "currency"),           label: "Net Income"     },
          profitMargin:  { raw: v(financial, "profitMargins"),  formatted: fmt(v(financial, "profitMargins"), "percent"),  label: "Profit Margin"  },
          revenueGrowth: { raw: v(financial, "revenueGrowth"),  formatted: fmt(v(financial, "revenueGrowth"), "percent"),  label: "Revenue Growth" }
        };
        console.log(`✅ Fundamentals via Yahoo fallback: ${symbol}`);
      }
    }

    if (!metrics) {
      return res.status(404).json({ error: "No fundamental data found for " + symbol });
    }

    res.json({ symbol, metrics });

  } catch (err) {
    console.error("FUNDAMENTALS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch fundamentals" });
  }
});

/* -------------------------
   Indexes
   Yahoo primary, FMP fallback
--------------------------*/
app.get("/api/indexes", async (req, res) => {
  const symbols = [
    { name: "S&P 500",   yahoo: "^GSPC",   fmp: "SPY"    },
    { name: "NASDAQ",    yahoo: "^IXIC",   fmp: "QQQ"    },
    { name: "Dow Jones", yahoo: "^DJI",    fmp: "DIA"    },
    { name: "VIX",       yahoo: "^VIX",    fmp: null     },
    { name: "Bitcoin",   yahoo: "BTC-USD", fmp: "BTCUSD" },
    { name: "Ethereum",  yahoo: "ETH-USD", fmp: "ETHUSD" }
  ];

  const results = [];

  for (const item of symbols) {
    try {
      // Try Yahoo
      const data = await fetchYahoo(
        `https://query1.finance.yahoo.com/v8/finance/chart/${item.yahoo}?range=7d&interval=1d`
      );
      const result = data?.chart?.result?.[0];

      if (result) {
        const closes = result.indicators.quote[0].close.filter(Boolean);
        if (closes.length >= 2) {
          const last = closes[closes.length - 1];
          const prev = closes[closes.length - 2];
          results.push({
            name: item.name,
            price: last,
            change: ((last - prev) / prev) * 100,
            sparkline: closes
          });
          continue;
        }
      }

      // FMP fallback (not available for VIX)
      if (item.fmp) {
        const fmpData = await fetchFMP(
          `https://financialmodelingprep.com/api/v3/quote/${item.fmp}?apikey=${FMP_KEY}`
        );
        const q = fmpData?.[0];
        if (q) {
          results.push({
            name: item.name,
            price: q.price,
            change: q.changesPercentage,
            sparkline: []
          });
          console.log(`✅ Index via FMP fallback: ${item.name}`);
        }
      }
    } catch { continue; }
  }

  res.json(results);
});

/* -------------------------
   Fund — Yahoo primary, FMP fallback
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

    // Fetch full historical data — Yahoo first, FMP fallback
    async function fetchHistorical(symbol) {
      const yahooData = await fetchYahoo(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=max&interval=1d`
      );
      const yahooResult = yahooData?.chart?.result?.[0];

      if (yahooResult) {
        const rawCloses = yahooResult.indicators.quote[0].close;
        const rawTimestamps = yahooResult.timestamp;
        const closes = [], validLabels = [];
        for (let i = 0; i < rawCloses.length; i++) {
          if (rawCloses[i] != null) {
            closes.push(rawCloses[i]);
            validLabels.push(new Date(rawTimestamps[i] * 1000).toISOString().split("T")[0]);
          }
        }
        if (closes.length) return { closes, validLabels };
      }

      // FMP fallback
      const fmpData = await fetchFMP(
        `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?apikey=${FMP_KEY}`
      );
      const historical = fmpData?.historical;
      if (historical?.length) {
        const sorted = [...historical].reverse();
        console.log(`✅ Historical via FMP fallback: ${symbol}`);
        return {
          closes: sorted.map(d => d.close),
          validLabels: sorted.map(d => d.date)
        };
      }

      return null;
    }

    // First pass — IPO guard
    let latestEarliestDate = null;
    const stockData = [];

    for (const symbol of symbols) {
      const data = await fetchHistorical(symbol);
      if (!data) { stockData.push(null); continue; }
      const earliestDate = data.validLabels[0];
      if (!latestEarliestDate || earliestDate > latestEarliestDate) {
        latestEarliestDate = earliestDate;
      }
      stockData.push(data);
    }

    // Clamp start date to IPO floor
    let effectiveStartDate = startDate || null;
    let ipoWarning = null;

    if (startDate && latestEarliestDate && startDate < latestEarliestDate) {
      ipoWarning = {
        message: `Start date clamped from ${startDate} to ${latestEarliestDate} — one or more stocks weren't yet public.`,
        originalDate: startDate,
        clampedDate: latestEarliestDate
      };
      effectiveStartDate = latestEarliestDate;
    }

    // Second pass — build portfolio
    let portfolio = [], labels = [];
    const rangeMap = { "1m": 30, "3m": 90, "6m": 180, "1y": 365, "5y": 1825, "max": 99999 };
    const days = rangeMap[range] || 365;
    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - days);
    const rangeStartStr = rangeStart.toISOString().split("T")[0];

    for (let s = 0; s < symbols.length; s++) {
      const stock = stockData[s];
      if (!stock) continue;

      let { closes, validLabels } = stock;

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

    // S&P 500 benchmark — Yahoo first, SPY via FMP fallback
    let sp500 = [];
    const spData = await fetchYahoo(
      `https://query1.finance.yahoo.com/v8/finance/chart/^GSPC?range=${range}&interval=1d`
    );
    const spResult = spData?.chart?.result?.[0];

    if (spResult) {
      const spCloses = spResult.indicators.quote[0].close.filter(Boolean);
      sp500 = spCloses.map(p => (p / spCloses[0]) * 100);
    } else {
      const fmpSP = await fetchFMP(
        `https://financialmodelingprep.com/api/v3/historical-price-full/SPY?apikey=${FMP_KEY}`
      );
      if (fmpSP?.historical?.length) {
        const sorted = [...fmpSP.historical].reverse().slice(-(days));
        const base = sorted[0].close;
        sp500 = sorted.map(d => (d.close / base) * 100);
      }
    }

    if (!portfolio.length) {
      return res.status(400).json({ error: "No data available for selected date range" });
    }

    // Metrics
    const totalReturn = portfolio[portfolio.length - 1] - 100;
    const dailyReturns = portfolio.slice(1).map((p, i) => (p - portfolio[i]) / portfolio[i]);
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const volatility = Math.sqrt(
      dailyReturns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / dailyReturns.length
    );
    const sharpe = volatility ? (avgReturn / volatility) * Math.sqrt(252) : 0;

    let peak = portfolio[0], maxDrawdown = 0;
    for (const p of portfolio) {
      if (p > peak) peak = p;
      const dd = (peak - p) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    res.json({
      labels, portfolio, sp500, ipoWarning, effectiveStartDate,
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

app.get("/api/debug-fundamentals", async (req, res) => {
  const { symbol } = req.query;
  
  // Raw FMP calls — no error swallowing
  const profileUrl = `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${FMP_KEY}`;
  const ratiosUrl  = `https://financialmodelingprep.com/api/v3/ratios-ttm/${symbol}?apikey=${FMP_KEY}`;
  const incomeUrl  = `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=1&apikey=${FMP_KEY}`;

  const [p, r, i] = await Promise.all([
    fetch(profileUrl).then(r => r.text()),
    fetch(ratiosUrl).then(r => r.text()),
    fetch(incomeUrl).then(r => r.text())
  ]);

  res.json({
    profileRaw: p,
    ratiosRaw: r,
    incomeRaw: i
  });
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