# Deploy Order

## 1) Prepare Production Env

Set these secrets/vars in your platform:
- `NODE_ENV=production`
- `PORT=4000`
- `JWT_SECRET=<long-random-secret>`
- `ALLOWED_ORIGIN=https://<your-domain>`
- `DB_FILE=/var/data/data.json` (Render) or `/data/data.json` (Railway)
- `UPLOAD_DIR=/var/data/uploads` (Render) or `/data/uploads` (Railway)

Optional S3 storage:
- `S3_BUCKET=<bucket-name>`
- `S3_REGION=<region>`
- `AWS_ACCESS_KEY_ID=<key>`
- `AWS_SECRET_ACCESS_KEY=<secret>`
- `AWS_SESSION_TOKEN=<token-if-needed>`

Free durable mode recommendation:
- `MONGODB_URI=<mongodb-atlas-connection-string>`
- `MONGODB_DB_NAME=lawease`
- `MONGODB_COLLECTION=app_state`
- `MONGODB_STATE_KEY=primary`
- `S3_BUCKET`, `S3_REGION`, and credentials (or Cloudflare R2 using `S3_ENDPOINT`)

## 2) Render (Recommended)

1. Push repo to GitHub.
2. In Render: `New +` -> `Blueprint`.
3. Select the repo and deploy using `render.yaml`.
4. Confirm persistent disk is attached at `/var/data`.
5. Set `ALLOWED_ORIGIN` to your final domain.
6. Redeploy after env changes.

## 3) Railway

1. Create new project from GitHub repo.
2. Railway detects `Dockerfile`/`railway.json`.
3. Add persistent volume mounted at `/data`.
4. Set `DB_FILE=/data/data.json` and `UPLOAD_DIR=/data/uploads`.
5. Set `ALLOWED_ORIGIN` and `JWT_SECRET`.

## 4) Post-Deploy Checks

Run:
- `GET /api/health` should return `ok: true`
- Sign up first admin user
- Create client/case/document/message
- Open `admin.html` and verify user/audit views
- Upload/download one document

## 5) Free Durable Providers

- DB: MongoDB Atlas free cluster (`MONGODB_URI`)
- Files: Cloudflare R2 or AWS S3 free tier (`S3_*` + credentials)
