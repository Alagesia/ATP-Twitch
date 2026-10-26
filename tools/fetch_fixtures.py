"""Download a live channel's init segment + the newest N media segments of one variant.

Usage: python -I fetch_fixtures.py <channel> <variant e.g. 1080p60|chunked|audio_only> <out_dir> [count]
Writes playlist.m3u8, init.mp4 (fMP4 only) and seg_000.<ext>... in playlist order.
"""
import os
import re
import sys
import urllib.parse

src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'probe_playlists.py'), encoding='utf-8').read().replace('\nmain()\n', '\n')
ns = {}
exec(src, ns)


def get(url):
    import urllib.request
    req = urllib.request.Request(url, headers={'User-Agent': ns['UA']})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


login, name, out = sys.argv[1], sys.argv[2], sys.argv[3]
count = int(sys.argv[4]) if len(sys.argv) > 4 else 4
os.makedirs(out, exist_ok=True)
variants = ns['variants'](ns['master'](login, 'h264'))
v = next((x for x in variants if x.get('VIDEO') == name), None) or variants[0]
print('variant', v.get('VIDEO'), v.get('RESOLUTION'), v.get('CODECS'))
media = get(v['URI']).decode()
open(os.path.join(out, 'playlist.m3u8'), 'w', encoding='utf-8').write(media)
m = re.search(r'#EXT-X-MAP:URI="([^"]+)"', media)
if m:
    open(os.path.join(out, 'init.mp4'), 'wb').write(get(urllib.parse.urljoin(v['URI'], m.group(1))))
segs = [l for l in media.splitlines() if l and not l.startswith('#')]
# Skip prefetch-style or ad segments are not filtered; take the newest N real ones.
for i, s in enumerate(segs[-count:]):
    url = urllib.parse.urljoin(v['URI'], s)
    ext = urllib.parse.urlparse(url).path.rsplit('.', 1)[-1]
    data = get(url)
    open(os.path.join(out, f'seg_{i:03d}.{ext}'), 'wb').write(data)
    print(f'seg_{i:03d}.{ext}', len(data))
