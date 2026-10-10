// Run with ./tests/native/run.sh on macOS. The runner uses a temporary copy
// of the production transport to inspect internals without shipping test hooks.
import Foundation
import Network
import Security
import Darwin

@main struct NativeTransportRegression {
    @MainActor static func require(_ condition: @autoclosure () -> Bool, _ message: String) {
        if !condition() { print("FAIL: \(message)"); cleanupCredentials(); exit(1) }
        print("PASS: \(message)"); fflush(stdout)
    }
    @MainActor static func waitFor(_ label: String, _ test: () -> Bool) async {
        for _ in 0..<1200 {
            if test() { return }
            try? await Task.sleep(nanoseconds: 25_000_000)
        }
        print("FAIL: timed out waiting for \(label)"); cleanupCredentials(); exit(1)
    }
    @MainActor static func cleanupCredentials() {
        NearbyTransport.savedSeats = []
        NearbyTransport.persistSavedSeats()
    }
    @MainActor static func main() async {
        let host = NearbyTransport()
        var hostEvents: [[String: Any]] = []
        host.onEvent = { hostEvents.append($0) }
        host.handle(["type":"host", "seat":2, "name":"Bridge PIN regression"])
        await waitFor("host listener") { host.hostAnnounced }
        require(host.invites.count == 3 && host.invites["S"] == nil, "three invitations exclude host seat")
        require(Set(host.invites.values).count == 3 && host.invites.values.allSatisfy(NearbyTransport.isPIN), "PINs are unique four-digit strings")
        require(NearbyTransport.isPIN("0000") && !NearbyTransport.isPIN("123") && !NearbyTransport.isPIN("12e4") && !NearbyTransport.isPIN("１２３４"), "PIN validation preserves leading zeroes and accepts only ASCII digits")
        let hosted = hostEvents.first { $0["type"] as? String == "hosting" }!
        require(hosted["seat"] as? Int == 2 && (hosted["invites"] as? [[String:Any]])?.count == 3, "hosting event carries seat/PIN objects")
        let endpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: host.listener!.port!)
        func guest(_ digit: String) -> NearbyTransport {
            let transport = NearbyTransport()
            transport.playerID = String(repeating: digit, count: 64)
            transport.discovered["table"] = endpoint
            return transport
        }
        let north = guest("a")
        var northEvents: [[String: Any]] = []
        north.onEvent = { northEvents.append($0) }
        north.handle(["type":"join", "tableId":"table", "seat":0, "code":host.invites["N"]!, "name":"North"])
        await waitFor("north seat confirmed") { north.guestWelcomed && host.confirmedSeats.contains("N") }
        require(host.inviteOwners["N"] == north.playerID && host.peers.count == 1, "PIN claims the requested seat")
        require(NearbyTransport.isHex(north.guestResumeSecret!, count: 64), "welcome gives native strong reconnect token")
        require(northEvents.contains { $0["type"] as? String == "joined" && $0["seat"] as? Int == 0 }, "joined event carries assigned seat")
        let metadata = north.channels[north.guestChannel!]!.connection.metadata(definition: NWProtocolTLS.definition) as! NWProtocolTLS.Metadata
        require(sec_protocol_metadata_get_negotiated_tls_ciphersuite(metadata.securityProtocolMetadata).rawValue == TLS_ECDHE_PSK_WITH_CHACHA20_POLY1305_SHA256, "actual transport negotiates ECDHE-PSK ChaCha20-Poly1305")
        let original = north.guestChannel
        north.setActive(false)
        north.setActive(true)
        await waitFor("strong token reconnect") { north.guestWelcomed && north.guestChannel != original }
        require(host.inviteOwners["N"] == north.playerID && host.peers.count == 1, "background/foreground reconnect restores reserved seat")
        let wrong = guest("b")
        var wrongEvents: [[String:Any]] = []
        wrong.onEvent = { wrongEvents.append($0) }
        wrong.handle(["type":"join", "tableId":"table", "seat":1, "code":host.invites["N"]!, "name":"Wrong"])
        await waitFor("wrong-seat rejection") { wrongEvents.contains { $0["type"] as? String == "error" } }
        require(!wrong.guestWelcomed && host.inviteOwners["E"] == nil, "another seat's valid PIN cannot join")
        let taken = guest("c")
        var takenEvents: [[String:Any]] = []
        taken.onEvent = { takenEvents.append($0) }
        taken.handle(["type":"join", "tableId":"table", "seat":0, "code":host.invites["N"]!, "name":"Taken"])
        await waitFor("occupied seat rejection") { takenEvents.contains { $0["type"] as? String == "error" } }
        require(!taken.guestWelcomed && host.inviteOwners["N"] == north.playerID, "claimed PIN cannot steal another player's seat")
        let savedCredential = NearbyTransport.savedSeats
        NearbyTransport.savedSeats = []
        let oldPIN = guest("a")
        var oldPINEvents: [[String:Any]] = []
        oldPIN.onEvent = { oldPINEvents.append($0) }
        oldPIN.handle(["type":"join", "tableId":"table", "seat":0, "code":host.invites["N"]!, "name":"Old PIN"])
        await waitFor("retired PIN rejection") { oldPINEvents.contains { $0["type"] as? String == "error" } }
        require(!oldPIN.guestWelcomed && north.guestWelcomed, "acknowledged PIN cannot replace even the same ID without reconnect token")
        NearbyTransport.savedSeats = savedCredential
        NearbyTransport.persistSavedSeats()
        let secondSeat = guest("a")
        var secondEvents: [[String:Any]] = []
        secondSeat.onEvent = { secondEvents.append($0) }
        secondSeat.handle(["type":"join", "tableId":"table", "seat":1, "code":host.invites["E"]!, "name":"Second seat"])
        await waitFor("duplicate device rejection") { secondEvents.contains { $0["type"] as? String == "error" } }
        require(host.inviteOwners["E"] == nil && host.peers.count == 1, "one player cannot occupy two seats")
        let firstPayload = ["move":"test"]
        north.handle(["type":"send", "payload":firstPayload])
        await waitFor("payload after reconnect") { hostEvents.contains { ($0["payload"] as? [String:String]) == firstPayload } }
        require(true, "game payload still traverses reconnected encrypted channel")
        let pin = host.invites["N"]!
        let token = north.guestResumeSecret
        north.leave(notify:false)
        north.discovered["table"] = endpoint
        north.handle(["type":"join", "tableId":"table", "seat":0, "code":pin, "name":"North"])
        await waitFor("manual leave/rejoin") { north.guestWelcomed }
        require(north.guestResumeSecret == token && host.peers.count == 1, "manual Leave and PIN rejoin recovers strong native token")
        north.leave(notify:false)
        NearbyTransport.savedSeats = NearbyTransport.loadSavedSeats()
        require(NearbyTransport.savedSeats.contains { $0.secret == token }, "native reconnect token reloads from Keychain")
        let relaunched = guest("a")
        relaunched.handle(["type":"join", "tableId":"table", "seat":0, "code":pin, "name":"North relaunched"])
        await waitFor("recreated transport rejoin") { relaunched.guestWelcomed }
        require(relaunched.guestResumeSecret == token && host.peers.count == 1, "fresh transport recovers reserved seat after cache reload")
        host.handshakeAttempts = Array(repeating: ProcessInfo.processInfo.systemUptime, count: 12)
        relaunched.setActive(false)
        relaunched.setActive(true)
        try? await Task.sleep(nanoseconds: 2_000_000_000)
        require(relaunched.endpoint != nil && relaunched.guestResumeSecret == token && !relaunched.guestWelcomed, "pre-TLS admission closure preserves strong reconnect credentials and retry")
        host.handshakeAttempts = []
        await waitFor("reconnect after admission cooldown") { relaunched.guestWelcomed }
        require(host.peers.count == 1, "throttled guest reconnects after admission window reopens")
        host.handshakeAttempts = []
        require((0..<12).allSatisfy { _ in host.admitHandshake() } && !host.admitHandshake(), "global admission budget blocks thirteenth handshake")
        host.handshakeAttempts = [ProcessInfo.processInfo.systemUptime - 61]
        require(host.admitHandshake() && host.handshakeAttempts.count == 1, "admission budget expires after cooldown")
        let challenged = guest("a")
        challenged.guestTable = "table"
        challenged.guestSeat = "N"
        challenged.guestResumeSecret = token
        challenged.endpoint = endpoint
        challenged.authenticationFailed()
        require(NearbyTransport.savedSeats.contains { $0.secret == token }, "unauthenticated TLS failure cannot erase the reserved-seat token")
        host.leave(notify:false)
        await waitFor("host-ended credential deletion") { relaunched.endpoint == nil && relaunched.guestChannel == nil }
        require(!NearbyTransport.loadSavedSeats().contains { $0.secret == token }, "authenticated table-ended message removes saved credential")
        for transport in [wrong, taken, oldPIN, secondSeat, north, relaunched, host] { transport.leave(notify:false) }
        require(host.resumeSecrets.isEmpty && host.invites.isEmpty && host.confirmedSeats.isEmpty, "leaving destroys table credentials")
        cleanupCredentials()
        print("All native seat PIN regressions passed.")
        exit(0)
    }
}
