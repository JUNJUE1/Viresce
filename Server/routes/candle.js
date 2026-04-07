import express from "express";
import fetch from "node-fetch";
import {
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateSMA
} from "../services/indicators.js";
import { validateSymbol, validateRange } from "../utils/validators.js";

const router = express.Router();

const FMP_KEY = process.env.FMP_KEY;

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com",
  "Origin": "https://finance.yahoo.com"
};

const RANGE_MAP = {
  "1m": "1mo", "3m": "3mo", "6m": "6mo", "1y": "1y", "5y": "5y"
};

// Returns parsed JSON or null if Yahoo blocks
async function fetchYahoo(url) {
  try {
    const r = await fetch(url, { headers: YAHOO_HEADERS });
    if (r.status === 429 || r.status === 403) return null;
    const text = await r.text();
    if (text.startsWith("<") || text.includes("Too Many Requests")) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Returns parsed JSON or null if FMP fails
async function fetchFMP(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

router.get("/", async (req, res) => {
  try {
    const { symbol, range = "1y" } = req.query;

    if (!validateSymbol(symbol))
      return res.status(400).json({ error: "Invalid symbol" });
    if (!validateRange(range))
      return res.status(400).json({ error: "Invalid range" });

    let labels = [], prices = [], volume = [];

    // Try Yahoo first
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=1d`;
    const yahooData = await fetchYahoo(yahooUrl);
    const yahooResult = yahooData?.chart?.result?.[0];

    if (yahooResult) {
      labels = yahooResult.timestamp.map(t =>
        new Date(t * 1000).toISOString().split("T")[0]
      );
      prices = yahooResult.indicators.quote[0].close;
      volume = yahooResult.indicators.quote[0].volume;
      console.log(`✅ Candle via Yahoo: ${symbol}`);
    } else {
      // FMP fallback — historical daily prices
      console.log(`⚠️ Yahoo blocked for ${symbol}, trying FMP...`);

      // Map range to days for FMP
      const daysMap = { "1m": 30, "3m": 90, "6m": 180, "1y": 365, "5y": 1825 };
      const days = daysMap[range] || 365;

      const fmpData = await fetchFMP(
        `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&apikey=${FMP_KEY}`
      );
      const historical = fmpData?.historical;

      if (historical?.length) {
        // FMP returns newest first — reverse to get chronological order
        const sorted = [...historical].reverse();
        labels = sorted.map(d => d.date);
        prices = sorted.map(d => d.close);
        volume = sorted.map(d => d.volume);
        console.log(`✅ Candle via FMP fallback: ${symbol}`);
      }
    }

    // If both failed return empty
    if (!labels.length) {
      return res.json({
        labels: [], price: [], macd: [], signal: [],
        rsi: [], sma20: [], ema50: [], volume: []
      });
    }

    // Calculate indicators — filter out nulls first
    const cleanPrices = prices.map(p => p ?? 0);

    const { macd, signal } = calculateMACD(cleanPrices);
    const rsi    = calculateRSI(cleanPrices);
    const sma20  = calculateSMA(cleanPrices, 20);
    const ema50  = calculateEMA(cleanPrices, 50);

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
    res.status(500).json({ error: "Server error" });
  }
});

export default router;