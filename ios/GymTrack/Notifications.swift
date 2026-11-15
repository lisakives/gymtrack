import Foundation
import UIKit
import UserNotifications
import WidgetKit

/// Muistutukset iPhonen omina ilmoituksina. Verkkosovellus laskee seuraavan 7 päivän
/// muistutukset (js/native.js) ja sovellus ajastaa ne tällä.
enum Notifications {
    static let category = "GT_TASK"
    static let doneAction = "GT_DONE"
    static let snoozeAction = "GT_SNOOZE"
    private static let prefix = "gt-"

    static func registerCategories() {
        let done = UNNotificationAction(identifier: doneAction, title: "Tehty", options: [], icon: UNNotificationActionIcon(systemImageName: "checkmark.circle"))
        let snooze = UNNotificationAction(identifier: snoozeAction, title: "Torkuta 10 min", options: [], icon: UNNotificationActionIcon(systemImageName: "clock.arrow.circlepath"))
        let cat = UNNotificationCategory(identifier: category, actions: [done, snooze], intentIdentifiers: [], options: [])
        UNUserNotificationCenter.current().setNotificationCategories([cat])
    }

    static func status(_ completion: @escaping (String) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { s in
            let value: String
            switch s.authorizationStatus {
            case .authorized, .provisional, .ephemeral: value = "granted"
            case .denied: value = "denied"
            default: value = "default"
            }
            DispatchQueue.main.async { completion(value) }
        }
    }

    static func request(_ completion: @escaping (Bool) -> Void) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            DispatchQueue.main.async { completion(granted) }
        }
    }

    /// Korvaa aiemmin ajastetut muistutukset uudella listalla.
    static func schedule(_ items: [[String: Any]]) {
        let center = UNUserNotificationCenter.current()
        let wanted = Set(items.compactMap { $0["id"] as? String })
        center.getPendingNotificationRequests { pending in
            let stale = pending.map(\.identifier).filter { $0.hasPrefix(prefix) && !wanted.contains($0) }
            if !stale.isEmpty { center.removePendingNotificationRequests(withIdentifiers: stale) }
            for item in items {
                guard let id = item["id"] as? String,
                      let atMs = (item["at"] as? NSNumber)?.doubleValue,
                      let title = item["title"] as? String else { continue }
                let at = Date(timeIntervalSince1970: atMs / 1000)
                guard at > Date() else { continue }
                let content = UNMutableNotificationContent()
                content.title = title
                content.body = (item["body"] as? String) ?? ""
                content.sound = .default
                content.threadIdentifier = "gymtrack"
                content.categoryIdentifier = category
                var info: [String: Any] = [:]
                if let rid = item["rid"] as? String { info["rid"] = rid }
                if let date = item["date"] as? String { info["date"] = date }
                content.userInfo = info
                let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: at)
                let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
                center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
            }
        }
    }

    /// Torkutus ilmoituksen painikkeesta (sovellusta ei tarvitse avata).
    static func snooze(content old: UNNotificationContent, rid: String, minutes: Int) {
        let until = Date().addingTimeInterval(TimeInterval(minutes * 60))
        let content = UNMutableNotificationContent()
        content.title = old.title
        content.body = old.body.hasSuffix("(torkutettu)") ? old.body : old.body + " (torkutettu)"
        content.sound = .default
        content.threadIdentifier = "gymtrack"
        content.categoryIdentifier = category
        content.userInfo = old.userInfo
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(minutes * 60), repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "gt-snooze-\(rid)", content: content, trigger: trigger))
        SharedStore.enqueue(PendingAction(type: "snooze", rid: rid, date: nil, until: until.timeIntervalSince1970 * 1000))
    }

    static func test(delay: Double) {
        let content = UNMutableNotificationContent()
        content.title = "GymTrack"
        content.body = "Testi-ilmoitus toimii. Muistutukset tulevat näin."
        content.sound = .default
        content.threadIdentifier = "gymtrack"
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, delay), repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "test-\(UUID().uuidString)", content: content, trigger: trigger))
    }
}
