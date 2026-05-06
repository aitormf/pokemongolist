from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://pokemon:pokemon@db:5432/pokemondb"
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    invite_expire_days: int = 7
    reset_token_expire_hours: int = 24
    data_dir: str = "/app/data"

    model_config = {"env_file": ".env"}


settings = Settings()
