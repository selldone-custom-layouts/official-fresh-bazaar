# Search Wikimedia Commons for photos; print title, size, license, thumb url
import sys, json, urllib.request, urllib.parse
UA = "catalog-photo-tool/1.0 (product photo research)"
def api(params):
    params.update(format="json", formatversion="2")
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    return json.loads(get(url))
def get(url, tries=12):
    import time, urllib.error
    for i in range(tries):
        if i:
            print(f"  retry {i} {url[-60:]}", flush=True)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            return urllib.request.urlopen(req, timeout=90).read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and i < tries - 1:
                ra = e.headers.get("Retry-After")
                wait = min(90, int(ra)) if ra and ra.isdigit() else min(90, 5 * 2 ** i)
                time.sleep(max(wait, 5)); continue
            raise
        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
            if i < tries - 1:
                time.sleep(min(60, 3 * 2 ** i)); continue
            raise
def search(q, n=30):
    r = api(dict(action="query", generator="search", gsrsearch=q + " filetype:bitmap", gsrnamespace=6, gsrlimit=n,
                 prop="imageinfo", iiprop="url|size|extmetadata", iiurlwidth=400))
    out = []
    for p in sorted(r.get("query", {}).get("pages", []), key=lambda p: p.get("index", 0)):
        ii = p["imageinfo"][0]; md = ii.get("extmetadata", {})
        out.append(dict(title=p["title"], w=ii["width"], h=ii["height"], lic=md.get("LicenseShortName", {}).get("value", "?"),
                        artist=md.get("Artist", {}).get("value", ""), thumb=ii.get("thumburl"), url=ii["url"], page=ii.get("descriptionurl")))
    return out
if __name__ == "__main__":
    for r in search(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 30):
        print(f"{r['w']}x{r['h']}\t{r['lic']}\t{r['title']}")
