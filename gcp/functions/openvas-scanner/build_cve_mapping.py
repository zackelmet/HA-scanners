#!/usr/bin/env python3
"""
Auto-generate CVE mapping from NVD (National Vulnerability Database)
Queries NVD API for popular software products and builds a static CVE mapping file

Run weekly via cron to keep mappings current with latest CVEs
"""

import requests
import json
import time
from datetime import datetime, timedelta
from collections import defaultdict
import sys

# Products to track (add more as needed)
TRACKED_PRODUCTS = {
    "nginx": "f5:nginx",
    "apache": "apache:http_server",
    "php": "php:php",
    "mysql": "oracle:mysql",
    "postgresql": "postgresql:postgresql",
    "redis": "redis:redis",
    "openssh": "openbsd:openssh",
    "tomcat": "apache:tomcat",
    "wordpress": "wordpress:wordpress",
    "jenkins": "jenkins:jenkins",
    "node": "nodejs:node.js",
    "python": "python:python",
    "openssl": "openssl:openssl",
}

# NVD API settings
NVD_API_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0"
RATE_LIMIT_DELAY = 7  # 7 seconds between requests to avoid HTTP 429
RESULTS_PER_PAGE = 200  # Max allowed by NVD API
MAX_TOTAL_CVES = 500  # Cap at 500 CVEs per product (3 API calls) - balance coverage vs runtime


def query_nvd_for_product(product_name: str, cpe_vendor_product: str) -> tuple:
    """
    Query NVD API for CVEs affecting a product with pagination.
    Returns (version_cves_dict, cve_ranges_dict)
    where:
      - version_cves: {version: [cve_ids]}  
      - cve_ranges: {cve_id: {'start': ..., 'end': ...}}
    """
    print(f"Querying NVD for {product_name}...")
    
    version_cves = defaultdict(list)
    cve_ranges = {}  # Track version ranges for each CVE
    
    try:
        # First request to get total count
        params = {
            'keywordSearch': product_name,
            'resultsPerPage': RESULTS_PER_PAGE,
            'startIndex': 0
        }
        
        response = requests.get(NVD_API_BASE, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            total_results = data.get('totalResults', 0)
            vulnerabilities = data.get('vulnerabilities', [])
            
            print(f"  Found {total_results} total CVEs, fetching up to {min(total_results, MAX_TOTAL_CVES)}...")
            
            # Process first batch
            all_vulnerabilities = list(vulnerabilities)
            
            # Paginate to get remaining CVEs
            fetched = len(vulnerabilities)
            while fetched < total_results and fetched < MAX_TOTAL_CVES:
                time.sleep(RATE_LIMIT_DELAY)
                
                params['startIndex'] = fetched
                response = requests.get(NVD_API_BASE, params=params, timeout=30)
                
                if response.status_code == 200:
                    data = response.json()
                    new_vulns = data.get('vulnerabilities', [])
                    if not new_vulns:
                        break
                    
                    all_vulnerabilities.extend(new_vulns)
                    fetched += len(new_vulns)
                    print(f"    Fetched {fetched}/{min(total_results, MAX_TOTAL_CVES)}...")
                else:
                    print(f"    Pagination error: HTTP {response.status_code}")
                    break
            
            print(f"  Processing {len(all_vulnerabilities)} CVEs...")
            
            # Process all fetched CVEs
            for vuln in all_vulnerabilities:
                cve_data = vuln.get('cve', {})
                cve_id = cve_data.get('id', '')
                
                if not cve_id:
                    continue
                
                # Extract affected versions from configurations
                configurations = cve_data.get('configurations', [])
                for config in configurations:
                    nodes = config.get('nodes', [])
                    for node in nodes:
                        cpe_matches = node.get('cpeMatch', [])
                        for cpe_match in cpe_matches:
                            if not cpe_match.get('vulnerable', True):
                                continue
                            
                            cpe_uri = cpe_match.get('criteria', '')
                            
                            # Check if this CPE is for our target product
                            # e.g., cpe:2.3:a:f5:nginx or cpe:2.3:a:apache:http_server
                            cpe_product_part = f"cpe:2.3:a:{cpe_vendor_product}"
                            if not cpe_uri.startswith(cpe_product_part):
                                continue
                            
                            # NVD uses version ranges, not individual versions
                            # Get the version range bounds
                            version_start = cpe_match.get('versionStartIncluding')
                            version_end = cpe_match.get('versionEndExcluding')
                            version_start_excl = cpe_match.get('versionStartExcluding')
                            version_end_incl = cpe_match.get('versionEndIncluding')
                            
                            # Store range metadata for this CVE
                            if cve_id not in cve_ranges:
                                cve_ranges[cve_id] = []
                            
                            cve_ranges[cve_id].append({
                                'start': version_start or version_start_excl,
                                'end': version_end or version_end_incl,
                                'start_inclusive': bool(version_start),
                                'end_inclusive': bool(version_end_incl)
                            })
                            
                            # Also check for explicit version in CPE
                            parts = cpe_uri.split(':')
                            if len(parts) >= 6:
                                cpe_version = parts[5]
                                if cpe_version and cpe_version != '*' and cpe_version != '-':
                                    version_cves[cpe_version].append(cve_id)
                            
                            # Add version range boundaries as specific versions
                            if version_start:
                                version_cves[version_start].append(cve_id)
                            if version_end:
                                version_cves[version_end].append(cve_id)
                            if version_start_excl:
                                version_cves[version_start_excl].append(cve_id)
                            if version_end_incl:
                                version_cves[version_end_incl].append(cve_id)
        
        elif response.status_code == 404:
            print(f"  No data found in NVD for {product_name}")
        else:
            print(f"  NVD API error: HTTP {response.status_code}")
        
    except Exception as e:
        print(f"  Error querying {product_name}: {e}")
    
    # Deduplicate CVEs per version
    result = {ver: list(set(cves)) for ver, cves in version_cves.items()}
    print(f"  Extracted {len(result)} versions with {sum(len(cves) for cves in result.values())} CVE entries")
    
    return (result, cve_ranges)


def generate_mapping_file(output_path: str = "cve_mapping.py"):
    """Generate the CVE mapping Python file."""
    print(f"\n{'='*60}")
    print(f"Building CVE mapping from NVD API")
    print(f"{'='*60}\n")
    
    all_mappings = {}
    all_cve_ranges = {}
    
    for product_name, cpe_string in TRACKED_PRODUCTS.items():
        version_cves, cve_ranges = query_nvd_for_product(product_name, cpe_string)
        if version_cves:
            all_mappings[product_name] = version_cves
            all_cve_ranges[product_name] = cve_ranges
    
    # Generate Python file
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    
    with open(output_path, 'w') as f:
        f.write('"""\n')
        f.write('Static CVE mapping for common web services\n')
        f.write('Maps product + version -> list of CVE IDs\n')
        f.write('Enables fast lookups in OpenVAS database by CVE name instead of slow full-text search\n\n')
        f.write(f'Auto-generated: {timestamp}\n')
        f.write('Source: NIST National Vulnerability Database (NVD)\n')
        f.write('"""\n\n')
        
        f.write('CVE_DATABASE = ')
        f.write(json.dumps(all_mappings, indent=4))
        f.write('\n\n')
        
        f.write('# CVE version ranges (for range-based lookups)\n')
        f.write('CVE_RANGES = ')
        # Fix JSON booleans to Python booleans
        ranges_json = json.dumps(all_cve_ranges, indent=4)
        ranges_json = ranges_json.replace('true', 'True').replace('false', 'False').replace('null', 'None')
        f.write(ranges_json)
        f.write('\n\n')
        
        # Add helper functions
        f.write('''
def get_cves_for_service(product: str, version: str) -> list:
    """
    Get list of known CVE IDs for a product and version.
    
    Args:
        product: Product name (lowercase, e.g., "nginx", "apache")
        version: Version string (e.g., "1.19.0")
    
    Returns:
        List of CVE IDs (e.g., ["CVE-2021-23017"])
        Empty list if no known CVEs or product/version not in database
    """
    product_lower = product.lower()
    
    if product_lower not in CVE_DATABASE:
        return []
    
    return CVE_DATABASE[product_lower].get(version, [])

def is_product_supported(product: str) -> bool:
    """Check if a product has CVE mappings in the database."""
    return product.lower() in CVE_DATABASE

def get_supported_products() -> list:
    """Get list of all products with CVE mappings."""
    return list(CVE_DATABASE.keys())

def get_all_cves_for_product(product: str) -> set:
    """Get all unique CVE IDs for a product across all versions."""
    product_lower = product.lower()
    
    if product_lower not in CVE_DATABASE:
        return set()
    
    all_cves = set()
    for cve_list in CVE_DATABASE[product_lower].values():
        all_cves.update(cve_list)
    
    return all_cves

def get_cves_for_version_range(product: str, version: str, check_similar: bool = True) -> list:
    """
    Get CVEs with version range checking.
    
    Checks if the target version falls within any CVE version ranges.
    For example, CVE-2021-23017 affects nginx 0.6.18 <= v < 1.20.1,
    so version 1.19.0 would be included.
    
    Args:
        product: Product name
        version: Version string  
        check_similar: Whether to do range checking (recommended: True)
    
    Returns:
        List of CVE IDs
    """
    # First check exact match
    cves = get_cves_for_service(product, version)
    
    if cves or not check_similar:
        return cves
    
    # Try version range checking
    product_lower = product.lower()
    if product_lower not in CVE_RANGES:
        return []
    
    # Parse target version into comparable parts
    try:
        target_parts = [int(x) if x.isdigit() else x for x in version.replace('-', '.').split('.')]
    except:
        return []
    
    matching_cves = set()
    
    # Check each CVE's version ranges
    for cve_id, ranges in CVE_RANGES[product_lower].items():
        for range_info in ranges:
            start_ver = range_info.get('start')
            end_ver = range_info.get('end')
            start_inc = range_info.get('start_inclusive', True)
            end_inc = range_info.get('end_inclusive', False)
            
            # Parse range versions
            try:
                if start_ver:
                    start_parts = [int(x) if x.isdigit() else x for x in start_ver.replace('-', '.').split('.')]
                else:
                    start_parts = None
                
                if end_ver:
                    end_parts = [int(x) if x.isdigit() else x for x in end_ver.replace('-', '.').split('.')]
                else:
                    end_parts = None
                
                # Check if target version is in range
                in_range = True
                
                if start_parts:
                    cmp = compare_versions(target_parts, start_parts)
                    if start_inc:
                        in_range = in_range and (cmp >= 0)
                    else:
                        in_range = in_range and (cmp > 0)
                
                if end_parts and in_range:
                    cmp = compare_versions(target_parts, end_parts)
                    if end_inc:
                        in_range = in_range and (cmp <= 0)
                    else:
                        in_range = in_range and (cmp < 0)
                
                if in_range:
                    matching_cves.add(cve_id)
            except:
                continue
    
    return list(matching_cves)

def compare_versions(v1_parts: list, v2_parts: list) -> int:
    """
    Compare two version part lists.
    Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
    """
    for i in range(max(len(v1_parts), len(v2_parts))):
        p1 = v1_parts[i] if i < len(v1_parts) else 0
        p2 = v2_parts[i] if i < len(v2_parts) else 0
        
        # Handle numeric comparison
        if isinstance(p1, int) and isinstance(p2, int):
            if p1 < p2:
                return -1
            elif p1 > p2:
                return 1
        # String comparison fallback
        elif str(p1) < str(p2):
            return -1
        elif str(p1) > str(p2):
            return 1
    
    return 0
''')
    
    print(f"\n{'='*60}")
    print(f"CVE mapping generated: {output_path}")
    print(f"Total products: {len(all_mappings)}")
    total_versions = sum(len(versions) for versions in all_mappings.values())
    print(f"Total versions tracked: {total_versions}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Build CVE mapping from NVD API')
    parser.add_argument('--output', default='cve_mapping.py', help='Output file path')
    parser.add_argument('--products', help='Comma-separated list of product:cpe pairs')
    
    args = parser.parse_args()
    
    if args.products:
        # Parse custom products: nginx:f5:nginx,apache:apache:http_server
        custom_products = {}
        for pair in args.products.split(','):
            parts = pair.split(':')
            if len(parts) >= 3:
                name = parts[0]
                cpe = ':'.join(parts[1:])
                custom_products[name] = cpe
        if custom_products:
            TRACKED_PRODUCTS.clear()
            TRACKED_PRODUCTS.update(custom_products)
    
    generate_mapping_file(args.output)
