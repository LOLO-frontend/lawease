(function () {
  const storedBase = window.localStorage.getItem("apiBase");
  const isFile = window.location.protocol === "file:";
  const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

  function getBaseUrl() {
    if (storedBase) return storedBase.replace(/\/$/, "");
    if (isFile) return "http://localhost:4000";
    if (isLocalhost && window.location.port !== "4000") return "http://localhost:4000";
    return window.location.origin.replace(/\/$/, "");
  }

  function getToken() {
    return window.localStorage.getItem("token") || "";
  }

  async function request(path, options) {
    const opts = options || {};
    const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData;
    const headers = Object.assign({}, opts.headers || {});
    if (!isFormData) {
      headers["Content-Type"] = "application/json";
    }
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response;
    try {
      response = await fetch(`${getBaseUrl()}${path}`, {
        method: opts.method || "GET",
        headers,
        body: isFormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined
      });
    } catch {
      throw new Error(`Cannot reach API at ${getBaseUrl()}. Start backend with: cd project && cmd /c npm run dev`);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Request failed (${response.status})`);
    }
    return payload;
  }

  window.Api = {
    getBaseUrl,
    getToken,
    setToken(token) {
      window.localStorage.setItem("token", token);
    },
    clearToken() {
      window.localStorage.removeItem("token");
    },
    request
  };
})();
