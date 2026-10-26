"""Inspect a channel's fMP4 init + media segment for encryption boxes and codec details."""
import re
import struct
import sys
import urllib.parse

src = open(__file__.replace('probe_fmp4.py', 'probe_playlists.py'), encoding='utf-8').read().replace('\nmain()\n', '\n')
ns = {}
exec(src, ns)

CONTAINERS = {b'moov', b'trak', b'mdia', b'minf', b'stbl', b'mvex', b'moof', b'traf', b'edts', b'dinf', b'sinf', b'schi'}
SAMPLE_ENTRY_PARENT = b'stsd'


def walk(buf, start, end, depth, out):
    i = start
    while i + 8 <= end:
        size, typ = struct.unpack('>I4s', buf[i:i + 8])
        hdr = 8
        if size == 1:
            size = struct.unpack('>Q', buf[i + 8:i + 16])[0]
            hdr = 16
        elif size == 0:
            size = end - i
        if size < hdr or i + size > end:
            break
        out.append(('  ' * depth) + typ.decode('latin1') + f' ({size})')
        if typ in CONTAINERS:
            walk(buf, i + hdr, i + size, depth + 1, out)
        elif typ == SAMPLE_ENTRY_PARENT:
            # full box header (4) + entry_count (4), then sample entries
            j = i + hdr + 8
            while j + 8 <= i + size:
                esz, etyp = struct.unpack('>I4s', buf[j:j + 8])
                out.append(('  ' * (depth + 1)) + etyp.decode('latin1') + f' ({esz})  <- sample entry')
                body_start = j + 8 + (78 if etyp in (b'avc1', b'avc3', b'hvc1', b'hev1', b'av01', b'encv') else 28)
                walk(buf, body_start, j + esz, depth + 2, out)
                j += esz
        i += size


def boxes(data):
    out = []
    walk(data, 0, len(data), 0, out)
    return out


def get(url):
    import urllib.request
    req = urllib.request.Request(url, headers={'User-Agent': ns['UA']})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


login = sys.argv[1]
r = ns['gql']('query($l:String!){user(login:$l){stream{isEncrypted}}}', {'l': login})
print('GQL isEncrypted =', r['data']['user']['stream'])
m = ns['master'](login, 'h264')
v = ns['variants'](m)[0]
print('variant:', v.get('VIDEO'), v.get('RESOLUTION'), v.get('CODECS'))
media = get(v['URI']).decode()
base = v['URI']
map_uri = re.search(r'#EXT-X-MAP:URI="([^"]+)"', media)
segs = [l for l in media.splitlines() if l and not l.startswith('#')]
if map_uri:
    init = get(urllib.parse.urljoin(base, map_uri.group(1)))
    print(f'\ninit segment: {len(init)} bytes')
    print('\n'.join(boxes(init)))
seg = get(urllib.parse.urljoin(base, segs[-1]))
print(f'\nlast media segment: {len(seg)} bytes, first bytes={seg[:8].hex()}')
tree = boxes(seg)
print('\n'.join(tree[:40]))
blob = (init if map_uri else b'') + seg
for marker in [b'encv', b'enca', b'tenc', b'pssh', b'senc', b'saiz', b'saio', b'sinf', b'schm']:
    print(f'  contains {marker.decode()}: {marker in blob}')
