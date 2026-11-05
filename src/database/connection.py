"""Database connection and initialization with Multi-Engine Support.

Supports:
- MySQL 8.0+ / 9.0+ (via PyMySQL) -> Active on port 3306 (user 'root')
- Microsoft SQL Server (via pyodbc) -> Port 1433
- SQLite 3 (WAL mode fallback) -> data/alpr.db

Includes automatic parameter normalization (:param -> %s or ?),
smart RowDict wrappers (supporting row['col'], row[0], and dict(row)),
and automatic table initialization with zero sample data.
"""

from collections.abc import Mapping
import os
from pathlib import Path
import re
import sqlite3
import time
from typing import Any, Dict, List, Optional, Tuple

from config.settings import (
    DB_ENGINE,
    DB_PATH,
    MYSQL_DB,
    MYSQL_HOST,
    MYSQL_PASSWORD,
    MYSQL_PORT,
    MYSQL_USER,
    SQLSERVER_DB,
    SQLSERVER_DRIVER,
    SQLSERVER_HOST,
    SQLSERVER_PASSWORD,
    SQLSERVER_PORT,
    SQLSERVER_TRUSTED,
    SQLSERVER_USER,
)

DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# Detect drivers
try:
    import pymysql  # type: ignore
    HAS_PYMYSQL = True
except ImportError:
    HAS_PYMYSQL = False

try:
    import pyodbc  # type: ignore
    HAS_PYODBC = True
except ImportError:
    HAS_PYODBC = False


# ==============================================================================
# Universal Row Wrapper
# ==============================================================================

class RowDict(dict):
    """Dictionary subclass that supports both string keys (row['id']),
    integer index access (row[0]), and dict conversion dict(row).
    """

    def __init__(self, items: Any, cols: Optional[List[str]] = None) -> None:
        super().__init__(items)
        self._cols: List[str] = cols or list(self.keys())

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            if 0 <= key < len(self._cols):
                return super().__getitem__(self._cols[key])
            raise IndexError(f"Column index {key} out of range (total {len(self._cols)})")
        return super().__getitem__(key)


# ==============================================================================
# MySQL Wrapper (PyMySQL)
# ==============================================================================

class MySQLCursorWrapper:
    """Wraps PyMySQL cursor to normalize SQL, bind named parameters :param, and return RowDict."""

    def __init__(self, raw_cursor: Any) -> None:
        self.cursor = raw_cursor

    def execute(self, query: str, params: Optional[Dict[str, Any]] = None) -> "MySQLCursorWrapper":
        # Emulate sqlite_master table inspection
        if "sqlite_master" in query:
            self.cursor.execute("SELECT table_name as name FROM information_schema.tables WHERE table_schema = DATABASE()")
            return self

        # Convert SQLite syntax: INSERT OR REPLACE INTO -> REPLACE INTO
        sql = re.sub(r"INSERT\s+OR\s+REPLACE\s+INTO", "REPLACE INTO", query, flags=re.IGNORECASE)

        if params:
            # Extract named params in appearance order and replace with %s
            param_names = re.findall(r":([a-zA-Z0-9_]+)", sql)
            clean_sql = re.sub(r":[a-zA-Z0-9_]+", "%s", sql)
            values = tuple(params.get(name) for name in param_names)
            self.cursor.execute(clean_sql, values)
        else:
            self.cursor.execute(sql)
        return self

    def fetchone(self) -> Optional[RowDict]:
        row = self.cursor.fetchone()
        if not row or not self.cursor.description:
            return None
        cols = [col[0] for col in self.cursor.description]
        return RowDict({cols[i]: val for i, val in enumerate(row)}, cols=cols)

    def fetchall(self) -> List[RowDict]:
        rows = self.cursor.fetchall()
        if not rows or not self.cursor.description:
            return []
        cols = [col[0] for col in self.cursor.description]
        return [RowDict({cols[i]: val for i, val in enumerate(r)}, cols=cols) for r in rows]

    @property
    def rowcount(self) -> int:
        return self.cursor.rowcount

    def close(self) -> None:
        self.cursor.close()


class MySQLConnectionWrapper:
    """Wraps PyMySQL connection to provide uniform interface with SQLite and SQL Server."""

    def __init__(self, raw_conn: Any) -> None:
        self.conn = raw_conn

    def cursor(self) -> MySQLCursorWrapper:
        return MySQLCursorWrapper(self.conn.cursor())

    def execute(self, query: str, params: Optional[Dict[str, Any]] = None) -> MySQLCursorWrapper:
        c = self.cursor()
        c.execute(query, params)
        return c

    def commit(self) -> None:
        self.conn.commit()

    def rollback(self) -> None:
        self.conn.rollback()

    def close(self) -> None:
        self.conn.close()


# ==============================================================================
# Microsoft SQL Server Wrapper (pyodbc)
# ==============================================================================

class SQLServerCursorWrapper:
    """Wraps pyodbc cursor to support named parameters :param and return RowDict."""

    def __init__(self, raw_cursor: Any) -> None:
        self.cursor = raw_cursor

    def execute(self, query: str, params: Optional[Dict[str, Any]] = None) -> "SQLServerCursorWrapper":
        if params:
            param_names = re.findall(r":([a-zA-Z0-9_]+)", query)
            sql = re.sub(r":[a-zA-Z0-9_]+", "?", query)
            values = [params.get(name) for name in param_names]
            self.cursor.execute(sql, values)
        else:
            self.cursor.execute(query)
        return self

    def fetchone(self) -> Optional[RowDict]:
        row = self.cursor.fetchone()
        if not row or not self.cursor.description:
            return None
        cols = [col[0] for col in self.cursor.description]
        return RowDict({cols[i]: val for i, val in enumerate(row)}, cols=cols)

    def fetchall(self) -> List[RowDict]:
        rows = self.cursor.fetchall()
        if not rows or not self.cursor.description:
            return []
        cols = [col[0] for col in self.cursor.description]
        return [RowDict({cols[i]: val for i, val in enumerate(row)}, cols=cols) for row in rows]

    @property
    def rowcount(self) -> int:
        return self.cursor.rowcount

    def close(self) -> None:
        self.cursor.close()


class SQLServerConnectionWrapper:
    """Wraps pyodbc connection to provide uniform interface with SQLite."""

    def __init__(self, raw_conn: Any) -> None:
        self.conn = raw_conn

    def cursor(self) -> SQLServerCursorWrapper:
        return SQLServerCursorWrapper(self.conn.cursor())

    def execute(self, query: str, params: Optional[Dict[str, Any]] = None) -> SQLServerCursorWrapper:
        cursor = self.cursor()
        cursor.execute(query, params)
        return cursor

    def commit(self) -> None:
        self.conn.commit()

    def rollback(self) -> None:
        self.conn.rollback()

    def close(self) -> None:
        self.conn.close()


# ==============================================================================
# Connection Factories & Reachability Probes
# ==============================================================================

def get_mysql_raw_connection(create_db_if_missing: bool = True) -> Optional[Any]:
    """Establish a direct PyMySQL connection to MySQL Server."""
    if not HAS_PYMYSQL:
        return None

    try:
        if create_db_if_missing:
            # Connect to server root first to ensure database exists
            root_conn = pymysql.connect(
                host=MYSQL_HOST,
                port=MYSQL_PORT,
                user=MYSQL_USER,
                password=MYSQL_PASSWORD,
                connect_timeout=3,
            )
            cur = root_conn.cursor()
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{MYSQL_DB}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
            root_conn.commit()
            cur.close()
            root_conn.close()

        # Connect directly to target database
        conn = pymysql.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_DB,
            charset="utf8mb4",
            connect_timeout=3,
            autocommit=False,
        )
        return conn
    except Exception:
        return None


def is_mysql_reachable() -> bool:
    """Check if MySQL server is reachable."""
    raw = get_mysql_raw_connection(create_db_if_missing=False)
    if raw is not None:
        raw.close()
        return True
    return False


def find_best_sqlserver_driver() -> str:
    """Auto-detect the best available SQL Server ODBC driver on Windows."""
    if not HAS_PYODBC:
        return "SQL Server"
    available = pyodbc.drivers()
    preferred = [
        "ODBC Driver 18 for SQL Server",
        "ODBC Driver 17 for SQL Server",
        "ODBC Driver 13 for SQL Server",
        "SQL Server Native Client 11.0",
        "SQL Server",
    ]
    for drv in preferred:
        if drv in available:
            return drv
    return SQLSERVER_DRIVER or "SQL Server"


EXPECTED_TABLES = [
    "cameras",
    "resident_vehicles",
    "parking_sessions",
    "parking_captures",
    "video_jobs",
    "plates",
]


def ensure_sqlserver_database_exists() -> bool:
    """Connect to SQL Server master database and create target database if it does not exist."""
    if not HAS_PYODBC:
        return False
    driver = find_best_sqlserver_driver()
    if SQLSERVER_TRUSTED:
        conn_str = (
            f"DRIVER={{{driver}}};"
            f"SERVER={SQLSERVER_HOST},{SQLSERVER_PORT};"
            "DATABASE=master;"
            "Trusted_Connection=yes;"
            "TrustServerCertificate=yes;"
        )
    else:
        conn_str = (
            f"DRIVER={{{driver}}};"
            f"SERVER={SQLSERVER_HOST},{SQLSERVER_PORT};"
            "DATABASE=master;"
            f"UID={SQLSERVER_USER};"
            f"PWD={SQLSERVER_PASSWORD};"
            "TrustServerCertificate=yes;"
        )
    try:
        conn = pyodbc.connect(conn_str, timeout=2, autocommit=True)
        cur = conn.cursor()
        cur.execute(
            f"IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = '{SQLSERVER_DB}') "
            f"CREATE DATABASE [{SQLSERVER_DB}];"
        )
        cur.close()
        conn.close()
        return True
    except Exception:
        return False


def get_sqlserver_raw_connection(create_db_if_missing: bool = True) -> Optional[Any]:
    """Establish a direct pyodbc connection to Microsoft SQL Server."""
    if not HAS_PYODBC:
        return None

    if create_db_if_missing:
        ensure_sqlserver_database_exists()

    driver = find_best_sqlserver_driver()
    if SQLSERVER_TRUSTED:
        conn_str = (
            f"DRIVER={{{driver}}};"
            f"SERVER={SQLSERVER_HOST},{SQLSERVER_PORT};"
            f"DATABASE={SQLSERVER_DB};"
            "Trusted_Connection=yes;"
            "TrustServerCertificate=yes;"
        )
    else:
        conn_str = (
            f"DRIVER={{{driver}}};"
            f"SERVER={SQLSERVER_HOST},{SQLSERVER_PORT};"
            f"DATABASE={SQLSERVER_DB};"
            f"UID={SQLSERVER_USER};"
            f"PWD={SQLSERVER_PASSWORD};"
            "TrustServerCertificate=yes;"
        )

    try:
        conn = pyodbc.connect(conn_str, timeout=2)
        return conn
    except Exception:
        return None


def is_sqlserver_reachable() -> bool:
    """Check if Microsoft SQL Server is reachable."""
    raw = get_sqlserver_raw_connection(create_db_if_missing=False)
    if raw is not None:
        raw.close()
        return True
    return False


def get_sqlite_connection() -> sqlite3.Connection:
    """Create and return a configured SQLite database connection (WAL mode)."""
    conn = sqlite3.connect(str(DB_PATH), timeout=15.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


# ==============================================================================
# Active Connection Provider (Smart Routing)
# ==============================================================================

def get_connection() -> Any:
    """Get active database connection based on environment configuration.

    Routing Priority:
    1. If configured for MySQL / SQL Server on port 3306 or MySQL is reachable:
       Uses MySQL 8.0/9.0+ via PyMySQL (Wrapping ALPR_DB).
    2. If configured for MSSQL on port 1433 and MSSQL is reachable:
       Uses Microsoft SQL Server via pyodbc.
    3. Fallback:
       Uses local SQLite file at data/alpr.db (WAL mode).
    """
    if DB_ENGINE in ("mysql", "sqlserver", "mssql"):
        # Port 3306 indicates MySQL
        if MYSQL_PORT == 3306 or is_mysql_reachable():
            raw_mysql = get_mysql_raw_connection()
            if raw_mysql is not None:
                return MySQLConnectionWrapper(raw_mysql)

        # Port 1433 indicates MSSQL
        if is_sqlserver_reachable():
            raw_mssql = get_sqlserver_raw_connection()
            if raw_mssql is not None:
                return SQLServerConnectionWrapper(raw_mssql)

    # Fallback to local SQLite
    return get_sqlite_connection()


# ==============================================================================
# Table Initializations with Auto-Detection & Migration
# ==============================================================================

def init_mysql_tables(raw_conn: Any) -> None:
    """Check if tables exist in MySQL; if not, automatically create them (0 sample records)."""
    schema_path = Path(__file__).resolve().parent / "schema_mysql.sql"
    if not schema_path.is_file():
        return

    cur = raw_conn.cursor()
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE();")
    existing_tables = set(r[0] for r in cur.fetchall())
    missing_tables = [t for t in EXPECTED_TABLES if t not in existing_tables]

    if not missing_tables:
        print(f"[DATABASE] [MySQL] Bảng cơ sở dữ liệu đã tồn tại đầy đủ ({len(existing_tables)} bảng: {', '.join(sorted(existing_tables))}).")
        try:
            cur.execute("ALTER TABLE video_jobs ADD COLUMN processed_video_url VARCHAR(512) DEFAULT NULL;")
            raw_conn.commit()
        except Exception:
            pass
        cur.close()
        return

    print(f"[DATABASE] [MySQL] Phát hiện chưa có hoặc thiếu bảng trong '{MYSQL_DB}'. Danh sách thiếu: {missing_tables}")
    print("[DATABASE] [MySQL] Đang tự động chạy schema tạo bảng...")

    content = schema_path.read_text(encoding="utf-8")
    cleaned_lines = [line for line in content.splitlines() if not line.strip().startswith("--")]
    cleaned_sql = "\n".join(cleaned_lines)
    statements = [s.strip() for s in cleaned_sql.split(";") if s.strip()]

    for stmt in statements:
        if stmt:
            try:
                cur.execute(stmt)
            except Exception:
                pass
    raw_conn.commit()

    # Re-verify
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE();")
    updated_tables = set(r[0] for r in cur.fetchall())
    print(f"[DATABASE] [MySQL] Đã tự động tạo bảng thành công! Có {len(updated_tables)}/{len(EXPECTED_TABLES)} bảng: {list(updated_tables)} (Sạch 0 dữ liệu mẫu).")
    cur.close()


def init_sqlserver_tables(raw_conn: Any) -> None:
    """Check if tables exist in Microsoft SQL Server; if not, automatically create them."""
    schema_path = Path(__file__).resolve().parent / "schema_sqlserver.sql"
    if not schema_path.is_file():
        return

    cursor = raw_conn.cursor()
    cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE';")
    existing_tables = set(r[0] for r in cursor.fetchall())
    missing_tables = [t for t in EXPECTED_TABLES if t not in existing_tables]

    if not missing_tables:
        print(f"[DATABASE] [SQL Server] Bảng cơ sở dữ liệu đã tồn tại đầy đủ ({len(existing_tables)} bảng: {', '.join(sorted(existing_tables))}).")
        try:
            cursor.execute("IF COL_LENGTH('video_jobs', 'processed_video_url') IS NULL ALTER TABLE video_jobs ADD processed_video_url NVARCHAR(MAX) NULL;")
            raw_conn.commit()
        except Exception:
            pass
        cursor.close()
        return

    print(f"[DATABASE] [SQL Server] Phát hiện chưa có hoặc thiếu bảng trong '{SQLSERVER_DB}'. Danh sách thiếu: {missing_tables}")
    print("[DATABASE] [SQL Server] Đang tự động chạy schema tạo bảng...")

    content = schema_path.read_text(encoding="utf-8")
    batches = re.split(r"^\s*GO\s*$", content, flags=re.MULTILINE | re.IGNORECASE)
    for batch in batches:
        stmt = batch.strip()
        if stmt:
            try:
                cursor.execute(stmt)
            except Exception:
                pass
    raw_conn.commit()

    # Re-verify
    cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE';")
    updated_tables = set(r[0] for r in cursor.fetchall())
    print(f"[DATABASE] [SQL Server] Đã tự động tạo bảng thành công! Có {len(updated_tables)}/{len(EXPECTED_TABLES)} bảng: {list(updated_tables)} (Sạch 0 dữ liệu mẫu).")
    cursor.close()


def create_sqlite_schema(conn: sqlite3.Connection) -> None:
    """Create SQLite tables and indexes (clean schema without sample data)."""
    conn.execute("""
    CREATE TABLE IF NOT EXISTS plates (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        job_filename TEXT,
        track_id INTEGER,
        plate_number TEXT,
        plate_display TEXT,
        province TEXT,
        plate_type TEXT,
        vehicle_type TEXT,
        confidence_score REAL,
        quality_score REAL,
        crop_image_url TEXT,
        pts_ms INTEGER,
        video_time_str TEXT,
        timestamp TEXT,
        speed_kmh REAL,
        video_url TEXT
    );
    """)

    conn.execute("""
    CREATE TABLE IF NOT EXISTS video_jobs (
        id TEXT PRIMARY KEY,
        filename TEXT,
        file_size_bytes INTEGER,
        stage TEXT,
        stage_progress_pct REAL,
        overall_progress_pct REAL,
        total_frames INTEGER,
        processed_frames INTEGER,
        duration_seconds REAL,
        current_fps REAL,
        eta_seconds REAL,
        detected_plates_count INTEGER,
        video_url TEXT,
        processed_video_url TEXT,
        error_message TEXT,
        created_at TEXT,
        completed_at TEXT
    );
    """)

    conn.execute("""
    CREATE TABLE IF NOT EXISTS cameras (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        camera_type TEXT NOT NULL,
        rtsp_url TEXT NOT NULL,
        location TEXT,
        resolution TEXT DEFAULT '1920x1080',
        fps_limit INTEGER DEFAULT 25,
        is_active INTEGER DEFAULT 1,
        last_heartbeat TEXT,
        created_at TEXT,
        updated_at TEXT
    );
    """)

    conn.execute("""
    CREATE TABLE IF NOT EXISTS resident_vehicles (
        id TEXT PRIMARY KEY,
        plate_number TEXT UNIQUE NOT NULL,
        plate_display TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        apartment_number TEXT NOT NULL,
        phone_number TEXT,
        vehicle_type TEXT DEFAULT 'car',
        rfid_card_id TEXT,
        monthly_fee INTEGER DEFAULT 0,
        registered_at TEXT,
        expiry_date TEXT,
        status TEXT DEFAULT 'ACTIVE',
        notes TEXT,
        created_at TEXT,
        updated_at TEXT
    );
    """)

    conn.execute("""
    CREATE TABLE IF NOT EXISTS parking_sessions (
        id TEXT PRIMARY KEY,
        plate_number TEXT NOT NULL,
        plate_display TEXT NOT NULL,
        vehicle_type TEXT DEFAULT 'car',
        ticket_type TEXT DEFAULT 'GUEST',
        status TEXT NOT NULL DEFAULT 'PARKED',
        entry_time TEXT NOT NULL,
        entry_camera_id TEXT,
        entry_gate_name TEXT,
        entry_snapshot_url TEXT NOT NULL,
        entry_plate_crop_url TEXT,
        entry_confidence REAL DEFAULT 0.95,
        exit_time TEXT,
        exit_camera_id TEXT,
        exit_gate_name TEXT,
        exit_snapshot_url TEXT,
        exit_plate_crop_url TEXT,
        exit_plate_number TEXT,
        is_plate_matched INTEGER,
        resident_id TEXT,
        apartment_number TEXT,
        resident_name TEXT,
        duration_minutes INTEGER DEFAULT 0,
        parking_fee INTEGER DEFAULT 0,
        payment_status TEXT DEFAULT 'UNPAID',
        notes TEXT,
        created_at TEXT,
        updated_at TEXT
    );
    """)

    conn.execute("""
    CREATE TABLE IF NOT EXISTS parking_captures (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        camera_id TEXT NOT NULL,
        capture_type TEXT NOT NULL,
        plate_number TEXT,
        snapshot_url TEXT NOT NULL,
        plate_crop_url TEXT,
        confidence REAL DEFAULT 0.95,
        captured_at TEXT NOT NULL
    );
    """)

    conn.execute("CREATE INDEX IF NOT EXISTS idx_parking_sessions_status ON parking_sessions (status);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_parking_sessions_plate ON parking_sessions (plate_number);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_parking_sessions_entry ON parking_sessions (entry_time);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_resident_vehicles_plate ON resident_vehicles (plate_number);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_resident_vehicles_apt ON resident_vehicles (apartment_number);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_cameras_type ON cameras (camera_type);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_plates_job_id ON plates (job_id);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_plates_plate ON plates (plate_number);")

    conn.commit()


def init_sqlite_tables(conn: sqlite3.Connection) -> None:
    """Create SQLite tables and indexes (clean schema without sample data)."""
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    existing_tables = set(r[0] for r in cur.fetchall())
    missing_tables = [t for t in EXPECTED_TABLES if t not in existing_tables]

    if not missing_tables:
        print(f"[DATABASE] [SQLite] Bảng cơ sở dữ liệu đã tồn tại đầy đủ ({len(existing_tables)} bảng: {', '.join(sorted(existing_tables))}).")
        try:
            conn.execute("ALTER TABLE video_jobs ADD COLUMN processed_video_url TEXT;")
            conn.commit()
        except Exception:
            pass
        return

    print(f"[DATABASE] [SQLite] Phát hiện chưa có hoặc thiếu bảng. Thiếu: {missing_tables}. Đang tự động tạo bảng...")
    create_sqlite_schema(conn)
    print(f"[DATABASE] [SQLite] Đã tự động tạo bảng SQLite thành công.")


def init_db() -> Dict[str, Any]:
    """Check database existence, table existence, and automatically create database and tables if missing."""
    print("[DATABASE] Đang kiểm tra kết nối và bảng cơ sở dữ liệu...")

    if DB_ENGINE in ("mysql", "sqlserver", "mssql"):
        # 1. Check MySQL (port 3306 or active server)
        if MYSQL_PORT == 3306 or is_mysql_reachable():
            raw_mysql = get_mysql_raw_connection(create_db_if_missing=True)
            if raw_mysql is not None:
                init_mysql_tables(raw_mysql)
                raw_mysql.close()
                status = check_db_status()
                return status

        # 2. Check Microsoft SQL Server (port 1433 or active server)
        if is_sqlserver_reachable():
            raw_mssql = get_sqlserver_raw_connection(create_db_if_missing=True)
            if raw_mssql is not None:
                init_sqlserver_tables(raw_mssql)
                raw_mssql.close()
                status = check_db_status()
                return status

    # 3. Fallback SQLite
    print("[DATABASE] Chạy ở chế độ SQLite dự phòng cục bộ (data/alpr.db).")
    conn = get_sqlite_connection()
    init_sqlite_tables(conn)
    conn.close()
    return check_db_status()


# ==============================================================================
# Health Check & Diagnostics
# ==============================================================================

def check_db_status() -> Dict[str, Any]:
    """Perform a deep connectivity and health check against the active database."""
    start_time = time.time()
    tables_to_check = [
        "cameras",
        "resident_vehicles",
        "parking_sessions",
        "parking_captures",
        "video_jobs",
        "plates",
    ]
    table_counts: Dict[str, int] = {}
    total_records = 0

    # 1. Try MySQL
    if (DB_ENGINE in ("mysql", "sqlserver", "mssql") and (MYSQL_PORT == 3306 or is_mysql_reachable())) or DB_ENGINE == "mysql":
        raw = get_mysql_raw_connection()
        if raw is not None:
            try:
                server_version = raw.get_server_info()
                cur = raw.cursor()
                for table in tables_to_check:
                    try:
                        cur.execute(f"SELECT COUNT(*) FROM `{table}`;")
                        cnt = cur.fetchone()[0]
                        table_counts[table] = int(cnt)
                        total_records += int(cnt)
                    except Exception:
                        table_counts[table] = 0
                cur.close()
                raw.close()
                latency_ms = round((time.time() - start_time) * 1000, 2)
                return {
                    "connected": True,
                    "engine": "mysql",
                    "host": MYSQL_HOST,
                    "port": MYSQL_PORT,
                    "database": MYSQL_DB,
                    "user": MYSQL_USER,
                    "server_version": f"MySQL {server_version}",
                    "latency_ms": latency_ms,
                    "tables": table_counts,
                    "total_records": total_records,
                    "sample_data_present": total_records > 0,
                    "message": f"Kết nối THÀNH CÔNG tới MySQL {server_version} tại {MYSQL_HOST}:{MYSQL_PORT} (Database: {MYSQL_DB})",
                }
            except Exception as e:
                raw.close()
                return {
                    "connected": False,
                    "engine": "mysql",
                    "error": str(e),
                    "message": f"Lỗi truy vấn MySQL: {e}",
                }

    # 2. Try Microsoft SQL Server
    if DB_ENGINE in ("sqlserver", "mssql") and is_sqlserver_reachable():
        raw = get_sqlserver_raw_connection()
        if raw is not None:
            try:
                cur = raw.cursor()
                cur.execute("SELECT @@VERSION")
                ver = cur.fetchone()[0]
                for table in tables_to_check:
                    try:
                        cur.execute(f"SELECT COUNT(*) FROM [{table}];")
                        cnt = cur.fetchone()[0]
                        table_counts[table] = int(cnt)
                        total_records += int(cnt)
                    except Exception:
                        table_counts[table] = 0
                cur.close()
                raw.close()
                latency_ms = round((time.time() - start_time) * 1000, 2)
                return {
                    "connected": True,
                    "engine": "sqlserver",
                    "host": SQLSERVER_HOST,
                    "port": SQLSERVER_PORT,
                    "database": SQLSERVER_DB,
                    "user": SQLSERVER_USER,
                    "server_version": ver.split("\n")[0],
                    "latency_ms": latency_ms,
                    "tables": table_counts,
                    "total_records": total_records,
                    "sample_data_present": total_records > 0,
                    "message": f"Kết nối THÀNH CÔNG tới Microsoft SQL Server tại {SQLSERVER_HOST}:{SQLSERVER_PORT} (Database: {SQLSERVER_DB})",
                }
            except Exception as e:
                raw.close()
                return {
                    "connected": False,
                    "engine": "sqlserver",
                    "error": str(e),
                    "message": f"Lỗi truy vấn SQL Server: {e}",
                }

    # 3. Fallback SQLite
    try:
        conn = get_sqlite_connection()
        for table in tables_to_check:
            try:
                cnt = conn.execute(f"SELECT COUNT(*) FROM {table};").fetchone()[0]
                table_counts[table] = int(cnt)
                total_records += int(cnt)
            except Exception:
                table_counts[table] = 0
        conn.close()
        latency_ms = round((time.time() - start_time) * 1000, 2)
        return {
            "connected": True,
            "engine": "sqlite (fallback)",
            "database_path": str(DB_PATH),
            "latency_ms": latency_ms,
            "tables": table_counts,
            "total_records": total_records,
            "sample_data_present": total_records > 0,
            "message": "Đang chạy chế độ SQLite dự phòng cục bộ (data/alpr.db).",
        }
    except Exception as e:
        return {
            "connected": False,
            "engine": "none",
            "error": str(e),
            "message": f"Không thể kết nối tới cơ sở dữ liệu: {e}",
        }
