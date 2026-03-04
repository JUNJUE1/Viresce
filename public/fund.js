let stocks = [];
let selectedRange = "1y";

function addStock() {
  const symbol = document.getElementById("symbolInput").value.toUpperCase();
  const weight = parseFloat(document.getElementById("weightInput").value) / 100;

    if (stocks.some(s => s.symbol === symbol)) {
    alert("Stock already added.");
    return;
    }

    const totalWeight =
    stocks.reduce((sum, s) => sum + s.weight, 0) + weight;

if (totalWeight > 1.01) {
  alert("Total allocation cannot exceed 100%");
  return;
}

  if (!symbol || isNaN(weight) || weight <= 0) return;

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
    div.innerHTML = `
      ${stock.symbol} - ${(stock.weight * 100).toFixed(0)}%
      <span class="remove" data-index="${index}">×</span>
    `;

    div.querySelector(".remove").addEventListener("click", () => {
      stocks.splice(index, 1);
      renderFundList();
    });

    container.appendChild(div);
  });

  const total = stocks.reduce((sum, s) => sum + s.weight, 0);

    document.getElementById("allocationSummary").innerHTML =
    `<strong>Total Allocation:</strong> ${(total * 100).toFixed(0)}%`;

}

async function generateFund() {
  const symbols = stocks.map(s => s.symbol).join(",");
  const weights = stocks.map(s => s.weight).join(",");
  const startDate = document.getElementById("startDateInput").value;

  if (stocks.length === 0) {
    alert("Please add at least one stock.");
    return;
  }

  const res = await fetch(
  `/api/fund?symbols=${symbols}&weights=${weights}&range=${selectedRange}&startDate=${startDate}`);
  if (!res.ok) {
    alert("Fund generation failed");
    return;
  }
  const data = await res.json();

  const ctx = document.getElementById("fundChart").getContext("2d");

  if (window.fundChartInstance) {
    window.fundChartInstance.destroy();
  }

  window.fundChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: "My Fund",
          data: data.portfolio,
          borderColor: "#4F46E5",
          fill: false
        },
        {
          label: "S&P 500",
          data: data.sp500,
          borderColor: "#22c55e",
          fill: false
        }
      ]
    }
  });

  document.getElementById("fundMetrics").innerHTML = `
    <div class="card">
      <h4>Total Return</h4>
      <p>${data.metrics.totalReturn}%</p>
    </div>
    <div class="card">
      <h4>Volatility</h4>
      <p>${data.metrics.volatility}%</p>
    </div>
    <div class="card">
      <h4>Sharpe Ratio</h4>
      <p>${data.metrics.sharpe}</p>
    </div>
  `;
}


document.addEventListener("DOMContentLoaded", () => {

  const symbolInput = document.getElementById("symbolInput");
  const tickerResults = document.getElementById("tickerResult");

  let debounceTimer;
  let activeIndex = -1;

  function clearResults() {
    tickerResults.innerHTML = "";
    activeIndex = -1;
  }

  symbolInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(async () => {
      const query = symbolInput.value.trim();

      if (!query) {
        clearResults();
        return;
      }

      tickerResults.innerHTML = "<li>Loading...</li>";

      try {
        const res = await fetch(`/api/search?q=${query}`);
        const data = await res.json();

        clearResults();

        if (!data.length) {
          tickerResults.innerHTML = "<li>No results</li>";
          return;
        }

        data.forEach((stock, index) => {
          const li = document.createElement("li");
          li.innerHTML = `<span class="ticker-symbol">${stock.symbol}</span> - ${stock.name}`;
          
          li.addEventListener("click", () => {
            symbolInput.value = stock.symbol;
            clearResults();
          });

          tickerResults.appendChild(li);
        });

      } catch (err) {
        console.error("Search error:", err);
      }

    }, 300); // debounce delay
  });

  // Keyboard Navigation
  symbolInput.addEventListener("keydown", (e) => {
    const items = tickerResults.querySelectorAll("li");

    if (!items.length) return;

    if (e.key === "ArrowDown") {
      activeIndex = (activeIndex + 1) % items.length;
    }

    if (e.key === "ArrowUp") {
      activeIndex = (activeIndex - 1 + items.length) % items.length;
    }

    if (e.key === "Enter" && activeIndex >= 0) {
      items[activeIndex].click();
    }

    items.forEach(item => item.classList.remove("active"));
    if (activeIndex >= 0) {
      items[activeIndex].classList.add("active");
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".ticker-search")) {
      clearResults();
    }
  });

});

