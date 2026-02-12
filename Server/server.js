import dotenv from "dotenv";
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";

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

app.use(express.static(__dirname));

app.use(express.static(path.resolve(__dirname, "../public")));

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

function calculateEMA(data, period) {
  const k = 2 / (period + 1);
  let ema = [];
  let prev;

  data.forEach((price, i) => {
    if (i === 0) {
      prev = price;
      ema.push(price);
    } else {
      prev = price * k + prev * (1 - k);
      ema.push(prev);
    }
  });

  return ema;
}

function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);

  const macd = ema12.map((v, i) => v - ema26[i]);
  const signal = calculateEMA(macd, 9);

  return { macd, signal };
}

function calculateRSI(prices, period = 14) {
  let gains = [];
  let losses = [];

  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  const avgGain = calculateEMA(gains, period);
  const avgLoss = calculateEMA(losses, period);

  const rsi = avgGain.map((g, i) => {
    if (!avgLoss[i]) return 100;
    const rs = g / avgLoss[i];
    return 100 - 100 / (1 + rs);
  });

  return [null, ...rsi];
}

function calculateSMA(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

/* -------------------------
   Candle Data Endpoint
--------------------------*/
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/candle", async (req, res) => {
  try {
    const symbol = req.query.symbol;
    const range = req.query.range || "1y";

    const allowedRanges = ["1m", "3m", "6m", "1y", "5y"];
    if (!allowedRanges.includes(range)) {
      return res.status(400).json({ error: "Invalid range" });
    }

    function validateSymbol(symbol) {
      return symbol && /^[A-Z.\-]{1,10}$/i.test(symbol);
    }

    if (!validateSymbol(symbol)) {
      return res.status(400).json({ error: "Invalid symbol" });
    }

    const yahooUrl =
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}` +
      `?range=${range}&interval=1d`;

    const yRes = await fetch(yahooUrl);
    const yData = await yRes.json();
    const result = yData.chart.result?.[0];

    if (!result) {
      return res.json({
        labels: [],
        price: [],
        macd: [],
        signal: [],
        rsi: [],
        sma20: [],
        ema50: [],
        volume: []
      });
    }

    const labels = result.timestamp.map(t =>
      new Date(t * 1000).toISOString().split("T")[0]
    );

    const prices = result.indicators.quote[0].close;
    const volume = result.indicators.quote[0].volume;

    const { macd, signal } = calculateMACD(prices);
    const rsi = calculateRSI(prices);
    const sma20 = calculateSMA(prices, 20);
    const ema50 = calculateEMA(prices, 50);

    res.json({
      labels,
      price: prices,
      macd,
      signal,
      rsi,
      sma20,
      ema50,
      volume
    });

  } catch (err) {
    console.error("CANDLE ERROR:", err);
    res.json({
      labels: [],
      price: [],
      macd: [],
      signal: [],
      rsi: [],
      sma20: [],
      ema50: [],
      volume: []
    });
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
   Server Start
--------------------------*/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
