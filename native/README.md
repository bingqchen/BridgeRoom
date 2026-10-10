# Bridge Room for iPhone and iPad

The native app includes the existing offline solo game and a nearby multiplayer table for one to four people. Empty seats use the same GIB-style bidding and card-play bots. There are no runtime downloads, accounts, external servers, or package dependencies in the iOS app.

## Install with Xcode

1. Open `ios/BridgeRoom.xcodeproj` in Xcode. The saved Xcode settings use its recommended deployment target (iOS/iPadOS 17 with the current SDK).
2. Select the **BridgeRoom** target, open **Signing & Capabilities**, and choose your Apple development team. Change the bundle identifier if your team needs a different one.
3. Connect an iPhone/iPad, select it as the destination, and choose **Run**. Follow Xcode's device pairing and Developer Mode instructions if prompted.
4. Install the same version on the other players' devices. TestFlight/App Store distribution requires signing and submission through your Apple developer account; this repository does not include signing credentials or an uploaded release.

Web assets are checked in under `ios/BridgeRoom/Web`, so opening and building the Xcode project does not require Node or an internet connection once Xcode's SDK is installed. To update those assets after changing the game, run these commands from the repository root:

```sh
npm install
npm run build
npm run build:ios
```

`build` updates the solo offline bundle; `build:ios` bundles the nearby JavaScript and copies the solo bundle into the native app. Generated files must be committed alongside their source changes. The website's `dist/` remains the single-player website; nearby networking is available only through the native app.

## Play together

1. Everyone opens **Play nearby** and enters a name. Keep Wi-Fi enabled and allow **Local Network** access when iOS asks. A shared Wi-Fi router and internet connection are not required between nearby Apple devices.
2. One person chooses their **seat as host**, then **Host table**. The host sees a different four-digit PIN beside each of the other three seats. Give each guest the PIN for their assigned seat using **Copy** or **Share**; the share sheet can send it through AirDrop without internet access.
3. Each guest chooses **Find a table**, selects the host's table and their assigned seat, enters its **4-digit seat PIN**, and chooses **Join table**. Leading zeroes count: enter all four digits. A PIN for North cannot join East, South, or West.
4. The host selects **Start** when everyone has joined. Vacant seats become bots. Seats stay fixed for the table; each guest seat belongs to the first device that claims it. A disconnected guest can return to that seat, but a different device cannot take it. New players cannot join after play begins.

Each person sees their own hand and the exposed dummy. After the opening lead, a human dummy can also see declarer’s hand. If declarer is human, that player controls both partnership hands while dummy watches. If declarer is a bot and dummy is human, the human takes over both hands: declarer’s hand rotates to the bottom and their own dummy appears above. Defenders still cannot see declarer’s cards. Seats, auction, turn order and scoring remain unchanged by the rotation. The next auction restores the player’s own seat at the bottom. Suits alternate colors and trumps appear first. Hold a bid, double, or redouble to inspect its GIB meaning without making the call.

Four-digit seat PINs require version 1.2 (build 3) on every device. Nearby protocol 3 is incompatible with the older long invitation codes; rebuild and install the same version on every device.

Completed boards reveal all four original hands and show normal duplicate points from N/S's perspective. The host may replay the completed deal or advance to a new board; replay removes the previous result before scoring it again. Nearby play does not offer unilateral undo, skip, claims, custom deals, hints, or a four-bot comparison. Those practice features remain in **Play solo**.

## Interruptions and recovery

Keep the app open while playing. The app prevents ordinary screen auto-lock in a game. When a guest backgrounds the app or disconnects, their seat remains reserved and the table pauses. Returning to the app reconnects automatically with a bounded retry delay. The host can explicitly replace a disconnected guest with a bot; that player cannot reclaim the seat during that table.

The host's table pauses when its app becomes inactive. Returning resumes it and preserves the deal while its web process remains alive. Closing the table, returning Home, force-quitting the host, or iOS terminating its web process ends the in-memory game. Host migration and recovery after host termination are not implemented. If the host closes normally, guests see a table-ended message. If it disappears unexpectedly, guests can leave and create/join a new table.

If discovery fails, check **Settings → Privacy & Security → Local Network → Bridge Room**, Wi-Fi, device proximity, and whether all devices run the same app version. If a PIN is incorrect, choose **Find a table** and check both the assigned seat and its PIN. Heavy connection retries trigger a brief admission cooldown, which can also delay legitimate reconnects; existing connected games are unaffected.

## Implementation and privacy

- `ios/BridgeRoom/NativeApp.swift`: native home screen and game lifecycle.
- `ios/BridgeRoom/GameWebView.swift`: bundled-only WebKit bridge, local assets, dialogs and native sharing.
- `ios/BridgeRoom/NearbyTransport.swift`: Bonjour discovery, Apple peer-to-peer Wi-Fi, encrypted connections, framing, identity binding, and reconnects.
- `shared/nearby-table.js`: authoritative host rules, bot turns, seat permissions, scoring, and per-seat projections.
- `web/nearby.*`: responsive nearby UI. Guests send actions; the host validates their seat, turn, legality and state revision.

Native networking uses `NWBrowser`, `NWListener`, and `NWConnection` with `includePeerToPeer`. Each non-host seat gets a unique, cryptographically random four-digit PIN. TLS 1.2 ECDHE-PSK with ChaCha20-Poly1305 encrypts the connection, using public identities independent of the PIN; it does not expose a PIN hash in the handshake. TLS session tickets and protocol resumption are disabled. After joining, a separate random 256-bit token supports reconnects and stays in native code. A bounded Keychain cache of up to eight table/seat credentials lets the same device return after leaving or restarting the guest app. The original PIN cannot claim an already confirmed seat from another device. Each new connection is counted against a table-wide limit of 12 TLS handshakes per 60 seconds, including failures. No certificate verification is bypassed. There is no use of deprecated Multipeer Connectivity. The transport validates the seat and its credential, and game actions use the authenticated identity rather than trusting a seat in the action. Each stream accepts at most a 256 KiB JSON frame.

Four-digit PINs are designed for casual play with trusted nearby people. ECDHE-PSK prevents passive captured-handshake guessing, but this is not a password-authenticated key exchange (PAKE); it does not provide strong protection against active table impersonation with such a short PIN. The rate limit applies to the real host, not a fake host. Persistent high-entropy player identities and native reconnect tokens protect already assigned seats from another guest claiming them.

The host keeps the full deal locally and sends a separate filtered snapshot to each guest. Snapshots contain no secret peer identities, invitation codes, unauthorized hands, or future bot moves. Declarer’s hand is shared only with the human dummy after the opening lead; defenders receive no extra cards. This assumes a trusted host: software on the hosting device necessarily holds the full deal. All original hands become public after the board finishes. The WebKit bridge accepts messages only from the bundled main-frame document; external pages and embedded frames cannot use it.

Apple references: [Network API guidance](https://developer.apple.com/documentation/technotes/tn3151-choosing-the-right-networking-api), [migration and TLS-PSK guidance](https://developer.apple.com/documentation/technotes/tn3213-moving-from-multipeer-connectivity-to-network-framework), [local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).

## Verification

Run `npm test` for the game and multiplayer rules. Nearby tests cover all host seats, assigned-seat validation and ownership, forbidden seat changes, all four declarer positions, dummy control, concealed-card filtering, snapshot isolation, stale/unauthorized actions, follow-suit, pause/reconnect, bot replacement, complete games, and score/replay accounting.

On macOS, run `./tests/native/run.sh` from the repository root for 24 native transport checks over real loopback TLS connections. They cover PIN validation, assigned-seat ownership, the negotiated cipher, reconnects after leaving or recreating the transport, Keychain recovery, admission throttling, and credential cleanup. The runner compiles a temporary copy of the production transport with test-visible internals, uses an isolated Keychain service, and removes its temporary files and credentials afterward.

For browser-only interface QA, serve the repository on localhost and open `tests/fixtures/nearby-preview.html?role=host` and `?role=guest`. The visibly labeled test transport uses `BroadcastChannel`, not native networking. Its fixed test PINs are North `1111`, East `2222`, South `3333`, and West `4444`, excluding the host’s seat; they must never be used as production invitations. The fixture is not bundled in the native app.

`tests/fixtures/nearby-dummy-preview.html` starts a deterministic position with South as human dummy and North as bot declarer. Play from the top dummy, then from the bottom declarer hand. Add `?human=1` to check the read-only view with a human declarer. Both scenarios use the real nearby interface and filtered host snapshots; they do not test native networking.

Before distributing, test on at least two physical Apple devices: host/join, all three invitation slots, local network permission denial/recovery, router-free discovery, bids and cards in both directions, background/resume, Wi-Fi interruptions, normal host closure, and a complete board. Simulator builds and a loopback TLS check cannot verify radio discovery, range, or iOS suspension behavior on physical devices.
