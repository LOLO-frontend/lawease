# LawEase

Full-stack legal SaaS MVP with:
- Auth (signup/login/me)
- Role-based access control (`admin`, `lawyer`, `staff`)
- Password reset token flow
- Clients, Cases, Documents, Messages CRUD
- Document file uploads (local disk)
- Optional S3-backed document storage
- Audit logs for critical actions
- Rate limiting + Helmet security defaults
- Automated API integration + UI smoke tests

## Local Run

```bash
cd project
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:4000`.

## Environment Variables

See `.env.example`:
- `PORT`
- `JWT_SECRET`
- `ALLOWED_ORIGIN` (comma-separated)
- `DB_FILE`
- `UPLOAD_DIR`
- `S3_BUCKET`
- `S3_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`
- `PASSWORD_RESET_TOKEN_TTL_MINUTES`
- `NODE_ENV`

## Roles and Permissions

- `admin`: full access + user role management + audit logs
- `lawyer`: full case/client/document/message workflows (including deletes)
- `staff`: create/read/update workflows, no delete actions

First account created becomes `admin` automatically.

## Password Reset

Endpoints:
- `POST /api/auth/request-password-reset`
- `POST /api/auth/reset-password`

In non-production, request endpoint returns `resetToken` for local testing.

## File Uploads

Document endpoint supports multipart form uploads (`file` field):
- `POST /api/documents`
- `PUT /api/documents/:id`
- `GET /api/documents/:id/download`

For S3 storage, set `S3_BUCKET` and `S3_REGION` (plus AWS credentials).  
If unset, storage defaults to local disk (`UPLOAD_DIR`).

## Tests

```bash
npm test
```

Includes:
- `tests/api.test.js` integration flow (auth + CRUD + uploads + stats + reset)
- `tests/ui-smoke.test.js` basic HTML/script wiring checks

## Deploy

### Render
- Use `render.yaml`
- Add a persistent disk mounted to `/var/data` (already configured in `render.yaml`)
- Set `ALLOWED_ORIGIN` to your app URL
- Optional S3 mode: add `S3_BUCKET`, `S3_REGION`, and AWS credentials

### Railway
- Uses `railway.json` + Dockerfile
- Configure persistent volume and set:
  - `DB_FILE=/data/data.json`
  - `UPLOAD_DIR=/data/uploads`
  - `ALLOWED_ORIGIN=<your-url>`
  - `JWT_SECRET=<strong-secret>`
- Optional S3 mode: add `S3_BUCKET`, `S3_REGION`, and AWS credentials
