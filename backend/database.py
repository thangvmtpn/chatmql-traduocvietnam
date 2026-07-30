import os
import psycopg
from dotenv import load_dotenv
from psycopg import sql
# Load biến môi trường
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
DATABASE_URL_FM = os.getenv("DATABASE_URL_FM")
# Kết nối PostgreSQL
conn = psycopg.connect(DATABASE_URL)
conn_fm = psycopg.connect(DATABASE_URL_FM)
