(function () {
  const listEl = document.getElementById("clients-list");
  const form = document.getElementById("client-form");
  const statusEl = document.getElementById("client-status");
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

  function render(clients) {
    if (!listEl) return;
    if (!clients.length) {
      listEl.innerHTML = '<p class="muted">No clients yet.</p>';
      return;
    }

    listEl.innerHTML = clients
      .map(function (client) {
        const name = escapeHtml(client.fullName || "-");
        const email = escapeHtml(client.email || "-");
        const phone = escapeHtml(client.phone || "-");
        const notes = escapeHtml(client.notes || "-");
        return `
          <article class="card" style="margin-bottom:10px;">
            <h3 style="margin-top:0;">${name}</h3>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone}</p>
            <p><strong>Notes:</strong> ${notes}</p>
            <div class="actions">
              <button type="button" data-action="edit" data-id="${client.id}">Edit</button>
              <button type="button" data-action="delete" data-id="${client.id}" class="button-secondary">Delete</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function loadClients() {
    try {
      const data = await window.Api.request("/api/clients");
      render(data.clients || []);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function createOrUpdateClient(event) {
    event.preventDefault();
    if (!form) return;

    const fullName = form.fullName.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const notes = form.notes.value.trim();

    if (!fullName) {
      setStatus("Full name is required", true);
      return;
    }

    try {
      if (editingId) {
        await window.Api.request(`/api/clients/${editingId}`, {
          method: "PUT",
          body: { fullName, email, phone, notes }
        });
        setStatus("Client updated", false);
      } else {
        await window.Api.request("/api/clients", {
          method: "POST",
          body: { fullName, email, phone, notes }
        });
        setStatus("Client created", false);
      }

      form.reset();
      editingId = "";
      form.querySelector("button[type='submit']").textContent = "Save Client";
      await loadClients();
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
        await window.Api.request(`/api/clients/${id}`, { method: "DELETE" });
        setStatus("Client deleted", false);
        await loadClients();
      }

      if (action === "edit") {
        const data = await window.Api.request("/api/clients");
        const client = (data.clients || []).find(function (c) {
          return c.id === id;
        });
        if (!client || !form) return;

        form.fullName.value = client.fullName || "";
        form.email.value = client.email || "";
        form.phone.value = client.phone || "";
        form.notes.value = client.notes || "";
        editingId = id;
        form.querySelector("button[type='submit']").textContent = "Update Client";
        setStatus("Editing client", false);
      }
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  if (form) {
    form.addEventListener("submit", createOrUpdateClient);
  }
  if (listEl) {
    listEl.addEventListener("click", onListClick);
  }

  loadClients();
})();
