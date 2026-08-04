import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring
} from "react-native-reanimated";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  Gamepad2,
  Info,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
  X
} from "lucide-react-native";

import { formatDays } from "../../constants/schedule";
import { ScreenLayout, useScreenBackgrounds } from "../../components/layout";
import { Button, Card, EmptyState, FormDialog, IconButton, ScreenHeader, StatusBanner, TextField } from "../../components/ui";
import { useAnthraTheme } from "../../design-system";
import { getDeviceTimeZone } from "../../utils/timezone";
import {
  archiveTracker,
  archiveTrackerTask,
  getCurrentTrackerTasks,
  getTrackerDayTasks,
  getTrackerPeriodSummary,
  getTrackerTaskPerformance,
  getTrackers,
  initTrackerDatabase,
  saveTracker,
  saveTrackerTask,
  setTrackerTaskDone,
  trackerTodayKey
} from "./trackerRepository";
import { syncTrackerNotifications } from "./trackerNotifications";
import {
  mondayStart,
  monthBounds,
  shiftTrackerDate,
  shiftTrackerMonth,
  trackerHistoryCutoff
} from "./trackerStats";
import type {
  Tracker,
  TrackerDayTask,
  TrackerPeriodSummary,
  TrackerTask,
  TrackerTaskInput,
  TrackerTaskPerformance
} from "./trackerTypes";
import { validateTrackerName } from "./trackerValidation";
import { TrackerTaskEditorModal } from "./TrackerTaskEditorModal";
import { TrackerTabBar, type TrackerTab } from "./TrackerTabBar";

type Props = { onBack: () => void };

const EMPTY_SUMMARY: TrackerPeriodSummary = {
  startDate: "",
  endDate: "",
  due: 0,
  done: 0,
  percentage: 0,
  perfectDays: 0,
  activeDays: 0,
  streak: 0,
  days: []
};

function formatShortDate(dateKey: string): string {
  if (!dateKey) return "";
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMonth(dateKey: string): string {
  const [year, month] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatTime(hour: number, minute: number): string {
  return new Date(2020, 0, 1, hour, minute).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function taskScheduleLabel(task: TrackerTask): string {
  if (task.recurrence === "daily") return "Every day";
  if (task.recurrence === "once") return task.onceDate ? `Once · ${formatShortDate(task.onceDate)}` : "One time";
  return formatDays(task.days);
}

function ProgressRing({ percentage, done, due, size = 152 }: { percentage: number; done: number; due: number; size?: number }) {
  const theme = useAnthraTheme();
  const stroke = size <= 120 ? 9 : 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: due, now: done }} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.colors.progressTrack} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.brand}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - Math.min(100, percentage) / 100)}
          fill="none"
        />
      </Svg>
      <Text style={[size <= 120 ? theme.typography.titleLarge : theme.typography.display, { color: percentage === 100 && due > 0 ? theme.colors.brand : theme.colors.textPrimary }]}>{percentage}%</Text>
      <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: 1 }]}>{done}/{due}</Text>
    </View>
  );
}

function TaskRow({ task, onToggle }: { task: TrackerDayTask; onToggle: () => void }) {
  const theme = useAnthraTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  useEffect(() => {
    if (task.done && !reduceMotion) scale.value = withSequence(withSpring(1.035), withSpring(1));
  }, [reduceMotion, scale, task.done]);
  return (
    <Animated.View
      style={[
        {
          width: "100%",
          alignSelf: "stretch",
          borderRadius: theme.radii.xl,
          borderWidth: 1,
          borderColor: task.done ? theme.colors.success : theme.colors.borderStrong,
          backgroundColor: task.done ? theme.colors.successSoft : theme.colors.surfaceElevated,
          shadowColor: theme.isDark ? "#000000" : "#4B2028",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: task.done ? 0.04 : 0.12,
          shadowRadius: 12,
          elevation: task.done ? 1 : 4
        },
        style
      ]}
    >
      <Pressable
        onPress={onToggle}
        android_ripple={{ color: theme.colors.surfacePressed }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.done }}
        accessibilityLabel={`${task.title}, ${task.done ? "done" : "not done"}`}
        style={{
          minHeight: 84,
          width: "100%",
          alignSelf: "stretch",
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.lg,
          paddingVertical: theme.spacing.lg,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radii.xl,
          backgroundColor: "transparent"
        }}
      >
        <View style={{
          width: 32,
          height: 32,
          flexGrow: 0,
          flexShrink: 0,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: task.done ? 0 : 2,
          borderColor: theme.colors.borderStrong,
          backgroundColor: task.done ? theme.colors.success : "transparent"
        }}>
          {task.done && <Check accessible={false} color={theme.isDark ? theme.colors.canvas : "#FFFFFF"} size={21} strokeWidth={3} />}
        </View>
        <View style={{ flex: 1, minWidth: 0, alignSelf: "stretch", justifyContent: "center" }}>
          <Text numberOfLines={2} style={[theme.typography.titleSmall, { width: "100%", color: theme.colors.textPrimary, textAlign: "left", textDecorationLine: task.done ? "line-through" : "none" }]}>{task.title}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
            <View style={{ paddingHorizontal: theme.spacing.sm, paddingVertical: 3, borderRadius: theme.radii.full, backgroundColor: theme.colors.surfaceSubtle }}>
              <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{taskScheduleLabel(task)}</Text>
            </View>
            {task.notificationEnabled && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: theme.spacing.sm, paddingVertical: 3, borderRadius: theme.radii.full, backgroundColor: theme.colors.brandSoft }}>
                <Bell accessible={false} color={theme.colors.brand} size={13} />
                <Text style={[theme.typography.caption, { color: theme.colors.brand }]}>{formatTime(task.notificationHour, task.notificationMinute)}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function SummaryCard({ label, summary, icon: Icon }: { label: string; summary: TrackerPeriodSummary; icon: typeof CalendarDays }) {
  const theme = useAnthraTheme();
  return (
    <Card variant="elevated" padding="large" style={{ flex: 1, minWidth: 150 }}>
      <View style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: theme.radii.md, backgroundColor: theme.colors.brandSoft }}>
        <Icon accessible={false} color={theme.colors.brand} size={19} />
      </View>
      <View style={{ marginTop: theme.spacing.lg }}>
        <Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>{label.toUpperCase()}</Text>
      </View>
      <Text style={[theme.typography.display, { color: theme.colors.textPrimary, marginTop: theme.spacing.xs }]}>{summary.percentage}%</Text>
      <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>{summary.done}/{summary.due} tasks · {summary.perfectDays} perfect {summary.perfectDays === 1 ? "day" : "days"}</Text>
    </Card>
  );
}

type PerformanceRange = "week" | "month";

function TaskActivityCard({
  range,
  onRangeChange,
  subtitle,
  items,
  selectedDay,
  onSelectDay
}: {
  range: PerformanceRange;
  onRangeChange: (range: PerformanceRange) => void;
  subtitle: string;
  items: TrackerTaskPerformance[];
  selectedDay: string;
  onSelectDay: (dateKey: string) => void;
}) {
  const theme = useAnthraTheme();
  const cellSize = 22;
  const columnWidth = 30;
  const labelWidth = 84;
  const headerHeight = 42;
  const rowHeight = 62;
  const dates = items[0]?.days.map((day) => day.dateKey) ?? [];
  const dateRangeKey = dates.join(",");
  const activityScrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    const selectedIndex = dates.indexOf(selectedDay);
    activityScrollRef.current?.scrollTo({
      x: range === "month" && selectedIndex >= 0 ? Math.max(0, selectedIndex * columnWidth - columnWidth * 5) : 0,
      animated: false
    });
  }, [dateRangeKey, range, selectedDay]);
  const statusVisual = (status: TrackerTaskPerformance["days"][number]["status"]) => {
    if (status === "done") return { background: theme.colors.brand, border: theme.colors.brand, text: theme.colors.textOnBrandSolid };
    if (status === "missed") return { background: theme.colors.dangerSoft, border: theme.colors.danger, text: theme.colors.danger };
    if (status === "pending") return { background: theme.colors.warningSoft, border: theme.colors.warning, text: theme.colors.warning };
    return { background: theme.colors.surfaceSubtle, border: theme.colors.border, text: theme.colors.textTertiary };
  };
  return (
    <Card padding="large">
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: theme.spacing.md }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary }]}>Task activity</Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: 2 }]}>{subtitle}</Text>
        </View>
        <View style={{ flexDirection: "row", padding: 3, gap: 3, borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceSubtle }}>
          {(["week", "month"] as const).map((option) => {
            const active = range === option;
            return (
              <Pressable
                key={option}
                onPress={() => onRangeChange(option)}
                accessibilityRole="button"
                accessibilityLabel={`Show ${option} task activity`}
                accessibilityState={{ selected: active }}
                style={{
                  minHeight: 34,
                  justifyContent: "center",
                  paddingHorizontal: theme.spacing.md,
                  borderRadius: theme.radii.sm,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.brandBorder : "transparent",
                  backgroundColor: active ? theme.colors.brandSoft : "transparent"
                }}
              >
                <Text style={[theme.typography.label, { color: active ? theme.colors.brand : theme.colors.textSecondary, textTransform: "capitalize" }]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {items.length === 0 ? (
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.lg }]}>No scheduled tasks in this period.</Text>
      ) : (
        <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.xl }}>
          <View style={{ width: labelWidth, flexShrink: 0 }}>
            <View style={{ height: headerHeight, justifyContent: "flex-end", paddingBottom: theme.spacing.xs }}>
              <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>TASK</Text>
            </View>
            {items.map((item, index) => (
              <View
                key={item.taskId}
                style={{
                  height: rowHeight,
                  justifyContent: "center",
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.colors.divider,
                  paddingRight: theme.spacing.xs
                }}
              >
                <Text numberOfLines={2} style={[theme.typography.label, { color: theme.colors.textPrimary, textAlign: "left" }]}>{item.title}</Text>
                <Text style={[theme.typography.caption, { color: theme.colors.brand, marginTop: 2 }]}>{item.percentage}% · {item.done}/{item.due}</Text>
              </View>
            ))}
          </View>

          <ScrollView
            ref={activityScrollRef}
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={range === "month"}
            style={{ flex: 1 }}
            contentContainerStyle={{ width: Math.max(columnWidth * dates.length, 1) }}
          >
            <View style={{ width: Math.max(columnWidth * dates.length, 1) }}>
              <View style={{ height: headerHeight, flexDirection: "row", alignItems: "flex-end", paddingBottom: theme.spacing.xs }}>
                {dates.map((dateKey) => {
                  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
                  return (
                    <View key={dateKey} style={{ width: columnWidth, alignItems: "center" }}>
                      <Text style={[theme.typography.caption, { color: theme.colors.textTertiary, fontSize: 10, lineHeight: 12 }]}>{["S", "M", "T", "W", "T", "F", "S"][weekday]}</Text>
                      <Text style={[theme.typography.caption, { color: dateKey === selectedDay ? theme.colors.brand : theme.colors.textSecondary, fontSize: 10, lineHeight: 13 }]}>{Number(dateKey.slice(-2))}</Text>
                    </View>
                  );
                })}
              </View>
              {items.map((item, itemIndex) => (
                <View
                  key={item.taskId}
                  style={{
                    height: rowHeight,
                    flexDirection: "row",
                    alignItems: "center",
                    borderTopWidth: itemIndex === 0 ? 0 : 1,
                    borderTopColor: theme.colors.divider
                  }}
                >
                  {item.days.map((day) => {
                    const visual = statusVisual(day.status);
                    const selected = day.dateKey === selectedDay;
                    return (
                      <View key={day.dateKey} style={{ width: columnWidth, alignItems: "center" }}>
                        <Pressable
                          onPress={() => onSelectDay(day.dateKey)}
                          accessibilityRole="button"
                          accessibilityLabel={`${item.title}, ${formatShortDate(day.dateKey)}, ${day.status === "notScheduled" ? "not scheduled" : day.status}`}
                          accessibilityState={{ selected }}
                          style={{
                            width: cellSize,
                            height: cellSize,
                            borderRadius: 6,
                            borderWidth: selected ? 2 : 1,
                            borderColor: selected ? theme.colors.textPrimary : visual.border,
                            backgroundColor: visual.background
                          }}
                        />
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md, marginTop: theme.spacing.xl, paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.divider }}>
        {([
          ["Done", "done"],
          ["Missed", "missed"],
          ["Pending", "pending"],
          ["Not scheduled", "notScheduled"]
        ] as const).map(([label, status]) => {
          const visual = statusVisual(status);
          return (
            <View key={status} style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.xs }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, borderWidth: 1, borderColor: visual.border, backgroundColor: visual.background }} />
              <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{label}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export function TrackerBuddyScreen({ onBack }: Props) {
  const theme = useAnthraTheme();
  const backgrounds = useScreenBackgrounds();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const timezone = useMemo(() => getDeviceTimeZone(), []);
  const today = trackerTodayKey(timezone);
  const historyCutoff = trackerHistoryCutoff(today);
  const initialReportDay = shiftTrackerDate(today, -1) < historyCutoff ? historyCutoff : shiftTrackerDate(today, -1);
  const reduceMotion = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dayTasks, setDayTasks] = useState<TrackerDayTask[]>([]);
  const [currentTasks, setCurrentTasks] = useState<TrackerTask[]>([]);
  const [weekly, setWeekly] = useState<TrackerPeriodSummary>(EMPTY_SUMMARY);
  const [monthly, setMonthly] = useState<TrackerPeriodSummary>(EMPTY_SUMMARY);
  const [weeklyPerformance, setWeeklyPerformance] = useState<TrackerTaskPerformance[]>([]);
  const [monthlyPerformance, setMonthlyPerformance] = useState<TrackerTaskPerformance[]>([]);
  const [selectedReportDay, setSelectedReportDay] = useState(initialReportDay);
  const [reportDayTasks, setReportDayTasks] = useState<TrackerDayTask[]>([]);
  const [reportMonthStart, setReportMonthStart] = useState(monthBounds(initialReportDay).start);
  const [streak, setStreak] = useState(0);
  const [view, setView] = useState<TrackerTab>("today");
  const [reportInfoExpanded, setReportInfoExpanded] = useState(false);
  const [performanceRange, setPerformanceRange] = useState<PerformanceRange>("week");
  const [trackerModalOpen, setTrackerModalOpen] = useState(false);
  const [trackerName, setTrackerName] = useState("");
  const [editingTracker, setEditingTracker] = useState<Tracker | null>(null);
  const [trackerError, setTrackerError] = useState("");
  const [taskEditorOpen, setTaskEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TrackerTask | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedTracker = trackers.find((tracker) => tracker.id === selectedId) ?? null;
  const doneCount = dayTasks.filter((task) => task.done).length;
  const percentage = dayTasks.length > 0 ? Math.round((doneCount / dayTasks.length) * 100) : 0;
  const screenContentWidth = Math.max(
    0,
    Math.min(windowWidth, theme.layout.contentMaxWidth) - theme.layout.screenPadding * 2
  );
  const trackerNameMaxWidth = Math.max(80, Math.min(240, screenContentWidth - 76));

  const refresh = useCallback(async (preferredId?: number | null) => {
    const nextTrackers = await getTrackers();
    setTrackers(nextTrackers);
    const candidate = preferredId ?? selectedId;
    const nextId = nextTrackers.some((tracker) => tracker.id === candidate) ? candidate! : nextTrackers[0]?.id ?? null;
    setSelectedId(nextId);
    if (nextId == null) {
      setDayTasks([]);
      setCurrentTasks([]);
      setWeekly(EMPTY_SUMMARY);
      setMonthly(EMPTY_SUMMARY);
      setWeeklyPerformance([]);
      setMonthlyPerformance([]);
      setReportDayTasks([]);
      setStreak(0);
      return;
    }
    const selectedWeekStart = mondayStart(selectedReportDay);
    const selectedWeekEndCandidate = shiftTrackerDate(selectedWeekStart, 6);
    const selectedWeekEnd = selectedWeekEndCandidate > today ? today : selectedWeekEndCandidate;
    const tracker = nextTrackers.find((item) => item.id === nextId)!;
    const month = monthBounds(reportMonthStart);
    const monthStart = [month.start, historyCutoff, tracker.createdDate].sort().at(-1)!;
    const monthEnd = month.end > today ? today : month.end;
    const performanceWeekStart = [selectedWeekStart, historyCutoff, tracker.createdDate].sort().at(-1)!;
    const streakStart = tracker.createdDate > historyCutoff ? tracker.createdDate : historyCutoff;
    const reportDayAvailable = selectedReportDay >= historyCutoff && selectedReportDay <= today && selectedReportDay >= tracker.createdDate;
    const [nextDayTasks, nextCurrentTasks, nextWeekly, nextMonthly, streakSummary, nextWeeklyPerformance, nextMonthlyPerformance, nextReportDayTasks] = await Promise.all([
      getTrackerDayTasks(nextId, today),
      getCurrentTrackerTasks(nextId),
      getTrackerPeriodSummary(nextId, performanceWeekStart, selectedWeekEnd, selectedWeekEnd),
      monthStart <= monthEnd ? getTrackerPeriodSummary(nextId, monthStart, monthEnd, monthEnd) : Promise.resolve(EMPTY_SUMMARY),
      getTrackerPeriodSummary(nextId, streakStart, today, today),
      performanceWeekStart <= selectedWeekEnd ? getTrackerTaskPerformance(nextId, performanceWeekStart, selectedWeekEnd, selectedWeekEnd === today ? today : undefined) : Promise.resolve([]),
      monthStart <= monthEnd ? getTrackerTaskPerformance(nextId, monthStart, monthEnd, monthEnd === today ? today : undefined) : Promise.resolve([]),
      reportDayAvailable ? getTrackerDayTasks(nextId, selectedReportDay) : Promise.resolve([])
    ]);
    setDayTasks(nextDayTasks);
    setCurrentTasks(nextCurrentTasks);
    setWeekly(nextWeekly);
    setMonthly(nextMonthly);
    setWeeklyPerformance(nextWeeklyPerformance);
    setMonthlyPerformance(nextMonthlyPerformance);
    setReportDayTasks(nextReportDayTasks);
    setStreak(streakSummary.streak);
  }, [historyCutoff, reportMonthStart, selectedId, selectedReportDay, today]);

  useEffect(() => {
    let cancelled = false;
    initTrackerDatabase()
      .then(() => refresh())
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((error) => {
        if (!cancelled) {
          setNotice(error instanceof Error ? error.message : "Tracker Buddy could not start.");
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 5_000);
    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!ready || selectedId == null) return;
    refresh(selectedId).catch((error) => {
      setNotice(error instanceof Error ? error.message : "Could not load tracker history.");
    });
  }, [reportMonthStart, selectedReportDay]);

  const showCelebration = (message: string) => {
    setCelebration(message);
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    celebrationTimer.current = setTimeout(() => setCelebration(null), 2400);
  };

  const toggleTask = async (task: TrackerDayTask) => {
    const nextDone = !task.done;
    const nextDoneCount = doneCount + (nextDone ? 1 : -1);
    setDayTasks((items) => items.map((item) => item.id === task.id ? { ...item, done: nextDone } : item));
    if (nextDone) {
      const complete = dayTasks.length > 0 && nextDoneCount === dayTasks.length;
      await Haptics.notificationAsync(complete ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (complete) showCelebration("Perfect day — every task is complete!");
      else if (nextDoneCount === Math.ceil(dayTasks.length / 2)) showCelebration("Halfway there. Keep the momentum!");
    } else {
      await Haptics.selectionAsync().catch(() => undefined);
    }
    try {
      await setTrackerTaskDone(task, nextDone);
      await refresh(selectedId);
      syncTrackerNotifications().catch(() => undefined);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update this task.");
      await refresh(selectedId);
    }
  };

  const openNewTracker = () => {
    setEditingTracker(null);
    setTrackerName("");
    setTrackerError("");
    setTrackerModalOpen(true);
  };

  const openEditTracker = () => {
    if (!selectedTracker) return;
    setEditingTracker(selectedTracker);
    setTrackerName(selectedTracker.name);
    setTrackerError("");
    setTrackerModalOpen(true);
  };

  const submitTracker = async () => {
    const error = validateTrackerName(trackerName);
    if (error) {
      setTrackerError(error);
      return;
    }
    setSaving(true);
    try {
      const saved = await saveTracker(trackerName, editingTracker?.id);
      setTrackerModalOpen(false);
      setNotice(editingTracker ? "Tracker name updated." : "Tracker created. Add the first task when you’re ready.");
      await refresh(saved.id);
      if (!editingTracker) setView("manage");
    } catch (saveError) {
      setTrackerError(saveError instanceof Error ? saveError.message : "Could not save this tracker.");
    } finally {
      setSaving(false);
    }
  };

  const doubleConfirm = (title: string, message: string, action: () => void) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Continue",
        style: "destructive",
        onPress: () => Alert.alert(
          "Are you absolutely sure?",
          "Past dates stay preserved. Because this change begins today, totals for the current Monday–Sunday week and calendar month may change.",
          [
            { text: "Keep it", style: "cancel" },
            { text: "Yes, make change", style: "destructive", onPress: action }
          ]
        )
      }
    ]);
  };

  const submitTask = (input: TrackerTaskInput) => {
    const persist = async () => {
      setSaving(true);
      try {
        await saveTrackerTask(input, today);
        setTaskEditorOpen(false);
        setEditingTask(null);
        setNotice(input.id ? "Task updated from today. Earlier history is preserved." : "Task added to your tracker.");
        await refresh(selectedId);
        const sync = await syncTrackerNotifications();
        if (input.notificationEnabled && sync.scheduledCount === 0) setNotice(sync.message);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not save this task.");
      } finally {
        setSaving(false);
      }
    };
    if (input.id) {
      doubleConfirm(
        "Update this task?",
        "Its new name, schedule, or notification settings begin today. This can affect the current weekly and monthly percentages.",
        () => persist().catch(() => undefined)
      );
    } else {
      persist().catch(() => undefined);
    }
  };

  const deleteTask = (task: TrackerTask) => {
    doubleConfirm(
      "Remove this task?",
      `“${task.title}” will stop appearing today. Its earlier results remain in reports.`,
      () => {
        archiveTrackerTask(task.id, today)
          .then(() => refresh(selectedId))
          .then(() => syncTrackerNotifications())
          .then(() => setNotice("Task removed. Past results are still preserved."))
          .catch((error) => setNotice(error instanceof Error ? error.message : "Could not remove the task."));
      }
    );
  };

  const deleteSelectedTracker = () => {
    if (!selectedTracker) return;
    doubleConfirm(
      "Remove this tracker?",
      `“${selectedTracker.name}” and its tasks will leave your active trackers today. Historical records remain stored.`,
      () => {
        archiveTracker(selectedTracker.id, today)
          .then(() => refresh(null))
          .then(() => syncTrackerNotifications())
          .then(() => setNotice("Tracker removed. Its historical records remain preserved."))
          .catch((error) => setNotice(error instanceof Error ? error.message : "Could not remove the tracker."));
      }
    );
  };

  const refreshManually = async () => {
    setRefreshing(true);
    await refresh(selectedId).catch(() => undefined);
    setRefreshing(false);
  };

  const currentMonthStart = monthBounds(today).start;
  const earliestHistoryDate = selectedTracker?.createdDate && selectedTracker.createdDate > historyCutoff
    ? selectedTracker.createdDate
    : historyCutoff;
  const earliestHistoryMonth = monthBounds(earliestHistoryDate).start;
  const canVisitPreviousMonth = reportMonthStart > earliestHistoryMonth;
  const canVisitNextMonth = reportMonthStart < currentMonthStart;

  const changeReportMonth = (amount: -1 | 1) => {
    const nextMonth = shiftTrackerMonth(reportMonthStart, amount);
    if (nextMonth < earliestHistoryMonth || nextMonth > currentMonthStart) return;
    const nextBounds = monthBounds(nextMonth);
    const firstAvailable = nextBounds.start < earliestHistoryDate ? earliestHistoryDate : nextBounds.start;
    const lastAvailable = nextBounds.end > today ? today : nextBounds.end;
    setReportMonthStart(nextMonth);
    setSelectedReportDay(lastAvailable >= firstAvailable ? lastAvailable : firstAvailable);
  };

  return (
    <ScreenLayout {...backgrounds.canvas} safeAreaEdges={["top", "left", "right"]}>
      <View
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingHorizontal: theme.layout.screenPadding }}
      >
        <ScreenHeader
          eyebrow="ORGANIZE"
          title="Tracker Buddy"
          subtitle="Small wins, repeated your way"
          onBack={onBack}
          backLabel="Back to Today"
          action={<IconButton icon={Plus} accessibilityLabel="Create tracker" onPress={openNewTracker} variant="primary" />}
          style={{ maxWidth: theme.layout.contentMaxWidth, alignSelf: "center" }}
        />
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshManually} tintColor={theme.colors.brand} />}
        contentContainerStyle={{
          width: "100%",
          maxWidth: theme.layout.contentMaxWidth,
          alignSelf: "center",
          padding: theme.layout.screenPadding,
          paddingBottom: theme.spacing["2xl"]
        }}
      >
        {notice && <StatusBanner title="Tracker Buddy" message={notice} variant={notice.toLowerCase().includes("could not") ? "danger" : "info"} style={{ marginBottom: theme.spacing.md }} />}

        {!ready ? (
          <Card variant="subtle" padding="large"><Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Preparing your trackers…</Text></Card>
        ) : trackers.length === 0 ? (
          <EmptyState
            icon={Gamepad2}
            title="Build your first tracker"
            description="Morning routine, hydration, study goals, or anything else—each tracker can follow its own rhythm."
            action={{ label: "Create tracker", icon: Plus, onPress: openNewTracker }}
            variant="brand"
            style={{ marginTop: theme.spacing.xl }}
          />
        ) : (
          <>
            <View>
              <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginBottom: theme.spacing.md }]}>CURRENT TRACKER</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.sm }}>
                {trackers.map((tracker) => {
                  const selected = tracker.id === selectedId;
                  return (
                    <View
                      key={tracker.id}
                      style={{
                        alignSelf: "flex-start",
                        maxWidth: screenContentWidth,
                        borderRadius: theme.radii.xl,
                        borderWidth: 1,
                        borderColor: selected ? theme.colors.brand : theme.colors.borderStrong,
                        backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surfaceElevated,
                        shadowColor: theme.isDark ? "#000000" : "#5E2130",
                        shadowOffset: { width: 0, height: 3 },
                        shadowOpacity: selected ? 0.12 : 0.07,
                        shadowRadius: 10,
                        elevation: selected ? 3 : 2
                      }}
                    >
                      <Pressable
                        onPress={() => refresh(tracker.id).catch(() => undefined)}
                        android_ripple={{ color: theme.colors.surfacePressed }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected, checked: selected }}
                        style={{
                          alignSelf: "flex-start",
                          minHeight: 60,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: theme.spacing.md,
                          paddingHorizontal: theme.spacing.lg,
                          borderRadius: theme.radii.xl
                        }}
                      >
                        <View style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: theme.radii.full, backgroundColor: selected ? theme.colors.surface : theme.colors.surfaceSubtle }}>
                          <Target accessible={false} color={selected ? theme.colors.brand : theme.colors.textSecondary} size={17} />
                        </View>
                        <Text numberOfLines={1} style={[theme.typography.labelLarge, { maxWidth: trackerNameMaxWidth, flexShrink: 1, color: selected ? theme.colors.brand : theme.colors.textPrimary, textAlign: "left" }]}>{tracker.name}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            {view === "today" && (
              <>
                <Animated.View entering={reduceMotion ? undefined : FadeInDown.springify().damping(19)} style={{ marginTop: theme.spacing.lg }}>
                  <Card variant="brand" padding="large" style={{ shadowColor: theme.isDark ? "#000000" : "#6E1020", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 3 }}>
                    <View style={{ width: "100%", flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[theme.typography.label, { color: theme.colors.brand }]}>TODAY · {formatShortDate(today).toUpperCase()}</Text>
                        <Text style={[theme.typography.titleLarge, { color: theme.colors.textPrimary, marginTop: theme.spacing.md }]}>{doneCount} of {dayTasks.length}</Text>
                        <Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: 2 }]}>tasks complete</Text>
                        <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, marginTop: theme.spacing.lg, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.radii.full, backgroundColor: theme.colors.surface }}>
                          <Flame color={theme.colors.brand} size={16} />
                          <Text style={[theme.typography.label, { color: theme.colors.textPrimary }]}>{streak} day streak</Text>
                        </View>
                      </View>
                      <ProgressRing percentage={percentage} done={doneCount} due={dayTasks.length} size={112} />
                    </View>
                  </Card>
                </Animated.View>

                <View style={{ marginTop: theme.spacing["2xl"] }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
                    <View>
                      <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary }]}>Today’s tasks</Text>
                      <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: 2 }]}>{dayTasks.length} scheduled</Text>
                    </View>
                    <Button label="Add" icon={Plus} size="small" variant="secondary" onPress={() => {
                      setEditingTask(null);
                      setTaskEditorOpen(true);
                    }} />
                  </View>
                  {dayTasks.length === 0 ? (
                    <Card variant="subtle" padding="large" style={{ alignItems: "center" }}>
                      <Sparkles color={theme.colors.brand} size={28} />
                      <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary, marginTop: theme.spacing.md }]}>Nothing scheduled today</Text>
                      <Text style={[theme.typography.body, { color: theme.colors.textSecondary, textAlign: "center", marginTop: theme.spacing.xs }]}>Enjoy the open space, or add a task for today.</Text>
                    </Card>
                  ) : (
                    <View style={{ gap: theme.spacing.md }}>
                      {dayTasks.map((task) => (
                        <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task)} />
                      ))}
                    </View>
                  )}
                </View>
              </>
            )}

            {view === "reports" && (
              <View style={{ marginTop: theme.spacing["2xl"], gap: theme.spacing.lg }}>
                <Card variant="subtle" padding="none" radius="large">
                  <Pressable
                    onPress={() => setReportInfoExpanded((expanded) => !expanded)}
                    android_ripple={{ color: theme.colors.surfacePressed }}
                    accessibilityRole="button"
                    accessibilityLabel="How report cycles work"
                    accessibilityState={{ expanded: reportInfoExpanded }}
                    style={{
                      width: "100%",
                      minHeight: theme.layout.minTouchTarget,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: theme.spacing.md,
                      padding: theme.spacing.lg,
                      borderRadius: theme.radii.lg
                    }}
                  >
                    <View style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: theme.radii.full, backgroundColor: theme.colors.infoSoft }}>
                      <Info accessible={false} color={theme.colors.info} size={18} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[theme.typography.bodyStrong, { color: theme.colors.textPrimary }]}>How report cycles work</Text>
                      {!reportInfoExpanded && (
                        <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: 2 }]}>Weekly and monthly boundaries</Text>
                      )}
                    </View>
                    <ChevronDown
                      accessible={false}
                      color={theme.colors.textSecondary}
                      size={20}
                      style={{ transform: [{ rotate: reportInfoExpanded ? "180deg" : "0deg" }] }}
                    />
                  </Pressable>
                  {reportInfoExpanded && (
                    <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(180)} style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
                      <View style={{ height: 1, backgroundColor: theme.colors.divider, marginBottom: theme.spacing.md }} />
                      <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
                        Weekly results always follow Monday–Sunday. Monthly results use the calendar month and are calculated independently, so a week crossing into another month never changes the month boundary. Daily completion history is retained for a rolling 365 days; older completion records are removed automatically.
                      </Text>
                    </Animated.View>
                  )}
                </Card>

                <TaskActivityCard
                  range={performanceRange}
                  onRangeChange={setPerformanceRange}
                  subtitle={performanceRange === "week"
                    ? `${formatShortDate(mondayStart(selectedReportDay))}–${formatShortDate(shiftTrackerDate(mondayStart(selectedReportDay), 6))}`
                    : formatMonth(reportMonthStart)}
                  items={performanceRange === "week" ? weeklyPerformance : monthlyPerformance}
                  selectedDay={selectedReportDay}
                  onSelectDay={(dateKey) => {
                    setReportMonthStart(monthBounds(dateKey).start);
                    setSelectedReportDay(dateKey);
                  }}
                />

                <Card padding="medium" radius="large">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                    <IconButton
                      icon={ChevronLeft}
                      accessibilityLabel="Previous month"
                      onPress={() => changeReportMonth(-1)}
                      disabled={!canVisitPreviousMonth}
                      size="small"
                      variant="standard"
                    />
                    <View style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
                      <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary, textAlign: "center" }]}>{formatMonth(reportMonthStart)}</Text>
                      <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, textAlign: "center", marginTop: 2 }]}>Rolling 1-year history</Text>
                    </View>
                    <IconButton
                      icon={ChevronRight}
                      accessibilityLabel="Next month"
                      onPress={() => changeReportMonth(1)}
                      disabled={!canVisitNextMonth}
                      size="small"
                      variant="standard"
                    />
                  </View>
                </Card>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md }}>
                  <SummaryCard label={mondayStart(selectedReportDay) === mondayStart(today) ? "This week" : "Selected week"} summary={weekly} icon={CalendarDays} />
                  <SummaryCard label={formatMonth(reportMonthStart)} summary={monthly} icon={Target} />
                </View>

                <Card padding="large">
                  <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary }]}>Monday–Sunday</Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: 2 }]}>{formatShortDate(mondayStart(selectedReportDay))}–{formatShortDate(shiftTrackerDate(mondayStart(selectedReportDay), 6))}</Text>
                  <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
                    {Array.from({ length: 7 }, (_, index) => {
                      const dateKey = shiftTrackerDate(mondayStart(selectedReportDay), index);
                      const day = weekly.days.find((item) => item.dateKey === dateKey);
                      const future = dateKey > today;
                      const perfect = day && day.due > 0 && day.done === day.due;
                      return (
                        <View key={dateKey} style={{ flex: 1, alignItems: "center" }}>
                          <Pressable
                            disabled={future || dateKey < historyCutoff}
                            onPress={() => {
                              setReportMonthStart(monthBounds(dateKey).start);
                              setSelectedReportDay(dateKey);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`View ${formatShortDate(dateKey)} details`}
                            accessibilityState={{ selected: selectedReportDay === dateKey, disabled: future }}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 16,
                              borderWidth: selectedReportDay === dateKey ? 2 : 0,
                              borderColor: theme.colors.brand,
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: future ? theme.colors.surfaceSubtle : perfect ? theme.colors.success : day?.done ? theme.colors.brandSoft : theme.colors.surfacePressed
                            }}
                          >
                            {perfect ? <Check color={theme.isDark ? theme.colors.canvas : "#FFFFFF"} size={16} /> : <Text style={[theme.typography.caption, { color: day?.done ? theme.colors.brand : theme.colors.textTertiary }]}>{day?.done ?? "·"}</Text>}
                          </Pressable>
                          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: 5 }]}>{["M", "T", "W", "T", "F", "S", "S"][index]}</Text>
                        </View>
                      );
                    })}
                  </View>
                </Card>

                <Card padding="large">
                  <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary }]}>{formatMonth(reportMonthStart)} consistency</Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: 2 }]}>Tap any retained day to see exactly what was completed or missed.</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: theme.spacing.lg }}>
                    {monthly.days.map((day) => {
                      const intensity = day.percentage ?? 0;
                      return (
                        <Pressable
                          key={day.dateKey}
                          onPress={() => setSelectedReportDay(day.dateKey)}
                          accessibilityRole="button"
                          accessibilityLabel={`${formatShortDate(day.dateKey)}, ${day.done} of ${day.due} complete`}
                          accessibilityState={{ selected: selectedReportDay === day.dateKey }}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: theme.radii.sm,
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: selectedReportDay === day.dateKey ? 2 : 1,
                            borderColor: selectedReportDay === day.dateKey ? theme.colors.brand : intensity === 100 && day.due > 0 ? theme.colors.success : theme.colors.border,
                            backgroundColor: intensity === 100 && day.due > 0 ? theme.colors.successSoft : intensity > 0 ? theme.colors.brandSoft : theme.colors.surfaceSubtle
                          }}
                        >
                          <Text style={[theme.typography.caption, { color: intensity === 100 && day.due > 0 ? theme.colors.success : intensity > 0 ? theme.colors.brand : theme.colors.textTertiary }]}>{Number(day.dateKey.slice(-2))}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Card>

                <Card variant="elevated" padding="large">
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: theme.spacing.md }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary }]}>Day details</Text>
                      <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: 2 }]}>{formatShortDate(selectedReportDay)} · {reportDayTasks.filter((task) => task.done).length} of {reportDayTasks.length} completed</Text>
                    </View>
                    {selectedReportDay === shiftTrackerDate(today, -1) && (
                      <View style={{ paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.radii.full, backgroundColor: theme.colors.brandSoft }}>
                        <Text style={[theme.typography.caption, { color: theme.colors.brand }]}>YESTERDAY</Text>
                      </View>
                    )}
                  </View>
                  {reportDayTasks.length === 0 ? (
                    <Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.lg }]}>No tasks were scheduled for this day.</Text>
                  ) : (
                    <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
                      {reportDayTasks.map((task) => {
                        const pending = selectedReportDay === today && !task.done;
                        const statusColor = task.done ? theme.colors.success : pending ? theme.colors.warning : theme.colors.danger;
                        return (
                          <View key={task.id} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: theme.spacing.md, padding: theme.spacing.md, borderRadius: theme.radii.lg, backgroundColor: task.done ? theme.colors.successSoft : pending ? theme.colors.warningSoft : theme.colors.dangerSoft }}>
                            <View style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: theme.radii.full, backgroundColor: theme.colors.surface }}>
                              {task.done ? <Check accessible={false} color={statusColor} size={18} strokeWidth={2.5} /> : pending ? <Clock3 accessible={false} color={statusColor} size={17} strokeWidth={2.4} /> : <X accessible={false} color={statusColor} size={18} strokeWidth={2.5} />}
                            </View>
                            <Text numberOfLines={2} style={[theme.typography.bodyStrong, { flex: 1, color: theme.colors.textPrimary, textAlign: "left" }]}>{task.title}</Text>
                            <Text style={[theme.typography.label, { color: statusColor }]}>{task.done ? "Done" : pending ? "Pending" : "Missed"}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </Card>

              </View>
            )}

            {view === "manage" && (
              <View style={{ marginTop: theme.spacing["2xl"], gap: theme.spacing["2xl"] }}>
                <Card variant="elevated" padding="large">
                  <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginBottom: theme.spacing.md }]}>TRACKER SETTINGS</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary }]}>{selectedTracker?.name}</Text>
                      <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: 3 }]}>{currentTasks.length} active {currentTasks.length === 1 ? "task" : "tasks"}</Text>
                    </View>
                    <IconButton icon={Pencil} accessibilityLabel="Rename tracker" onPress={openEditTracker} variant="standard" />
                    <IconButton icon={Trash2} accessibilityLabel="Remove tracker" onPress={deleteSelectedTracker} variant="danger" />
                  </View>
                </Card>

                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
                    <View>
                      <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary }]}>Tasks</Text>
                      <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: 2 }]}>Schedule and notification settings</Text>
                    </View>
                    <Button label="Add" icon={Plus} size="small" variant="secondary" onPress={() => {
                      setEditingTask(null);
                      setTaskEditorOpen(true);
                    }} />
                  </View>
                  {currentTasks.length === 0 ? (
                    <Card variant="subtle" padding="large">
                      <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>No tasks yet. Add one and choose exactly when it should appear.</Text>
                    </Card>
                  ) : (
                    <View style={{ gap: theme.spacing.md }}>
                      {currentTasks.map((task) => (
                        <View
                          key={task.id}
                          style={{
                            width: "100%",
                            borderWidth: 1,
                            borderColor: theme.colors.borderStrong,
                            backgroundColor: theme.colors.surfaceElevated,
                            shadowColor: theme.isDark ? "#000000" : "#4B2028",
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.1,
                            shadowRadius: 12,
                            elevation: 4,
                            borderRadius: theme.radii.xl
                          }}
                        >
                          <Pressable
                            onPress={() => {
                              setEditingTask(task);
                              setTaskEditorOpen(true);
                            }}
                            android_ripple={{ color: theme.colors.surfacePressed }}
                            accessibilityRole="button"
                            accessibilityLabel={`Edit ${task.title}`}
                            style={{
                              width: "100%",
                              minHeight: 84,
                              flexDirection: "row",
                              alignItems: "center",
                              gap: theme.spacing.md,
                              paddingVertical: theme.spacing.lg,
                              paddingHorizontal: theme.spacing.lg,
                              borderRadius: theme.radii.xl
                            }}
                          >
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text numberOfLines={2} style={[theme.typography.titleSmall, { width: "100%", color: theme.colors.textPrimary, textAlign: "left" }]}>{task.title}</Text>
                              <Text style={[theme.typography.caption, { width: "100%", color: theme.colors.textSecondary, marginTop: theme.spacing.sm, textAlign: "left" }]}>
                                {taskScheduleLabel(task)}{task.notificationEnabled ? ` · Alert ${formatTime(task.notificationHour, task.notificationMinute)}` : " · No alert"}
                              </Text>
                            </View>
                            <IconButton icon={Trash2} accessibilityLabel={`Remove ${task.title}`} onPress={(event) => {
                              event.stopPropagation();
                              deleteTask(task);
                            }} variant="ghost" />
                            <ChevronRight accessible={false} color={theme.colors.textTertiary} size={20} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {ready && trackers.length > 0 && <TrackerTabBar activeTab={view} onChange={setView} />}

      {celebration && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: theme.layout.screenPadding,
            right: theme.layout.screenPadding,
            top: insets.top + headerHeight + theme.spacing.md,
            zIndex: 20
          }}
        >
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.springify().damping(18)}
            exiting={reduceMotion ? undefined : FadeOutUp.duration(180)}
            style={{ width: "100%", maxWidth: 520, alignSelf: "center" }}
          >
            <StatusBanner
              title="Nice work!"
              message={celebration}
              variant="success"
              style={{
                shadowColor: theme.isDark ? "#000000" : "#173D2B",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: theme.isDark ? 0.34 : 0.18,
                shadowRadius: 18,
                elevation: 10
              }}
            />
          </Animated.View>
        </View>
      )}

      <FormDialog
        visible={trackerModalOpen}
        title={editingTracker ? "Rename tracker" : "New tracker"}
        subtitle="Keep it short and easy to recognize."
        onClose={() => setTrackerModalOpen(false)}
        primaryAction={{
          label: editingTracker ? "Save" : "Create",
          onPress: submitTracker,
          loading: saving
        }}
        secondaryAction={{
          label: "Cancel",
          onPress: () => setTrackerModalOpen(false)
        }}
      >
        <TextField
          label="Tracker name"
          required
          value={trackerName}
          onChangeText={setTrackerName}
          maxLength={60}
          error={trackerError || undefined}
          placeholder="Morning routine"
          autoFocus
        />
      </FormDialog>

      {selectedId != null && (
        <TrackerTaskEditorModal
          visible={taskEditorOpen}
          trackerId={selectedId}
          task={editingTask}
          timezone={timezone}
          saving={saving}
          onClose={() => {
            setTaskEditorOpen(false);
            setEditingTask(null);
          }}
          onSave={submitTask}
        />
      )}
    </ScreenLayout>
  );
}
