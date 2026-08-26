"""OAuth 2.0 para Google Health API.

Ver plan Fase 2, paso 1: antes de construir el cron encima de esto hay que
confirmar que el consent screen quede en "In Production" sin verificar --
en "Testing" el refresh token expira a los 7 días y el sync diario se
rompe en silencio.
"""

from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
    "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
    "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
]

DEFAULT_TOKEN_PATH = str(Path.home() / ".vitacora" / "google_health_token.json")


def get_credentials(client_secrets_path: str, token_path: str = DEFAULT_TOKEN_PATH) -> Credentials:
    """Primera corrida: abre el navegador (`run_local_server`) y guarda el
    token. Corridas siguientes: carga el token guardado y lo refresca en
    silencio -- nunca vuelve a pedir consentimiento salvo que el refresh
    token haya expirado (si eso pasa, revisar el estado del consent
    screen antes que nada)."""
    token_file = Path(token_path)
    creds: Credentials | None = None
    if token_file.exists():
        creds = Credentials.from_authorized_user_file(str(token_file), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(client_secrets_path, SCOPES)
            creds = flow.run_local_server(port=0)
        token_file.parent.mkdir(parents=True, exist_ok=True)
        token_file.write_text(creds.to_json())

    return creds
