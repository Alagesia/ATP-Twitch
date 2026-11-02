# Technical notes

Upstream: "Alternate Player for Twitch.tv" v2026.6.21 by Alexander Choporov (CoolCmd),
BSD 3-Clause (keep the copyright notice in any modified copy). The first commit of this repository
is the unmodified upstream source; `git diff <first commit> -- extension` shows every change.
Firefox stores an installed copy at `%APPDATA%\Mozilla\Firefox\Profiles\<profile>\extensions\<add-on id>.xpi`
(an XPI is a zip file).

## Root cause of "This broadcast is encrypted"

Not encryption. Channels whose transcode stack is `Custom:1_Source_Max_1440p60...` get **every**
rendition (even 1080p/720p H.264) packaged as **fMP4/CMAF** (`#EXT-X-MAP` init segment + `.mp4`
segments). Normal channels (`2025-Transcode-ELT-V1`) still get MPEG-TS (`.ts`).

The playlist parser treats `#EXT-X-MAP` the same as `#EXT-X-KEY` and shows message `J0219`:
`player.js:4566-4569`. Verified on cohhcarnage (2026-10-26): `isEncrypted: false`, no
`encv/enca/tenc/pssh/senc/sinf` boxes; init = `ftyp`+`moov` (`avc1`/`avcC`, `mp4a`/`esds`),
segments = `emsg` + repeated `moof`/`mdat` with one video + one audio `traf` each.

Anonymous playlists for these channels top out at 1080p60 (no `chunked`/1440p variant), even
with `supported_codecs=av1,h265,h264`. How the official player obtains the 1440p rendition
(login token? other params? HEVC?) is still unknown.

## Pipeline

1. `content.js` (on twitch.tv): GQL `user.stream.isEncrypted` check → redirects to
   `player.html?<channel>` via `background.js` (`chrome.tabs.update`).
2. `player.js` `м_Twitch` (:5364): `streamPlaybackAccessToken` → usher master playlist URL
   (:5735, requests `supported_codecs=h264`).
3. `player.js` `м_Список` (:4269): parses master (variants) and media (segments) playlists;
   `сортироватьСписокВариантов` (:6083) sorts by bandwidth. Ignores `RESOLUTION`/`CODECS`.
4. `player.js` `м_Загрузчик` (:5101): downloads segments into `г_моОчередь`.
5. `player.js` `м_Преобразователь` (:4987): posts raw segment ArrayBuffers to `worker.js`.
6. `worker.js`: MPEG-TS demux (PAT/PMT; stream types 27=H.264, 15=AAC, 21=ID3) → remux to
   fMP4 (`СоздатьСегментИнициализации`, `СоздатьМедиасегмент`), timestamp stitching across
   segments (`СостыковатьСегменты`). H.264 + AAC only. `wasm.wasm`/`asmjs.js` = memory helper.
   Returns `{мбМедиасегмент, лЕстьВидео, лЕстьЗвук, ...}` plus `мбСегментИнициализации` and
   `сКодеки` on a discontinuity (`_лРазрыв`).
7. `player.js` `м_Проигрыватель` (:3509): MSE — `addSourceBuffer(сКодеки)` (:4171),
   `appendBuffer` (:3958).

## Glossary (prefixes are Hungarian-style types)

`м_` module · `г_` global · `_` module-private · `с` string · `ч` number · `л` boolean ·
`о` object · `мс`/`мо` array of strings/objects · `мб` Uint8Array · `уз` DOM node · `ф` function ·
`у` pointer/offset. Список = playlist, Вариант = variant/rendition, Сегмент = segment,
Загрузчик = downloader, Преобразователь = transmuxer, Проигрыватель = player, Разрыв =
discontinuity, Дорожка = track, Семпл = sample, Кодеки = codecs, Трансляция = broadcast,
Реклама = ads, Журнал = log, Отладка = debug, Проверить = assert, Текст = i18n string.

## fMP4 support (done 2026-10-26)

Source: `extension/`, change log: `extension/MODIFICATIONS.txt`.

- `player.js`: `#EXT-X-MAP` parsed (`сАдресИнициализации` on each segment); `#EXT-X-KEY` still
  shows J0219 unless `METHOD=NONE`. `м_Загрузчик` fetches the init segment once (cache of 4,
  `'arraybuffer'` type so it's not counted as a media segment) and prepends it to every media segment.
- `worker.js`: first byte 0x47 → MPEG-TS path (unchanged, output byte-identical to upstream),
  otherwise `РазобратьФрагментированныйMP4`: parses `moov` (re-parsed only when its bytes change,
  which forces a discontinuity), every `moof`/`traf`/`trun`, converts timestamps to 90 kHz, strips
  SPS/PPS/AUD like the TS path, reads `emsg` (`urn:twitch:id3`) for latency stats.
- Crash/feedback reports are no longer sent to CoolCmd; "Send" just reloads.

Twitch fMP4 facts: track 1 = AAC 48 kHz, track 2 = H.264 with **1 MHz timescale**, ~19 `moof`/`mdat`
chunks per 2 s segment, `default-base-is-moof`, no composition offsets (no B-frames).

Verified in headless Firefox 158 (temporary install via WebDriver BiDi): cohhcarnage + strogo
(fMP4) 1080p60 at 60 fps with 0 dropped frames, quality switch 1080p→720p, switch to audio_only,
caedrel (MPEG-TS) unchanged.

## 1440p = HEVC (done 2026-10-26)

The 1440p60 "source" rendition (`GROUP-ID="chunked"`, `NAME="1440p60 (source)"`) is HEVC Main
(`hev1.1.6.L150.90.0.0.0.0.0`, 2560x1440, ~9.8 Mbit/s). With `include_unavailable=true` usher lists
withheld renditions in `#EXT-X-SESSION-DATA:DATA-ID="com.amazon.ivs.unavailable-media"` (base64
JSON) with reasons: `FR_CODEC_NOT_REQUESTED` (no `h265` in `supported_codecs`) and
`AUTHZ_NOT_LOGGED_IN` (anonymous playback token). The official player sends
`supported_codecs=av1,h265,h264`; the v1 endpoint the extension uses honours `h265` as well.

- `player.js` `получитьПоддерживаемыеКодеки()`: `h265,h264` if
  `MediaSource.isTypeSupported('video/mp4;codecs="hev1.1.6.L150.90,mp4a.40.2"')`, else `h264`.
  The viewer's OAuth token is already sent with the playback-token request when logged in on twitch.tv.
- `worker.js`: `_oВидеоHEVC` (null for H.264) holds the `hvcC` (length size forced to 4 bytes), the
  sample entry type, the codec string (compatibility flags reversed per RFC 6381; some muxers store
  them pre-reversed, detected via the profile's own flag) and a description for the statistics.
  Samples are copied with in-band VPS/SPS/PPS, AUD dropped, NAL types 16-23 = keyframes.

Verified: Apple's public HEVC Main 10 fMP4 sample (bipbop_adv_example_hevc, with B-frames and an
extra caption track) remuxed by the worker inside Firefox and played via MSE at 1080p60 with 0
dropped frames. Note: headless Firefox cannot decode HEVC on Windows (hardware-only decoder needs the
GPU process), so HEVC tests need a normal window. The user confirmed live 1440p60 HEVC while logged in.

## Real Twitch HEVC test data without logging in

Usher withholds the HEVC rendition from anonymous VOD and live tokens, but a VOD's H.264 variant URLs are
unsigned CloudFront paths (`https://<cdn>.cloudfront.net/<hash>_<login>_<id>_<ts>/1080p60/index-dvr.m3u8`);
replacing `1080p60` with `chunked` returns the 1440p HEVC VOD playlist (init-N.mp4 + 10 s N.mp4 segments, each
5 live 2 s segments back to back, split at the `emsg` boxes to get live-sized pieces).
Twitch HEVC facts (lirik `hev1.1.2.L150.90`, strogo `hev1.1.6.L150.90`): `hev1` sample entry, video timescale
1e6, **B-frames** (trun v0 composition offsets 16-66 ms, first PTS = DTS + 33 ms), IDR_W_RADL every 120 frames,
in-band VPS/SPS/PPS identical to the hvcC, SEI in every access unit. Broadcaster-disconnect slates are a 1080p30
HEVC L4.0 rendition from another encoder (IDR_N_LP, WPP, B-pyramid) behind `#EXT-X-DISCONTINUITY` + new MAP.

## Playback errors (2026-11-02)

J0206 means `HTMLMediaElement.error` was set; the original player discarded the code/message. A 6-agent
investigation could not reproduce it on this PC (RTX 4070; Firefox's WebGL string "GTX 980" is a sanitized
bucket name) with real Twitch HEVC, ad-break freeze frames, HEVC<->H.264 switches, the disconnect slate,
in-band parameter-set changes, seeks or GPU/RDD process kills. Firefox decodes HEVC only in hardware (GPU
process, no software fallback), so a transient decoder creation failure is the leading hypothesis.
Now: the error text is logged; HEVC errors reload with a retry, then H.264 for the tab (`sessionStorage`
`tw5-ошибка-hevc`); other errors open the report page; report pages offer the last 4 raw segments and the
segments before the last playback error (IndexedDB `tw5-отладка`). The worker closes a video hole before a
keyframe-led segment (a hole next to a 2 s frame is hidden in one buffered range and stalls Firefox; seen only
with synthetic data - in the real lirik ad break Twitch stretched the last frame, so there was no hole).

## Tools (`tools/`)

- `probe_playlists.py` / `probe_fmp4.py`: inspect live master/media playlists and segments
- `fetch_fixtures.py <channel> <variant> <dir> [n]`: download init + newest segments
- `dump_mp4.js <file>`: print box structure (trex/tfhd/tfdt/trun/emsg)
- `test_worker.js <worker.js> <fixture dir> [out]`: run the worker in Node on fixtures and validate
- `e2e_firefox.mjs <port> <extension dir> <uuid|*> <channel> <seconds> [switchAt variant]`: installs
  the extension temporarily, opens the channel on twitch.tv (content.js redirects to the player) and
  samples the `<video>` element
- `capture_official.mjs`: records the usher request of Twitch's own player
- `mse_test.html` + `mse_firefox.mjs`: runs `worker.js` inside Firefox on fixture segments and plays
  the output via MSE (serve a folder with the page, worker.js, wasm.wasm, asmjs.js, fixtures/)
  (`dir:count[:playMs]`)
- `e2e_errorpaths.mjs <port> <extension dir> <channel>`: simulates HEVC and non-HEVC playback errors in
  the real extension and checks the retry/H.264 fallback and the report page's download links
- `probe_ads.py <channel>...`: compares the `site` and `picture-by-picture` (ad fallback, max 360p) playlists
- All BiDi drivers expect a Firefox started with a throwaway profile:
  `firefox --no-remote --profile <tmp dir> --remote-debugging-port 9333 --remote-allow-system-access`
  (add `--headless` except for HEVC decoding tests). Firefox 159+ also needs the environment variable
  `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` to drive extension pages.
