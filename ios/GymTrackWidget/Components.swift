import AppIntents
import SwiftUI
import WidgetKit

enum Fmt {
    private static let nf: NumberFormatter = {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "fi_FI")
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return f
    }()
    static func int(_ v: Double) -> String { nf.string(from: NSNumber(value: v.rounded())) ?? "\(Int(v.rounded()))" }
    static func one(_ v: Double) -> String {
        let f = NumberFormatter(); f.locale = Locale(identifier: "fi_FI"); f.maximumFractionDigits = 1; f.minimumFractionDigits = 1
        return f.string(from: NSNumber(value: v)) ?? String(v)
    }
}

/// Isot numerot kapealla, lihavalla fontilla (vastaa sovelluksen Barlow Condensed -fonttia).
extension Font {
    static func display(_ size: CGFloat) -> Font { .system(size: size, weight: .heavy, design: .default).width(.condensed) }
    static func label(_ size: CGFloat) -> Font { .system(size: size, weight: .bold, design: .default).width(.condensed) }
}

struct Ring: View {
    var progress: Double
    var color: Color = Theme.accent
    var lineWidth: CGFloat = 10

    var body: some View {
        ZStack {
            Circle().stroke(color.opacity(0.16), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0.001, min(progress, 1)))
                .stroke(
                    AngularGradient(colors: [color.opacity(0.75), progress > 1.1 ? Theme.accentStrong : color], center: .center,
                                    startAngle: .degrees(0), endAngle: .degrees(360 * max(0.001, min(progress, 1)))),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .widgetAccentable()
        }
    }
}

struct Bar: View {
    var progress: Double
    var color: Color = Theme.accent
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(color.opacity(0.16))
                Capsule().fill(color)
                    .frame(width: max(height, geo.size.width * min(max(progress, 0), 1)))
                    .opacity(progress <= 0 ? 0 : 1)
                    .widgetAccentable()
            }
        }
        .frame(height: height)
    }
}

/// Otsikkorivi: punainen ikoni + isoin kirjaimin kirjoitettu nimi
struct WidgetHeader: View {
    var icon: String
    var title: String
    var trailing: String? = nil

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Theme.accent)
                .widgetAccentable()
            Text(title.uppercased())
                .font(.label(12))
                .tracking(0.8)
                .foregroundStyle(Theme.muted)
            Spacer(minLength: 0)
            if let trailing {
                Text(trailing).font(.label(12)).foregroundStyle(Theme.muted)
            }
        }
        .lineLimit(1)
    }
}

struct MacroRow: View {
    var label: String
    var value: Double
    var goal: Double
    var unit: String = "g"
    var color: Color = Theme.accent

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(label).font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.muted)
                Spacer(minLength: 4)
                Text(Fmt.int(value)).font(.label(14)).foregroundStyle(Theme.text)
                if goal > 0 { Text("/\(Fmt.int(goal)) \(unit)").font(.system(size: 10.5, weight: .medium)).foregroundStyle(Theme.faint) }
            }
            Bar(progress: goal > 0 ? value / goal : 0, color: color, height: 5)
        }
    }
}

struct NextReminderView: View {
    var next: WidgetSnapshot.Upcoming?
    var compact = false

    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Theme.accent.opacity(0.14))
                Image(systemName: "bell.fill").font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.accent).widgetAccentable()
            }
            .frame(width: 26, height: 26)
            if let next {
                VStack(alignment: .leading, spacing: 0) {
                    Text(dayPrefix(next.atDate) + DateUtil.clock(next.atDate))
                        .font(.label(compact ? 12 : 13)).foregroundStyle(Theme.accentStrong)
                    Text(next.title).font(.system(size: compact ? 11.5 : 12.5, weight: .semibold)).foregroundStyle(Theme.text).lineLimit(1)
                }
            } else {
                Text("Ei tulevia muistutuksia").font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
        }
    }

    private func dayPrefix(_ d: Date) -> String {
        if Calendar.current.isDateInToday(d) { return "" }
        if Calendar.current.isDateInTomorrow(d) { return "Huomenna " }
        let f = DateFormatter(); f.locale = Locale(identifier: "fi_FI"); f.dateFormat = "EEEE "
        return f.string(from: d).capitalized
    }
}

/// Tehtävärivi, jonka ympyrää napauttamalla tehtävä kuitataan tehdyksi (iOS 17).
struct TaskRow: View {
    var task: WidgetSnapshot.TaskItem
    var date: String
    var size: CGFloat = 13

    var body: some View {
        HStack(spacing: 8) {
            Button(intent: CompleteTaskIntent(rid: task.id, date: date)) {
                ZStack {
                    Circle().strokeBorder(task.done ? Theme.accent : Theme.faint, lineWidth: 1.6)
                    if task.done {
                        Circle().fill(Theme.accent)
                        Image(systemName: "checkmark").font(.system(size: size * 0.62, weight: .heavy)).foregroundStyle(.white)
                    }
                }
                .frame(width: size + 7, height: size + 7)
                .widgetAccentable()
            }
            .buttonStyle(.plain)
            .disabled(task.done)

            Link(destination: URL(string: "gymtrack://task/\(task.id)")!) {
                HStack(spacing: 6) {
                    Text(DateUtil.clock(task.time))
                        .font(.label(size))
                        .foregroundStyle(task.done ? Theme.faint : Theme.accentStrong)
                        .frame(width: size * 3.0, alignment: .leading)
                    Text(task.title)
                        .font(.system(size: size, weight: .semibold))
                        .foregroundStyle(task.done ? Theme.faint : Theme.text)
                        .strikethrough(task.done, color: Theme.faint)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
            }
        }
    }
}

struct EmptyStateView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            WidgetHeader(icon: "dumbbell.fill", title: "GymTrack")
            Spacer(minLength: 0)
            Text("Avaa GymTrack kerran, niin widget näyttää päivän tiedot.")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.text)
            Spacer(minLength: 0)
        }
    }
}

extension View {
    /// Musta-punainen tausta kotinäytöllä; lukitusnäytöllä järjestelmän oma tausta.
    @ViewBuilder func gtBackground(_ family: WidgetFamily) -> some View {
        switch family {
        case .accessoryCircular, .accessoryRectangular, .accessoryInline:
            self.containerBackground(for: .widget) { Color.clear }
        default:
            self.containerBackground(for: .widget) { Theme.widgetBackground }
        }
    }
}
