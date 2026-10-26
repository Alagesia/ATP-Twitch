# ATP-Twitch: Alternate Player for Twitch.tv, fMP4/HEVC mod

A modified version of **[Alternate Player for Twitch.tv](https://addons.mozilla.org/firefox/addon/twitch_5/)**
by **Alexander Choporov (CoolCmd)**, a Firefox extension that replaces Twitch's video player.

> This is not the original extension and it is not affiliated with or endorsed by its author.
> Please do not report problems with this version to the original author; open an issue here instead.

## Why this exists

Channels that stream with a 1440p source get every quality served as fragmented MP4 (CMAF) instead
of MPEG-TS. The original player only understands MPEG-TS and reports those streams as
*"This broadcast is encrypted"*. They are not encrypted.

## Changes compared to the original (2026.6.21)

- **fMP4 streams play again.** The playlist's `#EXT-X-MAP` init segment is downloaded and the MP4
  fragments are converted inside the existing worker, so everything after it (timestamp stitching,
  statistics, quality switching) works unchanged. Normal MPEG-TS channels produce byte-identical
  output to the original.
- **1440p (HEVC).** Twitch offers the 1440p "source" rendition only in H.265/HEVC and only to
  logged-in viewers. When Firefox can decode HEVC, the player asks Twitch for it and plays it.
  Stay logged in on twitch.tv and pick "1440p60 (source)" in the quality menu.
- Crash reports and feedback are not sent to the original developer.
- Own add-on ID (`alternate-player-mod@alagesia`), so it can be signed and installed permanently.

Full list: [`extension/MODIFICATIONS.txt`](extension/MODIFICATIONS.txt). The first commit of this
repository is the unmodified upstream source, so `git diff` against it shows every change.
Technical details: [`docs/NOTES.md`](docs/NOTES.md).

## Installing

Remove or disable the original Alternate Player first; with both enabled they would both take over
Twitch pages.

- **Try it (until Firefox restarts):** open `about:debugging#/runtime/this-firefox`, click
  *Load Temporary Add-on…* and select `extension/manifest.json`.
- **Permanently:** release Firefox only keeps add-ons signed by Mozilla. Zip the *contents* of
  `extension/` into an `.xpi`, upload it at
  [addons.mozilla.org → Submit a New Add-on](https://addons.mozilla.org/developers/addon/submit/distribution),
  choose **On your own** (unlisted, nothing is published), wait for the automatic signing, download
  the signed `.xpi` and open it in Firefox. The code is not minified, so no separate source upload is
  needed. Each new upload needs a higher `version` in `manifest.json`.

## Repository layout

| Path | Contents |
|---|---|
| `extension/` | The extension source (load or zip this folder) |
| `docs/NOTES.md` | How the player works, Twitch's stream formats, findings |
| `tools/` | Probe, fixture, worker and Firefox (WebDriver BiDi) test scripts |

## License and attribution

BSD 3-Clause, see [`LICENSE`](LICENSE).
Copyright 2016-2023 Alexander Choporov (CoolCmd); modifications copyright 2026 Alagesia.
The icon credits and their licenses are listed in `LICENSE` as in the original.
