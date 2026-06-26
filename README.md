# 🧵 Fabric Flow — Full Stack Project

React TypeScript + Node.js + MySQL fabric management system.

## Project Structure

```
fabric-flow/
├── backend/          Node.js + Express API
│   ├── db/           Database connection & schema
│   ├── middleware/   JWT auth middleware
│   ├── routes/       All API route handlers
│   └── server.js     Entry point (port 5000)
├── frontend/         React + TypeScript (Vite)
│   └── src/
│       ├── api/      Axios instance & all API calls
│       ├── context/  AuthContext (JWT state)
│       ├── pages/    Login, Register, AdminDashboard, ClientDashboard
│       └── App.tsx   Routes & protected routes
└── package.json      Root scripts using concurrently
```

## Quick Start

### 1. Database setup
```bash
# Run the SQL schema in your MySQL client
mysql -u root -p < backend/db/schema.sql
```

### 2. Backend environment
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your DB credentials and JWT secret
```

### 3. Frontend environment
```bash
cp frontend/.env.example frontend/.env
# VITE_API_URL=http://localhost:5000/api  (already set)
```

### 4. Install dependencies
```bash
npm run install:all
```

### 5. Run both servers
```bash
npm run dev
```

- Frontend → http://localhost:5173
- Backend  → http://localhost:5000

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | No | Register user |
| POST | /api/auth/login | No | Login, get token |
| GET | /api/dashboard | Yes | Summary stats |
| GET/POST/PUT/DELETE | /api/inward | Yes | Inward records |
| GET/POST/PUT/DELETE | /api/dyeing | Yes | Dyeing records |
| GET/POST/PUT/DELETE | /api/dispatch | Yes | Dispatch records |
| GET/POST/PUT/DELETE | /api/outward | Yes | Outward records |
| GET/POST/PUT/DELETE | /api/job-work | Yes | Job work |
| GET/POST/PUT/DELETE | /api/order-bookings | Yes | Order bookings |
| GET/POST/PUT/DELETE | /api/sample-requests | Yes | Sample requests |
| GET/POST/PUT/DELETE | /api/inward-processed | Yes | Inward processed |

## Roles

- **Admin** → full access to all modules + dashboard stats
- **Client** → can view their own orders and sample requests
