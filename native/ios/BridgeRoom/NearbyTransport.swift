import Foundation
import Network
import Security
import CryptoKit

/// All state and Network callbacks run on the main queue. The host alone routes
/// projected game state; the transport never broadcasts a received payload.
final class NearbyTransport {
    static let maximumFrame = 256 * 1024
    private static let service = "_bridgeroom._tcp"
    private static let protocolVersion = 3
    private static let seats = ["N", "E", "S", "W"]
    private static let handshakeLimit = 12
    private static let handshakeWindow: TimeInterval = 60
    private static let credentialService = "BridgeRoom.nativeSeatCredentials.v1"
    private struct SavedSeat: Codable {
        let table: String
        let seat: String
        let owner: String
        let secret: String
    }
    private static var savedSeats = loadSavedSeats()
    var onEvent: (([String: Any]) -> Void)?

    private final class Channel {
        let id = UUID()
        let connection: NWConnection
        var buffer = Data()
        var peerID: String?
        var seat: String?
        var closing = false
        var deadline: DispatchWorkItem?
        init(_ connection: NWConnection) { self.connection = connection }
    }

    private var listener: NWListener?
    private var browser: NWBrowser?
    private var discovered: [String: NWEndpoint] = [:]
    private var channels: [UUID: Channel] = [:]
    private var peers: [String: UUID] = [:]
    private var inviteOwners: [String: String] = [:]
    private var confirmedSeats: Set<String> = []
    private var invites: [String: String] = [:]
    private var resumeSecrets: [String: String] = [:]
    private var handshakeAttempts: [TimeInterval] = []
    private var hostID: String?
    private var hostSeat = "S"
    private var hostName = "Bridge table"
    private var hostAnnounced = false
    private var hostRetry: DispatchWorkItem?
    private var hostRetryCount = 0
    private var guestChannel: UUID?
    private var endpoint: NWEndpoint?
    private var guestCode: String?
    private var guestTable: String?
    private var guestSeat: String?
    private var guestResumeSecret: String?
    private var guestName = "Player"
    private var generation = UUID()
    private var retry: DispatchWorkItem?
    private var retryCount = 0
    private var foreground = true
    private var guestWelcomed = false

    private lazy var playerID: String = {
        let key = "BridgeRoom.nativePlayerSecret.v1"
        if let saved = UserDefaults.standard.string(forKey: key), Self.isHex(saved, count: 64) { return saved }
        let value = Self.randomHex(bytes: 32)
        UserDefaults.standard.set(value, forKey: key)
        return value
    }()

    func handle(_ message: [String: Any]) {
        switch message["type"] as? String {
        case "host":
            guard let seat = message["seat"] as? Int, Self.seats.indices.contains(seat) else {
                return error("Choose your seat before opening a nearby table.")
            }
            host(name: message["name"] as? String ?? "Bridge table", seat: Self.seats[seat])
        case "browse": browse()
        case "join":
            guard let table = message["tableId"] as? String,
                  let seat = message["seat"] as? Int, Self.seats.indices.contains(seat),
                  let code = message["code"] as? String else { return error("Choose a table and seat, then enter its 4-digit PIN.") }
            join(table: table, seat: Self.seats[seat], code: code, name: message["name"] as? String ?? "Player")
        case "send":
            guard let payload = message["payload"] as? [String: Any] else { return }
            if hostID != nil {
                guard let peer = message["peerId"] as? String, let id = peers[peer], let channel = channels[id] else { return }
                send(["type": "payload", "payload": payload], on: channel)
            } else if guestWelcomed, let id = guestChannel, let channel = channels[id] {
                send(["type": "payload", "payload": payload], on: channel)
            } else { status("Connection paused. Reconnect before making a move.") }
        case "leave": leave()
        default: break
        }
    }

    func setActive(_ active: Bool) {
        foreground = active
        emit(["type": "active", "active": active])
        if active, endpoint != nil, guestChannel == nil { scheduleReconnect(immediate: true) }
        if active, hostID != nil, listener == nil { startHostListener() }
        if !active {
            retry?.cancel(); retry = nil
            hostRetry?.cancel(); hostRetry = nil
            // A backgrounded human is unavailable, not a bot. Closing the guest
            // connection tells the host to pause its reserved seat immediately.
            if let id = guestChannel, let channel = channels[id] { close(channel) }
        }
    }

    func leave(notify: Bool = true) {
        generation = UUID()
        retry?.cancel(); retry = nil
        hostRetry?.cancel(); hostRetry = nil
        listener?.cancel(); listener = nil
        browser?.cancel(); browser = nil
        let previous = Array(channels.values)
        let wasHosting = hostID != nil
        channels.removeAll(); peers.removeAll(); discovered.removeAll()
        previous.forEach {
            $0.deadline?.cancel()
            if wasHosting, $0.peerID != nil { endConnection($0.connection) }
            else { $0.connection.cancel() }
        }
        hostID = nil; invites = [:]; inviteOwners = [:]; confirmedSeats = []; resumeSecrets = [:]
        handshakeAttempts = []; hostSeat = "S"
        hostAnnounced = false; hostRetryCount = 0
        endpoint = nil; guestCode = nil; guestTable = nil; guestSeat = nil; guestResumeSecret = nil; guestChannel = nil
        guestWelcomed = false; retryCount = 0
        if notify { emit(["type": "left"]) }
    }

    private func host(name: String, seat: String) {
        leave(notify: false)
        hostID = Self.randomHex(bytes: 16)
        hostSeat = seat
        hostName = Self.cleanName(name, fallback: "Bridge table")
        for otherSeat in Self.seats where otherSeat != seat {
            var pin = Self.randomPIN()
            while invites.values.contains(pin) { pin = Self.randomPIN() }
            invites[otherSeat] = pin
            resumeSecrets[otherSeat] = Self.randomHex(bytes: 32)
        }
        startHostListener()
    }

    private func startHostListener() {
        guard foreground, listener == nil, let id = hostID else { return }
        hostRetry?.cancel(); hostRetry = nil
        let current = generation, name = hostName
        do {
            let listener = try NWListener(using: Self.parameters(pins: invites, resumes: resumeSecrets))
            self.listener = listener
            listener.service = NWListener.Service(name: name + " · " + id.prefix(8), type: Self.service)
            listener.stateUpdateHandler = { [weak self, weak listener] state in
                guard let self, self.generation == current, self.listener === listener else { return }
                switch state {
                case .ready:
                    self.hostRetryCount = 0
                    if !self.hostAnnounced {
                        self.hostAnnounced = true
                        let invitations = Self.seats.enumerated().compactMap { index, seat -> [String: Any]? in
                            guard let pin = self.invites[seat] else { return nil }
                            return ["seat": index, "pin": pin]
                        }
                        self.emit(["type": "hosting", "id": id, "name": name,
                                   "seat": Self.seats.firstIndex(of: self.hostSeat)!, "invites": invitations])
                    } else { self.status("The nearby table is available again.") }
                case .waiting(let failure): self.networkStatus(failure)
                case .failed(let failure):
                    self.listener = nil; listener?.cancel()
                    self.status("The table connection paused. " + self.description(failure))
                    self.scheduleHostRecovery()
                default: break
                }
            }
            listener.newConnectionHandler = { [weak self] connection in
                guard let self, self.generation == current, self.hostID != nil, self.channels.count < 8,
                      self.admitHandshake() else { connection.cancel(); return }
                self.start(connection, outgoing: false, generation: current)
            }
            listener.start(queue: .main)
            status("Opening a nearby table…")
        } catch {
            status("The nearby table is temporarily unavailable. Retrying…")
            scheduleHostRecovery()
        }
    }

    private func scheduleHostRecovery() {
        guard foreground, hostID != nil, listener == nil, hostRetry == nil else { return }
        let current = generation
        let delay = min(20.0, pow(2.0, Double(min(hostRetryCount, 5))))
        hostRetryCount += 1
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.generation == current else { return }
            self.hostRetry = nil; self.startHostListener()
        }
        hostRetry = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func browse() {
        leave(notify: false)
        let current = generation
        let parameters = NWParameters()
        parameters.includePeerToPeer = true
        let browser = NWBrowser(for: .bonjour(type: Self.service, domain: nil), using: parameters)
        self.browser = browser
        browser.stateUpdateHandler = { [weak self, weak browser] state in
            guard let self, self.generation == current, self.browser === browser else { return }
            switch state {
            case .ready: self.status("Choose a nearby table and seat. Ask its host for that seat’s 4-digit PIN.")
            case .waiting(let failure): self.networkStatus(failure)
            case .failed(let failure): self.error("Nearby discovery stopped. " + self.description(failure))
            default: break
            }
        }
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            guard let self, self.generation == current else { return }
            var endpoints: [String: NWEndpoint] = [:]
            var tables: [[String: String]] = []
            for result in results {
                guard case let .service(name, type, domain, _) = result.endpoint else { continue }
                let id = name + "|" + type + "|" + domain
                endpoints[id] = .service(name: name, type: type, domain: domain, interface: nil)
                tables.append(["id": id, "name": name])
            }
            self.discovered = endpoints
            self.emit(["type": "tables", "tables": tables.sorted { ($0["name"] ?? "") < ($1["name"] ?? "") }])
        }
        browser.start(queue: .main)
        emit(["type": "tables", "tables": []])
        status("Looking for nearby tables…")
    }

    private func join(table: String, seat: String, code: String, name: String) {
        guard let selected = discovered[table] else { return error("That table is no longer nearby. Refresh the table list.") }
        guard Self.seats.contains(seat) else { return error("Choose the seat whose PIN the host gave you.") }
        let normalized = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard Self.isPIN(normalized) else { return error("Enter the 4-digit PIN for your chosen seat.") }
        leave(notify: false)
        endpoint = selected; guestCode = normalized; guestTable = table; guestSeat = seat
        guestResumeSecret = Self.savedSeats.last { $0.table == table && $0.seat == seat && $0.owner == playerID }?.secret
        guestName = Self.cleanName(name, fallback: "Player")
        connect()
    }

    private func connect() {
        guard foreground, guestChannel == nil, let endpoint, let guestCode, let guestSeat else { return }
        retry?.cancel(); retry = nil
        guestWelcomed = false
        status(retryCount == 0 ? "Connecting to the table…" : "Reconnecting to your seat…")
        let parameters = guestResumeSecret.map { Self.parameters(pins: [:], resumes: [guestSeat: $0]) }
            ?? Self.parameters(pins: [guestSeat: guestCode], resumes: [:])
        let connection = NWConnection(to: endpoint, using: parameters)
        start(connection, outgoing: true, generation: generation)
    }

    private func start(_ connection: NWConnection, outgoing: Bool, generation current: UUID) {
        let channel = Channel(connection)
        channels[channel.id] = channel
        if outgoing { guestChannel = channel.id }
        let timeout = DispatchWorkItem { [weak self, weak channel] in
            guard let self, let channel, self.generation == current, self.channels[channel.id] === channel,
                  channel.peerID == nil else { return }
            self.close(channel, reason: "The table did not respond. Check the seat and PIN, and keep both apps open.")
        }
        channel.deadline = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 18, execute: timeout)
        connection.stateUpdateHandler = { [weak self, weak channel] state in
            guard let self, let channel, self.generation == current, self.channels[channel.id] === channel else { return }
            switch state {
            case .ready:
                if outgoing {
                    self.send(["type": "hello", "version": Self.protocolVersion, "id": self.playerID,
                               "name": self.guestName, "seat": self.guestSeat ?? "",
                               "credential": self.guestResumeSecret ?? self.guestCode ?? "",
                               "resume": self.guestResumeSecret != nil], on: channel)
                }
                self.receive(channel)
            case .waiting(let failure):
                if outgoing, case .tls(let code) = failure, !Self.isTransientTLSClosure(code) {
                    self.authenticationFailed()
                    self.close(channel, reason: self.description(failure))
                } else { self.networkStatus(failure) }
            case .failed(let failure):
                if outgoing, case .tls(let code) = failure, !Self.isTransientTLSClosure(code) {
                    self.authenticationFailed()
                }
                self.close(channel, reason: self.description(failure))
            case .cancelled: self.close(channel)
            default: break
            }
        }
        connection.start(queue: .main)
    }

    private func receive(_ channel: Channel) {
        channel.connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self, weak channel] data, _, complete, failure in
            guard let self, let channel, self.channels[channel.id] === channel else { return }
            if let data, !data.isEmpty {
                channel.buffer.append(data)
                while channel.buffer.count >= 4 {
                    let size = channel.buffer.prefix(4).reduce(0) { ($0 << 8) | Int($1) }
                    guard size > 0, size <= Self.maximumFrame else { return self.close(channel, reason: "Invalid message size.") }
                    guard channel.buffer.count >= size + 4 else { break }
                    let body = Data(channel.buffer.dropFirst(4).prefix(size))
                    channel.buffer.removeFirst(size + 4)
                    guard let object = try? JSONSerialization.jsonObject(with: body), let message = object as? [String: Any] else {
                        return self.close(channel, reason: "Invalid table message.")
                    }
                    self.received(message, on: channel)
                    if self.channels[channel.id] !== channel || channel.closing { return }
                }
                guard channel.buffer.count <= Self.maximumFrame + 4 else { return self.close(channel, reason: "Message is too large.") }
            }
            if let failure { self.close(channel, reason: self.description(failure)) }
            else if complete { self.close(channel, reason: "The connection closed.") }
            else { self.receive(channel) }
        }
    }

    private func received(_ message: [String: Any], on channel: Channel) {
        guard !channel.closing else { return }
        if hostID == nil, guestChannel == channel.id, guestWelcomed, message["type"] as? String == "ended" {
            forgetGuestCredential()
            endpoint = nil; guestCode = nil
            close(channel)
            emit(["type": "ended", "message": "The host closed this table. You can host or join a new table."])
            return
        }
        if hostID != nil, channel.peerID == nil {
            guard message["type"] as? String == "hello", message["version"] as? Int == Self.protocolVersion else {
                return reject(channel, message: "Update Bridge Room on every device to play together.")
            }
            guard let id = message["id"] as? String, Self.isHex(id, count: 64),
                  let seat = message["seat"] as? String, seat != hostSeat, let pin = invites[seat],
                  let credential = message["credential"] as? String, let resume = message["resume"] as? Bool,
                  let name = message["name"] as? String, name.utf8.count <= 160,
                  inviteOwners[seat] == nil || inviteOwners[seat] == id,
                  !inviteOwners.contains(where: { $0.key != seat && $0.value == id }),
                  resume ? (inviteOwners[seat] == id && credential == resumeSecrets[seat])
                      : (credential == pin && !confirmedSeats.contains(seat)) else {
                return reject(channel, message: "This seat or PIN is invalid, or the seat already belongs to another player.")
            }
            guard peers[id] != nil || peers.count < 3 else { return reject(channel, message: "This table is full.") }
            inviteOwners[seat] = id
            if resume { confirmedSeats.insert(seat) }
            let previous = peers[id].flatMap { channels[$0] }
            channel.peerID = id; channel.seat = seat; channel.deadline?.cancel(); channel.deadline = nil
            peers[id] = channel.id
            if let previous { close(previous) } // Mapping changed first: old callbacks cannot disconnect the replacement.
            send(["type": "welcome", "version": Self.protocolVersion, "id": id, "seat": seat,
                  "resumeSecret": resumeSecrets[seat]!], on: channel)
            emit(["type": "peer", "id": id, "seat": Self.seats.firstIndex(of: seat)!,
                  "name": Self.cleanName(name, fallback: "Player"), "connected": true])
            return
        }
        if hostID == nil, guestChannel == channel.id, !guestWelcomed {
            if message["type"] as? String == "reject" {
                forgetGuestCredential()
                endpoint = nil; guestCode = nil
                error(message["message"] as? String ?? "This invitation cannot join the table.")
                close(channel); return
            }
            guard message["type"] as? String == "welcome", message["version"] as? Int == Self.protocolVersion,
                  message["id"] as? String == playerID, message["seat"] as? String == guestSeat,
                  let resumeSecret = message["resumeSecret"] as? String, Self.isHex(resumeSecret, count: 64) else {
                endpoint = nil; guestCode = nil
                return close(channel, reason: "Update Bridge Room on every device to play together.")
            }
            guestResumeSecret = resumeSecret
            if let table = guestTable, let seat = guestSeat {
                Self.savedSeats.removeAll { $0.table == table && $0.seat == seat }
                Self.savedSeats.append(SavedSeat(table: table, seat: seat, owner: playerID, secret: resumeSecret))
                Self.savedSeats = Array(Self.savedSeats.suffix(8))
                Self.persistSavedSeats()
            }
            channel.peerID = "host"; channel.seat = guestSeat; channel.deadline?.cancel(); channel.deadline = nil
            guestWelcomed = true; retryCount = 0
            // The host permits a same-device PIN retry only until the welcome
            // is acknowledged. Thereafter even the original PIN cannot reclaim
            // a reserved seat: reconnect requires the strong native token.
            send(["type": "confirm", "resumeSecret": resumeSecret], on: channel)
            emit(["type": "joined", "id": playerID, "seat": Self.seats.firstIndex(of: guestSeat!)!])
            return
        }
        if hostID != nil, message["type"] as? String == "confirm",
           let id = channel.peerID, peers[id] == channel.id, let seat = channel.seat,
           message["resumeSecret"] as? String == resumeSecrets[seat] {
            confirmedSeats.insert(seat)
            return
        }
        guard message["type"] as? String == "payload", let payload = message["payload"] as? [String: Any],
              let id = channel.peerID else { return close(channel, reason: "Unexpected table message.") }
        if hostID != nil {
            guard peers[id] == channel.id else { return }
            emit(["type": "message", "peerId": id, "payload": payload])
        } else if guestWelcomed, guestChannel == channel.id {
            emit(["type": "message", "peerId": "host", "payload": payload])
        }
    }

    private func reject(_ channel: Channel, message: String) {
        // Stop parsing immediately: a peer must not submit many PIN guesses
        // in one buffered frame batch while the rejection write completes.
        channel.closing = true
        send(["type": "reject", "message": message], on: channel) { [weak self, weak channel] in
            if let channel { self?.close(channel) }
        }
    }

    private func send(_ message: [String: Any], on channel: Channel, completion: (() -> Void)? = nil) {
        guard channels[channel.id] === channel, JSONSerialization.isValidJSONObject(message),
              let data = try? JSONSerialization.data(withJSONObject: message), data.count <= Self.maximumFrame else {
            error("The table message could not be sent."); return
        }
        let n = UInt32(data.count)
        var frame = Data([UInt8((n >> 24) & 255), UInt8((n >> 16) & 255), UInt8((n >> 8) & 255), UInt8(n & 255)])
        frame.append(data)
        channel.connection.send(content: frame, completion: .contentProcessed { [weak self, weak channel] failure in
            guard let self, let channel, self.channels[channel.id] === channel else { return }
            if let failure { self.close(channel, reason: self.description(failure)) }
            else { completion?() }
        })
    }

    private func close(_ channel: Channel, reason: String? = nil) {
        guard channels.removeValue(forKey: channel.id) != nil else { return }
        channel.deadline?.cancel(); channel.connection.cancel()
        if let id = channel.peerID, peers[id] == channel.id {
            peers.removeValue(forKey: id)
            emit(["type": "peer", "id": id, "seat": channel.seat.flatMap { Self.seats.firstIndex(of: $0) } ?? -1,
                  "name": "", "connected": false])
        }
        if guestChannel == channel.id {
            guestChannel = nil; guestWelcomed = false
            let suffix = endpoint != nil ? " Reconnecting…" : ""
            emit(["type": "status", "connected": false,
                  "message": (reason ?? "Connection paused. Your seat is reserved.") + suffix])
            scheduleReconnect()
        }
    }

    private func endConnection(_ connection: NWConnection) {
        let bytes = Data("{\"type\":\"ended\"}".utf8)
        let n = UInt32(bytes.count)
        var frame = Data([UInt8((n >> 24) & 255), UInt8((n >> 16) & 255), UInt8((n >> 8) & 255), UInt8(n & 255)])
        frame.append(bytes)
        connection.send(content: frame, completion: .contentProcessed { _ in connection.cancel() })
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { connection.cancel() }
    }

    private func scheduleReconnect(immediate: Bool = false) {
        guard foreground, endpoint != nil, guestCode != nil, guestChannel == nil, retry == nil else { return }
        let current = generation
        let delay = immediate ? 0.0 : min(20.0, pow(2.0, Double(min(retryCount, 5))))
        retryCount += 1
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.generation == current else { return }
            self.retry = nil; self.connect()
        }
        retry = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func networkStatus(_ failure: NWError) { status(description(failure)) }
    private func authenticationFailed() {
        // A TLS failure has not authenticated the remote host. It must not
        // erase a reserved seat's only credential (for example after a spoofed
        // Bonjour response). Only encrypted reject/ended messages do that.
        endpoint = nil; guestCode = nil
        error("The seat or PIN did not match, or this table has ended. Browse again and check the seat’s PIN with its host.")
    }
    private func forgetGuestCredential() {
        if let table = guestTable, let seat = guestSeat {
            Self.savedSeats.removeAll { $0.table == table && $0.seat == seat && $0.owner == playerID }
            Self.persistSavedSeats()
        }
        guestResumeSecret = nil
    }
    private static func isTransientTLSClosure(_ code: OSStatus) -> Bool {
        // Admission throttling closes before TLS authentication. These closure
        // errors say nothing about credential validity and must keep retries.
        code == errSSLClosedAbort || code == errSSLClosedGraceful || code == errSSLClosedNoNotify
    }
    private func description(_ failure: NWError) -> String {
        if case .dns(let code) = failure, code == -65570 {
            return "Allow Local Network access in Settings → Bridge Room, then return to the app."
        }
        if case .tls(let code) = failure {
            return Self.isTransientTLSClosure(code)
                ? "The nearby connection paused. The table may be busy."
                : "The seat or PIN did not match, or the table has ended. Browse again to join."
        }
        return "The nearby connection is unavailable. Keep Wi-Fi on and the host app open."
    }
    private func status(_ message: String) { emit(["type": "status", "message": message]) }
    private func error(_ message: String) { emit(["type": "error", "message": message]) }
    private func emit(_ event: [String: Any]) { onEvent?(event) }

    /// Keep only a few table-scoped reconnect credentials, native to this
    /// device. Explicit Leave and app relaunch must not strand a reserved seat.
    private static func loadSavedSeats() -> [SavedSeat] {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: credentialService,
                                    kSecAttrAccount as String: "seats",
                                    kSecReturnData as String: true,
                                    kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let entries = try? JSONDecoder().decode([SavedSeat].self, from: data) else { return [] }
        return Array(entries.filter { seats.contains($0.seat) && isHex($0.owner, count: 64) && isHex($0.secret, count: 64) }.suffix(8))
    }

    private static func persistSavedSeats() {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: credentialService,
                                    kSecAttrAccount as String: "seats"]
        guard !savedSeats.isEmpty else { SecItemDelete(query as CFDictionary); return }
        guard let data = try? JSONEncoder().encode(savedSeats) else { return }
        if SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary) == errSecItemNotFound {
            var item = query
            item[kSecValueData as String] = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            SecItemAdd(item as CFDictionary, nil)
        }
    }

    /// Limit guesses across devices and seats, including failed TLS handshakes.
    /// Admission precedes TLS identity discovery, so a busy window can also
    /// delay a legitimate reconnect until its normal retry is admitted.
    private func admitHandshake() -> Bool {
        let now = ProcessInfo.processInfo.systemUptime
        handshakeAttempts.removeAll { now - $0 >= Self.handshakeWindow }
        guard handshakeAttempts.count < Self.handshakeLimit else { return false }
        handshakeAttempts.append(now)
        return true
    }

    private static func parameters(pins: [String: String], resumes: [String: String]) -> NWParameters {
        let tls = NWProtocolTLS.Options()
        let options = tls.securityProtocolOptions
        // TLS 1.2 ECDHE-PSK keeps a captured handshake from disclosing a
        // low-entropy PIN. TLS 1.3's public PSK binder does not have this
        // property. Never fall back to a non-DHE PSK cipher or a PIN hash
        // as the public identity. Active impersonation still requires a PAKE
        // to resist offline guesses; these PINs are for nearby casual play.
        sec_protocol_options_set_min_tls_protocol_version(options, .TLSv12)
        sec_protocol_options_set_max_tls_protocol_version(options, .TLSv12)
        sec_protocol_options_append_tls_ciphersuite(options, tls_ciphersuite_t(rawValue: TLS_ECDHE_PSK_WITH_CHACHA20_POLY1305_SHA256)!)
        sec_protocol_options_set_tls_resumption_enabled(options, false)
        sec_protocol_options_set_tls_tickets_enabled(options, false)
        let credentials = pins.map { (seat: $0.key, secret: $0.value, mode: "pin") }
            + resumes.map { (seat: $0.key, secret: $0.value, mode: "resume") }
        for (seat, secret, mode) in credentials {
            let key = SymmetricKey(data: Data(secret.utf8))
            let identity = Data("BridgeRoom v3 \(mode) seat \(seat)".utf8)
            let psk = HMAC<SHA256>.authenticationCode(for: identity, using: key)
            let keyData = psk.withUnsafeBytes { DispatchData(bytes: $0) }
            let identityData = identity.withUnsafeBytes { DispatchData(bytes: $0) }
            sec_protocol_options_add_pre_shared_key(options, keyData as __DispatchData, identityData as __DispatchData)
        }
        let tcp = NWProtocolTCP.Options()
        tcp.enableKeepalive = true; tcp.keepaliveIdle = 10; tcp.keepaliveInterval = 5; tcp.keepaliveCount = 3
        let parameters = NWParameters(tls: tls, tcp: tcp)
        parameters.includePeerToPeer = true
        return parameters
    }

    private static func randomHex(bytes count: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        guard SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess else {
            fatalError("Secure random generation is unavailable.")
        }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }
    private static func isHex(_ value: String, count: Int) -> Bool {
        value.utf8.count == count && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
    }
    private static func isPIN(_ value: String) -> Bool {
        value.utf8.count == 4 && value.utf8.allSatisfy { (48...57).contains($0) }
    }
    private static func randomPIN() -> String {
        while true {
            var value: UInt16 = 0
            guard SecRandomCopyBytes(kSecRandomDefault, MemoryLayout.size(ofValue: value), &value) == errSecSuccess else {
                fatalError("Secure random generation is unavailable.")
            }
            // Rejection sampling gives each PIN exactly the same probability.
            if value < 60_000 { return String(format: "%04d", Int(value % 10_000)) }
        }
    }
    private static func cleanName(_ value: String, fallback: String) -> String {
        let cleaned = value.unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) }.map(String.init).joined()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? fallback : String(cleaned.prefix(28))
    }
}
