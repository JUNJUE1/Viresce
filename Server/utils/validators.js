/*export function validateRange(range) {
    const allowedRanges = ["1m", "3m", "6m", "1y", "5y"];
    if (!allowedRanges.includes(range)) {
      return res.status(400).json({ error: "Invalid range" });
    }
}*/
// validators.js
export function validateRange(range) {
  const allowedRanges = ["1m", "3m", "6m", "1y", "5y"];
  return allowedRanges.includes(range); // ✅ just return true/false
}

export function validateSymbol(symbol) {
    return symbol && /^[A-Z.\-]{1,10}$/i.test(symbol);
}