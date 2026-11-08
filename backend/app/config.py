from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://pokemon:pokemon@db:5432/pokemondb"
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    invite_expire_days: int = 7
    reset_token_expire_hours: int = 24
    data_dir: str = "/app/data"
    # Actualizaciones automáticas, en horas (0 = desactivada)
    events_refresh_hours: int = 24
    data_refresh_hours: int = 24 * 7  # Game Master y assets: semanal

    model_config = {"env_file": ".env"}


settings = Settings()
