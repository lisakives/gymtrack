import SwiftUI
import WidgetKit

/// Neljä pikanäppäintä sovelluksen tärkeimpiin kohtiin, jokaisen alla päivän tilanne.
struct QuickActionsWidget: Widget {
    let kind = "GymTrackQuickActions"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GTProvider()) { entry in
            QuickActionsView(entry: entry)
        }
        .configurationDisplayName("Pikatoiminnot")
        .description("Kirjaa ateria, aloita treeni, punnitse tai katso tehtävät yhdellä napautuksella.")
        .supportedFamilies([.systemMedium])
    }
}

struct QuickActionsView: View {
    var entry: GTEntry

    var body: some View {
        let d = entry.day
        VStack(alignment: .leading, spacing: 10) {
            WidgetHeader(icon: "bolt.fill", title: "Pikatoiminnot")
            HStack(spacing: 8) {
                tile("fork.knife", "Ateria", d.hasData ? "\(Fmt.int(d.kcal)) kcal" : "Kirjaa", "gymtrack://food")
                tile("dumbbell.fill", "Treeni", d.nextWorkout?.name ?? "Aloita", "gymtrack://workout")
                tile("scalemass.fill", "Punnitus", (d.weights.last?.value ?? d.weight?.value).map { "\(Fmt.one($0)) kg" } ?? "Lisää", "gymtrack://body")
                tile("checklist", "Tehtävät", d.tasksTotal > 0 ? "\(d.tasksDone)/\(d.tasksTotal)" : "Avaa", "gymtrack://today")
            }
        }
        .containerBackground(for: .widget) { Theme.widgetBackground }
    }

    private func tile(_ icon: String, _ title: String, _ sub: String, _ url: String) -> some View {
        Link(destination: URL(string: url)!) {
            VStack(spacing: 5) {
                ZStack {
                    Circle().fill(Theme.accent).widgetAccentable()
                    Image(systemName: icon).font(.system(size: 17, weight: .bold)).foregroundStyle(.white)
                }
                .frame(width: 40, height: 40)
                Text(title).font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.text).lineLimit(1)
                Text(sub).font(.label(11.5)).foregroundStyle(Theme.muted).lineLimit(1).minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.surface2.opacity(0.85)))
        }
    }
}
