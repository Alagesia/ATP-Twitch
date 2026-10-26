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
- The add-on ID is unchanged (`twitch5@coolcmd`), so loading this version replaces an installed
  original for that Firefox session and keeps its settings.

Full list: [`extension/MODIFICATIONS.txt`](extension/MODIFICATIONS.txt). The first commit of this
repository is the unmodified upstream source, so `git diff` against it shows every change.
Technical details: [`docs/NOTES.md`](docs/NOTES.md).

## Installing

Double-click **`Load in Firefox.cmd`** (Windows). It opens Firefox's *This Firefox* page and copies
the path of `extension/manifest.json` to the clipboard. Click *Load Temporary Add-on…*, press
Ctrl+V and Enter.

The add-on stays loaded until Firefox is closed completely (all windows, or a restart for an
update). It replaces an installed original Alternate Player for that session; after a restart the
original is back, so run the script again. On other systems, open
`about:debugging#/runtime/this-firefox` and load `extension/manifest.json` by hand.

Permanent installation in release Firefox requires a signature from Mozilla (an
addons.mozilla.org developer account with two-factor authentication, and a different add-on ID).
Firefox Developer Edition and Nightly can install unsigned add-ons permanently when
`xpinstall.signatures.required` is set to `false` in `about:config`.

## Repository layout

| Path | Contents |
|---|---|
| `Load in Firefox.cmd` | Loads `extension/` into Firefox as a temporary add-on |
| `extension/` | The extension source (load or zip this folder) |
| `docs/NOTES.md` | How the player works, Twitch's stream formats, findings |
| `tools/` | Probe, fixture, worker and Firefox (WebDriver BiDi) test scripts |

## For the original author

The [`upstream-patch`](https://github.com/Alagesia/ATP-Twitch/tree/upstream-patch) branch holds only
the playback fix (fMP4 + HEVC in `player.js` and `worker.js`) on top of the unmodified 2026.6.21
source, without the changes that only make sense for this copy (name, crash reports, extra files):
[view the diff](https://github.com/Alagesia/ATP-Twitch/compare/c4faafb5fefd6cc4124b5227e2e641f01cb81d27...upstream-patch).
It applies to 2026.6.21 with `git am` or `patch -p1` and is offered under the extension's own BSD
3-Clause license.

## License and attribution

BSD 3-Clause, see [`LICENSE`](LICENSE).
Copyright 2016-2023 Alexander Choporov (CoolCmd); modifications copyright 2026 Alagesia.
The icon credits and their licenses are listed in `LICENSE` as in the original.
