import fetch from "node-fetch";

const BASE = "http://localhost:3000";

const symbols = ["AAPL", "MSFT", "GOOG"];

async function testCandle(symbol) {
  try {
    const res = await fetch(`${BASE}/api/candle?symbol=${symbol}`);
    const data = await res.json();
    console.log(`\nCandle Data for ${symbol}:`);
    console.log("Labels length:", data.labels?.length);
    console.log("Price length:", data.price?.length);
    if (!Array.isArray(data.labels) || !Array.isArray(data.price)) {
      console.warn("⚠️  Data is not an array!");
    }
  } catch (err) {
    console.error("Error fetching candle:", err);
  }
}

async function testRSI(symbol) {
  try {
    const res = await fetch(`${BASE}/api/rsi?symbol=${symbol}`);
    const data = await res.json();
    console.log(`\nRSI Data for ${symbol}:`);
    console.log("Labels length:", data.labels?.length);
    console.log("Price length:", data.price?.length);
    if (!Array.isArray(data.labels) || !Array.isArray(data.price)) {
      console.warn("⚠️  Data is not an array!");
    }
  } catch (err) {
    console.error("Error fetching RSI:", err);
  }
}

async function runTests() {
  for (const symbol of symbols) {
    await testCandle(symbol);
    await testRSI(symbol);
  }
  console.log("\n✅ API Test Complete");
}

runTests();
