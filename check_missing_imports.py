import glob
import os
import re
import urllib.request

assets_dir = "/Users/apple/Projects/AI/bizcrm/bizcrm_frontend_dist/assets"
all_files = set(os.path.basename(f) for f in glob.glob(f"{assets_dir}/*"))

missing = set()
for filepath in glob.glob(f"{assets_dir}/*.js"):
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    imports = re.findall(r'["\']\.\/([a-zA-Z0-9_-]+\.(?:js|css))["\']', content) + re.findall(r'assets\/([a-zA-Z0-9_-]+\.(?:js|css))', content)
    for imp in imports:
        if imp not in all_files:
            missing.add(imp)

print(f"Found {len(missing)} missing imported assets:")
for m in sorted(missing):
    print("  Missing:", m)
    url = f"https://bizcrm.traduoc.ai/assets/{m}"
    dest = os.path.join(assets_dir, m)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
        with urllib.request.urlopen(req) as resp, open(dest, "wb") as out_file:
            out_file.write(resp.read())
        print(f"    -> Downloaded {m}")
        if m.endswith(".js"):
            with open(dest, "r", encoding="utf-8", errors="ignore") as f:
                c = f.read()
            if "https://tracrm-api.bizino.ai" in c:
                c = c.replace("https://tracrm-api.bizino.ai", "http://localhost:4520")
                with open(dest, "w", encoding="utf-8") as f:
                    f.write(c)
    except Exception as e:
        print(f"    -> Failed to download {m}: {e}")

print("Scan complete.")
