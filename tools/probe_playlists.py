"""Probe live Twitch HLS playlists to see how 1440p renditions are packaged.

Uses the same anonymous public endpoints as the extension (GQL access token + usher).
Prints only playlist structure (resolutions, codecs, MAP/KEY tags), no tokens.
"""
import json
import random
import re
import sys
import urllib.parse
import urllib.request

CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'


def http(url, body=None, headers=None):
    req = urllib.request.Request(url, data=body, headers={'User-Agent': UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode('utf-8', 'replace')


def gql(query, variables=None):
    body = json.dumps({'query': query, 'variables': variables or {}}).encode()
    return json.loads(http('https://gql.twitch.tv/gql', body, {'Client-ID': CLIENT_ID, 'Content-Type': 'text/plain; charset=UTF-8'}))


def top_logins(n):
    logins, cursor = [], None
    while len(logins) < n:
        r = gql('query($c:Cursor){streams(first:30,after:$c){edges{cursor node{broadcaster{login}}}}}', {'c': cursor})
        edges = ((r.get('data') or {}).get('streams') or {}).get('edges') or []
        if not edges:
            print(f"stream list stopped after {len(logins)}: {r.get('errors')}")
            break
        logins += [e['node']['broadcaster']['login'] for e in edges if e['node'] and e['node']['broadcaster']]
        cursor = edges[-1]['cursor']
        if not cursor:
            break
    for game in ['Just Chatting', 'Counter-Strike', 'Grand Theft Auto V', 'League of Legends', 'VALORANT',
                 'Fortnite', 'Minecraft', 'Apex Legends', 'Marvel Rivals', 'World of Warcraft', 'Rust',
                 'Escape from Tarkov', 'Dota 2', 'Call of Duty: Warzone', 'Elden Ring', 'Overwatch 2']:
        r = gql('query($g:String!){game(name:$g){streams(first:30){edges{node{broadcaster{login}}}}}}', {'g': game})
        edges = (((r.get('data') or {}).get('game') or {}).get('streams') or {}).get('edges') or []
        logins += [e['node']['broadcaster']['login'] for e in edges if e['node'] and e['node']['broadcaster']]
    return list(dict.fromkeys(logins))[:n]


def master(login, codecs):
    r = gql('''query($login:String!){streamPlaybackAccessToken(channelName:$login,params:{platform:"web",playerBackend:"mediaplayer",playerType:"site"}){value signature}}''', {'login': login})
    tok = r['data']['streamPlaybackAccessToken']
    q = urllib.parse.urlencode({
        'allow_audio_only': 'true', 'allow_source': 'true', 'cdm': 'wv', 'platform': 'web',
        'player_backend': 'mediaplayer', 'reassignments_supported': 'true', 'supported_codecs': codecs,
        'transcode_mode': 'cbr_v1', 'token': tok['value'], 'sig': tok['signature'], 'p': random.randint(0, 9999999),
    })
    return http(f'https://usher.ttvnw.net/api/channel/hls/{urllib.parse.quote(login)}.m3u8?{q}')


def variants(m3u8):
    out, cur = [], None
    for line in m3u8.splitlines():
        if line.startswith('#EXT-X-STREAM-INF:'):
            cur = dict(re.findall(r'([A-Z0-9-]+)=("[^"]*"|[^,]*)', line[18:]))
            cur = {k: v.strip('"') for k, v in cur.items()}
        elif line and not line.startswith('#') and cur is not None:
            cur['URI'] = line
            out.append(cur)
            cur = None
    return out


def media_tags(url):
    text = http(url)
    tags = {}
    for line in text.splitlines():
        m = re.match(r'#(EXT-X-(?:MAP|KEY|VERSION|TARGETDURATION))(?::(.*))?', line)
        if m and m.group(1) not in tags:
            val = m.group(2) or ''
            val = re.sub(r'URI="[^"]*"', 'URI="..."', val)  # hide URLs
            tags[m.group(1)] = val
    seg = next((l for l in text.splitlines() if l and not l.startswith('#')), '')
    tags['first_segment_ext'] = urllib.parse.urlparse(seg).path.rsplit('.', 1)[-1] if seg else ''
    return tags


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    found = 0
    for login in top_logins(n):
        try:
            full = variants(master(login, 'av1,h265,h264'))
        except Exception as e:
            print(f'{login}: error {e}')
            continue
        heights = [int(v.get('RESOLUTION', '0x0').split('x')[1]) for v in full if 'RESOLUTION' in v]
        top = full[0] if full else {}
        print(f"{login:<24} max={max(heights or [0]):>5}  top={top.get('VIDEO','-'):<12} {top.get('CODECS','-')}")
        if not heights or max(heights) < 1440:
            continue
        found += 1
        print(f'\n=== {login} (all codecs) ===')
        for v in full:
            print(f"  {v.get('VIDEO','?'):<14} {v.get('RESOLUTION','-'):>10} {v.get('FRAME-RATE','-'):>7}  {v.get('CODECS','-')}")
        for v in full[:1] + [x for x in full if x.get('RESOLUTION', '').endswith('x1080')][:1]:
            print(f"  media playlist for {v.get('VIDEO')}: {media_tags(v['URI'])}")
        try:
            h264 = variants(master(login, 'h264'))
            print(f'  --- same channel, supported_codecs=h264 (what the extension asks for) ---')
            for v in h264:
                print(f"  {v.get('VIDEO','?'):<14} {v.get('RESOLUTION','-'):>10} {v.get('FRAME-RATE','-'):>7}  {v.get('CODECS','-')}")
            if h264:
                print(f"  media playlist for {h264[0].get('VIDEO')}: {media_tags(h264[0]['URI'])}")
        except Exception as e:
            print(f'  h264-only request failed: {e}')
        if found >= 3:
            break
    print(f'\n{found} channel(s) with >=1440p found in top {n}')


main()
