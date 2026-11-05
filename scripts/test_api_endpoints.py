import json
import sys
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def test_api():
    base = "http://localhost:8000/api/v1/parking"
    
    # 1. Stats
    with urllib.request.urlopen(f"{base}/stats") as r:
        stats = json.loads(r.read())
        print("1. /stats ->", stats)
        
    # 2. Cameras
    with urllib.request.urlopen(f"{base}/cameras") as r:
        cameras = json.loads(r.read())
        print(f"2. /cameras -> {len(cameras)} cameras (clean / 0 records)")
        
    # 3. Residents
    with urllib.request.urlopen(f"{base}/residents") as r:
        residents = json.loads(r.read())
        print(f"3. /residents -> {len(residents)} residents (clean / 0 records)")
        
    # 4. Sessions
    with urllib.request.urlopen(f"{base}/sessions") as r:
        sessions = json.loads(r.read())
        print(f"4. /sessions -> {len(sessions)} sessions (clean / 0 records)")
        
    # 5. DB Status
    with urllib.request.urlopen(f"{base}/database/status") as r:
        db = json.loads(r.read())
        print("5. /database/status ->", db["message"], "| Tables:", db["tables"])

if __name__ == "__main__":
    test_api()
