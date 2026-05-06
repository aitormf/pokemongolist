from datetime import datetime
from pydantic import BaseModel, field_validator


class RegisterRequest(BaseModel):
    token: str
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3 or len(v) > 32:
            raise ValueError("El nombre de usuario debe tener entre 3 y 32 caracteres")
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError(
                "Solo se permiten letras, números, guiones y guiones bajos"
            )
        return v

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("La contraseña debe tener al menos 6 caracteres")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    language: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PasswordResetOut(BaseModel):
    token: str
    expires_at: datetime

    model_config = {"from_attributes": True}


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("La contraseña debe tener al menos 6 caracteres")
        return v


class InviteOut(BaseModel):
    id: int
    token: str
    created_by: int | None
    used_by: int | None
    created_at: datetime
    expires_at: datetime | None
    used_at: datetime | None

    model_config = {"from_attributes": True}


class PokemonFormOut(BaseModel):
    id: str
    pokedex_number: int
    pokemon_id: str
    form: str | None
    type1: str | None
    type2: str | None
    family_id: str | None
    parent_pokemon_id: str | None
    is_tradable: bool
    has_shiny: bool
    stats: dict | None
    quick_moves: list | None
    cinematic_moves: list | None
    elite_cinematic_move: list | None

    model_config = {"from_attributes": True}


class FlagOut(BaseModel):
    user_id: int
    pokemon_form_id: str
    flag_name: str
    value: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class AllFlagsOut(BaseModel):
    # pokemon_form_id -> username -> flag_name -> value
    flags: dict[str, dict[str, dict[str, bool]]]
    users: list[UserOut]


class SourceStatusOut(BaseModel):
    source_name: str
    remote_version: str | None
    local_version: str | None
    update_available: bool
    last_checked_at: datetime | None
    last_updated_at: datetime | None
