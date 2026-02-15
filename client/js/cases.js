(function () {
  const listEl = document.getElementById("cases-list");
  const form = document.getElementById("case-form");
  const statusEl = document.getElementById("case-status");
  const detailsEl = document.getElementById("case-details");
  let editingId = "";

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.className = isError ? "status status-error" : "status status-ok";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderList(cases) {
    if (!listEl) return;
    if (!cases.length) {
      listEl.innerHTML = '<p class="muted">No cases yet.</p>';
      return;
    }

    listEl.innerHTML = cases
      .map(function (item) {
        const title = escapeHtml(item.title || "-");
        const clientName = escapeHtml(item.clientName || "-");
        const status = escapeHtml(item.status || "open");
        const court = escapeHtml(item.court || "-");
        const hearing = escapeHtml(item.nextHearingDate || "-");

        return `
          <article class="card" style="margin-bottom:10px;">
            <h3 style="margin-top:0;">${title}</h3>
            <p><strong>Client:</strong> ${clientName}</p>
            <p><strong>Status:</strong> ${status}</p>
            <p><strong>Court:</strong> ${court}</p>
            <p><strong>Next Hearing:</strong> ${hearing}</p>
            <div class="actions">
              <a class="button-link" href="case-details.html?id=${encodeURIComponent(item.id)}">View</a>
              <button type="button" data-action="edit" data-id="${item.id}">Edit</button>
              <button type="button" data-action="delete" data-id="${item.id}" class="button-secondary">Delete</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function loadCases() {
    if (!listEl) return;
    try {
      const data = await window.Api.request("/api/cases");
      renderList(data.cases || []);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function createOrUpdateCase(event) {
    event.preventDefault();
    if (!form) return;

    const title = form.title.value.trim();
    const clientName = form.clientName.value.trim();
    const status = form.status.value;
    const court = form.court.value.trim();
    const nextHearingDate = form.nextHearingDate.value;
    const notes = form.notes.value.trim();

    if (!title) {
      setStatus("Case title is required", true);
      return;
    }

    const body = { title, clientName, status, court, nextHearingDate, notes };

    try {
      if (editingId) {
        await window.Api.request(`/api/cases/${editingId}`, {
          method: "PUT",
          body
        });
        setStatus("Case updated", false);
      } else {
        await window.Api.request("/api/cases", {
          method: "POST",
          body
        });
        setStatus("Case created", false);
      }

      form.reset();
      form.status.value = "open";
      editingId = "";
      form.querySelector("button[type='submit']").textContent = "Save Case";
      await loadCases();
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function onListClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const action = target.getAttribute("data-action");
    const id = target.getAttribute("data-id");
    if (!action || !id) return;

    try {
      if (action === "delete") {
        await window.Api.request(`/api/cases/${id}`, { method: "DELETE" });
        setStatus("Case deleted", false);
        await loadCases();
      }

      if (action === "edit") {
        const data = await window.Api.request(`/api/cases/${id}`);
        const item = data.case;
        if (!item || !form) return;

        form.title.value = item.title || "";
        form.clientName.value = item.clientName || "";
        form.status.value = item.status || "open";
        form.court.value = item.court || "";
        form.nextHearingDate.value = item.nextHearingDate || "";
        form.notes.value = item.notes || "";

        editingId = id;
        form.querySelector("button[type='submit']").textContent = "Update Case";
        setStatus("Editing case", false);
      }
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function getCaseIdFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || "";
  }

  async function loadCaseDetails() {
    if (!detailsEl) return;
    const id = getCaseIdFromQuery();
    if (!id) {
      detailsEl.innerHTML = '<p class="status status-error">Missing case id in URL.</p>';
      return;
    }

    try {
      const data = await window.Api.request(`/api/cases/${encodeURIComponent(id)}`);
      const item = data.case;

      detailsEl.innerHTML = `
        <h2>${escapeHtml(item.title || "Case")}</h2>
        <p><strong>Client:</strong> ${escapeHtml(item.clientName || "-")}</p>
        <p><strong>Status:</strong> ${escapeHtml(item.status || "-")}</p>
        <p><strong>Court:</strong> ${escapeHtml(item.court || "-")}</p>
        <p><strong>Next Hearing:</strong> ${escapeHtml(item.nextHearingDate || "-")}</p>
        <p><strong>Notes:</strong> ${escapeHtml(item.notes || "-")}</p>
        <p class="muted"><strong>Created:</strong> ${escapeHtml(item.createdAt || "-")}</p>
        <p class="muted"><strong>Updated:</strong> ${escapeHtml(item.updatedAt || "-")}</p>
      `;
    } catch (error) {
      detailsEl.innerHTML = `<p class="status status-error">${escapeHtml(error.message)}</p>`;
    }
  }

  if (form) {
    form.addEventListener("submit", createOrUpdateCase);
  }

  if (listEl) {
    listEl.addEventListener("click", onListClick);
    loadCases();
  }

  if (detailsEl) {
    loadCaseDetails();
  }
})();
