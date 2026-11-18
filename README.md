# Job Agent (MEAN stack)

Auto-apply + HR email outreach + application tracker, multi-user, inspired by TickBig's Agent Ambo.

## Stack
- MongoDB + Express + Angular + Node.js
- Playwright for portal automation
- Nodemailer + Gmail OAuth for HR email
- BullMQ + Redis for job queues (optional)

## Run
```bash
# 1. DB
cd docker && docker compose up -d

# 2. Backend
cd ../backend && cp .env.example .env && npm install && npm run dev

# 3. Frontend
cd ../frontend && npm install && npx ng serve
```

## .env (backend)
```
PORT=4001
MONGO_URI=mongodb://admin:changeme@localhost:27017/jobagent?authSource=admin
JWT_SECRET=change-me
```

## Roadmap
- [x] Auth (register/login/JWT)
- [x] User profile (role, cities, skills, portals)
- [x] Job + Application models, CRUD, tracker
- [x] Match scorer (72/79/85 bands)
- [ ] Playwright auto-apply workers (Naukri, Shine, Hirist, LinkedIn, Indeed)
- [ ] HR email finder + Gmail OAuth sender + open tracking
- [ ] Angular dashboard (charts, filters, replies)
- [ ] Interview-prep module
- [ ] Chrome extension for company-site apply
- [ ] Multi-user admin + rate limiting per user

## Notes
- Never store portal passwords in plain text; encrypt at rest (use a KMS or AES with a server secret).
- Respect portal ToS and rate limits; use human-like delays.
- Gmail sending must use OAuth2, not password.
