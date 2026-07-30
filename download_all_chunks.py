import urllib.request
import os

chunks = [
    "AiWorkspacePage-Co9_zWyK.js",
    "AnalyticsPage-CqFajhSs.js",
    "AutomationFlowPage-Dt3254Fg.js",
    "AutomationPage-D9FXzY_M.js",
    "CustomersPage-DeuSxX99.js",
    "DuplicateContactsPage-CxnQGQga.js",
    "EnterCompanyDialog-BvgYwwCc.js",
    "IntegrationsPage-C01cVm6E.js",
    "OrgDetailPage-3KT6b5hK.js",
    "OrgsPage-DqDyvKD_.js",
    "PhoneExtractPage-OcCNkVjU.js",
    "PlatformBrandingPage-d3l76BmD.js",
    "PlatformDashboardPage-Q5SdyjSP.js",
    "PlatformLoginPage-LUqsCG8G.js",
    "PlatformSetupPage-DIEItZ9h.js",
    "ProductKnowledgePage-BfsB1G-7.js",
    "SettingsPage-DrsX2Q0y.js",
    "ZnsCampaignsPage-DkSO1APD.js",
    "format-Ccq1c9Tc.js",
    "useAutomation-Cmc6kl_k.js",
    "useProductKnowledge-MNQfxmLb.js",
    "useTeam-C5p2sbu_.js",
    "useZaloAccess-Bm307izq.js",
    "xyflow-Xd5hi8ZC.js"
]

target_dir = "/Users/apple/Projects/AI/bizcrm/bizcrm_frontend_dist/assets"

for chunk in chunks:
    url = f"https://bizcrm.traduoc.ai/assets/{chunk}"
    dest = os.path.join(target_dir, chunk)
    print(f"Downloading {chunk}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
        with urllib.request.urlopen(req) as resp, open(dest, "wb") as out_file:
            out_file.write(resp.read())
        
        with open(dest, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        if "https://tracrm-api.bizino.ai" in content:
            content = content.replace("https://tracrm-api.bizino.ai", "http://localhost:4520")
            with open(dest, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"  -> Replaced API URL in {chunk}")
        else:
            print(f"  -> Successfully downloaded {chunk}")
    except Exception as e:
        print(f"  -> Error downloading {chunk}: {e}")

print("All 24 page chunks downloaded and configured!")
