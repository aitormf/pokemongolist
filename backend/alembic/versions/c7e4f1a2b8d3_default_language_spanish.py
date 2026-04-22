"""default language Spanish

Revision ID: c7e4f1a2b8d3
Revises: a16b9be7ea51
Create Date: 2026-04-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c7e4f1a2b8d3"
down_revision: Union[str, None] = "a16b9be7ea51"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "language",
        existing_type=sa.String(32),
        server_default=sa.text("'Spanish'"),
        nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "users",
        "language",
        existing_type=sa.String(32),
        server_default=sa.text("'English'"),
        nullable=False,
    )
