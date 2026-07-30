import paramiko
from scp import SCPClient
import os

host = "160.191.160.53"
port = 2299
username = "root"

remote_path = "/www/wwwroot/crm_biz/frontend/dist/bizcrm_zalo_backend.tar.gz"
local_path = "/Users/apple/Projects/AI/bizcrm/bizcrm_zalo_backend.tar.gz"

print(f"Connecting to {host}:{port} via SSH key...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port=port, username=username, timeout=30)

print("Connected! Downloading BIZCRM Zalo backend archive...")
with SCPClient(ssh.get_transport(), progress=lambda filename, size, sent: print(f"\rDownloading: {sent}/{size} bytes ({sent*100/size:.1f}%)", end="")) as scp:
    scp.get(remote_path, local_path)

print("\nDownload finished successfully!")
ssh.close()
