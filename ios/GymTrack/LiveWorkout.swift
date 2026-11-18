import ActivityKit
import Foundation
import UserNotifications

/// Aloittaa, päivittää ja lopettaa treenin Live Activityn verkkosovelluksen tietojen perusteella.
/// Lisäksi ajastaa ilmoituksen lepoajan päättymisestä, jos sovellus on taustalla.
enum LiveWorkout {
    private static let restNotificationID = "rest-end"

    static func update(_ live: [String: Any]?) {
        scheduleRestEnd(live)
        guard let live,
              let id = live["id"] as? String,
              let startedMs = (live["startedAt"] as? NSNumber)?.doubleValue else {
            endAll()
            return
        }
        let restEnd = (live["restEndsAt"] as? NSNumber).map { Date(timeIntervalSince1970: $0.doubleValue / 1000) }
        let restTotal = (live["restTotal"] as? NSNumber)?.doubleValue
        let state = WorkoutAttributes.ContentState(
            setsDone: (live["setsDone"] as? NSNumber)?.intValue ?? 0,
            setsTotal: (live["setsTotal"] as? NSNumber)?.intValue ?? 0,
            exercise: live["exercise"] as? String,
            restEndsAt: restEnd,
            restStartedAt: restEnd.flatMap { end in restTotal.map { end.addingTimeInterval(-$0) } }
        )
        let content = ActivityContent(state: state, staleDate: nil)

        let current = Activity<WorkoutAttributes>.activities
        if let existing = current.first(where: { $0.attributes.sessionId == id }) {
            Task { await existing.update(content) }
            for other in current where other.id != existing.id { Task { await other.end(nil, dismissalPolicy: .immediate) } }
            return
        }
        endAll()
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let attributes = WorkoutAttributes(
            sessionId: id,
            name: (live["name"] as? String) ?? "Treeni",
            startedAt: Date(timeIntervalSince1970: startedMs / 1000)
        )
        _ = try? Activity.request(attributes: attributes, content: content, pushType: nil)
    }

    static func endAll() {
        for activity in Activity<WorkoutAttributes>.activities {
            Task { await activity.end(nil, dismissalPolicy: .immediate) }
        }
    }

    private static func scheduleRestEnd(_ live: [String: Any]?) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [restNotificationID])
        guard let ms = (live?["restEndsAt"] as? NSNumber)?.doubleValue else { return }
        let end = Date(timeIntervalSince1970: ms / 1000)
        let seconds = end.timeIntervalSinceNow
        guard seconds > 1 else { return }
        let content = UNMutableNotificationContent()
        content.title = "Lepo päättyi"
        if let ex = live?["exercise"] as? String, !ex.isEmpty { content.body = "Seuraava sarja: \(ex)" } else { content.body = "Aika seuraavaan sarjaan." }
        content.sound = .default
        content.threadIdentifier = "gymtrack-rest"
        content.userInfo = ["hash": "#/session"]
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
        center.add(UNNotificationRequest(identifier: restNotificationID, content: content, trigger: trigger))
    }
}
