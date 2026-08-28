import sys
sys.path.insert(0, '/www/wwwroot/fm/backend')
from database import conn

with conn.cursor() as cur:
    cur.execute("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'note_address'")
    print("Columns of note_address:")
    for col in cur.fetchall():
        print(col)

    cur.execute("SELECT * FROM note_address WHERE id_prov = 1 LIMIT 5")
    print("Sample rows for id_prov=1 (Ha Noi):")
    for r in cur.fetchall():
        print(r)
