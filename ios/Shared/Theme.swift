import SwiftUI

/// GymTrackin värit (samat kuin verkkosovelluksen styles.css).
enum Theme {
    static let bg = Color(red: 10 / 255, green: 11 / 255, blue: 13 / 255)
    static let surface = Color(red: 20 / 255, green: 22 / 255, blue: 25 / 255)
    static let surface2 = Color(red: 27 / 255, green: 30 / 255, blue: 34 / 255)
    static let border = Color.white.opacity(0.07)
    static let text = Color(red: 238 / 255, green: 241 / 255, blue: 244 / 255)
    static let muted = Color(red: 133 / 255, green: 140 / 255, blue: 150 / 255)
    static let faint = Color(red: 84 / 255, green: 90 / 255, blue: 99 / 255)
    static let accent = Color(red: 229 / 255, green: 57 / 255, blue: 59 / 255)
    static let accentStrong = Color(red: 1, green: 106 / 255, blue: 100 / 255)
    static let good = Color(red: 130 / 255, green: 209 / 255, blue: 174 / 255)
    static let protein = Color(red: 1, green: 140 / 255, blue: 120 / 255)

    static let uiBackground = UIColor(red: 10 / 255, green: 11 / 255, blue: 13 / 255, alpha: 1)

    /// Widgetin tausta: musta, jossa hento punainen hehku oikeassa yläkulmassa.
    static var widgetBackground: some View {
        ZStack {
            bg
            RadialGradient(colors: [accent.opacity(0.22), .clear], center: .topTrailing, startRadius: 0, endRadius: 190)
        }
    }
}
