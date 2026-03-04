export function calculateEMA(data, period) {
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

export function calculateMACD(prices) {
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);

    const macd = ema12.map((v, i) => v - ema26[i]);
    const signal = calculateEMA(macd, 9);

    return { macd, signal };
}

export function calculateRSI(prices, period = 14) {
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

export function calculateSMA(data, period) {
    return data.map((_, i) => {
        if (i < period - 1) return null;
        const slice = data.slice(i - period + 1, i + 1);
        return slice.reduce((a, b) => a + b, 0) / period;
    });
}
