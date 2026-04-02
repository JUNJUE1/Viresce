let stocks = [];
let selectedRange = "1y";

function addStock() {
  const symbol = document.getElementById("symbolInput").value.toUpperCase().trim();
  const weight = parseFloat(document.getElementById("weightInput").value);

  if (!symbol) {
    showFundAlert("Please enter a stock symbol.", "error");
    return;
  }

  if (stocks.some(s => s.symbol === symbol)) {
    showFundAlert("Stock already added.", "error");
    return;
  }

  if (isNaN(weight) || weight <= 0 || weight > 100) {
    showFundAlert("Please enter a valid weight between 1 and 100.", "error");
    return;
  }

  const totalWeight = stocks.reduce((sum, s) => sum + s.weight, 0) + weight;
  if (totalWeight > 100.5) {
    showFundAlert("Total allocation cannot exceed 100%", "error");
    return;
  }

  stocks.push({ symbol, weight });
  renderFundList();

  document.getElementById("symbolInput").value = "";
  document.getElementById("weightInput").value = "";
}

function renderFundList() {
  const container = document.getElementById("fundList");
  container.innerHTML = "";

  stocks.forEach((stock, index) => {
    const div = document.createElement("div");
    div.className = "pill";
    div.style.justifyContent = "space-between";
    div.innerHTML = `
      <span>${stock.symbol}</span>
      <span style="opacity:0.7">${stock.weight.toFixed(0)}%</span>
      <span class="remove" data-index="${index}">×</span>
    `;
    div.querySelector(".remove").addEventListener("click", () => {
      stocks.splice(index, 1);
      renderFundList();
    });
    container.appendChild(div);
  });

  const total = stocks.reduce((sum, s) => sum + s.weight, 0);
  const summary = document.getElementById("allocationSummary");
  const remaining = 100 - total;
  summary.innerHTML = `
    <span style="font-weight:600">${total.toFixed(0)}%</span> allocated
    ${remaining > 0 ? `<span style="color:var(--muted)"> · ${remaining.toFixed(0)}% remaining</span>` : ""}
    ${total > 100 ? `<span style="color:var(--negative)"> · Over budget!</span>` : ""}
  `;
}

function showFundAlert(message, type = "info") {
  let box = document.getElementById("fundAlert");
  if (!box) {
    box = document.createElement("div");
    box.id = "fundAlert";
    box.style.cssText = `
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 0.85rem;
      margin-bottom: 12px;
    `;
    const controls = document.querySelector(".controls");
    controls.insertBefore(box, controls.firstChild);
  }

  if (type === "error") {
    box.style.background = "#fef2f2";
    box.style.border = "1px solid #fecaca";
    box.style.color = "#dc2626";
  } else if (type === "warning") {
    box.style.background = "#fffbeb";
    box.style.border = "1px solid #fde68a";
    box.style.color = "#92400e";
  } else {
    box.style.background = "#f0fdf4";
    box.style.border = "1px solid #bbf7d0";
    box.style.color = "#16a34a";
  }

  box.textContent = message;
  box.style.display = "block";

  // Auto-hide after 6 seconds
  clearTimeout(box._hideTimer);
  box._hideTimer = setTimeout(() => {
    box.style.display = "none";
  }, 6000);
}

async function generateFund() {
  if (stocks.length === 0) {
    showFundAlert("Please add at least one stock.", "error");
    return;
  }

  const symbols = stocks.map(s => s.symbol).join(",");
  // Convert % to decimal for server
  const weights = stocks.map(s => (s.weight / 100)).join(",");
  const startDate = document.getElementById("startDateInput").value;

  // Show loading
  const loadingEl = document.getElementById("fund-loading");
  if (loadingEl) loadingEl.hidden = false;

  try {
    const res = await fetch(
      `/api/fund?symbols=${symbols}&weights=${weights}&range=${selectedRange}&startDate=${startDate}`
    );

    if (!res.ok) {
      const err = await res.json();
      showFundAlert(err.error || "Fund generation failed", "error");
      return;
    }

    const data = await res.json();

    // Show IPO warning if date was clamped
    if (data.ipoWarning) {
      showFundAlert(`⚠️ ${data.ipoWarning.message}`, "warning");
      // Update the date input to reflect the clamped date
      document.getElementById("startDateInput").value = data.ipoWarning.clampedDate;
    }

    // Render chart
    const ctx = document.getElementById("fundChart").getContext("2d");
    if (window.fundChartInstance) window.fundChartInstance.destroy();

    window.fundChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: data.labels,
        datasets: [
          {
            label: "My Fund",
            data: data.portfolio,
            borderColor: "#4F46E5",
            backgroundColor: "rgba(79,70,229,0.05)",
            fill: true,
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 4
          },
          {
            label: "S&P 500",
            data: data.sp500,
            borderColor: "#22c55e",
            borderWidth: 1.5,
            fill: false,
            tension: 0.3,
            borderDash: [5, 4],
            pointRadius: 0,
            pointHoverRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top" },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}`
            }
          }
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 8,
              maxRotation: 0
            }
          },
          y: {
            ticks: {
              callback: v => v.toFixed(0)
            }
          }
        }
      }
    });

    // Save last generated fund to sessionStorage for myfunds.html
    sessionStorage.setItem("viresce_last_fund", JSON.stringify({
      stocks: stocks.map(s => ({ symbol: s.symbol, weight: s.weight / 100 })),
      metrics: data.metrics
    }));

    // Render metrics
    const m = data.metrics;
    const totalReturnNum = parseFloat(m.totalReturn);
    const returnColor = totalReturnNum >= 0 ? "var(--positive)" : "var(--negative)";
    const returnSign = totalReturnNum >= 0 ? "+" : "";

    document.getElementById("fundMetrics").innerHTML = `
      <div class="card">
        <h4>Total Return</h4>
        <p style="color:${returnColor}">${returnSign}${m.totalReturn}%</p>
      </div>
      <div class="card">
        <h4>Volatility</h4>
        <p>${m.volatility}%</p>
      </div>
      <div class="card">
        <h4>Sharpe Ratio</h4>
        <p>${m.sharpe}</p>
      </div>
      <div class="card">
        <h4>Max Drawdown</h4>
        <p style="color:var(--negative)">-${m.maxDrawdown}%</p>
      </div>
    `;

  } catch (err) {
    console.error("Fund error:", err);
    showFundAlert("Network error. Please try again.", "error");
  } finally {
    if (loadingEl) loadingEl.hidden = true;
  }
}

document.addEventListener("DOMContentLoaded", () => {

  // Range selector
  document.querySelectorAll(".range-selector button").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedRange = btn.dataset.range;
      document.querySelectorAll(".range-selector button")
        .forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Ticker search
  const symbolInput = document.getElementById("symbolInput");
  const tickerResults = document.getElementById("tickerResult");

  let debounceTimer;
  let activeIndex = -1;

  function clearResults() {
    tickerResults.innerHTML = "";
    tickerResults.style.display = "none";
    activeIndex = -1;
  }

  symbolInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const query = symbolInput.value.trim();
      if (!query) { clearResults(); return; }

      tickerResults.innerHTML = "<li style='color:var(--muted);padding:10px 14px;'>Searching...</li>";
      tickerResults.style.display = "block";

      try {
        const res = await fetch(`/api/search?q=${query}`);
        const data = await res.json();
        clearResults();

        if (!data.length) {
          tickerResults.innerHTML = "<li style='color:var(--muted);padding:10px 14px;'>No results</li>";
          tickerResults.style.display = "block";
          return;
        }

        data.forEach(stock => {
          const li = document.createElement("li");
          li.innerHTML = `<span class="ticker-symbol">${stock.symbol}</span> — ${stock.name}`;
          li.addEventListener("click", () => {
            symbolInput.value = stock.symbol;
            clearResults();
          });
          tickerResults.appendChild(li);
        });
        tickerResults.style.display = "block";

      } catch (err) {
        console.error("Search error:", err);
        clearResults();
      }
    }, 300);
  });

  // Keyboard navigation
  symbolInput.addEventListener("keydown", e => {
    const items = tickerResults.querySelectorAll("li");
    if (!items.length) return;
    if (e.key === "ArrowDown") activeIndex = (activeIndex + 1) % items.length;
    if (e.key === "ArrowUp") activeIndex = (activeIndex - 1 + items.length) % items.length;
    if (e.key === "Enter" && activeIndex >= 0) items[activeIndex].click();
    items.forEach(i => i.classList.remove("active"));
    if (activeIndex >= 0) items[activeIndex].classList.add("active");
  });

  // Close on outside click
  document.addEventListener("click", e => {
    if (!e.target.closest(".ticker-search")) clearResults();
  });

  // Set max date to today on date input
  const dateInput = document.getElementById("startDateInput");
  if (dateInput) {
    dateInput.max = new Date().toISOString().split("T")[0];
  }

  // Load a saved fund if redirected from myfunds.html
  const loadFundData = sessionStorage.getItem("viresce_load_fund");
  if (loadFundData) {
    try {
      const fund = JSON.parse(loadFundData);
      sessionStorage.removeItem("viresce_load_fund");
      if (fund.stocks?.length) {
        stocks = fund.stocks.map(s => ({
          symbol: s.symbol,
          weight: Math.round(s.weight * 100)
        }));
        renderFundList();
        showFundAlert(`Loaded "${fund.name}" — click Generate Fund to run it.`, "info");
      }
    } catch (e) {
      console.error("Failed to load fund:", e);
    }
  }
});