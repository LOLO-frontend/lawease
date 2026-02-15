(function () {
  const root = document.getElementById("dashboard-root");
  if (!root) return;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderStats(stats) {
    root.innerHTML = `
      <section class="card glass">
        <span class="kicker">Today</span>
        <h3 class="section-title">Practice Snapshot</h3>
        <div class="metric-grid">
          <div class="metric"><strong>${escapeHtml(stats.activeCases)}</strong><span class="muted">Active matters</span></div>
          <div class="metric"><strong>${escapeHtml(stats.clients)}</strong><span class="muted">Clients</span></div>
          <div class="metric"><strong>${escapeHtml(stats.upcomingHearings)}</strong><span class="muted">Upcoming hearings</span></div>
        </div>
        <p class="lead">Live counts are synced from your workspace data.</p>
      </section>

      <section class="card">
        <span class="kicker">Quick Actions</span>
        <h3 class="section-title">Open a workflow</h3>
        <div class="actions">
          <a class="button-link" href="clients.html">Manage Clients</a>
          <a class="button-link" href="cases.html">Manage Cases</a>
          <a class="button-link button-accent" href="documents.html">Documents (${escapeHtml(stats.documents)})</a>
          <a class="button-link button-secondary" href="messages.html">Messages (${escapeHtml(stats.messages)})</a>
        </div>
        <p class="lead">Drive each matter from intake to resolution in one place.</p>
      </section>
    `;
  }

  async function load() {
    try {
      const data = await window.Api.request("/api/stats");
      renderStats(data.stats || { activeCases: 0, clients: 0, documents: 0, messages: 0, upcomingHearings: 0 });
    } catch (error) {
      root.innerHTML = `<section class="card"><p class="status status-error">${escapeHtml(error.message)}</p></section>`;
    }
  }

  load();
})();
