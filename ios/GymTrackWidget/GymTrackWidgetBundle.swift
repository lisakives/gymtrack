import SwiftUI
import WidgetKit

@main
struct GymTrackWidgetBundle: WidgetBundle {
    var body: some Widget {
        DashboardWidget()
        NutritionWidget()
        TasksWidget()
        TrainingWidget()
        WeightWidget()
        QuickActionsWidget()
        WorkoutLiveActivity()
    }
}
