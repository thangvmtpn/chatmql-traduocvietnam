"""
Cấu hình cho AI Sales Report Bot
"""
import os

# Database
DATABASE_URL = "postgresql://postgres:FWWtXzakz6DjKf5s@localhost:5432/crm"
DATABASE_URL_FM = "postgresql://postgres:FWWtXzakz6DjKf5s@localhost:5432/fm"

# OpenAI
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "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")
OPENAI_MODEL = "gpt-4o-mini"  # Cost-effective, fast

# Lark Bot Webhook
LARK_WEBHOOK_URL = "https://open.larksuite.com/open-apis/bot/v2/hook/8686a49b-b1c6-4ac2-8a4a-439320eae4a6"

# Schedule
REPORT_HOUR = 17  # 17:00 (UTC+7 = 10:00 UTC)
REPORT_MINUTE = 0
TIMEZONE = "Asia/Ho_Chi_Minh"

# Sales staff role
SALES_ROLE_ID = 4

# Invoice status to exclude (cancelled/returned)
EXCLUDED_STATUS_ID = 12
