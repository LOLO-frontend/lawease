(function () {
  const adminStatus = document.getElementById("admin-status");
  const usersRoot = document.getElementById("users-root");
  const logsRoot = document.getElementById("logs-root");

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(message, isError) {
    if (!adminStatus) return;
    adminStatus.textContent = message || "";
    adminStatus.className = isError ? "status status-error" : "muted";
  }

  async function ensureAdmin() {
    const me = await window.Api.request("/api/auth/me");
    if (!me.user || me.user.role !== "admin") {
      throw new Error("Admin access required");
    }
    setStatus(`Signed in as ${me.user.email} (${me.user.role})`, false);
  }

  function renderUsers(users) {
    if (!usersRoot) return;
    if (!users.length) {
      usersRoot.innerHTML = '<p class="muted">No users found.</p>';
      return;
    }

    const rows = users
      .map(function (user) {
        const selectedAdmin = user.role === "admin" ? "selected" : "";
        const selectedLawyer = user.role === "lawyer" ? "selected" : "";
        const selectedStaff = user.role === "staff" ? "selected" : "";
        return `
          <tr>
            <td>${escapeHtml(user.name || "-")}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>
              <select data-role-select data-user-id="${user.id}">
                <option value="admin" ${selectedAdmin}>admin</option>
                <option value="lawyer" ${selectedLawyer}>lawyer</option>
                <option value="staff" ${selectedStaff}>staff</option>
              </select>
            </td>
            <td><button type="button" data-role-save data-user-id="${user.id}">Save</button></td>
          </tr>
        `;
      })
      .join("");

    usersRoot.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function renderLogs(logs) {
    if (!logsRoot) return;
    if (!logs.length) {
      logsRoot.innerHTML = '<p class="muted">No audit entries yet.</p>';
      return;
    }

    logsRoot.innerHTML = logs
      .slice(0, 100)
      .map(function (log) {
        return `
          <article class="card" style="margin-bottom:10px;">
            <p><strong>${escapeHtml(log.action)}</strong></p>
            <p class="muted">User: ${escapeHtml(log.userId || "-")}</p>
            <p class="muted">Time: ${escapeHtml(log.createdAt || "-")}</p>
            <p class="muted">IP: ${escapeHtml(log.ip || "-")}</p>
          </article>
        `;
      })
      .join("");
  }

  async function loadUsers() {
    const data = await window.Api.request("/api/admin/users");
    renderUsers(data.users || []);
  }

  async function loadLogs() {
    const data = await window.Api.request("/api/audit-logs");
    renderLogs(data.logs || []);
  }

  async function onUsersClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.hasAttribute("data-role-save")) return;

    const userId = target.getAttribute("data-user-id");
    if (!userId) return;

    const select = usersRoot.querySelector(`[data-role-select][data-user-id="${userId}"]`);
    if (!(select instanceof HTMLSelectElement)) return;

    try {
      await window.Api.request(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        body: { role: select.value }
      });
      setStatus("Role updated", false);
      await Promise.all([loadUsers(), loadLogs()]);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function init() {
    try {
      await ensureAdmin();
      await Promise.all([loadUsers(), loadLogs()]);
      usersRoot.addEventListener("click", onUsersClick);
    } catch (error) {
      setStatus(error.message, true);
      if (usersRoot) usersRoot.innerHTML = '<p class="status status-error">You do not have access to this page.</p>';
      if (logsRoot) logsRoot.innerHTML = "";
    }
  }

  init();
})();
