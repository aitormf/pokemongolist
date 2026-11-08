"""add is_costume to pokemon_forms

Revision ID: f4b1c8d2e9a7
Revises: e3a9d2c1f5b8
Create Date: 2026-11-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f4b1c8d2e9a7"
down_revision: Union[str, None] = "e3a9d2c1f5b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "pokemon_forms",
        sa.Column(
            "is_costume", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade() -> None:
    op.drop_column("pokemon_forms", "is_costume")
