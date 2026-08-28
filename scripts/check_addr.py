import sys
sys.path.insert(0, '/www/wwwroot/crmdev/backend')
from database import conn_fm

with conn_fm.cursor() as cur:
    cur.execute("SELECT MAX(id_address), MAX(id_ward), COUNT(*) FROM note_address")
    print("conn_fm max ids and count:", cur.fetchall())
