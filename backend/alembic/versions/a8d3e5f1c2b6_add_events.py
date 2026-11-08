"""add events and event_pokemon

Revision ID: a8d3e5f1c2b6
Revises: f4b1c8d2e9a7
Create Date: 2026-11-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a8d3e5f1c2b6"
down_revision: Union[str, None] = "f4b1c8d2e9a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "events",
        sa.Column("id", sa.String(255), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("heading", sa.String(128), nullable=True),
        sa.Column("link", sa.Text(), nullable=True),
        sa.Column("image", sa.Text(), nullable=True),
        sa.Column("start", sa.String(32), nullable=True),
        sa.Column("end", sa.String(32), nullable=True),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("bonuses", postgresql.JSONB(), nullable=True),
        sa.Column("detail_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "event_pokemon",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.String(255), nullable=False),
        sa.Column("section", sa.String(32), nullable=False),
        sa.Column("subsection", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("can_be_shiny", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("pokedex_number", sa.Integer(), nullable=True),
        sa.Column("pokemon_form_id", sa.String(128), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["pokemon_form_id"], ["pokemon_forms.id"], ondelete="SET NULL"
        ),
    )
    op.create_index("ix_event_pokemon_event_id", "event_pokemon", ["event_id"])
    op.execute("INSERT INTO source_versions (source_name) VALUES ('events')")


def downgrade() -> None:
    op.execute("DELETE FROM source_versions WHERE source_name = 'events'")
    op.drop_index("ix_event_pokemon_event_id", table_name="event_pokemon")
    op.drop_table("event_pokemon")
    op.drop_table("events")
