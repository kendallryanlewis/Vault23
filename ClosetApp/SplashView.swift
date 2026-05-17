import SwiftUI

struct SplashView: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(white: 1.0), Color(white: 0.92)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            Text("V  |  23")
                .font(.system(size: 72, weight: .black, design: .default))
                .foregroundStyle(Color.black)
                .tracking(4)
                .shadow(color: .white.opacity(0.9), radius: 1, x: -1, y: -1)
                .shadow(color: .black.opacity(0.35), radius: 2, x: 3, y: 3)
                .shadow(color: .black.opacity(0.12), radius: 8, x: 6, y: 6)
        }
    }
}
