import ActivityKit
import SwiftUI
import WidgetKit

/// Käynnissä oleva treeni lukitusnäytöllä, ilmoituskeskuksessa ja Dynamic Islandissa:
/// treenin kesto, tehdyt sarjat, nykyinen liike ja lepoajastin.
struct WorkoutLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutAttributes.self) { context in
            LiveLockView(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(Theme.bg.opacity(0.92))
                .activitySystemActionForegroundColor(Theme.accent)
                .widgetURL(URL(string: "gymtrack://session"))
        } dynamicIsland: { context in
            let s = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 1) {
                        Label(context.attributes.name, systemImage: "dumbbell.fill")
                            .font(.label(16)).foregroundStyle(Theme.accent).lineLimit(1)
                        Text(context.attributes.startedAt, style: .timer)
                            .font(.system(size: 13, weight: .semibold).monospacedDigit()).foregroundStyle(.secondary)
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 1) {
                        Text("\(s.setsDone)/\(s.setsTotal)").font(.display(22))
                        Text("sarjaa").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
                    }
                    .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let range = LiveLockView.restRange(s) {
                        HStack(spacing: 10) {
                            Text("Lepo").font(.label(14)).foregroundStyle(.secondary)
                            ProgressView(timerInterval: range, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                                .tint(Theme.accent)
                            Text(timerInterval: range, countsDown: true)
                                .font(.display(20).monospacedDigit()).frame(width: 56, alignment: .trailing)
                        }
                        .padding(.horizontal, 4)
                    } else {
                        VStack(alignment: .leading, spacing: 5) {
                            if let ex = s.exercise { Text(ex).font(.system(size: 14, weight: .semibold)).lineLimit(1) }
                            ProgressView(value: s.progress).tint(Theme.accent)
                        }
                        .padding(.horizontal, 4)
                    }
                }
            } compactLeading: {
                Image(systemName: "dumbbell.fill").foregroundStyle(Theme.accent)
            } compactTrailing: {
                if let range = LiveLockView.restRange(s) {
                    Text(timerInterval: range, countsDown: true)
                        .font(.system(size: 14, weight: .bold).monospacedDigit())
                        .foregroundStyle(Theme.accentStrong)
                        .frame(maxWidth: 46)
                } else {
                    Text("\(s.setsDone)/\(s.setsTotal)").font(.system(size: 14, weight: .bold).monospacedDigit())
                }
            } minimal: {
                if let range = LiveLockView.restRange(s) {
                    ProgressView(timerInterval: range, countsDown: true) { EmptyView() } currentValueLabel: {
                        Image(systemName: "timer").foregroundStyle(Theme.accent)
                    }
                    .progressViewStyle(.circular).tint(Theme.accent)
                } else {
                    Image(systemName: "dumbbell.fill").foregroundStyle(Theme.accent)
                }
            }
            .widgetURL(URL(string: "gymtrack://session"))
            .keylineTint(Theme.accent)
        }
    }
}

struct LiveLockView: View {
    var attributes: WorkoutAttributes
    var state: WorkoutAttributes.ContentState

    /// Lepoajan aikaväli, jos lepo on käynnissä
    static func restRange(_ s: WorkoutAttributes.ContentState) -> ClosedRange<Date>? {
        guard let start = s.restStartedAt, let end = s.restEndsAt, start < end, end > Date() else { return nil }
        return start...end
    }

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            ZStack {
                Ring(progress: state.progress, lineWidth: 6)
                Image(systemName: "dumbbell.fill").font(.system(size: 17, weight: .bold)).foregroundStyle(Theme.accent)
            }
            .frame(width: 52, height: 52)

            VStack(alignment: .leading, spacing: 2) {
                Text(attributes.name).font(.display(22)).foregroundStyle(Theme.text).lineLimit(1)
                HStack(spacing: 6) {
                    Text(attributes.startedAt, style: .timer).monospacedDigit()
                    Text("·")
                    Text("\(state.setsDone)/\(state.setsTotal) sarjaa")
                }
                .font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.muted)
                if let ex = state.exercise {
                    Text(ex).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.text.opacity(0.85)).lineLimit(1)
                }
            }
            Spacer(minLength: 0)

            if let range = Self.restRange(state) {
                VStack(alignment: .trailing, spacing: 2) {
                    Text("LEPO").font(.label(12)).tracking(0.8).foregroundStyle(Theme.accentStrong)
                    Text(timerInterval: range, countsDown: true)
                        .font(.display(32).monospacedDigit()).foregroundStyle(Theme.text)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 84, alignment: .trailing)
                    ProgressView(timerInterval: range, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                        .tint(Theme.accent).frame(width: 84)
                }
            }
        }
        .padding(16)
    }
}
