document.addEventListener("DOMContentLoaded", () => {

  async function updateIndexes() {
  try {
    const res = await fetch("/api/indexes");
    const data = await res.json();

    const grid = document.getElementById("indexesGrid");
    grid.innerHTML = ""; // clear old cards

    data.forEach(idx => {
      const card = document.createElement("div");
      card.className = "card";

      const title = document.createElement("h4");
      title.textContent = idx.name;

      const price = document.createElement("p");
      price.textContent = idx.price.toFixed(2);

      const change = document.createElement("p");
      change.textContent =
        `${idx.change >= 0 ? "+" : ""}${idx.change.toFixed(2)}%`;

      change.className =
        idx.change > 0
          ? "positive"
          : idx.change < 0
          ? "negative"
          : "neutral";

      card.appendChild(title);
      card.appendChild(price);
      card.appendChild(change);

      grid.appendChild(card);
    });

  } catch (err) {
    console.error("Failed to fetch indexes:", err);
  }
}

updateIndexes();
setInterval(updateIndexes, 60000);

});
