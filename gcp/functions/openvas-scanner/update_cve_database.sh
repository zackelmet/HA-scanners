#!/bin/bash
# Weekly cron job to rebuild CVE mapping from NVD API
# Add to crontab: 0 2 * * 0 /home/zack/update_cve_database.sh >> /var/log/cve_update.log 2>&1

set -e

echo "================================================"
echo "CVE Database Weekly Update - $(date)"
echo "================================================"

# Step 1: Rebuild CVE mapping from NVD API
echo ""
echo "[1/2] Rebuilding CVE mapping from NVD API..."
cd /home/zack
python3 build_cve_mapping.py --output cve_mapping_new.py

# Step 2: Replace old mapping
echo ""
echo "[2/2] Updating CVE mapping file..."

# Backup old mapping
if [ -f cve_mapping.py ]; then
    cp cve_mapping.py cve_mapping.py.backup
    echo "Backed up old mapping to cve_mapping.py.backup"
fi

# Replace with new mapping
mv cve_mapping_new.py cve_mapping.py
echo "Updated cve_mapping.py"

# Show stats
echo ""
echo "CVE Database Statistics:"
python3 -c "
from cve_mapping import CVE_DATABASE, get_supported_products
total_versions = sum(len(versions) for versions in CVE_DATABASE.values())
total_cves = sum(len(cves) for versions in CVE_DATABASE.values() for cves in versions.values())
print(f'  Products tracked: {len(get_supported_products())}')
print(f'  Versions tracked: {total_versions}')
print(f'  Total CVE entries: {total_cves}')
"

echo ""
echo "================================================"
echo "Update complete - $(date)"
echo "================================================"
