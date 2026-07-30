import re

with open("/Users/apple/Projects/AI/bizcrm/bizcrm_frontend_dist/assets/index-C-YwTO91.js", "r") as f:
    content = f.read()

# Match patterns like "./CustomersPage-DeuSxX99.js" or "CustomersPage-DeuSxX99.js"
matches = set(re.findall(r"([a-zA-Z0-9_-]+\.js)", content))
js_files = [m for m in matches if "-" in m and not m.startswith("index") and not m.startswith("vendor") and not m.startswith("client") and not m.startswith("ui-libs") and not m.startswith("socket") and not m.startswith("rolldown")]

print(f"Found {len(js_files)} chunk JS files:")
for f in sorted(js_files):
    print(f)
