(function () {
  function setStatus(el, message, isError) {
    if (!el) return;
    el.textContent = message || "";
    el.className = isError ? "status status-error" : "status status-ok";
  }

  function getRedirectTarget() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") || "";
    if (!next || !next.endsWith(".html")) {
      return "dashboard.html";
    }
    return next;
  }

  function preserveNextParamOnHome() {
    const path = window.location.pathname;
    if (!path.endsWith("/") && !path.endsWith("/index.html")) return;

    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (!next) return;

    const links = document.querySelectorAll('a[href="login.html"], a[href="signup.html"]');
    links.forEach(function (link) {
      link.setAttribute("href", `${link.getAttribute("href")}?next=${encodeURIComponent(next)}`);
    });
  }

  async function onSignupSubmit(form) {
    const statusEl = document.getElementById("signup-status");
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    const role = form.role ? form.role.value : "staff";

    try {
      setStatus(statusEl, "Creating account...", false);
      const data = await window.Api.request("/api/auth/signup", {
        method: "POST",
        body: { name, email, password, role }
      });
      window.Api.setToken(data.token);
      setStatus(statusEl, "Account created. Redirecting...", false);
      window.location.href = getRedirectTarget();
    } catch (error) {
      setStatus(statusEl, error.message, true);
    }
  }

  async function onLoginSubmit(form) {
    const statusEl = document.getElementById("login-status");
    const email = form.email.value.trim();
    const password = form.password.value;

    try {
      setStatus(statusEl, "Signing in...", false);
      const data = await window.Api.request("/api/auth/login", {
        method: "POST",
        body: { email, password }
      });
      window.Api.setToken(data.token);
      setStatus(statusEl, "Signed in. Redirecting...", false);
      window.location.href = getRedirectTarget();
    } catch (error) {
      setStatus(statusEl, error.message, true);
    }
  }

  async function loadCurrentUser() {
    const userEl = document.getElementById("current-user");
    if (!userEl || !window.Api.getToken()) return;

    try {
      const data = await window.Api.request("/api/auth/me");
      const base = data.user.name || data.user.email;
      userEl.textContent = `${base} (${data.user.role})`;
      applyRoleVisibility(data.user.role);
    } catch {
      window.Api.clearToken();
      userEl.textContent = "Guest";
      applyRoleVisibility("");
    }
  }

  function applyRoleVisibility(role) {
    const adminOnly = document.querySelectorAll("[data-admin-only]");
    adminOnly.forEach(function (el) {
      if (role === "admin") {
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    });
  }

  async function onRequestReset(form) {
    const statusEl = document.getElementById("reset-request-status");
    const email = form.email.value.trim();
    try {
      setStatus(statusEl, "Requesting reset token...", false);
      const data = await window.Api.request("/api/auth/request-password-reset", {
        method: "POST",
        body: { email }
      });
      const tokenNote = data.resetToken ? ` Dev token: ${data.resetToken}` : "";
      setStatus(statusEl, `${data.message || "Reset request sent."}${tokenNote}`, false);
    } catch (error) {
      setStatus(statusEl, error.message, true);
    }
  }

  async function onConfirmReset(form) {
    const statusEl = document.getElementById("reset-confirm-status");
    const token = form.token.value.trim();
    const newPassword = form.newPassword.value;
    try {
      setStatus(statusEl, "Resetting password...", false);
      await window.Api.request("/api/auth/reset-password", {
        method: "POST",
        body: { token, newPassword }
      });
      setStatus(statusEl, "Password updated. You can now log in.", false);
      form.reset();
    } catch (error) {
      setStatus(statusEl, error.message, true);
    }
  }

  function wireForms() {
    const loginForm = document.getElementById("login-form");
    const signupForm = document.getElementById("signup-form");
    const resetRequestForm = document.getElementById("reset-request-form");
    const resetConfirmForm = document.getElementById("reset-confirm-form");
    const logoutBtn = document.getElementById("logout-button");

    if (loginForm) {
      loginForm.addEventListener("submit", function (event) {
        event.preventDefault();
        onLoginSubmit(loginForm);
      });
    }

    if (signupForm) {
      signupForm.addEventListener("submit", function (event) {
        event.preventDefault();
        onSignupSubmit(signupForm);
      });
    }

    if (resetRequestForm) {
      resetRequestForm.addEventListener("submit", function (event) {
        event.preventDefault();
        onRequestReset(resetRequestForm);
      });
    }

    if (resetConfirmForm) {
      resetConfirmForm.addEventListener("submit", function (event) {
        event.preventDefault();
        onConfirmReset(resetConfirmForm);
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        window.Api.clearToken();
        window.location.href = "index.html";
      });
    }
  }

  function protectPages() {
    const pathname = window.location.pathname;
    const publicPages = ["/", "/index.html", "/login.html", "/signup.html"];
    const isPublic = publicPages.some(function (p) {
      return pathname.endsWith(p);
    });

    if (!isPublic && !window.Api.getToken()) {
      const current = pathname.split("/").pop() || "dashboard.html";
      window.location.href = `index.html?next=${encodeURIComponent(current)}`;
    }
  }

  wireForms();
  protectPages();
  preserveNextParamOnHome();
  loadCurrentUser();
})();
