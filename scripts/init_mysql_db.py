"""Script to initialize ALPR_DB in MySQL and verify table creation."""
from pathlib import Path
import pymysql

def init_mysql():
    host = "localhost"
    port = 3306
    user = "root"
    password = "123456789"
    dbname = "ALPR_DB"

    print(f"Connecting to MySQL at {host}:{port} as {user}...")
    conn = pymysql.connect(host=host, port=port, user=user, password=password)
    cur = conn.cursor()
    cur.execute(f"CREATE DATABASE IF NOT EXISTS `{dbname}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
    conn.select_db(dbname)

    schema_file = Path("src/database/schema_mysql.sql").read_text(encoding="utf-8")
    
    # Strip comments and split by semicolon
    cleaned_lines = []
    for line in schema_file.splitlines():
        trimmed = line.strip()
        if not trimmed.startswith("--"):
            cleaned_lines.append(line)
    
    cleaned_sql = "\n".join(cleaned_lines)
    statements = [s.strip() for s in cleaned_sql.split(";") if s.strip()]

    for stmt in statements:
        if stmt:
            try:
                cur.execute(stmt)
            except Exception as e:
                print(f"Warning on stmt '{stmt[:40]}...': {e}")

    conn.commit()
    cur.execute("SHOW TABLES;")
    tables = [r[0] for r in cur.fetchall()]
    print("Tables created in ALPR_DB:", tables)

    for table in tables:
        cur.execute(f"SELECT COUNT(*) FROM `{table}`;")
        count = cur.fetchone()[0]
        print(f"  - Table {table}: {count} rows")

    cur.close()
    conn.close()
    print("MySQL initialization complete!")

if __name__ == "__main__":
    init_mysql()
