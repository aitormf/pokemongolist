from datetime import datetime, timezone
from sqlalchemy import (
    Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
import uuid

from app.db import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="user")
    language: Mapped[str] = mapped_column(String(32), nullable=False, default="Spanish")
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    flags: Mapped[list["UserFlag"]] = relationship(
        "UserFlag", back_populates="user", cascade="all, delete-orphan"
    )
    invites_created: Mapped[list["Invite"]] = relationship(
        "Invite", foreign_keys="Invite.created_by", back_populates="creator"
    )


class Invite(Base):
    __tablename__ = "invites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(
        String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4())
    )
    created_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    used_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    creator: Mapped["User | None"] = relationship(
        "User", foreign_keys=[created_by], back_populates="invites_created"
    )


class PokemonForm(Base):
    __tablename__ = "pokemon_forms"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    pokedex_number: Mapped[int] = mapped_column(Integer, nullable=False)
    pokemon_id: Mapped[str] = mapped_column(String(64), nullable=False)
    form: Mapped[str | None] = mapped_column(String(128))
    type1: Mapped[str | None] = mapped_column(String(32))
    type2: Mapped[str | None] = mapped_column(String(32))
    family_id: Mapped[str | None] = mapped_column(String(64))
    parent_pokemon_id: Mapped[str | None] = mapped_column(String(64))
    is_tradable: Mapped[bool] = mapped_column(Boolean, default=False)
    has_shiny: Mapped[bool] = mapped_column(Boolean, default=False)
    stats: Mapped[dict | None] = mapped_column(JSONB)
    quick_moves: Mapped[list | None] = mapped_column(JSONB)
    cinematic_moves: Mapped[list | None] = mapped_column(JSONB)
    elite_cinematic_move: Mapped[list | None] = mapped_column(JSONB)
    data_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    flags: Mapped[list["UserFlag"]] = relationship(
        "UserFlag", back_populates="pokemon_form", cascade="all, delete-orphan"
    )


class UserFlag(Base):
    __tablename__ = "user_flags"
    __table_args__ = (
        UniqueConstraint("user_id", "pokemon_form_id", "flag_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    pokemon_form_id: Mapped[str] = mapped_column(
        String(128), ForeignKey("pokemon_forms.id", ondelete="CASCADE"), nullable=False
    )
    flag_name: Mapped[str] = mapped_column(String(32), nullable=False)
    value: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="flags")
    pokemon_form: Mapped["PokemonForm"] = relationship(
        "PokemonForm", back_populates="flags"
    )


class SourceVersion(Base):
    __tablename__ = "source_versions"

    source_name: Mapped[str] = mapped_column(String(32), primary_key=True)
    remote_version: Mapped[str | None] = mapped_column(Text)
    local_version: Mapped[str | None] = mapped_column(Text)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
