from database import conn_fm
import datetime
import pytz

with conn_fm.cursor() as cur:
    # Check what the raw DB data looks like for time_create
    cur.execute("""
        SELECT code_invoice, time_create, name_salechannel, status_value
        FROM invoice 
        WHERE id_salechannel = 19
        ORDER BY time_create DESC
        LIMIT 10
    """)
    rows = cur.fetchall()
    print("Recent Shopee Mall orders:")
    for row in rows:
        print(f"Code: {row[0]}, Time: {row[1]}, Channel: {row[2]}, Status: {row[3]}")
