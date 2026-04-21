"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.String(16), nullable=False, server_default="user"),
        sa.Column("language", sa.String(32), nullable=False, server_default="English"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
    )

    op.create_table(
        "invites",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(36), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("used_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["used_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )

    op.create_table(
        "pokemon_forms",
        sa.Column("id", sa.String(128), nullable=False),
        sa.Column("pokedex_number", sa.Integer(), nullable=False),
        sa.Column("pokemon_id", sa.String(64), nullable=False),
        sa.Column("form", sa.String(128), nullable=True),
        sa.Column("type1", sa.String(32), nullable=True),
        sa.Column("type2", sa.String(32), nullable=True),
        sa.Column("family_id", sa.String(64), nullable=True),
        sa.Column("parent_pokemon_id", sa.String(64), nullable=True),
        sa.Column("is_tradable", sa.Boolean(), server_default="false"),
        sa.Column("has_shiny", sa.Boolean(), server_default="false"),
        sa.Column("stats", JSONB(), nullable=True),
        sa.Column("quick_moves", JSONB(), nullable=True),
        sa.Column("cinematic_moves", JSONB(), nullable=True),
        sa.Column("elite_cinematic_move", JSONB(), nullable=True),
        sa.Column("data_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pokemon_forms_pokedex", "pokemon_forms", ["pokedex_number"])
    op.create_index("ix_pokemon_forms_pokemon_id", "pokemon_forms", ["pokemon_id"])

    op.create_table(
        "user_flags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("pokemon_form_id", sa.String(128), nullable=False),
        sa.Column("flag_name", sa.String(32), nullable=False),
        sa.Column("value", sa.Boolean(), server_default="true"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["pokemon_form_id"], ["pokemon_forms.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "pokemon_form_id", "flag_name"),
    )
    op.create_index("ix_user_flags_user_id", "user_flags", ["user_id"])
    op.create_index(
        "ix_user_flags_pokemon_form_id", "user_flags", ["pokemon_form_id"]
    )

    op.create_table(
        "source_versions",
        sa.Column("source_name", sa.String(32), nullable=False),
        sa.Column("remote_version", sa.Text(), nullable=True),
        sa.Column("local_version", sa.Text(), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("source_name"),
    )

    # Seed source_versions rows
    op.execute(
        "INSERT INTO source_versions (source_name) VALUES "
        "('game_master'), ('translations'), ('assets')"
    )


def downgrade() -> None:
    op.drop_table("user_flags")
    op.drop_table("pokemon_forms")
    op.drop_table("invites")
    op.drop_table("users")
    op.drop_table("source_versions")
