import SwiftUI

@main
struct BridgeRoomApp: App {
    var body: some Scene {
        WindowGroup { NativeHome() }
    }
}

private enum PlayMode: String, Identifiable {
    case solo, nearby
    var id: String { rawValue }
    var title: String { self == .solo ? "Solo practice" : "Nearby table" }
}

private struct NativeHome: View {
    @State private var mode: PlayMode?
    @State private var confirmingExit = false
    private let felt = Color(red: 0.06, green: 0.22, blue: 0.18)

    var body: some View {
        ZStack {
            felt.ignoresSafeArea()
            VStack(spacing: 24) {
                Spacer()
                Text("♠").font(.system(size: 64)).foregroundStyle(Color(red: 0.91, green: 0.78, blue: 0.51))
                Text("The Bridge Room").font(.system(size: 36, design: .serif)).multilineTextAlignment(.center)
                Text("Your table. Anywhere.").font(.title3).foregroundStyle(.white.opacity(0.75))
                VStack(spacing: 14) {
                    Button { mode = .solo } label: {
                        modeLabel("Play solo", detail: "Practice with three GIB-style bots", icon: "person.fill")
                    }
                    Button { mode = .nearby } label: {
                        modeLabel("Play nearby", detail: "Host or join with nearby iPhones and iPads", icon: "person.3.fill")
                    }
                }.padding(.top, 16)
                Text("Solo play works offline. Nearby play uses Wi-Fi without an internet connection. Keep the host app open while playing.")
                    .font(.footnote).foregroundStyle(.white.opacity(0.72)).multilineTextAlignment(.center)
                Spacer()
                Text("GIB-style 2/1 · Duplicate bridge").font(.caption).foregroundStyle(.white.opacity(0.6))
            }.padding(28).frame(maxWidth: 540)
        }
        .foregroundStyle(.white)
        .fullScreenCover(item: $mode) { chosen in
            NavigationStack {
                GameWebView(entry: chosen.rawValue)
                    .navigationTitle(chosen.title)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarLeading) {
                            Button("Home") { confirmingExit = true }
                        }
                    }
                    .alert("Leave the table?", isPresented: $confirmingExit) {
                        Button("Keep playing", role: .cancel) {}
                        Button("Leave table", role: .destructive) { mode = nil }
                    } message: {
                        Text(chosen == .nearby ? "If you are hosting, leaving closes the table for everyone." : "Your current solo game will close.")
                    }
            }.tint(felt)
        }
    }

    private func modeLabel(_ title: String, detail: String, icon: String) -> some View {
        HStack(spacing: 16) {
            Image(systemName: icon).font(.title2).frame(width: 38)
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.headline)
                Text(detail).font(.subheadline).foregroundStyle(.white.opacity(0.78))
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
        }
        .padding(20).frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.white.opacity(0.22)))
    }
}
