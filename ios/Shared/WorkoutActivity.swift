import ActivityKit
import Foundation

/// Käynnissä oleva treeni lukitusnäytöllä ja Dynamic Islandissa (Live Activity).
struct WorkoutAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var setsDone: Int
        var setsTotal: Int
        var exercise: String?
        var restEndsAt: Date?
        var restStartedAt: Date?

        /// Onko lepoajastin käynnissä hetkellä `now`
        func resting(at now: Date = Date()) -> Bool {
            guard let end = restEndsAt else { return false }
            return end > now
        }
        var progress: Double { setsTotal > 0 ? Double(setsDone) / Double(setsTotal) : 0 }
    }

    var sessionId: String
    var name: String
    var startedAt: Date
}
