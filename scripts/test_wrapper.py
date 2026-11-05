import re
import pymysql

class RowDict(dict):
    """Dict subclass that allows column access by name ('col'), index (row[0]), and dict conversion."""
    def __init__(self, items, cols=None):
        super().__init__(items)
        self._cols = cols or list(self.keys())

    def __getitem__(self, key):
        if isinstance(key, int):
            return super().__getitem__(self._cols[key])
        return super().__getitem__(key)

class MySQLCursorWrapper:
    def __init__(self, raw_cursor):
        self.cursor = raw_cursor

    def execute(self, query: str, params=None):
        sql = re.sub(r"INSERT\s+OR\s+REPLACE\s+INTO", "REPLACE INTO", query, flags=re.IGNORECASE)
        if params:
            param_names = re.findall(r":([a-zA-Z0-9_]+)", sql)
            clean_sql = re.sub(r":[a-zA-Z0-9_]+", "%s", sql)
            values = tuple(params.get(name) for name in param_names)
            self.cursor.execute(clean_sql, values)
        else:
            self.cursor.execute(sql)
        return self

    def fetchone(self):
        row = self.cursor.fetchone()
        if not row or not self.cursor.description:
            return None
        cols = [col[0] for col in self.cursor.description]
        return RowDict({cols[i]: val for i, val in enumerate(row)}, cols=cols)

    def fetchall(self):
        rows = self.cursor.fetchall()
        if not rows or not self.cursor.description:
            return []
        cols = [col[0] for col in self.cursor.description]
        return [RowDict({cols[i]: val for i, val in enumerate(r)}, cols=cols) for r in rows]

    @property
    def rowcount(self):
        return self.cursor.rowcount

    def close(self):
        self.cursor.close()

class MySQLConnectionWrapper:
    def __init__(self, raw_conn):
        self.conn = raw_conn

    def cursor(self):
        return MySQLCursorWrapper(self.conn.cursor())

    def execute(self, query: str, params=None):
        c = self.cursor()
        c.execute(query, params)
        return c

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()

if __name__ == "__main__":
    raw = pymysql.connect(host="localhost", port=3306, user="root", password="123456789", database="ALPR_DB")
    conn = MySQLConnectionWrapper(raw)
    
    # Test count
    res = conn.execute("SELECT COUNT(*) FROM cameras").fetchone()
    print("res[0]:", res[0])
    
    # Test insert or replace
    conn.execute(
        """
        INSERT OR REPLACE INTO cameras (
            id, name, camera_type, rtsp_url, location, resolution, fps_limit, is_active
        ) VALUES (:id, :name, :camera_type, :rtsp_url, :location, :resolution, :fps_limit, :is_active)
        """,
        {
            "id": "CAM-TEST",
            "name": "Camera Test",
            "camera_type": "ENTRY",
            "rtsp_url": "0",
            "location": "Cong chinh",
            "resolution": "1920x1080",
            "fps_limit": 25,
            "is_active": 1,
        }
    )
    conn.commit()
    
    # Test select
    rows = conn.execute("SELECT * FROM cameras WHERE id = :id", {"id": "CAM-TEST"}).fetchall()
    print("Fetched rows count:", len(rows))
    print("Row data dict:", dict(rows[0]))
    print("Row data by col:", rows[0]["name"])
    print("Row data by idx:", rows[0][1])
    
    # Clean up test row
    conn.execute("DELETE FROM cameras WHERE id = :id", {"id": "CAM-TEST"})
    conn.commit()
    conn.close()
    print("Test passed successfully!")
