"""Diagnostic script to test and verify database connections (SQL Server, MySQL, PostgreSQL)."""

import os
import socket
import sys
from pathlib import Path

# Add project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

from config.settings import (
    DB_ENGINE,
    SQLSERVER_DB,
    SQLSERVER_DRIVER,
    SQLSERVER_HOST,
    SQLSERVER_PASSWORD,
    SQLSERVER_PORT,
    SQLSERVER_TRUSTED,
    SQLSERVER_USER,
)


def probe_port(host: str, port: int) -> bool:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.5)
        res = s.connect_ex((host, port))
        s.close()
        return res == 0
    except Exception:
        return False


def test_sqlserver():
    print("\n" + "=" * 60)
    print(" 🔍 KIỂM TRA MICROSOFT SQL SERVER (MSSQL)")
    print("=" * 60)
    print(f" • Host    : {SQLSERVER_HOST}")
    print(f" • Port    : {SQLSERVER_PORT}")
    print(f" • Database: {SQLSERVER_DB}")
    print(f" • User    : {SQLSERVER_USER}")
    print(f" • Driver  : {SQLSERVER_DRIVER}")

    is_open = probe_port(SQLSERVER_HOST, SQLSERVER_PORT)
    print(f" • Cổng {SQLSERVER_PORT} ({SQLSERVER_HOST}): {'🟢 ĐANG MỞ (LISTENING)' if is_open else '🔴 ĐÓNG (CLOSED)'}")

    if not is_open:
        print(" ⚠️ Không thể kết nối socket tới cổng", SQLSERVER_PORT)
        return False

    try:
        import pyodbc
        available_drivers = pyodbc.drivers()
        print(f" • ODBC Drivers sẵn có: {available_drivers}")

        driver = SQLSERVER_DRIVER if SQLSERVER_DRIVER in available_drivers else "SQL Server"
        conn_str = (
            f"DRIVER={{{driver}}};"
            f"SERVER={SQLSERVER_HOST},{SQLSERVER_PORT};"
            f"DATABASE={SQLSERVER_DB};"
            f"UID={SQLSERVER_USER};"
            f"PWD={SQLSERVER_PASSWORD};"
            "TrustServerCertificate=yes;"
        )
        print(" • Đang kết nối pyodbc...")
        conn = pyodbc.connect(conn_str, timeout=3)
        cur = conn.cursor()
        cur.execute("SELECT @@VERSION")
        ver = cur.fetchone()[0]
        conn.close()
        print(" ✅ KẾT NỐI SQL SERVER THÀNH CÔNG!")
        print(f"   Phiên bản: {ver[:60]}...")
        return True
    except Exception as e:
        print(f" ❌ Lỗi kết nối SQL Server qua pyodbc: {str(e)}")
        return False


def test_mysql():
    print("\n" + "=" * 60)
    print(" 🔍 KIỂM TRA MYSQL (Port 3306)")
    print("=" * 60)
    is_open = probe_port("localhost", 3306)
    print(f" • Cổng 3306 (localhost): {'🟢 ĐANG MỞ (LISTENING)' if is_open else '🔴 ĐÓNG'}")

    if not is_open:
        return False

    try:
        import pymysql
        # Try with user's password from .env.local
        passwords = [SQLSERVER_PASSWORD, "123456789", "YourStrong@Pass123", "root", ""]
        connected = False
        for pwd in passwords:
            try:
                conn = pymysql.connect(
                    host="localhost",
                    port=3306,
                    user="root",
                    password=pwd,
                    connect_timeout=2,
                )
                with conn.cursor() as cur:
                    cur.execute("SELECT VERSION()")
                    ver = cur.fetchone()[0]
                    cur.execute("SHOW DATABASES")
                    dbs = [r[0] for r in cur.fetchall()]
                conn.close()
                print(f" ✅ KẾT NỐI MYSQL THÀNH CÔNG (password='{pwd}')!")
                print(f"   Phiên bản MySQL: {ver}")
                print(f"   Danh sách Databases hiện có: {dbs}")
                connected = True
                break
            except Exception:
                continue
        if not connected:
            print(" ⚠️ Cổng 3306 mở nhưng sai mật khẩu root")
        return connected
    except Exception as e:
        print(f" ❌ Lỗi kiểm tra MySQL: {str(e)}")
        return False


def test_postgres():
    print("\n" + "=" * 60)
    print(" 🔍 KIỂM TRA POSTGRESQL (Port 5432)")
    print("=" * 60)
    is_open = probe_port("localhost", 5432)
    print(f" • Cổng 5432 (localhost): {'🟢 ĐANG MỞ (LISTENING)' if is_open else '🔴 ĐÓNG'}")
    return is_open


if __name__ == "__main__":
    print("🚀 ĐANG KIỂM TRA HỆ THỐNG CƠ SỞ DỮ LIỆU CỦA BẠN...")
    test_sqlserver()
    test_mysql()
    test_postgres()
