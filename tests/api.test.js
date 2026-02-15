const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const tmpRoot = path.join(__dirname, "tmp");
const dbFile = path.join(tmpRoot, "data-test.json");
const uploadDir = path.join(tmpRoot, "uploads");

function cleanup() {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

cleanup();
fs.mkdirSync(uploadDir, { recursive: true });

process.env.NODE_ENV = "test";
process.env.DB_FILE = dbFile;
process.env.UPLOAD_DIR = uploadDir;
process.env.JWT_SECRET = "test-secret";
process.env.ALLOWED_ORIGIN = "http://localhost:4000";

const app = require("../server/index");

let token = "";
let caseId = "";
let clientId = "";
let documentId = "";
let staffUserId = "";

test("auth signup/login + me", async () => {
  const email = `api-${Date.now()}@example.com`;

  const signup = await request(app)
    .post("/api/auth/signup")
    .send({ name: "API User", email, password: "password123", role: "lawyer" })
    .expect(201);

  assert.equal(signup.body.user.role, "admin");
  token = signup.body.token;

  const me = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);

  assert.equal(me.body.user.email, email);
});

test("clients/cases/documents/messages flow", async () => {
  const client = await request(app)
    .post("/api/clients")
    .set("Authorization", `Bearer ${token}`)
    .send({ fullName: "Client A", email: "clienta@example.com" })
    .expect(201);
  clientId = client.body.client.id;

  const matter = await request(app)
    .post("/api/cases")
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Matter A", clientName: "Client A", status: "open" })
    .expect(201);
  caseId = matter.body.case.id;

  const fixturePath = path.join(__dirname, "fixture.txt");
  fs.writeFileSync(fixturePath, "sample file");

  const doc = await request(app)
    .post("/api/documents")
    .set("Authorization", `Bearer ${token}`)
    .field("title", "Retainer")
    .field("type", "contract")
    .field("linkedCaseId", caseId)
    .field("linkedClientId", clientId)
    .attach("file", fixturePath)
    .expect(201);
  documentId = doc.body.document.id;

  await request(app)
    .get(`/api/documents/${documentId}/download`)
    .set("Authorization", `Bearer ${token}`)
    .expect(200);

  await request(app)
    .post("/api/messages")
    .set("Authorization", `Bearer ${token}`)
    .send({ subject: "Hello", body: "Welcome", linkedCaseId: caseId, linkedClientId: clientId })
    .expect(201);

  const stats = await request(app)
    .get("/api/stats")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);

  assert.equal(stats.body.stats.clients, 1);
  assert.equal(stats.body.stats.activeCases, 1);
  assert.equal(stats.body.stats.documents, 1);
  assert.equal(stats.body.stats.messages, 1);
});

test("password reset flow", async () => {
  const reqReset = await request(app)
    .post("/api/auth/request-password-reset")
    .send({ email: "api@example.com" })
    .expect(200);

  assert.ok(reqReset.body.message);

  const email = `reset-${Date.now()}@example.com`;
  const signup = await request(app)
    .post("/api/auth/signup")
    .send({ name: "Reset User", email, password: "password123", role: "staff" })
    .expect(201);
  staffUserId = signup.body.user.id;

  const reset = await request(app)
    .post("/api/auth/request-password-reset")
    .send({ email })
    .expect(200);

  assert.ok(reset.body.resetToken);

  await request(app)
    .post("/api/auth/reset-password")
    .send({ token: reset.body.resetToken, newPassword: "newpassword123" })
    .expect(200);

  await request(app)
    .post("/api/auth/login")
    .send({ email, password: "newpassword123" })
    .expect(200);
});

test("admin role management + audit logs", async () => {
  const users = await request(app)
    .get("/api/admin/users")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);

  assert.ok(users.body.users.length >= 2);

  await request(app)
    .patch(`/api/admin/users/${staffUserId}/role`)
    .set("Authorization", `Bearer ${token}`)
    .send({ role: "lawyer" })
    .expect(200);

  const logs = await request(app)
    .get("/api/audit-logs")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);

  assert.ok(Array.isArray(logs.body.logs));
  assert.ok(logs.body.logs.length > 0);
});

test.after(() => {
  cleanup();
});
