"""Compare what Twitch serves the 'site' and 'picture-by-picture' player types (the extension uses the
latter as an ad-free fallback): token limits, variants, and ad markers in the top variant's playlist.

Usage: python -I probe_ads.py <channel> [<channel>...]   (anonymous, same endpoints as the extension)
"""
import collections
import json
import os
import random
import re
import sys
import urllib.parse

src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'probe_playlists.py'), encoding='utf-8').read().replace('\nmain()\n', '\n')
ns = {}
exec(src, ns)


def master(login, player_type):
    r = ns['gql']('query($login:String!,$t:String!){streamPlaybackAccessToken(channelName:$login,params:{platform:"web",playerBackend:"mediaplayer",playerType:$t}){value signature}}', {'login': login, 't': player_type})
    tok = r['data']['streamPlaybackAccessToken']
    t = json.loads(tok['value'])
    q = urllib.parse.urlencode({
        'allow_audio_only': 'true', 'allow_source': 'true', 'cdm': 'wv', 'platform': 'web', 'player_backend': 'mediaplayer',
        'reassignments_supported': 'true', 'supported_codecs': 'h265,h264', 'transcode_mode': 'cbr_v1',
        'token': tok['value'], 'sig': tok['signature'], 'p': random.randint(0, 9999999)})
    return t, ns['http'](f'https://usher.ttvnw.net/api/channel/hls/{login}.m3u8?{q}')


def media_summary(url):
    text = ns['http'](url)
    titles = collections.Counter(m.group(1) or '(empty)' for m in re.finditer(r'#EXTINF:[\d.]+,(.*)', text))
    classes = collections.Counter(re.findall(r'#EXT-X-DATERANGE:[^\n]*CLASS="([^"]+)"', text))
    return {'titles': dict(titles), 'daterange': dict(classes), 'map': '#EXT-X-MAP' in text}


for login in sys.argv[1:]:
    print(f'===== {login} =====')
    for player_type in ['site', 'picture-by-picture']:
        try:
            tok, m = master(login, player_type)
        except Exception as e:
            print(f'  {player_type}: error {e}')
            continue
        variants = ns['variants'](m)
        print(f"  {player_type}: max_resolution={tok.get('maximum_resolution')} reasons={tok.get('maximum_resolution_reasons')} "
              f"show_ads={tok.get('show_ads')} server_ads={tok.get('server_ads')} hide_ads={tok.get('hide_ads')}")
        print('    variants:', [(v.get('VIDEO'), v.get('RESOLUTION', '-'), v.get('CODECS', '')[:10]) for v in variants])
        if variants:
            print('    top variant playlist:', media_summary(variants[0]['URI']))
