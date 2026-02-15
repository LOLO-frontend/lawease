const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
require("dotenv").config();

const { getDb } = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const PASSWORD_RESET_TOKEN_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 30);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const S3_BUCKET = process.env.S3_BUCKET || "";
const S3_REGION = process.env.S3_REGION || "";
const S3_ENDPOINT = process.env.S3_ENDPOINT || "";
const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === "true";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || `http://localhost:${PORT},http://127.0.0.1:${PORT},http://localhost:5500,http://127.0.0.1:5500`)
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const USE_S3 = Boolean(S3_BUCKET && S3_REGION);

const ROLE_VALUES = ["admin", "lawyer", "staff"];
const PERMISSIONS = {
  CLIENT_DELETE: "client:delete",
  CASE_DELETE: "case:delete",
  DOCUMENT_DELETE: "document:delete",
  MESSAGE_DELETE: "message:delete",
  AUDIT_READ: "audit:read",
  USER_MANAGE: "user:manage"
};

const ROLE_PERMISSIONS = {
  admin: new Set(Object.values(PERMISSIONS)),
  lawyer: new Set([PERMISSIONS.CLIENT_DELETE, PERMISSIONS.CASE_DELETE, PERMISSIONS.DOCUMENT_DELETE, PERMISSIONS.MESSAGE_DELETE]),
  staff: new Set([])
};

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const s3Client = USE_S3
  ? new S3Client({
      region: S3_REGION,
      endpoint: S3_ENDPOINT || undefined,
      forcePathStyle: S3_FORCE_PATH_STYLE,
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
          : undefined
    })
  : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: function (_req, file, cb) {
    const allowed = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/png",
      "image/jpeg",
      "text/plain"
    ]);
    if (!allowed.has(file.mimetype)) {
      return cb(new Error("Unsupported file type"));
    }
    cb(null, true);
  }
});

function buildStorageKey(fileName) {
  const ext = path.extname(fileName || "");
  return `documents/${Date.now()}-${crypto.randomUUID()}${ext}`;
}

async function saveUploadedFile(file) {
  if (!file || !file.buffer) {
    return {
      storageProvider: USE_S3 ? "s3" : "local",
      storageKey: "",
      filePath: "",
      fileName: "",
      mimeType: "",
      fileSize: 0
    };
  }

  if (USE_S3) {
    const storageKey = buildStorageKey(file.originalname || "");
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: storageKey,
        Body: file.buffer,
        ContentType: file.mimetype || "application/octet-stream"
      })
    );
    return {
      storageProvider: "s3",
      storageKey,
      filePath: "",
      fileName: file.originalname || "",
      mimeType: file.mimetype || "",
      fileSize: file.size || 0
    };
  }

  const storageKey = buildStorageKey(file.originalname || "");
  const filePath = path.join(UPLOAD_DIR, storageKey.replace(/\//g, path.sep));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, file.buffer);
  return {
    storageProvider: "local",
    storageKey,
    filePath,
    fileName: file.originalname || "",
    mimeType: file.mimetype || "",
    fileSize: file.size || 0
  };
}

async function deleteStoredFile(doc) {
  if (!doc) return;
  if (doc.storageProvider === "s3" && doc.storageKey && USE_S3) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: doc.storageKey }));
    return;
  }
  if (doc.filePath && fs.existsSync(doc.filePath)) {
    fs.unlinkSync(doc.filePath);
  }
}

async function openStoredFileStream(doc) {
  if (doc.storageProvider === "s3" && doc.storageKey && USE_S3) {
    const output = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: doc.storageKey }));
    return output.Body;
  }
  if (doc.filePath && fs.existsSync(doc.filePath)) {
    return fs.createReadStream(doc.filePath);
  }
  return null;
}

function isAllowedRole(role) {
  return ROLE_VALUES.includes(role);
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}

async function createAuditLog(db, req, action, userId, metadata) {
  db.data.auditLogs.push({
    id: crypto.randomUUID(),
    action,
    userId: userId || null,
    ip: req.ip,
    metadata: metadata || {},
    createdAt: new Date().toISOString()
  });
  await db.write();
}

async function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }

  const db = await getDb();
  const user = db.data.users.find((u) => u.id === payload.sub);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  req.user = payload;
  req.authUser = user;
  req.db = db;
  return next();
}

function requirePermission(permission) {
  return function (req, res, next) {
    const role = req.authUser.role || "staff";
    const allowed = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.staff;
    if (!allowed.has(permission)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    return next();
  };
}

app.set("trust proxy", 1);
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true
  })
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts. Please try again later." }
});

app.use("/api", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/request-password-reset", authLimiter);
app.use("/api/auth/reset-password", authLimiter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "lawease-api" });
});

app.post("/api/auth/signup", async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const db = await getDb();
  const normalizedEmail = String(email).trim().toLowerCase();
  const exists = db.data.users.find((u) => u.email === normalizedEmail);
  if (exists) {
    return res.status(409).json({ error: "Account already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const isFirstUser = db.data.users.length === 0;
  const selectedRole = isFirstUser ? "admin" : isAllowedRole(role) && role !== "admin" ? role : "staff";

  const user = {
    id: crypto.randomUUID(),
    name: name ? String(name).trim() : "",
    email: normalizedEmail,
    role: selectedRole,
    passwordHash,
    createdAt: new Date().toISOString()
  };

  db.data.users.push(user);
  await createAuditLog(db, req, "AUTH_SIGNUP", user.id, { role: user.role });

  const token = signToken(user);
  return res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const db = await getDb();
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = db.data.users.find((u) => u.email === normalizedEmail);
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  await createAuditLog(db, req, "AUTH_LOGIN", user.id, { role: user.role });
  const token = signToken(user);
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post("/api/auth/request-password-reset", async (req, res) => {
  const { email } = req.body || {};
  const generic = { message: "If the account exists, a reset token has been generated." };
  if (!email) return res.json(generic);

  const db = await getDb();
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = db.data.users.find((u) => u.email === normalizedEmail);
  if (!user) return res.json(generic);

  const rawToken = crypto.randomBytes(24).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  db.data.resetTokens.push({
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash,
    expiresAt,
    usedAt: null,
    createdAt: new Date().toISOString()
  });

  await createAuditLog(db, req, "AUTH_PASSWORD_RESET_REQUEST", user.id, { expiresAt });

  if (process.env.NODE_ENV !== "production") {
    return res.json({ ...generic, resetToken: rawToken, expiresAt });
  }
  return res.json(generic);
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ error: "Token and new password are required" });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const db = await getDb();
  const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");
  const resetRow = db.data.resetTokens.find((t) => t.tokenHash === tokenHash && !t.usedAt);
  if (!resetRow) {
    return res.status(400).json({ error: "Invalid or expired token" });
  }
  if (new Date(resetRow.expiresAt).getTime() < Date.now()) {
    return res.status(400).json({ error: "Invalid or expired token" });
  }

  const user = db.data.users.find((u) => u.id === resetRow.userId);
  if (!user) {
    return res.status(400).json({ error: "Invalid token" });
  }

  user.passwordHash = await bcrypt.hash(String(newPassword), 10);
  resetRow.usedAt = new Date().toISOString();
  await createAuditLog(db, req, "AUTH_PASSWORD_RESET_COMPLETE", user.id, {});

  return res.json({ message: "Password updated" });
});

app.get("/api/auth/me", authRequired, async (req, res) => {
  return res.json({
    user: {
      id: req.authUser.id,
      name: req.authUser.name,
      email: req.authUser.email,
      role: req.authUser.role
    }
  });
});

app.get("/api/admin/users", authRequired, requirePermission(PERMISSIONS.USER_MANAGE), async (req, res) => {
  const users = req.db.data.users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt
  }));
  return res.json({ users });
});

app.patch("/api/admin/users/:id/role", authRequired, requirePermission(PERMISSIONS.USER_MANAGE), async (req, res) => {
  const { role } = req.body || {};
  if (!isAllowedRole(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  const user = req.db.data.users.find((u) => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  user.role = role;
  await createAuditLog(req.db, req, "ADMIN_ROLE_UPDATED", req.authUser.id, { targetUserId: user.id, role });
  return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get("/api/clients", authRequired, async (req, res) => {
  const clients = req.db.data.clients
    .filter((c) => c.ownerId === req.authUser.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json({ clients });
});

app.post("/api/clients", authRequired, async (req, res) => {
  const { fullName, email, phone, notes } = req.body || {};
  if (!fullName) {
    return res.status(400).json({ error: "Client full name is required" });
  }

  const client = {
    id: crypto.randomUUID(),
    ownerId: req.authUser.id,
    fullName: String(fullName).trim(),
    email: email ? String(email).trim() : "",
    phone: phone ? String(phone).trim() : "",
    notes: notes ? String(notes).trim() : "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  req.db.data.clients.push(client);
  await createAuditLog(req.db, req, "CLIENT_CREATED", req.authUser.id, { clientId: client.id });
  return res.status(201).json({ client });
});

app.put("/api/clients/:id", authRequired, async (req, res) => {
  const { fullName, email, phone, notes } = req.body || {};
  if (!fullName) {
    return res.status(400).json({ error: "Client full name is required" });
  }

  const client = req.db.data.clients.find((c) => c.id === req.params.id && c.ownerId === req.authUser.id);
  if (!client) {
    return res.status(404).json({ error: "Client not found" });
  }

  client.fullName = String(fullName).trim();
  client.email = email ? String(email).trim() : "";
  client.phone = phone ? String(phone).trim() : "";
  client.notes = notes ? String(notes).trim() : "";
  client.updatedAt = new Date().toISOString();
  await createAuditLog(req.db, req, "CLIENT_UPDATED", req.authUser.id, { clientId: client.id });
  return res.json({ client });
});

app.delete("/api/clients/:id", authRequired, requirePermission(PERMISSIONS.CLIENT_DELETE), async (req, res) => {
  const idx = req.db.data.clients.findIndex((c) => c.id === req.params.id && c.ownerId === req.authUser.id);
  if (idx < 0) {
    return res.status(404).json({ error: "Client not found" });
  }

  const clientId = req.db.data.clients[idx].id;
  req.db.data.clients.splice(idx, 1);
  await createAuditLog(req.db, req, "CLIENT_DELETED", req.authUser.id, { clientId });
  return res.status(204).send();
});

app.get("/api/cases", authRequired, async (req, res) => {
  const cases = req.db.data.cases
    .filter((c) => c.ownerId === req.authUser.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json({ cases });
});

app.post("/api/cases", authRequired, async (req, res) => {
  const { title, clientName, status, court, nextHearingDate, notes } = req.body || {};
  if (!title) {
    return res.status(400).json({ error: "Case title is required" });
  }

  const matter = {
    id: crypto.randomUUID(),
    ownerId: req.authUser.id,
    title: String(title).trim(),
    clientName: clientName ? String(clientName).trim() : "",
    status: status ? String(status).trim() : "open",
    court: court ? String(court).trim() : "",
    nextHearingDate: nextHearingDate ? String(nextHearingDate).trim() : "",
    notes: notes ? String(notes).trim() : "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  req.db.data.cases.push(matter);
  await createAuditLog(req.db, req, "CASE_CREATED", req.authUser.id, { caseId: matter.id });
  return res.status(201).json({ case: matter });
});

app.get("/api/cases/:id", authRequired, async (req, res) => {
  const matter = req.db.data.cases.find((c) => c.id === req.params.id && c.ownerId === req.authUser.id);
  if (!matter) {
    return res.status(404).json({ error: "Case not found" });
  }
  return res.json({ case: matter });
});

app.put("/api/cases/:id", authRequired, async (req, res) => {
  const { title, clientName, status, court, nextHearingDate, notes } = req.body || {};
  if (!title) {
    return res.status(400).json({ error: "Case title is required" });
  }

  const matter = req.db.data.cases.find((c) => c.id === req.params.id && c.ownerId === req.authUser.id);
  if (!matter) {
    return res.status(404).json({ error: "Case not found" });
  }

  matter.title = String(title).trim();
  matter.clientName = clientName ? String(clientName).trim() : "";
  matter.status = status ? String(status).trim() : "open";
  matter.court = court ? String(court).trim() : "";
  matter.nextHearingDate = nextHearingDate ? String(nextHearingDate).trim() : "";
  matter.notes = notes ? String(notes).trim() : "";
  matter.updatedAt = new Date().toISOString();

  await createAuditLog(req.db, req, "CASE_UPDATED", req.authUser.id, { caseId: matter.id });
  return res.json({ case: matter });
});

app.delete("/api/cases/:id", authRequired, requirePermission(PERMISSIONS.CASE_DELETE), async (req, res) => {
  const idx = req.db.data.cases.findIndex((c) => c.id === req.params.id && c.ownerId === req.authUser.id);
  if (idx < 0) {
    return res.status(404).json({ error: "Case not found" });
  }

  const caseId = req.db.data.cases[idx].id;
  req.db.data.cases.splice(idx, 1);
  await createAuditLog(req.db, req, "CASE_DELETED", req.authUser.id, { caseId });
  return res.status(204).send();
});

app.get("/api/documents", authRequired, async (req, res) => {
  const documents = req.db.data.documents
    .filter((d) => d.ownerId === req.authUser.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json({ documents });
});

app.post("/api/documents", authRequired, upload.single("file"), async (req, res) => {
  const { title, type, linkedCaseId, linkedClientId, notes } = req.body || {};
  if (!title) {
    return res.status(400).json({ error: "Document title is required" });
  }

  const stored = await saveUploadedFile(req.file);
  const document = {
    id: crypto.randomUUID(),
    ownerId: req.authUser.id,
    title: String(title).trim(),
    type: type ? String(type).trim() : "general",
    linkedCaseId: linkedCaseId ? String(linkedCaseId).trim() : "",
    linkedClientId: linkedClientId ? String(linkedClientId).trim() : "",
    notes: notes ? String(notes).trim() : "",
    storageProvider: stored.storageProvider,
    storageKey: stored.storageKey,
    filePath: stored.filePath,
    fileName: stored.fileName,
    mimeType: stored.mimeType,
    fileSize: stored.fileSize,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  req.db.data.documents.push(document);
  await createAuditLog(req.db, req, "DOCUMENT_CREATED", req.authUser.id, { documentId: document.id, hasFile: Boolean(req.file) });
  return res.status(201).json({ document });
});

app.put("/api/documents/:id", authRequired, upload.single("file"), async (req, res) => {
  const { title, type, linkedCaseId, linkedClientId, notes } = req.body || {};
  if (!title) {
    return res.status(400).json({ error: "Document title is required" });
  }

  const document = req.db.data.documents.find((d) => d.id === req.params.id && d.ownerId === req.authUser.id);
  if (!document) {
    return res.status(404).json({ error: "Document not found" });
  }

  document.title = String(title).trim();
  document.type = type ? String(type).trim() : "general";
  document.linkedCaseId = linkedCaseId ? String(linkedCaseId).trim() : "";
  document.linkedClientId = linkedClientId ? String(linkedClientId).trim() : "";
  document.notes = notes ? String(notes).trim() : "";

  if (req.file) {
    await deleteStoredFile(document);
    const stored = await saveUploadedFile(req.file);
    document.storageProvider = stored.storageProvider;
    document.storageKey = stored.storageKey;
    document.filePath = stored.filePath;
    document.fileName = stored.fileName;
    document.mimeType = stored.mimeType;
    document.fileSize = stored.fileSize;
  }

  document.updatedAt = new Date().toISOString();
  await createAuditLog(req.db, req, "DOCUMENT_UPDATED", req.authUser.id, { documentId: document.id, hasFile: Boolean(req.file) });
  return res.json({ document });
});

app.get("/api/documents/:id/download", authRequired, async (req, res) => {
  const document = req.db.data.documents.find((d) => d.id === req.params.id && d.ownerId === req.authUser.id);
  if (!document) {
    return res.status(404).json({ error: "Document not found" });
  }
  const stream = await openStoredFileStream(document);
  if (!stream) {
    return res.status(404).json({ error: "No file attached to this document" });
  }
  if (document.mimeType) {
    res.setHeader("Content-Type", document.mimeType);
  }
  res.setHeader("Content-Disposition", `attachment; filename=\"${document.fileName || "document"}\"`);
  stream.pipe(res);
});

app.delete("/api/documents/:id", authRequired, requirePermission(PERMISSIONS.DOCUMENT_DELETE), async (req, res) => {
  const idx = req.db.data.documents.findIndex((d) => d.id === req.params.id && d.ownerId === req.authUser.id);
  if (idx < 0) {
    return res.status(404).json({ error: "Document not found" });
  }

  const doc = req.db.data.documents[idx];
  await deleteStoredFile(doc);

  req.db.data.documents.splice(idx, 1);
  await createAuditLog(req.db, req, "DOCUMENT_DELETED", req.authUser.id, { documentId: doc.id });
  return res.status(204).send();
});

app.get("/api/messages", authRequired, async (req, res) => {
  const messages = req.db.data.messages
    .filter((m) => m.ownerId === req.authUser.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json({ messages });
});

app.post("/api/messages", authRequired, async (req, res) => {
  const { subject, toName, channel, linkedCaseId, linkedClientId, body } = req.body || {};
  if (!subject || !body) {
    return res.status(400).json({ error: "Subject and message body are required" });
  }

  const message = {
    id: crypto.randomUUID(),
    ownerId: req.authUser.id,
    subject: String(subject).trim(),
    toName: toName ? String(toName).trim() : "",
    channel: channel ? String(channel).trim() : "email",
    linkedCaseId: linkedCaseId ? String(linkedCaseId).trim() : "",
    linkedClientId: linkedClientId ? String(linkedClientId).trim() : "",
    body: String(body).trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  req.db.data.messages.push(message);
  await createAuditLog(req.db, req, "MESSAGE_CREATED", req.authUser.id, { messageId: message.id });
  return res.status(201).json({ message });
});

app.put("/api/messages/:id", authRequired, async (req, res) => {
  const { subject, toName, channel, linkedCaseId, linkedClientId, body } = req.body || {};
  if (!subject || !body) {
    return res.status(400).json({ error: "Subject and message body are required" });
  }

  const message = req.db.data.messages.find((m) => m.id === req.params.id && m.ownerId === req.authUser.id);
  if (!message) {
    return res.status(404).json({ error: "Message not found" });
  }

  message.subject = String(subject).trim();
  message.toName = toName ? String(toName).trim() : "";
  message.channel = channel ? String(channel).trim() : "email";
  message.linkedCaseId = linkedCaseId ? String(linkedCaseId).trim() : "";
  message.linkedClientId = linkedClientId ? String(linkedClientId).trim() : "";
  message.body = String(body).trim();
  message.updatedAt = new Date().toISOString();

  await createAuditLog(req.db, req, "MESSAGE_UPDATED", req.authUser.id, { messageId: message.id });
  return res.json({ message });
});

app.delete("/api/messages/:id", authRequired, requirePermission(PERMISSIONS.MESSAGE_DELETE), async (req, res) => {
  const idx = req.db.data.messages.findIndex((m) => m.id === req.params.id && m.ownerId === req.authUser.id);
  if (idx < 0) {
    return res.status(404).json({ error: "Message not found" });
  }

  const messageId = req.db.data.messages[idx].id;
  req.db.data.messages.splice(idx, 1);
  await createAuditLog(req.db, req, "MESSAGE_DELETED", req.authUser.id, { messageId });
  return res.status(204).send();
});

app.get("/api/stats", authRequired, async (req, res) => {
  const ownerId = req.authUser.id;
  const cases = req.db.data.cases.filter((c) => c.ownerId === ownerId);
  const clients = req.db.data.clients.filter((c) => c.ownerId === ownerId);
  const documents = req.db.data.documents.filter((d) => d.ownerId === ownerId);
  const messages = req.db.data.messages.filter((m) => m.ownerId === ownerId);

  const activeCases = cases.filter((c) => c.status !== "closed").length;
  const upcomingHearings = cases.filter((c) => c.nextHearingDate).length;

  return res.json({
    stats: {
      activeCases,
      clients: clients.length,
      documents: documents.length,
      messages: messages.length,
      upcomingHearings
    }
  });
});

app.get("/api/audit-logs", authRequired, requirePermission(PERMISSIONS.AUDIT_READ), async (req, res) => {
  const logs = req.db.data.auditLogs
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 200);
  return res.json({ logs });
});

app.use(express.static(path.join(__dirname, "..", "client")));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "index.html"));
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.message) {
    if (err.message.includes("CORS")) {
      return res.status(403).json({ error: err.message });
    }
    if (err.message.includes("Unsupported file type")) {
      return res.status(400).json({ error: err.message });
    }
  }
  return res.status(500).json({ error: "Internal server error" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`LawEase running on http://localhost:${PORT}`);
  });
}

module.exports = app;
