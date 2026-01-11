"""
Static CVE mapping for common web services
Maps product + version -> list of CVE IDs
Enables fast lookups in OpenVAS database by CVE name instead of slow full-text search

Last updated: January 2026
Sources: NVD, CVE.org, vendor security advisories
"""

CVE_DATABASE = {
    "nginx": {
        # Critical CVEs affecting nginx 1.x versions
        "1.19.0": ["CVE-2021-23017"],
        "1.19.1": ["CVE-2021-23017"],
        "1.19.2": ["CVE-2021-23017"],
        "1.19.3": ["CVE-2021-23017"],
        "1.19.4": ["CVE-2021-23017"],
        "1.19.5": ["CVE-2021-23017"],
        "1.18.0": ["CVE-2021-23017"],
        "1.20.0": ["CVE-2021-23017"],
        "1.20.1": [],  # Patched
        "1.20.2": [],  # Patched
        "1.21.0": [],  # Patched
        # Add more versions as needed
    },
    
    "apache": {
        # Apache HTTP Server CVEs
        "2.4.49": ["CVE-2021-41773", "CVE-2021-42013"],  # Path traversal + RCE
        "2.4.50": ["CVE-2021-42013"],  # RCE still present
        "2.4.48": ["CVE-2021-40438"],  # SSRF
        "2.4.46": ["CVE-2021-26691"],  # Session hijacking
        "2.4.29": ["CVE-2019-0211"],   # Local privilege escalation
        # Add more versions
    },
    
    "php": {
        # PHP CVEs
        "7.3.0": ["CVE-2019-11043"],   # PHP-FPM RCE
        "7.3.1": ["CVE-2019-11043"],
        "7.3.2": ["CVE-2019-11043"],
        "7.4.0": ["CVE-2020-7071"],    # Multiple vulnerabilities
        "8.0.0": ["CVE-2021-21702"],   # NULL pointer dereference
        # Add more versions
    },
    
    "mysql": {
        # MySQL Server CVEs
        "5.7.0": ["CVE-2020-14812", "CVE-2020-14765"],
        "5.7.30": ["CVE-2020-14812"],
        "8.0.20": ["CVE-2020-14812"],
        # Add more versions
    },
    
    "openssh": {
        # OpenSSH CVEs
        "7.4": ["CVE-2018-15473"],     # Username enumeration
        "8.0": ["CVE-2021-28041"],     # Double free
        "8.2": ["CVE-2020-14145"],     # Observable timing discrepancy
        # Add more versions
    },
    
    "tomcat": {
        # Apache Tomcat CVEs
        "9.0.0": ["CVE-2020-1938"],    # Ghostcat - AJP file read/inclusion
        "9.0.30": ["CVE-2020-1938"],
        "8.5.0": ["CVE-2020-1938"],
        "8.5.50": ["CVE-2020-1938"],
        # Add more versions
    },
    
    "wordpress": {
        # WordPress CVEs
        "5.0.0": ["CVE-2019-8942", "CVE-2019-8943"],  # RCE + XSS
        "5.2.0": ["CVE-2019-16223"],   # XSS
        "5.4.0": ["CVE-2020-4046"],    # XSS
        # Add more versions
    },
    
    "redis": {
        # Redis CVEs
        "4.0.0": ["CVE-2018-11218"],   # Integer overflow
        "5.0.0": ["CVE-2019-10192"],   # Heap buffer overflow
        "6.0.0": ["CVE-2021-32675"],   # Denial of service
        # Add more versions
    },
    
    "postgresql": {
        # PostgreSQL CVEs
        "9.6.0": ["CVE-2019-10130"],   # Memory disclosure
        "11.0": ["CVE-2020-25694"],    # Reconnection can downgrade security
        "12.0": ["CVE-2020-25694"],
        # Add more versions
    },
    
    "jenkins": {
        # Jenkins CVEs
        "2.218": ["CVE-2020-2100", "CVE-2020-2101"],  # Multiple vulnerabilities
        "2.219": ["CVE-2020-2109"],    # Stored XSS
        # Add more versions
    }
}

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

# Version range helpers for fuzzy matching
def get_cves_for_version_range(product: str, version: str, check_similar: bool = True) -> list:
    """
    Get CVEs with optional fuzzy matching for similar versions.
    
    If exact version not found and check_similar=True, will check:
    - Same major.minor version (e.g., 1.19.x)
    - Slightly older versions (may affect newer ones)
    
    Args:
        product: Product name
        version: Version string
        check_similar: Whether to check similar versions if exact match not found
    
    Returns:
        List of CVE IDs
    """
    cves = get_cves_for_service(product, version)
    
    if cves or not check_similar:
        return cves
    
    # Try fuzzy matching
    product_lower = product.lower()
    if product_lower not in CVE_DATABASE:
        return []
    
    # Extract major.minor version
    try:
        parts = version.split('.')
        if len(parts) >= 2:
            major_minor = f"{parts[0]}.{parts[1]}"
            
            # Find all versions with same major.minor
            similar_cves = set()
            for ver, cve_list in CVE_DATABASE[product_lower].items():
                if ver.startswith(major_minor):
                    similar_cves.update(cve_list)
            
            return list(similar_cves)
    except:
        pass
    
    return []
