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

router.get("/", async (req, res) => {
  try {
    const { symbol, range = "1y" } = req.query;

    if (!validateSymbol(symbol))
      return res.status(400).json({ error: "Invalid symbol" });

    if (!validateRange(range))
      return res.status(400).json({ error: "Invalid range" });

    const yahooUrl =
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}` +
      `?range=${range}&interval=1d`;

    const yRes = await fetch(yahooUrl);

    if (!yRes.ok)
      return res.status(502).json({ error: "Upstream API failed" });

    const yData = await yRes.json();
    const result = yData.chart?.result?.[0];

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
    res.status(500).json({ error: "Server error" });
  }
});

export default router;