import Foundation
import Network
import Security
import CryptoKit

/// All state and Network callbacks run on the main queue. The host alone routes
/// projected game state; the transport never broadcasts a received payload.
final class NearbyTransport {
    static let maximumFrame = 256 * 1024
    private static let service = "_bridgeroom._tcp"
    private static let protocolVersion = 1
    var onEvent: (([String: Any]) -> Void)?

    private final class Channel {
        let id = UUID()
        let connection: NWConnection
        var buffer = Data()
        var peerID: String?
        var deadline: DispatchWorkItem?
        init(_ connection: NWConnection) { self.connection = connection }
    }

    private var listener: NWListener?
    private var browser: NWBrowser?
    private var discovered: [String: NWEndpoint] = [:]
    private var channels: [UUID: Channel] = [:]
    private var peers: [String: UUID] = [:]
    private var inviteOwners: [String: String] = [:]
    private var invites: [String] = []
    private var hostID: String?
    private var hostName = "Bridge table"
    private var hostAnnounced = false
    private var hostRetry: DispatchWorkItem?
    private var hostRetryCount = 0
    private var guestChannel: UUID?
    private var endpoint: NWEndpoint?
    private var guestCode: String?
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
        case "host": host(name: message["name"] as? String ?? "Bridge table")
        case "browse": browse()
        case "join":
            guard let table = message["tableId"] as? String,
                  let code = message["code"] as? String else { return error("Choose a table and enter its invitation code.") }
            join(table: table, code: code, name: message["name"] as? String ?? "Player")
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
        hostID = nil; invites = []; inviteOwners = [:]
        hostAnnounced = false; hostRetryCount = 0
        endpoint = nil; guestCode = nil; guestChannel = nil
        guestWelcomed = false; retryCount = 0
        if notify { emit(["type": "left"]) }
    }

    private func host(name: String) {
        leave(notify: false)
        hostID = Self.randomHex(bytes: 16)
        hostName = Self.cleanName(name, fallback: "Bridge table")
        invites = (0..<3).map { _ in Self.randomHex(bytes: 16) }
        startHostListener()
    }

    private func startHostListener() {
        guard foreground, listener == nil, let id = hostID else { return }
        hostRetry?.cancel(); hostRetry = nil
        let current = generation, name = hostName, secrets = invites
        do {
            let listener = try NWListener(using: Self.parameters(secrets: secrets))
            self.listener = listener
            listener.service = NWListener.Service(name: name + " · " + id.prefix(8), type: Self.service)
            listener.stateUpdateHandler = { [weak self, weak listener] state in
                guard let self, self.generation == current, self.listener === listener else { return }
                switch state {
                case .ready:
                    self.hostRetryCount = 0
                    if !self.hostAnnounced {
                        self.hostAnnounced = true
                        self.emit(["type": "hosting", "id": id, "name": name, "invites": secrets.map(Self.displayCode)])
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
                guard let self, self.generation == current, self.hostID != nil, self.channels.count < 8 else { connection.cancel(); return }
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
            case .ready: self.status("Choose a nearby table. Ask its host for your invitation code.")
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

    private func join(table: String, code: String, name: String) {
        guard let selected = discovered[table] else { return error("That table is no longer nearby. Refresh the table list.") }
        let normalized = code.replacingOccurrences(of: "-", with: "").components(separatedBy: .whitespacesAndNewlines).joined().lowercased()
        guard Self.isHex(normalized, count: 32) else { return error("Enter all 32 letters and numbers in your invitation code.") }
        leave(notify: false)
        endpoint = selected; guestCode = normalized
        guestName = Self.cleanName(name, fallback: "Player")
        connect()
    }

    private func connect() {
        guard foreground, guestChannel == nil, let endpoint, let guestCode else { return }
        retry?.cancel(); retry = nil
        guestWelcomed = false
        status(retryCount == 0 ? "Connecting to the table…" : "Reconnecting to your seat…")
        let connection = NWConnection(to: endpoint, using: Self.parameters(secrets: [guestCode]))
        start(connection, outgoing: true, generation: generation)
    }

    private func start(_ connection: NWConnection, outgoing: Bool, generation current: UUID) {
        let channel = Channel(connection)
        channels[channel.id] = channel
        if outgoing { guestChannel = channel.id }
        let timeout = DispatchWorkItem { [weak self, weak channel] in
            guard let self, let channel, self.generation == current, self.channels[channel.id] === channel,
                  channel.peerID == nil else { return }
            self.close(channel, reason: "The table did not respond. Check the invitation code and keep both apps open.")
        }
        channel.deadline = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 18, execute: timeout)
        connection.stateUpdateHandler = { [weak self, weak channel] state in
            guard let self, let channel, self.generation == current, self.channels[channel.id] === channel else { return }
            switch state {
            case .ready:
                if outgoing {
                    self.send(["type": "hello", "version": Self.protocolVersion, "id": self.playerID,
                               "name": self.guestName, "invite": self.guestCode ?? ""], on: channel)
                }
                self.receive(channel)
            case .waiting(let failure):
                if outgoing, case .tls = failure {
                    self.endpoint = nil; self.guestCode = nil
                    self.error("The invitation code did not match. Browse for the table again and enter the code its host gave you.")
                    self.close(channel, reason: self.description(failure))
                } else { self.networkStatus(failure) }
            case .failed(let failure):
                if outgoing, case .tls = failure {
                    self.endpoint = nil; self.guestCode = nil
                    self.error("The invitation code did not match. Browse for the table again and enter the code its host gave you.")
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
                    if self.channels[channel.id] !== channel { return }
                }
                guard channel.buffer.count <= Self.maximumFrame + 4 else { return self.close(channel, reason: "Message is too large.") }
            }
            if let failure { self.close(channel, reason: self.description(failure)) }
            else if complete { self.close(channel, reason: "The connection closed.") }
            else { self.receive(channel) }
        }
    }

    private func received(_ message: [String: Any], on channel: Channel) {
        if hostID == nil, guestChannel == channel.id, guestWelcomed, message["type"] as? String == "ended" {
            endpoint = nil; guestCode = nil
            close(channel)
            emit(["type": "ended", "message": "The host closed this table. You can host or join a new table."])
            return
        }
        if hostID != nil, channel.peerID == nil {
            guard message["type"] as? String == "hello", message["version"] as? Int == Self.protocolVersion,
                  let id = message["id"] as? String, Self.isHex(id, count: 64),
                  let invite = message["invite"] as? String, invites.contains(invite),
                  let name = message["name"] as? String, name.utf8.count <= 160,
                  inviteOwners[invite] == nil || inviteOwners[invite] == id,
                  !inviteOwners.contains(where: { $0.key != invite && $0.value == id }) else {
                return reject(channel, message: "This invitation is invalid or already belongs to another player.")
            }
            guard peers[id] != nil || peers.count < 3 else { return reject(channel, message: "This table is full.") }
            inviteOwners[invite] = id
            let previous = peers[id].flatMap { channels[$0] }
            channel.peerID = id; channel.deadline?.cancel(); channel.deadline = nil
            peers[id] = channel.id
            if let previous { close(previous) } // Mapping changed first: old callbacks cannot disconnect the replacement.
            send(["type": "welcome", "version": Self.protocolVersion, "id": id], on: channel)
            emit(["type": "peer", "id": id, "name": Self.cleanName(name, fallback: "Player"), "connected": true])
            return
        }
        if hostID == nil, guestChannel == channel.id, !guestWelcomed {
            if message["type"] as? String == "reject" {
                endpoint = nil; guestCode = nil
                error(message["message"] as? String ?? "This invitation cannot join the table.")
                close(channel); return
            }
            guard message["type"] as? String == "welcome", message["version"] as? Int == Self.protocolVersion,
                  message["id"] as? String == playerID else { return close(channel, reason: "The table uses an incompatible protocol.") }
            channel.peerID = "host"; channel.deadline?.cancel(); channel.deadline = nil
            guestWelcomed = true; retryCount = 0
            emit(["type": "joined", "id": playerID])
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
            emit(["type": "peer", "id": id, "name": "", "connected": false])
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
    private func description(_ failure: NWError) -> String {
        if case .dns(let code) = failure, code == -65570 {
            return "Allow Local Network access in Settings → Bridge Room, then return to the app."
        }
        if case .tls = failure { return "The invitation code did not match. Leave this table and enter your code again." }
        return "The nearby connection is unavailable. Keep Wi-Fi on and the host app open."
    }
    private func status(_ message: String) { emit(["type": "status", "message": message]) }
    private func error(_ message: String) { emit(["type": "error", "message": message]) }
    private func emit(_ event: [String: Any]) { onEvent?(event) }

    private static func parameters(secrets: [String]) -> NWParameters {
        let tls = NWProtocolTLS.Options()
        let options = tls.securityProtocolOptions
        sec_protocol_options_set_min_tls_protocol_version(options, .TLSv12)
        sec_protocol_options_set_max_tls_protocol_version(options, .TLSv12)
        sec_protocol_options_append_tls_ciphersuite(options, tls_ciphersuite_t(rawValue: TLS_PSK_WITH_AES_128_GCM_SHA256)!)
        for secret in secrets {
            let key = SymmetricKey(data: Data(secret.utf8))
            let psk = HMAC<SHA256>.authenticationCode(for: Data("BridgeRoom transport v1".utf8), using: key)
            let identity = HMAC<SHA256>.authenticationCode(for: Data("BridgeRoom invitation identity v1".utf8), using: key)
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
    private static func displayCode(_ code: String) -> String {
        stride(from: 0, to: code.count, by: 4).map { offset in
            String(code.dropFirst(offset).prefix(4)).uppercased()
        }.joined(separator: "-")
    }
    private static func cleanName(_ value: String, fallback: String) -> String {
        let cleaned = value.unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) }.map(String.init).joined()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? fallback : String(cleaned.prefix(28))
    }
}
