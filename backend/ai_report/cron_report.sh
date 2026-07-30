#!/bin/bash
# AI Sales Report Bot — Cron Script
# Chạy hàng ngày lúc 17:00 (Vietnam Time = 10:00 UTC)
# Cron entry: 0 10 * * * /www/wwwroot/crm/backend/ai_report/cron_report.sh >> /var/log/ai_report.log 2>&1

export OPENAI_API_KEY="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"

cd /www/wwwroot/crm/backend/ai_report
source /www/wwwroot/crm/backend/venv/bin/activate

echo ""
echo "============================================"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting AI Sales Report"
echo "============================================"

python3 run_report.py

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Report completed with exit code: $?"
echo "============================================"
