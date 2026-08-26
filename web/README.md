# Vitácora — web

Next.js 16 (App Router) + Tailwind v4 + shadcn/ui (Base UI) + Recharts.

Ver el README del proyecto en la raíz del repo para el checklist de setup
completo (Neon, Garmin, Google Health, Vercel, Anthropic).

```bash
cp .env.example .env.local   # completar DATABASE_URL, VITACORA_PASSWORD, VITACORA_SESSION_SECRET
npm install
npm run dev                  # http://localhost:3000
npm run test                 # node --test, unidades puras (brief, fill-missing-days, anti-alucinación)
npm run build                # incluye type-check
```
