(function () {
  const listEl = document.getElementById("documents-list");
  const form = document.getElementById("document-form");
  const statusEl = document.getElementById("document-status");
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

  function render(items) {
    if (!listEl) return;
    if (!items.length) {
      listEl.innerHTML = '<p class="muted">No documents yet.</p>';
      return;
    }

    listEl.innerHTML = items
      .map(function (doc) {
        return `
          <article class="card" style="margin-bottom:10px;">
            <h3 style="margin-top:0;">${escapeHtml(doc.title || "-")}</h3>
            <p><strong>Type:</strong> ${escapeHtml(doc.type || "general")}</p>
            <p><strong>Case ID:</strong> ${escapeHtml(doc.linkedCaseId || "-")}</p>
            <p><strong>Client ID:</strong> ${escapeHtml(doc.linkedClientId || "-")}</p>
            <p><strong>File:</strong> ${escapeHtml(doc.fileName || "-")}</p>
            <p><strong>Notes:</strong> ${escapeHtml(doc.notes || "-")}</p>
            <div class="actions">
              <button type="button" data-action="download" data-id="${doc.id}">Download</button>
              <button type="button" data-action="edit" data-id="${doc.id}">Edit</button>
              <button type="button" data-action="delete" data-id="${doc.id}" class="button-secondary">Delete</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function loadDocuments() {
    try {
      const data = await window.Api.request("/api/documents");
      render(data.documents || []);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function saveDocument(event) {
    event.preventDefault();
    if (!form) return;

    const title = form.title.value.trim();
    if (!title) {
      setStatus("Document title is required", true);
      return;
    }
    const payload = new FormData();
    payload.append("title", title);
    payload.append("type", form.type.value);
    payload.append("linkedCaseId", form.linkedCaseId.value.trim());
    payload.append("linkedClientId", form.linkedClientId.value.trim());
    payload.append("notes", form.notes.value.trim());
    if (form.file.files && form.file.files[0]) {
      payload.append("file", form.file.files[0]);
    }

    try {
      if (editingId) {
        await window.Api.request(`/api/documents/${editingId}`, { method: "PUT", body: payload });
        setStatus("Document updated", false);
      } else {
        await window.Api.request("/api/documents", { method: "POST", body: payload });
        setStatus("Document created", false);
      }

      editingId = "";
      form.reset();
      form.type.value = "general";
      form.querySelector("button[type='submit']").textContent = "Save Document";
      await loadDocuments();
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
        await window.Api.request(`/api/documents/${id}`, { method: "DELETE" });
        setStatus("Document deleted", false);
        await loadDocuments();
      }

      if (action === "download") {
        const token = window.Api.getToken();
        const response = await fetch(`${window.Api.getBaseUrl()}/api/documents/${id}/download`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Download failed");
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }

      if (action === "edit") {
        const data = await window.Api.request("/api/documents");
        const doc = (data.documents || []).find(function (d) {
          return d.id === id;
        });
        if (!doc || !form) return;

        form.title.value = doc.title || "";
        form.type.value = doc.type || "general";
        form.linkedCaseId.value = doc.linkedCaseId || "";
        form.linkedClientId.value = doc.linkedClientId || "";
        form.notes.value = doc.notes || "";
        editingId = id;
        form.querySelector("button[type='submit']").textContent = "Update Document";
        setStatus("Editing document", false);
      }
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  if (form) {
    form.addEventListener("submit", saveDocument);
  }
  if (listEl) {
    listEl.addEventListener("click", onListClick);
  }

  loadDocuments();
})();
