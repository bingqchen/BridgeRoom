# The Bridge Room

A browser bridge game with no runtime dependencies with one human and three practice bots. The complete single-file offline download is `dist/bridge-room-offline.html`. For the installable web version, serve `dist/` over HTTPS (or localhost for development), or run `node server.mjs` and open http://127.0.0.1:4173/.

You sit South and partner North. You control both North/South hands when your side declares. When South is dummy, the table rotates 180°: North’s declaring hand moves to the main hand area at the bottom, South’s dummy appears at the top after the opening lead, and East/West and trick cards rotate with them. After the opening lead, West’s dummy appears vertically on the left when East declares, and East’s dummy appears vertically on the right when West declares. Both work on mobile and desktop with trumps first at the top. South stays at the bottom. The next auction restores the South view. The completed-board recap uses compact cards and score panels; on phones, the recap scrolls independently so Undo, Play again, Skip and Next board remain visible. The game enforces legal calls, following suit, declarer selection, opening lead, dummy exposure, trick winners, and duplicate scoring with the standard board vulnerability cycle. On screens up to 700px wide, the app uses a full-height mobile table with full-width dummy and player card rows, a contract/trick status bar, the full auction in the center, two-row bidding controls, and an action bar for auction history and hints. Choose a level to reveal the suits and NT; tapping a denomination places the bid. Press and hold a suit, NT, Double or Redouble for about half a second to read its auction-specific GIB meaning, including available point ranges, suit lengths and forcing status. Releasing a held button does not bid; close the explanation and tap when ready. F1 or Shift+F10 on any of these focused call buttons also opens the explanation. The same Double control changes to Redouble when legal. Menu holds the remaining controls. The session is held in memory and resets on refresh.

## Install and play offline

Open **Get app** on desktop, or **Menu → Get app · play offline** on mobile. The service worker caches the complete app, local fonts, icons, bidding modules and downloadable HTML. Install via the offered browser prompt or the browser’s Add to Home Screen / Install app menu. **On iPhone/iPad, open the Home Screen icon while still online, sign in if needed, then open its offline panel and wait for “Ready for offline play”.** The icon alone does not guarantee that caching has completed. Test by turning on Airplane Mode with Wi-Fi off, closing the app and reopening its icon. The first visit needs a connection; subsequent launches, games, bot bidding/play and duplicate comparisons work offline. Cache setup fails closed if a file cannot be downloaded or redirects (for example, to a sign-in page).

The precache uses canonical hosted URLs (`/` and `/bridge-room-offline`), because Sites redirects `/index.html` and `/bridge-room-offline.html`. Cached fetches also accept those older filename aliases. The development server mirrors these redirects so local tests cover the production behavior. Offline readiness checks an existing cache before attempting a network-dependent service-worker update, so an update failure cannot incorrectly invalidate a working offline installation.

**Download offline file** saves one HTML file with the JavaScript, styles, fonts and font licenses embedded. Open it in a browser without a server or network. It does not register a service worker. Some mobile file viewers do not execute HTML apps; use the installable home-screen version there. Game state remains in memory, so closing/refreshing begins a new session. External reference links require a connection. Clearing browser/site data removes the installed app’s cached resources.

For source changes, install development dependencies with `pnpm install`, then run `pnpm build` before publishing. Esbuild is a build-only dependency; the game makes no runtime API calls. The build generates the standalone HTML and a content-versioned `dist/sw.js`. It embeds local JavaScript modules through a virtual resolver, without scanning directories outside the project. The worker caches only its explicit asset list, rejects redirected setup requests, verifies cache completeness, and replaces only older Bridge Room caches. Updates do not reload an active game.

Fonts are bundled locally under their SIL Open Font Licenses in `dist/fonts/`; the same licenses are embedded in the standalone download. Icons are local PNGs with a maskable variant for installation.

## Completed-board display

When a board ends, all four original hands appear automatically inside the table as miniature cards, with North above, South below, West left and East right. Suit colors alternate and trumps stay first. Each hand shows its HCP and declarer/dummy role. This also works for passed-out boards and accepted claims. On mobile, the duplicate result appears below the hands. Undoing a completed board or replaying it hides the revealed deal again.

## Deal controls

Undo, Play again, and Skip stay below the hand on desktop and mobile. Undo restores the state before your last bid, card or claim and removes any subsequent bot moves; repeated undo also works for cards played from dummy, across trick collection, and after a completed board. Play again uses the same original cards, seats, dealer and vulnerability and restarts the auction, or the chosen contract for a custom deal. Skip advances to a random board with the next board's dealer and vulnerability cycle. Undo history is cleared when replaying or skipping, so it never crosses boards.

Undoing or replaying a completed board removes only that board’s score and IMP contribution. Finishing it again records its new result once. Skipping an unfinished board adds no result, while skipping a finished board keeps its result. Pending bot actions are cancelled before restoring or replacing the deal.

## Custom hands and deal library

Open **Deal library** in the desktop header or mobile **Menu**. Choose **Enter a deal** and type each player's ranks into the four suit fields. Both `T` and `10` are accepted; blank or a dash means a void. Live counts and HCP help check the hands. Every card must appear exactly once and each seat must have 13 cards before play or saving is enabled. After entering three complete hands, **Fill empty hand** assigns the remaining 13 cards to the fourth seat. **Copy current deal** opens all four original hands in the editor, including cards already played.

Choose dealer and vulnerability, then start from bidding or set a contract, declarer and double status. Starting a deal replaces the current table and clears its undo history while preserving completed-board session totals. Entered seats are never reshuffled by the South-highest-HCP preference. Chosen contracts begin with the proper opening leader and keep dummy hidden until the lead; Play again returns to the same contract. For these deals the four-bot comparison plays the same contract, while deals started from bidding are rebid independently as usual.

Name the deal and choose **Save deal** to add it to a library of up to 200 deals. Saved deals can be played, edited or removed with an undo option. The library is stored locally in this browser and survives refreshes, including offline use when browser storage is available. It does not sync between devices or between the website and a downloaded HTML file. **Export library** and **Import library** transfer or back up the collection as JSON; **Download deal** saves a single deal even when browser storage is unavailable. Import validates the entire file before saving, skips identical records and keeps both copies on a conflicting ID. Clearing browser data removes the library, so export a backup first. Unsaved editor drafts last only until the page is refreshed.

## Guaranteed claims

During North/South declarer play, **Claim all** appears beside Undo and is enabled on your turn after dummy is exposed. It includes any unfinished trick. A successful claim awards every remaining trick to N/S, calculates the normal duplicate score and bot comparison, and records a separate claim entry without inventing plays for unplayed cards. Undo restores the exact pre-claim position and removes its score/comparison; replay keeps the original deal.

The verifier is separate from probabilistic bot advice. It reads only both N/S hands, the public played cards, remaining hand sizes and observed E/W voids. It searches for a single adaptive declarer strategy that wins against every legal defensive continuation and every consistent E/W allocation. Cards are assigned to hidden hands only as needed; off-suit plays require a feasible allocation with a void in the led suit. Auction guesses, sampled probabilities and actual concealed E/W cards are never used to certify a claim. The search accounts for follow-suit rules, ruffs, entries, overtakes, bad breaks and the current trick. Equivalent adjacent ranks can share a branch, and an uncontested run of solid winners has a direct certificate.

To keep the offline app responsive, verification is bounded by 100,000 search nodes and approximately 750 ms. An unfinished search returns **Claim not verified** and makes no change; it never treats a high probability or timeout as proof. Continue playing and try again later. Claims are currently for N/S declarer control, where both partnership hands are visible.

## Stronger South deals

Open **Preferences** below the desktop table, or **Menu → Preferences** on mobile. **South gets the highest HCP** swaps a maximum-HCP hand into South after a normal shuffle; it does not change the cards or reassign the dealer/vulnerability. South may tie with another hand. The switch defaults off, persists locally when storage is available, and applies to the next new board (including after refresh). Set it once; future deals use it automatically without another prompt. The current board, undo, replay, and its four-bot comparison keep the exact saved hands. Disable the option to return to normal random seating on new boards.

## Duplicate comparison

After each completed board, four bots independently rebid and play the original deal using the same seats, dealer, vulnerability, 2/1 bidding agreements and legal card-play engine. The simulation is isolated from the player's table and does not see the player's auction or decisions. Results stay hidden until the board is complete.

The result panel shows both contracts, declarers, tricks and scores from N/S's perspective. Point difference = your N/S score − bot N/S score; positive favors you. Each board's difference is converted using the standard [ACBL IMP scale](https://www.acbl.org/learn/), then added to the session IMP total. Passed-out tables score zero; abandoning a board adds no comparison. This is one bot-table comparison, not a field matchpoint percentage. The bot auction and all 13 tricks are available for review. Session totals reset on refresh.

## Bidding agreements

The bidding modules implement agreements from [BBO’s GIB System Notes](https://www.bridgebase.com/doc/gib_system_notes.php) (published version 40), with [BBO’s hand-evaluation definitions](https://www.bridgebase.com/doc/gib_descriptions.php). The in-app system card and individual call explanations describe the current agreements. Total points are HCP plus 3/2/1 for a void/singleton/doubleton, less one for each short suit containing an honor. The same engine drives all three opponents, the human’s hint, and the independent four-bot duplicate table.

Coverage includes the basic 2/1 structure, inverted minors, Jacoby 2NT, two-way game tries, Soloway jump shifts and passed-hand fit jumps, reverse Drury, fourth-suit and one-way new-minor forcing, strong and weak two openings, the published 1NT/2NT response structures (including minor transfers, Smolen and Texas), competitive doubles, Cappelletti, Michaels, unusual NT and unusual-versus-unusual, Jordan/Truscott, passed-hand Sandwich NT, Lebensohl, RKCB 0314 with queen and specific-king inquiries, void responses, DOPI, Gerber, and quantitative notrump invitations.

The notes do not define a complete decision algorithm. Where they name conventions without specifying all continuations, this implementation uses standard treatments, including slow-shows Lebensohl ([ACBL reference](https://web2.acbl.org/documentLibrary/play/commonlyusedconventions.pdf)) and standard Cappelletti advances ([ACBL reference](https://web2.acbl.org/documentLibrary/play/Commonly_Used_Conventions/cappellettipt2.pdf)). Rare/unspecified sequences fall back to natural bidding. No Gambling 3NT, Namyats, Bergen, DONT, or Puppet Stayman.

These are independent practice bots with reproducible seeded sampling, not BBO’s proprietary GIB engine. They do not promise identical calls, expert competitive judgment or double-dummy play. `chooseBid` and `chooseCard` receive only their hand and public auction/play information. No external API, service key, backend or paid model is required.

## Card play and turn cues

The active seat has a gold outline and explicit To play / To bid label. The active visible hand also has a gold edge, including the full-width mobile dummy, either vertical opponent dummy, and North's hand after rotation. The auction highlights the next caller. A live status line names the seat; no player is highlighted while a completed trick is being collected or after the board ends.

Bots and card hints use 32 Monte Carlo samples per decision, selected from 128 candidate hidden deals. Only the acting hand, exposed dummy, public auction and played cards enter the view. When dummy acts, declarer also knows their own hand. Observed voids and remaining hand sizes are hard constraints. Suit allocations are drawn using multinomial completion counts, giving a uniform prior over feasible assignments; public HCP, total-point and suit-length bidding meanings then provide soft likelihood weights. Artificial calls use their described target lengths, not the denomination of the call. Bidding remains the existing GIB-style system.

During later play, every legal card is evaluated on the same sampled deals. At the opening lead, the search compares conventional candidates selected by the lead agreements below. Full-hand rollouts use a lightweight continuation policy; the final two tricks use exact partnership minimax within each hypothetical deal. The selected card maximizes average duplicate score for the acting partnership, including contract bonuses, vulnerability and penalties. Ties prefer expected tricks and then a lower card. Hints show the leading options, estimated make/defeat percentages and expected points. Percentages describe the sampled model, not calibrated guarantees or a double-dummy solution to the actual deal. Monte Carlo bridge play has known imperfect-information limitations; see [Ginsberg's bridge search paper](https://arxiv.org/abs/1106.0669) for background. No actual hidden cards are supplied to the search, and everything works offline.

## Opening-lead agreements

The opening-lead policy follows [BridgePlaybook’s guide](https://bridgeplaybook.com/bridge-strategy/opening-leads/). It chooses a conventional rank in each suitable suit, then compares those candidates using the existing public-information simulations. Suit selection is a heuristic interpretation of the guide, not a complete expert defense system. The same policy powers bots, hints and the duplicate table.

Fourth-best is our agreement from four or more small cards; three small cards use middle-up-down. Takeout doubles suggest unbid suits rather than naming one. Artificial calls contribute only the holdings their meanings actually show. Hints explain the recommendation and, for a fourth-best notrump lead, show the Rule of 11 count. Observed opening leads softly weight sampled holdings, including the fourth-best count; they never rule out a deal solely because a human may have led differently. Actual concealed hands remain inaccessible. Subsequent leads retain the existing card-play search.

## Defensive play and signals

Additional defensive heuristics draw on the five-chapter excerpt of [25 Ways to Be a Better Defender](https://sites.utoronto.ca/bridge/lessons/25defense.pdf). They cover second-hand low, splitting touching honors against dummy's intermediates, third-hand high with the lowest of equals, finessing against dummy, retaining guards, and notrump hold-ups. Opening suit selection also considers passive notrump slam leads, attacking suit-slam leads, weak-hand entries and risky short honors. The earlier BridgePlaybook opening-rank agreements remain unchanged where the sources differ; this is not an implementation of every deal or all 25 chapters of the book.

On partner's honor lead and on discards, high spots encourage and low spots discourage. On declarer's lead, a high spot starts even count and a low spot starts odd count. Only relative spots below the ten are used, trumps are excluded, and forced cards provide no inference. Each first signal of a given type/suit softly weights sampled hidden holdings reconstructed at that moment; later echoes and the duplicated current/history trick are not counted twice. All players can interpret the same public signals, and human departures from convention remain possible. Signals are never added to the guaranteed-claim proof.

Every legal card is still simulated after the opening lead. Defensive preferences apply only within 6 expected points and 0.10 expected tricks of the best-scoring option, without reducing the sampled probability of defeating the contract; exact two-trick endings use the search directly. Timing tactics use the same sampled deals and require at least 60% agreement before influencing a close decision. Bots can cash a side-suit master before an opponent runs out and ruffs, while rejecting immediate ruff risks. Hold-ups retain a stopper while declarer still has another card in dummy’s suit, then win as that connection disappears; other established or promotable entries and remaining dummy trumps prevent a stranded-dummy assumption. The rules handle promoted honors as well as aces, favor an available setting trick, and stop ducking before conceding declarer’s contract-making trick. Hypothetical continuations also look for access to partner’s established winners after taking a stopper. The defensive hold-up idea is illustrated in [ACBL’s Thrust and Parry lesson](https://cdn.acbl.org/interactivebites/OLB043ThrustAndParry.htm). These thresholds and tactical patterns are heuristics, not calibrated improvements or expert-level guarantees. Hints explain applicable tactics, and the same engine serves all three bots, advice and the duplicate table offline.

## Validation

Run `node --test tests/*.test.mjs`. Covers auction legality, doubles and redoubles, declarer selection, following suit, trump rules, vulnerability, scoring cases, 2/1 applicability, forcing 1NT rebids, Stayman/transfers, GIB convention sequences and continuations, and 500 deterministic complete games. Duplicate-comparison tests also replay 64 boards and verify identical bot decisions and isolated state. Card-play tests check exact card counts and observed voids, auction-weighted samples, hidden-hand independence, declarer/dummy knowledge, finesse and third-hand endings, and turn transitions. Claim tests cover ruffs, finesses, bad breaks, blocked suits, void inference, partial tricks, bounded-search refusal, score/undo behavior and an independent exhaustive oracle for small endings. Offline tests verify bundled assets, install metadata and service-worker cache behavior without a network. Session tests cover undo across bidding/play and completed tricks, repeated score accounting, replay identity, passed-out boards and skip boundaries.

Deal-library tests cover input normalization, duplicate/missing-card rejection, fourth-hand completion, persistence and safe import, corrupt or unavailable storage, concurrent-tab protection, fixed seat identity, preset contracts and their full four-bot play, undo/replay and score boundaries.

## Source layout

- `dist/bridge-cards.js`: shared card, auction and contract rules
- `dist/engine.js`: deals, play progression and bot entry points
- `dist/play-rules.js`: legal cards, trick winners and duplicate scoring
- `dist/opening-leads.js`: opening-lead conventions, auction-aware candidate suits and conditional lead inference
- `dist/defense.js`: defensive tactics, guarded discards and soft public-signal inference
- `dist/defense-timing.js`: sampled cashing, hold-up and dummy-entry timing
- `dist/card-play.js`: public-information sampling, rollouts and score-based card advice
- `dist/completed-deal.js`: compact four-hand reveal after a board finishes
- `dist/deal-library.js`: custom-deal validation, setup and local library persistence/import/export
- `dist/deal-library-ui.js`: four-hand editor, saved-deal library and backup controls
- `dist/bid-preview.js`: safe tap/hold and keyboard bid inspection
- `dist/turn-state.js`: active-seat detection
- `dist/claim.js`: distribution-independent claim verification and scoring
- `dist/gib-system.js`: GIB-style bidding dispatcher
- `dist/gib-{suit,notrump,competitive,slam}.js`: convention meanings and decisions
- `dist/bidding-context.js`: public auction context and hand evaluation
- `dist/natural-bidding.js`: natural continuations for unspecified sequences
- `dist/gib-system-card.js`: in-app system reference
- `dist/offline.js`: install/download UI and offline readiness
- `scripts/build-offline.mjs`: standalone HTML and versioned service-worker build
- `scripts/sw-template.js`: cache lifecycle and offline asset delivery
- `dist/manifest.webmanifest`: install metadata and app icons
- `dist/session.js`: undo snapshots, replay, skip, and score accounting
- `dist/duplicate.js`: isolated four-bot replay and IMP comparison
- `dist/app.js`: interface, turn progression and optional WebMCP tools
- `dist/style.css`: responsive table
- `dist/index.html`: app shell
- `.openai/hosting.json`: private Sites deployment identity

The WebMCP adapter exposes public state, a legal South call, and a card from the currently controlled hand, using the same validation and actions as the interface. Concealed hands are not returned.
