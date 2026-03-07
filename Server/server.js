import dotenv from "dotenv";
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import {
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateSMA
} from "./services/indicators.js";
import { validateSymbol, validateRange } from "./utils/validators.js";
import candleRouter from "./routes/candle.js";

const app = express();

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60 // limit each IP to 60 requests per minute
});

app.use(limiter);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../.env")
});

//Remember to remove
console.log("ENV LOADED:", {
  FMP: !!process.env.FMP_KEY,
  ALPHA: !!process.env.ALPHA_VANTAGE_KEY
});

function rangeToDays(range) {
  switch (range) {
    case "1m": return 30;
    case "3m": return 90;
    case "6m": return 180;
    case "1y": return 365;
    case "5y": return 1825;
    default: return 365;
  }
}

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
        .map(s => ({
          symbol: s.symbol,
          name: s.shortname
        }))
    );
  } catch (err) {
    console.error("YAHOO SEARCH ERROR:", err);
    res.json([]);
  }
});

/* -------------------------
   Candle Data Endpoint
--------------------------*/
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.use("/api/candle", candleRouter);
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
        if (!result) {
          console.log("FAILED:", item.symbol);
          continue;
        }

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

      } catch (err) {
        console.log("ERROR FETCHING:", item.symbol);
      }
    }

    console.log("INDEX RESULTS:", results.length);
    res.json(results);

  } catch (err) {
    console.error("INDEX ERROR:", err);
    res.status(500).json([]);
  }
});
/* -------------------------
   Fund Endpoint
--------------------------*/
app.get("/api/fund", async (req, res) => {
  try {

    const symbols = req.query.symbols?.split(",");
    const weights = req.query.weights?.split(",").map(Number);

    if (!symbols.length) {
      return res.status(400).json({ error: "No symbols provided" });
    }
    
    const range = req.query.range || "1y";
    const startDate = req.query.startDate;

    if (!symbols || !weights || symbols.length !== weights.length) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const normalizedWeights = weights.map(w => w / totalWeight);

    let portfolio = [];
    let labels = [];

    for (let s = 0; s < symbols.length; s++) {
      const symbol = symbols[s];

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=1d`;
      const r = await fetch(url);
      const data = await r.json();

      const result = data.chart?.result?.[0];
      if (!result) continue;

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

      if (s === 0) {
        labels = validLabels;
        portfolio = new Array(closes.length).fill(0);

        if (startDate) {
          const index = labels.findIndex(date => date >= startDate);
          if (index > 0) {
            labels = labels.slice(index);
            portfolio = portfolio.slice(index);
            // also trim closes to match
          }
        }
      }
      const base = closes[0];
      const normalized = closes.map(p => (p / base) * 100);

      for (let i = 0; i < normalized.length; i++) {
        portfolio[i] += normalized[i] * normalizedWeights[s];
      }
    }

    // ----- Fetch S&P 500 for comparison -----
    const spUrl = `https://query1.finance.yahoo.com/v8/finance/chart/^GSPC?range=${range}&interval=1d`;
    const spRes = await fetch(spUrl);
    const spData = await spRes.json();
    const spResult = spData.chart?.result?.[0];

    let sp500 = [];
    if (spResult) {
      const spCloses = spResult.indicators.quote[0].close.filter(Boolean);
      const spBase = spCloses[0];
      sp500 = spCloses.map(p => (p / spBase) * 100);
    }

    // ----- Metrics -----
    const totalReturn = ((portfolio[portfolio.length - 1] - 100));

    const dailyReturns = portfolio.slice(1).map((p, i) =>
      (p - portfolio[i]) / portfolio[i]
    );

    const avgReturn =
      dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;

    const volatility = Math.sqrt(
      dailyReturns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) /
      dailyReturns.length
    );

    const sharpe = volatility ? (avgReturn / volatility) * Math.sqrt(252) : 0;

    res.json({
      labels,
      portfolio,
      sp500,
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

/*app.use(express.static(__dirname));*/

app.use(express.static(path.resolve(__dirname, "../public")));
/* -------------------------
   Server Start
--------------------------*/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
