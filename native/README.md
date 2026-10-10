# Bridge Room for iPhone and iPad

The native app includes the existing offline solo game and a nearby multiplayer table for one to four people. Empty seats use the same GIB-style bidding and card-play bots. There are no runtime downloads, accounts, external servers, or package dependencies in the iOS app.

## Install with Xcode

1. Open `ios/BridgeRoom.xcodeproj` in Xcode. The project targets iOS/iPadOS 16 or later.
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
2. One person chooses **Host table**. The host receives three different private invitation codes. Give each guest a different code using **Copy** or **Share**; the share sheet can send a code through AirDrop without internet access.
3. Each guest chooses **Find a table**, selects the host's table, pastes their code, and chooses **Join table**. A code belongs to the first device that uses it and lets that device reconnect.
4. Choose seats, then the host selects **Start**. Vacant seats become bots. Seats cannot be exchanged or newly occupied after play begins.

Each person sees their own hand and the exposed dummy. Declarer plays both their hand and dummy; a person sitting dummy watches without seeing declarer's concealed hand. This differs from solo practice, where the one human plays both partnership hands when N/S declares. Hands rotate to put each person's own seat at the bottom, suits alternate colors, and trumps appear first. Hold a bid, double, or redouble to inspect its GIB meaning without making the call.

Completed boards reveal all four original hands and show normal duplicate points from N/S's perspective. The host may replay the completed deal or advance to a new board; replay removes the previous result before scoring it again. Nearby play does not offer unilateral undo, skip, claims, custom deals, hints, or a four-bot comparison. Those practice features remain in **Play solo**.

## Interruptions and recovery

Keep the app open while playing. The app prevents ordinary screen auto-lock in a game. When a guest backgrounds the app or disconnects, their seat remains reserved and the table pauses. Returning to the app reconnects automatically with a bounded retry delay. The host can explicitly replace a disconnected guest with a bot; that player cannot reclaim the seat during that table.

The host's table pauses when its app becomes inactive. Returning resumes it and preserves the deal while its web process remains alive. Closing the table, returning Home, force-quitting the host, or iOS terminating its web process ends the in-memory game. Host migration and recovery after host termination are not implemented. If the host closes normally, guests see a table-ended message. If it disappears unexpectedly, guests can leave and create/join a new table.

If discovery fails, check **Settings → Privacy & Security → Local Network → Bridge Room**, Wi-Fi, device proximity, and whether all devices run the same app version. If an invitation is incorrect, choose **Find a table** and enter the correct code again.

## Implementation and privacy

- `ios/BridgeRoom/NativeApp.swift`: native home screen and game lifecycle.
- `ios/BridgeRoom/GameWebView.swift`: bundled-only WebKit bridge, local assets, dialogs and native sharing.
- `ios/BridgeRoom/NearbyTransport.swift`: Bonjour discovery, Apple peer-to-peer Wi-Fi, encrypted connections, framing, identity binding, and reconnects.
- `shared/nearby-table.js`: authoritative host rules, bot turns, seat permissions, scoring, and per-seat projections.
- `web/nearby.*`: responsive nearby UI. Guests send actions; the host validates their seat, turn, legality and state revision.

Native networking uses `NWBrowser`, `NWListener`, and `NWConnection` with `includePeerToPeer`. Each guest has an independent random 128-bit invitation. TLS 1.2 with Apple's supported PSK cipher authenticates and encrypts each connection; no certificate verification is bypassed. Apple's TLS-PSK API requires the older Network connection APIs and TLS 1.2. There is no use of deprecated Multipeer Connectivity. The connection is bound to the authenticated guest; client-authored seat identifiers are never trusted. Each stream accepts at most a 256 KiB JSON frame.

The host keeps the full deal locally and sends a separate filtered snapshot to each guest. Snapshots contain no secret peer identities, invitation codes, undeclared hands, or future bot moves. This assumes a trusted host: software on the hosting device necessarily holds the full deal. All original hands become public after the board finishes. The WebKit bridge accepts messages only from the bundled main-frame document; external pages and embedded frames cannot use it.

Apple references: [Network API guidance](https://developer.apple.com/documentation/technotes/tn3151-choosing-the-right-networking-api), [migration and TLS-PSK guidance](https://developer.apple.com/documentation/technotes/tn3213-moving-from-multipeer-connectivity-to-network-framework), [local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).

## Verification

Run `npm test` for the game and multiplayer rules. Nearby tests cover all four declarer positions, dummy control, concealed-card filtering, snapshot isolation, stale/unauthorized actions, follow-suit, pause/reconnect, bot replacement, complete games, and score/replay accounting.

For browser-only interface QA, serve the repository on localhost and open `tests/fixtures/nearby-preview.html?role=host` and `?role=guest`. The visibly labeled test transport uses `BroadcastChannel`, not native networking. Its fixed test codes must never be used as production invitations. The fixture is not bundled in the native app.

Before distributing, test on at least two physical Apple devices: host/join, all three invitation slots, local network permission denial/recovery, router-free discovery, bids and cards in both directions, background/resume, Wi-Fi interruptions, normal host closure, and a complete board. Simulator builds and a loopback TLS check cannot verify radio discovery, range, or iOS suspension behavior on physical devices.
