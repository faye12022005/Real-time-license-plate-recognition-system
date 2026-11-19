"""Shared pytest fixtures."""

from __future__ import annotations

import os

import pytest

from config.settings import MYSQL_DATABASE
from src.database.connection import connection, init_db

TEST_DATABASE = os.getenv("ALPR_TEST_MYSQL_DATABASE", f"{MYSQL_DATABASE}_test")


def _clear_tables(database: str) -> None:
    with connection(database) as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM `plate_records`")
            cursor.execute("DELETE FROM `jobs`")


@pytest.fixture()
def mysql_database() -> str:
    """Provide a clean MySQL test database, skipping when MySQL is unavailable."""
    try:
        init_db(TEST_DATABASE)
        _clear_tables(TEST_DATABASE)
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"MySQL test database unavailable: {exc}")

    yield TEST_DATABASE

    try:
        _clear_tables(TEST_DATABASE)
    except Exception:  # noqa: BLE001
        pass
