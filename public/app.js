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
  const COLORS = ["#4F46E5", "#10B981", "#EF4444", "#F59E0B", "#8B5CF6", "#EC4899"];
  let selectedStocks = [];
  let selectedMetric = "price";
  let normalize = false;
  let selectedRange = "1y";

  /* =========================
     METRICS CONFIG
     isFundamental = true means fetched from /api/fundamentals
     isChart = false means displayed as a table, not a chart line
  ========================= */
  const METRICS = {
    price:        { label: "Price",           normalize: true,  isFundamental: false },
    rsi:          { label: "RSI (14)",         normalize: false, isFundamental: false },
    macd:         { label: "MACD",             normalize: false, isFundamental: false },
    volume:       { label: "Volume",           normalize: false, isFundamental: false },
    sma20:        { label: "SMA 20",           normalize: false, isFundamental: false },
    ema50:        { label: "EMA 50",           normalize: false, isFundamental: false },
    // Fundamental metrics — displayed as comparison table
    marketCap:    { label: "Market Cap",       normalize: false, isFundamental: true },
    peRatio:      { label: "P/E Ratio",        normalize: false, isFundamental: true },
    forwardPE:    { label: "Forward P/E",      normalize: false, isFundamental: true },
    dividendYield:{ label: "Dividend Yield",   normalize: false, isFundamental: true },
    week52High:   { label: "52W High",         normalize: false, isFundamental: true },
    week52Low:    { label: "52W Low",          normalize: false, isFundamental: true },
    revenue:      { label: "Revenue (TTM)",    normalize: false, isFundamental: true },
    netIncome:    { label: "Net Income",       normalize: false, isFundamental: true },
    profitMargin: { label: "Profit Margin",    normalize: false, isFundamental: true },
    revenueGrowth:{ label: "Revenue Growth",   normalize: false, isFundamental: true },
  };

  /* =========================
     HELPERS
  ========================= */
  function normalizeSeries(arr) {
    if (!normalize || !arr || !arr.length) return arr;
    const base = arr.find(v => v !== null && v !== undefined) || 1;
    return arr.map(v => v !== null ? (v / base) * 100 : null);
  }

  function setLoading(state) {
    const el = document.getElementById("chart-loading");
    if (el) el.hidden = !state;
  }

  async function fetchMetric(symbol) {
    const res = await fetch(`/api/candle?symbol=${symbol}&range=${selectedRange}`);
    if (!res.ok) throw new Error(`Failed to fetch ${symbol}`);
    return res.json();
  }

  async function fetchFundamentals(symbol) {
    const res = await fetch(`/api/fundamentals?symbol=${symbol}`);
    if (!res.ok) throw new Error(`Failed to fetch fundamentals for ${symbol}`);
    return res.json();
  }

  /* =========================
     FUNDAMENTALS TABLE
  ========================= */
  function renderFundamentalsTable(results, metricKey) {
    const chartArea = document.getElementById("chart-area");

    // Hide canvas, show table
    canvas.style.display = "none";

    // Remove old table if exists
    const old = document.getElementById("fundamentalsTable");
    if (old) old.remove();

    const wrapper = document.createElement("div");
    wrapper.id = "fundamentalsTable";
    wrapper.style.cssText = "overflow-x:auto; width:100%;";

    if (!results.length) {
      wrapper.innerHTML = `<p style="color:var(--muted);text-align:center;padding:40px 0;">No data available</p>`;
      chartArea.appendChild(wrapper);
      return;
    }

    const metricLabel = METRICS[metricKey]?.label || metricKey;

    // Build table
    let html = `
      <div style="margin-bottom:12px;">
        <span style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);">
          Comparing: ${metricLabel}
        </span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
        <thead>
          <tr style="border-bottom:2px solid var(--border);">
            <th style="text-align:left;padding:10px 12px;color:var(--muted);font-weight:600;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;">Metric</th>
    `;

    results.forEach(r => {
      html += `<th style="text-align:right;padding:10px 12px;color:var(--muted);font-weight:600;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;">${r.symbol}</th>`;
    });

    html += `</tr></thead><tbody>`;

    // All fundamental metric keys to show in table
    const fundamentalKeys = [
      "currentPrice", "marketCap", "peRatio", "forwardPE",
      "dividendYield", "week52High", "week52Low",
      "revenue", "netIncome", "profitMargin", "revenueGrowth"
    ];

    fundamentalKeys.forEach((key, idx) => {
      const rowBg = idx % 2 === 0 ? "background:var(--bg);" : "";
      html += `<tr style="${rowBg}border-bottom:1px solid var(--border);">`;

      // Get label from first result
      const label = results[0]?.data?.metrics?.[key]?.label || key;
      html += `<td style="padding:10px 12px;font-weight:500;">${label}</td>`;

      results.forEach(r => {
        const metric = r.data?.metrics?.[key];
        const formatted = metric?.formatted ?? "N/A";
        const raw = metric?.raw;

        // Color profit/growth metrics
        let color = "";
        if (key === "profitMargin" || key === "revenueGrowth" || key === "netIncome") {
          if (raw !== null && raw !== undefined) {
            color = raw >= 0 ? "color:var(--positive);" : "color:var(--negative);";
          }
        }

        // Highlight selected metric
        const isSelected = key === metricKey;
        const highlight = isSelected ? "font-weight:700;" : "";

        html += `<td style="text-align:right;padding:10px 12px;${color}${highlight}">${formatted}</td>`;
      });

      html += `</tr>`;
    });

    html += `</tbody></table>`;
    wrapper.innerHTML = html;
    chartArea.appendChild(wrapper);
  }

  /* =========================
     CHART UPDATE
  ========================= */
  async function updateChart() {
    // Remove fundamentals table if switching back to chart metric
    const oldTable = document.getElementById("fundamentalsTable");
    if (oldTable) oldTable.remove();
    canvas.style.display = "block";

    if (!selectedStocks.length) {
      chart.data.labels = [];
      chart.data.datasets = [];
      chart.update();
      return;
    }

    setLoading(true);

    try {
      // Check if this is a fundamental metric
      if (METRICS[selectedMetric]?.isFundamental) {
        // Fetch fundamentals for all stocks
        const results = await Promise.all(
          selectedStocks.map(async symbol => ({
            symbol,
            data: await fetchFundamentals(symbol).catch(() => null)
          }))
        );

        canvas.style.display = "none";
        renderFundamentalsTable(results, selectedMetric);
        setLoading(false);
        return;
      }

      // Chart-based metrics
      const results = await Promise.all(
        selectedStocks.map(async symbol => ({
          symbol,
          data: await fetchMetric(symbol).catch(() => null)
        }))
      );

      const validResults = results.filter(r => r.data?.labels?.length);
      if (!validResults.length) { setLoading(false); return; }

      chart.data.labels = validResults[0].data.labels;
      chart.data.datasets = [];

      // Reset axes
      chart.options.scales.y.display = true;
      chart.options.scales.yRsi.display = false;

      if (selectedMetric === "rsi") {
        chart.options.scales.y.display = false;
        chart.options.scales.yRsi.display = true;
        validResults.forEach((r, i) => {
          chart.data.datasets.push({
            label: `${r.symbol} • RSI`,
            data: r.data.rsi,
            yAxisID: "yRsi",
            borderColor: COLORS[i % COLORS.length],
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 0
          });
        });
        chart.update();
        setLoading(false);
        return;
      }

      if (selectedMetric === "macd") {
        validResults.forEach((r, i) => {
          chart.data.datasets.push(
            {
              label: `${r.symbol} • MACD`,
              data: r.data.macd,
              borderColor: COLORS[i % COLORS.length],
              borderWidth: 2,
              tension: 0.3,
              pointRadius: 0
            },
            {
              label: `${r.symbol} • Signal`,
              data: r.data.signal,
              borderColor: COLORS[i % COLORS.length],
              borderDash: [6, 4],
              borderWidth: 1.5,
              tension: 0.3,
              pointRadius: 0,
              opacity: 0.6
            }
          );
        });
        chart.update();
        setLoading(false);
        return;
      }

      // All other chart metrics
      validResults.forEach((r, i) => {
        let data;
        switch (selectedMetric) {
          case "price":   data = normalizeSeries(r.data.price); break;
          case "volume":  data = r.data.volume; break;
          case "sma20":   data = r.data.sma20; break;
          case "ema50":   data = r.data.ema50; break;
          default:        data = r.data.price;
        }

        chart.data.datasets.push({
          label: `${r.symbol} • ${METRICS[selectedMetric].label}`,
          data,
          borderColor: COLORS[i % COLORS.length],
          backgroundColor: i === 0 ? `${COLORS[0]}10` : "transparent",
          borderWidth: 2,
          tension: 0.3,
          fill: i === 0,
          pointRadius: 0,
          pointHoverRadius: 4
        });
      });

      chart.update();
    } catch (err) {
      console.error("Chart update error:", err);
    } finally {
      setLoading(false);
    }
  }

  /* =========================
     STOCK SEARCH
  ========================= */
  const stockInput = document.getElementById("stock-input");
  const tickerResults = document.getElementById("tickerResults");
  const selectedStocksContainer = document.getElementById("selected-stocks");

  let searchDebounce;

  stockInput.addEventListener("input", async e => {
    clearTimeout(searchDebounce);
    const q = e.target.value.trim();
    if (!q) {
      tickerResults.innerHTML = "";
      tickerResults.style.display = "none";
      return;
    }

    searchDebounce = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${q}`);
        const data = await res.json();
        tickerResults.innerHTML = "";

        if (!data.length) {
          tickerResults.style.display = "none";
          return;
        }

        data.forEach(s => {
          const li = document.createElement("li");
          li.innerHTML = `<strong>${s.symbol}</strong> — ${s.name}`;
          li.onclick = () => addStock(s.symbol);
          tickerResults.appendChild(li);
        });
        tickerResults.style.display = "block";
      } catch (err) {
        console.error("Search error:", err);
      }
    }, 300);
  });

  document.addEventListener("click", e => {
    if (!stockInput.contains(e.target) && !tickerResults.contains(e.target)) {
      tickerResults.style.display = "none";
    }
  });

  function addStock(symbol) {
    if (selectedStocks.includes(symbol)) return;
    if (selectedStocks.length >= 6) {
      alert("Maximum 6 stocks for comparison.");
      return;
    }
    selectedStocks.push(symbol);
    stockInput.value = "";
    tickerResults.innerHTML = "";
    tickerResults.style.display = "none";
    renderStockPills();
    updateChart();
  }

  function renderStockPills() {
    selectedStocksContainer.innerHTML = "";
    selectedStocks.forEach((symbol, i) => {
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.style.borderLeft = `3px solid ${COLORS[i % COLORS.length]}`;
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
     METRIC SELECTOR
  ========================= */
  const metricInput = document.getElementById("metric-input");
  const metricResults = document.getElementById("metricResults");
  const selectedMetricContainer = document.getElementById("selected-metric");

  function renderMetricPill() {
    selectedMetricContainer.innerHTML = "";
    const pill = document.createElement("div");
    pill.className = "pill";
    const isFundamental = METRICS[selectedMetric]?.isFundamental;
    pill.innerHTML = `
      ${METRICS[selectedMetric].label}
      ${isFundamental ? '<span style="font-size:0.7rem;opacity:0.7;margin-left:2px">TABLE</span>' : ""}
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

    // Group: chart metrics first, then fundamentals
    const chartMetrics = Object.entries(METRICS).filter(([, m]) => !m.isFundamental);
    const fundMetrics = Object.entries(METRICS).filter(([, m]) => m.isFundamental);

    const addGroup = (label, entries) => {
      const filtered = entries.filter(([, m]) => m.label.toLowerCase().includes(q));
      if (!filtered.length) return;

      const header = document.createElement("li");
      header.textContent = label;
      header.style.cssText = "font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);padding:8px 14px 4px;cursor:default;pointer-events:none;";
      metricResults.appendChild(header);

      filtered.forEach(([key, metric]) => {
        const li = document.createElement("li");
        li.textContent = metric.label;
        li.onclick = () => {
          selectedMetric = key;
          metricInput.value = "";
          metricResults.style.display = "none";
          renderMetricPill();
          // Disable normalize for fundamental metrics
          if (metric.isFundamental) {
            normalizeToggle.disabled = true;
            normalizeToggle.checked = false;
            normalize = false;
          } else {
            normalizeToggle.disabled = false;
          }
          updateChart();
        };
        metricResults.appendChild(li);
      });
    };

    addGroup("Chart Metrics", chartMetrics);
    addGroup("Fundamentals", fundMetrics);

    if (!metricResults.children.length) {
      metricResults.style.display = "none";
    }
  });

  // Show all metrics on focus
  metricInput.addEventListener("focus", () => {
    metricInput.dispatchEvent(new Event("input"));
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
     RANGE SELECTOR
  ========================= */
  document.querySelectorAll(".range-selector button").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedRange = btn.dataset.range;
      document.querySelectorAll(".range-selector button")
        .forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      updateChart();
    });
  });

  /* =========================
     INIT
  ========================= */
  renderMetricPill();
});