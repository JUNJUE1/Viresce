document.addEventListener("DOMContentLoaded", () => {
  /* =========================
     CHART SETUP
  ========================= */
  const canvas = document.getElementById("stockChart");
  const ctx = canvas.getContext("2d");
  const normalizeToggle = document.getElementById("normalizeToggle");

  const chart = new Chart(ctx, {
  type: "line",
  data: { labels: [], datasets: [] },
  options: {
    responsive: true,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "top" },
      zoom: {
        pan: { enabled: true, mode: "x" },
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: "x"
        }
      }
    },
    scales: {
      y: { display: true },
      yRsi: {
        display: false,
        position: "right",
        min: 0,
        max: 100,
        grid: { drawOnChartArea: false }
      }
    }
  }
});


  /* =========================
     STATE
  ========================= */

  const COLORS = ["#4F46E5", "#10B981", "#EF4444", "#F59E0B"];
  const USE_MOCK_DATA = false;

  let selectedStocks = [];
  let selectedMetric = "price";
  let normalize = false;
  let selectedRange = "1y";


  /* =========================
     METRICS CONFIG
  ========================= */

  const METRICS = {
  price: { label: "Price", normalize: true },
  rsi: { label: "RSI (14)", normalize: false },
  macd: { label: "MACD", normalize: false },
  volume: { label: "Volume", normalize: false },
  sma20: { label: "SMA 20", normalize: false },
  ema50: { label: "EMA 50", normalize: false }
};


  /* =========================
     HELPERS
  ========================= */

  function normalizeSeries(arr) {
    if (!normalize || !arr.length) return arr;
    const base = arr.find(v => v !== null) || 1;
    return arr.map(v => (v / base) * 100);
  }

  function generateMockData(days = 180, start = 100) {
    const labels = [];
    const price = [];
    let p = start;

    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (days - i));
      labels.push(d.toLocaleDateString());

      p *= 1 + (Math.random() - 0.5) / 15;
      price.push(Number(p.toFixed(2)));
    }

    return { labels, price };
  }

  function setLoading(state) {
    document.getElementById("chart-loading").hidden = !state;
  }

  async function fetchMetric(symbol) {
  if (USE_MOCK_DATA) {
    return generateMockData(180, 100 + Math.random() * 40);
  }

  const res = await fetch(
    `/api/candle?symbol=${symbol}&range=${selectedRange}`
  );

  return res.json();
}



  /* =========================
     CHART UPDATE
  ========================= */

  async function updateChart() {
    if (!selectedStocks.length) {
      chart.data.labels = [];
      chart.data.datasets = [];
      chart.update();
      return;
    }

    setLoading(true);

    const results = await Promise.all(
      selectedStocks.map(async (symbol, i) => ({
        symbol,
        data: await fetchMetric(symbol)
      }))
    );

    if (!results[0]?.data?.labels?.length) {
      setLoading(false);
      return;
    }


    chart.data.labels = results[0].data.labels;
    chart.data.datasets = [];

    // Reset axes
    chart.options.scales.y.display = true;
    chart.options.scales.yRsi.display = false;

    if (selectedMetric === "rsi") {
      chart.options.scales.y.display = false;
      chart.options.scales.yRsi.display = true;

      results.forEach((r, i) => {
        chart.data.datasets.push({
          label: `${r.symbol} • RSI`,
          data: r.data.rsi,
          yAxisID: "yRsi",
          borderColor: COLORS[i % COLORS.length],
          borderWidth: 2,
          tension: 0.3
        });
      });

      chart.update();
      setLoading(false);
      return;
    }

    if (selectedMetric === "macd") {
    chart.options.scales.y.display = true;
    chart.options.scales.yRsi.display = false;

    results.forEach((r, i) => {
      chart.data.datasets.push(
        {
          label: `${r.symbol} • MACD`,
          data: r.data.macd,
          borderColor: COLORS[i % COLORS.length],
          borderWidth: 2,
          tension: 0.3
        },
        {
          label: `${r.symbol} • Signal`,
          data: r.data.signal,
          borderDash: [6, 4],
          borderWidth: 1.5,
          tension: 0.3
        }
      );
    });

  chart.update();
  setLoading(false);
  return;
}


  results.forEach((r, i) => {

  let data;

  switch (selectedMetric) {
    case "price":
      data = normalize
        ? normalizeSeries(r.data.price)
        : r.data.price;
      break;
    case "volume":
      data = r.data.volume;
      break;
    case "sma20":
      data = r.data.sma20;
      break;
    case "ema50":
      data = r.data.ema50;
      break;
    default:
      data = r.data.price;
  }

  chart.data.datasets.push({
    label: `${r.symbol} • ${METRICS[selectedMetric].label}`,
    data,
    borderColor: COLORS[i % COLORS.length],
    borderWidth: 2,
    tension: 0.3,
    fill: false
  });

});


    chart.update();
    setLoading(false);
  }

  /* =========================
     STOCK SEARCH
  ========================= */

  const stockInput = document.getElementById("stock-input");
  const tickerResults = document.getElementById("tickerResults");
  const selectedStocksContainer = document.getElementById("selected-stocks");

  stockInput.addEventListener("input", async e => {
    const q = e.target.value.trim();
    if (!q) {
      tickerResults.innerHTML = "";
      tickerResults.style.display = "none";
      return;
    }

    const res = await fetch(`/api/search?q=${q}`);
    const data = await res.json();

    tickerResults.innerHTML = "";
    
    if (!data.length) {
    tickerResults.style.display = "none";
    return;
  }

    data.forEach(s => {
    const li = document.createElement("li");
    li.textContent = `${s.symbol} — ${s.name}`;
    li.onclick = () => addStock(s.symbol);
    tickerResults.appendChild(li);
  });

  tickerResults.style.display = "block";  // ✅ SHOW DROPDOWN
});

document.addEventListener("click", e => {
  if (!stockInput.contains(e.target) && !tickerResults.contains(e.target)) {
    tickerResults.style.display = "none";
  }
});


  function addStock(symbol) {
    if (selectedStocks.includes(symbol)) return;
    selectedStocks.push(symbol);
    stockInput.value = "";
    tickerResults.innerHTML = "";
    renderStockPills();
    updateChart();
  }

  function renderStockPills() {
    selectedStocksContainer.innerHTML = "";
    selectedStocks.forEach(symbol => {
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.innerHTML = `${symbol} <span class="remove">×</span>`;
      pill.querySelector(".remove").onclick = () => {
        selectedStocks = selectedStocks.filter(s => s !== symbol);
        renderStockPills();
        updateChart();
      };
      selectedStocksContainer.appendChild(pill);
    });
  }

  /* =========================
     METRIC SELECTOR (PILLS)
  ========================= */

  const metricInput = document.getElementById("metric-input");
  const metricResults = document.getElementById("metricResults");
  const selectedMetricContainer = document.getElementById("selected-metric");

  function renderMetricPill() {
    selectedMetricContainer.innerHTML = "";

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.innerHTML = `
      ${METRICS[selectedMetric].label}
      <span class="remove">×</span>
    `;

    pill.querySelector(".remove").onclick = () => {
      selectedMetric = "price";
      renderMetricPill();
      normalizeToggle.disabled = false;
      normalizeToggle.checked = false;
      normalize = false;
      updateChart();
    };

    selectedMetricContainer.appendChild(pill);
  }

  metricInput.addEventListener("input", e => {
  const q = e.target.value.toLowerCase();
  metricResults.innerHTML = "";
  metricResults.style.display = "block";

  Object.entries(METRICS)
    .filter(([key, m]) =>
      m.label.toLowerCase().includes(q)
    )
    .forEach(([key, metric]) => {
      const li = document.createElement("li");
      li.textContent = metric.label;
      li.onclick = () => {
        selectedMetric = key;
        metricInput.value = "";
        metricResults.style.display = "none";
        renderMetricPill();
        updateChart();
      };
      metricResults.appendChild(li);
    });
});


  document.addEventListener("click", e => {
    if (!metricInput.contains(e.target) && !metricResults.contains(e.target)) {
      metricResults.style.display = "none";
    }
  });

  /* =========================
     NORMALIZE TOGGLE
  ========================= */

  normalizeToggle.addEventListener("change", e => {
    normalize = e.target.checked;
    updateChart();
  });

  /* =========================
     INIT
  ========================= */
  document.querySelectorAll(".range-selector button").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedRange = btn.dataset.range;

    document
      .querySelectorAll(".range-selector button")
      .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");
    updateChart();
  });
});

  renderMetricPill();
});
