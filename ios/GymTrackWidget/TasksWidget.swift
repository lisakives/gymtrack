import SwiftUI
import WidgetKit

struct TasksWidget: Widget {
    let kind = "GymTrackTasks"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GTProvider()) { entry in
            TasksView(entry: entry)
        }
        .configurationDisplayName("Päivän tehtävät")
        .description("Tehtävät, suoritusprosentti ja seuraava muistutus. Kuittaa tehtävät suoraan widgetistä.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct TasksView: View {
    @Environment(\.widgetFamily) private var family
    var entry: GTEntry

    var body: some View {
        content
            .gtBackground(family)
            .widgetURL(URL(string: "gymtrack://today"))
    }

    @ViewBuilder private var content: some View {
        let d = entry.day
        switch family {
        case .accessoryCircular:
            Gauge(value: Double(d.tasksDone), in: 0...Double(max(d.tasksTotal, 1))) {
                Image(systemName: "checkmark")
            } currentValueLabel: {
                Text("\(d.tasksDone)/\(d.tasksTotal)").font(.label(14))
            }
            .gaugeStyle(.accessoryCircular)
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                if let n = d.next {
                    Text("\(Image(systemName: "bell.fill")) \(DateUtil.clock(n.atDate))").font(.label(15)).widgetAccentable()
                    Text(n.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                } else {
                    Text("\(Image(systemName: "bell.fill")) Ei muistutuksia").font(.label(15)).widgetAccentable()
                }
                Text("Tehtävät \(d.tasksDone)/\(d.tasksTotal) tehty").font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
            }
        case .accessoryInline:
            if let n = d.next {
                Label("\(DateUtil.clock(n.atDate)) \(n.title)", systemImage: "bell.fill")
            } else {
                Label("Tehtävät \(d.tasksDone)/\(d.tasksTotal)", systemImage: "checkmark.circle")
            }
        case .systemMedium:
            if d.hasData { medium(d) } else { EmptyStateView() }
        case .systemLarge:
            if d.hasData { large(d) } else { EmptyStateView() }
        default:
            if d.hasData { small(d) } else { EmptyStateView() }
        }
    }

    private func pctText(_ d: DayState) -> String { "\(Int((d.taskProgress * 100).rounded())) %" }

    private func small(_ d: DayState) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            WidgetHeader(icon: "checkmark.circle.fill", title: "Tänään")
            HStack(spacing: 10) {
                ZStack {
                    Ring(progress: d.taskProgress, lineWidth: 7)
                    Text("\(d.tasksDone)/\(d.tasksTotal)").font(.display(17)).foregroundStyle(Theme.text).minimumScaleFactor(0.6)
                }
                .frame(width: 54, height: 54)
                VStack(alignment: .leading, spacing: -2) {
                    Text(pctText(d)).font(.display(24)).foregroundStyle(Theme.text)
                    Text("tehty").font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.muted)
                }
            }
            Spacer(minLength: 0)
            NextReminderView(next: d.next, compact: true)
        }
    }

    private func medium(_ d: DayState) -> some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                WidgetHeader(icon: "checkmark.circle.fill", title: "Tänään")
                ZStack {
                    Ring(progress: d.taskProgress, lineWidth: 9)
                    VStack(spacing: -3) {
                        Text(pctText(d)).font(.display(22)).foregroundStyle(Theme.text).minimumScaleFactor(0.6)
                        Text("\(d.tasksDone)/\(d.tasksTotal)").font(.label(11)).foregroundStyle(Theme.muted)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .frame(width: 100)

            VStack(alignment: .leading, spacing: 7) {
                let open = d.openTasks(now: entry.date)
                if open.isEmpty {
                    Spacer(minLength: 0)
                    Label("Kaikki tehty!", systemImage: "checkmark.seal.fill")
                        .font(.label(17)).foregroundStyle(Theme.good)
                    Text("Hyvää työtä tänään.").font(.system(size: 12)).foregroundStyle(Theme.muted)
                    Spacer(minLength: 0)
                } else {
                    ForEach(open.prefix(4)) { t in TaskRow(task: t, date: d.dateISO, size: 12.5) }
                    Spacer(minLength: 0)
                }
            }
        }
    }

    private func large(_ d: DayState) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                ZStack {
                    Ring(progress: d.taskProgress, lineWidth: 7)
                    Text(pctText(d)).font(.display(15)).foregroundStyle(Theme.text).minimumScaleFactor(0.6)
                }
                .frame(width: 50, height: 50)
                VStack(alignment: .leading, spacing: 0) {
                    Text("PÄIVÄN TEHTÄVÄT").font(.label(12)).tracking(0.8).foregroundStyle(Theme.muted)
                    Text("\(d.tasksDone) / \(d.tasksTotal) tehty").font(.display(24)).foregroundStyle(Theme.text)
                }
                Spacer(minLength: 0)
                if d.trip {
                    Label("Keikalla", systemImage: "car.fill").font(.label(12)).foregroundStyle(Theme.accentStrong)
                }
            }
            Rectangle().fill(Theme.border).frame(height: 1)
            VStack(alignment: .leading, spacing: 7) {
                ForEach(d.tasks.prefix(7)) { t in TaskRow(task: t, date: d.dateISO, size: 14) }
                if d.tasks.isEmpty {
                    Text("Ei tehtäviä tälle päivälle.").font(.system(size: 13)).foregroundStyle(Theme.muted)
                }
            }
            Spacer(minLength: 0)
            NextReminderView(next: d.next)
        }
    }
}
