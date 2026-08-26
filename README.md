# Vitácora

Dashboard personal de salud: cruza datos de Garmin Connect y Fitbit Aria Air
(vía Google Health API), con recomendaciones de IA (BYO key) y check-ins
diarios opcionales. Ver el plan completo en
`~/.claude/plans/zippy-giggling-widget.md`.

## Qué está construido

- **`sync/`** (Python 3.12+): adaptadores de Garmin y Google Health,
  motor de métricas determinista (`metrics.py`, 16 tests) y su segunda
  pasada de rollups (`compute_rollups.py`, 3 tests) — **19/19 tests
  pasando**, cero dependencia de credenciales reales.
- **`web/`** (Next.js 16 + Tailwind v4 + shadcn/ui + Recharts): las tres
  pestañas (Hoy/Vitales/Tendencias), check-in diario, capa de IA con la
  key solo en el browser, auth de un solo usuario, CSP en producción —
  **build limpio, lint limpio, 9/9 tests pasando**.
- **`.github/workflows/daily-sync.yml`**: cron diario que corre el sync
  y los rollups.

## Qué falta -- y es lo único que yo no puedo hacer por vos

Todo lo de abajo requiere tus cuentas y tus clicks. Está en el orden en
que tiene sentido hacerlo. Cuando termines cada paso, contame y seguimos
con el deploy.

### 1. Neon Postgres (gratis, 5 minutos)

1. Creá una cuenta en [neon.tech](https://neon.tech), proyecto nuevo
   llamado `vitacora`.
2. Copiá el connection string (viene con `sslmode=require` incluido).
3. Aplicá el schema:
   ```bash
   psql "$DATABASE_URL" -f sync/schema.sql
   ```
4. Guardá ese connection string -- lo vas a pegar en tres lugares:
   `sync/.env`, `web/.env.local`, y los secrets de GitHub/Vercel.

### 2. Export GDPR de Garmin (pedilo YA, tarda 1-3 días en llegar por mail)

1. [garmin.com/account/datamanagement](https://www.garmin.com/en-GB/account/datamanagement/)
   → "Export Your Data".
2. Cuando llegue el mail: descomprimí el ZIP, el historial de bienestar
   está en `DI_CONNECT/DI-Connect-Wellness/*.json` y las actividades en
   `.fit` sueltos. **Esto todavía no tiene parser escrito** -- lo dejé
   afuera de v1 a propósito (ver plan, Fase 1 paso 1: es la forma de
   traer el historial, el sync en vivo solo trae de acá en adelante).
   Cuando quieras el backfill histórico, decime y lo escribo contra los
   archivos reales que te lleguen.

### 3. Credenciales de Garmin para el sync en vivo

Solo tu email y contraseña de Garmin Connect (si tenés MFA activado, la
primera corrida te va a pedir el código por consola). Van a
`sync/.env` (local) y a los secrets de GitHub (`GARMIN_EMAIL`,
`GARMIN_PASSWORD`).

⚠️ Esto usa una librería no oficial (`python-garminconnect`) -- ver plan,
riesgo #1: viola los ToS de Garmin, el riesgo práctico es bajo pero no
cero, y se puede volver a romper cuando Garmin cambie algo (pasó en
marzo 2026). Si eso pasa, la web sigue sirviendo los últimos datos que
haya en la DB, no se cae.

### 4. Google Cloud Console (para reemplazar la Fitbit Web API, que muere en septiembre 2026)

1. [console.cloud.google.com](https://console.cloud.google.com) → proyecto
   nuevo `vitacora`.
2. Buscá **"Google Health API"** en la biblioteca de APIs y habilitala.
3. **OAuth consent screen**: tipo "External" (o "Internal" si tu cuenta
   es Workspace), agregá los 3 scopes:
   `googlehealth.activity_and_fitness.readonly`,
   `googlehealth.sleep.readonly`,
   `googlehealth.health_metrics_and_measurements.readonly`.
   **Publicala en estado "In Production" sin pedir verificación** (vas a
   ver un cartel de "app no verificada" al loguearte -- es esperado, no
   hay problema hasta 100 usuarios). ⚠️ Esto es importante: si queda en
   "Testing", el refresh token expira a los 7 días y el sync se rompe en
   silencio (ver plan, riesgo #2). Si Google no te deja publicar sin
   verificar, avisame y ajustamos el flujo.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth → tipo
   "App de escritorio"** (no "Aplicación web" -- el flujo de este
   proyecto abre el navegador local). Descargá el JSON.
5. Guardalo como `sync/client_secrets.json` (ya está en `.gitignore`,
   nunca se commitea).
6. Corré el sync una vez en tu máquina para completar el consentimiento:
   ```bash
   cd sync && source .venv/bin/activate  # o el venv que uses
   python run_daily_sync.py
   ```
   Se va a abrir el navegador para el login de Google. Después de eso,
   el token queda guardado en `~/.vitacora/google_health_token.json`.
7. **Chequeo bloqueante** (ver plan, verificación end-to-end): esperá 8
   días y volvé a correr el sync. Si sigue andando sin pedir login de
   nuevo, el consent screen quedó bien configurado. Si te vuelve a pedir
   login, el token expiró a los 7 días -- volvé al paso 3 y confirmá que
   quedó en "In Production".

### 5. GitHub: repo privado + secrets

1. Creá el repo en GitHub como **privado** (son datos de salud) y
   pusheá esto.
2. Settings → Secrets and variables → Actions, agregá:
   - `DATABASE_URL`
   - `GARMIN_EMAIL`, `GARMIN_PASSWORD`
   - `GOOGLE_CLIENT_SECRETS_JSON` → pegá el contenido completo de
     `sync/client_secrets.json`
   - `GOOGLE_HEALTH_TOKEN_JSON` → pegá el contenido completo de
     `~/.vitacora/google_health_token.json` (generado en el paso 4.6)
3. El workflow `.github/workflows/daily-sync.yml` ya está armado --
   corre solo, todos los días a las 06:00 ART. Podés dispararlo a mano
   desde la pestaña Actions (`workflow_dispatch`) para probarlo ahora.

### 6. Desarrollo local de la web

```bash
cd web
cp .env.example .env.local   # completá DATABASE_URL, VITACORA_PASSWORD,
                              # VITACORA_SESSION_SECRET (openssl rand -hex 32)
npm install
npm run dev
```

### 7. Deploy en Vercel

1. Importá el repo en [vercel.com](https://vercel.com).
2. Root directory: `web`.
3. Variables de entorno (las mismas que `.env.local`): `DATABASE_URL`,
   `VITACORA_PASSWORD`, `VITACORA_SESSION_SECRET`.
4. Deploy.
5. DNS: CNAME de `vitacora` apuntando al dominio que te da Vercel (el
   mismo patrón que ya usás en `santiago-sosa-web`, que sirve por GitHub
   Pages con CNAME -- acá es el mismo tipo de registro pero apuntando a
   Vercel en vez de a GitHub).

### 8. Tu API key de Anthropic

1. [console.anthropic.com](https://console.anthropic.com) → creá un
   **Workspace dedicado** para Vitácora, con un límite de gasto mensual
   (recomendado, no obligatorio).
2. Generá una key ahí adentro.
3. Entrá a `vitacora.tudominio/settings` y pegala -- se guarda cifrada
   solo en tu navegador, el server nunca la ve.

## Verificación (una vez que tengas la DB)

```bash
# La ingesta trajo algo, de las dos fuentes
psql "$DATABASE_URL" -c "SELECT source, count(*), min(local_date), max(local_date) FROM daily_metric GROUP BY source"

# El motor determinista sigue verde
cd sync && .venv/bin/python -m pytest -q          # 19/19
cd ../web && npm run test                          # 9/9

# El brief que le llega a la IA entra en presupuesto y es rastreable
curl -s http://localhost:3000/api/brief | wc -c     # apuntá a <20KB
```

## Lo que se dejó afuera a propósito (v1)

Ver la sección completa en el plan. Los más relevantes hoy:

- **Parser del export GDPR de Garmin** (backfill histórico): el
  adaptador en vivo está listo, el parser de los `.fit`/JSON del export
  todavía no -- lo escribo cuando tengas el ZIP en la mano.
- **Sesiones de sueño con stages** (de Google Health): la báscula
  (peso/grasa corporal) y los escalares (pasos, FC en reposo) ya están;
  sueño detallado queda para cuando el resto esté probado en producción.
- **Perfil de usuario** (edad, altura, objetivos): el brief de IA no lo
  usa todavía -- agregalo cuando quieras que las recomendaciones lo
  tengan en cuenta.
- Todo lo demás: agregadores pagos, webhooks, score compuesto propio,
  auth multiusuario -- deliberadamente no van en v1 (ver plan).
