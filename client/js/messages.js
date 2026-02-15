(function () {
  const listEl = document.getElementById("messages-list");
  const form = document.getElementById("message-form");
  const statusEl = document.getElementById("message-status");
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
      listEl.innerHTML = '<p class="muted">No messages yet.</p>';
      return;
    }

    listEl.innerHTML = items
      .map(function (msg) {
        return `
          <article class="card" style="margin-bottom:10px;">
            <h3 style="margin-top:0;">${escapeHtml(msg.subject || "-")}</h3>
            <p><strong>To:</strong> ${escapeHtml(msg.toName || "-")}</p>
            <p><strong>Channel:</strong> ${escapeHtml(msg.channel || "email")}</p>
            <p><strong>Case ID:</strong> ${escapeHtml(msg.linkedCaseId || "-")}</p>
            <p><strong>Client ID:</strong> ${escapeHtml(msg.linkedClientId || "-")}</p>
            <p><strong>Message:</strong> ${escapeHtml(msg.body || "-")}</p>
            <p class="muted"><strong>Created:</strong> ${escapeHtml(msg.createdAt || "-")}</p>
            <div class="actions">
              <button type="button" data-action="edit" data-id="${msg.id}">Edit</button>
              <button type="button" data-action="delete" data-id="${msg.id}" class="button-secondary">Delete</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function loadMessages() {
    try {
      const data = await window.Api.request("/api/messages");
      render(data.messages || []);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function saveMessage(event) {
    event.preventDefault();
    if (!form) return;

    const body = {
      subject: form.subject.value.trim(),
      toName: form.toName.value.trim(),
      channel: form.channel.value,
      linkedCaseId: form.linkedCaseId.value.trim(),
      linkedClientId: form.linkedClientId.value.trim(),
      body: form.body.value.trim()
    };

    if (!body.subject || !body.body) {
      setStatus("Subject and message body are required", true);
      return;
    }

    try {
      if (editingId) {
        await window.Api.request(`/api/messages/${editingId}`, { method: "PUT", body });
        setStatus("Message updated", false);
      } else {
        await window.Api.request("/api/messages", { method: "POST", body });
        setStatus("Message created", false);
      }

      editingId = "";
      form.reset();
      form.channel.value = "email";
      form.querySelector("button[type='submit']").textContent = "Save Message";
      await loadMessages();
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
        await window.Api.request(`/api/messages/${id}`, { method: "DELETE" });
        setStatus("Message deleted", false);
        await loadMessages();
      }

      if (action === "edit") {
        const data = await window.Api.request("/api/messages");
        const msg = (data.messages || []).find(function (m) {
          return m.id === id;
        });
        if (!msg || !form) return;

        form.subject.value = msg.subject || "";
        form.toName.value = msg.toName || "";
        form.channel.value = msg.channel || "email";
        form.linkedCaseId.value = msg.linkedCaseId || "";
        form.linkedClientId.value = msg.linkedClientId || "";
        form.body.value = msg.body || "";
        editingId = id;
        form.querySelector("button[type='submit']").textContent = "Update Message";
        setStatus("Editing message", false);
      }
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  if (form) {
    form.addEventListener("submit", saveMessage);
  }
  if (listEl) {
    listEl.addEventListener("click", onListClick);
  }

  loadMessages();
})();
