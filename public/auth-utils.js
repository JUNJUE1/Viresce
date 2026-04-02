/* =========================
   auth-utils.js
   Drop this script on every page that needs auth awareness.
   Usage: <script src="/auth-utils.js"></script>
========================= */

const Auth = {
  getToken() {
    return localStorage.getItem("viresce_token");
  },

  getUser() {
    const raw = localStorage.getItem("viresce_user");
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  logout() {
    localStorage.removeItem("viresce_token");
    localStorage.removeItem("viresce_user");
    window.location.href = "/login.html";
  },

  // Use this for all authenticated API calls
  async fetchAuth(url, options = {}) {
    const token = this.getToken();
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
  },

  // Injects user info + logout button into nav
  renderNavAuth() {
    const nav = document.querySelector(".nav-links");
    if (!nav) return;

    // Remove old auth item if re-rendering
    nav.querySelector(".nav-auth")?.remove();

    const li = document.createElement("li");
    li.className = "nav-auth";
    li.style.marginLeft = "auto";

    if (this.isLoggedIn()) {
      const user = this.getUser();
      li.innerHTML = `
        <span style="color: var(--muted); font-size:0.9rem; margin-right:12px;">
          👤 ${user?.username || ""}
        </span>
        <a href="#" id="logoutBtn" style="color:var(--muted); font-weight:600;">
          Sign out
        </a>
      `;
      li.querySelector("#logoutBtn").addEventListener("click", e => {
        e.preventDefault();
        Auth.logout();
      });
    } else {
      li.innerHTML = `<a href="/login.html" style="font-weight:600;">Sign in</a>`;
    }

    nav.appendChild(li);
  }
};

// Auto-render nav auth on every page
document.addEventListener("DOMContentLoaded", () => Auth.renderNavAuth());