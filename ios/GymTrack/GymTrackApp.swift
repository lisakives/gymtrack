import SwiftUI
import UserNotifications
import WidgetKit

@main
struct GymTrackApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            WebAppView()
                .ignoresSafeArea()
                .background(Theme.bg.ignoresSafeArea())
                .preferredColorScheme(.dark)
                .onOpenURL { AppModel.shared.open(url: $0) }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { AppModel.shared.becameActive() }
            if phase == .background { WidgetCenter.shared.reloadAllTimelines() }
        }
    }
}

/// Ilmoitukset: näytetään myös sovelluksen ollessa auki, ja käsitellään Tehty / Torkuta -painikkeet.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        Notifications.registerCategories()
        return true
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // Lepoajan päättymisen sovellus näyttää itse, kun se on auki
        if notification.request.identifier == "rest-end" { completionHandler([]); return }
        completionHandler([.banner, .list, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let content = response.notification.request.content
        let rid = content.userInfo["rid"] as? String
        let date = (content.userInfo["date"] as? String) ?? DateUtil.iso(Date())

        switch response.actionIdentifier {
        case Notifications.doneAction:
            if let rid { SharedStore.completeTask(rid: rid, date: date) }
            DispatchQueue.main.async { AppModel.shared.pullActions() }
        case Notifications.snoozeAction:
            if let rid { Notifications.snooze(content: content, rid: rid, minutes: 10) }
            DispatchQueue.main.async { AppModel.shared.pullActions() }
        default:
            // Ilmoitusta napautettu: avataan tehtävä Tänään-näkymään
            let hash = (content.userInfo["hash"] as? String)
                ?? rid.map { "#/today?r=" + ($0.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? $0) } ?? "#/today"
            DispatchQueue.main.async { AppModel.shared.open(hash: hash) }
        }
        completionHandler()
    }
}
