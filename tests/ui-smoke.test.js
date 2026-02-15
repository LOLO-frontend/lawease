const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const clientDir = path.join(__dirname, "..", "client");

const requiredPages = [
  "index.html",
  "login.html",
  "signup.html",
  "dashboard.html",
  "admin.html",
  "clients.html",
  "cases.html",
  "documents.html",
  "messages.html"
];

test("core pages exist", () => {
  requiredPages.forEach((file) => {
    assert.equal(fs.existsSync(path.join(clientDir, file)), true, `${file} should exist`);
  });
});

test("auth pages include api + auth scripts", () => {
  const login = fs.readFileSync(path.join(clientDir, "login.html"), "utf8");
  const signup = fs.readFileSync(path.join(clientDir, "signup.html"), "utf8");

  assert.match(login, /js\/api\.js/);
  assert.match(login, /js\/auth\.js/);
  assert.match(signup, /js\/api\.js/);
  assert.match(signup, /js\/auth\.js/);
});

test("dashboard includes navigation modules", () => {
  const dashboard = fs.readFileSync(path.join(clientDir, "dashboard.html"), "utf8");

  assert.match(dashboard, /clients\.html/);
  assert.match(dashboard, /cases\.html/);
  assert.match(dashboard, /documents\.html/);
  assert.match(dashboard, /messages\.html/);
});
