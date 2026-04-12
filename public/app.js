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
     selectedItems is now an array of objects:
       { type: "stock", symbol: "AAPL" }
       { type: "fund",  name: "My Tech Fund", stocks: [...], id: "..." }
  ========================= */
  const COLORS = ["#4F46E5", "#10B981", "#EF4444", "#F59E0B", "#8B5CF6", "#EC4899"];
  let selectedItems  = [];  // replaces old selectedStocks
  let selectedMetric = "price";
  let normalize      = false;
  let selectedRange  = "1y";

  /* =========================
     METRICS CONFIG
  ========================= */
  const METRICS = {
    price:        { label: "Price",          normalize: true,  isFundamental: false },
    rsi:          { label: "RSI (14)",        normalize: false, isFundamental: false },
    macd:         { label: "MACD",            normalize: false, isFundamental: false },
    volume:       { label: "Volume",          normalize: false, isFundamental: false },
    sma20:        { label: "SMA 20",          normalize: false, isFundamental: false },
    ema50:        { label: "EMA 50",          normalize: false, isFundamental: false },
    marketCap:    { label: "Market Cap",      normalize: false, isFundamental: true  },
    peRatio:      { label: "P/E Ratio",       normalize: false, isFundamental: true  },
    forwardPE:    { label: "Forward P/E",     normalize: false, isFundamental: true  },
    dividendYield:{ label: "Dividend Yield",  normalize: false, isFundamental: true  },
    week52High:   { label: "52W High",        normalize: false, isFundamental: true  },
    week52Low:    { label: "52W Low",         normalize: false, isFundamental: true  },
    revenue:      { label: "Revenue (TTM)",   normalize: false, isFundamental: true  },
    netIncome:    { label: "Net Income",      normalize: false, isFundamental: true  },
    profitMargin: { label: "Profit Margin",   normalize: false, isFundamental: true  },
    revenueGrowth:{ label: "Revenue Growth",  normalize: false, isFundamental: true  },
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

  function hasFunds() {
    return selectedItems.some(i => i.type === "fund");
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

  // Fetch a saved fund's performance as a normalized series
  async function fetchFundPerformance(fundItem) {
    const symbols = fundItem.stocks.map(s => s.symbol).join(",");
    const weights = fundItem.stocks.map(s => s.weight).join(",");
    const res = await fetch(
      `/api/fund?symbols=${symbols}&weights=${weights}&range=${selectedRange}`
    );
    if (!res.ok) throw new Error(`Failed to fetch fund: ${fundItem.name}`);
    return res.json();
  }

  /* =========================
     FUNDAMENTALS TABLE
  ========================= */
  function renderFundamentalsTable(results, metricKey) {
    const chartArea = document.getElementById("chart-area");
    canvas.style.display = "none";

    const old = document.getElementById("fundamentalsTable");
    if (old) old.remove();

    const wrapper = document.createElement("div");
    wrapper.id = "fundamentalsTable";
    wrapper.style.cssText = "overflow-x:auto; width:100%;";

    // Filter out funds — can't show fundamentals for a fund
    const stockResults = results.filter(r => r.type === "stock");

    if (!stockResults.length) {
      wrapper.innerHTML = `<p style="color:var(--muted);text-align:center;padding:40px 0;">
        Fundamental metrics are only available for individual stocks, not funds.
      </p>`;
      chartArea.appendChild(wrapper);
      return;
    }

    const metricLabel = METRICS[metricKey]?.label || metricKey;
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

    stockResults.forEach(r => {
      html += `<th style="text-align:right;padding:10px 12px;color:var(--muted);font-weight:600;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;">${r.symbol}</th>`;
    });

    html += `</tr></thead><tbody>`;

    const fundamentalKeys = [
      "currentPrice", "marketCap", "peRatio", "forwardPE",
      "dividendYield", "week52High", "week52Low",
      "revenue", "netIncome", "profitMargin", "revenueGrowth"
    ];

    fundamentalKeys.forEach((key, idx) => {
      const rowBg = idx % 2 === 0 ? "background:var(--bg);" : "";
      html += `<tr style="${rowBg}border-bottom:1px solid var(--border);">`;
      const label = stockResults[0]?.data?.metrics?.[key]?.label || key;
      html += `<td style="padding:10px 12px;font-weight:500;">${label}</td>`;

      stockResults.forEach(r => {
        const metric = r.data?.metrics?.[key];
        const formatted = metric?.formatted ?? "N/A";
        const raw = metric?.raw;
        let color = "";
        if (["profitMargin", "revenueGrowth", "netIncome"].includes(key)) {
          if (raw !== null && raw !== undefined) {
            color = raw >= 0 ? "color:var(--positive);" : "color:var(--negative);";
          }
        }
        const highlight = key === metricKey ? "font-weight:700;" : "";
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
    const oldTable = document.getElementById("fundamentalsTable");
    if (oldTable) oldTable.remove();
    canvas.style.display = "block";

    if (!selectedItems.length) {
      chart.data.labels = [];
      chart.data.datasets = [];
      chart.update();
      return;
    }

    setLoading(true);

    try {
      // Fundamentals — only for stocks, not funds
      if (METRICS[selectedMetric]?.isFundamental) {
        const results = await Promise.all(
          selectedItems.map(async item => {
            if (item.type === "fund") {
              return { type: "fund", symbol: item.name, data: null };
            }
            return {
              type: "stock",
              symbol: item.symbol,
              data: await fetchFundamentals(item.symbol).catch(() => null)
            };
          })
        );
        canvas.style.display = "none";
        renderFundamentalsTable(results, selectedMetric);
        setLoading(false);
        return;
      }

      // Fetch data for all items (stocks + funds)
      const results = await Promise.all(
        selectedItems.map(async (item, i) => {
          if (item.type === "fund") {
            const fundData = await fetchFundPerformance(item).catch(() => null);
            return {
              type: "fund",
              label: `📁 ${item.name}`,
              labels: fundData?.labels || [],
              // fund portfolio is already normalized to 100
              data: fundData?.portfolio || [],
              color: COLORS[i % COLORS.length],
              isFund: true
            };
          } else {
            const stockData = await fetchMetric(item.symbol).catch(() => null);
            return {
              type: "stock",
              label: item.symbol,
              labels: stockData?.labels || [],
              rawData: stockData,
              color: COLORS[i % COLORS.length],
              isFund: false
            };
          }
        })
      );

      const validResults = results.filter(r => r.labels?.length);
      if (!validResults.length) { setLoading(false); return; }

      // Use longest label set
      const longestResult = validResults.reduce((a, b) =>
        a.labels.length > b.labels.length ? a : b
      );
      chart.data.labels = longestResult.labels;
      chart.data.datasets = [];

      chart.options.scales.y.display = true;
      chart.options.scales.yRsi.display = false;

      // RSI and MACD disabled when funds are present
      if (selectedMetric === "rsi" && !hasFunds()) {
        chart.options.scales.y.display = false;
        chart.options.scales.yRsi.display = true;
        validResults.forEach(r => {
          if (r.isFund) return;
          chart.data.datasets.push({
            label: `${r.label} • RSI`,
            data: r.rawData.rsi,
            yAxisID: "yRsi",
            borderColor: r.color,
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 0
          });
        });
        chart.update();
        setLoading(false);
        return;
      }

      if (selectedMetric === "macd" && !hasFunds()) {
        validResults.forEach(r => {
          if (r.isFund) return;
          chart.data.datasets.push(
            {
              label: `${r.label} • MACD`,
              data: r.rawData.macd,
              borderColor: r.color,
              borderWidth: 2,
              tension: 0.3,
              pointRadius: 0
            },
            {
              label: `${r.label} • Signal`,
              data: r.rawData.signal,
              borderColor: r.color,
              borderDash: [6, 4],
              borderWidth: 1.5,
              tension: 0.3,
              pointRadius: 0
            }
          );
        });
        chart.update();
        setLoading(false);
        return;
      }

      // Price / SMA / EMA / Volume — and fund performance lines
      validResults.forEach((r, i) => {
        let data;

        if (r.isFund) {
          // Fund is already a normalized 100-base series
          data = r.data;
        } else {
          switch (selectedMetric) {
            case "price":  data = normalizeSeries(r.rawData.price); break;
            case "volume": data = r.rawData.volume; break;
            case "sma20":  data = r.rawData.sma20; break;
            case "ema50":  data = r.rawData.ema50; break;
            // Fall back to normalized price for unsupported metrics when funds present
            default: data = normalizeSeries(r.rawData.price);
          }
        }

        chart.data.datasets.push({
          label: r.isFund
            ? r.label
            : `${r.label} • ${METRICS[selectedMetric]?.label || "Price"}`,
          data,
          borderColor: r.color,
          backgroundColor: i === 0 ? `${r.color}10` : "transparent",
          borderWidth: r.isFund ? 2.5 : 2,
          borderDash: r.isFund ? [8, 4] : [],  // funds appear as dashed lines
          tension: 0.3,
          fill: i === 0 && !r.isFund,
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
     PILLS RENDERING
     Handles both stocks and funds
  ========================= */
  const selectedStocksContainer = document.getElementById("selected-stocks");

  function renderPills() {
    selectedStocksContainer.innerHTML = "";
    selectedItems.forEach((item, i) => {
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.style.borderLeft = `3px solid ${COLORS[i % COLORS.length]}`;

      if (item.type === "fund") {
        pill.style.background = "#1e1b4b"; // darker purple for funds
        pill.innerHTML = `
          <span style="font-size:0.7rem;opacity:0.7;margin-right:4px;">FUND</span>
          ${item.name}
          <span class="remove">×</span>
        `;
      } else {
        pill.innerHTML = `${item.symbol} <span class="remove">×</span>`;
      }

      pill.querySelector(".remove").onclick = () => {
        selectedItems = selectedItems.filter((_, idx) => idx !== i);
        renderPills();
        updateFundButton();
        updateChart();
      };

      selectedStocksContainer.appendChild(pill);
    });
  }

  /* =========================
     STOCK SEARCH
  ========================= */
  const stockInput    = document.getElementById("stock-input");
  const tickerResults = document.getElementById("tickerResults");
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
        const res  = await fetch(`/api/search?q=${q}`);
        const data = await res.json();
        tickerResults.innerHTML = "";

        if (!data.length) {
          tickerResults.style.display = "none";
          return;
        }

        data.forEach(s => {
          const li = document.createElement("li");
          li.innerHTML = `<strong>${s.symbol}</strong> — ${s.name}`;
          li.onclick   = () => addStock(s.symbol);
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
    if (selectedItems.some(i => i.type === "stock" && i.symbol === symbol)) return;
    if (selectedItems.length >= 6) {
      alert("Maximum 6 items for comparison.");
      return;
    }
    selectedItems.push({ type: "stock", symbol });
    stockInput.value = "";
    tickerResults.innerHTML = "";
    tickerResults.style.display = "none";
    renderPills();
    updateFundButton();
    updateChart();
  }

  /* =========================
     FUND PICKER
  ========================= */
  const addFundBtn     = document.getElementById("addFundBtn");
  const fundDropdown   = document.getElementById("fundDropdown");

  function getSavedFunds() {
    try {
      return JSON.parse(sessionStorage.getItem("viresce_funds") || "[]");
    } catch { return []; }
  }

  function updateFundButton() {
    const funds = getSavedFunds();
    if (addFundBtn) {
      addFundBtn.disabled = funds.length === 0;
      addFundBtn.title    = funds.length === 0
        ? "No saved funds — build one on the My Fund page first"
        : "Add a saved fund to comparison";
    }
  }

  function renderFundDropdown() {
    const funds = getSavedFunds();
    if (!fundDropdown) return;

    fundDropdown.innerHTML = "";

    if (!funds.length) {
      const li = document.createElement("li");
      li.textContent = "No saved funds yet";
      li.style.cssText = "color:var(--muted);pointer-events:none;font-style:italic;";
      fundDropdown.appendChild(li);
      return;
    }

    funds.forEach(fund => {
      const alreadyAdded = selectedItems.some(
        i => i.type === "fund" && i.id === fund._id
      );

      const li = document.createElement("li");
      li.style.cssText = alreadyAdded ? "opacity:0.4;pointer-events:none;" : "";

      const stockTags = fund.stocks
        .map(s => `${s.symbol} ${Math.round(s.weight * 100)}%`)
        .join(" · ");

      li.innerHTML = `
        <strong>${fund.name}</strong>
        <span style="display:block;font-size:0.75rem;color:var(--muted);margin-top:2px;">${stockTags}</span>
        ${alreadyAdded ? '<span style="font-size:0.7rem;color:var(--muted);">Already added</span>' : ""}
      `;

      li.onclick = () => {
        if (alreadyAdded) return;
        addFund(fund);
        fundDropdown.style.display = "none";
      };

      fundDropdown.appendChild(li);
    });
  }

  function addFund(fund) {
    if (selectedItems.length >= 6) {
      alert("Maximum 6 items for comparison.");
      return;
    }
    selectedItems.push({
      type:   "fund",
      id:     fund._id,
      name:   fund.name,
      stocks: fund.stocks  // [{ symbol, weight }]
    });
    renderPills();
    updateFundButton();
    updateChart();
  }

  if (addFundBtn) {
    addFundBtn.addEventListener("click", e => {
      e.stopPropagation();
      renderFundDropdown();
      const isVisible = fundDropdown.style.display === "block";
      fundDropdown.style.display = isVisible ? "none" : "block";
    });
  }

  document.addEventListener("click", e => {
    if (fundDropdown &&
        !addFundBtn?.contains(e.target) &&
        !fundDropdown.contains(e.target)) {
      fundDropdown.style.display = "none";
    }
  });

  /* =========================
     METRIC SELECTOR
  ========================= */
  const metricInput            = document.getElementById("metric-input");
  const metricResults          = document.getElementById("metricResults");
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
      normalizeToggle.checked  = false;
      normalize = false;
      updateChart();
    };
    selectedMetricContainer.appendChild(pill);
  }

  metricInput.addEventListener("input", e => {
    const q = e.target.value.toLowerCase();
    metricResults.innerHTML = "";
    metricResults.style.display = "block";

    const chartMetrics = Object.entries(METRICS).filter(([, m]) => !m.isFundamental);
    const fundMetrics  = Object.entries(METRICS).filter(([, m]) => m.isFundamental);

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

        // Disable fundamentals when a fund is selected
        if (metric.isFundamental && hasFunds()) {
          li.style.cssText = "opacity:0.4;pointer-events:none;";
          li.title = "Fundamental metrics not available when comparing funds";
        }

        li.onclick = () => {
          selectedMetric = key;
          metricInput.value = "";
          metricResults.style.display = "none";
          renderMetricPill();
          if (metric.isFundamental) {
            normalizeToggle.disabled = true;
            normalizeToggle.checked  = false;
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

    if (!metricResults.children.length) metricResults.style.display = "none";
  });

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
  updateFundButton();
});